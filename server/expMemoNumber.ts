/**
 * eXp assigns one memo number to each payout side of a transaction.
 * The optional decimal suffix identifies the side (for example, .0, .1, .2).
 */
export const EXP_MEMO_NUMBER_PATTERN = /^\d+(?:\.\d+)?$/;

/** Normalizes optional user input while preserving a nullable storage contract. */
export function normalizeExpMemoNumber(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

/** Returns whether a non-empty memo number uses the supported eXp format. */
export function isValidExpMemoNumber(value: string): boolean {
  return EXP_MEMO_NUMBER_PATTERN.test(value);
}

/** Returns the grouping root for a valid full memo number. */
export function getExpMemoRoot(value: string): string {
  return value.split(".", 1)[0];
}
