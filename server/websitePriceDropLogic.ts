/**
 * Price drop alerts: the decisions, kept pure so they can be tested without
 * a database or Resend. The sending lives in websitePriceDropAlerts.ts.
 */

import { PUBLIC_SITE_BASE } from "./websiteDailyEmailLogic";

/** Investors who viewed a listing within this many days hear about a drop. */
export const PRICE_DROP_LOOKBACK_DAYS = 90;

/**
 * Smallest drop worth an email. A correction of a few dollars is not news,
 * and would teach people to ignore these emails.
 */
export const MIN_PRICE_DROP = 1000;

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
 * - Price went down by at least MIN_PRICE_DROP: a drop.
 * - A smaller drop: ignored, and the baseline stays where it was, so several
 *   small cuts still add up to one alert once they pass the threshold.
 */
export function checkPrice(
  baseline: string | number | null | undefined,
  current: string | number | null | undefined
): PriceCheck {
  const now = toPrice(current);
  if (now === null) return { action: "none" };
  const before = toPrice(baseline);
  if (before === null) return { action: "set_baseline", baseline: now };
  if (now > before) return { action: "set_baseline", baseline: now };
  if (before - now >= MIN_PRICE_DROP) {
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
 * The alert email. Public facts only, like the daily email: photo, name,
 * place, old and new price, beds and baths. Returns stay behind the login.
 */
export function renderPriceDropEmail(params: {
  listing: PriceDropListing;
  oldPrice: number;
  newPrice: number;
  firstName: string | null;
  unsubscribeUrl: string | null;
  dateKey: string;
}): { subject: string; html: string; text: string } {
  const { listing, oldPrice, newPrice } = params;
  const name = listing.headline || listing.address || "A property you viewed";
  const place = [listing.city, listing.state].filter(Boolean).join(", ");
  const saving = oldPrice - newPrice;
  const beds = trimNumber(listing.beds);
  const baths = trimNumber(listing.baths);
  const facts = [beds ? `${beds} bed` : null, baths ? `${baths} bath` : null].filter(Boolean).join(" · ");
  const url = `${PUBLIC_SITE_BASE}/properties/${encodeURIComponent(listing.slug)}?utm_source=savvy&utm_medium=email&utm_campaign=price-drop-${params.dateKey}`;
  const preferencesUrl = `${PUBLIC_SITE_BASE}/account/preferences`;
  const greeting = params.firstName ? `Hi ${escapeHtml(params.firstName)},` : "Hi,";
  const subject = `Price drop: ${name}`.slice(0, 200);

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding-bottom:16px;">
          <div style="color:#05314a;font-size:20px;font-weight:800;">Savvy STR Agents</div>
          <div style="color:#0f172a;font-size:15px;margin-top:10px;line-height:1.5;">${greeting} the price just dropped on a property you looked at.</div>
        </td></tr>
        <tr><td>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
            ${
              listing.heroImageUrl
                ? `<tr><td><a href="${escapeHtml(url)}"><img src="${escapeHtml(listing.heroImageUrl)}" width="100%" alt="${escapeHtml(name)}" style="display:block;width:100%;max-height:260px;object-fit:cover;" /></a></td></tr>`
                : ""
            }
            <tr><td style="padding:18px;">
              <a href="${escapeHtml(url)}" style="color:#05314a;font-size:18px;font-weight:bold;text-decoration:none;">${escapeHtml(name)}</a>
              ${place ? `<div style="color:#64748b;font-size:13px;margin-top:4px;">${escapeHtml(place)}</div>` : ""}
              <div style="margin-top:12px;font-size:14px;color:#64748b;">
                Was <span style="text-decoration:line-through;">${money(oldPrice)}</span>
              </div>
              <div style="margin-top:2px;font-size:22px;font-weight:800;color:#0f172a;">
                Now ${money(newPrice)}
                <span style="font-size:13px;font-weight:700;color:#047857;background:#d1fae5;border-radius:999px;padding:3px 10px;margin-left:6px;">${money(saving)} lower</span>
              </div>
              ${facts ? `<div style="color:#0f172a;font-size:14px;margin-top:8px;">${facts}</div>` : ""}
              <a href="${escapeHtml(url)}" style="display:inline-block;margin-top:16px;background:#10c0df;color:#03293c;font-weight:bold;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:8px;">See the new numbers</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:18px;color:#64748b;font-size:12px;line-height:1.6;">
          <p style="margin:0 0 10px 0;">You are getting this because you viewed or saved this property on Savvy STR Agents.
            <a href="${escapeHtml(preferencesUrl)}" style="color:#0891b2;">Email preferences</a>${
              params.unsubscribeUrl
                ? ` · <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#64748b;">Unsubscribe</a>`
                : ""
            }</p>
          <p style="margin:0;color:#94a3b8;">Projections are estimates, not guarantees. Verify regulations, financing and operating assumptions before investing.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    "Savvy STR Agents",
    "",
    `${params.firstName ? `Hi ${params.firstName},` : "Hi,"} the price just dropped on a property you looked at.`,
    "",
    name,
    place,
    `Was ${money(oldPrice)}, now ${money(newPrice)} (${money(saving)} lower)`,
    facts,
    url,
    "",
    `Email preferences: ${preferencesUrl}`,
    params.unsubscribeUrl ? `Unsubscribe: ${params.unsubscribeUrl}` : "",
  ]
    .filter(line => line !== null)
    .join("\n");

  return { subject, html, text };
}
