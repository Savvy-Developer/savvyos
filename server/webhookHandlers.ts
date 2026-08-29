/**
 * Webhook Handler Registry
 *
 * Each handler receives a normalised payload and the endpoint config, and
 * returns a result object describing what was created/updated.
 *
 * To add a new integration:
 *  1. Add a new value to the `handlerType` enum in drizzle/schema.ts
 *  2. Implement a HandlerFn and register it in HANDLERS below
 *  3. Admins can then select the new handler type when creating an endpoint
 */

import { getDb as _getDb, logActivity, scheduleAircallPhoneRematch } from "./db";
import { triggerGhlContactSync } from "./_core/ghlSync";
import { triggerSmartPlansForContact } from "./smartPlanScheduler";

async function getDb() {
  const db = await _getDb();
  if (!db) throw new Error("Database not available");
  return db;
}
import { contacts, leadSources, agentConnections, users } from "../drizzle/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import type { WebhookEndpoint } from "../drizzle/schema";
import { normalizeOptionalUsPhone } from "@shared/phone";
import { sendTransactionalEmail } from "./_core/resendEmail";

// The public savvy-agents.com client already uses this publishable key for
// property reads. Website lead events contain a property UUID, but older event
// payloads often omit the display address, so the receiver resolves it here.
const SAVVY_WEB_PROPERTY_API_URL = "https://wvgbegmtbvkcfdzvvfnk.supabase.co/rest/v1/properties";
const SAVVY_WEB_PUBLISHABLE_KEY = "sb_publishable_BzWpmP0LyamnjjjMA9m_QQ_Mv-byg9k";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HandlerResult {
  contactId?: number;
  action?: "created" | "updated" | "skipped" | "logged";
  message?: string;
}

export type HandlerFn = (
  payload: Record<string, unknown>,
  endpoint: WebhookEndpoint
) => Promise<HandlerResult>;

// ─── Field Mapping ────────────────────────────────────────────────────────────
// Maps common field names from Zapier/Make/custom forms to our contact fields.
// Keys are lower-cased incoming field names; values are our contact column names.

const FIELD_MAP: Record<string, string> = {
  // Name variants
  first_name: "firstName", firstname: "firstName", fname: "firstName", "first name": "firstName",
  last_name: "lastName", lastname: "lastName", lname: "lastName", "last name": "lastName",
  name: "_fullName", // special: split on space
  full_name: "_fullName",
  fullname: "_fullName",
  // Contact
  email: "email", email_address: "email", emailaddress: "email",
  phone: "phone", phone_number: "phone", phonenumber: "phone", mobile: "phone", cell: "phone",
  secondary_email: "secondaryEmail", email2: "secondaryEmail",
  secondary_phone: "secondaryPhone", phone2: "secondaryPhone",
  // Address
  address: "address", street: "address", street_address: "address",
  city: "city",
  state: "state", province: "state",
  zip: "zip", postal_code: "zip", zipcode: "zip",
  // Lead source
  lead_source: "_leadSourceName", leadsource: "_leadSourceName", source: "_leadSourceName",
  lead_source_id: "leadSourceId", leadsourceid: "leadSourceId",
  // Notes
  notes: "notes", note: "notes", message: "notes", comments: "comments",
  // Spouse
  spouse_first_name: "spouseFirstName", spouse_last: "spouseLastName",
  spouse_email: "spouseEmail", spouse_phone: "spousePhone",
  // ISA
  isa_status: "isaStatus",
  // Agent assignment
  agent_id: "_agentId", agentid: "_agentId",
  agent_email: "_agentEmail",
};

function normalisePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = FIELD_MAP[k.toLowerCase().trim()];
    if (mapped) {
      out[mapped] = v;
    } else {
      // Keep unmapped fields under their original key for custom handlers
      out[k] = v;
    }
  }
  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveLeadSourceId(
  nameOrId: string | number | undefined,
  defaultId: number | null | undefined
): Promise<number | null> {
  if (!nameOrId && !defaultId) return null;
  const db = await getDb();

  if (typeof nameOrId === "number") return nameOrId;
  if (typeof nameOrId === "string" && /^\d+$/.test(nameOrId)) return parseInt(nameOrId);

  if (nameOrId) {
    const [row] = await db
      .select({ id: leadSources.id })
      .from(leadSources)
      .where(eq(leadSources.name, nameOrId))
      .limit(1);
    if (row) return row.id;
  }
  return defaultId ?? null;
}

/**
 * Inbound leads must always carry a lead source for attribution. When a webhook
 * payload doesn't specify one and the endpoint has no default configured, fall
 * back to a dedicated, system-protected "Unattributed (Webhook)" source instead
 * of leaving leadSourceId null.
 */
