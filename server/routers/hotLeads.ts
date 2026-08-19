import { z } from "zod";
import { getDb } from "../db";
import { activityLog, communications, contacts, users, agentConnections, leadSources, emailBehaviors } from "../../drizzle/schema";
import { eq, sql, and, gte, desc, asc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const hotLeadsInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  days: z.enum(["7", "14", "30", "90"]).default("7"),
  isaId: z.number().int().optional(),
  agentId: z.number().int().optional(),
  leadSourceId: z.number().int().optional(),
  pipelineStatus: z.string().optional(),
  sortBy: z.enum(["viewCount", "distinctDays", "totalViews", "clicks", "opens", "lastViewed", "lastEngaged", "contact", "leadSource", "leadScore"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
}).optional();

const intentEventsInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  days: z.enum(["7", "14", "30", "90"]).default("7"),
  isaId: z.number().int().optional(),
  agentId: z.number().int().optional(),
  leadSourceId: z.number().int().optional(),
  pipelineStatus: z.string().optional(),
  sortBy: z.enum(["eventCount", "lastEventAt", "contact", "leadSource", "assignedIsa", "leadScore"]).default("eventCount"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
}).optional();

const deadConnectionsInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  isaId: z.number().int().optional(),
  agentId: z.number().int().optional(),
  leadSourceId: z.number().int().optional(),
  sortBy: z.enum(["deadConnectionCount", "lastUpdatedAt", "contact", "leadSource", "assignedIsa", "leadScore"]).default("lastUpdatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
}).optional();

const temporaryDeadConnectionsExclusionOptions = {
  "1_day": { days: 1, label: "1 day" },
  "7_days": { days: 7, label: "7 days" },
  "14_days": { days: 14, label: "14 days" },
  "30_days": { days: 30, label: "30 days" },
  "90_days": { days: 90, label: "90 days" },
  "6_months": { months: 6, label: "6 months" },
  "1_year": { years: 1, label: "1 year" },
} as const;

type TemporaryDeadConnectionsExclusion = keyof typeof temporaryDeadConnectionsExclusionOptions;

const deadConnectionsRemovalInput = z.object({
  contactId: z.number().int().positive(),
  note: z.string().trim().min(1, "A note is required.").max(2000),
  mode: z.enum(["permanent", "temporary"]),
  temporaryDuration: z.enum(["1_day", "7_days", "14_days", "30_days", "90_days", "6_months", "1_year"]).optional(),
}).refine(
  (input) => input.mode === "permanent" || Boolean(input.temporaryDuration),
  { message: "Choose how long this contact should stay off the list.", path: ["temporaryDuration"] },
);

function assertHotLeadsAccess(role: string) {
  if (role !== "admin" && role !== "isa" && role !== "agent") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
}

function assertDeadConnectionsAccess(role: string) {
  if (role !== "admin" && role !== "isa") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Dead Connections is available to admins and ISAs only" });
  }
}

function getTemporaryDeadConnectionsExclusionExpiry(option: TemporaryDeadConnectionsExclusion, from: Date): Date {
  const expiry = new Date(from);
  const config = temporaryDeadConnectionsExclusionOptions[option];
  if ("days" in config) expiry.setDate(expiry.getDate() + config.days);
  if ("months" in config) expiry.setMonth(expiry.getMonth() + config.months);
  if ("years" in config) expiry.setFullYear(expiry.getFullYear() + config.years);
  return expiry;
}

/** Batch lookup ISA names */
async function batchLookupIsas(db: any, isaIds: number[]): Promise<Record<number, string>> {
  if (isaIds.length === 0) return {};
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`${users.id} IN (${sql.raw(isaIds.join(","))})`);
  return Object.fromEntries(rows.map((r: any) => [r.id, r.name ?? "Unknown"]));
}

/** Batch lookup lead source names */
async function batchLookupLeadSources(db: any, ids: number[]): Promise<Record<number, string>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: leadSources.id, name: leadSources.name })
    .from(leadSources)
    .where(sql`${leadSources.id} IN (${sql.raw(ids.join(","))})`);
  return Object.fromEntries(rows.map((r: any) => [r.id, r.name]));
}

/** Batch lookup ALL agent connections per contact (returns array of agents) */
async function batchLookupAllAgents(
  db: any, contactIds: number[], role: string, userId: number
): Promise<Record<number, Array<{ name: string; connectionId: number }>>> {
  if (contactIds.length === 0) return {};
  const agentQuery = role === "agent"
    ? sql`${agentConnections.contactId} IN (${sql.raw(contactIds.join(","))}) AND ${agentConnections.agentId} = ${userId}`
    : sql`${agentConnections.contactId} IN (${sql.raw(contactIds.join(","))})`;

  const rows = await db
    .select({
      contactId: agentConnections.contactId,
      connectionId: agentConnections.id,
      agentName: users.name,
    })
    .from(agentConnections)
    .innerJoin(users, eq(agentConnections.agentId, users.id))
    .where(agentQuery);

  const map: Record<number, Array<{ name: string; connectionId: number }>> = {};
  for (const row of rows) {
    if (!map[row.contactId]) map[row.contactId] = [];
    map[row.contactId].push({ name: row.agentName ?? "Unknown", connectionId: row.connectionId });
  }
  return map;
}

