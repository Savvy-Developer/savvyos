import { and, eq, inArray } from "drizzle-orm";

import {
  activityLog,
  properties,
  users,
  websiteListingClocks,
  websiteProperties,
} from "../drizzle/schema";
import { sendTransactionalEmail } from "./_core/resendEmail";
import { getDb } from "./db";

/**
 * Takes stale listings off the public website after 90 days.
 *
 * The old savvy-agents.com moved every listing that had been published for
 * 90 days back to Draft each night and emailed the agent, so the site never
 * filled up with homes nobody had looked at in months. This is the SavvyOS
 * version, checked hourly.
 *
 * The clock is kept in website_listing_clocks, one row per website listing:
 * liveSince is when the listing last went live. It restarts whenever a
 * listing goes from not live back to live, so republishing gives a fresh 90
 * days. (The old site first used its publish date for this, and a
 * republished listing expired again the next night. That is the bug this
 * avoids.)
 *
 * A listing seen for the first time starts from its publish date, but never
 * less than 7 days before it would expire, so switching this on can never
 * take a listing down without a week's notice.
 *
 * WEBSITE_LISTING_EXPIRY_DAYS sets the number of days (default 90), or "off"
 * to stop it. The agent email can be switched off in Email Notifications
 * ("Website Listing Moved to Draft").
 */

const DAY = 24 * 60 * 60 * 1000;
export const MIN_NOTICE_DAYS = 7;

export function listingExpiryDays(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = (env.WEBSITE_LISTING_EXPIRY_DAYS ?? "").trim().toLowerCase();
  if (raw === "off") return null;
  if (!raw) return 90;
  const days = Number(raw);
  return Number.isInteger(days) && days >= 14 && days <= 3650 ? days : 90;
}

export type ExpiryListing = {
  id: number;
  propertyId: number;
  publishedAt: Date | null;
  createdAt: Date;
};

export type ListingClock = {
  websitePropertyId: number;
  liveSince: Date;
  wasLive: boolean;
};

export type ExpiryPlan = {
  /** New clocks for listings seen live for the first time. */
  start: Array<{ websitePropertyId: number; liveSince: Date }>;
  /** Listings that came back live: a fresh clock from now. */
  restart: number[];
  /** Clocks of listings that are no longer live. */
  stop: number[];
  /** Live listings past their time: take down. */
  expire: Array<{ websitePropertyId: number; propertyId: number; liveSince: Date }>;
};

/** What to do this run. Pure, so the rules are testable. */
export function planListingExpiry(input: {
  live: ExpiryListing[];
  clocks: ListingClock[];
  now: Date;
  days: number;
}): ExpiryPlan {
  const plan: ExpiryPlan = { start: [], restart: [], stop: [], expire: [] };
  const clocks = new Map(input.clocks.map(clock => [clock.websitePropertyId, clock]));
  const liveIds = new Set(input.live.map(listing => listing.id));
  const now = input.now.getTime();
  const span = input.days * DAY;
  // Earliest start that still leaves a week before expiry.
  const earliestStart = now - span + MIN_NOTICE_DAYS * DAY;

  for (const clock of input.clocks) {
    if (clock.wasLive && !liveIds.has(clock.websitePropertyId)) plan.stop.push(clock.websitePropertyId);
  }

  for (const listing of input.live) {
    const clock = clocks.get(listing.id);
    if (!clock) {
      const seen = (listing.publishedAt ?? listing.createdAt).getTime();
      plan.start.push({ websitePropertyId: listing.id, liveSince: new Date(Math.max(seen, earliestStart)) });
      continue;
    }
    if (!clock.wasLive) {
      plan.restart.push(listing.id);
      continue;
    }
    if (clock.liveSince.getTime() + span <= now) {
      plan.expire.push({ websitePropertyId: listing.id, propertyId: listing.propertyId, liveSince: clock.liveSince });
    }
  }
  return plan;
}

