/**
 * Email Behaviors Sync Service
 *
 * Pulls email activity from Resend and GoHighLevel, matches records to
 * SavvyOS contacts by email address, and stores them in email_behaviors.
 * Unmatched emails go into email_behaviors_unmatched for deferred matching
 * when a new contact with that email is later created.
 *
 * Resend sync uses a two-phase approach:
 *   Phase 1 ("new"): Fetch from the newest email backwards until we hit a
 *     previously-seen externalId. This picks up all emails sent since last sync.
 *   Phase 2 ("backfill"): Continue paginating backwards from the historical
 *     cursor to gradually import older emails (newsletter blasts, etc.).
 */
import { getDb } from "./db";
import {
  contacts,
  emailBehaviors,
  emailBehaviorsUnmatched,
  emailBehaviorsSyncState,
} from "../drizzle/schema";
import { eq, inArray, sql } from "drizzle-orm";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
// Use the v2 token (Conversations scope) if set, fall back to the original token
const GHL_LOCATION_TOKEN = process.env.GHL_LOCATION_TOKEN_V2 || process.env.GHL_LOCATION_TOKEN || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "2ZPnQStoB9ZVXSwFdfEw";
const GHL_API_VERSION = "2021-04-15";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailRecord {
  source: "resend" | "ghl";
  externalId: string;
  toEmail: string;
  fromEmail?: string;
  subject?: string;
  direction: "outbound" | "inbound";
  status?: string;
  openedAt?: Date;
  clickedAt?: Date;
  ghlConversationId?: string;
  ghlMessageSource?: string;
  sentAt?: Date;
}

// ─── Resend Sync ─────────────────────────────────────────────────────────────

/**
 * Fetch NEW emails from Resend (newest first, no cursor).
 * Stops when it encounters an email ID that already exists in our DB,
 * meaning we've caught up to previously-synced records.
 */
async function fetchResendNewEmails(
  knownIds: Set<string>,
  maxPages = 20,
): Promise<EmailRecord[]> {
  const records: EmailRecord[] = [];
  let cursor: string | undefined;
  let page = 0;
  let hitKnown = false;

  while (page < maxPages) {
    const url = new URL("https://api.resend.com/emails");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!res.ok) {
      console.error(`[EmailBehaviors] Resend API error (new): ${res.status}`);
      break;
    }

    const json = (await res.json()) as {
      data: Array<{
        id: string;
        to: string[];
        from: string;
        subject: string;
        created_at: string;
        last_event: string;
      }>;
      has_more: boolean;
    };

    if (!json.data || json.data.length === 0) break;

    for (const email of json.data) {
      // If we've seen this ID before, we've caught up — stop
      if (knownIds.has(email.id)) {
        hitKnown = true;
        break;
      }

      const toEmail = (email.to?.[0] ?? "").toLowerCase().trim();
      if (!toEmail) continue;
      const sentDate = email.created_at ? new Date(email.created_at) : undefined;
      const lastEvent = email.last_event ?? "sent";
      records.push({
        source: "resend",
        externalId: email.id,
        toEmail,
        fromEmail: email.from,
        subject: email.subject,
        direction: "outbound",
        status: lastEvent,
        sentAt: sentDate,
        openedAt: (lastEvent === "opened" || lastEvent === "clicked") ? sentDate : undefined,
        clickedAt: lastEvent === "clicked" ? sentDate : undefined,
      });
    }

    if (hitKnown) break;
    if (!json.has_more) break;
    cursor = json.data[json.data.length - 1]?.id;
    page++;
  }

  return records;
}

/**
 * Fetch OLDER emails from Resend for historical backfill.
 * Starts from the backfill cursor and pages backwards.
 */
