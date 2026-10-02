import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Circle, Loader2, MapPin, Pentagon, Pencil, RotateCcw } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { TerraDraw, TerraDrawCircleMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapboxGLAdapter } from "terra-draw-mapbox-gl-adapter";
import { trpc } from "@/lib/trpc";
import { formatPrice, statusStyle } from "./mlsFormat";
import { areaFromFeature, featureFromArea } from "./mapboxGeometry";
import type { MapArea, MapViewport, Props } from "./MlsSearchMap";

const LeafletFallback = lazy(() => import("./MlsSearchMap").then(module => ({ default: module.MlsSearchMap })));
const RADIUS_ERROR = "Draw a radius from 50 m to 500 km, or a polygon with 3–64 corners.";

function viewportOf(map: mapboxgl.Map): MapViewport {
  const bounds = map.getBounds();
  const center = map.getCenter();
  if (!bounds) throw new Error("Map bounds unavailable");
  return {
    center: { lat: center.lat, lng: center.lng },
    bounds: { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() },
    zoom: map.getZoom(),
  };
}

function pinElement(label: string, color: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.setAttribute("aria-label", `Property ${label}`);
  el.style.cssText = `border-radius:999px;padding:4px 9px;font:700 12px/17px system-ui,sans-serif;color:#fff;background:${color};border:2px solid #fff;box-shadow:0 2px 8px #0f172a44;white-space:nowrap;cursor:pointer`;
  return el;
}

function clusterElement(count: number) {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
  el.setAttribute("aria-label", `${count} properties, zoom in`);
  const size = Math.min(58, 34 + Math.log10(Math.max(1, count)) * 8);
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;font:700 12px system-ui,sans-serif;color:#fff;background:#0f172a;border:3px solid #fff;box-shadow:0 2px 10px #0f172a55;cursor:pointer`;
  return el;
}

