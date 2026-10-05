/**
 * The daily property email's decisions, kept pure so they can be tested
 * without Resend or a database: what the email says, when the timed send is
 * due, and how a Resend webhook is tied back to a send.
 *
 * The sending itself lives in websiteDailyEmail.ts.
 */

export const PUBLIC_SITE_BASE = "https://home.savvy-agents.com/newsite";

export type BroadcastListing = {
  propertyId: number;
  slug: string;
  headline: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  listPrice: string | number | null;
  beds: string | number | null;
  baths: string | number | null;
  heroImageUrl: string | null;
  /** "Why I like this property", in the assigned agent's words. */
  agentBlurb?: string | null;
  /** The assigned agent's name, for the heading over their note. */
  agentName?: string | null;
  /** The public market that owns the listing's ZIP, when one does. */
  marketName?: string | null;
};

/** The plain subject, used when nothing better can be built. */
export const DEFAULT_SUBJECT_TEMPLATE = "{count} new STR investment properties";
export const DEFAULT_INTRO =
  "Here are the newest short-term rental properties on Savvy STR Agents.";

// ─── Subject line ────────────────────────────────────────────────────────────

/** What the subject is written from. Every field is public on the site. */
export type SubjectListing = {
  city: string | null;
  state: string | null;
  listPrice: string | number | null;
  beds?: string | number | null;
  marketName?: string | null;
};

/** Longer subjects get cut off in most inboxes, so none is built past this. */
export const SUBJECT_MAX_LENGTH = 65;

/** "$725K", "$1.15M". Short enough to put two in a subject. */
function compactPrice(value: number): string {
  if (value >= 999_500) return `$${Math.round(value / 10_000) / 100}M`;
  return `$${Math.max(1, Math.round(value / 1000))}K`;
}

/** "Outer Banks, North Carolina" and "Columbus, OH" both lose the state. */
function shortMarketName(name: string | null | undefined): string {
  return (name || "").split(",")[0].replace(/\s+/g, " ").trim();
}

type Place = { key: string; alone: string; inList: string; count: number };

/**
 * Where the listings are: the market when the ZIP belongs to one, else the
 * city. Most listed first, then A to Z, so the order the listings arrive in
 * never changes the subject.
 */
function placesOf(listings: SubjectListing[]): Place[] {
  const places = new Map<string, Place>();
  for (const listing of listings) {
    const market = shortMarketName(listing.marketName);
    const city = (listing.city || "").replace(/\s+/g, " ").trim();
    const state = (listing.state || "").trim();
    if (!market && !city) continue;
    const key = (market || `${city}|${state}`).toLowerCase();
    const known = places.get(key);
    if (known) {
      known.count += 1;
      continue;
    }
    places.set(key, {
      key,
      // A city carries its state, because Glendale is in four of them.
      alone: market || [city, state].filter(Boolean).join(", "),
      inList: market || [city, state].filter(Boolean).join(" "),
      count: 1,
    });
  }
  return Array.from(places.values()).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key)
  );
}

/** Ways to name the places, fullest first, for when the full list is too long. */
function placePhrases(places: Place[]): string[] {
  const names = places.map(place => place.inList);
  if (names.length === 0) return [];
  if (names.length === 1) return [places[0].alone];
  const phrases: string[] = [];
  if (names.length <= 3) {
    phrases.push(`${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`);
  }
  const andMore = (shown: number) => {
    const rest = names.length - shown;
    const lead = names.slice(0, shown).join(", ");
    phrases.push(`${lead} & ${rest} more ${rest === 1 ? "market" : "markets"}`);
    phrases.push(`${lead} & ${rest} more`);
  };
  if (names.length > 2) andMore(2);
  if (names.length > 2) andMore(1);
  phrases.push(`${names.length} markets`);
  return phrases;
}

type SubjectFacts = {
  count: number;
  /** Place phrases, fullest first. Empty when no listing has a place. */
  places: string[];
  placeCount: number;
  /** Lowest price, or the only one. Null when no listing has a price. */
  low: string | null;
  /** "$359K to $1.15M". Null unless there are two different prices. */
  range: string | null;
  /** "3 bed", for a single listing. */
  beds: string | null;
};

