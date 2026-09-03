import { TRPCError } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import { transactionPayoutItems } from "../drizzle/schema";
import {
  type PayoutStatus,
  isPaidPayoutStatus,
  resolvePayoutStatus,
} from "@shared/payoutStatus";
import { getDb, logActivity } from "./db";
import { canAdminUsePermission } from "./routers/permissions";

type WorkflowActor = {
  id: number;
  role: string;
  name?: string | null;
  email?: string | null;
};

type SetPayoutStatusInput = {
  payoutItemId: number;
  transactionId?: number;
  status: PayoutStatus;
  confirmSettlement?: boolean;
  overrideSettled?: boolean;
  overrideReason?: string | null;
};

export async function canAdministerSettledPayouts(
  actor: WorkflowActor
): Promise<boolean> {
  return canAdminUsePermission(actor, "canAdministerTransactions");
}

/**
 * Applies the payee-level status workflow with an atomic settled guard. Normal
 * edits only target rows that are not currently settled, so a concurrent settle
 * cannot be overwritten by a later request.
 */
export async function setPayoutStatus(
  actor: WorkflowActor,
  input: SetPayoutStatusInput
) {
  if (actor.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins can change payout statuses.",
    });
  }

  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable.",
    });

  const [payout] = await db
    .select()
    .from(transactionPayoutItems)
    .where(eq(transactionPayoutItems.id, input.payoutItemId))
    .limit(1);

  if (
    !payout ||
    (input.transactionId !== undefined &&
      payout.transactionId !== input.transactionId)
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Payout item not found for this transaction.",
    });
  }

  const previousStatus = resolvePayoutStatus(payout.status, payout.isPaid);
  const targetStatus = input.status;
  if (targetStatus === previousStatus) {
    return {
      success: true,
      unchanged: true,
      status: previousStatus,
      isLocked: previousStatus === "settled",
    };
  }

  const isSettled = previousStatus === "settled";
  const canOverrideSettled = await canAdministerSettledPayouts(actor);

  if (isSettled) {
    if (!input.overrideSettled || !canOverrideSettled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "This payout is settled and locked. Only a Transactions Admin can deliberately override it.",
      });
    }
  } else {
    if (input.overrideSettled) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only settled payouts require an override.",
      });
    }
    if (targetStatus === "settled" && !input.confirmSettlement) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Settling a payout requires confirmation because it locks the status.",
      });
    }
  }

  const now = new Date();
  const becomesPaid = isPaidPayoutStatus(targetStatus);
  const updateData = {
    status: targetStatus,
    // Legacy fields remain synchronized during the transition so existing
    // payment dates and integrations remain accurate.
    isPaid: becomesPaid,
    paidDate: becomesPaid ? (payout.paidDate ?? now) : null,
  };

  // A condition on the write is essential: a later non-Transactions-Admin
  // request cannot overwrite a row after another request has settled it.
  const result = isSettled
    ? await db
        .update(transactionPayoutItems)
        .set(updateData)
        .where(
          and(
            eq(transactionPayoutItems.id, payout.id),
            eq(transactionPayoutItems.status, "settled")
          )
        )
    : await db
        .update(transactionPayoutItems)
        .set(updateData)
        .where(
          and(
            eq(transactionPayoutItems.id, payout.id),
            ne(transactionPayoutItems.status, "settled")
          )
        );

  const affectedRows = Number(
    (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0
  );
  if (affectedRows !== 1) {
    const [latest] = await db
      .select({
        status: transactionPayoutItems.status,
        isPaid: transactionPayoutItems.isPaid,
      })
      .from(transactionPayoutItems)
      .where(eq(transactionPayoutItems.id, payout.id))
      .limit(1);
    const latestStatus = resolvePayoutStatus(
      latest?.status,
      latest?.isPaid ?? false
    );
    if (latestStatus === "settled" && !isSettled) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This payout was settled by another update and is now locked.",
      });
    }
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The payout status changed before this update could be saved. Refresh and try again.",
    });
  }

  const isOverride = isSettled && input.overrideSettled;
  await logActivity({
    userId: actor.id,
    action: isOverride
      ? "payout_status_override"
      : targetStatus === "settled"
        ? "payout_status_settled"
        : "payout_status_changed",
    entityType: "transaction",
    entityId: payout.transactionId,
    details: {
      transactionId: payout.transactionId,
      payoutItemId: payout.id,
      payee: payout.payeeName ?? payout.payeeType,
      payeeType: payout.payeeType,
      previousStatus,
      newStatus: targetStatus,
      actingAdministrator: {
        id: actor.id,
        name: actor.name ?? null,
        email: actor.email ?? null,
      },
      timestamp: now.toISOString(),
      ...(isOverride ? { reason: input.overrideReason?.trim() || null } : {}),
    },
  });

  return {
    success: true,
    status: targetStatus,
    previousStatus,
    isLocked: targetStatus === "settled",
    overrideRecorded: isOverride,
  };
}
