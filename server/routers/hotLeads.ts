import { z } from "zod";
import { getDb } from "../db";
import { activityLog, contacts, users, agentConnections, leadSources } from "../../drizzle/schema";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// ─── Hot Leads Router ─────────────────────────────────────────────────────────
// Provides aggregated "hot lead" lists based on engagement signals.
// First tab: Property Views — contacts who viewed properties in the last 7 days.

export const hotLeadsRouter = router({
  /**
   * propertyViews — returns contacts with property views in the last 7 days,
   * sorted by view count descending. Includes contact info, assigned agent/ISA,
   * lead source, last viewed timestamp, and most-viewed property address.
   */
  propertyViews: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      // Only admin and ISA roles can see hot leads
      if (ctx.user.role !== "admin" && ctx.user.role !== "isa") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Main query: aggregate property views per contact in last 7 days
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
        .where(
          and(
            eq(activityLog.action, "property_viewed"),
            eq(activityLog.entityType, "contact"),
            gte(activityLog.createdAt, sevenDaysAgo)
          )
        )
        .groupBy(activityLog.entityId)
        .orderBy(desc(sql`viewCount`))
        .limit(limit)
        .offset(offset);

      // Get total count for pagination
      const [countResult] = await db
        .select({ total: sql<number>`COUNT(DISTINCT ${activityLog.entityId})` })
        .from(activityLog)
        .innerJoin(contacts, eq(activityLog.entityId, contacts.id))
        .where(
          and(
            eq(activityLog.action, "property_viewed"),
            eq(activityLog.entityType, "contact"),
            gte(activityLog.createdAt, sevenDaysAgo)
          )
        );

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
      let agentMap: Record<number, string> = {};
      if (contactIds.length > 0) {
        const agentRows = await db
          .select({
            contactId: agentConnections.contactId,
            agentName: users.name,
          })
          .from(agentConnections)
          .innerJoin(users, eq(agentConnections.agentId, users.id))
          .where(sql`${agentConnections.contactId} IN (${sql.raw(contactIds.join(","))})`);
        // Take first agent per contact (most contacts have one)
        for (const row of agentRows) {
          if (!agentMap[row.contactId]) {
            agentMap[row.contactId] = row.agentName ?? "Unknown";
          }
        }
      }

      // Batch lookup: Most recently viewed property address per contact
      let lastPropertyMap: Record<number, string> = {};
      if (contactIds.length > 0) {
        // Get the most recent property_viewed log for each contact
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
              gte(activityLog.createdAt, sevenDaysAgo),
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
        connectedAgent: agentMap[row.contactId!] ?? null,
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
