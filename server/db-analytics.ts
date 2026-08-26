/**
 * db-analytics.ts
 * All new BI report query helpers for the Analytics & Reporting rebuild (v55).
 */

import { and, eq, gte, lte, sql, isNull, isNotNull, ne, inArray, or } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import {
  transactions,
  transactionPayoutItems,
  commissionExceptions,
  users,
  groups,
  groupMembers,
  marketProfiles,
  marketAgentAssignments,
  agentConnections,
  contacts,
  tasks,
  leadSources,
  onboardingInstances,
  onboardingInstanceTasks,
  marketMatchSessions,
  duplicateContactPairs,
  agentGoals,
  properties,
  isaProfiles,
  userProfiles,
  isaOutcomeAttributions,
} from "../drizzle/schema";

let _pool: mysql.Pool | null = null;
let _db: MySql2Database<Record<string, unknown>> | null = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    // Pooled connection — a single connection serializes all queries and hangs under load.
    _pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
    _db = drizzle(_pool);
  }
  return _db!;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export type AgentLeaderboardPeriod = "this_week" | "this_month" | "this_quarter" | "ytd" | "all_time";
export type AgentLeaderboardDealType = "under_contract" | "closed";

type LeaderboardMilestone = {
  agentId: number;
  agentName: string;
  profilePhotoUrl: string | null;
  units: number;
  volume: number;
  periodStart?: string;
  date?: string;
};

function utcDate(year: number, month: number, day: number, endOfDay = false) {
  return new Date(Date.UTC(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
}

export function getAgentLeaderboardPeriodRange(period: AgentLeaderboardPeriod, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const endOfToday = utcDate(year, month, day, true);

  if (period === "all_time") {
    return { dateFrom: undefined, dateTo: undefined, label: "All Time" };
  }
  if (period === "ytd") {
    return { dateFrom: utcDate(year, 0, 1), dateTo: endOfToday, label: "Year to Date" };
  }
  if (period === "this_quarter") {
    const quarterStartMonth = Math.floor(month / 3) * 3;
    const quarter = Math.floor(month / 3) + 1;
    return { dateFrom: utcDate(year, quarterStartMonth, 1), dateTo: endOfToday, label: `Q${quarter} ${year}` };
  }
  if (period === "this_month") {
    return {
      dateFrom: utcDate(year, month, 1),
      dateTo: endOfToday,
      label: now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  }

  const startOfWeek = utcDate(year, month, day);
  const mondayOffset = (startOfWeek.getUTCDay() + 6) % 7;
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - mondayOffset);
  return { dateFrom: startOfWeek, dateTo: endOfToday, label: "This Week" };
}

function toDayKey(value: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function weekKeyFromDate(value: Date | string | null) {
  const dayKey = toDayKey(value);
  if (!dayKey) return null;
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

function monthKeyFromDate(value: Date | string | null) {
  const dayKey = toDayKey(value);
  return dayKey ? dayKey.slice(0, 7) : null;
}

function pickMilestone(groups: Map<string, LeaderboardMilestone>) {
  return Array.from(groups.values()).sort((a, b) =>
    b.units - a.units || b.volume - a.volume || a.agentName.localeCompare(b.agentName)
  )[0] ?? null;
}


async function resolveAgentIds(opts: {
  agentId?: number;
  groupId?: number;
  marketProfileId?: number;
}): Promise<number[] | undefined> {
  const db = await getDb();
  let ids: number[] | undefined;

  if (opts.groupId) {
    const rows = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, opts.groupId));
    ids = rows.map((r) => r.userId);
    if (ids.length === 0) return [-1];
  }

  if (opts.marketProfileId) {
    const rows = await db
      .select({ agentId: marketAgentAssignments.agentId })
      .from(marketAgentAssignments)
      .where(eq(marketAgentAssignments.marketProfileId, opts.marketProfileId));
    const mktIds = rows.map((r) => r.agentId);
    ids = ids ? ids.filter((id) => mktIds.includes(id)) : mktIds;
    if (ids.length === 0) return [-1];
  }

  if (opts.agentId) return [opts.agentId];
  return ids;
}

// ─── 1. Business Overview KPIs ────────────────────────────────────────────────

export async function getBusinessOverviewKpis(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const db = await getDb();
  const { dateFrom, dateTo } = opts ?? {};

  const txWhere = and(
    eq(transactions.status, "closed"),
    dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
    dateTo ? lte(transactions.closingDate, dateTo) : undefined,
  );

  const [gciRow] = await db
    .select({
      totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
      totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
      closings: sql<number>`COUNT(*)`,
      avgDealSize: sql<string>`COALESCE(AVG(${transactions.grossCommissionIncome}), 0)`,
    })
    .from(transactions)
    .where(txWhere);

  const [pipelineRow] = await db
    .select({ active: sql<number>`COUNT(*)` })
    .from(transactions)
    .where(eq(transactions.status, "under_contract"));

  const [agentRow] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "agent")));

  const [contactRow] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(contacts)
    .where(isNull(contacts.archivedAt));

  const [isaRow] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "isa")));

  return {
    totalGci: Number(gciRow.totalGci),
    totalVolume: Number(gciRow.totalVolume),
    closings: Number(gciRow.closings),
    avgDealSize: Number(gciRow.avgDealSize),
    activePipeline: Number(pipelineRow.active),
    activeAgents: Number(agentRow.total),
    totalContacts: Number(contactRow.total),
    activeIsas: Number(isaRow.total),
  };
}

// ─── 2. Agent Performance ─────────────────────────────────────────────────────

export async function getAgentPerformanceReport(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  agentId?: number;
  groupId?: number;
  marketProfileId?: number;
}) {
  const db = await getDb();
  const { dateFrom, dateTo } = opts ?? {};
  const agentIds = await resolveAgentIds(opts ?? {});

  const txWhere = and(
    eq(transactions.status, "closed"),
    dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
    dateTo ? lte(transactions.closingDate, dateTo) : undefined,
    agentIds ? inArray(transactions.agentId, agentIds) : undefined,
  );

  const production = await db
    .select({
      agentId: transactions.agentId,
      agentName: users.name,
      closings: sql<number>`COUNT(*)`,
      totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
      totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
      avgDealSize: sql<string>`COALESCE(AVG(${transactions.grossCommissionIncome}), 0)`,
    })
    .from(transactions)
    .innerJoin(users, eq(transactions.agentId, users.id))
    .where(txWhere)
    .groupBy(transactions.agentId, users.name)
    .orderBy(sql`SUM(${transactions.grossCommissionIncome}) DESC`);

  const pipelineRows = await db
    .select({
      agentId: agentConnections.agentId,
      pipelineCount: sql<number>`COUNT(*)`,
      activeCount: sql<number>`SUM(CASE WHEN ${agentConnections.pipelineStatus} = 'active_client' THEN 1 ELSE 0 END)`,
    })
    .from(agentConnections)
    .where(agentIds ? inArray(agentConnections.agentId, agentIds) : undefined)
    .groupBy(agentConnections.agentId);

  const pipelineMap = new Map(pipelineRows.map((p) => [p.agentId, p]));

  const year = new Date().getFullYear();
  const goalRows = await db
    .select()
    .from(agentGoals)
    .where(and(eq(agentGoals.year, year), eq(agentGoals.month, 0)));
  const goalMap = new Map(goalRows.map((g) => [g.agentId, g]));

  return production.map((row) => {
    const p = pipelineMap.get(row.agentId);
    const g = goalMap.get(row.agentId);
    const gci = Number(row.totalGci);
    const gciGoal = g?.gciTarget ? Number(g.gciTarget) : null;
    return {
      agentId: row.agentId,
      agentName: row.agentName ?? "Unknown",
      closings: Number(row.closings),
      totalGci: gci,
      totalVolume: Number(row.totalVolume),
      avgDealSize: Number(row.avgDealSize),
      pipelineCount: p ? Number(p.pipelineCount) : 0,
      activeCount: p ? Number(p.activeCount) : 0,
      gciGoal,
      goalPct: gciGoal && gciGoal > 0 ? Math.round((gci / gciGoal) * 100) : null,
    };
  });
}

// ─── 3. Agent Leaderboard ──────────────────────────────────────────────────────

