import { eq } from "drizzle-orm";

import { activityLog, contacts, properties } from "../drizzle/schema";
import { WEBSITE_ACCOUNT_LEAD_SOURCE } from "@shared/websiteLeadSources";
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
