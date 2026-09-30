import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { MlsFeed, MlsSource } from "../../drizzle/mlsSchema";
import { mlsGridAdapter } from "./adapters/mlsGrid";
import { sparkAdapter } from "./adapters/spark";
import { keysetFilter, trestleAdapter } from "./adapters/trestle";
import { buildComplianceProfile, feedFreshness, fillComplianceTemplate } from "./compliance";
import { credentialStatus } from "./credentials";
import { normalizePropertyType, normalizeStatus } from "./normalize/enums";
import { normalizeListing } from "./normalize/normalizeListing";
import { propertyIdentity } from "./normalize/propertyIdentity";
import { searchConditions } from "./search";
import { licenseError } from "./license";
import { mediaClientConfig, privateMlsStorageError } from "./privateMedia";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseODataPage } from "./adapters/types";
import { __testables__ as mcpTestables } from "../readOnlyMcp";
import { MLS_SOURCE_SEEDS, seedCompliance } from "./sources";
import { mediaWanted, payloadHash } from "./store";

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

  it("MLS Grid media URLs expire within the hour", () => {
    const received = new Date("2026-09-29T12:00:00Z");
    const expires = mlsGridAdapter.mediaUrlExpiresAt("https://media.mlsgrid.com/a.jpg", received)!;
    expect(expires.getTime() - received.getTime()).toBeLessThanOrEqual(60 * 60_000);
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
  });

  it("keeps MLS tables out of the general read-only MCP endpoint", () => {
    expect(() => mcpTestables.validateReadOnlySql("SELECT id FROM mls_listings LIMIT 5")).toThrow(/isolated/);
    expect(() => mcpTestables.validateReadOnlySql("SELECT id FROM contacts WHERE id IN (SELECT id FROM MLS_MEDIA) LIMIT 5")).toThrow(/isolated/);
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