export async function getAgentLeaderboard(opts: {
  period: AgentLeaderboardPeriod;
  dealType: AgentLeaderboardDealType;
  viewerAgentId: number;
}) {
  const db = await getDb();
  const isClosed = opts.dealType === "closed";
  const { dateFrom, dateTo, label } = getAgentLeaderboardPeriodRange(opts.period);
  const dateField = isClosed ? transactions.closingDate : transactions.contractDate;
  // Closed production follows the agent-selected period. Under Contract is intentionally
  // a live pipeline view, so date controls never hide active deals.
  const transactionWhere = isClosed
    ? and(
        eq(transactions.status, "closed"),
        dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
        dateTo ? lte(transactions.closingDate, dateTo) : undefined,
      )
    : eq(transactions.status, "under_contract");

  const activeAgents = await db
    .select({
      agentId: users.id,
      agentName: users.name,
      profilePhotoUrl: userProfiles.profilePhotoUrl,
      marketName: marketProfiles.name,
      marketState: marketProfiles.state,
      email: users.email,
      phone: sql<string | null>`COALESCE(NULLIF(${users.phone}, ''), NULLIF(${userProfiles.primaryPhone}, ''))`,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(marketProfiles, eq(users.marketProfileId, marketProfiles.id))
    .where(and(
      eq(users.role, "agent"),
      eq(users.isActive, true),
      sql`LOWER(TRIM(COALESCE(${users.name}, ''))) <> 'savvy agent'`,
    ))
    .orderBy(users.name);

  const production = await db
    .select({
      agentId: transactions.agentId,
      units: sql<number>`COUNT(*)`,
      volume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
      averageDealSize: sql<string>`COALESCE(AVG(${transactions.purchasePrice}), 0)`,
      buyerSides: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.transactionType} = 'buyer' THEN 1 ELSE 0 END), 0)`,
      sellerSides: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.transactionType} = 'seller' THEN 1 ELSE 0 END), 0)`,
      averageBuyerCommissionRate: sql<string | null>`AVG(CASE WHEN ${transactions.transactionType} = 'buyer' AND ${transactions.commissionType} = 'percentage' THEN ${transactions.commissionRate} * 100 ELSE NULL END)`,
      averageSellerCommissionRate: sql<string | null>`AVG(CASE WHEN ${transactions.transactionType} = 'seller' AND ${transactions.commissionType} = 'percentage' THEN ${transactions.commissionRate} * 100 ELSE NULL END)`,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.agentId))
    .where(and(transactionWhere, eq(users.role, "agent"), eq(users.isActive, true)))
    .groupBy(transactions.agentId);

  const productionByAgent = new Map(production.map((row) => [row.agentId, row]));
  const leaderboard = activeAgents
    .map((agent) => {
      const row = productionByAgent.get(agent.agentId);
      return {
        agentId: agent.agentId,
        agentName: agent.agentName ?? "Unknown",
        profilePhotoUrl: agent.profilePhotoUrl ?? null,
        marketName: agent.marketName ?? null,
        marketState: agent.marketState ?? null,
        email: agent.email ?? null,
        phone: agent.phone ?? null,
        units: Number(row?.units ?? 0),
        volume: Number(row?.volume ?? 0),
        averageDealSize: Number(row?.averageDealSize ?? 0),
        buyerSides: Number(row?.buyerSides ?? 0),
        sellerSides: Number(row?.sellerSides ?? 0),
        averageBuyerCommissionRate: row?.averageBuyerCommissionRate == null ? null : Number(row.averageBuyerCommissionRate),
        averageSellerCommissionRate: row?.averageSellerCommissionRate == null ? null : Number(row.averageSellerCommissionRate),
      };
    })
    .sort((a, b) => b.volume - a.volume || b.units - a.units || a.agentName.localeCompare(b.agentName))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const milestoneRows = await db
    .select({
      agentId: transactions.agentId,
      agentName: users.name,
      profilePhotoUrl: userProfiles.profilePhotoUrl,
      purchasePrice: transactions.purchasePrice,
      performanceDate: dateField,
      closingDate: transactions.closingDate,
    })
    .from(transactions)
    .innerJoin(users, eq(users.id, transactions.agentId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(transactionWhere, eq(users.role, "agent"), eq(users.isActive, true)));

  const normalizedMilestones = milestoneRows
    .filter((row) => !isClosed || Boolean(row.performanceDate))
    .map((row) => ({
      agentId: row.agentId,
      agentName: row.agentName ?? "Unknown",
      profilePhotoUrl: row.profilePhotoUrl ?? null,
      volume: Number(row.purchasePrice ?? 0),
      performanceDate: row.performanceDate ?? null,
      closingDate: row.closingDate,
    }));

  const largestTransaction = normalizedMilestones
    .slice()
    .sort((a, b) => b.volume - a.volume || a.agentName.localeCompare(b.agentName))[0];

  const weeklyGroups = new Map<string, LeaderboardMilestone>();
  if (isClosed) {
    for (const transaction of normalizedMilestones) {
      const weekStart = weekKeyFromDate(transaction.performanceDate);
      if (!weekStart) continue;
      const key = `${transaction.agentId}:${weekStart}`;
      const existing = weeklyGroups.get(key) ?? {
        agentId: transaction.agentId,
        agentName: transaction.agentName,
        profilePhotoUrl: transaction.profilePhotoUrl,
        units: 0,
        volume: 0,
        periodStart: weekStart,
      };
      existing.units += 1;
      existing.volume += transaction.volume;
      weeklyGroups.set(key, existing);
    }
  }

  const powerMonthYear = new Date().getUTCFullYear();
  const powerMonthRows = isClosed
    ? await db
      .select({
        agentId: transactions.agentId,
        agentName: users.name,
        profilePhotoUrl: userProfiles.profilePhotoUrl,
        purchasePrice: transactions.purchasePrice,
        closingDate: transactions.closingDate,
      })
      .from(transactions)
      .innerJoin(users, eq(users.id, transactions.agentId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(
        eq(transactions.status, "closed"),
        gte(transactions.closingDate, utcDate(powerMonthYear, 0, 1)),
        lte(transactions.closingDate, utcDate(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), true)),
        eq(users.role, "agent"),
        eq(users.isActive, true),
      ))
    : [];

  const powerMonthGroups = new Map<string, LeaderboardMilestone>();
  for (const transaction of powerMonthRows) {
    const monthStart = monthKeyFromDate(transaction.closingDate);
    if (!monthStart) continue;
    const key = `${transaction.agentId}:${monthStart}`;
    const existing = powerMonthGroups.get(key) ?? {
      agentId: transaction.agentId,
      agentName: transaction.agentName ?? "Unknown",
      profilePhotoUrl: transaction.profilePhotoUrl ?? null,
      units: 0,
      volume: 0,
      periodStart: monthStart,
    };
    existing.units += 1;
    existing.volume += Number(transaction.purchasePrice ?? 0);
    powerMonthGroups.set(key, existing);
  }

  const now = new Date();
  const nextClosing = !isClosed
    ? normalizedMilestones
      .filter((transaction) => transaction.closingDate && new Date(transaction.closingDate).getTime() >= now.getTime())
      .sort((a, b) => new Date(a.closingDate!).getTime() - new Date(b.closingDate!).getTime() || b.volume - a.volume)[0]
    : null;

  return {
    periodLabel: isClosed ? label : "Live Pipeline",
    hasDateFilters: isClosed,
    activeAgentCount: activeAgents.length,
    leaderboard,
    myEntry: leaderboard.find((entry) => entry.agentId === opts.viewerAgentId) ?? null,
    milestones: {
      largestTransaction: largestTransaction ? {
        agentId: largestTransaction.agentId,
        agentName: largestTransaction.agentName,
        profilePhotoUrl: largestTransaction.profilePhotoUrl,
        units: 1,
        volume: largestTransaction.volume,
      } : null,
      bestWeek: isClosed ? pickMilestone(weeklyGroups) : null,
      powerMonth: isClosed ? pickMilestone(powerMonthGroups) : null,
      nextClosing: nextClosing ? {
        agentId: nextClosing.agentId,
        agentName: nextClosing.agentName,
        profilePhotoUrl: nextClosing.profilePhotoUrl,
        units: 1,
        volume: nextClosing.volume,
        date: toDayKey(nextClosing.closingDate) ?? undefined,
      } : null,
    },
    powerMonthYear,
  };
}

// ─── 4. Agent Pipeline Funnel ─────────────────────────────────────────────────

