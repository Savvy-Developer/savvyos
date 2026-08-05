import { z } from "zod";
import { getDb } from "../db";
import { activityLog, contacts, users, agentConnections, leadSources, emailBehaviors } from "../../drizzle/schema";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const daysInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  days: z.enum(["7", "14", "30", "90"]).default("7"),
}).optional();

function assertHotLeadsAccess(role: string) {
  if (role !== "admin" && role !== "isa" && role !== "agent") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
  }
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

/** Batch lookup agent connections */
async function batchLookupAgents(
  db: any, contactIds: number[], role: string, userId: number
): Promise<Record<number, { name: string; connectionId: number }>> {
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

  const map: Record<number, { name: string; connectionId: number }> = {};
  for (const row of rows) {
    if (!map[row.contactId]) {
      map[row.contactId] = { name: row.agentName ?? "Unknown", connectionId: row.connectionId };
    }
  }
  return map;
}

// ─── Hot Leads Router ─────────────────────────────────────────────────────────

export const hotLeadsRouter = router({
  /**
   * propertyViews — contacts with property views in the selected time range,
   * sorted by view count descending.
   */
  propertyViews: protectedProcedure
    .input(daysInput)
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
      if (role === "agent") {
        baseConditions.push(
          sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id})`
        );
      }

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
        .where(and(...baseConditions))
        .groupBy(activityLog.entityId)
        .orderBy(desc(sql`viewCount`))
        .limit(limit)
        .offset(offset);

      const [countResult] = await db
        .select({ total: sql<number>`COUNT(DISTINCT ${activityLog.entityId})` })
        .from(activityLog)
        .innerJoin(contacts, eq(activityLog.entityId, contacts.id))
        .where(and(...baseConditions));

      const totalCount = countResult?.total ?? 0;
      const contactIds = rows.map(r => r.contactId).filter(Boolean) as number[];
      const isaIds = Array.from(new Set(rows.map(r => r.assignedIsaId).filter(Boolean))) as number[];
      const leadSourceIds = Array.from(new Set(rows.map(r => r.leadSourceId).filter(Boolean))) as number[];

      const [isaMap, leadSourceMap, agentMap] = await Promise.all([
        batchLookupIsas(db, isaIds),
        batchLookupLeadSources(db, leadSourceIds),
        batchLookupAgents(db, contactIds, role, ctx.user.id),
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

      const results = rows.map(row => ({
        contactId: row.contactId!,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        viewCount: row.viewCount,
        lastViewed: row.lastViewed,
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgent: agentMap[row.contactId!]?.name ?? null,
        connectionId: agentMap[row.contactId!]?.connectionId ?? null,
        lastPropertyAddress: lastPropertyMap[row.contactId!] ?? null,
      }));

      return { items: results, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
    }),

  /**
   * returnVisitors — contacts who viewed properties on multiple distinct days
   * in the selected time range. Sorted by number of distinct days descending.
   * This is a stronger intent signal than raw view count.
   */
  returnVisitors: protectedProcedure
    .input(daysInput)
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
      if (role === "agent") {
        baseConditions.push(
          sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id})`
        );
      }

      // Aggregate: distinct days and total views per contact, filter to 2+ days
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
        .where(and(...baseConditions))
        .groupBy(activityLog.entityId)
        .having(sql`COUNT(DISTINCT DATE(${activityLog.createdAt})) >= 2`)
        .orderBy(desc(sql`distinctDays`), desc(sql`totalViews`))
        .limit(limit)
        .offset(offset);

      // Count total contacts with 2+ distinct days
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

      const [isaMap, leadSourceMap, agentMap] = await Promise.all([
        batchLookupIsas(db, isaIds),
        batchLookupLeadSources(db, leadSourceIds),
        batchLookupAgents(db, contactIds, role, ctx.user.id),
      ]);

      const results = rows.map(row => ({
        contactId: row.contactId!,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        distinctDays: row.distinctDays,
        totalViews: row.totalViews,
        lastViewed: row.lastViewed,
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgent: agentMap[row.contactId!]?.name ?? null,
        connectionId: agentMap[row.contactId!]?.connectionId ?? null,
      }));

      return { items: results, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
    }),

  /**
   * emailEngagement — contacts who opened or clicked emails in the selected
   * time range. Sorted by clicks descending, then opens descending.
   * Shows both open count and click count.
   */
  emailEngagement: protectedProcedure
    .input(daysInput)
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

      // Build conditions for email engagement
      const baseConditions = [
        sql`${emailBehaviors.contactId} IS NOT NULL`,
        sql`(${emailBehaviors.openedAt} >= ${sinceDate} OR ${emailBehaviors.clickedAt} >= ${sinceDate})`,
        sql`(${contacts.email} IS NULL OR ${contacts.email} NOT LIKE '%@savvy.realty')`,
      ];
      if (role === "agent") {
        baseConditions.push(
          sql`${emailBehaviors.contactId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id})`
        );
      }

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
        .where(and(...baseConditions))
        .groupBy(emailBehaviors.contactId)
        .orderBy(desc(sql`clicks`), desc(sql`opens`))
        .limit(limit)
        .offset(offset);

      // Count total
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

      const [isaMap, leadSourceMap, agentMap] = await Promise.all([
        batchLookupIsas(db, isaIds),
        batchLookupLeadSources(db, leadSourceIds),
        batchLookupAgents(db, contactIds, role, ctx.user.id),
      ]);

      const results = rows.map(row => ({
        contactId: row.contactId!,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        opens: row.opens,
        clicks: row.clicks,
        lastEngaged: row.lastEngaged,
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgent: agentMap[row.contactId!]?.name ?? null,
        connectionId: agentMap[row.contactId!]?.connectionId ?? null,
      }));

      return { items: results, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
    }),
});
