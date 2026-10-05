import { eq } from "drizzle-orm";

import { marketProfiles, marketZipCodes, properties, websiteCaseStudies, websiteProperties } from "../drizzle/schema";
import { isCaseStudyLeadPath } from "@shared/websiteLeadSources";
import { WEBSITE_BASE_PATH } from "./websiteSeoPages";

/**
 * Financing requests from the website, passed on to the lending partners.
 *
 * The old savvy-agents.com (savvy-web, submitFinancingLead in
 * src/app/(public)/properties/[slug]/actions.ts) posted every "Explore
 * financing" click to two outside systems:
 *
 *  1. The STR lender's lead webhook (MyStrHomeLoan), with an
 *     x-api-key header: name, email, phone, tags ["buyer", "STR"] and the
 *     market, property URL and property address under several key spellings.
 *  2. A second inbound leads API on a bare IP (commented in the old code as
 *     "Robbu + Second Integration"; the commits that added it say Rabbu and
 *     BiggerPockets), with a Bearer token: name, email, phone, the same tags,
 *     and the market and budget.
 *
 * The new site's financing buttons (property page and case study) land in
 * website.submitLead, which calls queueFinancingPartnerFeed. The send happens
 * after the visitor has their answer and never fails or slows their form.
 *
 * Configuration, all from the environment (nothing here has a default):
 *
 *  FINANCING_PARTNER_FEED_ENABLED   "on" or "true" to send. Anything else, or
 *                                   unset, sends nothing.
 *  FINANCING_PARTNER_MSTR_URL       The lender's lead webhook URL.
 *  FINANCING_PARTNER_MSTR_API_KEY   Its x-api-key.
 *  FINANCING_PARTNER_INBOUND_URL    The second inbound leads API URL.
 *  FINANCING_PARTNER_INBOUND_TOKEN  Its Bearer token.
 *  FINANCING_PARTNER_ALLOW_HTTP     "on" or "true" to allow a partner URL
 *                                   that is not https (logged as a warning
 *                                   on every send). Otherwise such a partner
 *                                   is refused and skipped.
 *  FINANCING_PARTNER_DAILY_CAP      Most partner sends per day (Eastern),
 *                                   default 50. Past it, requests are logged
 *                                   and skipped.
 *
 * A partner whose URL or key is missing is skipped with a warning; the other
 * still gets the lead.
 *
 * A case study is somebody's purchase, not a listing for sale, and its page
 * never shows the street address. So a financing request from a case study
 * carries the market, the case study's title and its page URL, never the
 * street address of the property behind it, and no budget (the case study's
 * old price is not what this visitor wants to borrow against).
 */

export const FINANCING_PARTNER_TIMEOUT_MS = 10_000;
export const FINANCING_PARTNER_ACTION = "financing_partner_feed";
/** Timeline action for a request the daily cap held back. */
export const FINANCING_PARTNER_SKIPPED_ACTION = "financing_partner_feed_skipped";
export const FINANCING_PARTNER_DEFAULT_DAILY_CAP = 50;
const TAGS = ["buyer", "STR"];

export type PartnerKey = "mstr" | "inbound";
export const PARTNER_LABELS: Record<PartnerKey, string> = {
  mstr: "mystrhomeloan",
  inbound: "inbound",
};

type Env = Record<string, string | undefined>;

export type FinancingPartnerConfig = {
  enabled: boolean;
  mstr: { url: string; apiKey: string } | null;
  inbound: { url: string; token: string } | null;
  /** Names (never values) of settings that are needed and not set. */
  missing: string[];
  /** URL settings refused because they are not https (names only). */
  refused: string[];
  /** URL settings that are not https but allowed by FINANCING_PARTNER_ALLOW_HTTP. */
  insecureAllowed: string[];
  dailyCap: number;
};

/**
 * A partner URL may only be used over https, unless FINANCING_PARTNER_ALLOW_HTTP
 * is on: the request carries a key and a person's name, email and phone.
 */
