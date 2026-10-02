import { approvedFeedSetSql, approvedFeedSql } from "./license";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { mlsListings, mlsSources } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import { CANONICAL_PROPERTY_TYPES, CANONICAL_STATUSES } from "./normalize/enums";
import { withMlsPhotoListingId } from "./photoUrl";
import { mapAreaConditions, mapAreaSchema } from "./mapGeometry";

/**
 * Admin search over mls_listings. Every filter maps to an indexed column
 * where possible (status, price, source, postal code, city, geo). Free text
 * uses prefix matches so it can use indexes; a full-text engine comes later
 * with the public search.
 */

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const boundsSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180),
});

export const searchFiltersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  sourceIds: z.array(z.number().int()).max(50).optional(),
  statuses: z.array(z.enum(CANONICAL_STATUSES)).max(CANONICAL_STATUSES.length).optional(),
  listingIntent: z.enum(["sale", "rent"]).optional(),
  propertyTypes: z.array(z.enum(CANONICAL_PROPERTY_TYPES)).max(CANONICAL_PROPERTY_TYPES.length).optional(),
  propertySubTypes: z.array(z.string().trim().min(1).max(96)).max(20).optional(),
  mlsStatuses: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  counties: z.array(z.string().trim().min(1).max(128)).max(20).optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  minBeds: z.number().int().nonnegative().optional(),
  maxBeds: z.number().int().nonnegative().optional(),
  minBaths: z.number().nonnegative().optional(),
  maxBaths: z.number().nonnegative().optional(),
  minSqft: z.number().nonnegative().optional(),
  maxSqft: z.number().nonnegative().optional(),
  minYearBuilt: z.number().int().optional(),
  maxYearBuilt: z.number().int().optional(),
  minAcres: z.number().nonnegative().optional(),
  maxAcres: z.number().nonnegative().optional(),
  minGarage: z.number().int().nonnegative().optional(),
  newConstruction: z.boolean().optional(),
  hasPhotos: z.boolean().optional(),
  listedWithinDays: z.number().int().positive().max(3650).optional(),
  maxDaysOnMarket: z.number().int().nonnegative().optional(),
  city: z.string().trim().max(128).optional(),
  stateOrProvince: z.string().trim().max(32).optional(),
  postalCode: z.string().trim().max(16).optional(),
  waterfront: z.boolean().optional(),
  pool: z.boolean().optional(),
  closedWithinDays: z.number().int().positive().max(3650).optional(),
  includeRemoved: z.boolean().optional(),
  bounds: boundsSchema.optional(),
  area: mapAreaSchema.optional(),
});
export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const SEARCH_SORTS = ["newest", "updated", "price_desc", "price_asc", "beds", "sqft", "dom"] as const;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function boundsCondition(bounds: z.infer<typeof boundsSchema>): SQL[] {
  const conditions: SQL[] = [
    sql`${mlsListings.latitude} IS NOT NULL`,
    gte(mlsListings.latitude, String(bounds.south)),
    lte(mlsListings.latitude, String(bounds.north)),
  ];
  if (bounds.west <= bounds.east) {
    conditions.push(gte(mlsListings.longitude, String(bounds.west)), lte(mlsListings.longitude, String(bounds.east)));
  } else {
    // The viewport crosses the antimeridian.
    conditions.push(or(gte(mlsListings.longitude, String(bounds.west)), lte(mlsListings.longitude, String(bounds.east)))!);
  }
  return conditions;
}

/** Keep IDX rows available until the matching BBO listing actually arrives.
 * Both feed rows, media, raw records and license flags remain independent.
 * This read-only preference is shared by cards, map pins and exact totals. */
