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
import {
  DAILY_EMAIL_TAG,
  PREFERENCES_URL,
  dealsSender,
  listUnsubscribeHeaders,
  renderDigestEmail,
} from "./websiteDailyEmailLogic";
import { easternDateKey, getEasternTimeParts } from "./agentProductionReportScheduler";

/**
 * The personal new-property email for investors with a new-site account.
 *
 * The decisions about who gets what live in dailyPropertyEmailMatching, which
 * is pure and tested. This file renders and sends. Scheduling, the review
 * queue and the record of each send belong to the daily email run in
 * websiteDailyEmail.ts, which calls sendPersonalPropertyEmails with the
 * listings an admin approved.
 */

export type EmailListing = Listing & {
  headline: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  heroImageUrl: string | null;
  baths?: string | number | null;
  sqft?: string | number | null;
  /** "Why I like this property", in the assigned agent's words. */
  agentBlurb?: string | null;
  agentName?: string | null;
  agentPhotoUrl?: string | null;
  projectedRevenue?: string | number | null;
  cashOnCash?: string | number | null;
};

/**
 * The personal email: the same digest the big list gets (the old site's
 * layout, with price, ROI, projected revenue, the agent's note and the Book a
 * Call block), greeted by name and holding only the listings that match this
 * person's budget, bedrooms and markets.
 *
 * Revenue and ROI are in it: these people have accounts and signed in to see
 * exactly those figures, and the old digest sent them too.
 */
export function renderDailyPropertyEmail(
  firstName: string | null,
  listings: EmailListing[],
  unsubscribeUrl: string | null,
  options: { runDate?: string; logoUrl?: string } = {}
): { subject: string; html: string; text: string } {
  const count = listings.length;
  const subject =
    count === 1
      ? `A new investment property in your search`
      : `${count} new investment properties in your search`;
  const name = (firstName || "").trim();
  const greeting = name ? `Hi ${name},` : "Hi,";
  const runDate = options.runDate ?? easternDateKey(getEasternTimeParts(new Date()));
  const { html, text } = renderDigestEmail({
    listings: listings.map(listing => ({ baths: null, ...listing })),
    runDate,
    greeting,
    intro: count === 1 ? "A new property matching what you are looking for." : `${count} new properties matching what you are looking for.`,
    unsubscribeUrl: unsubscribeUrl || PREFERENCES_URL,
    logoUrl: options.logoUrl,
  });
  return { subject, html, text };
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
    const { subject, html, text } = renderDailyPropertyEmail(
      account.firstName,
      outcome.listings as EmailListing[],
      unsubscribeUrl
    );

    const result = await deliver(account.email, subject, html, params.runId, text, unsubscribeUrl);
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
    // The deals lane the old digest went out on (deals.savvy-agents.com),
    // with replies going where somebody reads them.
    const sender = dealsSender();
    const result = await resend.emails.send({
      from: sender.from,
      replyTo: sender.replyTo,
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
