/**
 * Price drop alerts: the decisions, kept pure so they can be tested without
 * a database or Resend. The sending lives in websitePriceDropAlerts.ts.
 */

import { EMAIL_LOGO_WHITE_URL, MARKETING_POSTAL_ADDRESS, PUBLIC_SITE_BASE } from "./websiteDailyEmailLogic";

/** Investors who viewed a listing within this many days hear about a drop. */
export const PRICE_DROP_LOOKBACK_DAYS = 90;

/**
 * Smallest drop worth an email, as a percentage of the price investors were
 * last told about. 1%, as on the old site (its MIN_DROP_PCT), which had no
 * dollar minimum. PRICE_DROP_MIN_PERCENT overrides it.
 */
export const DEFAULT_PRICE_DROP_MIN_PERCENT = 1;

export function priceDropMinPercent(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.PRICE_DROP_MIN_PERCENT ?? "").trim();
  if (!raw) return DEFAULT_PRICE_DROP_MIN_PERCENT;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value < 100 ? value : DEFAULT_PRICE_DROP_MIN_PERCENT;
}

/**
 * Views of a listing that make someone a returning visitor worth telling, the
 * old site's rule: three visits (a reload within half an hour is the same
 * visit) in the lookback window, or a save at any time.
 */
export const PRICE_DROP_MIN_VIEWS = 3;

export const PRICE_DROP_TAG = "price_drop_alert";

const toPrice = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
};

export type PriceCheck =
  /** Nothing to do: no price, or no change worth acting on. */
  | { action: "none" }
  /** First time this listing is checked, or its price went up. Move the baseline, send nothing. */
  | { action: "set_baseline"; baseline: number }
  /** A real drop: alert, then the new price becomes the baseline. */
  | { action: "drop"; oldPrice: number; newPrice: number; baseline: number };

/**
 * Compare today's list price with the price investors were last told about.
 *
 * - No baseline yet: start from today's price, send nothing.
 * - Price went up: move the baseline up, so a later drop is measured from
 *   the higher price, and send nothing.
 * - Price went down by at least the minimum percentage (1% by default): a drop.
 * - A smaller drop: ignored, and the baseline stays where it was, so several
 *   small cuts still add up to one alert once they pass the threshold.
 */
export function checkPrice(
  baseline: string | number | null | undefined,
  current: string | number | null | undefined,
  minPercent: number = DEFAULT_PRICE_DROP_MIN_PERCENT
): PriceCheck {
  const now = toPrice(current);
  if (now === null) return { action: "none" };
  const before = toPrice(baseline);
  if (before === null) return { action: "set_baseline", baseline: now };
  if (now > before) return { action: "set_baseline", baseline: now };
  // In cents, so 1% of a round price is exactly 1%, not a hair under.
  if (now < before && Math.round((before - now) * 100) * 100 >= Math.round(before * 100) * minPercent - 1e-6) {
    return { action: "drop", oldPrice: before, newPrice: now, baseline: now };
  }
  return { action: "none" };
}

/** One key per listing and pair of prices, so a drop is only ever sent once. */
export function priceDropKey(propertyId: number, oldPrice: number, newPrice: number): string {
  return `${propertyId}:${oldPrice.toFixed(2)}:${newPrice.toFixed(2)}`;
}

/**
 * Who should hear about a drop: anyone who viewed the listing in the lookback
 * window or saved it, minus anyone who turned email off or whose address has
 * bounced or unsubscribed. No preferences row means the account never said
 * no, and they looked at this listing themselves, so they are included.
 */
