import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { leadSources, contacts } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getLeadSourceWithCounts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      ls: leadSources,
      contactCount: sql<number>`COUNT(DISTINCT ${contacts.id})`,
    })
    .from(leadSources)
    .leftJoin(contacts, eq(contacts.leadSourceId, leadSources.id))
    .groupBy(leadSources.id)
    .orderBy(leadSources.parentId, leadSources.name);
  return rows;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const leadSourcesRouter = router({
  list: protectedProcedure.query(async () => {
    const all = await getLeadSourceWithCounts();
    return all.filter(r => r.ls.isActive !== false);
  }),

  listInactive: protectedProcedure.query(async () => {
    const all = await getLeadSourceWithCounts();
    return all.filter(r => r.ls.isActive === false);
  }),

  listFlat: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ ls: leadSources })
      .from(leadSources)
      .where(eq(leadSources.isActive, true))
      .orderBy(leadSources.parentId, leadSources.name);
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      parentId: z.number().nullable().optional(),
      campaignType: z.enum(["buyer", "seller", "both"]).nullable().optional(),
      description: z.string().nullable().optional(),
      agreementUrl: z.string().nullable().optional(),
      agreementKey: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(leadSources).values({
        name: input.name,
        parentId: input.parentId ?? null,
        campaignType: input.campaignType ?? null,
        description: input.description ?? null,
        agreementUrl: input.agreementUrl ?? null,
        agreementKey: input.agreementKey ?? null,
      });
      return { id: (result as any).insertId as number };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      parentId: z.number().nullable().optional(),
      campaignType: z.enum(["buyer", "seller", "both"]).nullable().optional(),
      referralPercent: z.number().nullable().optional(),
      description: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
      agreementUrl: z.string().nullable().optional(),
      agreementKey: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      await db.update(leadSources).set(data as any).where(eq(leadSources.id, id));
      return { success: true };
    }),

  // Get all referral partners (child sources of "Referral Partner" category) with their referral %
  referralPartners: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const [parent] = await db
      .select()
      .from(leadSources)
      .where(eq(leadSources.name, "Referral Partner (Leads in)"));
    if (!parent) return [];
    const rows = await db
      .select()
      .from(leadSources)
      .where(eq(leadSources.parentId, parent.id))
      .orderBy(leadSources.name);
    return rows;
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Check if source is protected
      const [source] = await db.select({ isProtected: leadSources.isProtected }).from(leadSources).where(eq(leadSources.id, input.id));
      if (source?.isProtected) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This lead source is system-protected and cannot be deleted." });
      }
      const [contactCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contacts)
        .where(eq(contacts.leadSourceId, input.id));
      if ((contactCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete: ${contactCount?.count} contact(s) use this lead source. Deactivate it instead.`,
        });
      }
      const [childCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(leadSources)
        .where(eq(leadSources.parentId, input.id));
      if ((childCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete: this category has ${childCount?.count} sub-source(s). Delete them first.`,
        });
      }
      await db.delete(leadSources).where(eq(leadSources.id, input.id));
      return { success: true };
    }),
});
