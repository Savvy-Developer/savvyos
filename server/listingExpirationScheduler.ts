/**
 * Listing Expiration Reminder Scheduler
 *
 * Runs daily (first at 8am, then every 24h).
 * Finds all active listings where expirationDate < today and
 * lastExpirationReminderSent is either null or more than 24 hours ago.
 * Sends a branded reminder email to the listing's agent.
 */

import { and, eq, isNotNull, lt, or, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { listings, users, contacts, properties } from "../drizzle/schema";
import { sendTransactionalEmail } from "./_core/resendEmail";

export async function checkExpiredListings(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // Today as YYYY-MM-DD string for comparing against DATE (string-mode) columns
  const todayStr = now.toISOString().slice(0, 10);

  // Find active listings past their expiration date that haven't been reminded in the last 24h
  const expiredRows = await db
    .select({
      listing: listings,
      agent: users,
      contact: contacts,
      property: properties,
    })
    .from(listings)
    .leftJoin(users, eq(listings.agentId, users.id))
    .leftJoin(contacts, eq(listings.contactId, contacts.id))
    .leftJoin(properties, eq(listings.propertyId, properties.id))
    .where(
      and(
        eq(listings.listingStatus, "active"),
        isNotNull(listings.expirationDate),
        lt(listings.expirationDate, todayStr),
        or(
          isNull(listings.lastExpirationReminderSent),
          lt(listings.lastExpirationReminderSent, oneDayAgo)
        )
      )
    );

  if (expiredRows.length === 0) {
    console.log("[ListingExpirationScheduler] No expired listings to notify.");
    return;
  }

  console.log(`[ListingExpirationScheduler] Found ${expiredRows.length} expired listing(s) to notify.`);

  for (const row of expiredRows) {
    const { listing, agent, contact, property } = row;

    if (!agent?.email) {
      console.warn(`[ListingExpirationScheduler] Listing ${listing.id} has no agent email — skipping.`);
      continue;
    }

    const propertyAddress = property
      ? [property.address, property.city, property.state].filter(Boolean).join(", ")
      : undefined;

    const contactName = contact
      ? `${contact.firstName} ${contact.lastName}`
      : undefined;

    const listPrice = listing.listPrice
      ? `$${Number(listing.listPrice).toLocaleString("en-US")}`
      : undefined;

    // listing.expirationDate is a plain "YYYY-MM-DD" string (DATE mode: "string")
    // Parse as local noon to avoid UTC midnight rolling back one day
    const expirationDate = listing.expirationDate
      ? (() => {
          const [y, m, d] = listing.expirationDate.split("-").map(Number);
          return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
        })()
      : undefined;

    try {
      await sendTransactionalEmail("listing_expiration_reminder", {
        recipientEmail: agent.email,
        recipientName: agent.name ?? undefined,
        listingAddress: propertyAddress,
        contactName,
        listPrice,
        expirationDate,
      });

      // Mark reminder as sent so we don't spam daily
      await db
        .update(listings)
        .set({ lastExpirationReminderSent: now })
        .where(eq(listings.id, listing.id));

      console.log(`[ListingExpirationScheduler] Reminder sent for listing ${listing.id} to ${agent.email}`);
    } catch (err) {
      console.error(`[ListingExpirationScheduler] Failed to send reminder for listing ${listing.id}:`, err);
    }
  }
}

/**
 * Schedule the daily expiration check.
 * Fires at the next 8am, then every 24 hours.
 * Also runs once 15 seconds after server startup to catch any missed listings.
 */
export function scheduleListingExpirationCheck(): void {
  function msUntilNext8am(): number {
    const now = new Date();
    const next8am = new Date(now);
    next8am.setHours(8, 0, 0, 0);
    if (next8am <= now) {
      next8am.setDate(next8am.getDate() + 1);
    }
    return next8am.getTime() - now.getTime();
  }

  const delay = msUntilNext8am();
  const nextRun = new Date(Date.now() + delay);
  console.log(`[ListingExpirationScheduler] Next daily run scheduled at ${nextRun.toLocaleString()}`);

  setTimeout(() => {
    checkExpiredListings().catch((err) =>
      console.error("[ListingExpirationScheduler] Error:", err)
    );
    // After first fire, run every 24h
    setInterval(() => {
      checkExpiredListings().catch((err) =>
        console.error("[ListingExpirationScheduler] Error:", err)
      );
    }, 24 * 60 * 60 * 1000);
  }, delay);

  // Startup check — runs 15s after server boot
  setTimeout(() => {
    checkExpiredListings().catch((err) =>
      console.error("[ListingExpirationScheduler] Startup check error:", err)
    );
  }, 15_000);
}
