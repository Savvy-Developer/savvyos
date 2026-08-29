import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";
import {
  contacts,
  landingPageEvents,
  landingPageRedirects,
  landingPageRevisions,
  landingPageSessions,
  landingPageSmsConsents,
  landingPageSubmissions,
  landingPages,
  leadSources,
  shortLinks,
  smartPlans,
  users,
} from "../../drizzle/schema";
import { canAdminUsePermission, type PermissionKey } from "./permissions";
import { normalizeOptionalUsPhone } from "@shared/phone";
import { enrollContactInPlan, triggerSmartPlansForContact } from "../smartPlanScheduler";
import { triggerGhlContactSync } from "../_core/ghlSync";
import { normalizeLandingTrackingSettings } from "../landingPageHtml";

const publicHost = process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com";
const publicBaseUrl = `https://${publicHost}`;
const landingStatuses = ["draft", "published", "unpublished", "archived"] as const;
const attributionKeys = ["referrerUrl", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "fbc", "fbp"] as const;

type Attribution = Record<string, string | null | undefined> & { landingUrl?: string; deviceCategory?: string };

const fieldSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["first_name", "last_name", "email", "phone", "short_text", "long_text", "dropdown", "radio", "checkboxes", "hidden", "sms_consent"]),
  label: z.string().min(1).max(255),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(120)).max(20).optional(),
  defaultValue: z.string().max(500).optional(),
  validation: z.enum(["none", "email", "phone"]).optional(),
  consentLanguage: z.string().max(3000).optional(),
});

const trackingSettingsSchema = z.object({
  metaPixelId: z.string().trim().max(32).nullable().optional(),
  ga4MeasurementId: z.string().trim().max(64).nullable().optional(),
  googleAdsId: z.string().trim().max(64).nullable().optional(),
  googleAdsConversionLabel: z.string().trim().max(255).nullable().optional(),
  customHeadCode: z.string().max(20_000).nullable().optional(),
}).default({});

const blockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["hero", "rich_text", "image", "feature_list", "form", "video", "testimonial", "faq", "cta", "calendly", "footer", "spacer", "divider"]),
  content: z.record(z.string(), z.unknown()).default({}),
  settings: z.record(z.string(), z.unknown()).optional(),
});

const pageInput = z.object({
  internalName: z.string().trim().min(1).max(255),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.").min(2).max(120),
  primaryConversionType: z.enum(["form", "calendly"]),
  leadSourceId: z.number().int().positive(),
  smartPlanId: z.number().int().positive().nullable().optional(),
  pageTitle: z.string().trim().min(1).max(255),
  metaDescription: z.string().trim().max(500).nullable().optional(),
  socialImageUrl: z.string().url().nullable().optional(),
  trackingSettings: trackingSettingsSchema.optional(),
  noindex: z.boolean().default(false),
  postSubmitType: z.enum(["inline", "landing_page", "external"]).default("inline"),
  postSubmitMessage: z.string().trim().max(3000).nullable().optional(),
  postSubmitUrl: z.string().trim().max(2000).nullable().optional(),
  pageSettings: z.record(z.string(), z.unknown()).default({}),
  blocks: z.array(blockSchema).min(1).max(80),
});

const publicAttributionSchema = z.object({
  landingUrl: z.string().max(2000),
  referrerUrl: z.string().max(2000).nullable().optional(),
  utm_source: z.string().max(255).nullable().optional(),
  utm_medium: z.string().max(255).nullable().optional(),
  utm_campaign: z.string().max(255).nullable().optional(),
  utm_term: z.string().max(255).nullable().optional(),
  utm_content: z.string().max(255).nullable().optional(),
  gclid: z.string().max(500).nullable().optional(),
  fbclid: z.string().max(500).nullable().optional(),
  fbc: z.string().max(500).nullable().optional(),
  fbp: z.string().max(500).nullable().optional(),
  deviceCategory: z.enum(["mobile", "tablet", "desktop", "other"]).optional(),
});

const redirectInput = z.object({
  sourcePath: z.string().trim().min(2).max(500),
  destinationUrl: z.string().trim().url().max(2000),
  redirectType: z.enum(["permanent", "temporary"]).default("permanent"),
  preserveQueryParams: z.boolean().default(true),
  status: z.enum(["active", "disabled", "archived"]).default("active"),
});

function landingPermission(permission: PermissionKey) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    if (!(await canAdminUsePermission(ctx.user, permission))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your Super Permissions do not allow this Landing Pages action." });
    }
    return next({ ctx });
  });
}

function publicUrl(slug: string) {
  return `${publicBaseUrl}/${slug}`;
}