async function fetchResendBackfillEmails(
  afterId: string,
  maxPages = 10,
): Promise<{ records: EmailRecord[]; nextCursor: string | undefined }> {
  const records: EmailRecord[] = [];
  let cursor: string | undefined = afterId;
  let page = 0;
  let lastId: string | undefined;

  while (page < maxPages) {
    const url = new URL("https://api.resend.com/emails");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!res.ok) {
      console.error(`[EmailBehaviors] Resend API error (backfill): ${res.status}`);
      break;
    }

    const json = (await res.json()) as {
      data: Array<{
        id: string;
        to: string[];
        from: string;
        subject: string;
        created_at: string;
        last_event: string;
      }>;
      has_more: boolean;
    };

    if (!json.data || json.data.length === 0) break;

    for (const email of json.data) {
      const toEmail = (email.to?.[0] ?? "").toLowerCase().trim();
      if (!toEmail) continue;
      const sentDate = email.created_at ? new Date(email.created_at) : undefined;
      const lastEvent = email.last_event ?? "sent";
      records.push({
        source: "resend",
        externalId: email.id,
        toEmail,
        fromEmail: email.from,
        subject: email.subject,
        direction: "outbound",
        status: lastEvent,
        sentAt: sentDate,
        openedAt: (lastEvent === "opened" || lastEvent === "clicked") ? sentDate : undefined,
        clickedAt: lastEvent === "clicked" ? sentDate : undefined,
      });
      lastId = email.id;
    }

    if (!json.has_more) {
      lastId = undefined; // No more pages — backfill complete
      break;
    }
    cursor = json.data[json.data.length - 1]?.id;
    lastId = cursor;
    page++;
  }

  return { records, nextCursor: lastId };
}

// ─── GHL Sync ─────────────────────────────────────────────────────────────────

/**
 * Fetch email messages from GHL conversations API.
 * Iterates through all conversations and extracts TYPE_EMAIL messages.
 */
async function fetchGhlEmailMessages(maxConversations = 500): Promise<EmailRecord[]> {
  const records: EmailRecord[] = [];
  let startAfter: string | undefined;
  let fetched = 0;

  // Step 1: Get all conversations
  const conversations: Array<{
    id: string;
    email: string;
    contactId: string;
    lastMessageType: string;
  }> = [];

  while (fetched < maxConversations) {
    const url = new URL("https://services.leadconnectorhq.com/conversations/search");
    url.searchParams.set("locationId", GHL_LOCATION_ID);
    url.searchParams.set("limit", "100");
    if (startAfter) url.searchParams.set("startAfter", startAfter);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${GHL_LOCATION_TOKEN}`,
        Version: GHL_API_VERSION,
      },
    });

    if (!res.ok) {
      console.error(`[EmailBehaviors] GHL conversations API error: ${res.status}`);
      break;
    }

    const json = (await res.json()) as {
      conversations: Array<{
        id: string;
        email: string;
        contactId: string;
        lastMessageType: string;
        messageTypes?: number[];
        sort?: number[];
      }>;
    };

    if (!json.conversations || json.conversations.length === 0) break;

    for (const conv of json.conversations) {
      // TYPE_EMAIL = 3 in GHL's numeric enum, or "TYPE_EMAIL" string
      const hasEmail =
        conv.lastMessageType === "TYPE_EMAIL" ||
        (conv.messageTypes && conv.messageTypes.includes(3));
      if (hasEmail && conv.email) {
        conversations.push({
          id: conv.id,
          email: conv.email.toLowerCase().trim(),
          contactId: conv.contactId,
          lastMessageType: conv.lastMessageType,
        });
      }
    }

    fetched += json.conversations.length;
    if (json.conversations.length < 100) break;
    // Use sort cursor from last item
    const lastConv = json.conversations[json.conversations.length - 1];
    if (lastConv?.sort?.[0]) {
      startAfter = String(lastConv.sort[0]);
    } else {
      break;
    }
  }

  // Step 2: For each conversation with email, fetch messages
  for (const conv of conversations) {
    try {
      const msgUrl = new URL(
        `https://services.leadconnectorhq.com/conversations/${conv.id}/messages`,
      );
      msgUrl.searchParams.set("limit", "100");
      msgUrl.searchParams.set("type", "TYPE_EMAIL");

      const msgRes = await fetch(msgUrl.toString(), {
        headers: {
          Authorization: `Bearer ${GHL_LOCATION_TOKEN}`,
          Version: GHL_API_VERSION,
        },
      });

      if (!msgRes.ok) continue;

      const msgJson = (await msgRes.json()) as {
        messages?: {
          messages?: Array<{
            id: string;
            direction: string;
            messageType: string;
            dateAdded: string;
            meta?: {
              email?: {
                subject?: string;
                direction?: string;
                messageIds?: string[];
              };
            };
            source?: string;
            body?: string;
          }>;
        };
      };

      const messages = msgJson.messages?.messages ?? [];
      for (const msg of messages) {
        if (msg.messageType !== "TYPE_EMAIL") continue;

        const direction = (msg.meta?.email?.direction ?? msg.direction ?? "outbound") as
          | "outbound"
          | "inbound";
        const subject = msg.meta?.email?.subject ?? "(no subject)";

        records.push({
          source: "ghl",
          externalId: msg.id,
          toEmail: direction === "outbound" ? conv.email : "",
          fromEmail:
            direction === "inbound"
              ? conv.email
              : `GHL Workflow <noreply@${GHL_LOCATION_ID}.ghl>`,
          subject,
          direction,
          status: "sent",
          ghlConversationId: conv.id,
          ghlMessageSource: msg.source ?? "unknown",
          sentAt: msg.dateAdded ? new Date(msg.dateAdded) : undefined,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 50));
    } catch (err) {
      console.error(`[EmailBehaviors] GHL messages fetch error for conv ${conv.id}:`, err);
    }
  }

  return records;
}

