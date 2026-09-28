import mysql from "mysql2/promise";
import { and, eq, isNull } from "drizzle-orm";

import { leadSources } from "../drizzle/schema";
import {
  ORGANIC_SOCIAL_CHILDREN,
  ORGANIC_SOCIAL_PARENT,
  organicSocialTarget,
} from "@shared/organicSocial";

/**
 * Organic Social lead sources: the rows, and turning a visit's UTMs into one.
 *
 * Requested by Cam (doc "Savvy OS - Organic Social Lead Sources", 28 Sep
 * 2026) before Birdie's organic posts start in October. A lead source locks
 * when the contact is created, and Smart Plans enrol by lead source, so a
 * lead that arrives before these rows exist is filed wrong and never nurtured.
 * That is why the rows are created at startup rather than on first use.
 */

// ─── Startup: create the rows, retire the legacy import buckets ─────────────

/** The two paid-era import buckets under Savvy-Agents (ids read live by Cam). */
export const LEGACY_SOCIAL_SOURCES = [
  { id: 112, name: "Facebook", renamed: "Facebook - Legacy Import" },
  { id: 111, name: "Instagram", renamed: "Instagram - Legacy Import" },
] as const;
const LEGACY_PARENT = "Savvy-Agents";

type Connection = Awaited<ReturnType<typeof mysql.createConnection>>;
type Row = { id: number; name: string; parentId: number | null };

async function rows(connection: Connection, sql: string, params: unknown[] = []): Promise<Row[]> {
  const [result] = await connection.query(sql, params);
  return result as Row[];
}

async function applyOrganicSocialLeadSources() {
  if (process.env.NODE_ENV !== "production") return;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  let connection: Connection | null = null;
  const lockName = "savvyos_organic_social_lead_sources";
  try {
    connection = await mysql.createConnection(databaseUrl);
    // lead_sources has no unique name index, so two instances starting at
    // once could each insert the rows. The lock makes the check-then-insert
    // happen one instance at a time.
    const [lock] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", [lockName]);
    if (Number((lock as Array<{ acquired: number }>)[0]?.acquired) !== 1) {
      console.error("[OrganicSocial] Could not get the startup lock; skipped this start.");
      return;
    }
    try {
      // 1. Parent, then the five children, each only if missing.
      let [parent] = await rows(
        connection,
        "SELECT id, name, parentId FROM lead_sources WHERE name = ? AND parentId IS NULL ORDER BY id LIMIT 1",
        [ORGANIC_SOCIAL_PARENT]
      );
      if (!parent) {
        const [inserted] = await connection.query(
          "INSERT INTO lead_sources (name, parentId, campaignType, isActive, isProtected, description) VALUES (?, NULL, 'both', 1, 1, ?)",
          [ORGANIC_SOCIAL_PARENT, "Organic social posts. Filled automatically from links tagged utm_medium=social."]
        );
        parent = { id: Number((inserted as { insertId: number }).insertId), name: ORGANIC_SOCIAL_PARENT, parentId: null };
        console.log(`[OrganicSocial] Created "${ORGANIC_SOCIAL_PARENT}" (id ${parent.id}).`);
      }
      const children = await rows(connection, "SELECT id, name, parentId FROM lead_sources WHERE parentId = ?", [parent.id]);
      for (const child of ORGANIC_SOCIAL_CHILDREN) {
        if (children.some(row => row.name === child)) continue;
        await connection.query(
          "INSERT INTO lead_sources (name, parentId, campaignType, isActive, isProtected, description) VALUES (?, ?, 'both', 1, 1, ?)",
          [child, parent.id, `Organic ${child} posts (utm_source=${child.toLowerCase()}, utm_medium=social).`]
        );
        console.log(`[OrganicSocial] Created "${ORGANIC_SOCIAL_PARENT} > ${child}".`);
      }

      // 2. Rename and retire the legacy import buckets, once. The WHERE on the
      //    old name and the Savvy-Agents parent makes this a no-op after the
      //    first run, and a no-op if the rows are not what Cam described, so
      //    an admin who later reactivates one is not overruled on every start.
      //    Contacts are not touched: they keep their lead source id.
      const [legacyParent] = await rows(
        connection,
        "SELECT id, name, parentId FROM lead_sources WHERE name = ? AND parentId IS NULL ORDER BY id LIMIT 1",
        [LEGACY_PARENT]
      );
      if (legacyParent) {
        for (const legacy of LEGACY_SOCIAL_SOURCES) {
          const [result] = await connection.query(
            "UPDATE lead_sources SET name = ?, isActive = 0 WHERE id = ? AND name = ? AND parentId = ?",
            [legacy.renamed, legacy.id, legacy.name, legacyParent.id]
          );
          if (Number((result as { affectedRows?: number }).affectedRows) > 0) {
            console.log(`[OrganicSocial] Renamed lead source ${legacy.id} to "${legacy.renamed}" and set it inactive.`);
          }
        }
      }
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    }
  } catch (error) {
    // Logged, never thrown: a failure here must not stop the app starting.
    console.error("[OrganicSocial] Startup setup failed.", error);
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

let readiness: Promise<void> | null = null;

export function ensureOrganicSocialLeadSources() {
  readiness ??= applyOrganicSocialLeadSources();
  return readiness;
}

// ─── Runtime: which lead source a visit's UTMs point at ─────────────────────

type OrganicIds = { parentId: number; children: Map<string, number> };
let cache: { at: number; ids: OrganicIds | null } | null = null;
const CACHE_MS = 5 * 60_000;

/** The Organic Social rows, looked up by name. Cached for five minutes. */
export async function organicSocialIds(db: any): Promise<OrganicIds | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids;
  const [parent] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(and(eq(leadSources.name, ORGANIC_SOCIAL_PARENT), isNull(leadSources.parentId), eq(leadSources.isActive, true)))
    .limit(1);
  let ids: OrganicIds | null = null;
  if (parent) {
    const children = await db
      .select({ id: leadSources.id, name: leadSources.name })
      .from(leadSources)
      .where(and(eq(leadSources.parentId, parent.id), eq(leadSources.isActive, true)));
    ids = { parentId: parent.id, children: new Map(children.map((row: { id: number; name: string }) => [row.name, row.id])) };
  }
  cache = { at: Date.now(), ids };
  return ids;
}

/** For tests. */
export function resetOrganicSocialCache() {
  cache = null;
}

/**
 * The lead source for a new contact whose visit carried these UTMs, or null
 * when it is not organic social. Reads the attribution, never changes it: the
 * caller still writes utmSource / utmMedium / utmCampaign / utmContent.
 */
export async function resolveOrganicSocialLeadSourceId(
  db: any,
  attribution: { utmSource?: string | null; utmMedium?: string | null } | null | undefined
): Promise<number | null> {
  const target = organicSocialTarget(attribution);
  if (!target) return null;
  const ids = await organicSocialIds(db);
  if (!ids) {
    console.warn("[OrganicSocial] Organic social visit, but the Organic Social lead source is missing or inactive.");
    return null;
  }
  if (target.kind === "child") return ids.children.get(target.child) ?? ids.parentId;
  return ids.parentId;
}