function subjectFacts(listings: SubjectListing[]): SubjectFacts {
  const prices = listings
    .map(listing => Number(listing.listPrice))
    .filter(price => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  const low = prices.length ? compactPrice(prices[0]) : null;
  const high = prices.length ? compactPrice(prices[prices.length - 1]) : null;
  const places = placesOf(listings);
  const beds = listings.length === 1 ? trimNumber(listings[0].beds ?? null) : null;
  return {
    count: listings.length,
    places: placePhrases(places),
    placeCount: places.length,
    low,
    range: low && high && low !== high ? `${low} to ${high}` : null,
    beds: beds ? `${beds} bed` : null,
  };
}

/**
 * One way of writing the subject. Returns its wordings fullest first, and the
 * first that fits is used. Each ends with a short wording that needs neither
 * a place nor a price, so every pattern can always say something and the
 * day's pattern is never swapped for a neighbour's.
 *
 * Only count, place and list price go in. Revenue and returns are behind the
 * login on the site and stay out of the subject for the same reason they stay
 * out of the body.
 */
type SubjectPattern = (facts: SubjectFacts) => string[];

const withPlaces = (facts: SubjectFacts, write: (place: string) => string) =>
  facts.places.map(write);

const SEVERAL: SubjectPattern[] = [
  f => [
    ...(f.range ? withPlaces(f, p => `${f.count} new STR deals: ${p}, ${f.range}`) : []),
    ...withPlaces(f, p => `${f.count} new STR deals in ${p}`),
    f.range ? `${f.count} new STR deals, ${f.range}` : `${f.count} new STR deals`,
  ],
  f => [
    ...withPlaces(f, p => `Just listed in ${p}: ${f.count} STR properties`),
    `Just listed: ${f.count} STR properties`,
  ],
  f => [
    ...(f.placeCount > 1 ? [`${f.count} STR options across ${f.placeCount} markets today`] : []),
    ...(f.placeCount === 1 ? [`${f.count} STR options in ${f.places[0]} today`] : []),
    `${f.count} STR options to look at today`,
  ],
  f => [
    ...(f.range ? [`New today: ${f.count} STR properties, ${f.range}`] : []),
    f.low ? `New today: ${f.count} STR properties from ${f.low}` : `New today: ${f.count} STR properties`,
  ],
  f => [
    ...(f.low ? withPlaces(f, p => `${p}: ${f.count} fresh STR listings from ${f.low}`) : []),
    ...withPlaces(f, p => `${p}: ${f.count} fresh STR listings`),
    f.low ? `${f.count} fresh STR listings from ${f.low}` : `${f.count} fresh STR listings today`,
  ],
  f => [
    ...(f.low ? withPlaces(f, p => `From ${f.low}: ${f.count} new STR properties in ${p}`) : []),
    ...(f.low ? [] : withPlaces(f, p => `New in ${p}: ${f.count} STR properties`)),
    f.low ? `From ${f.low}: ${f.count} new STR properties today` : `${f.count} new STR properties today`,
  ],
  f => [
    ...withPlaces(f, p => `${f.count} new STR listings in ${p}. Take a look`),
    `${f.count} new STR listings. Take a look`,
  ],
  f => [
    ...(f.range ? withPlaces(f, p => `Today's ${f.count} STR picks: ${p}, ${f.range}`) : []),
    ...withPlaces(f, p => `Today's ${f.count} STR picks: ${p}`),
    f.range ? `Today's ${f.count} STR picks, ${f.range}` : `Today's ${f.count} STR picks`,
  ],
];

/** The same eight, worded for one listing. Same order, so the rotation holds. */
const SINGLE: SubjectPattern[] = [
  f => [
    ...(f.beds && f.low ? withPlaces(f, p => `New STR deal in ${p}: ${f.beds}, ${f.low}`) : []),
    ...(f.low ? withPlaces(f, p => `New STR deal in ${p}, ${f.low}`) : []),
    ...withPlaces(f, p => `New STR deal in ${p}`),
    f.low ? `New STR deal at ${f.low}` : "One new STR deal",
  ],
  f => [
    ...(f.beds ? withPlaces(f, p => `Just listed in ${p}: ${f.beds} STR property`) : []),
    ...withPlaces(f, p => `Just listed in ${p}: a new STR property`),
    "Just listed: a new STR property",
  ],
  f => [
    ...withPlaces(f, p => `One new STR option in ${p} today`),
    "One new STR option to look at today",
  ],
  f => [
    ...(f.beds && f.low ? [`New today: ${f.beds} STR property at ${f.low}`] : []),
    f.low ? `New today: one STR property at ${f.low}` : "New today: one STR property",
  ],
  f => [
    ...(f.low ? withPlaces(f, p => `${p}: a fresh STR listing at ${f.low}`) : []),
    ...withPlaces(f, p => `${p}: a fresh STR listing`),
    f.low ? `A fresh STR listing at ${f.low}` : "A fresh STR listing today",
  ],
  f => [
    ...(f.low ? withPlaces(f, p => `At ${f.low}: a new STR property in ${p}`) : []),
    ...(f.low ? [] : withPlaces(f, p => `New in ${p}: one STR property`)),
    f.low ? `At ${f.low}: a new STR property today` : "A new STR property today",
  ],
  f => [
    ...withPlaces(f, p => `A new STR listing in ${p}. Take a look`),
    "A new STR listing. Take a look",
  ],
  f => [
    ...(f.low ? withPlaces(f, p => `Today's STR pick: ${p}, ${f.low}`) : []),
    ...withPlaces(f, p => `Today's STR pick: ${p}`),
    f.low ? `Today's STR pick at ${f.low}` : "Today's new STR pick",
  ],
];

export const SUBJECT_PATTERN_COUNT = SEVERAL.length;

/** Days since 1970 for a "YYYY-MM-DD" run date, so each day moves one along. */
function dayNumber(runDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(runDate || "");
  if (!match) return 0;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? Math.floor(time / 86_400_000) : 0;
}

function plainSubject(count: number): string {
  return count === 1
    ? "A new STR investment property"
    : DEFAULT_SUBJECT_TEMPLATE.replace("{count}", String(count));
}

/**
 * The subject written from the listings in a send: how many, where, and the
 * price range. Eight patterns, one per day in turn, so two days in a row
 * never read the same. Eight rather than seven, so a weekday does not get the
 * same pattern every week.
 *
 * Pure: the same run date and the same listings always give the same subject,
 * in any order. That is what lets the preview, the test and the real send
 * agree without the subject being stored anywhere.
 */
export function buildSubject(listings: SubjectListing[], runDate: string): string {
  const count = listings.length;
  if (count === 0) return plainSubject(0);
  const patterns = count === 1 ? SINGLE : SEVERAL;
  const today = ((dayNumber(runDate) % patterns.length) + patterns.length) % patterns.length;
  return (
    patterns[today](subjectFacts(listings)).find(
      subject => subject.length <= SUBJECT_MAX_LENGTH
    ) ?? plainSubject(count)
  );
}

/**
 * The subject line. A custom one saved in the Website Studio wins, with
 * "{count}" replaced by the number of listings. With none saved, the subject
 * is written from the listings (see buildSubject).
 */
export function renderSubject(
  template: string | null | undefined,
  listings: SubjectListing[],
  runDate: string
): string {
  const custom = (template || "").trim();
  if (!custom) return buildSubject(listings, runDate);
  return custom.replace(/\{count\}/g, String(listings.length)).slice(0, 200);
}

/** Tracking tags on every link, so visits and sign-ups can be traced to the send. */
export function trackedUrl(url: string, runDate: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}utm_source=savvy&utm_medium=email&utm_campaign=daily-properties-${runDate}`;
}

export function listingUrl(slug: string): string {
  return `${PUBLIC_SITE_BASE}/properties/${encodeURIComponent(slug)}`;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (value: string | number | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(parsed);
};

const trimNumber = (value: string | number | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(Number.isInteger(parsed) ? parsed : Math.round(parsed * 10) / 10);
};

// ─── "Why I like this property" ──────────────────────────────────────────────

/** The most lines of the agent's note a card shows before "See more...". */
export const BLURB_MAX_LINES = 5;
/**
 * Roughly how many characters fit on one line of the note at the card's full
 * width (560px card, 14px text). Mail clients cannot be trusted to clamp
 * lines themselves, so the note is cut here, by length.
 */
export const BLURB_CHARS_PER_LINE = 70;
const SEE_MORE_LABEL = "See more...";

type LinePosition = { lines: number; column: number };

/** Where the text stands after one more word, wrapping the way a mail client would. */
function afterWord(position: LinePosition, word: string, perLine: number): LinePosition {
  const length = word.length;
  if (position.column > 0 && position.column + 1 + length <= perLine) {
    return { lines: position.lines, column: position.column + 1 + length };
  }
  const lines = position.column === 0 ? position.lines : position.lines + 1;
  if (length <= perLine) return { lines, column: length };
  // A word longer than a line (a pasted link) breaks across several.
  return {
    lines: lines + Math.floor((length - 1) / perLine),
    column: ((length - 1) % perLine) + 1,
  };
}

/**
 * The agent's note, cut to what fits in maxLines lines of a card.
 *
 * A line break the agent typed counts as a line. A note that fits comes back
 * whole. A longer one is cut at a word boundary, leaving room on the last
 * line for the "See more..." link, and `truncated` tells the caller to add it.
 */
export function clampBlurb(
  raw: string | null | undefined,
  maxLines = BLURB_MAX_LINES,
  perLine = BLURB_CHARS_PER_LINE
): { text: string; truncated: boolean } {
  const paragraphs = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map(line => line.split(" "));
  if (!paragraphs.length) return { text: "", truncated: false };

  const lineBreak = (position: LinePosition): LinePosition => ({
    lines: position.lines + 1,
    column: 0,
  });

  let end: LinePosition = { lines: 1, column: 0 };
  paragraphs.forEach((words, index) => {
    if (index > 0) end = lineBreak(end);
    for (const word of words) end = afterWord(end, word, perLine);
  });
  if (end.lines <= maxLines) {
    return { text: paragraphs.map(words => words.join(" ")).join("\n"), truncated: false };
  }

  // Room for the ellipsis, a space and the link on the last line.
  const lastLineRoom = perLine - (SEE_MORE_LABEL.length + 2);
  const kept: string[][] = [];
  let position: LinePosition = { lines: 1, column: 0 };
  cut: for (let index = 0; index < paragraphs.length; index += 1) {
    if (index > 0) {
      position = lineBreak(position);
      if (position.lines > maxLines) break;
    }
    const line: string[] = [];
    kept.push(line);
    for (const word of paragraphs[index]) {
      const next = afterWord(position, word, perLine);
      const fits =
        next.lines < maxLines || (next.lines === maxLines && next.column <= lastLineRoom);
      if (!fits) break cut;
      line.push(word);
      position = next;
    }
  }
  let text = kept
    .filter(line => line.length)
    .map(line => line.join(" "))
    .join("\n");
  // One unbroken run longer than the whole allowance: cut it mid-word.
  if (!text) text = paragraphs[0][0].slice(0, Math.max(1, (maxLines - 1) * perLine + lastLineRoom));
  text = text.replace(/[\s,;:(\-]+$/, "");
  return { text: /[.!?…]$/.test(text) ? text : `${text}…`, truncated: true };
}

type BlurbListing = { agentBlurb?: string | null; agentName?: string | null };

/** "Why Dana Reyes likes this property", or "we" when no agent is assigned. */
export function blurbHeading(agentName: string | null | undefined): string {
  const name = (agentName || "").replace(/\s+/g, " ").trim();
  return name ? `Why ${name} likes this property` : "Why we like this property";
}

/**
 * The agent's note for a listing card, or "" when the listing has none.
 * `url` is the card's own link, so "See more..." opens the same page and is
 * counted as a click on the same listing.
 */
export function renderBlurbHtml(listing: BlurbListing, url: string): string {
  const blurb = clampBlurb(listing.agentBlurb);
  if (!blurb.text) return "";
  const body = escapeHtml(blurb.text).replace(/\n/g, "<br />");
  const more = blurb.truncated
    ? ` <a href="${escapeHtml(url)}" style="color:#0891b2;font-weight:bold;white-space:nowrap;">${SEE_MORE_LABEL}</a>`
    : "";
  return `<div style="margin-top:12px;padding:10px 12px;background:#f1f9fb;border-left:3px solid #10c0df;border-radius:6px;">
                <div style="color:#05314a;font-size:13px;font-weight:bold;">${escapeHtml(blurbHeading(listing.agentName))}</div>
                <div style="color:#334155;font-size:14px;line-height:1.5;margin-top:4px;">${body}${more}</div>
              </div>`;
}

/** The same note for the plain text email, as lines. Empty when there is none. */
export function renderBlurbText(listing: BlurbListing, url: string): string[] {
  const blurb = clampBlurb(listing.agentBlurb);
  if (!blurb.text) return [];
  return [
    `${blurbHeading(listing.agentName)}:`,
    blurb.truncated ? `${blurb.text} ${SEE_MORE_LABEL} ${url}` : blurb.text,
  ];
}

/**
 * The shared email sent to the big list.
 *
 * Same rule as the personal email: photo, headline, place, price, beds and
 * baths, plus the agent's "Why I like this property" note when there is one,
 * cut to five lines. Revenue and returns stay behind the login on the site.
 * The unsubscribe link is Resend's own placeholder, which Resend fills in per
 * recipient on a broadcast.
 *
 * The note is the one thing here that the site shows only to signed-in
 * investors (websiteGating.ts). The old site's digest carried it to the whole
 * list, and this email does the same.
 */
export function renderBroadcastEmail(params: {
  listings: BroadcastListing[];
  subject: string;
  intro: string | null | undefined;
  runDate: string;
  unsubscribeUrl?: string;
}): { html: string; text: string } {
  const { listings, runDate } = params;
  const intro = (params.intro || "").trim() || DEFAULT_INTRO;
  const unsubscribe = params.unsubscribeUrl ?? "{{{RESEND_UNSUBSCRIBE_URL}}}";
  const browseUrl = trackedUrl(`${PUBLIC_SITE_BASE}/properties`, runDate);
  const signUpUrl = trackedUrl(`${PUBLIC_SITE_BASE}/sign-up`, runDate);

  const cards = listings
    .map(listing => {
      const url = trackedUrl(listingUrl(listing.slug), runDate);
      const place = [listing.city, listing.state].filter(Boolean).join(", ");
      const beds = trimNumber(listing.beds);
      const baths = trimNumber(listing.baths);
      const facts = [
        money(listing.listPrice),
        beds ? `${beds} bed` : null,
        baths ? `${baths} bath` : null,
      ]
        .filter(Boolean)
        .join(" &middot; ");
      const title = escapeHtml(listing.headline || listing.address || "New listing");
      return `
        <tr><td style="padding:0 0 16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
            ${
              listing.heroImageUrl
                ? `<tr><td><a href="${escapeHtml(url)}"><img src="${escapeHtml(listing.heroImageUrl)}" width="100%" alt="${title}" style="display:block;width:100%;max-height:240px;object-fit:cover;" /></a></td></tr>`
                : ""
            }
            <tr><td style="padding:16px 18px;">
              <a href="${escapeHtml(url)}" style="color:#05314a;font-size:17px;font-weight:bold;text-decoration:none;">${title}</a>
              ${place ? `<div style="color:#64748b;font-size:13px;margin-top:4px;">${escapeHtml(place)}</div>` : ""}
              ${facts ? `<div style="color:#0f172a;font-size:14px;margin-top:8px;font-weight:600;">${facts}</div>` : ""}
              ${renderBlurbHtml(listing, url)}
              <a href="${escapeHtml(url)}" style="display:inline-block;margin-top:14px;background:#10c0df;color:#03293c;font-weight:bold;font-size:13px;text-decoration:none;padding:9px 16px;border-radius:8px;">View the property</a>
            </td></tr>
          </table>
        </td></tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding-bottom:18px;">
          <div style="color:#05314a;font-size:20px;font-weight:800;">Savvy STR Agents</div>
          <div style="color:#0f172a;font-size:15px;margin-top:10px;line-height:1.5;">${escapeHtml(intro)}</div>
        </td></tr>
        ${cards}
        <tr><td style="padding:4px 0 20px 0;" align="center">
          <a href="${escapeHtml(browseUrl)}" style="color:#0891b2;font-weight:bold;font-size:14px;">Browse every property</a>
        </td></tr>
        <tr><td style="padding-top:8px;color:#64748b;font-size:12px;line-height:1.6;">
          <p style="margin:0 0 10px 0;">
            Projected revenue and returns are on each property page. <a href="${escapeHtml(signUpUrl)}" style="color:#0891b2;">Create a free account</a> to see them and get emails matched to your budget and markets.
          </p>
          <p style="margin:0 0 10px 0;">
            <a href="${escapeHtml(unsubscribe)}" style="color:#64748b;">Unsubscribe</a>
          </p>
          <p style="margin:0;color:#94a3b8;">
            Projections are estimates, not guarantees. Verify regulations, financing and operating assumptions before investing.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    "Savvy STR Agents",
    "",
    intro,
    "",
    ...listings.map(listing => {
      const place = [listing.city, listing.state].filter(Boolean).join(", ");
      const price = money(listing.listPrice);
      const url = trackedUrl(listingUrl(listing.slug), runDate);
      return [
        listing.headline || listing.address || "New listing",
        [place, price].filter(Boolean).join(" · "),
        ...renderBlurbText(listing, url),
        url,
        "",
      ].join("\n");
    }),
    `Browse every property: ${browseUrl}`,
    "",
    `Unsubscribe: ${unsubscribe}`,
  ].join("\n");

  return { html, text };
}

