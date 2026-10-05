import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, like, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentConnections,
  agentProfiles,
  contacts,
  marketProfiles,
  marketZipCodes,
  proformas,
  properties,
  userProfiles,
  users,
  websiteAgentProfiles,
  websiteBlogPosts,
  websiteCaseStudies,
  websiteContentViews,
  websiteFeaturedListings,
  websiteLeads,
  websiteLeadAttempts,
  websitePages,
  websiteProperties,
  websiteSiteSettings,
  websiteTeamMembers,
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
import { sendEmailAlert } from "../_core/emailAlerts";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { normalizeBookingLink } from "@shared/bookingLink";
import { notifyMobileUsers } from "../mobileNotifications";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { canAdminUsePermission, type PermissionKey } from "./permissions";
import {
  clientIpFrom,
  fillMissingDays,
  summarize,
  viewDateKey,
  visitorHash,
  type ContentKind,
  type DailyViewRow,
} from "../websiteContentViews";
import {
  publicComps,
  publicRevenueRange,
  type PublicComp,
} from "../proformaPublicFigures";
import { accountFromRequest } from "../_core/websiteAccountAuth";
import { staffFromRequest } from "../staffWebsiteHandoff";
import { gateEvidence, gateProperties, gateProperty } from "../websiteGating";
import {
  PUBLIC_MARKET_STATUSES,
  filterableMarkets,
  marketDirectory,
  marketZipSet,
  zipInMarket,
} from "../publicMarketDirectory";
import { publishedTestimonials } from "@shared/websiteTestimonials";
import { readLinkForwarding, saveLinkForwarding } from "../websiteLinkForwarding";
import { normalizeTeamMember, publishedTeam } from "@shared/websiteTeam";
import { SELLER_LEAD_TAG } from "@shared/websiteSellerLead";
import { missingForPublish, publishBlockedMessage } from "@shared/websitePublishChecklist";
import { nextPublishedAt, ownsCaseStudy, ownsPost } from "@shared/websiteContentOwnership";
import { cleanTags } from "@shared/websiteContentFilters";
import { EDITABLE_PAGE_SLUGS } from "@shared/websiteEditablePages";
import {
  analyzeDailyEmailWithAi,
  getDailyEmailSettings,
  loadDailyEmailAnalytics,
  loadQueue as loadDailyEmailQueue,
  masterSwitchOn as dailyEmailMasterSwitchOn,
  previewDailyEmail,
  runDailyEmail,
  saveDailyEmailSettings,
  sendTestDailyEmail,
  setApproval as setDailyEmailApproval,
} from "../websiteDailyEmail";
import { listResendSegments } from "../_core/resendMarketingBroadcast";
import { getSignupSegmentId, saveSignupSegmentId } from "../websiteSignupAudience";
import { moveWebsiteImages } from "../websiteImageRehost";
import { ZillowLookupInputError, extractZillowDescription, extractZillowPhotoUrls, fetchAddressSuggestions, fetchZillowListing } from "../externalApis";
import { allowSeoWrite, writeSeoText } from "../websiteSeoWriter";
import { saveCaseStudySeo, withCaseStudySeo } from "../websiteCaseStudySeo";
import { importOldSiteListings, importedListingCounts, publishReadyImportedListings } from "../oldSiteListingImport";

/** A zillow.com listing link, normalised, or null for anything else. */
function zillowLinkOf(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (host !== "zillow.com" && !host.endsWith(".zillow.com")) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}
import {
  loadRecentPriceDrops,
  priceDropAlertsEnabled,
  sendPriceDropTest,
  setPriceDropAlertsEnabled,
} from "../websitePriceDropAlerts";
import {
  adAttributionUpdates,
  campaignSourceFrom,
  readAdAttribution,
  isPaidAttribution,
} from "@shared/adAttribution";
import { resolveOrganicSocialLeadSourceId } from "../organicSocialLeadSources";
import { websiteLeadSourceId } from "../websiteLeadSources";
import { websiteFormLeadSource } from "@shared/websiteLeadSources";
import { triggerSmartPlansForContact } from "../smartPlanScheduler";
import { recordWebsiteRequestActivity } from "../websiteActivity";

/**
 * Whether the visitor making this request has an investor account session.
 *
 * Deliberately narrow: it answers yes or no and nothing else. The public
 * procedures below need to know how much of a listing to hand over, not who is
 * asking, and giving them the account would invite them to start filtering on
 * it. Returns false on any failure, so a broken session shows the public view
 * rather than an error page.
 */
/**
 * Whether a Savvy team member is signed in on the website (staff session).
 * Lets the team open Draft listings, case studies and posts at their future
 * address before publishing. False on any failure, so the public view wins.
 */
async function visitorIsStaff(req: unknown): Promise<boolean> {
  try {
    return (await staffFromRequest(req as any)) != null;
  } catch {
    return false;
  }
}

async function visitorIsSignedIn(req: unknown): Promise<boolean> {
  try {
    // Savvy staff signed in on the website see the figures too.
    return (
      (await accountFromRequest(req as any)) != null ||
      (await staffFromRequest(req as any)) != null
    );
  } catch {
    return false;
  }
}

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

const WEBSITE_REQUEST_LABELS: Record<string, string> = {
  showing: "Showing request",
  analysis: "Deeper analysis request",
  financing: "Financing request",
};

/**
 * Tell the agent a website inquiry just landed in their pipeline: the same
 * "lead assigned" email and phone notification as a lead assigned inside
 * SavvyOS. A repeat inquiry from someone already in their pipeline gets the
 * phone notification only, since the lead is not new.
 *
 * Fire and forget: the visitor's form must never wait on, or fail because
 * of, an email to the agent.
 */
function alertAgentOfWebsiteInquiry(params: {
  agentId: number;
  contactId: number;
  connectionId: number | null;
  isNewLead: boolean;
  contactName: string;
  requestType: string | null;
  intent: string;
  message: string | null;
  propertyAddress: string | null;
}): void {
  const request = params.requestType ? WEBSITE_REQUEST_LABELS[params.requestType] : null;
  const what = request ?? "Website inquiry";
  const notes = [
    params.propertyAddress ? `${what} for ${params.propertyAddress}.` : `${what}.`,
    params.message ? `Message: ${params.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  if (params.isNewLead) {
    void sendEmailAlert("lead_assigned", params.agentId, {
      connectionId: params.connectionId,
      contactId: params.contactId,
      contactName: params.contactName,
      notes,
      leadSourceLabel: request ? `Savvy website › ${request}` : "Savvy website",
      propertyAddress: params.propertyAddress ?? undefined,
    }).catch(error => console.warn("[Website] Lead alert email failed.", error));
  }
  void notifyMobileUsers([params.agentId], {
    title: params.isNewLead ? "New website lead" : "New website inquiry",
    body: [params.contactName, params.propertyAddress].filter(Boolean).join(" · "),
    data: {
      path: "/leads",
      connectionId: params.connectionId,
      contactId: params.contactId,
    },
  }).catch(error => console.warn("[Website] Lead push failed.", error));
}

const HANDOFF_EMAIL_TYPES = {
  showing: "website_showing_request",
  analysis: "website_deeper_analysis_request",
  financing: "website_financing_request",
} as const;

/**
 * The client handoff the old site sent for a showing, deeper analysis or
 * financing request: one email to the agent with the visitor copied in, so
 * the two are introduced and can reply to each other. Same email types and
 * wording as the old site's handoff, including the agent's booking link.
 *
 * Fire and forget, like the agent alert: the visitor's form never waits on
 * it or fails because of it.
 */
function sendWebsiteHandoffEmail(
  db: any,
  params: {
    agentId: number;
    contactId: number;
    propertyId: number;
    requestType: keyof typeof HANDOFF_EMAIL_TYPES;
    contactName: string;
    contactEmail: string;
    propertyAddress: string | null;
  }
): void {
  void (async () => {
    const [agent] = await db
      .select({
        name: users.name,
        email: users.email,
        callBookingLink: users.callBookingLink,
      })
      .from(users)
      .where(eq(users.id, params.agentId))
      .limit(1);
    if (!agent?.email) return;
    const [listing] = await db
      .select({ slug: websiteProperties.slug })
      .from(websiteProperties)
      .where(eq(websiteProperties.propertyId, params.propertyId))
      .limit(1);
    const agentEmail = String(agent.email).trim().toLowerCase();
    const type = HANDOFF_EMAIL_TYPES[params.requestType];
    const delivery = await sendTransactionalEmail(
      type,
      {
        recipientEmail: agent.email,
        recipientName: agent.name ?? undefined,
        ccEmails: agentEmail !== params.contactEmail ? [params.contactEmail] : undefined,
        agentName: agent.name ?? undefined,
        contactName: params.contactName,
        propertyAddress: params.propertyAddress ?? "the requested property",
        propertyUrl: listing?.slug
          ? `https://home.savvy-agents.com/newsite/properties/${encodeURIComponent(listing.slug)}`
          : undefined,
        agentBookingLink: normalizeBookingLink(agent.callBookingLink) ?? undefined,
      },
      {
        // Two recipients, so never turn a SavvyOS link into a token owned by
        // one of them; keep the request wording and the booking button.
        injectMagicLinks: false,
        allowTemplateOverride: false,
        idempotencyKey: `savvyos-website-handoff:${type}:${params.contactId}:${params.propertyId}:${params.agentId}`,
      }
    );
    if (!delivery.sent) {
      console.warn(
        `[Website] Handoff email not sent (contact ${params.contactId}, agent ${params.agentId}): ${delivery.reason ?? "unknown reason"}`
      );
    }
  })().catch(error => console.warn("[Website] Handoff email failed.", error));
}

