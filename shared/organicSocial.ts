/**
 * Organic social lead sources.
 *
 * Organic posts (Birdie's, from October 2026) carry tracked links with
 * utm_medium=social and the platform spelled out in utm_source. A contact
 * created from such a visit is filed under "Organic Social", with the
 * platform as the sub-source when it is one of the five below.
 *
 * Two rules keep paid Meta traffic out of the organic channel:
 *   - utm_medium must be exactly "social" (case and surrounding spaces
 *     ignored). Not a contains-match: "paid_social" is paid.
 *   - "fb" and "ig" never map to anything organic, not even the parent.
 *     Those abbreviations are what Meta ads write; the organic links spell
 *     the platform out on purpose.
 */
export const ORGANIC_SOCIAL_PARENT = "Organic Social";

export const ORGANIC_SOCIAL_CHILDREN = ["Instagram", "Facebook", "LinkedIn", "YouTube", "TikTok"] as const;
export type OrganicSocialChild = (typeof ORGANIC_SOCIAL_CHILDREN)[number];

const CHILD_BY_UTM_SOURCE: Record<string, OrganicSocialChild> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
};

/** Abbreviations written by paid Meta ads. Never organic. */
const PAID_META_SOURCES = new Set(["fb", "ig"]);

export type OrganicSocialTarget =
  /** File under Organic Social > child. */
  | { kind: "child"; child: OrganicSocialChild }
  /** File under the Organic Social parent itself. */
  | { kind: "parent" };

/**
 * Where a visit's tracking says the lead belongs, or null when it is not
 * organic social (the caller then keeps its usual behaviour).
 */
export function organicSocialTarget(
  attribution: { utmSource?: string | null; utmMedium?: string | null } | null | undefined
): OrganicSocialTarget | null {
  const medium = (attribution?.utmMedium ?? "").trim().toLowerCase();
  if (medium !== "social") return null;
  const source = (attribution?.utmSource ?? "").trim().toLowerCase();
  if (PAID_META_SOURCES.has(source)) return null;
  const child = CHILD_BY_UTM_SOURCE[source];
  return child ? { kind: "child", child } : { kind: "parent" };
}

/** Whether a lead source name is one of the Organic Social rows. */
export function isOrganicSocialName(name: string | null | undefined): boolean {
  const value = (name ?? "").trim().toLowerCase();
  return (
    value === ORGANIC_SOCIAL_PARENT.toLowerCase() ||
    ORGANIC_SOCIAL_CHILDREN.some(child => child.toLowerCase() === value)
  );
}
