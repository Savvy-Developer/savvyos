import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import mysql from "mysql2/promise";
import { z } from "zod";
import { agentMlsAssignments, userMlsSavedViews, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { canAdminUsePermission } from "../routers/permissions";
import { mapAreaSchema } from "./mapGeometry";
import { boundsSchema, SEARCH_SORTS, searchFiltersSchema } from "./search";

/**
 * Who may search which MLS.
 *
 * - Admins with canViewMlsProperties see every licensed MLS (unchanged).
 * - Agents see only the MLSs an MLS manager assigned to them. With no
 *   assignment they have no MLS Properties access at all.
 * - Everyone else has none.
 *
 * Assignments and saved views are user records, so they live in the app
 * database (backed up nightly). The MLS replica stays re-importable.
 */

export type MlsAccess =
  | { kind: "none" }
  | { kind: "all"; canManage: boolean }
  | { kind: "assigned"; sourceIds: number[] };

type AccessUser = { id: number; role: string; email?: string | null; isActive?: boolean | null };

const NONE: MlsAccess = { kind: "none" };
/** Matches no mls_sources row, so a scoped query returns nothing instead of everything. */
export const NO_SOURCE_ID = -1;
export const MAX_SAVED_VIEWS_PER_USER = 50;

export const MLS_ACCESS_TABLE_DDL = [
  `CREATE TABLE IF NOT EXISTS \`agent_mls_assignments\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`userId\` int NOT NULL,
    \`sourceId\` int NOT NULL,
    \`assignedById\` int NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`agent_mls_assignments_user_source_unique\` (\`userId\`, \`sourceId\`),
    KEY \`agent_mls_assignments_source_idx\` (\`sourceId\`),
    CONSTRAINT \`agent_mls_assignments_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
    CONSTRAINT \`agent_mls_assignments_assigned_by_fk\` FOREIGN KEY (\`assignedById\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
  )`,
  // defaultUserId is userId only on the default row, and NULL elsewhere. Its unique
  // key makes "one default view per user" a database rule, not just app logic.
  `CREATE TABLE IF NOT EXISTS \`user_mls_saved_views\` (
    \`id\` int NOT NULL AUTO_INCREMENT,
    \`userId\` int NOT NULL,
    \`name\` varchar(80) NOT NULL,
    \`state\` json NOT NULL,
    \`isDefault\` tinyint(1) NOT NULL DEFAULT 0,
    \`defaultUserId\` int GENERATED ALWAYS AS (IF(\`isDefault\`, \`userId\`, NULL)) VIRTUAL,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`user_mls_saved_views_user_name_unique\` (\`userId\`, \`name\`),
    UNIQUE KEY \`user_mls_saved_views_one_default\` (\`defaultUserId\`),
    CONSTRAINT \`user_mls_saved_views_user_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
  )`,
];

type DdlConnection = { query: (statement: string) => Promise<unknown> };

export async function applyMlsAccessSchema(connection: DdlConnection) {
  for (const statement of MLS_ACCESS_TABLE_DDL) await connection.query(statement);
}

let readiness: Promise<void> | null = null;

/** Creates the two app-DB tables once per process. Production, or MLS_SCHEMA_ENSURE=on. */
export function ensureMlsAccessSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "production" && process.env.MLS_SCHEMA_ENSURE !== "on") return Promise.resolve();
  readiness ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return;
    const connection = await mysql.createConnection(url);
    try {
      await applyMlsAccessSchema(connection);
    } finally {
      await connection.end().catch(() => undefined);
    }
  })().catch(error => {
    readiness = null; // let the next call retry
    throw error;
  });
  return readiness;
}

