/**
 * MLS tables in their own database (MLS_DATABASE_URL) against real MySQL.
 * Opt-in like mls.e2e.test.ts:
 * MLS_E2E_DATABASE_URL=mysql://root@127.0.0.1:3307/savvyos_mls_e2e
 * Uses its own scratch databases so it can run in parallel with the others.
 */
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.MLS_E2E_DATABASE_URL;
const urlFor = (name: string) => BASE!.replace(/\/[^/?]*(\?.*)?$/, `/${name}$1`);
const APP = "savvyos_mls_e2e_split_app";
const MLS = "savvyos_mls_e2e_split_mls";
const EMPTY = "savvyos_mls_e2e_split_empty";

describe.skipIf(!BASE)("MLS on a separate database", () => {
  let app: mysql.Connection;
  let mls: mysql.Connection;
  let empty: mysql.Connection;
  let schema: typeof import("./schema");

  beforeAll(async () => {
    const url = new URL(BASE!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Split-database test is restricted to localhost");
    const root = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) });
    for (const name of [APP, MLS, EMPTY]) {
      await root.query(`DROP DATABASE IF EXISTS \`${name}\``);
      await root.query(`CREATE DATABASE \`${name}\``);
    }
    await root.end();
    app = await mysql.createConnection(urlFor(APP));
    mls = await mysql.createConnection(urlFor(MLS));
    empty = await mysql.createConnection(urlFor(EMPTY));
    await app.query("CREATE TABLE admin_permissions (id int AUTO_INCREMENT PRIMARY KEY)");
    process.env.DATABASE_URL = urlFor(APP);
    process.env.MLS_DATABASE_URL = urlFor(MLS);
    process.env.MLS_SCHEMA_ENSURE = "on";
    schema = await import("./schema");
    await schema.ensureMlsSchema();
  }, 120_000);

  afterAll(async () => {
    await Promise.all([app, mls, empty].map(connection => connection?.end().catch(() => undefined)));
  });

  const countTables = async (connection: mysql.Connection) => {
    const [rows]: any = await connection.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'mls\\_%'"
    );
    return Number(rows[0].n);
  };

  it("creates MLS tables only in the MLS database and permission columns only in the app database", async () => {
    const { MLS_TABLE_DDL } = await import("./schemaDdl");
    expect(await countTables(mls)).toBe(MLS_TABLE_DDL.length);
    expect(await countTables(app)).toBe(0);
    const [appColumns]: any = await app.query(
      "SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_permissions' ORDER BY COLUMN_NAME"
    );
    expect(appColumns.map((row: any) => row.name)).toEqual(["canManageMlsFeeds", "canViewMlsProperties", "id"]);
    const [feeds]: any = await mls.query("SELECT COUNT(*) AS n FROM mls_feeds");
    expect(Number(feeds[0].n)).toBe(3);
    const [sources]: any = await mls.query("SELECT COUNT(*) AS n FROM mls_sources");
    expect(Number(sources[0].n)).toBeGreaterThan(0);
  });

  it("routes MLS queries to the MLS database and app queries to the app database", async () => {
    const { getMlsDb, mlsDatabaseMode } = await import("./db");
    const { getDb } = await import("../db");
    const rowsOf = (result: any) => (Array.isArray(result[0]) ? result[0] : result);
    const mlsDb = await getMlsDb();
    const appDb = await getDb();
    expect(rowsOf(await mlsDb!.execute(sql`SELECT DATABASE() AS name`))[0].name).toBe(MLS);
    expect(rowsOf(await appDb!.execute(sql`SELECT DATABASE() AS name`))[0].name).toBe(APP);
    expect(mlsDatabaseMode()).toBe("separate");
  });

  it("reports healthy with tables from the MLS database and permissions from the app database", async () => {
    const { readMlsSchemaStatus } = await import("./status");
    const status = await readMlsSchemaStatus();
    expect(status.status).toBe("ok");
    expect(status.tables.found).toBe(status.tables.expected);
    expect(status.permissionColumns).toEqual({ found: 2, expected: 2 });
    expect(status.mlsDatabase).toBe("separate");
  });

  it("refuses to initialize an empty MLS database while the app database still holds MLS feeds", async () => {
    // Here the populated MLS schema plays the old app database that still has MLS data.
    await mls.query("CREATE TABLE IF NOT EXISTS admin_permissions (id int AUTO_INCREMENT PRIMARY KEY)");
    await expect(schema.assertMlsDatabaseReady(empty as any, mls as any)).rejects.toThrow(/copy the MLS tables/);
    await expect(schema.applyMlsSchema(empty as any, mls as any)).rejects.toThrow(/copy the MLS tables/);
    expect(await countTables(empty)).toBe(0);
    // A populated MLS database, or a fresh install with no MLS data anywhere, is fine.
    await expect(schema.assertMlsDatabaseReady(mls as any, app as any)).resolves.toBeUndefined();
    await expect(schema.assertMlsDatabaseReady(empty as any, app as any)).resolves.toBeUndefined();
  });
});
