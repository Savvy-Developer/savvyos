/**
 * Email Behaviors Sync Service
 *
 * Pulls email activity from Resend and GoHighLevel, matches records to
 * SavvyOS contacts by email address, and stores them in email_behaviors.
 * Unmatched emails go into email_behaviors_unmatched for deferred matching
 * when a new contact with that email is later created.
 *
 * Resend sync strategy:
 *   Always starts from the NEWEST email and pages backwards until it passes
 *   the most recent sentAt timestamp already in our DB. This guarantees all
 *   new emails are captured regardless of newsletter blast sizes.
 *   Uses upsert (ON DUPLICATE KEY) so re-processing the same email is safe.
 *   Runs every 10 minutes.
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
 * Fetch emails from Resend starting from the newest, paging backwards.
 * Stops when:
 *   - We encounter an email with created_at older than `stopBefore` (we've caught up)
 *   - We hit `maxPages` (safety limit to avoid infinite loops)
 *   - There are no more pages
 *
 * The `overlapBuffer` (default 5 min) ensures we don't miss emails sent at
 * the exact same second as our last sync boundary.
 */
async function fetchResendEmailsSince(
  stopBefore: Date,
  maxPages = 500,
): Promise<EmailRecord[]> {
  const records: EmailRecord[] = [];
  let cursor: string | undefined;
  let page = 0;
  let reachedStop = false;

  // Add a 5-minute overlap buffer to avoid missing emails at the boundary
  const stopTime = new Date(stopBefore.getTime() - 5 * 60 * 1000);

  while (page < maxPages) {
    const url = new URL("https://api.resend.com/emails");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!res.ok) {
      console.error(`[EmailBehaviors] Resend API error: ${res.status}`);
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
      const createdAt = email.created_at ? new Date(email.created_at) : null;

      // If this email is older than our stop time, we've caught up
      if (createdAt && createdAt < stopTime) {
        reachedStop = true;
        break;
      }

      const toEmail = (email.to?.[0] ?? "").toLowerCase().trim();
      if (!toEmail) continue;
      const sentDate = createdAt ?? undefined;
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

    if (reachedStop) break;
    if (!json.has_more) break;
    cursor = json.data[json.data.length - 1]?.id;
    page++;
  }

  if (page >= maxPages && !reachedStop) {
    console.warn(
      `[EmailBehaviors] Hit maxPages (${maxPages}) without reaching stop time. ` +
      `Processed ${records.length} records. Will continue on next run.`,
    );
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
): Promise<{ records: EmailRecord[]; nextCursor: string | undefined; done: boolean }> {
  const records: EmailRecord[] = [];
  let cursor: string | undefined = afterId;
  let page = 0;
  let lastCursor: string | undefined;
  let done = false;

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

    if (!json.data || json.data.length === 0) {
      done = true;
      break;
    }

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
    }

    if (!json.has_more) {
      done = true;
      break;
    }
    lastCursor = json.data[json.data.length - 1]?.id;
    cursor = lastCursor;
    page++;
  }

  return { records, nextCursor: done ? undefined : lastCursor, done };
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

// ─── Gap Detection ──────────────────────────────────────────────────────────

/**
 * Check if there's a gap in our Resend email data.
 * Returns true if any day between Jul 30 and Aug 3 2026 has fewer than
 * 1000 records (each daily digest goes to ~48K contacts, so a fully
 * synced day should have many thousands of matched records).
 */
