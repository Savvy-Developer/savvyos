import { TRPCError } from "@trpc/server";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { adminNavigationPreferences } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const navigationPath = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine(path => path.startsWith("/"), "Navigation paths must be internal.");

function assertAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Admin navigation preferences are only available to administrators.",
    });
  }
}

/**
 * Stores personal, non-authorizing navigation metadata for administrators. Page
 * visibility remains controlled by Super Permissions in the application shell;
 * this router only remembers usage and shortcut selections for the signed-in
 * admin.
 */
export const adminNavigationRouter = router({
  preferences: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database unavailable.",
      });
    }
    return db
      .select({
        path: adminNavigationPreferences.path,
        isFavorite: adminNavigationPreferences.isFavorite,
        viewCount: adminNavigationPreferences.viewCount,
        lastViewedAt: adminNavigationPreferences.lastViewedAt,
      })
      .from(adminNavigationPreferences)
      .where(eq(adminNavigationPreferences.userId, ctx.user.id));
  }),

  trackPage: protectedProcedure
    .input(z.object({ path: navigationPath }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });
      }
      const [existing] = await db
        .select({ id: adminNavigationPreferences.id })
        .from(adminNavigationPreferences)
        .where(
          and(
            eq(adminNavigationPreferences.userId, ctx.user.id),
            eq(adminNavigationPreferences.path, input.path)
          )
        )
        .limit(1);
      const now = new Date();
      if (existing) {
        await db
          .update(adminNavigationPreferences)
          .set({
            viewCount: sql`${adminNavigationPreferences.viewCount} + 1`,
            lastViewedAt: now,
          })
          .where(eq(adminNavigationPreferences.id, existing.id));
      } else {
        await db.insert(adminNavigationPreferences).values({
          userId: ctx.user.id,
          path: input.path,
          viewCount: 1,
          lastViewedAt: now,
        });
      }
      return { success: true };
    }),

  setFavorite: protectedProcedure
    .input(z.object({ path: navigationPath, isFavorite: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });
      }
      const [existing] = await db
        .select({ id: adminNavigationPreferences.id })
        .from(adminNavigationPreferences)
        .where(
          and(
            eq(adminNavigationPreferences.userId, ctx.user.id),
            eq(adminNavigationPreferences.path, input.path)
          )
        )
        .limit(1);
      if (existing) {
        await db
          .update(adminNavigationPreferences)
          .set({ isFavorite: input.isFavorite })
          .where(eq(adminNavigationPreferences.id, existing.id));
      } else {
        await db.insert(adminNavigationPreferences).values({
          userId: ctx.user.id,
          path: input.path,
          isFavorite: input.isFavorite,
        });
      }
      return { success: true };
    }),
});
