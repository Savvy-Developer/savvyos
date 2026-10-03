import { describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { MlsFeed, MlsSource } from "../../drizzle/mlsSchema";
import { MLS_GRID_LIMITS, MLS_GRID_MEDIA_CONCURRENCY, mlsGridAdapter } from "./adapters/mlsGrid";
import type { ProviderLimits } from "./adapters/types";
import { ProviderLane, cdnIntervalMs, downloadMedia, requestJson, wireBytes } from "./http";
import { isMlsGridCdnUrl } from "./mlsGridCdn";
import { sparkAdapter } from "./adapters/spark";
import { keysetFilter, trestleAdapter } from "./adapters/trestle";
import { buildComplianceProfile, feedFreshness, fillComplianceTemplate } from "./compliance";
import { credentialStatus } from "./credentials";
import { withMlsPhotoListingId } from "./photoUrl";
import { mapAreaSchema, validPolygon } from "./mapGeometry";
import { CANONICAL_STATUSES, normalizePropertyType, normalizeStatus } from "./normalize/enums";
import { normalizeListing } from "./normalize/normalizeListing";
import { propertyIdentity } from "./normalize/propertyIdentity";
import { pinLimitForZoom, preferMarisBboCondition, scanIndexFor, searchConditions, useBoundedNewestCandidateIndex, useExactMlsNumberIndex, useNewestFeedIndex, useRecentFeedIndex, withIndexableStatuses } from "./search";
import { licenseError } from "./license";
import { summarize } from "./status";
import { mediaClientConfig, privateMlsStorageError } from "./privateMedia";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseODataPage } from "./adapters/types";
import { __testables__ as mcpTestables } from "../readOnlyMcp";
import { MLS_SOURCE_SEEDS, seedCompliance } from "./sources";
import { importErrorInfo, mediaWanted, payloadHash, retryOnDeadlock } from "./store";
import { REFRESH_STAGE_MAX_PRIORITY, isQueryTimeout } from "./media";
import { blockingHolders, scrubSql } from "./schema";

const source = {
  id: 1,
  code: "canopy",
  name: "Canopy MLS",
  shortName: "Canopy",
  providerRoute: "mls_grid",
  originatingSystemName: "carolina",
  keyPrefix: "CAR",
} as unknown as MlsSource;

const feed = {
  id: 7,
  sourceId: 1,
  provider: "mls_grid",
  feedType: "idx",
  baseUrl: "https://api.mlsgrid.com/v2",
  originatingSystemName: "carolina",
  keyPrefix: "CAR",
  credentialRef: "MLSGRID",
  options: null,
  mediaPolicy: "active_all_else_primary",
} as unknown as MlsFeed;

const ctx = { feed, source };