export async function getAgentPipelineFunnel(opts?: {
  agentId?: number;
  groupId?: number;
}) {
  const db = await getDb();
  const agentIds = await resolveAgentIds(opts ?? {});

  const rows = await db
    .select({
      status: agentConnections.pipelineStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(agentConnections)
    .where(agentIds ? inArray(agentConnections.agentId, agentIds) : undefined)
    .groupBy(agentConnections.pipelineStatus);

  const order: string[] = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed", "dead"];
  const map = new Map(rows.map((r) => [r.status as string, Number(r.count)]));
  return order.map((s) => ({ status: s, count: map.get(s) ?? 0 }));
}

// ─── 4. Group Performance ─────────────────────────────────────────────────────

export async function getGroupPerformanceReport(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  groupId?: number;
}) {
  const db = await getDb();
  const { dateFrom, dateTo, groupId } = opts ?? {};

  const allGroups = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(groupId ? eq(groups.id, groupId) : undefined);

  const results = await Promise.all(
    allGroups.map(async (g) => {
      const members = await db
        .select({ userId: groupMembers.userId, userName: users.name })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, g.id));

      const memberIds = members.map((m) => m.userId);
      if (memberIds.length === 0) {
        return { groupId: g.id, groupName: g.name, memberCount: 0, closings: 0, totalGci: 0, totalVolume: 0, members: [] };
      }

       const txWhere = and(
        eq(transactions.status, "closed"),
        inArray(transactions.agentId, memberIds),
        dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
        dateTo ? lte(transactions.closingDate, dateTo) : undefined,
      );
      const ucWhere = and(
        eq(transactions.status, "under_contract" as any),
        inArray(transactions.agentId, memberIds),
      );
      const [summary] = await db
        .select({
          closings: sql<number>`COUNT(*)`,
          totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
          totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
        })
        .from(transactions)
        .where(txWhere);
      const [ucSummary] = await db
        .select({
          ucUnits: sql<number>`COUNT(*)`,
          ucVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
        })
        .from(transactions)
        .where(ucWhere);
      const memberStats = await db
        .select({
          agentId: transactions.agentId,
          agentName: users.name,
          closings: sql<number>`COUNT(*)`,
          totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
          totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.agentId, users.id))
        .where(txWhere)
        .groupBy(transactions.agentId, users.name);
      const memberUcStats = await db
        .select({
          agentId: transactions.agentId,
          ucUnits: sql<number>`COUNT(*)`,
          ucVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
        })
        .from(transactions)
        .where(ucWhere)
        .groupBy(transactions.agentId);
      const ucByAgent = new Map(memberUcStats.map((u) => [u.agentId, u]));
      return {
        groupId: g.id,
        groupName: g.name,
        memberCount: members.length,
        closings: Number(summary.closings),
        totalGci: Number(summary.totalGci),
        totalVolume: Number(summary.totalVolume),
        ucUnits: Number(ucSummary?.ucUnits ?? 0),
        ucVolume: Number(ucSummary?.ucVolume ?? 0),
        members: memberStats.map((m) => ({
          agentId: m.agentId,
          agentName: m.agentName ?? "Unknown",
          closings: Number(m.closings),
          totalGci: Number(m.totalGci),
          totalVolume: Number(m.totalVolume),
          ucUnits: Number(ucByAgent.get(m.agentId)?.ucUnits ?? 0),
          ucVolume: Number(ucByAgent.get(m.agentId)?.ucVolume ?? 0),
        })),
      };
    })
  );

  return results.sort((a, b) => b.totalGci - a.totalGci);
}

// ─── 5. Market Performance ────────────────────────────────────────────────────

export async function getMarketPerformanceReport(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  marketProfileId?: number;
}) {
  const db = await getDb();
  const { dateFrom, dateTo, marketProfileId } = opts ?? {};

  const allMarkets = await db
    .select({
      id: marketProfiles.id,
      name: marketProfiles.name,
      state: marketProfiles.state,
      status: marketProfiles.status,
      annualGciGoal: marketProfiles.annualGciGoal,
    })
    .from(marketProfiles)
    .where(marketProfileId ? eq(marketProfiles.id, marketProfileId) : undefined);

  const results = await Promise.all(
    allMarkets.map(async (m) => {
      const assignments = await db
        .select({ agentId: marketAgentAssignments.agentId, agentName: users.name })
        .from(marketAgentAssignments)
        .innerJoin(users, eq(marketAgentAssignments.agentId, users.id))
        .where(eq(marketAgentAssignments.marketProfileId, m.id));

      const agentIds = assignments.map((a) => a.agentId);
      if (agentIds.length === 0) {
        return {
          marketId: m.id, marketName: m.name, state: m.state, status: m.status,
          annualGciGoal: m.annualGciGoal ? Number(m.annualGciGoal) : null,
          agentCount: 0, closings: 0, totalGci: 0, totalVolume: 0, goalPct: null, agents: [],
        };
      }

      const txWhere = and(
        eq(transactions.status, "closed"),
        inArray(transactions.agentId, agentIds),
        dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
        dateTo ? lte(transactions.closingDate, dateTo) : undefined,
      );

      const [summary] = await db
        .select({
          closings: sql<number>`COUNT(*)`,
          totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
          totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
        })
        .from(transactions)
        .where(txWhere);

      const agentStats = await db
        .select({
          agentId: transactions.agentId,
          agentName: users.name,
          closings: sql<number>`COUNT(*)`,
          totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.agentId, users.id))
        .where(txWhere)
        .groupBy(transactions.agentId, users.name)
        .orderBy(sql`SUM(${transactions.grossCommissionIncome}) DESC`);

      const gci = Number(summary.totalGci);
      const goal = m.annualGciGoal ? Number(m.annualGciGoal) : null;

      return {
        marketId: m.id, marketName: m.name, state: m.state, status: m.status,
        annualGciGoal: goal, agentCount: assignments.length,
        closings: Number(summary.closings), totalGci: gci, totalVolume: Number(summary.totalVolume),
        goalPct: goal && goal > 0 ? Math.round((gci / goal) * 100) : null,
        agents: agentStats.map((a) => ({
          agentId: a.agentId, agentName: a.agentName ?? "Unknown",
          closings: Number(a.closings), totalGci: Number(a.totalGci),
        })),
      };
    })
  );

  return results.sort((a, b) => b.totalGci - a.totalGci);
}

// ─── 6. Commission Summary ────────────────────────────────────────────────────

