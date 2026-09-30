import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { formatPrice, statusStyle } from "./mlsFormat";

export type MapViewport = {
  bounds: { north: number; south: number; east: number; west: number };
  zoom: number;
};

type Props = {
  filters: Record<string, unknown>;
  selectedId: number | null;
  hoveredId: number | null;
  onSelect: (id: number) => void;
  onViewportChange: (viewport: MapViewport) => void;
  initialCenter: google.maps.LatLngLiteral;
  initialZoom: number;
  className?: string;
};

function pinElement(label: string, color: string, active: boolean) {
  const el = document.createElement("div");
  el.style.cssText = [
    "padding:2px 7px",
    "border-radius:999px",
    "font:600 11px/16px system-ui, sans-serif",
    "color:#fff",
    `background:${active ? "#111827" : color}`,
    "border:2px solid #fff",
    "box-shadow:0 1px 3px rgba(0,0,0,.35)",
    "white-space:nowrap",
    "cursor:pointer",
    `transform:scale(${active ? 1.15 : 1})`,
    "transition:transform .12s ease",
  ].join(";");
  el.textContent = label;
  return el;
}

function clusterElement(count: number) {
  const size = Math.min(64, 28 + Math.log10(count) * 12);
  const el = document.createElement("div");
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:50%",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "font:700 12px system-ui, sans-serif",
    "color:#fff",
    "background:rgba(17,24,39,.82)",
    "border:3px solid rgba(255,255,255,.9)",
    "box-shadow:0 1px 4px rgba(0,0,0,.35)",
    "cursor:pointer",
  ].join(";");
  el.textContent = count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
  return el;
}

/**
 * Viewport-driven map: the server returns up to 500 pins in view, or grid
 * clusters above that, so the map stays fast with millions of listings.
 */
export function MlsSearchMap({ filters, selectedId, hoveredId, onSelect, onViewportChange, initialCenter, initialZoom, className }: Props) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewportRef = useRef(onViewportChange);
  onViewportRef.current = onViewportChange;

  const query = trpc.mlsProperties.mapPoints.useQuery(
    { filters: filters as any, bounds: viewport?.bounds ?? { north: 0, south: 0, east: 0, west: 0 }, zoom: viewport?.zoom ?? 10 },
    { enabled: !!viewport, placeholderData: previous => previous, staleTime: 30_000 }
  );

  const handleReady = (map: google.maps.Map) => {
    mapRef.current = map;
    setMapError(null);
    let timer: ReturnType<typeof setTimeout> | null = null;
    map.addListener("idle", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const bounds = map.getBounds();
        if (!bounds) return;
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const next = {
          bounds: { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() },
          zoom: map.getZoom() ?? 10,
        };
        setViewport(next);
        onViewportRef.current(next);
      }, 250);
    });
  };

  // Draw markers whenever results change.
  useEffect(() => {
    const map = mapRef.current;
    const data = query.data;
    if (!map || !data || !window.google?.maps?.marker) return;
    const next = new Map<string, google.maps.marker.AdvancedMarkerElement>();
    const { AdvancedMarkerElement } = window.google.maps.marker;
    if (data.mode === "pins") {
      for (const pin of data.pins) {
        if (!Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) continue;
        const key = `p:${pin.id}`;
        const active = pin.id === selectedId || pin.id === hoveredId;
        const content = pinElement(formatPrice(pin.price, true), statusStyle(pin.status).pin, active);
        const existing = markersRef.current.get(key);
        if (existing) {
          existing.content = content;
          existing.zIndex = active ? 1000 : undefined;
          next.set(key, existing);
          markersRef.current.delete(key);
          continue;
        }
        const marker = new AdvancedMarkerElement({ map, position: { lat: pin.lat, lng: pin.lng }, content, zIndex: active ? 1000 : undefined });
        marker.addListener("click", () => onSelectRef.current(pin.id));
        next.set(key, marker);
      }
    } else {
      for (const cluster of data.clusters) {
        const key = `c:${cluster.key}`;
        const marker = new AdvancedMarkerElement({ map, position: { lat: cluster.lat, lng: cluster.lng }, content: clusterElement(cluster.count) });
        marker.addListener("click", () => {
          map.panTo({ lat: cluster.lat, lng: cluster.lng });
          map.setZoom(Math.min(20, (map.getZoom() ?? 10) + 2));
        });
        next.set(key, marker);
      }
    }
    // Remove markers no longer in the result.
    markersRef.current.forEach(marker => {
      marker.map = null;
    });
    markersRef.current = next;
  }, [query.data, selectedId, hoveredId]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach(marker => {
        marker.map = null;
      });
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!mapRef.current) setMapError("Map unavailable. You can still search and open listings. Check the configured map API key.");
    }, 15_000);
    const handler = (event: PromiseRejectionEvent) => {
      if (String(event.reason?.message ?? "").includes("Google Maps")) setMapError("The map could not be loaded.");
    };
    window.addEventListener("unhandledrejection", handler);
    return () => { clearTimeout(timeout); window.removeEventListener("unhandledrejection", handler); };
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-lg border bg-muted ${className ?? ""}`}>
      <MapView className="h-full w-full" initialCenter={initialCenter} initialZoom={initialZoom} onMapReady={handleReady} />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1 text-xs font-medium shadow">
        {query.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {query.data
          ? `${query.data.total.toLocaleString()} in view${query.data.mode === "clusters" ? " (zoom in for pins)" : ""}`
          : "Loading map"}
      </div>
      {mapError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/90 text-sm text-muted-foreground">{mapError}</div>
      ) : null}
    </div>
  );
}
