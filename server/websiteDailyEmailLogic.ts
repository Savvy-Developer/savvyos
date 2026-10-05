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
  /** The assigned agent's photo, shown beside the blurb. */
  agentPhotoUrl?: string | null;
  sqft?: string | number | null;
  /** Shown as "/ yr projected revenue", as the old digest did. */
  projectedRevenue?: string | number | null;
  /** A fraction (0.114); shown as the ROI badge, as on the site's cards. */
  cashOnCash?: string | number | null;
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

type BlurbSource = { agentBlurb?: string | null; agentName?: string | null; agentPhotoUrl?: string | null };

/**
 * The blurb block for a listing card: heading, up to five lines, and a
 * "See more..." link to the listing when the text was cut. Empty when the
 * listing has no blurb. `url` must already be the link the card uses.
 */
export function renderBlurbHtml(listing: BlurbSource, url: string): string {
  const { lines, truncated } = clampBlurb(listing.agentBlurb);
  if (!lines.length) return "";
  const body = lines.map(escapeHtml).join("<br>");
  const more = truncated
    ? ` <a href="${escapeHtml(url)}" target="_blank" style="color:#0b7a8c;font-weight:bold;text-decoration:underline;white-space:nowrap;">See more...</a>`
    : "";
  const photo = (listing.agentPhotoUrl || "").trim();
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px 0;background-color:#f7f9fa;border-radius:8px;"><tr>
                ${
                  photo
                    ? `<td width="52" valign="top" style="padding:14px 0 14px 14px;"><img src="${escapeHtml(photo)}" alt="${escapeHtml(listing.agentName || "Savvy agent")}" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:50%;border:0;"></td>`
                    : ""
                }
                <td valign="top" style="padding:14px 16px 14px ${photo ? "10px" : "16px"};font-family:Arial,Helvetica,sans-serif;">
                  <p style="margin:0 0 4px 0;font-size:12px;font-weight:bold;color:#14323b;text-transform:uppercase;letter-spacing:.4px;">${escapeHtml(blurbHeading(listing.agentName))}</p>
                  <p style="margin:0;font-size:14px;line-height:1.55;color:#3d4b54;">${body}${more}</p>
                </td>
              </tr></table>`;
}

/** The same block for the plain-text email, one entry per line. */
export function renderBlurbText(listing: BlurbSource, url: string): string[] {
  const { lines, truncated } = clampBlurb(listing.agentBlurb);
  if (!lines.length) return [];
  return [blurbHeading(listing.agentName), ...lines, ...(truncated ? [`See more: ${url}`] : [])];
}

// ─── The old site's digest, rebuilt ─────────────────────────────────────────

/**
 * The old site's daily digest went out at 5 PM Eastern, every day, as a
 * Resend broadcast to these three lists (read from its sends in Resend,
 * Oct 2026). With no lists saved in the Studio, the new email goes to the
 * same three, so switching over changes the sender of nothing and the
 * audience of nothing.
 */
export const OLD_SITE_DIGEST_SEGMENTS: ReadonlyArray<{ id: string; name: string }> = [
  { id: "21d6ce52-d41a-4fcd-823e-f8bf5ea5e26d", name: "All Savvy-Agent Users" },
  { id: "a307bd8e-aa16-4238-85f6-55d93663acb6", name: "Old Lofty Leads" },
  { id: "d5fcb6ad-7ce6-43bd-9f7b-69fbcf05d240", name: "Platform Leads" },
];

/** The old site's operator copy (its DIGEST_EMAIL default). */
export const OLD_SITE_DIGEST_INTERNAL_RECIPIENTS: ReadonlyArray<string> = ["lindsey.gordon@savvy.realty"];

/** 5 PM Eastern, the old digest's send time. */
export const DEFAULT_SEND_HOUR_ET = 17;

/**
 * The deals lane the old site sent its digest and price drop alerts from.
 * deals.savvy-agents.com is verified in Resend with click tracking on, and
 * keeps marketing volume off the apex domain that carries login email.
 * EMAIL_FROM_DEALS and EMAIL_REPLY_TO_DEALS override it, the same names the
 * old site used.
 */
export const DEFAULT_DEALS_FROM = "Savvy <deals@deals.savvy-agents.com>";
export const DEFAULT_DEALS_REPLY_TO = "hello@savvy-agents.com";

export function dealsSender(
  env: Record<string, string | undefined> = process.env
): { from: string; replyTo: string } {
  return {
    from: (env.EMAIL_FROM_DEALS || "").trim() || DEFAULT_DEALS_FROM,
    replyTo: (env.EMAIL_REPLY_TO_DEALS || "").trim() || DEFAULT_DEALS_REPLY_TO,
  };
}

export type DailyEmailSettingsShape = {
  enabled: boolean;
  sendHourEt: number;
  segmentIds: string[];
  internalRecipients: string[];
  personalEmailsEnabled: boolean;
  subjectTemplate: string | null;
  introText: string | null;
  updatedAt: Date | null;
};

/**
 * The settings row as the email uses it. Lists and internal recipients that
 * were never saved (null) fall back to the old site's; an empty list someone
 * saved on purpose stays empty.
 */
export function resolveDailyEmailSettings(row: Record<string, any> | null | undefined): DailyEmailSettingsShape {
  const segmentIds = Array.isArray(row?.segmentIds)
    ? (row!.segmentIds as string[])
    : OLD_SITE_DIGEST_SEGMENTS.map(segment => segment.id);
  const internalRecipients = Array.isArray(row?.internalRecipients)
    ? (row!.internalRecipients as string[])
    : [...OLD_SITE_DIGEST_INTERNAL_RECIPIENTS];
  const hour = row?.sendHourEt == null || row.sendHourEt === "" ? NaN : Number(row.sendHourEt);
  return {
    enabled: !!row?.enabled,
    sendHourEt: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SEND_HOUR_ET,
    segmentIds,
    internalRecipients,
    personalEmailsEnabled: row ? !!row.personalEmailsEnabled : true,
    subjectTemplate: row?.subjectTemplate ?? null,
    introText: row?.introText ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

/**
 * The white logo the old digest used, served by this app from
 * client/public/images, so it keeps working after the old site is gone.
 */
export const EMAIL_LOGO_WHITE_URL = "https://home.savvy-agents.com/images/savvy-logo-white.png";

export const BOOK_A_CALL_URL = `${PUBLIC_SITE_BASE}/contact`;
export const PREFERENCES_URL = `${PUBLIC_SITE_BASE}/account/preferences`;

/** The old digest's fixed copy. */
export const DIGEST_PREHEADER = "Open before these properties are snatched up";
export function digestHeadline(count: number): string {
  return count === 1 ? "Don't Sleep on This New STR Deal" : `Don't Sleep on These ${count} New STR Deals`;
}
export function digestSubLine(count: number): string {
  return `${count} New Hand-Picked ${count === 1 ? "Property" : "Properties"}`;
}

