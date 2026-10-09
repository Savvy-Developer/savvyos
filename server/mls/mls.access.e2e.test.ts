/**
 * Agent Assignments and Saved Views against real MySQL, through the real tRPC
 * router. Opt-in like mls.e2e.test.ts:
 * MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e
 * Uses its own app and MLS scratch databases so it can run in parallel.
 */
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.MLS_E2E_DATABASE_URL;
const urlFor = (name: string) => BASE!.replace(/\/[^/?]*(\?.*)?$/, `/${name}$1`);
const APP = "savvyos_mls_e2e_access_app";
const MLS = "savvyos_mls_e2e_access_mls";

type User = { id: number; role: string; email: string; name: string; isActive: boolean };

describe.skipIf(!BASE)("MLS agent assignments and saved views", () => {
  let app: mysql.Connection;
  let mls: mysql.Connection;
  let router: typeof import("../routers/mlsProperties");
  let access: typeof import("./access");
  const users: Record<string, User> = {};
  const sources: Record<string, number> = {};
  const listings: Record<string, number> = {};
  const caller = (who: User) => router.mlsPropertiesRouter.createCaller({ user: who, req: {} as any, res: {} as any } as any);
  const world = { north: 60, south: 20, east: -60, west: -130 };
  const searchInput = (filters: Record<string, unknown> = {}) =>
    ({ filters: { statuses: ["active"], ...filters }, sort: "newest", page: 1, pageSize: 24 }) as any;
  const viewState = (overrides: Record<string, unknown> = {}) => ({
    filters: { statuses: ["active"], minPrice: 300000 },
    sort: "newest",
    view: "split",
    searchInMap: true,
    camera: { center: { lat: 38.63, lng: -90.2 }, zoom: 11 },
    bounds: { north: 38.7, south: 38.5, east: -90.1, west: -90.3 },
    area: null,
    ...overrides,
  }) as any;

  beforeAll(async () => {
    const url = new URL(BASE!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Access test is restricted to localhost");
    const root = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
    for (const name of [APP, MLS]) {
      await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
      await root.query(`CREATE DATABASE \`${name}\``);
    }
    await root.end();
    app = await mysql.createConnection(urlFor(APP));
    mls = await mysql.createConnection(urlFor(MLS));
    await app.query("CREATE TABLE admin_permissions (id int AUTO_INCREMENT PRIMARY KEY)");
    // Mutations are audit logged; give the log somewhere to go.
    await app.query(`CREATE TABLE activity_log (
      id int AUTO_INCREMENT PRIMARY KEY, userId int NULL, action varchar(255) NOT NULL, entityType varchar(255) NULL,
      entityId int NULL, relatedContactId int NULL, details text NULL, createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await app.query(`CREATE TABLE users (
      id int AUTO_INCREMENT PRIMARY KEY,
      openId varchar(64) NOT NULL UNIQUE,
      name text NULL,
      email varchar(320) NULL UNIQUE,
      personType enum('full_user','teammate') NOT NULL DEFAULT 'full_user',
      role enum('admin','agent','isa','agent_support') NOT NULL DEFAULT 'agent',
      isActive tinyint(1) NOT NULL DEFAULT 1
    )`);
    for (const [key, role, email, active, personType] of [
      ["tyler", "admin", "tyler@savvy.realty", 1, "full_user"],
      ["amy", "agent", "amy@example.test", 1, "full_user"],
      ["ben", "agent", "ben@example.test", 1, "full_user"],
      ["gone", "agent", "gone@example.test", 0, "full_user"],
      ["teammate", "agent", "teammate@example.test", 1, "teammate"],
      ["isa", "isa", "isa@example.test", 1, "full_user"],
    ] as const) {
      const [result]: any = await app.query(
        "INSERT INTO users (openId, name, email, role, isActive, personType) VALUES (?, ?, ?, ?, ?, ?)",
        [`open-${key}`, key[0].toUpperCase() + key.slice(1), email, role, active, personType]
      );
      users[key] = { id: Number(result.insertId), role, email, name: key, isActive: !!active };
    }
    process.env.DATABASE_URL = urlFor(APP);
    process.env.MLS_DATABASE_URL = urlFor(MLS);
    process.env.MLS_SCHEMA_ENSURE = "on";
    const schema = await import("./schema");
    await schema.ensureMlsSchema();
    access = await import("./access");
    await access.ensureMlsAccessSchema();
    router = await import("../routers/mlsProperties");

    const [feeds]: any = await mls.query("SELECT f.id, f.sourceId, f.feedType, s.code FROM mls_feeds f JOIN mls_sources s ON s.id = f.sourceId");
    const feed = (code: string, type: string) => feeds.find((row: any) => row.code === code && row.feedType === type);
    for (const code of ["canopy", "maris", "mibor"]) sources[code] = feed(code, "bbo").sourceId;
    let propertyId = 7000;
    for (const [name, code, type, lat, lng, removed] of [
      ["canopy", "canopy", "bbo", 35.595, -82.551, false],
      ["maris", "maris", "idx", 38.627, -90.199, false],
      ["marisRemoved", "maris", "idx", 38.628, -90.198, true],
      ["mibor", "mibor", "idx", 39.768, -86.158, false],
    ] as const) {
      const row = feed(code, type);
      const [result]: any = await mls.query(
        `INSERT INTO mls_listings
         (propertyId, sourceId, feedId, listingNumber, listingKey, providerListingKey,
          standardStatus, propertyType, listPrice, originalEntryAt, latitude, longitude, firstSeenAt, lastSyncedAt, removedFromFeedAt)
         VALUES (?, ?, ?, ?, ?, ?, 'active', 'residential', 450000, '2026-10-01 12:00:00', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?)`,
        [propertyId++, row.sourceId, row.id, `ACCESS-${name}`, `access-${name}`, `access-${name}`, lat, lng, removed ? new Date() : null]
      );
      listings[name] = Number(result.insertId);
    }
  }, 120_000);

  afterAll(async () => {
    await Promise.all([app, mls].map(connection => connection?.end().catch(() => undefined)));
  });

  it("gives an agent with no assignment no MLS Properties access at all", async () => {
    const amy = caller(users.amy);
    expect(await amy.myAccess()).toEqual({ canView: false, scope: "none", sourceIds: [], canManage: false });
    await expect(amy.search(searchInput())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(amy.filterOptions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(amy.savedViews()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(users.isa).search(searchInput())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const tyler = await caller(users.tyler).myAccess();
    expect(tyler).toMatchObject({ canView: true, scope: "all", canManage: true });
  });

  it("lets only MLS managers assign, and only licensed MLSs to active full agents", async () => {
    const tyler = caller(users.tyler);
    const roster = await tyler.agentAssignments();
    expect(roster.agents.map(agent => agent.email)).toEqual(["amy@example.test", "ben@example.test"]);
    expect(roster.sources.map(source => source.id).sort()).toEqual([sources.canopy, sources.maris, sources.mibor].sort());

    await expect(caller(users.amy).agentAssignments()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(users.amy).setAgentAssignments({ userId: users.amy.id, sourceIds: [sources.maris] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const target of [users.gone, users.teammate, users.isa, users.tyler]) {
      await expect(tyler.setAgentAssignments({ userId: target.id, sourceIds: [sources.maris] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    const [unlicensed]: any = await mls.query("SELECT id FROM mls_sources WHERE id NOT IN (SELECT sourceId FROM mls_feeds) ORDER BY id LIMIT 1");
    await expect(tyler.setAgentAssignments({ userId: users.amy.id, sourceIds: [unlicensed[0].id] })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Replacing a list keeps it exact: duplicates collapse, removed MLSs go away.
    expect(await tyler.setAgentAssignments({ userId: users.amy.id, sourceIds: [sources.mibor, sources.maris, sources.maris] }))
      .toEqual({ userId: users.amy.id, sourceIds: [sources.maris, sources.mibor].sort((a, b) => a - b) });
    expect(await tyler.setAgentAssignments({ userId: users.amy.id, sourceIds: [sources.maris] }))
      .toEqual({ userId: users.amy.id, sourceIds: [sources.maris] });
    const [rows]: any = await app.query("SELECT sourceId, assignedById FROM agent_mls_assignments WHERE userId = ?", [users.amy.id]);
    expect(rows).toEqual([{ sourceId: sources.maris, assignedById: users.tyler.id }]);
    expect((await tyler.agentAssignments()).agents.find(agent => agent.id === users.amy.id)?.sourceIds).toEqual([sources.maris]);
  });

  it("scopes every read to the assigned MLS, and an unassigned MLS looks empty, not wider", async () => {
    const amy = caller(users.amy);
    expect(await amy.myAccess()).toEqual({ canView: true, scope: "assigned", sourceIds: [sources.maris], canManage: false });
    const options = await amy.filterOptions();
    expect(options.sources.map(source => source.id)).toEqual([sources.maris]);
    expect(options.scope).toBe("assigned");

    const numbers = (page: { items: { listingNumber: string }[] }) => page.items.map(item => item.listingNumber).sort();
    expect(numbers(await amy.search(searchInput()))).toEqual(["ACCESS-maris"]);
    expect(numbers(await amy.search(searchInput({ sourceIds: [sources.maris, sources.canopy] })))).toEqual(["ACCESS-maris"]);
    expect(numbers(await amy.search(searchInput({ sourceIds: [sources.canopy] })))).toEqual([]);
    // Agents never get removed listings, even when they ask.
    expect(numbers(await amy.search(searchInput({ includeRemoved: true })))).toEqual(["ACCESS-maris"]);
    expect(await amy.total({ filters: { statuses: ["active"] } as any })).toEqual({ total: 1 });
    expect(await amy.total({ filters: { statuses: ["active"], sourceIds: [sources.canopy, sources.mibor] } as any })).toEqual({ total: 0 });
    const map = await amy.mapPoints({ filters: { statuses: ["active"] } as any, bounds: world, zoom: 6 });
    expect(map.total).toBe(1);
    expect(map.pins.map((pin: any) => pin.id)).toEqual([listings.maris]);

    expect((await amy.listing({ id: listings.maris })).listing.id).toBe(listings.maris);
    await expect(amy.listing({ id: listings.canopy })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(amy.listing({ id: listings.marisRemoved })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(amy.sourceFacets({ sourceId: sources.canopy })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(amy.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(amy.rawPayload({ listingId: listings.maris })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Admins still see every licensed MLS.
    const tyler = caller(users.tyler);
    expect(numbers(await tyler.search(searchInput()))).toEqual(["ACCESS-canopy", "ACCESS-maris", "ACCESS-mibor"]);
    expect((await tyler.listing({ id: listings.canopy })).listing.id).toBe(listings.canopy);

    // Media and every other route use the same rule.
    const amyAccess = await access.mlsAccessFor(users.amy);
    expect(access.canSeeSource(amyAccess, sources.maris)).toBe(true);
    expect(access.canSeeSource(amyAccess, sources.canopy)).toBe(false);
    expect(access.canSeeSource(await access.mlsAccessFor(users.ben), sources.maris)).toBe(false);
    expect(await access.mlsAccessFor({ ...users.amy, isActive: false })).toEqual({ kind: "none" });

    // Removing the last MLS removes access.
    await tyler.setAgentAssignments({ userId: users.ben.id, sourceIds: [sources.mibor] });
    expect(numbers(await caller(users.ben).search(searchInput()))).toEqual(["ACCESS-mibor"]);
    await tyler.setAgentAssignments({ userId: users.ben.id, sourceIds: [] });
    await expect(caller(users.ben).search(searchInput())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps saved views private, uniquely named, and allows exactly one default per user", async () => {
    const amy = caller(users.amy);
    const tyler = caller(users.tyler);
    const first = await amy.createSavedView({ name: "  St. Louis split  ", state: viewState(), makeDefault: true });
    const second = await amy.createSavedView({ name: "Polygon", state: viewState({ view: "map", bounds: null, area: { kind: "polygon", points: [{ lat: 38.6, lng: -90.3 }, { lat: 38.7, lng: -90.2 }, { lat: 38.6, lng: -90.1 }] } }) });
    await tyler.createSavedView({ name: "Polygon", state: viewState() }); // same name, different user: allowed
    await expect(amy.createSavedView({ name: "Polygon", state: viewState() })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(amy.createSavedView({ name: "   ", state: viewState() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(amy.createSavedView({ name: "Bad sort", state: viewState({ sort: "random" }) })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    let views = await amy.savedViews();
    expect(views.map(view => [view.name, view.isDefault])).toEqual([["Polygon", false], ["St. Louis split", true]]);
    const saved = views.find(view => view.id === first.id)!;
    expect(saved.state).toMatchObject({ sort: "newest", view: "split", searchInMap: true, filters: { statuses: ["active"], minPrice: 300000 } });
    expect(saved.state?.camera).toEqual({ center: { lat: 38.63, lng: -90.2 }, zoom: 11 });
    expect(views.find(view => view.id === second.id)?.state?.area).toMatchObject({ kind: "polygon" });
    expect((await tyler.savedViews()).map(view => view.name)).toEqual(["Polygon"]);

    // Switching the default moves it; clearing it leaves none.
    await amy.setDefaultSavedView({ id: second.id });
    views = await amy.savedViews();
    expect(views.filter(view => view.isDefault).map(view => view.id)).toEqual([second.id]);
    await amy.setDefaultSavedView({ id: null });
    expect((await amy.savedViews()).some(view => view.isDefault)).toBe(false);
    await amy.setDefaultSavedView({ id: first.id });
    // The database itself refuses a second default.
    await expect(app.query("UPDATE user_mls_saved_views SET isDefault = 1 WHERE id = ?", [second.id])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });

    // Update and rename.
    await amy.updateSavedView({ id: first.id, name: "STL", state: viewState({ sort: "price_asc", view: "list" }) });
    await expect(amy.updateSavedView({ id: first.id, name: "Polygon" })).rejects.toMatchObject({ code: "CONFLICT" });
    const renamed = (await amy.savedViews()).find(view => view.id === first.id)!;
    expect([renamed.name, renamed.isDefault, renamed.state?.sort, renamed.state?.view]).toEqual(["STL", true, "price_asc", "list"]);

    // Another user can neither change nor delete it, and gets the same answer as for a missing view.
    const tylerView = (await tyler.savedViews())[0];
    for (const attempt of [
      () => tyler.updateSavedView({ id: first.id, name: "Mine now" }),
      () => tyler.setDefaultSavedView({ id: first.id }),
      () => tyler.deleteSavedView({ id: first.id }),
      () => amy.deleteSavedView({ id: tylerView.id }),
      () => amy.deleteSavedView({ id: 999999 }),
    ]) await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await amy.savedViews()).find(view => view.id === first.id)?.name).toBe("STL");

    // A view stored in an older format comes back as needing a re-save instead of breaking the list.
    await app.query("UPDATE user_mls_saved_views SET state = JSON_OBJECT('filters', 'old') WHERE id = ?", [second.id]);
    expect((await amy.savedViews()).find(view => view.id === second.id)?.state).toBeNull();

    await amy.deleteSavedView({ id: second.id });
    expect((await amy.savedViews()).map(view => view.name)).toEqual(["STL"]);

    // Per-user cap.
    for (let index = 0; index < access.MAX_SAVED_VIEWS_PER_USER - 1; index++) {
      await app.query("INSERT INTO user_mls_saved_views (userId, name, state) VALUES (?, ?, JSON_OBJECT())", [users.amy.id, `Bulk ${index}`]);
    }
    await expect(amy.createSavedView({ name: "One too many", state: viewState() })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Losing MLS access also closes saved views, and deleting the user removes their records.
    await tyler.setAgentAssignments({ userId: users.amy.id, sourceIds: [] });
    await expect(amy.savedViews()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await app.query("DELETE FROM users WHERE id = ?", [users.amy.id]);
    const [left]: any = await app.query(
      "SELECT (SELECT COUNT(*) FROM user_mls_saved_views WHERE userId = ?) AS views, (SELECT COUNT(*) FROM agent_mls_assignments WHERE userId = ?) AS assignments",
      [users.amy.id, users.amy.id]
    );
    expect([Number(left[0].views), Number(left[0].assignments)]).toEqual([0, 0]);
  });
});
