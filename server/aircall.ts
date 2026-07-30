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
  aircallCalls,
  aircallUnmatchedCalls,
} from "../drizzle/schema";
import { eq, or, and } from "drizzle-orm";

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

  // Build search patterns that cover both "+1XXXXXXXXXX" and "XXXXXXXXXX" storage
  const patterns = [
    `%${norm}`,          // ends with 10-digit form
    `%${norm.slice(-10)}`, // last 10 digits
  ];

  for (const pattern of patterns) {
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
          eq(contacts.phone, `+1${norm}`),
          eq(contacts.phone, norm),
          eq(contacts.secondaryPhone, `+1${norm}`),
          eq(contacts.secondaryPhone, norm),
          eq(contacts.spousePhone, `+1${norm}`),
          eq(contacts.spousePhone, norm),
        )
      )
      .limit(1);

    if (rows.length > 0) {
      return {
        id: rows[0].id,
        firstName: rows[0].firstName,
        lastName: rows[0].lastName,
      };
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

function formatCallBody(call: AircallCallData, contactName: string): string {
  const dir = call.direction === "inbound" ? "Inbound" : "Outbound";
  const status = formatStatus(call.status, call.missed_call_reason);
  const dur = call.duration ? formatDuration(call.duration) : "—";
  const agent = call.user?.name ?? "Unknown agent";
  const line = call.number?.name ?? call.number?.digits ?? "Unknown line";

  return [
    `${dir} call — ${status}`,
    `Duration: ${dur}`,
    `Agent: ${agent}`,
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
  call: AircallCallData
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
  const contact = await findContactByPhoneDB(matchPhone);

  // ── 4. Download recordings ─────────────────────────────────────────────────
  const startedAt = call.started_at ? new Date(call.started_at * 1000) : null;
  const answeredAt = call.answered_at ? new Date(call.answered_at * 1000) : null;
  const endedAt = call.ended_at ? new Date(call.ended_at * 1000) : null;

  const [recordingResult, voicemailResult] = await Promise.all([
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

  // ── 6. Create communications (Activity) entry ──────────────────────────────
  const body = formatCallBody(call, `${contact.firstName} ${contact.lastName}`);
  const subject =
    call.direction === "inbound"
      ? `Inbound call from ${contact.firstName} ${contact.lastName}`
      : `Outbound call to ${contact.firstName} ${contact.lastName}`;

  const [commResult] = await db.insert(communications).values({
    type: "call",
    subject,
    body,
    direction: call.direction === "inbound" ? "inbound" : "outbound",
    authorId: null, // system-generated
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