export function partnerUrlStatus(url: string, allowHttp: boolean): "ok" | "insecure-allowed" | "refused" {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "refused";
  }
  if (parsed.protocol === "https:") return "ok";
  if (parsed.protocol === "http:" && allowHttp) return "insecure-allowed";
  return "refused";
}

export function financingDailyCap(value: string | undefined): number {
  const parsed = Number((value ?? "").trim());
  return (value ?? "").trim() !== "" && Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : FINANCING_PARTNER_DEFAULT_DAILY_CAP;
}

export function financingFeedEnabled(value: string | undefined): boolean {
  const flag = (value ?? "").trim().toLowerCase();
  return flag === "on" || flag === "true";
}

export function readFinancingPartnerConfig(env: Env = process.env): FinancingPartnerConfig {
  const read = (name: string) => (env[name] ?? "").trim();
  const missing: string[] = [];
  const refused: string[] = [];
  const insecureAllowed: string[] = [];
  const allowHttp = financingFeedEnabled(env.FINANCING_PARTNER_ALLOW_HTTP);
  const pair = (urlName: string, keyName: string) => {
    const url = read(urlName);
    const key = read(keyName);
    if (!url) missing.push(urlName);
    if (!key) missing.push(keyName);
    if (!url || !key) return null;
    const status = partnerUrlStatus(url, allowHttp);
    if (status === "refused") {
      refused.push(urlName);
      return null;
    }
    if (status === "insecure-allowed") insecureAllowed.push(urlName);
    return { url, key };
  };
  const mstr = pair("FINANCING_PARTNER_MSTR_URL", "FINANCING_PARTNER_MSTR_API_KEY");
  const inbound = pair("FINANCING_PARTNER_INBOUND_URL", "FINANCING_PARTNER_INBOUND_TOKEN");
  return {
    enabled: financingFeedEnabled(env.FINANCING_PARTNER_FEED_ENABLED),
    mstr: mstr ? { url: mstr.url, apiKey: mstr.key } : null,
    inbound: inbound ? { url: inbound.url, token: inbound.key } : null,
    missing,
    refused,
    insecureAllowed,
    dailyCap: financingDailyCap(env.FINANCING_PARTNER_DAILY_CAP),
  };
}

/** What the partners are told about one financing request. */
export type FinancingLeadContext = {
  name: string;
  email: string;
  phone: string | null;
  market: string | null;
  pageUrl: string | null;
  /** Street address. Always null for a case study. */
  propertyAddress: string | null;
  /** List price in dollars, for the inbound API's budget. */
  price: number | null;
  /** The case study's title, when the request came from one. */
  caseStudyTitle: string | null;
};

/** "$450k" from 450000, as the old site meant to send it. */
export function formatBudget(price: number | null | undefined): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return `$${(price / 1000).toFixed(0)}k`;
}

export function buildMstrPayload(lead: FinancingLeadContext) {
  const customFields: Record<string, string> = {};
  if (lead.market) customFields.market = lead.market;
  if (lead.pageUrl) {
    customFields.property_url = lead.pageUrl;
    customFields.propertyUrl = lead.pageUrl;
    customFields["Property URL"] = lead.pageUrl;
  }
  if (lead.propertyAddress) {
    customFields.property_address = lead.propertyAddress;
    customFields.propertyAddress = lead.propertyAddress;
    customFields["property address"] = lead.propertyAddress;
  }
  if (lead.caseStudyTitle) customFields.case_study = lead.caseStudyTitle;
  return {
    name: lead.name,
    email: lead.email,
    ...(lead.phone ? { phone: lead.phone } : {}),
    tags: [...TAGS],
    custom_fields: customFields,
  };
}

export function buildInboundPayload(lead: FinancingLeadContext) {
  const customFields: Record<string, string> = {};
  if (lead.market) customFields.market = lead.market;
  const budget = lead.caseStudyTitle ? null : formatBudget(lead.price);
  if (budget) customFields.budget = budget;
  return {
    tags: [...TAGS],
    ...(lead.phone ? { phone: lead.phone } : {}),
    ...(lead.name ? { name: lead.name } : {}),
    ...(lead.email ? { email: lead.email } : {}),
    ...(Object.keys(customFields).length ? { custom_fields: customFields } : {}),
  };
}

