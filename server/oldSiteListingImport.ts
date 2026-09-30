/**
 * Move the old savvy-agents.com live listings into SavvyOS. Run from
 * Website Studio > CMS: "Check" reads the old site and reports; "Import"
 * creates what the check listed. See oldSiteListingImportLogic.ts for the
 * mapping.
 *
 * Rules:
 * - Only listings live on the old site (its public API returns nothing else).
 * - Every listing comes in as a DRAFT unless "publish the ready ones" is
 *   chosen, and even then only listings that pass the publish checklist
 *   (photo, price, beds, baths, city, state, ZIP) go live.
 * - Nothing that already exists is changed. A slug already used on the new
 *   site is skipped. A house SavvyOS already has (same street, city, state)
 *   gets the website listing attached to it only when it has none yet; its
 *   own facts are left exactly as they are.
 * - The listing is credited to the same agent as on the old site (matched by
 *   website profile slug, then by email). Unmatched agents are reported; the
 *   importing admin is recorded as the one who added the property.
 * - Safe to run again: anything already imported is skipped.
 */
import { eq } from "drizzle-orm";

import { properties, users, websiteAgentProfiles, websiteProperties } from "../drizzle/schema";
import { createProperty, getDb } from "./db";
import {
  OLD_SITE_ORIGIN,
  OLD_SITE_PAGE_LIMIT,
  mapOldListing,
  splitRange,
  streetKey,
  type OldListing,
} from "./oldSiteListingImportLogic";
import { missingForPublish } from "@shared/websitePublishChecklist";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_PRICE = 1_000_000_000;

