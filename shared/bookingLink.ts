/**
 * An agent's call booking link as a usable URL, or null. Agents often save it
 * without "https://", so that is added; anything that still is not an http(s)
 * address is dropped rather than put behind a button.
 */
export function normalizeBookingLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
