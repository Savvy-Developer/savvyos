/**
 * What a visitor without an account may see on the public website.
 *
 * The operating figures are the reason an investor is on the page at all, so
 * they are what an account is worth creating for. Everything a stranger needs
 * in order to decide whether this listing is worth an account stays visible:
 * the address, the price, the photos, the beds and baths and square footage,
 * the write-up, and the agent to call. Only the numbers behind the opportunity
 * are held back.
 *
 * Two decisions worth keeping:
 *
 * 1. The redaction happens on the server, and the fields come back null rather
 *    than omitted. Hiding them in the browser would leave them one devtools
 *    tab away, which is not gating, it is a curtain.
 * 2. `gated` is true only when something was actually withheld. A listing with
 *    no analysis attached has nothing behind the login, and telling a visitor
 *    to sign up to see numbers that do not exist would be a lie the page tells
 *    on our behalf.
 */

/**
 * The property fields an anonymous visitor does not receive.
 *
 * These mirror what the live site holds back today: annual revenue, the two
 * return figures, occupancy, and the average nightly rate.
 */
export const GATED_PROPERTY_FIELDS = [
  "projectedRevenue",
  "cashOnCash",
  "capRate",
  "occupancyRate",
  "averageDailyRate",
] as const;

export type GatedPropertyField = (typeof GATED_PROPERTY_FIELDS)[number];

export type Gated<T> = T & { gated: boolean; blurbGated: boolean };

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * Strip the gated figures from one property row for a visitor who is not
 * signed in. A signed-in visitor gets the row untouched.
 */
export function gateProperty<T extends Record<string, any>>(
  row: T,
  signedIn: boolean
): Gated<T> {
  if (signedIn) return { ...row, gated: false, blurbGated: false };

  const out: Record<string, any> = { ...row };
  let withheld = false;
  for (const field of GATED_PROPERTY_FIELDS) {
    if (!(field in out)) continue;
    if (hasValue(out[field])) withheld = true;
    out[field] = null;
  }

  // The agent's note is withheld too, but it is counted separately. The
  // figures panel and the note are two different places on the page, and a
  // listing with a note but no figures must not put a "sign in to see the
  // numbers" panel over an empty set of numbers.
  let blurbWithheld = false;
  if ("agentBlurb" in out) {
    blurbWithheld = hasValue(out.agentBlurb);
    out.agentBlurb = null;
  }

  return { ...out, gated: withheld, blurbGated: blurbWithheld } as Gated<T>;
}

export function gateProperties<T extends Record<string, any>>(
  rows: T[],
  signedIn: boolean
): Array<Gated<T>> {
  return rows.map(row => gateProperty(row, signedIn));
}

/**
 * The revenue range and the comparable listings behind it.
 *
 * This is the strongest thing the site publishes, because it is a projection
 * with its evidence attached, so it sits entirely behind the login. An
 * anonymous visitor gets nothing rather than a teaser, and `gated` says
 * whether there was in fact something there to withhold.
 */
export function gateEvidence<
  R,
  C,
>(
  evidence: { revenue: R | null; comps: C[] },
  signedIn: boolean
): { revenue: R | null; comps: C[]; gated: boolean } {
  if (signedIn) return { ...evidence, gated: false };
  const hadSomething =
    evidence.revenue != null || (evidence.comps?.length ?? 0) > 0;
  return { revenue: null, comps: [], gated: hadSomething };
}
