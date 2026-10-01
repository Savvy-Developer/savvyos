/**
 * Declared MLS feeds against real MySQL. Opt-in like mls.e2e.test.ts:
 * MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e
 * Uses its own scratch database (savvyos_mls_e2e_feeds) so it can run in parallel.
 */
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

  it("creates Canopy BBO and MARIS IDX exactly once, even when web and worker start together", async () => {
    const second = await mysql.createConnection(DATABASE_URL!);
    try {
      const results = await Promise.all([bootstrap.ensureDeclaredMlsFeeds(admin as any), bootstrap.ensureDeclaredMlsFeeds(second as any)]);
      expect(results.flat().sort()).toEqual(["Canopy BBO (MLS Grid)", "MARIS IDX (MLS Grid)"]);
    } finally {
      await second.end();
    }
    expect(await bootstrap.ensureDeclaredMlsFeeds(admin as any)).toEqual([]);

    const [feeds]: any = await admin.query(
      `SELECT f.*, s.code FROM mls_feeds f JOIN mls_sources s ON s.id = f.sourceId ORDER BY s.code`
    );
    expect(feeds.map((feed: any) => [feed.code, feed.provider, feed.feedType, feed.credentialRef, feed.originatingSystemName, feed.keyPrefix, !!feed.enabled])).toEqual([
      ["canopy", "mls_grid", "bbo", "MLSGRID_BBO", "carolina", "CAR", true],
      ["maris", "mls_grid", "idx", "MLSGRID", "maris2", "MIS", true],
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

    const [sources]: any = await admin.query("SELECT code, onboardingStatus FROM mls_sources WHERE code IN ('canopy', 'maris') ORDER BY code");
    expect(sources.map((source: any) => source.onboardingStatus)).toEqual(["approved", "approved"]);

    // The SQL read gate agrees with licenseError, so these feeds' listings are visible.
    const [visible]: any = await admin.query(`SELECT COUNT(*) AS n FROM mls_feeds f WHERE ${license.approvedFeedSql("lf", "f.id")}`);
    expect(Number(visible[0].n)).toBe(2);
  }, 60_000);

  it("never overwrites an admin's later changes", async () => {
    // Simulate a feed created by the previous release, before fastImportV1.
    await admin.query("UPDATE mls_feeds SET options = JSON_REMOVE(options, '$.fastImportV1'), mediaPolicy = 'active_all_else_primary', syncIntervalMinutes = 15 WHERE feedType = 'bbo'");
    expect(await bootstrap.ensureDeclaredMlsFeeds(admin as any)).toEqual([]);
    const [[migrated]]: any = await admin.query("SELECT options, mediaPolicy, syncIntervalMinutes FROM mls_feeds WHERE feedType = 'bbo'");
    const migratedOptions = typeof migrated.options === "string" ? JSON.parse(migrated.options) : migrated.options;
    expect([migratedOptions.fastImportV1, migrated.mediaPolicy, migrated.syncIntervalMinutes]).toEqual([true, "primary_only", 5]);
    await admin.query("UPDATE mls_feeds SET enabled = false, mediaPolicy = 'none', syncIntervalMinutes = 12 WHERE feedType = 'bbo'");
    await admin.query("UPDATE mls_sources SET onboardingStatus = 'live' WHERE code = 'maris'");
    expect(await bootstrap.ensureDeclaredMlsFeeds(admin as any)).toEqual([]);
    const [[bbo]]: any = await admin.query("SELECT enabled, mediaPolicy, syncIntervalMinutes FROM mls_feeds WHERE feedType = 'bbo'");
    expect([!!bbo.enabled, bbo.mediaPolicy, bbo.syncIntervalMinutes]).toEqual([false, "none", 12]);
    const [[maris]]: any = await admin.query("SELECT onboardingStatus FROM mls_sources WHERE code = 'maris'");
    expect(maris.onboardingStatus).toBe("live");
    const [[count]]: any = await admin.query("SELECT COUNT(*) AS n FROM mls_feeds");
    expect(Number(count.n)).toBe(2);
  }, 60_000);
});