async function appDb() {
  await ensureMlsAccessSchema();
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

// ─── Access ──────────────────────────────────────────────────────────────────

export async function assignedSourceIds(userId: number): Promise<number[]> {
  const db = await appDb();
  const rows = await db.select({ sourceId: agentMlsAssignments.sourceId }).from(agentMlsAssignments)
    .where(eq(agentMlsAssignments.userId, userId));
  return rows.map(row => row.sourceId).sort((a, b) => a - b);
}

export async function mlsAccessFor(user: AccessUser | null | undefined): Promise<MlsAccess> {
  if (!user || user.isActive === false) return NONE;
  if (user.role === "admin") {
    if (!(await canAdminUsePermission(user, "canViewMlsProperties"))) return NONE;
    return { kind: "all", canManage: await canAdminUsePermission(user, "canManageMlsFeeds") };
  }
  if (user.role !== "agent") return NONE;
  const sourceIds = await assignedSourceIds(user.id);
  return sourceIds.length ? { kind: "assigned", sourceIds } : NONE;
}

export function canSeeSource(access: MlsAccess, sourceId: number): boolean {
  if (access.kind === "all") return true;
  if (access.kind === "assigned") return access.sourceIds.includes(sourceId);
  return false;
}

/** Source ids a query may read, or null for "every licensed MLS". */
export function allowedSourceIds(access: MlsAccess): number[] | null {
  if (access.kind === "all") return null;
  if (access.kind === "assigned") return access.sourceIds;
  return [NO_SOURCE_ID];
}

/**
 * Narrows search filters to what the caller may see. Admins pass through
 * unchanged. Agents keep only requested MLSs they are assigned (all assigned
 * MLSs when none is requested), never get removed listings, and a request for
 * only unassigned MLSs matches nothing rather than falling back to everything.
 */
export function scopeSearchFilters<T extends { sourceIds?: number[]; includeRemoved?: boolean }>(filters: T, access: MlsAccess): T {
  if (access.kind === "all") return filters;
  const permitted = access.kind === "assigned" ? access.sourceIds : [];
  const requested = filters.sourceIds?.length ? filters.sourceIds.filter(id => permitted.includes(id)) : permitted;
  return { ...filters, sourceIds: requested.length ? requested : [NO_SOURCE_ID], includeRemoved: undefined };
}

// ─── Agent assignments ───────────────────────────────────────────────────────

export type AgentAssignmentRow = { id: number; name: string | null; email: string | null; sourceIds: number[] };

/** Active agents with their assigned MLS source ids, ordered by name. */
export async function listAgentAssignments(): Promise<AgentAssignmentRow[]> {
  const db = await appDb();
  const agents = await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
    .where(and(eq(users.role, "agent"), eq(users.isActive, true), eq(users.personType, "full_user")))
    .orderBy(asc(users.name), asc(users.id));
  if (!agents.length) return [];
  const rows = await db.select({ userId: agentMlsAssignments.userId, sourceId: agentMlsAssignments.sourceId })
    .from(agentMlsAssignments).where(inArray(agentMlsAssignments.userId, agents.map(agent => agent.id)));
  const byUser = new Map<number, number[]>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.sourceId]);
  return agents.map(agent => ({ ...agent, sourceIds: (byUser.get(agent.id) ?? []).sort((a, b) => a - b) }));
}

/**
 * Replaces one agent's MLS assignments. Only active agents can be assigned, and
 * only to MLSs in assignableSourceIds (licensed sources, checked by the caller
 * against the MLS database).
 */
export async function setAgentAssignments(input: {
  actorId: number; userId: number; sourceIds: number[]; assignableSourceIds: number[];
}): Promise<number[]> {
  const sourceIds = Array.from(new Set(input.sourceIds)).sort((a, b) => a - b);
  const unknown = sourceIds.filter(id => !input.assignableSourceIds.includes(id));
  if (unknown.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Only licensed MLSs can be assigned" });
  const db = await appDb();
  const [target] = await db.select({ role: users.role, isActive: users.isActive, personType: users.personType })
    .from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target || target.role !== "agent" || !target.isActive || target.personType !== "full_user") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MLSs can only be assigned to active agents" });
  }
  await db.transaction(async tx => {
    await tx.delete(agentMlsAssignments).where(sourceIds.length
      ? and(eq(agentMlsAssignments.userId, input.userId), notInArray(agentMlsAssignments.sourceId, sourceIds))
      : eq(agentMlsAssignments.userId, input.userId));
    if (sourceIds.length) {
      await tx.insert(agentMlsAssignments).ignore()
        .values(sourceIds.map(sourceId => ({ userId: input.userId, sourceId, assignedById: input.actorId })));
    }
  });
  return sourceIds;
}

// ─── Saved views ─────────────────────────────────────────────────────────────

const pointSchema = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });

/** Everything a saved view restores. Unknown keys are dropped. */
export const savedViewStateSchema = z.object({
  filters: searchFiltersSchema.omit({ bounds: true, area: true, includeRemoved: true }),
  sort: z.enum(SEARCH_SORTS),
  view: z.enum(["list", "split", "map"]),
  searchInMap: z.boolean(),
  camera: z.object({ center: pointSchema, zoom: z.number().finite().min(0).max(22) }).nullable(),
  bounds: boundsSchema.nullable(),
  area: mapAreaSchema.nullable(),
});
export type SavedViewState = z.infer<typeof savedViewStateSchema>;
export const savedViewNameSchema = z.string().trim().min(1, "Name the view").max(80, "Keep the name under 80 characters");

