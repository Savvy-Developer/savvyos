import { z } from "zod";
import { getDb } from "../db";
import { activityLog, contacts, users, agentConnections, leadSources } from "../../drizzle/schema";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// ─── Hot Leads Router ─────────────────────────────────────────────────────────
// Provides aggregated "hot lead" lists based on engagement signals.
// First tab: Property Views — contacts who viewed properties recently.

export const hotLeadsRouter = router({
  /**
   * propertyViews — returns contacts with property views in the selected
   * time range, sorted by view count descending. Includes contact info,
   * assigned agent/ISA, lead source, last viewed timestamp, and most-viewed
   * property address.
   *
   * For agents: scoped to only their connected contacts.
   * Excludes @savvy.realty email addresses.
   */
  propertyViews: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(50),
        days: z.enum(["7", "14", "30", "90"]).default("7"),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const role = ctx.user.role;
      // Admin, ISA, and agent roles can see hot leads
      if (role !== "admin" && role !== "isa" && role !== "agent") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;
      const days = parseInt(input?.days ?? "7");

      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Build base conditions
      const baseConditions = [
        eq(activityLog.action, "property_viewed"),
        eq(activityLog.entityType, "contact"),
        gte(activityLog.createdAt, sinceDate),
        // Exclude @savvy.realty emails
        sql`(${contacts.email} IS NULL OR ${contacts.email} NOT LIKE '%@savvy.realty')`,
      ];

      // For agents, scope to only their connected contacts
      if (role === "agent") {
        baseConditions.push(
          sql`${activityLog.entityId} IN (SELECT contactId FROM agent_connections WHERE agentId = ${ctx.user.id})`
        );
      }

      // Main query: aggregate property views per contact
      const rows = await db
        .select({
          contactId: activityLog.entityId,
          viewCount: sql<number>`COUNT(*)`.as("viewCount"),
          lastViewed: sql<string>`MAX(${activityLog.createdAt})`.as("lastViewed"),
          // Contact fields
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          city: contacts.city,
          state: contacts.state,
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

      // Get total count for pagination
      const [countResult] = await db
        .select({ total: sql<number>`COUNT(DISTINCT ${activityLog.entityId})` })
        .from(activityLog)
        .innerJoin(contacts, eq(activityLog.entityId, contacts.id))
        .where(and(...baseConditions));

      const totalCount = countResult?.total ?? 0;

      // Collect IDs for batch lookups
      const isaIds = Array.from(new Set(rows.map(r => r.assignedIsaId).filter(Boolean))) as number[];
      const leadSourceIds = Array.from(new Set(rows.map(r => r.leadSourceId).filter(Boolean))) as number[];
      const contactIds = rows.map(r => r.contactId).filter(Boolean) as number[];

      // Batch lookup: ISA names
      let isaMap: Record<number, string> = {};
      if (isaIds.length > 0) {
        const isaRows = await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(sql`${users.id} IN (${sql.raw(isaIds.join(","))})`);
        isaMap = Object.fromEntries(isaRows.map(r => [r.id, r.name ?? "Unknown"]));
      }

      // Batch lookup: Lead source names
      let leadSourceMap: Record<number, string> = {};
      if (leadSourceIds.length > 0) {
        const lsRows = await db
          .select({ id: leadSources.id, name: leadSources.name })
          .from(leadSources)
          .where(sql`${leadSources.id} IN (${sql.raw(leadSourceIds.join(","))})`);
        leadSourceMap = Object.fromEntries(lsRows.map(r => [r.id, r.name]));
      }

      // Batch lookup: Agent connections (get primary agent for each contact)
      // For agents, also get the connection ID so we can link to /pipeline/:id
      let agentMap: Record<number, { name: string; connectionId: number }> = {};
      if (contactIds.length > 0) {
        const agentQuery = role === "agent"
          ? sql`${agentConnections.contactId} IN (${sql.raw(contactIds.join(","))}) AND ${agentConnections.agentId} = ${ctx.user.id}`
          : sql`${agentConnections.contactId} IN (${sql.raw(contactIds.join(","))})`;

        const agentRows = await db
          .select({
            contactId: agentConnections.contactId,
            connectionId: agentConnections.id,
            agentName: users.name,
          })
          .from(agentConnections)
          .innerJoin(users, eq(agentConnections.agentId, users.id))
          .where(agentQuery);
        // Take first agent per contact (most contacts have one)
        for (const row of agentRows) {
          if (!agentMap[row.contactId]) {
            agentMap[row.contactId] = { name: row.agentName ?? "Unknown", connectionId: row.connectionId };
          }
        }
      }

      // Batch lookup: Most recently viewed property address per contact
      let lastPropertyMap: Record<number, string> = {};
      if (contactIds.length > 0) {
        const propRows = await db
          .select({
            entityId: activityLog.entityId,
            details: activityLog.details,
          })
          .from(activityLog)
          .where(
            and(
              eq(activityLog.action, "property_viewed"),
              eq(activityLog.entityType, "contact"),
              gte(activityLog.createdAt, sinceDate),
              sql`${activityLog.entityId} IN (${sql.raw(contactIds.join(","))})`
            )
          )
          .orderBy(desc(activityLog.createdAt));

        // Take first (most recent) per contact
        for (const row of propRows) {
          const cId = row.entityId!;
          if (!lastPropertyMap[cId] && row.details) {
            const d = row.details as any;
            if (d.propertyAddress) {
              lastPropertyMap[cId] = d.propertyAddress;
            }
          }
        }
      }

      // Assemble results
      const results = rows.map(row => ({
        contactId: row.contactId!,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        city: row.city,
        state: row.state,
        viewCount: row.viewCount,
        lastViewed: row.lastViewed,
        assignedIsa: row.assignedIsaId ? (isaMap[row.assignedIsaId] ?? null) : null,
        leadSource: row.leadSourceId ? (leadSourceMap[row.leadSourceId] ?? null) : null,
        connectedAgent: agentMap[row.contactId!]?.name ?? null,
        connectionId: agentMap[row.contactId!]?.connectionId ?? null,
        lastPropertyAddress: lastPropertyMap[row.contactId!] ?? null,
      }));

      return {
        items: results,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      };
    }),
});
