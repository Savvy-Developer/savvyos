/**
 * Aircall Integration — Core Module
 *
 * Provides the shared logic used by both the historical backfill script
 * and the live webhook endpoint:
 *
 *  - normalizePhone()         — strip formatting to digits-only for matching
 *  - findContactByPhone()     — look up a SavvyOS contact by any phone field
 *  - downloadAndStoreRecording() — fetch Aircall's expiring URL → S3
 *  - processAircallCall()     — idempotent upsert: match → store → activity
 */

import { getDb } from "./db";
import { storagePut } from "./storage";
import {
  contacts,
  communications,
  users,
  aircallCalls,
  aircallUnmatchedCalls,
} from "../drizzle/schema";
import { asc, eq, or, and, like, inArray, desc, isNull, lt, gte, sql } from "drizzle-orm";
import { transcribeAndSummarize } from "./aircallTranscribe";

// ─── Phone Normalisation ──────────────────────────────────────────────────────

/**
 * Strip all non-digit characters and remove a leading "1" for US numbers so
 * that "+1 (555) 867-5309", "15558675309", and "5558675309" all map to the
 * same 10-digit string "5558675309".
 *
 * This matches the format Aircall uses (E.164 with country code) against the
 * mixed formats stored in SavvyOS contacts.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  // US numbers: strip leading country code "1" to get 10 digits
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits;
}

// ─── Contact Lookup ───────────────────────────────────────────────────────────

/**
 * Find a SavvyOS contact whose primary, secondary, or spouse phone number
 * matches the given raw phone string after normalization.
 * Returns the first match, or null if none found.
 */
export async function findContactByPhone(
  rawPhone: string
): Promise<{ id: number; firstName: string; lastName: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const norm = normalizePhone(rawPhone);
  if (!norm) return null;

  // Build a set of candidate formats: the normalized 10-digit form and the
  // E.164 "+1XXXXXXXXXX" form, to handle both storage conventions.
  const e164 = norm.length === 10 ? `+1${norm}` : `+${norm}`;
  const candidates = [norm, e164, `1${norm}`];

  // Query all contacts whose phone, secondaryPhone, or spousePhone matches
  // any candidate. We use OR conditions across all three phone fields.
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      secondaryPhone: contacts.secondaryPhone,
      spousePhone: contacts.spousePhone,
    })
    .from(contacts)
    .limit(200); // fetch a batch; we'll filter in JS for flexibility

  for (const row of rows) {
    const phones = [row.phone, row.secondaryPhone, row.spousePhone];
    for (const p of phones) {
      if (!p) continue;
      const n = normalizePhone(p);
      if (n === norm || n === `1${norm}`) {
        return { id: row.id, firstName: row.firstName, lastName: row.lastName };
      }
    }
  }

  return null;
}

/**
 * More efficient DB-side phone matching using LIKE patterns.
 * Used for production matching where we can't load all contacts.
 */
export async function findContactByPhoneDB(
  rawPhone: string
): Promise<{ id: number; firstName: string; lastName: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const norm = normalizePhone(rawPhone);
  if (!norm) return null;

  // Fetch a small candidate set by the final four digits, then compare fully
  // normalized values in application code. This covers contacts saved with
  // punctuation, spaces, country codes, or mixed formatting without scanning
  // the entire contacts table.
  const finalFour = norm.slice(-4);
  if (finalFour.length < 4) return null;
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
      secondaryPhone: contacts.secondaryPhone,
      spousePhone: contacts.spousePhone,
    })
    .from(contacts)
    .where(
      or(
        like(contacts.phone, `%${finalFour}`),
        like(contacts.secondaryPhone, `%${finalFour}`),
        like(contacts.spousePhone, `%${finalFour}`),
      )
    )
    .limit(100);

  for (const row of rows) {
    for (const phone of [row.phone, row.secondaryPhone, row.spousePhone]) {
      if (normalizePhone(phone) === norm) {
        return { id: row.id, firstName: row.firstName, lastName: row.lastName };
      }
    }
  }

  return null;
}

// ─── Recording Download & Storage ─────────────────────────────────────────────

/**
 * Download a recording from Aircall's expiring signed URL and permanently
 * store it in S3 under aircall/recordings/{callId}.mp3.
 * Returns the permanent S3 URL and key, or null if no recording URL provided.
 */
