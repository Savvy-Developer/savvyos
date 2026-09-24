import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { Resend } from "resend";

import {
  contacts,
  properties,
  websiteAccountPreferences,
  websiteAccountPropertyViews,
  websiteAccounts,
  websiteAccountSavedProperties,
  websiteDailyEmailSettings,
  websitePriceDropAlerts,
  websiteProperties,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { createMarketingUnsubscribeUrl } from "./marketingEmailUnsubscribe";
import { easternDateKey, getEasternTimeParts } from "./agentProductionReportScheduler";
import { masterSwitchOn } from "./websiteDailyEmail";
import {
  PRICE_DROP_LOOKBACK_DAYS,
  PRICE_DROP_TAG,
  checkPrice,
  priceDropKey,
  renderPriceDropEmail,
  shouldAlertAccount,
  type PriceDropListing,
} from "./websitePriceDropLogic";

/**
 * Price drop alerts, like the old site had: when a live listing's price
 * drops, investors who viewed it in the last 90 days or saved it get one
 * email about it.
 *
 * How it runs:
 * - Every 30 minutes each live listing's price is compared with the price
 *   investors were last told about (priceAlertBaseline). See checkPrice.
 * - A drop is recorded once, keyed on the listing and both prices, so it can
 *   never go out twice, even from two server instances.
 * - Nothing is sent unless "Price drop alerts" is on in Website Studio >
 *   Daily Email and DAILY_PROPERTY_EMAIL_ENABLED is on for the server. While
 *   off, prices are still tracked, so switching on later does not send a
 *   backlog of old drops.
 */

const FROM_ADDRESS = "Savvy STR Agents <properties@savvy-agents.com>";

type LiveListing = PriceDropListing & {
  propertyId: number;
  listPrice: string | null;
  baseline: string | null;
};

async function loadLiveListings(db: any): Promise<LiveListing[]> {
  return db
    .select({
      propertyId: websiteProperties.propertyId,
      slug: websiteProperties.slug,
      headline: websiteProperties.headline,
      heroImageUrl: websiteProperties.heroImageUrl,
      baseline: websiteProperties.priceAlertBaseline,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      beds: properties.beds,
      baths: properties.baths,
      listPrice: properties.listPrice,
    })
    .from(websiteProperties)
    .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
    .where(eq(websiteProperties.status, "published"));
}

async function setBaseline(db: any, propertyId: number, price: number): Promise<void> {
  await db
    .update(websiteProperties)
    .set({ priceAlertBaseline: price.toFixed(2) })
    .where(eq(websiteProperties.propertyId, propertyId));
}

export async function priceDropAlertsEnabled(db: any): Promise<boolean> {
  const [row] = await db
    .select({ enabled: websiteDailyEmailSettings.priceDropAlertsEnabled })
    .from(websiteDailyEmailSettings)
    .where(eq(websiteDailyEmailSettings.singletonKey, "primary"))
    .limit(1);
  return !!row?.enabled;
}

export async function setPriceDropAlertsEnabled(db: any, enabled: boolean, userId: number): Promise<void> {
  await db
    .insert(websiteDailyEmailSettings)
    .values({ singletonKey: "primary", priceDropAlertsEnabled: enabled, updatedById: userId })
    .onDuplicateKeyUpdate({ set: { priceDropAlertsEnabled: enabled, updatedById: userId } });
}

type Recipient = { accountId: number; email: string; firstName: string | null };

/** Investors who viewed the listing in the lookback window or saved it. */
async function recipientsFor(db: any, propertyId: number, now: Date): Promise<Recipient[]> {
  const since = new Date(now.getTime() - PRICE_DROP_LOOKBACK_DAYS * 24 * 60 * 60_000);
  const [viewed, saved] = await Promise.all([
    db
      .select({ accountId: websiteAccountPropertyViews.accountId })
      .from(websiteAccountPropertyViews)
      .where(
        and(
          eq(websiteAccountPropertyViews.propertyId, propertyId),
          gte(websiteAccountPropertyViews.lastViewedAt, since)
        )
      ),
    db
      .select({ accountId: websiteAccountSavedProperties.accountId })
      .from(websiteAccountSavedProperties)
      .where(eq(websiteAccountSavedProperties.propertyId, propertyId)),
  ]);
  const ids = Array.from(
    new Set([...viewed, ...saved].map((row: any) => Number(row.accountId)).filter(Boolean))
  );
  if (!ids.length) return [];

  const rows = await db
    .select({
      accountId: websiteAccounts.id,
      email: websiteAccounts.email,
      firstName: websiteAccounts.firstName,
      status: websiteAccounts.status,
      notificationsEnabled: websiteAccountPreferences.notificationsEnabled,
      emailFrequency: websiteAccountPreferences.emailFrequency,
      contactEmailStatus: contacts.emailStatus,
    })
    .from(websiteAccounts)
    .leftJoin(websiteAccountPreferences, eq(websiteAccountPreferences.accountId, websiteAccounts.id))
    // The unsubscribe link and bounce handling mark the contact with this
    // address, so the account follows what the contact says.
    .leftJoin(contacts, eq(contacts.email, websiteAccounts.email))
    .where(inArray(websiteAccounts.id, ids));

  // An address is skipped if any matching record says no (two contacts can
  // share an address, and one saying "unsubscribed" is enough).
  const blocked = new Set<string>();
  for (const row of rows) {
    if (!shouldAlertAccount(row)) blocked.add(String(row.email || "").trim().toLowerCase());
  }
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const row of rows) {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email || seen.has(email) || blocked.has(email)) continue;
    seen.add(email);
    out.push({ accountId: row.accountId, email, firstName: row.firstName ?? null });
  }
  return out;
}