/** Ensure a timestamp string from MySQL is treated as UTC on the client.
 * Drizzle returns sql<string> MAX(timestamp) as 'YYYY-MM-DD HH:mm:ss' without
 * a timezone indicator. Browsers parse such strings as local time, causing
 * negative relative-time values for users west of UTC. Appending 'Z' marks it
 * as UTC so Date parsing is correct regardless of the client's timezone. */
function ensureUtc(ts: string | null | undefined): string | null {
  if (!ts) return null;
  // Already has timezone info (ISO 8601 Z or offset)
  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) return ts;
  // Convert space-separated MySQL format to ISO and append Z
  return ts.replace(' ', 'T') + 'Z';
}

function rowsFromResult(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as Array<Record<string, unknown>>;
  }
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  return [];
}

type LeadScoreSignal = {
  score: number;
  signals: string[];
};

/**
 * Lead Score is calculated within the selected Hot Leads time range. It is a
 * transparent 0–100 score that prioritizes explicit buying intent over passive
 * browsing: analysis and showing requests (60), favorites (15), return and
 * volume-based property views (15), and email clicks/opens (10).
 */
async function batchLookupLeadScores(
  db: any,
  contactIds: number[],
  sinceDate: Date
): Promise<Record<number, LeadScoreSignal>> {
  if (!contactIds.length) return {};
  const contactList = sql.raw(contactIds.join(","));
  const activityContactId = sql`COALESCE(${activityLog.relatedContactId}, CASE WHEN ${activityLog.entityType} = 'contact' THEN ${activityLog.entityId} END)`;
  const [websiteRows, emailRows] = await Promise.all([
    db.execute(sql`
      SELECT
        ${activityContactId} AS contactId,
        SUM(CASE WHEN ${activityLog.action} = 'property_viewed' THEN 1 ELSE 0 END) AS propertyViews,
        COUNT(DISTINCT CASE WHEN ${activityLog.action} = 'property_viewed' THEN DATE(${activityLog.createdAt}) END) AS propertyViewDays,
        SUM(CASE WHEN ${activityLog.action} = 'property_favorited' THEN 1 ELSE 0 END) AS favorites,
        SUM(CASE WHEN ${activityLog.action} = 'analysis_requested' THEN 1 ELSE 0 END) AS analysisRequests,
        SUM(CASE WHEN ${activityLog.action} = 'showing_requested' THEN 1 ELSE 0 END) AS showingRequests
      FROM ${activityLog}
      WHERE ${activityContactId} IN (${contactList})
        AND ${activityLog.action} IN ('property_viewed', 'property_favorited', 'analysis_requested', 'showing_requested')
        AND ${activityLog.createdAt} >= ${sinceDate}
      GROUP BY ${activityContactId}
    `),
    db.execute(sql`
      SELECT ${emailBehaviors.contactId} AS contactId,
        COUNT(CASE WHEN ${emailBehaviors.openedAt} >= ${sinceDate} THEN 1 END) AS opens,
        COUNT(CASE WHEN ${emailBehaviors.clickedAt} >= ${sinceDate} THEN 1 END) AS clicks
      FROM ${emailBehaviors}
      WHERE ${emailBehaviors.contactId} IN (${contactList})
        AND (${emailBehaviors.openedAt} >= ${sinceDate} OR ${emailBehaviors.clickedAt} >= ${sinceDate})
      GROUP BY ${emailBehaviors.contactId}
    `),
  ]);

  const normalizedWebsiteRows = rowsFromResult(websiteRows);
  const normalizedEmailRows = rowsFromResult(emailRows);
  const emailByContact = new Map(normalizedEmailRows.map(row => [Number(row.contactId), row]));
  const result: Record<number, LeadScoreSignal> = {};
  const allContactIds = new Set<number>([
    ...normalizedWebsiteRows.map(row => Number(row.contactId)),
    ...normalizedEmailRows.map(row => Number(row.contactId)),
  ]);

  for (const contactId of Array.from(allContactIds)) {
    const row = normalizedWebsiteRows.find(candidate => Number(candidate.contactId) === contactId);
    const email = emailByContact.get(contactId);
    const propertyViews = Number(row?.propertyViews ?? 0);
    const propertyViewDays = Number(row?.propertyViewDays ?? 0);
    const favorites = Number(row?.favorites ?? 0);
    const analysisRequests = Number(row?.analysisRequests ?? 0);
    const showingRequests = Number(row?.showingRequests ?? 0);
    const opens = Number(email?.opens ?? 0);
    const clicks = Number(email?.clicks ?? 0);
    const signals: string[] = [];
    const analysisPoints = Math.min(analysisRequests, 1) * 30;
    const showingPoints = Math.min(showingRequests, 1) * 30;
    const favoritePoints = Math.min(favorites, 3) * 5;
    const returnPoints = Math.min(Math.max(propertyViewDays - 1, 0), 2) * 5;
    const viewPoints = Math.min(Math.ceil(propertyViews / 5), 5);
    const clickPoints = Math.min(clicks, 5);
    const openPoints = Math.min(opens, 5);

    if (analysisPoints) signals.push(`Analysis requested (+${analysisPoints})`);
    if (showingPoints) signals.push(`Showing requested (+${showingPoints})`);
    if (favoritePoints) signals.push(`Properties favorited (+${favoritePoints})`);
    if (returnPoints) signals.push(`Return visits (+${returnPoints})`);
    if (viewPoints) signals.push(`Property views (+${viewPoints})`);
    if (clickPoints) signals.push(`Email clicks (+${clickPoints})`);
    if (openPoints) signals.push(`Email opens (+${openPoints})`);

    result[contactId] = {
      score: Math.min(100, analysisPoints + showingPoints + favoritePoints + returnPoints + viewPoints + clickPoints + openPoints),
      signals,
    };
  }
  return result;
}