describe("Active-gallery queue and default search", () => {
  it("forces chronological index only for the unfiltered first Active pages", () => {
    expect(useRecentFeedIndex({ statuses: ["active"] }, "updated", 1)).toBe(true);
    expect(useRecentFeedIndex({ statuses: ["active"], q: "28801" }, "updated", 1)).toBe(false);
    expect(useRecentFeedIndex({ statuses: ["active"], minPrice: 400000 }, "updated", 1)).toBe(false);
    expect(useRecentFeedIndex({ statuses: ["active", "pending"] }, "updated", 1)).toBe(false);
    expect(useRecentFeedIndex({ statuses: ["active"] }, "price_desc", 1)).toBe(false);
    expect(useRecentFeedIndex({ statuses: ["active"] }, "updated", 11)).toBe(false);
  });
  it("uses an indexed Newest sort for the default For sale/Active pages, not narrowed searches", () => {
    expect(useNewestFeedIndex({ statuses: ["active"], listingIntent: "sale" }, "newest", 1)).toBe(true);
    expect(useNewestFeedIndex({ statuses: ["active"], listingIntent: "sale", q: "28801" }, "newest", 1)).toBe(false);
    expect(useNewestFeedIndex({ statuses: ["active"], area: { kind: "circle", center: { lat: 35.59, lng: -82.55 }, radiusMeters: 1500 } }, "newest", 1)).toBe(false);
    expect(useNewestFeedIndex({ statuses: ["active", "pending"] }, "newest", 1)).toBe(false);
    expect(useNewestFeedIndex({ statuses: ["active"] }, "updated", 1)).toBe(false);
  });
  it("time-caps recent Active candidates for viewports, drawn areas and one selected MLS", () => {
    const bounds = { north: 36, south: 35, east: -81.5, west: -84 };
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], listingIntent: "sale", bounds }, "newest", 1)).toBe(true);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], sourceIds: [4], listingIntent: "sale" }, "newest", 1)).toBe(true);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], bounds, sourceIds: [4] }, "newest", 1)).toBe(true);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], area: { kind: "circle", center: { lat: 35.59, lng: -82.55 }, radiusMeters: 1500 } }, "newest", 1)).toBe(true);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], bounds, q: "28801" }, "newest", 1)).toBe(false);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], sourceIds: [4], q: "28801" }, "newest", 1)).toBe(false);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], sourceIds: [1, 4] }, "newest", 1)).toBe(false);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"] }, "newest", 1)).toBe(false);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], bounds, area: { kind: "circle", center: { lat: 35.59, lng: -82.55 }, radiusMeters: 1500 } }, "newest", 1)).toBe(true);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active", "pending"], bounds }, "newest", 1)).toBe(false);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], bounds }, "updated", 1)).toBe(false);
    expect(useBoundedNewestCandidateIndex({ statuses: ["active"], bounds }, "newest", 11)).toBe(false);
  });
  it("starts every map and count scan from a status-leading index, never the per-feed key", () => {
    expect(scanIndexFor({ statuses: ["active"], listingIntent: "sale" }, true)).toEqual({ forceIndex: ["mls_listings_status_geo_idx"] });
    expect(scanIndexFor({ statuses: ["active"], listingIntent: "sale" }, false)).toEqual({ forceIndex: ["mls_listings_status_entry_idx"] });
    expect(scanIndexFor({ statuses: ["active"], sourceIds: [4], q: "4428731" }, true)).toEqual({ forceIndex: ["mls_listings_source_number_idx"] });
    // "All" statuses: name every canonical status so the index range still applies.
    expect(withIndexableStatuses({}).statuses).toEqual([...CANONICAL_STATUSES]);
    expect(withIndexableStatuses({ statuses: [] }).statuses).toEqual([...CANONICAL_STATUSES]);
    expect(withIndexableStatuses({ statuses: ["pending"] }).statuses).toEqual(["pending"]);
    expect(normalizeStatus("Something New")).toBe("unknown");
  });
  it("switches map, count and MARIS BBO checks to the covering indexes only once they exist", () => {
    expect([10, 13, 15, 17, 19].map(pinLimitForZoom)).toEqual([20, 40, 100, 300, 300]);
    expect(blockingHolders([
      { command: "Query", seconds: 2 },
      { command: "Query", seconds: 9 },
      { command: "Sleep", seconds: 0 },
      { command: "Sleep", seconds: 3 },
    ])).toEqual([{ command: "Query", seconds: 9 }, { command: "Sleep", seconds: 3 }]);
    expect(scrubSql("SELECT  id FROM `mls_listings` FORCE INDEX (mls_listings_status_entry_idx)\n WHERE city = 'O\\'Neil Asheville' AND listPrice > 450000.5 AND note = \"28801\" LIMIT 25"))
      .toBe("SELECT id FROM `mls_listings` FORCE INDEX (mls_listings_status_entry_idx) WHERE city = ? AND listPrice > ? AND note = ? LIMIT ?");
    const ready = { searchCover: true, sourceNumberFeed: true }, missing = { searchCover: false, sourceNumberFeed: false };
    expect(scanIndexFor({ statuses: ["active"] }, true, ready)).toEqual({ forceIndex: ["mls_listings_search_cover_idx"] });
    expect(scanIndexFor({ statuses: ["active"] }, false, ready)).toEqual({ forceIndex: ["mls_listings_search_cover_idx"] });
    expect(scanIndexFor({ statuses: ["active"] }, true, missing)).toEqual({ forceIndex: ["mls_listings_status_geo_idx"] });
    expect(scanIndexFor({ statuses: ["active"], sourceIds: [4], q: "4428731" }, true, ready)).toEqual({ forceIndex: ["mls_listings_source_number_idx"] });
    const dialect = new MySqlDialect();
    expect(dialect.sqlToQuery(preferMarisBboCondition(ready)).sql).toContain("FORCE INDEX (mls_listings_source_number_feed_idx)");
    expect(dialect.sqlToQuery(preferMarisBboCondition(missing)).sql).toContain("FORCE INDEX (mls_listings_source_number_idx)");
  });
  it("seeks a single MLS number before evaluating saved viewport or polygon predicates", () => {
    const sourceIds = [4], bounds = { north: 39, south: 38, west: -91, east: -90 };
    expect(useExactMlsNumberIndex({ sourceIds, q: "26063536", bounds, statuses: ["active"] })).toBe(true);
    expect(useExactMlsNumberIndex({ sourceIds, q: "MIS26063536", area: { kind: "circle", center: { lat: 38.6, lng: -90.2 }, radiusMeters: 5000 } })).toBe(true);
    expect(useExactMlsNumberIndex({ sourceIds, q: "28803", bounds })).toBe(false); // ZIP/address branch.
    expect(useExactMlsNumberIndex({ sourceIds, q: "3949 Utah", bounds })).toBe(false);
    expect(useExactMlsNumberIndex({ sourceIds: [1, 4], q: "26063536", bounds })).toBe(false);
    expect(useExactMlsNumberIndex({ q: "26063536", bounds })).toBe(false);
  });
});
describe("indexed private MLS photo URLs", () => {
  const stored = "/api/mls/media?key=mls%2Fcanopy%2F1%2FCAR123%2Fphoto.jpg";
  it("upgrades a previously stored photo URL and replaces a stale listing hint", () => {
    expect(withMlsPhotoListingId(stored, 42)).toBe(`${stored}&listingId=42`);
    expect(withMlsPhotoListingId(`${stored}&listingId=17`, 42)).toBe(`${stored}&listingId=42`);
  });
  it("never rewrites other photo hosts or accepts a missing listing identifier", () => {
    expect(withMlsPhotoListingId("https://cdn.test/photo.jpg", 42)).toBe("https://cdn.test/photo.jpg");
    expect(withMlsPhotoListingId(null, 42)).toBeNull();
    expect(withMlsPhotoListingId(stored, 0)).toBeNull();
  });
});
function canopyRecord(overrides: Record<string, unknown> = {}) {
  return {
    "@odata.id": "https://api.mlsgrid.com/v2/Property('CAR4123456')",
    ListingKey: "CAR4123456",
    ListingId: "CAR4123456",
    OriginatingSystemName: "carolina",
    MlgCanView: true,
    MlgCanUse: ["IDX", "VOW"],
    StandardStatus: "Active Under Contract",
    MlsStatus: "UnderContractShow",
    PropertyType: "Residential",
    PropertySubType: "SingleFamilyResidence",
    ListPrice: 525000,
    OriginalListPrice: 549000,
    BedroomsTotal: 3,
    BathroomsFull: 2,
    BathroomsHalf: 1,
    LivingArea: 1850,
    LotSizeArea: 0.46,
    LotSizeUnits: "Acres",
    YearBuilt: 1998,
    StreetNumber: "123",
    StreetName: "Mountain View",
    StreetSuffix: "Dr",
    City: "Asheville",
    StateOrProvince: "nc",
    PostalCode: "28803-1234",
    CountyOrParish: "Buncombe",
    Latitude: 35.5951,
    Longitude: -82.5515,
    PublicRemarks: "Mountain views.",
    PrivateRemarks: "Lockbox on the side door.",
    Appliances: ["Dishwasher", "Refrigerator"],
    ListOfficeName: "Savvy STR Agents",
    ListAgentMlsId: "CAR12345",
    ModificationTimestamp: "2026-09-28T14:03:11.123Z",
    CAR_ShortTermRentalYN: true,
    CAR_ZoningDescription: "RS-4",
    Media: [
      { MediaKey: "CARm2", Order: 2, MediaURL: "https://media.mlsgrid.com/b.jpg", MediaCategory: "Photo" },
      { MediaKey: "CARm1", Order: 1, MediaURL: "https://media.mlsgrid.com/a.jpg", MediaCategory: "Photo" },
    ],
    ...overrides,
  };
}

