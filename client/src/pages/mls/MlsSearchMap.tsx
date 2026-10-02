import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, RotateCcw } from "lucide-react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import { trpc } from "@/lib/trpc";
import { formatPrice, statusStyle } from "./mlsFormat";

export type MapViewport = {
  center: { lat: number; lng: number };
  bounds: { north: number; south: number; east: number; west: number };
  zoom: number;
};
export type MapArea =
  | { kind: "circle"; center: { lat: number; lng: number }; radiusMeters: number }
  | { kind: "polygon"; points: { lat: number; lng: number }[] };

export type Props = {
  mapboxToken?: string;
  filters: Record<string, unknown>;
  area: MapArea | null;
  searchAsMove: boolean;
  selectedId: number | null;
  hoveredId: number | null;
  onOpen: (id: number) => void;
  onPreview: (id: number) => void;
  onAreaChange: (area: MapArea | null) => void;
  onViewportChange: (viewport: MapViewport, reason: "move" | "resize") => void;
  onSearchArea: (viewport: MapViewport) => void;
  onVisibleTotal: (total: number, bounds: MapViewport["bounds"]) => void;
  initialCenter: { lat: number; lng: number };
  initialZoom: number;
  className?: string;
};

function viewportOf(map: L.Map): MapViewport {
  const bounds = map.getBounds();
  const center = map.getCenter();
  return {
    center: { lat: center.lat, lng: center.lng },
    bounds: { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() },
    zoom: map.getZoom(),
  };
}

function ViewportReporter({ onChange }: { onChange: (viewport: MapViewport, reason: "move" | "resize") => void }) {
  const callback = useRef(onChange);
  const previous = useRef("");
  const resizing = useRef(false);
  callback.current = onChange;
  const map = useMapEvents({ moveend: () => report(resizing.current ? "resize" : "move"), zoomend: () => report(resizing.current ? "resize" : "move") });
  const report = (reason: "move" | "resize") => {
    const next = viewportOf(map);
    const key = [next.zoom, ...Object.values(next.bounds).map(value => value.toFixed(6))].join(":");
    if (key !== previous.current) {
      previous.current = key;
      callback.current(next, reason);
    }
  };
  useEffect(() => {
    let frame: number | undefined;
    let resetFrame: number | undefined;
    const resize = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        resizing.current = true;
        map.invalidateSize({ pan: false });
        report("resize");
        if (resetFrame !== undefined) cancelAnimationFrame(resetFrame);
        resetFrame = requestAnimationFrame(() => { resizing.current = false; resetFrame = undefined; });
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(map.getContainer());
    resize();
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (resetFrame !== undefined) cancelAnimationFrame(resetFrame);
      resizing.current = false;
    };
  }, [map]); // Split/Map switches and responsive layout can resize the same Leaflet instance.
  return null;
}

function rounded(value: number) { return Number(value.toFixed(6)); }

function layerArea(layer: L.Layer): MapArea | null {
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng();
    const radiusMeters = Math.round(layer.getRadius());
    if (radiusMeters < 50 || radiusMeters > 500_000) return null;
    return { kind: "circle", center: { lat: rounded(center.lat), lng: rounded(center.lng) }, radiusMeters };
  }
  if (layer instanceof L.Polygon) {
    const ring = layer.getLatLngs()[0] as L.LatLng[];
    const points = ring.map(point => ({ lat: rounded(point.lat), lng: rounded(point.lng) }));
    if (points.length > 3 && points[0].lat === points.at(-1)?.lat && points[0].lng === points.at(-1)?.lng) points.pop();
    return points.length >= 3 && points.length <= 64 ? { kind: "polygon", points } : null;
  }
  return null;
}

