/**
 * Commission Calculation Engine
 *
 * Rules:
 * 1. GCI = purchasePrice × commissionRate (passed in as `gci`)
 * 2. Agent split % applied directly to GCI → agent amount
 * 3. Group Leader (if applicable) receives their split % of GCI
 * 4. Savvy = 100% - agent% - groupLeader%
 *
 * Referral Payout Cascade (when referralPercent > 0):
 *   referralAmount = GCI × referralPercent / 100
 *
 *   Step 1: Deduct from Savvy first.
 *     - Savvy minimum = 20% of GCI
 *     - savvyCanAbsorb = max(0, savvyBase - 20)
 *     - savvyDeduction = min(referralPercent, savvyCanAbsorb)
 *
 *   Step 2: Deduct remainder from Group Leader (if in group).
 *     - glDeduction = min(remaining, groupLeaderBase)
 *
 *   Step 3: Deduct any remaining from Agent.
 *     - agentDeduction = remaining
 *
 * Total always sums to 100% of GCI.
 * Flag for review if Savvy ends up below 20% (edge case guard).
 */

export interface CommissionInput {
  agentSplit: number;        // e.g. 50, 60, 70, 80
  isInGroup: boolean;
  groupLeaderSplit?: number; // % of GCI to group leader (e.g. 10, 20, 30)
  referralPercent?: number;  // % of GCI to referral partner (0 if none)
  gci: number;               // Gross commission income in dollars
}

export interface PayoutItem {
  payeeType: "agent" | "savvy_str_agents" | "group_leader" | "referral_partner";
  percentage: number;
  amount: number;
  referralFeePaidBy?: "savvy" | "agent" | "split" | "group_leader" | null;
  notes?: string;
}

export interface CommissionResult {
  payouts: PayoutItem[];
  flagForReview: boolean;
  flagReason?: string;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Main entry point.
 */
export function calculateCommission(input: CommissionInput): CommissionResult {
  const {
    agentSplit,
    isInGroup,
    groupLeaderSplit,
    referralPercent = 0,
    gci,
  } = input;

  const SAVVY_MIN_PCT = 20; // Savvy minimum % of GCI

  // ── Base splits (before referral) ────────────────────────────────────────────
  const agentBasePct = agentSplit;
  const glBasePct = isInGroup && groupLeaderSplit ? groupLeaderSplit : 0;
  const savvyBasePct = 100 - agentBasePct - glBasePct;

  // ── Referral cascade ─────────────────────────────────────────────────────────
  let agentFinalPct = agentBasePct;
  let glFinalPct = glBasePct;
  let savvyFinalPct = savvyBasePct;

  let flagForReview = false;
  let flagReason: string | undefined;

  if (referralPercent > 0) {
    let remaining = referralPercent;

    // Step 1: deduct from Savvy (floor = SAVVY_MIN_PCT)
    const savvyCanAbsorb = Math.max(0, savvyBasePct - SAVVY_MIN_PCT);
    const savvyDeduction = Math.min(remaining, savvyCanAbsorb);
    savvyFinalPct = savvyBasePct - savvyDeduction;
    remaining -= savvyDeduction;

    // Step 2: deduct remainder from Group Leader
    if (remaining > 0 && glBasePct > 0) {
      const glDeduction = Math.min(remaining, glBasePct);
      glFinalPct = glBasePct - glDeduction;
      remaining -= glDeduction;
    }

    // Step 3: deduct any remaining from Agent
    if (remaining > 0) {
      agentFinalPct = Math.max(0, agentBasePct - remaining);
      remaining = 0;
    }

    // Guard: flag if Savvy ended up below minimum due to floating point
    if (savvyFinalPct < SAVVY_MIN_PCT - 0.01) {
      flagForReview = true;
      flagReason = `Savvy net commission is ${savvyFinalPct.toFixed(2)}% (below ${SAVVY_MIN_PCT}% minimum). Review required.`;
    }
  }

  // ── Build payout items ───────────────────────────────────────────────────────
  const payouts: PayoutItem[] = [];

  payouts.push({
    payeeType: "agent",
    percentage: round(agentFinalPct),
    amount: round((gci * agentFinalPct) / 100),
    notes:
      agentFinalPct < agentBasePct
        ? `Reduced from ${agentBasePct}% due to referral fee`
        : undefined,
  });

  if (isInGroup && glBasePct > 0) {
    payouts.push({
      payeeType: "group_leader",
      percentage: round(glFinalPct),
      amount: round((gci * glFinalPct) / 100),
      notes:
        glFinalPct < glBasePct
          ? `Reduced from ${glBasePct}% due to referral fee`
          : undefined,
    });
  }

  payouts.push({
    payeeType: "savvy_str_agents",
    percentage: round(savvyFinalPct),
    amount: round((gci * savvyFinalPct) / 100),
    notes:
      savvyFinalPct < savvyBasePct
        ? `Reduced from ${savvyBasePct}% due to referral fee`
        : undefined,
  });

  if (referralPercent > 0) {
    // Determine who absorbed the referral cost
    const savvyAbsorbed = round(savvyBasePct - savvyFinalPct);
    const glAbsorbed = round(glBasePct - glFinalPct);
    const agentAbsorbed = round(agentBasePct - agentFinalPct);

    let referralFeePaidBy: "savvy" | "agent" | "split" | "group_leader" = "split";
    if (agentAbsorbed === 0 && glAbsorbed === 0) referralFeePaidBy = "savvy";
    else if (agentAbsorbed === 0 && savvyAbsorbed === 0) referralFeePaidBy = "group_leader";
    else if (glAbsorbed === 0 && savvyAbsorbed === 0) referralFeePaidBy = "agent";

    payouts.push({
      payeeType: "referral_partner",
      percentage: round(referralPercent),
      amount: round((gci * referralPercent) / 100),
      referralFeePaidBy,
    });
  }

  return { payouts, flagForReview, flagReason };
}
