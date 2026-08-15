/**
 * Aircall tRPC Router
 * ====================
 * Admin-only procedures for managing the Aircall integration:
 *  - List unmatched calls (for review)
 *  - Get call activity stats
 *  - Trigger a single-call reprocess (for admin use)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  aircallCalls,
  aircallUnmatchedCalls,
  contacts,
  communications,
} from "../../drizzle/schema";
import { eq, desc, count, isNull, and, gte, lte, sql, type SQL } from "drizzle-orm";
import { processAircallCall, type AircallCallData } from "../aircall";

function adminOnly() {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return next({ ctx });
  });
}

type CallLogRow = Record<string, unknown>;
type CallLogSource = "matched" | "unmatched";

function rowsFromResult<T extends CallLogRow = CallLogRow>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function runRows<T extends CallLogRow = CallLogRow>(db: unknown, statement: SQL): Promise<T[]> {
  const result = await (db as { execute: (query: SQL) => Promise<unknown> }).execute(statement);
  return rowsFromResult<T>(result);
}

function asString(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractAiSummary(body: string): string | null {
  const marker = "AI Summary:";
  const index = body.lastIndexOf(marker);
  if (index < 0) return null;
  const summary = body.slice(index + marker.length).trim();
  return summary || null;
}

const aircallLogInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(10).max(100).default(50),
  search: z.string().trim().max(160).default(""),
  matchStatus: z.enum(["all", "matched", "unmatched"]).default("all"),
  direction: z.enum(["all", "inbound", "outbound"]).default("all"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function buildCallLogSource() {
  return sql`
    FROM (
      SELECT
        'matched' AS matchStatus,
        ac.\`aircallCallId\` AS aircallCallId,
        ac.\`contactId\` AS contactId,
        ac.\`communicationId\` AS communicationId,
        ac.\`direction\` AS direction,
        ac.\`status\` AS status,
        ac.\`duration\` AS duration,
        ac.\`startedAt\` AS startedAt,
        ac.\`answeredAt\` AS answeredAt,
        ac.\`endedAt\` AS endedAt,
        ac.\`callerNumber\` AS callerNumber,
        ac.\`calleeNumber\` AS calleeNumber,
        ac.\`recordingUrl\` AS recordingUrl,
        ac.\`voicemailUrl\` AS voicemailUrl,
        ac.\`aircallNumberName\` AS aircallNumberName,
        CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
        c.\`email\` AS contactEmail,
        c.\`phone\` AS contactPhone,
        comm.\`body\` AS communicationBody,
        comm.\`transcription\` AS transcription
      FROM \`aircall_calls\` ac
      LEFT JOIN \`contacts\` c ON c.\`id\` = ac.\`contactId\`
      LEFT JOIN \`communications\` comm ON comm.\`id\` = ac.\`communicationId\`

      UNION ALL

      SELECT
        'unmatched' AS matchStatus,
        uc.\`aircallCallId\` AS aircallCallId,
        NULL AS contactId,
        NULL AS communicationId,
        uc.\`direction\` AS direction,
        uc.\`status\` AS status,
        uc.\`duration\` AS duration,
        uc.\`startedAt\` AS startedAt,
        NULL AS answeredAt,
        uc.\`endedAt\` AS endedAt,
        uc.\`callerNumber\` AS callerNumber,
        uc.\`calleeNumber\` AS calleeNumber,
        NULL AS recordingUrl,
        NULL AS voicemailUrl,
        NULL AS aircallNumberName,
        NULL AS contactName,
        NULL AS contactEmail,
        uc.\`attemptedPhone\` AS contactPhone,
        NULL AS communicationBody,
        NULL AS transcription
      FROM \`aircall_unmatched_calls\` uc
    ) AS all_calls
  `;
}

function buildCallLogWhere(input: z.infer<typeof aircallLogInput>, extra?: SQL): SQL {
  const clauses: SQL[] = [];
  if (input.matchStatus !== "all") clauses.push(sql`all_calls.matchStatus = ${input.matchStatus}`);
  if (input.direction !== "all") clauses.push(sql`all_calls.direction = ${input.direction}`);
  if (input.dateFrom) clauses.push(sql`all_calls.startedAt >= ${input.dateFrom}`);
  if (input.dateTo) clauses.push(sql`all_calls.startedAt < DATE_ADD(${input.dateTo}, INTERVAL 1 DAY)`);
  if (input.search) {
    const pattern = `%${input.search}%`;
    clauses.push(sql`(
      CAST(all_calls.aircallCallId AS CHAR) LIKE ${pattern}
      OR COALESCE(all_calls.contactName, '') LIKE ${pattern}
      OR COALESCE(all_calls.contactEmail, '') LIKE ${pattern}
      OR COALESCE(all_calls.contactPhone, '') LIKE ${pattern}
      OR COALESCE(all_calls.callerNumber, '') LIKE ${pattern}
      OR COALESCE(all_calls.calleeNumber, '') LIKE ${pattern}
      OR COALESCE(all_calls.status, '') LIKE ${pattern}
      OR COALESCE(all_calls.communicationBody, '') LIKE ${pattern}
      OR COALESCE(all_calls.transcription, '') LIKE ${pattern}
    )`);
  }
  if (extra) clauses.push(extra);
  return clauses.length ? sql`WHERE ${sql.join(clauses, sql` AND `)}` : sql``;
}

function serializeCallRow(row: CallLogRow, detail = false) {
  const body = asString(row.communicationBody);
  const transcript = asString(row.transcription);
  return {
    matchStatus: asString(row.matchStatus) as CallLogSource,
    aircallCallId: asNumber(row.aircallCallId) ?? 0,
    contactId: asNumber(row.contactId),
    communicationId: asNumber(row.communicationId),
    direction: asString(row.direction),
    status: asString(row.status),
    duration: asNumber(row.duration),
    startedAt: asDate(row.startedAt),
    answeredAt: asDate(row.answeredAt),
    endedAt: asDate(row.endedAt),
    callerNumber: asString(row.callerNumber) || null,
    calleeNumber: asString(row.calleeNumber) || null,
    recordingUrl: asString(row.recordingUrl) || null,
    voicemailUrl: asString(row.voicemailUrl) || null,
    aircallNumberName: asString(row.aircallNumberName) || null,
    contactName: asString(row.contactName) || null,
    contactEmail: asString(row.contactEmail) || null,
    contactPhone: asString(row.contactPhone) || null,
    summary: extractAiSummary(body),
    hasTranscript: Boolean(transcript),
    transcript: detail ? (transcript || null) : undefined,
    activityBody: detail ? (body || null) : undefined,
  };
}

export const aircallRouter = router({
  // ── Unified call log for ISM review ─────────────────────────────────────────
  listAll: adminOnly()
    .input(aircallLogInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const source = buildCallLogSource();
      const where = buildCallLogWhere(input);
      const offset = (input.page - 1) * input.limit;
      const [rows, totalRows] = await Promise.all([
        runRows(db, sql`
          SELECT all_calls.*
          ${source}
          ${where}
          ORDER BY all_calls.startedAt DESC, all_calls.aircallCallId DESC
          LIMIT ${input.limit} OFFSET ${offset}
        `),
        runRows<{ total: unknown }>(db, sql`
          SELECT COUNT(*) AS total
          ${source}
          ${where}
        `),
      ]);
      const total = Number(totalRows[0]?.total ?? 0);

      return {
        rows: rows.map(row => serializeCallRow(row)),
        total,
        page: input.page,
        totalPages: Math.max(1, Math.ceil(total / input.limit)),
      };
    }),

  // ── Full call detail: metadata, AI summary, transcript, recording links ─────
  getCallDetail: adminOnly()
    .input(z.object({ aircallCallId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const source = buildCallLogSource();
      const where = buildCallLogWhere({
        page: 1,
        limit: 1,
        search: "",
        matchStatus: "all",
        direction: "all",
      }, sql`all_calls.aircallCallId = ${input.aircallCallId}`);
      const rows = await runRows(db, sql`
        SELECT all_calls.*
        ${source}
        ${where}
        ORDER BY all_calls.startedAt DESC
        LIMIT 1
      `);
      if (!rows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Aircall call not found" });
      }
      return serializeCallRow(rows[0], true);
    }),

  // ── List unmatched calls ───────────────────────────────────────────────────
  listUnmatched: adminOnly()
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const offset = (input.page - 1) * input.limit;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(aircallUnmatchedCalls)
          .orderBy(desc(aircallUnmatchedCalls.startedAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ total: count() }).from(aircallUnmatchedCalls),
      ]);

      return {
        rows,
        total: total ?? 0,
        page: input.page,
        totalPages: Math.ceil((total ?? 0) / input.limit),
      };
    }),

  // ── Get integration stats ──────────────────────────────────────────────────
  stats: adminOnly().query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [totalCalls, unmatchedCalls] = await Promise.all([
      db.select({ total: count() }).from(aircallCalls),
      db.select({ total: count() }).from(aircallUnmatchedCalls),
    ]);

    return {
      totalCalls: totalCalls[0]?.total ?? 0,
      unmatchedCalls: unmatchedCalls[0]?.total ?? 0,
    };
  }),

  // ── List calls for a specific contact ─────────────────────────────────────
  listByContact: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return db
        .select()
        .from(aircallCalls)
        .where(eq(aircallCalls.contactId, input.contactId))
        .orderBy(desc(aircallCalls.startedAt))
        .limit(100);
    }),

  // ── Reprocess a single call (admin) ───────────────────────────────────────
  // Useful for manually retrying a call that failed or was unmatched after
  // the contact's phone number was added/corrected.
  reprocessCall: adminOnly()
    .input(
      z.object({
        aircallCallId: z.number(),
        rawPayload: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Remove from unmatched table first so processAircallCall can re-insert
      // into aircall_calls if it finds a match this time.
      await db
        .delete(aircallUnmatchedCalls)
        .where(eq(aircallUnmatchedCalls.aircallCallId, input.aircallCallId));

      // Also remove from aircall_calls so the dedup check doesn't skip it
      await db
        .delete(aircallCalls)
        .where(eq(aircallCalls.aircallCallId, input.aircallCallId));

      const result = await processAircallCall(
        input.rawPayload as unknown as AircallCallData
      );

      return result;
    }),
});
