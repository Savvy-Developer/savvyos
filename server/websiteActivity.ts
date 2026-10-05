import { eq } from "drizzle-orm";

import { activityLog, contacts, marketProfiles, properties, websiteBlogPosts } from "../drizzle/schema";
import { WEBSITE_ACCOUNT_LEAD_SOURCE } from "@shared/websiteLeadSources";
import {
  WEBSITE_SHARE_CHANNEL_LABELS,
  describeSearch,
  isEmptySearch,
  normalizeSearchCriteria,
  searchSignature,
  type WebsiteSearchCriteria,
  type WebsiteSearchSource,
  type WebsiteShareChannel,
  type WebsiteShareTarget,
} from "@shared/websiteSearchShareActivity";
import { SlidingWindowThrottle, type ThrottleRule } from "./websiteAccountThrottle";
import { websiteLeadSourceId } from "./websiteLeadSources";
import { triggerSmartPlansForContact } from "./smartPlanScheduler";

/**
 * What an investor does on the new website, written to the SavvyOS contact
 * timeline under the action names the old site's webhook used.
 *
 * The old savvy-agents.com posted every sign-up, property view, favourite and
 * request to SavvyOS (see SAVVY_WEB_EVENTS in webhookHandlers.ts). Hot Leads,
 * lead scores, the daily agent report and the custom reports all read those
 * actions off the activity log. The new site kept the same things in its own
 * tables only, so a favourite never reached the contact, and a request was
 * logged as "website_inquiry_submitted", which none of those readers count.
 *
 * Everything here is best effort. The visitor's click has already worked by
 * the time this runs, and a logging problem must never fail it.
 */

export const WEBSITE_ACTIVITY_VIA = "savvy-website";

/** A reload or a quick back-and-forward is one visit, not several. */
export const REPEAT_VIEW_QUIET_MS = 30 * 60_000;

export type WebsiteAccountIdentity = {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  /** Set by staff only. Never written from here: see myTransactions. */
  contactId?: number | null;
};

export type WebsiteAccountAction = "user_registered" | "property_viewed" | "property_favorited";

export type WebsiteRequestAction =
  | "showing_requested"
  | "analysis_requested"
  | "financing_requested"
  | "property_contact_requested";

/**
 * The old site's action for a new-site form, or null when the form has no
 * equivalent (a general, buy or sell enquiry stays a plain website inquiry).
 * The three request buttons map one to one. A message sent from a property
 * page with no request type is the old "Message Agent" button.
 */
export function websiteRequestAction(input: {
  requestType?: string | null;
  intent?: string | null;
  propertyId?: number | null;
}): WebsiteRequestAction | null {
  const request = (input.requestType ?? "").trim().toLowerCase();
  if (request === "showing") return "showing_requested";
  if (request === "analysis") return "analysis_requested";
  if (request === "financing") return "financing_requested";
  const intent = (input.intent ?? "").trim().toLowerCase();
  if (intent === "property" && input.propertyId) return "property_contact_requested";
  return null;
}

/** Whether this view is the same visit as the last one recorded. */
export function isRepeatView(
  lastViewedAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastViewedAt) return false;
  const last = lastViewedAt instanceof Date ? lastViewedAt : new Date(lastViewedAt);
  const elapsed = now.getTime() - last.getTime();
  if (!Number.isFinite(elapsed)) return false;
  // A minute of slack for a database clock that runs slightly ahead.
  return elapsed > -60_000 && elapsed < REPEAT_VIEW_QUIET_MS;
}

/** A name for a contact whose account gave none, from the email address. */
export function nameForAccount(account: WebsiteAccountIdentity): { firstName: string; lastName: string } {
  const firstName = (account.firstName ?? "").trim();
  const lastName = (account.lastName ?? "").trim();
  if (firstName) return { firstName: firstName.slice(0, 128), lastName: lastName.slice(0, 128) };
  const local = account.email.split("@")[0] ?? "";
  const words = local
    .split(/[._+-]+/)
    .map(word => word.replace(/[^a-zA-Z]/g, ""))
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return {
    firstName: (words[0] || "Website").slice(0, 128),
    lastName: (lastName || words.slice(1).join(" ") || "").slice(0, 128),
  };
}