export function preferMarisBboCondition(): SQL {
  return sql.raw(`(CASE WHEN mls_listings.feedId = COALESCE((
      SELECT idx.id FROM mls_feeds AS idx
      JOIN mls_sources AS source ON source.id = idx.sourceId AND source.code = 'maris'
      WHERE idx.provider = 'mls_grid' AND idx.feedType = 'idx' LIMIT 1
    ), -1)
    THEN NOT EXISTS (
      SELECT 1 FROM mls_listings AS candidate FORCE INDEX (mls_listings_source_number_idx)
      WHERE candidate.sourceId = mls_listings.sourceId
        AND candidate.listingNumber = mls_listings.listingNumber
        AND candidate.feedId = COALESCE((
          SELECT bbo.id FROM mls_feeds AS bbo
          JOIN mls_sources AS source ON source.id = bbo.sourceId AND source.code = 'maris'
          WHERE bbo.provider = 'mls_grid' AND bbo.feedType = 'bbo'
            AND ${approvedFeedSql("candidateLicense", "bbo.id")}
          LIMIT 1
        ), -1)
        AND candidate.removedFromFeedAt IS NULL
    )
    ELSE TRUE END)`);
}

export function searchConditions(filters: SearchFilters, now = new Date()): SQL | undefined {
  // Unlicensed, expired, or unapproved-retention feeds never appear in any admin read.
  const conditions: SQL[] = [sql.raw(approvedFeedSetSql()), preferMarisBboCondition()];
  if (!filters.includeRemoved) conditions.push(isNull(mlsListings.removedFromFeedAt));
  if (filters.sourceIds?.length) conditions.push(inArray(mlsListings.sourceId, filters.sourceIds));
  if (filters.statuses?.length) conditions.push(inArray(mlsListings.standardStatus, filters.statuses));
  if (filters.listingIntent === "rent") conditions.push(inArray(mlsListings.propertyType, ["residential_lease", "commercial_lease"]));
  if (filters.listingIntent === "sale") conditions.push(inArray(mlsListings.propertyType, ["residential", "residential_income", "land", "farm", "commercial_sale", "business_opportunity", "manufactured_in_park"]));
  if (filters.propertyTypes?.length) conditions.push(inArray(mlsListings.propertyType, filters.propertyTypes));
  if (filters.propertySubTypes?.length) conditions.push(inArray(mlsListings.propertySubType, filters.propertySubTypes));
  if (filters.mlsStatuses?.length) conditions.push(inArray(mlsListings.mlsStatus, filters.mlsStatuses));
  if (filters.counties?.length) conditions.push(inArray(mlsListings.countyOrParish, filters.counties));
  if (filters.minPrice !== undefined) conditions.push(gte(mlsListings.listPrice, String(filters.minPrice)));
  if (filters.maxPrice !== undefined) conditions.push(lte(mlsListings.listPrice, String(filters.maxPrice)));
  if (filters.minBeds !== undefined) conditions.push(gte(mlsListings.bedroomsTotal, filters.minBeds));
  if (filters.maxBeds !== undefined) conditions.push(lte(mlsListings.bedroomsTotal, filters.maxBeds));
  if (filters.minBaths !== undefined) conditions.push(gte(mlsListings.bathroomsTotal, String(filters.minBaths)));
  if (filters.maxBaths !== undefined) conditions.push(lte(mlsListings.bathroomsTotal, String(filters.maxBaths)));
  if (filters.minSqft !== undefined) conditions.push(gte(mlsListings.livingArea, String(filters.minSqft)));
  if (filters.maxSqft !== undefined) conditions.push(lte(mlsListings.livingArea, String(filters.maxSqft)));
  if (filters.minYearBuilt !== undefined) conditions.push(gte(mlsListings.yearBuilt, filters.minYearBuilt));
  if (filters.maxYearBuilt !== undefined) conditions.push(lte(mlsListings.yearBuilt, filters.maxYearBuilt));
  if (filters.minAcres !== undefined) conditions.push(gte(mlsListings.lotSizeAcres, String(filters.minAcres)));
  if (filters.maxAcres !== undefined) conditions.push(lte(mlsListings.lotSizeAcres, String(filters.maxAcres)));
  if (filters.minGarage !== undefined) conditions.push(gte(mlsListings.garageSpaces, String(filters.minGarage)));
  if (filters.newConstruction) conditions.push(eq(mlsListings.newConstructionYN, true));
  if (filters.hasPhotos) conditions.push(isNotNull(mlsListings.primaryPhotoUrl));
  if (filters.maxDaysOnMarket !== undefined) conditions.push(lte(mlsListings.daysOnMarket, filters.maxDaysOnMarket));
  if (filters.listedWithinDays) conditions.push(gte(mlsListings.originalEntryAt, new Date(now.getTime() - filters.listedWithinDays * 86_400_000)));
  if (filters.city) conditions.push(eq(mlsListings.city, filters.city));
  if (filters.stateOrProvince) conditions.push(eq(mlsListings.stateOrProvince, filters.stateOrProvince.toUpperCase()));
  if (filters.postalCode) conditions.push(eq(mlsListings.postalCode, filters.postalCode));
  if (filters.waterfront) conditions.push(eq(mlsListings.waterfrontYN, true));
  if (filters.pool) conditions.push(eq(mlsListings.poolPrivateYN, true));
  if (filters.closedWithinDays) {
    const since = new Date(now.getTime() - filters.closedWithinDays * 86_400_000).toISOString().slice(0, 10);
    conditions.push(eq(mlsListings.standardStatus, "closed"), gte(mlsListings.closeDate, since));
  }
  if (filters.bounds) conditions.push(...boundsCondition(filters.bounds));
  if (filters.area) conditions.push(...mapAreaConditions(filters.area));

  const q = filters.q?.trim();
  if (q) {
    const prefix = `${escapeLike(q)}%`;
    if (/^\d{5}$/.test(q)) {
      conditions.push(or(eq(mlsListings.postalCode, q), eq(mlsListings.listingNumber, q), like(mlsListings.unparsedAddress, prefix))!);
    } else if (/^[A-Za-z]{0,4}\d[\w-]{2,}$/.test(q)) {
      // Looks like an MLS number.
      conditions.push(or(eq(mlsListings.listingNumber, q), eq(mlsListings.listingNumber, q.toUpperCase()), like(mlsListings.unparsedAddress, prefix))!);
    } else {
      conditions.push(
        or(
          like(mlsListings.unparsedAddress, prefix),
          like(mlsListings.streetName, prefix),
          like(mlsListings.city, prefix),
          like(mlsListings.subdivisionName, prefix)
        )!
      );
    }
  }
  return conditions.length ? and(...conditions) : undefined;
}