async function getOrCreateFallbackLeadSourceId(): Promise<number> {
  const db = await getDb();
  const FALLBACK_NAME = "Unattributed (Webhook)";
  const [existing] = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(eq(leadSources.name, FALLBACK_NAME))
    .limit(1);
  if (existing) return existing.id;
  const [result] = await db.insert(leadSources).values({ name: FALLBACK_NAME, isProtected: true });
  return (result as any).insertId as number;
}

async function findExistingContact(email?: string, phone?: string): Promise<number | null> {
  if (!email && !phone) return null;
  const db = await getDb();

  const conditions = [];
  if (email) conditions.push(eq(contacts.email, email));
  if (phone) conditions.push(eq(contacts.phone, phone));

  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(or(...conditions))
    .limit(1);
  return row?.id ?? null;
}

async function resolveAgentId(
  agentIdRaw: string | number | undefined,
  agentEmailRaw: string | undefined,
  defaultAgentId: number | null | undefined
): Promise<number | null> {
  if (!agentIdRaw && !agentEmailRaw && !defaultAgentId) return null;
  const db = await getDb();

  const { users } = await import("../drizzle/schema");
  if (agentIdRaw) {
    const id = typeof agentIdRaw === "number" ? agentIdRaw : parseInt(String(agentIdRaw));
    if (!isNaN(id)) return id;
  }
  if (agentEmailRaw) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, agentEmailRaw))
      .limit(1);
    if (row) return row.id;
  }
  return defaultAgentId ?? null;
}

// ─── Handler: lead_ingest ─────────────────────────────────────────────────────
// Creates a new contact (or updates by email/phone) and assigns a lead source.
//
// The original Savvy website conversion endpoint still posts flat lead payloads
// to the `savvy-website-leads` endpoint. Its property-request intent lives in
// the notes text rather than in an event envelope, so these declarations are
// defined below the shared website handoff helpers and used by this handler.
//
// When the incoming payload is a savvy-web event envelope ({ event, data })
// the handler delegates to savvyWebEventHandler so the correct activity action
// (e.g. "lead_created", "analysis_requested") and agent connection are recorded
// instead of a generic "contact_updated".

