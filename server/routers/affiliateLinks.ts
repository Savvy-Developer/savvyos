import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { affiliateLinks } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";

const affiliateLinkInput = z.object({
  companyName: z.string().trim().min(1).max(255),
  contactName: z.string().trim().max(255).nullable().optional(),
  contactEmail: z.string().trim().email().max(320).nullable().optional(),
  contactPhone: z.string().trim().max(64).nullable().optional(),
  websiteUrl: z.string().trim().url().max(1024).nullable().optional(),
  affiliateUrl: z.string().trim().url().max(20_000),
  commissionTerms: z.string().trim().max(10_000).nullable().optional(),
  estimatedEarnings: z.string().trim().max(255).nullable().optional(),
  notes: z.string().trim().max(20_000).nullable().optional(),
  isActive: z.boolean().optional(),
});

function requireAdmin(role: string): void {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
  }
}

export const affiliateLinksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(affiliateLinks).orderBy(asc(affiliateLinks.companyName));
  }),

  create: protectedProcedure
    .input(affiliateLinkInput)
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(affiliateLinks).values({
        ...input,
        isActive: input.isActive ?? true,
        createdById: ctx.user.id,
      });
      const id = Number((result as any).insertId);
      await logActivity({ userId: ctx.user.id, action: "affiliate_link_created", entityType: "affiliate_link", entityId: id });
      return { id };
    }),

  update: protectedProcedure
    .input(affiliateLinkInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      const [existing] = await db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(eq(affiliateLinks.id, id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate link not found." });
      await db.update(affiliateLinks).set(data).where(eq(affiliateLinks.id, id));
      await logActivity({ userId: ctx.user.id, action: "affiliate_link_updated", entityType: "affiliate_link", entityId: id });
      return { success: true };
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(affiliateLinks).set({ isActive: false }).where(eq(affiliateLinks.id, input.id));
      await logActivity({ userId: ctx.user.id, action: "affiliate_link_archived", entityType: "affiliate_link", entityId: input.id });
      return { success: true };
    }),
});
