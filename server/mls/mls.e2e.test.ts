/**
 * End-to-end ingestion test: real MySQL, a mock MLS Grid v2 server, the real
 * engine, store, media pipeline and search. Opt in with a scratch database:
 *
 *   MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e pnpm vitest run server/mls/mls.e2e.test.ts
 *
 * The database named in the URL is dropped and recreated.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.MLS_E2E_DATABASE_URL;
const TOKEN = "e2e-token-123";

type Record_ = Record<string, any>;

function listing(key: string, overrides: Record_ = {}): Record_ {
  return {
    ListingKey: `CAR${key}`,
    ListingId: `CAR${key}`,
    OriginatingSystemName: "carolina",
    MlgCanView: true,
    MlgCanUse: ["IDX"],
    StandardStatus: "Active",
    PropertyType: "Residential",
    ListPrice: 500000,
    BedroomsTotal: 3,
    BathroomsFull: 2,
    LivingArea: 1800,
    StreetNumber: "10",
    StreetName: "Main",
    StreetSuffix: "St",
    City: "Asheville",
    StateOrProvince: "NC",
    PostalCode: "28801",
    Latitude: 35.59,
    Longitude: -82.55,
    ListAgentKey: "CARm1",
    ListOfficeKey: "CARo1",
    ListOfficeName: "Savvy STR Agents",
    CAR_ShortTermRentalYN: true,
    PrivateRemarks: "Lockbox 1234",
    Media: [
      { MediaKey: `CAR${key}-1`, Order: 1, MediaCategory: "Photo", MediaURL: "" },
      { MediaKey: `CAR${key}-2`, Order: 2, MediaCategory: "Photo", MediaURL: "" },
    ],
    ...overrides,
  };
}

const state = {
  properties: [] as Record_[],
  members: [{ MemberKey: "CARm1", MemberMlsId: "CARm1", MemberFullName: "Tyler Test", MemberEmail: "t@example.com", OriginatingSystemName: "carolina", MlgCanView: true, ModificationTimestamp: "2026-09-20T00:00:00.000Z" }],
  offices: [{ OfficeKey: "CARo1", OfficeMlsId: "CARo1", OfficeName: "Savvy STR Agents", OriginatingSystemName: "carolina", MlgCanView: true, ModificationTimestamp: "2026-09-20T00:00:00.000Z" }],
  requests: [] as string[],
  mediaUserAgents: [] as string[],
};

let server: Server;
let base = "";

function withMediaUrls(record: Record_) {
  return {
    ...record,
    Media: (record.Media ?? []).map((item: Record_) => ({ ...item, MediaURL: `${base}/media/${item.MediaKey}.jpg?sig=${Math.random()}` })),
  };
}

function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", base);
  state.requests.push(`${url.pathname}?${Array.from(url.searchParams.entries()).map(([key, value]) => `${key}=${value}`).join("&")}`);
  if (url.pathname.startsWith("/media/")) {
    state.mediaUserAgents.push(String(req.headers["user-agent"] ?? ""));
    res.writeHead(200, { "Content-Type": "image/jpeg" });
    res.end(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]));
    return;
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.writeHead(401).end("unauthorized");
    return;
  }
  if (url.pathname === "/v2/$metadata") {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(`<?xml version="1.0"?><edmx:Edmx><edmx:DataServices><Schema><EntityType Name="Property"><Property Name="ListingKey" Type="Edm.String"/><Property Name="ListPrice" Type="Edm.Decimal"/><Property Name="CAR_ShortTermRentalYN" Type="Edm.Boolean"/><Property Name="CAR_ZoningDescription" Type="Edm.String"/></EntityType></Schema></edmx:DataServices></edmx:Edmx>`);
    return;
  }
  const resource = url.pathname.replace("/v2/", "");
  const filter = url.searchParams.get("$filter") ?? "";
  const top = Number(url.searchParams.get("$top") ?? "1000");
  const skip = Number(url.searchParams.get("skip") ?? "0");
  const source =
    resource === "Property" ? state.properties : resource === "Member" ? state.members : resource === "Office" ? state.offices : [];
  let rows = [...source];
  if (!filter.includes("OriginatingSystemName eq 'carolina'")) {
    res.writeHead(400).end("OriginatingSystemName filter required");
    return;
  }
  if (filter.includes("MlgCanView eq true")) rows = rows.filter(row => row.MlgCanView !== false);
  const statuses = filter.match(/StandardStatus in \(([^)]+)\)/)?.[1]?.match(/'[^']+'/g)?.map(item => item.slice(1, -1));
  if (statuses) rows = rows.filter(row => statuses.includes(row.StandardStatus));
  const ids = filter.match(/ListingId in \(([^)]+)\)/)?.[1]?.match(/'[^']+'/g)?.map(item => item.slice(1, -1));
  if (ids) rows = rows.filter(row => ids.includes(row.ListingId));
  const gt = filter.match(/ModificationTimestamp gt ([0-9T:.\-Z]+)/)?.[1];
  if (gt) rows = rows.filter(row => row.ModificationTimestamp > gt);
  rows.sort((a, b) => String(a.ModificationTimestamp).localeCompare(String(b.ModificationTimestamp)));
  const pageRows = rows.slice(skip, skip + top).map(row => {
    if (resource !== "Property") return row;
    return (url.searchParams.get("$expand") ?? "").split(",").includes("Media")
      ? withMediaUrls(row)
      : (({ Media: _media, ...withoutMedia }) => withoutMedia)(row);
  });
  const nextUrl = new URL(url.toString());
  nextUrl.searchParams.set("skip", String(skip + top));
  const body: Record_ = { "@odata.context": `${base}/v2/$metadata#${resource}`, value: pageRows };
  if (skip + top < rows.length) body["@odata.nextLink"] = nextUrl.toString();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

describe.skipIf(!DATABASE_URL)("MLS ingestion end to end", () => {
  let modules: {
    engine: typeof import("./engine");
    media: typeof import("./media");
    search: typeof import("./search");
    schema: typeof import("./schema");
    http: typeof import("./http");
    adapters: typeof import("./adapters");
    db: typeof import("../db");
  };
  let admin: mysql.Connection;
  let feedId = 0;
  const stored = new Map<string, Buffer>();

  const q = async <T = any>(sqlText: string, params: unknown[] = []) => {
    const [rows] = await admin.query(sqlText, params);
    return rows as T[];
  };

  beforeAll(async () => {
    server = createServer(handler);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const url = new URL(DATABASE_URL!);
    const dbName = url.pathname.replace(/^\//, "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^savvyos_mls_e2e(?:_[a-z0-9]+)?$/.test(dbName)) {
      throw new Error("E2E reset is restricted to localhost databases named savvyos_mls_e2e[_suffix]");
    }
    const root = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
    await root.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await root.query(`CREATE DATABASE \`${dbName}\``);
    await root.end();

    admin = await mysql.createConnection(DATABASE_URL!);
    await admin.query("CREATE TABLE admin_permissions (id int AUTO_INCREMENT PRIMARY KEY)");

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.MLS_CRED_E2EGRID_TOKEN = TOKEN;
    modules = {
      engine: await import("./engine"),
      media: await import("./media"),
      search: await import("./search"),
      schema: await import("./schema"),
      http: await import("./http"),
      adapters: await import("./adapters"),
      db: await import("../db"),
    };
    await modules.schema.applyMlsSchema(admin as any);
    // Idempotent: a second pass changes nothing.
    await modules.schema.applyMlsSchema(admin as any);

    modules.media.setMediaStorage({
      async put(key, data) {
        stored.set(key, data);
        return { url: `https://cdn.test/${key}` };
      },
      async remove(key) {
        stored.delete(key);
      },
    });

    const [canopy] = await q("SELECT id FROM mls_sources WHERE code = 'canopy'");
    await q(
      `INSERT INTO mls_feeds (sourceId, name, provider, feedType, baseUrl, originatingSystemName, keyPrefix, credentialRef, resources, options, enabled, mediaPolicy, retentionPolicy)
       VALUES (?, 'Canopy via MLS Grid', 'mls_grid', 'idx', ?, 'carolina', 'CAR', 'E2EGRID', ?, ?, true, 'all', 'purge')`,
      [canopy.id, `${base}/v2`, JSON.stringify(["Property", "Member", "Office"]), JSON.stringify({ pageSize: 2, rateSafety: 10, license: { approved: true, internalUse: true, reference: "SYNTHETIC TEST FIXTURE ONLY" } })]
    );
    const [feed] = await q("SELECT id FROM mls_feeds LIMIT 1");
    feedId = feed.id;

    state.properties = [
      listing("100", { ModificationTimestamp: "2026-09-25T10:00:00.000Z" }),
      // Same address as 100, listed again later: one property, two listings.
      listing("101", { ModificationTimestamp: "2026-09-25T11:00:00.000Z", StandardStatus: "Closed", ClosePrice: 480000, CloseDate: "2025-06-01" }),
      listing("200", { ModificationTimestamp: "2026-09-25T12:00:00.000Z", StreetNumber: "22", StreetName: "Oak", ListPrice: 850000, Latitude: 35.61, Longitude: -82.52 }),
      listing("300", { ModificationTimestamp: "2026-09-25T13:00:00.000Z", MlgCanView: false, StreetNumber: "33" }),
    ];
  }, 60_000);

  afterAll(async () => {
    await admin?.end().catch(() => undefined);
    const pool = (modules?.db as any)?._pool;
    await pool?.end?.().catch?.(() => undefined);
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
  });

  it("seeds the source registry once", async () => {
    const [{ count }] = await q("SELECT COUNT(*) AS count FROM mls_sources");
    expect(Number(count)).toBeGreaterThanOrEqual(20);
    const columns = await q("SHOW COLUMNS FROM admin_permissions LIKE 'canViewMlsProperties'");
    expect(columns.length).toBe(1);
  });

  it("imports listings, members, offices and metadata on the first cycle", async () => {
    const summary = await modules.engine.runFeedCycle(feedId, { workerId: "e2e" });
    expect(summary.error).toBeUndefined();
    expect(summary.ok).toBe(true);

    const listings = await q("SELECT * FROM mls_listings ORDER BY listingNumber");
    expect(listings.map(row => row.listingNumber)).toEqual(["100", "101", "200"]);
    const [first] = listings;
    expect(first.standardStatus).toBe("active");
    expect(first.listingKey).toBe("100");
    expect(first.providerListingKey).toBe("CAR100");
    const localFields = typeof first.localFields === "string" ? JSON.parse(first.localFields) : first.localFields;
    expect(localFields).toMatchObject({ CAR_ShortTermRentalYN: true });
    expect(JSON.stringify(localFields)).not.toContain("Lockbox");

    const properties = await q("SELECT * FROM mls_properties");
    expect(properties.length).toBe(2);
    const mainSt = listings.filter(row => row.listingNumber === "100" || row.listingNumber === "101");
    expect(new Set(mainSt.map(row => row.propertyId)).size).toBe(1);

    const members = await q("SELECT * FROM mls_members");
    // Provider keys are the join keys: listing.listAgentKey -> mls_members.memberKey.
    expect(members[0]).toMatchObject({ memberKey: first.listAgentKey, fullName: "Tyler Test" });
    const offices = await q("SELECT * FROM mls_offices");
    expect(offices.length).toBe(1);

    const raw = await q("SELECT COUNT(*) AS count FROM mls_raw_records WHERE resource = 'Property'");
    expect(Number(raw[0].count)).toBe(3);
    const snapshot = await q("SELECT * FROM mls_metadata_snapshots WHERE resource = 'Property'");
    expect(snapshot[0].localFieldCount).toBe(2);

    const cursors = await q("SELECT * FROM mls_sync_cursors WHERE resource = 'Property'");
    expect(cursors[0].phase).toBe("incremental");
    expect(cursors[0].highWaterMark).toBe("2026-09-25T12:00:00.000Z");

    const history = await q("SELECT eventType FROM mls_listing_history");
    expect(history.length).toBeGreaterThanOrEqual(3);

    // Every data request filtered one originating system; initial pass hid non-viewable rows.
    const dataRequests = state.requests.filter(line => line.startsWith("/v2/Property"));
    expect(dataRequests.every(line => line.includes("OriginatingSystemName eq 'carolina'"))).toBe(true);
    expect(dataRequests[0]).toContain("MlgCanView eq true");
    expect(dataRequests.length).toBe(2); // pageSize 2, 3 viewable rows
  }, 60_000);

  it("downloads photos into our storage with the token as User-Agent", async () => {
    const pending = await q("SELECT COUNT(*) AS count FROM mls_media WHERE status = 'pending'");
    expect(Number(pending[0].count)).toBe(6);
    const { feed } = (await modules.engine.loadFeedContext(feedId))!;
    const adapter = modules.adapters.adapterFor("mls_grid");
    const lane = modules.http.getLane("mls_grid", feed.credentialRef, adapter.limits(feed));
    const ctx = (await modules.engine.loadFeedContext(feedId))!;
    const first = await modules.media.runMediaBatch(lane, [ctx], "e2e", { batchSize: 50 });
    expect(first.stored).toBe(2);
    const firstPhotos = await q<any>("SELECT resourceKey, isPrimary FROM mls_media WHERE status = 'stored'");
    expect(firstPhotos.every(row => !!row.isPrimary && ["CAR100", "CAR200"].includes(row.resourceKey))).toBe(true);
    const remaining = await modules.media.runMediaBatch(lane, [ctx], "e2e", { batchSize: 50 });
    expect(remaining.stored).toBe(4);
    expect(stored.size).toBe(6);
    expect(state.mediaUserAgents.every(agent => agent === TOKEN)).toBe(true);
    const media = await q("SELECT status, sourceUrl, url FROM mls_media");
    expect(media.every(row => row.status === "stored" && row.sourceUrl === null && row.url?.startsWith("https://cdn.test/"))).toBe(true);
    const [listing100] = await q("SELECT primaryPhotoUrl FROM mls_listings WHERE listingNumber = '100'");
    expect(listing100.primaryPhotoUrl).toMatch(/^https:\/\/cdn\.test\//);
  }, 60_000);

  it("records price changes and deletes listings that lose display rights", async () => {
    state.properties = state.properties.map(row => {
      if (row.ListingKey === "CAR100") return { ...row, ListPrice: 475000, ModificationTimestamp: "2026-09-26T09:00:00.000Z" };
      if (row.ListingKey === "CAR200") return { ...row, MlgCanView: false, ModificationTimestamp: "2026-09-26T10:00:00.000Z" };
      return row;
    });
    state.requests = [];
    const summary = await modules.engine.runFeedCycle(feedId, { workerId: "e2e" });
    expect(summary.ok).toBe(true);

    const incremental = state.requests.filter(line => line.startsWith("/v2/Property"));
    expect(incremental[0]).toContain("ModificationTimestamp gt 2026-09-25T12:00:00.000Z");
    expect(incremental[0]).not.toContain("MlgCanView eq true");

    const [listing100] = await q("SELECT id, listPrice, previousListPrice FROM mls_listings WHERE listingNumber = '100'");
    expect(Number(listing100.listPrice)).toBe(475000);
    const priceEvents = await q("SELECT * FROM mls_listing_history WHERE listingId = ? AND eventType = 'price_change'", [listing100.id]);
    expect(priceEvents.length).toBe(1);
    expect(Number(priceEvents[0].fromPrice)).toBe(500000);

    const gone = await q("SELECT * FROM mls_listings WHERE listingNumber = '200'");
    expect(gone.length).toBe(0);
    const raw200 = await q("SELECT * FROM mls_raw_records WHERE providerKey = 'CAR200'");
    expect(raw200.length).toBe(0);
    const properties = await q("SELECT * FROM mls_properties");
    expect(properties.length).toBe(1);

    const deletePending = await q("SELECT COUNT(*) AS count FROM mls_media WHERE status = 'delete_pending'");
    expect(Number(deletePending[0].count)).toBe(2);
    const ctx = (await modules.engine.loadFeedContext(feedId))!;
    const adapter = modules.adapters.adapterFor("mls_grid");
    const lane = modules.http.getLane("mls_grid", ctx.feed.credentialRef, adapter.limits(ctx.feed));
    const result = await modules.media.runMediaBatch(lane, [ctx], "e2e", { batchSize: 50 });
    expect(result.deleted).toBe(2);
    expect(stored.size).toBe(4);
  }, 60_000);

  it("skips unchanged records on a repeat pull", async () => {
    await admin.query("UPDATE mls_sync_cursors SET highWaterMark = '2026-09-01T00:00:00.000Z' WHERE resource = 'Property'");
    const summary = await modules.engine.runFeedCycle(feedId, { workerId: "e2e" });
    expect(summary.ok).toBe(true);
    expect(summary.resources.Property.unchanged).toBeGreaterThanOrEqual(2);
    expect(summary.resources.Property.upserted).toBe(0);
  }, 60_000);

  it("serves search and map queries from the canonical tables", async () => {
    const db = (await modules.db.getDb())!;
    const all = await modules.search.searchListings(db as any, { filters: {}, sort: "price_desc", page: 1, pageSize: 10 });
    expect(all.total).toBe(2);
    const firstFast = await modules.search.searchListings(db as any, { filters: {}, sort: "updated", page: 1, pageSize: 1, countMode: "none" });
    expect(firstFast.total).toBeNull();
    expect(firstFast.items).toHaveLength(1);
    expect(firstFast.hasMore).toBe(true);
    const lastFast = await modules.search.searchListings(db as any, { filters: {}, sort: "updated", page: 2, pageSize: 1, countMode: "none" });
    expect(lastFast.total).toBeNull();
    expect(lastFast.items).toHaveLength(1);
    expect(lastFast.hasMore).toBe(false);
    const active = await modules.search.searchListings(db as any, { filters: { statuses: ["active"] }, sort: "newest", page: 1, pageSize: 10 });
    expect(active.items.map(item => item.listingNumber)).toEqual(["100"]);
    expect(active.items[0].sourceShortName).toBe("Canopy");
    const firstActive = await modules.search.searchListings(db as any, { filters: { statuses: ["active"] }, sort: "updated", page: 1, pageSize: 12, countMode: "none" });
    expect(firstActive.items.map(item => item.listingNumber)).toEqual(["100"]);
    expect(firstActive.total).toBeNull();
    const byZip = await modules.search.searchListings(db as any, { filters: { q: "28801" }, sort: "newest", page: 1, pageSize: 10 });
    expect(byZip.total).toBe(2);
    const pins = await modules.search.mapPoints(db as any, { filters: {}, bounds: { north: 36, south: 35, east: -82, west: -83 }, zoom: 12 });
    expect(pins.mode).toBe("pins");
    expect(pins.pins.length).toBe(2);
    const clusters = await modules.search.mapPoints(db as any, { filters: {}, bounds: { north: 36, south: 35, east: -82, west: -83 }, zoom: 8, pinLimit: 1 });
    expect(clusters.mode).toBe("clusters");
    expect(clusters.total).toBe(2);
    expect(clusters.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(2);
  }, 60_000);

  it("names the listing brokerage from the office roster when older history omits it", async () => {
    const db = (await modules.db.getDb())!;
    const pool = mysql.createPool(DATABASE_URL!);
    const [[original]]: any = await pool.query("SELECT listOfficeName, listOfficeKey, listOfficeMlsId FROM mls_listings WHERE listingNumber = '100'");
    try {
      const [[office]]: any = await pool.query("SELECT officeMlsId, officeName FROM mls_offices LIMIT 1");
      expect(office.officeName).toBe("Savvy STR Agents");
      await pool.query("UPDATE mls_listings SET listOfficeName = NULL, listOfficeKey = NULL, listOfficeMlsId = ? WHERE listingNumber = '100'", [office.officeMlsId]);
      const result = await modules.search.searchListings(db as any, { filters: { statuses: ["active"] }, sort: "newest", page: 1, pageSize: 10 });
      expect(result.items[0].listOfficeName).toBe("Savvy STR Agents");
      await pool.query("UPDATE mls_listings SET listOfficeMlsId = 'NO_SUCH_OFFICE' WHERE listingNumber = '100'");
      const missing = await modules.search.searchListings(db as any, { filters: { statuses: ["active"] }, sort: "newest", page: 1, pageSize: 10 });
      expect(missing.items[0].listOfficeName).toBeNull();
    } finally {
      await pool.query("UPDATE mls_listings SET listOfficeName = ?, listOfficeKey = ?, listOfficeMlsId = ? WHERE listingNumber = '100'", [original.listOfficeName, original.listOfficeKey, original.listOfficeMlsId]);
      await pool.end();
    }
  }, 60_000);

  it("hides every listing once a feed license expires or is removed", async () => {
    const db = (await modules.db.getDb())!;
    const pool = mysql.createPool(DATABASE_URL!);
    try {
      const [[feed]] = (await pool.query("SELECT id, options FROM mls_feeds LIMIT 1")) as any;
      const original = typeof feed.options === "string" ? feed.options : JSON.stringify(feed.options);
      const options = JSON.parse(original);
      await pool.query("UPDATE mls_feeds SET options = ? WHERE id = ?", [JSON.stringify({ ...options, license: { ...options.license, expiresAt: "2020-01-01" } }), feed.id]);
      const expired = await modules.search.searchListings(db as any, { filters: {}, sort: "newest", page: 1, pageSize: 10 });
      expect(expired.total).toBe(0);
      await pool.query("UPDATE mls_feeds SET options = JSON_REMOVE(options, '$.license') WHERE id = ?", [feed.id]);
      const unlicensed = await modules.search.mapPoints(db as any, { filters: {}, bounds: { north: 36, south: 35, east: -82, west: -83 }, zoom: 12 });
      expect(unlicensed.total).toBe(0);
      await pool.query("UPDATE mls_feeds SET options = ? WHERE id = ?", [original, feed.id]);
      const restored = await modules.search.searchListings(db as any, { filters: {}, sort: "newest", page: 1, pageSize: 10 });
      expect(restored.total).toBe(2);
    } finally {
      await pool.end();
    }
  }, 60_000);
  it("loads the last day's recorded usage, so a restart cannot reset MLS Grid budgets", async () => {
    const hour = new Date();
    hour.setUTCMinutes(0, 0, 0);
    // Production writes this column through Drizzle as UTC; match it.
    const windowStart = hour.toISOString().slice(0, 19).replace("T", " ");
    await q(
      `INSERT INTO mls_provider_usage (credentialRef, provider, windowStart, requests, bytes, mediaRequests, mediaBytes, throttled)
       VALUES ('RESTARTTEST', 'mls_grid', ?, 24000, 1000, 22000, 2000000000, 0)`,
      [windowStart]
    );
    const limits = modules.adapters.adapterFor("mls_grid").limits({ options: null } as any);
    const lane = modules.http.getLane("mls_grid", "RESTARTTEST", limits);
    await lane.ready();
    // 46,000 requests this hour exceed the temporary 40,000 cap. A restart
    // cannot reset either data or photo usage.
    expect(lane.api.nextWaitMs()).toBeGreaterThan(0);
    expect(lane.media.nextWaitMs()).toBeGreaterThan(0);
    const untouched = modules.http.getLane("mls_grid", "OTHERTOKEN", limits);
    await untouched.ready();
    expect(untouched.api.nextWaitMs()).toBe(0);
    // The same MARIS-like burst fits the increased temporary photo share.
    for (const [hoursAgo, mediaRequests] of [[2, 5319], [3, 18514], [4, 8794], [5, 4843]]) {
      await q(
        `INSERT INTO mls_provider_usage (credentialRef, provider, windowStart, requests, bytes, mediaRequests, mediaBytes, throttled)
         VALUES ('MARISBURST', 'mls_grid', ?, 0, 0, ?, 200000000, 0)`,
        [new Date(hour.getTime() - hoursAgo * 3_600_000).toISOString().slice(0, 19).replace("T", " "), mediaRequests]
      );
    }
    const maris = modules.http.getLane("mls_grid", "MARISBURST", limits);
    await maris.ready();
    expect(maris.api.nextWaitMs()).toBe(0);
    expect(maris.media.nextWaitMs()).toBe(0);
  }, 60_000);

  it("prefills the market, checks live changes, loads history without Media, and refreshes galleries in a batch", async () => {
    const original = state.properties;
    try {
      state.properties = [
        listing("fast1", { ModificationTimestamp: "2026-09-25T10:00:00.000Z", StandardStatus: "Active Under Contract" }),
        listing("fast2", { ModificationTimestamp: "2026-09-25T11:00:00.000Z", StandardStatus: "Closed" }),
        listing("fast3", { ModificationTimestamp: "2026-09-25T12:00:00.000Z", StandardStatus: "Active", StreetNumber: "31" }),
      ];
      const [source] = await q("SELECT id FROM mls_sources WHERE code = 'canopy'");
      await admin.query(
        `INSERT INTO mls_feeds (sourceId, name, provider, feedType, baseUrl, originatingSystemName, keyPrefix, credentialRef, resources, options, enabled, mediaPolicy, syncIntervalMinutes, retentionPolicy)
         VALUES (?, 'Fast test', 'mls_grid', 'bbo', ?, 'carolina', 'CAR', 'E2EGRID', ?, ?, true, 'primary_only', 5, 'purge')`,
        [source.id, `${base}/v2`, JSON.stringify(["Property"]), JSON.stringify({ fastImportV1: true, license: { approved: true, internalUse: true, reference: "SYNTHETIC TEST FIXTURE ONLY" } })]
      );
      const [fast] = await q("SELECT id FROM mls_feeds WHERE name='Fast test'");
      const before = state.requests.length;
      const first = await modules.engine.runFeedCycle(fast.id, { workerId: "fast-e2e" });
      expect(first.ok).toBe(true);
      expect(first.resources["Priority:Property"].received).toBe(2);
      expect(first.resources["Property"].received).toBe(3);
      const propertyRequests = state.requests.slice(before).filter(request => request.startsWith("/v2/Property?"));
      expect(propertyRequests.some(request => request.includes("StandardStatus in ("))).toBe(true);
      expect(propertyRequests.some(request => request.includes("MlgCanView eq true") && request.includes("$expand=Rooms,UnitTypes") && !request.includes("Media"))).toBe(true);
      const media = await q<any>("SELECT resourceKey, status, isPrimary FROM mls_media WHERE feedId=?", [fast.id]);
      expect(media.length).toBe(2);
      expect(media.every(row => !!row.isPrimary && row.status === "pending")).toBe(true);
      const priorities = await q<any>("SELECT resourceKey, priority FROM mls_media WHERE feedId=?", [fast.id]);
      expect(Object.fromEntries(priorities.map(row => [row.resourceKey, row.priority]))).toEqual({ CARfast1: 20, CARfast3: 1 });
      // Simulate rows queued by the old build: identical priority, older
      // under-contract ID. The worker must still claim Active first.
      await admin.query("UPDATE mls_media SET priority=10 WHERE feedId=?", [fast.id]);
      const coverLane = modules.http.getLane("mls_grid", "E2EGRID", modules.adapters.adapterFor("mls_grid").limits({ options: null } as any));
      const coverCtx = (await modules.engine.loadFeedContext(fast.id))!;
      const beforeCover = state.requests.length;
      const cover = await modules.media.runMediaBatch(coverLane, [coverCtx], "fast-cover-e2e", { batchSize: 1 });
      expect(cover.stored).toBe(1);
      expect(state.requests.slice(beforeCover).some(request => request.includes("ListingId in ("))).toBe(false);
      const [activeCover] = await q<any>("SELECT status FROM mls_media WHERE feedId=? AND resourceKey='CARfast3'", [fast.id]);
      const [underContractCover] = await q<any>("SELECT status FROM mls_media WHERE feedId=? AND resourceKey='CARfast1'", [fast.id]);
      expect([activeCover.status, underContractCover.status]).toEqual(["stored", "pending"]);
      await admin.query("UPDATE mls_media SET status='expired', sourceUrl=NULL WHERE feedId=? AND resourceKey='CARfast3'", [fast.id]);
      const beforeExpiredActive = state.requests.length;
      const expiredActive = await modules.media.runMediaBatch(coverLane, [coverCtx], "fast-cover-e2e", { batchSize: 1 });
      expect([expiredActive.refreshed, expiredActive.stored]).toEqual([1, 1]);
      expect(state.requests.slice(beforeExpiredActive).some(request => request.includes("ListingId in ("))).toBe(true);
      const [stillWaiting] = await q<any>("SELECT status FROM mls_media WHERE feedId=? AND resourceKey='CARfast1'", [fast.id]);
      expect(stillWaiting.status).toBe("pending");
      const [cursor] = await q<any>("SELECT phase, highWaterMark FROM mls_sync_cursors WHERE feedId=? AND resource='Property'", [fast.id]);
      expect(cursor.phase).toBe("incremental");
      expect(new Date(cursor.highWaterMark).getTime()).toBeGreaterThan(Date.parse("2026-09-25"));

      state.properties[0] = { ...state.properties[0], StandardStatus: "Pending", ListPrice: 490000, ModificationTimestamp: new Date(Date.now() + 1000).toISOString() };
      const changed = await modules.engine.runFeedCycle(fast.id, { workerId: "fast-e2e" });
      expect(changed.ok).toBe(true);
      const [updated] = await q<any>("SELECT standardStatus, listPrice FROM mls_listings WHERE feedId=? AND providerListingKey='CARfast1'", [fast.id]);
      expect(updated.standardStatus).toBe("pending");
      expect(Number(updated.listPrice)).toBe(490000);

      const latest = state.properties[0];
      state.properties[0] = { ...latest, StandardStatus: "Active", ListPrice: 500000, ModificationTimestamp: "2026-09-25T10:00:00.000Z" };
      await admin.query("UPDATE mls_sync_cursors SET phase='initial', highWaterMark=NULL, resumeToken=NULL WHERE feedId=? AND resource='Property'", [fast.id]);
      expect((await modules.engine.runFeedCycle(fast.id, { workerId: "fast-e2e" })).ok).toBe(true);
      const [stillPending] = await q<any>("SELECT standardStatus, listPrice FROM mls_listings WHERE feedId=? AND providerListingKey='CARfast1'", [fast.id]);
      expect([stillPending.standardStatus, Number(stillPending.listPrice)]).toEqual(["pending", 490000]);
      state.properties[0] = latest;

      // Active and under-contract links are refreshed in separate batches so
      // Active never waits behind the older record, even in refresh-only mode.
      await admin.query("UPDATE mls_media SET status='expired', sourceUrl=NULL, attempts=0 WHERE feedId=?", [fast.id]);
      const lane = modules.http.getLane("mls_grid", "E2EGRID", modules.adapters.adapterFor("mls_grid").limits({ options: null } as any));
      const ctx = (await modules.engine.loadFeedContext(fast.id))!;
      const refreshStart = state.requests.length;
      const batch = await modules.media.runMediaBatch(lane, [ctx], "fast-e2e", { batchSize: 0 });
      expect(batch.refreshed).toBe(2);
      expect(state.requests.slice(refreshStart).filter(request => request.includes("ListingId in ("))).toHaveLength(2);

      const [market] = await q<any>("SELECT id, providerListingKey FROM mls_listings WHERE feedId=? AND providerListingKey='CARfast1'", [fast.id]);
      await admin.query("INSERT INTO mls_media (feedId, listingId, resourceKey, mediaKey, status, priority) VALUES (?, ?, ?, '__gallery_request__', 'expired', 0)", [fast.id, market.id, market.providerListingKey]);
      const gallery = await modules.media.runMediaBatch(lane, [ctx], "fast-e2e", { batchSize: 0 });
      expect(gallery.refreshed).toBe(1);
      const images = await q<any>("SELECT status, priority FROM mls_media WHERE feedId=? AND resourceKey=? AND mediaKey<>'__gallery_request__'", [fast.id, market.providerListingKey]);
      expect(images.length).toBe(2);
      expect(images.every(image => image.priority === 0)).toBe(true);
    } finally {
      state.properties = original;
    }
  }, 90_000);

  it("backfills complete Active galleries with distinct markers and batched MLS Grid refreshes", async () => {
    const original = state.properties;
    try {
      state.properties = ["gallery1", "gallery2"].map((key, index) => listing(key, {
        ModificationTimestamp: `2026-09-25T1${index}:00:00.000Z`,
        StreetNumber: String(80 + index), PhotosCount: 3,
        Media: [1, 2, 3].map(order => ({ MediaKey: `CAR${key}-${order}`, Order: order, MediaCategory: "Photo", MediaURL: "" })),
      }));
      const [source] = await q("SELECT id FROM mls_sources WHERE code='canopy'");
      await admin.query(
        `INSERT INTO mls_feeds (sourceId, name, provider, feedType, baseUrl, originatingSystemName, keyPrefix, credentialRef, resources, options, enabled, mediaPolicy, syncIntervalMinutes, retentionPolicy)
         VALUES (?, 'Active gallery test', 'mls_grid', 'vow', ?, 'carolina', 'CAR', 'E2EGRID', ?, ?, true, 'primary_only', 5, 'purge')`,
        [source.id, `${base}/v2`, JSON.stringify(["Property"]), JSON.stringify({ fastImportV1: true, license: { approved: true, internalUse: true, reference: "SYNTHETIC TEST FIXTURE ONLY" } })]
      );
      const [feed] = await q<any>("SELECT id FROM mls_feeds WHERE name='Active gallery test'");
      expect((await modules.engine.runFeedCycle(feed.id, { workerId: "gallery-e2e" })).ok).toBe(true);
      const ctx = (await modules.engine.loadFeedContext(feed.id))!;
      const db = (await modules.db.getDb())!;
      const { queueActiveGalleries } = await import("./activeGallery");
      const { galleryMarkerKey } = await import("./gallery");
      expect(await queueActiveGalleries(db, ctx)).toEqual({ scanned: 2, queued: 2 });
      expect(await queueActiveGalleries(db, ctx)).toEqual({ scanned: 0, queued: 0 });
      const markers = await q<any>("SELECT listingId, mediaKey FROM mls_media WHERE feedId=? AND mediaKey LIKE '__gallery_request__:%' ORDER BY listingId", [feed.id]);
      expect(markers).toHaveLength(2);
      expect(markers.map(row => row.mediaKey)).toEqual(markers.map(row => galleryMarkerKey(Number(row.listingId))));

      const lane = modules.http.getLane("mls_grid", "E2EGRID", modules.adapters.adapterFor("mls_grid").limits(ctx.feed));
      const before = state.requests.length;
      const refreshed = await modules.media.runMediaBatch(lane, [ctx], "gallery-e2e", { batchSize: 0 });
      expect(refreshed.refreshed).toBe(2);
      expect(state.requests.slice(before).filter(request => request.includes("ListingId in ("))).toHaveLength(1);
      const images = await q<any>("SELECT listingId, status, priority FROM mls_media WHERE feedId=? AND mediaKey NOT LIKE '__gallery_request__:%'", [feed.id]);
      expect(images).toHaveLength(6);
      expect(images.every(row => row.priority === 0)).toBe(true);
      let totalStored = 0;
      for (let i = 0; i < 4; i++) {
        totalStored += (await modules.media.runMediaBatch(lane, [ctx], "gallery-e2e", { batchSize: 6, refreshLimit: 0 })).stored;
        if (totalStored >= 6) break;
      }
      expect(totalStored).toBe(6);
      const perListing = await q<any>("SELECT listingId, COUNT(*) AS photos FROM mls_media WHERE feedId=? AND status='stored' GROUP BY listingId ORDER BY listingId", [feed.id]);
      expect(perListing.map(row => Number(row.photos))).toEqual([3, 3]);
    } finally {
      state.properties = original;
    }
  }, 90_000);

  it("quarantines a bad row, advances the page, and recovers it when corrected", async () => {
    const original = state.properties;
    try {
      state.properties = [
        listing("badrow", { ModificationTimestamp: "2026-09-25T10:00:00.000Z", PublicRemarks: "X".repeat(70_000) }),
        listing("goodrow", { ModificationTimestamp: "2026-09-25T11:00:00.000Z" }),
      ];
      const [source] = await q("SELECT id FROM mls_sources WHERE code='canopy'");
      await admin.query(
        `INSERT INTO mls_feeds (sourceId, name, provider, feedType, baseUrl, originatingSystemName, keyPrefix, credentialRef, resources, options, enabled, mediaPolicy, syncIntervalMinutes, retentionPolicy)
         VALUES (?, 'Quarantine test', 'mls_grid', 'idx_plus', ?, 'carolina', 'CAR', 'E2EGRID', ?, ?, true, 'primary_only', 5, 'purge')`,
        [source.id, `${base}/v2`, JSON.stringify(["Property"]), JSON.stringify({ fastImportV1: true, license: { approved: true, internalUse: true, reference: "SYNTHETIC TEST FIXTURE ONLY" } })]
      );
      const [feed] = await q("SELECT id FROM mls_feeds WHERE name='Quarantine test'");
      const first = await modules.engine.runFeedCycle(feed.id, { workerId: "quarantine-test" });
      expect(first.ok).toBe(true);
      expect(first.resources["Priority:Property"].quarantined).toBe(1);
      expect(first.resources.Property.quarantined).toBe(1);
      const [cursor] = await q("SELECT phase, recordsSeen FROM mls_sync_cursors WHERE feedId=? AND resource='Property'", [feed.id]);
      expect(cursor.phase).toBe("incremental");
      expect(Number(cursor.recordsSeen)).toBe(2);
      const [bad] = await q("SELECT providerKey, errorCode, errorColumn, payloadGzip FROM mls_import_exceptions WHERE feedId=?", [feed.id]);
      expect(bad.providerKey).toBe("CARbadrow");
      expect(bad.errorCode).toBe("ER_DATA_TOO_LONG");
      expect(bad.errorColumn).toBe("publicRemarks");
      expect(bad.payloadGzip.length).toBeGreaterThan(0);
      const [good] = await q("SELECT listingNumber FROM mls_listings WHERE feedId=?", [feed.id]);
      expect(good.listingNumber).toBe("goodrow");

      state.properties[0] = { ...state.properties[0], PublicRemarks: "Corrected", ModificationTimestamp: new Date(Date.now() + 60_000).toISOString() };
      const second = await modules.engine.runFeedCycle(feed.id, { workerId: "quarantine-test" });
      expect(second.ok).toBe(true);
      expect(await q("SELECT id FROM mls_import_exceptions WHERE feedId=?", [feed.id])).toHaveLength(0);
      expect(await q("SELECT id FROM mls_listings WHERE feedId=?", [feed.id])).toHaveLength(2);
    } finally {
      state.properties = original;
    }
  }, 90_000);

  it("reports worker commit and liveness without exposing worker IDs or MLS data", async () => {
    const { readMlsWorkerStatus } = await import("./status");
    const now = new Date();
    await admin.query(
      "INSERT INTO mls_worker_heartbeats (workerId, startedAt, lastBeatAt, version, detail) VALUES ('test-worker-id', ?, ?, 'fast-build', '{}')",
      [now, now]
    );
    const fresh = await readMlsWorkerStatus();
    expect([fresh.alive, fresh.version]).toEqual([true, "fast-build"]);
    expect(JSON.stringify(fresh)).not.toContain("test-worker-id");
    await admin.query("UPDATE mls_worker_heartbeats SET lastBeatAt=? WHERE workerId='test-worker-id'", [new Date(Date.now() - 150_000)]);
    expect((await readMlsWorkerStatus()).alive).toBe(false);
  });
});