const leadIngestHandler: HandlerFn = async (rawPayload, endpoint) => {
  // ── Savvy-web envelope detection ───────────────────────────────────────────
  // savvy-web sends: { event: "lead.created", timestamp, data: { email, agentEmail, … } }
  // The normalisePayload below only reads top-level keys, so fields inside `data`
  // would be lost.  Detect the envelope here and delegate to the rich handler
  // that knows about this format before any flat-payload processing begins.
  if (typeof rawPayload.event === "string" && rawPayload.event && SAVVY_WEB_EVENTS[rawPayload.event]) {
    return savvyWebEventHandler(rawPayload, endpoint);
  }

  const db = await getDb();

  const p = normalisePayload(rawPayload);
  const legacyWebsiteHandoff = getLegacyWebsiteHandoff(p.notes);

  // Resolve full name split
  let firstName = (p.firstName as string) || "";
  let lastName = (p.lastName as string) || "";
  if (!firstName && p._fullName) {
    const parts = String(p._fullName).trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ") || "";
  }
  if (!firstName) throw new Error("first_name (or name) is required");

  const email = (p.email as string) || undefined;
  const phone = normalizeOptionalUsPhone(p.phone == null ? undefined : String(p.phone));
  const secondaryPhone = normalizeOptionalUsPhone(p.secondaryPhone == null ? undefined : String(p.secondaryPhone));
  const spousePhone = normalizeOptionalUsPhone(p.spousePhone == null ? undefined : String(p.spousePhone));

  // Resolve lead source
  const leadSourceId = await resolveLeadSourceId(
    (p._leadSourceName as string) || (p.leadSourceId as number),
    endpoint.defaultLeadSourceId
  );

  // Find or create contact
  const existingId = await findExistingContact(email, phone ?? undefined);

  let contactId: number;
  let action: HandlerResult["action"];

  if (existingId) {
    // Update existing contact — only overwrite non-null fields
    const updates: Record<string, unknown> = {};
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    if (p.secondaryEmail) updates.secondaryEmail = p.secondaryEmail as string;
    if (secondaryPhone) updates.secondaryPhone = secondaryPhone;
    if (p.address) updates.address = p.address as string;
    if (p.city) updates.city = p.city as string;
    if (p.state) updates.state = p.state as string;
    if (p.zip) updates.zip = p.zip as string;
    if (p.notes) updates.notes = p.notes as string;

    if (Object.keys(updates).length > 0) {
      await db.update(contacts).set(updates).where(eq(contacts.id, existingId));
    }
    contactId = existingId;
    action = "updated";
  } else {
    // Create new contact — guarantee a lead source so every inbound lead is attributed.
    const newLeadSourceId = leadSourceId ?? (await getOrCreateFallbackLeadSourceId());
    const [result] = await db.insert(contacts).values({
      firstName,
      lastName: lastName || "",
      email: email || null,
      phone,
      secondaryEmail: (p.secondaryEmail as string) || null,
      secondaryPhone,
      address: (p.address as string) || null,
      city: (p.city as string) || null,
      state: (p.state as string) || null,
      zip: (p.zip as string) || null,
      notes: (p.notes as string) || null,
      leadSourceId: newLeadSourceId,
      spouseFirstName: (p.spouseFirstName as string) || null,
      spouseLastName: (p.spouseLastName as string) || null,
      spouseEmail: (p.spouseEmail as string) || null,
      spousePhone,
    });
    contactId = (result as any).insertId;
    action = "created";
    // Outbound GHL sync for the newly-created webhook lead. Fire-and-forget;
    // never blocks the webhook response. Skipped for the "updated" branch
    // because GHL upsert already dedupes by email, so the upstream Zapier
    // flow + a re-upsert for an updated contact would just rewrite the same
    // tag — preserving the "no behavior change on existing webhook" promise.
    triggerGhlContactSync(contactId);
    // Source-triggered Smart Plans are part of the new-contact intake contract.
    // Await and log an enrollment failure without rejecting the source webhook.
    await triggerSmartPlansForContact(contactId, newLeadSourceId).catch((error) =>
      console.error("[SmartPlan] Webhook enrollment failed for contact", contactId, error),
    );
  }

  scheduleAircallPhoneRematch(contactId, {
    phone,
    secondaryPhone,
    spousePhone,
  });

  // Record how/where this lead entered the system so the contact history isn't
  // blank for webhook-ingested leads (this is what powers the relationship history).
  await logActivity({
    userId: null,
    action: action === "created" ? "contact_created" : "contact_updated",
    entityType: "contact",
    entityId: contactId,
    details: { via: "webhook", endpoint: endpoint.name, slug: endpoint.slug },
  });

  // Assign to agent if specified
  const agentId = await resolveAgentId(
    p._agentId as string | number,
    p._agentEmail as string,
    endpoint.defaultAgentId
  );
  if (agentId) {
    // Check if connection already exists
    const [existing] = await db
      .select({ id: agentConnections.id })
      .from(agentConnections)
      .where(and(
        eq(agentConnections.agentId, agentId),
        eq(agentConnections.contactId, contactId)
      ))
      .limit(1);
    if (!existing) {
      await db.insert(agentConnections).values({ agentId, contactId });
    }
  }

  // Legacy savvy-agents.com property conversions are delivered here as a flat
  // lead payload. They need the same shared client handoff as the new event
  // envelope, while retaining the normal lead-ingest attribution and update
  // behavior above.
  let handoffEmailSent = false;
  if (legacyWebsiteHandoff && email) {
    try {
      const agent = await resolveSavvyWebAgent(
        { agentEmail: p._agentEmail as string | undefined },
        {},
      );
      if (!agent?.email) {
        console.warn(`[leadIngestHandler] No SavvyOS agent resolved for legacy website handoff (contactId=${contactId}).`);
      } else {
        const contactName = [firstName, lastName].filter(Boolean).join(" ") || "A client";
        const delivery = await sendTransactionalEmail(legacyWebsiteHandoff.type, {
          recipientEmail: agent.email,
          recipientName: agent.name ?? undefined,
          ccEmails: normalizeIdentity(agent.email) !== normalizeIdentity(email) ? [email] : undefined,
          agentName: agent.name ?? undefined,
          contactName,
          propertyAddress: legacyWebsiteHandoff.propertyAddress,
          propertyUrl: legacyWebsiteHandoff.propertyUrl,
          agentBookingLink: normalizeBookingLink(agent.callBookingLink) ?? undefined,
        }, {
          injectMagicLinks: false,
          allowTemplateOverride: false,
          idempotencyKey: `savvy-web-legacy-handoff:${legacyWebsiteHandoff.type}:${email}:${legacyWebsiteHandoff.propertyUrl ?? legacyWebsiteHandoff.propertyAddress}:${agent.id}`,
        });
        handoffEmailSent = delivery.sent;
        if (!delivery.sent) {
          console.warn(`[leadIngestHandler] Legacy website handoff email was not sent (contactId=${contactId}): ${delivery.reason ?? "unknown reason"}`);
        }
      }
    } catch (error) {
      // Preserve contact intake even if the optional client handoff cannot send.
      console.error("[leadIngestHandler] Failed to process legacy website handoff:", error);
    }
  }

  return {
    contactId,
    action,
    message: `Contact ${action}: id=${contactId}${agentId ? `, assigned to agent ${agentId}` : ""}${handoffEmailSent ? " (handoff email sent)" : ""}`,
  };
};

// ─── Handler: contact_create ──────────────────────────────────────────────────
// Alias for lead_ingest but always creates (skips dedup check).