/**
 * The SavvyOS contact for an account: the one staff linked, else the contact
 * with the same email. Read only. It never sets websiteAccounts.contactId,
 * because that link is what lets an account see transactions and signing up
 * does not prove someone owns the address.
 */
export async function contactIdForAccount(db: any, account: WebsiteAccountIdentity): Promise<number | null> {
  if (account.contactId) return account.contactId;
  const email = account.email.trim().toLowerCase();
  if (!email) return null;
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.email, email))
    .limit(1);
  return row?.id ?? null;
}

/**
 * A new contact for an account that has none, as the old site made on
 * registration or a first favourite. Filed under "Savvy-Agents.com > Account
 * Sign-up" so it is not mistaken for a form enquiry, and Smart Plans start as
 * they do for every other new website contact.
 */
async function createContactForAccount(db: any, account: WebsiteAccountIdentity): Promise<number | null> {
  const { firstName, lastName } = nameForAccount(account);
  const leadSourceId = await websiteLeadSourceId(db, WEBSITE_ACCOUNT_LEAD_SOURCE);
  const inserted = await db.insert(contacts).values({
    firstName,
    lastName,
    email: account.email.trim().toLowerCase(),
    phone: account.phone || null,
    ...(leadSourceId ? { leadSourceId } : {}),
    leadSourceType: "organic",
    isaStatus: "new_lead",
    tags: ["Savvy website"],
    notes: "Created an account on the Savvy website",
  });
  const contactId = Number((inserted as any)?.[0]?.insertId);
  if (!Number.isInteger(contactId) || contactId <= 0) return null;
  await db.insert(activityLog).values({
    userId: null,
    action: "contact_created",
    entityType: "contact",
    entityId: contactId,
    relatedContactId: contactId,
    details: { via: WEBSITE_ACTIVITY_VIA, reason: "website_account" },
  });
  if (leadSourceId) {
    await triggerSmartPlansForContact(contactId, leadSourceId).catch(error =>
      console.error("[SmartPlan] Website account enrollment failed for contact", contactId, error)
    );
  }
  return contactId;
}

type PropertyPlace = {
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyState: string | null;
  propertyZip: string | null;
};

async function propertyPlace(db: any, propertyId: number | null | undefined): Promise<PropertyPlace> {
  const empty = { propertyAddress: null, propertyCity: null, propertyState: null, propertyZip: null };
  if (!propertyId) return empty;
  const [row] = await db
    .select({
      address: properties.address,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
    })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!row) return empty;
  return {
    propertyAddress: [row.address, row.city, row.state].filter(Boolean).join(", ") || null,
    propertyCity: row.city ?? null,
    propertyState: row.state ?? null,
    propertyZip: row.zip ?? null,
  };
}

const ACCOUNT_EVENT: Record<WebsiteAccountAction, string> = {
  user_registered: "user.registered",
  property_viewed: "property.viewed",
  property_favorited: "activity.favorite",
};

/** The old site's rule for each: a view alone never made a contact. */
const CREATES_CONTACT: Record<WebsiteAccountAction, boolean> = {
  user_registered: true,
  property_viewed: false,
  property_favorited: true,
};

export type WebsiteActivityResult = {
  logged: boolean;
  contactId: number | null;
  createdContact: boolean;
};

/**
 * Put one thing a signed-in investor did on their contact's timeline.
 * Never throws.
 */
export async function recordWebsiteAccountActivity(
  db: any,
  account: WebsiteAccountIdentity,
  input: { action: WebsiteAccountAction; propertyId?: number | null }
): Promise<WebsiteActivityResult> {
  const nothing = { logged: false, contactId: null, createdContact: false };
  try {
    let contactId = await contactIdForAccount(db, account);
    let createdContact = false;
    if (!contactId) {
      if (!CREATES_CONTACT[input.action]) return nothing;
      contactId = await createContactForAccount(db, account);
      if (!contactId) return nothing;
      createdContact = true;
    }
    await db.insert(activityLog).values({
      userId: null,
      action: input.action,
      entityType: "contact",
      entityId: contactId,
      relatedContactId: contactId,
      details: {
        propertyId: input.propertyId ?? null,
        ...(await propertyPlace(db, input.propertyId)),
        occurredAt: new Date().toISOString(),
        event: ACCOUNT_EVENT[input.action],
        via: WEBSITE_ACTIVITY_VIA,
      },
    });
    return { logged: true, contactId, createdContact };
  } catch (error) {
    console.warn(`[WebsiteActivity] ${input.action} not recorded for account ${account.id}.`, error);
    return nothing;
  }
}

