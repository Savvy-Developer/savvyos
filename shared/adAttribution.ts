/**
 * Ad attribution carried from the ad click into the contact record.
 *
 * A paid lead books through Calendly, and the ad that paid for it is known the
 * whole way along: the ad appends UTM parameters, the landing page passes them
 * into the Calendly embed, Calendly stores them, Zapier reads them. The chain
 * broke here, because the contact had nowhere to put them. These five fields
 * are that place.
 *
 * Two rules matter, and they are opposites on purpose.
 *
 * Lead source is first touch and locked at creation, enforced elsewhere. It
 * answers "how did this person first find us", which never changes.
 *
 * These fields are last touch. They answer "which ad brought them in this
 * time", which does change. Someone who arrived from a referral in May and
 * booked from a Meta ad in September is both, and recording only the first
 * loses the thing that was paid for.
 *
 * The one thing last touch must not do is erase. An organic booking arrives
 * with all five empty, and an empty value is the absence of information, not
 * the information that there was no ad. So blank never overwrites: a later
 * organic booking leaves an earlier real attribution alone.
 */

export const AD_ATTRIBUTION_FIELDS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
] as const;

export type AdAttributionField = (typeof AD_ATTRIBUTION_FIELDS)[number];
export type AdAttribution = Partial<Record<AdAttributionField, string>>;

/** Incoming snake_case key for each field, which is what the Zaps send. */
export const AD_ATTRIBUTION_KEYS: Record<string, AdAttributionField> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_term: "utmTerm",
  utm_content: "utmContent",
};

/** Longest value the columns hold. Anything longer is cut rather than rejected. */
export const AD_ATTRIBUTION_MAX_LENGTH = 255;

/**
 * Read the five values out of a payload.
 *
 * Values arrive as strings, but a JSON producer can send a number, and Meta's
 * campaign, ad set and ad ids are 18 digits: past 2^53 those lose precision as
 * numbers, so everything is handled as text and never parsed.
 *
 * Only non-empty values are returned. A key that is present but blank is left
 * out entirely, which is what makes blank-never-overwrites fall out of the
 * shape rather than needing a second rule at the call site.
 */
export function readAdAttribution(payload: Record<string, unknown>): AdAttribution {
  const out: AdAttribution = {};
  for (const [key, field] of Object.entries(AD_ATTRIBUTION_KEYS)) {
    const raw = payload[key] ?? payload[field];
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "object") continue;
    const value = String(raw).trim();
    if (!value) continue;
    out[field] = value.slice(0, AD_ATTRIBUTION_MAX_LENGTH);
  }
  return out;
}

/**
 * The columns to write on an existing contact.
 *
 * Returns only the fields that carry a value, so a booking with no ad data
 * produces an empty object and the contact's stored attribution survives
 * untouched.
 */
export function adAttributionUpdates(attribution: AdAttribution): AdAttribution {
  const out: AdAttribution = {};
  for (const field of AD_ATTRIBUTION_FIELDS) {
    const value = attribution[field];
    if (value) out[field] = value;
  }
  return out;
}

/**
 * The campaign to show wherever a single "what campaign was this" value is
 * displayed.
 *
 * `campaignSource` predates these fields and is read by reporting, the
 * duplicate finder and the contact merge fingerprint. The landing page handler
 * already fills it from utm_campaign, falling back to utm_source, so this
 * matches that rather than inventing a second convention and leaving the two
 * paths disagreeing.
 *
 * Returns null when there is nothing to record, so the caller writes nothing.
 */
export function campaignSourceFrom(attribution: AdAttribution): string | null {
  const value = attribution.utmCampaign || attribution.utmSource;
  return value ? value.slice(0, AD_ATTRIBUTION_MAX_LENGTH) : null;
}

/**
 * The attribution a website visit should carry, given what is in the address
 * bar now and what the visit has already seen.
 *
 * Every link on the public site is a full page load that drops the query
 * string, so an ad's parameters existed only on the landing page. A visitor who
 * clicked through to a property and booked a showing arrived with none. The
 * visit's attribution is therefore held for the session and sent with any form.
 *
 * Last touch within the visit, blank never overwrites: a page with UTMs
 * replaces what was held, and a page without them leaves it alone. Returns
 * null when there is nothing to hold.
 */
export function sessionAdAttribution(
  current: Record<string, unknown>,
  held: AdAttribution | null | undefined
): AdAttribution | null {
  const fresh = readAdAttribution(current);
  if (Object.keys(fresh).length) return fresh;
  const kept = held ? adAttributionUpdates(held) : {};
  return Object.keys(kept).length ? kept : null;
}

/** The snake_case parameters a form sends, the same keys the Zaps use. */
export function adAttributionParams(attribution: AdAttribution | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attribution) return out;
  for (const [key, field] of Object.entries(AD_ATTRIBUTION_KEYS)) {
    const value = attribution[field];
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Whether the visit that produced a lead was paid for.
 *
 * Meta and Google Ads both write a campaign tag, so a campaign on its own is
 * treated as an ad. Source and medium alone are not: "google / organic" is a
 * search result, and a tag written by hand on a shared link is not a purchase.
 * A medium naming a paid channel counts even with no campaign, because that
 * is how some hand-built ad links are tagged.
 */
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_social", "paidsocial", "paid-social", "display", "cpm", "retargeting", "social_paid"]);

export function isPaidAttribution(attribution: AdAttribution): boolean {
  if (attribution.utmCampaign) return true;
  const medium = (attribution.utmMedium ?? "").trim().toLowerCase();
  return PAID_MEDIUMS.has(medium);
}
