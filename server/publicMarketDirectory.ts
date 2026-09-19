/**
 * Which markets the public website shows, and how many properties are in each.
 *
 * A market's boundary is its ZIP territories. That is already how SavvyOS
 * defines coverage everywhere else, and reusing it here is what keeps the
 * website and the daily investor email from disagreeing about which market a
 * property sits in. The ZIP rule itself is imported rather than rewritten, for
 * exactly that reason.
 *
 * Two rules run through all of it:
 *
 * 1. A market with no ZIP territories is not shown. With most markets still
 *    unassigned, listing them all would give a visitor a page of markets that
 *    open onto nothing, which reads as a broken site rather than a young one.
 *    Each market appears the moment its ZIPs land, with no code change.
 * 2. Counts are the truth, including zero. A market with territories but
 *    nothing published yet is a real market having a quiet week, and the page
 *    says so. The properties filter takes a stricter line for its own reasons,
 *    documented at `filterableMarkets`.
 */

import { normalizeZip } from "./dailyPropertyEmailMatching";

/**
 * The market statuses the public site will show.
 *
 * Paused and future markets are internal states. Shared with the market list
 * behind the investor's email preferences so a market can never be
 * subscribable in one place and invisible in the other.
 */
export const PUBLIC_MARKET_STATUSES = ["active", "recruiting"] as const;

export type PublicMarketStatus = (typeof PUBLIC_MARKET_STATUSES)[number];

export type MarketRow = {
  id: number;
  name: string;
  state: string;
  status: string;
};

/** One ZIP territory assignment. One ZIP belongs to one market. */
export type ZipAssignment = { zipCode: string; marketProfileId: number };

/** A published property, reduced to the only field that places it. */
export type PlacedProperty = { zip: string | null };

export type MarketDirectoryEntry = {
  id: number;
  name: string;
  /**
   * Null when the market record has no usable state. Several markets span
   * states and carry the literal string "N/A", which is a placeholder rather
   * than a place, and printing it under a market name reads as a bug.
   */
  state: string | null;
  /** How many ZIPs this market owns. Never zero: zero is not listed. */
  zipCount: number;
  /** Published properties whose ZIP falls in this market. May be zero. */
  propertyCount: number;
};

/**
 * ZIP to owning market.
 *
 * The stored ZIP is used as the key exactly as written, and only the incoming
 * property ZIP is normalized on lookup. That asymmetry is deliberate: it is
 * what the daily email does, and matching it means a malformed territory row
 * behaves identically in both places rather than resolving on the website and
 * silently not resolving in the email.
 */
export function zipToMarket(assignments: ZipAssignment[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const assignment of assignments)
    map.set(assignment.zipCode, assignment.marketProfileId);
  return map;
}

/** The market owning this property's ZIP, or null if none does. */
export function marketIdForZip(
  zip: string | null | undefined,
  zipToMarketMap: Map<string, number>
): number | null {
  const normalized = normalizeZip(zip);
  if (!normalized) return null;
  const marketId = zipToMarketMap.get(normalized);
  return marketId === undefined ? null : marketId;
}

/** Whether a property's ZIP falls inside one market's territory. */
export function zipInMarket(
  zip: string | null | undefined,
  marketZips: Set<string>
): boolean {
  const normalized = normalizeZip(zip);
  return normalized !== null && marketZips.has(normalized);
}

/** The ZIPs of one market, as the set `zipInMarket` expects. */
export function marketZipSet(assignments: ZipAssignment[]): Set<string> {
  return new Set(assignments.map(assignment => assignment.zipCode));
}

/**
 * A market's state, or null when the record does not really have one.
 *
 * "N/A" is what a multi-state market carries in this column: Western North
 * Carolina and the Florida Keys both do. It is the absence of a state, so it
 * is treated as absent rather than printed.
 */
export function displayState(state: string | null | undefined): string | null {
  const trimmed = (state || "").trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase() === "N/A" ? null : trimmed;
}

/**
 * Every market the public site will show, with its property count.
 *
 * Ordered by state then name, the same order as the preferences list, so a
 * market sits in the same place wherever an investor meets it. Markets with no
 * real state sort last: they have nothing to sort on, and interleaving them by
 * the literal "N/A" would drop them between Florida and North Carolina for a
 * reason no visitor can see.
 */
export function marketDirectory(
  markets: MarketRow[],
  assignments: ZipAssignment[],
  published: PlacedProperty[]
): MarketDirectoryEntry[] {
  const zipMap = zipToMarket(assignments);

  const zipCounts = new Map<number, number>();
  for (const assignment of assignments)
    zipCounts.set(
      assignment.marketProfileId,
      (zipCounts.get(assignment.marketProfileId) || 0) + 1
    );

  const propertyCounts = new Map<number, number>();
  for (const property of published) {
    const marketId = marketIdForZip(property.zip, zipMap);
    // A property with no ZIP, an unreadable one, or a ZIP in nobody's
    // territory is counted nowhere. It is still on the site; it just cannot be
    // claimed for a market we have not drawn yet.
    if (marketId === null) continue;
    propertyCounts.set(marketId, (propertyCounts.get(marketId) || 0) + 1);
  }

  return markets
    .filter(market =>
      (PUBLIC_MARKET_STATUSES as readonly string[]).includes(market.status)
    )
    .map(market => ({
      id: market.id,
      name: market.name,
      state: displayState(market.state),
      zipCount: zipCounts.get(market.id) || 0,
      propertyCount: propertyCounts.get(market.id) || 0,
    }))
    .filter(entry => entry.zipCount > 0)
    .sort(
      (a, b) =>
        Number(a.state === null) - Number(b.state === null) ||
        (a.state || "").localeCompare(b.state || "") ||
        a.name.localeCompare(b.name)
    );
}

/**
 * The markets worth offering as a filter on the properties list.
 *
 * Stricter than the markets page on purpose. The page is a directory, and a
 * market with territories but nothing published is still worth knowing about.
 * A filter is a promise that picking it shows you something, so a market that
 * currently matches no published property is left out rather than offered as a
 * route to an empty result. This mirrors the rule the other property facets
 * already follow.
 */
export function filterableMarkets(
  directory: MarketDirectoryEntry[]
): MarketDirectoryEntry[] {
  return directory.filter(entry => entry.propertyCount > 0);
}