async function sendOne(
  to: string,
  subject: string,
  html: string,
  text: string,
  alertId: number | null
): Promise<{ sent: boolean; error?: string }> {
  if (!ENV.resendApiKey) return { sent: false, error: "Resend is not configured" };
  try {
    const resend = new Resend(ENV.resendApiKey);
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text,
      tags: [
        { name: "category", value: "website_price_drop" },
        ...(alertId ? [{ name: PRICE_DROP_TAG, value: String(alertId) }] : []),
      ],
    });
    if (result.error) return { sent: false, error: result.error.message || "Resend rejected the email" };
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function alertDrop(
  db: any,
  listing: LiveListing,
  oldPrice: number,
  newPrice: number,
  now: Date
): Promise<void> {
  const key = priceDropKey(listing.propertyId, oldPrice, newPrice);
  let alertId: number;
  try {
    const inserted = await db.insert(websitePriceDropAlerts).values({
      idempotencyKey: key,
      propertyId: listing.propertyId,
      oldPrice: oldPrice.toFixed(2),
      newPrice: newPrice.toFixed(2),
      status: "sending",
    });
    alertId = Number((inserted as any)[0]?.insertId);
  } catch {
    // Already recorded: another instance has it, or it went out before.
    await setBaseline(db, listing.propertyId, newPrice);
    return;
  }
  // Move the baseline first, so a crash part way through cannot resend the
  // same drop on the next check. The alert row records what happened.
  await setBaseline(db, listing.propertyId, newPrice);

  const recipients = await recipientsFor(db, listing.propertyId, now);
  if (!recipients.length) {
    await db
      .update(websitePriceDropAlerts)
      .set({ status: "no_recipients", completedAt: new Date() })
      .where(eq(websitePriceDropAlerts.id, alertId));
    return;
  }

  const dateKey = easternDateKey(getEasternTimeParts(now));
  let sent = 0;
  const errors: string[] = [];
  for (const person of recipients) {
    const email = renderPriceDropEmail({
      listing,
      oldPrice,
      newPrice,
      firstName: person.firstName,
      unsubscribeUrl: createMarketingUnsubscribeUrl(person.email),
      dateKey,
    });
    const result = await sendOne(person.email, email.subject, email.html, email.text, alertId);
    if (result.sent) sent += 1;
    else errors.push(`${person.email}: ${result.error}`);
  }
  const failed = recipients.length - sent;
  await db
    .update(websitePriceDropAlerts)
    .set({
      status: failed === 0 ? "sent" : sent > 0 ? "partial" : "failed",
      recipients: recipients.length,
      sent,
      failed,
      note: errors.length ? errors.join("; ").slice(0, 2000) : null,
      completedAt: new Date(),
    })
    .where(eq(websitePriceDropAlerts.id, alertId));
  console.info(
    `[PriceDrop] ${listing.slug}: ${oldPrice} to ${newPrice}, ${sent}/${recipients.length} emailed.`
  );
}