export async function getCommissionSummaryReport(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  agentId?: number;
}) {
  const db = await getDb();
  const { dateFrom, dateTo, agentId } = opts ?? {};

  const txWhere = and(
    eq(transactions.status, "closed"),
    dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
    dateTo ? lte(transactions.closingDate, dateTo) : undefined,
    agentId ? eq(transactions.agentId, agentId) : undefined,
  );

  const [gciSummary] = await db
    .select({
      totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
      closings: sql<number>`COUNT(*)`,
    })
    .from(transactions)
    .where(txWhere);

  const payoutsByType = await db
    .select({
      payeeType: transactionPayoutItems.payeeType,
      totalAmount: sql<string>`COALESCE(SUM(${transactionPayoutItems.amount}), 0)`,
      count: sql<number>`COUNT(*)`,
      unpaidAmount: sql<string>`COALESCE(SUM(CASE WHEN ${transactionPayoutItems.isPaid} = 0 THEN ${transactionPayoutItems.amount} ELSE 0 END), 0)`,
      paidAmount: sql<string>`COALESCE(SUM(CASE WHEN ${transactionPayoutItems.isPaid} = 1 THEN ${transactionPayoutItems.amount} ELSE 0 END), 0)`,
    })
    .from(transactionPayoutItems)
    .innerJoin(transactions, eq(transactionPayoutItems.transactionId, transactions.id))
    .where(txWhere)
    .groupBy(transactionPayoutItems.payeeType);

  const agentPayouts = await db
    .select({
      agentId: transactionPayoutItems.payeeUserId,
      agentName: users.name,
      totalAmount: sql<string>`COALESCE(SUM(${transactionPayoutItems.amount}), 0)`,
      unpaidAmount: sql<string>`COALESCE(SUM(CASE WHEN ${transactionPayoutItems.isPaid} = 0 THEN ${transactionPayoutItems.amount} ELSE 0 END), 0)`,
      paidAmount: sql<string>`COALESCE(SUM(CASE WHEN ${transactionPayoutItems.isPaid} = 1 THEN ${transactionPayoutItems.amount} ELSE 0 END), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(transactionPayoutItems)
    .innerJoin(transactions, eq(transactionPayoutItems.transactionId, transactions.id))
    .leftJoin(users, eq(transactionPayoutItems.payeeUserId, users.id))
    .where(and(txWhere, eq(transactionPayoutItems.payeeType, "agent")))
    .groupBy(transactionPayoutItems.payeeUserId, users.name)
    .orderBy(sql`SUM(${transactionPayoutItems.amount}) DESC`);

  const [exceptionSummary] = await db
    .select({
      pending: sql<number>`SUM(CASE WHEN ${commissionExceptions.status} = 'pending' THEN 1 ELSE 0 END)`,
      approved: sql<number>`SUM(CASE WHEN ${commissionExceptions.status} = 'approved' THEN 1 ELSE 0 END)`,
      denied: sql<number>`SUM(CASE WHEN ${commissionExceptions.status} = 'denied' THEN 1 ELSE 0 END)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(commissionExceptions);

  return {
    totalGci: Number(gciSummary.totalGci),
    closings: Number(gciSummary.closings),
    payoutsByType: payoutsByType.map((p) => ({
      payeeType: p.payeeType,
      totalAmount: Number(p.totalAmount),
      unpaidAmount: Number(p.unpaidAmount),
      paidAmount: Number(p.paidAmount),
      count: Number(p.count),
    })),
    agentPayouts: agentPayouts.map((a) => ({
      agentId: a.agentId,
      agentName: a.agentName ?? "Unknown",
      totalAmount: Number(a.totalAmount),
      unpaidAmount: Number(a.unpaidAmount),
      paidAmount: Number(a.paidAmount),
      count: Number(a.count),
    })),
    exceptions: {
      pending: Number(exceptionSummary.pending),
      approved: Number(exceptionSummary.approved),
      denied: Number(exceptionSummary.denied),
      total: Number(exceptionSummary.total),
    },
  };
}

// ─── 7. Task Analytics ────────────────────────────────────────────────────────

export async function getTaskAnalyticsReport(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  assignedToId?: number;
  taskType?: string;
  priority?: string;
}) {
  const db = await getDb();
  const { dateFrom, dateTo, assignedToId, taskType, priority } = opts ?? {};

  const where = and(
    dateFrom ? gte(tasks.createdAt, dateFrom) : undefined,
    dateTo ? lte(tasks.createdAt, dateTo) : undefined,
    assignedToId ? eq(tasks.assignedToId, assignedToId) : undefined,
    taskType ? eq(tasks.taskType, taskType as "follow_up" | "outreach" | "document" | "call" | "email" | "meeting" | "review" | "payout" | "other") : undefined,
    priority ? eq(tasks.priority, priority as "low" | "medium" | "high" | "urgent") : undefined,
  );

  const statusBreakdown = await db
    .select({ status: tasks.status, count: sql<number>`COUNT(*)` })
    .from(tasks).where(where).groupBy(tasks.status);

  const priorityBreakdown = await db
    .select({ priority: tasks.priority, count: sql<number>`COUNT(*)` })
    .from(tasks).where(where).groupBy(tasks.priority);

  const typeBreakdown = await db
    .select({ taskType: tasks.taskType, count: sql<number>`COUNT(*)` })
    .from(tasks).where(where).groupBy(tasks.taskType);

  const now = new Date();
  const [overdueRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(tasks)
    .where(and(where, lte(tasks.dueDate, now), ne(tasks.status, "completed"), ne(tasks.status, "cancelled")));

  const byAssignee = await db
    .select({
      assignedToId: tasks.assignedToId,
      assigneeName: users.name,
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END)`,
      overdue: sql<number>`SUM(CASE WHEN ${tasks.dueDate} < NOW() AND ${tasks.status} NOT IN ('completed','cancelled') THEN 1 ELSE 0 END)`,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedToId, users.id))
    .where(where)
    .groupBy(tasks.assignedToId, users.name)
    .orderBy(sql`COUNT(*) DESC`);

  const statusMap = new Map(statusBreakdown.map((s) => [s.status, Number(s.count)]));
  const total = statusBreakdown.reduce((acc, s) => acc + Number(s.count), 0);
  const completed = statusMap.get("completed") ?? 0;

  return {
    total,
    pending: statusMap.get("pending") ?? 0,
    inProgress: statusMap.get("in_progress") ?? 0,
    completed,
    cancelled: statusMap.get("cancelled") ?? 0,
    overdue: Number(overdueRow.count),
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: Number(s.count) })),
    priorityBreakdown: priorityBreakdown.map((p) => ({ priority: p.priority, count: Number(p.count) })),
    typeBreakdown: typeBreakdown.map((t) => ({ taskType: t.taskType, count: Number(t.count) })),
    byAssignee: byAssignee.map((a) => ({
      assignedToId: a.assignedToId,
      assigneeName: a.assigneeName ?? "Unassigned",
      total: Number(a.total),
      completed: Number(a.completed),
      overdue: Number(a.overdue),
      completionRate: Number(a.total) > 0 ? Math.round((Number(a.completed) / Number(a.total)) * 100) : 0,
    })),
  };
}

// ─── 8. ISA Reporting ─────────────────────────────────────────────────────────

export async function getIsaReport(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  isaId?: number;
}) {
  const db = await getDb();
  const { dateFrom, dateTo, isaId } = opts ?? {};

  const contactWhere = and(
    dateFrom ? gte(contacts.createdAt, dateFrom) : undefined,
    dateTo ? lte(contacts.createdAt, dateTo) : undefined,
    isaId ? eq(contacts.assignedIsaId, isaId) : undefined,
    isNull(contacts.archivedAt),
  );

  const statusFunnel = await db
    .select({ isaStatus: contacts.isaStatus, count: sql<number>`COUNT(*)` })
    .from(contacts).where(contactWhere).groupBy(contacts.isaStatus);

  const isaPerf = await db
    .select({
      isaId: contacts.assignedIsaId,
      isaName: users.name,
      totalContacts: sql<number>`COUNT(*)`,
      activeClients: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} = 'active_client' THEN 1 ELSE 0 END)`,
      closed: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} = 'closed' THEN 1 ELSE 0 END)`,
      dead: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} = 'dead' THEN 1 ELSE 0 END)`,
    })
    .from(contacts)
    .leftJoin(users, eq(contacts.assignedIsaId, users.id))
    .where(and(contactWhere, isNotNull(contacts.assignedIsaId)))
    .groupBy(contacts.assignedIsaId, users.name)
    .orderBy(sql`COUNT(*) DESC`);

  // Appointment stats: count connections where appointmentSet=true, grouped by the contact's assigned ISA
  const connWhere = and(
    dateFrom ? gte(agentConnections.createdAt, dateFrom) : undefined,
    dateTo ? lte(agentConnections.createdAt, dateTo) : undefined,
    isaId ? eq(contacts.assignedIsaId, isaId) : undefined,
  );
  const appointmentRows = await db
    .select({
      isaId: contacts.assignedIsaId,
      totalConnections: sql<number>`COUNT(*)`,
      appointmentsSet: sql<number>`SUM(CASE WHEN ${agentConnections.appointmentSet} = 1 THEN 1 ELSE 0 END)`,
    })
    .from(agentConnections)
    .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
    .where(and(connWhere, isNotNull(contacts.assignedIsaId)))
    .groupBy(contacts.assignedIsaId);
  const appointmentMap = new Map(
    appointmentRows.map((r) => [r.isaId, { totalConnections: Number(r.totalConnections), appointmentsSet: Number(r.appointmentsSet) }])
  );
  const totalAppointmentsSet = appointmentRows.reduce((sum, r) => sum + Number(r.appointmentsSet), 0);

  const sessionWhere = and(
    dateFrom ? gte(marketMatchSessions.startedAt, dateFrom) : undefined,
    dateTo ? lte(marketMatchSessions.startedAt, dateTo) : undefined,
    isaId ? eq(marketMatchSessions.isaId, isaId) : undefined,
  );

  const [sessionSummary] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN ${marketMatchSessions.status} = 'completed' THEN 1 ELSE 0 END)`,
      abandoned: sql<number>`SUM(CASE WHEN ${marketMatchSessions.status} = 'abandoned' THEN 1 ELSE 0 END)`,
      avgDurationSeconds: sql<string>`AVG(${marketMatchSessions.durationSeconds})`,
    })
    .from(marketMatchSessions)
    .where(sessionWhere);

  const order = ["new_lead", "attempted_contact", "nurture", "active_client", "under_contract", "closed", "dead"];
  const statusMap = new Map(statusFunnel.map((s) => [s.isaStatus ?? "unknown", Number(s.count)]));

  return {
    statusFunnel: order.map((s) => ({ status: s, count: statusMap.get(s) ?? 0 })),
    isaPerformance: isaPerf.map((i) => {
      const appt = appointmentMap.get(i.isaId ?? 0);
      const appointmentsSet = appt?.appointmentsSet ?? 0;
      const totalConnections = appt?.totalConnections ?? 0;
      return {
        isaId: i.isaId,
        isaName: i.isaName ?? "Unknown",
        totalContacts: Number(i.totalContacts),
        activeClients: Number(i.activeClients),
        closed: Number(i.closed),
        dead: Number(i.dead),
        conversionRate: Number(i.totalContacts) > 0
          ? Math.round((Number(i.closed) / Number(i.totalContacts)) * 100) : 0,
        appointmentsSet,
        totalConnections,
        appointmentRate: totalConnections > 0
          ? Math.round((appointmentsSet / totalConnections) * 100) : 0,
      };
    }),
    totalAppointmentsSet,
    marketMatchSessions: {
      total: Number(sessionSummary.total),
      completed: Number(sessionSummary.completed),
      abandoned: Number(sessionSummary.abandoned),
      avgDurationMinutes: sessionSummary.avgDurationSeconds
        ? Math.round(Number(sessionSummary.avgDurationSeconds) / 60) : null,
    },
  };
}

// ─── 9. Lead Source Analytics ─────────────────────────────────────────────────

export async function getLeadSourceAnalyticsReport(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  parentId?: number;
}) {
  const db = await getDb();
  const { dateFrom, dateTo, parentId } = opts ?? {};

  const rows = await db
    .select({
      leadSourceId: contacts.leadSourceId,
      sourceName: leadSources.name,
      sourceType: leadSources.campaignType,
      parentId: leadSources.parentId,
      clickCount: leadSources.clickCount,
      submissionCount: leadSources.submissionCount,
      totalContacts: sql<number>`COUNT(DISTINCT ${contacts.id})`,
      activeClients: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} IN ('active_client','under_contract') THEN 1 ELSE 0 END)`,
      closed: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} = 'closed' THEN 1 ELSE 0 END)`,
    })
    .from(contacts)
    .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
    .where(and(
      isNull(contacts.archivedAt),
      dateFrom ? gte(contacts.createdAt, dateFrom) : undefined,
      dateTo ? lte(contacts.createdAt, dateTo) : undefined,
      parentId ? eq(leadSources.parentId, parentId) : undefined,
    ))
    .groupBy(contacts.leadSourceId, leadSources.name, leadSources.campaignType, leadSources.parentId, leadSources.clickCount, leadSources.submissionCount)
    .orderBy(sql`COUNT(DISTINCT ${contacts.id}) DESC`);

  // Fetch GCI from closed transactions per lead source
  const gciRows = await db
    .select({
      leadSourceId: contacts.leadSourceId,
      totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
      closings: sql<number>`COUNT(DISTINCT ${transactions.id})`,
    })
    .from(transactions)
    .innerJoin(contacts, eq(transactions.primaryContactId, contacts.id))
    .where(and(
      eq(transactions.status, "closed"),
      dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
      dateTo ? lte(transactions.closingDate, dateTo) : undefined,
    ))
    .groupBy(contacts.leadSourceId);

  const gciMap = new Map(gciRows.map((r) => [r.leadSourceId, r]));

  return rows.map((r) => {
    const gci = gciMap.get(r.leadSourceId);
    const totalGci = Number(gci?.totalGci ?? 0);
    const totalContacts = Number(r.totalContacts);
    return {
      leadSourceId: r.leadSourceId,
      sourceName: r.sourceName ?? "Unknown / No Source",
      sourceType: r.sourceType ?? "general",
      parentId: r.parentId,
      clickCount: r.clickCount ?? 0,
      submissionCount: r.submissionCount ?? 0,
      totalContacts,
      activeContacts: Number(r.activeClients),
      closings: Number(gci?.closings ?? 0),
      totalGci,
      gciPerContact: totalContacts > 0 ? Math.round(totalGci / totalContacts) : 0,
      conversionRate: totalContacts > 0
        ? Math.round((Number(r.closed) / totalContacts) * 100) : 0,
    };
  });
}

// ─── 10. Onboarding Report ────────────────────────────────────────────────────

export async function getOnboardingReport(opts?: {
  status?: "in_progress" | "completed";
  agentId?: number;
}) {
  const db = await getDb();
  const { status, agentId } = opts ?? {};

  const instances = await db
    .select({
      id: onboardingInstances.id,
      agentUserId: onboardingInstances.agentUserId,
      agentName: users.name,
      status: onboardingInstances.status,
      startedAt: onboardingInstances.startedAt,
      completedAt: onboardingInstances.completedAt,
    })
    .from(onboardingInstances)
    .innerJoin(users, eq(onboardingInstances.agentUserId, users.id))
    .where(and(
      status ? eq(onboardingInstances.status, status) : undefined,
      agentId ? eq(onboardingInstances.agentUserId, agentId) : undefined,
    ))
    .orderBy(onboardingInstances.startedAt);

  const enriched = await Promise.all(
    instances.map(async (inst) => {
      const [taskStats] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${onboardingInstanceTasks.completed} = 1 THEN 1 ELSE 0 END)`,
          overdue: sql<number>`SUM(CASE WHEN ${onboardingInstanceTasks.dueDate} < NOW() AND ${onboardingInstanceTasks.completed} = 0 THEN 1 ELSE 0 END)`,
        })
        .from(onboardingInstanceTasks)
        .where(eq(onboardingInstanceTasks.instanceId, inst.id));

      const total = Number(taskStats.total);
      const completedCount = Number(taskStats.completed);
      const daysToComplete = inst.completedAt
        ? Math.round((inst.completedAt.getTime() - inst.startedAt.getTime()) / 86400000)
        : null;

      return {
        instanceId: inst.id,
        agentId: inst.agentUserId,
        agentName: inst.agentName ?? "Unknown",
        status: inst.status,
        startedAt: inst.startedAt,
        completedAt: inst.completedAt,
        daysToComplete,
        totalTasks: total,
        completedTasks: completedCount,
        overdueTasks: Number(taskStats.overdue),
        pct: total > 0 ? Math.round((completedCount / total) * 100) : 0,
      };
    })
  );

  const completedInstances = enriched.filter((i) => i.status === "completed" && i.daysToComplete !== null);
  const avgDaysToComplete = completedInstances.length > 0
    ? Math.round(completedInstances.reduce((acc, i) => acc + (i.daysToComplete ?? 0), 0) / completedInstances.length)
    : null;

  return {
    instances: enriched,
    summary: {
      total: enriched.length,
      inProgress: enriched.filter((i) => i.status === "in_progress").length,
      completed: enriched.filter((i) => i.status === "completed").length,
      avgDaysToComplete,
      totalOverdueTasks: enriched.reduce((acc, i) => acc + i.overdueTasks, 0),
    },
  };
}

