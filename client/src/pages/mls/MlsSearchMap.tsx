import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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
  initialCenter: { lat: number; lng: number };
  initialZoom: number;
  className?: string;
};

function viewportOf(map: L.Map): MapViewport {
  const bounds = map.getBounds();
  return {
    bounds: { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() },
    zoom: map.getZoom(),
  };
}

function ViewportReporter({ onChange }: { onChange: (viewport: MapViewport) => void }) {
  const callback = useRef(onChange);
  const previous = useRef("");
  callback.current = onChange;
  const map = useMapEvents({
    moveend: () => report(),
    zoomend: () => report(),
  });
  const report = () => {
    const next = viewportOf(map);
    const key = [next.zoom, ...Object.values(next.bounds).map(value => value.toFixed(6))].join(":");
    if (key !== previous.current) {
      previous.current = key;
      callback.current(next);
    }
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      report();
    });
    return () => cancelAnimationFrame(frame);
  }, [map]); // Initial viewport; moveend/zoomend handle subsequent changes.
  return null;
}

function pinIcon(label: string, color: string, active: boolean) {
  const el = document.createElement("div");
  el.textContent = label;
  el.style.cssText = [
    "display:inline-block", "width:max-content", "transform:translateX(-50%)", "padding:2px 7px",
    "border-radius:999px", "font:600 11px/16px system-ui,sans-serif", "color:#fff",
    `background:${active ? "#111827" : color}`, "border:2px solid #fff", "box-shadow:0 1px 3px rgba(0,0,0,.35)",
    "white-space:nowrap", "cursor:pointer",
  ].join(";");
  return L.divIcon({ html: el, className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
}

function clusterIcon(count: number) {
  const size = Math.min(64, 28 + Math.log10(count) * 12);
  const el = document.createElement("div");
  el.textContent = count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
  el.style.cssText = [
    `width:${size}px`, `height:${size}px`, "border-radius:50%", "display:flex", "align-items:center",
    "justify-content:center", "font:700 12px system-ui,sans-serif", "color:#fff",
    "background:rgba(17,24,39,.82)", "border:3px solid rgba(255,255,255,.9)",
    "box-shadow:0 1px 4px rgba(0,0,0,.35)", "cursor:pointer",
  ].join(";");
  return L.divIcon({ html: el, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function ClusterPin({ cluster }: { cluster: { lat: number; lng: number; count: number } }) {
  const map = useMap();
  return <Marker position={[cluster.lat, cluster.lng]} icon={clusterIcon(cluster.count)} eventHandlers={{ click: () => map.setView([cluster.lat, cluster.lng], Math.min(19, map.getZoom() + 2)) }} />;
}

/** Admin-only map. Tiles load only for a human's current viewport, with visible OSM attribution. */
export function MlsSearchMap({ filters, selectedId, hoveredId, onSelect, onViewportChange, initialCenter, initialZoom, className }: Props) {
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const query = trpc.mlsProperties.mapPoints.useQuery(
    { filters: filters as any, bounds: viewport?.bounds ?? { north: 0, south: 0, east: 0, west: 0 }, zoom: viewport?.zoom ?? initialZoom },
    { enabled: !!viewport, placeholderData: previous => previous, staleTime: 30_000 }
  );
  const handleViewport = (next: MapViewport) => {
    setViewport(next);
    onViewportChange(next);
  };

  return (
    <div className={`relative overflow-hidden rounded-lg border bg-muted ${className ?? ""}`}>
      <MapContainer center={[initialCenter.lat, initialCenter.lng]} zoom={initialZoom} minZoom={2} maxZoom={19} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' maxZoom={19} />
        <ViewportReporter onChange={handleViewport} />
        {query.data?.mode === "pins" ? query.data.pins.filter(pin => Number.isFinite(pin.lat) && Number.isFinite(pin.lng)).map(pin => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon(formatPrice(pin.price, true), statusStyle(pin.status).pin, pin.id === selectedId || pin.id === hoveredId)} zIndexOffset={pin.id === selectedId ? 1000 : 0} eventHandlers={{ click: () => onSelect(pin.id) }} />
        )) : null}
        {query.data?.mode === "clusters" ? query.data.clusters.map(cluster => (
          <ClusterPin key={cluster.key} cluster={cluster} />
        )) : null}
      </MapContainer>
      <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-md bg-white/95 px-2.5 py-1 text-xs font-medium shadow">
        {query.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {query.isError ? "Listings in this map area are delayed" : query.data ? `${query.data.total.toLocaleString()} in view${query.data.mode === "clusters" ? " (zoom in for pins)" : ""}` : "Loading listings in view"}
      </div>
    </div>
  );
}