function pageSnapshot(page: Record<string, any>) {
  return {
    internalName: page.internalName,
    slug: page.slug,
    primaryConversionType: page.primaryConversionType,
    leadSourceId: page.leadSourceId,
    smartPlanId: page.smartPlanId ?? null,
    pageTitle: page.pageTitle,
    metaDescription: page.metaDescription ?? null,
    socialImageUrl: page.socialImageUrl ?? null,
    trackingSettings: normalizeLandingTrackingSettings(page.trackingSettings),
    noindex: !!page.noindex,
    postSubmitType: page.postSubmitType,
    postSubmitMessage: page.postSubmitMessage ?? null,
    postSubmitUrl: page.postSubmitUrl ?? null,
    pageSettings: page.pageSettings ?? {},
    blocks: page.blocks ?? [],
  };
}

async function createPageRevision(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, page: Record<string, any>, changeType: string, userId: number) {
  const [latest] = await db.select({ revisionNumber: landingPageRevisions.revisionNumber })
    .from(landingPageRevisions)
    .where(eq(landingPageRevisions.landingPageId, page.id))
    .orderBy(desc(landingPageRevisions.revisionNumber))
    .limit(1);
  await db.insert(landingPageRevisions).values({
    landingPageId: page.id,
    revisionNumber: (latest?.revisionNumber ?? 0) + 1,
    changeType,
    snapshot: pageSnapshot(page),
    createdById: userId,
  });
}

function normalizeRedirectPath(value: string) {
  const raw = value.trim();
  if (!raw || raw.includes("?") || raw.includes("#") || /^https?:\/\//i.test(raw)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use a public path beginning with / and do not include a domain, query string, or # fragment." });
  }
  const path = `/${raw.replace(/^\/+|\/+$/g, "")}`.replace(/\/+/g, "/");
  if (path === "/" || path.length > 500) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a specific public path to redirect." });
  return path;
}

function assertRedirectDestination(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("Only HTTPS destinations are allowed.");
    return url.toString();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a complete HTTPS destination URL." });
  }
}

function starterBlocks() {
  return [
    { id: "hero-1", type: "hero" as const, content: { eyebrow: "Savvy STR Agents", heading: "Build your short-term rental portfolio with confidence.", body: "Connect with a Savvy STR Agent to make your next investment move clear.", ctaText: "Get Started", ctaTarget: "#lead-form" }, settings: { background: "#062c40", textColor: "#ffffff", accentColor: "#19b9c9", padding: "large" } },
    { id: "features-1", type: "feature_list" as const, content: { heading: "A smarter way to invest", items: ["Specialized STR investment expertise", "Practical market and property guidance", "A team that moves at your pace"] }, settings: { background: "#ffffff", textColor: "#0f172a" } },
    { id: "form-1", type: "form" as const, content: { heading: "Tell us how we can help", submitText: "Talk with a Savvy STR Agent", fields: [
      { id: "first_name", type: "first_name", label: "First name", required: true },
      { id: "last_name", type: "last_name", label: "Last name", required: true },
      { id: "email", type: "email", label: "Email", required: true, validation: "email" },
      { id: "phone", type: "phone", label: "Phone", required: false, validation: "phone" },
      { id: "goals", type: "long_text", label: "What are you hoping to accomplish?", required: false },
    ] }, settings: { background: "#f7fafc", textColor: "#0f172a", accentColor: "#0d96a5", padding: "large" } },
    { id: "footer-1", type: "footer" as const, content: { text: "© Savvy STR Agents. All rights reserved." }, settings: { background: "#062c40", textColor: "#ffffff" } },
  ];
}

async function assertActiveLeadSource(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, leadSourceId: number) {
  const [source] = await db.select({ id: leadSources.id }).from(leadSources).where(and(eq(leadSources.id, leadSourceId), eq(leadSources.isActive, true))).limit(1);
  if (!source) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active SavvyOS Lead Source." });
}

async function assertActiveSmartPlan(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, smartPlanId: number | null | undefined) {
  if (!smartPlanId) return;
  const [plan] = await db.select({ id: smartPlans.id }).from(smartPlans).where(and(eq(smartPlans.id, smartPlanId), eq(smartPlans.status, "active"))).limit(1);
  if (!plan) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active Smart Plan or leave this setting blank." });
}

async function assertShortLinkSlugAvailable(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, slug: string) {
  const [link] = await db.select({ id: shortLinks.id }).from(shortLinks).where(eq(shortLinks.slug, slug)).limit(1);
  if (link) throw new TRPCError({ code: "CONFLICT", message: "That public slug is already reserved by a Short Link." });
}

function formFields(blocks: Array<Record<string, unknown>>) {
  const formBlock = blocks.find((block) => block.type === "form");
  const rawFields = (formBlock?.content as Record<string, unknown> | undefined)?.fields;
  const result = z.array(fieldSchema).safeParse(rawFields ?? []);
  return result.success ? result.data : [];
}

function hasCalendarBlock(blocks: Array<Record<string, unknown>>) {
  return blocks.some((block) => block.type === "calendly" && typeof (block.content as Record<string, unknown>)?.url === "string");
}

function cleanText(value: unknown, max = 4000): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, max);
  return cleaned || null;
}