// ─── 11. Database Health ──────────────────────────────────────────────────────

export async function getDatabaseHealthReport() {
  const db = await getDb();

  const [contactStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      archived: sql<number>`SUM(CASE WHEN ${contacts.archivedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      bounced: sql<number>`SUM(CASE WHEN ${contacts.emailStatus} = 'bounced' THEN 1 ELSE 0 END)`,
      unsubscribed: sql<number>`SUM(CASE WHEN ${contacts.emailStatus} = 'unsubscribed' THEN 1 ELSE 0 END)`,
      noEmail: sql<number>`SUM(CASE WHEN ${contacts.email} IS NULL THEN 1 ELSE 0 END)`,
      noPhone: sql<number>`SUM(CASE WHEN ${contacts.phone} IS NULL THEN 1 ELSE 0 END)`,
      noLeadSource: sql<number>`SUM(CASE WHEN ${contacts.leadSourceId} IS NULL THEN 1 ELSE 0 END)`,
    })
    .from(contacts);

  const [duplicateStats] = await db
    .select({
      pending: sql<number>`SUM(CASE WHEN ${duplicateContactPairs.status} = 'pending' THEN 1 ELSE 0 END)`,
      merged: sql<number>`SUM(CASE WHEN ${duplicateContactPairs.status} = 'merged' THEN 1 ELSE 0 END)`,
      dismissed: sql<number>`SUM(CASE WHEN ${duplicateContactPairs.status} = 'dismissed' THEN 1 ELSE 0 END)`,
      total: sql<number>`COUNT(*)`,
    })
    .from(duplicateContactPairs);

  const monthlyGrowth = await db
    .select({
      month: sql<string>`DATE_FORMAT(${contacts.createdAt}, '%Y-%m')`,
      newContacts: sql<number>`COUNT(*)`,
    })
    .from(contacts)
    .where(gte(contacts.createdAt, new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)))
    .groupBy(sql`DATE_FORMAT(${contacts.createdAt}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${contacts.createdAt}, '%Y-%m')`);

  const isaStatusDist = await db
    .select({ isaStatus: contacts.isaStatus, count: sql<number>`COUNT(*)` })
    .from(contacts).where(isNull(contacts.archivedAt)).groupBy(contacts.isaStatus);

  // Transaction stats
  const [txStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      closed: sql<number>`SUM(CASE WHEN ${transactions.status} = 'closed' THEN 1 ELSE 0 END)`,
      underContract: sql<number>`SUM(CASE WHEN ${transactions.status} = 'under_contract' THEN 1 ELSE 0 END)`,
      terminated: sql<number>`SUM(CASE WHEN ${transactions.status} = 'terminated' THEN 1 ELSE 0 END)`,
      noGci: sql<number>`SUM(CASE WHEN ${transactions.grossCommissionIncome} IS NULL THEN 1 ELSE 0 END)`,
      integrityFlags: sql<number>`SUM(CASE WHEN ${transactions.payoutIntegrityFlag} = 1 THEN 1 ELSE 0 END)`,
      totalGci: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.grossCommissionIncome} ELSE 0 END), 0)`,
      totalVolume: sql<string>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.purchasePrice} ELSE 0 END), 0)`,
    })
    .from(transactions);

  // Agent stats
  const [agentStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      agents: sql<number>`SUM(CASE WHEN ${users.role} = 'agent' THEN 1 ELSE 0 END)`,
      isas: sql<number>`SUM(CASE WHEN ${users.role} = 'isa' THEN 1 ELSE 0 END)`,
      admins: sql<number>`SUM(CASE WHEN ${users.role} = 'admin' THEN 1 ELSE 0 END)`,
    })
    .from(users);

  // Task stats
  const [taskStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN ${tasks.status} = 'pending' THEN 1 ELSE 0 END)`,
      overdue: sql<number>`SUM(CASE WHEN ${tasks.dueDate} < NOW() AND ${tasks.status} != 'completed' THEN 1 ELSE 0 END)`,
    })
    .from(tasks);

  // Group and market stats
  const [groupCount] = await db.select({ total: sql<number>`COUNT(*)` }).from(groups);
  const [marketCount] = await db.select({ total: sql<number>`COUNT(*)` }).from(marketProfiles);
  const [leadSourceCount] = await db.select({ total: sql<number>`COUNT(*)` }).from(leadSources);

  // Pipeline connections
  const [pipelineStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`SUM(CASE WHEN ${agentConnections.pipelineStatus} IN ('active_client','under_contract') THEN 1 ELSE 0 END)`,
      noFollowUp: sql<number>`SUM(CASE WHEN ${agentConnections.followUpDate} IS NULL AND ${agentConnections.pipelineStatus} NOT IN ('closed','dead') THEN 1 ELSE 0 END)`,
    })
    .from(agentConnections);

  return {
    contacts: {
      total: Number(contactStats.total),
      active: Number(contactStats.total) - Number(contactStats.archived),
      archived: Number(contactStats.archived),
      bounced: Number(contactStats.bounced),
      unsubscribed: Number(contactStats.unsubscribed),
      noEmail: Number(contactStats.noEmail),
      noPhone: Number(contactStats.noPhone),
      noLeadSource: Number(contactStats.noLeadSource),
    },
    duplicates: {
      pending: Number(duplicateStats.pending),
      merged: Number(duplicateStats.merged),
      dismissed: Number(duplicateStats.dismissed),
      total: Number(duplicateStats.total),
    },
    transactions: {
      total: Number(txStats.total),
      closed: Number(txStats.closed),
      underContract: Number(txStats.underContract),
      terminated: Number(txStats.terminated),
      noGci: Number(txStats.noGci),
      integrityFlags: Number(txStats.integrityFlags),
      totalGci: Number(txStats.totalGci),
      totalVolume: Number(txStats.totalVolume),
    },
    users: {
      total: Number(agentStats.total),
      agents: Number(agentStats.agents),
      isas: Number(agentStats.isas),
      admins: Number(agentStats.admins),
    },
    tasks: {
      total: Number(taskStats.total),
      completed: Number(taskStats.completed),
      pending: Number(taskStats.pending),
      overdue: Number(taskStats.overdue),
    },
    pipeline: {
      total: Number(pipelineStats.total),
      active: Number(pipelineStats.active),
      noFollowUp: Number(pipelineStats.noFollowUp),
    },
    counts: {
      groups: Number(groupCount.total),
      markets: Number(marketCount.total),
      leadSources: Number(leadSourceCount.total),
    },
    monthlyGrowth: monthlyGrowth.map((m) => ({ month: m.month, newContacts: Number(m.newContacts) })),
    isaStatusDistribution: isaStatusDist.map((s) => ({ status: s.isaStatus ?? "unset", count: Number(s.count) })),
  };
}