export async function downloadAndStoreRecording(
  aircallCallId: number | string,
  recordingUrl: string | null | undefined,
  type: "recording" | "voicemail" = "recording"
): Promise<{ url: string; key: string } | null> {
  if (!recordingUrl) return null;

  try {
    const response = await fetch(recordingUrl, {
      headers: { "User-Agent": "SavvyOS/1.0" },
    });

    if (!response.ok) {
      console.error(
        `[Aircall] Failed to download ${type} for call ${aircallCallId}: HTTP ${response.status}`
      );
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const suffix = type === "voicemail" ? "voicemail" : "recording";
    const key = `aircall/recordings/${aircallCallId}-${suffix}.mp3`;

    const result = await storagePut(key, buffer, "audio/mpeg");
    console.log(`[Aircall] Stored ${type} for call ${aircallCallId} → ${result.url}`);
    return result;
  } catch (err: any) {
    console.error(
      `[Aircall] Error downloading ${type} for call ${aircallCallId}: ${err.message}`
    );
    return null;
  }
}

// ─── Call Data Types ──────────────────────────────────────────────────────────

export interface AircallCallData {
  id: number;
  direction: "inbound" | "outbound";
  status: string; // done, missed, voicemail, etc.
  duration?: number;
  started_at?: number; // Unix timestamp
  answered_at?: number;
  ended_at?: number;
  raw_digits?: string;     // caller's number (inbound) or dialed number (outbound)
  number?: {
    id?: number;
    name?: string;
    digits?: string;       // the Aircall line number
  };
  recording?: string | null;
  voicemail?: string | null;
  missed_call_reason?: string | null;
  user?: { id?: number; name?: string; email?: string } | null;
  tags?: Array<{ id: number; name: string }>;
}

// ─── Format Activity Body ─────────────────────────────────────────────────────

function formatCallBody(call: AircallCallData, contactName: string, actorLabel = "Agent"): string {
  const dir = call.direction === "inbound" ? "Inbound" : "Outbound";
  const status = formatStatus(call.status, call.missed_call_reason);
  const dur = call.duration ? formatDuration(call.duration) : "—";
  const agent = call.user?.name ?? "Unknown agent";
  const line = call.number?.name ?? call.number?.digits ?? "Unknown line";

  return [
    `${dir} call — ${status}`,
    `Duration: ${dur}`,
    `${actorLabel}: ${agent}`,
    `Line: ${line}`,
    call.missed_call_reason ? `Missed reason: ${call.missed_call_reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatStatus(status: string, missedReason?: string | null): string {
  if (status === "done" && !missedReason) return "Completed";
  if (status === "done" && missedReason) return "Missed";
  if (status === "missed") return "Missed";
  if (status === "voicemail") return "Voicemail";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ─── Main Processor ───────────────────────────────────────────────────────────

export interface ProcessCallResult {
  action: "created" | "skipped" | "unmatched";
  aircallCallId: number;
  contactId?: number;
  communicationId?: number;
  message?: string;
}

type AircallContactMatch = { id: number; firstName: string; lastName: string };

/**
 * Start transcription after a call has been linked to a CRM activity. This is
 * intentionally non-blocking, so webhook ingestion and contact edits never
 * wait on audio downloads or AI processing.
 */
export function scheduleAircallTranscription(
  communicationId: number,
  call: AircallCallData
): void {
  if (!call.recording && !call.voicemail) return;

  void (async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select({ audioFileUrl: communications.audioFileUrl })
      .from(communications)
      .where(eq(communications.id, communicationId))
      .limit(1);
    const audioUrl = rows[0]?.audioFileUrl;
    if (!audioUrl) return;

    await transcribeAndSummarize({
      communicationId,
      aircallCallId: call.id,
      audioUrl,
      direction: call.direction,
      duration: call.duration ?? null,
      agentName: call.user?.name,
    });
  })().catch((error: unknown) => {
    console.error(
      `[Aircall] Transcription error for communication ${communicationId}:`,
      error instanceof Error ? error.message : error
    );
  });
}

/**
 * Aircall can emit call.ended before the recording URL is downloadable. Retry a
 * bounded number of times, then update the existing activity and continue the
 * normal transcription flow instead of leaving an unplayable call permanently.
 */
function scheduleAircallMediaRetry(
  communicationId: number,
  call: AircallCallData,
  attempt = 1,
): void {
  if (!call.recording && !call.voicemail) return;
  const maxAttempts = 3;
  const delayMs = attempt * 30_000;
  setTimeout(() => {
    void (async () => {
      const db = await getDb();
      if (!db) return;
      const [communication] = await db
        .select({ audioFileUrl: communications.audioFileUrl })
        .from(communications)
        .where(eq(communications.id, communicationId))
        .limit(1);
      if (communication?.audioFileUrl) return;

      const [recording, voicemail] = await Promise.all([
        downloadAndStoreRecording(call.id, call.recording, "recording"),
        downloadAndStoreRecording(call.id, call.voicemail, "voicemail"),
      ]);
      const media = recording ?? voicemail;
      if (!media) {
        if (attempt < maxAttempts) scheduleAircallMediaRetry(communicationId, call, attempt + 1);
        else console.error(`[Aircall] Recording unavailable after ${maxAttempts} attempts for call ${call.id}`);
        return;
      }

      await db.update(communications)
        .set({ audioFileUrl: media.url })
        .where(eq(communications.id, communicationId));
      await db.update(aircallCalls)
        .set(recording
          ? { recordingUrl: recording.url, recordingKey: recording.key }
          : { voicemailUrl: voicemail!.url, voicemailKey: voicemail!.key })
        .where(eq(aircallCalls.communicationId, communicationId));
      scheduleAircallTranscription(communicationId, call);
    })().catch((error: unknown) => {
      console.error(`[Aircall] Recording retry ${attempt} failed for communication ${communicationId}:`, error);
      if (attempt < maxAttempts) scheduleAircallMediaRetry(communicationId, call, attempt + 1);
    });
  }, delayMs);
}

export type AircallRecordingRecoveryOptions = {
  /** Only revisit calls completed within this window. Defaults to 7 days. */
  lookbackDays?: number;
  /** Query page size while processing all eligible calls. Defaults to 100. */
  batchSize?: number;
  /** Maximum recovery attempts per call before the nightly job stops retrying it. */
  maxAttempts?: number;
};

export type AircallRecordingRecoveryResult = {
  candidates: number;
  attempted: number;
  recovered: number;
  noRecordingAvailable: number;
  errors: number;
  skipped: number;
};

function aircallBasicAuth(): string | null {
  const apiId = process.env.AIRCALL_API_ID;
  const apiToken = process.env.AIRCALL_API_TOKEN;
  return apiId && apiToken ? Buffer.from(`${apiId}:${apiToken}`).toString("base64") : null;
}

/** Fetch current call data so an expired webhook recording URL is never retried. */
async function fetchFreshAircallCall(aircallCallId: number): Promise<AircallCallData | null> {
  const auth = aircallBasicAuth();
  if (!auth) throw new Error("Aircall API credentials are not configured");
  const response = await fetch(`https://api.aircall.io/v1/calls/${aircallCallId}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Aircall call lookup returned HTTP ${response.status}`);
  const payload = await response.json() as AircallCallData | { call?: AircallCallData };
  const wrapped = payload as { call?: AircallCallData };
  const call = wrapped.call ?? (payload as AircallCallData);
  return typeof call.id === "number" ? call : null;
}

/**
 * Revisit only recent imported calls that still lack permanently stored media.
 * The function fetches current Aircall call data first, then stores the fresh
 * recording/voicemail URL, queues transcription, and records a bounded retry.
 */
export async function reconcileRecentAircallRecordings(
  options: AircallRecordingRecoveryOptions = {},
): Promise<AircallRecordingRecoveryResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const lookbackDays = Math.max(1, Math.min(options.lookbackDays ?? 7, 30));
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 150));
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 5, 10));
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  // Fix the run start so calls updated by this job are not selected again until
  // tomorrow. Pagination therefore drains the entire eligible set exactly once.
  const runStartedAt = new Date();
  // MySQL timestamps are stored at second precision in this schema. Align the
  // run marker so a just-updated row cannot satisfy the next page's predicate.
  runStartedAt.setMilliseconds(0);
  const result: AircallRecordingRecoveryResult = {
    candidates: 0, attempted: 0, recovered: 0, noRecordingAvailable: 0, errors: 0, skipped: 0,
  };

  while (true) {
    const rows = await db
      .select({
        id: aircallCalls.id,
        aircallCallId: aircallCalls.aircallCallId,
        communicationId: aircallCalls.communicationId,
      })
      .from(aircallCalls)
      .innerJoin(communications, eq(communications.id, aircallCalls.communicationId))
      .where(and(
        gte(aircallCalls.startedAt, since),
        isNull(communications.audioFileUrl),
        lt(aircallCalls.recordingRecoveryAttempts, maxAttempts),
        or(
          isNull(aircallCalls.recordingRecoveryLastAttemptAt),
          lt(aircallCalls.recordingRecoveryLastAttemptAt, runStartedAt),
        ),
      ))
      .orderBy(asc(aircallCalls.recordingRecoveryLastAttemptAt), asc(aircallCalls.startedAt))
      .limit(batchSize);

    if (rows.length === 0) break;
    result.candidates += rows.length;

    for (const row of rows) {
      if (!row.communicationId) {
        result.skipped += 1;
        continue;
      }
      result.attempted += 1;
      const attemptedAt = new Date();
      try {
        const freshCall = await fetchFreshAircallCall(row.aircallCallId);
        if (!freshCall?.recording && !freshCall?.voicemail) {
          result.noRecordingAvailable += 1;
          await db.update(aircallCalls).set({
            rawPayload: freshCall as any ?? undefined,
            recordingRecoveryLastAttemptAt: attemptedAt,
            recordingRecoveryLastError: "Aircall has not made a recording or voicemail available",
            recordingRecoveryAttempts: sql`${aircallCalls.recordingRecoveryAttempts} + 1`,
          }).where(eq(aircallCalls.id, row.id));
          continue;
        }

        const [recording, voicemail] = await Promise.all([
          downloadAndStoreRecording(freshCall.id, freshCall.recording, "recording"),
          downloadAndStoreRecording(freshCall.id, freshCall.voicemail, "voicemail"),
        ]);
        const media = recording ?? voicemail;
        if (!media) {
          result.errors += 1;
          await db.update(aircallCalls).set({
            rawPayload: freshCall as any,
            recordingRecoveryLastAttemptAt: attemptedAt,
            recordingRecoveryLastError: "Current Aircall media URL could not be downloaded",
            recordingRecoveryAttempts: sql`${aircallCalls.recordingRecoveryAttempts} + 1`,
          }).where(eq(aircallCalls.id, row.id));
          continue;
        }

        await db.update(communications).set({ audioFileUrl: media.url })
          .where(eq(communications.id, row.communicationId));
        await db.update(aircallCalls).set({
          rawPayload: freshCall as any,
          ...(recording
            ? { recordingUrl: recording.url, recordingKey: recording.key }
            : { voicemailUrl: voicemail!.url, voicemailKey: voicemail!.key }),
          recordingRecoveryLastAttemptAt: attemptedAt,
          recordingRecoveryLastError: null,
          recordingRecoveryAttempts: sql`${aircallCalls.recordingRecoveryAttempts} + 1`,
        }).where(eq(aircallCalls.id, row.id));
        scheduleAircallTranscription(row.communicationId, freshCall);
        result.recovered += 1;
      } catch (error) {
        result.errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        await db.update(aircallCalls).set({
          recordingRecoveryLastAttemptAt: attemptedAt,
          recordingRecoveryLastError: message.slice(0, 512),
          recordingRecoveryAttempts: sql`${aircallCalls.recordingRecoveryAttempts} + 1`,
        }).where(eq(aircallCalls.id, row.id));
        console.error(`[Aircall] Recent recording recovery failed for call ${row.aircallCallId}:`, message);
      }
    }
  }

  return result;
}