const contactCreateHandler: HandlerFn = async (rawPayload, endpoint) => {
  return leadIngestHandler(rawPayload, endpoint);
};

// ─── Handler: contact_update ──────────────────────────────────────────────────
// Requires email or phone to find the existing contact; updates fields.

const contactUpdateHandler: HandlerFn = async (rawPayload, endpoint) => {
  const db = await getDb();

  const p = normalisePayload(rawPayload);
  const email = (p.email as string) || undefined;
  const phone = normalizeOptionalUsPhone(p.phone == null ? undefined : String(p.phone));

  const existingId = await findExistingContact(email, phone ?? undefined);
  if (!existingId) {
    throw new Error("No contact found matching the provided email or phone");
  }

  const updates: Record<string, unknown> = {};
  if (p.firstName) updates.firstName = p.firstName;
  if (p.lastName) updates.lastName = p.lastName;
  if (p.address) updates.address = p.address;
  if (p.city) updates.city = p.city;
  if (p.state) updates.state = p.state;
  if (p.zip) updates.zip = p.zip;
  if (p.notes) updates.notes = p.notes;

  if (Object.keys(updates).length > 0) {
    await db.update(contacts).set(updates).where(eq(contacts.id, existingId));
  }

  return { contactId: existingId, action: "updated", message: `Contact updated: id=${existingId}` };
};

// ─── savvy-web events ─────────────────────────────────────────────────────────
// savvy-web emits every webhook as an envelope: { event, timestamp, data: {…} }.
// Each supported event appends a row to the matching contact's activity timeline.
//
// `createsContact` decides what happens when no contact matches the email:
//   false — the signal is too weak to justify a contact record, so we skip it.
//           Page views are the only case: they fire on every property a
//           logged-in lead opens, so creating from them would flood the CRM.
//   true  — the signal is deliberate (a favourite, a request), so a brand-new
//           visitor is worth capturing. We create the contact, then log against
//           it. Without this the visitor's first real intent signal is lost.

interface SavvyWebEventSpec {
  /** activity_log.action written for this event. */
  action: string;
  /** Create the contact when the email matches nothing? */
  createsContact: boolean;
  /**
   * When agentId is present in the payload, create an agent connection for this
   * event. Only deliberate lead-intent actions should set this — passive signals
   * like page views and favourites must not trigger a connection.
   */
  createsAgentConnection: boolean;
  /** Human label used in the webhook response body. */
  label: string;
}

export const SAVVY_WEB_EVENTS: Record<string, SavvyWebEventSpec> = {
  "property.viewed": {
    action: "property_viewed", createsContact: false, createsAgentConnection: false, label: "Property view",
  },
  "activity.favorite": {
    action: "property_favorited", createsContact: true, createsAgentConnection: false, label: "Property favorite",
  },
  "activity.contact": {
    // "Message Agent" button — visitor has sent a message to the agent
    action: "property_contact_requested", createsContact: true, createsAgentConnection: true, label: "Contact request",
  },
  "activity.search": {
    action: "market_searched", createsContact: true, createsAgentConnection: false, label: "Market search",
  },
  "activity.share": {
    action: "property_shared", createsContact: true, createsAgentConnection: false, label: "Property share",
  },
  "user.registered": {
    action: "user_registered", createsContact: true, createsAgentConnection: false, label: "User registration",
  },
  "lead.created": {
    // General lead capture — covers "Message Agent" (sendAgentMessage) and "Financing" button
    action: "lead_created", createsContact: true, createsAgentConnection: true, label: "Lead created",
  },
  "lead.financing_requested": {
    // Supported for a future dedicated Financing event; the current website
    // sends lead.created with source="financing".
    action: "financing_requested", createsContact: true, createsAgentConnection: true, label: "Financing request",
  },
  "lead.analysis_requested": {
    // "Request Deeper Analysis" button
    action: "analysis_requested", createsContact: true, createsAgentConnection: true, label: "Analysis request",
  },
  "lead.showing_requested": {
    // "Book a Showing" button
    action: "showing_requested", createsContact: true, createsAgentConnection: true, label: "Showing request",
  },
};

/**
 * Read the first present value for `keys`, checking the envelope's `data`
 * object first and then the top level.
 *
 * The top-level fallback is per-key on purpose. The previous implementation
 * fell back to the flat payload only when `data` was absent entirely, so a
 * payload carrying `data` without an email threw instead of checking the top
 * level for one.
 */
function pickField(
  data: Record<string, unknown>,
  raw: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = data[key] ?? raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

/**
 * Build a display name from an email local-part, for visitors whose savvy-web
 * profile has no name on it. Contacts cannot be created without a first name,
 * so without this fallback every nameless visitor's activity would be dropped.
 *
 *   jane.doe@x.com  → Jane Doe
 *   j.smith92@x.com → J Smith
 *   hello@x.com     → Hello
 */
export function deriveNameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = (email.split("@")[0] ?? "").trim();
  const parts = local
    .split(/[._+\-]+/)
    .map((part) => part.replace(/\d+$/, ""))
    .filter(Boolean);
  if (parts.length === 0) return { firstName: email, lastName: "" };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return { firstName: cap(parts[0]), lastName: parts.slice(1).map(cap).join(" ") };
}

