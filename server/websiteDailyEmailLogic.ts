/**
 * The daily property email's decisions, kept pure so they can be tested
 * without Resend or a database: what the email says, when the timed send is
 * due, and how a Resend webhook is tied back to a send.
 *
 * The sending itself lives in websiteDailyEmail.ts.
 */

export const PUBLIC_SITE_BASE = "https://home.savvy-agents.com/newsite";

/**
 * The postal address every marketing email must carry (CAN-SPAM). The old
 * savvy-agents.com digest and price drop emails printed it in the footer;
 * the new ones had left it out.
 */
export const MARKETING_POSTAL_ADDRESS = "Savvy STR Agents, 37 Haywood St., #300, Asheville, NC 28801";

/** The footer line that carries the postal address, for the HTML emails. */
export function postalAddressHtml(): string {
  return `<p style="margin:10px 0 0 0;color:#94a3b8;">${MARKETING_POSTAL_ADDRESS}</p>`;
}

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
  /** The assigned agent's name, for the heading over the blurb. */
  agentName?: string | null;
};

export const DEFAULT_SUBJECT_TEMPLATE = "{count} new STR investment properties";
export const DEFAULT_INTRO =
  "Here are the newest short-term rental properties on Savvy STR Agents.";

/** What a subject can be written from: the listings going out, and the day. */
export type SubjectContext = {
  listings: Array<Pick<BroadcastListing, "headline" | "address" | "city" | "state" | "listPrice" | "beds">>;
  /** The send date, YYYY-MM-DD. It picks the day's wording. */
  runDate: string;
};

/** Long enough to say something, short enough to survive a phone's inbox. */
export const SUBJECT_MAX_LENGTH = 65;