async function fetchRange(min: number, max: number): Promise<OldListing[]> {
  const url = `${OLD_SITE_ORIGIN}/api/properties?status=published&limit=${OLD_SITE_PAGE_LIMIT}&minPrice=${min}&maxPrice=${max}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`The old site answered ${response.status} for prices ${min} to ${max}.`);
  const body = (await response.json()) as { data?: OldListing[] };
  return Array.isArray(body.data) ? body.data : [];
}

async function fetchOldCount(): Promise<number | null> {
  try {
    const response = await fetch(`${OLD_SITE_ORIGIN}/api/properties/count?status=published`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { total?: number };
    return typeof body.total === "number" ? body.total : null;
  } catch {
    return null;
  }
}

/** Every live old-site listing. The old API caps a request at 100 and its cursor fails, so price ranges are split until each fits. */
export async function fetchOldSiteListings(): Promise<{ listings: OldListing[]; oldSiteCount: number | null }> {
  const found = new Map<string, OldListing>();
  const walk = async (min: number, max: number, depth: number): Promise<void> => {
    const rows = await fetchRange(min, max);
    const halves = rows.length >= OLD_SITE_PAGE_LIMIT && depth < 40 ? splitRange(min, max) : null;
    if (halves) {
      await walk(halves[0][0], halves[0][1], depth + 1);
      await walk(halves[1][0], halves[1][1], depth + 1);
      return;
    }
    for (const row of rows) if (row?.id && row.slug && row.address) found.set(row.id, row);
  };
  await walk(0, MAX_PRICE, 0);
  return { listings: Array.from(found.values()), oldSiteCount: await fetchOldCount() };
}

export type OldSiteImportReport = {
  dryRun: boolean;
  publishReady: boolean;
  oldSiteCount: number | null;
  found: number;
  toCreate: number;
  toAttach: number;
  created: number;
  attached: number;
  published: number;
  alreadyOnNewSite: number;
  slugTaken: Array<{ slug: string; address: string }>;
  agentsNotFound: Array<{ agent: string; listings: number }>;
  notReadyToPublish: number;
  missingZip: number;
  failed: Array<{ slug: string; reason: string }>;
};

export async function importOldSiteListings(params: {
  dryRun: boolean;
  publishReady: boolean;
  userId: number;
}): Promise<OldSiteImportReport> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { listings, oldSiteCount } = await fetchOldSiteListings();
  const importedOn = new Date().toISOString().slice(0, 10);

  const [existingProperties, existingListings, profiles, userRows] = await Promise.all([
    db.select({ id: properties.id, address: properties.address, city: properties.city, state: properties.state }).from(properties),
    db.select({ propertyId: websiteProperties.propertyId, slug: websiteProperties.slug }).from(websiteProperties),
    db.select({ slug: websiteAgentProfiles.slug, userId: websiteAgentProfiles.userId }).from(websiteAgentProfiles),
    db.select({ id: users.id, email: users.email }).from(users),
  ]);
  const propertyByStreet = new Map<string, number>();
  for (const row of existingProperties) {
    const key = streetKey(row.address, row.city, row.state);
    if (key && !propertyByStreet.has(key)) propertyByStreet.set(key, row.id);
  }
  const listedPropertyIds = new Set(existingListings.map(row => row.propertyId));
  const slugToPropertyId = new Map(existingListings.map(row => [row.slug.toLowerCase(), row.propertyId]));
  const userBySlug = new Map(profiles.map(row => [row.slug.toLowerCase(), row.userId]));
  const userByEmail = new Map(
    userRows.filter(row => row.email).map(row => [String(row.email).trim().toLowerCase(), row.id])
  );

  const report: OldSiteImportReport = {
    dryRun: params.dryRun,
    publishReady: params.publishReady,
    oldSiteCount,
    found: listings.length,
    toCreate: 0,
    toAttach: 0,
    created: 0,
    attached: 0,
    published: 0,
    alreadyOnNewSite: 0,
    slugTaken: [],
    agentsNotFound: [],
    notReadyToPublish: 0,
    missingZip: 0,
    failed: [],
  };
  const unmatchedAgents = new Map<string, number>();

  for (const listing of listings) {
    const mapped = mapOldListing(listing, importedOn);
    const slug = mapped.website.slug.toLowerCase();
    const key = streetKey(mapped.property.address, mapped.property.city, mapped.property.state);
    const existingId = key ? propertyByStreet.get(key) : undefined;

    // Already on the new site: this slug, or this house with a website listing.
    if (slugToPropertyId.has(slug)) {
      if (existingId && slugToPropertyId.get(slug) === existingId) report.alreadyOnNewSite += 1;
      else if (!existingId) report.alreadyOnNewSite += 1;
      else report.slugTaken.push({ slug, address: mapped.property.address });
      continue;
    }
    if (existingId && listedPropertyIds.has(existingId)) {
      report.alreadyOnNewSite += 1;
      continue;
    }

    const agentUserId =
      (mapped.agentSlug && userBySlug.get(mapped.agentSlug)) || (mapped.agentEmail && userByEmail.get(mapped.agentEmail)) || null;
    if (!agentUserId) {
      const label = mapped.agentName || mapped.agentSlug || "no agent";
      unmatchedAgents.set(label, (unmatchedAgents.get(label) || 0) + 1);
    }
    if (!mapped.property.zip) report.missingZip += 1;
    const missing = missingForPublish({ ...mapped.property, ...mapped.website });
    const goLive = params.publishReady && missing.length === 0;
    if (missing.length) report.notReadyToPublish += 1;
    if (existingId) report.toAttach += 1;
    else report.toCreate += 1;
    if (params.dryRun) continue;

    try {
      const propertyId =
        existingId ??
        (await createProperty({
          ...mapped.property,
          addedByUserId: agentUserId ?? params.userId,
        }));
      const now = new Date();
      await db.insert(websiteProperties).values({
        propertyId,
        slug,
        status: goLive ? "published" : "draft",
        publishedAt: goLive ? now : null,
        assignedAgentId: agentUserId,
        headline: mapped.website.headline,
        summary: mapped.website.summary,
        heroImageUrl: mapped.website.heroImageUrl,
        galleryImageUrls: mapped.website.galleryImageUrls,
        featureTags: mapped.website.featureTags,
        investmentHighlights: mapped.website.investmentHighlights,
        sourceUrl: mapped.website.sourceUrl,
        importedData: mapped.website.importedData,
        priceAlertBaseline: mapped.property.listPrice,
        createdById: params.userId,
        updatedById: params.userId,
      } as any);
      listedPropertyIds.add(propertyId);
      slugToPropertyId.set(slug, propertyId);
      if (key) propertyByStreet.set(key, propertyId);
      if (existingId) report.attached += 1;
      else report.created += 1;
      if (goLive) report.published += 1;
    } catch (error) {
      report.failed.push({ slug, reason: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    }
  }

  report.agentsNotFound = Array.from(unmatchedAgents.entries())
    .map(([agent, count]) => ({ agent, listings: count }))
    .sort((a, b) => b.listings - a.listings);
  if (!params.dryRun) {
    console.info(
      `[OldSiteListings] found ${report.found}, created ${report.created}, attached ${report.attached}, published ${report.published}, failed ${report.failed.length}.`
    );
  }
  return report;
}

/** For the Studio card: the listings this import put on the new site, by status. */
export async function importedListingCounts() {
  const db = await getDb();
  if (!db) return { draft: 0, published: 0, archived: 0 };
  const rows = await db
    .select({ status: websiteProperties.status, importedData: websiteProperties.importedData })
    .from(websiteProperties);
  const counts = { draft: 0, published: 0, archived: 0 };
  for (const row of rows) {
    const data = row.importedData as Record<string, unknown> | null;
    if (data?.source !== "savvy-agents.com") continue;
    counts[row.status as keyof typeof counts] += 1;
  }
  return counts;
}

/**
 * Publish the imported drafts that pass the publish checklist, for when the
 * import ran as drafts first. Only imported listings; nothing else is touched.
 */
export async function publishReadyImportedListings(): Promise<{ published: number; notReady: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const rows = await db
    .select({
      id: websiteProperties.id,
      importedData: websiteProperties.importedData,
      heroImageUrl: websiteProperties.heroImageUrl,
      galleryImageUrls: websiteProperties.galleryImageUrls,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
      listPrice: properties.listPrice,
      beds: properties.beds,
      baths: properties.baths,
    })
    .from(websiteProperties)
    .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
    .where(eq(websiteProperties.status, "draft"));
  let published = 0;
  let notReady = 0;
  const now = new Date();
  for (const row of rows) {
    const data = row.importedData as Record<string, unknown> | null;
    if (data?.source !== "savvy-agents.com") continue;
    if (missingForPublish(row).length) {
      notReady += 1;
      continue;
    }
    await db.update(websiteProperties).set({ status: "published", publishedAt: now }).where(eq(websiteProperties.id, row.id));
    published += 1;
  }
  console.info(`[OldSiteListings] published ${published} imported drafts; ${notReady} not ready.`);
  return { published, notReady };
}