function dateLabel(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

async function emailAgent(db: any, websitePropertyId: number, propertyId: number, liveSince: Date, days: number) {
  const [row] = await db
    .select({
      address: properties.address,
      city: properties.city,
      state: properties.state,
      agentName: users.name,
      agentEmail: users.email,
    })
    .from(websiteProperties)
    .leftJoin(properties, eq(properties.id, websiteProperties.propertyId))
    .leftJoin(users, eq(users.id, websiteProperties.assignedAgentId))
    .where(eq(websiteProperties.id, websitePropertyId))
    .limit(1);
  if (!row?.agentEmail) return "no agent email";
  const address = [row.address, row.city, row.state].filter(Boolean).join(", ") || "Your website listing";
  const delivery = await sendTransactionalEmail(
    "website_listing_expired",
    {
      recipientEmail: row.agentEmail,
      recipientName: row.agentName ?? undefined,
      propertyAddress: address,
      propertyId: String(propertyId),
      listingDate: dateLabel(liveSince),
      expiryDays: String(days),
    },
    {
      allowTemplateOverride: false,
      idempotencyKey: `savvyos-website-listing-expired:${websitePropertyId}:${liveSince.toISOString()}`,
    }
  );
  return delivery.sent ? "sent" : delivery.reason ?? "not sent";
}

export type ListingExpiryResult =
  | { status: "off" | "no-db" }
  | { status: "checked"; started: number; restarted: number; stopped: number; expired: number[] };

export async function runListingExpiry(db?: any, now = new Date()): Promise<ListingExpiryResult> {
  const days = listingExpiryDays();
  if (days === null) return { status: "off" };
  db ??= await getDb();
  if (!db) return { status: "no-db" };

  const live: ExpiryListing[] = (
    await db
      .select({
        id: websiteProperties.id,
        propertyId: websiteProperties.propertyId,
        publishedAt: websiteProperties.publishedAt,
        createdAt: websiteProperties.createdAt,
      })
      .from(websiteProperties)
      .where(eq(websiteProperties.status, "published"))
  ).filter((row: any) => row.propertyId);
  const clocks: ListingClock[] = await db
    .select({
      websitePropertyId: websiteListingClocks.websitePropertyId,
      liveSince: websiteListingClocks.liveSince,
      wasLive: websiteListingClocks.wasLive,
    })
    .from(websiteListingClocks);

  const plan = planListingExpiry({
    live: live.map(row => ({ ...row, publishedAt: row.publishedAt ? new Date(row.publishedAt) : null, createdAt: new Date(row.createdAt) })),
    clocks: clocks.map(clock => ({ ...clock, liveSince: new Date(clock.liveSince), wasLive: Boolean(clock.wasLive) })),
    now,
    days,
  });

  if (plan.start.length) {
    await db
      .insert(websiteListingClocks)
      .values(plan.start.map(row => ({ websitePropertyId: row.websitePropertyId, liveSince: row.liveSince, wasLive: true })))
      .onDuplicateKeyUpdate({ set: { wasLive: true } });
  }
  if (plan.restart.length) {
    await db
      .update(websiteListingClocks)
      .set({ liveSince: now, wasLive: true, expiredAt: null })
      .where(inArray(websiteListingClocks.websitePropertyId, plan.restart));
  }
  if (plan.stop.length) {
    await db
      .update(websiteListingClocks)
      .set({ wasLive: false })
      .where(inArray(websiteListingClocks.websitePropertyId, plan.stop));
  }

  for (const item of plan.expire) {
    await db
      .update(websiteProperties)
      .set({ status: "draft" })
      .where(and(eq(websiteProperties.id, item.websitePropertyId), eq(websiteProperties.status, "published")));
    await db
      .update(websiteListingClocks)
      .set({ wasLive: false, expiredAt: now })
      .where(eq(websiteListingClocks.websitePropertyId, item.websitePropertyId));
    const email = await emailAgent(db, item.websitePropertyId, item.propertyId, item.liveSince, days).catch(
      (error: unknown) => `failed: ${error instanceof Error ? error.message : String(error)}`
    );
    await db.insert(activityLog).values({
      userId: null,
      action: "website_property_expired",
      entityType: "property",
      entityId: item.propertyId,
      details: { websitePropertyId: item.websitePropertyId, liveSince: item.liveSince.toISOString(), days, status: "draft", email },
    });
    console.log(`[ListingExpiry] Property ${item.propertyId} moved to Draft after ${days} days (agent email: ${email}).`);
  }

  return {
    status: "checked",
    started: plan.start.length,
    restarted: plan.restart.length,
    stopped: plan.stop.length,
    expired: plan.expire.map(item => item.propertyId),
  };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function scheduleListingExpiry(): void {
  if (listingExpiryDays() === null) {
    console.log("[ListingExpiry] Off (WEBSITE_LISTING_EXPIRY_DAYS=off).");
    return;
  }
  const run = (label: string) =>
    runListingExpiry().catch(error => console.error(`[ListingExpiry] ${label} failed.`, error));
  if (timer) clearInterval(timer);
  timer = setInterval(() => run("Hourly check"), 60 * 60_000);
  setTimeout(() => run("Startup check"), 150_000);
}
