import { describe, expect, it } from "vitest";
import { areaFromFeature, featureFromArea } from "../../client/src/pages/mls/mapboxGeometry";
import type { MapArea } from "../../client/src/pages/mls/MlsSearchMap";

describe("Mapbox MLS search geometry", () => {
  it("restores a geodesic radius and preserves its search center and meters", () => {
    const original: MapArea = { kind: "circle", center: { lat: 35.5951, lng: -82.5515 }, radiusMeters: 8_047 };
    const feature = featureFromArea(original);
    expect(feature.properties.mode).toBe("circle");
    expect(feature.geometry.type).toBe("Polygon");
    const restored = areaFromFeature(feature);
    expect(restored?.kind).toBe("circle");
    if (restored?.kind !== "circle") return;
    expect(restored.center.lat).toBeCloseTo(original.center.lat, 5);
    expect(restored.center.lng).toBeCloseTo(original.center.lng, 5);
    expect(restored.radiusMeters).toBeCloseTo(original.radiusMeters, 0);
  });

  it("round-trips a 500-km high-latitude circle without converting it into a polygon search", () => {
    const area: MapArea = { kind: "circle", center: { lat: 64, lng: -90 }, radiusMeters: 500_000 };
    const restored = areaFromFeature(featureFromArea(area));
    expect(restored?.kind).toBe("circle");
    if (restored?.kind !== "circle") return;
    expect(restored.center.lat).toBeCloseTo(64, 3);
    expect(restored.center.lng).toBeCloseTo(-90, 3);
    expect(restored.radiusMeters).toBeCloseTo(500_000, 0);
  });

  it("preserves polygon vertices through Map, Split and List remounts", () => {
    const area: MapArea = { kind: "polygon", points: [
      { lat: 35.5, lng: -82.6 }, { lat: 35.7, lng: -82.5 }, { lat: 35.55, lng: -82.3 },
    ] };
    expect(areaFromFeature(featureFromArea(area))).toEqual(area);
  });

  it("rejects too-small and too-large radius or an invalid polygon", () => {
    expect(areaFromFeature(featureFromArea({ kind: "circle", center: { lat: 35, lng: -82 }, radiusMeters: 20 }))).toBeNull();
    expect(areaFromFeature(featureFromArea({ kind: "circle", center: { lat: 35, lng: -82 }, radiusMeters: 600_000 }))).toBeNull();
    const invalid = featureFromArea({ kind: "polygon", points: [
      { lat: 35, lng: -82 }, { lat: 35.1, lng: -82.1 }, { lat: 35.2, lng: -82.2 },
    ] });
    if (invalid.geometry.type !== "Polygon") throw new Error("Expected polygon fixture");
    invalid.geometry.coordinates[0] = invalid.geometry.coordinates[0].slice(0, 2);
    expect(areaFromFeature(invalid)).toBeNull();
  });
});
