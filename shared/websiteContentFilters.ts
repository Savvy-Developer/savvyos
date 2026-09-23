/**
 * Filters for the public Case Studies and Resources pages.
 *
 * Shared so the pages, the Website Studio and the tests all agree on what a
 * band or a tag means.
 */

/**
 * Investment amount bands, the same three the old site offered. Boundaries
 * match it too: exactly $500K and exactly $1M both count as "$500K to $1M".
 */
export const INVESTMENT_BANDS = [
  { value: "under-500k", label: "Under $500K" },
  { value: "500k-1m", label: "$500K to $1M" },
  { value: "1m-plus", label: "$1M+" },
] as const;

export type InvestmentBand = (typeof INVESTMENT_BANDS)[number]["value"];

export function isInvestmentBand(value: string): value is InvestmentBand {
  return INVESTMENT_BANDS.some(band => band.value === value);
}

/** Whether an amount falls in a band. No amount matches no band. */
export function inInvestmentBand(
  amount: number | string | null | undefined,
  band: InvestmentBand
): boolean {
  if (amount == null || amount === "") return false;
  const value = Number(amount);
  if (!Number.isFinite(value)) return false;
  if (band === "under-500k") return value < 500_000;
  if (band === "500k-1m") return value >= 500_000 && value <= 1_000_000;
  return value > 1_000_000;
}

/** $355K, $1.1M, $2M. For card labels, where the exact figure is noise. */
export function compactMoney(amount: number | string | null | undefined): string | null {
  if (amount == null || amount === "") return null;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  // 999,600 rounds to 1000K, so anything that rounds to a million reads as $1M.
  if (value >= 999_500) {
    const millions = Math.round(value / 100_000) / 10;
    return `$${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

/**
 * A tag as it should read. Slug-style tags from the old site
 * ("smoky-mountains-str") become words; a real hyphen in a phrase
 * ("Short-Term Rental Investing") is left alone.
 */
export function tagLabel(tag: string): string {
  const trimmed = tag.trim().replace(/\s+/g, " ");
  if (!trimmed.includes(" ") && trimmed.includes("-") && trimmed === trimmed.toLowerCase()) {
    return trimmed.replace(/-+/g, " ");
  }
  return trimmed;
}

/** Two tags are the same tag if they read the same, ignoring case. */
export function tagKey(tag: string): string {
  return tagLabel(tag).toLowerCase();
}

/** Trimmed, readable, and without repeats. Keeps the first spelling seen. */
export function cleanTags(tags: readonly unknown[] | null | undefined, max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    if (typeof raw !== "string") continue;
    const label = tagLabel(raw);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

/** "a, b,  c" typed in the Studio, as a tag list. */
export function parseTagText(text: string): string[] {
  return cleanTags(text.split(","));
}

/**
 * The tags worth offering as filters: used by at least `minCount` posts,
 * most used first, capped at `limit`. Brand tags ("Savvy STR Agents") are
 * left out, since every post is ours and filtering by it narrows nothing.
 */
export function popularTags(
  posts: ReadonlyArray<{ tags?: readonly unknown[] | null }>,
  { limit = 20, minCount = 2 }: { limit?: number; minCount?: number } = {}
): Array<{ key: string; label: string; count: number }> {
  const byKey = new Map<string, { label: string; count: number }>();
  for (const post of posts) {
    for (const label of cleanTags(post.tags)) {
      const key = label.toLowerCase();
      if (/\bsavvy\b/.test(key)) continue;
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { label, count: 1 });
    }
  }
  return Array.from(byKey.entries())
    .map(([key, entry]) => ({ key, ...entry }))
    .filter(entry => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Whether a post carries any of the chosen tags. No tags chosen matches all. */
export function hasAnyTag(tags: readonly unknown[] | null | undefined, chosen: readonly string[]): boolean {
  if (!chosen.length) return true;
  const keys = new Set(cleanTags(tags).map(tag => tag.toLowerCase()));
  return chosen.some(tag => keys.has(tagKey(tag)));
}