/** "ok", an HTTP status such as "502", "timeout", "error" or "not configured". */
export type PartnerOutcome = string;
export type PartnerResults = Record<PartnerKey, PartnerOutcome>;

async function post(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<PartnerOutcome> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Drain the body so the connection is released; its contents are not kept.
    await response.text().catch(() => "");
    return response.ok ? "ok" : String(response.status);
  } catch (error: any) {
    const name = error?.name ?? "";
    return name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
  }
}

/** Post one lead to both partners, side by side. Never throws. */
export async function sendToFinancingPartners(
  lead: FinancingLeadContext,
  options: { config: FinancingPartnerConfig; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<PartnerResults> {
  const { config } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FINANCING_PARTNER_TIMEOUT_MS;
  const [mstr, inbound] = await Promise.all([
    config.mstr
      ? post(fetchImpl, config.mstr.url, { "x-api-key": config.mstr.apiKey }, buildMstrPayload(lead), timeoutMs)
      : Promise.resolve("not configured"),
    config.inbound
      ? post(
          fetchImpl,
          config.inbound.url,
          { Authorization: `Bearer ${config.inbound.token}` },
          buildInboundPayload(lead),
          timeoutMs
        )
      : Promise.resolve("not configured"),
  ]);
  return { mstr, inbound };
}

export function summarizePartnerResults(results: PartnerResults): string {
  const parts = (Object.keys(PARTNER_LABELS) as PartnerKey[]).map(key => `${PARTNER_LABELS[key]} ${results[key]}`);
  return `Financing request sent to lender partners: ${parts.join(", ")}`;
}

export type FinancingFeedInput = {
  requestType?: string | null;
  contactId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  propertyId?: number | null;
  sourcePath?: string | null;
};

/** What the database knows about the page the request came from. */
export type FinancingPageFacts = {
  property: {
    address: string | null;
    city: string | null;
    state: string | null;
    listPrice: number | null;
    slug: string | null;
  } | null;
  marketName: string | null;
  caseStudy: { title: string; slug: string } | null;
};

function publicOrigin(env: Env): string {
  const host = (env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").trim().toLowerCase();
  return `https://${host}`;
}

/** A site path from the visitor's browser, only if it looks like one. */
function safePath(sourcePath: string | null | undefined): string | null {
  const value = (sourcePath ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || /\s/.test(value)) return null;
  return value;
}

export function caseStudySlugFromPath(sourcePath: string | null | undefined): string | null {
  const match = /\/case-studies\/([^/?#]+)/i.exec(sourcePath ?? "");
  return match ? decodeURIComponent(match[1]) : null;
}

/** The partners' view of the request. Pure: no database, no network. */
export function financingLeadContext(
  input: FinancingFeedInput,
  facts: FinancingPageFacts,
  env: Env = process.env
): FinancingLeadContext {
  const fromCaseStudy = isCaseStudyLeadPath(input.sourcePath);
  const origin = publicOrigin(env);
  const property = facts.property;
  const place = property ? [property.city, property.state].filter(Boolean).join(", ") || null : null;
  const path = safePath(input.sourcePath);
  let pageUrl: string | null = path ? `${origin}${path}` : null;
  if (!pageUrl) {
    if (fromCaseStudy && facts.caseStudy) pageUrl = `${origin}${WEBSITE_BASE_PATH}/case-studies/${facts.caseStudy.slug}`;
    else if (!fromCaseStudy && property?.slug) pageUrl = `${origin}${WEBSITE_BASE_PATH}/properties/${property.slug}`;
  }
  return {
    name: `${input.firstName} ${input.lastName}`.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    market: facts.marketName || place,
    pageUrl,
    propertyAddress:
      fromCaseStudy || !property
        ? null
        : [property.address, property.city, property.state].filter(Boolean).join(", ") || null,
    price: fromCaseStudy ? null : property?.listPrice ?? null,
    caseStudyTitle: fromCaseStudy ? facts.caseStudy?.title ?? null : null,
  };
}

/** Read the property, its market and (for a case study) the case study. */
export async function loadFinancingPageFacts(db: any, input: FinancingFeedInput): Promise<FinancingPageFacts> {
  let caseStudy: FinancingPageFacts["caseStudy"] = null;
  let propertyId = input.propertyId ?? null;
  if (isCaseStudyLeadPath(input.sourcePath)) {
    const slug = caseStudySlugFromPath(input.sourcePath);
    if (slug) {
      const [row] = await db
        .select({ title: websiteCaseStudies.title, slug: websiteCaseStudies.slug, propertyId: websiteCaseStudies.propertyId })
        .from(websiteCaseStudies)
        .where(eq(websiteCaseStudies.slug, slug))
        .limit(1);
      if (row) {
        caseStudy = { title: row.title, slug: row.slug };
        propertyId = row.propertyId ?? propertyId;
      }
    }
  }
  let property: FinancingPageFacts["property"] = null;
  let marketName: string | null = null;
  if (propertyId) {
    const [row] = await db
      .select({
        address: properties.address,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        listPrice: properties.listPrice,
        slug: websiteProperties.slug,
      })
      .from(properties)
      .leftJoin(websiteProperties, eq(websiteProperties.propertyId, properties.id))
      .where(eq(properties.id, propertyId))
      .limit(1);
    if (row) {
      const price = row.listPrice == null ? null : Number(row.listPrice);
      property = {
        address: row.address ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        listPrice: price != null && Number.isFinite(price) ? price : null,
        slug: row.slug ?? null,
      };
      const zip = String(row.zip ?? "").trim().slice(0, 5);
      if (/^\d{5}$/.test(zip)) {
        const [market] = await db
          .select({ name: marketProfiles.name })
          .from(marketZipCodes)
          .innerJoin(marketProfiles, eq(marketZipCodes.marketProfileId, marketProfiles.id))
          .where(eq(marketZipCodes.zipCode, zip))
          .limit(1);
        marketName = market?.name ?? null;
      }
    }
  }
  return { property, marketName, caseStudy };
}

export type FinancingFeedDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
  loadFacts: (input: FinancingFeedInput) => Promise<FinancingPageFacts>;
  /** Writes one contact timeline entry. */
  logTimeline: (entry: {
    action: string;
    entityType: "contact";
    entityId: number;
    relatedContactId: number;
    userId: null;
    details: Record<string, unknown>;
  }) => Promise<unknown>;
  /**
   * How many requests were already sent to the partners today (Eastern).
   * Missing, or failing, falls back to this server's own count.
   */
  countSentToday?: () => Promise<number>;
  warn?: (message: string) => void;
};

/**
 * Send one website financing request to the partners and note the outcome on
 * the contact's timeline. Does nothing unless the request is a financing one
 * and the feed is switched on. Never throws.
 */
export async function runFinancingPartnerFeed(
  input: FinancingFeedInput,
  deps: FinancingFeedDeps
): Promise<PartnerResults | null> {
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  try {
    if (input.requestType !== "financing") return null;
    const config = readFinancingPartnerConfig(deps.env ?? process.env);
    if (!config.enabled) return null;
    if (config.missing.length) {
      warn(`[FinancingPartnerFeed] Not set: ${config.missing.join(", ")}. Those partners are skipped.`);
    }
    if (config.refused.length) {
      warn(
        `[FinancingPartnerFeed] Refused ${config.refused.join(", ")}: not an https URL. ` +
          "Set FINANCING_PARTNER_ALLOW_HTTP=on to allow it. Those partners are skipped."
      );
    }
    if (config.insecureAllowed.length) {
      warn(
        `[FinancingPartnerFeed] Sending over plain http to ${config.insecureAllowed.join(", ")} ` +
          "because FINANCING_PARTNER_ALLOW_HTTP is on. The key and the lead are not encrypted in transit."
      );
    }
    if (!config.mstr && !config.inbound) return null;
    // Daily cap: a burst of spam that gets past the form's throttle must not
    // turn into a burst of leads at the lender.
    const sentToday = await countSentToday(deps);
    if (sentToday >= config.dailyCap) {
      warn(`[FinancingPartnerFeed] Daily cap of ${config.dailyCap} reached (${sentToday} sent today). Skipped.`);
      if (input.contactId) {
        await deps
          .logTimeline({
            userId: null,
            action: FINANCING_PARTNER_SKIPPED_ACTION,
            entityType: "contact",
            entityId: input.contactId,
            relatedContactId: input.contactId,
            details: {
              summary: `Not sent to lender partners: the daily cap of ${config.dailyCap} was reached`,
              dailyCap: config.dailyCap,
              via: "savvy-website",
            },
          })
          .catch(error => warn(`[FinancingPartnerFeed] Timeline entry not written: ${error?.message ?? error}`));
      }
      return null;
    }
    recordLocalSend();
    const facts = await deps.loadFacts(input).catch(error => {
      warn(`[FinancingPartnerFeed] Could not read the page details: ${error?.message ?? error}`);
      return { property: null, marketName: null, caseStudy: null } as FinancingPageFacts;
    });
    const lead = financingLeadContext(input, facts, deps.env ?? process.env);
    const results = await sendToFinancingPartners(lead, { config, fetchImpl: deps.fetchImpl });
    const summary = summarizePartnerResults(results);
    if (results.mstr !== "ok" || results.inbound !== "ok") warn(`[FinancingPartnerFeed] ${summary}`);
    if (input.contactId) {
      await deps
        .logTimeline({
          userId: null,
          action: FINANCING_PARTNER_ACTION,
          entityType: "contact",
          entityId: input.contactId,
          relatedContactId: input.contactId,
          details: {
            summary,
            partners: { [PARTNER_LABELS.mstr]: results.mstr, [PARTNER_LABELS.inbound]: results.inbound },
            fromCaseStudy: isCaseStudyLeadPath(input.sourcePath),
            propertyId: input.propertyId ?? null,
            via: "savvy-website",
          },
        })
        .catch(error => warn(`[FinancingPartnerFeed] Timeline entry not written: ${error?.message ?? error}`));
    }
    return results;
  } catch (error: any) {
    warn(`[FinancingPartnerFeed] Failed: ${error?.message ?? error}`);
    return null;
  }
}

/** This server's own count of partner sends per Eastern day, the floor for the cap. */
const localSends = { day: "", count: 0 };
function easternDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}
function recordLocalSend(): void {
  const day = easternDay();
  if (localSends.day !== day) {
    localSends.day = day;
    localSends.count = 0;
  }
  localSends.count += 1;
}
function localSendsToday(): number {
  return localSends.day === easternDay() ? localSends.count : 0;
}
/** For tests. */
export function resetLocalFinancingSendCount(): void {
  localSends.day = "";
  localSends.count = 0;
}
async function countSentToday(deps: FinancingFeedDeps): Promise<number> {
  const local = localSendsToday();
  if (!deps.countSentToday) return local;
  try {
    return Math.max(local, Number(await deps.countSentToday()) || 0);
  } catch {
    return local;
  }
}

/** Midnight Eastern today, as a Date, for counting today's sends. */
export function startOfEasternDay(now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map(part => [part.type, part.value])
  ) as Record<string, string>;
  const hour = Number(parts.hour) % 24;
  const secondsIntoDay = hour * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return new Date(Math.floor(now.getTime() / 1000) * 1000 - secondsIntoDay * 1000);
}

/**
 * Fire and forget, after the visitor's response: the form never waits on, or
 * fails because of, a partner.
 */
export function queueFinancingPartnerFeed(input: FinancingFeedInput, deps: FinancingFeedDeps): void {
  if (input.requestType !== "financing") return;
  setImmediate(() => {
    void runFinancingPartnerFeed(input, deps);
  });
}