/** "$529K", "$1.25M": a price short enough for a subject line. */
export function shortMoney(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${Math.round(amount)}`;
}

/** Whole days since 1970 for a YYYY-MM-DD date, or 0 when it cannot be read. */
function dayNumber(runDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(runDate ?? "");
  if (!match) return 0;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? Math.floor(time / 86_400_000) : 0;
}

/** "Destin", "Destin and Gatlinburg", "Destin, Gatlinburg and 2 more". */
function placeList(cities: string[], named: number): string | null {
  if (!cities.length) return null;
  const shown = cities.slice(0, named);
  const rest = cities.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * The day's subject, written from the listings themselves: how many, where,
 * and the price range. The wording rotates by date, so two days in a row do
 * not read the same, and it is the same for a given day and batch, so the
 * preview, a test and the real send always match.
 *
 * Only what a logged-out visitor may see goes in. No revenue, no returns.
 * Returns null when there is nothing to write from.
 */
export function creativeSubject(context: SubjectContext): string | null {
  const { listings } = context;
  const count = listings.length;
  if (!count) return null;

  const cities: string[] = [];
  for (const listing of listings) {
    const city = (listing.city ?? "").trim();
    if (city && !cities.some(known => known.toLowerCase() === city.toLowerCase())) cities.push(city);
  }
  const prices = listings
    .map(listing => Number(listing.listPrice))
    .filter(price => Number.isFinite(price) && price > 0);
  const low = prices.length ? shortMoney(Math.min(...prices)) : null;
  const high = prices.length ? shortMoney(Math.max(...prices)) : null;
  const range = low && high ? (low === high ? `at ${low}` : `from ${low} to ${high}`) : null;

  // Each wording is tried with two place names, then one, and dropped when it
  // still does not fit or the listings do not have what it needs.
  const fits = (text: string | null) => (text && text.length <= SUBJECT_MAX_LENGTH ? text : null);
  const withPlaces = (write: (places: string) => string): string | null => {
    for (const named of [2, 1]) {
      const places = placeList(cities, named);
      if (!places) return null;
      const text = fits(write(places));
      if (text) return text;
    }
    return null;
  };

  let candidates: Array<string | null>;
  if (count === 1) {
    const [only] = listings;
    const city = cities[0] ?? null;
    const state = (only.state ?? "").trim();
    const price = shortMoney(only.listPrice);
    const beds = Number(only.beds);
    const bedText = Number.isFinite(beds) && beds > 0 ? `${Math.round(beds)}-bed ` : "";
    const title = (only.headline || only.address || "").trim();
    candidates = [
      city && price ? fits(`New in ${city}: ${bedText}STR at ${price}`) : null,
      title ? fits(`Just listed: ${title}`) : null,
      city ? fits(`One new STR worth a look in ${city}`) : null,
      city && price ? fits(`${city} STR at ${price}: take a look`) : null,
      city ? fits(`Fresh STR listing in ${city}${state ? `, ${state}` : ""}`) : null,
      city && bedText ? fits(`A new ${bedText}investment property in ${city}`) : null,
    ];
  } else {
    candidates = [
      withPlaces(places => `${count} new STRs in ${places}`),
      range ? fits(`Just listed: ${count} STRs ${range}`) : null,
      withPlaces(places => `${places}: ${count} new STR deals today`),
      low ? fits(`${count} fresh STR listings, starting at ${low}`) : null,
      withPlaces(places => `New today: STRs in ${places}`),
      range ? fits(`${count} STR investment properties ${range}`) : null,
      low ? withPlaces(places => `From ${low}: ${count} new STRs in ${places}`) : null,
    ];
  }
  const usable = candidates.filter((text): text is string => !!text);
  if (!usable.length) return null;
  return usable[dayNumber(context.runDate) % usable.length];
}

/**
 * The subject line. A custom one has "{count}" replaced with the number of
 * listings. With none set, it is written from the day's listings when they
 * are passed in (see creativeSubject), else a plain default that reads
 * correctly for one or many.
 */
export function renderSubject(
  template: string | null | undefined,
  count: number,
  context?: SubjectContext
): string {
  const custom = (template || "").trim();
  if (!custom) {
    const written = context ? creativeSubject(context) : null;
    if (written) return written;
    return count === 1
      ? "A new STR investment property"
      : DEFAULT_SUBJECT_TEMPLATE.replace("{count}", String(count));
  }
  return custom.replace(/\{count\}/g, String(count)).slice(0, 200);
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

export const BLURB_MAX_LINES = 5;
/** About one line of the card at reading size. Mail clients cannot be asked
 *  to clamp lines, so the cut is made here, by length. */
export const BLURB_LINE_CHARS = 64;

/**
 * The agent's blurb cut to five lines. A line break the agent typed counts as
 * a new line, a long paragraph as however many lines it wraps to, and the cut
 * lands on a word, never in the middle of one.
 */
export function clampBlurb(text: string | null | undefined): { lines: string[]; truncated: boolean } {
  const paragraphs = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const lines: string[] = [];
  let used = 0;
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const remaining = BLURB_MAX_LINES - used;
    if (remaining <= 0) return { lines, truncated: true };
    const needed = Math.max(1, Math.ceil(paragraph.length / BLURB_LINE_CHARS));
    if (needed <= remaining) {
      lines.push(paragraph);
      used += needed;
      continue;
    }
    // Leave room on the last line for the "See more..." link.
    const budget = remaining * BLURB_LINE_CHARS - 14;
    let cut = paragraph.slice(0, budget);
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > budget * 0.6) cut = cut.slice(0, lastSpace);
    lines.push(`${cut.replace(/[\s,;:.!?-]+$/, "")}...`);
    return { lines, truncated: true };
  }
  return { lines, truncated: false };
}

/** "Why Liz Davis likes this property", or a plain heading with no agent. */
export function blurbHeading(agentName: string | null | undefined): string {
  const name = (agentName ?? "").replace(/\s+/g, " ").trim();
  return name ? `Why ${name} likes this property` : "Why we like this property";
}

type BlurbSource = { agentBlurb?: string | null; agentName?: string | null };

/**
 * The blurb block for a listing card: heading, up to five lines, and a
 * "See more..." link to the listing when the text was cut. Empty when the
 * listing has no blurb. `url` must already be the link the card uses.
 */
export function renderBlurbHtml(listing: BlurbSource, url: string): string {
  const { lines, truncated } = clampBlurb(listing.agentBlurb);
  if (!lines.length) return "";
  const body = lines.map(escapeHtml).join("<br />");
  const more = truncated
    ? ` <a href="${escapeHtml(url)}" style="color:#0891b2;font-weight:bold;text-decoration:none;white-space:nowrap;">See more...</a>`
    : "";
  return `<div style="margin-top:12px;padding:10px 12px;background:#f1f5f9;border-left:3px solid #10c0df;border-radius:6px;">
                <div style="color:#05314a;font-size:12px;font-weight:bold;">${escapeHtml(blurbHeading(listing.agentName))}</div>
                <div style="color:#334155;font-size:13px;line-height:1.5;margin-top:4px;">${body}${more}</div>
              </div>`;
}

/** The same block for the plain-text email, one entry per line. */
export function renderBlurbText(listing: BlurbSource, url: string): string[] {
  const { lines, truncated } = clampBlurb(listing.agentBlurb);
  if (!lines.length) return [];
  return [blurbHeading(listing.agentName), ...lines, ...(truncated ? [`See more: ${url}`] : [])];
}

/**
 * The shared email sent to the big list.
 *
 * Same rule as the personal email: only what a logged-out visitor may see
 * (photo, headline, place, price, beds, baths), plus the first five lines of
 * the agent's "Why I like this property" with a link to the rest, which the
 * client asked for on 3 Oct. Revenue and returns stay behind the login on the
 * site. The unsubscribe link is Resend's own
 * placeholder, which Resend fills in per recipient on a broadcast.
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
          ${postalAddressHtml()}
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
    MARKETING_POSTAL_ADDRESS,
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