function normalizeEmail(value: unknown): string | null {
  const email = cleanText(value, 320)?.toLowerCase() ?? null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function deviceCategory(userAgent: string | undefined) {
  const ua = (userAgent ?? "").toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet" as const;
  if (/mobile|android|iphone|ipod/.test(ua)) return "mobile" as const;
  if (ua) return "desktop" as const;
  return "other" as const;
}

function trimmedAttribution(value: Attribution) {
  const result: Record<string, string | null> = {};
  for (const key of attributionKeys) result[key] = cleanText(value[key], key.includes("clid") || key === "fbc" || key === "fbp" ? 500 : 255);
  result.landingUrl = cleanText(value.landingUrl, 2000);
  result.deviceCategory = cleanText(value.deviceCategory, 24);
  return result;
}

async function upsertLandingSession(input: { pageId: number; sessionId: string; attribution: Attribution; userAgent?: string }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const page = await db.select({ id: landingPages.id, status: landingPages.status }).from(landingPages).where(eq(landingPages.id, input.pageId)).limit(1);
  if (!page[0] || page[0].status !== "published") throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
  const data = trimmedAttribution(input.attribution);
  const now = new Date();
  const existing = await db.select({ id: landingPageSessions.id }).from(landingPageSessions).where(and(eq(landingPageSessions.landingPageId, input.pageId), eq(landingPageSessions.sessionId, input.sessionId))).limit(1);
  if (existing[0]) {
    await db.update(landingPageSessions).set({ lastTouch: data, lastSeenAt: now }).where(eq(landingPageSessions.id, existing[0].id));
    return { isNew: false };
  }
  await db.insert(landingPageSessions).values({
    landingPageId: input.pageId,
    sessionId: input.sessionId,
    landingUrl: data.landingUrl ?? publicUrl(String(input.pageId)),
    referrerUrl: data.referrerUrl,
    firstTouch: data,
    lastTouch: data,
    deviceCategory: data.deviceCategory ?? deviceCategory(input.userAgent),
    firstViewedAt: now,
    lastSeenAt: now,
  });
  await db.insert(landingPageEvents).values({ landingPageId: input.pageId, sessionId: input.sessionId, eventType: "page_viewed", metadata: data, occurredAt: now });
  return { isNew: true };
}

async function findContactByIdentity(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, email: string | null, phone: string | null) {
  const conditions = [] as ReturnType<typeof eq>[];
  if (email) conditions.push(sql`LOWER(${contacts.email}) = ${email}` as unknown as ReturnType<typeof eq>);
  if (phone) conditions.push(eq(contacts.phone, phone));
  if (!conditions.length) return null;
  const [contact] = await db.select().from(contacts).where(or(...conditions)).limit(1);
  return contact ?? null;
}

function formContactValues(fields: z.infer<typeof fieldSchema>[], answers: Record<string, unknown>) {
  const byType = (type: z.infer<typeof fieldSchema>["type"]) => {
    const field = fields.find((item) => item.type === type);
    return field ? answers[field.id] : undefined;
  };
  return {
    firstName: cleanText(byType("first_name"), 128),
    lastName: cleanText(byType("last_name"), 128),
    email: normalizeEmail(byType("email")),
    phone: normalizeOptionalUsPhone(cleanText(byType("phone"), 32)),
    consent: fields.find((field) => field.type === "sms_consent"),
  };
}

async function intakeLandingLead(input: {
  pageId: number;
  sessionId: string;
  conversionType: "form" | "calendly";
  answers: Record<string, unknown>;
  attribution: Attribution;
  honeypot?: string | null;
  calendlyEventUri?: string | null;
  calendlyInviteeUri?: string | null;
}) {
  if (input.honeypot) return { accepted: true, bot: true, submissionId: 0, contactId: 0, action: "ignored" as const };
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [page] = await db.select().from(landingPages).where(and(eq(landingPages.id, input.pageId), eq(landingPages.status, "published"))).limit(1);
  if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });

  const fields = formFields(page.blocks as Array<Record<string, unknown>>);
  const values = formContactValues(fields, input.answers);
  const nameFallback = cleanText(input.answers.name, 255)?.split(/\s+/) ?? [];
  const firstName = values.firstName ?? nameFallback[0] ?? null;
  const lastName = values.lastName ?? nameFallback.slice(1).join(" ") ?? null;
  if (!firstName || !lastName || (!values.email && !values.phone)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide a first name, last name, and at least an email address or phone number." });
  }

  const contact = await findContactByIdentity(db, values.email, values.phone);
  let contactId: number;
  let action: "created" | "updated" = "created";
  if (contact) {
    contactId = contact.id;
    action = "updated";
    const updates: Record<string, unknown> = {};
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (values.email) updates.email = values.email;
    if (values.phone) updates.phone = values.phone;
    if (!contact.campaignSource && cleanText(input.attribution.utm_campaign, 255)) updates.campaignSource = cleanText(input.attribution.utm_campaign, 255);
    if (Object.keys(updates).length) await db.update(contacts).set(updates).where(eq(contacts.id, contactId));
  } else {
    const [created] = await db.insert(contacts).values({
      firstName,
      lastName,
      email: values.email,
      phone: values.phone,
      leadSourceId: page.leadSourceId,
      campaignSource: cleanText(input.attribution.utm_campaign, 255) ?? cleanText(input.attribution.utm_source, 255),
      isaStatus: "new_lead",
    });
    contactId = Number((created as any).insertId);
    triggerGhlContactSync(contactId);
  }

  const attribution = trimmedAttribution(input.attribution);
  const [submissionResult] = await db.insert(landingPageSubmissions).values({
    landingPageId: page.id,
    sessionId: input.sessionId,
    contactId,
    conversionType: input.conversionType,
    appliedLeadSourceId: page.leadSourceId,
    formAnswers: input.answers,
    rawPayload: { answers: input.answers, calendlyEventUri: input.calendlyEventUri ?? null, calendlyInviteeUri: input.calendlyInviteeUri ?? null },
    attribution,
    calendlyEventUri: input.calendlyEventUri ?? null,
    calendlyInviteeUri: input.calendlyInviteeUri ?? null,
  });
  const submissionId = Number((submissionResult as any).insertId);
  await db.insert(landingPageEvents).values({
    landingPageId: page.id,
    sessionId: input.sessionId,
    submissionId,
    contactId,
    eventType: input.conversionType === "form" ? "form_submitted" : "calendly_booking_created",
    metadata: attribution,
  });

  const consentChecked = values.consent ? input.answers[values.consent.id] === true || input.answers[values.consent.id] === "true" || input.answers[values.consent.id] === "on" : false;
  if (values.consent && consentChecked) {
    const consentLanguage = values.consent.consentLanguage || values.consent.label;
    await db.insert(landingPageSmsConsents).values({ landingPageId: page.id, submissionId, contactId, consented: true, consentLanguage, landingUrl: attribution.landingUrl ?? publicUrl(page.slug) });
    await db.update(contacts).set({ smsMarketingConsentAt: new Date(), smsMarketingConsentSource: `Landing page: ${publicUrl(page.slug)}`, smsMarketingOptedOutAt: null, smsMarketingOptOutReason: null }).where(eq(contacts.id, contactId));
  }

  await logActivity({
    userId: null,
    action: input.conversionType === "form" ? "landing_page_form_submitted" : "landing_page_calendly_booking_created",
    entityType: "contact",
    entityId: contactId,
    relatedContactId: contactId,
    details: { landingPageId: page.id, landingPageName: page.internalName, landingPageUrl: publicUrl(page.slug), submissionId, appliedLeadSourceId: page.leadSourceId, action, attribution, smsConsentRecorded: consentChecked },
  });

  // Direct plan enrollment is optional. Source-triggered enrollment always follows;
  // the shared enrollment function deduplicates plan/contact pairs so a matching plan starts once.
  if (page.smartPlanId) await enrollContactInPlan(contactId, page.smartPlanId);
  await triggerSmartPlansForContact(contactId, page.leadSourceId);

  return { accepted: true, bot: false, submissionId, contactId, action, postSubmitType: page.postSubmitType, postSubmitMessage: page.postSubmitMessage, postSubmitUrl: page.postSubmitUrl };
}

