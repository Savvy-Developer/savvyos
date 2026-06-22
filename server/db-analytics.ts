/**
 * db-analytics.ts
 * All new BI report query helpers for the Analytics & Reporting rebuild (v55).
 */

import { and, eq, gte, lte, sql, isNull, isNotNull, ne, inArray } from "drizzle-orm";
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

// ─── 3. Agent Pipeline Funnel ─────────────────────────────────────────────────

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
    isaPerformance: isaPerf.map((i) => ({
      isaId: i.isaId,
      isaName: i.isaName ?? "Unknown",
      totalContacts: Number(i.totalContacts),
      activeClients: Number(i.activeClients),
      closed: Number(i.closed),
      dead: Number(i.dead),
      conversionRate: Number(i.totalContacts) > 0
        ? Math.round((Number(i.closed) / Number(i.totalContacts)) * 100) : 0,
    })),
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

  // Under-contract aggregates
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
      count: Number(ucRow.count),
      totalVolume: Number(ucRow.totalVolume),
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