/**
 * Whether the timed send should go now. Due from the chosen hour for three
 * hours, so a restart just after the hour still sends that day, but switching
 * the email on late at night does not fire a send at 11 PM.
 */
export function isScheduledSendDue(params: {
  enabled: boolean;
  masterSwitch: boolean;
  sendHourEt: number;
  easternHour: number;
  alreadySentToday: boolean;
}): boolean {
  if (!params.enabled || !params.masterSwitch || params.alreadySentToday) return false;
  const start = Math.min(23, Math.max(0, Math.round(params.sendHourEt)));
  return params.easternHour >= start && params.easternHour < start + 3;
}

/** The property a clicked link pointed at, or "other" for any other link. */
export function linkKeyFromUrl(url: string | null | undefined): string {
  if (!url) return "other";
  const match = String(url).match(/\/properties\/([^/?#]+)/);
  if (!match) return "other";
  try {
    return decodeURIComponent(match[1]).slice(0, 191);
  } catch {
    return match[1].slice(0, 191);
  }
}

export const DAILY_EMAIL_TAG = "daily_email_run";

/**
 * The run a personal email belongs to, from its Resend tags. Resend sends tags
 * on webhooks as an object ({ name: value }); an array of { name, value } is
 * accepted too.
 */
export function runIdFromTags(tags: unknown): number | null {
  let raw: unknown = null;
  if (Array.isArray(tags)) {
    raw = tags.find((tag: any) => tag?.name === DAILY_EMAIL_TAG)?.value;
  } else if (tags && typeof tags === "object") {
    raw = (tags as Record<string, unknown>)[DAILY_EMAIL_TAG];
  }
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** "a@x.com, b@y.com" or one per line, as a clean list of addresses. */
export function parseEmailList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/**
 * Whether a Resend webhook might be an open or click on a daily email: the
 * right type, an email ID, and either our run tag (personal and team emails)
 * or a broadcast ID (the big-list email). Anything else is skipped without a
 * database lookup.
 */
export function isDailyEmailEngagementCandidate(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const { type, data } = event as { type?: unknown; data?: any };
  if (type !== "email.opened" && type !== "email.clicked") return false;
  if (!data || typeof data !== "object" || !data.email_id) return false;
  return runIdFromTags(data.tags) !== null || typeof data.broadcast_id === "string";
}

/**
 * The headers that let a mail client show its own "Unsubscribe" button and
 * unsubscribe in one click (RFC 8058). Gmail and Yahoo expect them on bulk
 * mail. The URL is SavvyOS's signed unsubscribe link, which accepts the
 * one-click POST.
 */
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