/**
 * The second timeline entry for a website request: the action Hot Leads and
 * the reports count. The "website_inquiry_submitted" entry, which carries the
 * visitor's message, is written by submitLead as before. Never throws.
 */
export async function recordWebsiteRequestActivity(
  db: any,
  input: {
    contactId: number;
    requestType?: string | null;
    intent?: string | null;
    propertyId?: number | null;
    propertyAddress?: string | null;
    agentId?: number | null;
  }
): Promise<WebsiteRequestAction | null> {
  const action = websiteRequestAction(input);
  if (!action) return null;
  try {
    const place = await propertyPlace(db, input.propertyId);
    await db.insert(activityLog).values({
      userId: null,
      action,
      entityType: "contact",
      entityId: input.contactId,
      relatedContactId: input.contactId,
      details: {
        propertyId: input.propertyId ?? null,
        ...place,
        propertyAddress: input.propertyAddress ?? place.propertyAddress,
        agentId: input.agentId ?? null,
        occurredAt: new Date().toISOString(),
        event: action,
        via: WEBSITE_ACTIVITY_VIA,
      },
    });
    return action;
  } catch (error) {
    console.warn(`[WebsiteActivity] ${action} not recorded for contact ${input.contactId}.`, error);
    return null;
  }
}

// ─── Searches and shares ─────────────────────────────────────────────────────

/**
 * Whether market searches and shares go on the contact timeline. Off unless
 * WEBSITE_TIMELINE_SEARCH_SHARE_ENABLED is exactly "true", like every other
 * new-site behaviour before switch day. Off means the two procedures answer
 * and write nothing.
 */
export function websiteTimelineSearchShareEnabled(flagValue: string | null | undefined): boolean {
  return String(flagValue ?? "").trim().toLowerCase() === "true";
}

/** A search repeated inside this window is the same search. */
export const REPEAT_SEARCH_QUIET_MS = 30 * 60_000;

/** Per account. Generous for a person, a ceiling for a script. */
export const SEARCH_SHARE_THROTTLE_RULES = {
  search: { limit: 30, windowMs: 60 * 60_000 },
  share: { limit: 20, windowMs: 60 * 60_000 },
} satisfies Record<string, ThrottleRule>;

/**
 * The server's own guard on the two endpoints: a rate limit per account and a
 * memory of recent identical searches, so a client that ignores its own
 * once-per-session rule still cannot fill a timeline. In memory, like the
 * account throttle, for the same reasons (one process, no migration).
 */
export class SearchShareGuard {
  private throttle: SlidingWindowThrottle;
  private recent = new Map<string, number>();

  constructor(private now: () => number = Date.now, private maxRemembered = 5_000) {
    this.throttle = new SlidingWindowThrottle(now);
  }

  /** True when this account may log one more of `kind` now. */
  allow(kind: keyof typeof SEARCH_SHARE_THROTTLE_RULES, accountId: number): boolean {
    return this.throttle.attempt(`${kind}:${accountId}`, SEARCH_SHARE_THROTTLE_RULES[kind]);
  }

  /** True the first time a key is seen inside the quiet window; remembers it. */
  firstInWindow(key: string, windowMs: number = REPEAT_SEARCH_QUIET_MS): boolean {
    const now = this.now();
    const last = this.recent.get(key);
    if (last != null && now - last < windowMs) return false;
    if (this.recent.size >= this.maxRemembered) {
      this.recent.forEach((at, k) => {
        if (now - at >= windowMs) this.recent.delete(k);
      });
      // Still full of fresh keys: drop the oldest rather than grow.
      if (this.recent.size >= this.maxRemembered) {
        const oldest = this.recent.keys().next().value;
        if (oldest !== undefined) this.recent.delete(oldest);
      }
    }
    this.recent.delete(key);
    this.recent.set(key, now);
    return true;
  }
}

export const searchShareGuard = new SearchShareGuard();