function sortOrder(sort: (typeof SEARCH_SORTS)[number]) {
  switch (sort) {
    case "price_desc":
      return [desc(mlsListings.listPrice), desc(mlsListings.id)];
    case "price_asc":
      return [sql`${mlsListings.listPrice} IS NULL`, asc(mlsListings.listPrice), desc(mlsListings.id)];
    case "beds":
      return [desc(mlsListings.bedroomsTotal), desc(mlsListings.id)];
    case "sqft":
      return [desc(mlsListings.livingArea), desc(mlsListings.id)];
    case "dom":
      return [sql`${mlsListings.daysOnMarket} IS NULL`, asc(mlsListings.daysOnMarket), desc(mlsListings.id)];
    case "updated":
      return [desc(mlsListings.sourceModifiedAt), desc(mlsListings.id)];
    case "newest":
    default:
      return [desc(mlsListings.originalEntryAt), desc(mlsListings.id)];
  }
}

const num = (value: string | number | null | undefined) => (value === null || value === undefined ? null : Number(value));

export const listingCardColumns = {
  id: mlsListings.id,
  propertyId: mlsListings.propertyId,
  sourceId: mlsListings.sourceId,
  listingNumber: mlsListings.listingNumber,
  standardStatus: mlsListings.standardStatus,
  mlsStatus: mlsListings.mlsStatus,
  propertyType: mlsListings.propertyType,
  propertySubType: mlsListings.propertySubType,
  listPrice: mlsListings.listPrice,
  closePrice: mlsListings.closePrice,
  closeDate: mlsListings.closeDate,
  bedroomsTotal: mlsListings.bedroomsTotal,
  bathroomsTotal: mlsListings.bathroomsTotal,
  livingArea: mlsListings.livingArea,
  lotSizeAcres: mlsListings.lotSizeAcres,
  yearBuilt: mlsListings.yearBuilt,
  unparsedAddress: mlsListings.unparsedAddress,
  unitNumber: mlsListings.unitNumber,
  city: mlsListings.city,
  stateOrProvince: mlsListings.stateOrProvince,
  postalCode: mlsListings.postalCode,
  latitude: mlsListings.latitude,
  longitude: mlsListings.longitude,
  daysOnMarket: mlsListings.daysOnMarket,
  primaryPhotoUrl: mlsListings.primaryPhotoUrl,
  photosCount: mlsListings.photosCount,
  // Fall back to the office roster by MLS number for older history rows that
  // carry no brokerage name. Uses mls_offices_source_mlsid_idx; one lookup per row on the page.
  listOfficeName: sql<string | null>`COALESCE(${mlsListings.listOfficeName}, (SELECT o.officeName FROM mls_offices AS o WHERE o.sourceId = ${mlsListings.sourceId} AND o.officeMlsId = ${mlsListings.listOfficeMlsId} AND o.officeName IS NOT NULL LIMIT 1))`,
  listAgentFullName: mlsListings.listAgentFullName,
  originalEntryAt: mlsListings.originalEntryAt,
  sourceModifiedAt: mlsListings.sourceModifiedAt,
  removedFromFeedAt: mlsListings.removedFromFeedAt,
  sourceShortName: mlsSources.shortName,
};

