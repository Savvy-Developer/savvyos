/** Administrative, lossless duplicate-contact review workflow. */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { agentConnections, contacts, contactRelationships, duplicateContactPairs, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { detectAllDuplicates, getLatestScanJob, getScanJob, persistDuplicatePairs, startBackgroundScan } from "../duplicateDetection";
import { areLeadSourcesCompatible, linkContactsAsRelationship, listArchivedContactMerges, mergeContacts, restoreMergedContact } from "../contactMerge";
import { protectedProcedure, router } from "../_core/trpc";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});

const methodSelection = z.object({
  value: z.string().trim().min(1).max(320),
  isPrimary: z.boolean(),
});

const mergeInput = z.object({
  winnerId: z.number().int().positive(),
  loserId: z.number().int().positive(),
  fieldOverrides: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  retainEmails: z.array(methodSelection).max(3).optional(),
  retainPhones: z.array(methodSelection).max(3).optional(),
  retainAgentIds: z.array(z.number().int().positive()).optional(),
  connectionFieldOverrides: z.record(z.string(), z.record(z.string(), z.enum(["winner", "loser"]))).optional(),
}).refine((data) => data.winnerId !== data.loserId, {
  message: "Choose two different contacts to merge.",
  path: ["loserId"],
});

function mergeBlocked(message: string): never {
  throw new TRPCError({ code: "CONFLICT", message });
}

async function getActiveContactsForMerge(db: any, winnerId: number, loserId: number) {
  const rows = await db.select().from(contacts).where(and(
    inArray(contacts.id, [winnerId, loserId]),
    isNull(contacts.archivedAt),
  ));
  if (rows.length !== 2) throw new TRPCError({ code: "NOT_FOUND", message: "One or both selected contacts are no longer available for merging." });
  const winner = rows.find((row: any) => row.id === winnerId);
  const loser = rows.find((row: any) => row.id === loserId);
  if (!winner || !loser) throw new TRPCError({ code: "NOT_FOUND", message: "One or both selected contacts are no longer available for merging." });
  if (!areLeadSourcesCompatible(winner, loser)) {
    mergeBlocked("Merge blocked: contacts have different Lead Source values. Lead Source attribution cannot be merged or overridden.");
  }
  return { winner, loser };
}

async function createManualPair(db: any, winnerId: number, loserId: number): Promise<number> {
  const pairResult = await db.insert(duplicateContactPairs).values({
    contactAId: winnerId,
    contactBId: loserId,
    matchType: "manual",
    confidence: 100,
    status: "pending",
  });
  return Number(pairResult[0].insertId);
}

