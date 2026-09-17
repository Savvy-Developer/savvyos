/**
 * Testimonials for the public site.
 *
 * These are real customers' words, which makes two things matter more than
 * they would for other settings.
 *
 * The text must survive storage exactly. The previous editor kept them as
 * "quote | name | role" lines and parsed with split("|"), so a quote
 * containing a pipe silently lost everything after it and a quote containing a
 * line break became two broken entries. Real testimonials are several
 * sentences and frequently pasted with line breaks, so that format would have
 * damaged the text on the way in, quietly, with no error. Rows are stored as
 * rows now, and nothing is parsed out of prose.
 *
 * And nothing may be invented. A quote with no name attached is not shown,
 * because an unattributed testimonial reads as a real customer while being
 * impossible to check. Nothing here fills in a default name, a default role or
 * a rating.
 */

export type Testimonial = {
  quote: string;
  name: string;
  /** What they are, e.g. "STR Investor". Optional; never invented. */
  title?: string;
  /** Where they are, e.g. "Asheville, NC". Optional. */
  location?: string;
  /** Drafts stay out of the public site. Absent means published. */
  published?: boolean;
};

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/**
 * Read one stored row, whatever shape it is in.
 *
 * Rows written before this file used `role` for the title. Those are still in
 * the database, so they are read rather than dropped: a migration that loses a
 * customer's words to rename a field is a bad trade.
 */
export function normalizeTestimonial(row: unknown): Testimonial | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Record<string, unknown>;
  const quote = text(source.quote);
  const name = text(source.name);
  // Both are required. A quote with nobody attached cannot be verified by a
  // reader, and a name with no quote is not a testimonial.
  if (!quote || !name) return null;
  const title = text(source.title) || text(source.role);
  const location = text(source.location);
  const out: Testimonial = { quote, name };
  if (title) out.title = title;
  if (location) out.location = location;
  // Only an explicit false hides a row, so existing rows stay visible.
  if (source.published === false) out.published = false;
  return out;
}

export function normalizeTestimonials(rows: unknown): Testimonial[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(normalizeTestimonial)
    .filter((row): row is Testimonial => row !== null);
}

/** What a visitor sees: published rows, in the order the studio put them. */
export function publishedTestimonials(rows: unknown): Testimonial[] {
  return normalizeTestimonials(rows).filter(row => row.published !== false);
}

/**
 * The line under the name.
 *
 * Joined only from what is there. With neither a title nor a location it
 * returns null and the line is not rendered, rather than printing a separator
 * with nothing around it or inventing a label like "STR Investor".
 */
export function attributionLine(row: Testimonial): string | null {
  const parts = [row.title, row.location].filter(
    (part): part is string => !!part && part.length > 0
  );
  return parts.length ? parts.join(" · ") : null;
}

/** Move a row within the list. Out of range indexes leave it untouched. */
export function moveTestimonial<T>(rows: T[], from: number, to: number): T[] {
  if (from === to) return rows;
  if (from < 0 || from >= rows.length) return rows;
  if (to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
