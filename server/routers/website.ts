import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, like, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentConnections,
  agentProfiles,
  contacts,
  proformas,
  properties,
  userProfiles,
  users,
  websiteAgentProfiles,
  websiteBlogPosts,
  websiteCaseStudies,
  websiteLeads,
  websiteLeadAttempts,
  websiteProperties,
  websiteSiteSettings,
  listings,
  transactions,
} from "../../drizzle/schema";
import {
  buildNormalizedKey,
  capitalizeAddress,
  capitalizeCity,
  normalizeState,
} from "../addressNormalization";
import { getDb, logActivity } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { canAdminUsePermission, type PermissionKey } from "./permissions";

const statusSchema = z.enum(["draft", "published", "archived"]);
const nullableNumber = z.number().finite().nullable().optional();
const nullableText = z.string().trim().nullable().optional();
const stringList = z.array(z.string().trim()).default([]);
const LEAD_WINDOW_MS = 10 * 60 * 1000;
const LEAD_IP_MAX_ATTEMPTS = 12;
const LEAD_EMAIL_MAX_ATTEMPTS = 3;

const hashLeadKey = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Pick the agent a website inquiry should be routed to. The visitor's context
 * wins: an explicit agent (agent profile page, or the property's assigned
 * agent passed by the property page), then the website property's assigned
 * agent as a fallback. Returns null when the inquiry has no agent context
 * (home, about, contact pages); those stay unassigned for an ISA to route.
 */
export async function resolveInquiryAgent(
  db: any,
  propertyId: number | undefined,
  agentUserId: number | undefined,
): Promise<{ agentId: number | null; propertyAddress: string | null }> {
  let agentId: number | null = agentUserId ?? null;
  let propertyAddress: string | null = null;
  if (propertyId) {
    const [row] = await db
      .select({
        assignedAgentId: websiteProperties.assignedAgentId,
        address: properties.address,
        city: properties.city,
        state: properties.state,
      })
      .from(websiteProperties)
      .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
      .where(eq(websiteProperties.propertyId, propertyId))
      .limit(1);
    if (row) {
      if (!agentId && row.assignedAgentId) agentId = row.assignedAgentId;
      propertyAddress = [row.address, row.city, row.state].filter(Boolean).join(", ") || null;
    }
  }
  if (agentId) {
    const [agent] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, agentId), eq(users.isActive, true)))
      .limit(1);
    if (!agent) agentId = null;
  }
  return { agentId, propertyAddress };
}

async function enforceLeadThrottle(db: any, req: any, email: string) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",").map((value: string) => value.trim()).filter(Boolean);
  const ip = forwarded[forwarded.length - 1] || req?.ip || req?.socket?.remoteAddress || "unknown";
  const ipHash = hashLeadKey(ip);
  const emailHash = hashLeadKey(email.toLowerCase());
  const windowStart = new Date(Date.now() - LEAD_WINDOW_MS);
  const [ipCountRows, emailCountRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(websiteLeadAttempts).where(and(eq(websiteLeadAttempts.ipHash, ipHash), gte(websiteLeadAttempts.createdAt, windowStart))),
    db.select({ count: sql<number>`count(*)` }).from(websiteLeadAttempts).where(and(eq(websiteLeadAttempts.emailHash, emailHash), gte(websiteLeadAttempts.createdAt, windowStart))),
  ]);
  if (Number(ipCountRows[0]?.count || 0) >= LEAD_IP_MAX_ATTEMPTS || Number(emailCountRows[0]?.count || 0) >= LEAD_EMAIL_MAX_ATTEMPTS) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Please wait a few minutes and try again." });
  }
  await db.insert(websiteLeadAttempts).values({ ipHash, emailHash });
  if (Math.random() < 0.02) await db.delete(websiteLeadAttempts).where(lt(websiteLeadAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
}

function cleanSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

/** Append -2, -3 ... until the slug is free. Slugs are unique per table. */
async function uniqueSlug(db: any, table: any, base: string): Promise<string> {
  const root = base || "property";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const [taken] = await db
      .select({ id: table.id })
      .from(table)
      .where(eq(table.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/**
 * The physical facts of a property (address, beds, baths, sqft, price) live on
 * the SavvyOS `properties` record, which transactions and listings hang off.
 * The website studio may ENRICH that record by filling fields that are still
 * blank, but it must never rewrite or blank out a value that is already there.
 * Without this, a regex-scraped Zillow import whose address happens to match an
 * existing property would silently overwrite real deal data.
 */
const CANONICAL_PROPERTY_FIELDS = [
  "address",
  "normalizedAddress",
  "city",
  "state",
  "zip",
  "beds",
  "baths",
  "sqft",
  "propertyType",
  "listPrice",
] as const;

type CanonicalPropertyField = (typeof CANONICAL_PROPERTY_FIELDS)[number];

function isBlankValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

/**
 * Split the incoming canonical values against what the property record already
 * holds. `fills` are blanks we may safely populate. `ignored` names the fields
 * the caller tried to change on an already-populated record, so the UI can tell
 * the user their edit was not applied instead of silently dropping it.
 */
export function reconcileCanonical(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>
): { fills: Record<string, unknown>; ignored: CanonicalPropertyField[] } {
  const fills: Record<string, unknown> = {};
  const ignored: CanonicalPropertyField[] = [];
  for (const field of CANONICAL_PROPERTY_FIELDS) {
    const has = !isBlankValue(current[field]);
    const wants = !isBlankValue(incoming[field]);
    if (!has && wants) {
      fills[field] = incoming[field];
      continue;
    }
    // normalizedAddress is derived from address, so reporting it as well would
    // just name the same rejected edit twice.
    if (
      has &&
      wants &&
      field !== "normalizedAddress" &&
      String(current[field]) !== String(incoming[field])
    ) {
      ignored.push(field);
    }
  }
  return { fills, ignored };
}

/**
 * Booking links are typed by hand into the studio, and people type them the way
 * they read them: "calendly.com/ana-savvy", no scheme. Dropped straight into an
 * href that is a RELATIVE path, so "Book a call" lands on
 * /newsite/agents/calendly.com/ana-savvy instead of Calendly. Agent profiles are
 * the largest single booking surface on the site, so that button silently failing
 * is expensive.
 *
 * Returns an absolute https URL, or null when the value cannot be trusted as one.
 * Anything that is not http or https is rejected rather than repaired: these
 * values are rendered into an href, so a "javascript:" or "data:" URL here would
 * execute in the visitor's browser.
 */
export function normalizeBookingUrl(
  value: string | null | undefined
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  // A bare "//host/path" inherits the page's scheme; treat it as https.
  const candidate = /^\/\//.test(raw)
    ? `https:${raw}`
    : /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)
      ? raw
      : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!parsed.hostname.includes(".")) return null;
  return parsed.toString();
}

/** Repair rows stored before normalizeBookingUrl existed, without a migration. */
function withNormalizedBooking<T extends { bookingUrl?: string | null }>(
  row: T
): T {
  return { ...row, bookingUrl: normalizeBookingUrl(row.bookingUrl) };
}

function asDecimal(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value)
    ? null
    : String(value);
}

function assertAdmin(ctx: any) {
  if (ctx.user?.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator access required",
    });
  }
}

