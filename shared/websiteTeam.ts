/**
 * The Meet the Team page's people.
 *
 * Kept as rows edited in Website Studio > Team, not written into the page, so
 * a new hire or a changed title is a Studio edit rather than a code release.
 *
 * Nothing here invents anything. The old site's team page shipped with a
 * placeholder founder, placeholder testimonials and "100% client satisfaction";
 * a row with no name is not shown, and no default title, photo or bio is ever
 * filled in.
 */

export type TeamMemberStatus = "draft" | "published" | "archived";

/**
 * Where a person sits on the Team page. Agents are not rows here: the page
 * lists every published agent profile on its own, so a new agent appears
 * without a second edit.
 */
export const TEAM_SECTIONS = ["leadership", "staff"] as const;
export type TeamSection = (typeof TEAM_SECTIONS)[number];
export const TEAM_SECTION_LABELS: Record<TeamSection, string> = {
  leadership: "Leadership",
  staff: "Savvy Staff",
};

export type TeamMember = {
  id?: number;
  name: string;
  title: string | null;
  bio: string | null;
  imageUrl: string | null;
  email: string | null;
  linkedinUrl: string | null;
  section: TeamSection;
  status: TeamMemberStatus;
  sortOrder: number;
};

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, max) : null;
};

/** Only a real web address may become a link on the public page. */
export function safeWebUrl(value: unknown): string | null {
  const clean = text(value, 512);
  if (!clean) return null;
  return /^https?:\/\/[^\s]+$/i.test(clean) ? clean : null;
}

/** Only an image the site can load: absolute http(s), or a path on this host. */
export function safeImageUrl(value: unknown): string | null {
  const clean = text(value, 2048);
  if (!clean) return null;
  if (/^https?:\/\/[^\s]+$/i.test(clean)) return clean;
  if (/^\/[^\s/][^\s]*$/.test(clean)) return clean;
  return null;
}

export function safeEmail(value: unknown): string | null {
  const clean = text(value, 320);
  if (!clean) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean.toLowerCase() : null;
}

/**
 * Read one stored or submitted row. Returns null for a row with no name,
 * because a card with a photo and a title but nobody's name reads as a real
 * person while telling the visitor nothing they can check.
 */
export function normalizeTeamMember(row: unknown): TeamMember | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Record<string, unknown>;
  const name = text(source.name, 160);
  if (!name) return null;
  const status: TeamMemberStatus =
    source.status === "published" || source.status === "archived"
      ? source.status
      : "draft";
  const sortOrder = Number(source.sortOrder);
  const id = Number(source.id);
  const out: TeamMember = {
    name,
    title: text(source.title, 160),
    bio: text(source.bio, 4000),
    imageUrl: safeImageUrl(source.imageUrl),
    email: safeEmail(source.email),
    linkedinUrl: safeWebUrl(source.linkedinUrl),
    section: source.section === "leadership" ? "leadership" : "staff",
    status,
    sortOrder: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : 0,
  };
  if (Number.isInteger(id) && id > 0) out.id = id;
  return out;
}

/** What a visitor sees: published rows, in the Studio's order, then by name. */
export function publishedTeam(rows: unknown): TeamMember[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeTeamMember)
    .filter((row): row is TeamMember => row !== null && row.status === "published")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Two letters for a card with no photo: "Tyler Coon" -> "TC". */
export function teamInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}
