import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Resend } from "resend";

import {
  marketZipCodes,
  properties,
  scheduledReportRuns,
  websiteAccountEmailSends,
  websiteAccountPreferences,
  websiteAccounts,
  websiteProperties,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { createMarketingUnsubscribeUrl } from "./marketingEmailUnsubscribe";
import {
  dailyPropertyEmailEnabled,
  newSince,
  selectListingsFor,
  shouldEmailToday,
  type Listing,
  type Preferences,
} from "./dailyPropertyEmailMatching";
import {
  addEasternDays,
  easternDateKey,
  easternDateTimeToUtc,
  getEasternTimeParts,
} from "./agentProductionReportScheduler";

/**
 * The new-property email for investors with a website account.
 *
 * The decisions about who gets what live in dailyPropertyEmailMatching, which
 * is pure and tested. This file is the plumbing: read the candidates once, ask
 * that module per investor, render, send, and record what happened.
 *
 * Reuses scheduled_report_runs rather than adding another runs table. It
 * already tracks reportKey, date, status and per-recipient counts, which is
 * exactly what is needed, and one place to look when someone asks whether the
 * email went out is better than two.
 */

const EASTERN_TIME_ZONE = "America/New_York";
const REPORT_HOUR = 8;
const DAILY_KEY = "website_daily_property_email";
const SITE_URL = "https://os.savvy-agents.com";
const FROM_ADDRESS = "Savvy STR Agents <properties@savvy-agents.com>";
const SITE_BASE = `${SITE_URL}/newsite`;

let schedulerTimer: NodeJS.Timeout | null = null;
let startupRecoveryTimer: NodeJS.Timeout | null = null;

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

/** Every published listing that could go in an email today. */
async function loadCandidates(db: any): Promise<EmailListing[]> {
  return db
    .select({
      propertyId: websiteProperties.propertyId,
      slug: websiteProperties.slug,
      headline: websiteProperties.headline,
      heroImageUrl: websiteProperties.heroImageUrl,
      publishedAt: websiteProperties.publishedAt,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
      listPrice: properties.listPrice,
      beds: properties.beds,
    })
    .from(websiteProperties)
    .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
    .where(
      and(
        eq(websiteProperties.status, "published"),
        isNotNull(websiteProperties.publishedAt)
      )
    );
}

export type DailyRunSummary = {
  reportDate: string;
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
 * Send today's emails.
 *
 * One pass over the accounts. A failure to send to one person is recorded and
 * the run continues: one bad address must not stop everyone else's email.
 */
export async function sendDailyPropertyEmails(
  cadence: "daily" | "weekly" = "daily",
  asOf = new Date()
): Promise<DailyRunSummary> {
  const reportDate = easternDateKey(getEasternTimeParts(asOf));
  const summary: DailyRunSummary = {
    reportDate,
    considered: 0,
    sent: 0,
    skippedNoMatches: 0,
    skippedNotSubscribed: 0,
    failed: 0,
    unresolvableMarketPreferences: 0,
  };

  // Paused. Checked before the run row is written, so a day spent paused is
  // not marked as already sent: switching the email back on later the same day
  // still sends, rather than silently skipping until tomorrow.
  if (!dailyPropertyEmailEnabled(ENV.dailyPropertyEmailEnabled)) {
    console.info(
      `[DailyPropertyEmail] ${reportDate}: paused, nothing sent. Set DAILY_PROPERTY_EMAIL_ENABLED=true to resume.`
    );
    return summary;
  }

  const db = await getDb();
  if (!db) return summary;

  // One run per key per day. If a restart re-triggers this, the insert fails
  // on the unique key and we stop, rather than emailing everyone twice.
  const runKey = `${DAILY_KEY}_${cadence}`;
  const [existing] = await db
    .select({ id: scheduledReportRuns.id, status: scheduledReportRuns.status })
    .from(scheduledReportRuns)
    .where(
      and(
        eq(scheduledReportRuns.reportKey, runKey),
        eq(scheduledReportRuns.reportDate, reportDate)
      )
    )
    .limit(1);
  if (existing && existing.status !== "failed") {
    console.info(
      `[DailyPropertyEmail] ${reportDate} already ran with status ${existing.status}; not sending again.`
    );
    return summary;
  }

  const inserted = await db
    .insert(scheduledReportRuns)
    .values({ reportKey: runKey, reportDate, status: "running" });
  const runId = Number((inserted as any)[0]?.insertId) || existing?.id || null;

  try {
    const [candidates, zipToMarket, accounts] = await Promise.all([
      loadCandidates(db),
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
          lastSentAt: websiteAccountPreferences.updatedAt,
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

      const since = await lastSendFor(db, account.id);
      const fresh = newSince(candidates, since);
      const outcome = selectListingsFor(fresh, preferences!, zipToMarket);
      if (outcome.marketFilterUnresolvable) {
        summary.unresolvableMarketPreferences += 1;
      }
      if (!outcome.listings.length) {
        // No email on a quiet day. A "nothing new today" message every morning
        // is how a subscription gets muted.
        summary.skippedNoMatches += 1;
        continue;
      }

      const { subject, html } = renderDailyPropertyEmail(
        account.firstName,
        outcome.listings as EmailListing[],
        createMarketingUnsubscribeUrl(account.email)
      );

      const result = await deliver(account.email, subject, html);
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

    if (runId) {
      await db
        .update(scheduledReportRuns)
        .set({
          status: summary.failed > 0 ? "partial" : "sent",
          recipientCount: summary.considered,
          successfulRecipientCount: summary.sent,
        })
        .where(eq(scheduledReportRuns.id, runId));
    }
  } catch (error) {
    if (runId) {
      await db
        .update(scheduledReportRuns)
        .set({ status: "failed" })
        .where(eq(scheduledReportRuns.id, runId));
    }
    throw error;
  }

  console.info(
    `[DailyPropertyEmail] ${reportDate}: considered ${summary.considered}, sent ${summary.sent}, quiet ${summary.skippedNoMatches}, unsubscribed ${summary.skippedNotSubscribed}, failed ${summary.failed}, unresolvable markets ${summary.unresolvableMarketPreferences}.`
  );
  return summary;
}

/**
 * When this account was last emailed.
 *
 * Read from the send log rather than held on the preferences row, so that
 * editing preferences does not look like having been emailed.
 */
async function lastSendFor(db: any, accountId: number): Promise<Date | null> {
  const [row] = await db
    .select({ sentAt: websiteAccountEmailSends.sentAt })
    .from(websiteAccountEmailSends)
    .where(eq(websiteAccountEmailSends.accountId, accountId))
    .orderBy(desc(websiteAccountEmailSends.sentAt))
    .limit(1);
  return row?.sentAt ?? null;
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
 * Hand one email to Resend.
 *
 * Returns rather than throws, because one address failing is a fact about that
 * address, not a reason to abandon everyone else still waiting in the loop.
 */
async function deliver(
  to: string,
  subject: string,
  html: string
): Promise<{ sent: boolean; error?: string }> {
  if (!ENV.resendApiKey) return { sent: false, error: "Resend is not configured" };
  try {
    const resend = new Resend(ENV.resendApiKey);
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      tags: [{ name: "category", value: "website_daily_properties" }],
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

// ─── Scheduling ──────────────────────────────────────────────────────────────

export function getNextDailyPropertyEmailAt8AmEastern(now = new Date()): Date {
  const eastern = getEasternTimeParts(now);
  let targetDate = easternDateKey(eastern);
  if (
    eastern.hour > REPORT_HOUR ||
    (eastern.hour === REPORT_HOUR && (eastern.minute > 0 || eastern.second > 0))
  ) {
    targetDate = addEasternDays(targetDate, 1);
  }
  return easternDateTimeToUtc(targetDate, REPORT_HOUR);
}

function scheduleNext(): void {
  if (schedulerTimer) clearTimeout(schedulerTimer);
  const nextRun = getNextDailyPropertyEmailAt8AmEastern();
  const delay = Math.max(nextRun.getTime() - Date.now(), 1000);
  console.info(
    `[DailyPropertyEmail] Next run ${nextRun.toLocaleString("en-US", { timeZone: EASTERN_TIME_ZONE })}.`
  );
  schedulerTimer = setTimeout(async () => {
    await sendDailyPropertyEmails("daily").catch(error =>
      console.error("[DailyPropertyEmail] Run failed.", error)
    );
    scheduleNext();
  }, delay);
}

/** Daily at 8am Eastern, with same-day recovery after a restart. */
export function scheduleDailyPropertyEmails(): void {
  // Nothing is scheduled while paused, so there is no timer to misfire and the
  // log says plainly why no email went out.
  if (!dailyPropertyEmailEnabled(ENV.dailyPropertyEmailEnabled)) {
    console.info(
      "[DailyPropertyEmail] Paused. No run scheduled. Set DAILY_PROPERTY_EMAIL_ENABLED=true to resume."
    );
    if (schedulerTimer) clearTimeout(schedulerTimer);
    if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
    schedulerTimer = null;
    startupRecoveryTimer = null;
    return;
  }

  scheduleNext();
  if (startupRecoveryTimer) clearTimeout(startupRecoveryTimer);
  startupRecoveryTimer = setTimeout(() => {
    const eastern = getEasternTimeParts();
    if (eastern.hour >= REPORT_HOUR) {
      sendDailyPropertyEmails("daily").catch(error =>
        console.error("[DailyPropertyEmail] Startup recovery failed.", error)
      );
    }
  }, 45_000);
}
