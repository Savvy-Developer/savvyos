import { eq } from "drizzle-orm";
import { Resend } from "resend";

import {
  marketZipCodes,
  websiteAccountEmailSends,
  websiteAccountPreferences,
  websiteAccounts,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { createMarketingUnsubscribeUrl } from "./marketingEmailUnsubscribe";
import {
  selectListingsFor,
  shouldEmailToday,
  type Listing,
  type Preferences,
} from "./dailyPropertyEmailMatching";
import { DAILY_EMAIL_TAG, PUBLIC_SITE_BASE, listUnsubscribeHeaders } from "./websiteDailyEmailLogic";

/**
 * The personal new-property email for investors with a new-site account.
 *
 * The decisions about who gets what live in dailyPropertyEmailMatching, which
 * is pure and tested. This file renders and sends. Scheduling, the review
 * queue and the record of each send belong to the daily email run in
 * websiteDailyEmail.ts, which calls sendPersonalPropertyEmails with the
 * listings an admin approved.
 */

const FROM_ADDRESS = "Savvy STR Agents <properties@savvy-agents.com>";
// Links go to the public site host, not the SavvyOS app host.
const SITE_BASE = PUBLIC_SITE_BASE;

export type EmailListing = Listing & {
  headline: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  heroImageUrl: string | null;
};

const money = (value: string | number | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(parsed);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The email body.
 *
 * Deliberately shows only what a logged out person may see: address, price,
 * beds and baths. The revenue and return figures are behind the login on the
 * site, and an email is the least private place there is, so putting them here
 * would undo the gating rather than respect it. The link is the invitation to
 * go and look.
 */
export function renderDailyPropertyEmail(
  firstName: string | null,
  listings: EmailListing[],
  unsubscribeUrl: string | null
): { subject: string; html: string } {
  const count = listings.length;
  const subject =
    count === 1
      ? `A new investment property in your search`
      : `${count} new investment properties in your search`;

  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,";

  const cards = listings
    .map(listing => {
      const price = money(listing.listPrice);
      const place = [listing.city, listing.state].filter(Boolean).join(", ");
      const url = `${SITE_BASE}/properties/${encodeURIComponent(listing.slug)}`;
      const beds = listing.beds == null ? null : String(listing.beds);
      const facts = [
        price,
        beds ? `${beds} bed` : null,
      ]
        .filter(Boolean)
        .join(" &middot; ");
      return `
        <tr><td style="padding:0 0 16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            ${
              listing.heroImageUrl
                ? `<tr><td><a href="${url}"><img src="${escapeHtml(listing.heroImageUrl)}" width="100%" alt="" style="display:block;width:100%;max-height:220px;object-fit:cover;" /></a></td></tr>`
                : ""
            }
            <tr><td style="padding:16px 18px;">
              <a href="${url}" style="color:#05314a;font-size:17px;font-weight:bold;text-decoration:none;">
                ${escapeHtml(listing.headline || listing.address || "New listing")}
              </a>
              ${place ? `<div style="color:#64748b;font-size:13px;margin-top:4px;">${escapeHtml(place)}</div>` : ""}
              ${facts ? `<div style="color:#0f172a;font-size:14px;margin-top:8px;font-weight:600;">${facts}</div>` : ""}
              <a href="${url}" style="display:inline-block;margin-top:14px;background:#10c0df;color:#03293c;font-weight:bold;font-size:13px;text-decoration:none;padding:9px 16px;border-radius:8px;">View the property</a>
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
          <div style="color:#64748b;font-size:14px;margin-top:8px;">${greeting}</div>
          <div style="color:#0f172a;font-size:15px;margin-top:6px;">
            ${count === 1 ? "A new property" : `${count} new properties`} matching what you are looking for.
          </div>
        </td></tr>
        ${cards}
        <tr><td style="padding-top:8px;color:#64748b;font-size:12px;line-height:1.6;">
          <p style="margin:0 0 10px 0;">
            Projected revenue, returns and the comparable listings behind them are on the property page once you are signed in.
          </p>
          <p style="margin:0 0 10px 0;">
            <a href="${SITE_BASE}/account/preferences" style="color:#0891b2;">Change what you hear about</a>
            ${unsubscribeUrl ? ` &middot; <a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b;">Unsubscribe</a>` : ""}
          </p>
          <p style="margin:0;color:#94a3b8;">
            Projections are estimates, not guarantees. Verify regulations, financing and operating assumptions before investing.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

/** ZIP to market, the map the matcher needs to resolve market preferences. */
async function loadZipToMarket(db: any): Promise<Map<string, number>> {
  const rows = await db
    .select({
      zipCode: marketZipCodes.zipCode,
      marketProfileId: marketZipCodes.marketProfileId,
    })
    .from(marketZipCodes);
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.zipCode, row.marketProfileId);
  return map;
}

export type PersonalSendSummary = {
  considered: number;
  sent: number;
  skippedNoMatches: number;
  skippedNotSubscribed: number;
  failed: number;
  /** Accounts whose market preference cannot be satisfied because those
   *  markets have no ZIP codes assigned. Surfaced rather than swallowed. */
  unresolvableMarketPreferences: number;
};

/**
 * The personal email to investors with a new-site account: the listings in
 * today's approved batch that match each person's budget, bedrooms and
 * markets. Called by the daily email run in websiteDailyEmail.ts, which owns
 * scheduling, the review queue and the run record.
 *
 * One pass over the accounts. A failure to send to one person is recorded and
 * the run continues: one bad address must not stop everyone else's email.
 */
export async function sendPersonalPropertyEmails(params: {
  candidates: EmailListing[];
  runId: number;
  cadence?: "daily" | "weekly";
  asOf?: Date;
}): Promise<PersonalSendSummary> {
  const cadence = params.cadence ?? "daily";
  const asOf = params.asOf ?? new Date();
  const summary: PersonalSendSummary = {
    considered: 0,
    sent: 0,
    skippedNoMatches: 0,
    skippedNotSubscribed: 0,
    failed: 0,
    unresolvableMarketPreferences: 0,
  };
  const db = await getDb();
  if (!db || !params.candidates.length) return summary;

  const [zipToMarket, accounts] = await Promise.all([
    loadZipToMarket(db),
    db
      .select({
        id: websiteAccounts.id,
        email: websiteAccounts.email,
        firstName: websiteAccounts.firstName,
        notificationsEnabled: websiteAccountPreferences.notificationsEnabled,
        emailFrequency: websiteAccountPreferences.emailFrequency,
        budgetMin: websiteAccountPreferences.budgetMin,
        budgetMax: websiteAccountPreferences.budgetMax,
        minBedrooms: websiteAccountPreferences.minBedrooms,
        marketProfileIds: websiteAccountPreferences.marketProfileIds,
      })
      .from(websiteAccounts)
      .leftJoin(
        websiteAccountPreferences,
        eq(websiteAccountPreferences.accountId, websiteAccounts.id)
      )
      .where(eq(websiteAccounts.status, "active")),
  ]);

  for (const account of accounts) {
    summary.considered += 1;

    const preferences: Preferences | null =
      account.notificationsEnabled == null
        ? null
        : {
            notificationsEnabled: !!account.notificationsEnabled,
            emailFrequency: account.emailFrequency as Preferences["emailFrequency"],
            budgetMin: account.budgetMin,
            budgetMax: account.budgetMax,
            minBedrooms: account.minBedrooms,
            marketProfileIds: Array.isArray(account.marketProfileIds)
              ? account.marketProfileIds
              : [],
          };

    if (!shouldEmailToday(preferences, cadence)) {
      summary.skippedNotSubscribed += 1;
      continue;
    }

    // The batch is the listings an admin approved today, and each listing is
    // stamped once it goes out, so nobody gets the same listing twice. No
    // "published since your last email" filter here: that would drop a
    // listing published on Monday and approved on Wednesday.
    const outcome = selectListingsFor(params.candidates, preferences!, zipToMarket);
    if (outcome.marketFilterUnresolvable) {
      summary.unresolvableMarketPreferences += 1;
    }
    if (!outcome.listings.length) {
      // No email on a quiet day. A "nothing new today" message every morning
      // is how a subscription gets muted.
      summary.skippedNoMatches += 1;
      continue;
    }

    const unsubscribeUrl = createMarketingUnsubscribeUrl(account.email);
    const { subject, html } = renderDailyPropertyEmail(
      account.firstName,
      outcome.listings as EmailListing[],
      unsubscribeUrl
    );

    const result = await deliver(account.email, subject, html, params.runId, undefined, unsubscribeUrl);
    if (result.sent) {
      await recordSend(db, account.id, outcome.listings.length, asOf);
      summary.sent += 1;
    } else {
      summary.failed += 1;
      console.error(
        `[DailyPropertyEmail] Failed for account ${account.id}: ${result.error}`
      );
    }
  }

  console.info(
    `[DailyPropertyEmail] run ${params.runId}: considered ${summary.considered}, sent ${summary.sent}, quiet ${summary.skippedNoMatches}, unsubscribed ${summary.skippedNotSubscribed}, failed ${summary.failed}, unresolvable markets ${summary.unresolvableMarketPreferences}.`
  );
  return summary;
}

async function recordSend(
  db: any,
  accountId: number,
  listingCount: number,
  sentAt: Date
) {
  await db
    .insert(websiteAccountEmailSends)
    .values({ accountId, listingCount, sentAt });
}

/**
 * Hand one email to Resend, tagged with its run so opens and clicks can be
 * counted against the send.
 *
 * Returns rather than throws, because one address failing is a fact about that
 * address, not a reason to abandon everyone else still waiting in the loop.
 */
export async function deliver(
  to: string,
  subject: string,
  html: string,
  runId: number,
  text?: string,
  unsubscribeUrl?: string | null
): Promise<{ sent: boolean; error?: string }> {
  if (!ENV.resendApiKey) return { sent: false, error: "Resend is not configured" };
  try {
    const resend = new Resend(ENV.resendApiKey);
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      tags: [
        { name: "category", value: "website_daily_properties" },
        { name: DAILY_EMAIL_TAG, value: String(runId) },
      ],
      // One-click unsubscribe in the mail client, for emails to investors.
      // Team copies and tests pass none.
      ...(unsubscribeUrl ? { headers: listUnsubscribeHeaders(unsubscribeUrl) } : {}),
    });
    if (result.error) {
      return { sent: false, error: result.error.message || "Resend rejected the email" };
    }
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
