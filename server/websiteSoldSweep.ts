import { and, eq, inArray, sql } from "drizzle-orm";

import {
  activityLog,
  listings,
  transactions,
  websiteProperties,
  websiteSoldSweeps,
} from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Takes sold properties off the public website.
 *
 * The old savvy-agents.com moved every SOLD listing to draft each morning, so
 * a buyer never found a home that was already gone. SavvyOS had nothing like
 * it: a listing stayed live until someone archived it by hand.
 *
 * A property counts as sold when it has a CLOSED transaction or a CLOSED
 * listing. Every hour, each published website listing whose property has a new
 * sale is set back to Draft (not deleted, so the agent can fix and relist it),
 * and the sale is written to website_sold_sweeps. Recording the sale is what
 * makes relisting work: when the agent publishes the property again, the same
 * sale never takes it down a second time. Only a later sale would.
 *
 * Rollout is careful on purpose. The very first run only records the sales
 * that already exist (action "baseline") and changes nothing, because
 * old closed deals on relisted properties would otherwise hide live listings.
 * It logs the listings that look sold so someone can check them by hand.
 * From then on, a sale counts only when its record changed after that first
 * run, and a closing date from before the listing went live is ignored.
 *
 * Set WEBSITE_SOLD_SWEEP=off on Railway to stop it.
 */

export const BASELINE_KEY = "baseline";

export type LiveListing = {
  id: number;
  propertyId: number;
  slug: string | null;
  publishedAt: Date | null;
  createdAt: Date;
};

export type Sale = {
  key: string;
  propertyId: number;
  /** Transaction closing date, when there is one. Listings have none. */
  closedOn: Date | null;
  /** When the transaction or listing record last changed. */
  changedAt: Date;
};

export type SoldPick = {
  websitePropertyId: number;
  propertyId: number;
  slug: string | null;
  saleKeys: string[];
};

export function soldSweepEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (env.WEBSITE_SOLD_SWEEP || "").trim().toLowerCase() !== "off";
}

/** Which live listings to take down. Pure, so the rules are testable. */
export function pickSoldListings(input: {
  live: LiveListing[];
  sales: Sale[];
  swept: Set<string>;
  baselineAt: Date;
}): SoldPick[] {
  const picks: SoldPick[] = [];
  for (const listing of input.live) {
    const liveSince = listing.publishedAt ?? listing.createdAt;
    const keys = input.sales
      .filter(sale => sale.propertyId === listing.propertyId)
      .filter(sale => !input.swept.has(sale.key))
      .filter(sale => sale.changedAt.getTime() >= input.baselineAt.getTime())
      .filter(sale => !sale.closedOn || sale.closedOn.getTime() >= liveSince.getTime())
      .map(sale => sale.key);
    if (keys.length) {
      picks.push({
        websitePropertyId: listing.id,
        propertyId: listing.propertyId,
        slug: listing.slug,
        saleKeys: Array.from(new Set(keys)),
      });
    }
  }
  return picks;
}

async function loadLive(db: any): Promise<LiveListing[]> {
  const rows = await db
    .select({
      id: websiteProperties.id,
      propertyId: websiteProperties.propertyId,
      slug: websiteProperties.slug,
      publishedAt: websiteProperties.publishedAt,
      createdAt: websiteProperties.createdAt,
    })
    .from(websiteProperties)
    .where(eq(websiteProperties.status, "published"));
  return rows.filter((row: any) => row.propertyId);
}

async function loadSales(db: any, propertyIds: number[]): Promise<Sale[]> {
  if (!propertyIds.length) return [];
  const [closedTransactions, closedListings] = await Promise.all([
    db
      .select({
        id: transactions.id,
        propertyId: transactions.propertyId,
        closingDate: transactions.closingDate,
        updatedAt: transactions.updatedAt,
      })
      .from(transactions)
      .where(and(eq(transactions.status, "closed"), inArray(transactions.propertyId, propertyIds))),
    db
      .select({
        id: listings.id,
        propertyId: listings.propertyId,
        updatedAt: listings.updatedAt,
      })
      .from(listings)
      .where(and(eq(listings.listingStatus, "closed"), inArray(listings.propertyId, propertyIds))),
  ]);
  return [
    ...closedTransactions.map((row: any) => ({
      key: `tx:${row.id}`,
      propertyId: row.propertyId,
      closedOn: row.closingDate ? new Date(row.closingDate) : null,
      changedAt: new Date(row.updatedAt),
    })),
    ...closedListings.map((row: any) => ({
      key: `listing:${row.id}`,
      propertyId: row.propertyId,
      closedOn: null,
      changedAt: new Date(row.updatedAt),
    })),
  ];
}

