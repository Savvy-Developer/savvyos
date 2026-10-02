import type { GeoJSONStoreFeatures } from "terra-draw";
import type { MapArea } from "./MlsSearchMap";

const EARTH_RADIUS_METERS = 6_371_008.8;
const rounded = (value: number) => Number(value.toFixed(6));

/** A geodesic drawing overlay; the API still searches using the exact radius in meters. */
function circleRing(area: Extract<MapArea, { kind: "circle" }>): number[][] {
  const lat = area.center.lat * Math.PI / 180;
  const lng = area.center.lng * Math.PI / 180;
  const angular = area.radiusMeters / EARTH_RADIUS_METERS;
  const result: number[][] = [];
  for (let step = 0; step < 64; step++) {
    const bearing = step * 2 * Math.PI / 64;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
    const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(nextLat));
    result.push([rounded((nextLng * 180 / Math.PI + 540) % 360 - 180), rounded(nextLat * 180 / Math.PI)]);
  }
  result.push([...result[0]]);
  return result;
}

export function featureFromArea(area: MapArea): GeoJSONStoreFeatures {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [area.kind === "circle" ? circleRing(area) : [...area.points.map(point => [point.lng, point.lat]), [area.points[0].lng, area.points[0].lat]]],
    },
    properties: area.kind === "circle" ? { mode: "circle", radiusKilometers: area.radiusMeters / 1000 } : { mode: "polygon" },
  };
}

export function areaFromFeature(feature: GeoJSONStoreFeatures | undefined): MapArea | null {
  if (!feature || feature.geometry.type !== "Polygon" || !Array.isArray(feature.geometry.coordinates[0])) return null;
  const ring = feature.geometry.coordinates[0];
  const vertices = ring.slice(0, -1);
  if (feature.properties.mode === "circle") {
    if (vertices.length < 3) return null;
    // For equally spaced geodesic vertices, the spherical mean reconstructs the center
    // after Terra Draw has moved or resized the circle (it does not store its center).
    let x = 0, y = 0, z = 0;
    for (const [longitude, latitude] of vertices) {
      const lat = latitude * Math.PI / 180, lng = longitude * Math.PI / 180;
      x += Math.cos(lat) * Math.cos(lng);
      y += Math.cos(lat) * Math.sin(lng);
      z += Math.sin(lat);
    }
    const center = { lat: rounded(Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI), lng: rounded(Math.atan2(y, x) * 180 / Math.PI) };
    const [firstLng, firstLat] = vertices[0];
    const phi1 = center.lat * Math.PI / 180, phi2 = firstLat * Math.PI / 180;
    const deltaLat = phi2 - phi1, deltaLng = (firstLng - center.lng) * Math.PI / 180;
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLng / 2) ** 2;
    const radiusMeters = Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a))));
    return Number.isFinite(radiusMeters) && radiusMeters >= 50 && radiusMeters <= 500_000 ? { kind: "circle", center, radiusMeters } : null;
  }
  if (feature.properties.mode === "polygon") {
    const points = vertices.map(([lng, lat]) => ({ lat: rounded(lat), lng: rounded(lng) }));
    return points.length >= 3 && points.length <= 64 && points.every(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
      ? { kind: "polygon", points } : null;
  }
  return null;
}