// ─── 12. Monthly GCI Trend Extended ──────────────────────────────────────────

export async function getMonthlyGciTrendExtended(opts?: {
  months?: number;
  agentId?: number;
  groupId?: number;
  marketProfileId?: number;
}) {
  const db = await getDb();
  const { months = 12 } = opts ?? {};
  const agentIds = await resolveAgentIds(opts ?? {});

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const rows = await db
    .select({
      month: sql<string>`DATE_FORMAT(${transactions.closingDate}, '%Y-%m')`,
      totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
      closings: sql<number>`COUNT(*)`,
      totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
    })
    .from(transactions)
    .where(and(
      eq(transactions.status, "closed"),
      gte(transactions.closingDate, cutoff),
      agentIds ? inArray(transactions.agentId, agentIds) : undefined,
    ))
    .groupBy(sql`DATE_FORMAT(${transactions.closingDate}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${transactions.closingDate}, '%Y-%m')`);

  return rows.map((r) => ({
    month: r.month,
    totalGci: Number(r.totalGci),
    closings: Number(r.closings),
    totalVolume: Number(r.totalVolume),
  }));
}

// ─── 13. Financial Performance Dashboard ──────────────────────────────────────

export async function getFinancialPerformanceSummary(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  agentId?: number;
  groupId?: number;
  marketProfileId?: number;
}) {
  const db = await getDb();
  const { dateFrom, dateTo } = opts ?? {};
  const agentIds = await resolveAgentIds(opts ?? {});

  const closedWhere = and(
    eq(transactions.status, "closed"),
    dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
    dateTo ? lte(transactions.closingDate, dateTo) : undefined,
    agentIds ? inArray(transactions.agentId, agentIds) : undefined,
  );

  // Live under-contract inventory is a present-state snapshot and intentionally
  // ignores the selected reporting period.
  const ucWhere = and(
    eq(transactions.status, "under_contract"),
    agentIds ? inArray(transactions.agentId, agentIds) : undefined,
  );

  // Closed transaction aggregates
  const [closedRow] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
      totalGci: sql<string>`COALESCE(SUM(${transactions.grossCommissionIncome}), 0)`,
    })
    .from(transactions)
    .where(closedWhere);

  // Under-contract live inventory aggregate
  const [ucRow] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      totalVolume: sql<string>`COALESCE(SUM(${transactions.purchasePrice}), 0)`,
    })
    .from(transactions)
    .where(ucWhere);

  // Payout aggregates by type (closed only)
  const payoutRows = await db
    .select({
      payeeType: transactionPayoutItems.payeeType,
      totalAmount: sql<string>`COALESCE(SUM(${transactionPayoutItems.amount}), 0)`,
    })
    .from(transactionPayoutItems)
    .innerJoin(transactions, eq(transactionPayoutItems.transactionId, transactions.id))
    .where(closedWhere)
    .groupBy(transactionPayoutItems.payeeType);

  const payoutMap = new Map(payoutRows.map((p) => [p.payeeType, Number(p.totalAmount)]));

  const totalGci = Number(closedRow.totalGci);
  const referralPayouts = (payoutMap.get("referral_partner") ?? 0);
  const groupLeaderSplits = (payoutMap.get("group_leader") ?? 0);
  const agentPayouts = (payoutMap.get("agent") ?? 0);
  const companyDollars = (payoutMap.get("savvy_str_agents") ?? 0) + (payoutMap.get("exp") ?? 0);
  // Gross commission = GCI minus referral payouts
  const grossCommission = totalGci - referralPayouts;
  // Net commission = what agents actually receive
  const netCommission = agentPayouts;

  return {
    closed: {
      count: Number(closedRow.count),
      totalVolume: Number(closedRow.totalVolume),
    },
    underContract: {
      // Current inventory, regardless of expected close date.
      count: Number(ucRow?.count ?? 0),
      totalVolume: Number(ucRow?.totalVolume ?? 0),
    },
    totalGci,
    grossCommission,
    netCommission,
    companyDollars,
    referralPayouts,
    groupLeaderSplits,
    agentPayouts,
  };
}

export async function getMasterMetrics(opts?: {
  dateFrom?: Date;
  dateTo?: Date;
  agentId?: number;
  groupId?: number;
  marketProfileId?: number;
  leadSourceId?: number;
  status?: "closed" | "under_contract";
  sortBy?: "closingDate" | "purchasePrice" | "gci" | "companyDollars";
  sortOrder?: "asc" | "desc";
}) {
  const db = await getDb();
  const { dateFrom, dateTo, leadSourceId, status, sortBy = "closingDate", sortOrder = "desc" } = opts ?? {};
  const agentIds = await resolveAgentIds(opts ?? {});

  const statusFilter = status
    ? eq(transactions.status, status)
    : sql`${transactions.status} IN ('closed', 'under_contract')`;

  const txWhere = and(
    statusFilter,
    dateFrom ? gte(transactions.closingDate, dateFrom) : undefined,
    dateTo ? lte(transactions.closingDate, dateTo) : undefined,
    agentIds ? inArray(transactions.agentId, agentIds) : undefined,
    leadSourceId ? eq(contacts.leadSourceId, leadSourceId) : undefined,
  );

  const rows = await db
    .select({
      txId: transactions.id,
      txNumber: transactions.transactionNumber,
      status: transactions.status,
      closingDate: transactions.closingDate,
      purchasePrice: transactions.purchasePrice,
      grossCommissionIncome: transactions.grossCommissionIncome,
      agentId: transactions.agentId,
      agentName: users.name,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      propertyAddress: properties.address,
      propertyCity: properties.city,
      leadSourceName: leadSources.name,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.agentId, users.id))
    .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
    .leftJoin(properties, eq(transactions.propertyId, properties.id))
    .leftJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
    .where(txWhere)
    .orderBy(
      (() => {
        const col = sortBy === "purchasePrice" ? transactions.purchasePrice
          : sortBy === "gci" ? transactions.grossCommissionIncome
          : transactions.closingDate;
        return sortOrder === "asc" ? sql`${col} ASC` : sql`${col} DESC`;
      })()
    )
    .limit(500);

  if (rows.length === 0) return [];

  const txIds = rows.map((r) => r.txId);

  // Fetch all payout items for these transactions in one query
  const payoutRows = await db
    .select({
      transactionId: transactionPayoutItems.transactionId,
      payeeType: transactionPayoutItems.payeeType,
      amount: transactionPayoutItems.amount,
    })
    .from(transactionPayoutItems)
    .where(inArray(transactionPayoutItems.transactionId, txIds));

  // Group payouts by transaction
  const payoutsByTx = new Map<number, typeof payoutRows>();
  for (const p of payoutRows) {
    const existing = payoutsByTx.get(p.transactionId) ?? [];
    existing.push(p);
    payoutsByTx.set(p.transactionId, existing);
  }

  return rows.map((r) => {
    const txPayouts = payoutsByTx.get(r.txId) ?? [];
    const sumType = (type: string) =>
      txPayouts.filter((p) => p.payeeType === type).reduce((s, p) => s + Number(p.amount ?? 0), 0);

    const referralPayouts = sumType("referral_partner");
    const groupLeaderSplits = sumType("group_leader");
    const agentPayouts = sumType("agent");
    const companyDollars = sumType("savvy_str_agents") + sumType("exp");
    const gci = Number(r.grossCommissionIncome ?? 0);

    const address = [r.propertyAddress, r.propertyCity].filter(Boolean).join(", ") || "—";
    const contactName = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") || "—";

    return {
      txId: r.txId,
      txNumber: r.txNumber ?? `#${r.txId}`,
      status: r.status,
      closingDate: r.closingDate,
      purchasePrice: Number(r.purchasePrice ?? 0),
      gci,
      referralPayouts,
      groupLeaderSplits,
      agentPayouts,
      companyDollars,
      agentId: r.agentId,
      agentName: r.agentName ?? "Unknown",
      address,
      contactName,
      leadSource: r.leadSourceName ?? "—",
    };
  });
}