/** "Monday, October 5, 2026" for a YYYY-MM-DD send date. */
export function digestDateLabel(runDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(runDate ?? "");
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The return shown on a card, as a percentage with one decimal: the cash on
 * cash figure, which is what the site's own cards label ROI.
 */
export function roiPercent(cashOnCash: string | number | null | undefined): number | null {
  if (cashOnCash === null || cashOnCash === undefined || cashOnCash === "") return null;
  const value = Number(cashOnCash);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1000) / 10;
}

/** "$98,000 / yr projected revenue", or null without a figure. */
export function revenueLine(projectedRevenue: string | number | null | undefined): string | null {
  const amount = money(projectedRevenue ?? null);
  return amount ? `${amount} / yr projected revenue` : null;
}

const FONT = "Arial,Helvetica,sans-serif";

/**
 * The email both daily emails share: the old digest's layout (dark header with
 * the white logo, a card per listing with price, ROI, revenue and the agent's
 * note, the Book a Call block, and the footer with the postal address and
 * unsubscribe link), reworked to stack cleanly on a phone.
 *
 * Revenue and ROI are shown, as they were in the old digest: the people on
 * these lists signed up for exactly that.
 */
export function renderDigestEmail(params: {
  listings: BroadcastListing[];
  runDate: string;
  unsubscribeUrl: string;
  /** Shown under the headline, e.g. "Hi Dana," for the personal email. */
  greeting?: string | null;
  intro?: string | null;
  /** Utm campaign; defaults to the dated daily campaign. */
  campaign?: string;
  logoUrl?: string;
}): { html: string; text: string } {
  const { listings, runDate } = params;
  const count = listings.length;
  const headline = digestHeadline(count);
  const subLine = digestSubLine(count);
  const dateLabel = digestDateLabel(runDate);
  const intro = (params.intro || "").trim();
  const greeting = (params.greeting || "").trim();
  const logo = params.logoUrl || EMAIL_LOGO_WHITE_URL;
  const track = (url: string) => trackedUrl(url, runDate);
  const browseUrl = track(`${PUBLIC_SITE_BASE}/properties`);
  const bookCallUrl = track(BOOK_A_CALL_URL);
  const unsubscribe = params.unsubscribeUrl;

  const cards = listings
    .map(listing => {
      const url = track(listingUrl(listing.slug));
      const href = escapeHtml(url);
      const title = escapeHtml(listing.headline || listing.address || "New listing");
      const place = [listing.city, listing.state].filter(Boolean).map(value => escapeHtml(String(value))).join(", ");
      const price = money(listing.listPrice);
      const roi = roiPercent(listing.cashOnCash);
      const revenue = revenueLine(listing.projectedRevenue);
      const beds = trimNumber(listing.beds);
      const baths = trimNumber(listing.baths);
      const sqft = Number(listing.sqft);
      const facts = [
        beds ? `${beds} bd` : null,
        baths ? `${baths} ba` : null,
        Number.isFinite(sqft) && sqft > 0 ? `${Math.round(sqft).toLocaleString("en-US")} sqft` : null,
      ]
        .filter(Boolean)
        .join(" &middot; ");
      const roiBadge =
        roi !== null
          ? `<span style="display:inline-block;background-color:#e6f8fb;color:#0b7a8c;font-size:13px;font-weight:bold;padding:5px 11px;border-radius:999px;white-space:nowrap;">${roi}% ROI</span>`
          : "";
      return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e7ec;border-radius:12px;overflow:hidden;margin:0 0 22px 0;background-color:#ffffff;">
            ${
              listing.heroImageUrl
                ? `<tr><td style="padding:0;font-size:0;line-height:0;"><a href="${href}" target="_blank"><img src="${escapeHtml(listing.heroImageUrl)}" alt="${title}" width="510" style="display:block;width:100%;max-width:510px;height:auto;border:0;"></a></td></tr>`
                : ""
            }
            <tr><td class="card-content" style="padding:18px 22px 22px 22px;font-family:${FONT};">
              <p style="margin:0 0 2px 0;font-size:18px;font-weight:bold;color:#14323b;line-height:1.35;"><a href="${href}" target="_blank" style="color:#14323b;text-decoration:none;">${title}</a></p>
              ${place ? `<p style="margin:0 0 12px 0;font-size:14px;color:#5b6770;">${place}</p>` : ""}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td valign="middle" class="price-col" style="padding:0 0 4px 0;">
                  ${price ? `<span style="font-size:22px;font-weight:bold;color:#14323b;vertical-align:middle;white-space:nowrap;">${price}</span>` : ""}
                  ${roiBadge ? `<span style="margin-left:8px;vertical-align:middle;">${roiBadge}</span>` : ""}
                </td>
                <td align="right" valign="middle" class="specs-col" style="padding:0 0 4px 0;">
                  ${facts ? `<p style="margin:0 0 2px 0;font-size:14px;color:#5b6770;">${facts}</p>` : ""}
                  ${revenue ? `<p style="margin:0;font-size:14px;color:#0b7a8c;font-weight:bold;">${escapeHtml(revenue)}</p>` : ""}
                </td>
              </tr></table>
              ${renderBlurbHtml(listing, url)}
              <table role="presentation" cellpadding="0" cellspacing="0" class="cta" style="margin-top:16px;"><tr><td align="center" style="background-color:#10c0df;border-radius:8px;">
                <a href="${href}" target="_blank" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:bold;color:#06303a;text-decoration:none;font-family:${FONT};">Show me more</a>
              </td></tr></table>
            </td></tr>
          </table>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<style>
  @media only screen and (max-width:600px) {
    .digest-outer  { padding: 12px 6px !important; }
    .digest-header { padding: 22px 14px 20px 14px !important; }
    .digest-inner  { padding-left: 14px !important; padding-right: 14px !important; }
    .card-content  { padding: 16px 14px 18px 14px !important; }
    .price-col, .specs-col { display: block !important; width: 100% !important; }
    .specs-col     { text-align: left !important; padding-top: 6px !important; }
    .cta, .cta td  { width: 100% !important; }
    .cta a         { display: block !important; }
  }
</style>
</head><body style="margin:0;padding:0;background-color:#eef1f4;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eef1f4;opacity:0;">${escapeHtml(DIGEST_PREHEADER)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4;"><tr><td align="center" class="digest-outer" style="padding:28px 16px;">
  <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e7ec;">
    <tr><td align="center" class="digest-header" style="background-color:#14323b;padding:30px 40px 26px 40px;">
      <img src="${escapeHtml(logo)}" alt="Savvy STR Agents" width="172" style="display:block;width:172px;height:auto;border:0;">
    </td></tr>
    <tr><td style="height:4px;line-height:4px;font-size:0;background-color:#10c0df;">&nbsp;</td></tr>
    <tr><td class="digest-inner" style="padding:32px 44px 8px 44px;font-family:${FONT};">
      ${greeting ? `<p style="margin:0 0 10px 0;font-size:15px;color:#3d4b54;">${escapeHtml(greeting)}</p>` : ""}
      <h1 style="margin:0 0 6px 0;font-size:23px;line-height:1.3;color:#14323b;">${escapeHtml(headline)}</h1>
      <p style="margin:0 0 4px 0;font-size:15px;font-weight:bold;color:#0b7a8c;">${escapeHtml(subLine)}</p>
      ${dateLabel ? `<p style="margin:0 0 ${intro ? "12px" : "18px"} 0;font-size:14px;color:#5b6770;">${dateLabel}</p>` : ""}
      ${intro ? `<p style="margin:0 0 18px 0;font-size:15px;line-height:1.5;color:#3d4b54;">${escapeHtml(intro)}</p>` : ""}
    </td></tr>
    <tr><td class="digest-inner" style="padding:0 44px 4px 44px;">${cards}</td></tr>
    <tr><td align="center" class="digest-inner" style="padding:0 44px 22px 44px;font-family:${FONT};">
      <a href="${escapeHtml(browseUrl)}" target="_blank" style="color:#0b7a8c;font-weight:bold;font-size:14px;">Browse every property</a>
    </td></tr>
    <tr><td align="center" class="digest-inner" style="padding:4px 44px 28px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fafc;border:1px solid #cdeef5;border-radius:12px;"><tr><td align="center" style="padding:26px 22px;font-family:${FONT};">
        <p style="margin:0 0 6px 0;font-size:18px;font-weight:bold;color:#14323b;">STR Success Starts with The Perfect Market Match&trade;</p>
        <p style="margin:0 0 16px 0;font-size:14px;color:#5b6770;">Book a Call with Our Market Advisors Today</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="background-color:#10c0df;border-radius:8px;">
          <a href="${escapeHtml(bookCallUrl)}" target="_blank" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:bold;color:#06303a;text-decoration:none;">Book a Call</a>
        </td></tr></table>
      </td></tr></table>
    </td></tr>
    <tr><td class="digest-inner" style="background-color:#14323b;padding:30px 44px;font-family:${FONT};">
      <img src="${escapeHtml(logo)}" alt="Savvy" width="120" style="display:block;width:120px;height:auto;margin-bottom:14px;border:0;">
      <p style="margin:0 0 6px 0;font-size:13px;line-height:1.55;color:#aebcc4;">Savvy Expansion Agents &middot; Powered by eXp Realty &mdash; short-term rentals nationwide.</p>
      <p style="margin:0 0 6px 0;font-size:12px;line-height:1.55;color:#7d9099;">Projected revenue and ROI are estimates, not guarantees. Verify regulations, financing and operating assumptions before investing.</p>
      <p style="margin:0 0 6px 0;font-size:12px;line-height:1.55;color:#7d9099;">${MARKETING_POSTAL_ADDRESS}</p>
      <p style="margin:0;font-size:12px;line-height:1.55;color:#7d9099;">&copy; ${runDate.slice(0, 4) || new Date().getFullYear()} Savvy STR Agents. All rights reserved. &middot; <a href="${escapeHtml(PREFERENCES_URL)}" style="color:#aebcc4;text-decoration:underline;">Email preferences</a> &middot; <a href="${escapeHtml(unsubscribe)}" style="color:#aebcc4;text-decoration:underline;">Unsubscribe</a></p>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    "Savvy STR Agents",
    "",
    ...(greeting ? [greeting, ""] : []),
    headline,
    subLine,
    ...(dateLabel ? [dateLabel] : []),
    ...(intro ? ["", intro] : []),
    "",
    ...listings.map(listing => {
      const place = [listing.city, listing.state].filter(Boolean).join(", ");
      const roi = roiPercent(listing.cashOnCash);
      const url = track(listingUrl(listing.slug));
      return [
        listing.headline || listing.address || "New listing",
        place,
        [money(listing.listPrice), roi !== null ? `${roi}% ROI` : null].filter(Boolean).join(" · "),
        revenueLine(listing.projectedRevenue) ?? "",
        ...renderBlurbText(listing, url),
        `Show me more: ${url}`,
        "",
      ]
        .filter((line, index, all) => line !== "" || index === all.length - 1)
        .join("\n");
    }),
    `Browse every property: ${browseUrl}`,
    "",
    "STR Success Starts with The Perfect Market Match",
    `Book a Call with Our Market Advisors Today: ${bookCallUrl}`,
    "",
    "Projected revenue and ROI are estimates, not guarantees.",
    `Email preferences: ${PREFERENCES_URL}`,
    `Unsubscribe: ${unsubscribe}`,
    MARKETING_POSTAL_ADDRESS,
  ].join("\n");

  return { html, text };
}

/**
 * The shared email sent to the big list: the digest above. The unsubscribe
 * link is Resend's own placeholder, which Resend fills in per recipient on a
 * broadcast.
 */
export function renderBroadcastEmail(params: {
  listings: BroadcastListing[];
  subject: string;
  intro: string | null | undefined;
  runDate: string;
  unsubscribeUrl?: string;
  logoUrl?: string;
}): { html: string; text: string } {
  return renderDigestEmail({
    listings: params.listings,
    runDate: params.runDate,
    intro: params.intro,
    unsubscribeUrl: params.unsubscribeUrl ?? "{{{RESEND_UNSUBSCRIBE_URL}}}",
    logoUrl: params.logoUrl,
  });
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
