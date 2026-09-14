/**
 * The controlled vocabularies a property is tagged with on the public site.
 *
 * These were free text before, one tag per line, which is how the same idea
 * ended up on the site as "Hot tub", "hot-tub" and "Hottub" on three different
 * listings. A visitor filtering for one of those finds a third of the
 * properties that actually have it.
 *
 * Two lists rather than one, because they answer different questions. Strategy
 * is who the property suits; amenities are what it has. They are stored
 * together in featureTags, so nothing about the database changes and existing
 * tags keep working.
 */

export const STRATEGY_TAGS = [
  "Luxury",
  "Family-friendly",
  "Romantic getaway",
  "Adventure",
  "Pet-friendly",
  "Remote work",
  "Beach",
  "Mountain",
  "Urban",
  "Budget-friendly",
] as const;

export const AMENITY_TAGS = [
  "Hot tub",
  "Pool",
  "Game room",
  "Mountain view",
  "Lakefront",
  "Ski-in/ski-out",
  "Fireplace",
  "EV charger",
  "Home theater",
  "Outdoor kitchen",
  "Fire pit",
  "Gym",
  "Sauna",
] as const;

export const ALL_TAGS: readonly string[] = [...STRATEGY_TAGS, ...AMENITY_TAGS];

/**
 * Match a stored tag to one in the vocabulary, ignoring case, hyphens and
 * spacing, so "hot-tub" and "Hot Tub" both resolve to "Hot tub".
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

const CANONICAL = new Map(ALL_TAGS.map(tag => [normalize(tag), tag]));

export function canonicalTag(value: string): string | null {
  return CANONICAL.get(normalize(String(value ?? "").trim())) ?? null;
}

/**
 * Split stored tags into the ones we recognise and the ones we do not.
 *
 * Tags written before the vocabulary existed are kept rather than discarded:
 * someone chose them deliberately, and silently dropping a listing's tags on
 * first save would be a nasty surprise. They are shown separately so an author
 * can see what is not standard and decide.
 */
export function splitTags(tags: unknown): { known: string[]; custom: string[] } {
  const list = Array.isArray(tags) ? tags : [];
  const known: string[] = [];
  const custom: string[] = [];
  for (const raw of list) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const canonical = canonicalTag(value);
    if (canonical) {
      if (!known.includes(canonical)) known.push(canonical);
    } else if (!custom.includes(value)) {
      custom.push(value);
    }
  }
  return { known, custom };
}