type CardRow = { [K in keyof typeof listingCardColumns]: any };

export function toCard(row: CardRow) {
  return {
    ...row,
    primaryPhotoUrl: withMlsPhotoListingId(row.primaryPhotoUrl, Number(row.id)),
    listPrice: num(row.listPrice),
    closePrice: num(row.closePrice),
    bathroomsTotal: num(row.bathroomsTotal),
    livingArea: num(row.livingArea),
    lotSizeAcres: num(row.lotSizeAcres),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
  };
}
export type ListingCard = ReturnType<typeof toCard>;

/** The default feed needs the chronological index, not a wide status index
 * followed by a filesort over millions of imported records. Keep this hint
 * off narrowed searches: ZIP, source, price and viewport filters have better
 * selective indexes. The InnoDB primary key is the index's tie breaker. */
export function useRecentFeedIndex(filters: SearchFilters, sort: (typeof SEARCH_SORTS)[number], page: number) {
  if (sort !== "updated" || page > 10 || filters.includeRemoved || filters.statuses?.length !== 1 || filters.statuses[0] !== "active") return false;
  return !Object.entries(filters).some(([key, value]) => key !== "statuses" && value !== undefined && value !== false && (!Array.isArray(value) || value.length > 0));
}

/** Newest defaults to the (status, originalEntryAt) index, never a history-wide filesort. */
export function useNewestFeedIndex(filters: SearchFilters, sort: (typeof SEARCH_SORTS)[number], page: number) {
  if (sort !== "newest" || page > 10 || filters.includeRemoved || filters.statuses?.length !== 1 || filters.statuses[0] !== "active") return false;
  return !Object.entries(filters).some(([key, value]) => !["statuses", "listingIntent"].includes(key) && value !== undefined && value !== false && (!Array.isArray(value) || value.length > 0));
}

/** A viewport, drawn area or selected MLS can scan recent Active IDs until 13
 * match, avoiding a full geo/source scan and filesort. Cap it because a sparse
 * shape or source could otherwise scan every other MLS feed. */