export function shouldAlertAccount(account: {
  status: string | null;
  notificationsEnabled: boolean | null;
  emailFrequency: string | null;
  contactEmailStatus: string | null;
}): boolean {
  if (account.status !== "active") return false;
  if (account.notificationsEnabled === false) return false;
  if (account.emailFrequency === "never") return false;
  if (account.contactEmailStatus === "bounced" || account.contactEmailStatus === "unsubscribed") {
    return false;
  }
  return true;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const trimNumber = (value: string | number | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(Number.isInteger(parsed) ? parsed : Math.round(parsed * 10) / 10);
};

export type PriceDropListing = {
  slug: string;
  headline: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  beds: string | number | null;
  baths: string | number | null;
  heroImageUrl: string | null;
};

/**
 * The alert email, with the old site's wording: "A property you looked at
 * just dropped in price", the old price struck through, the new one large,
 * "Down $X (Y%)", one button to the listing and a line pointing questions to
 * the listing page. The photo and bedrooms are kept from the new site's
 * version. The footer has the postal address and unsubscribe link.
 */
export function renderPriceDropEmail(params: {
  listing: PriceDropListing;
  oldPrice: number;
  newPrice: number;
  firstName: string | null;
  unsubscribeUrl: string | null;
  dateKey: string;
  logoUrl?: string;
}): { subject: string; html: string; text: string } {
  const { listing, oldPrice, newPrice } = params;
  const name = listing.headline || listing.address || "A property you viewed";
  const place = [listing.city, listing.state].filter(Boolean).join(", ");
  const drop = oldPrice - newPrice;
  const dropPct = oldPrice > 0 ? (drop / oldPrice) * 100 : 0;
  const beds = trimNumber(listing.beds);
  const baths = trimNumber(listing.baths);
  const facts = [beds ? `${beds} bd` : null, baths ? `${baths} ba` : null].filter(Boolean).join(" · ");
  const url = `${PUBLIC_SITE_BASE}/properties/${encodeURIComponent(listing.slug)}?src=price-drop&utm_source=savvy&utm_medium=email&utm_campaign=price-drop`;
  const preferencesUrl = `${PUBLIC_SITE_BASE}/account/preferences`;
  const first = (params.firstName || "").trim().split(/\s+/)[0] || "there";
  const subject = `Price drop: ${name} is now ${money(newPrice)}`.slice(0, 200);
  const logo = params.logoUrl || EMAIL_LOGO_WHITE_URL;
  const unsubscribe = params.unsubscribeUrl || preferencesUrl;
  const year = (params.dateKey || "").slice(0, 4) || String(new Date().getFullYear());
  const font = "Arial,Helvetica,sans-serif";

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:600px) {
    .pd-outer { padding: 12px 6px !important; }
    .pd-inner { padding-left: 16px !important; padding-right: 16px !important; }
    .pd-cta a { display: block !important; text-align: center !important; }
  }
</style>
</head><body style="margin:0;padding:0;background:#f4f6f7;font-family:${font};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f6f7;opacity:0;">Now ${money(newPrice)}, down ${money(drop)} (${dropPct.toFixed(1)}%).</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;"><tr><td align="center" class="pd-outer" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">
    <tr><td class="pd-inner" style="background:#05314A;padding:20px 24px;">
      <img src="${escapeHtml(logo)}" alt="Savvy STR Agents" width="140" style="display:block;border:0;width:140px;height:auto;">
    </td></tr>
    <tr><td class="pd-inner" style="padding:28px 24px;font-family:${font};">
      <p style="margin:0 0 16px;font-size:15px;color:#334;">Hi ${escapeHtml(first)},</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#334;">A property you looked at just dropped in price.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8ea;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        ${
          listing.heroImageUrl
            ? `<tr><td style="padding:0;font-size:0;line-height:0;"><a href="${escapeHtml(url)}" target="_blank"><img src="${escapeHtml(listing.heroImageUrl)}" alt="${escapeHtml(name)}" width="550" style="display:block;width:100%;max-width:550px;height:auto;border:0;"></a></td></tr>`
            : ""
        }
        <tr><td style="padding:20px;font-family:${font};">
          <h2 style="margin:0 0 4px;font-size:19px;line-height:1.3;color:#05314A;"><a href="${escapeHtml(url)}" target="_blank" style="color:#05314A;text-decoration:none;">${escapeHtml(name)}</a></h2>
          ${place ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7d85;">${escapeHtml(place)}${facts ? ` &middot; ${facts}` : ""}</p>` : facts ? `<p style="margin:0 0 16px;font-size:14px;color:#6b7d85;">${facts}</p>` : ""}
          <p style="margin:0 0 6px;font-size:14px;color:#6b7d85;"><span style="text-decoration:line-through;">${money(oldPrice)}</span></p>
          <p style="margin:0 0 6px;font-size:28px;font-weight:bold;color:#05314A;">${money(newPrice)}</p>
          <p style="margin:0;font-size:14px;font-weight:bold;color:#0f9d58;">Down ${money(drop)} (${dropPct.toFixed(1)}%)</p>
        </td></tr>
      </table>
      <div class="pd-cta"><a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;background:#10C0DF;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:6px;font-size:15px;font-weight:bold;">View the listing</a></div>
      <p style="margin:22px 0 0;font-size:13px;line-height:1.55;color:#6b7d85;">Questions about this one? Reply on the listing page and the agent covering it will pick it up.</p>
    </td></tr>
    <tr><td class="pd-inner" style="background:#05314A;padding:18px 24px;font-family:${font};">
      <p style="margin:0 0 6px;font-size:12px;line-height:1.55;color:#aebcc4;">You are getting this because you viewed or saved this property on Savvy STR Agents.</p>
      <p style="margin:0 0 6px;font-size:12px;line-height:1.55;color:#7d9099;">${MARKETING_POSTAL_ADDRESS}</p>
      <p style="margin:0;font-size:12px;line-height:1.55;color:#7d9099;">&copy; ${year} Savvy STR Agents. All rights reserved. &middot; <a href="${escapeHtml(preferencesUrl)}" style="color:#aebcc4;text-decoration:underline;">Email preferences</a> &middot; <a href="${escapeHtml(unsubscribe)}" style="color:#aebcc4;text-decoration:underline;">Unsubscribe</a></p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    "Savvy STR Agents",
    "",
    `Hi ${first},`,
    "",
    "A property you looked at just dropped in price.",
    "",
    name,
    [place, facts].filter(Boolean).join(" · "),
    `Was ${money(oldPrice)}, now ${money(newPrice)}`,
    `Down ${money(drop)} (${dropPct.toFixed(1)}%)`,
    "",
    `View the listing: ${url}`,
    "",
    "Questions about this one? Reply on the listing page and the agent covering it will pick it up.",
    "",
    `Email preferences: ${preferencesUrl}`,
    `Unsubscribe: ${unsubscribe}`,
    MARKETING_POSTAL_ADDRESS,
  ].join("\n");

  return { subject, html, text };
}
