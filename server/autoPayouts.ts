/**
 * Auto-Payout Generation
 *
 * After a transaction is created, this module looks up:
 * 1. The agent's commission split (from users.commissionSplit)
 * 2. Whether the agent is in a group (group_members + groups)
 * 3. The contact's lead source referral % (from lead_sources.referralPercent)
 *
 * Then runs the commission engine and inserts payout items.
 */
import { getDb } from "./db";
import { users, contacts, leadSources, groups, groupMembers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { calculateCommission, type CommissionResult } from "./commissionEngine";
import { createPayoutItem, upsertAutoPayoutItem } from "./db";

interface AutoPayoutContext {
  transactionId: number;
  agentId: number;
  primaryContactId: number;
  gci: number; // gross commission income in dollars
  // Transaction-level referral override (takes priority over contact lead source)
  referralSourceName?: string | null;
  referralPayoutPct?: number | null;
}

/**
 * Look up agent's commission split, group info, and contact's referral %.
 * Then calculate and insert payout items.
 */
export async function generateAutoPayouts(ctx: AutoPayoutContext): Promise<{
  result: CommissionResult | null;
  skipped: boolean;
  skipReason?: string;
}> {
  const db = await getDb();
  if (!db) return { result: null, skipped: true, skipReason: "DB unavailable" };

  if (!ctx.gci || ctx.gci <= 0) {
    return { result: null, skipped: true, skipReason: "No GCI set on transaction" };
  }

  // 1. Look up agent's commission split
  const [agent] = await db
    .select({ commissionSplit: users.commissionSplit, name: users.name })
    .from(users)
    .where(eq(users.id, ctx.agentId));

  if (!agent?.commissionSplit) {
    return { result: null, skipped: true, skipReason: "Agent has no commission split configured" };
  }

  // 2. Check if agent is in a group
  const [membership] = await db
    .select({
      groupId: groupMembers.groupId,
      leaderSplitOverride: groupMembers.leaderSplitOverride,
    })
    .from(groupMembers)
    .where(eq(groupMembers.userId, ctx.agentId))
    .limit(1);

  let groupLeaderSplit: number | undefined;
  let groupLeaderId: number | undefined;
  let groupLeaderName: string | undefined;

  if (membership) {
    // Get the group's default leader split and leader info
    const [group] = await db
      .select({
        leaderCommissionSplit: groups.leaderCommissionSplit,
        leaderId: groups.leaderId,
      })
      .from(groups)
      .where(eq(groups.id, membership.groupId));

    if (group) {
      // Per-agent override takes priority over group default
      groupLeaderSplit = membership.leaderSplitOverride ?? group.leaderCommissionSplit ?? undefined;
      groupLeaderId = group.leaderId ?? undefined;

      if (groupLeaderId) {
        const [leader] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, groupLeaderId));
        groupLeaderName = leader?.name ?? "Group Leader";
      }
    }
  }

  // 3. Determine referral %
  // Priority: transaction-level referralPayoutPct > contact's lead source referralPercent
  let referralPercent: number | undefined;
  let referralSourceName: string | undefined;

  if (ctx.referralPayoutPct != null && ctx.referralPayoutPct > 0) {
    // Transaction-level override takes priority
    referralPercent = ctx.referralPayoutPct;
    referralSourceName = ctx.referralSourceName ?? "Referral Partner";
  } else {
    // Fall back to contact's lead source
    const [contact] = await db
      .select({ leadSourceId: contacts.leadSourceId })
      .from(contacts)
      .where(eq(contacts.id, ctx.primaryContactId));

    if (contact?.leadSourceId) {
      const [source] = await db
        .select({
          referralPercent: leadSources.referralPercent,
          name: leadSources.name,
        })
        .from(leadSources)
        .where(eq(leadSources.id, contact.leadSourceId));

      if (source?.referralPercent) {
        referralPercent = source.referralPercent;
        referralSourceName = source.name ?? "Referral Partner";
      }
    }
  }

  // 4. Run the commission engine
  // isInGroup is true whenever the agent has a group membership AND a group leader split is configured
  // (either per-agent override or group default). Even if leaderSplitOverride is null, we fall back
  // to the group's default leaderCommissionSplit.
  const isInGroup = !!membership && !!groupLeaderSplit && groupLeaderSplit > 0;
  const commissionResult = calculateCommission({
    agentSplit: agent.commissionSplit,
    isInGroup,
    groupLeaderSplit: isInGroup ? groupLeaderSplit : undefined,
    referralPercent: referralPercent ?? 0,
    gci: ctx.gci,
  });

  // 5. Upsert payout items (one per payeeType per transaction — no duplicates)
  for (const payout of commissionResult.payouts) {
    let payeeUserId: number | null = null;
    let payeeName: string | null = null;

    if (payout.payeeType === "agent") {
      payeeUserId = ctx.agentId;
      payeeName = agent.name;
    } else if (payout.payeeType === "savvy_str_agents") {
      payeeName = "Savvy STR Agents";
    } else if (payout.payeeType === "group_leader") {
      payeeUserId = groupLeaderId ?? null;
      payeeName = groupLeaderName ?? "Group Leader";
    } else if (payout.payeeType === "referral_partner") {
      payeeName = referralSourceName ?? "Referral Partner";
    }

    await upsertAutoPayoutItem({
      transactionId: ctx.transactionId,
      payeeType: payout.payeeType,
      payeeUserId,
      payeeName,
      percentage: String(payout.percentage),
      commissionType: "percentage",
      amount: String(payout.amount.toFixed(2)),
      isPaid: false,
      referralFeePaidBy: payout.referralFeePaidBy ?? null,
      notes: payout.notes ?? null,
      isAutoGenerated: true,
      isOverride: false,
    });
  }

  return { result: commissionResult, skipped: false };
}