/** Public address lookups: 40 a minute per visitor, 400 a minute in all. */
const ADDRESS_LOOKUPS_PER_VISITOR = 40;
const ADDRESS_LOOKUPS_OVERALL = 400;
const addressLookups = new Map<string, number[]>();
let addressLookupsOverall: number[] = [];
export function allowAddressLookup(visitorKey: string, now = Date.now()): boolean {
  const fresh = (times: number[]) => times.filter(at => now - at < 60_000);
  addressLookupsOverall = fresh(addressLookupsOverall);
  const mine = fresh(addressLookups.get(visitorKey) ?? []);
  if (mine.length >= ADDRESS_LOOKUPS_PER_VISITOR || addressLookupsOverall.length >= ADDRESS_LOOKUPS_OVERALL) {
    addressLookups.set(visitorKey, mine);
    return false;
  }
  mine.push(now);
  addressLookups.set(visitorKey, mine);
  addressLookupsOverall.push(now);
  if (addressLookups.size > 5000) addressLookups.clear();
  return true;
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

/**
 * Addresses the public site already serves from code.
 *
 * The router matches these before it falls through to the CMS, so a page saved
 * at one of them would look published in the studio and never appear on the
 * site. Kept here rather than in the UI so the rule holds however the save is
 * called.
 */
export const RESERVED_PAGE_SLUGS = new Set([
  "properties",
  "agents",
  "case-studies",
  "resources",
  "about",
  "contact",
  "markets",
  "join-our-team",
  "sign-in",
  "sign-up",
  "forgot-password",
  "reset-password",
  "account",
]);

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

/**
 * The publish date a Website Studio save should store.
 *
 * Before this, every save of a published post or case study stamped "now",
 * so fixing a typo made a March article look new, and a draft had its date
 * wiped. Now: a date the admin typed wins (used to carry the old site's dates
 * over); otherwise the first publish stamps it and later saves keep it.
 */
function studioPublishedAt(
  status: "draft" | "published" | "archived",
  typed: string | null | undefined,
  existing: Date | string | null | undefined
): Date | null {
  if (typed) {
    const parsed = new Date(typed);
    if (Number.isNaN(parsed.getTime())) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Publish date is not a valid date." });
    }
    if (parsed.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Publish date cannot be in the future." });
    }
    return parsed;
  }
  return nextPublishedAt(status, existing);
}

/**
 * Who may write case studies and blog posts from their own side of SavvyOS:
 * active agents, and admins (who can also use Website Studio). Anyone else,
 * such as an ISA or a partner login, cannot.
 */
function requireContentAuthor(ctx: any) {
  const role = ctx.user?.role;
  if ((role !== "agent" && role !== "admin") || ctx.user?.isActive === false) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only agents can add case studies and blog posts.",
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
 * How a user may act on one property's website listing:
 *   "manager"  an admin with the Website properties permission (any property)
 *   "owner"    an agent, or an admin without that permission, on a property
 *              they added or hold a listing or transaction on
 *   null       no access
 * Admins used to have only the permission route, so an admin who also lists
 * homes could not publish their own listing without being given the whole
 * book. They now fall back to the same ownership rule as agents.
 */
export async function propertyWebsiteAccess(
  ctx: any,
  db: any,
  propertyId: number
): Promise<"manager" | "owner" | null> {
  const user = ctx.user;
  if (!user || user.isActive === false) return null;
  if (user.role === "admin" && (await canAdminUsePermission(user, "canManageWebsiteProperties"))) {
    return "manager";
  }
  if ((user.role === "agent" || user.role === "admin") && (await agentOwnsProperty(db, user.id, propertyId))) {
    return "owner";
  }
  return null;
}

/**
 * Publishing gate for a single property. Admins with the permission reach
 * every property; agents, and admins without it, only the ones they own.
 */
async function requirePropertyPublishAccess(ctx: any, db: any, propertyId: number) {
  const access = await propertyWebsiteAccess(ctx, db, propertyId);
  if (access) return access;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You can only publish properties you added or are working on.",
  });
}

/**
 * Who may edit an agent's public profile. Admins keep the permission-based
 * route; an agent may always edit their own, which is the point of moving the
 * profile onto the agent page.
 */
async function requireAgentProfileAccess(ctx: any, userId: number) {
  // Everyone may edit their own profile, admins included.
  if (ctx.user?.id === userId) return;
  if (ctx.user?.role === "admin") {
    await requireWebsitePermission(ctx, "canManageWebsiteAgents");
    return;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You can only edit your own website profile.",
  });
}

async function canEditAgentProfile(ctx: any, userId: number) {
  if (ctx.user?.id === userId) return true;
  if (ctx.user?.role === "admin") {
    return canAdminUsePermission(ctx.user, "canManageWebsiteAgents");
  }
  return ctx.user?.id === userId;
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
  agentBlurb: nullableText,
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

/**
 * Which investor numbers to store when a pro-forma is attached.
 *
 * The rule is "blank inherits, typed wins": a field the author left empty is
 * filled from the pro-forma, and a number they actually entered is kept even
 * when it disagrees with the pro-forma. Without this an author could not
 * override a single figure without detaching the pro-forma entirely.
 *
 * Values come back as strings because that is how decimals are stored.
 */
export function proformaMetrics(
  entered: {
    projectedRevenue?: number | null;
    cashOnCash?: number | null;
    capRate?: number | null;
  },
  proforma: {
    grossRevenue: string | null;
    cashOnCash: string | null;
    capRate: string | null;
  } | null
): { projectedRevenue: string | null; cashOnCash: string | null; capRate: string | null } {
  const asText = (value: number | null | undefined) =>
    value == null ? null : String(value);
  if (!proforma) {
    return {
      projectedRevenue: asText(entered.projectedRevenue),
      cashOnCash: asText(entered.cashOnCash),
      capRate: asText(entered.capRate),
    };
  }
  return {
    projectedRevenue:
      entered.projectedRevenue == null
        ? proforma.grossRevenue
        : asText(entered.projectedRevenue),
    cashOnCash:
      entered.cashOnCash == null ? proforma.cashOnCash : asText(entered.cashOnCash),
    capRate: entered.capRate == null ? proforma.capRate : asText(entered.capRate),
  };
}

/**
 * The website-only half of a property. The SavvyOS property record owns the
 * address, beds, baths and price, so none of those appear here: this is the
 * public presentation layer that used to live in the Website Studio's
 * Properties tab, now edited on the property itself.
 */
const propertyWebsiteContentInput = z.object({
  propertyId: z.number().int().positive(),
  slug: z.string().trim().min(3).max(255).optional(),
  status: statusSchema.default("draft"),
  sourceProformaId: z.number().int().positive().nullable().optional(),
  // The listing's own Zillow page, remembered for "Import photos from Zillow".
  sourceUrl: nullableText,
  assignedAgentId: z.number().int().positive().nullable().optional(),
  headline: nullableText,
  summary: nullableText,
  agentBlurb: nullableText,
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
  // No longer on the form (homepage order is most recently featured). Kept
  // optional so an older open tab still saves; ignored when absent.
  sortOrder: z.number().int().optional(),
  // Sent by the form's auto-save. An auto-save only ever writes a draft.
  autosave: z.boolean().optional(),
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
  investmentAmount: z.number().nonnegative().max(1e11).nullable().optional(),
  // Optional. Blank means Google gets the title and the excerpt, as before.
  // Left out entirely by an older open tab, which then changes nothing.
  metaTitle: z.string().trim().max(255).nullable().optional(),
  metaDescription: z.string().trim().max(2000).nullable().optional(),
  /** Admins only (Website Studio): the date shown as published. */
  publishedAt: z.string().trim().max(40).nullable().optional(),
  status: statusSchema.default("draft"),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

/** Whether the form sent the case study's meta fields at all. */
const sentCaseStudySeo = (input: { metaTitle?: string | null; metaDescription?: string | null }) =>
  input.metaTitle !== undefined || input.metaDescription !== undefined;

const postInput = z.object({
  id: z.number().int().positive().optional(),
  slug: z.string().trim().min(2).max(255),
  title: z.string().trim().min(3).max(512),
  excerpt: nullableText,
  body: nullableText,
  coverImageUrl: nullableText,
  category: nullableText,
  tags: z.array(z.string().max(80)).max(60).optional(),
  authorUserId: z.number().int().positive().nullable().optional(),
  status: statusSchema.default("draft"),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  metaTitle: nullableText,
  metaDescription: nullableText,
  /** Admins only (Website Studio): the date shown as published. */
  publishedAt: z.string().trim().max(40).nullable().optional(),
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
      title: z.string().optional(),
      location: z.string().optional(),
      published: z.boolean().optional(),
      // Rows saved before the rename still carry `role`. Accepted so an
      // untouched row round-trips rather than failing validation on save.
      role: z.string().optional(),
    })
  ),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  contactPhone: nullableText,
  footerText: nullableText,
});

/**
 * Every public market with its ZIP territory size and published property count.
 *
 * One loader for both callers: the markets page shows all of it, the property
 * filter shows the subset that would return something. Keeping it in one place
 * is what stops the page and the filter from having different ideas about what
 * a market contains.
 */
async function loadMarketDirectory(db: any) {
  const [markets, assignments, published] = await Promise.all([
    db
      .select({
        id: marketProfiles.id,
        name: marketProfiles.name,
        state: marketProfiles.state,
        status: marketProfiles.status,
      })
      .from(marketProfiles),
    db
      .select({
        zipCode: marketZipCodes.zipCode,
        marketProfileId: marketZipCodes.marketProfileId,
      })
      .from(marketZipCodes),
    db
      .select({ zip: properties.zip })
      .from(websiteProperties)
      .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
      .where(eq(websiteProperties.status, "published")),
  ]);
  return marketDirectory(markets, assignments, published);
}

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
  agentBlurb: websiteProperties.agentBlurb,
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

/** How many featured listings the homepage shows. Older ones drop off. */
export const HOMEPAGE_FEATURED_LIMIT = 6;

/**
 * The homepage's featured listings: most recently featured first, capped at
 * HOMEPAGE_FEATURED_LIMIT. No manual order (call with Tyler, 1 Oct).
 * If website_featured_listings is missing, falls back to newest published,
 * so the homepage never fails over the ordering.
 */
async function homepageFeaturedListings(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const query = () =>
    db
      .select(propertyProjection)
      .from(websiteProperties)
      .innerJoin(properties, eq(websiteProperties.propertyId, properties.id))
      .leftJoin(users, eq(websiteProperties.assignedAgentId, users.id))
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .leftJoin(websiteAgentProfiles, eq(users.id, websiteAgentProfiles.userId));
  const featured = and(eq(websiteProperties.status, "published"), eq(websiteProperties.isFeatured, true));
  try {
    return await query()
      .leftJoin(websiteFeaturedListings, eq(websiteFeaturedListings.websitePropertyId, websiteProperties.id))
      .where(featured)
      .orderBy(desc(websiteFeaturedListings.featuredAt), desc(websiteProperties.publishedAt))
      .limit(HOMEPAGE_FEATURED_LIMIT);
  } catch (error) {
    console.error("[website] featured order unavailable, using publish date:", error);
    return query().where(featured).orderBy(desc(websiteProperties.publishedAt)).limit(HOMEPAGE_FEATURED_LIMIT);
  }
}