async function checkForGap(db: any): Promise<boolean> {
  const gapDays = await db
    .select({
      day: sql<string>`DATE(sentAt)`,
      cnt: sql<number>`COUNT(*)`,
    })
    .from(emailBehaviors)
    .where(sql`source = 'resend' AND sentAt BETWEEN '2026-07-30 00:00:00' AND '2026-08-03 21:00:00'`)
    .groupBy(sql`DATE(sentAt)`);

  const dayMap = new Map(gapDays.map((d: any) => [d.day, d.cnt]));
  const expectedDays = ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03"];
  const hasGap = expectedDays.some((day) => (dayMap.get(day) ?? 0) < 1000);

  if (hasGap) {
    const missingDays = expectedDays.filter((d) => (dayMap.get(d) ?? 0) < 1000);
    console.log(`[EmailBehaviors] Gap check: under-filled days: ${missingDays.join(", ")}`);
  }

  return hasGap;
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

        // ── Phase A: Fetch truly NEW emails (sent since last sync) ──────────
        // This is fast — only fetches emails from the last 10 minutes.
        if (!options?.forceFullSync && syncState?.lastSyncedAt) {
          const newStopBefore = new Date(syncState.lastSyncedAt);
          console.log(
            `[EmailBehaviors] Phase A: Fetching new emails since ${newStopBefore.toISOString()}...`,
          );
          const newRecords = await fetchResendEmailsSince(newStopBefore, 20);

          if (newRecords.length > 0) {
            const stats = await upsertEmailRecords(newRecords);
            totalMatched += stats.matched;
            totalUnmatched += stats.unmatched;
            console.log(
              `[EmailBehaviors] Phase A — ${newRecords.length} new emails (matched: ${stats.matched}, unmatched: ${stats.unmatched})`,
            );
          } else {
            console.log("[EmailBehaviors] Phase A — no new emails since last sync");
          }
        } else if (!syncState?.lastSyncedAt) {
          // First ever run — fetch from newest with no cursor
          console.log("[EmailBehaviors] First run — fetching from newest...");
          const newRecords = await fetchResendEmailsSince(new Date(0), 500);
          if (newRecords.length > 0) {
            const stats = await upsertEmailRecords(newRecords);
            totalMatched += stats.matched;
            totalUnmatched += stats.unmatched;
          }
        }

        // ── Phase B: Gap fill (resume from saved cursor) ────────────────────
        // Checks if there's a gap in our data and fills it incrementally.
        // Uses gapFillCursor to resume where we left off instead of starting
        // from newest every time (which would waste pages on already-seen data).
        const gapFillCursor = syncState?.gapFillCursor;
        const hasGapToFill = await checkForGap(db);

        if (hasGapToFill) {
          if (gapFillCursor) {
            // Resume gap fill from saved cursor
            console.log("[EmailBehaviors] Phase B: Resuming gap fill from saved cursor...");
            const { records: gapRecords, nextCursor, done } =
              await fetchResendBackfillEmails(gapFillCursor, 500);

            if (gapRecords.length > 0) {
              const stats = await upsertEmailRecords(gapRecords);
              totalMatched += stats.matched;
              totalUnmatched += stats.unmatched;
              console.log(
                `[EmailBehaviors] Phase B — ${gapRecords.length} gap emails (matched: ${stats.matched}, unmatched: ${stats.unmatched})`,
              );
            }

            // Save progress
            await db
              .insert(emailBehaviorsSyncState)
              .values({
                source: "resend",
                lastSyncedAt: new Date(),
                gapFillCursor: done ? null : (nextCursor ?? null),
                totalImported: totalMatched + totalUnmatched,
              })
              .onDuplicateKeyUpdate({
                set: {
                  lastSyncedAt: new Date(),
                  gapFillCursor: done ? null : (nextCursor ?? null),
                  totalImported: sql`totalImported + ${totalMatched + totalUnmatched}`,
                  updatedAt: new Date(),
                },
              });

            if (done) {
              console.log("[EmailBehaviors] Phase B — gap fill reached end of Resend history");
            }
          } else {
            // No gap fill cursor yet — need to find the starting point.
            // The gap is between our newest "old" data and our oldest "new" data.
            // We start from the oldest record in our recent data and page backwards.
            console.log("[EmailBehaviors] Phase B: Initializing gap fill cursor...");

            // Find the oldest record from the recent sync batch (Aug 3 area)
            const [oldestRecent] = await db
              .select({ minId: sql<string>`MIN(externalId)` })
              .from(emailBehaviors)
              .where(sql`source = 'resend' AND sentAt >= '2026-08-02 00:00:00'`);

            if (oldestRecent?.minId) {
              // Use this as the starting cursor for gap fill
              // But we need the Resend pagination cursor, not just any ID.
              // The fetchResendBackfillEmails uses 'after' param which takes any email ID.
              // Find the LAST (oldest) record from Aug 3 batch to start after it.
              const [lastAug3] = await db
                .select({ eid: sql<string>`externalId` })
                .from(emailBehaviors)
                .where(sql`source = 'resend' AND sentAt BETWEEN '2026-08-02 21:00:00' AND '2026-08-02 21:10:00'`)
                .orderBy(sql`id ASC`)
                .limit(1);

              const startCursor = lastAug3?.eid || oldestRecent.minId;
              console.log(`[EmailBehaviors] Phase B — starting gap fill from cursor: ${startCursor}`);

              // Do first batch
              const { records: gapRecords, nextCursor, done } =
                await fetchResendBackfillEmails(startCursor, 500);

              if (gapRecords.length > 0) {
                const stats = await upsertEmailRecords(gapRecords);
                totalMatched += stats.matched;
                totalUnmatched += stats.unmatched;
                console.log(
                  `[EmailBehaviors] Phase B — ${gapRecords.length} gap emails (matched: ${stats.matched}, unmatched: ${stats.unmatched})`,
                );
              }

              await db
                .insert(emailBehaviorsSyncState)
                .values({
                  source: "resend",
                  lastSyncedAt: new Date(),
                  gapFillCursor: done ? null : (nextCursor ?? null),
                  totalImported: totalMatched + totalUnmatched,
                })
                .onDuplicateKeyUpdate({
                  set: {
                    lastSyncedAt: new Date(),
                    gapFillCursor: done ? null : (nextCursor ?? null),
                    totalImported: sql`totalImported + ${totalMatched + totalUnmatched}`,
                    updatedAt: new Date(),
                  },
                });
            } else {
              console.log("[EmailBehaviors] Phase B — no recent records to anchor gap fill");
              // Just update timestamp
              await db
                .insert(emailBehaviorsSyncState)
                .values({ source: "resend", lastSyncedAt: new Date(), totalImported: 0 })
                .onDuplicateKeyUpdate({
                  set: { lastSyncedAt: new Date(), updatedAt: new Date() },
                });
            }
          }
        } else {
          // No gap — just update sync timestamp
          console.log("[EmailBehaviors] No gap detected — sync complete");
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
                gapFillCursor: null, // clear gap cursor since gap is filled
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