// ─── ISA Performance Dashboard ────────────────────────────────────────────────

const ISA_DASHBOARD_STATUSES = [
  "new_lead",
  "attempted_contact",
  "nurture",
  "active_client",
  "under_contract",
  "closed",
  "dead",
] as const;

export type IsaDashboardStatus = (typeof ISA_DASHBOARD_STATUSES)[number];

/**
 * A personal ISA performance view. The selected date range is applied to the
 * relevant activity date for each metric: contacts use creation date,
 * appointments use appointmentSetAt (falling back to connection creation for
 * legacy records), sessions use startedAt, and completed tasks use completedAt.
 * Transaction outcomes come from durable ISA attribution records: current Under
 * Contract ignores the selected date range, while Closed in period uses closedAt.
 */
export async function getIsaDashboardStats(opts: {
  isaId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  statuses?: IsaDashboardStatus[];
}) {
  const db = await getDb();
  const { isaId, dateFrom, dateTo, statuses } = opts;
  const selectedStatuses = statuses?.filter((status) => ISA_DASHBOARD_STATUSES.includes(status)) ?? [];
  const contactStatusFilter = selectedStatuses.length
    ? inArray(contacts.isaStatus, selectedStatuses)
    : undefined;

  const contactCohortWhere = and(
    isaId ? eq(contacts.assignedIsaId, isaId) : undefined,
    dateFrom ? gte(contacts.createdAt, dateFrom) : undefined,
    dateTo ? lte(contacts.createdAt, dateTo) : undefined,
    contactStatusFilter,
    isNull(contacts.archivedAt),
  );

  const appointmentCreditIsaId = sql`COALESCE(${agentConnections.appointmentSetByUserId}, ${contacts.assignedIsaId})`;
  const appointmentWhere = and(
    eq(agentConnections.appointmentSet, true),
    isaId ? sql`${appointmentCreditIsaId} = ${isaId}` : undefined,
    dateFrom ? sql`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt}) >= ${dateFrom}` : undefined,
    dateTo ? sql`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt}) <= ${dateTo}` : undefined,
    contactStatusFilter,
    isNull(contacts.archivedAt),
  );

  const sessionWhere = and(
    isaId ? eq(marketMatchSessions.isaId, isaId) : undefined,
    dateFrom ? gte(marketMatchSessions.startedAt, dateFrom) : undefined,
    dateTo ? lte(marketMatchSessions.startedAt, dateTo) : undefined,
  );

  const taskCompletionWhere = and(
    isaId ? eq(tasks.assignedToId, isaId) : undefined,
    eq(tasks.status, "completed"),
    dateFrom ? gte(tasks.completedAt, dateFrom) : undefined,
    dateTo ? lte(tasks.completedAt, dateTo) : undefined,
  );

  const overdueFollowUpWhere = and(
    isaId ? eq(tasks.assignedToId, isaId) : undefined,
    inArray(tasks.status, ["pending", "in_progress"]),
    lte(tasks.dueDate, new Date()),
  );

  const outcomeIsaWhere = isaId ? eq(isaOutcomeAttributions.isaId, isaId) : undefined;
  const currentUnderContractWhere = and(
    outcomeIsaWhere,
    eq(isaOutcomeAttributions.status, "under_contract"),
  );
  const closedPeriodWhere = and(
    outcomeIsaWhere,
    eq(isaOutcomeAttributions.status, "closed"),
    dateFrom ? gte(isaOutcomeAttributions.closedAt, dateFrom) : undefined,
    dateTo ? lte(isaOutcomeAttributions.closedAt, dateTo) : undefined,
  );
  const lifetimeClosedWhere = and(
    outcomeIsaWhere,
    eq(isaOutcomeAttributions.status, "closed"),
  );

  const [
    leadRows,
    appointmentRows,
    currentUnderContractRows,
    closedPeriodRows,
    lifetimeClosedRows,
    attributedOutcomeRows,
    sessionRows,
    completedTaskRows,
    overdueTaskRows,
    trendRows,
  ] = await Promise.all([
    db
      .select({
        assignedLeads: sql<number>`COUNT(*)`,
        untouchedLeads: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} = 'new_lead' THEN 1 ELSE 0 END)`,
        engagedLeads: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} <> 'new_lead' THEN 1 ELSE 0 END)`,
        activeLeads: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} IN ('attempted_contact', 'nurture', 'active_client') THEN 1 ELSE 0 END)`,
      })
      .from(contacts)
      .where(contactCohortWhere),
    db
      .select({
        appointmentsSet: sql<number>`COUNT(*)`,
        contactsWithAppointments: sql<number>`COUNT(DISTINCT ${agentConnections.contactId})`,
      })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(appointmentWhere),
    db
      .select({ underContract: sql<number>`COUNT(DISTINCT ${isaOutcomeAttributions.transactionId})` })
      .from(isaOutcomeAttributions)
      .where(currentUnderContractWhere),
    db
      .select({ closed: sql<number>`COUNT(DISTINCT ${isaOutcomeAttributions.transactionId})` })
      .from(isaOutcomeAttributions)
      .where(closedPeriodWhere),
    db
      .select({ closed: sql<number>`COUNT(DISTINCT ${isaOutcomeAttributions.transactionId})` })
      .from(isaOutcomeAttributions)
      .where(lifetimeClosedWhere),
    db
      .select({
        transactionId: isaOutcomeAttributions.transactionId,
        transactionNumber: transactions.transactionNumber,
        status: isaOutcomeAttributions.status,
        underContractAt: isaOutcomeAttributions.underContractAt,
        closedAt: isaOutcomeAttributions.closedAt,
        attributionBasis: isaOutcomeAttributions.attributionBasis,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        agentName: users.name,
      })
      .from(isaOutcomeAttributions)
      .innerJoin(transactions, eq(transactions.id, isaOutcomeAttributions.transactionId))
      .innerJoin(contacts, eq(contacts.id, isaOutcomeAttributions.contactId))
      .leftJoin(users, eq(users.id, transactions.agentId))
      .where(and(
        outcomeIsaWhere,
        inArray(isaOutcomeAttributions.status, ["under_contract", "closed"]),
      ))
      .orderBy(sql`COALESCE(${isaOutcomeAttributions.closedAt}, ${isaOutcomeAttributions.underContractAt}, ${isaOutcomeAttributions.createdAt}) DESC`)
      .limit(12),
    db
      .select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN ${marketMatchSessions.status} = 'completed' THEN 1 ELSE 0 END)`,
        avgDurationSeconds: sql<number>`AVG(${marketMatchSessions.durationSeconds})`,
      })
      .from(marketMatchSessions)
      .where(sessionWhere),
    db
      .select({ completed: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(taskCompletionWhere),
    db
      .select({ overdue: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(overdueFollowUpWhere),
    db
      .select({
        month: sql<string>`DATE_FORMAT(COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt}), '%Y-%m')`,
        appointmentsSet: sql<number>`COUNT(*)`,
        uniqueContacts: sql<number>`COUNT(DISTINCT ${agentConnections.contactId})`,
      })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(appointmentWhere)
      .groupBy(sql`DATE_FORMAT(COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt}), '%Y-%m')`)
      .orderBy(sql`DATE_FORMAT(COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt}), '%Y-%m') ASC`),
  ]);

  const leads = leadRows[0] ?? {};
  const appointments = appointmentRows[0] ?? {};
  const sessions = sessionRows[0] ?? {};
  const assignedLeads = Number(leads.assignedLeads ?? 0);
  const engagedLeads = Number(leads.engagedLeads ?? 0);
  const appointmentsSet = Number(appointments.appointmentsSet ?? 0);
  const underContract = Number(currentUnderContractRows[0]?.underContract ?? 0);
  const closed = Number(closedPeriodRows[0]?.closed ?? 0);
  const lifetimeClosed = Number(lifetimeClosedRows[0]?.closed ?? 0);

  return {
    summary: {
      assignedLeads,
      untouchedLeads: Number(leads.untouchedLeads ?? 0),
      engagedLeads,
      activeLeads: Number(leads.activeLeads ?? 0),
      engagementRate: assignedLeads > 0 ? (engagedLeads / assignedLeads) * 100 : null,
      appointmentsSet,
      contactsWithAppointments: Number(appointments.contactsWithAppointments ?? 0),
      underContract,
      closed,
      lifetimeClosed,
      completedFollowUps: Number(completedTaskRows[0]?.completed ?? 0),
      overdueFollowUps: Number(overdueTaskRows[0]?.overdue ?? 0),
      marketMatchSessions: Number(sessions.total ?? 0),
      completedMarketMatchSessions: Number(sessions.completed ?? 0),
      averageMarketMatchMinutes: sessions.avgDurationSeconds
        ? Number(sessions.avgDurationSeconds) / 60
        : null,
    },
    attributedOutcomes: attributedOutcomeRows.map((row) => ({
      transactionId: row.transactionId,
      transactionNumber: row.transactionNumber,
      status: row.status,
      underContractAt: row.underContractAt,
      closedAt: row.closedAt,
      attributionBasis: row.attributionBasis,
      contactName: `${row.contactFirstName} ${row.contactLastName}`.trim(),
      agentName: row.agentName,
    })),
    trend: trendRows.map((row) => ({
      month: String(row.month ?? ""),
      appointmentsSet: Number(row.appointmentsSet ?? 0),
      uniqueContacts: Number(row.uniqueContacts ?? 0),
    })),
  };
}


// ─── ISA Team Benchmarks ──────────────────────────────────────────────────────

export type IsaBenchmarkPeriod = "week" | "month";

function getIsaBenchmarkRange(period: IsaBenchmarkPeriod, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "week") {
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
  } else {
    start.setDate(1);
  }

  return { start, end };
}

