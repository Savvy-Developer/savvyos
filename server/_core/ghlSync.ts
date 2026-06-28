/**
 * SavvyOS → GoHighLevel (LeadConnector) contact sync.
 *
 * Fires after a contact is committed in any of our create paths
 * (manual / pipeline add, inbound webhook /api/inbound/:slug, public
 * /partner-lead form, etc.) so the contact is upserted into GHL with the
 * lead source name applied as both a `tag` and the `source` field.
 *
 * Design notes:
 *  - Strictly fire-and-forget: the public `triggerGhlContactSync(id)` returns
 *    void synchronously; never block contact creation, never throw.
 *  - 3 retries with exponential backoff (500ms → 1s → 2s) on transient
 *    failures. Total ceiling ~3.5s before we give up and log.
 *  - Reads the contact + lead-source from the DB after insert rather than
 *    asking each call site to pass a normalised shape; the call site only
 *    needs the new contactId.
 *  - Skips when GHL_LOCATION_TOKEN is unset (e.g. local dev) — logs and
 *    returns so the rest of the create path is unaffected.
 *  - GHL `/contacts/upsert` dedupes by email, so re-running this against
 *    contacts that already exist via the Zapier flow is safe (it just
 *    updates the existing row instead of duplicating).
 */

import { getDb } from "../db";
import { contacts, leadSources } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const GHL_UPSERT_URL = "https://services.leadconnectorhq.com/contacts/upsert";
const GHL_API_VERSION = "2021-07-28";
const DEFAULT_LOCATION_ID = "2ZPnQStoB9ZVXSwFdfEw";

const RETRY_DELAYS_MS = [500, 1000, 2000]; // 3 attempts total

interface UpsertInput {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  leadSourceName?: string | null;
}

interface UpsertResult {
  ok: boolean;
  ghlContactId?: string;
  action?: "created" | "updated";
  status?: number;
  errorBody?: string;
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

/**
 * Resolve the leaf lead-source name we'll send to GHL.
 *
 * Returns just the sub-source name (e.g. "Fello"), not the parent → child
 * path. The existing Zaps apply bare partner names as tags, so this stays
 * symmetric — GHL automations that key off the tag string keep matching
 * regardless of which path (Zap or SavvyOS direct sync) created the row.
 *
 * Exported so the diagnostic testSync uses the same resolver and the two
 * paths can't drift apart.
 */
export async function resolveLeadSourceName(leadSourceId: number | null | undefined): Promise<string | null> {
  if (!leadSourceId) return null;
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ name: leadSources.name })
    .from(leadSources)
    .where(eq(leadSources.id, leadSourceId))
    .limit(1);
  return row?.name ?? null;
}

/**
 * Direct HTTP upsert. Public so the test endpoint can call it with the result.
 * Caller is responsible for catching — used internally by the fire-and-forget
 * wrapper below.
 */
export async function upsertContactToGhl(input: UpsertInput): Promise<UpsertResult> {
  const token = process.env.GHL_LOCATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID || DEFAULT_LOCATION_ID;

  if (!token) {
    return { ok: false, errorBody: "GHL_LOCATION_TOKEN not set — skipping" };
  }

  const email = input.email?.trim() || undefined;
  const phone = input.phone?.trim() || undefined;
  if (!email && !phone) {
    return { ok: false, errorBody: "no email and no phone — nothing to upsert" };
  }

  const tag = input.leadSourceName?.trim() || null;
  const body: Record<string, unknown> = {
    locationId,
    ...(email     ? { email } : {}),
    ...(input.firstName?.trim() ? { firstName: input.firstName.trim() } : {}),
    ...(input.lastName?.trim()  ? { lastName: input.lastName.trim() } : {}),
    ...(phone     ? { phone } : {}),
    ...(tag       ? { tags: [tag], source: tag } : {}),
  };

  let lastErr: UpsertResult = { ok: false, errorBody: "no attempts ran" };
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(GHL_UPSERT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_API_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as Record<string, any>;
        // GHL returns { new: boolean, contact: { id, ... }, traceId } on success;
        // be defensive in case the shape drifts.
        const contact = (json.contact ?? json) as Record<string, any>;
        const ghlContactId = (contact.id ?? contact.contactId) as string | undefined;
        const isNew = json.new === true;
        return { ok: true, ghlContactId, action: isNew ? "created" : "updated", status: res.status };
      }

      // 4xx other than 429 → no point retrying, it's a permanent client error
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const errorBody = await res.text().catch(() => "");
        return { ok: false, status: res.status, errorBody };
      }

      // 5xx / 429 → retry after backoff
      lastErr = { ok: false, status: res.status, errorBody: await res.text().catch(() => "") };
    } catch (err) {
      lastErr = { ok: false, errorBody: (err as Error).message ?? String(err) };
    }

    if (attempt < RETRY_DELAYS_MS.length - 1) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  return lastErr;
}

/**
 * Fire-and-forget entry point for contact-create call sites.
 *
 * Synchronously returns; the actual sync runs in the background. Errors are
 * caught and logged — never propagate. Safe to call without await; safe to
 * call with leadSourceId omitted (we'll fetch it from the contact row).
 */
export function triggerGhlContactSync(contactId: number): void {
  // Defer to a microtask so the caller's transaction has time to commit.
  void (async () => {
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[GHL] sync skipped — DB unavailable", { contactId });
        return;
      }

      const [c] = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          leadSourceId: contacts.leadSourceId,
        })
        .from(contacts)
        .where(eq(contacts.id, contactId))
        .limit(1);

      if (!c) {
        console.warn("[GHL] sync skipped — contact not found", { contactId });
        return;
      }

      const leadSourceName = await resolveLeadSourceName(c.leadSourceId);

      const result = await upsertContactToGhl({
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        leadSourceName,
      });

      if (result.ok) {
        console.log(
          `[GHL] contact ${contactId} ${result.action} — ghlContactId=${result.ghlContactId} leadSource=${JSON.stringify(leadSourceName)}`,
        );
      } else {
        console.error(
          `[GHL] contact ${contactId} sync failed — status=${result.status ?? "n/a"} error=${result.errorBody?.slice(0, 500) ?? "?"}`,
        );
      }
    } catch (err) {
      // Last-resort safety net: contact creation must never fail because of GHL.
      console.error("[GHL] unexpected error during sync", { contactId, err });
    }
  })();
}