async function marketName(db: any, marketId: number | null): Promise<string | null> {
  if (!marketId) return null;
  const [row] = await db
    .select({ name: marketProfiles.name, state: marketProfiles.state })
    .from(marketProfiles)
    .where(eq(marketProfiles.id, marketId))
    .limit(1);
  if (!row) return null;
  const name = String(row.name ?? "").trim();
  if (!name) return null;
  // Market names are often "Destin, FL" already.
  return row.state && !name.includes(",") ? `${name}, ${row.state}` : name;
}

/**
 * A market search on the contact's timeline, as "market_searched". Only for an
 * account that already has a contact: a search alone never makes one, and
 * nothing here sends an email or starts a Smart Plan. Never throws.
 */
export async function recordWebsiteSearchActivity(
  db: any,
  account: WebsiteAccountIdentity,
  input: { criteria: WebsiteSearchCriteria; source: WebsiteSearchSource }
): Promise<WebsiteActivityResult> {
  const nothing = { logged: false, contactId: null, createdContact: false };
  if (isEmptySearch(input.criteria)) return nothing;
  try {
    const contactId = await contactIdForAccount(db, account);
    if (!contactId) return nothing;
    const criteria = normalizeSearchCriteria(input.criteria);
    const market = await marketName(db, criteria.marketId);
    await db.insert(activityLog).values({
      userId: null,
      action: "market_searched",
      entityType: "contact",
      entityId: contactId,
      relatedContactId: contactId,
      details: {
        searchSummary: describeSearch(criteria, market),
        searchQuery: criteria.query,
        marketId: criteria.marketId,
        marketName: market,
        filters: {
          state: criteria.state,
          propertyType: criteria.propertyType,
          minBeds: criteria.minBeds,
          minBaths: criteria.minBaths,
          minPrice: criteria.minPrice,
          maxPrice: criteria.maxPrice,
        },
        searchSource: input.source,
        occurredAt: new Date().toISOString(),
        event: "activity.search",
        via: WEBSITE_ACTIVITY_VIA,
      },
    });
    return { logged: true, contactId, createdContact: false };
  } catch (error) {
    console.warn(`[WebsiteActivity] market_searched not recorded for account ${account.id}.`, error);
    return nothing;
  }
}

/**
 * A share on the contact's timeline: "property_shared" for a listing, as the
 * old site logged it, and "article_shared" for a Resources article, which the
 * old site had no share tracking for. Same contact rule as searches. Never
 * throws.
 */
export async function recordWebsiteShareActivity(
  db: any,
  account: WebsiteAccountIdentity,
  input: { target: WebsiteShareTarget; channel: WebsiteShareChannel }
): Promise<WebsiteActivityResult> {
  const nothing = { logged: false, contactId: null, createdContact: false };
  const action = input.target.kind === "property" ? "property_shared" : "article_shared";
  try {
    const contactId = await contactIdForAccount(db, account);
    if (!contactId) return nothing;
    const common = {
      shareChannel: input.channel,
      shareChannelLabel: WEBSITE_SHARE_CHANNEL_LABELS[input.channel],
      occurredAt: new Date().toISOString(),
      event: "activity.share",
      via: WEBSITE_ACTIVITY_VIA,
    };
    let details: Record<string, unknown>;
    if (input.target.kind === "property") {
      details = {
        propertyId: input.target.propertyId,
        ...(await propertyPlace(db, input.target.propertyId)),
        ...common,
      };
    } else {
      const [post] = await db
        .select({ title: websiteBlogPosts.title, slug: websiteBlogPosts.slug })
        .from(websiteBlogPosts)
        .where(eq(websiteBlogPosts.id, input.target.contentId))
        .limit(1);
      details = {
        contentKind: "post",
        contentId: input.target.contentId,
        contentTitle: post?.title ?? null,
        contentSlug: post?.slug ?? null,
        ...common,
      };
    }
    await db.insert(activityLog).values({
      userId: null,
      action,
      entityType: "contact",
      entityId: contactId,
      relatedContactId: contactId,
      details,
    });
    return { logged: true, contactId, createdContact: false };
  } catch (error) {
    console.warn(`[WebsiteActivity] ${action} not recorded for account ${account.id}.`, error);
    return nothing;
  }
}

/** The server-side dedupe key for one account's search. */
export function accountSearchKey(accountId: number, criteria: WebsiteSearchCriteria, source: WebsiteSearchSource): string {
  return `${accountId}:${searchSignature(criteria, source)}`;
}