/** Keep one editable shape. Its geometry, not just the map overlay, filters List and Map on the server. */
function DrawArea({ area, onChange, onInvalid }: { area: MapArea | null; onChange: (value: MapArea | null) => void; onInvalid: (message: string) => void }) {
  const map = useMap();
  const current = useRef<L.Circle | L.Polygon | null>(null);
  const callback = useRef(onChange);
  const invalid = useRef(onInvalid);
  callback.current = onChange;
  invalid.current = onInvalid;

  useEffect(() => {
    map.pm.setGlobalOptions({ snappable: false, allowSelfIntersection: false, exitModeOnEscape: true, finishOnEnter: true });
    map.pm.setPathOptions({ color: "#0f766e", weight: 3, fillColor: "#14b8a6", fillOpacity: 0.17 });
    map.pm.addControls({
      position: "topleft", drawMarker: false, drawCircleMarker: false, drawPolyline: false,
      drawRectangle: false, drawPolygon: true, drawCircle: true, drawText: false,
      editMode: true, removalMode: true, dragMode: false, cutPolygon: false, rotateMode: false,
    });
    const onCreate: L.PM.CreateEventHandler = event => {
      if (!(event.layer instanceof L.Circle) && !(event.layer instanceof L.Polygon)) return;
      const layer = event.layer;
      const next = layerArea(layer);
      if (!next) { map.removeLayer(layer); invalid.current("Draw a radius from 50 m to 500 km, or a polygon with 3–64 corners."); return; }
      if (current.current) map.removeLayer(current.current);
      current.current = layer;
      const emit = () => {
        const edited = layerArea(layer);
        if (edited) callback.current(edited);
        else { map.removeLayer(layer); current.current = null; callback.current(null); invalid.current("Draw a radius from 50 m to 500 km, or a polygon with 3–64 corners."); }
      };
      layer.on("pm:edit", emit);
      layer.on("pm:remove", () => { if (current.current === layer) { current.current = null; callback.current(null); } });
      emit();
    };
    map.on("pm:create", onCreate);
    return () => {
      map.off("pm:create", onCreate);
      map.pm.removeControls();
      if (current.current) map.removeLayer(current.current);
      current.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!area && current.current) { map.removeLayer(current.current); current.current = null; }
    if (area && !current.current) {
      const style: L.PathOptions = { color: "#0f766e", weight: 3, fillColor: "#14b8a6", fillOpacity: 0.17, pmIgnore: false };
      const layer = area.kind === "circle"
        ? L.circle([area.center.lat, area.center.lng], { ...style, radius: area.radiusMeters })
        : L.polygon(area.points.map(point => [point.lat, point.lng] as L.LatLngTuple), style);
      layer.addTo(map);
      current.current = layer;
      const emit = () => {
        const edited = layerArea(layer);
        if (edited) callback.current(edited);
        else { map.removeLayer(layer); current.current = null; callback.current(null); invalid.current("Draw a radius from 50 m to 500 km, or a polygon with 3–64 corners."); }
      };
      layer.on("pm:edit", emit);
      layer.on("pm:remove", () => { if (current.current === layer) { current.current = null; callback.current(null); } });
    }
  }, [area, map]);
  return null;
}

