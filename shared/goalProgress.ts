/**
 * Goal progress status for the agent "My Goals" card.
 *
 * Closed production is still what counts toward a goal, but under-contract
 * (pending) deals scheduled to close in the same period are taken into account
 * so an agent whose pending book already covers the goal is not reported as
 * "behind".
 */

export type GoalStatus =
  | "hit" // closed production alone meets the target
  | "on_track_with_pending" // closed + pending meets the target
  | "ahead"
  | "on_pace"
  | "behind";

export type GoalStatusInput = {
  /** Closed production for the period (GCI, closings or volume). */
  actual: number;
  /** Under-contract production scheduled to close in the same period. */
  pending: number;
  /** Goal for the period. */
  target: number;
  /** Share of the period elapsed, 0-100. */
  expectedPct: number;
};

export type GoalStatusResult = {
  status: GoalStatus;
  /** Closed production as a % of target. */
  closedPct: number;
  /** Closed + pending. */
  combined: number;
  /** Closed + pending as a % of target. */
  combinedPct: number;
  /** Absolute gap, in percentage points, between closed % and expected %. */
  paceGap: number;
};

/** Percentage points within which closed production counts as "on pace". */
export const ON_PACE_TOLERANCE = 3;

export function getGoalStatus({ actual, pending, target, expectedPct }: GoalStatusInput): GoalStatusResult {
  const safeActual = Number.isFinite(actual) ? Math.max(actual, 0) : 0;
  const safePending = Number.isFinite(pending) ? Math.max(pending, 0) : 0;
  const combined = safeActual + safePending;
  const closedPct = target > 0 ? Math.round((safeActual / target) * 100) : 0;
  const combinedPct = target > 0 ? Math.round((combined / target) * 100) : 0;
  const diff = closedPct - expectedPct;
  const paceGap = Math.abs(Math.round(diff));

  let status: GoalStatus;
  if (target > 0 && safeActual >= target) status = "hit";
  else if (target > 0 && combined >= target) status = "on_track_with_pending";
  else if (paceGap <= ON_PACE_TOLERANCE) status = "on_pace";
  else if (diff > 0) status = "ahead";
  else status = "behind";

  return { status, closedPct, combined, combinedPct, paceGap };
}
