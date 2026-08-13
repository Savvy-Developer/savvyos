import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";

type Row = Record<string, unknown>;

export type AdoptionScoreInput = {
  accountType: "full_user" | "teammate";
  daysSinceLogin: number | null;
  contactActivitiesWeek: number;
  tasksCompletedWeek: number;
  activePipelineLeads: number;
  averageLeadAgeDays: number | null;
};

export type AdoptionScoreBreakdown = {
  loginRecency: number;
  contactActivity: number;
  completedTasks: number;
  pipelineCoverage: number;
  leadFreshness: number;
};

const ACTIVE_PIPELINE_STATUSES = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract"] as const;

function asNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowsFromResult<T extends Row = Row>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

async function runRows<T extends Row = Row>(statement: SQL): Promise<T[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await (db as unknown as { execute: (query: SQL) => Promise<unknown> }).execute(statement);
  return rowsFromResult<T>(result);
}

/**
 * Calculates a 100-point indicator of product adoption rather than sales production.
 * Directory-only teammates cannot sign in, so they are kept visible but intentionally
 * receive a zero score instead of being treated as inactive full users.
 */
export function getAdoptionScore(input: AdoptionScoreInput): { total: number; breakdown: AdoptionScoreBreakdown } {
  if (input.accountType !== "full_user") {
    return {
      total: 0,
      breakdown: { loginRecency: 0, contactActivity: 0, completedTasks: 0, pipelineCoverage: 0, leadFreshness: 0 },
    };
  }

  const loginRecency = input.daysSinceLogin === null
    ? 0
    : input.daysSinceLogin <= 1
      ? 30
      : input.daysSinceLogin <= 7
        ? 25
        : input.daysSinceLogin <= 14
          ? 18
          : input.daysSinceLogin <= 30
            ? 10
            : input.daysSinceLogin <= 60
              ? 4
              : 0;

  const contactActivity = Math.min(Math.max(input.contactActivitiesWeek, 0), 5) * 5;
  const completedTasks = Math.min(Math.max(input.tasksCompletedWeek, 0), 3) * 5;
  const pipelineCoverage = Math.min(Math.max(input.activePipelineLeads, 0), 5) * 3;
  const leadFreshness = input.averageLeadAgeDays === null
    ? 0
    : input.averageLeadAgeDays <= 7
      ? 15
      : input.averageLeadAgeDays <= 14
        ? 12
        : input.averageLeadAgeDays <= 30
          ? 8
          : input.averageLeadAgeDays <= 45
            ? 4
            : 0;

  const breakdown = { loginRecency, contactActivity, completedTasks, pipelineCoverage, leadFreshness };
  return { total: Object.values(breakdown).reduce((sum, score) => sum + score, 0), breakdown };
}