async function fetchCalendlyInvitee(inviteeUri: string) {
  const token = process.env.CALENDLY_API_TOKEN?.trim();
  if (!token) return null;
  if (!/^https:\/\/api\.calendly\.com\/scheduled_events\/[a-zA-Z0-9-]+\/invitees\/[a-zA-Z0-9-]+$/.test(inviteeUri)) return null;
  const response = await fetch(inviteeUri, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) return null;
  const json = await response.json() as { resource?: { name?: string; email?: string; text_reminder_number?: string; questions_and_answers?: Array<{ question?: string; answer?: string }> } };
  return json.resource ?? null;
}

export async function recordCalendlyBooking(input: { pageId: number; sessionId: string; attribution: Attribution; eventUri?: string | null; inviteeUri?: string | null; answers?: Record<string, unknown> }) {
  const remote = input.inviteeUri ? await fetchCalendlyInvitee(input.inviteeUri) : null;
  const nameParts = remote?.name?.trim().split(/\s+/) ?? [];
  const answers: Record<string, unknown> = {
    ...(input.answers ?? {}),
    name: remote?.name ?? input.answers?.name,
    first_name: remote ? nameParts[0] ?? "" : input.answers?.first_name,
    last_name: remote ? nameParts.slice(1).join(" ") : input.answers?.last_name,
    email: remote?.email ?? input.answers?.email,
    phone: remote?.text_reminder_number ?? input.answers?.phone,
    calendly_questions: remote?.questions_and_answers ?? [],
  };
  return intakeLandingLead({ pageId: input.pageId, sessionId: input.sessionId, conversionType: "calendly", answers, attribution: input.attribution, calendlyEventUri: input.eventUri, calendlyInviteeUri: input.inviteeUri });
}