/**
 * Returns a transparent, team-wide leaderboard for the current calendar week or
 * month. Each row uses the same activity window, so ISAs can compare outreach,
 * appointments, and downstream outcomes on equal footing. Only active ISA users
 * are included, and an ISA's own row is clearly identified by the caller.
 */
export async function getIsaTeamBenchmark(opts: {
  period: IsaBenchmarkPeriod;
  viewerIsaId?: number;
}) {
  const db = await getDb();
  const { start, end } = getIsaBenchmarkRange(opts.period);

  const activeIsas = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .leftJoin(isaProfiles, eq(isaProfiles.userId, users.id))
    .where(and(
      eq(users.role, "isa"),
      eq(users.isActive, true),
      or(isNull(isaProfiles.isaStatus), eq(isaProfiles.isaStatus, "active")),
    ));

  if (!activeIsas.length) {
    return {
      period: opts.period,
      range: { dateFrom: start, dateTo: end },
      teamSize: 0,
      averages: { engagedLeads: 0, appointmentsSet: 0, underContract: 0, closed: 0, completedFollowUps: 0 },
      leaderboard: [],
    };
  }

  const isaIds = activeIsas.map((isa) => isa.id);
  const benchmarkAppointmentIsaId = sql<number>`COALESCE(${agentConnections.appointmentSetByUserId}, ${contacts.assignedIsaId})`;
  const [leadRows, appointmentRows, outcomeRows, taskRows] = await Promise.all([
    db
      .select({
        isaId: contacts.assignedIsaId,
        engagedLeads: sql<number>`SUM(CASE WHEN ${contacts.isaStatus} <> 'new_lead' THEN 1 ELSE 0 END)`,
      })
      .from(contacts)
      .where(and(
        inArray(contacts.assignedIsaId, isaIds),
        gte(contacts.createdAt, start),
        lte(contacts.createdAt, end),
        isNull(contacts.archivedAt),
      ))
      .groupBy(contacts.assignedIsaId),
    db
      .select({
        isaId: benchmarkAppointmentIsaId,
        appointmentsSet: sql<number>`COUNT(*)`,
      })
      .from(agentConnections)
      .innerJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(and(
        eq(agentConnections.appointmentSet, true),
        or(
          inArray(agentConnections.appointmentSetByUserId, isaIds),
          and(isNull(agentConnections.appointmentSetByUserId), inArray(contacts.assignedIsaId, isaIds)),
        ),
        sql`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt}) >= ${start}`,
        sql`COALESCE(${agentConnections.appointmentSetAt}, ${agentConnections.createdAt}) <= ${end}`,
        isNull(contacts.archivedAt),
      ))
      .groupBy(benchmarkAppointmentIsaId),
    db
      .select({
        isaId: isaOutcomeAttributions.isaId,
        underContract: sql<number>`SUM(CASE WHEN ${isaOutcomeAttributions.status} = 'under_contract' THEN 1 ELSE 0 END)`,
        closed: sql<number>`SUM(CASE WHEN ${isaOutcomeAttributions.status} = 'closed' AND ${isaOutcomeAttributions.closedAt} >= ${start} AND ${isaOutcomeAttributions.closedAt} <= ${end} THEN 1 ELSE 0 END)`,
      })
      .from(isaOutcomeAttributions)
      .where(inArray(isaOutcomeAttributions.isaId, isaIds))
      .groupBy(isaOutcomeAttributions.isaId),
    db
      .select({
        isaId: tasks.assignedToId,
        completedFollowUps: sql<number>`COUNT(*)`,
      })
      .from(tasks)
      .where(and(
        inArray(tasks.assignedToId, isaIds),
        eq(tasks.status, "completed"),
        gte(tasks.completedAt, start),
        lte(tasks.completedAt, end),
      ))
      .groupBy(tasks.assignedToId),
  ]);

  const leadMap = new Map(leadRows.map((row) => [row.isaId, Number(row.engagedLeads ?? 0)]));
  const appointmentMap = new Map(appointmentRows.map((row) => [Number(row.isaId), Number(row.appointmentsSet ?? 0)]));
  const outcomeMap = new Map(outcomeRows.map((row) => [row.isaId, {
    underContract: Number(row.underContract ?? 0),
    closed: Number(row.closed ?? 0),
  }]));
  const taskMap = new Map(taskRows.map((row) => [row.isaId, Number(row.completedFollowUps ?? 0)]));

  const leaderboard = activeIsas
    .map((isa) => {
      const outcome = outcomeMap.get(isa.id);
      return {
        isaId: isa.id,
        isaName: isa.name ?? `ISA #${isa.id}`,
        engagedLeads: leadMap.get(isa.id) ?? 0,
        appointmentsSet: appointmentMap.get(isa.id) ?? 0,
        underContract: outcome?.underContract ?? 0,
        closed: outcome?.closed ?? 0,
        completedFollowUps: taskMap.get(isa.id) ?? 0,
        isViewer: isa.id === opts.viewerIsaId,
      };
    })
    .sort((a, b) => (
      b.appointmentsSet - a.appointmentsSet
      || b.underContract - a.underContract
      || b.closed - a.closed
      || b.engagedLeads - a.engagedLeads
      || a.isaName.localeCompare(b.isaName)
    ))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const sum = leaderboard.reduce((total, row) => ({
    engagedLeads: total.engagedLeads + row.engagedLeads,
    appointmentsSet: total.appointmentsSet + row.appointmentsSet,
    underContract: total.underContract + row.underContract,
    closed: total.closed + row.closed,
    completedFollowUps: total.completedFollowUps + row.completedFollowUps,
  }), { engagedLeads: 0, appointmentsSet: 0, underContract: 0, closed: 0, completedFollowUps: 0 });

  const teamSize = leaderboard.length;
  return {
    period: opts.period,
    range: { dateFrom: start, dateTo: end },
    teamSize,
    averages: {
      engagedLeads: sum.engagedLeads / teamSize,
      appointmentsSet: sum.appointmentsSet / teamSize,
      underContract: sum.underContract / teamSize,
      closed: sum.closed / teamSize,
      completedFollowUps: sum.completedFollowUps / teamSize,
    },
    leaderboard,
  };
}