async function requireWebsitePermission(
  ctx: any,
  permission: PermissionKey = "canViewWebsite"
) {
  assertAdmin(ctx);
  if (!(await canAdminUsePermission(ctx.user, permission))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Website permission required",
    });
  }
}

/**
 * Whether an agent may act on a property. Mirrors the visibility rule the
 * Properties list already uses (properties they added, or that they hold a
 * transaction on) and adds listings, so an agent's own inventory is publishable
 * without giving them the rest of the book.
 */
export async function agentOwnsProperty(db: any, userId: number, propertyId: number): Promise<boolean> {
  const [added] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.addedByUserId, userId)))
    .limit(1);
  if (added) return true;
  const [tx] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.propertyId, propertyId), eq(transactions.agentId, userId)))
    .limit(1);
  if (tx) return true;
  const [listing] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(and(eq(listings.propertyId, propertyId), eq(listings.agentId, userId)))
    .limit(1);
  return Boolean(listing);
}

/**
 * Publishing gate for a single property. Admins keep the permission-based
 * route into the full studio; agents may publish the properties they own.
 */
async function requirePropertyPublishAccess(ctx: any, db: any, propertyId: number) {
  if (ctx.user?.role === "admin") {
    await requireWebsitePermission(ctx, "canManageWebsiteProperties");
    return;
  }
  if (ctx.user?.role === "agent" && (await agentOwnsProperty(db, ctx.user.id, propertyId))) {
    return;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You can only publish properties you added or are working on.",
  });
}

const propertyInput = z.object({
  id: z.number().int().positive().optional(),
  propertyId: z.number().int().positive().optional(),
  address: z.string().trim().min(3).max(512),
  city: nullableText,
  state: nullableText,
  zip: nullableText,
  beds: nullableNumber,
  baths: nullableNumber,
  sqft: z.number().int().positive().nullable().optional(),
  listPrice: nullableNumber,
  propertyType: z
    .enum([
      "single_family",
      "multi_family",
      "condo",
      "townhouse",
      "cabin",
      "vacation_rental",
      "commercial",
      "land",
      "other",
    ])
    .nullable()
    .optional(),
  slug: z.string().trim().min(3).max(255),
  status: statusSchema.default("draft"),
  sourceUrl: nullableText,
  sourceProformaId: z.number().int().positive().nullable().optional(),
  assignedAgentId: z.number().int().positive().nullable().optional(),
  headline: nullableText,
  summary: nullableText,
  heroImageUrl: nullableText,
  galleryImageUrls: stringList,
  featureTags: stringList,
  investmentHighlights: stringList,
  projectedRevenue: nullableNumber,
  cashOnCash: nullableNumber,
  capRate: nullableNumber,
  occupancyRate: nullableNumber,
  averageDailyRate: nullableNumber,
  regulationSummary: nullableText,
  callToActionText: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .default("Request the full investment analysis"),
  metaTitle: nullableText,
  metaDescription: nullableText,
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  importedData: z.record(z.string(), z.unknown()).nullable().optional(),
});