async function record(db: any, rows: Array<typeof websiteSoldSweeps.$inferInsert>) {
  if (!rows.length) return;
  // A sale already recorded (another instance, or a repeat run) is left as is.
  await db
    .insert(websiteSoldSweeps)
    .values(rows)
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
}

export type SoldSweepResult =
  | { status: "off" | "no-db" }
  | { status: "baseline"; recorded: number; looksSold: string[] }
  | { status: "swept"; unpublished: SoldPick[] };

export async function runSoldSweep(db?: any): Promise<SoldSweepResult> {
  if (!soldSweepEnabled()) return { status: "off" };
  db ??= await getDb();
  if (!db) return { status: "no-db" };

  const sweptRows = await db
    .select({ saleKey: websiteSoldSweeps.saleKey, createdAt: websiteSoldSweeps.createdAt })
    .from(websiteSoldSweeps);
  const swept = new Set<string>(sweptRows.map((row: any) => row.saleKey));
  const baseline = sweptRows.find((row: any) => row.saleKey === BASELINE_KEY);

  const live = await loadLive(db);
  const sales = await loadSales(db, Array.from(new Set(live.map(row => row.propertyId))));

  if (!baseline) {
    // First run: remember what exists, change nothing.
    await record(db, [{ saleKey: BASELINE_KEY, action: "baseline" }]);
    await record(
      db,
      sales
        .filter(sale => !swept.has(sale.key))
        .map(sale => ({ saleKey: sale.key, propertyId: sale.propertyId, action: "baseline" as const }))
    );
    const soldProperties = new Set(sales.map(sale => sale.propertyId));
    const looksSold = live
      .filter(row => soldProperties.has(row.propertyId))
      .map(row => row.slug || `property ${row.propertyId}`);
    if (looksSold.length) {
      console.warn(
        `[SoldSweep] First run. These live listings already have a closed deal; check them by hand: ${looksSold.join(", ")}`
      );
    }
    return { status: "baseline", recorded: sales.length, looksSold };
  }

  const picks = pickSoldListings({
    live,
    sales,
    swept,
    baselineAt: new Date(baseline.createdAt),
  });
  for (const pick of picks) {
    await db
      .update(websiteProperties)
      .set({ status: "draft" })
      .where(and(eq(websiteProperties.id, pick.websitePropertyId), eq(websiteProperties.status, "published")));
    await record(
      db,
      pick.saleKeys.map(saleKey => ({
        saleKey,
        propertyId: pick.propertyId,
        websitePropertyId: pick.websitePropertyId,
        action: "unpublished" as const,
      }))
    );
    await db.insert(activityLog).values({
      userId: null,
      action: "website_property_unpublished_sold",
      entityType: "property",
      entityId: pick.propertyId,
      details: { slug: pick.slug, saleKeys: pick.saleKeys, status: "draft" },
    });
    console.log(`[SoldSweep] Took ${pick.slug || pick.propertyId} off the website (${pick.saleKeys.join(", ")}).`);
  }
  return { status: "swept", unpublished: picks };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function scheduleSoldSweep(): void {
  if (!soldSweepEnabled()) {
    console.log("[SoldSweep] Off (WEBSITE_SOLD_SWEEP=off).");
    return;
  }
  const run = (label: string) =>
    runSoldSweep().catch(error => console.error(`[SoldSweep] ${label} failed.`, error));
  if (timer) clearInterval(timer);
  timer = setInterval(() => run("Hourly check"), 60 * 60_000);
  setTimeout(() => run("Startup check"), 120_000);
}
