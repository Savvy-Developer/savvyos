const MIN_SAFE_ISSUE_SORT_ORDER = -2_147_483_646;

/**
 * Returns the next meeting-local Issue position for a Rocket action. Lower values
 * render first, so this is always ahead of the current first Issue.
 */
export function nextRocketSortOrder(currentFirstSortOrder: number | null | undefined) {
  const first = Number.isFinite(currentFirstSortOrder) ? Number(currentFirstSortOrder) : 0;
  return Math.max(MIN_SAFE_ISSUE_SORT_ORDER, first - 1);
}
