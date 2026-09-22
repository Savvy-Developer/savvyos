/**
 * Lead Flow by Ad: reads the contacts that arrived with ad tracking tags and
 * what has happened to each of them since. Read-only; the analytics router
 * limits it to administrators because it lists contacts by name.
 *
 * Grouping and the outcome rules are in leadFlowByAdSummary.ts.
 */
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  leadFlowTotals,
  summarizeLeadFlow,
  type LeadFlowContact,
  type LeadFlowLevel,
} from "./leadFlowByAdSummary";

export type LeadFlowByAdFilters = {
  dateFrom?: string;
  dateTo?: string;
  level?: LeadFlowLevel;
  utmSource?: string;
};

/** Enough for any realistic range; the page says so if it is ever reached. */
export const LEAD_FLOW_ROW_LIMIT = 5_000;

type Row = Record<string, unknown>;

function rowsFromResult(result: unknown): Row[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as Row[];
  if (Array.isArray(result)) return result as Row[];
  return [];
}

function day(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const clean = String(value).trim();
  return clean || null;
}

export async function getLeadFlowByAdReport(filters: LeadFlowByAdFilters) {
  const level = filters.level ?? "campaign";
  const empty = { level, groups: [], totals: leadFlowTotals([]), sources: [] as string[], truncated: false };
  const db = await getDb();
  if (!db) return empty;

  const where: SQL[] = [
    sql`c.\`archived_at\` IS NULL`,
    // A lead from an ad is one that carries any campaign tag. Source and
    // medium alone ("google / organic") are not an ad.
    sql`(c.\`utmCampaign\` IS NOT NULL OR c.\`utmTerm\` IS NOT NULL OR c.\`utmContent\` IS NOT NULL)`,
  ];
  if (filters.dateFrom) where.push(sql`c.\`createdAt\` >= ${filters.dateFrom}`);
  if (filters.dateTo) where.push(sql`c.\`createdAt\` < DATE_ADD(${filters.dateTo}, INTERVAL 1 DAY)`);
  if (filters.utmSource) where.push(sql`c.\`utmSource\` = ${filters.utmSource}`);

  const query = sql`
    SELECT
      c.\`id\` AS contactId,
      CONCAT_WS(' ', c.\`firstName\`, c.\`lastName\`) AS contactName,
      c.\`createdAt\` AS createdAt,
      c.\`utmSource\` AS utmSource,
      c.\`utmCampaign\` AS utmCampaign,
      c.\`utmTerm\` AS utmTerm,
      c.\`utmContent\` AS utmContent,
      COALESCE(currentConnection.\`pipelineStatus\`, c.\`isa_status\`) AS stage,
      LEAST(
        COALESCE(appt.firstAt, mm.firstAt),
        COALESCE(mm.firstAt, appt.firstAt)
      ) AS firstBookedAt,
      outcomes.firstContractDate AS firstContractDate,
      outcomes.firstClosingDate AS firstClosingDate
    FROM \`contacts\` c
    LEFT JOIN (
      SELECT ac.\`contactId\`, ac.\`pipelineStatus\`
      FROM \`agent_connections\` ac
      INNER JOIN (
        SELECT \`contactId\`, MAX(\`id\`) AS latestConnectionId
        FROM \`agent_connections\`
        GROUP BY \`contactId\`
      ) latest ON latest.latestConnectionId = ac.\`id\`
    ) currentConnection ON currentConnection.\`contactId\` = c.\`id\`
    LEFT JOIN (
      SELECT \`contactId\`, MIN(\`createdAt\`) AS firstAt
      FROM \`appointments\`
      WHERE \`status\` <> 'canceled'
      GROUP BY \`contactId\`
    ) appt ON appt.\`contactId\` = c.\`id\`
    LEFT JOIN (
      SELECT \`contactId\`, MIN(\`createdAt\`) AS firstAt
      FROM \`market_match_quiz_bookings\`
      WHERE \`status\` <> 'canceled'
      GROUP BY \`contactId\`
    ) mm ON mm.\`contactId\` = c.\`id\`
    LEFT JOIN (
      SELECT
        t.\`primaryContactId\` AS contactId,
        MIN(CASE WHEN t.\`status\` IN ('under_contract', 'closed') AND t.\`contractDate\` IS NOT NULL THEN t.\`contractDate\` END) AS firstContractDate,
        MIN(CASE WHEN t.\`status\` = 'closed' AND t.\`closingDate\` IS NOT NULL THEN t.\`closingDate\` END) AS firstClosingDate
      FROM \`transactions\` t
      GROUP BY t.\`primaryContactId\`
    ) outcomes ON outcomes.contactId = c.\`id\`
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY c.\`createdAt\` DESC
    LIMIT ${LEAD_FLOW_ROW_LIMIT + 1}
  `;

  const result = await (db as unknown as { execute: (statement: SQL) => Promise<unknown> }).execute(query);
  const rows = rowsFromResult(result);
  const truncated = rows.length > LEAD_FLOW_ROW_LIMIT;
  const contacts: LeadFlowContact[] = rows.slice(0, LEAD_FLOW_ROW_LIMIT).map(row => ({
    contactId: Number(row.contactId),
    contactName: text(row.contactName) ?? "—",
    createdAt: day(row.createdAt),
    utmSource: text(row.utmSource),
    utmCampaign: text(row.utmCampaign),
    utmTerm: text(row.utmTerm),
    utmContent: text(row.utmContent),
    stage: text(row.stage),
    firstBookedAt: day(row.firstBookedAt),
    firstContractDate: day(row.firstContractDate),
    firstClosingDate: day(row.firstClosingDate),
  }));
  const groups = summarizeLeadFlow(contacts, level);
  const sources = Array.from(new Set(contacts.map(c => c.utmSource).filter((s): s is string => !!s))).sort();
  return { level, groups, totals: leadFlowTotals(groups), sources, truncated };
}