// ─── Matching & Upsert ────────────────────────────────────────────────────────

/**
 * Given a batch of EmailRecord objects, look up matching contacts by email,
 * upsert matched records into email_behaviors, and queue unmatched into
 * email_behaviors_unmatched.
 */
async function upsertEmailRecords(records: EmailRecord[]): Promise<{
  matched: number;
  unmatched: number;
  skipped: number;
}> {
  if (records.length === 0) return { matched: 0, unmatched: 0, skipped: 0 };

  const db = await getDb();
  if (!db) return { matched: 0, unmatched: 0, skipped: 0 };

  // Collect unique email addresses
  const emails = Array.from(new Set(records.map((r) => r.toEmail.toLowerCase()).filter(Boolean)));

  // Batch-lookup contacts by email
  const contactRows = await db
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .where(inArray(contacts.email, emails));

  const emailToContactId = new Map<string, number>();
  for (const row of contactRows) {
    if (row.email) emailToContactId.set(row.email.toLowerCase(), row.id);
  }

  let matched = 0;
  let unmatched = 0;
  let skipped = 0;

  for (const record of records) {
    const contactId = emailToContactId.get(record.toEmail.toLowerCase());

    const baseValues = {
      source: record.source,
      externalId: record.externalId,
      toEmail: record.toEmail,
      fromEmail: record.fromEmail ?? null,
      subject: record.subject ?? null,
      direction: record.direction,
      status: record.status ?? null,
      openedAt: record.openedAt ?? null,
      clickedAt: record.clickedAt ?? null,
      ghlConversationId: record.ghlConversationId ?? null,
      ghlMessageSource: record.ghlMessageSource ?? null,
      sentAt: record.sentAt ?? null,
    };

    if (contactId) {
      // Upsert into email_behaviors
      await db
        .insert(emailBehaviors)
        .values({ ...baseValues, contactId })
        .onDuplicateKeyUpdate({
          set: {
            status: record.status ?? null,
            openedAt: record.openedAt ?? null,
            clickedAt: record.clickedAt ?? null,
            updatedAt: new Date(),
          },
        });
      matched++;
    } else {
      // Queue into unmatched staging table
      await db
        .insert(emailBehaviorsUnmatched)
        .values(baseValues)
        .onDuplicateKeyUpdate({
          set: {
            status: record.status ?? null,
            openedAt: record.openedAt ?? null,
            clickedAt: record.clickedAt ?? null,
          },
        });
      unmatched++;
    }
  }

  return { matched, unmatched, skipped };
}

// ─── Deferred Match ───────────────────────────────────────────────────────────

/**
 * Called when a new contact is created (or email updated). Checks the
 * unmatched queue for any rows matching the contact's email and promotes
 * them into email_behaviors.
 */
export async function promoteUnmatchedEmailBehaviors(
  contactId: number,
  email: string,
): Promise<number> {
  if (!email) return 0;
  const db = await getDb();
  if (!db) return 0;

  const normalizedEmail = email.toLowerCase().trim();

  // Find unmatched rows for this email
  const unmatchedRows = await db
    .select()
    .from(emailBehaviorsUnmatched)
    .where(eq(emailBehaviorsUnmatched.toEmail, normalizedEmail));

  if (unmatchedRows.length === 0) return 0;

  let promoted = 0;
  for (const row of unmatchedRows) {
    await db
      .insert(emailBehaviors)
      .values({
        contactId,
        source: row.source,
        externalId: row.externalId,
        toEmail: row.toEmail,
        fromEmail: row.fromEmail,
        subject: row.subject,
        direction: row.direction,
        status: row.status,
        openedAt: row.openedAt,
        clickedAt: row.clickedAt,
        ghlConversationId: row.ghlConversationId,
        ghlMessageSource: row.ghlMessageSource,
        sentAt: row.sentAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          contactId,
          status: row.status,
          openedAt: row.openedAt,
          clickedAt: row.clickedAt,
          updatedAt: new Date(),
        },
      });
    promoted++;
  }

  // Remove promoted rows from unmatched queue
  if (promoted > 0) {
    const ids = unmatchedRows.map((r) => r.id);
    await db
      .delete(emailBehaviorsUnmatched)
      .where(inArray(emailBehaviorsUnmatched.id, ids));
    console.log(
      `[EmailBehaviors] Promoted ${promoted} unmatched records for contact ${contactId} (${email})`,
    );
  }

  return promoted;
}