describe("status and type normalization", () => {
  it("maps RESO spellings to canonical values", () => {
    expect(normalizeStatus("Active")).toBe("active");
    expect(normalizeStatus("Active Under Contract")).toBe("active_under_contract");
    expect(normalizeStatus("ActiveUnderContract")).toBe("active_under_contract");
    expect(normalizeStatus("Closed")).toBe("closed");
    expect(normalizeStatus("Coming Soon")).toBe("coming_soon");
    expect(normalizeStatus("Pending")).toBe("pending");
    expect(normalizeStatus("something odd")).toBe("unknown");
    expect(normalizeStatus(null)).toBe("unknown");
    expect(normalizePropertyType("Residential")).toBe("residential");
    expect(normalizePropertyType("Land")).toBe("land");
  });
});

describe("normalizeListing", () => {
  it("drops out-of-range derived bathroom totals instead of rejecting a whole MLS page", () => {
    const component = normalizeListing(ctx, mlsGridAdapter, canopyRecord({ BathroomsFull: 5000, BathroomsHalf: 0 }));
    expect(component.columns.bathroomsTotal).toBeNull();
    expect(component.provenance.bathroomsTotal).toBeUndefined();
    const integer = normalizeListing(ctx, mlsGridAdapter, canopyRecord({ BathroomsFull: 0, BathroomsHalf: 0, BathroomsTotalInteger: 5000 }));
    expect(integer.columns.bathroomsTotal).toBeNull();
    expect(integer.provenance.bathroomsTotal).toBeUndefined();
  });
  it("maps a Canopy MLS Grid record into canonical, feature, and local layers", () => {
    const result = normalizeListing(ctx, mlsGridAdapter, canopyRecord());
    expect(result.providerListingKey).toBe("CAR4123456");
    expect(result.listingKey).toBe("4123456");
    expect(result.listingNumber).toBe("4123456");
    expect(result.columns.standardStatus).toBe("active_under_contract");
    expect(result.columns.propertyType).toBe("residential");
    expect(Number(result.columns.listPrice)).toBe(525000);
    expect(Number(result.columns.bathroomsTotal)).toBe(2.5);
    expect(Number(result.columns.lotSizeAcres)).toBeCloseTo(0.46, 4);
    expect(result.columns.stateOrProvince).toBe("NC");
    expect(result.columns.streetName).toBe("Mountain View Dr");
    expect(result.columns.listAgentMlsId).toBe("12345");
    expect(result.features.appliances).toEqual(["Dishwasher", "Refrigerator"]);
    expect(result.localFields).toMatchObject({ CAR_ShortTermRentalYN: true, CAR_ZoningDescription: "RS-4" });
    // Confidential standard fields never reach the listing layers.
    expect(JSON.stringify(result.localFields)).not.toContain("Lockbox");
    expect(Object.values(result.columns)).not.toContain("Lockbox on the side door.");
    expect(result.provenance.listPrice).toBe("ListPrice");
    expect(result.permittedUses).toEqual(["IDX", "VOW"]);
    expect(result.viewable).toBe(true);
    expect(result.media.map(item => item.mediaKey)).toEqual(["CARm1", "CARm2"]);
    expect(result.media[0].isPrimary).toBe(true);
  });

  it("treats MlgCanView=false as not viewable", () => {
    expect(normalizeListing(ctx, mlsGridAdapter, canopyRecord({ MlgCanView: false })).viewable).toBe(false);
  });

  it("lets a registry override route a local field to an STR insight", () => {
    const override = {
      id: 42,
      sourceId: 1,
      provider: null,
      resource: "Property",
      sourceField: "CAR_ShortTermRentalYN",
      resoField: null,
      target: "insight.strAllowed",
      transform: "enum_map",
      valueMap: { true: "yes", false: "no" },
      confidence: 90,
      isActive: true,
    } as any;
    const result = normalizeListing(ctx, mlsGridAdapter, canopyRecord(), { overrides: [override] });
    expect(result.insights.strAllowed).toMatchObject({ value: "yes", sourceField: "CAR_ShortTermRentalYN", mappingId: 42 });
    expect(result.localFields.CAR_ShortTermRentalYN).toBeUndefined();
  });

  it("drops impossible coordinates", () => {
    const result = normalizeListing(ctx, mlsGridAdapter, canopyRecord({ Latitude: 0, Longitude: 0 }));
    expect(result.columns.latitude).toBeUndefined();
    expect(result.columns.longitude).toBeUndefined();
  });
});