/**
 * Idempotent call processor. Given an Aircall call payload:
 *
 * 1. Check if this call was already processed (dedup by aircallCallId).
 * 2. Determine the phone number to match (caller for inbound, dialed for outbound).
 * 3. Look up the SavvyOS contact by phone.
 * 4. Download and permanently store the recording/voicemail.
 * 5. Create a `communications` row (type="call") linked to the contact.
 * 6. Insert/update the `aircall_calls` row.
 * 7. If no contact found, insert into `aircall_unmatched_calls`.
 */
export async function processAircallCall(
  call: AircallCallData,
  options?: { contactOverride?: AircallContactMatch; skipMediaDownload?: boolean }
): Promise<ProcessCallResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const callId = call.id;

  // ── 1. Dedup check ─────────────────────────────────────────────────────────
  const existing = await db
    .select({ id: aircallCalls.id, communicationId: aircallCalls.communicationId })
    .from(aircallCalls)
    .where(eq(aircallCalls.aircallCallId, callId))
    .limit(1);

  if (existing.length > 0) {
    return {
      action: "skipped",
      aircallCallId: callId,
      communicationId: existing[0].communicationId ?? undefined,
      message: "Already processed",
    };
  }

  // ── 2. Determine phone to match ────────────────────────────────────────────
  // For inbound calls: the caller's number (raw_digits) is the contact's phone.
  // For outbound calls: the dialed number (raw_digits) is the contact's phone.
  const matchPhone = call.raw_digits ?? "";
  const callerNumber =
    call.direction === "inbound"
      ? call.raw_digits ?? ""
      : call.number?.digits ?? "";
  const calleeNumber =
    call.direction === "inbound"
      ? call.number?.digits ?? ""
      : call.raw_digits ?? "";

  // ── 3. Contact lookup ──────────────────────────────────────────────────────
  const contact = options?.contactOverride ?? (await findContactByPhoneDB(matchPhone));

  // ── 4. Download recordings ─────────────────────────────────────────────────
  const startedAt = call.started_at ? new Date(call.started_at * 1000) : null;
  const answeredAt = call.answered_at ? new Date(call.answered_at * 1000) : null;
  const endedAt = call.ended_at ? new Date(call.ended_at * 1000) : null;

  const [recordingResult, voicemailResult] = options?.skipMediaDownload
    ? [null, null]
    : await Promise.all([
        downloadAndStoreRecording(callId, call.recording, "recording"),
        downloadAndStoreRecording(callId, call.voicemail, "voicemail"),
      ]);

  // ── 5. Unmatched path ──────────────────────────────────────────────────────
  if (!contact) {
    // Check if already in unmatched table
    const existingUnmatched = await db
      .select({ id: aircallUnmatchedCalls.id })
      .from(aircallUnmatchedCalls)
      .where(eq(aircallUnmatchedCalls.aircallCallId, callId))
      .limit(1);

    if (existingUnmatched.length === 0) {
      await db.insert(aircallUnmatchedCalls).values({
        aircallCallId: callId,
        direction: call.direction,
        status: call.status,
        duration: call.duration ?? null,
        startedAt: startedAt ?? undefined,
        endedAt: endedAt ?? undefined,
        callerNumber: callerNumber || null,
        calleeNumber: calleeNumber || null,
        attemptedPhone: normalizePhone(matchPhone) || null,
        rawPayload: call as any,
      });
    }

    return {
      action: "unmatched",
      aircallCallId: callId,
      message: `No contact found for phone: ${matchPhone}`,
    };
  }

  // ── 6. Resolve the SavvyOS caller and create the Activity entry ─────────────
  // Aircall itself does not expose SavvyOS roles, so match on the caller email
  // first (then exact name) before writing the activity author and body label.
  let callAuthor: { id: number; role: string } | null = null;
  if (call.user?.email) {
    const [matchedByEmail] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, call.user.email))
      .limit(1);
    callAuthor = matchedByEmail ?? null;
  }
  if (!callAuthor && call.user?.name) {
    const [matchedByName] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.name, call.user.name))
      .limit(1);
    callAuthor = matchedByName ?? null;
  }
  const actorLabel = callAuthor?.role === "isa" ? "ISA" : callAuthor?.role === "agent" ? "Agent" : "Caller";
  const body = formatCallBody(call, `${contact.firstName} ${contact.lastName}`, actorLabel);
  const subject =
    call.direction === "inbound"
      ? `Inbound call from ${contact.firstName} ${contact.lastName}`
      : `Outbound call to ${contact.firstName} ${contact.lastName}`;

  const [commResult] = await db.insert(communications).values({
    type: "call",
    subject,
    body,
    direction: call.direction === "inbound" ? "inbound" : "outbound",
    authorId: callAuthor?.id ?? null, // Aircall caller when it matches a SavvyOS user
    relatedContactId: contact.id,
    audioFileUrl: recordingResult?.url ?? voicemailResult?.url ?? null,
    communicatedAt: startedAt ?? new Date(),
  });
  const communicationId = (commResult as any).insertId as number;

  // ── 7. Insert aircall_calls row ────────────────────────────────────────────
  await db.insert(aircallCalls).values({
    aircallCallId: callId,
    contactId: contact.id,
    communicationId,
    direction: call.direction,
    status: call.status,
    duration: call.duration ?? null,
    startedAt: startedAt ?? undefined,
    answeredAt: answeredAt ?? undefined,
    endedAt: endedAt ?? undefined,
    callerNumber: callerNumber || null,
    calleeNumber: calleeNumber || null,
    recordingUrl: recordingResult?.url ?? null,
    recordingKey: recordingResult?.key ?? null,
    voicemailUrl: voicemailResult?.url ?? null,
    voicemailKey: voicemailResult?.key ?? null,
    aircallNumberId: call.number?.id ?? null,
    aircallNumberName: call.number?.name ?? null,
    rawPayload: call as any,
  });

  if (!recordingResult && !voicemailResult && (call.recording || call.voicemail)) {
    scheduleAircallMediaRetry(communicationId, call);
  }

  console.log(
    `[Aircall] Processed call ${callId} → contact ${contact.id} (${contact.firstName} ${contact.lastName}), comm ${communicationId}`
  );

  return {
    action: "created",
    aircallCallId: callId,
    contactId: contact.id,
    communicationId,
  };
}