export async function getSavvyOsAdoptionReport() {
  const rows = await runRows<Row>(sql`
    SELECT
      u.\`id\` AS agentId,
      u.\`name\` AS agentName,
      u.\`email\` AS agentEmail,
      u.\`personType\` AS personType,
      CASE
        WHEN loginActivity.lastLoginAt IS NULL THEN u.\`lastSignedIn\`
        WHEN u.\`lastSignedIn\` IS NULL THEN loginActivity.lastLoginAt
        WHEN loginActivity.lastLoginAt > u.\`lastSignedIn\` THEN loginActivity.lastLoginAt
        ELSE u.\`lastSignedIn\`
      END AS lastLoginAt,
      CASE
        WHEN u.\`personType\` = 'full_user' THEN DATEDIFF(
          CURRENT_DATE,
          DATE(CASE
            WHEN loginActivity.lastLoginAt IS NULL THEN u.\`lastSignedIn\`
            WHEN u.\`lastSignedIn\` IS NULL THEN loginActivity.lastLoginAt
            WHEN loginActivity.lastLoginAt > u.\`lastSignedIn\` THEN loginActivity.lastLoginAt
            ELSE u.\`lastSignedIn\`
          END)
        )
        ELSE NULL
      END AS daysSinceLogin,
      COALESCE(contactActivity.contactActivitiesWeek, 0) AS contactActivitiesWeek,
      COALESCE(contactActivity.notesWeek, 0) AS notesWeek,
      COALESCE(completedTasks.tasksCompletedWeek, 0) AS tasksCompletedWeek,
      COALESCE(pipeline.activePipelineLeads, 0) AS activePipelineLeads,
      COALESCE(pipeline.newLeads, 0) AS newLeads,
      COALESCE(pipeline.attemptedContact, 0) AS attemptedContact,
      COALESCE(pipeline.nurture, 0) AS nurture,
      COALESCE(pipeline.activeClients, 0) AS activeClients,
      COALESCE(pipeline.underContract, 0) AS underContract,
      COALESCE(pipeline.closedLeads, 0) AS closedLeads,
      COALESCE(pipeline.deadLeads, 0) AS deadLeads,
      pipeline.averageLeadAgeDays AS averageLeadAgeDays
    FROM \`users\` u
    LEFT JOIN (
      SELECT
        al.\`userId\` AS userId,
        MAX(al.\`createdAt\`) AS lastLoginAt
      FROM \`activity_log\` al
      WHERE al.\`action\` = 'user_login'
      GROUP BY al.\`userId\`
    ) loginActivity ON loginActivity.userId = u.\`id\`
    LEFT JOIN (
      SELECT
        c.\`authorId\` AS agentId,
        COUNT(*) AS contactActivitiesWeek,
        SUM(CASE WHEN c.\`type\` = 'note' THEN 1 ELSE 0 END) AS notesWeek
      FROM \`communications\` c
      WHERE c.\`authorId\` IS NOT NULL
        AND DATE(c.\`communicatedAt\`) >= DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY)
        AND (c.\`relatedContactId\` IS NOT NULL OR c.\`relatedAgentConnectionId\` IS NOT NULL)
      GROUP BY c.\`authorId\`
    ) contactActivity ON contactActivity.agentId = u.\`id\`
    LEFT JOIN (
      SELECT
        tk.\`assignedToId\` AS agentId,
        COUNT(*) AS tasksCompletedWeek
      FROM \`tasks\` tk
      WHERE tk.\`assignedToId\` IS NOT NULL
        AND tk.\`status\` = 'completed'
        AND tk.\`completedAt\` IS NOT NULL
        AND DATE(tk.\`completedAt\`) >= DATE_SUB(CURRENT_DATE, INTERVAL WEEKDAY(CURRENT_DATE) DAY)
      GROUP BY tk.\`assignedToId\`
    ) completedTasks ON completedTasks.agentId = u.\`id\`
    LEFT JOIN (
      SELECT
        ac.\`agentId\` AS agentId,
        SUM(CASE WHEN ac.\`pipelineStatus\` IN ('new_lead', 'attempted_contact', 'nurture', 'active_client', 'under_contract') THEN 1 ELSE 0 END) AS activePipelineLeads,
        SUM(CASE WHEN ac.\`pipelineStatus\` = 'new_lead' THEN 1 ELSE 0 END) AS newLeads,
        SUM(CASE WHEN ac.\`pipelineStatus\` = 'attempted_contact' THEN 1 ELSE 0 END) AS attemptedContact,
        SUM(CASE WHEN ac.\`pipelineStatus\` = 'nurture' THEN 1 ELSE 0 END) AS nurture,
        SUM(CASE WHEN ac.\`pipelineStatus\` = 'active_client' THEN 1 ELSE 0 END) AS activeClients,
        SUM(CASE WHEN ac.\`pipelineStatus\` = 'under_contract' THEN 1 ELSE 0 END) AS underContract,
        SUM(CASE WHEN ac.\`pipelineStatus\` = 'closed' THEN 1 ELSE 0 END) AS closedLeads,
        SUM(CASE WHEN ac.\`pipelineStatus\` = 'dead' THEN 1 ELSE 0 END) AS deadLeads,
        AVG(CASE
          WHEN ac.\`pipelineStatus\` IN ('new_lead', 'attempted_contact', 'nurture', 'active_client', 'under_contract')
          THEN GREATEST(DATEDIFF(CURRENT_DATE, DATE(COALESCE(ac.\`agingUpdatedAt\`, ac.\`updatedAt\`))), 0)
          ELSE NULL
        END) AS averageLeadAgeDays
      FROM \`agent_connections\` ac
      GROUP BY ac.\`agentId\`
    ) pipeline ON pipeline.agentId = u.\`id\`
    WHERE u.\`role\` = 'agent' AND u.\`isActive\` = 1
    ORDER BY COALESCE(u.\`name\`, '') ASC
  `);

  const agents = rows.map((row) => {
    const accountType: "full_user" | "teammate" = row.personType === "teammate" ? "teammate" : "full_user";
    const lastLoginAt = accountType === "full_user" ? asDate(row.lastLoginAt) : null;
    const daysSinceLogin = accountType === "full_user" ? asNullableNumber(row.daysSinceLogin) : null;
    const contactActivitiesWeek = asNumber(row.contactActivitiesWeek);
    const tasksCompletedWeek = asNumber(row.tasksCompletedWeek);
    const activePipelineLeads = asNumber(row.activePipelineLeads);
    const averageLeadAgeDays = asNullableNumber(row.averageLeadAgeDays);
    const score = getAdoptionScore({ accountType, daysSinceLogin, contactActivitiesWeek, tasksCompletedWeek, activePipelineLeads, averageLeadAgeDays });

    return {
      agentId: asNumber(row.agentId),
      agentName: String(row.agentName ?? "Unknown agent"),
      agentEmail: row.agentEmail ? String(row.agentEmail) : null,
      accountType,
      lastLoginAt,
      daysSinceLogin,
      contactActivitiesWeek,
      notesWeek: asNumber(row.notesWeek),
      tasksCompletedWeek,
      activePipelineLeads,
      newLeads: asNumber(row.newLeads),
      attemptedContact: asNumber(row.attemptedContact),
      nurture: asNumber(row.nurture),
      activeClients: asNumber(row.activeClients),
      underContract: asNumber(row.underContract),
      closedLeads: asNumber(row.closedLeads),
      deadLeads: asNumber(row.deadLeads),
      averageLeadAgeDays,
      activityScore: score.total,
      scoreBreakdown: score.breakdown,
    };
  }).sort((a, b) => b.activityScore - a.activityScore || a.agentName.localeCompare(b.agentName));

  const fullUsers = agents.filter((agent) => agent.accountType === "full_user");
  return {
    generatedAt: new Date(),
    activityWeekStartsMonday: true,
    scoreDefinition: [
      { label: "Login recency", maximum: 30, detail: "30 points for a login today or yesterday; 25 within 7 days; gradually declining thereafter." },
      { label: "Contact activity this week", maximum: 25, detail: "5 points each for up to five notes, calls, emails, texts, meetings, or voice notes logged against a contact or lead." },
      { label: "Tasks completed this week", maximum: 15, detail: "5 points each for up to three completed tasks." },
      { label: "Active pipeline coverage", maximum: 15, detail: "3 points each for up to five leads in active pipeline stages." },
      { label: "Lead freshness", maximum: 15, detail: "Higher points for a lower average age of active leads, based on the qualifying activity aging clock." },
    ],
    summary: {
      totalAgents: agents.length,
      signInEnabledAgents: fullUsers.length,
      loggedInLast7Days: fullUsers.filter((agent) => agent.daysSinceLogin !== null && agent.daysSinceLogin <= 7).length,
      activeThisWeek: agents.filter((agent) => agent.contactActivitiesWeek > 0 || agent.tasksCompletedWeek > 0).length,
      loginRisk: fullUsers.filter((agent) => agent.daysSinceLogin === null || agent.daysSinceLogin > 30).length,
      averageActivityScore: agents.length ? Math.round(agents.reduce((sum, agent) => sum + agent.activityScore, 0) / agents.length) : 0,
    },
    agents,
  };
}

export const ACTIVE_ADOPTION_PIPELINE_STATUSES = ACTIVE_PIPELINE_STATUSES;