/** Resolve a contact name from the payload, falling back to the email. */
export function resolveContactName(
  data: Record<string, unknown>,
  raw: Record<string, unknown>,
  email: string
): { firstName: string; lastName: string } {
  const firstName = pickField(data, raw, ["firstName", "first_name", "fname"]);
  const lastName = pickField(data, raw, ["lastName", "last_name", "lname"]) ?? "";
  if (firstName) return { firstName, lastName };

  const fullName = pickField(data, raw, ["name", "fullName", "full_name"]);
  if (fullName) {
    const segments = fullName.split(/\s+/);
    return { firstName: segments[0], lastName: segments.slice(1).join(" ") };
  }

  return deriveNameFromEmail(email);
}

type WebsiteLeadHandoffType =
  | "website_deeper_analysis_request"
  | "website_financing_request"
  | "website_showing_request";

type SavvyWebAgent = {
  id: number;
  name: string | null;
  email: string | null;
  callBookingLink: string | null;
};

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function normalizeBookingLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getWebsiteLeadHandoffType(
  event: string,
  data: Record<string, unknown>,
  raw: Record<string, unknown>,
): WebsiteLeadHandoffType | null {
  if (event === "lead.analysis_requested") return "website_deeper_analysis_request";
  if (event === "lead.showing_requested") return "website_showing_request";
  if (event === "lead.financing_requested") return "website_financing_request";

  // The website currently identifies financing requests as a lead.created
  // event with a source field. Do not send this handoff for Message Agent or
  // ordinary website-signup leads, which share the same event name.
  const source = normalizeIdentity(pickField(data, raw, ["source", "leadSource", "lead_source"]));
  if (event === "lead.created" && source.includes("financ")) {
    return "website_financing_request";
  }
  return null;
}

type LegacyWebsiteHandoff = {
  type: WebsiteLeadHandoffType;
  propertyAddress: string;
  propertyUrl?: string;
};

/**
 * The older website conversion webhook posts a flat lead payload to
 * `savvy-website-leads`. It provides the conversion type and property fields in
 * `notes`, not in the newer `{ event, data }` envelope. Parse only the exact
 * website conversion convention so ordinary CRM notes can never trigger a
 * client handoff email.
 */
function getLegacyWebsiteHandoff(notes: unknown): LegacyWebsiteHandoff | null {
  if (typeof notes !== "string") return null;
  const conversion = notes.match(/(?:^|\n)\s*Website conversion:\s*([^|\n]+)/i)?.[1] ?? "";
  const normalizedConversion = normalizeIdentity(conversion);
  const type: WebsiteLeadHandoffType | null = normalizedConversion.includes("financ")
    ? "website_financing_request"
    : normalizedConversion.includes("deeper analysis")
      ? "website_deeper_analysis_request"
      : normalizedConversion.includes("show")
        ? "website_showing_request"
        : null;
  if (!type) return null;

  const propertyAddress = notes.match(/(?:^|\|)\s*Property:\s*([^|\n]+)/i)?.[1]?.trim();
  const rawPropertyUrl = notes.match(/(?:^|\n)\s*URL:\s*(https?:\/\/[^\s]+)/i)?.[1];
  let propertyUrl: string | undefined;
  if (rawPropertyUrl) {
    try {
      const url = new URL(rawPropertyUrl);
      if (url.protocol === "https:" && (url.hostname === "savvy-agents.com" || url.hostname === "www.savvy-agents.com")) {
        propertyUrl = url.toString();
      }
    } catch {
      // An invalid source link simply omits the optional property anchor.
    }
  }

  return {
    type,
    propertyAddress: propertyAddress || "the requested property",
    ...(propertyUrl ? { propertyUrl } : {}),
  };
}

