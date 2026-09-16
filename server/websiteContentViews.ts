import crypto from "crypto";

/**
 * Counting reads of a public article without keeping anything about who read it.
 *
 * Two numbers are worth having: how many times a post was opened, and roughly
 * how many different people opened it. The second one is the reason this file
 * exists, because the obvious way to get it is to store an IP address, and an
 * IP address is personal data about someone who only read a blog post.
 *
 * Instead each reader becomes a hash of their address, their browser string,
 * the article, the day, and a server secret. That hash is enough to recognise
 * the same reader coming back within the day and useless for anything else:
 *
 * - It cannot be reversed to an address, because the secret is not in the
 *   database and the input space is salted per day.
 * - It cannot be followed between days, because the date is part of the input,
 *   so the same person is a different hash tomorrow. No reading history can be
 *   assembled from this table.
 * - It cannot be joined to any other table, because nothing else stores it.
 *
 * The cost of that is that "unique readers" means unique per day, and somebody
 * who reads on two days counts twice. That is the honest trade, and it is
 * named here so nobody later reads the number as something stricter.
 */

export type ContentKind = "post" | "case_study";

/**
 * The day an event belongs to, in the timezone the business thinks in.
 *
 * UTC would split an American evening across two days, which makes a daily
 * chart wrong in a way that is hard to see and easy to argue about.
 */
export function viewDateKey(at: Date, timeZone = "America/New_York"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * A reader's identifier for one article on one day.
 *
 * Returns null when there is nothing to hash. A request with no address is
 * counted as a view but not as a reader, which is better than inventing a
 * reader or dropping the view.
 */
export function visitorHash(input: {
  ip: string | null | undefined;
  userAgent: string | null | undefined;
  kind: ContentKind;
  contentId: number;
  dateKey: string;
  secret: string;
}): string | null {
  const ip = (input.ip || "").trim();
  if (!ip) return null;
  if (!input.secret) return null;
  // JSON rather than a delimiter. Joining with a separator lets two different
  // readers hash the same: a user agent ending in the separator shifts the
  // boundary between fields. JSON quotes and escapes each field, so the
  // encoding is unambiguous whatever a browser sends.
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        input.secret,
        input.dateKey,
        input.kind,
        input.contentId,
        ip,
        (input.userAgent || "").slice(0, 200),
      ])
    )
    .digest("hex");
}

/**
 * The first address in an X-Forwarded-For chain, which is the client.
 *
 * Behind a proxy the header is a comma separated list appended to on each hop,
 * so the last entry is the nearest proxy and the first is the original caller.
 * Taking the wrong end would give every reader the same hash and report one
 * unique reader forever.
 */
export function clientIpFrom(
  forwardedFor: string | string[] | undefined,
  fallback: string | undefined
): string | null {
  const raw = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (raw) {
    const first = raw.split(",")[0]?.trim();
    if (first) return first;
  }
  return fallback?.trim() || null;
}

export type DailyViewRow = {
  dateKey: string;
  views: number;
  readers: number;
};

export type ViewSummary = {
  views: number;
  readers: number;
  days: DailyViewRow[];
};

/**
 * Roll per-day rows into a summary.
 *
 * Views add up across days. Readers do not, and the total here is the sum of
 * daily readers rather than a true distinct count, which is what the storage
 * can honestly support. The field is named readers rather than unique visitors
 * so it does not promise more than it is.
 */
export function summarize(rows: DailyViewRow[]): ViewSummary {
  const days = [...rows].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return {
    views: days.reduce((total, day) => total + day.views, 0),
    readers: days.reduce((total, day) => total + day.readers, 0),
    days,
  };
}

/**
 * Fill the gaps in a series so a chart shows quiet days instead of skipping
 * them. A line that jumps from Monday to Friday reads as five busy days.
 */
export function fillMissingDays(
  rows: DailyViewRow[],
  from: string,
  to: string
): DailyViewRow[] {
  const byDate = new Map(rows.map(row => [row.dateKey, row]));
  const out: DailyViewRow[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return rows;
  while (cursor.getTime() <= end.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { dateKey: key, views: 0, readers: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
