/**
 * Aircall Conversation Intelligence Backfill
 * ===========================================
 * Re-runnable recovery tool that retrieves native Aircall transcripts and
 * summaries for historical calls already matched to SavvyOS contacts.
 *
 * Usage:
 *   pnpm aircall:transcribe-backfill
 *
 * Options (env vars):
 *   AIRCALL_TRANSCRIBE_LIMIT=100        — maximum calls to process (default: all)
 *   AIRCALL_TRANSCRIBE_DRY_RUN=true     — preview without writing
 *   AIRCALL_TRANSCRIBE_FORCE=true       — retrieve both native artifacts again
 *   AIRCALL_TRANSCRIBE_CONTACT_ID=123   — process one contact's calls
 *   AIRCALL_SUMMARY_ONLY=true           — retrieve only Aircall summaries
 */

import "dotenv/config";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { aircallCalls, communications } from "../drizzle/schema";
import {
  syncAircallSummary,
  syncAircallTranscript,
} from "../server/aircallConversationIntelligence";
import { getDb } from "../server/db";

const DRY_RUN = process.env.AIRCALL_TRANSCRIBE_DRY_RUN === "true";
const FORCE = process.env.AIRCALL_TRANSCRIBE_FORCE === "true";
const LIMIT = process.env.AIRCALL_TRANSCRIBE_LIMIT
  ? parseInt(process.env.AIRCALL_TRANSCRIBE_LIMIT, 10)
  : Infinity;
const CONTACT_ID = process.env.AIRCALL_TRANSCRIBE_CONTACT_ID
  ? parseInt(process.env.AIRCALL_TRANSCRIBE_CONTACT_ID, 10)
  : null;
const SUMMARY_ONLY = process.env.AIRCALL_SUMMARY_ONLY === "true";

async function main() {
  console.log("=== Aircall Conversation Intelligence Backfill ===");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`Force native refresh: ${FORCE}`);
  console.log(`Limit: ${LIMIT === Infinity ? "all" : LIMIT}`);
  console.log(`Contact scope: ${CONTACT_ID ?? "all"}`);
  console.log(`Summary only: ${SUMMARY_ONLY}`);
  console.log("");

  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const needsRecovery = SUMMARY_ONLY
    ? sql`COALESCE(${communications.body}, '') NOT LIKE '%Aircall Summary:%'`
    : or(
        isNull(communications.transcription),
        sql`CHAR_LENGTH(TRIM(COALESCE(${communications.transcription}, ''))) = 0`,
        sql`COALESCE(${communications.body}, '') NOT LIKE '%Aircall Summary:%'`,
      );
  const conditions = [
    eq(communications.type, "call"),
    ...(FORCE ? [] : [needsRecovery]),
    ...(SUMMARY_ONLY ? [isNotNull(communications.transcription)] : []),
    ...(CONTACT_ID ? [eq(communications.relatedContactId, CONTACT_ID)] : []),
  ];

  const rows = await db.select({
    communicationId: communications.id,
    aircallCallId: aircallCalls.aircallCallId,
    transcription: communications.transcription,
    body: communications.body,
    contactId: communications.relatedContactId,
  }).from(aircallCalls)
    .innerJoin(communications, eq(communications.id, aircallCalls.communicationId))
    .where(and(...conditions))
    .orderBy(communications.communicatedAt);

  const toProcess = rows.slice(0, LIMIT === Infinity ? rows.length : LIMIT);
  console.log(`Found ${rows.length} call(s) requiring native Aircall data`);
  console.log(`Processing ${toProcess.length} call(s)...\n`);

  if (DRY_RUN) {
    for (const row of toProcess.slice(0, 20)) {
      console.log(`  communication ${row.communicationId} | Aircall call ${row.aircallCallId} | contact ${row.contactId ?? "unmatched"}`);
    }
    if (toProcess.length > 20) console.log(`  ... and ${toProcess.length - 20} more`);
    return;
  }

  let recovered = 0;
  let skipped = 0;
  let errors = 0;
  for (let index = 0; index < toProcess.length; index += 1) {
    const row = toProcess[index];
    const progress = `[${index + 1}/${toProcess.length}]`;
    try {
      const needsTranscript = !SUMMARY_ONLY && (FORCE || !row.transcription?.trim());
      const needsSummary = FORCE || !(row.body ?? "").includes("Aircall Summary:");
      if (!needsTranscript && !needsSummary) {
        console.log(`${progress} call ${row.aircallCallId} — already complete`);
        skipped += 1;
        continue;
      }

      const transcript = needsTranscript
        ? await syncAircallTranscript(row.communicationId, row.aircallCallId)
        : null;
      const summary = needsSummary
        ? await syncAircallSummary(row.communicationId, row.aircallCallId)
        : null;
      console.log(
        `${progress} call ${row.aircallCallId} — transcript: ${transcript ? `${transcript.transcript.length} chars` : "unchanged"}, summary: ${summary ? "stored" : "unchanged"}`,
      );
      recovered += 1;
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${progress} call ${row.aircallCallId} — ERROR: ${message}`);
    }
  }

  console.log("\n=== Backfill Complete ===");
  console.log(`Recovered: ${recovered}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Errors:    ${errors}`);
  console.log(`Total:     ${toProcess.length}`);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