async function resolveSavvyWebAgent(
  data: Record<string, unknown>,
  raw: Record<string, unknown>,
): Promise<SavvyWebAgent | null> {
  const agentEmail = normalizeIdentity(pickField(data, raw, ["agentEmail", "agent_email"]));
  const agentName = normalizeIdentity(pickField(data, raw, ["agentName", "agent_name"]));
  if (!agentEmail && !agentName) return null;

  const db = await getDb();
  const activeUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      callBookingLink: users.callBookingLink,
      role: users.role,
    })
    .from(users)
    .where(eq(users.isActive, true));

  const eligibleUsers = activeUsers.filter((user) => user.role === "agent" || user.role === "admin");
  const exactEmailMatch = agentEmail
    ? eligibleUsers.find((user) => normalizeIdentity(user.email) === agentEmail)
    : undefined;
  if (exactEmailMatch) return exactEmailMatch;

  // A few legacy website agent records use a different delivery email. A
  // unique active-name match preserves the intended handoff without risking a
  // guess where multiple SavvyOS users share the name.
  const nameMatches = agentName
    ? eligibleUsers.filter((user) => normalizeIdentity(user.name) === agentName)
    : [];
  if (nameMatches.length === 1) return nameMatches[0];

  // Some website directory records contain a full married or public-facing name
  // while SavvyOS has a short or legal profile name. A first-name fallback is
  // safe only when the website supplied a full name and exactly one active
  // agent/admin has that first token; it is never used for an ambiguous name.
  const [websiteFirstName, ...websiteRemainingName] = agentName.split(" ");
  const firstNameMatches = websiteFirstName && websiteRemainingName.length > 0
    ? eligibleUsers.filter((user) => normalizeIdentity(user.name).split(" ")[0] === websiteFirstName)
    : [];
  return firstNameMatches.length === 1 ? firstNameMatches[0] : null;
}

type SavvyWebPropertyResolution = {
  address: string;
  propertyUrl?: string;
};