describe("propertyIdentity", () => {
  it("links the same address across formatting differences", () => {
    const a = propertyIdentity({ sourceId: 1, listingNumber: "1", streetNumber: "123", streetName: "Mountain View Drive", postalCode: "28803-1234", stateOrProvince: "NC" } as any);
    const b = propertyIdentity({ sourceId: 2, listingNumber: "9", streetNumber: "123", streetName: "mountain view dr", postalCode: "28803", stateOrProvince: "nc" } as any);
    expect(a.source).toBe("address");
    expect(a.key).toBe(b.key);
  });

  it("falls back to parcel, then to the listing", () => {
    const parcel = propertyIdentity({ sourceId: 1, listingNumber: "1", parcelNumber: "9648-12-3456", stateOrProvince: "NC", countyOrParish: "Buncombe" } as any);
    expect(parcel.source).toBe("parcel");
    const listing = propertyIdentity({ sourceId: 1, listingNumber: "1" } as any);
    expect(listing.source).toBe("listing");
  });
});

describe("adapters", () => {
  it("MLS Grid filters one originating system and only viewable records on the initial pass", () => {
    const initial = decodeURIComponent(mlsGridAdapter.firstPageUrl(ctx, "Property", { phase: "initial", highWaterMark: null, resumeToken: null }, ""));
    expect(initial).toContain("OriginatingSystemName eq 'carolina'");
    expect(initial).toContain("MlgCanView eq true");
    expect(initial).toContain("$expand=Media,Rooms,UnitTypes");
    const incremental = decodeURIComponent(
      mlsGridAdapter.firstPageUrl(ctx, "Property", { phase: "incremental", highWaterMark: "2026-09-28T14:03:11.123Z", resumeToken: null }, "")
    );
    expect(incremental).not.toContain("MlgCanView eq true");
    expect(incremental).toContain("ModificationTimestamp gt 2026-09-28T14:03:11.123Z");
  });

  it("MLS Grid photo links never expire (CDN only)", () => {
    const received = new Date("2026-10-02T12:00:00Z");
    expect(mlsGridAdapter.mediaUrlExpiresAt("https://cdn-savvystr.mlsgrid.com/images/CAR1/a.jpeg", received)).toBeNull();
    expect(mlsGridAdapter.capabilities.mediaUrlsExpire).toBe(false);
  });

  it("Trestle keyset paging breaks timestamp ties by key", () => {
    const filter = keysetFilter("ModificationTimestamp", "ListingKey", "2026-09-28T14:03:11Z", "abc");
    expect(filter).toContain("ModificationTimestamp gt 2026-09-28T14:03:11Z");
    expect(filter).toContain("ListingKey gt 'abc'");
    expect(trestleAdapter.capabilities.requiresReconciliation).toBe(true);
  });

  it("Spark requires reconciliation to find deletions", () => {
    expect(sparkAdapter.capabilities.requiresReconciliation).toBe(true);
    expect(sparkAdapter.capabilities.deleteFlag).toBe(false);
  });
});

describe("compliance", () => {
  it("fills attribution and flags stale feeds", () => {
    const profile = buildComplianceProfile("mls_grid");
    expect(fillComplianceTemplate(profile.attribution, { mlsName: "Canopy MLS" })).toBe("Listings courtesy of Canopy MLS as distributed by MLS GRID");
    const now = new Date("2026-09-29T12:00:00Z");
    expect(feedFreshness(null, 12, now)).toBe("never");
    expect(feedFreshness(new Date("2026-09-29T08:00:00Z"), 12, now)).toBe("fresh");
    expect(feedFreshness(new Date("2026-09-29T02:00:00Z"), 12, now)).toBe("due");
    expect(feedFreshness(new Date("2026-09-28T20:00:00Z"), 12, now)).toBe("stale");
  });

  it("seeds every source with a rule profile and unique code", () => {
    const codes = new Set(MLS_SOURCE_SEEDS.map(seed => seed.code));
    expect(codes.size).toBe(MLS_SOURCE_SEEDS.length);
    for (const seed of MLS_SOURCE_SEEDS) {
      const profile = seedCompliance(seed);
      expect(profile.maxRefreshHours).toBeGreaterThan(0);
      if (seed.providerRoute === "mls_grid") {
        expect(seed.originatingSystemName, seed.code).toBeTruthy();
        expect(profile.deletionSignal).toBe("mlg_can_view");
      }
    }
  });
});

describe("credentials", () => {
  it("reads secrets by reference and never from the feed row", () => {
    const before = process.env.MLS_CRED_TESTREF_TOKEN;
    delete process.env.MLS_CRED_TESTREF_TOKEN;
    expect(credentialStatus({ provider: "mls_grid", credentialRef: "TESTREF" }).configured).toBe(false);
    process.env.MLS_CRED_TESTREF_TOKEN = "x";
    expect(credentialStatus({ provider: "mls_grid", credentialRef: "TESTREF" }).configured).toBe(true);
    expect(credentialStatus({ provider: "trestle", credentialRef: "TESTREF" }).expectedVariables).toEqual([["MLS_CRED_TESTREF_CLIENT_ID", "MLS_CRED_TESTREF_CLIENT_SECRET"]]);
    if (before === undefined) delete process.env.MLS_CRED_TESTREF_TOKEN;
    else process.env.MLS_CRED_TESTREF_TOKEN = before;
  });
});

