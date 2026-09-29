import mysql from "mysql2/promise";
import { and, eq, isNull } from "drizzle-orm";

import { leadSources } from "../drizzle/schema";
import {
  WEBSITE_LEAD_PARENT,
  WEBSITE_LEAD_SOURCES,
  type WebsiteLeadSource,
} from "@shared/websiteLeadSources";

/**
 * The website form lead sources: the rows, and looking one up by name.
 * See shared/websiteLeadSources.ts for which form files where.
 */

type Connection = Awaited<ReturnType<typeof mysql.createConnection>>;
type Row = { id: number; name: string };

async function rows(connection: Connection, sql: string, params: unknown[] = []): Promise<Row[]> {
  const [result] = await connection.query(sql, params);
  return result as Row[];
}

/**
 * Creates "Savvy-Agents.com" and its sub-sources, each only if missing. The
 * parent and "Deeper Analysis Request" already exist in production; they are
 * reused, never duplicated. Production only, under a lock, logged not thrown.
 */
async function applyWebsiteLeadSources() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  let connection: Connection | null = null;
  const lockName = "savvyos_website_lead_sources";
  try {
    connection = await mysql.createConnection(databaseUrl);
    const [lock] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [lockName]);
    if (Number((lock as Array<{ acquired: number }>)[0]?.acquired) !== 1) {
      console.error("[WebsiteLeadSources] Could not get the startup lock; skipped this start.");
      return;
    }
    try {
      let [parent] = await rows(
        connection,
        "SELECT id, name FROM lead_sources WHERE name = ? AND parentId IS NULL ORDER BY id LIMIT 1",
        [WEBSITE_LEAD_PARENT]
      );
      if (!parent) {
        const [inserted] = await connection.query(
          "INSERT INTO lead_sources (name, parentId, campaignType, isActive, isProtected, description) VALUES (?, NULL, 'both', 1, 1, ?)",
          [WEBSITE_LEAD_PARENT, "Leads from the Savvy website forms."]
        );
        parent = { id: Number((inserted as { insertId: number }).insertId), name: WEBSITE_LEAD_PARENT };
        console.log(`[WebsiteLeadSources] Created "${WEBSITE_LEAD_PARENT}" (id ${parent.id}).`);
      }
      const children = await rows(connection, "SELECT id, name FROM lead_sources WHERE parentId = ?", [parent.id]);
      for (const name of WEBSITE_LEAD_SOURCES) {
        if (children.some(row => row.name === name)) continue;
        await connection.query(
          "INSERT INTO lead_sources (name, parentId, campaignType, isActive, isProtected, description) VALUES (?, ?, 'both', 1, 1, ?)",
          [name, parent.id, `Website form: ${name}.`]
        );
        console.log(`[WebsiteLeadSources] Created "${WEBSITE_LEAD_PARENT} > ${name}".`);
      }
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    }
  } catch (error) {
    console.error("[WebsiteLeadSources] Startup setup failed.", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

let readiness: Promise<void> | null = null;

export function ensureWebsiteLeadSources() {
  readiness ??= applyWebsiteLeadSources();
  return readiness;
}

// ─── Runtime lookup ──────────────────────────────────────────────────────────

let cache: { at: number; ids: Map<string, number> | null } | null = null;
const CACHE_MS = 5 * 60_000;

async function websiteLeadIds(db: any): Promise<Map<string, number> | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids;
  const [parent] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(and(eq(leadSources.name, WEBSITE_LEAD_PARENT), isNull(leadSources.parentId), eq(leadSources.isActive, true)))
    .limit(1);
  let ids: Map<string, number> | null = null;
  if (parent) {
    const children = await db
      .select({ id: leadSources.id, name: leadSources.name })
      .from(leadSources)
      .where(and(eq(leadSources.parentId, parent.id), eq(leadSources.isActive, true)));
    ids = new Map(children.map((row: Row) => [row.name, row.id]));
  }
  cache = { at: Date.now(), ids };
  return ids;
}

/** For tests. */
export function resetWebsiteLeadSourceCache() {
  cache = null;
}

/** The id of a website form sub-source, or null when it is missing or inactive. */
export async function websiteLeadSourceId(db: any, name: WebsiteLeadSource | null): Promise<number | null> {
  if (!name) return null;
  const ids = await websiteLeadIds(db);
  const id = ids?.get(name) ?? null;
  if (!id) console.warn(`[WebsiteLeadSources] "${WEBSITE_LEAD_PARENT} > ${name}" is missing or inactive.`);
  return id;
}