export type SavedView = { id: number; name: string; isDefault: boolean; state: SavedViewState | null; updatedAt: Date };

function parseState(value: unknown): SavedViewState | null {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  const parsed = savedViewStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function isDuplicate(error: unknown) {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.cause?.code === "ER_DUP_ENTRY";
}

function duplicateName(name: string) {
  return new TRPCError({ code: "CONFLICT", message: `You already have a view named "${name}"` });
}

export async function listSavedViews(userId: number): Promise<SavedView[]> {
  const db = await appDb();
  const rows = await db.select().from(userMlsSavedViews).where(eq(userMlsSavedViews.userId, userId))
    .orderBy(asc(userMlsSavedViews.name), asc(userMlsSavedViews.id));
  // A view saved under an older filter format comes back with state null; the UI asks to re-save it.
  return rows.map(row => ({ id: row.id, name: row.name, isDefault: !!row.isDefault, state: parseState(row.state), updatedAt: row.updatedAt }));
}

export async function createSavedView(userId: number, input: { name: string; state: SavedViewState; makeDefault?: boolean }) {
  const db = await appDb();
  const [count] = await db.select({ n: sql<number>`COUNT(*)` }).from(userMlsSavedViews).where(eq(userMlsSavedViews.userId, userId));
  if (Number(count?.n ?? 0) >= MAX_SAVED_VIEWS_PER_USER) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `You can keep up to ${MAX_SAVED_VIEWS_PER_USER} saved views. Delete one first.` });
  }
  let id: number;
  try {
    const [result] = await db.insert(userMlsSavedViews).values({ userId, name: input.name, state: input.state }).$returningId();
    id = result.id;
  } catch (error) {
    if (isDuplicate(error)) throw duplicateName(input.name);
    throw error;
  }
  if (input.makeDefault) await setDefaultSavedView(userId, id);
  return { id };
}

export async function updateSavedView(userId: number, id: number, input: { name?: string; state?: SavedViewState }) {
  if (input.name === undefined && input.state === undefined) return { id };
  const db = await appDb();
  const [existing] = await db.select({ id: userMlsSavedViews.id }).from(userMlsSavedViews)
    .where(and(eq(userMlsSavedViews.id, id), eq(userMlsSavedViews.userId, userId))).limit(1);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Saved view not found" });
  try {
    await db.update(userMlsSavedViews).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
    }).where(and(eq(userMlsSavedViews.id, id), eq(userMlsSavedViews.userId, userId)));
  } catch (error) {
    if (isDuplicate(error) && input.name !== undefined) throw duplicateName(input.name);
    throw error;
  }
  return { id };
}

/** Makes one view the user's default, or clears the default when id is null. */
export async function setDefaultSavedView(userId: number, id: number | null) {
  const db = await appDb();
  await db.transaction(async tx => {
    if (id !== null) {
      const [owned] = await tx.select({ id: userMlsSavedViews.id }).from(userMlsSavedViews)
        .where(and(eq(userMlsSavedViews.id, id), eq(userMlsSavedViews.userId, userId))).limit(1).for("update");
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Saved view not found" });
    }
    // Clear first: the one-default unique key rejects two defaults even mid-transaction.
    await tx.update(userMlsSavedViews).set({ isDefault: false })
      .where(and(eq(userMlsSavedViews.userId, userId), eq(userMlsSavedViews.isDefault, true)));
    if (id !== null) {
      await tx.update(userMlsSavedViews).set({ isDefault: true })
        .where(and(eq(userMlsSavedViews.id, id), eq(userMlsSavedViews.userId, userId)));
    }
  });
  return { id };
}

export async function deleteSavedView(userId: number, id: number) {
  const db = await appDb();
  const [existing] = await db.select({ id: userMlsSavedViews.id }).from(userMlsSavedViews)
    .where(and(eq(userMlsSavedViews.id, id), eq(userMlsSavedViews.userId, userId))).limit(1);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Saved view not found" });
  await db.delete(userMlsSavedViews).where(and(eq(userMlsSavedViews.id, id), eq(userMlsSavedViews.userId, userId)));
  return { id };
}