const agentInput = z.object({
  id: z.number().int().positive().optional(),
  userId: z.number().int().positive(),
  slug: z.string().trim().min(2).max(255),
  headline: nullableText,
  shortBio: nullableText,
  markets: stringList,
  specialties: stringList,
  imageUrl: nullableText,
  publicEmail: z.string().email().nullable().optional().or(z.literal("")),
  publicPhone: nullableText,
  bookingUrl: nullableText,
  status: statusSchema.default("draft"),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const caseStudyInput = z.object({
  id: z.number().int().positive().optional(),
  slug: z.string().trim().min(2).max(255),
  title: z.string().trim().min(3).max(512),
  eyebrow: nullableText,
  excerpt: nullableText,
  body: nullableText,
  heroImageUrl: nullableText,
  propertyId: z.number().int().positive().nullable().optional(),
  agentUserId: z.number().int().positive().nullable().optional(),
  primaryMetricLabel: nullableText,
  primaryMetricValue: nullableText,
  secondaryMetricLabel: nullableText,
  secondaryMetricValue: nullableText,
  status: statusSchema.default("draft"),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const postInput = z.object({
  id: z.number().int().positive().optional(),
  slug: z.string().trim().min(2).max(255),
  title: z.string().trim().min(3).max(512),
  excerpt: nullableText,
  body: nullableText,
  coverImageUrl: nullableText,
  category: nullableText,
  authorUserId: z.number().int().positive().nullable().optional(),
  status: statusSchema.default("draft"),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  metaTitle: nullableText,
  metaDescription: nullableText,
});

const settingsInput = z.object({
  announcementText: nullableText,
  heroEyebrow: nullableText,
  heroTitle: z.string().trim().min(3).max(512),
  heroBody: nullableText,
  heroImageUrl: nullableText,
  stats: z.array(z.object({ value: z.string(), label: z.string() })),
  testimonials: z.array(
    z.object({
      quote: z.string(),
      name: z.string(),
      role: z.string().optional(),
    })
  ),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: nullableText,
  footerText: nullableText,
});

const propertyProjection = {
  id: websiteProperties.id,
  propertyId: websiteProperties.propertyId,
  slug: websiteProperties.slug,
  status: websiteProperties.status,
  sourceUrl: websiteProperties.sourceUrl,
  sourceProformaId: websiteProperties.sourceProformaId,
  assignedAgentId: websiteProperties.assignedAgentId,
  headline: websiteProperties.headline,
  summary: websiteProperties.summary,
  heroImageUrl: websiteProperties.heroImageUrl,
  galleryImageUrls: websiteProperties.galleryImageUrls,
  featureTags: websiteProperties.featureTags,
  investmentHighlights: websiteProperties.investmentHighlights,
  projectedRevenue: websiteProperties.projectedRevenue,
  cashOnCash: websiteProperties.cashOnCash,
  capRate: websiteProperties.capRate,
  occupancyRate: websiteProperties.occupancyRate,
  averageDailyRate: websiteProperties.averageDailyRate,
  regulationSummary: websiteProperties.regulationSummary,
  callToActionText: websiteProperties.callToActionText,
  metaTitle: websiteProperties.metaTitle,
  metaDescription: websiteProperties.metaDescription,
  isFeatured: websiteProperties.isFeatured,
  sortOrder: websiteProperties.sortOrder,
  publishedAt: websiteProperties.publishedAt,
  updatedAt: websiteProperties.updatedAt,
  address: properties.address,
  city: properties.city,
  state: properties.state,
  zip: properties.zip,
  beds: properties.beds,
  baths: properties.baths,
  sqft: properties.sqft,
  propertyType: properties.propertyType,
  listPrice: properties.listPrice,
  assignedAgentName: users.name,
  assignedAgentEmail: websiteAgentProfiles.publicEmail,
  assignedAgentPhone: websiteAgentProfiles.publicPhone,
  assignedAgentImageUrl: websiteAgentProfiles.imageUrl,
  assignedAgentSlug: websiteAgentProfiles.slug,
};

async function getPublishedHome() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [settingsRows, propertyRows, agentRows, caseRows, postRows] =
    await Promise.all([
      db
        .select()
        .from(websiteSiteSettings)
        .where(eq(websiteSiteSettings.singletonKey, "primary"))
        .limit(1),
      db
        .select(propertyProjection)
        .from(websiteProperties)
        .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
        .leftJoin(users, eq(websiteProperties.assignedAgentId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(
          websiteAgentProfiles,
          eq(users.id, websiteAgentProfiles.userId)
        )
        .where(
          and(
            eq(websiteProperties.status, "published"),
            eq(websiteProperties.isFeatured, true)
          )
        )
        .orderBy(
          asc(websiteProperties.sortOrder),
          desc(websiteProperties.publishedAt)
        )
        .limit(6),
      db
        .select({
          id: websiteAgentProfiles.id,
          userId: websiteAgentProfiles.userId,
          slug: websiteAgentProfiles.slug,
          headline: websiteAgentProfiles.headline,
          shortBio: websiteAgentProfiles.shortBio,
          markets: websiteAgentProfiles.markets,
          specialties: websiteAgentProfiles.specialties,
          imageUrl: websiteAgentProfiles.imageUrl,
          publicEmail: websiteAgentProfiles.publicEmail,
          publicPhone: websiteAgentProfiles.publicPhone,
          bookingUrl: websiteAgentProfiles.bookingUrl,
          name: users.name,
        })
        .from(websiteAgentProfiles)
        .innerJoin(users, eq(websiteAgentProfiles.userId, users.id))
        .where(
          and(
            eq(websiteAgentProfiles.status, "published"),
            eq(websiteAgentProfiles.isFeatured, true)
          )
        )
        .orderBy(asc(websiteAgentProfiles.sortOrder))
        .limit(6),
      db
        .select({
          id: websiteCaseStudies.id,
          slug: websiteCaseStudies.slug,
          title: websiteCaseStudies.title,
          eyebrow: websiteCaseStudies.eyebrow,
          excerpt: websiteCaseStudies.excerpt,
          body: websiteCaseStudies.body,
          heroImageUrl: websiteCaseStudies.heroImageUrl,
          primaryMetricLabel: websiteCaseStudies.primaryMetricLabel,
          primaryMetricValue: websiteCaseStudies.primaryMetricValue,
          secondaryMetricLabel: websiteCaseStudies.secondaryMetricLabel,
          secondaryMetricValue: websiteCaseStudies.secondaryMetricValue,
          agentName: users.name,
        })
        .from(websiteCaseStudies)
        .leftJoin(users, eq(websiteCaseStudies.agentUserId, users.id))
        .where(
          and(
            eq(websiteCaseStudies.status, "published"),
            eq(websiteCaseStudies.isFeatured, true)
          )
        )
        .orderBy(asc(websiteCaseStudies.sortOrder))
        .limit(4),
      db
        .select({
          id: websiteBlogPosts.id,
          slug: websiteBlogPosts.slug,
          title: websiteBlogPosts.title,
          excerpt: websiteBlogPosts.excerpt,
          body: websiteBlogPosts.body,
          coverImageUrl: websiteBlogPosts.coverImageUrl,
          category: websiteBlogPosts.category,
          publishedAt: websiteBlogPosts.publishedAt,
          authorName: users.name,
          authorImageUrl: userProfiles.profilePhotoUrl,
        })
        .from(websiteBlogPosts)
        .leftJoin(users, eq(websiteBlogPosts.authorUserId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(
          and(
            eq(websiteBlogPosts.status, "published"),
            eq(websiteBlogPosts.isFeatured, true)
          )
        )
        .orderBy(
          asc(websiteBlogPosts.sortOrder),
          desc(websiteBlogPosts.publishedAt)
        )
        .limit(3),
    ]);
  return {
    settings: settingsRows[0] ?? null,
    properties: propertyRows,
    agents: agentRows.map(withNormalizedBooking),
    caseStudies: caseRows,
    posts: postRows,
  };
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1])
      return match[1]
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .trim();
  }
  return "";
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function findJsonLd(html: string) {
  const blocks = Array.from(
    html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  );
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed?.["@graph"] || [parsed];
      for (const item of candidates) {
        if (
          item?.address ||
          item?.offers ||
          /Residence|House|Accommodation|Product/i.test(
            String(item?.["@type"] || "")
          )
        )
          return item;
      }
    } catch {
      // Ignore malformed third-party JSON-LD and continue to metadata fallbacks.
    }
  }
  return null;
}

export const WEBSITE_PUBLIC_TRPC_PATHS = new Set([
  "website.publicHome",
  "website.publicSettings",
  "website.publicProperties",
  "website.publicProperty",
  "website.publicAgents",
  "website.publicAgent",
  "website.publicCaseStudies",
  "website.publicCaseStudy",
  "website.publicPosts",
  "website.publicPost",
  "website.submitLead",
]);

export const websiteRouter = router({
  publicHome: publicProcedure.query(getPublishedHome),

  publicSettings: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(websiteSiteSettings).where(eq(websiteSiteSettings.singletonKey, "primary")).limit(1);
    return rows[0] ?? null;
  }),

  publicProperties: publicProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(200).optional(),
          agentSlug: z.string().optional(),
          state: z.string().trim().max(2).optional(),
          city: z.string().trim().max(120).optional(),
          minPrice: z.number().nonnegative().optional(),
          maxPrice: z.number().nonnegative().optional(),
          minBeds: z.number().int().nonnegative().max(20).optional(),
          minBaths: z.number().nonnegative().max(20).optional(),
          propertyType: z.string().trim().max(40).optional(),
          sort: z
            .enum(["featured", "priceAsc", "priceDesc", "newest"])
            .optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [eq(websiteProperties.status, "published")];
      if (input?.search) {
        const q = `%${input.search}%`;
        conditions.push(
          or(
            like(properties.address, q),
            like(properties.city, q),
            like(properties.state, q),
            like(websiteProperties.headline, q)
          )!
        );
      }
      if (input?.agentSlug)
        conditions.push(eq(websiteAgentProfiles.slug, input.agentSlug));
      if (input?.state) conditions.push(eq(properties.state, input.state));
      if (input?.city) conditions.push(eq(properties.city, input.city));
      // Price, beds and baths filter on the SavvyOS property record, which is
      // the source of truth for those numbers. A property with no price on file
      // drops out of a price-bounded search rather than being shown as a match
      // we cannot actually justify.
      if (input?.minPrice != null)
        conditions.push(gte(properties.listPrice, String(input.minPrice)));
      if (input?.maxPrice != null)
        conditions.push(lte(properties.listPrice, String(input.maxPrice)));
      if (input?.minBeds != null)
        conditions.push(gte(properties.beds, String(input.minBeds)));
      if (input?.minBaths != null)
        conditions.push(gte(properties.baths, String(input.minBaths)));
      if (input?.propertyType)
        conditions.push(eq(properties.propertyType, input.propertyType as any));

      const order =
        input?.sort === "priceAsc"
          ? [asc(properties.listPrice)]
          : input?.sort === "priceDesc"
            ? [desc(properties.listPrice)]
            : input?.sort === "newest"
              ? [desc(websiteProperties.publishedAt)]
              : [
                  asc(websiteProperties.sortOrder),
                  desc(websiteProperties.publishedAt),
                ];

      return db
        .select(propertyProjection)
        .from(websiteProperties)
        .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
        .leftJoin(users, eq(websiteProperties.assignedAgentId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(
          websiteAgentProfiles,
          eq(users.id, websiteAgentProfiles.userId)
        )
        .where(and(...conditions))
        .orderBy(...order);
    }),

  /**
   * The values worth offering as filters, derived from what is actually
   * published. Offering a market or a price band that matches nothing is worse
   * than offering no filter at all, so the UI builds its controls from this.
   */
  publicPropertyFacets: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { states: [], cities: [], propertyTypes: [], priceRange: null };
    const rows = await db
      .select({
        state: properties.state,
        city: properties.city,
        propertyType: properties.propertyType,
        listPrice: properties.listPrice,
      })
      .from(websiteProperties)
      .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
      .where(eq(websiteProperties.status, "published"));

    // Array.from rather than spreading a Set: this tsconfig targets below es2015
    // for iteration, so the spread form does not compile.
    const distinct = (values: (string | null)[]) =>
      Array.from(new Set(values.filter((v): v is string => !!v))).sort();
    const states = distinct(rows.map(r => r.state));
    const cities = distinct(rows.map(r => r.city));
    const propertyTypes = distinct(rows.map(r => r.propertyType));
    const prices = rows
      .map(r => (r.listPrice == null ? null : Number(r.listPrice)))
      .filter((n): n is number => n != null && !Number.isNaN(n));
    return {
      states,
      cities,
      propertyTypes,
      priceRange: prices.length
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : null,
    };
  }),

  publicProperty: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select(propertyProjection)
        .from(websiteProperties)
        .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
        .leftJoin(users, eq(websiteProperties.assignedAgentId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(
          websiteAgentProfiles,
          eq(users.id, websiteAgentProfiles.userId)
        )
        .where(
          and(
            eq(websiteProperties.slug, input.slug),
            eq(websiteProperties.status, "published")
          )
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  publicAgents: publicProcedure
    .input(
      z.object({ search: z.string().trim().max(200).optional() }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [eq(websiteAgentProfiles.status, "published")];
      if (input?.search) {
        const q = `%${input.search}%`;
        conditions.push(
          or(
            like(users.name, q),
            like(websiteAgentProfiles.headline, q),
            sql`CAST(${websiteAgentProfiles.markets} AS CHAR) LIKE ${q}`,
            sql`CAST(${websiteAgentProfiles.specialties} AS CHAR) LIKE ${q}`
          )!
        );
      }
      const agentRows = await db
        .select({
          id: websiteAgentProfiles.id,
          userId: websiteAgentProfiles.userId,
          slug: websiteAgentProfiles.slug,
          headline: websiteAgentProfiles.headline,
          shortBio: websiteAgentProfiles.shortBio,
          markets: websiteAgentProfiles.markets,
          specialties: websiteAgentProfiles.specialties,
          imageUrl: websiteAgentProfiles.imageUrl,
          publicEmail: websiteAgentProfiles.publicEmail,
          publicPhone: websiteAgentProfiles.publicPhone,
          bookingUrl: websiteAgentProfiles.bookingUrl,
          name: users.name,
        })
        .from(websiteAgentProfiles)
        .innerJoin(users, eq(websiteAgentProfiles.userId, users.id))
        .where(and(...conditions))
        .orderBy(asc(websiteAgentProfiles.sortOrder), asc(users.name));
      return agentRows.map(withNormalizedBooking);
    }),

  publicAgent: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select({
          id: websiteAgentProfiles.id,
          userId: websiteAgentProfiles.userId,
          slug: websiteAgentProfiles.slug,
          headline: websiteAgentProfiles.headline,
          shortBio: websiteAgentProfiles.shortBio,
          markets: websiteAgentProfiles.markets,
          specialties: websiteAgentProfiles.specialties,
          imageUrl: websiteAgentProfiles.imageUrl,
          publicEmail: websiteAgentProfiles.publicEmail,
          publicPhone: websiteAgentProfiles.publicPhone,
          bookingUrl: websiteAgentProfiles.bookingUrl,
          name: users.name,
          licenseNumber: agentProfiles.licenseNumber,
          licenseState: agentProfiles.licenseState,
        })
        .from(websiteAgentProfiles)
        .innerJoin(users, eq(websiteAgentProfiles.userId, users.id))
        .leftJoin(agentProfiles, eq(users.id, agentProfiles.userId))
        .where(
          and(
            eq(websiteAgentProfiles.slug, input.slug),
            eq(websiteAgentProfiles.status, "published")
          )
        )
        .limit(1);
      if (!rows[0]) return null;
      const relatedProperties = await db
        .select(propertyProjection)
        .from(websiteProperties)
        .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
        .leftJoin(users, eq(websiteProperties.assignedAgentId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(
          websiteAgentProfiles,
          eq(users.id, websiteAgentProfiles.userId)
        )
        .where(
          and(
            eq(websiteProperties.assignedAgentId, rows[0].userId),
            eq(websiteProperties.status, "published")
          )
        )
        .orderBy(asc(websiteProperties.sortOrder))
        .limit(6);
      return { ...withNormalizedBooking(rows[0]), properties: relatedProperties };
    }),

  publicCaseStudies: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: websiteCaseStudies.id,
        slug: websiteCaseStudies.slug,
        title: websiteCaseStudies.title,
        eyebrow: websiteCaseStudies.eyebrow,
        excerpt: websiteCaseStudies.excerpt,
        body: websiteCaseStudies.body,
        heroImageUrl: websiteCaseStudies.heroImageUrl,
        primaryMetricLabel: websiteCaseStudies.primaryMetricLabel,
        primaryMetricValue: websiteCaseStudies.primaryMetricValue,
        secondaryMetricLabel: websiteCaseStudies.secondaryMetricLabel,
        secondaryMetricValue: websiteCaseStudies.secondaryMetricValue,
        agentName: users.name,
      })
      .from(websiteCaseStudies)
      .leftJoin(users, eq(websiteCaseStudies.agentUserId, users.id))
      .where(eq(websiteCaseStudies.status, "published"))
      .orderBy(
        asc(websiteCaseStudies.sortOrder),
        desc(websiteCaseStudies.publishedAt)
      );
  }),

  publicCaseStudy: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select({
          id: websiteCaseStudies.id,
          slug: websiteCaseStudies.slug,
          title: websiteCaseStudies.title,
          eyebrow: websiteCaseStudies.eyebrow,
          excerpt: websiteCaseStudies.excerpt,
          body: websiteCaseStudies.body,
          heroImageUrl: websiteCaseStudies.heroImageUrl,
          primaryMetricLabel: websiteCaseStudies.primaryMetricLabel,
          primaryMetricValue: websiteCaseStudies.primaryMetricValue,
          secondaryMetricLabel: websiteCaseStudies.secondaryMetricLabel,
          secondaryMetricValue: websiteCaseStudies.secondaryMetricValue,
          propertyId: websiteCaseStudies.propertyId,
          agentUserId: websiteCaseStudies.agentUserId,
          agentName: users.name,
          agentSlug: websiteAgentProfiles.slug,
        })
        .from(websiteCaseStudies)
        .leftJoin(users, eq(websiteCaseStudies.agentUserId, users.id))
        .leftJoin(
          websiteAgentProfiles,
          eq(users.id, websiteAgentProfiles.userId)
        )
        .where(
          and(
            eq(websiteCaseStudies.slug, input.slug),
            eq(websiteCaseStudies.status, "published")
          )
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  publicPosts: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: websiteBlogPosts.id,
        slug: websiteBlogPosts.slug,
        title: websiteBlogPosts.title,
        excerpt: websiteBlogPosts.excerpt,
        body: websiteBlogPosts.body,
        coverImageUrl: websiteBlogPosts.coverImageUrl,
        category: websiteBlogPosts.category,
        publishedAt: websiteBlogPosts.publishedAt,
        authorName: users.name,
        authorImageUrl: userProfiles.profilePhotoUrl,
      })
      .from(websiteBlogPosts)
      .leftJoin(users, eq(websiteBlogPosts.authorUserId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .where(eq(websiteBlogPosts.status, "published"))
      .orderBy(
        desc(websiteBlogPosts.isFeatured),
        asc(websiteBlogPosts.sortOrder),
        desc(websiteBlogPosts.publishedAt)
      );
  }),

  publicPost: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select({
          id: websiteBlogPosts.id,
          slug: websiteBlogPosts.slug,
          title: websiteBlogPosts.title,
          excerpt: websiteBlogPosts.excerpt,
          body: websiteBlogPosts.body,
          coverImageUrl: websiteBlogPosts.coverImageUrl,
          category: websiteBlogPosts.category,
          publishedAt: websiteBlogPosts.publishedAt,
          authorName: users.name,
          authorImageUrl: userProfiles.profilePhotoUrl,
        })
        .from(websiteBlogPosts)
        .leftJoin(users, eq(websiteBlogPosts.authorUserId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .where(
          and(
            eq(websiteBlogPosts.slug, input.slug),
            eq(websiteBlogPosts.status, "published")
          )
        )
        .limit(1);
      return rows[0] ?? null;
    }),

  submitLead: publicProcedure
    .input(
      z.object({
        firstName: z.string().trim().min(1).max(128),
        lastName: z.string().trim().min(1).max(128),
        email: z.string().trim().email().max(320),
        phone: z.string().trim().max(64).optional(),
        message: z.string().trim().max(4000).optional(),
        intent: z
          .enum(["buy", "sell", "property", "agent", "general"])
          .default("general"),
        propertyId: z.number().int().positive().optional(),
        agentUserId: z.number().int().positive().optional(),
        sourcePath: z.string().trim().max(512).optional(),
        attribution: z.record(z.string(), z.string()).optional(),
        website: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.website) return { success: true };
      const normalizedEmail = input.email.toLowerCase();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await enforceLeadThrottle(db, ctx.req, normalizedEmail);
      const recentDuplicate = await db.select({ id: websiteLeads.id }).from(websiteLeads).where(and(
        eq(websiteLeads.email, normalizedEmail),
        gte(websiteLeads.createdAt, new Date(Date.now() - 60_000)),
      )).limit(1);
      if (recentDuplicate[0]) return { success: true };
      const existing = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.email, normalizedEmail))
        .limit(1);
      let contactId = existing[0]?.id;
      if (!contactId) {
        const result = await db.insert(contacts).values({
          firstName: input.firstName,
          lastName: input.lastName,
          email: normalizedEmail,
          phone: input.phone || null,
          leadSourceType: "organic",
          isaStatus: "new_lead",
          tags: ["Savvy website"],
          notes: input.message || "Savvy website inquiry",
        });
        contactId = Number((result as any)[0]?.insertId);
      }
      await db.insert(websiteLeads).values({
        contactId: contactId || null,
        propertyId: input.propertyId || null,
        agentUserId: input.agentUserId || null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: normalizedEmail,
        phone: input.phone || null,
        intent: input.intent,
        message: input.message || null,
        sourcePath: input.sourcePath || null,
        attribution: input.attribution || {},
      });

      // Website inquiries are SavvyOS contacts, not a separate lead queue.
      // Connect the contact to the agent the visitor was already looking at
      // (the property's assigned agent or the agent whose profile they were on)
      // so the inquiry lands in that agent's pipeline immediately.
      const { agentId, propertyAddress } = await resolveInquiryAgent(db, input.propertyId, input.agentUserId);
      let connectionCreated = false;
      if (contactId && agentId) {
        const [existingConnection] = await db
          .select({ id: agentConnections.id })
          .from(agentConnections)
          .where(and(eq(agentConnections.agentId, agentId), eq(agentConnections.contactId, contactId)))
          .limit(1);
        if (!existingConnection) {
          await db.insert(agentConnections).values({ agentId, contactId });
          connectionCreated = true;
        }
      }
      if (contactId) {
        await logActivity({
          userId: agentId ?? null,
          action: "website_inquiry_submitted",
          entityType: "contact",
          entityId: contactId,
          relatedContactId: contactId,
          details: {
            intent: input.intent,
            message: input.message || null,
            propertyId: input.propertyId ?? null,
            propertyAddress,
            agentId,
            connectionCreated,
            sourcePath: input.sourcePath || null,
            attribution: input.attribution || {},
          },
        });
      }
      return { success: true };
    }),

  adminOverview: protectedProcedure.query(async ({ ctx }) => {
    await requireWebsitePermission(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const canViewLeads = await canAdminUsePermission(ctx.user, "canViewWebsiteLeads");
    const [
      settingsRows,
      propertyRows,
      agentRows,
      caseRows,
      postRows,
      leadRows,
      sourceAgents,
    ] = await Promise.all([
      db
        .select()
        .from(websiteSiteSettings)
        .where(eq(websiteSiteSettings.singletonKey, "primary"))
        .limit(1),
      db
        .select(propertyProjection)
        .from(websiteProperties)
        .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
        .leftJoin(users, eq(websiteProperties.assignedAgentId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(
          websiteAgentProfiles,
          eq(users.id, websiteAgentProfiles.userId)
        )
        .orderBy(desc(websiteProperties.updatedAt)),
      db
        .select({
          id: websiteAgentProfiles.id,
          userId: websiteAgentProfiles.userId,
          slug: websiteAgentProfiles.slug,
          headline: websiteAgentProfiles.headline,
          shortBio: websiteAgentProfiles.shortBio,
          markets: websiteAgentProfiles.markets,
          specialties: websiteAgentProfiles.specialties,
          imageUrl: websiteAgentProfiles.imageUrl,
          publicEmail: websiteAgentProfiles.publicEmail,
          publicPhone: websiteAgentProfiles.publicPhone,
          bookingUrl: websiteAgentProfiles.bookingUrl,
          status: websiteAgentProfiles.status,
          isFeatured: websiteAgentProfiles.isFeatured,
          sortOrder: websiteAgentProfiles.sortOrder,
          updatedAt: websiteAgentProfiles.updatedAt,
          name: users.name,
        })
        .from(websiteAgentProfiles)
        .innerJoin(users, eq(websiteAgentProfiles.userId, users.id))
        .orderBy(desc(websiteAgentProfiles.updatedAt)),
      db
        .select()
        .from(websiteCaseStudies)
        .orderBy(desc(websiteCaseStudies.updatedAt)),
      db
        .select()
        .from(websiteBlogPosts)
        .orderBy(desc(websiteBlogPosts.updatedAt)),
      canViewLeads
        ? db.select().from(websiteLeads).orderBy(desc(websiteLeads.createdAt)).limit(100)
        : Promise.resolve([]),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          imageUrl: userProfiles.profilePhotoUrl,
          phone: userProfiles.primaryPhone,
          bio: agentProfiles.bio,
          bookingUrl: users.callBookingLink,
        })
        .from(users)
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(agentProfiles, eq(users.id, agentProfiles.userId))
        .where(and(eq(users.role, "agent"), eq(users.isActive, true)))
        .orderBy(asc(users.name)),
    ]);
    return {
      settings: settingsRows[0] ?? null,
      properties: propertyRows,
      agents: agentRows.map(withNormalizedBooking),
      caseStudies: caseRows,
      posts: postRows,
      leads: leadRows,
      canViewLeads,
      // These feed the "feature an agent" picker, so the value prefilled into the
      // form should already be a working link.
      sourceAgents: sourceAgents.map(withNormalizedBooking),
    };
  }),

  searchSourceProperties: protectedProcedure
    .input(z.object({ search: z.string().trim().max(200).default("") }))
    .query(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteProperties");
      const db = await getDb();
      if (!db) return [];
      const q = `%${input.search}%`;
      return db
        .select({
          id: properties.id,
          address: properties.address,
          city: properties.city,
          state: properties.state,
          zip: properties.zip,
          beds: properties.beds,
          baths: properties.baths,
          sqft: properties.sqft,
          propertyType: properties.propertyType,
          listPrice: properties.listPrice,
        })
        .from(properties)
        .where(
          input.search
            ? or(
                like(properties.address, q),
                like(properties.city, q),
                like(properties.state, q)
              )
            : undefined
        )
        .orderBy(desc(properties.updatedAt))
        .limit(30);
    }),

  propertyProformas: protectedProcedure
    .input(z.object({ propertyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteProperties");
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: proformas.id,
          title: proformas.title,
          grossRevenue: proformas.grossRevenue,
          cashOnCash: proformas.cashOnCash,
          capRate: proformas.capRate,
          updatedAt: proformas.updatedAt,
        })
        .from(proformas)
        .where(eq(proformas.propertyId, input.propertyId))
        .orderBy(desc(proformas.updatedAt));
    }),

  importZillow: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteProperties");
      const parsedUrl = new URL(input.url);
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        parsedUrl.protocol !== "https:" ||
        (hostname !== "zillow.com" && !hostname.endsWith(".zillow.com"))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter a valid https://zillow.com property URL.",
        });
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(parsedUrl.toString(), {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; SavvyOS property importer)",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        if (!response.ok) throw new Error(`Zillow returned ${response.status}`);
        const html = (await response.text()).slice(0, 5_000_000);
        const ld = findJsonLd(html) || {};
        const addressObject = ld.address || {};
        const title = metaContent(html, "og:title") || ld.name || "";
        const description =
          metaContent(html, "og:description") || ld.description || "";
        const image =
          metaContent(html, "og:image") ||
          (Array.isArray(ld.image) ? ld.image[0] : ld.image) ||
          "";
        const priceMatch = html.match(
          /(?:price|listPrice)["'\s:]+\$?([0-9][0-9,.]+)/i
        );
        const bedMatch = html.match(
          /([0-9]+(?:\.[0-9]+)?)\s*(?:bd|bed|beds|bedrooms)/i
        );
        const bathMatch = html.match(
          /([0-9]+(?:\.[0-9]+)?)\s*(?:ba|bath|baths|bathrooms)/i
        );
        const sqftMatch = html.match(/([0-9][0-9,]*)\s*(?:sq\.?\s*ft|sqft)/i);
        const addressText =
          addressObject.streetAddress ||
          title.split("|")[0]?.split("-")[0]?.trim() ||
          "";
        return {
          sourceUrl: parsedUrl.toString(),
          address: String(addressText || ""),
          city: String(addressObject.addressLocality || ""),
          state: String(addressObject.addressRegion || ""),
          zip: String(addressObject.postalCode || ""),
          listPrice:
            numberFrom(ld.offers?.price) ?? numberFrom(priceMatch?.[1]),
          beds: numberFrom(ld.numberOfBedrooms) ?? numberFrom(bedMatch?.[1]),
          baths:
            numberFrom(ld.numberOfBathroomsTotal) ?? numberFrom(bathMatch?.[1]),
          sqft: numberFrom(ld.floorSize?.value) ?? numberFrom(sqftMatch?.[1]),
          heroImageUrl: String(image || ""),
          summary: String(description || ""),
          slug: cleanSlug(
            [
              addressText,
              addressObject.addressLocality,
              addressObject.addressRegion,
            ]
              .filter(Boolean)
              .join(" ")
          ),
          importedData: {
            title,
            description,
            image,
            jsonLdType: ld["@type"] || null,
            importedAt: new Date().toISOString(),
          },
          warning:
            "Imported public listing fields are a starting point. Review accuracy, image rights, and current listing data before publishing.",
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Zillow did not provide importable public metadata. Add the property manually or try again. (${error instanceof Error ? error.message : "request failed"})`,
        });
      } finally {
        clearTimeout(timer);
      }
    }),

  saveProperty: protectedProcedure
    .input(propertyInput)
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteProperties");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const normalizedAddress = buildNormalizedKey(
        input.address,
        input.city,
        input.state,
        input.zip
      );
      let propertyId = input.propertyId;
      if (input.id && !propertyId) {
        const current = await db.select({ propertyId: websiteProperties.propertyId }).from(websiteProperties).where(eq(websiteProperties.id, input.id)).limit(1);
        propertyId = current[0]?.propertyId;
      }
      if (!propertyId) {
        const match = await db
          .select({ id: properties.id })
          .from(properties)
          .where(eq(properties.normalizedAddress, normalizedAddress))
          .limit(1);
        propertyId = match[0]?.id;
      }
      let proformaMetrics: Record<string, string | null> = {};
      if (input.sourceProformaId) {
        if (!propertyId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Save the property before attaching an existing pro-forma." });
        }
        const selected = await db
          .select({ grossRevenue: proformas.grossRevenue, cashOnCash: proformas.cashOnCash, capRate: proformas.capRate })
          .from(proformas)
          .where(and(eq(proformas.id, input.sourceProformaId), eq(proformas.propertyId, propertyId)))
          .limit(1);
        if (!selected[0]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The selected pro-forma does not belong to this property." });
        }
        proformaMetrics = {
          projectedRevenue: input.projectedRevenue == null ? selected[0].grossRevenue : asDecimal(input.projectedRevenue),
          cashOnCash: input.cashOnCash == null ? selected[0].cashOnCash : asDecimal(input.cashOnCash),
          capRate: input.capRate == null ? selected[0].capRate : asDecimal(input.capRate),
        };
      }
      const canonical = {
        address: capitalizeAddress(input.address),
        normalizedAddress,
        city: input.city ? capitalizeCity(input.city) : null,
        state: input.state ? normalizeState(input.state) : null,
        zip: input.zip || null,
        beds: asDecimal(input.beds),
        baths: asDecimal(input.baths),
        sqft: input.sqft ?? null,
        propertyType: input.propertyType ?? null,
        listPrice: asDecimal(input.listPrice),
      };
      return db.transaction(async tx => {
        let savedPropertyId = propertyId;
        let ignoredFields: CanonicalPropertyField[] = [];
        if (savedPropertyId) {
          const [current] = await tx
            .select({
              address: properties.address,
              normalizedAddress: properties.normalizedAddress,
              city: properties.city,
              state: properties.state,
              zip: properties.zip,
              beds: properties.beds,
              baths: properties.baths,
              sqft: properties.sqft,
              propertyType: properties.propertyType,
              listPrice: properties.listPrice,
            })
            .from(properties)
            .where(eq(properties.id, savedPropertyId))
            .limit(1);
          if (!current) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "That SavvyOS property no longer exists.",
            });
          }
          // Enrich blanks only. See reconcileCanonical.
          const reconciled = reconcileCanonical(current, canonical);
          ignoredFields = reconciled.ignored;
          if (Object.keys(reconciled.fills).length > 0) {
            await tx
              .update(properties)
              .set(reconciled.fills)
              .where(eq(properties.id, savedPropertyId));
          }
        } else {
          const created = await tx.insert(properties).values({ ...canonical, addedByUserId: ctx.user.id });
          savedPropertyId = Number((created as any)[0]?.insertId);
        }
        const data = {
          propertyId: savedPropertyId,
          slug: cleanSlug(input.slug),
          status: input.status,
          sourceUrl: input.sourceUrl || null,
          sourceProformaId: input.sourceProformaId || null,
          assignedAgentId: input.assignedAgentId || null,
          headline: input.headline || null,
          summary: input.summary || null,
          heroImageUrl: input.heroImageUrl || null,
          galleryImageUrls: input.galleryImageUrls,
          featureTags: input.featureTags,
          investmentHighlights: input.investmentHighlights,
          projectedRevenue: asDecimal(input.projectedRevenue),
          cashOnCash: asDecimal(input.cashOnCash),
          capRate: asDecimal(input.capRate),
          occupancyRate: asDecimal(input.occupancyRate),
          averageDailyRate: asDecimal(input.averageDailyRate),
          regulationSummary: input.regulationSummary || null,
          callToActionText: input.callToActionText,
          metaTitle: input.metaTitle || null,
          metaDescription: input.metaDescription || null,
          importedData: input.importedData || null,
          isFeatured: input.isFeatured,
          sortOrder: input.sortOrder,
          publishedAt: input.status === "published" ? new Date() : null,
          updatedById: ctx.user.id,
          ...proformaMetrics,
        };
        if (input.id) {
          await tx.update(websiteProperties).set(data).where(eq(websiteProperties.id, input.id));
          return { id: input.id, propertyId: savedPropertyId, ignoredFields };
        }
        const existing = await tx.select({ id: websiteProperties.id }).from(websiteProperties).where(eq(websiteProperties.propertyId, savedPropertyId)).limit(1);
        if (existing[0]) {
          await tx.update(websiteProperties).set(data).where(eq(websiteProperties.id, existing[0].id));
          return { id: existing[0].id, propertyId: savedPropertyId, ignoredFields };
        }
        const result = await tx.insert(websiteProperties).values({ ...data, createdById: ctx.user.id });
        return { id: Number((result as any)[0]?.insertId), propertyId: savedPropertyId, ignoredFields };
      });
    }),

  saveAgent: protectedProcedure
    .input(agentInput)
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteAgents");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const data = {
        ...input,
        id: undefined,
        slug: cleanSlug(input.slug),
        publicEmail: input.publicEmail || null,
        publicPhone: input.publicPhone || null,
        headline: input.headline || null,
        shortBio: input.shortBio || null,
        imageUrl: input.imageUrl || null,
        // Store it absolute so every consumer gets a working link, not just the
        // ones that remember to normalise.
        bookingUrl: normalizeBookingUrl(input.bookingUrl),
        publishedAt: input.status === "published" ? new Date() : null,
        updatedById: ctx.user.id,
      };
      if (input.id)
        await db
          .update(websiteAgentProfiles)
          .set(data as any)
          .where(eq(websiteAgentProfiles.id, input.id));
      else
        await db
          .insert(websiteAgentProfiles)
          .values({ ...data, createdById: ctx.user.id } as any);
      return { success: true };
    }),

  saveCaseStudy: protectedProcedure
    .input(caseStudyInput)
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteCaseStudies");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const data = {
        ...input,
        id: undefined,
        slug: cleanSlug(input.slug),
        publishedAt: input.status === "published" ? new Date() : null,
        updatedById: ctx.user.id,
      };
      if (input.id)
        await db
          .update(websiteCaseStudies)
          .set(data as any)
          .where(eq(websiteCaseStudies.id, input.id));
      else
        await db
          .insert(websiteCaseStudies)
          .values({ ...data, createdById: ctx.user.id } as any);
      return { success: true };
    }),

  savePost: protectedProcedure
    .input(postInput)
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteBlog");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const data = {
        ...input,
        id: undefined,
        slug: cleanSlug(input.slug),
        category: input.category || "STR Investing",
        publishedAt: input.status === "published" ? new Date() : null,
        updatedById: ctx.user.id,
      };
      if (input.id)
        await db
          .update(websiteBlogPosts)
          .set(data as any)
          .where(eq(websiteBlogPosts.id, input.id));
      else
        await db
          .insert(websiteBlogPosts)
          .values({ ...data, createdById: ctx.user.id } as any);
      return { success: true };
    }),

  /**
   * Publish a property that already exists in SavvyOS to the public site.
   * Deliberately small: an agent gives it a headline and a status, everything
   * else comes from the property record. Admins can still refine it afterwards
   * in the Website Studio.
   */
  publishProperty: protectedProcedure
    .input(
      z.object({
        propertyId: z.number().int().positive(),
        headline: z.string().trim().max(255).nullable().optional(),
        summary: z.string().trim().max(2000).nullable().optional(),
        status: statusSchema.default("draft"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await requirePropertyPublishAccess(ctx, db, input.propertyId);

      const [property] = await db
        .select({
          id: properties.id,
          address: properties.address,
          city: properties.city,
          state: properties.state,
        })
        .from(properties)
        .where(eq(properties.id, input.propertyId))
        .limit(1);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

      const [existing] = await db
        .select({ id: websiteProperties.id, slug: websiteProperties.slug, status: websiteProperties.status })
        .from(websiteProperties)
        .where(eq(websiteProperties.propertyId, input.propertyId))
        .limit(1);

      const publishedAt = input.status === "published" ? new Date() : null;

      if (existing) {
        await db
          .update(websiteProperties)
          .set({
            status: input.status,
            ...(input.headline !== undefined ? { headline: input.headline || null } : {}),
            ...(input.summary !== undefined ? { summary: input.summary || null } : {}),
            ...(publishedAt ? { publishedAt } : {}),
            updatedById: ctx.user.id,
          })
          .where(eq(websiteProperties.id, existing.id));
        await logActivity({
          userId: ctx.user.id,
          action: "website_property_updated",
          entityType: "property",
          entityId: input.propertyId,
          details: { slug: existing.slug, status: input.status, previousStatus: existing.status },
        });
        return { id: existing.id, slug: existing.slug, status: input.status, created: false };
      }

      const base = cleanSlug(
        [property.address, property.city].filter(Boolean).join(" ") || `property-${property.id}`
      );
      const slug = await uniqueSlug(db, websiteProperties, base);

      const assignedAgentId = ctx.user.role === "agent" ? ctx.user.id : null;
      const result = await db.insert(websiteProperties).values({
        propertyId: input.propertyId,
        slug,
        status: input.status,
        headline: input.headline || null,
        summary: input.summary || null,
        assignedAgentId,
        publishedAt,
        galleryImageUrls: [],
        featureTags: [],
        investmentHighlights: [],
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      });
      const id = Number((result as any)[0]?.insertId);
      await logActivity({
        userId: ctx.user.id,
        action: "website_property_published",
        entityType: "property",
        entityId: input.propertyId,
        details: { slug, status: input.status, assignedAgentId },
      });
      return { id, slug, status: input.status, created: true };
    }),

  /** Whether the signed-in user may publish this property, and its current state. */
  /**
   * Remove a property from the website. This deletes only the websiteProperties
   * row: the SavvyOS property record, and anything hanging off it, is untouched.
   * Without this there was no way to undo a publish, so a mistaken or test entry
   * stayed in the studio forever.
   */
  unpublishProperty: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteProperties");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db
        .select({ id: websiteProperties.id, propertyId: websiteProperties.propertyId })
        .from(websiteProperties)
        .where(eq(websiteProperties.id, input.id))
        .limit(1);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That website property no longer exists.",
        });
      }
      await db.delete(websiteProperties).where(eq(websiteProperties.id, input.id));
      return { removedPropertyId: existing.propertyId };
    }),

  propertyPublishState: protectedProcedure
    .input(z.object({ propertyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { canPublish: false, website: null };
      let canPublish = false;
      if (ctx.user?.role === "admin") {
        canPublish = await canAdminUsePermission(ctx.user, "canManageWebsiteProperties");
      } else if (ctx.user?.role === "agent") {
        canPublish = await agentOwnsProperty(db, ctx.user.id, input.propertyId);
      }
      const [website] = await db
        .select({
          id: websiteProperties.id,
          slug: websiteProperties.slug,
          status: websiteProperties.status,
          headline: websiteProperties.headline,
          summary: websiteProperties.summary,
        })
        .from(websiteProperties)
        .where(eq(websiteProperties.propertyId, input.propertyId))
        .limit(1);
      return { canPublish, website: website ?? null };
    }),

  /**
   * Website presence for one SavvyOS agent, read from their own record rather
   * than the studio's list. Lets the agent profile page show whether they are
   * on the public site without a second place to look.
   */
  agentPublishState: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { canManage: false, profile: null, publishedProperties: 0 };
      const canManage =
        ctx.user?.role === "admin" &&
        (await canAdminUsePermission(ctx.user, "canManageWebsiteAgents"));
      const [profile] = await db
        .select({
          id: websiteAgentProfiles.id,
          slug: websiteAgentProfiles.slug,
          status: websiteAgentProfiles.status,
          headline: websiteAgentProfiles.headline,
          isFeatured: websiteAgentProfiles.isFeatured,
        })
        .from(websiteAgentProfiles)
        .where(eq(websiteAgentProfiles.userId, input.userId))
        .limit(1);
      const [counts] = await db
        .select({ total: sql<number>`count(*)` })
        .from(websiteProperties)
        .where(
          and(
            eq(websiteProperties.assignedAgentId, input.userId),
            eq(websiteProperties.status, "published")
          )
        );
      return {
        canManage,
        profile: profile ?? null,
        publishedProperties: Number(counts?.total || 0),
      };
    }),

  /** Put a SavvyOS agent on the public site, or change their visibility. */
  publishAgent: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        status: statusSchema.default("draft"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteAgents");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [agent] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });

      const [existing] = await db
        .select({ id: websiteAgentProfiles.id, slug: websiteAgentProfiles.slug })
        .from(websiteAgentProfiles)
        .where(eq(websiteAgentProfiles.userId, input.userId))
        .limit(1);

      if (existing) {
        await db
          .update(websiteAgentProfiles)
          .set({ status: input.status, updatedById: ctx.user.id })
          .where(eq(websiteAgentProfiles.id, existing.id));
        await logActivity({
          userId: ctx.user.id,
          action: "website_agent_updated",
          entityType: "user",
          entityId: input.userId,
          details: { slug: existing.slug, status: input.status },
        });
        return { slug: existing.slug, status: input.status, created: false };
      }

      const [coreProfile] = await db
        .select({
          photo: userProfiles.profilePhotoUrl,
          phone: userProfiles.primaryPhone,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, input.userId))
        .limit(1);

      const slug = await uniqueSlug(db, websiteAgentProfiles, cleanSlug(agent.name || `agent-${agent.id}`));
      await db.insert(websiteAgentProfiles).values({
        userId: input.userId,
        slug,
        status: input.status,
        imageUrl: coreProfile?.photo ?? null,
        publicEmail: agent.email ?? null,
        publicPhone: coreProfile?.phone ?? null,
        markets: [],
        specialties: [],
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      });
      await logActivity({
        userId: ctx.user.id,
        action: "website_agent_published",
        entityType: "user",
        entityId: input.userId,
        details: { slug, status: input.status },
      });
      return { slug, status: input.status, created: true };
    }),

  saveSettings: protectedProcedure
    .input(settingsInput)
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const data = {
        ...input,
        contactEmail: input.contactEmail || null,
        updatedById: ctx.user.id,
      };
      const current = await db
        .select({ id: websiteSiteSettings.id })
        .from(websiteSiteSettings)
        .where(eq(websiteSiteSettings.singletonKey, "primary"))
        .limit(1);
      if (current[0])
        await db
          .update(websiteSiteSettings)
          .set(data)
          .where(eq(websiteSiteSettings.id, current[0].id));
      else
        await db
          .insert(websiteSiteSettings)
          .values({
            singletonKey: "primary",
            siteName: "Savvy STR Agents",
            ...data,
          });
      return { success: true };
    }),
});
