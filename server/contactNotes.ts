/**
 * Adding an inbound note to a contact without destroying the ones already there.
 *
 * The webhook handlers used to assign `notes` outright, so every Calendly
 * booking replaced whatever an agent had written about that contact. A lead
 * who booked twice lost the first booking's answers, and anything an agent
 * typed in between was gone with no trace.
 *
 * Returns the new value to store, or null when nothing should be written, so
 * the caller can skip the update entirely rather than writing the same text
 * back.
 */

/** The notes column is TEXT, 65,535 bytes. Stay clear of it, allowing for multibyte. */
export const CONTACT_NOTES_MAX_LENGTH = 20_000;

const SEPARATOR = "\n\n";

export function appendContactNote(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  const addition = (incoming ?? "").trim();
  if (!addition) return null;

  const current = (existing ?? "").trim();
  if (!current) return clampFromStart(addition);

  // A retried webhook or a re-sent booking carries the same text. Appending it
  // again would stack duplicates every time Zapier retries.
  if (current.includes(addition)) return null;

  return clampFromStart(`${current}${SEPARATOR}${addition}`);
}

/**
 * Keep the newest text when the notes grow past the column.
 *
 * Drops from the front, at a paragraph boundary where there is one, because
 * the most recent booking is the one an agent is about to act on. Failing the
 * whole webhook over an oversized note would lose the lead instead.
 */
function clampFromStart(value: string): string {
  if (value.length <= CONTACT_NOTES_MAX_LENGTH) return value;
  const tail = value.slice(value.length - CONTACT_NOTES_MAX_LENGTH);
  const boundary = tail.indexOf(SEPARATOR);
  return boundary > 0 && boundary < tail.length - SEPARATOR.length
    ? tail.slice(boundary + SEPARATOR.length)
    : tail;
}
