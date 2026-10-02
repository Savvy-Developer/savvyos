import { gte, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { mlsListings } from "../../drizzle/mlsSchema";

const pointSchema = z.object({ lat: z.number().finite().min(-85).max(85), lng: z.number().finite().min(-180).max(180) });
export type MapPoint = z.infer<typeof pointSchema>;

function cross(a: MapPoint, b: MapPoint, c: MapPoint) {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function intersects(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD <= 0 && cdA * cdB <= 0;
}

/** Reject malformed/self-crossing shapes before passing a WKT parameter to MySQL. */
export function validPolygon(points: MapPoint[]) {
  if (points.length < 3 || points.length > 64) return false;
  if (new Set(points.map(point => `${point.lng}:${point.lat}`)).size !== points.length) return false;
  const lats = points.map(point => point.lat);
  const lngs = points.map(point => point.lng);
  if (Math.max(...lngs) - Math.min(...lngs) > 180 || Math.max(...lats) - Math.min(...lats) > 90) return false;
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    twiceArea += points[i].lng * next.lat - next.lng * points[i].lat;
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue; // Adjacent closing edge.
      if (intersects(points[i], next, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return Math.abs(twiceArea) > 1e-9;
}

export const mapAreaSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), center: pointSchema, radiusMeters: z.number().finite().min(50).max(500_000) }),
  z.object({ kind: z.literal("polygon"), points: z.array(pointSchema).min(3).max(64).refine(validPolygon, "Draw a simple polygon without crossing edges") }),
]);
export type MapArea = z.infer<typeof mapAreaSchema>;

export function mapAreaConditions(area: MapArea): SQL[] {
  if (area.kind === "circle") {
    const latOffset = area.radiusMeters / 111_195;
    const lngOffset = latOffset / Math.max(0.05, Math.cos(area.center.lat * Math.PI / 180));
    const crossesDateline = area.center.lng - lngOffset < -180 || area.center.lng + lngOffset > 180;
    return [
      gte(mlsListings.latitude, String(Math.max(-85, area.center.lat - latOffset))),
      lte(mlsListings.latitude, String(Math.min(85, area.center.lat + latOffset))),
      gte(mlsListings.longitude, String(crossesDateline ? -180 : area.center.lng - lngOffset)),
      lte(mlsListings.longitude, String(crossesDateline ? 180 : area.center.lng + lngOffset)),
      sql`ST_Distance_Sphere(POINT(${mlsListings.longitude}, ${mlsListings.latitude}), POINT(${area.center.lng}, ${area.center.lat})) <= ${area.radiusMeters}`,
    ];
  }
  const lats = area.points.map(point => point.lat);
  const lngs = area.points.map(point => point.lng);
  const closed = [...area.points, area.points[0]].map(point => `${point.lng} ${point.lat}`).join(", ");
  const wkt = `POLYGON((${closed}))`;
  return [
    gte(mlsListings.latitude, String(Math.min(...lats))),
    lte(mlsListings.latitude, String(Math.max(...lats))),
    gte(mlsListings.longitude, String(Math.min(...lngs))),
    lte(mlsListings.longitude, String(Math.max(...lngs))),
    sql`ST_Intersects(ST_GeomFromText(${wkt}), POINT(${mlsListings.longitude}, ${mlsListings.latitude})) = 1`,
  ];
}
