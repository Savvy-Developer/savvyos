#!/usr/bin/env tsx
/**
 * Aircall Historical Backfill Script
 * ===================================
 * Re-runnable script that imports all historical Aircall calls into SavvyOS.
 *
 * Usage:
 *   AIRCALL_API_ID=xxx AIRCALL_API_TOKEN=yyy tsx scripts/aircall-backfill.ts
 *
 * Optional env vars:
 *   AIRCALL_FROM_DATE  — Unix timestamp to start from (default: 0 = all time)
 *   AIRCALL_TO_DATE    — Unix timestamp to end at (default: now)
 *   AIRCALL_DRY_RUN    — Set to "true" to preview without writing to DB
 *
 * What it does:
 *  1. Pages through GET /v1/calls in reverse-chronological order
 *  2. For each call, calls processAircallCall() which is fully idempotent
 *  3. Logs a summary of matched, skipped (already imported), and unmatched calls
 *  4. Writes a JSON report to ./aircall-backfill-report.json
 */

import "dotenv/config";
import { processAircallCall, type AircallCallData } from "../server/aircall";
import fs from "fs";
import path from "path";

// ─── Configuration ─────────────────────────────────────────────────────────────

const API_ID = process.env.AIRCALL_API_ID || "";
const API_TOKEN = process.env.AIRCALL_API_TOKEN || "";
const FROM_DATE = process.env.AIRCALL_FROM_DATE
  ? parseInt(process.env.AIRCALL_FROM_DATE)
  : 0;
const TO_DATE = process.env.AIRCALL_TO_DATE
  ? parseInt(process.env.AIRCALL_TO_DATE)
  : Math.floor(Date.now() / 1000);
const DRY_RUN = process.env.AIRCALL_DRY_RUN === "true";
const PER_PAGE = 50;
const RATE_LIMIT_DELAY_MS = 1200; // 1.2s between pages (Aircall: 60 req/min)

if (!API_ID || !API_TOKEN) {
  console.error(
    "ERROR: AIRCALL_API_ID and AIRCALL_API_TOKEN environment variables are required.\n" +
    "Get them from: Aircall Dashboard → Integrations → API Keys"
  );
  process.exit(1);
}

const AUTH_HEADER = `Basic ${Buffer.from(`${API_ID}:${API_TOKEN}`).toString("base64")}`;

// ─── Aircall API Helpers ───────────────────────────────────────────────────────

async function fetchCallsPage(
  pageUrl: string
): Promise<{ calls: AircallCallData[]; nextPageUrl: string | null }> {
  const res = await fetch(pageUrl, {
    headers: {
      Authorization: AUTH_HEADER,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Aircall API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    calls: AircallCallData[];
    meta?: { next_page_link?: string };
  };

  return {
    calls: data.calls ?? [],
    nextPageUrl: data.meta?.next_page_link ?? null,
  };
}

function buildInitialUrl(): string {
  const url = new URL("https://api.aircall.io/v1/calls");
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("order", "desc"); // newest first
  if (FROM_DATE > 0) url.searchParams.set("from", String(FROM_DATE));
  if (TO_DATE > 0) url.searchParams.set("to", String(TO_DATE));
  return url.toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Report Types ──────────────────────────────────────────────────────────────

interface BackfillReport {
  runAt: string;
  dryRun: boolean;
  fromDate: string;
  toDate: string;
  totalFetched: number;
  created: number;
  skipped: number;
  unmatched: number;
  errors: number;
  unmatchedPhones: Array<{
    aircallCallId: number;
    phone: string;
    direction: string;
    startedAt: string;
  }>;
  errorDetails: Array<{ aircallCallId: number; error: string }>;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("Aircall Historical Backfill");
  console.log("=".repeat(60));
  console.log(`Mode:      ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`From:      ${FROM_DATE > 0 ? new Date(FROM_DATE * 1000).toISOString() : "all time"}`);
  console.log(`To:        ${new Date(TO_DATE * 1000).toISOString()}`);
  console.log("");

  const report: BackfillReport = {
    runAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    fromDate: FROM_DATE > 0 ? new Date(FROM_DATE * 1000).toISOString() : "all time",
    toDate: new Date(TO_DATE * 1000).toISOString(),
    totalFetched: 0,
    created: 0,
    skipped: 0,
    unmatched: 0,
    errors: 0,
    unmatchedPhones: [],
    errorDetails: [],
  };

  let pageUrl: string | null = buildInitialUrl();
  let pageNum = 0;

  while (pageUrl) {
    pageNum++;
    console.log(`\nFetching page ${pageNum}...`);

    let calls: AircallCallData[];
    let nextPageUrl: string | null;

    try {
      ({ calls, nextPageUrl } = await fetchCallsPage(pageUrl));
    } catch (err: any) {
      console.error(`  ERROR fetching page ${pageNum}: ${err.message}`);
      break;
    }

    if (calls.length === 0) {
      console.log("  No more calls.");
      break;
    }

    console.log(`  Got ${calls.length} calls`);
    report.totalFetched += calls.length;

    for (const call of calls) {
      if (DRY_RUN) {
        const phone = call.raw_digits ?? "(no phone)";
        console.log(
          `  [DRY RUN] Call ${call.id} | ${call.direction} | ${call.status} | phone: ${phone}`
        );
        continue;
      }

      try {
        const result = await processAircallCall(call);

        switch (result.action) {
          case "created":
            report.created++;
            console.log(
              `  ✓ Call ${call.id} → contact ${result.contactId}, comm ${result.communicationId}`
            );
            break;
          case "skipped":
            report.skipped++;
            console.log(`  ↩ Call ${call.id} already imported`);
            break;
          case "unmatched":
            report.unmatched++;
            report.unmatchedPhones.push({
              aircallCallId: call.id,
              phone: call.raw_digits ?? "",
              direction: call.direction,
              startedAt: call.started_at
                ? new Date(call.started_at * 1000).toISOString()
                : "",
            });
            console.log(
              `  ✗ Call ${call.id} unmatched — phone: ${call.raw_digits ?? "(none)"}`
            );
            break;
        }
      } catch (err: any) {
        report.errors++;
        report.errorDetails.push({ aircallCallId: call.id, error: err.message });
        console.error(`  ERROR processing call ${call.id}: ${err.message}`);
      }
    }

    pageUrl = nextPageUrl;

    if (pageUrl) {
      await delay(RATE_LIMIT_DELAY_MS);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("Backfill Complete");
  console.log("=".repeat(60));
  console.log(`Total fetched:  ${report.totalFetched}`);
  console.log(`Created:        ${report.created}`);
  console.log(`Skipped:        ${report.skipped} (already imported)`);
  console.log(`Unmatched:      ${report.unmatched} (no contact found)`);
  console.log(`Errors:         ${report.errors}`);

  if (report.unmatchedPhones.length > 0) {
    console.log("\nUnmatched phone numbers:");
    for (const u of report.unmatchedPhones) {
      console.log(`  ${u.phone} (call ${u.aircallCallId}, ${u.direction}, ${u.startedAt})`);
    }
  }

  // Write JSON report
  const reportPath = path.join(process.cwd(), "aircall-backfill-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to: ${reportPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