export function useBoundedNewestCandidateIndex(filters: SearchFilters, sort: (typeof SEARCH_SORTS)[number], page: number) {
  if (sort !== "newest" || page > 10 || filters.includeRemoved || (!filters.bounds && !filters.area && filters.sourceIds?.length !== 1) ||
      filters.statuses?.length !== 1 || filters.statuses[0] !== "active") return false;
  if (filters.sourceIds && filters.sourceIds.length !== 1) return false;
  return !Object.entries(filters).some(([key, value]) =>
    !["statuses", "listingIntent", "bounds", "area", "sourceIds"].includes(key) && value !== undefined && value !== false && (!Array.isArray(value) || value.length > 0));
}

function timedOut(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const cause = current as { code?: string; errno?: number; cause?: unknown };
    if (cause.code === "ER_QUERY_TIMEOUT" || cause.errno === 3024) return true;
    current = cause.cause;
  }
  return false;
}

/** Exact count is a separate request: never make the first page await it. */
export async function countListings(db: Db, filters: SearchFilters): Promise<number> {
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(mlsListings).where(searchConditions(filters));
  return Number(total);
}

export async function searchListings(
  db: Db,
  input: { filters: SearchFilters; sort: (typeof SEARCH_SORTS)[number]; page: number; pageSize: number; countMode?: "exact" | "none" }
) {
  const where = searchConditions(input.filters);
  const offset = (input.page - 1) * input.pageSize;
  const indexHint = useNewestFeedIndex(input.filters, input.sort, input.page)
    ? { forceIndex: ["mls_listings_status_entry_idx"] }
    : useRecentFeedIndex(input.filters, input.sort, input.page)
      ? { forceIndex: ["mls_listings_modified_idx"] }
      : undefined;
  const fetchIds = (bounded: boolean, geoFallback = false) => db
    .select({ id: bounded ? sql<number>`/*+ MAX_EXECUTION_TIME(800) */ ${mlsListings.id}` : mlsListings.id })
    .from(mlsListings, bounded ? { forceIndex: ["mls_listings_status_entry_idx"] } : geoFallback ? { forceIndex: ["mls_listings_status_geo_idx"] } : indexHint)
    .where(where)
    .orderBy(...sortOrder(input.sort))
    .limit(input.pageSize + (input.countMode === "none" ? 1 : 0))
    .offset(offset);
  let ids: Awaited<ReturnType<typeof fetchIds>>;
  if (useBoundedNewestCandidateIndex(input.filters, input.sort, input.page)) {
    try {
      ids = await fetchIds(true);
    } catch (error) {
      if (!timedOut(error)) throw error;
      // A source-only fallback must not force a geographic index. A drawn
      // shape does have a latitude bounding predicate even without bounds.
      ids = await fetchIds(false, !!(input.filters.bounds || input.filters.area));
    }
  } else {
    ids = await fetchIds(false);
  }
  const pageIds = ids.slice(0, input.pageSize).map(row => Number(row.id));
  // Only hydrate the chosen page. Recheck licensing in case a feed was revoked
  // between the ID query and this read; never expose its former card data.
  const rows = pageIds.length ? await db.select(listingCardColumns)
    .from(mlsListings)
    .innerJoin(mlsSources, eq(mlsSources.id, mlsListings.sourceId))
    .where(and(where, inArray(mlsListings.id, pageIds))) : [];
  const byId = new Map(rows.map(row => [Number(row.id), row]));
  const items = pageIds.flatMap(id => { const row = byId.get(id); return row ? [toCard(row)] : []; });
  if (input.countMode === "none") {
    return { items, total: null, hasMore: ids.length > input.pageSize, page: input.page, pageSize: input.pageSize };
  }
  const total = await countListings(db, input.filters);
  return { items, total, hasMore: offset + ids.length < total, page: input.page, pageSize: input.pageSize };
}

