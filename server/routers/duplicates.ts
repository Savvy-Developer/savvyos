/**
 * Duplicates tRPC Router
 *
 * Procedures:
 *  - scan           (admin) Run detection and persist new pairs
 *  - listPairs      (admin) Paginated list of pending/all pairs with contact details
 *  - getPair        (admin) Single pair with full contact details for review
 *  - merge          (admin) Execute a merge with optional field overrides
 *  - dismiss        (admin) Mark a pair as not a duplicate
 *  - getStats       (admin) Summary counts by status
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { contacts, duplicateContactPairs, users, contactRelationships } from "../../drizzle/schema";
import { eq, and, or, desc, sql, inArray, isNull, like } from "drizzle-orm";
import { startBackgroundScan, getScanJob, getLatestScanJob, detectAllDuplicates, persistDuplicatePairs } from "../duplicateDetection";
import { mergeContacts } from "../contactMerge";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const duplicatesRouter = router({
  // ─── Scan (background) ───────────────────────────────────────────────────
  scan: adminProcedure.mutation(async () => {
    // Check if a scan is already running
    const latest = await getLatestScanJob();
    if (latest && latest.status === "running") {
      return { jobId: latest.id, alreadyRunning: true };
    }
    const jobId = await startBackgroundScan();
    return { jobId, alreadyRunning: false };
  }),

  // ─── Scan Job Status ──────────────────────────────────────────────────────
  getScanJob: adminProcedure
    .input(z.object({ jobId: z.number().int() }))
    .query(async ({ input }) => {
      const job = await getScanJob(input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return job;
    }),

  getLatestScanJob: adminProcedure.query(async () => {
    return getLatestScanJob();
  }),

  // ─── Contact Search for Manual Merge ─────────────────────────────────────
  searchContacts: adminProcedure
    .input(z.object({
      query: z.string().trim().min(2).max(160),
      excludeContactId: z.number().int().positive().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const search = input.query.replace(/\s+/g, " ").trim();
      const term = `%${search}%`;
      const digitsOnly = search.replace(/[^\d]/g, "");
      const phoneTerm = digitsOnly.length >= 3 ? `%${digitsOnly}%` : null;
      const searchClause = or(
        like(contacts.firstName, term),
        like(contacts.lastName, term),
        like(contacts.email, term),
        like(contacts.secondaryEmail, term),
        like(contacts.phone, term),
        like(contacts.secondaryPhone, term),
        sql`CONCAT(TRIM(${contacts.firstName}), ' ', TRIM(${contacts.lastName})) LIKE ${term}`,
        ...(phoneTerm ? [
          sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${contacts.phone}, '+', ''), '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${phoneTerm}`,
          sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${contacts.secondaryPhone}, '+', ''), '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${phoneTerm}`,
        ] : []),
      );
      const whereClause = and(
        isNull(contacts.archivedAt),
        searchClause,
        ...(input.excludeContactId ? [sql`${contacts.id} != ${input.excludeContactId}`] : []),
      );

      return db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          secondaryEmail: contacts.secondaryEmail,
          phone: contacts.phone,
          secondaryPhone: contacts.secondaryPhone,
          address: contacts.address,
          city: contacts.city,
          state: contacts.state,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt,
        })
        .from(contacts)
        .where(whereClause)
        .orderBy(desc(contacts.updatedAt))
        .limit(15);
    }),

  // ─── Stats ────────────────────────────────────────────────────────────────
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const rows = await db
      .select({
        status: duplicateContactPairs.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(duplicateContactPairs)
      .groupBy(duplicateContactPairs.status);

    const stats = { pending: 0, merged: 0, dismissed: 0, total: 0 };
    for (const r of rows) {
      const count = Number(r.count);
      stats[r.status as keyof typeof stats] = count;
      stats.total += count;
    }
    return stats;
  }),

  // ─── List Pairs ───────────────────────────────────────────────────────────
  listPairs: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "merged", "dismissed", "all"]).default("pending"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const offset = (input.page - 1) * input.pageSize;

      // Build where clause
      const whereClause =
        input.status === "all"
          ? undefined
          : eq(duplicateContactPairs.status, input.status as "pending" | "merged" | "dismissed");

      const [pairs, countRows] = await Promise.all([
        db
          .select()
          .from(duplicateContactPairs)
          .where(whereClause)
          .orderBy(desc(duplicateContactPairs.confidence), desc(duplicateContactPairs.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(duplicateContactPairs)
          .where(whereClause),
      ]);

      if (pairs.length === 0) {
        return { pairs: [], total: Number(countRows[0]?.count ?? 0), page: input.page, pageSize: input.pageSize };
      }

      // Fetch contact details for all pairs
      const contactIds = Array.from(new Set(pairs.flatMap((p) => [p.contactAId, p.contactBId])));
      const contactRows = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          secondaryEmail: contacts.secondaryEmail,
          phone: contacts.phone,
          secondaryPhone: contacts.secondaryPhone,
          address: contacts.address,
          city: contacts.city,
          state: contacts.state,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt,
        })
        .from(contacts)
        .where(inArray(contacts.id, contactIds));

      const contactMap = new Map(contactRows.map((c) => [c.id, c]));

      const enriched = pairs.map((p) => ({
        ...p,
        contactA: contactMap.get(p.contactAId) ?? null,
        contactB: contactMap.get(p.contactBId) ?? null,
      }));

      return {
        pairs: enriched,
        total: Number(countRows[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ─── Get Single Pair ──────────────────────────────────────────────────────
  getPair: adminProcedure
    .input(z.object({ pairId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const pairRows = await db
        .select()
        .from(duplicateContactPairs)
        .where(eq(duplicateContactPairs.id, input.pairId));

      const pair = pairRows[0];
      if (!pair) throw new TRPCError({ code: "NOT_FOUND" });

      const [contactARows, contactBRows] = await Promise.all([
        db.select().from(contacts).where(eq(contacts.id, pair.contactAId)),
        db.select().from(contacts).where(eq(contacts.id, pair.contactBId)),
      ]);

      return {
        pair,
        contactA: contactARows[0] ?? null,
        contactB: contactBRows[0] ?? null,
      };
    }),

  // ─── Merge ────────────────────────────────────────────────────────────────
  merge: adminProcedure
    .input(
      z.object({
        pairId: z.number().int(),
        winnerId: z.number().int(),
        loserId: z.number().int(),
        fieldOverrides: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
        // Multiple email retention: which emails to keep on the winner
        retainEmails: z.array(z.object({
          field: z.enum(["email", "secondaryEmail"]),
          value: z.string(),
        })).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Build email overrides from retainEmails selection
      const emailOverrides: Record<string, string | null> = {};
      if (input.retainEmails && input.retainEmails.length > 0) {
        // First email goes to primary, second to secondary
        emailOverrides.email = input.retainEmails[0]?.value ?? null;
        emailOverrides.secondaryEmail = input.retainEmails[1]?.value ?? null;
      }

      const mergedFieldOverrides = {
        ...(input.fieldOverrides as Partial<Record<string, string | number | null>> | undefined),
        ...emailOverrides,
      };

      const result = await mergeContacts({
        winnerId: input.winnerId,
        loserId: input.loserId,
        pairId: input.pairId,
        reviewedById: ctx.user.id,
        fieldOverrides: Object.keys(mergedFieldOverrides).length > 0 ? mergedFieldOverrides : undefined,
      });
      return result;
    }),

  // ─── Manual Merge ─────────────────────────────────────────────────────────
  manualMerge: adminProcedure
    .input(
      z.object({
        winnerId: z.number().int().positive(),
        loserId: z.number().int().positive(),
        fieldOverrides: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
        retainEmails: z.array(z.object({
          field: z.enum(["email", "secondaryEmail"]),
          value: z.string().trim().min(1),
        })).max(2).optional(),
      }).refine((data) => data.winnerId !== data.loserId, {
        message: "Choose two different contacts to merge.",
        path: ["loserId"],
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Protect against merging an archived record or a stale search result.
      const activeContacts = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(
          inArray(contacts.id, [input.winnerId, input.loserId]),
          isNull(contacts.archivedAt),
        ));
      if (activeContacts.length !== 2) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both selected contacts are no longer available for merging." });
      }

      // A manual pair makes the administrator's explicit selection visible in the
      // same review history as detected duplicates and gives the merge engine its audit record.
      const pairResult = await db.insert(duplicateContactPairs).values({
        contactAId: input.winnerId,
        contactBId: input.loserId,
        matchType: "manual",
        confidence: 100,
        status: "pending",
      });
      const pairId = Number(pairResult[0].insertId);

      const emailOverrides: Record<string, string | null> = {};
      if (input.retainEmails && input.retainEmails.length > 0) {
        emailOverrides.email = input.retainEmails[0]?.value ?? null;
        emailOverrides.secondaryEmail = input.retainEmails[1]?.value ?? null;
      }
      const mergedFieldOverrides = {
        ...(input.fieldOverrides as Partial<Record<string, string | number | null>> | undefined),
        ...emailOverrides,
      };

      return mergeContacts({
        winnerId: input.winnerId,
        loserId: input.loserId,
        pairId,
        reviewedById: ctx.user.id,
        fieldOverrides: Object.keys(mergedFieldOverrides).length > 0 ? mergedFieldOverrides : undefined,
      });
    }),

  // ─── Link as Relationship ─────────────────────────────────────────────────
  linkAsRelationship: adminProcedure
    .input(
      z.object({
        pairId: z.number().int(),
        contactAId: z.number().int(),
        contactBId: z.number().int(),
        relationshipType: z.enum(["spouse", "partner", "business_partner", "unknown_relationship"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Create bidirectional relationship links
      await db.insert(contactRelationships).values([
        {
          contactId: input.contactAId,
          relatedContactId: input.contactBId,
          relationshipType: input.relationshipType,
          sourcePairId: input.pairId,
          createdByUserId: ctx.user.id,
        },
        {
          contactId: input.contactBId,
          relatedContactId: input.contactAId,
          relationshipType: input.relationshipType,
          sourcePairId: input.pairId,
          createdByUserId: ctx.user.id,
        },
      ]);

      // Mark the duplicate pair as dismissed (not merged, but resolved)
      await db
        .update(duplicateContactPairs)
        .set({
          status: "dismissed",
          reviewedById: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(duplicateContactPairs.id, input.pairId));

      return { success: true, relationshipType: input.relationshipType };
    }),

  // ─── Dismiss ──────────────────────────────────────────────────────────────
  dismiss: adminProcedure
    .input(z.object({ pairId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(duplicateContactPairs)
        .set({
          status: "dismissed",
          reviewedById: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(duplicateContactPairs.id, input.pairId));

      return { success: true };
    }),

  // ─── Get Relationships for a Contact ──────────────────────────────────────
  getRelationships: adminProcedure
    .input(z.object({ contactId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rels = await db
        .select()
        .from(contactRelationships)
        .where(eq(contactRelationships.contactId, input.contactId));

      if (rels.length === 0) return [];

      const relatedIds = rels.map((r) => r.relatedContactId);
      const relatedContacts = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(inArray(contacts.id, relatedIds));

      const contactMap = new Map(relatedContacts.map((c) => [c.id, c]));

      return rels.map((r) => ({
        ...r,
        relatedContact: contactMap.get(r.relatedContactId) ?? null,
      }));
    }),
});
