import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { commissionExceptions, transactions, users } from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { sendTransactionalEmail } from "../_core/resendEmail";

const PROTECTED_EMAIL = "tyler@savvy.realty";
const WARN_AGENT_MIN_PCT = 50;
const WARN_SAVVY_MIN_PCT = 20;

export const commissionExceptionsRouter = router({
  // Agent: request an exception on their transaction
  request: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive(),
        reason: z.string().min(10, "Please provide a detailed reason"),
        agentSplitPct: z.number().min(0).max(100),
        brokerageSplitPct: z.number().min(0).max(100),
        teamLeaderSplitPct: z.number().min(0).max(100).default(0),
        referralSplitPct: z.number().min(0).max(100).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Validate total ≤ 100
      const total =
        input.agentSplitPct +
        input.brokerageSplitPct +
        input.teamLeaderSplitPct +
        input.referralSplitPct;
      if (total > 100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Split percentages total ${total.toFixed(2)}% — must not exceed 100%.`,
        });
      }

      // Verify the transaction belongs to this agent (or admin)
      const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, input.transactionId));
      if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
      if (ctx.user.role !== "admin" && tx.agentId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only request exceptions for your own transactions" });
      }

      // Check for existing pending exception
      const [existing] = await db
        .select()
        .from(commissionExceptions)
        .where(
          and(
            eq(commissionExceptions.transactionId, input.transactionId),
            eq(commissionExceptions.status, "pending")
          )
        );
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A pending exception request already exists for this transaction.",
        });
      }

      const [result] = await db.insert(commissionExceptions).values({
        transactionId: input.transactionId,
        requestedByUserId: ctx.user.id,
        reason: input.reason,
        agentSplitPct: String(input.agentSplitPct),
        brokerageSplitPct: String(input.brokerageSplitPct),
        teamLeaderSplitPct: String(input.teamLeaderSplitPct),
        referralSplitPct: String(input.referralSplitPct),
        status: "pending",
      });

      return { id: (result as any).insertId };
    }),

  // Admin: list all exception requests
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "denied", "all"]).default("pending"),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({
          exception: commissionExceptions,
          transaction: {
            id: transactions.id,
            transactionNumber: transactions.transactionNumber,
            purchasePrice: transactions.purchasePrice,
            grossCommissionIncome: transactions.grossCommissionIncome,
          },
          requester: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(commissionExceptions)
        .innerJoin(transactions, eq(commissionExceptions.transactionId, transactions.id))
        .innerJoin(users, eq(commissionExceptions.requestedByUserId, users.id))
        .where(
          input.status === "all"
            ? undefined
            : eq(commissionExceptions.status, input.status)
        )
        .orderBy(desc(commissionExceptions.createdAt));

      return rows;
    }),

  // Agent/Admin: get exceptions for a specific transaction
  listForTransaction: protectedProcedure
    .input(z.object({ transactionId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, input.transactionId));
      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });
      // Any authenticated user can view exceptions for a transaction (access matches transactions.get)

      const rows = await db
        .select()
        .from(commissionExceptions)
        .where(eq(commissionExceptions.transactionId, input.transactionId))
        .orderBy(desc(commissionExceptions.createdAt));
      return rows;
    }),

  // Admin: approve or deny an exception
  review: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["approved", "denied"]),
        adminNote: z.string().optional(),
        applyToTransaction: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [exc] = await db
        .select()
        .from(commissionExceptions)
        .where(eq(commissionExceptions.id, input.id));
      if (!exc) throw new TRPCError({ code: "NOT_FOUND" });
      if (exc.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This exception has already been reviewed." });
      }

      await db
        .update(commissionExceptions)
        .set({
          status: input.status,
          adminNote: input.adminNote ?? null,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(commissionExceptions.id, input.id));

      // If approved and applyToTransaction, update the transaction's commission splits
      if (input.status === "approved" && input.applyToTransaction) {
        const agentPct = parseFloat(exc.agentSplitPct as string);
        const brokeragePct = parseFloat(exc.brokerageSplitPct as string);
        const teamLeaderPct = parseFloat(exc.teamLeaderSplitPct as string);
        const referralPct = parseFloat(exc.referralSplitPct as string);

        // Check for warning thresholds
        const warnings: string[] = [];
        if (agentPct < WARN_AGENT_MIN_PCT) {
          warnings.push(`Agent split is ${agentPct}% (below ${WARN_AGENT_MIN_PCT}% minimum)`);
        }
        if (brokeragePct < WARN_SAVVY_MIN_PCT) {
          warnings.push(`Savvy brokerage split is ${brokeragePct}% (below ${WARN_SAVVY_MIN_PCT}% minimum)`);
        }

        if (warnings.length > 0) {
          await sendTransactionalEmail("commission_exception_warning", {
            recipientEmail: PROTECTED_EMAIL,
            recipientName: "Tyler",
            transactionNumber: String(exc.transactionId),
            notes: warnings.join("\n"),
          });
        }

        // Update the transaction splits
        await db
          .update(transactions)
          .set({
            agentSplitPct: String(agentPct),
            brokerageSplitPct: String(brokeragePct),
            teamLeaderSplitPct: String(teamLeaderPct),
            referralSplitPct: String(referralPct),
          } as any)
          .where(eq(transactions.id, exc.transactionId));
      }

      return { success: true };
    }),

  // Admin: count of pending exceptions (for nav badge)
  pendingCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") return { count: 0 };
      const db = await getDb();
      if (!db) return { count: 0 };
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(commissionExceptions)
        .where(eq(commissionExceptions.status, "pending"));
      return { count: Number(rows[0]?.count ?? 0) };
    }),

  // Admin: list all exceptions (flat, for the admin page)
  listAll: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({
          id: commissionExceptions.id,
          transactionId: commissionExceptions.transactionId,
          transactionNumber: transactions.transactionNumber,
          reason: commissionExceptions.reason,
          agentSplitPct: commissionExceptions.agentSplitPct,
          brokerageSplitPct: commissionExceptions.brokerageSplitPct,
          teamLeaderSplitPct: commissionExceptions.teamLeaderSplitPct,
          referralSplitPct: commissionExceptions.referralSplitPct,
          status: commissionExceptions.status,
          adminNote: commissionExceptions.adminNote,
          createdAt: commissionExceptions.createdAt,
          reviewedAt: commissionExceptions.reviewedAt,
          agentName: users.name,
          agentEmail: users.email,
        })
        .from(commissionExceptions)
        .innerJoin(transactions, eq(commissionExceptions.transactionId, transactions.id))
        .innerJoin(users, eq(commissionExceptions.requestedByUserId, users.id))
        .orderBy(desc(commissionExceptions.createdAt));

      return rows;
    }),

  // Admin: directly apply commission splits to a transaction (with guardrails)
  applyToTransaction: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive(),
        agentSplitPct: z.number().min(0).max(100),
        brokerageSplitPct: z.number().min(0).max(100),
        teamLeaderSplitPct: z.number().min(0).max(100).default(0),
        referralSplitPct: z.number().min(0).max(100).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const total = input.agentSplitPct + input.brokerageSplitPct + input.teamLeaderSplitPct + input.referralSplitPct;
      if (total > 100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Split percentages total ${total.toFixed(2)}% — must not exceed 100%.`,
        });
      }

      const warnings: string[] = [];
      if (input.agentSplitPct > 0 && input.agentSplitPct < WARN_AGENT_MIN_PCT) {
        warnings.push(`Agent split is ${input.agentSplitPct}% (below ${WARN_AGENT_MIN_PCT}% minimum)`);
      }
      if (input.brokerageSplitPct > 0 && input.brokerageSplitPct < WARN_SAVVY_MIN_PCT) {
        warnings.push(`Savvy brokerage split is ${input.brokerageSplitPct}% (below ${WARN_SAVVY_MIN_PCT}% minimum)`);
      }

      if (warnings.length > 0) {
        await sendTransactionalEmail("commission_exception_warning", {
          recipientEmail: PROTECTED_EMAIL,
          recipientName: "Tyler",
          transactionNumber: String(input.transactionId),
          notes: warnings.join("\n"),
        });
      }

      await db
        .update(transactions)
        .set({
          agentSplitPct: String(input.agentSplitPct),
          brokerageSplitPct: String(input.brokerageSplitPct),
          teamLeaderSplitPct: String(input.teamLeaderSplitPct),
          referralSplitPct: String(input.referralSplitPct),
        } as any)
        .where(eq(transactions.id, input.transactionId));

      return { success: true, warnings };
    }),
});
