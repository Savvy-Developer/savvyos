/**
 * Declared MLS feeds against real MySQL. Opt-in like mls.e2e.test.ts:
 * MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e
 * Uses its own scratch database (savvyos_mls_e2e_feeds) so it can run in parallel.
 */
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.MLS_E2E_DATABASE_URL;
const DATABASE_URL = BASE ? BASE.replace(/\/[^/?]*(\?.*)?$/, "/savvyos_mls_e2e_feeds$1") : undefined;

describe.skipIf(!DATABASE_URL)("declared MLS feeds", () => {
  let admin: mysql.Connection;
  let schema: typeof import("./schema");
  let bootstrap: typeof import("./feedBootstrap");
  let license: typeof import("./license");

  beforeAll(async () => {
    const url = new URL(DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Declared feed test is restricted to localhost");
    const root = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
    await root.query("DROP DATABASE IF EXISTS `savvyos_mls_e2e_feeds`");
    await root.query("CREATE DATABASE `savvyos_mls_e2e_feeds`");
    await root.end();
    admin = await mysql.createConnection(DATABASE_URL!);
    await admin.query("CREATE TABLE admin_permissions (id int AUTO_INCREMENT PRIMARY KEY)");
    schema = await import("./schema");
    bootstrap = await import("./feedBootstrap");
    license = await import("./license");
    await schema.applyMlsSchema(admin as any);
  }, 60_000);

  afterAll(async () => {
    await admin?.end().catch(() => undefined);
  });

  it("creates Canopy BBO, MARIS IDX/BBO and MIBOR IDX/BBO exactly once, even when web and worker start together", async () => {
    const second = await mysql.createConnection(DATABASE_URL!);
    try {
      const results = await Promise.all([bootstrap.ensureDeclaredMlsFeeds(admin as any), bootstrap.ensureDeclaredMlsFeeds(second as any)]);
      expect(results.flat().sort()).toEqual(["Canopy BBO (MLS Grid)", "MARIS BBO (MLS Grid)", "MARIS IDX (MLS Grid)", "MIBOR BBO (MLS Grid)", "MIBOR IDX (MLS Grid)"]);
    } finally {
      await second.end();
    }
    expect(await bootstrap.ensureDeclaredMlsFeeds(admin as any)).toEqual([]);

    const [feeds]: any = await admin.query(
      `SELECT f.*, s.code FROM mls_feeds f JOIN mls_sources s ON s.id = f.sourceId ORDER BY s.code, f.id`
    );
    expect(feeds.map((feed: any) => [feed.code, feed.provider, feed.feedType, feed.credentialRef, feed.originatingSystemName, feed.keyPrefix, !!feed.enabled])).toEqual([
      ["canopy", "mls_grid", "bbo", "MLSGRID_BBO", "carolina", "CAR", true],
      ["maris", "mls_grid", "idx", "MLSGRID", "maris2", "MIS", true],
      ["maris", "mls_grid", "bbo", "MLSGRID_BBO", "maris2", "MIS", true],
      ["mibor", "mls_grid", "idx", "MLSGRID", "mibor", "MBR", true],
      ["mibor", "mls_grid", "bbo", "MLSGRID_BBO", "mibor", "MBR", true],
    ]);
    for (const feed of feeds) {
      const options = typeof feed.options === "string" ? JSON.parse(feed.options) : feed.options;
      expect(feed.baseUrl).toBe("https://api.mlsgrid.com/v2");
      expect(feed.mediaPolicy).toBe("primary_only");
      expect(feed.syncIntervalMinutes).toBe(5);
      expect(options.fastImportV1).toBe(true);
      expect(feed.retentionPolicy).toBe("purge");
      expect(license.licenseError({ options, retentionPolicy: feed.retentionPolicy })).toBeNull();
    }

    const [sources]: any = await admin.query("SELECT code, onboardingStatus FROM mls_sources WHERE code IN ('canopy', 'maris', 'mibor') ORDER BY code");
    expect(sources.map((source: any) => source.onboardingStatus)).toEqual(["approved", "approved", "approved"]);

    // The SQL read gate agrees with licenseError, so these feeds' listings are visible.
    const [visible]: any = await admin.query(`SELECT COUNT(*) AS n FROM mls_feeds f WHERE ${license.approvedFeedSql("lf", "f.id")}`);
    expect(Number(visible[0].n)).toBe(5);
  }, 60_000);

  it("prefers only a present, licensed MARIS BBO row across list, map and exact count", async () => {
    const search = await import("./search");
    const db = drizzle(admin);
    const [feeds]: any = await admin.query("SELECT f.id, f.sourceId, f.feedType, s.code FROM mls_feeds f JOIN mls_sources s ON s.id = f.sourceId");
    const marisIdx = feeds.find((feed: any) => feed.code === "maris" && feed.feedType === "idx");
    const marisBbo = feeds.find((feed: any) => feed.code === "maris" && feed.feedType === "bbo");
    const canopyBbo = feeds.find((feed: any) => feed.code === "canopy" && feed.feedType === "bbo");
    expect([marisIdx, marisBbo, canopyBbo].every(Boolean)).toBe(true);
    const ids = new Map<string, number>();
    try {
      for (const [name, feed, lat, lng] of [
        ["A-IDX", marisIdx, 38.627, -90.199], ["A-BBO", marisBbo, 38.627, -90.199],
        ["B-IDX", marisIdx, 38.628, -90.198], ["C-BBO", marisBbo, 38.629, -90.197],
        ["D-BBO", canopyBbo, 35.595, -82.551],
      ] as const) {
        const number = `MARIS-TEST-${name[0]}`;
        const [result]: any = await admin.query(
          `INSERT INTO mls_listings
           (propertyId, sourceId, feedId, listingNumber, listingKey, providerListingKey,
            standardStatus, propertyType, listPrice, originalEntryAt, latitude, longitude, firstSeenAt, lastSyncedAt)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 'residential', 500000, '2026-09-30 12:00:00', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [name.startsWith("A-") ? 9001 : 9001 + ids.size, feed.sourceId, feed.id, number, `test-${name}`, `test-${name}`, lat, lng]
        );
        ids.set(name, Number(result.insertId));
      }
      for (const order of [0, 1]) {
        const key = `mls/maris-test/idx-${order}.jpg`;
        await admin.query(`INSERT INTO mls_media
          (feedId, listingId, resourceKey, mediaKey, status, sortOrder, isPrimary, s3Key, url)
          VALUES (?, ?, 'test-A-IDX', ?, 'stored', ?, ?, ?, ?)`,
          [marisIdx.id, ids.get("A-IDX"), `maris-test-${order}`, order, order === 0, key,
            `/api/mls/media?key=${encodeURIComponent(key)}`]);
      }
      await admin.query("UPDATE mls_listings SET primaryPhotoUrl = ? WHERE id = ?",
        [`/api/mls/media?key=${encodeURIComponent('mls/maris-test/idx-0.jpg')}`, ids.get("A-IDX")]);
      const marisFilters = { sourceIds: [marisIdx.sourceId], statuses: ["active"] as ["active"] };
      const page = await search.searchListings(db as any, { filters: marisFilters, sort: "newest", page: 1, pageSize: 12, countMode: "none" });
      expect(page.items.map(item => item.listingNumber).sort()).toEqual(["MARIS-TEST-A", "MARIS-TEST-B", "MARIS-TEST-C"]);
      expect(page.items.find(item => item.listingNumber === "MARIS-TEST-A")?.id).toBe(ids.get("A-BBO"));
      expect(page.items.find(item => item.listingNumber === "MARIS-TEST-A")?.primaryPhotoUrl)
        .toContain(`listingId=${ids.get("A-IDX")}`);
      const { licensedIdxPhotoFallbacks } = await import("./photoFallback");
      const alternate = await licensedIdxPhotoFallbacks(db as any, [{
        id: ids.get("A-BBO")!, propertyId: 9001, sourceId: marisBbo.sourceId,
        feedId: marisBbo.id, listingNumber: "MARIS-TEST-A", standardStatus: "active",
      }]);
      expect(alternate.get(ids.get("A-BBO")!)?.media).toHaveLength(2);
      expect(alternate.get(ids.get("A-BBO")!)?.media.every(photo => photo.url.includes(`listingId=${ids.get("A-IDX")}`))).toBe(true);
      // A disabled or revoked IDX license cannot lend its photos to BBO.
      await admin.query("UPDATE mls_feeds SET options = JSON_SET(options, '$.license.approved', false) WHERE id = ?", [marisIdx.id]);
      expect((await licensedIdxPhotoFallbacks(db as any, [{
        id: ids.get("A-BBO")!, propertyId: 9001, sourceId: marisBbo.sourceId,
        feedId: marisBbo.id, listingNumber: "MARIS-TEST-A", standardStatus: "active",
      }])).size).toBe(0);
      await admin.query("UPDATE mls_feeds SET options = JSON_SET(options, '$.license.approved', true), enabled = false WHERE id = ?", [marisIdx.id]);
      expect((await licensedIdxPhotoFallbacks(db as any, [{
        id: ids.get("A-BBO")!, propertyId: 9001, sourceId: marisBbo.sourceId,
        feedId: marisBbo.id, listingNumber: "MARIS-TEST-A", standardStatus: "active",
      }])).size).toBe(0);
      await admin.query("UPDATE mls_feeds SET enabled = true WHERE id = ?", [marisIdx.id]);
      expect(await search.countListings(db as any, marisFilters)).toBe(3);
      expect(await search.countListings(db as any, { statuses: ["active"] })).toBe(4); // Canopy stays untouched.
      const map = await search.mapPoints(db as any, {
        filters: marisFilters, bounds: { north: 38.8, south: 38.5, west: -90.5, east: -90 }, zoom: 12,
      });
      expect(map.total).toBe(3);
      const [[physical]]: any = await admin.query("SELECT COUNT(*) AS n FROM mls_listings WHERE sourceId = ? AND listingNumber = 'MARIS-TEST-A'", [marisIdx.sourceId]);
      expect(Number(physical.n)).toBe(2); // Separate IDX/BBO rows and rights are never merged or destroyed.

      const dedup = new MySqlDialect().sqlToQuery(search.preferBboOverIdxCondition()).sql;
      const [plan]: any = await admin.query(`EXPLAIN SELECT id FROM mls_listings WHERE sourceId = ? AND ${dedup} LIMIT 12`, [marisIdx.sourceId]);
      // mapPoints above confirmed the covering index exists, so the per-listing
      // BBO check reads it alone, never the candidate row.
      const candidate = plan.find((row: any) => row.table === "candidate");
      expect(candidate?.key).toBe("mls_listings_source_number_feed_idx");
      expect(String(candidate?.Extra)).toContain("Using index");

      await admin.query("UPDATE mls_feeds SET options = JSON_SET(options, '$.license.approved', false) WHERE id = ?", [marisBbo.id]);
      const afterRevocation = await search.searchListings(db as any, { filters: marisFilters, sort: "newest", page: 1, pageSize: 12, countMode: "none" });
      expect(afterRevocation.items.find(item => item.listingNumber === "MARIS-TEST-A")?.id).toBe(ids.get("A-IDX"));
      expect(await search.countListings(db as any, marisFilters)).toBe(2); // BBO-only C is now unlicensed.
      await admin.query("UPDATE mls_feeds SET options = JSON_SET(options, '$.license.approved', true) WHERE id = ?", [marisBbo.id]);
      await admin.query("UPDATE mls_listings SET removedFromFeedAt = UTC_TIMESTAMP() WHERE id = ?", [ids.get("A-BBO")]);
      const afterRemoval = await search.searchListings(db as any, { filters: marisFilters, sort: "newest", page: 1, pageSize: 12, countMode: "none" });
      expect(afterRemoval.items.find(item => item.listingNumber === "MARIS-TEST-A")?.id).toBe(ids.get("A-IDX"));
    } finally {
      await admin.query("UPDATE mls_feeds SET enabled = true, options = JSON_SET(options, '$.license.approved', true) WHERE id = ?", [marisIdx.id]);
      await admin.query("UPDATE mls_feeds SET options = JSON_SET(options, '$.license.approved', true) WHERE id = ?", [marisBbo.id]);
      await admin.query("DELETE FROM mls_media WHERE mediaKey LIKE 'maris-test-%'");
      await admin.query("DELETE FROM mls_listings WHERE listingNumber LIKE 'MARIS-TEST-%'");
    }
  }, 60_000);

  it("hides a MIBOR IDX twin behind its BBO row, with no MLS named in the rule", async () => {
    const search = await import("./search");
    const db = drizzle(admin);
    const [feeds]: any = await admin.query("SELECT f.id, f.sourceId, f.feedType, s.code FROM mls_feeds f JOIN mls_sources s ON s.id = f.sourceId");
    const miborIdx = feeds.find((feed: any) => feed.code === "mibor" && feed.feedType === "idx");
    const miborBbo = feeds.find((feed: any) => feed.code === "mibor" && feed.feedType === "bbo");
    const marisIdx = feeds.find((feed: any) => feed.code === "maris" && feed.feedType === "idx");
    expect([miborIdx, miborBbo, marisIdx].every(Boolean)).toBe(true);
    const ids = new Map<string, number>();
    try {
      for (const [name, feed, number] of [
        ["A-IDX", miborIdx, "MBR-TEST-A"], ["A-BBO", miborBbo, "MBR-TEST-A"],
        ["B-IDX", miborIdx, "MBR-TEST-B"], ["C-BBO", miborBbo, "MBR-TEST-C"],
        // Same listing number in another MLS: never hidden by a MIBOR BBO row.
        ["M-IDX", marisIdx, "MBR-TEST-A"],
      ] as const) {
        const [result]: any = await admin.query(
          `INSERT INTO mls_listings
           (propertyId, sourceId, feedId, listingNumber, listingKey, providerListingKey,
            standardStatus, propertyType, listPrice, originalEntryAt, latitude, longitude, firstSeenAt, lastSyncedAt)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 'residential', 300000, '2026-10-09 12:00:00', 39.77, -86.16, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
          [9100 + ids.size, feed.sourceId, feed.id, number, `test-mbr-${name}`, `test-mbr-${name}`]
        );
        ids.set(name, Number(result.insertId));
      }
      const miborFilters = { sourceIds: [miborIdx.sourceId], statuses: ["active"] as ["active"] };
      const page = await search.searchListings(db as any, { filters: miborFilters, sort: "newest", page: 1, pageSize: 12, countMode: "none" });
      expect(page.items.map(item => item.listingNumber).sort()).toEqual(["MBR-TEST-A", "MBR-TEST-B", "MBR-TEST-C"]);
      expect(page.items.find(item => item.listingNumber === "MBR-TEST-A")?.id).toBe(ids.get("A-BBO"));
      expect(await search.countListings(db as any, miborFilters)).toBe(3);
      const map = await search.mapPoints(db as any, {
        filters: miborFilters, bounds: { north: 40, south: 39.5, west: -86.5, east: -85.9 }, zoom: 12,
      });
      expect(map.total).toBe(3);
      const marisFilters = { sourceIds: [marisIdx.sourceId], statuses: ["active"] as ["active"] };
      const marisPage = await search.searchListings(db as any, { filters: marisFilters, sort: "newest", page: 1, pageSize: 12, countMode: "none" });
      expect(marisPage.items.map(item => item.id)).toEqual([ids.get("M-IDX")]);
      // Until the BBO license is approved, the IDX row stays visible.
      await admin.query("UPDATE mls_feeds SET options = JSON_SET(options, '$.license.approved', false) WHERE id = ?", [miborBbo.id]);
      const revoked = await search.searchListings(db as any, { filters: miborFilters, sort: "newest", page: 1, pageSize: 12, countMode: "none" });
      expect(revoked.items.map(item => item.id).sort((a, b) => a - b)).toEqual([ids.get("A-IDX"), ids.get("B-IDX")].sort((a, b) => a! - b!));
    } finally {
      await admin.query("UPDATE mls_feeds SET options = JSON_SET(options, '$.license.approved', true) WHERE id = ?", [miborBbo.id]);
      await admin.query("DELETE FROM mls_listings WHERE listingNumber LIKE 'MBR-TEST-%'");
    }
  }, 60_000);

  it("seeks a selected MLS's exact listing number inside a saved map area", async () => {
    const search = await import("./search");
    const db = drizzle(admin);
    const [[maris]]: any = await admin.query("SELECT id, sourceId FROM mls_feeds WHERE originatingSystemName = 'maris2' AND feedType = 'bbo'");
    const number = "MIS26063536";
    const [inserted]: any = await admin.query(`INSERT INTO mls_listings
      (propertyId, sourceId, feedId, listingNumber, listingKey, providerListingKey,
       standardStatus, propertyType, listPrice, originalEntryAt, latitude, longitude, firstSeenAt, lastSyncedAt)
      VALUES (9008, ?, ?, ?, ?, ?, 'active', 'residential', 425000, '2026-09-30 12:00:00', 38.59, -90.26, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [maris.sourceId, maris.id, number, `test-${number}`, `test-${number}`]);
    try {
      const bounds = { north: 38.9, south: 38.4, west: -90.7, east: -89.9 };
      const filters = { q: number, sourceIds: [maris.sourceId], statuses: ["active"] as ["active"], bounds };
      const page = await search.searchListings(db as any, { filters, sort: "newest", page: 1, pageSize: 12, countMode: "none" });
      expect(page.items.map(item => item.id)).toEqual([Number(inserted.insertId)]);
      expect(await search.countListings(db as any, filters)).toBe(1);
      expect((await search.mapPoints(db as any, { filters, bounds, zoom: 12 })).total).toBe(1);
      expect(await search.countListings(db as any, { ...filters, bounds: { north: 36, south: 35, west: -83, east: -82 } })).toBe(0);
      const [plan]: any = await admin.query(`EXPLAIN SELECT id FROM mls_listings FORCE INDEX (mls_listings_source_number_idx)
        WHERE sourceId = ? AND listingNumber = ? AND latitude BETWEEN 38.4 AND 38.9 LIMIT 12`, [maris.sourceId, number]);
      expect(plan[0].key).toBe("mls_listings_source_number_idx");
    } finally {
      await admin.query("DELETE FROM mls_listings WHERE id = ?", [inserted.insertId]);
    }
  }, 60_000);

  it("never overwrites an admin's later changes", async () => {
    // Simulate a feed created by the previous release, before fastImportV1.
    await admin.query("UPDATE mls_feeds SET options = JSON_REMOVE(options, '$.fastImportV1'), mediaPolicy = 'active_all_else_primary', syncIntervalMinutes = 15 WHERE feedType = 'bbo' AND sourceId = (SELECT id FROM mls_sources WHERE code = 'canopy')");
    expect(await bootstrap.ensureDeclaredMlsFeeds(admin as any)).toEqual([]);
    const [[migrated]]: any = await admin.query("SELECT options, mediaPolicy, syncIntervalMinutes FROM mls_feeds WHERE feedType = 'bbo' AND sourceId = (SELECT id FROM mls_sources WHERE code = 'canopy')");
    const migratedOptions = typeof migrated.options === "string" ? JSON.parse(migrated.options) : migrated.options;
    expect([migratedOptions.fastImportV1, migrated.mediaPolicy, migrated.syncIntervalMinutes]).toEqual([true, "primary_only", 5]);
    await admin.query("UPDATE mls_feeds SET enabled = false, mediaPolicy = 'none', syncIntervalMinutes = 12 WHERE feedType = 'bbo' AND sourceId = (SELECT id FROM mls_sources WHERE code = 'canopy')");
    await admin.query("UPDATE mls_sources SET onboardingStatus = 'live' WHERE code = 'maris'");
    expect(await bootstrap.ensureDeclaredMlsFeeds(admin as any)).toEqual([]);
    const [[bbo]]: any = await admin.query("SELECT enabled, mediaPolicy, syncIntervalMinutes FROM mls_feeds WHERE feedType = 'bbo' AND sourceId = (SELECT id FROM mls_sources WHERE code = 'canopy')");
    expect([!!bbo.enabled, bbo.mediaPolicy, bbo.syncIntervalMinutes]).toEqual([false, "none", 12]);
    const [[maris]]: any = await admin.query("SELECT onboardingStatus FROM mls_sources WHERE code = 'maris'");
    expect(maris.onboardingStatus).toBe("live");
    const [[count]]: any = await admin.query("SELECT COUNT(*) AS n FROM mls_feeds");
    expect(Number(count.n)).toBe(5);
  }, 60_000);
});
