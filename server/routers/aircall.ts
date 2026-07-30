/**
 * Aircall tRPC Router
 * ====================
 * Admin-only procedures for managing the Aircall integration:
 *  - List unmatched calls (for review)
 *  - Get call activity stats
 *  - Trigger a single-call reprocess (for admin use)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  aircallCalls,
  aircallUnmatchedCalls,
  contacts,
  communications,
} from "../../drizzle/schema";
import { eq, desc, count, isNull, and, gte, lte } from "drizzle-orm";
import { processAircallCall, type AircallCallData } from "../aircall";

function adminOnly() {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return next({ ctx });
  });
}

export const aircallRouter = router({
  // ── List unmatched calls ───────────────────────────────────────────────────
  listUnmatched: adminOnly()
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const offset = (input.page - 1) * input.limit;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(aircallUnmatchedCalls)
          .orderBy(desc(aircallUnmatchedCalls.startedAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ total: count() }).from(aircallUnmatchedCalls),
      ]);

      return {
        rows,
        total: total ?? 0,
        page: input.page,
        totalPages: Math.ceil((total ?? 0) / input.limit),
      };
    }),

  // ── Get integration stats ──────────────────────────────────────────────────
  stats: adminOnly().query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [totalCalls, unmatchedCalls] = await Promise.all([
      db.select({ total: count() }).from(aircallCalls),
      db.select({ total: count() }).from(aircallUnmatchedCalls),
    ]);

    return {
      totalCalls: totalCalls[0]?.total ?? 0,
      unmatchedCalls: unmatchedCalls[0]?.total ?? 0,
    };
  }),

  // ── List calls for a specific contact ─────────────────────────────────────
  listByContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(aircallCalls)
        .where(eq(aircallCalls.contactId, input.contactId))
        .orderBy(desc(aircallCalls.startedAt))
        .limit(100);
    }),

  // ── Reprocess a single call (admin) ───────────────────────────────────────
  // Useful for manually retrying a call that failed or was unmatched after
  // the contact's phone number was added/corrected.
  reprocessCall: adminOnly()
    .input(
      z.object({
        aircallCallId: z.number(),
        rawPayload: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Remove from unmatched table first so processAircallCall can re-insert
      // into aircall_calls if it finds a match this time.
      await db
        .delete(aircallUnmatchedCalls)
        .where(eq(aircallUnmatchedCalls.aircallCallId, input.aircallCallId));

      // Also remove from aircall_calls so the dedup check doesn't skip it
      await db
        .delete(aircallCalls)
        .where(eq(aircallCalls.aircallCallId, input.aircallCallId));

      const result = await processAircallCall(
        input.rawPayload as unknown as AircallCallData
      );

      return result;
    }),
});