export function MlsSearchMapbox(props: Props) {
  const { mapboxToken, filters, area, searchAsMove, selectedId, hoveredId, onOpen, onPreview, onAreaChange, onViewportChange, onSearchArea, onVisibleTotal, initialCenter, initialZoom, className } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const callbacks = useRef({ onOpen, onPreview, onAreaChange, onViewportChange, onVisibleTotal, searchAsMove });
  callbacks.current = { onOpen, onPreview, onAreaChange, onViewportChange, onVisibleTotal, searchAsMove };
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<"select" | "circle" | "polygon">("select");
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [queryViewport, setQueryViewport] = useState<MapViewport | null>(null);
  const query = trpc.mlsProperties.mapPoints.useQuery(
    { filters: { ...filters, area: area ?? undefined } as any, bounds: queryViewport?.bounds ?? { north: 0, south: 0, east: 0, west: 0 }, zoom: queryViewport?.zoom ?? initialZoom },
    { enabled: ready && !!queryViewport && !mapFailed, placeholderData: previous => previous, staleTime: 30_000, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (!mapboxToken || !container.current || mapFailed) return;
    let disposed = false;
    let resizeFrame: number | undefined;
    let resizeReset: ReturnType<typeof setTimeout> | undefined;
    let initialLoadTimeout: ReturnType<typeof setTimeout> | undefined;
    let resizeHappening = false;
    const map = new mapboxgl.Map({
      accessToken: mapboxToken,
      container: container.current,
      style: "mapbox://styles/mapbox/standard",
      center: [initialCenter.lng, initialCenter.lat],
      zoom: initialZoom,
      minZoom: 2,
      maxZoom: 19,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
    const report = (reason: "move" | "resize") => {
      if (disposed) return;
      const next = viewportOf(map);
      setViewport(next);
      if (callbacks.current.searchAsMove) setQueryViewport(next);
      callbacks.current.onViewportChange(next, reason);
    };
    map.on("moveend", () => report(resizeHappening ? "resize" : "move"));
    map.on("load", () => { if (!disposed) { setReady(true); report("resize"); } });
    map.on("error", () => { if (!map.isStyleLoaded() && !disposed) setMapFailed(true); });
    initialLoadTimeout = setTimeout(() => { if (!map.loaded() && !disposed) setMapFailed(true); }, 15_000);

    map.once("style.load", () => {
      if (disposed) return;
      const draw = new TerraDraw({
        adapter: new TerraDrawMapboxGLAdapter({ map }),
        modes: [
          new TerraDrawCircleMode({ projection: "globe", showCoordinatePoints: false }),
          new TerraDrawPolygonMode(),
          new TerraDrawSelectMode({ flags: {
            polygon: { feature: { draggable: true, coordinates: { draggable: true, midpoints: true } } },
            circle: { feature: { draggable: true, coordinates: { draggable: true } } },
          } }),
        ],
      });
      draw.start();
      draw.setMode("select");
      drawRef.current = draw;
      // Restoring only the user-selected shape keeps every other map view clean.
      if (area) draw.addFeatures([featureFromArea(area)]);
      draw.on("finish", (id) => {
        const feature = draw.getSnapshotFeature(id);
        const next = areaFromFeature(feature);
        if (!next) {
          draw.removeFeatures([id]);
          setDrawError(RADIUS_ERROR);
          return;
        }
        const others = draw.getSnapshot().filter(item => item.id !== id && (item.properties.mode === "circle" || item.properties.mode === "polygon"));
        if (others.length) draw.removeFeatures(others.map(item => item.id!));
        callbacks.current.onAreaChange(next);
        draw.setMode("select");
        setDrawMode("select");
      });
      draw.on("change", (_ids, type) => {
        if (type === "delete" && !draw.getSnapshot().some(item => item.properties.mode === "circle" || item.properties.mode === "polygon")) {
          callbacks.current.onAreaChange(null);
        }
      });
    });

    const observer = new ResizeObserver(() => {
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = undefined;
        resizeHappening = true;
        map.resize();
        if (map.loaded()) report("resize");
        if (resizeReset) clearTimeout(resizeReset);
        resizeReset = setTimeout(() => { resizeHappening = false; }, 80);
      });
    });
    observer.observe(container.current);
    return () => {
      disposed = true;
      observer.disconnect();
      if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
      if (resizeReset) clearTimeout(resizeReset);
      if (initialLoadTimeout) clearTimeout(initialLoadTimeout);
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, mapFailed]); // The map instance persists while the user's camera and filters change.

  useEffect(() => { if (searchAsMove && viewport) setQueryViewport(viewport); }, [searchAsMove, viewport]);
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !ready) return;
    if (!area) draw.clear();
    else if (!draw.getSnapshot().some(item => item.properties.mode === "circle" || item.properties.mode === "polygon")) draw.addFeatures([featureFromArea(area)]);
  }, [area, ready]);
  useEffect(() => {
    if (!area && queryViewport && query.data && !query.isPlaceholderData && !query.isFetching) callbacks.current.onVisibleTotal(query.data.total, queryViewport.bounds);
  }, [area, queryViewport, query.data, query.isPlaceholderData, query.isFetching]);
  useEffect(() => { if (!drawError) return; const timer = setTimeout(() => setDrawError(null), 5000); return () => clearTimeout(timer); }, [drawError]);

  useEffect(() => {
    const map = mapRef.current;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    if (!map || !ready || !query.data || mapFailed) return;
    if (query.data.mode === "pins") {
      for (const pin of query.data.pins) {
        if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) continue;
        const element = pinElement(formatPrice(pin.price, true), statusStyle(pin.status).pin);
        element.dataset.listingId = String(pin.id);
        element.addEventListener("click", event => {
          event.stopPropagation();
          callbacks.current.onPreview(pin.id);
          const content = document.createElement("div");
          content.className = "overflow-hidden rounded-lg text-slate-900";
          if (pin.photoUrl) {
            const img = document.createElement("img");
            img.src = pin.photoUrl;
            img.alt = pin.address ?? "Property photo";
            img.loading = "lazy";
            img.className = "mb-2 h-28 w-full rounded-md object-cover";
            img.addEventListener("error", () => img.remove());
            content.append(img);
          }
          const price = document.createElement("div");
          price.className = "text-base font-bold";
          price.textContent = formatPrice(pin.price);
          const address = document.createElement("div");
          address.className = "truncate text-sm font-medium";
          address.textContent = pin.address ?? "Address unavailable";
          const details = document.createElement("div");
          details.className = "text-xs text-slate-500";
          details.textContent = `${pin.city ?? ""}, ${pin.state ?? ""} · ${pin.beds ?? "–"} bd · ${pin.baths ?? "–"} ba · ${pin.source ?? ""}`;
          const open = document.createElement("button");
          open.type = "button";
          open.textContent = "View listing";
          open.className = "mt-2 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800";
          open.addEventListener("click", () => callbacks.current.onOpen(pin.id));
          content.append(price, address, details, open);
          new mapboxgl.Popup({ offset: 18, maxWidth: "270px" }).setLngLat([pin.lng, pin.lat]).setDOMContent(content).addTo(map);
        });
        markersRef.current.push(new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat([pin.lng, pin.lat]).addTo(map));
      }
    } else {
      for (const cluster of query.data.clusters) {
        if (!Number.isFinite(cluster.lat) || !Number.isFinite(cluster.lng)) continue;
        const element = clusterElement(cluster.count);
        element.title = `${cluster.count.toLocaleString()} properties${cluster.minPrice != null && cluster.maxPrice != null ? ` · ${formatPrice(cluster.minPrice, true)}–${formatPrice(cluster.maxPrice, true)}` : ""}`;
        element.addEventListener("click", event => { event.stopPropagation(); map.flyTo({ center: [cluster.lng, cluster.lat], zoom: Math.min(19, map.getZoom() + 2) }); });
        markersRef.current.push(new mapboxgl.Marker({ element }).setLngLat([cluster.lng, cluster.lat]).addTo(map));
      }
    }
    return () => { for (const marker of markersRef.current) marker.remove(); markersRef.current = []; };
  }, [query.data, ready, mapFailed]);
  useEffect(() => {
    for (const marker of markersRef.current) {
      const element = marker.getElement();
      const id = Number(element.dataset.listingId);
      if (id) element.style.background = id === selectedId || id === hoveredId ? "#0f172a" : statusStyle(query.data?.mode === "pins" ? query.data.pins.find(pin => pin.id === id)?.status ?? "active" : "active").pin;
    }
  }, [selectedId, hoveredId, query.data]);

  if (!mapboxToken || mapFailed) return <Suspense fallback={<div className={`${className ?? ""} rounded-xl bg-slate-100`} />}><LeafletFallback {...props} /></Suspense>;
  const needsManualSearch = !searchAsMove && viewport && JSON.stringify(viewport.bounds) !== JSON.stringify(queryViewport?.bounds);
  const areaLabel = area?.kind === "circle" ? `${(area.radiusMeters / 1609.344).toFixed(1)} mi radius` : area ? "Polygon search" : null;
  const setMode = (mode: "select" | "circle" | "polygon") => { drawRef.current?.setMode(mode); setDrawMode(mode); };
  return <div className={`relative isolate z-0 overflow-hidden rounded-xl border bg-slate-100 shadow-sm ${className ?? ""}`} data-testid="mls-mapbox">
    <div ref={container} className="h-full w-full" role="application" aria-label="MLS property map" />
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex max-w-[65%] items-center gap-1.5 rounded-lg border bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-md">
      {query.isFetching ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-700" />}
      {query.isError ? "Map results delayed" : query.data ? `${query.data.total.toLocaleString()} in view${query.data.mode === "clusters" ? " · zoom for pins" : ""}` : "Finding properties"}
    </div>
    <div className="absolute left-3 top-24 z-20 flex flex-col gap-1.5 rounded-lg border bg-white/95 p-1 shadow-md" aria-label="Draw a map search area">
      <button type="button" aria-label="Draw radius" title="Draw radius" aria-pressed={drawMode === "circle"} onClick={() => setMode("circle")} className={`rounded p-2 hover:bg-teal-50 ${drawMode === "circle" ? "bg-teal-100 text-teal-800" : "text-slate-700"}`}><Circle className="h-4 w-4" /></button>
      <button type="button" aria-label="Draw polygon" title="Draw polygon" aria-pressed={drawMode === "polygon"} onClick={() => setMode("polygon")} className={`rounded p-2 hover:bg-teal-50 ${drawMode === "polygon" ? "bg-teal-100 text-teal-800" : "text-slate-700"}`}><Pentagon className="h-4 w-4" /></button>
      <button type="button" aria-label="Edit drawn area" title="Edit drawn area" aria-pressed={drawMode === "select"} onClick={() => setMode("select")} className={`rounded p-2 hover:bg-teal-50 ${drawMode === "select" ? "bg-teal-100 text-teal-800" : "text-slate-700"}`}><Pencil className="h-4 w-4" /></button>
      {area ? <button type="button" aria-label="Clear drawn area" title="Clear drawn area" onClick={() => { drawRef.current?.clear(); onAreaChange(null); setMode("select"); }} className="rounded p-2 text-slate-700 hover:bg-teal-50"><RotateCcw className="h-4 w-4" /></button> : null}
    </div>
    {needsManualSearch ? <button type="button" className="absolute right-3 top-12 z-20 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-teal-800" onClick={() => { setQueryViewport(viewport); onSearchArea(viewport); }}>Search this area</button> : null}
    {drawError ? <div role="alert" className="absolute bottom-16 left-3 z-20 max-w-[65%] rounded-lg bg-white px-3 py-2 text-xs font-medium text-red-700 shadow-lg">{drawError}</div> : null}
    <div className="absolute bottom-7 left-3 z-20 flex max-w-[70%] flex-wrap items-center gap-1.5 rounded-lg border bg-white/95 px-2.5 py-1.5 text-xs text-slate-700 shadow-sm">
      <span>Draw a radius or polygon to search the area.</span>
      {areaLabel ? <button type="button" className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-800 hover:bg-teal-100" onClick={() => { drawRef.current?.clear(); onAreaChange(null); }}><RotateCcw className="h-3 w-3" />{areaLabel} · clear</button> : null}
    </div>
  </div>;
}