function parseAircallPayload(rawPayload: unknown): AircallCallData | null {
  try {
    const parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    if (!parsed || typeof parsed !== "object") return null;
    const call = parsed as Partial<AircallCallData>;
    if (!Number.isInteger(call.id) || !call.direction || !call.status) return null;
    return call as AircallCallData;
  } catch {
    return null;
  }
}

/**
 * Reprocess unmatched records for the exact phone numbers now present on a
 * contact. The work is deliberately targeted and capped per trigger so a
 * single edit cannot monopolize the webhook or request process.
 */
export async function rematchUnmatchedAircallCallsForContact(
  contactId: number,
  phoneValues: Array<string | null | undefined>,
  options?: { limit?: number }
): Promise<{ scanned: number; matched: number; skipped: number }> {
  const normalizedPhones = Array.from(
    new Set(phoneValues.map(normalizePhone).filter(phone => phone.length >= 10))
  );
  if (!normalizedPhones.length) return { scanned: 0, matched: 0, skipped: 0 };

  const db = await getDb();
  if (!db) return { scanned: 0, matched: 0, skipped: 0 };
  const contactRows = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  const contact = contactRows[0];
  if (!contact) return { scanned: 0, matched: 0, skipped: 0 };

  const limit = Math.max(1, Math.min(options?.limit ?? 50, 50));
  const rows = await db
    .select({
      id: aircallUnmatchedCalls.id,
      aircallCallId: aircallUnmatchedCalls.aircallCallId,
      rawPayload: aircallUnmatchedCalls.rawPayload,
    })
    .from(aircallUnmatchedCalls)
    .where(inArray(aircallUnmatchedCalls.attemptedPhone, normalizedPhones))
    .limit(limit);

  let matched = 0;
  let skipped = 0;
  for (const row of rows) {
    const call = parseAircallPayload(row.rawPayload);
    if (!call) {
      skipped += 1;
      continue;
    }
    try {
      const result = await processAircallCall(call, { contactOverride: contact });
      if (result.action === "created") {
        await db
          .delete(aircallUnmatchedCalls)
          .where(eq(aircallUnmatchedCalls.id, row.id));
        if (result.communicationId) scheduleAircallTranscription(result.communicationId, call);
        matched += 1;
      } else if (result.action === "skipped") {
        // Heal a rare stale record if a matched row already exists for this call.
        await db
          .delete(aircallUnmatchedCalls)
          .where(eq(aircallUnmatchedCalls.id, row.id));
        skipped += 1;
      }
    } catch (error) {
      skipped += 1;
      console.error(`[Aircall] Re-match failed for call ${row.aircallCallId}:`, error);
    }
  }

  return { scanned: rows.length, matched, skipped };
}