function pinIcon(label: string, color: string, selected: boolean) {
  const el = document.createElement("div");
  el.textContent = label;
  el.style.cssText = [
    "display:inline-block", "width:max-content", "transform:translateX(-50%)", "padding:4px 9px",
    "border-radius:999px", "font:700 12px/17px system-ui,sans-serif", "color:#fff",
    `background:${selected ? "#0f172a" : color}`, "border:2px solid #fff", "box-shadow:0 2px 8px rgba(15,23,42,.28)",
    "white-space:nowrap", "cursor:pointer",
  ].join(";");
  return L.divIcon({ html: el, className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
}

function clusterIcon(count: number) {
  const size = Math.min(58, 34 + Math.log10(Math.max(1, count)) * 8);
  const el = document.createElement("div");
  el.textContent = count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
  el.style.cssText = [
    `width:${size}px`, `height:${size}px`, "border-radius:50%", "display:flex", "align-items:center",
    "justify-content:center", "font:700 12px system-ui,sans-serif", "color:#fff",
    "background:#0f172a", "border:3px solid #fff", "box-shadow:0 2px 10px rgba(15,23,42,.32)", "cursor:pointer",
  ].join(";");
  return L.divIcon({ html: el, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function ClusterPin({ cluster }: { cluster: { lat: number; lng: number; count: number; minPrice: number | null; maxPrice: number | null } }) {
  const map = useMap();
  return <Marker position={[cluster.lat, cluster.lng]} icon={clusterIcon(cluster.count)} pmIgnore snapIgnore eventHandlers={{ click: () => map.setView([cluster.lat, cluster.lng], Math.min(19, map.getZoom() + 2)) }}>
    <Popup>{cluster.count.toLocaleString()} properties{cluster.minPrice != null && cluster.maxPrice != null ? ` · ${formatPrice(cluster.minPrice, true)}–${formatPrice(cluster.maxPrice, true)}` : ""}<br />Click the circle to zoom in.</Popup>
  </Marker>;
}

/** Licensed admin map. Only human-visible OSM tiles load, with permanent attribution. */
export function MlsSearchMap({ filters, area, searchAsMove, selectedId, hoveredId, onOpen, onPreview, onAreaChange, onViewportChange, onSearchArea, onVisibleTotal, initialCenter, initialZoom, className }: Props) {
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [queryViewport, setQueryViewport] = useState<MapViewport | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const totalCallback = useRef(onVisibleTotal);
  totalCallback.current = onVisibleTotal;
  const query = trpc.mlsProperties.mapPoints.useQuery(
    { filters: { ...filters, area: area ?? undefined } as any, bounds: queryViewport?.bounds ?? { north: 0, south: 0, east: 0, west: 0 }, zoom: queryViewport?.zoom ?? initialZoom },
    { enabled: !!queryViewport, placeholderData: previous => previous, staleTime: 30_000, refetchOnWindowFocus: false }
  );
  const handleViewport = (next: MapViewport, reason: "move" | "resize") => {
    setViewport(next);
    if (searchAsMove) setQueryViewport(next);
    onViewportChange(next, reason);
  };
  useEffect(() => { if (searchAsMove && viewport) setQueryViewport(viewport); }, [searchAsMove, viewport]);
  useEffect(() => {
    // Map's grouped scan already gives an exact total for these same bounds.
    // A drawn circle/polygon can extend beyond the viewport, so it must use
    // the independent exact count instead of this visible-only count.
    if (!area && queryViewport && query.data && !query.isPlaceholderData && !query.isFetching) {
      totalCallback.current(query.data.total, queryViewport.bounds);
    }
  }, [area, queryViewport, query.data, query.isPlaceholderData, query.isFetching]);
  useEffect(() => { if (!drawError) return; const timer = setTimeout(() => setDrawError(null), 5000); return () => clearTimeout(timer); }, [drawError]);
  const needsManualSearch = !searchAsMove && viewport && JSON.stringify(viewport.bounds) !== JSON.stringify(queryViewport?.bounds);
  const areaLabel = area?.kind === "circle" ? `${(area.radiusMeters / 1609.344).toFixed(1)} mi radius` : area ? "Polygon search" : null;

  return (
    <div className={`relative isolate z-0 overflow-hidden rounded-xl border bg-slate-100 shadow-sm ${className ?? ""}`}>
      <MapContainer center={[initialCenter.lat, initialCenter.lng]} zoom={initialZoom} minZoom={2} maxZoom={19} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' maxZoom={19} />
        <ViewportReporter onChange={handleViewport} />
        <DrawArea area={area} onChange={onAreaChange} onInvalid={setDrawError} />
        {query.data?.mode === "pins" ? query.data.pins.filter(pin => Number.isFinite(pin.lat) && Number.isFinite(pin.lng)).map(pin => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon(formatPrice(pin.price, true), statusStyle(pin.status).pin, pin.id === selectedId || pin.id === hoveredId)} zIndexOffset={pin.id === selectedId ? 1000 : 0} pmIgnore snapIgnore eventHandlers={{ click: () => onPreview(pin.id) }}>
            <Popup minWidth={230} maxWidth={270}>
              <div className="overflow-hidden rounded-lg text-slate-900">
                {pin.photoUrl ? <img src={pin.photoUrl} alt={pin.address ?? "Property photo"} className="mb-2 h-28 w-full rounded-md object-cover" loading="lazy" /> : null}
                <div className="text-base font-bold">{formatPrice(pin.price)}</div>
                <div className="truncate text-sm font-medium">{pin.address ?? "Address unavailable"}</div>
                <div className="text-xs text-slate-500">{pin.city}, {pin.state} · {pin.beds ?? "–"} bd · {pin.baths ?? "–"} ba · {pin.source}</div>
                <button type="button" onClick={() => onOpen(pin.id)} className="mt-2 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800">View listing</button>
              </div>
            </Popup>
          </Marker>
        )) : null}
        {query.data?.mode === "clusters" ? query.data.clusters.map(cluster => (
          <ClusterPin key={cluster.key} cluster={cluster} />
        )) : null}
      </MapContainer>
      <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex max-w-[65%] items-center gap-1.5 rounded-lg border bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-md">
        {query.isFetching ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-700" />}
        {query.isError ? "Map results delayed" : query.data ? `${query.data.total.toLocaleString()} in view${query.data.mode === "clusters" ? " · zoom for pins" : ""}` : "Finding properties"}
      </div>
      {needsManualSearch ? <button type="button" className="absolute right-3 top-12 z-[1000] rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-teal-800" onClick={() => { setQueryViewport(viewport); onSearchArea(viewport); }}>Search this area</button> : null}
      {drawError ? <div role="alert" className="absolute bottom-16 left-3 z-[1000] max-w-[65%] rounded-lg bg-white px-3 py-2 text-xs font-medium text-red-700 shadow-lg">{drawError}</div> : null}
      <div className="absolute bottom-6 left-3 z-[1000] flex max-w-[70%] flex-wrap items-center gap-1.5 rounded-lg border bg-white/95 px-2.5 py-1.5 text-xs text-slate-700 shadow-sm">
        <span>Draw a radius or polygon with the map tools.</span>
        {areaLabel ? <button type="button" className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-800 hover:bg-teal-100" onClick={() => onAreaChange(null)}><RotateCcw className="h-3 w-3" />{areaLabel} · clear</button> : null}
      </div>
    </div>
  );
}