// ─── Main Sync Orchestrator ───────────────────────────────────────────────────

let isSyncing = false;

export async function syncEmailBehaviors(options?: {
  forceFullSync?: boolean;
  sources?: Array<"resend" | "ghl">;
}): Promise<{
  resend: { matched: number; unmatched: number } | null;
  ghl: { matched: number; unmatched: number } | null;
  error?: string;
}> {
  if (isSyncing) {
    console.log("[EmailBehaviors] Sync already in progress, skipping");
    return { resend: null, ghl: null, error: "sync_in_progress" };
  }

  isSyncing = true;
  const result: {
    resend: { matched: number; unmatched: number } | null;
    ghl: { matched: number; unmatched: number } | null;
    error?: string;
  } = { resend: null, ghl: null };

  try {
    const db = await getDb();
    if (!db) {
      result.error = "db_unavailable";
      return result;
    }

    const sources = options?.sources ?? ["resend", "ghl"];

    // ── Resend sync ──────────────────────────────────────────────────────────
    if (sources.includes("resend") && RESEND_API_KEY) {
      console.log("[EmailBehaviors] Starting Resend sync...");
      try {
        // Get sync state
        const [syncState] = await db
          .select()
          .from(emailBehaviorsSyncState)
          .where(eq(emailBehaviorsSyncState.source, "resend"))
          .limit(1);

        let totalMatched = 0;
        let totalUnmatched = 0;

        // ── Phase 1: Fetch NEW emails (sent since last sync) ──────────────
        // Get a sample of recent externalIds to detect overlap
        const recentRows = await db
          .select({ externalId: emailBehaviors.externalId })
          .from(emailBehaviors)
          .where(eq(emailBehaviors.source, "resend"))
          .orderBy(sql`${emailBehaviors.createdAt} DESC`)
          .limit(500);
        const recentUnmatchedRows = await db
          .select({ externalId: emailBehaviorsUnmatched.externalId })
          .from(emailBehaviorsUnmatched)
          .where(eq(emailBehaviorsUnmatched.source, "resend"))
          .orderBy(sql`${emailBehaviorsUnmatched.createdAt} DESC`)
          .limit(500);

        const knownIds = new Set<string>([
          ...recentRows.map((r) => r.externalId),
          ...recentUnmatchedRows.map((r) => r.externalId),
        ]);

        if (!options?.forceFullSync) {
          console.log("[EmailBehaviors] Phase 1: Fetching new Resend emails...");
          const newRecords = await fetchResendNewEmails(knownIds);

          if (newRecords.length > 0) {
            const stats = await upsertEmailRecords(newRecords);
            totalMatched += stats.matched;
            totalUnmatched += stats.unmatched;
            console.log(
              `[EmailBehaviors] Phase 1 complete — ${newRecords.length} new emails (matched: ${stats.matched}, unmatched: ${stats.unmatched})`,
            );
          } else {
            console.log("[EmailBehaviors] Phase 1 — no new emails since last sync");
          }
        }

        // ── Phase 2: Historical backfill (continue from old cursor) ───────
        const backfillCursor = syncState?.lastCursor;
        if (backfillCursor || options?.forceFullSync) {
          console.log("[EmailBehaviors] Phase 2: Backfill from historical cursor...");
          const startCursor = options?.forceFullSync ? undefined : backfillCursor!;
          // For backfill, use the old fetch function approach but with limited pages
          const { records: backfillRecords, nextCursor } = startCursor
            ? await fetchResendBackfillEmails(startCursor, 10)
            : await fetchResendBackfillEmails("", 10); // empty string won't be used

          if (backfillRecords.length > 0) {
            const stats = await upsertEmailRecords(backfillRecords);
            totalMatched += stats.matched;
            totalUnmatched += stats.unmatched;
            console.log(
              `[EmailBehaviors] Phase 2 complete — ${backfillRecords.length} backfill emails (matched: ${stats.matched}, unmatched: ${stats.unmatched})`,
            );
          } else {
            console.log("[EmailBehaviors] Phase 2 — backfill complete (no more historical emails)");
          }

          // Update backfill cursor
          if (nextCursor) {
            await db
              .insert(emailBehaviorsSyncState)
              .values({
                source: "resend",
                lastSyncedAt: new Date(),
                lastCursor: nextCursor,
                totalImported: totalMatched + totalUnmatched,
              })
              .onDuplicateKeyUpdate({
                set: {
                  lastSyncedAt: new Date(),
                  lastCursor: nextCursor,
                  totalImported: sql`totalImported + ${totalMatched + totalUnmatched}`,
                  updatedAt: new Date(),
                },
              });
          } else {
            // Backfill complete — just update timestamp
            await db
              .insert(emailBehaviorsSyncState)
              .values({
                source: "resend",
                lastSyncedAt: new Date(),
                lastCursor: backfillCursor ?? null,
                totalImported: totalMatched + totalUnmatched,
              })
              .onDuplicateKeyUpdate({
                set: {
                  lastSyncedAt: new Date(),
                  totalImported: sql`totalImported + ${totalMatched + totalUnmatched}`,
                  updatedAt: new Date(),
                },
              });
          }
        } else {
          // No backfill cursor yet — just update sync timestamp
          await db
            .insert(emailBehaviorsSyncState)
            .values({
              source: "resend",
              lastSyncedAt: new Date(),
              totalImported: totalMatched + totalUnmatched,
            })
            .onDuplicateKeyUpdate({
              set: {
                lastSyncedAt: new Date(),
                totalImported: sql`totalImported + ${totalMatched + totalUnmatched}`,
                updatedAt: new Date(),
              },
            });
        }

        result.resend = { matched: totalMatched, unmatched: totalUnmatched };
        console.log(
          `[EmailBehaviors] Resend sync complete — total matched: ${totalMatched}, unmatched: ${totalUnmatched}`,
        );
      } catch (err) {
        console.error("[EmailBehaviors] Resend sync error:", err);
        result.resend = { matched: 0, unmatched: 0 };
      }
    }

    // ── GHL sync ─────────────────────────────────────────────────────────────
    if (sources.includes("ghl") && GHL_LOCATION_TOKEN) {
      console.log("[EmailBehaviors] Starting GHL sync...");
      try {
        const records = await fetchGhlEmailMessages();

        if (records.length > 0) {
          const stats = await upsertEmailRecords(records);
          result.ghl = { matched: stats.matched, unmatched: stats.unmatched };

          await db
            .insert(emailBehaviorsSyncState)
            .values({
              source: "ghl",
              lastSyncedAt: new Date(),
              totalImported: stats.matched + stats.unmatched,
            })
            .onDuplicateKeyUpdate({
              set: {
                lastSyncedAt: new Date(),
                totalImported: sql`totalImported + ${stats.matched + stats.unmatched}`,
                updatedAt: new Date(),
              },
            });

          console.log(
            `[EmailBehaviors] GHL sync complete — matched: ${stats.matched}, unmatched: ${stats.unmatched}`,
          );
        } else {
          result.ghl = { matched: 0, unmatched: 0 };
          console.log("[EmailBehaviors] GHL sync — no new records");
        }
      } catch (err) {
        console.error("[EmailBehaviors] GHL sync error:", err);
        result.ghl = { matched: 0, unmatched: 0 };
      }
    }
  } finally {
    isSyncing = false;
  }

  return result;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export function scheduleEmailBehaviorsSync(): void {
  // Run once at startup after a short delay
  setTimeout(() => {
    syncEmailBehaviors().catch((err) =>
      console.error("[EmailBehaviors] Startup sync error:", err),
    );
  }, 30_000);

  // Then every 10 minutes
  setInterval(
    () => {
      syncEmailBehaviors().catch((err) =>
        console.error("[EmailBehaviors] Scheduled sync error:", err),
      );
    },
    10 * 60 * 1000,
  );

  console.log("[EmailBehaviors] Sync scheduler registered (startup + every 10 min)");
}
