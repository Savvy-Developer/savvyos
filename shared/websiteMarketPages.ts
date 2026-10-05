/**
 * One market's page on the public site: /markets/<state>/<city>.
 *
 * The address, the title and the description are built here so the page in
 * the browser, the title and description the server puts in the HTML for
 * Google, and the sitemap all agree. Before this, the server did not know
 * these pages at all: Google saw every market page titled "SavvyOS" with no
 * description, and none were in the sitemap (found 5 Oct 2026).
 */

export type MarketForPage = { name: string; state?: string | null; propertyCount?: number | null };

/** "Gulf Shores, AL" -> "gulf shores": the city part, for matching. */
export function marketCityKey(name: unknown): string {
  return String(name || "").split(",")[0].trim().toLowerCase();
}

/** "Hilton Head & Bluffton" -> "hilton-head-and-bluffton". */
export function marketSlug(name: unknown): string {
  return marketCityKey(name)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The state part of the address: "al", or "us" for a market with no state. */
export function marketStateSlug(state: string | null | undefined): string {
  return String(state || "us").trim().toLowerCase();
}

/** "/markets/al/gulf-shores" (no /newsite prefix). */
export function marketPagePath(market: MarketForPage): string {
  return `/markets/${encodeURIComponent(marketStateSlug(market.state))}/${marketSlug(market.name)}`;
}

/** The market at /markets/<state>/<city>, or undefined. */
export function findMarketForPage<T extends MarketForPage>(markets: T[], state: string, city: string): T | undefined {
  const wantedState = state.trim().toLowerCase();
  const wantedCity = city.trim().toLowerCase();
  return markets.find(
    market => marketSlug(market.name) === wantedCity && marketStateSlug(market.state) === wantedState
  );
}

/** "Gulf Shores, AL", or just the city when the market has no state. */
export function marketPlace(market: MarketForPage): string {
  const city = String(market.name || "").split(",")[0].trim();
  return [city, (market.state || "").trim()].filter(Boolean).join(", ");
}

/** The page title, without the site name. The browser tab and Google both use it. */
export function marketPageTitle(market: MarketForPage): string {
  return `${marketPlace(market)} Short-Term Rentals for Sale`;
}

/** The description Google shows under the title. Says how many properties only when there are some. */
export function marketPageDescription(market: MarketForPage): string {
  const place = marketPlace(market);
  const count = Number(market.propertyCount) || 0;
  if (count > 0) {
    return `Browse ${count} short-term rental ${count === 1 ? "property" : "properties"} for sale in ${place}, with projected revenue, and talk to a local STR agent who knows the market.`;
  }
  return `Short-term rental investing in ${place}: see properties for sale as they are listed, and talk to a local STR agent who knows the market.`;
}