/**
 * Map layer. Up to `pinLimit` listings in view come back as pins; above that
 * the viewport is bucketed into a grid sized to the zoom level and each cell
 * returns its count, average position and price range.
 */
export async function mapPoints(
  db: Db,
  input: { filters: SearchFilters; bounds: z.infer<typeof boundsSchema>; zoom: number; pinLimit?: number }
) {
  // Even 49 price pills overlap on a phone-sized neighborhood map. Zoom into
  // clusters first, then show individual listings once the viewport is usable.
  const pinLimit = input.pinLimit ?? 20;
  const where = searchConditions({ ...input.filters, bounds: input.bounds });
  const pins = await db
    .select({
      id: mlsListings.id,
      latitude: mlsListings.latitude,
      longitude: mlsListings.longitude,
      listPrice: mlsListings.listPrice,
      closePrice: mlsListings.closePrice,
      standardStatus: mlsListings.standardStatus,
      unparsedAddress: mlsListings.unparsedAddress,
      city: mlsListings.city,
      stateOrProvince: mlsListings.stateOrProvince,
      bedroomsTotal: mlsListings.bedroomsTotal,
      bathroomsTotal: mlsListings.bathroomsTotal,
      primaryPhotoUrl: mlsListings.primaryPhotoUrl,
      sourceShortName: mlsSources.shortName,
    })
    .from(mlsListings)
    .innerJoin(mlsSources, eq(mlsSources.id, mlsListings.sourceId))
    .where(where)
    .limit(pinLimit + 1);
  if (pins.length <= pinLimit) {
    return {
      mode: "pins" as const,
      total: pins.length,
      pins: pins.map(pin => ({
        id: pin.id,
        lat: Number(pin.latitude),
        lng: Number(pin.longitude),
        price: num(pin.standardStatus === "closed" ? pin.closePrice ?? pin.listPrice : pin.listPrice),
        status: pin.standardStatus,
        address: pin.unparsedAddress,
        city: pin.city,
        state: pin.stateOrProvince,
        beds: pin.bedroomsTotal,
        baths: num(pin.bathroomsTotal),
        photoUrl: withMlsPhotoListingId(pin.primaryPhotoUrl, pin.id),
        source: pin.sourceShortName,
      })),
      clusters: [],
    };
  }
  // About 128 screen pixels per cell; 64px buckets flooded compact maps with overlapping bubbles.
  const zoom = Math.max(1, Math.min(20, Math.round(input.zoom)));
  const cell = 360 / 2 ** zoom / 2;
  const latCell = sql.raw(String(cell));
  const rows = await db
    .select({
      latBucket: sql<number>`FLOOR(${mlsListings.latitude} / ${latCell})`,
      lngBucket: sql<number>`FLOOR(${mlsListings.longitude} / ${latCell})`,
      count: sql<number>`count(*)`,
      lat: sql<number>`AVG(${mlsListings.latitude})`,
      lng: sql<number>`AVG(${mlsListings.longitude})`,
      minPrice: sql<number>`MIN(${mlsListings.listPrice})`,
      maxPrice: sql<number>`MAX(${mlsListings.listPrice})`,
    })
    .from(mlsListings)
    .where(where)
    .groupBy(sql`1`, sql`2`)
    .limit(2000);
  // The grouped scan already knows the count in each cell. Only fall back to
  // a separate count when the 2,000-cell cap could have truncated the result.
  let count = rows.reduce((sum, row) => sum + Number(row.count), 0);
  if (rows.length === 2000) {
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(mlsListings).where(where);
    count = Number(total);
  }
  return {
    mode: "clusters" as const,
    total: count,
    pins: [],
    clusters: rows.map(row => ({
      key: `${row.latBucket}:${row.lngBucket}`,
      lat: Number(row.lat),
      lng: Number(row.lng),
      count: Number(row.count),
      minPrice: num(row.minPrice),
      maxPrice: num(row.maxPrice),
    })),
  };
}
