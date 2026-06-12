import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { marketProfiles, users } from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";

// The markets router now delegates to market_profiles as the single source of truth.
// All downstream consumers (analytics, user assignment, org chart, filters) use this.
export const marketsRouter = router({
  // Returns id + name for all market_profiles — used in dropdowns across the app.
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state })
      .from(marketProfiles)
      .orderBy(asc(marketProfiles.name));
    return rows;
  }),

  // Create is now handled by the marketMatch.upsertMarket procedure in the Market Match Hub.
  // This stub is kept for backward compatibility but redirects to marketProfiles.
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(255), state: z.string().min(1).max(50).optional() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(marketProfiles).values({
        name: input.name.trim(),
        state: input.state?.trim() ?? "N/A",
        status: "active",
      });
      return { id: (result as any).insertId as number, name: input.name.trim() };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.update(marketProfiles).set({ name: input.name.trim() }).where(eq(marketProfiles.id, input.id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Unlink users from this market profile before deleting
      await db.update(users).set({ marketProfileId: null }).where(eq(users.marketProfileId, input.id));
      await db.delete(marketProfiles).where(eq(marketProfiles.id, input.id));
      return { success: true };
    }),
});