export const landingPagesRouter = router({
  bootstrap: landingPermission("canViewLandingPages").query(async () => {
    const db = await getDb();
    if (!db) return { sources: [], smartPlans: [] };
    const [sources, plans] = await Promise.all([
      db.select({ id: leadSources.id, name: leadSources.name, parentId: leadSources.parentId }).from(leadSources).where(eq(leadSources.isActive, true)).orderBy(leadSources.name),
      db.select({ id: smartPlans.id, name: smartPlans.name }).from(smartPlans).where(eq(smartPlans.status, "active")).orderBy(smartPlans.name),
    ]);
    return { sources, smartPlans: plans };
  }),

  list: landingPermission("canViewLandingPages").query(async () => {
    const db = await getDb();
    if (!db) return [];
    const pages = await db.select({ page: landingPages, sourceName: leadSources.name, lastEditedByName: users.name }).from(landingPages).leftJoin(leadSources, eq(landingPages.leadSourceId, leadSources.id)).leftJoin(users, eq(landingPages.lastEditedById, users.id)).orderBy(desc(landingPages.updatedAt));
    const results = [] as Array<Record<string, unknown>>;
    for (const row of pages) {
      const [sessions, conversions] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(landingPageSessions).where(eq(landingPageSessions.landingPageId, row.page.id)),
        db.select({ count: sql<number>`COUNT(*)` }).from(landingPageSubmissions).where(eq(landingPageSubmissions.landingPageId, row.page.id)),
      ]);
      const visitorSessions = Number(sessions[0]?.count ?? 0);
      const conversionCount = Number(conversions[0]?.count ?? 0);
      results.push({ ...row.page, publicUrl: publicUrl(row.page.slug), sourceName: row.sourceName, lastEditedByName: row.lastEditedByName, visitorSessions, conversions: conversionCount, conversionRate: visitorSessions ? conversionCount / visitorSessions : 0 });
    }
    return results;
  }),

  get: landingPermission("canViewLandingPages").input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [page] = await db.select().from(landingPages).where(eq(landingPages.id, input.id)).limit(1);
    if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
    return { ...page, publicUrl: publicUrl(page.slug) };
  }),

  revisions: landingPermission("canViewLandingPages").input(z.object({ pageId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: landingPageRevisions.id,
      revisionNumber: landingPageRevisions.revisionNumber,
      changeType: landingPageRevisions.changeType,
      snapshot: landingPageRevisions.snapshot,
      createdAt: landingPageRevisions.createdAt,
      createdByName: users.name,
    }).from(landingPageRevisions)
      .leftJoin(users, eq(landingPageRevisions.createdById, users.id))
      .where(eq(landingPageRevisions.landingPageId, input.pageId))
      .orderBy(desc(landingPageRevisions.revisionNumber));
  }),

  restoreRevision: landingPermission("canEditLandingPages").input(z.object({ pageId: z.number().int().positive(), revisionId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [page, revision] = await Promise.all([
      db.select().from(landingPages).where(eq(landingPages.id, input.pageId)).limit(1),
      db.select().from(landingPageRevisions).where(and(eq(landingPageRevisions.id, input.revisionId), eq(landingPageRevisions.landingPageId, input.pageId))).limit(1),
    ]);
    if (!page[0] || page[0].status === "archived" || !revision[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page revision not found." });
    const parsed = pageInput.safeParse(revision[0].snapshot);
    if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "This saved page revision is no longer compatible with the current editor." });
    await assertActiveLeadSource(db, parsed.data.leadSourceId);
    await assertActiveSmartPlan(db, parsed.data.smartPlanId);
    const restored = { ...parsed.data, trackingSettings: normalizeLandingTrackingSettings(parsed.data.trackingSettings), lastEditedById: ctx.user.id };
    await db.update(landingPages).set(restored).where(eq(landingPages.id, page[0].id));
    await createPageRevision(db, { ...page[0], ...restored }, "restored", ctx.user.id);
    await logActivity({ userId: ctx.user.id, action: "landing_page_revision_restored", entityType: "landing_page", entityId: page[0].id, details: { revisionId: revision[0].id, revisionNumber: revision[0].revisionNumber } });
    return { success: true };
  }),

  listRedirects: landingPermission("canViewLandingPages").query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: landingPageRedirects.id,
      sourcePath: landingPageRedirects.sourcePath,
      destinationUrl: landingPageRedirects.destinationUrl,
      status: landingPageRedirects.status,
      redirectType: landingPageRedirects.redirectType,
      preserveQueryParams: landingPageRedirects.preserveQueryParams,
      clickCount: landingPageRedirects.clickCount,
      lastRedirectedAt: landingPageRedirects.lastRedirectedAt,
      createdAt: landingPageRedirects.createdAt,
      updatedAt: landingPageRedirects.updatedAt,
      createdByName: users.name,
    })
      .from(landingPageRedirects)
      .leftJoin(users, eq(landingPageRedirects.createdById, users.id))
      .orderBy(desc(landingPageRedirects.updatedAt));
  }),

  createRedirect: landingPermission("canEditLandingPages").input(redirectInput).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const sourcePath = normalizeRedirectPath(input.sourcePath);
    if (!sourcePath.slice(1).includes("/")) {
      const slug = sourcePath.slice(1);
      const [reserved] = await Promise.all([
        db.select({ id: landingPages.id }).from(landingPages).where(eq(landingPages.slug, slug)).limit(1),
        db.select({ id: shortLinks.id }).from(shortLinks).where(eq(shortLinks.slug, slug)).limit(1),
      ]);
      if (reserved[0] || reserved[1]) throw new TRPCError({ code: "CONFLICT", message: "That path is already reserved by a Landing Page or Short Link." });
    }
    try {
      const result = await db.insert(landingPageRedirects).values({ sourcePath, destinationUrl: assertRedirectDestination(input.destinationUrl), redirectType: input.redirectType, preserveQueryParams: input.preserveQueryParams, status: input.status, createdById: ctx.user.id });
      return { id: Number(result[0].insertId) };
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "A redirect for that path already exists." });
      throw error;
    }
  }),

  updateRedirect: landingPermission("canEditLandingPages").input(z.object({ id: z.number().int().positive(), data: redirectInput.partial() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [existing] = await db.select({ id: landingPageRedirects.id }).from(landingPageRedirects).where(eq(landingPageRedirects.id, input.id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Redirect not found." });
    const data = {
      ...input.data,
      ...(input.data.sourcePath !== undefined ? { sourcePath: normalizeRedirectPath(input.data.sourcePath) } : {}),
      ...(input.data.destinationUrl !== undefined ? { destinationUrl: assertRedirectDestination(input.data.destinationUrl) } : {}),
    };
    const sourcePath = data.sourcePath as string | undefined;
    if (sourcePath && !sourcePath.slice(1).includes("/")) {
      const slug = sourcePath.slice(1);
      const [reserved] = await Promise.all([
        db.select({ id: landingPages.id }).from(landingPages).where(eq(landingPages.slug, slug)).limit(1),
        db.select({ id: shortLinks.id }).from(shortLinks).where(eq(shortLinks.slug, slug)).limit(1),
      ]);
      if (reserved[0] || reserved[1]) throw new TRPCError({ code: "CONFLICT", message: "That path is already reserved by a Landing Page or Short Link." });
    }
    try {
      await db.update(landingPageRedirects).set(data).where(eq(landingPageRedirects.id, input.id));
      return { success: true };
    } catch (error: any) {
      if (error?.code === "ER_DUP_ENTRY") throw new TRPCError({ code: "CONFLICT", message: "A redirect for that path already exists." });
      throw error;
    }
  }),

  create: landingPermission("canCreateLandingPages").input(pageInput.partial().extend({ internalName: z.string().trim().min(1).max(255), leadSourceId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await assertActiveLeadSource(db, input.leadSourceId);
    await assertActiveSmartPlan(db, input.smartPlanId);
    const slug = input.slug || `landing-page-${Date.now().toString(36)}`;
    const [existing] = await db.select({ id: landingPages.id }).from(landingPages).where(eq(landingPages.slug, slug)).limit(1);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "That public slug is already in use." });
    await assertShortLinkSlugAvailable(db, slug);
    const pageValues = {
      internalName: input.internalName,
      slug,
      status: "draft" as const,
      primaryConversionType: input.primaryConversionType ?? "form",
      leadSourceId: input.leadSourceId,
      smartPlanId: input.smartPlanId ?? null,
      pageTitle: input.pageTitle ?? input.internalName,
      metaDescription: input.metaDescription ?? null,
      socialImageUrl: input.socialImageUrl ?? null,
      trackingSettings: normalizeLandingTrackingSettings(input.trackingSettings),
      noindex: input.noindex ?? false,
      postSubmitType: input.postSubmitType ?? "inline",
      postSubmitMessage: input.postSubmitMessage ?? "Thank you. A Savvy STR Agent will be in touch shortly.",
      postSubmitUrl: input.postSubmitUrl ?? null,
      pageSettings: input.pageSettings ?? { background: "#ffffff", textColor: "#0f172a", accentColor: "#0d96a5" },
      blocks: input.blocks ?? starterBlocks(),
      createdById: ctx.user.id,
      lastEditedById: ctx.user.id,
    };
    const [result] = await db.insert(landingPages).values(pageValues);
    const id = Number((result as any).insertId);
    await createPageRevision(db, { id, ...pageValues }, "created", ctx.user.id);
    await logActivity({ userId: ctx.user.id, action: "landing_page_created", entityType: "landing_page", entityId: id, details: { internalName: input.internalName, slug } });
    return { id, publicUrl: publicUrl(slug) };
  }),

  update: landingPermission("canEditLandingPages").input(z.object({ id: z.number().int().positive(), data: pageInput.partial() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [existing] = await db.select().from(landingPages).where(eq(landingPages.id, input.id)).limit(1);
    if (!existing || existing.status === "archived") throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
    if (input.data.leadSourceId) await assertActiveLeadSource(db, input.data.leadSourceId);
    await assertActiveSmartPlan(db, input.data.smartPlanId);
    if (input.data.slug && input.data.slug !== existing.slug) {
      const [collision] = await db.select({ id: landingPages.id }).from(landingPages).where(eq(landingPages.slug, input.data.slug)).limit(1);
      if (collision) throw new TRPCError({ code: "CONFLICT", message: "That public slug is already in use." });
      await assertShortLinkSlugAvailable(db, input.data.slug);
    }
    const data = {
      ...input.data,
      ...(input.data.trackingSettings !== undefined ? { trackingSettings: normalizeLandingTrackingSettings(input.data.trackingSettings) } : {}),
      lastEditedById: ctx.user.id,
    } as Record<string, unknown>;
    await db.update(landingPages).set(data).where(eq(landingPages.id, input.id));
    await createPageRevision(db, { ...existing, ...data, id: existing.id }, "saved", ctx.user.id);
    await logActivity({ userId: ctx.user.id, action: "landing_page_updated", entityType: "landing_page", entityId: input.id, details: { slug: input.data.slug ?? existing.slug, slugChanged: input.data.slug ? input.data.slug !== existing.slug : false } });
    return { success: true, slugChanged: input.data.slug ? input.data.slug !== existing.slug : false };
  }),

  duplicate: landingPermission("canCreateLandingPages").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [existing] = await db.select().from(landingPages).where(eq(landingPages.id, input.id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
    let slug = `${existing.slug}-copy`;
    let suffix = 2;
    while (
      (await db.select({ id: landingPages.id }).from(landingPages).where(eq(landingPages.slug, slug)).limit(1))[0]
      || (await db.select({ id: shortLinks.id }).from(shortLinks).where(eq(shortLinks.slug, slug)).limit(1))[0]
    ) slug = `${existing.slug}-copy-${suffix++}`;
    const [result] = await db.insert(landingPages).values({ ...existing, id: undefined, internalName: `${existing.internalName} (Copy)`, slug, status: "draft", publishedAt: null, archivedAt: null, createdById: ctx.user.id, lastEditedById: ctx.user.id, createdAt: undefined, updatedAt: undefined });
    const id = Number((result as any).insertId);
    await createPageRevision(db, { ...existing, id, internalName: `${existing.internalName} (Copy)`, slug, status: "draft", publishedAt: null, archivedAt: null, createdById: ctx.user.id, lastEditedById: ctx.user.id }, "duplicated", ctx.user.id);
    await logActivity({ userId: ctx.user.id, action: "landing_page_duplicated", entityType: "landing_page", entityId: id, details: { duplicatedFromId: existing.id, slug } });
    return { id, publicUrl: publicUrl(slug) };
  }),

  publish: landingPermission("canPublishLandingPages").input(z.object({ id: z.number().int().positive(), confirmSlug: z.string().trim().min(2).max(120) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [page] = await db.select().from(landingPages).where(eq(landingPages.id, input.id)).limit(1);
    if (!page || page.status === "archived") throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
    if (page.slug !== input.confirmSlug) throw new TRPCError({ code: "BAD_REQUEST", message: "Confirm the exact public slug before publishing." });
    if (page.primaryConversionType === "form" && !formFields(page.blocks as Array<Record<string, unknown>>).length) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a Form block before publishing this page." });
    if (page.primaryConversionType === "calendly" && !hasCalendarBlock(page.blocks as Array<Record<string, unknown>>)) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a Calendly block before publishing this page." });
    const publishedAt = new Date();
    await db.update(landingPages).set({ status: "published", publishedAt, lastEditedById: ctx.user.id }).where(eq(landingPages.id, page.id));
    await createPageRevision(db, { ...page, status: "published", publishedAt, lastEditedById: ctx.user.id }, "published", ctx.user.id);
    await logActivity({ userId: ctx.user.id, action: "landing_page_published", entityType: "landing_page", entityId: page.id, details: { slug: page.slug, publicUrl: publicUrl(page.slug) } });
    return { success: true, publicUrl: publicUrl(page.slug) };
  }),

  unpublish: landingPermission("canPublishLandingPages").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await db.update(landingPages).set({ status: "unpublished", lastEditedById: ctx.user.id }).where(eq(landingPages.id, input.id));
    await logActivity({ userId: ctx.user.id, action: "landing_page_unpublished", entityType: "landing_page", entityId: input.id });
    return { success: true };
  }),

  archive: landingPermission("canArchiveLandingPages").input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await db.update(landingPages).set({ status: "archived", archivedAt: new Date(), lastEditedById: ctx.user.id }).where(eq(landingPages.id, input.id));
    await logActivity({ userId: ctx.user.id, action: "landing_page_archived", entityType: "landing_page", entityId: input.id });
    return { success: true };
  }),

  attributedContacts: landingPermission("canViewLandingPages").input(z.object({ pageId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ contactId: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, submissionId: landingPageSubmissions.id, conversionType: landingPageSubmissions.conversionType, createdAt: landingPageSubmissions.createdAt }).from(landingPageSubmissions).innerJoin(contacts, eq(landingPageSubmissions.contactId, contacts.id)).where(eq(landingPageSubmissions.landingPageId, input.pageId)).orderBy(desc(landingPageSubmissions.createdAt));
  }),

  report: landingPermission("canViewLandingPages").input(z.object({ pageId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { sessions: 0, formSubmissions: 0, calendlyBookings: 0, conversions: 0, conversionRate: 0, byUtm: [] };
    const [sessions, forms, bookings] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(landingPageSessions).where(eq(landingPageSessions.landingPageId, input.pageId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(landingPageSubmissions).where(and(eq(landingPageSubmissions.landingPageId, input.pageId), eq(landingPageSubmissions.conversionType, "form"))),
      db.select({ count: sql<number>`COUNT(*)` }).from(landingPageSubmissions).where(and(eq(landingPageSubmissions.landingPageId, input.pageId), eq(landingPageSubmissions.conversionType, "calendly"))),
    ]);
    const sessionCount = Number(sessions[0]?.count ?? 0);
    const formSubmissions = Number(forms[0]?.count ?? 0);
    const calendlyBookings = Number(bookings[0]?.count ?? 0);
    const byUtm = await db.select({ source: sql<string>`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${landingPageSubmissions.attribution}, '$.utm_source')), '(direct)')`, campaign: sql<string>`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${landingPageSubmissions.attribution}, '$.utm_campaign')), '(not set)')`, leads: sql<number>`COUNT(*)` }).from(landingPageSubmissions).where(eq(landingPageSubmissions.landingPageId, input.pageId)).groupBy(sql`source`, sql`campaign`).orderBy(desc(sql`leads`));
    return { sessions: sessionCount, formSubmissions, calendlyBookings, conversions: formSubmissions + calendlyBookings, conversionRate: sessionCount ? (formSubmissions + calendlyBookings) / sessionCount : 0, byUtm };
  }),

  getPublicPage: publicProcedure.input(z.object({ slug: z.string().trim().toLowerCase().min(2).max(120) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "NOT_FOUND" });
    const [page] = await db.select({ id: landingPages.id, slug: landingPages.slug, pageTitle: landingPages.pageTitle, metaDescription: landingPages.metaDescription, socialImageUrl: landingPages.socialImageUrl, trackingSettings: landingPages.trackingSettings, noindex: landingPages.noindex, postSubmitType: landingPages.postSubmitType, postSubmitMessage: landingPages.postSubmitMessage, postSubmitUrl: landingPages.postSubmitUrl, pageSettings: landingPages.pageSettings, blocks: landingPages.blocks, primaryConversionType: landingPages.primaryConversionType }).from(landingPages).where(and(eq(landingPages.slug, input.slug), eq(landingPages.status, "published"))).limit(1);
    if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Landing page not found." });
    return { ...page, trackingSettings: normalizeLandingTrackingSettings(page.trackingSettings), publicUrl: publicUrl(page.slug) };
  }),

  trackVisit: publicProcedure.input(z.object({ pageId: z.number().int().positive(), sessionId: z.string().uuid(), attribution: publicAttributionSchema })).mutation(async ({ input, ctx }) => {
    const result = await upsertLandingSession({ pageId: input.pageId, sessionId: input.sessionId, attribution: input.attribution, userAgent: ctx.req.headers["user-agent"] });
    return { ok: true, ...result };
  }),

  submitForm: publicProcedure.input(z.object({ pageId: z.number().int().positive(), sessionId: z.string().uuid(), answers: z.record(z.string(), z.unknown()), attribution: publicAttributionSchema, honeypot: z.string().max(0).optional() })).mutation(async ({ input }) => {
    return intakeLandingLead({ pageId: input.pageId, sessionId: input.sessionId, conversionType: "form", answers: input.answers, attribution: input.attribution, honeypot: input.honeypot });
  }),

  recordCalendlyBooking: publicProcedure.input(z.object({ pageId: z.number().int().positive(), sessionId: z.string().uuid(), eventUri: z.string().url().optional(), inviteeUri: z.string().url().optional(), answers: z.record(z.string(), z.unknown()).optional(), attribution: publicAttributionSchema })).mutation(async ({ input }) => {
    return recordCalendlyBooking({ pageId: input.pageId, sessionId: input.sessionId, eventUri: input.eventUri, inviteeUri: input.inviteeUri, answers: input.answers, attribution: input.attribution });
  }),
});

export const LANDING_PAGE_PUBLIC_TRPC_PATHS = new Set([
  "landingPages.getPublicPage",
  "landingPages.trackVisit",
  "landingPages.submitForm",
  "landingPages.recordCalendlyBooking",
]);