/** One pass over the live listings. Safe to run as often as needed. */
export async function checkPriceDrops(now = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const sending = masterSwitchOn() && (await priceDropAlertsEnabled(db));
  const listings = await loadLiveListings(db);
  for (const listing of listings) {
    const result = checkPrice(listing.baseline, listing.listPrice);
    if (result.action === "set_baseline") {
      await setBaseline(db, listing.propertyId, result.baseline);
    } else if (result.action === "drop") {
      if (sending) {
        await alertDrop(db, listing, result.oldPrice, result.newPrice, now);
      } else {
        // Alerts are off: keep up with the price so switching on later does
        // not email people about an old drop.
        await setBaseline(db, listing.propertyId, result.baseline);
      }
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function schedulePriceDropAlerts(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    checkPriceDrops().catch(error => console.error("[PriceDrop] Check failed.", error));
  }, 30 * 60_000);
  setTimeout(() => {
    checkPriceDrops().catch(error => console.error("[PriceDrop] Startup check failed.", error));
  }, 90_000);
}

/** The newest alerts, for the Studio. */
export async function loadRecentPriceDrops(db: any) {
  const rows = await db
    .select({
      id: websitePriceDropAlerts.id,
      propertyId: websitePriceDropAlerts.propertyId,
      oldPrice: websitePriceDropAlerts.oldPrice,
      newPrice: websitePriceDropAlerts.newPrice,
      status: websitePriceDropAlerts.status,
      recipients: websitePriceDropAlerts.recipients,
      sent: websitePriceDropAlerts.sent,
      createdAt: websitePriceDropAlerts.createdAt,
      headline: websiteProperties.headline,
      address: properties.address,
    })
    .from(websitePriceDropAlerts)
    .leftJoin(websiteProperties, eq(websiteProperties.propertyId, websitePriceDropAlerts.propertyId))
    .leftJoin(properties, eq(properties.id, websitePriceDropAlerts.propertyId))
    .orderBy(desc(websitePriceDropAlerts.createdAt))
    .limit(20);
  return rows.map((row: any) => ({
    ...row,
    name: row.headline || row.address || `Property ${row.propertyId}`,
    oldPrice: Number(row.oldPrice),
    newPrice: Number(row.newPrice),
  }));
}

/**
 * A test: the alert as it would look for the newest live listing, with a
 * made-up drop of 5%, to named addresses only. Nothing is recorded or changed.
 */
export async function sendPriceDropTest(recipientsText: string): Promise<{ sent: number; message: string }> {
  const db = await getDb();
  if (!db) return { sent: 0, message: "Database unavailable" };
  const to = Array.from(
    new Set(
      recipientsText
        .split(/[\s,;]+/)
        .map(value => value.trim().toLowerCase())
        .filter(value => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))
    )
  ).slice(0, 10);
  if (!to.length) return { sent: 0, message: "Add at least one email address to send the test to." };
  const [listing] = await db
    .select({
      slug: websiteProperties.slug,
      headline: websiteProperties.headline,
      heroImageUrl: websiteProperties.heroImageUrl,
      address: properties.address,
      city: properties.city,
      state: properties.state,
      beds: properties.beds,
      baths: properties.baths,
      listPrice: properties.listPrice,
    })
    .from(websiteProperties)
    .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
    .where(and(eq(websiteProperties.status, "published"), isNotNull(properties.listPrice)))
    .orderBy(desc(websiteProperties.publishedAt))
    .limit(1);
  if (!listing || !(Number(listing.listPrice) > 0)) {
    return { sent: 0, message: "There is no live listing with a price to use for the test." };
  }
  const newPrice = Number(listing.listPrice);
  const oldPrice = Math.round((newPrice / 0.95) / 1000) * 1000;
  const email = renderPriceDropEmail({
    listing,
    oldPrice,
    newPrice,
    firstName: null,
    unsubscribeUrl: null,
    dateKey: easternDateKey(getEasternTimeParts()),
  });
  let sent = 0;
  const errors: string[] = [];
  for (const address of to) {
    const result = await sendOne(address, `[Test] ${email.subject}`, email.html, email.text, null);
    if (result.sent) sent += 1;
    else errors.push(`${address}: ${result.error}`);
  }
  return {
    sent,
    message: errors.length ? `Test not sent to ${errors.join("; ")}` : `Test sent to ${to.join(", ")}.`,
  };
}