async function resolveSavvyWebProperty(
  suppliedAddress: string | null,
  propertyId: unknown,
): Promise<SavvyWebPropertyResolution> {
  if (typeof propertyId !== "string" || !propertyId.trim()) {
    return { address: suppliedAddress ?? "the requested property" };
  }

  try {
    const url = new URL(SAVVY_WEB_PROPERTY_API_URL);
    url.searchParams.set("id", `eq.${propertyId.trim()}`);
    url.searchParams.set("select", "address,city,state,zip_code,title,slug");
    const response = await fetch(url, {
      headers: {
        apikey: SAVVY_WEB_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SAVVY_WEB_PUBLISHABLE_KEY}`,
      },
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rows = await response.json() as Array<{
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zip_code?: string | null;
      title?: string | null;
      slug?: string | null;
    }>;
    const property = rows[0];
    const street = property?.address?.trim() || property?.title?.trim();
    const locality = [property?.city?.trim(), [property?.state?.trim(), property?.zip_code?.trim()].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    const resolvedAddress = [street, locality].filter(Boolean).join(", ");
    const slug = property?.slug?.trim();
    return {
      address: (suppliedAddress ?? resolvedAddress) || "the requested property",
      ...(slug ? { propertyUrl: `https://savvy-agents.com/properties/${encodeURIComponent(slug)}` } : {}),
    };
  } catch (error) {
    console.warn(`[savvyWebEventHandler] Could not resolve property ${propertyId} for website handoff:`, error);
    return { address: suppliedAddress ?? "the requested property" };
  }
}

/**
 * Create a contact from a savvy-web event. Mirrors the lead_ingest create path:
 * always attributed to a lead source, always leaves a `contact_created` row on
 * the timeline, and syncs outbound to GHL like any other webhook-created lead.
 */
async function createContactFromEvent(
  email: string,
  data: Record<string, unknown>,
  raw: Record<string, unknown>,
  endpoint: WebhookEndpoint
): Promise<number> {
  const db = await getDb();
  const { firstName, lastName } = resolveContactName(data, raw, email);
  const phone = normalizeOptionalUsPhone(pickField(data, raw, ["phone", "mobile", "cell"]));

  const leadSourceId =
    (await resolveLeadSourceId(undefined, endpoint.defaultLeadSourceId)) ??
    (await getOrCreateFallbackLeadSourceId());

  const [result] = await db.insert(contacts).values({
    firstName,
    lastName: lastName || "",
    email,
    phone,
    leadSourceId,
  });
    const contactId = (result as any).insertId as number;
  scheduleAircallPhoneRematch(contactId, { phone });
  await logActivity({
    userId: null,
    action: "contact_created",
    entityType: "contact",
    entityId: contactId,
    details: { via: "webhook", endpoint: endpoint.name, slug: endpoint.slug, event: raw.event },
  });

  triggerGhlContactSync(contactId);
  await triggerSmartPlansForContact(contactId, leadSourceId).catch((error) =>
    console.error("[SmartPlan] Savvy-web enrollment failed for contact", contactId, error),
  );
  return contactId;
}

/**
 * Records a savvy-web event on the matching contact's activity timeline,
 * creating the contact first when the event warrants it (see SAVVY_WEB_EVENTS).
 */
const savvyWebEventHandler: HandlerFn = async (rawPayload, endpoint) => {
  const event = typeof rawPayload.event === "string" ? rawPayload.event : "";
  const spec = SAVVY_WEB_EVENTS[event];
  if (!spec) throw new Error(`Unsupported savvy-web event: ${event || "(none)"}`);

  const data = (rawPayload.data as Record<string, unknown>) ?? {};

  const email = pickField(data, rawPayload, ["leadEmail", "email"]);
  if (!email) throw new Error("leadEmail is required");

  // Preserve the complete property location instead of collapsing it to a street
  // address. Different website events use different key names, so normalize the
  // common variants while retaining every delivered field below for the timeline.
  const streetAddress = pickField(data, rawPayload, ["propertyAddress", "propertyTitle", "address", "streetAddress", "street"]);
  const city = pickField(data, rawPayload, ["city", "propertyCity"]);
  const state = pickField(data, rawPayload, ["state", "stateCode", "propertyState"]);
  const zip = pickField(data, rawPayload, ["zip", "zipCode", "postalCode", "propertyZip"]);
  const locality = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const propertyAddress = [streetAddress, locality].filter(Boolean).join(", ") || null;
  const propertyId = data.propertyId ?? rawPayload.propertyId ?? null;
  const leadId = data.leadId ?? rawPayload.leadId ?? null;
  const websiteLeadHandoffType = getWebsiteLeadHandoffType(event, data, rawPayload);
  const handoffProperty = websiteLeadHandoffType
    ? await resolveSavvyWebProperty(propertyAddress, propertyId)
    : null;
  const webhookData = Object.fromEntries(
    Object.entries({ ...rawPayload, ...data }).filter(([key]) => ![
      "data", "event", "token", "signature", "authorization", "leadEmail", "email",
    ].includes(key)),
  );
  const occurredAt =
    pickField(data, rawPayload, ["viewedAt", "occurredAt", "requestedAt"]) ??
    pickField({}, rawPayload, ["timestamp"]) ??
    new Date().toISOString();

  let contactId = await findExistingContact(email);
  let createdContact = false;

  if (!contactId) {
    if (!spec.createsContact) {
      return { action: "skipped", message: `No contact found for ${email}` };
    }
    contactId = await createContactFromEvent(email, data, rawPayload, endpoint);
    createdContact = true;
  }

  const investmentGoal = pickField(data, rawPayload, ["investmentGoal", "investment_goal"]);
  const budgetRange = pickField(data, rawPayload, ["budgetRange", "budget_range"]);
  const preferredMarket = pickField(data, rawPayload, ["preferredMarket", "preferred_market"]);
  const investmentTimeline = pickField(data, rawPayload, ["investmentTimeline", "investment_timeline"]);

  if (investmentGoal || budgetRange || preferredMarket || investmentTimeline) {
    const prefs = [
      investmentGoal ? `Goal: ${investmentGoal}` : null,
      budgetRange ? `Budget: ${budgetRange}` : null,
      preferredMarket ? `Market: ${preferredMarket}` : null,
      investmentTimeline ? `Timeline: ${investmentTimeline}` : null,
    ].filter(Boolean).join(" | ");

    const noteLine = `Investor Preferences: ${prefs}`;
    const db = await getDb();
    const [existingContact] = await db.select({ notes: contacts.notes }).from(contacts).where(eq(contacts.id, contactId));
    const currentNotes = existingContact?.notes || "";
    if (!currentNotes.includes(noteLine)) {
      const updatedNotes = currentNotes ? `${currentNotes}\n${noteLine}` : noteLine;
      await db.update(contacts).set({ notes: updatedNotes }).where(eq(contacts.id, contactId));
    }
  }

  await logActivity({
    userId: null,
    action: spec.action,
    entityType: "contact",
    entityId: contactId,
    details: {
      propertyId,
      propertyAddress,
      propertyCity: city ?? null,
      propertyState: state ?? null,
      propertyZip: zip ?? null,
      leadId,
      occurredAt,
      event,
      via: "savvy-web",
      webhookData,
    },
  });

  // ── Agent Connection + co-branded email ──────────────────────────────────────
  // Deliberate property-intent events connect the website visitor and listing
  // agent in SavvyOS. The three direct requests also receive one shared branded
  // email: the agent is the primary recipient and the client is CC'd so either
  // party can reply all and continue the conversation.
  let agentConnectionCreated = false;
  let handoffEmailSent = false;
  if (spec.createsAgentConnection || websiteLeadHandoffType) {
    try {
      const agent = await resolveSavvyWebAgent(data, rawPayload);
      if (!agent) {
        const agentEmail = pickField(data, rawPayload, ["agentEmail", "agent_email"]);
        console.warn(
          `[savvyWebEventHandler] No SavvyOS agent resolved for "${agentEmail ?? "(no agent email)"}" ` +
          `(event=${event}, contactId=${contactId}). Agent connection and website handoff skipped.`,
        );
      } else {
        const db = await getDb();
        if (spec.createsAgentConnection) {
          // Prevent duplicate connections for the same agent + contact pair.
          const [existing] = await db
            .select({ id: agentConnections.id })
            .from(agentConnections)
            .where(and(
              eq(agentConnections.agentId, agent.id),
              eq(agentConnections.contactId, contactId),
            ))
            .limit(1);

          if (!existing) {
            await db.insert(agentConnections).values({
              agentId: agent.id,
              contactId,
              pipelineStatus: "new_lead",
              agingUpdatedAt: new Date(),
            });

            await logActivity({
              userId: null,
              action: "agent_connection_created",
              entityType: "agent_connection",
              entityId: contactId,
              details: {
                agentId: agent.id,
                contactId,
                via: "savvy-web",
                trigger: event,
              },
            });

            agentConnectionCreated = true;
          } else {
            console.log(`[savvyWebEventHandler] Agent connection already exists: agentId=${agent.id} contactId=${contactId}`);
          }
        }

        if (websiteLeadHandoffType && agent.email) {
          const { firstName, lastName } = resolveContactName(data, rawPayload, email);
          const contactName = [firstName, lastName].filter(Boolean).join(" ");
          const normalizedAgentEmail = normalizeIdentity(agent.email);
          const normalizedContactEmail = normalizeIdentity(email);
          const delivery = await sendTransactionalEmail(websiteLeadHandoffType, {
            recipientEmail: agent.email,
            recipientName: agent.name ?? undefined,
            ccEmails: normalizedAgentEmail !== normalizedContactEmail ? [email] : undefined,
            agentName: agent.name ?? pickField(data, rawPayload, ["agentName", "agent_name"]),
            contactName,
            propertyAddress: handoffProperty?.address ?? propertyAddress ?? "the requested property",
            propertyUrl: handoffProperty?.propertyUrl,
            agentBookingLink: normalizeBookingLink(agent.callBookingLink) ?? undefined,
          }, {
            // This email has two recipients, so never turn a SavvyOS deep link
            // into a token owned by only one of them.
            injectMagicLinks: false,
            // Preserve the request-specific copy and calendar CTA above.
            allowTemplateOverride: false,
            idempotencyKey: `savvy-web-handoff:${websiteLeadHandoffType}:${String(leadId ?? contactId)}:${String(propertyId ?? handoffProperty?.address ?? "property")}:${agent.id}`,
          });
          handoffEmailSent = delivery.sent;
          if (!delivery.sent) {
            console.warn(`[savvyWebEventHandler] Website handoff email was not sent (event=${event}, contactId=${contactId}): ${delivery.reason ?? "unknown reason"}`);
          }
          if (!normalizeBookingLink(agent.callBookingLink)) {
            console.warn(`[savvyWebEventHandler] Agent ${agent.id} has no valid call booking link; website handoff email sent without a calendar CTA.`);
          }
        }
      }
    } catch (err) {
      // Never let an agent-connection or email failure block the webhook response.
      console.error("[savvyWebEventHandler] Failed to process agent connection or website handoff:", err);
    }
  }

  return {
    contactId,
    action: createdContact ? "created" : "logged",
    message: `${spec.label} logged for contact ${contactId}${createdContact ? " (contact created)" : ""}${agentConnectionCreated ? " (agent connection created)" : ""}${handoffEmailSent ? " (handoff email sent)" : ""}`,
  };
};

// ─── Handler: property_view ───────────────────────────────────────────────────
// Retained for endpoints configured with the dedicated `property_view` handler
// type. Defaults the event so a bare property-view payload still resolves.

const propertyViewHandler: HandlerFn = async (rawPayload, endpoint) =>
  savvyWebEventHandler(
    { ...rawPayload, event: rawPayload.event ?? "property.viewed" },
    endpoint
  );

// ─── Handler: custom ─────────────────────────────────────────────────────────
// Logs the payload (no-op) — EXCEPT it routes any recognised savvy-web event to
// the savvy-web handler. This lets the integration be wired up on an endpoint
// whose handlerType is still "custom", so it works without waiting on the enum
// migration. Once the migration is applied you can switch the endpoint to a
// dedicated handler type for a clearer label.

const customHandler: HandlerFn = async (payload, endpoint) => {
  const event = typeof payload.event === "string" ? payload.event : "";
  if (SAVVY_WEB_EVENTS[event]) {
    return savvyWebEventHandler(payload, endpoint);
  }
  // Name the unhandled event in the response. A no-op still returns 200, so
  // without this the delivery log reads as healthy while nothing is recorded.
  return {
    action: "logged",
    message: event
      ? `Unhandled event "${event}" — payload logged (custom handler)`
      : "Payload logged (custom handler)",
  };
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const HANDLERS: Record<string, HandlerFn> = {
  lead_ingest: leadIngestHandler,
  contact_create: contactCreateHandler,
  contact_update: contactUpdateHandler,
  property_view: propertyViewHandler,
  custom: customHandler,
};

// Exported for tests.
export { savvyWebEventHandler, customHandler, propertyViewHandler };
