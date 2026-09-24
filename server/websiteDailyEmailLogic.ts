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
};

export const DEFAULT_SUBJECT_TEMPLATE = "{count} new STR investment properties";
export const DEFAULT_INTRO =
  "Here are the newest short-term rental properties on Savvy STR Agents.";

/**
 * The subject line. A custom one has "{count}" replaced with the number of
 * listings; with none set, the default reads correctly for one or many.
 */
export function renderSubject(template: string | null | undefined, count: number): string {
  const custom = (template || "").trim();
  if (!custom) {
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

/**
 * The shared email sent to the big list.
 *
 * Same rule as the personal email: only what a logged-out visitor may see
 * (photo, headline, place, price, beds, baths). Revenue and returns stay
 * behind the login on the site. The unsubscribe link is Resend's own
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
      return [
        listing.headline || listing.address || "New listing",
        [place, price].filter(Boolean).join(" · "),
        trackedUrl(listingUrl(listing.slug), runDate),
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