export const duplicatesRouter = router({
  scan: adminProcedure.mutation(async () => {
    const latest = await getLatestScanJob();
    if (latest?.status === "running") return { jobId: latest.id, alreadyRunning: true };
    return { jobId: await startBackgroundScan(), alreadyRunning: false };
  }),

  getScanJob: adminProcedure.input(z.object({ jobId: z.number().int() })).query(async ({ input }) => {
    const job = await getScanJob(input.jobId);
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    return job;
  }),

  getLatestScanJob: adminProcedure.query(() => getLatestScanJob()),

  searchContacts: adminProcedure
    .input(z.object({ query: z.string().trim().min(2).max(160), excludeContactId: z.number().int().positive().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const search = input.query.replace(/\s+/g, " ").trim();
      const term = `%${search}%`;
      const digitsOnly = search.replace(/[^\d]/g, "");
      const phoneTerm = digitsOnly.length >= 3 ? `%${digitsOnly}%` : null;
      const searchClause = or(
        like(contacts.firstName, term), like(contacts.lastName, term),
        like(contacts.email, term), like(contacts.secondaryEmail, term), like(contacts.thirdEmail, term),
        like(contacts.phone, term), like(contacts.secondaryPhone, term), like(contacts.thirdPhone, term),
        sql`CONCAT(TRIM(${contacts.firstName}), ' ', TRIM(${contacts.lastName})) LIKE ${term}`,
        ...(phoneTerm ? [
          sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${contacts.phone}, '+', ''), '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${phoneTerm}`,
          sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${contacts.secondaryPhone}, '+', ''), '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${phoneTerm}`,
          sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${contacts.thirdPhone}, '+', ''), '-', ''), '(', ''), ')', ''), ' ', '') LIKE ${phoneTerm}`,
        ] : []),
      );
      return db.select({
        id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName,
        email: contacts.email, secondaryEmail: contacts.secondaryEmail, thirdEmail: contacts.thirdEmail,
        phone: contacts.phone, secondaryPhone: contacts.secondaryPhone, thirdPhone: contacts.thirdPhone,
        address: contacts.address, city: contacts.city, state: contacts.state, zip: contacts.zip,
        leadSourceId: contacts.leadSourceId, leadSourceType: contacts.leadSourceType,
        campaignSource: contacts.campaignSource, partnershipName: contacts.partnershipName,
        createdAt: contacts.createdAt, updatedAt: contacts.updatedAt,
      }).from(contacts).where(and(
        isNull(contacts.archivedAt), searchClause,
        ...(input.excludeContactId ? [sql`${contacts.id} != ${input.excludeContactId}`] : []),
      )).orderBy(desc(contacts.updatedAt)).limit(15);
    }),

  getMergeContext: adminProcedure
    .input(z.object({ contactAId: z.number().int().positive(), contactBId: z.number().int().positive() }).refine((data) => data.contactAId !== data.contactBId, { message: "Choose two different contacts." }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const records = await db.select().from(contacts).where(and(inArray(contacts.id, [input.contactAId, input.contactBId]), isNull(contacts.archivedAt)));
      const contactA = records.find((record) => record.id === input.contactAId) ?? null;
      const contactB = records.find((record) => record.id === input.contactBId) ?? null;
      if (!contactA || !contactB) throw new TRPCError({ code: "NOT_FOUND", message: "One or both selected contacts are no longer active." });
      const connections = await db.select({ connection: agentConnections, agent: { id: users.id, name: users.name, email: users.email } })
        .from(agentConnections).leftJoin(users, eq(agentConnections.agentId, users.id))
        .where(and(inArray(agentConnections.contactId, [input.contactAId, input.contactBId]), isNull(agentConnections.archivedAt)));
      const contactAConnections = connections.filter((row) => row.connection.contactId === input.contactAId);
      const contactBConnections = connections.filter((row) => row.connection.contactId === input.contactBId);
      const agentConflict = contactAConnections.length > 0 && contactBConnections.length > 0 && (
        contactAConnections.some((row) => !contactBConnections.some((other) => other.connection.agentId === row.connection.agentId)) ||
        contactBConnections.some((row) => !contactAConnections.some((other) => other.connection.agentId === row.connection.agentId))
      );
      return {
        contactA, contactB, contactAConnections, contactBConnections,
        leadSourceConflict: !areLeadSourcesCompatible(contactA, contactB),
        agentConflict,
      };
    }),

  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select({ status: duplicateContactPairs.status, count: sql<number>`COUNT(*)` }).from(duplicateContactPairs).groupBy(duplicateContactPairs.status);
    const stats = { pending: 0, merged: 0, dismissed: 0, total: 0 };
    for (const row of rows) { const count = Number(row.count); stats[row.status] = count; stats.total += count; }
    const [archiveCount] = await db.execute(sql.raw("SELECT COUNT(DISTINCT mergePairId) AS count FROM contact_merge_archives WHERE restoredAt IS NULL")) as any;
    return { ...stats, archived: Number(archiveCount?.[0]?.count ?? 0) };
  }),

  listPairs: adminProcedure
    .input(z.object({ status: z.enum(["pending", "merged", "dismissed", "all"]).default("pending"), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const whereClause = input.status === "all" ? undefined : eq(duplicateContactPairs.status, input.status);
      const offset = (input.page - 1) * input.pageSize;
      const [pairs, countRows] = await Promise.all([
        db.select().from(duplicateContactPairs).where(whereClause).orderBy(desc(duplicateContactPairs.confidence), desc(duplicateContactPairs.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(duplicateContactPairs).where(whereClause),
      ]);
      const contactIds = Array.from(new Set(pairs.flatMap((pair) => [pair.contactAId, pair.contactBId])));
      const contactRows = contactIds.length ? await db.select({
        id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName,
        email: contacts.email, secondaryEmail: contacts.secondaryEmail, thirdEmail: contacts.thirdEmail,
        phone: contacts.phone, secondaryPhone: contacts.secondaryPhone, thirdPhone: contacts.thirdPhone,
        address: contacts.address, city: contacts.city, state: contacts.state, zip: contacts.zip,
        leadSourceId: contacts.leadSourceId, leadSourceType: contacts.leadSourceType,
        campaignSource: contacts.campaignSource, partnershipName: contacts.partnershipName,
        archivedAt: contacts.archivedAt, createdAt: contacts.createdAt, updatedAt: contacts.updatedAt,
      }).from(contacts).where(inArray(contacts.id, contactIds)) : [];
      const contactMap = new Map(contactRows.map((contact) => [contact.id, contact]));
      return { pairs: pairs.map((pair) => ({ ...pair, contactA: contactMap.get(pair.contactAId) ?? null, contactB: contactMap.get(pair.contactBId) ?? null })), total: Number(countRows[0]?.count ?? 0), page: input.page, pageSize: input.pageSize };
    }),

  listArchivedMerges: adminProcedure
    .input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(20) }))
    .query(({ input }) => listArchivedContactMerges(input.page, input.pageSize)),

  merge: adminProcedure
    .input(mergeInput.safeExtend({ pairId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      return mergeContacts({ ...input, reviewedById: ctx.user.id });
    }),

  manualMerge: adminProcedure
    .input(mergeInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await getActiveContactsForMerge(db, input.winnerId, input.loserId);
      return mergeContacts({ ...input, reviewedById: ctx.user.id });
    }),

  linkAsRelationship: adminProcedure
    .input(z.object({
      pairId: z.number().int().nonnegative().default(0),
      contactAId: z.number().int().positive(),
      contactBId: z.number().int().positive(),
      relationshipType: z.enum(["spouse", "partner", "business_partner", "unknown_relationship"]),
    }).refine((data) => data.contactAId !== data.contactBId, { message: "Choose two different contacts." }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let pairId = input.pairId;
      if (pairId === 0) pairId = await createManualPair(db, input.contactAId, input.contactBId);
      await linkContactsAsRelationship({ ...input, sourcePairId: pairId, createdByUserId: ctx.user.id });
      await db.update(duplicateContactPairs).set({ status: "dismissed", reviewedById: ctx.user.id, reviewedAt: new Date() }).where(eq(duplicateContactPairs.id, pairId));
      return { success: true, relationshipType: input.relationshipType };
    }),

  restoreArchivedMerge: adminProcedure
    .input(z.object({ pairId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => restoreMergedContact(input.pairId, ctx.user.id)),

  dismiss: adminProcedure
    .input(z.object({ pairId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(duplicateContactPairs).set({ status: "dismissed", reviewedById: ctx.user.id, reviewedAt: new Date() }).where(eq(duplicateContactPairs.id, input.pairId));
      return { success: true };
    }),

  getRelationships: adminProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const relationships = await db.select().from(contactRelationships).where(and(eq(contactRelationships.contactId, input.contactId), isNull(contactRelationships.archivedAt)));
      if (!relationships.length) return [];
      const relatedContacts = await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone })
        .from(contacts).where(inArray(contacts.id, relationships.map((relationship) => relationship.relatedContactId)));
      const contactMap = new Map(relatedContacts.map((contact) => [contact.id, contact]));
      return relationships.map((relationship) => ({ ...relationship, relatedContact: contactMap.get(relationship.relatedContactId) ?? null }));
    }),
});

void detectAllDuplicates;
void persistDuplicatePairs;
