/**
 * One page per market on the public site: /newsite/markets/<state>/<city>.
 *
 * The old savvy-agents.com had these pages (for example /markets/al/gulf-shores)
 * with the market's agents and its properties. The address is built from the
 * market's name and state with the same rule the old site used
 * (packages/db/src/utils/market-slug.ts in savvy-web), so an old link lands on
 * the same page here once the domain moves.
 *
 * Pure: no database, used by the page, the server and the redirects.
 */

export type MarketPathParts = { name: string; state: string | null };

/** "Central & North Florida" -> "central-and-north-florida". Same rule as the old site. */
export function marketCitySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "AL" -> "al". Same rule as the old site. */
export function marketStateSlug(state: string): string {
  return state.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The state part of the address. A market that spans states has no state
 * (stored as "N/A", shown as null); it still gets a page, under "us".
 */
export const NO_STATE_SEGMENT = "us";

function stateSegment(state: string | null | undefined): string {
  const clean = (state ?? "").trim();
  if (!clean || clean.toUpperCase() === "N/A") return NO_STATE_SEGMENT;
  return marketStateSlug(clean) || NO_STATE_SEGMENT;
}

/** The page path for a market, relative to /newsite. */
export function marketPagePath(market: MarketPathParts): string {
  return `/markets/${stateSegment(market.state)}/${marketCitySlug(market.name)}`;
}

/**
 * A market name without a trailing ", State" part: "Outer Banks, North
 * Carolina" -> "Outer Banks", "Columbus, OH" -> "Columbus". The old site and
 * the agent profiles mostly use the short form.
 */
export function marketBaseName(name: string): string {
  const cut = name.replace(/,[^,]*$/, "").trim();
  return cut || name.trim();
}

/** Every slug a market answers to: its own, and its short form. */
function marketSlugs(name: string): Set<string> {
  return new Set([marketCitySlug(name), marketCitySlug(marketBaseName(name))].filter(Boolean));
}

/**
 * Which market an address names, and whether the address is already the
 * market's own (canonical) one.
 *
 * The market's own address wins. Otherwise the short form of its name also
 * matches within the same state, as long as exactly one market fits: the old
 * site said /markets/nc/outer-banks where SavvyOS says "Outer Banks, North
 * Carolina". Anything ambiguous is not guessed.
 */
export function findMarketForPath<T extends MarketPathParts>(
  markets: T[],
  stateSeg: string,
  citySeg: string
): { market: T; canonical: boolean } | null {
  const state = marketStateSlug(stateSeg || "");
  const city = marketCitySlug(citySeg || "");
  if (!state || !city) return null;
  const inState = markets.filter(market => stateSegment(market.state) === state);
  const exact = inState.find(market => marketCitySlug(market.name) === city);
  if (exact) return { market: exact, canonical: citySeg === city && stateSeg === state };
  const close = inState.filter(market => marketSlugs(market.name).has(city));
  return close.length === 1 ? { market: close[0], canonical: false } : null;
}

/**
 * Whether an agent profile's market list names this market. Profiles carry
 * market names as free text copied from the old site, so the short form of the
 * name counts too ("Outer Banks" for "Outer Banks, North Carolina"). Only whole
 * names match: "Florida" never matches "Florida Keys".
 */
export function agentListsMarket(agentMarkets: unknown, marketName: string): boolean {
  if (!Array.isArray(agentMarkets)) return false;
  const targets = marketSlugs(marketName);
  if (!targets.size) return false;
  return agentMarkets.some(value => {
    if (typeof value !== "string") return false;
    return Array.from(marketSlugs(value)).some(slug => targets.has(slug));
  });
}