describe("store helpers", () => {
  it("ignores signed media URLs when hashing so unchanged records are skipped", () => {
    const a = canopyRecord();
    const b = canopyRecord({
      Media: [
        { MediaKey: "CARm2", Order: 2, MediaURL: "https://media.mlsgrid.com/b.jpg?sig=2", MediaCategory: "Photo" },
        { MediaKey: "CARm1", Order: 1, MediaURL: "https://media.mlsgrid.com/a.jpg?sig=2", MediaCategory: "Photo" },
      ],
    });
    expect(payloadHash(a)).toBe(payloadHash(b));
    expect(payloadHash(a)).not.toBe(payloadHash(canopyRecord({ ListPrice: 499000 })));
  });

  it("applies the photo policy by status", () => {
    const primary = { isPrimary: true } as any;
    const secondary = { isPrimary: false } as any;
    expect(mediaWanted(secondary, "active", "active_all_else_primary", false)).toBe(true);
    expect(mediaWanted(secondary, "closed", "active_all_else_primary", false)).toBe(false);
    expect(mediaWanted(primary, "closed", "active_all_else_primary", false)).toBe(true);
    expect(mediaWanted(secondary, "closed", "all", true)).toBe(false);
    expect(mediaWanted(secondary, "closed", "all", false)).toBe(true);
    expect(mediaWanted(primary, "active", "none", false)).toBe(false);
  });
});

describe("search filters", () => {
  const dialect = new MySqlDialect();
  const render = (filters: Parameters<typeof searchConditions>[0]) => {
    const where = searchConditions(filters, new Date("2026-09-29T12:00:00Z"));
    return where ? dialect.sqlToQuery(where) : null;
  };

  it("hides removed listings by default and uses indexed equality for ZIP searches", () => {
    const query = render({ q: "28803" })!;
    expect(query.sql).toContain("`removedFromFeedAt` is null");
    expect(query.params).toContain("28803");
  });

  it("builds viewport, status, and sold-within filters", () => {
    const query = render({
      statuses: ["active"],
      bounds: { north: 36, south: 35, east: -82, west: -83 },
      closedWithinDays: 90,
      minPrice: 300000,
    })!;
    expect(query.sql).toContain("`latitude`");
    expect(query.sql).toContain("`closeDate`");
    expect(query.params).toContain("2026-07-01");
    expect(query.params).toContain("300000");
  });

  it("escapes LIKE wildcards in free text", () => {
    const query = render({ q: "Main_St%" })!;
    expect(query.params).toContain("Main\\_St\\%%");
  });

  it("keeps exact MLS numbers on the indexed source/number path, not an address scan", () => {
    const number = render({ q: "26063536", sourceIds: [2] })!;
    expect(number.sql).toContain("`listingNumber` = ?");
    expect(number.sql).not.toContain("`unparsedAddress` like ?");
    expect(number.params).toContain("26063536");
    const address = render({ q: "3949 Utah", sourceIds: [2] })!;
    expect(address.params).toContain("3949 Utah%");
  });

  it("parameterizes source facets and limits an indexed circle before measuring distance", () => {
    const query = render({ sourceIds: [1], listingIntent: "sale", propertySubTypes: ["Single Family"], counties: ["Buncombe"], area: { kind: "circle", center: { lat: 35.59, lng: -82.55 }, radiusMeters: 1609 } })!;
    expect(query.sql).toContain("ST_Distance_Sphere");
    expect(query.sql).toContain("`latitude` >= ?");
    expect(query.params).toEqual(expect.arrayContaining([1, "Single Family", "Buncombe", -82.55, 1609]));
    expect(query.sql).not.toContain("Single Family");
  });

  it("accepts a simple polygon, parameterizes its WKT, and rejects self-crossing shapes", () => {
    const points = [{ lat: 35.58, lng: -82.57 }, { lat: 35.60, lng: -82.57 }, { lat: 35.60, lng: -82.53 }, { lat: 35.58, lng: -82.53 }];
    expect(validPolygon(points)).toBe(true);
    const query = render({ area: { kind: "polygon", points } })!;
    expect(query.sql).toContain("ST_Intersects");
    expect(query.sql).not.toContain("POLYGON((");
    expect(query.params.some(param => String(param).startsWith("POLYGON(("))).toBe(true);
    expect(mapAreaSchema.safeParse({ kind: "polygon", points: [points[0], points[2], points[1], points[3]] }).success).toBe(false);
    expect(mapAreaSchema.safeParse({ kind: "circle", center: points[0], radiusMeters: 0 }).success).toBe(false);
  });
});

