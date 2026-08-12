const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length;
const MIDPOINT = ALPHABET[Math.floor(BASE / 2)];

function valueOf(character: string) {
  const value = ALPHABET.indexOf(character);
  if (value < 0) throw new Error(`Invalid rank character: ${character}`);
  return value;
}

function validate(rank: string | null) {
  if (rank !== null && !/^[0-9a-z]+$/.test(rank)) throw new Error("Ranks must contain only lowercase base-36 characters.");
}

/**
 * Returns a sortable rank strictly between `before` and `after` without rewriting
 * neighboring rows. Null represents the beginning or end of a collection.
 */
export function rankBetween(before: string | null, after: string | null): string {
  validate(before);
  validate(after);
  if (before !== null && after !== null && before >= after) throw new Error("The lower rank must sort before the upper rank.");
  if (before === null && after === null) return MIDPOINT;
  if (after === null) return `${before}${MIDPOINT}`;
  if (before === null) return rankBefore(after);

  let index = 0;
  while (before[index] === after[index] && index < before.length) index += 1;
  const prefix = before.slice(0, index);

  // One rank is a prefix of the other. Recurse into the upper suffix to avoid
  // shifting any existing record; generated ranks never use a terminal zero.
  if (index === before.length) return `${prefix}${rankBefore(after.slice(index))}`;

  const lowerValue = valueOf(before[index]);
  const upperValue = valueOf(after[index]);
  if (upperValue - lowerValue > 1) return `${prefix}${ALPHABET[Math.floor((lowerValue + upperValue) / 2)]}`;

  // Adjacent symbols have no one-character gap. Extending the lower rank keeps
  // the new rank below the upper rank while retaining the lower prefix.
  return `${before}${MIDPOINT}`;
}

export function rankBefore(after: string): string {
  validate(after);
  if (!after) return MIDPOINT;
  const first = valueOf(after[0]);
  if (first > 1) return ALPHABET[Math.floor(first / 2)];
  if (first === 1) return `0${MIDPOINT}`;
  return `0${rankBefore(after.slice(1))}`;
}

export function rankAfter(before: string): string {
  validate(before);
  return `${before}${MIDPOINT}`;
}

export function shouldRebalance(ranks: Array<string | null>, maxLength = 50) {
  return ranks.some(rank => (rank?.length ?? 0) > maxLength);
}

/** Generates evenly spaced replacement ranks. Callers can apply in a transaction. */
export function rebalanceRanks<T extends { id: number; position: string }>(items: T[]): Array<{ id: number; position: string }> {
  const width = Math.max(6, Math.ceil(Math.log(Math.max(items.length + 2, 36)) / Math.log(BASE)) + 2);
  const space = BigInt(BASE) ** BigInt(width);
  const step = space / BigInt(items.length + 1);
  return items.map((item, index) => ({ id: item.id, position: (step * BigInt(index + 1)).toString(BASE).padStart(width, "0") }));
}
