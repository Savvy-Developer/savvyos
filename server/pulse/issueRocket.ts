export const ROCKET_SORT_ORDER = -1;

/** A meeting has at most one Rocketed Issue. */
export function isRocketedIssue(sortOrder: number | null | undefined) {
  return Number(sortOrder) < 0;
}