function addLeadScores<T extends { contactId: number }>(
  items: T[],
  scoreByContact: Record<number, LeadScoreSignal>
) {
  return items.map(item => {
    const leadScore = scoreByContact[item.contactId] ?? { score: 0, signals: [] };
    return { ...item, leadScore: leadScore.score, leadScoreSignals: leadScore.signals };
  });
}

const LEAD_SCORE_SORT_FETCH_LIMIT = 10_000;

function applyLeadScoreSort<T extends { contactId: number; leadScore: number }>(
  items: T[],
  sortBy: string | undefined,
  sortDirection: "asc" | "desc",
  offset: number,
  limit: number,
): T[] {
  if (sortBy !== "leadScore") return items;
  const multiplier = sortDirection === "asc" ? 1 : -1;
  return [...items]
    .sort((left, right) => {
      const scoreDifference = (left.leadScore - right.leadScore) * multiplier;
      return scoreDifference || left.contactId - right.contactId;
    })
    .slice(offset, offset + limit);
}

async function getWebsiteIntentEvents(
  db: any,
  ctx: { user: { id: number; role: string } },
  input: any,
  action: "property_favorited" | "analysis_requested"
) {
  const role = ctx.user.role;
  const page = input?.page ?? 1;
  const limit = input?.limit ?? 50;
  const offset = (page - 1) * limit;
  const days = parseInt(input?.days ?? "7");
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const activityContactId = sql`COALESCE(${activityLog.relatedContactId}, CASE WHEN ${activityLog.entityType} = 'contact' THEN ${activityLog.entityId} END)`;
  const baseConditions = [
    eq(activityLog.action, action),
    gte(activityLog.createdAt, sinceDate),
    sql`(${contacts.email} IS NULL OR ${contacts.email} NOT LIKE '%@savvy.realty')`,
  ];

  if (input?.leadSourceId) baseConditions.push(eq(contacts.leadSourceId, input.leadSourceId));

  if (role === "agent") {
    if (input?.pipelineStatus) {
      baseConditions.push(sql`EXISTS (SELECT 1 FROM agent_connections ac_scope WHERE ac_scope.contactId = ${contacts.id} AND ac_scope.agentId = ${ctx.user.id} AND ac_scope.pipelineStatus = ${input.pipelineStatus})`);
    } else {
      baseConditions.push(sql`EXISTS (SELECT 1 FROM agent_connections ac_scope WHERE ac_scope.contactId = ${contacts.id} AND ac_scope.agentId = ${ctx.user.id})`);
    }
  } else {
    if (input?.isaId) baseConditions.push(eq(contacts.assignedIsaId, input.isaId));
    if (input?.agentId) baseConditions.push(sql`EXISTS (SELECT 1 FROM agent_connections ac_scope WHERE ac_scope.contactId = ${contacts.id} AND ac_scope.agentId = ${input.agentId})`);
  }

  const direction = input?.sortDirection === "asc" ? asc : desc;
  const sortBy = input?.sortBy ?? "eventCount";
  const isLeadScoreSort = sortBy === "leadScore";
  const sortExpression = sortBy === "lastEventAt"
      ? sql`lastEventAt`
      : sortBy === "contact"
      ? contacts.lastName
      : sortBy === "leadSource"
        ? leadSources.name
        : sortBy === "assignedIsa"
          ? users.name
          : sql`eventCount`;
  const rows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      assignedIsaId: contacts.assignedIsaId,
      leadSourceId: contacts.leadSourceId,
      eventCount: sql<number>`COUNT(${activityLog.id})`.as("eventCount"),
      lastEventAt: sql<string>`MAX(${activityLog.createdAt})`.as("lastEventAt"),
      leadSourceSort: leadSources.name,
      assignedIsaSort: users.name,
    })
    .from(activityLog)
    .innerJoin(contacts, sql`${contacts.id} = ${activityContactId}`)
    .leftJoin(leadSources, eq(leadSources.id, contacts.leadSourceId))
    .leftJoin(users, eq(users.id, contacts.assignedIsaId))
    .where(and(...baseConditions))
    .groupBy(contacts.id, leadSources.name, users.name)
    .orderBy(direction(sortExpression), desc(sql`eventCount`), desc(sql`lastEventAt`))
    .limit(isLeadScoreSort ? LEAD_SCORE_SORT_FETCH_LIMIT : limit)
    .offset(isLeadScoreSort ? 0 : offset);

  const [countResult] = await db
    .select({ total: sql<number>`COUNT(DISTINCT ${activityContactId})` })
    .from(activityLog)
    .innerJoin(contacts, sql`${contacts.id} = ${activityContactId}`)
    .where(and(...baseConditions));

  const contactIds = rows.map((row: any) => row.contactId);
  const isaIds = Array.from(new Set(rows.map((row: any) => row.assignedIsaId).filter(Boolean))) as number[];
  const leadSourceIds = Array.from(new Set(rows.map((row: any) => row.leadSourceId).filter(Boolean))) as number[];
  const [isaMap, leadSourceMap, agentMap, leadScoreByContact] = await Promise.all([
    batchLookupIsas(db, isaIds),
    batchLookupLeadSources(db, leadSourceIds),
    batchLookupAllAgents(db, contactIds, role, ctx.user.id),
    batchLookupLeadScores(db, contactIds, sinceDate),
  ]);

  const propertyRows = contactIds.length ? await db
    .select({ contactId: activityContactId, details: activityLog.details })
    .from(activityLog)
    .where(and(eq(activityLog.action, action), gte(activityLog.createdAt, sinceDate), sql`${activityContactId} IN (${sql.raw(contactIds.join(","))})`))
    .orderBy(desc(activityLog.createdAt)) : [];
  const lastPropertyMap: Record<number, string> = {};
  for (const row of propertyRows) {
    const contactId = Number(row.contactId);
    const details = row.details as any;
    if (!lastPropertyMap[contactId] && details?.propertyAddress) lastPropertyMap[contactId] = details.propertyAddress;
  }

  const items = addLeadScores(rows.map((row: any) => ({
    contactId: row.contactId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    eventCount: Number(row.eventCount ?? 0),
    lastEventAt: ensureUtc(row.lastEventAt),
    lastPropertyAddress: lastPropertyMap[row.contactId] ?? null,
    assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
    leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
    connectedAgents: agentMap[row.contactId] ?? [],
  })), leadScoreByContact);
  const totalCount = Number(countResult?.total ?? 0);
  const paginatedItems = applyLeadScoreSort(items, sortBy, input?.sortDirection ?? "desc", offset, limit);
  return { items: paginatedItems, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
}

