/**
 * Which new listings belong in which investor's daily email.
 *
 * Kept as pure functions, separate from the sending, because this is the part
 * that decides what a person is told. A bug in the mailer sends nothing and
 * somebody notices. A bug here sends the wrong properties to the right people,
 * looks fine, and nobody notices for a month.
 *
 * Three rules run through all of it:
 *
 * 1. A blank preference means "no opinion", not "nothing". Someone who never
 *    set a budget wants to hear about everything, not be silently excluded.
 * 2. A preference that is set is honoured strictly. If a listing has no price
 *    on file and the investor set a budget, it does not match: we cannot claim
 *    a property is within a range when we do not know what it costs.
 * 3. A preference we cannot evaluate is reported, not guessed. Market matching
 *    depends on ZIP territories being filled in. When they are not, the honest
 *    answer is "this filter could not be applied", which the caller surfaces,
 *    rather than quietly sending everything or quietly sending nothing.
 */

export type Preferences = {
  notificationsEnabled: boolean;
  emailFrequency: "daily" | "weekly" | "never";
  budgetMin: string | number | null;
  budgetMax: string | number | null;
  minBedrooms: number | null;
  /** Empty means every market. */
  marketProfileIds: number[];
};

export type Listing = {
  propertyId: number;
  slug: string;
  listPrice: string | number | null;
  beds: string | number | null;
  zip: string | null;
  publishedAt: Date | null;
};

/** ZIP code to the market that owns it. One ZIP belongs to one market. */
export type ZipToMarket = Map<string, number>;

export type MatchOutcome = {
  listings: Listing[];
  /**
   * True when the investor filtered by market but no ZIP territory could
   * resolve it, so the market filter did nothing. The caller reports this
   * rather than sending a misleading email.
   */
  marketFilterUnresolvable: boolean;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const digits = String(zip).replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : null;
}

/** Whether this investor should be emailed at all today. */
export function shouldEmailToday(
  preferences: Preferences | null,
  cadence: "daily" | "weekly"
): boolean {
  // No preferences row at all means the account predates the form or the row
  // failed to write. Defaulting to sending would be mailing someone who never
  // agreed to it, so the default is silence.
  if (!preferences) return false;
  if (!preferences.notificationsEnabled) return false;
  if (preferences.emailFrequency === "never") return false;
  return preferences.emailFrequency === cadence;
}

export function matchesBudget(listing: Listing, preferences: Preferences): boolean {
  const min = toNumber(preferences.budgetMin);
  const max = toNumber(preferences.budgetMax);
  if (min === null && max === null) return true;

  const price = toNumber(listing.listPrice);
  // A listing with no price cannot be shown to satisfy a budget. Including it
  // would be asserting something about a number we do not have.
  if (price === null) return false;

  if (min !== null && price < min) return false;
  if (max !== null && price > max) return false;
  return true;
}

export function matchesBedrooms(listing: Listing, preferences: Preferences): boolean {
  const wanted = preferences.minBedrooms;
  if (wanted === null || wanted === undefined) return true;
  const beds = toNumber(listing.beds);
  if (beds === null) return false;
  return beds >= wanted;
}

/**
 * Market matching runs through ZIP territories, because that is how SavvyOS
 * defines a market's boundary. A listing is in a market when its ZIP is
 * assigned to that market.
 */
export function matchesMarket(
  listing: Listing,
  preferences: Preferences,
  zipToMarket: ZipToMarket
): boolean {
  if (!preferences.marketProfileIds.length) return true;
  const zip = normalizeZip(listing.zip);
  if (!zip) return false;
  const marketId = zipToMarket.get(zip);
  if (marketId === undefined) return false;
  return preferences.marketProfileIds.includes(marketId);
}

/**
 * The listings to put in one investor's email.
 *
 * `candidates` are the listings published since this investor was last
 * emailed. Deciding what counts as new belongs to the caller, which knows when
 * the last send happened; this function only filters.
 */
export function selectListingsFor(
  candidates: Listing[],
  preferences: Preferences,
  zipToMarket: ZipToMarket
): MatchOutcome {
  const wantsMarketFilter = preferences.marketProfileIds.length > 0;
  // Can any of the chosen markets actually be resolved? If a market has no ZIP
  // codes assigned, it matches nothing, and an investor who picked only such
  // markets would receive an empty email forever without ever being told why.
  const resolvableMarkets = wantsMarketFilter
    ? preferences.marketProfileIds.some(id =>
        Array.from(zipToMarket.values()).includes(id)
      )
    : true;

  const listings = candidates.filter(
    listing =>
      matchesBudget(listing, preferences) &&
      matchesBedrooms(listing, preferences) &&
      matchesMarket(listing, preferences, zipToMarket)
  );

  return {
    listings,
    marketFilterUnresolvable: wantsMarketFilter && !resolvableMarkets,
  };
}

/**
 * Listings published since a moment, newest first.
 *
 * An investor who has never been emailed gets the last `firstSendLimit`
 * listings rather than every property ever published. The first email should
 * be a useful sample, not an archive dump that gets marked as spam.
 */
export function newSince(
  listings: Listing[],
  since: Date | null,
  firstSendLimit = 5
): Listing[] {
  const sorted = listings
    .filter(listing => listing.publishedAt != null)
    .sort(
      (a, b) =>
        (b.publishedAt as Date).getTime() - (a.publishedAt as Date).getTime()
    );
  if (since === null) return sorted.slice(0, firstSendLimit);
  return sorted.filter(
    listing => (listing.publishedAt as Date).getTime() > since.getTime()
  );
}
