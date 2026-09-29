export const ROCKET_SORT_ORDER = -1;
const MIN_SAFE_ISSUE_SORT_ORDER = -2_147_483_646;

export function isRocketedIssue(sortOrder: number | null | undefined) {
  return Number(sortOrder) < 0;
}

/**
 * Inserts a newly Rocketed Issue ahead of every current meeting Issue while
 * retaining the existing Rocketed positions beneath it.
 */
export function nextRocketSortOrder(currentFirstSortOrder: number | null | undefined) {
  const first = Number.isFinite(currentFirstSortOrder) ? Number(currentFirstSortOrder) : 0;
  return Math.max(MIN_SAFE_ISSUE_SORT_ORDER, Math.min(ROCKET_SORT_ORDER, first - 1));
}
