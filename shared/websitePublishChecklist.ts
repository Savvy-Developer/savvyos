/**
 * What a property needs before it can be published to the public site.
 *
 * From the 25 Sep call: an agent could save a property with most of its
 * details blank and still publish it, and the listing went live with a stock
 * photo, no price or no bedrooms. Tyler's answer was that it should be
 * blocked. These are the facts every listing card and page shows, so a
 * listing without one of them looks broken to an investor.
 *
 * The pro-forma is deliberately not on the list. A listing without one simply
 * leaves out the revenue section (see publicPropertyEvidence), which is an
 * honest page, not a broken one. It is reported as a recommendation instead.
 *
 * Only publishing is checked. Drafts and archived listings save with anything
 * missing, so work in progress is never lost.
 */

export type PublishFacts = {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  listPrice?: string | number | null;
  beds?: string | number | null;
  baths?: string | number | null;
  heroImageUrl?: string | null;
  galleryImageUrls?: unknown;
};

const filled = (value: unknown) =>
  typeof value === "string" ? value.trim().length > 0 : value != null;

const positive = (value: unknown) => {
  if (value == null || value === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

/** The missing items, in the order they appear on the form. Empty means ready. */
export function missingForPublish(facts: PublishFacts): string[] {
  const missing: string[] = [];
  const gallery = Array.isArray(facts.galleryImageUrls)
    ? facts.galleryImageUrls.filter(url => typeof url === "string" && url.trim())
    : [];
  if (!filled(facts.heroImageUrl) && gallery.length === 0) missing.push("a photo");
  if (!positive(facts.listPrice)) missing.push("the list price");
  if (!positive(facts.beds)) missing.push("bedrooms");
  if (!positive(facts.baths)) missing.push("bathrooms");
  if (!filled(facts.city)) missing.push("the city");
  if (!filled(facts.state)) missing.push("the state");
  if (!filled(facts.zip)) missing.push("the ZIP code");
  return missing;
}

/** "a photo, the list price and the ZIP code" */
export function listMissing(missing: string[]): string {
  if (missing.length <= 1) return missing.join("");
  return `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
}

/** The message the server rejects a publish with, and the form shows. */
export function publishBlockedMessage(missing: string[]): string {
  return `Add ${listMissing(missing)} before publishing. You can still save it as a draft.`;
}