/** Schedule a non-blocking re-match after a contact gains a phone number. */
export function scheduleAircallUnmatchedRematch(
  contactId: number,
  phoneValues: Array<string | null | undefined>
): void {
  const hasPhone = phoneValues.some(phone => normalizePhone(phone).length >= 10);
  if (!hasPhone) return;
  void rematchUnmatchedAircallCallsForContact(contactId, phoneValues)
    .then(result => {
      if (result.scanned) {
        console.log(
          `[Aircall] Contact ${contactId} re-match: ${result.matched} matched, ${result.skipped} skipped from ${result.scanned} candidates`
        );
      }
    })
    .catch(error => {
      console.error(`[Aircall] Contact ${contactId} re-match error:`, error);
    });
}

export type AircallReconciliationOptions = {
  limit?: number;
  beforeId?: number;
  since?: Date;
  skipMediaDownload?: boolean;
};

/**
 * Scan an ordered batch of historical unmatched calls and link every record
 * whose attempted phone now resolves to a SavvyOS contact. Historical media is
 * skipped by default because Aircall recording links are short-lived; the CRM
 * call activity and contact relationship remain durable.
 */
export async function reconcileUnmatchedAircallCalls(
  options: AircallReconciliationOptions = {}
): Promise<{
  scanned: number;
  matched: number;
  noContact: number;
  skipped: number;
  nextCursor: number | null;
}> {
  const db = await getDb();
  if (!db) return { scanned: 0, matched: 0, noContact: 0, skipped: 0, nextCursor: null };

  const limit = Math.max(1, Math.min(options.limit ?? 100, 250));
  const skipMediaDownload = options.skipMediaDownload ?? true;
  const whereClause = options.beforeId && options.since
    ? and(
        lt(aircallUnmatchedCalls.id, options.beforeId),
        gte(aircallUnmatchedCalls.startedAt, options.since)
      )
    : options.beforeId
      ? lt(aircallUnmatchedCalls.id, options.beforeId)
      : options.since
        ? gte(aircallUnmatchedCalls.startedAt, options.since)
        : undefined;
  const rows = await db
    .select({
      id: aircallUnmatchedCalls.id,
      aircallCallId: aircallUnmatchedCalls.aircallCallId,
      attemptedPhone: aircallUnmatchedCalls.attemptedPhone,
      rawPayload: aircallUnmatchedCalls.rawPayload,
    })
    .from(aircallUnmatchedCalls)
    .where(whereClause)
    .orderBy(desc(aircallUnmatchedCalls.id))
    .limit(limit);

  let matched = 0;
  let noContact = 0;
  let skipped = 0;
  for (const row of rows) {
    const call = parseAircallPayload(row.rawPayload);
    const contact = row.attemptedPhone
      ? await findContactByPhoneDB(row.attemptedPhone)
      : null;
    if (!call || !contact) {
      if (!contact) noContact += 1;
      else skipped += 1;
      continue;
    }

    try {
      const result = await processAircallCall(call, {
        contactOverride: contact,
        skipMediaDownload,
      });
      if (result.action === "created") {
        await db
          .delete(aircallUnmatchedCalls)
          .where(eq(aircallUnmatchedCalls.id, row.id));
        if (result.communicationId && !skipMediaDownload) {
          scheduleAircallTranscription(result.communicationId, call);
        }
        matched += 1;
      } else if (result.action === "skipped") {
        await db
          .delete(aircallUnmatchedCalls)
          .where(eq(aircallUnmatchedCalls.id, row.id));
        skipped += 1;
      }
    } catch (error) {
      skipped += 1;
      console.error(`[Aircall] Historical reconciliation failed for ${row.aircallCallId}:`, error);
    }
  }

  return {
    scanned: rows.length,
    matched,
    noContact,
    skipped,
    nextCursor: rows.length ? rows[rows.length - 1].id : null,
  };
}