describe("license and isolation guards", () => {
  const licensed = { approved: true, internalUse: true, reference: "Canopy BO agreement 2026-10" };

  it("fails closed until a signed internal-use license is recorded", () => {
    expect(licenseError({ options: {}, retentionPolicy: "purge" } as any)).toMatch(/license/);
    expect(licenseError({ options: { license: { ...licensed, internalUse: false } }, retentionPolicy: "purge" } as any)).toMatch(/internal-use/);
    expect(licenseError({ options: { license: { ...licensed, reference: " " } }, retentionPolicy: "purge" } as any)).toMatch(/reference/);
    expect(licenseError({ options: { license: licensed }, retentionPolicy: "purge" } as any)).toBeNull();
  });

  it("blocks expired licenses and history retention without written permission", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    expect(licenseError({ options: { license: { ...licensed, expiresAt: "2026-09-01" } }, retentionPolicy: "purge" } as any, now)).toMatch(/expired/);
    expect(licenseError({ options: { license: licensed }, retentionPolicy: "retain_history" } as any, now)).toMatch(/History retention/);
    expect(licenseError({ options: { license: { ...licensed, retainHistory: true } }, retentionPolicy: "retain_history" } as any, now)).toBeNull();
  });

  it("applies the license gate to every search and map query", () => {
    const query = new MySqlDialect().sqlToQuery(searchConditions({})!);
    expect(query.sql).toContain("$.license.approved");
    expect(query.sql).toContain("$.license.internalUse");
    expect(query.sql).toContain("$.license.retainHistory");
    expect(query.sql).toContain("mls_listings.feedId IN (SELECT scope.id");
    expect(query.sql).toContain("CASE WHEN mls_listings.feedId");
  });

  it("keeps MLS tables out of the general read-only MCP endpoint", () => {
    expect(() => mcpTestables.validateReadOnlySql("SELECT id FROM mls_listings LIMIT 5")).toThrow(/isolated/);
    expect(() => mcpTestables.validateReadOnlySql("SELECT id FROM contacts WHERE id IN (SELECT id FROM MLS_MEDIA) LIMIT 5")).toThrow(/isolated/);
    expect(() => mcpTestables.validateReadOnlySql("SELECT id FROM mls_import_exceptions LIMIT 5")).toThrow(/isolated/);
  });
  it("reports an error code and column but never records the provider value or SQL statement", () => {
    const wrapped = Object.assign(new Error("query failed"), { cause: Object.assign(new Error("bad value"), { code: "ER_DATA_TOO_LONG", sqlMessage: "Data too long for column 'postalCode' at row 1: 123 private address" }) });
    expect(importErrorInfo(wrapped)).toEqual({ code: "ER_DATA_TOO_LONG", column: "postalCode", transient: false });
    expect(importErrorInfo(Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK" })).transient).toBe(true);
  });

  it("replays a deadlock victim in place, but not other errors, and gives up after bounded attempts", async () => {
    const deadlock = () => Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("Deadlock found"), { code: "ER_LOCK_DEADLOCK" }) });
    let calls = 0;
    await expect(retryOnDeadlock(async () => { calls += 1; if (calls < 3) throw deadlock(); return "saved"; }, 4, 1)).resolves.toBe("saved");
    expect(calls).toBe(3);

    calls = 0;
    await expect(retryOnDeadlock(async () => { calls += 1; throw deadlock(); }, 4, 1)).rejects.toThrow("Failed query");
    expect(calls).toBe(4);

    for (const code of ["ER_LOCK_WAIT_TIMEOUT", "ER_DATA_TOO_LONG"]) {
      calls = 0;
      await expect(retryOnDeadlock(async () => { calls += 1; throw Object.assign(new Error(code), { code }); }, 4, 1)).rejects.toThrow(code);
      expect(calls).toBe(1);
    }
  });

  it("rejects malformed OData pages instead of treating them as an empty feed", () => {
    expect(() => parseODataPage({ error: { message: "quota" } })).toThrow();
    expect(() => parseODataPage(null)).toThrow();
    expect(parseODataPage({ value: [] }).value).toEqual([]);
  });
});

describe("private MLS media storage", () => {
  const railway = {
    MLS_MEDIA_BUCKET: "mls-media-abc123",
    MLS_MEDIA_ENDPOINT: "https://t3.storageapi.dev",
    MLS_MEDIA_REGION: "auto",
    MLS_MEDIA_ACCESS_KEY_ID: "test-key-id",
    MLS_MEDIA_SECRET_ACCESS_KEY: "test-secret",
  } as NodeJS.ProcessEnv;

  it("refuses the public SavvyOS bucket and incomplete endpoint credentials", () => {
    expect(privateMlsStorageError({} as NodeJS.ProcessEnv)).toMatch(/dedicated private bucket/);
    expect(privateMlsStorageError({ MLS_MEDIA_BUCKET: "savvyos" } as NodeJS.ProcessEnv)).toMatch(/public SavvyOS/);
    expect(privateMlsStorageError({ ...railway, MLS_MEDIA_SECRET_ACCESS_KEY: "" })).toMatch(/required/);
    expect(privateMlsStorageError(railway)).toBeNull();
  });

  it("signs short-lived virtual-hosted URLs against a Railway bucket", async () => {
    const config = mediaClientConfig(railway);
    expect(config).toMatchObject({ region: "auto", endpoint: "https://t3.storageapi.dev", forcePathStyle: false });
    const url = new URL(await getSignedUrl(new S3Client(config), new GetObjectCommand({ Bucket: "mls-media-abc123", Key: "mls/1/2/photo.jpg" }), { expiresIn: 60 }));
    expect(url.host).toBe("mls-media-abc123.t3.storageapi.dev");
    expect(url.pathname).toBe("/mls/1/2/photo.jpg");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
  });
});

describe("MLS schema status", () => {
  it("reports ok only when every table, permission column, and seeded source exists", () => {
    const now = new Date("2026-09-30T04:40:00Z");
    const full = summarize({ tables: 999, permissionColumns: 2, sources: 999 }, now);
    expect(full.status).toBe("ok");
    expect(full.tables.expected).toBeGreaterThan(10);
    expect(full.sources.expected).toBeGreaterThan(20);
    expect(summarize({ tables: 0, permissionColumns: 2, sources: 0 }, now).status).toBe("incomplete");
    expect(summarize({ tables: full.tables.expected, permissionColumns: 1, sources: full.sources.expected }, now).status).toBe("incomplete");
    expect(Object.keys(full).sort()).toEqual(["checkedAt", "permissionColumns", "sources", "status", "tables"]);
  });
});