// ─── Hot Leads Router ─────────────────────────────────────────────────────────

export const hotLeadsRouter = router({
  /**
   * removeDeadConnection — hides an eligible contact from Dead Connections and
   * writes the required operator note into the contact's Notes history.
   */
  removeDeadConnection: protectedProcedure
    .input(deadConnectionsRemovalInput)
    .mutation(async ({ ctx, input }) => {
      assertDeadConnectionsAccess(ctx.user.role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [contact] = await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(
          eq(contacts.id, input.contactId),
          eq(contacts.doNotContact, false),
          sql`EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.contactId = ${contacts.id})`,
          sql`NOT EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.contactId = ${contacts.id} AND ac.pipelineStatus <> 'dead')`,
        ))
        .limit(1);

      if (!contact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This contact is no longer eligible for the Dead Connections list." });
      }

      const excludedAt = new Date();
      const temporaryOption = input.temporaryDuration
        ? temporaryDeadConnectionsExclusionOptions[input.temporaryDuration]
        : null;
      const excludedUntil = input.mode === "temporary" && input.temporaryDuration
        ? getTemporaryDeadConnectionsExclusionExpiry(input.temporaryDuration, excludedAt)
        : null;
      const choiceLabel = input.mode === "permanent"
        ? "Permanently taken off the Dead Connections list"
        : `Temporarily taken off the Dead Connections list for ${temporaryOption?.label} (returns ${excludedUntil!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
      const noteBody = `${choiceLabel}.\n\nOperator note: ${input.note.trim()}`;

      await (db as any).transaction(async (tx: any) => {
        await tx.update(contacts).set({
          deadConnectionsExclusionMode: input.mode,
          deadConnectionsExcludedAt: excludedAt,
          deadConnectionsExcludedUntil: excludedUntil,
          deadConnectionsExcludedByUserId: ctx.user.id,
        }).where(eq(contacts.id, contact.id));

        const [noteResult] = await tx.insert(communications).values({
          type: "note",
          subject: "Dead Connections list removal",
          body: noteBody,
          direction: "internal",
          authorId: ctx.user.id,
          relatedContactId: contact.id,
        });

        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "dead_connections_list_removal",
          entityType: "contact",
          entityId: contact.id,
          relatedContactId: contact.id,
          details: {
            actorName: ctx.user.name ?? "Unknown",
            actorRole: ctx.user.role,
            contactName: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "Unknown Contact",
            mode: input.mode,
            temporaryDuration: input.temporaryDuration ?? null,
            excludedAt: excludedAt.toISOString(),
            excludedUntil: excludedUntil?.toISOString() ?? null,
            noteId: Number(noteResult.insertId),
          },
        });
      });

      return { success: true, excludedUntil };
    }),

  propertyFavorites: protectedProcedure
    .input(intentEventsInput)
    .query(async ({ ctx, input }) => {
      assertHotLeadsAccess(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return getWebsiteIntentEvents(db, ctx, input, "property_favorited");
    }),

  analysisRequests: protectedProcedure
    .input(intentEventsInput)
    .query(async ({ ctx, input }) => {
      assertHotLeadsAccess(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return getWebsiteIntentEvents(db, ctx, input, "analysis_requested");
    }),

  /**
   * deadConnections — contacts with one or more agent connections where every
   * current connection is marked dead. This excludes any contact with an active,
   * closed, do-not-contact, or otherwise non-dead connection.
   */
  deadConnections: protectedProcedure
    .input(deadConnectionsInput)
    .query(async ({ ctx, input }) => {
      const role = ctx.user.role;
      assertDeadConnectionsAccess(role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;
      const scoreSinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const direction = input?.sortDirection === "asc" ? asc : desc;
      const sortBy = input?.sortBy ?? "lastUpdatedAt";
      const isLeadScoreSort = sortBy === "leadScore";
      const sortExpression = sortBy === "deadConnectionCount"
        ? sql`deadConnectionCount`
        : sortBy === "contact"
          ? sql`CONCAT(COALESCE(${contacts.lastName}, ''), ' ', COALESCE(${contacts.firstName}, ''))`
          : sortBy === "leadSource"
            ? sql`(SELECT source.\`name\` FROM \`lead_sources\` source WHERE source.\`id\` = ${contacts.leadSourceId})`
            : sortBy === "assignedIsa"
              ? sql`(SELECT isa.\`name\` FROM \`users\` isa WHERE isa.\`id\` = ${contacts.assignedIsaId})`
              : sql`lastUpdatedAt`;
      const baseConditions = [
        sql`(${contacts.email} IS NULL OR ${contacts.email} NOT LIKE '%@savvy.realty')`,
        eq(contacts.doNotContact, false),
        sql`(${contacts.deadConnectionsExcludedAt} IS NULL OR (${contacts.deadConnectionsExcludedUntil} IS NOT NULL AND ${contacts.deadConnectionsExcludedUntil} <= NOW()))`,
        sql`EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.contactId = ${contacts.id})`,
        sql`NOT EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.contactId = ${contacts.id} AND ac.pipelineStatus <> 'dead')`,
      ];

      if (input?.leadSourceId) baseConditions.push(eq(contacts.leadSourceId, input.leadSourceId));
      if (input?.isaId) {
        baseConditions.push(eq(contacts.assignedIsaId, input.isaId));
      }
      if (input?.agentId) {
        baseConditions.push(
          sql`EXISTS (SELECT 1 FROM agent_connections ac WHERE ac.contactId = ${contacts.id} AND ac.agentId = ${input.agentId})`
        );
      }

      const rows = await db
        .select({
          contactId: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          assignedIsaId: contacts.assignedIsaId,
          leadSourceId: contacts.leadSourceId,
          deadConnectionCount: sql<number>`COUNT(${agentConnections.id})`.as("deadConnectionCount"),
          lastUpdatedAt: sql<string>`MAX(${agentConnections.updatedAt})`.as("lastUpdatedAt"),
        })
        .from(contacts)
        .innerJoin(agentConnections, eq(agentConnections.contactId, contacts.id))
        .where(and(...baseConditions))
        .groupBy(contacts.id)
        .orderBy(direction(sortExpression), desc(sql`deadConnectionCount`), desc(sql`lastUpdatedAt`))
        .limit(isLeadScoreSort ? LEAD_SCORE_SORT_FETCH_LIMIT : limit)
        .offset(isLeadScoreSort ? 0 : offset);

      const [countResult] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(contacts)
        .where(and(...baseConditions));

      const contactIds = rows.map((row: any) => row.contactId);
      const isaIds = Array.from(new Set(rows.map((row: any) => row.assignedIsaId).filter(Boolean))) as number[];
      const leadSourceIds = Array.from(new Set(rows.map((row: any) => row.leadSourceId).filter(Boolean))) as number[];
      const [isaMap, leadSourceMap, agentMap, leadScoreByContact] = await Promise.all([
        batchLookupIsas(db, isaIds),
        batchLookupLeadSources(db, leadSourceIds),
        batchLookupAllAgents(db, contactIds, role, ctx.user.id),
        batchLookupLeadScores(db, contactIds, scoreSinceDate),
      ]);

      const items = addLeadScores(rows.map((row: any) => ({
        contactId: row.contactId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        deadConnectionCount: Number(row.deadConnectionCount ?? 0),
        lastUpdatedAt: ensureUtc(row.lastUpdatedAt),
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgents: agentMap[row.contactId] ?? [],
      })), leadScoreByContact);

      const totalCount = Number(countResult?.total ?? 0);
      const paginatedItems = applyLeadScoreSort(items, sortBy, input?.sortDirection ?? "desc", offset, limit);
      return { items: paginatedItems, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
    }),

  /**
   * propertyViews — contacts with property views in the selected time range,
   * sorted by view count descending.
   */
  propertyViews: protectedProcedure
    .input(hotLeadsInput)
    .query(async ({ ctx, input }) => {
      const role = ctx.user.role;
      assertHotLeadsAccess(role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;
      const days = parseInt(input?.days ?? "7");
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const baseConditions = [
        eq(activityLog.action, "property_viewed"),
        eq(activityLog.entityType, "contact"),
        gte(activityLog.createdAt, sinceDate),
        sql`(${contacts.email} IS NULL OR ${contacts.email} NOT LIKE '%@savvy.realty')`,
      ];
      if (input?.leadSourceId) baseConditions.push(eq(contacts.leadSourceId, input.leadSourceId));

      // Agent scoping
      if (role === "agent") {
        if (input?.pipelineStatus) {
          baseConditions.push(
            sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id} AND pipelineStatus = ${input.pipelineStatus})`
          );
        } else {
          baseConditions.push(
            sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id})`
          );
        }
      }

      // Admin/ISA filters
      if (role !== "agent") {
        if (input?.isaId) {
          baseConditions.push(sql`${contacts.assignedIsaId} = ${input.isaId}`);
        }
        if (input?.agentId) {
          baseConditions.push(
            sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${input.agentId})`
          );
        }
      }

      const direction = input?.sortDirection === "asc" ? asc : desc;
      const sortBy = input?.sortBy ?? "viewCount";
      const isLeadScoreSort = sortBy === "leadScore";
      const sortExpression = sortBy === "lastViewed"
          ? sql`lastViewed`
          : sortBy === "contact"
            ? contacts.lastName
            : sortBy === "leadSource"
              ? leadSources.name
              : sql`viewCount`;
      const rows = await db
        .select({
          contactId: activityLog.entityId,
          viewCount: sql<number>`COUNT(*)`.as("viewCount"),
          lastViewed: sql<string>`MAX(${activityLog.createdAt})`.as("lastViewed"),
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          assignedIsaId: contacts.assignedIsaId,
          leadSourceId: contacts.leadSourceId,
        })
        .from(activityLog)
        .innerJoin(contacts, eq(activityLog.entityId, contacts.id))
        .leftJoin(leadSources, eq(leadSources.id, contacts.leadSourceId))
        .where(and(...baseConditions))
        .groupBy(activityLog.entityId, leadSources.name)
        .orderBy(direction(sortExpression), desc(sql`viewCount`), desc(sql`lastViewed`))
        .limit(isLeadScoreSort ? LEAD_SCORE_SORT_FETCH_LIMIT : limit)
        .offset(isLeadScoreSort ? 0 : offset);

      const [countResult] = await db
        .select({ total: sql<number>`COUNT(DISTINCT ${activityLog.entityId})` })
        .from(activityLog)
        .innerJoin(contacts, eq(activityLog.entityId, contacts.id))
        .where(and(...baseConditions));

      const totalCount = countResult?.total ?? 0;
      const contactIds = rows.map(r => r.contactId).filter(Boolean) as number[];
      const isaIds = Array.from(new Set(rows.map(r => r.assignedIsaId).filter(Boolean))) as number[];
      const leadSourceIds = Array.from(new Set(rows.map(r => r.leadSourceId).filter(Boolean))) as number[];

      const [isaMap, leadSourceMap, agentMap, leadScoreByContact] = await Promise.all([
        batchLookupIsas(db, isaIds),
        batchLookupLeadSources(db, leadSourceIds),
        batchLookupAllAgents(db, contactIds, role, ctx.user.id),
        batchLookupLeadScores(db, contactIds, sinceDate),
      ]);

      // Last property address lookup
      let lastPropertyMap: Record<number, string> = {};
      if (contactIds.length > 0) {
        const propRows = await db
          .select({ entityId: activityLog.entityId, details: activityLog.details })
          .from(activityLog)
          .where(and(
            eq(activityLog.action, "property_viewed"),
            eq(activityLog.entityType, "contact"),
            gte(activityLog.createdAt, sinceDate),
            sql`${activityLog.entityId} IN (${sql.raw(contactIds.join(","))})`
          ))
          .orderBy(desc(activityLog.createdAt));
        for (const row of propRows) {
          const cId = row.entityId!;
          if (!lastPropertyMap[cId] && row.details) {
            const d = row.details as any;
            if (d.propertyAddress) lastPropertyMap[cId] = d.propertyAddress;
          }
        }
      }

      const results = addLeadScores(rows.map(row => ({
        contactId: row.contactId!,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        viewCount: row.viewCount,
        lastViewed: ensureUtc(row.lastViewed),
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgents: agentMap[row.contactId!] ?? [],
        lastPropertyAddress: lastPropertyMap[row.contactId!] ?? null,
      })), leadScoreByContact);

      const paginatedItems = applyLeadScoreSort(results, sortBy, input?.sortDirection ?? "desc", offset, limit);
      return { items: paginatedItems, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
    }),

  /**
   * returnVisitors — contacts who viewed properties on multiple distinct days.
   */
  returnVisitors: protectedProcedure
    .input(hotLeadsInput)
    .query(async ({ ctx, input }) => {
      const role = ctx.user.role;
      assertHotLeadsAccess(role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;
      const days = parseInt(input?.days ?? "7");
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const baseConditions = [
        eq(activityLog.action, "property_viewed"),
        eq(activityLog.entityType, "contact"),
        gte(activityLog.createdAt, sinceDate),
        sql`(${contacts.email} IS NULL OR ${contacts.email} NOT LIKE '%@savvy.realty')`,
      ];
      if (input?.leadSourceId) baseConditions.push(eq(contacts.leadSourceId, input.leadSourceId));

      if (role === "agent") {
        if (input?.pipelineStatus) {
          baseConditions.push(
            sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id} AND pipelineStatus = ${input.pipelineStatus})`
          );
        } else {
          baseConditions.push(
            sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id})`
          );
        }
      }

      if (role !== "agent") {
        if (input?.isaId) {
          baseConditions.push(sql`${contacts.assignedIsaId} = ${input.isaId}`);
        }
        if (input?.agentId) {
          baseConditions.push(
            sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${input.agentId})`
          );
        }
      }

      const direction = input?.sortDirection === "asc" ? asc : desc;
      const sortBy = input?.sortBy ?? "distinctDays";
      const isLeadScoreSort = sortBy === "leadScore";
      const sortExpression = sortBy === "totalViews"
          ? sql`totalViews`
          : sortBy === "lastViewed"
            ? sql`lastViewed`
            : sortBy === "contact"
              ? contacts.lastName
              : sortBy === "leadSource"
                ? leadSources.name
                : sql`distinctDays`;
      const rows = await db
        .select({
          contactId: activityLog.entityId,
          distinctDays: sql<number>`COUNT(DISTINCT DATE(${activityLog.createdAt}))`.as("distinctDays"),
          totalViews: sql<number>`COUNT(*)`.as("totalViews"),
          lastViewed: sql<string>`MAX(${activityLog.createdAt})`.as("lastViewed"),
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          assignedIsaId: contacts.assignedIsaId,
          leadSourceId: contacts.leadSourceId,
        })
        .from(activityLog)
        .innerJoin(contacts, eq(activityLog.entityId, contacts.id))
        .leftJoin(leadSources, eq(leadSources.id, contacts.leadSourceId))
        .where(and(...baseConditions))
        .groupBy(activityLog.entityId, leadSources.name)
        .having(sql`COUNT(DISTINCT DATE(${activityLog.createdAt})) >= 2`)
        .orderBy(direction(sortExpression), desc(sql`distinctDays`), desc(sql`totalViews`))
        .limit(isLeadScoreSort ? LEAD_SCORE_SORT_FETCH_LIMIT : limit)
        .offset(isLeadScoreSort ? 0 : offset);

      const countRows = await db
        .select({
          contactId: activityLog.entityId,
          distinctDays: sql<number>`COUNT(DISTINCT DATE(${activityLog.createdAt}))`.as("distinctDays"),
        })
        .from(activityLog)
        .innerJoin(contacts, eq(activityLog.entityId, contacts.id))
        .where(and(...baseConditions))
        .groupBy(activityLog.entityId)
        .having(sql`COUNT(DISTINCT DATE(${activityLog.createdAt})) >= 2`);
      const totalCount = countRows.length;

      const contactIds = rows.map(r => r.contactId).filter(Boolean) as number[];
      const isaIds = Array.from(new Set(rows.map(r => r.assignedIsaId).filter(Boolean))) as number[];
      const leadSourceIds = Array.from(new Set(rows.map(r => r.leadSourceId).filter(Boolean))) as number[];

      const [isaMap, leadSourceMap, agentMap, leadScoreByContact] = await Promise.all([
        batchLookupIsas(db, isaIds),
        batchLookupLeadSources(db, leadSourceIds),
        batchLookupAllAgents(db, contactIds, role, ctx.user.id),
        batchLookupLeadScores(db, contactIds, sinceDate),
      ]);

      const results = addLeadScores(rows.map(row => ({
        contactId: row.contactId!,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        distinctDays: row.distinctDays,
        totalViews: row.totalViews,
        lastViewed: ensureUtc(row.lastViewed),
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgents: agentMap[row.contactId!] ?? [],
      })), leadScoreByContact);

      const paginatedItems = applyLeadScoreSort(results, sortBy, input?.sortDirection ?? "desc", offset, limit);
      return { items: paginatedItems, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
    }),

  /**
   * emailEngagement — contacts who opened or clicked emails recently.
   */
  emailEngagement: protectedProcedure
    .input(hotLeadsInput)
    .query(async ({ ctx, input }) => {
      const role = ctx.user.role;
      assertHotLeadsAccess(role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;
      const days = parseInt(input?.days ?? "7");
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const baseConditions = [
        sql`${emailBehaviors.contactId} IS NOT NULL`,
        sql`(${emailBehaviors.openedAt} >= ${sinceDate} OR ${emailBehaviors.clickedAt} >= ${sinceDate})`,
        sql`(${contacts.email} IS NULL OR ${contacts.email} NOT LIKE '%@savvy.realty')`,
      ];
      if (input?.leadSourceId) baseConditions.push(eq(contacts.leadSourceId, input.leadSourceId));

      if (role === "agent") {
        if (input?.pipelineStatus) {
          baseConditions.push(
            sql`${emailBehaviors.contactId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id} AND pipelineStatus = ${input.pipelineStatus})`
          );
        } else {
          baseConditions.push(
            sql`${emailBehaviors.contactId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id})`
          );
        }
      }

      if (role !== "agent") {
        if (input?.isaId) {
          baseConditions.push(sql`${contacts.assignedIsaId} = ${input.isaId}`);
        }
        if (input?.agentId) {
          baseConditions.push(
            sql`${emailBehaviors.contactId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${input.agentId})`
          );
        }
      }

      const direction = input?.sortDirection === "asc" ? asc : desc;
      const sortBy = input?.sortBy ?? "clicks";
      const isLeadScoreSort = sortBy === "leadScore";
      const sortExpression = sortBy === "opens"
          ? sql`opens`
          : sortBy === "lastEngaged"
            ? sql`lastEngaged`
            : sortBy === "contact"
              ? contacts.lastName
              : sortBy === "leadSource"
                ? leadSources.name
                : sql`clicks`;
      const rows = await db
        .select({
          contactId: emailBehaviors.contactId,
          opens: sql<number>`COUNT(CASE WHEN ${emailBehaviors.openedAt} >= ${sinceDate} THEN 1 END)`.as("opens"),
          clicks: sql<number>`COUNT(CASE WHEN ${emailBehaviors.clickedAt} >= ${sinceDate} THEN 1 END)`.as("clicks"),
          lastEngaged: sql<string>`GREATEST(MAX(${emailBehaviors.openedAt}), MAX(${emailBehaviors.clickedAt}))`.as("lastEngaged"),
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          assignedIsaId: contacts.assignedIsaId,
          leadSourceId: contacts.leadSourceId,
        })
        .from(emailBehaviors)
        .innerJoin(contacts, eq(emailBehaviors.contactId, contacts.id))
        .leftJoin(leadSources, eq(leadSources.id, contacts.leadSourceId))
        .where(and(...baseConditions))
        .groupBy(emailBehaviors.contactId, leadSources.name)
        .orderBy(direction(sortExpression), desc(sql`clicks`), desc(sql`opens`))
        .limit(isLeadScoreSort ? LEAD_SCORE_SORT_FETCH_LIMIT : limit)
        .offset(isLeadScoreSort ? 0 : offset);

      const countRows = await db
        .select({ contactId: emailBehaviors.contactId })
        .from(emailBehaviors)
        .innerJoin(contacts, eq(emailBehaviors.contactId, contacts.id))
        .where(and(...baseConditions))
        .groupBy(emailBehaviors.contactId);
      const totalCount = countRows.length;

      const contactIds = rows.map(r => r.contactId).filter(Boolean) as number[];
      const isaIds = Array.from(new Set(rows.map(r => r.assignedIsaId).filter(Boolean))) as number[];
      const leadSourceIds = Array.from(new Set(rows.map(r => r.leadSourceId).filter(Boolean))) as number[];

      const [isaMap, leadSourceMap, agentMap, leadScoreByContact] = await Promise.all([
        batchLookupIsas(db, isaIds),
        batchLookupLeadSources(db, leadSourceIds),
        batchLookupAllAgents(db, contactIds, role, ctx.user.id),
        batchLookupLeadScores(db, contactIds, sinceDate),
      ]);

      const results = addLeadScores(rows.map(row => ({
        contactId: row.contactId!,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        opens: row.opens,
        clicks: row.clicks,
        lastEngaged: ensureUtc(row.lastEngaged),
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgents: agentMap[row.contactId!] ?? [],
      })), leadScoreByContact);

      const paginatedItems = applyLeadScoreSort(results, sortBy, input?.sortDirection ?? "desc", offset, limit);
      return { items: paginatedItems, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
    }),
});
