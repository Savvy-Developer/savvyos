/**
 * Aircall Transcript Backfill Script
 * ====================================
 * Re-runnable script that transcribes and summarizes all historical Aircall
 * call recordings that have an audio file but no transcript yet.
 *
 * Usage:
 *   pnpm aircall:transcribe-backfill
 *
 * Options (env vars):
 *   AIRCALL_TRANSCRIBE_LIMIT=100   — max calls to process (default: all)
 *   AIRCALL_TRANSCRIBE_DRY_RUN=true — preview without writing
 *   AIRCALL_TRANSCRIBE_FORCE=true  — re-transcribe even if transcript exists
 *   AIRCALL_TRANSCRIBE_CONTACT_ID=123 — process only one contact’s calls
 *   AIRCALL_SUMMARY_ONLY=true — generate summaries for existing transcripts only
 *
 * Rate limiting:
 *   Whisper API: no hard limit, but we add a 600ms delay between calls
 *   to avoid overwhelming the API and S3.
 */

import "dotenv/config";
import { getDb } from "../server/db";
import { communications, aircallCalls, contacts } from "../drizzle/schema";
import { eq, isNull, isNotNull, and, inArray } from "drizzle-orm";
import { transcribeAndSummarize } from "../server/aircallTranscribe";

const DRY_RUN = process.env.AIRCALL_TRANSCRIBE_DRY_RUN === "true";
const FORCE = process.env.AIRCALL_TRANSCRIBE_FORCE === "true";
const LIMIT = process.env.AIRCALL_TRANSCRIBE_LIMIT
  ? parseInt(process.env.AIRCALL_TRANSCRIBE_LIMIT, 10)
  : Infinity;
const CONTACT_ID = process.env.AIRCALL_TRANSCRIBE_CONTACT_ID
  ? parseInt(process.env.AIRCALL_TRANSCRIBE_CONTACT_ID, 10)
  : null;
const SUMMARY_ONLY = process.env.AIRCALL_SUMMARY_ONLY === "true";
const DELAY_MS = 600; // ms between calls to avoid rate limits

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== Aircall Transcript Backfill ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`Force re-transcribe: ${FORCE}`);
  console.log(`Limit: ${LIMIT === Infinity ? "all" : LIMIT}`);
  console.log(`Contact scope: ${CONTACT_ID ?? "all"}`);
  console.log(`Summary only: ${SUMMARY_ONLY}`);
  console.log("");

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Find all communications that:
  // - are type "call"
  // - have an audioFileUrl (recording stored in S3)
  // - either have no transcription yet, or FORCE is set
  const conditions = [
    eq(communications.type, "call"),
    isNotNull(communications.audioFileUrl),
    ...(SUMMARY_ONLY
      ? [isNotNull(communications.transcription)]
      : FORCE ? [] : [isNull(communications.transcription)]),
    ...(CONTACT_ID ? [eq(communications.relatedContactId, CONTACT_ID)] : []),
  ];

  const rows = await db
    .select({
      commId: communications.id,
      audioFileUrl: communications.audioFileUrl,
      transcription: communications.transcription,
      direction: communications.direction,
      aircallCallId: aircallCalls.aircallCallId,
      duration: aircallCalls.duration,
      agentName: aircallCalls.aircallNumberName,
      contactId: communications.relatedContactId,
    })
    .from(communications)
    .leftJoin(aircallCalls, eq(aircallCalls.communicationId, communications.id))
    .where(and(...conditions))
    .orderBy(communications.communicatedAt);

  const toProcess = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);

  console.log(`Found ${rows.length} calls with recordings and no transcript`);
  console.log(`Processing ${toProcess.length} calls...\n`);

  if (DRY_RUN) {
    console.log("DRY RUN — would process:");
    for (const row of toProcess.slice(0, 20)) {
      console.log(`  comm ${row.commId} | call ${row.aircallCallId} | ${row.direction} | ${(row.audioFileUrl ?? "").slice(0, 60)}...`);
    }
    if (toProcess.length > 20) console.log(`  ... and ${toProcess.length - 20} more`);
    return;
  }

  // Fetch contact names for better summaries
  const contactIds = [...new Set(toProcess.map((r) => r.contactId).filter(Boolean))] as number[];
  const contactRows = contactIds.length > 0
    ? await db
        .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(inArray(contacts.id, contactIds))
    : [];
  const contactMap = new Map(contactRows.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

  // Process each call
  let transcribed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;

    if (!row.audioFileUrl) {
      console.log(`${progress} comm ${row.commId} — no audio URL, skipping`);
      skipped++;
      continue;
    }

    if (!row.aircallCallId) {
      console.log(`${progress} comm ${row.commId} — no aircall call ID, skipping`);
      skipped++;
      continue;
    }

    try {
      const contactName = row.contactId ? contactMap.get(row.contactId) : undefined;

      const result = await transcribeAndSummarize({
        communicationId: row.commId,
        aircallCallId: row.aircallCallId,
        audioUrl: row.audioFileUrl,
        direction: row.direction ?? "outbound",
        duration: row.duration,
        contactName,
        agentName: row.agentName ?? undefined,
        forceRetranscribe: FORCE && !SUMMARY_ONLY,
      });

      if (result.skipped) {
        console.log(`${progress} comm ${row.commId} — skipped: ${result.reason}`);
        skipped++;
      } else {
        const transcriptLen = result.transcript ? result.transcript.length : 0;
        const hasSummary = !!result.summary;
        console.log(
          `${progress} comm ${row.commId} (call ${row.aircallCallId}) — ` +
          `transcript: ${transcriptLen} chars, summary: ${hasSummary ? "yes" : "no"}`
        );
        transcribed++;
      }
    } catch (err: any) {
      console.error(`${progress} comm ${row.commId} — ERROR: ${err.message}`);
      errors++;
    }

    // Rate limiting delay
    if (i < toProcess.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log("\n=== Backfill Complete ===");
  console.log(`Transcribed: ${transcribed}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Errors:      ${errors}`);
  console.log(`Total:       ${toProcess.length}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