describe("MLS Grid token budget", () => {
  const gridFeed = (options: Record<string, unknown> | null) => ({ ...feed, options }) as unknown as MlsFeed;
  // Leave room for the 1 ms spacing between requests in these tiny test budgets.
  const soon = () => Date.now() + 50;
  const tiny = (): ProviderLimits => ({
    requestsPerSecond: 1000,
    requestsPerHour: 4,
    requestsPerDay: 100,
    requestsPerFiveMinutes: null,
    mediaBytesPerHour: null,
    mediaRequestsPerHour: null,
    mediaConcurrency: 1,
    sequentialOnly: true,
    tokenBudget: { bytesPerHour: 1000, bytesPerDay: 5000, mediaShare: 0.5 },
  });

  it("stays under every MLS Grid warning and published limit, even if a feed asks for more", () => {
    const { warning, published } = MLS_GRID_LIMITS;
    for (const options of [null, { rateSafety: 10, mediaShare: 5, mediaConcurrency: 50 }, { rateSafety: "fast" }]) {
      const limits = mlsGridAdapter.limits(gridFeed(options));
      expect(limits.requestsPerSecond).toBeLessThan(Math.min(warning.requestsPerSecond, published.requestsPerSecond));
      expect(limits.requestsPerHour!).toBeLessThan(warning.requestsPerHour);
      expect(limits.requestsPerDay!).toBeLessThan(warning.requestsPerDay);
      expect(limits.tokenBudget!.bytesPerHour).toBeLessThan(Math.min(warning.bytesPerHour, published.bytesPerHour));
      expect(limits.tokenBudget!.bytesPerDay).toBeLessThan(warning.bytesPerDay);
      expect(limits.tokenBudget!.mediaShare).toBeLessThanOrEqual(0.9);
      // Photo transfers are outside the API quotas; only our own cap applies.
      expect(limits.mediaConcurrency).toBeLessThanOrEqual(MLS_GRID_MEDIA_CONCURRENCY.max);
    }
    const defaults = mlsGridAdapter.limits(gridFeed(null));
    expect([defaults.requestsPerHour, defaults.requestsPerDay]).toEqual([5760, 32000]);
    expect(defaults.temporary).toBeUndefined();
  });

  it("retains a shared token budget for providers that actually meter API and media together", async () => {
    const lane = new ProviderLane("trestle:T1", "trestle", "T1", tiny());
    await lane.media.acquire();
    await lane.media.acquire();
    expect(lane.media.nextWaitMs(soon())).toBeGreaterThan(0); // photos used their half
    expect(lane.api.nextWaitMs(soon())).toBe(0); // replication still has room
    await lane.api.acquire();
    await lane.api.acquire();
    expect(lane.api.nextWaitMs(soon())).toBeGreaterThan(30 * 60_000); // 2 photos + 2 pages = the token's 4/hour
  });

  it("retains the shared byte cap for providers that actually meter it", () => {
    const lane = new ProviderLane("trestle:T2", "trestle", "T2", tiny());
    lane.countApi(600);
    expect(lane.api.nextWaitMs(soon())).toBe(0);
    lane.countMedia(500);
    expect(lane.api.nextWaitMs(soon())).toBeGreaterThan(30 * 60_000);
    expect(lane.media.nextWaitMs(soon())).toBeGreaterThan(30 * 60_000);
  });

  it("does not charge MLS Grid photos to API request or byte quotas", async () => {
    const lane = new ProviderLane("mls_grid:MEDIAONLY", "mls_grid", "MEDIAONLY", tiny());
    await lane.media.acquire();
    lane.countMedia(2_000);
    expect(lane.api.nextWaitMs(soon())).toBe(0);
    expect(lane.api.snapshot().byteWindows[0].used).toBe(0);
    expect(lane.media.snapshot().windows).toEqual([]);
    lane.media.pause(15 * 60_000);
    expect(lane.api.snapshot().pausedForMs).toBe(0);
  });

  it("still pauses the API lane for a real api.mlsgrid.com 429", async () => {
    const lane = new ProviderLane("mls_grid:API429", "mls_grid", "API429", tiny());
    await expect(requestJson(lane, "https://api.mlsgrid.com/v2/Property", async () => ({}), {
      maxAttempts: 1, fetchImpl: async () => new Response(null, { status: 429 }),
    })).rejects.toMatchObject({ status: 429 });
    expect(lane.api.snapshot().pausedForMs).toBeGreaterThan(14 * 60_000);
  });

  it("treats only MLS Grid's provisioned CDN host as reusable, non-expiring links", () => {
    expect(isMlsGridCdnUrl("https://cdn-savvystr.mlsgrid.com/images/CAR1/a.jpeg")).toBe(true);
    expect(isMlsGridCdnUrl("https://media.mlsgrid.com/token=x&expires=1&id=y/images/CAR1/a.jpeg")).toBe(false);
    expect(isMlsGridCdnUrl("https://api.mlsgrid.com/v2/Media")).toBe(false);
    expect(isMlsGridCdnUrl("https://cdn-savvystr.mlsgrid.com.evil.test/a.jpeg")).toBe(false);
    expect(isMlsGridCdnUrl("http://cdn-savvystr.mlsgrid.com/a.jpeg")).toBe(false);
    expect(isMlsGridCdnUrl(null)).toBe(false);
    const now = new Date("2026-10-02T21:00:00Z");
    expect(mlsGridAdapter.mediaUrlExpiresAt("https://cdn-savvystr.mlsgrid.com/images/CAR1/a.jpeg", now)).toBeNull();
  });

  it("backs off a CDN 429 briefly on photos only, never the 15-minute token pause", async () => {
    const lane = new ProviderLane("mls_grid:CDN429", "mls_grid", "CDN429", tiny());
    await expect(downloadMedia(lane, "https://cdn-savvystr.mlsgrid.com/images/CAR1/a.jpeg", {}, {
      fetchImpl: async () => new Response(null, { status: 429 }),
    })).rejects.toMatchObject({ status: 429 });
    expect(lane.api.snapshot().pausedForMs).toBe(0);
    // Only the CDN pace backs off; old-host photos and the API keep moving.
    expect(lane.media.snapshot().pausedForMs).toBe(0);
    const paused = lane.cdn.snapshot().pausedForMs;
    expect(paused).toBeGreaterThan(0);
    expect(paused).toBeLessThanOrEqual(30_000);
  });

  it("paces MLS Grid CDN photos separately from old-host photos; other providers share one photo limiter", async () => {
    const grid = new ProviderLane("mls_grid:CDNPACE", "mls_grid", "CDNPACE", tiny());
    expect(grid.cdn).not.toBe(grid.media);
    const cdnAcquire = vi.spyOn(grid.cdn, "acquire");
    const mediaAcquire = vi.spyOn(grid.media, "acquire");
    const ok = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
    await downloadMedia(grid, "https://cdn-savvystr.mlsgrid.com/images/CAR1/a.jpeg", {}, { fetchImpl: ok });
    expect([cdnAcquire.mock.calls.length, mediaAcquire.mock.calls.length]).toEqual([1, 0]);
    await downloadMedia(grid, "https://media.mlsgrid.com/token=x&expires=1&id=y/images/CAR1/b.jpeg", {}, { fetchImpl: ok });
    expect([cdnAcquire.mock.calls.length, mediaAcquire.mock.calls.length]).toEqual([1, 1]);
    const other = new ProviderLane("trestle:CDNPACE", "trestle", "CDNPACE", tiny());
    expect(other.cdn).toBe(other.media);
  });

  it("has no CDN pace cap unless MLS_CDN_REQUESTS_PER_SECOND sets one", () => {
    expect(cdnIntervalMs(undefined)).toBe(0);
    expect(cdnIntervalMs("")).toBe(0);
    expect(cdnIntervalMs("0")).toBe(0);
    expect(cdnIntervalMs("not-a-number")).toBe(0);
    expect(cdnIntervalMs("50")).toBe(20);
  });

  it("runs the default MLS Grid photo transfers per token, honors overrides, and caps them", () => {
    const saved = process.env.MLS_GRID_MEDIA_CONCURRENCY;
    try {
      delete process.env.MLS_GRID_MEDIA_CONCURRENCY;
      expect(mlsGridAdapter.limits(gridFeed(null)).mediaConcurrency).toBe(MLS_GRID_MEDIA_CONCURRENCY.default);
      expect(mlsGridAdapter.limits(gridFeed({ mediaConcurrency: 4 })).mediaConcurrency).toBe(4);
      expect(mlsGridAdapter.limits(gridFeed({ mediaConcurrency: 500 })).mediaConcurrency).toBe(MLS_GRID_MEDIA_CONCURRENCY.max);
      expect(mlsGridAdapter.limits(gridFeed({ mediaConcurrency: "fast" })).mediaConcurrency).toBe(MLS_GRID_MEDIA_CONCURRENCY.default);
      process.env.MLS_GRID_MEDIA_CONCURRENCY = "24";
      expect(mlsGridAdapter.limits(gridFeed({ mediaConcurrency: 4 })).mediaConcurrency).toBe(24);
      // API pacing is untouched by the photo setting.
      expect(mlsGridAdapter.limits(gridFeed(null)).requestsPerSecond).toBeLessThan(MLS_GRID_LIMITS.published.requestsPerSecond);
    } finally {
      if (saved === undefined) delete process.env.MLS_GRID_MEDIA_CONCURRENCY;
      else process.env.MLS_GRID_MEDIA_CONCURRENCY = saved;
    }
  });

  it("honors usage recorded before a restart, and lets day-old usage age out", () => {
    const recent = new ProviderLane("mls_grid:T3", "mls_grid", "T3", tiny());
    recent.api.seed(Date.now() - 10 * 60_000, 4, 0);
    expect(recent.api.nextWaitMs(soon())).toBeGreaterThan(40 * 60_000);
    const old = new ProviderLane("mls_grid:T4", "mls_grid", "T4", tiny());
    old.api.seed(Date.now() - 25 * 3_600_000, 1000, 100_000);
    expect(old.api.nextWaitMs(soon())).toBe(0);
  });

  it("meters bytes on the wire, not decoded characters", () => {
    expect(wireBytes({ headers: new Headers({ "content-length": "1234" }) }, "x".repeat(9999))).toBe(1234);
    expect(wireBytes({ headers: new Headers() }, "h\u00e9llo")).toBe(6);
  });

  it("keeps separate media metering for providers that meter it separately", () => {
    expect(trestleAdapter.limits({ ...feed, provider: "trestle" } as unknown as MlsFeed).tokenBudget ?? null).toBeNull();
  });
});

describe("expired-link refresh scan bounds", () => {
  it("recognizes MAX_EXECUTION_TIME interruptions through driver wrappers only", () => {
    expect(isQueryTimeout({ message: "Failed query", cause: { errno: 3024, code: "ER_QUERY_TIMEOUT" } })).toBe(true);
    expect(isQueryTimeout({ code: "ER_QUERY_TIMEOUT" })).toBe(true);
    expect(isQueryTimeout({ cause: { errno: 1213, code: "ER_LOCK_DEADLOCK" } })).toBe(false);
    expect(isQueryTimeout(new Error("boom"))).toBe(false);
  });

  it("keeps every refresh stage inside its media priority band", () => {
    // store.ts mediaPriority: Active cover 1, coming soon 10, under contract 20,
    // pending 30, other covers 40, non-primary 50/100.
    expect(REFRESH_STAGE_MAX_PRIORITY).toEqual({ active: 10, market: 30 });
  });
});