/** Stamp or clear when a listing was featured. Never fails the save it rides on. */
async function recordFeatured(db: any, websitePropertyId: number, wasFeatured: boolean, isFeatured: boolean) {
  if (wasFeatured === isFeatured) return;
  try {
    if (isFeatured) {
      await db
        .insert(websiteFeaturedListings)
        .values({ websitePropertyId, featuredAt: new Date() })
        .onDuplicateKeyUpdate({ set: { featuredAt: new Date() } });
    } else {
      await db.delete(websiteFeaturedListings).where(eq(websiteFeaturedListings.websitePropertyId, websitePropertyId));
    }
  } catch (error) {
    console.error("[website] could not record the featured date:", error);
  }
}

async function getPublishedHome(signedIn: boolean) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [settingsRows, propertyRows, agentRows, caseRows, postRows] =
    await Promise.all([
      db
        .select()
        .from(websiteSiteSettings)
        .where(eq(websiteSiteSettings.singletonKey, "primary"))
        .limit(1),
      homepageFeaturedListings(db),
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
          tags: websiteBlogPosts.tags,
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
    properties: gateProperties(propertyRows, signedIn),
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

/**
 * The procedures the public website host may call.
 *
 * `home.savvy-agents.com` rejects every tRPC path that is not in here, before
 * the request reaches a router. That is worth keeping: it means an admin
 * procedure cannot be reached from the public host even if something else
 * goes wrong. The cost is that adding a `publicProcedure` to this router is
 * only half the work, and forgetting the other half fails in the one place
 * nobody is looking — the procedure works in development and on the admin
 * host, and 404s only on the public site.
 *
 * `websitePublicProcedureAllowlist.test.ts` pins both directions, so the next
 * public procedure cannot be added without a decision being made here.
 */
export const WEBSITE_PUBLIC_TRPC_PATHS = new Set([
  "website.publicHome",
  "website.publicSettings",
  "website.publicProperties",
  "website.publicPropertyFacets",
  "website.publicProperty",
  "website.publicPropertyEvidence",
  "website.publicPage",
  "website.publicMarkets",
  "website.publicMarketDirectory",
  "website.publicAgents",
  "website.publicAgent",
  "website.publicCaseStudies",
  "website.publicCaseStudy",
  "website.publicPosts",
  "website.publicPost",
  "website.recordArticleView",
  "website.submitLead",
  "website.publicTeamMembers",
  "website.publicAddressSuggestions",
]);

export const websiteRouter = router({
  publicHome: publicProcedure.query(async ({ ctx }) =>
    getPublishedHome(await visitorIsSignedIn(ctx.req))
  ),

  publicSettings: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(websiteSiteSettings).where(eq(websiteSiteSettings.singletonKey, "primary")).limit(1);
    const settings = rows[0];
    if (!settings) return null;
    // Drafts are filtered here rather than in the page, so an unpublished
    // testimonial never leaves the server and cannot be read out of the
    // network response.
    return {
      ...settings,
      testimonials: publishedTestimonials(settings.testimonials),
    };
  }),

  /**
   * The Meet the Team page's people. Published rows only, filtered on the
   * server so a draft never leaves it. The table is created at startup; if it
   * is somehow missing the page shows no people rather than an error.
   */
  publicTeamMembers: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      const rows = await db
        .select()
        .from(websiteTeamMembers)
        .where(eq(websiteTeamMembers.status, "published"))
        .orderBy(asc(websiteTeamMembers.sortOrder), asc(websiteTeamMembers.name));
      return publishedTeam(rows).map(({ status: _status, ...row }) => row);
    } catch (error) {
      console.error("[website.publicTeamMembers]", error);
      return [];
    }
  }),

  publicProperties: publicProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(200).optional(),
          agentSlug: z.string().optional(),
          marketId: z.number().int().positive().optional(),
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const signedIn = await visitorIsSignedIn(ctx.req);
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
                  // "Featured first": featured listings, then the rest, newest first.
                  desc(websiteProperties.isFeatured),
                  desc(websiteProperties.publishedAt),
                ];

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
        .where(and(...conditions))
        .orderBy(...order);

      // The market filter runs here rather than in the SQL above, so that a
      // property is placed by the same ZIP rule the daily investor email uses.
      // Pushing it into the query would mean a second rule written in SQL, and
      // the two would drift on the first ZIP+4 anybody imports.
      const scoped =
        input?.marketId == null
          ? rows
          : await (async () => {
              const territory = marketZipSet(
                await db
                  .select({
                    zipCode: marketZipCodes.zipCode,
                    marketProfileId: marketZipCodes.marketProfileId,
                  })
                  .from(marketZipCodes)
                  .where(eq(marketZipCodes.marketProfileId, input.marketId!))
              );
              // A market with no territory drawn yet matches nothing. Returning
              // everything would be worse: the visitor would believe they were
              // looking at one market.
              return rows.filter(row => zipInMarket(row.zip, territory));
            })();

      return gateProperties(scoped, signedIn);
    }),

  /**
   * The values worth offering as filters, derived from what is actually
   * published. Offering a market or a price band that matches nothing is worse
   * than offering no filter at all, so the UI builds its controls from this.
   */
  publicPropertyFacets: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db)
      return {
        markets: [],
        states: [],
        cities: [],
        propertyTypes: [],
        priceRange: null,
      };
    const markets = filterableMarkets(await loadMarketDirectory(db));
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
      markets,
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const signedIn = await visitorIsSignedIn(ctx.req);
      // Savvy team members signed in on the website can open a Draft listing
      // at its future address, to check it before publishing. Everyone else
      // still gets "not found" for anything that isn't published.
      let isStaff = false;
      try {
        isStaff = (await staffFromRequest(ctx.req as any)) != null;
      } catch {
        isStaff = false;
      }
      const rows = await db
        .select({ ...propertyProjection, listingStatus: websiteProperties.status })
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
            isStaff
              ? inArray(websiteProperties.status, ["published", "draft"])
              : eq(websiteProperties.status, "published")
          )
        )
        .limit(1);
      return rows[0] ? gateProperty(rows[0], signedIn) : null;
    }),

  /**
   * The investor evidence behind a published listing: a revenue range and the
   * comparable listings that support it, read live from the pro-forma the
   * admin linked on the property's Website tab.
   *
   * Three gates stand between a pro-forma and this output, and each exists
   * because the result is shown to people deciding where to put money:
   *
   * 1. The property must be published. A draft listing publishes nothing.
   * 2. The pro-forma must be final. A draft pro-forma is someone's
   *    work in progress, and half-entered numbers must never reach the public.
   * 3. The pro-forma must be the one linked to this property. Reading any
   *    other would attach one property's numbers to another's address.
   *
   * Returns nulls rather than zeros when there is nothing to show, so the page
   * can omit the section instead of publishing an empty claim.
   */
  publicPropertyEvidence: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input, ctx }) => {
      const empty = {
        revenue: null as ReturnType<typeof publicRevenueRange>,
        comps: [] as PublicComp[],
        gated: false,
      };
      const db = await getDb();
      if (!db) return empty;
      const signedIn = await visitorIsSignedIn(ctx.req);
      // The team's Draft preview shows the full page, evidence included, so a
      // listing can be checked before it goes live. The pro-forma must still
      // be Final: half-entered numbers never show, even in a preview.
      const isStaff = await visitorIsStaff(ctx.req);

      const [listing] = await db
        .select({
          propertyId: websiteProperties.propertyId,
          sourceProformaId: websiteProperties.sourceProformaId,
        })
        .from(websiteProperties)
        .where(
          and(
            eq(websiteProperties.slug, input.slug),
            isStaff
              ? inArray(websiteProperties.status, ["published", "draft"])
              : eq(websiteProperties.status, "published")
          )
        )
        .limit(1);
      if (!listing?.sourceProformaId) return empty;

      const [proforma] = await db
        .select({ formData: proformas.formData, status: proformas.status })
        .from(proformas)
        .where(
          and(
            eq(proformas.id, listing.sourceProformaId),
            eq(proformas.propertyId, listing.propertyId),
            eq(proformas.status, "final")
          )
        )
        .limit(1);
      if (!proforma) return empty;

      return gateEvidence(
        {
          revenue: publicRevenueRange(proforma.formData),
          comps: publicComps(proforma.formData),
        },
        signedIn
      );
    }),

  // ─── Article reads ─────────────────────────────────────────────────────────

  /**
   * Record that somebody opened a blog post or case study.
   *
   * Fire and forget from the reader's point of view: it always reports success
   * and never throws, because a counter failing must not put an error in front
   * of somebody reading an article.
   */
  recordArticleView: publicProcedure
    .input(
      z.object({
        kind: z.enum(["post", "case_study"]),
        contentId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) return { ok: false };
        const req: any = ctx.req;
        const dateKey = viewDateKey(new Date());
        const hash = visitorHash({
          ip: clientIpFrom(req?.headers?.["x-forwarded-for"], req?.socket?.remoteAddress),
          userAgent: req?.headers?.["user-agent"],
          kind: input.kind as ContentKind,
          contentId: input.contentId,
          dateKey,
          secret: process.env.JWT_SECRET || "",
        });

        await db
          .insert(websiteContentViews)
          .values({
            contentKind: input.kind,
            contentId: input.contentId,
            dateKey,
            visitorHash: hash,
            viewCount: 1,
          })
          .onDuplicateKeyUpdate({
            set: {
              viewCount: sql`${websiteContentViews.viewCount} + 1`,
              lastViewedAt: new Date(),
            },
          });
        return { ok: true };
      } catch (error) {
        console.error("[WebsiteContentViews] Failed to record view:", error);
        return { ok: false };
      }
    }),

  /**
   * Read counts per article, for the studio.
   *
   * Returns a total and a daily series with the quiet days filled in, so a
   * chart shows a flat stretch rather than skipping it and making four slow
   * days look like one busy one.
   */
  contentViewStats: protectedProcedure
    .input(
      z
        .object({ days: z.number().int().min(1).max(365).default(30) })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx);
      const db = await getDb();
      if (!db) return { from: "", to: "", articles: [] };

      const windowDays = input?.days ?? 30;
      const to = viewDateKey(new Date());
      const fromDate = new Date();
      fromDate.setUTCDate(fromDate.getUTCDate() - (windowDays - 1));
      const from = viewDateKey(fromDate);

      const rows = await db
        .select({
          contentKind: websiteContentViews.contentKind,
          contentId: websiteContentViews.contentId,
          dateKey: websiteContentViews.dateKey,
          views: sql<number>`SUM(${websiteContentViews.viewCount})`,
          readers: sql<number>`COUNT(*)`,
        })
        .from(websiteContentViews)
        .where(gte(websiteContentViews.dateKey, from))
        .groupBy(
          websiteContentViews.contentKind,
          websiteContentViews.contentId,
          websiteContentViews.dateKey
        );

      const byArticle = new Map<string, DailyViewRow[]>();
      for (const row of rows) {
        const key = `${row.contentKind}:${row.contentId}`;
        const list = byArticle.get(key) ?? [];
        list.push({
          dateKey: row.dateKey,
          views: Number(row.views) || 0,
          readers: Number(row.readers) || 0,
        });
        byArticle.set(key, list);
      }

      const [posts, cases] = await Promise.all([
        db
          .select({ id: websiteBlogPosts.id, title: websiteBlogPosts.title, slug: websiteBlogPosts.slug })
          .from(websiteBlogPosts),
        db
          .select({ id: websiteCaseStudies.id, title: websiteCaseStudies.title, slug: websiteCaseStudies.slug })
          .from(websiteCaseStudies),
      ]);

      const articles = [
        ...posts.map(post => ({ kind: "post" as const, ...post })),
        ...cases.map(item => ({ kind: "case_study" as const, ...item })),
      ].map(article => {
        const daily = byArticle.get(`${article.kind}:${article.id}`) ?? [];
        const summary = summarize(daily);
        return {
          kind: article.kind,
          id: article.id,
          title: article.title,
          slug: article.slug,
          views: summary.views,
          readers: summary.readers,
          days: fillMissingDays(summary.days, from, to),
        };
      });

      articles.sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
      return { from, to, articles };
    }),

  // ─── Content pages ─────────────────────────────────────────────────────────

  /**
   * One published content page, by slug.
   *
   * Returns null rather than throwing for an unknown slug, so the site can
   * show its own not-found page instead of an error.
   */
  publicPage: publicProcedure
    .input(z.object({ slug: z.string().trim().min(1).max(255) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [page] = await db
        .select({
          slug: websitePages.slug,
          name: websitePages.name,
          heroEyebrow: websitePages.heroEyebrow,
          heroTitle: websitePages.heroTitle,
          heroSubtitle: websitePages.heroSubtitle,
          bodyMarkdown: websitePages.bodyMarkdown,
          ctaText: websitePages.ctaText,
          ctaHref: websitePages.ctaHref,
          metaTitle: websitePages.metaTitle,
          metaDescription: websitePages.metaDescription,
        })
        .from(websitePages)
        .where(
          and(
            eq(websitePages.slug, cleanSlug(input.slug)),
            eq(websitePages.status, "published")
          )
        )
        .limit(1);
      return page ?? null;
    }),

  /** Every page in the CMS, for the studio dropdown. */
  adminPages: protectedProcedure.query(async ({ ctx }) => {
    await requireWebsitePermission(ctx);
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(websitePages)
      .orderBy(asc(websitePages.sortOrder), asc(websitePages.name));
  }),

  savePage: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        slug: z.string().trim().min(1).max(255),
        name: z.string().trim().min(1).max(160),
        status: statusSchema.default("draft"),
        heroEyebrow: nullableText,
        heroTitle: nullableText,
        heroSubtitle: nullableText,
        bodyMarkdown: nullableText,
        ctaText: nullableText,
        ctaHref: nullableText,
        metaTitle: nullableText,
        metaDescription: nullableText,
        sortOrder: z.number().int().min(0).max(999).default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const slug = cleanSlug(input.slug);
      if (!slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That page address is empty once tidied up. Try another.",
        });
      }
      // A CMS page must never shadow a page that lives in code. The router
      // checks built-in routes first, so such a page would save cleanly, show
      // as published, and never appear. Refusing here is kinder than a page
      // that exists everywhere except on the website.
      // The exceptions are About, Contact and Join Our Team, which can be
      // replaced on purpose: the public router checks for a published CMS
      // version of those first, and falls back to the designed page.
      if (RESERVED_PAGE_SLUGS.has(slug) && !EDITABLE_PAGE_SLUGS.has(slug)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `"${slug}" is already a page on the site and cannot be used here.`,
        });
      }

      const data = {
        slug,
        name: input.name,
        status: input.status,
        heroEyebrow: input.heroEyebrow || null,
        heroTitle: input.heroTitle || null,
        heroSubtitle: input.heroSubtitle || null,
        bodyMarkdown: input.bodyMarkdown || null,
        ctaText: input.ctaText || null,
        ctaHref: input.ctaHref || null,
        metaTitle: input.metaTitle || null,
        metaDescription: input.metaDescription || null,
        sortOrder: input.sortOrder,
        updatedById: ctx.user.id,
      };

      if (input.id) {
        const [existing] = await db
          .select({ id: websitePages.id, publishedAt: websitePages.publishedAt })
          .from(websitePages)
          .where(eq(websitePages.id, input.id))
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Page not found." });
        }
        await db
          .update(websitePages)
          .set({
            ...data,
            // Stamped when it first goes live and then left alone, so a page
            // from March does not look new every time somebody fixes a typo.
            publishedAt:
              input.status === "published"
                ? (existing.publishedAt ?? new Date())
                : existing.publishedAt,
          })
          .where(eq(websitePages.id, input.id));
        await logActivity({
          userId: ctx.user.id,
          action: "website_page_updated",
          entityType: "website_page",
          entityId: input.id,
          details: { slug, status: input.status },
        });
        return { id: input.id, slug };
      }

      const [clash] = await db
        .select({ id: websitePages.id })
        .from(websitePages)
        .where(eq(websitePages.slug, slug))
        .limit(1);
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A page already uses that address.",
        });
      }

      const result = await db.insert(websitePages).values({
        ...data,
        publishedAt: input.status === "published" ? new Date() : null,
        createdById: ctx.user.id,
      });
      const id = Number((result as any)[0]?.insertId);
      await logActivity({
        userId: ctx.user.id,
        action: "website_page_created",
        entityType: "website_page",
        entityId: id,
        details: { slug, status: input.status },
      });
      return { id, slug };
    }),

  /**
   * The markets an investor can subscribe to in their email preferences.
   *
   * Only markets that are actually being worked. Offering someone a market
   * nobody covers is a subscription to an empty inbox.
   */
  publicMarkets: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: marketProfiles.id,
        name: marketProfiles.name,
        state: marketProfiles.state,
      })
      .from(marketProfiles)
      .where(
        inArray(marketProfiles.status, [...PUBLIC_MARKET_STATUSES] as any)
      )
      .orderBy(asc(marketProfiles.state), asc(marketProfiles.name));
  }),

  /**
   * The markets to show on the markets page and offer as a property filter.
   *
   * Separate from `publicMarkets`, which backs the subscription checkboxes in
   * email preferences and must keep listing every market somebody can ask to
   * hear about, territories drawn or not. This one describes what a visitor can
   * actually browse today, so it is limited to markets with ZIP territories and
   * carries the published property count for each.
   */
  publicMarketDirectory: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return loadMarketDirectory(db);
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
        investmentAmount: websiteCaseStudies.investmentAmount,
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      // Drafts open for signed-in Savvy staff only, as a preview.
      const isStaff = await visitorIsStaff(ctx.req);
      const rows = await db
        .select({
          id: websiteCaseStudies.id,
          contentStatus: websiteCaseStudies.status,
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
          investmentAmount: websiteCaseStudies.investmentAmount,
          propertyId: websiteCaseStudies.propertyId,
          agentUserId: websiteCaseStudies.agentUserId,
          publishedAt: websiteCaseStudies.publishedAt,
          agentName: users.name,
          agentSlug: websiteAgentProfiles.slug,
          // The agent's public card details, for the side panel. The same
          // fields the agent's own public profile already shows.
          agentImageUrl: websiteAgentProfiles.imageUrl,
          agentEmail: websiteAgentProfiles.publicEmail,
          agentPhone: websiteAgentProfiles.publicPhone,
          agentBookingUrl: websiteAgentProfiles.bookingUrl,
          agentHeadline: websiteAgentProfiles.headline,
          agentMarkets: websiteAgentProfiles.markets,
          agentProfileStatus: websiteAgentProfiles.status,
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
            isStaff
              ? inArray(websiteCaseStudies.status, ["published", "draft"])
              : eq(websiteCaseStudies.status, "published")
          )
        )
        .limit(1);
      const row = rows[0];
      return row ? { ...row, agentBookingUrl: normalizeBookingUrl(row.agentBookingUrl) } : null;
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
        tags: websiteBlogPosts.tags,
        publishedAt: websiteBlogPosts.publishedAt,
        isFeatured: websiteBlogPosts.isFeatured,
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
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      // Drafts open for signed-in Savvy staff only, as a preview.
      const isStaff = await visitorIsStaff(ctx.req);
      const rows = await db
        .select({
          id: websiteBlogPosts.id,
          contentStatus: websiteBlogPosts.status,
          slug: websiteBlogPosts.slug,
          title: websiteBlogPosts.title,
          excerpt: websiteBlogPosts.excerpt,
          body: websiteBlogPosts.body,
          coverImageUrl: websiteBlogPosts.coverImageUrl,
          category: websiteBlogPosts.category,
          tags: websiteBlogPosts.tags,
          publishedAt: websiteBlogPosts.publishedAt,
          authorName: users.name,
          authorImageUrl: userProfiles.profilePhotoUrl,
          // The author's public agent card, the same fields a property's
          // "Your Agent" card shows (1 Oct call: a bigger Written by box).
          authorUserId: websiteBlogPosts.authorUserId,
          authorSlug: websiteAgentProfiles.slug,
          authorProfileImageUrl: websiteAgentProfiles.imageUrl,
          authorHeadline: websiteAgentProfiles.headline,
          authorShortBio: websiteAgentProfiles.shortBio,
          authorMarkets: websiteAgentProfiles.markets,
          authorEmail: websiteAgentProfiles.publicEmail,
          authorPhone: websiteAgentProfiles.publicPhone,
          authorBookingUrl: websiteAgentProfiles.bookingUrl,
          authorProfileStatus: websiteAgentProfiles.status,
        })
        .from(websiteBlogPosts)
        .leftJoin(users, eq(websiteBlogPosts.authorUserId, users.id))
        .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
        .leftJoin(websiteAgentProfiles, eq(users.id, websiteAgentProfiles.userId))
        .where(
          and(
            eq(websiteBlogPosts.slug, input.slug),
            isStaff
              ? inArray(websiteBlogPosts.status, ["published", "draft"])
              : eq(websiteBlogPosts.status, "published")
          )
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      // Only a published agent profile is shown and linked; otherwise the
      // byline stays a name and photo, as before.
      const live = row.authorProfileStatus === "published";
      return {
        ...row,
        authorSlug: live ? row.authorSlug : null,
        authorProfileImageUrl: live ? row.authorProfileImageUrl : null,
        authorHeadline: live ? row.authorHeadline : null,
        authorShortBio: live ? row.authorShortBio : null,
        authorMarkets: live ? row.authorMarkets : null,
        authorEmail: live ? row.authorEmail : null,
        authorPhone: live ? row.authorPhone : null,
        authorBookingUrl: live ? normalizeBookingUrl(row.authorBookingUrl) : null,
      };
    }),

  /**
   * Address suggestions for the public seller form ("Sell your STR"), so an
   * owner picks their address instead of typing it (1 Oct call). Google bills
   * each lookup, so it is limited per visitor and overall; past a limit it
   * returns nothing and the box works as a plain text field.
   */
  publicAddressSuggestions: publicProcedure
    .input(z.object({ query: z.string().trim().min(3).max(200) }))
    .query(async ({ input, ctx }) => {
      const forwarded = String(ctx.req?.headers?.["x-forwarded-for"] || "")
        .split(",")
        .map((value: string) => value.trim())
        .filter(Boolean);
      const ip = forwarded[forwarded.length - 1] || ctx.req?.ip || ctx.req?.socket?.remoteAddress || "unknown";
      if (!allowAddressLookup(hashLeadKey(ip))) return { suggestions: [] };
      try {
        return { suggestions: await fetchAddressSuggestions(input.query) };
      } catch (error: any) {
        console.warn("[website] address suggestions failed:", error?.message || error);
        return { suggestions: [] };
      }
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
        requestType: z
          .enum(["showing", "analysis", "financing"])
          .optional(),
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
        .select({ id: contacts.id, tags: contacts.tags })
        .from(contacts)
        .where(eq(contacts.email, normalizedEmail))
        .limit(1);
      // A seller from the Sell page is tagged so the ISA team can pull every
      // website seller lead in one filter, new contact or returning.
      const isSeller = input.intent === "sell";
      // Same last-touch rule as the Calendly intake, so a lead reads the same
      // whichever door they came through: blank never overwrites.
      const adAttribution = readAdAttribution(input.attribution || {});
      const adCampaign = campaignSourceFrom(adAttribution);
      let contactId = existing[0]?.id;
      if (!contactId) {
        // The lead source locks at creation, so it is decided here. A visit
        // from an organic social post (utm_medium=social) goes to Organic
        // Social; every other website lead goes to the Savvy-Agents.com
        // sub-source for the form it used.
        const organicSourceId = await resolveOrganicSocialLeadSourceId(db, adAttribution);
        const leadSourceId =
          organicSourceId ??
          (await websiteLeadSourceId(
            db,
            websiteFormLeadSource({
              intent: input.intent,
              requestType: input.requestType,
              sourcePath: input.sourcePath,
            })
          ));
        const result = await db.insert(contacts).values({
          firstName: input.firstName,
          lastName: input.lastName,
          email: normalizedEmail,
          phone: input.phone || null,
          ...(leadSourceId ? { leadSourceId } : {}),
          // First touch, locked after this. A lead that arrived through an
          // ad is a paid lead; anything else on the site is organic, including
          // an organic social post that carries a campaign name.
          leadSourceType: !organicSourceId && isPaidAttribution(adAttribution) ? "paid_lead" : "organic",
          isaStatus: "new_lead",
          tags: isSeller ? ["Savvy website", SELLER_LEAD_TAG] : ["Savvy website"],
          notes: input.message || "Savvy website inquiry",
          ...adAttributionUpdates(adAttribution),
          ...(adCampaign ? { campaignSource: adCampaign } : {}),
        });
        contactId = Number((result as any)[0]?.insertId);
        // Website contacts had no lead source, so they never started a Smart
        // Plan. Now they do, like every other intake with a source. Never
        // blocks or fails the visitor's form.
        if (leadSourceId) {
          const newContactId = contactId;
          await triggerSmartPlansForContact(newContactId, leadSourceId).catch(error =>
            console.error("[SmartPlan] Website enrollment failed for contact", newContactId, error)
          );
        }
      } else {
        const updates: Record<string, unknown> = {
          ...adAttributionUpdates(adAttribution),
        };
        if (adCampaign) updates.campaignSource = adCampaign;
        const currentTags = Array.isArray(existing[0]?.tags) ? (existing[0]!.tags as string[]) : [];
        if (isSeller && !currentTags.includes(SELLER_LEAD_TAG)) {
          updates.tags = [...currentTags, SELLER_LEAD_TAG];
        }
        if (Object.keys(updates).length) {
          await db.update(contacts).set(updates).where(eq(contacts.id, contactId));
        }
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
        requestType: input.requestType || null,
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
        let connectionId: number | null = existingConnection?.id ?? null;
        if (!existingConnection) {
          const inserted = await db.insert(agentConnections).values({ agentId, contactId });
          connectionId = Number((inserted as any)[0]?.insertId) || null;
          connectionCreated = true;
        }
        if (input.requestType && input.propertyId) {
          sendWebsiteHandoffEmail(db, {
            agentId,
            contactId,
            propertyId: input.propertyId,
            requestType: input.requestType,
            contactName: `${input.firstName} ${input.lastName}`.trim(),
            contactEmail: normalizedEmail,
            propertyAddress,
          });
        }
        alertAgentOfWebsiteInquiry({
          agentId,
          contactId,
          connectionId,
          isNewLead: connectionCreated,
          contactName: `${input.firstName} ${input.lastName}`.trim(),
          requestType: input.requestType ?? null,
          intent: input.intent,
          message: input.message ?? null,
          propertyAddress,
        });
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
            requestType: input.requestType || null,
            message: input.message || null,
            propertyId: input.propertyId ?? null,
            propertyAddress,
            agentId,
            connectionCreated,
            sourcePath: input.sourcePath || null,
            attribution: input.attribution || {},
          },
        });
        // The old site's action for the same button (showing_requested,
        // analysis_requested and so on), which is what Hot Leads, the lead
        // score and the reports count. The entry above keeps the message.
        await recordWebsiteRequestActivity(db, {
          contactId,
          requestType: input.requestType,
          intent: input.intent,
          propertyId: input.propertyId,
          propertyAddress,
          agentId,
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
      caseStudies: await withCaseStudySeo(db, caseRows),
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
      const db = await getDb();
      if (!db) return [];
      // Same gate as publishing: an agent picking a pro-forma for a property
      // they own does not need a studio permission.
      await requirePropertyPublishAccess(ctx, db, input.propertyId);
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
      if (input.status === "published") {
        const missing = missingForPublish({
          ...canonical,
          heroImageUrl: input.heroImageUrl,
          galleryImageUrls: input.galleryImageUrls,
        });
        if (missing.length)
          throw new TRPCError({ code: "BAD_REQUEST", message: publishBlockedMessage(missing) });
      }
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
          agentBlurb: input.agentBlurb || null,
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
      const [existing] = input.id
        ? await db
            .select({ publishedAt: websiteCaseStudies.publishedAt })
            .from(websiteCaseStudies)
            .where(eq(websiteCaseStudies.id, input.id))
            .limit(1)
        : [];
      // The meta fields live in their own table (see websiteCaseStudySeo.ts).
      const { metaTitle, metaDescription, ...caseFields } = input;
      const data = {
        ...caseFields,
        id: undefined,
        slug: cleanSlug(input.slug),
        // decimal columns take a string. Left out (undefined) when the form
        // did not send it, so an older client never clears a stored amount.
        investmentAmount:
          input.investmentAmount === undefined
            ? undefined
            : input.investmentAmount === null
              ? null
              : String(input.investmentAmount),
        publishedAt: studioPublishedAt(input.status, input.publishedAt, existing?.publishedAt),
        updatedById: ctx.user.id,
      };
      let caseStudyId = input.id ?? 0;
      if (input.id)
        await db
          .update(websiteCaseStudies)
          .set(data as any)
          .where(eq(websiteCaseStudies.id, input.id));
      else {
        const result = await db
          .insert(websiteCaseStudies)
          .values({ ...data, createdById: ctx.user.id } as any);
        caseStudyId = Number((result as any)[0]?.insertId) || 0;
      }
      const seoSaved = sentCaseStudySeo(input)
        ? await saveCaseStudySeo(db, caseStudyId, { metaTitle, metaDescription })
        : true;
      return { success: true, seoSaved };
    }),

  savePost: protectedProcedure
    .input(postInput)
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteBlog");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = input.id
        ? await db
            .select({ publishedAt: websiteBlogPosts.publishedAt })
            .from(websiteBlogPosts)
            .where(eq(websiteBlogPosts.id, input.id))
            .limit(1)
        : [];
      const data = {
        ...input,
        id: undefined,
        slug: cleanSlug(input.slug),
        category: input.category || "STR Investing",
        tags: input.tags === undefined ? undefined : cleanTags(input.tags),
        publishedAt: studioPublishedAt(input.status, input.publishedAt, existing?.publishedAt),
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

  // ─── Agents' own case studies and blog posts (My Website) ──────────────────
  //
  // Dhruv's decision, 27 Sep: agents add case studies and blog posts
  // themselves and publish them directly, like their properties; they edit
  // only their own (see shared/websiteContentOwnership.ts). Featured and
  // ordering stay with admins in Website Studio.

  myWebsiteContent: protectedProcedure.query(async ({ ctx }) => {
    requireContentAuthor(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const me = ctx.user.id;
    const [caseRows, postRows, propertyRows] = await Promise.all([
      db
        .select()
        .from(websiteCaseStudies)
        .where(or(eq(websiteCaseStudies.createdById, me), eq(websiteCaseStudies.agentUserId, me)))
        .orderBy(desc(websiteCaseStudies.updatedAt)),
      db
        .select()
        .from(websiteBlogPosts)
        .where(or(eq(websiteBlogPosts.createdById, me), eq(websiteBlogPosts.authorUserId, me)))
        .orderBy(desc(websiteBlogPosts.updatedAt)),
      // Properties a case study may be linked to: the ones this agent added,
      // or holds a transaction or listing on (the same rule as publishing).
      db
        .selectDistinct({ propertyId: properties.id, address: properties.address, city: properties.city })
        .from(properties)
        .leftJoin(transactions, and(eq(transactions.propertyId, properties.id), eq(transactions.agentId, me)))
        .leftJoin(listings, and(eq(listings.propertyId, properties.id), eq(listings.agentId, me)))
        .where(or(eq(properties.addedByUserId, me), eq(transactions.agentId, me), eq(listings.agentId, me)))
        .orderBy(properties.address)
        .limit(500),
    ]);
    return { caseStudies: await withCaseStudySeo(db, caseRows), posts: postRows, properties: propertyRows };
  }),

  saveMyCaseStudy: protectedProcedure
    .input(caseStudyInput)
    .mutation(async ({ input, ctx }) => {
      requireContentAuthor(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const me = ctx.user.id;
      let existing: any = null;
      if (input.id) {
        [existing] = await db.select().from(websiteCaseStudies).where(eq(websiteCaseStudies.id, input.id)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "That case study no longer exists." });
        if (!ownsCaseStudy(existing, me))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own case studies." });
      }
      if (input.propertyId && !(await agentOwnsProperty(db, me, input.propertyId)))
        throw new TRPCError({ code: "FORBIDDEN", message: "Link the case study to one of your own properties." });
      const wanted = cleanSlug(input.slug);
      const slug =
        existing && existing.slug === wanted
          ? existing.slug
          : await uniqueSlug(db, websiteCaseStudies, wanted);
      const data = {
        slug,
        title: input.title,
        eyebrow: input.eyebrow ?? null,
        excerpt: input.excerpt ?? null,
        body: input.body ?? null,
        heroImageUrl: input.heroImageUrl ?? null,
        propertyId: input.propertyId ?? null,
        // Credited to whoever it already credits, or to the agent writing it.
        agentUserId: existing?.agentUserId ?? me,
        primaryMetricLabel: input.primaryMetricLabel ?? null,
        primaryMetricValue: input.primaryMetricValue ?? null,
        secondaryMetricLabel: input.secondaryMetricLabel ?? null,
        secondaryMetricValue: input.secondaryMetricValue ?? null,
        investmentAmount:
          input.investmentAmount == null ? null : String(input.investmentAmount),
        status: input.status,
        publishedAt: nextPublishedAt(input.status, existing?.publishedAt),
        updatedById: me,
      };
      let id = existing?.id as number | undefined;
      if (existing) {
        await db.update(websiteCaseStudies).set(data as any).where(eq(websiteCaseStudies.id, existing.id));
      } else {
        const result = await db.insert(websiteCaseStudies).values({
          ...data,
          isFeatured: false,
          sortOrder: 0,
          createdById: me,
        } as any);
        id = Number((result as any)[0]?.insertId);
      }
      const seoSaved =
        sentCaseStudySeo(input) && id
          ? await saveCaseStudySeo(db, id, { metaTitle: input.metaTitle, metaDescription: input.metaDescription })
          : true;
      await logActivity({
        userId: me,
        action: existing ? "website_case_study_updated" : "website_case_study_created",
        entityType: "website_case_study",
        entityId: id ?? null,
        details: { slug, status: input.status, byAgent: true },
      });
      return { id, slug, status: input.status, seoSaved };
    }),

  saveMyPost: protectedProcedure
    .input(postInput)
    .mutation(async ({ input, ctx }) => {
      requireContentAuthor(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const me = ctx.user.id;
      let existing: any = null;
      if (input.id) {
        [existing] = await db.select().from(websiteBlogPosts).where(eq(websiteBlogPosts.id, input.id)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "That blog post no longer exists." });
        if (!ownsPost(existing, me))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own blog posts." });
      }
      const wanted = cleanSlug(input.slug);
      const slug =
        existing && existing.slug === wanted
          ? existing.slug
          : await uniqueSlug(db, websiteBlogPosts, wanted);
      const data = {
        slug,
        title: input.title,
        excerpt: input.excerpt ?? null,
        body: input.body ?? null,
        coverImageUrl: input.coverImageUrl ?? null,
        category: input.category || "STR Investing",
        tags: cleanTags(input.tags ?? []),
        // The byline is whoever it already credits, or the agent writing it.
        authorUserId: existing?.authorUserId ?? me,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        status: input.status,
        publishedAt: nextPublishedAt(input.status, existing?.publishedAt),
        updatedById: me,
      };
      let id = existing?.id as number | undefined;
      if (existing) {
        await db.update(websiteBlogPosts).set(data as any).where(eq(websiteBlogPosts.id, existing.id));
      } else {
        const result = await db.insert(websiteBlogPosts).values({
          ...data,
          isFeatured: false,
          sortOrder: 0,
          createdById: me,
        } as any);
        id = Number((result as any)[0]?.insertId);
      }
      await logActivity({
        userId: me,
        action: existing ? "website_post_updated" : "website_post_created",
        entityType: "website_post",
        entityId: id ?? null,
        details: { slug, status: input.status, byAgent: true },
      });
      return { id, slug, status: input.status };
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
      const access = await requirePropertyPublishAccess(ctx, db, input.propertyId);

      const [property] = await db
        .select({
          id: properties.id,
          address: properties.address,
          city: properties.city,
          state: properties.state,
          zip: properties.zip,
          listPrice: properties.listPrice,
          beds: properties.beds,
          baths: properties.baths,
        })
        .from(properties)
        .where(eq(properties.id, input.propertyId))
        .limit(1);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

      const [existing] = await db
        .select({
          id: websiteProperties.id,
          slug: websiteProperties.slug,
          status: websiteProperties.status,
          heroImageUrl: websiteProperties.heroImageUrl,
          galleryImageUrls: websiteProperties.galleryImageUrls,
        })
        .from(websiteProperties)
        .where(eq(websiteProperties.propertyId, input.propertyId))
        .limit(1);

      if (input.status === "published") {
        const missing = missingForPublish({
          ...property,
          heroImageUrl: existing?.heroImageUrl,
          galleryImageUrls: existing?.galleryImageUrls,
        });
        if (missing.length)
          throw new TRPCError({ code: "BAD_REQUEST", message: publishBlockedMessage(missing) });
      }

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

      // Whoever publishes their own property is credited on it.
      const assignedAgentId = access === "owner" ? ctx.user.id : null;
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

  /**
   * Everything the Website tab on a property page needs, in one call: the
   * website row if the property is already on the site, whether this user may
   * edit it, and the pro-formas and agents the form offers.
   */
  propertyWebsiteContent: protectedProcedure
    .input(z.object({ propertyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { canEdit: false, website: null, proformas: [], agents: [], facts: null };
      const canEdit = Boolean(await propertyWebsiteAccess(ctx, db, input.propertyId));
      const [website] = await db
        .select()
        .from(websiteProperties)
        .where(eq(websiteProperties.propertyId, input.propertyId))
        .limit(1);
      if (!canEdit) return { canEdit, website: website ?? null, proformas: [], agents: [], facts: null };
      // The property facts the publish checklist needs, so the form can say
      // what is missing before the save is attempted.
      const [facts] = await db
        .select({
          city: properties.city,
          state: properties.state,
          zip: properties.zip,
          listPrice: properties.listPrice,
          beds: properties.beds,
          baths: properties.baths,
        })
        .from(properties)
        .where(eq(properties.id, input.propertyId))
        .limit(1);
      const proformaRows = await db
        .select({
          id: proformas.id,
          title: proformas.title,
          status: proformas.status,
          formData: proformas.formData,
          grossRevenue: proformas.grossRevenue,
          cashOnCash: proformas.cashOnCash,
          capRate: proformas.capRate,
        })
        .from(proformas)
        .where(eq(proformas.propertyId, input.propertyId))
        .orderBy(desc(proformas.updatedAt));
      const agentRows = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "agent"), eq(users.isActive, true)))
        .orderBy(users.name);
      // Say what each pro-forma would actually put on the public page, worked
      // out here with the same functions the public endpoint uses. Three
      // different reasons produce an empty listing section, and without this
      // they are indistinguishable to the person doing the publishing: the
      // pro-forma is still a draft, its scenarios are empty, or it was never
      // linked. The raw formData is deliberately not returned; only the
      // verdict, since the rest of a pro-forma is internal.
      const proformaSummaries = proformaRows.map((row: any) => {
        const range = publicRevenueRange(row.formData);
        const comps = publicComps(row.formData);
        return {
          id: row.id,
          title: row.title,
          status: row.status,
          grossRevenue: row.grossRevenue,
          cashOnCash: row.cashOnCash,
          capRate: row.capRate,
          publishes: row.status === "final" && (range != null || comps.length > 0),
          // The subject property's own Zillow link from the pro-forma's
          // Acquisition tab, for "Import photos from Zillow". Comps are
          // separate and never offered.
          zillowUrl: zillowLinkOf((row.formData as any)?.propertyLink),
          blockedByDraft: row.status !== "final",
          revenue: range,
          compCount: comps.length,
        };
      });
      return {
        canEdit,
        website: website ?? null,
        proformas: proformaSummaries,
        agents: agentRows,
        facts: facts ?? null,
      };
    }),

  /**
   * Save the public presentation of a property from the property page. Uses the
   * same access rule as publishing, so an agent can write the website copy for
   * a property they own without any studio permission. It never touches the
   * SavvyOS property record, which is why there is no address here to reconcile.
   */
  /**
   * Every photo from the property's own Zillow listing, for the Website tab.
   * Returns the photos only; nothing is saved until the form is saved.
   */
  /**
   * "Write with AI": the meta title and description of a property listing or
   * blog post, or a case study's excerpt, from what SavvyOS knows about it.
   * Nothing is saved; the editor fills the field and the person saves.
   */
  writeSeoWithAi: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["property", "post", "case", "caseSeo"]),
        propertyId: z.number().int().positive().nullable().optional(),
        sourceProformaId: z.number().int().positive().nullable().optional(),
        content: z
          .record(z.string().max(60), z.union([z.string().max(60_000), z.number(), z.array(z.string().max(200)).max(40), z.null()]))
          .default({}),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.kind === "property") {
        if (!input.propertyId || !(await propertyWebsiteAccess(ctx, db, input.propertyId))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can't edit this property's website listing." });
        }
      } else {
        requireContentAuthor(ctx);
      }
      if (!allowSeoWrite(ctx.user.id)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "That's a lot of AI writing in a minute. Try again shortly." });
      }

      const { body, summary, ...rest } = input.content as Record<string, unknown>;
      const facts: Record<string, unknown> = { ...rest };
      if (input.propertyId) {
        const [property] = await db
          .select({
            address: properties.address,
            city: properties.city,
            state: properties.state,
            zip: properties.zip,
            beds: properties.beds,
            baths: properties.baths,
            sqft: properties.sqft,
            yearBuilt: properties.yearBuilt,
            propertyType: properties.propertyType,
            listPrice: properties.listPrice,
          })
          .from(properties)
          .where(eq(properties.id, input.propertyId))
          .limit(1);
        // A case study names the place, never the street.
        if (property) {
          if (input.kind === "property") Object.assign(facts, property);
          else Object.assign(facts, { city: property.city, state: property.state });
        }
        if (input.kind === "property" && input.sourceProformaId) {
          const [proforma] = await db
            .select({ grossRevenue: proformas.grossRevenue, cashOnCash: proformas.cashOnCash, capRate: proformas.capRate })
            .from(proformas)
            .where(and(eq(proformas.id, input.sourceProformaId), eq(proformas.propertyId, input.propertyId)))
            .limit(1);
          if (proforma) {
            facts.proformaBaseCaseGrossRevenue = proforma.grossRevenue;
            facts.proformaBaseCaseCashOnCash = proforma.cashOnCash == null ? null : `${(Number(proforma.cashOnCash) * 100).toFixed(1)}%`;
            facts.proformaBaseCaseCapRate = proforma.capRate == null ? null : `${(Number(proforma.capRate) * 100).toFixed(1)}%`;
          }
        }
      }
      try {
        return await writeSeoText({
          kind: input.kind,
          facts,
          text: [summary, body].filter(value => typeof value === "string" && value.trim()).join("\n\n"),
        });
      } catch (error: any) {
        console.warn("[website] Write with AI failed:", error?.message || error);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "The AI writer is not answering right now. Try again in a minute, or write it yourself.",
        });
      }
    }),

  importZillowPhotos: protectedProcedure
    .input(
      z.object({
        propertyId: z.number().int().positive(),
        zillowUrl: z.string().trim().min(1).max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!(await propertyWebsiteAccess(ctx, db, input.propertyId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't edit this property's website listing." });
      }
      const link = zillowLinkOf(input.zillowUrl);
      if (!link) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Paste the property's Zillow listing link (zillow.com/homedetails/...).",
        });
      }
      let data: any;
      try {
        data = await fetchZillowListing(link);
      } catch (error: any) {
        if (error instanceof ZillowLookupInputError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw new TRPCError({ code: "BAD_GATEWAY", message: error?.message || "Zillow lookup failed." });
      }
      const photos = extractZillowPhotoUrls(data);
      const description = extractZillowDescription(data);
      if (!photos.length && !description) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Zillow returned no photos or description for that listing." });
      }
      return { photos, description, zillowUrl: link };
    }),

  savePropertyWebsiteContent: protectedProcedure
    .input(propertyWebsiteContentInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const access = await requirePropertyPublishAccess(ctx, db, input.propertyId);
      if (input.autosave && input.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Auto-save only saves drafts. Click Save to publish." });
      }

      const [property] = await db
        .select({
          id: properties.id,
          address: properties.address,
          city: properties.city,
          state: properties.state,
          zip: properties.zip,
          listPrice: properties.listPrice,
          beds: properties.beds,
          baths: properties.baths,
        })
        .from(properties)
        .where(eq(properties.id, input.propertyId))
        .limit(1);
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

      // Publishing needs the facts every listing shows. Drafts save regardless.
      if (input.status === "published") {
        const missing = missingForPublish({
          ...property,
          heroImageUrl: input.heroImageUrl,
          galleryImageUrls: input.galleryImageUrls,
        });
        if (missing.length)
          throw new TRPCError({ code: "BAD_REQUEST", message: publishBlockedMessage(missing) });
      }

      let metrics: Record<string, string | null> = proformaMetrics(input, null);
      if (input.sourceProformaId) {
        const [selected] = await db
          .select({
            grossRevenue: proformas.grossRevenue,
            cashOnCash: proformas.cashOnCash,
            capRate: proformas.capRate,
          })
          .from(proformas)
          .where(
            and(
              eq(proformas.id, input.sourceProformaId),
              eq(proformas.propertyId, input.propertyId)
            )
          )
          .limit(1);
        if (!selected) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The selected pro-forma does not belong to this property.",
          });
        }
        metrics = proformaMetrics(input, selected);
      }

      const [existing] = await db
        .select({
          id: websiteProperties.id,
          slug: websiteProperties.slug,
          status: websiteProperties.status,
          publishedAt: websiteProperties.publishedAt,
          isFeatured: websiteProperties.isFeatured,
        })
        .from(websiteProperties)
        .where(eq(websiteProperties.propertyId, input.propertyId))
        .limit(1);
      // Auto-save never touches a live or archived listing: those change only
      // when someone clicks Save.
      if (input.autosave && existing && existing.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This listing is live. Click Save to update it." });
      }

      // The publish date is stamped when a listing first goes live and then
      // left alone. Re-stamping it on every save would make a listing from
      // March look brand new every time someone fixed a typo.
      const publishedAt =
        input.status === "published"
          ? (existing?.publishedAt ?? new Date())
          : (existing?.publishedAt ?? null);

      const data = {
        status: input.status,
        sourceProformaId: input.sourceProformaId || null,
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl || null } : {}),
        assignedAgentId: input.assignedAgentId || null,
        headline: input.headline || null,
        summary: input.summary || null,
        agentBlurb: input.agentBlurb || null,
        heroImageUrl: input.heroImageUrl || null,
        galleryImageUrls: input.galleryImageUrls,
        featureTags: input.featureTags,
        investmentHighlights: input.investmentHighlights,
        occupancyRate: asDecimal(input.occupancyRate),
        averageDailyRate: asDecimal(input.averageDailyRate),
        regulationSummary: input.regulationSummary || null,
        callToActionText: input.callToActionText,
        metaTitle: input.metaTitle || null,
        metaDescription: input.metaDescription || null,
        isFeatured: input.isFeatured,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        publishedAt,
        updatedById: ctx.user.id,
        ...metrics,
      };

      if (existing) {
        // The slug is part of a live URL. Only change it when the form actually
        // sent a different one, and make sure it stays unique.
        const nextSlug =
          input.slug && cleanSlug(input.slug) !== existing.slug
            ? await uniqueSlug(db, websiteProperties, cleanSlug(input.slug))
            : existing.slug;
        await db
          .update(websiteProperties)
          .set({ ...data, slug: nextSlug })
          .where(eq(websiteProperties.id, existing.id));
        await recordFeatured(db, existing.id, !!existing.isFeatured, input.isFeatured);
        // Auto-saves of a draft are not logged one by one; the activity log
        // would fill with a row every few seconds of typing.
        if (!input.autosave) {
          await logActivity({
            userId: ctx.user.id,
            action: "website_property_updated",
            entityType: "property",
            entityId: input.propertyId,
            details: { slug: nextSlug, status: input.status, previousStatus: existing.status },
          });
        }
        return { id: existing.id, slug: nextSlug, created: false };
      }

      const base = cleanSlug(
        input.slug ||
          [property.address, property.city].filter(Boolean).join(" ") ||
          `property-${property.id}`
      );
      const slug = await uniqueSlug(db, websiteProperties, base);
      const result = await db.insert(websiteProperties).values({
        ...data,
        propertyId: input.propertyId,
        slug,
        assignedAgentId:
          input.assignedAgentId ?? (access === "owner" ? ctx.user.id : null),
        createdById: ctx.user.id,
      });
      const newId = Number((result as any)[0]?.insertId);
      if (newId) await recordFeatured(db, newId, false, input.isFeatured);
      await logActivity({
        userId: ctx.user.id,
        action: "website_property_published",
        entityType: "property",
        entityId: input.propertyId,
        details: { slug, status: input.status, ...(input.autosave ? { autosave: true } : {}) },
      });
      return { id: newId, slug, created: true };
    }),

  /** The agent's own website profile, for the Website tab on their page. */
  agentWebsiteProfile: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { canEdit: false, profile: null, user: null };
      const canEdit = await canEditAgentProfile(ctx, input.userId);
      const [profile] = await db
        .select()
        .from(websiteAgentProfiles)
        .where(eq(websiteAgentProfiles.userId, input.userId))
        .limit(1);
      const [user] = await db
        .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      return {
        canEdit,
        profile: profile ? withNormalizedBooking(profile) : null,
        user: user ?? null,
      };
    }),

  /** Save an agent's public profile from their agent page. */
  saveAgentWebsiteProfile: protectedProcedure
    .input(agentInput.partial({ slug: true }))
    .mutation(async ({ input, ctx }) => {
      await requireAgentProfileAccess(ctx, input.userId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [user] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });

      const [existing] = await db
        .select({
          id: websiteAgentProfiles.id,
          slug: websiteAgentProfiles.slug,
          publishedAt: websiteAgentProfiles.publishedAt,
        })
        .from(websiteAgentProfiles)
        .where(eq(websiteAgentProfiles.userId, input.userId))
        .limit(1);

      // Same rule as a property: first publish stamps the date, later saves
      // leave it alone.
      const publishedAt =
        input.status === "published"
          ? (existing?.publishedAt ?? new Date())
          : (existing?.publishedAt ?? null);

      const data = {
        headline: input.headline || null,
        shortBio: input.shortBio || null,
        markets: input.markets,
        specialties: input.specialties,
        imageUrl: input.imageUrl || null,
        publicEmail: input.publicEmail || null,
        publicPhone: input.publicPhone || null,
        // Stored normalized, so a link typed as "calendly.com/x" is still a
        // working link on the public page rather than a relative path.
        bookingUrl: normalizeBookingUrl(input.bookingUrl),
        status: input.status,
        isFeatured: input.isFeatured,
        sortOrder: input.sortOrder,
        publishedAt,
        updatedById: ctx.user.id,
      };

      if (existing) {
        const nextSlug =
          input.slug && cleanSlug(input.slug) !== existing.slug
            ? await uniqueSlug(db, websiteAgentProfiles, cleanSlug(input.slug))
            : existing.slug;
        await db
          .update(websiteAgentProfiles)
          .set({ ...data, slug: nextSlug })
          .where(eq(websiteAgentProfiles.id, existing.id));
        return { id: existing.id, slug: nextSlug, created: false };
      }

      const slug = await uniqueSlug(
        db,
        websiteAgentProfiles,
        cleanSlug(input.slug || user.name || `agent-${user.id}`)
      );
      const result = await db.insert(websiteAgentProfiles).values({
        ...data,
        userId: input.userId,
        slug,
        createdById: ctx.user.id,
      });
      return { id: Number((result as any)[0]?.insertId), slug, created: true };
    }),

  propertyPublishState: protectedProcedure
    .input(z.object({ propertyId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { canPublish: false, website: null };
      const canPublish = Boolean(await propertyWebsiteAccess(ctx, db, input.propertyId));
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

  // ─── Meet the Team (Website Studio > Team) ─────────────────────────────────

  adminTeamMembers: protectedProcedure.query(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteSettings");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db
      .select()
      .from(websiteTeamMembers)
      .orderBy(asc(websiteTeamMembers.sortOrder), asc(websiteTeamMembers.name));
  }),

  saveTeamMember: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(160),
        title: z.string().max(160).nullable().optional(),
        bio: z.string().max(4000).nullable().optional(),
        imageUrl: z.string().max(2048).nullable().optional(),
        email: z.string().max(320).nullable().optional(),
        linkedinUrl: z.string().max(512).nullable().optional(),
        section: z.enum(["leadership", "staff"]).default("staff"),
        status: z.enum(["draft", "published", "archived"]).default("draft"),
        sortOrder: z.number().int().min(-10000).max(10000).default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const row = normalizeTeamMember(input);
      if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "A name is required." });
      // Say what was wrong rather than quietly dropping a link or photo the
      // editor typed: the normalizer keeps only safe addresses.
      if (input.linkedinUrl?.trim() && !row.linkedinUrl)
        throw new TRPCError({ code: "BAD_REQUEST", message: "LinkedIn must be a full https:// address." });
      if (input.imageUrl?.trim() && !row.imageUrl)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Photo must be an uploaded image or a full https:// address." });
      if (input.email?.trim() && !row.email)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Check the email address." });
      const values = {
        name: row.name,
        title: row.title,
        bio: row.bio,
        imageUrl: row.imageUrl,
        email: row.email,
        linkedinUrl: row.linkedinUrl,
        section: row.section,
        status: row.status,
        sortOrder: row.sortOrder,
        updatedById: ctx.user.id,
      };
      let id = input.id ?? null;
      if (id) {
        await db.update(websiteTeamMembers).set(values).where(eq(websiteTeamMembers.id, id));
      } else {
        const result = await db.insert(websiteTeamMembers).values(values);
        id = Number((result as any)[0]?.insertId) || null;
      }
      await logActivity({
        userId: ctx.user.id,
        action: "website_team_member_saved",
        entityType: "website_team_member",
        entityId: id ?? null,
        details: { name: row.name, status: row.status },
      });
      return { id, status: row.status };
    }),

  deleteTeamMember: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(websiteTeamMembers).where(eq(websiteTeamMembers.id, input.id));
      await logActivity({
        userId: ctx.user.id,
        action: "website_team_member_deleted",
        entityType: "website_team_member",
        entityId: input.id,
        details: {},
      });
      return { success: true };
    }),

  // ─── Daily property email (Website Studio > Daily Email) ──────────────────

  dailyEmailOverview: protectedProcedure.query(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteSettings");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [settings, queue, analytics, segments, priceDropsOn, priceDrops, signupSegmentId] = await Promise.all([
      getDailyEmailSettings(db),
      loadDailyEmailQueue(db),
      loadDailyEmailAnalytics(db),
      listResendSegments(),
      priceDropAlertsEnabled(db),
      loadRecentPriceDrops(db),
      getSignupSegmentId(db),
    ]);
    return {
      priceDropAlerts: { enabled: priceDropsOn, recent: priceDrops },
      signupAudience: { segmentId: signupSegmentId },
      settings,
      masterSwitch: dailyEmailMasterSwitchOn(),
      queue,
      analytics,
      segments: segments.success ? segments.data : [],
      segmentsError: segments.success ? null : segments.error,
    };
  }),

  saveDailyEmailSettings: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        sendHourEt: z.number().int().min(0).max(23),
        segmentIds: z.array(z.string().trim().min(1).max(100)).max(20),
        internalRecipients: z.string().max(2000),
        personalEmailsEnabled: z.boolean(),
        subjectTemplate: z.string().trim().max(200).nullable(),
        introText: z.string().trim().max(2000).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await saveDailyEmailSettings(db, input, ctx.user.id);
      return { success: true };
    }),

  setDailyEmailApproval: protectedProcedure
    .input(
      z.object({
        propertyIds: z.array(z.number().int().positive()).min(1).max(200),
        approved: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await setDailyEmailApproval(db, input.propertyIds, input.approved, ctx.user.id);
      return { success: true };
    }),

  previewDailyEmail: protectedProcedure.query(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteSettings");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return previewDailyEmail(db);
  }),

  sendDailyEmailTest: protectedProcedure
    .input(z.object({ recipients: z.string().trim().min(3).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      return sendTestDailyEmail(input.recipients, ctx.user.id);
    }),

  /** Send today's approved batch to everyone now, instead of waiting for the hour. */
  sendDailyEmailNow: protectedProcedure.mutation(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteSettings");
    const result = await runDailyEmail({ trigger: "manual", userId: ctx.user.id });
    await logActivity({
      userId: ctx.user.id,
      action: "website_daily_email_sent",
      entityType: "website_daily_email",
      entityId: result.runId ?? null,
      details: { status: result.status, message: result.message },
    }).catch(() => undefined);
    return result;
  }),

  /**
   * Which Resend list a new website account joins when someone signs up.
   * null turns it off. The id must be one of the account's real lists.
   */
  setSignupAudience: protectedProcedure
    .input(z.object({ segmentId: z.string().trim().min(1).max(255).nullable() }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.segmentId) {
        const segments = await listResendSegments();
        if (!segments.success) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Could not load the lists from Resend, so the choice was not saved. Try again in a minute.",
          });
        }
        if (!segments.data.some(segment => segment.id === input.segmentId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That list is not in Resend any more. Pick another." });
        }
      }
      try {
        await saveSignupSegmentId(db, input.segmentId, ctx.user.id);
      } catch (error) {
        console.error("[website] could not save the sign-up list", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The sign-up list could not be saved. Ask the tech team to check the website_signup_audience table.",
        });
      }
      return { success: true };
    }),

  setPriceDropAlerts: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await setPriceDropAlertsEnabled(db, input.enabled, ctx.user.id);
      return { success: true };
    }),

  sendPriceDropTest: protectedProcedure
    .input(z.object({ recipients: z.string().trim().min(3).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      return sendPriceDropTest(input.recipients);
    }),

  /**
   * Forwarding for links to home.savvy-agents.com/newsite once the site
   * moves (Website Studio > CMS). Off until switched on; switching on is
   * refused unless the new address already serves the site.
   */
  linkForwarding: protectedProcedure.query(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteSettings");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      return { ...(await readLinkForwarding(db)), ready: true as const };
    } catch {
      // Table not created yet (first start after this release on a non-production box).
      return { enabled: false, targetOrigin: null, keepBasePath: false, ready: false as const };
    }
  }),

  saveLinkForwarding: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        targetOrigin: z.string().max(255).nullable(),
        keepBasePath: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let saved: Awaited<ReturnType<typeof saveLinkForwarding>>;
      try {
        saved = await saveLinkForwarding(db, input, ctx.user.id);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Could not save." });
      }
      await logActivity({
        userId: ctx.user.id,
        action: "website_link_forwarding_saved",
        entityType: "website",
        entityId: null,
        details: saved,
      }).catch(() => undefined);
      return saved;
    }),

  /**
   * Move the old savvy-agents.com live listings into SavvyOS (Website Studio
   * > CMS). dryRun only reads the old site and reports. The real run creates
   * the properties and website listings as drafts, or publishes the ones that
   * pass the publish checklist when publishReady is set. Safe to run again.
   */
  importOldSiteListings: protectedProcedure
    .input(z.object({ dryRun: z.boolean(), publishReady: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteProperties");
      let report: Awaited<ReturnType<typeof importOldSiteListings>>;
      try {
        report = await importOldSiteListings({ dryRun: input.dryRun, publishReady: input.publishReady, userId: ctx.user.id });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Could not read the old site's listings: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      if (!input.dryRun) {
        await logActivity({
          userId: ctx.user.id,
          action: "website_old_listings_imported",
          entityType: "website",
          entityId: null,
          details: {
            found: report.found,
            created: report.created,
            attached: report.attached,
            published: report.published,
            failed: report.failed.length,
          },
        }).catch(() => undefined);
      }
      return report;
    }),

  importedOldSiteListingCounts: protectedProcedure.query(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteProperties");
    return importedListingCounts();
  }),

  publishReadyImportedListings: protectedProcedure.mutation(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteProperties");
    const result = await publishReadyImportedListings();
    await logActivity({
      userId: ctx.user.id,
      action: "website_old_listings_published",
      entityType: "website",
      entityId: null,
      details: result,
    }).catch(() => undefined);
    return result;
  }),

  /**
   * Copy website images off the old site's storage into SavvyOS. dryRun
   * only counts; the real run copies and repoints the records.
   */
  moveOldSiteImages: protectedProcedure
    .input(z.object({ dryRun: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await requireWebsitePermission(ctx, "canManageWebsiteSettings");
      const report = await moveWebsiteImages({ dryRun: input.dryRun });
      if (!input.dryRun) {
        await logActivity({
          userId: ctx.user.id,
          action: "website_images_moved",
          entityType: "website",
          entityId: null,
          details: {
            moved: report.moved,
            recordsUpdated: report.recordsUpdated,
            failed: report.failed.length,
          },
        }).catch(() => undefined);
      }
      return report;
    }),

  analyzeDailyEmail: protectedProcedure.mutation(async ({ ctx }) => {
    await requireWebsitePermission(ctx, "canManageWebsiteSettings");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return { review: await analyzeDailyEmailWithAi(db) };
  }),
});
