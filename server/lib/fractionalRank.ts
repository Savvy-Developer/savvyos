// Use a case-insensitive-safe alphabet because existing MySQL rank columns use
// the database's default case-insensitive collation.
const DIGITS = "!0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MIN = 0;
const MAX = DIGITS.length - 1;
const MIDDLE = Math.floor((MIN + MAX) / 2);

function indexOf(char: string): number {
  const index = DIGITS.indexOf(char);
  if (index < 0) throw new Error(`Invalid rank character: ${char}`);
  return index;
}

function assertValid(rank: string | null) {
  if (rank !== null && (!rank.length || [...rank].some(char => !DIGITS.includes(char)))) {
    throw new Error("Rank must contain only supported fractional-ranking characters.");
  }
}

/**
 * Returns a key that sorts strictly between a and b using the database's
 * normal lexicographic order. Null represents an unbounded edge.
 */
export function rankBetween(a: string | null, b: string | null): string {
  assertValid(a);
  assertValid(b);
  if (a !== null && b !== null && a >= b) throw new Error("Lower rank must sort before upper rank.");
  if (a === null && b === null) return DIGITS[MIDDLE];
  if (a === null) return rankBefore(b!);
  if (b === null) return rankAfter(a);

  let prefix = "";
  let index = 0;
  while (true) {
    if (index >= a.length) {
      // a is a prefix of b. All generated ranks avoid a bare minimum suffix,
      // so rankBefore can always produce a valid extension here.
      return prefix + rankBefore(b.slice(index));
    }
    const lower = indexOf(a[index]);
    const upper = indexOf(b[index]);
    if (lower === upper) {
      prefix += a[index];
      index += 1;
      continue;
    }
    if (upper - lower > 1) return prefix + DIGITS[Math.floor((lower + upper) / 2)];
    // Adjacent characters: extend the lower side with a suffix above the
    // remaining lower rank, retaining a single-row insert/move write.
    return prefix + a[index] + rankAfter(a.slice(index + 1) || null);
  }
}

export function rankBefore(rank: string): string {
  assertValid(rank);
  if (!rank.length) return DIGITS[MIDDLE];
  const first = indexOf(rank[0]);
  if (first > 1) return DIGITS[Math.floor(first / 2)];
  if (first === 1) return `${DIGITS[MIN]}${DIGITS[MIDDLE]}`;
  // The first digit is minimal, so refine the suffix. The utility never emits
  // a standalone minimum rank, which keeps this branch lexicographically safe.
  if (rank.length === 1) throw new Error("No rank exists before the minimum key; rebalance is required.");
  return `${DIGITS[MIN]}${rankBefore(rank.slice(1))}`;
}

export function rankAfter(rank: string | null): string {
  if (rank === null) return DIGITS[MIDDLE];
  assertValid(rank);
  for (let index = 0; index < rank.length; index += 1) {
    const value = indexOf(rank[index]);
    if (value < MAX) return `${rank.slice(0, index)}${DIGITS[Math.floor((value + MAX + 1) / 2)]}`;
  }
  return `${rank}${DIGITS[MIDDLE]}`;
}

/** Returns evenly spaced, short ranks for a complete ordered list rebalance. */
export function rebalanceRanks(count: number): string[] {
  if (count < 0) throw new Error("Count must be non-negative.");
  const width = Math.max(4, Math.ceil(Math.log(Math.max(count + 2, 2)) / Math.log(DIGITS.length)) + 2);
  const base = BigInt(DIGITS.length);
  const capacity = base ** BigInt(width);
  const step = capacity / BigInt(count + 1);
  return Array.from({ length: count }, (_, offset) => encode(step * BigInt(offset + 1), width));
}

function encode(value: bigint, width: number): string {
  let result = "";
  let remaining = value;
  const base = BigInt(DIGITS.length);
  while (remaining > 0n) {
    result = DIGITS[Number(remaining % base)] + result;
    remaining /= base;
  }
  return result.padStart(width, DIGITS[MIN]);
}

export function needsRebalance(rank: string, threshold = 50): boolean {
  return rank.length > threshold;
}
