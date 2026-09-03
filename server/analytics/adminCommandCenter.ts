import { eq, sql, type SQL } from "drizzle-orm";
import {
  dashboardAlertReviews,
  dashboardSettings,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type CommandCenterFilters = {
  dateFrom: Date;
  dateTo: Date;
  marketProfileId?: number;
  agentId?: number;
  isaId?: number;
  leadSourceId?: number;
  transactionType?: "buyer" | "seller" | "dual";
  pipelineStatus?: string;
  transactionStatus?: "under_contract" | "closed" | "terminated";
};

export type CommandCenterAccess = {
  financial: boolean;
  contacts: boolean;
  pipeline: boolean;
  tasks: boolean;
  users: boolean;
  markets: boolean;
  reporting: boolean;
};

type QueryRow = Record<string, unknown>;

function rows<T extends QueryRow>(result: unknown): T[] {
  const candidate = result as T[] | T[][];
  return (Array.isArray(candidate[0]) ? candidate[0] : candidate) as T[];
}

function number(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value) || 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentage(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function sqlAnd(parts: SQL[]): SQL {
  return parts.length ? sql.join(parts, sql` AND `) : sql`1 = 1`;
}

function sqlList(values: readonly string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

/** Supports both primary and additional Agent Markets assignments. */
function agentInMarket(agentId: SQL, marketProfileId: number): SQL {
  return sql`EXISTS (
    SELECT 1 FROM market_agent_assignments market_assignment
    WHERE market_assignment.agentId = ${agentId}
      AND market_assignment.marketProfileId = ${marketProfileId}
  )`;
}

function previousEquivalentRange(filters: CommandCenterFilters) {
  const duration = filters.dateTo.getTime() - filters.dateFrom.getTime() + 1;
  return {
    dateTo: new Date(filters.dateFrom.getTime() - 1),
    dateFrom: new Date(filters.dateFrom.getTime() - duration),
  };
}

function transactionScope(
  filters: CommandCenterFilters,
  options: { status?: "under_contract" | "closed" | "terminated"; applyDate?: boolean } = {},
): SQL {
  const conditions: SQL[] = [sql`t.referralId IS NULL AND NOT EXISTS (
    SELECT 1 FROM referral_transaction_links rtl WHERE rtl.transactionId = t.id
  )`];
  const scopedStatus = options.status ?? filters.transactionStatus;
  if (scopedStatus) conditions.push(sql`t.status = ${scopedStatus}`);
  if (filters.agentId) conditions.push(sql`t.agentId = ${filters.agentId}`);
  if (filters.marketProfileId) conditions.push(agentInMarket(sql`owner.id`, filters.marketProfileId));
  if (filters.leadSourceId) conditions.push(sql`contact.leadSourceId = ${filters.leadSourceId}`);
  if (filters.transactionType) conditions.push(sql`t.transactionType = ${filters.transactionType}`);
  if (options.applyDate !== false) {
    conditions.push(sql`t.closingDate >= ${filters.dateFrom}`);
    conditions.push(sql`t.closingDate <= ${filters.dateTo}`);
  }
  return sqlAnd(conditions);
}

function connectionScope(
  filters: CommandCenterFilters,
  options: { applyDate?: boolean; includeTerminal?: boolean } = {},
): SQL {
  const conditions: SQL[] = [sql`contact.archived_at IS NULL`];
  if (!options.includeTerminal) {
    conditions.push(sql`connection.pipelineStatus NOT IN ('closed', 'dead', 'do_not_contact')`);
  }
  if (filters.agentId) conditions.push(sql`connection.agentId = ${filters.agentId}`);
  if (filters.marketProfileId) conditions.push(agentInMarket(sql`agent.id`, filters.marketProfileId));
  if (filters.isaId) conditions.push(sql`contact.assignedIsaId = ${filters.isaId}`);
  if (filters.leadSourceId) conditions.push(sql`contact.leadSourceId = ${filters.leadSourceId}`);
  if (filters.pipelineStatus) conditions.push(sql`connection.pipelineStatus = ${filters.pipelineStatus}`);
  if (options.applyDate) {
    conditions.push(sql`connection.createdAt >= ${filters.dateFrom}`);
    conditions.push(sql`connection.createdAt <= ${filters.dateTo}`);
  }
  return sqlAnd(conditions);
}

function contactScope(filters: CommandCenterFilters, applyDate = true): SQL {
  const conditions: SQL[] = [sql`contact.archived_at IS NULL`];
  if (filters.isaId) conditions.push(sql`contact.assignedIsaId = ${filters.isaId}`);
  if (filters.leadSourceId) conditions.push(sql`contact.leadSourceId = ${filters.leadSourceId}`);
  if (filters.agentId || filters.marketProfileId) {
    const connectionConditions: SQL[] = [sql`scope_connection.contactId = contact.id`];
    if (filters.agentId) connectionConditions.push(sql`scope_connection.agentId = ${filters.agentId}`);
    if (filters.marketProfileId) connectionConditions.push(agentInMarket(sql`scope_agent.id`, filters.marketProfileId));
    conditions.push(sql`EXISTS (SELECT 1 FROM agent_connections scope_connection LEFT JOIN users scope_agent ON scope_agent.id = scope_connection.agentId WHERE ${sqlAnd(connectionConditions)})`);
  }
  if (applyDate) {
    conditions.push(sql`contact.createdAt >= ${filters.dateFrom}`);
    conditions.push(sql`contact.createdAt <= ${filters.dateTo}`);
  }
  return sqlAnd(conditions);
}

function toMetric(row: QueryRow | undefined) {
  return {
    units: number(row?.units),
    volume: number(row?.volume),
    gci: number(row?.gci),
  };
}

function goalProgress(value: number, annualGoal: number | null, filters: CommandCenterFilters) {
  if (!annualGoal || annualGoal <= 0) return { goal: null, percent: null, status: "not_configured" as const };
  const yearStart = new Date(Date.UTC(filters.dateTo.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(filters.dateTo.getUTCFullYear() + 1, 0, 1));
  const selectedStart = Math.max(filters.dateFrom.getTime(), yearStart.getTime());
  const selectedEnd = Math.min(filters.dateTo.getTime(), yearEnd.getTime());
  const selectedDays = Math.max(0, Math.ceil((selectedEnd - selectedStart + 1) / 86_400_000));
  const totalDays = Math.ceil((yearEnd.getTime() - yearStart.getTime()) / 86_400_000);
  const proratedGoal = annualGoal * (selectedDays / totalDays);
  const percent = proratedGoal > 0 ? (value / proratedGoal) * 100 : null;
  return {
    goal: proratedGoal,
    percent,
    status: percent === null ? "not_configured" as const : percent >= 100 ? "on_track" as const : percent >= 80 ? "watch" as const : "at_risk" as const,
  };
}

function alertSeverityRank(severity: "high" | "medium" | "low") {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

export async function getCommandCenterFilterOptions(access: CommandCenterAccess) {
  const db = await getDb();
  if (!db) return { markets: [], agents: [], isas: [], leadSources: [] };
  const [marketResult, agentResult, isaResult, sourceResult] = await Promise.all([
    access.markets || access.users
      ? db.execute(sql`SELECT id, name, state FROM market_profiles WHERE status = 'active' ORDER BY name`)
      : Promise.resolve([]),
    access.users
      ? db.execute(sql`SELECT id, name, email, marketProfileId FROM users WHERE isActive = 1 AND role = 'agent' ORDER BY name`)
      : Promise.resolve([]),
    access.users
      ? db.execute(sql`SELECT id, name, email FROM users WHERE isActive = 1 AND role = 'isa' ORDER BY name`)
      : Promise.resolve([]),
    access.contacts
      ? db.execute(sql`SELECT id, name, parentId FROM lead_sources WHERE isActive = 1 ORDER BY name`)
      : Promise.resolve([]),
  ]);

  return {
    markets: rows<QueryRow>(marketResult),
    agents: rows<QueryRow>(agentResult),
    isas: rows<QueryRow>(isaResult),
    leadSources: rows<QueryRow>(sourceResult),
  };
}

export async function getCommandCenterSettings(goalYear: number) {
  const db = await getDb();
  if (!db) return null;
  const settingRows = await db.select().from(dashboardSettings).where(eq(dashboardSettings.goalYear, goalYear)).limit(1);
  return settingRows[0] ?? null;
}

export async function saveCommandCenterSettings(input: {
  goalYear: number;
  companyGciGoal?: number | null;
  companyVolumeGoal?: number | null;
  companyUnitsGoal?: number | null;
  newLeadSlaHours?: number;
  pipelineStaleDays?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const current = await getCommandCenterSettings(input.goalYear);
  const values = {
    goalYear: input.goalYear,
    companyGciGoal: input.companyGciGoal === undefined ? current?.companyGciGoal ?? null : input.companyGciGoal?.toString() ?? null,
    companyVolumeGoal: input.companyVolumeGoal === undefined ? current?.companyVolumeGoal ?? null : input.companyVolumeGoal?.toString() ?? null,
    companyUnitsGoal: input.companyUnitsGoal === undefined ? current?.companyUnitsGoal ?? null : input.companyUnitsGoal ?? null,
    newLeadSlaHours: input.newLeadSlaHours ?? current?.newLeadSlaHours ?? 24,
    pipelineStaleDays: input.pipelineStaleDays ?? current?.pipelineStaleDays ?? 14,
  };
  if (current) {
    await db.update(dashboardSettings).set(values).where(eq(dashboardSettings.id, current.id));
  } else {
    await db.insert(dashboardSettings).values(values);
  }
  return getCommandCenterSettings(input.goalYear);
}

export async function reviewCommandCenterAlert(input: {
  userId: number;
  alertKey: string;
  status: "reviewed" | "snoozed";
  snoozedUntil?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(dashboardAlertReviews).values({
    userId: input.userId,
    alertKey: input.alertKey,
    status: input.status,
    snoozedUntil: input.status === "snoozed" ? input.snoozedUntil ?? null : null,
  }).onDuplicateKeyUpdate({
    set: {
      status: input.status,
      snoozedUntil: input.status === "snoozed" ? input.snoozedUntil ?? null : null,
      updatedAt: new Date(),
    },
  });
  return { success: true };
}

export async function getAdminCommandCenter(input: {
  viewerId: number;
  filters: CommandCenterFilters;
  access: CommandCenterAccess;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const { filters, access } = input;
  const priorRange = previousEquivalentRange(filters);
  // Executive production cards always represent closed actuals. A dashboard
  // transaction-status filter must never silently turn a card labeled “Closed”
  // into under-contract or terminated volume.
  const currentClosedScope = transactionScope(filters, { status: "closed" });
  const priorFilters = { ...filters, dateFrom: priorRange.dateFrom, dateTo: priorRange.dateTo };
  const priorClosedScope = transactionScope(priorFilters, { status: "closed" });
  const connectionCurrentScope = connectionScope(filters, { applyDate: false });
  const connectionCohortScope = connectionScope(filters, { applyDate: true, includeTerminal: true });
  const allConnectionScope = connectionScope(filters, { applyDate: false, includeTerminal: true });
  const activeContractScope = transactionScope(filters, { status: "under_contract", applyDate: false });
  const activeContractDateScope = transactionScope(filters, { status: "under_contract", applyDate: true });
  const currentYear = filters.dateTo.getUTCFullYear();
  const now = new Date();
  const next7 = new Date(now.getTime() + 7 * 86_400_000);
  const next30 = new Date(now.getTime() + 30 * 86_400_000);
  const next60 = new Date(now.getTime() + 60 * 86_400_000);
  const next90 = new Date(now.getTime() + 90 * 86_400_000);

  const settings = await getCommandCenterSettings(currentYear);
  const configuredNewLeadSlaHours = settings?.newLeadSlaHours ?? 24;
  const configuredPipelineStaleDays = settings?.pipelineStaleDays ?? 14;
  const reviewPromise = db.select().from(dashboardAlertReviews).where(eq(dashboardAlertReviews.userId, input.viewerId));

  const financialPromise = access.financial
    ? Promise.all([
      db.execute(sql`SELECT COUNT(*) AS units, COALESCE(SUM(t.purchasePrice), 0) AS volume, COALESCE(SUM(t.grossCommissionIncome), 0) AS gci
        FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        WHERE ${currentClosedScope}`),
      db.execute(sql`SELECT COUNT(*) AS units, COALESCE(SUM(t.purchasePrice), 0) AS volume, COALESCE(SUM(t.grossCommissionIncome), 0) AS gci
        FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        WHERE ${priorClosedScope}`),
      db.execute(sql`SELECT COUNT(*) AS units, COALESCE(SUM(t.purchasePrice), 0) AS volume, COALESCE(SUM(t.grossCommissionIncome), 0) AS gci
        FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        WHERE ${activeContractScope}`),
      db.execute(sql`SELECT DATE_FORMAT(t.closingDate, '%Y-%m') AS period,
          COUNT(CASE WHEN t.status = 'closed' THEN 1 END) AS closedUnits,
          COALESCE(SUM(CASE WHEN t.status = 'closed' THEN t.purchasePrice ELSE 0 END), 0) AS closedVolume,
          COALESCE(SUM(CASE WHEN t.status = 'closed' THEN t.grossCommissionIncome ELSE 0 END), 0) AS closedGci,
          COUNT(CASE WHEN t.status = 'under_contract' THEN 1 END) AS underContractUnits,
          COALESCE(SUM(CASE WHEN t.status = 'under_contract' THEN t.purchasePrice ELSE 0 END), 0) AS underContractVolume,
          COALESCE(SUM(CASE WHEN t.status = 'under_contract' THEN t.grossCommissionIncome ELSE 0 END), 0) AS underContractGci
        FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        WHERE t.status IN ('closed', 'under_contract')
          AND ${transactionScope({ ...filters, transactionStatus: undefined }, { status: undefined })}
        GROUP BY DATE_FORMAT(t.closingDate, '%Y-%m') ORDER BY period`),
    ])
    : Promise.resolve(null);

  const futureProductionPromise = access.financial
    ? Promise.all([
      db.execute(sql`SELECT COUNT(*) AS units, COALESCE(SUM(t.purchasePrice), 0) AS volume, COALESCE(SUM(t.grossCommissionIncome), 0) AS gci
        FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        WHERE ${activeContractScope} AND t.closingDate >= ${now} AND t.closingDate < ${next30}`),
      db.execute(sql`SELECT COUNT(*) AS units, COALESCE(SUM(t.purchasePrice), 0) AS volume, COALESCE(SUM(t.grossCommissionIncome), 0) AS gci
        FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        WHERE ${activeContractScope} AND t.closingDate >= ${now} AND t.closingDate < ${next60}`),
      db.execute(sql`SELECT COUNT(*) AS units, COALESCE(SUM(t.purchasePrice), 0) AS volume, COALESCE(SUM(t.grossCommissionIncome), 0) AS gci
        FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        WHERE ${activeContractScope} AND t.closingDate >= ${now} AND t.closingDate < ${next90}`),
      db.execute(sql`SELECT t.id, t.transactionNumber, t.closingDate, t.purchasePrice, t.grossCommissionIncome,
          t.contractDate, t.transactionType, t.payoutIntegrityFlag, owner.name AS ownerName,
          CONCAT(contact.firstName, ' ', contact.lastName) AS clientName,
          SUM(CASE WHEN task.status IN ('pending','in_progress') AND task.dueDate < ${now} THEN 1 ELSE 0 END) AS overdueTaskCount
        FROM transactions t
        LEFT JOIN users owner ON owner.id = t.agentId
        LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        LEFT JOIN tasks task ON task.relatedTransactionId = t.id
        WHERE ${activeContractScope} AND t.closingDate >= ${now} AND t.closingDate < ${next30}
        GROUP BY t.id, t.transactionNumber, t.closingDate, t.purchasePrice, t.grossCommissionIncome, t.contractDate, t.transactionType, t.payoutIntegrityFlag, owner.name, contact.firstName, contact.lastName
        ORDER BY t.closingDate ASC LIMIT 20`),
    ])
    : Promise.resolve(null);

  const pipelinePromise = access.pipeline
    ? Promise.all([
      db.execute(sql`SELECT connection.pipelineStatus AS stage, COUNT(*) AS count,
          ROUND(AVG(DATEDIFF(${now}, COALESCE(connection.agingUpdatedAt, connection.updatedAt))), 1) AS averageAgeDays,
          SUM(CASE WHEN DATEDIFF(${now}, COALESCE(connection.agingUpdatedAt, connection.updatedAt)) >= ${configuredPipelineStaleDays} THEN 1 ELSE 0 END) AS staleCount
        FROM agent_connections connection
        LEFT JOIN contacts contact ON contact.id = connection.contactId
        LEFT JOIN users agent ON agent.id = connection.agentId
        WHERE ${connectionCohortScope}
        GROUP BY connection.pipelineStatus`),
      db.execute(sql`SELECT connection.pipelineStatus AS stage, COUNT(*) AS count,
          ROUND(AVG(DATEDIFF(${now}, COALESCE(connection.agingUpdatedAt, connection.updatedAt))), 1) AS averageAgeDays,
          SUM(CASE WHEN DATEDIFF(${now}, COALESCE(connection.agingUpdatedAt, connection.updatedAt)) >= ${configuredPipelineStaleDays} THEN 1 ELSE 0 END) AS staleCount
        FROM agent_connections connection
        LEFT JOIN contacts contact ON contact.id = connection.contactId
        LEFT JOIN users agent ON agent.id = connection.agentId
        WHERE ${allConnectionScope}
        GROUP BY connection.pipelineStatus`),
    ])
    : Promise.resolve(null);

  const sourcePromise = access.contacts && access.financial
    ? db.execute(sql`SELECT source.id, source.name,
        COALESCE(leads.leads, 0) AS leads,
        COALESCE(closed.units, 0) AS closedUnits,
        COALESCE(closed.volume, 0) AS closedVolume,
        COALESCE(closed.gci, 0) AS closedGci
      FROM lead_sources source
      LEFT JOIN (
        SELECT contact.leadSourceId, COUNT(DISTINCT contact.id) AS leads
        FROM contacts contact
        WHERE ${contactScope(filters, true)}
        GROUP BY contact.leadSourceId
      ) leads ON leads.leadSourceId = source.id
      LEFT JOIN (
        SELECT contact.leadSourceId, COUNT(*) AS units, COALESCE(SUM(t.purchasePrice), 0) AS volume, COALESCE(SUM(t.grossCommissionIncome), 0) AS gci
        FROM transactions t
        LEFT JOIN contacts contact ON contact.id = t.primaryContactId
        LEFT JOIN users owner ON owner.id = t.agentId
        WHERE ${currentClosedScope}
        GROUP BY contact.leadSourceId
      ) closed ON closed.leadSourceId = source.id
      WHERE COALESCE(leads.leads, 0) > 0 OR COALESCE(closed.units, 0) > 0
      ORDER BY COALESCE(closed.gci, 0) DESC, COALESCE(leads.leads, 0) DESC LIMIT 12`)
    : Promise.resolve(null);

  const agentPromise = access.users && access.financial
    ? db.execute(sql`SELECT agent.id, agent.name, agent.marketProfileId, market.name AS marketName,
        (SELECT COUNT(*) FROM transactions closed30 WHERE closed30.agentId = agent.id AND closed30.status = 'closed' AND closed30.closingDate >= DATE_SUB(${now}, INTERVAL 30 DAY)) AS units30,
        (SELECT COUNT(*) FROM transactions closed60 WHERE closed60.agentId = agent.id AND closed60.status = 'closed' AND closed60.closingDate >= DATE_SUB(${now}, INTERVAL 60 DAY)) AS units60,
        (SELECT COUNT(*) FROM transactions closed90 WHERE closed90.agentId = agent.id AND closed90.status = 'closed' AND closed90.closingDate >= DATE_SUB(${now}, INTERVAL 90 DAY)) AS units90,
        (SELECT COALESCE(SUM(closed90.grossCommissionIncome), 0) FROM transactions closed90 WHERE closed90.agentId = agent.id AND closed90.status = 'closed' AND closed90.closingDate >= DATE_SUB(${now}, INTERVAL 90 DAY)) AS gci90,
        (SELECT COUNT(*) FROM agent_connections activeConnection WHERE activeConnection.agentId = agent.id AND activeConnection.pipelineStatus = 'active_client') AS activeClients,
        (SELECT COUNT(*) FROM agent_connections staleConnection WHERE staleConnection.agentId = agent.id AND staleConnection.pipelineStatus = 'active_client' AND DATEDIFF(${now}, COALESCE(staleConnection.agingUpdatedAt, staleConnection.updatedAt)) >= 14) AS staleClients,
        (SELECT COUNT(*) FROM transactions underContract WHERE underContract.agentId = agent.id AND underContract.status = 'under_contract') AS underContractUnits,
        (SELECT COALESCE(SUM(underContract.purchasePrice), 0) FROM transactions underContract WHERE underContract.agentId = agent.id AND underContract.status = 'under_contract') AS underContractVolume,
        annualGoal.closingsTarget AS annualClosingsGoal, annualGoal.gciTarget AS annualGciGoal
      FROM users agent
      LEFT JOIN market_profiles market ON market.id = agent.marketProfileId
      LEFT JOIN agent_goals annualGoal ON annualGoal.agentId = agent.id AND annualGoal.year = ${currentYear} AND annualGoal.month = 0
      WHERE agent.role = 'agent' AND agent.isActive = 1
        ${filters.agentId ? sql`AND agent.id = ${filters.agentId}` : sql``}
        ${filters.marketProfileId ? sql`AND ${agentInMarket(sql`agent.id`, filters.marketProfileId)}` : sql``}
      ORDER BY units90 DESC, gci90 DESC, activeClients DESC LIMIT 30`)
    : Promise.resolve(null);

  const marketPromise = access.markets && access.financial
    ? db.execute(sql`SELECT market.id, market.name, market.state, market.annualGciGoal,
        COUNT(DISTINCT CASE WHEN agent.role = 'agent' AND agent.isActive = 1 THEN agent.id END) AS activeAgents,
        COUNT(DISTINCT CASE WHEN closed90.id IS NOT NULL THEN closed90.agentId END) AS productiveAgents,
        COUNT(DISTINCT underContract.id) AS underContractUnits,
        COALESCE(SUM(DISTINCT underContract.purchasePrice), 0) AS underContractVolume,
        COUNT(DISTINCT closedPeriod.id) AS closedUnits,
        COALESCE(SUM(DISTINCT closedPeriod.purchasePrice), 0) AS closedVolume,
        COALESCE(SUM(DISTINCT closedPeriod.grossCommissionIncome), 0) AS closedGci,
        MAX(capacity.maxLeadCapacity) AS configuredCapacity,
        MAX(capacity.currentLeadCount) AS configuredLeadCount
      FROM market_profiles market
      LEFT JOIN market_agent_assignments marketAssignment ON marketAssignment.marketProfileId = market.id
      LEFT JOIN users agent ON agent.id = marketAssignment.agentId
      LEFT JOIN transactions closed90 ON closed90.agentId = agent.id AND closed90.status = 'closed' AND closed90.closingDate >= DATE_SUB(${now}, INTERVAL 90 DAY)
      LEFT JOIN transactions underContract ON underContract.agentId = agent.id AND underContract.status = 'under_contract'
      LEFT JOIN transactions closedPeriod ON closedPeriod.agentId = agent.id AND closedPeriod.status = 'closed' AND closedPeriod.closingDate >= ${filters.dateFrom} AND closedPeriod.closingDate <= ${filters.dateTo}
      LEFT JOIN market_agent_assignments capacity ON capacity.marketProfileId = market.id AND capacity.agentId = agent.id
      WHERE market.status = 'active' ${filters.marketProfileId ? sql`AND market.id = ${filters.marketProfileId}` : sql``}
      GROUP BY market.id, market.name, market.state, market.annualGciGoal
      ORDER BY closedGci DESC, activeAgents DESC LIMIT 25`)
    : Promise.resolve(null);

  const isaPromise = access.users && access.contacts
    ? db.execute(sql`SELECT isa.id, isa.name,
        COUNT(DISTINCT contact.id) AS assignedLeads,
        COUNT(DISTINCT CASE WHEN connection.appointmentSet = 1 THEN contact.id END) AS appointmentsSet,
        COUNT(DISTINCT CASE WHEN connection.pipelineStatus NOT IN ('closed', 'dead', 'do_not_contact') THEN connection.id END) AS activeConnections,
        COUNT(DISTINCT CASE WHEN connection.pipelineStatus = 'active_client' AND DATEDIFF(${now}, COALESCE(connection.agingUpdatedAt, connection.updatedAt)) >= ${configuredPipelineStaleDays} THEN connection.id END) AS staleActiveClients,
        COUNT(DISTINCT closedTransaction.id) AS closedUnitsInfluenced
      FROM users isa
      LEFT JOIN contacts contact ON contact.assignedIsaId = isa.id AND ${contactScope(filters, true)}
      LEFT JOIN agent_connections connection ON connection.contactId = contact.id
      LEFT JOIN transactions closedTransaction ON closedTransaction.primaryContactId = contact.id AND closedTransaction.status = 'closed' AND closedTransaction.closingDate >= ${filters.dateFrom} AND closedTransaction.closingDate <= ${filters.dateTo}
      WHERE isa.role = 'isa' AND isa.isActive = 1 ${filters.isaId ? sql`AND isa.id = ${filters.isaId}` : sql``}
      GROUP BY isa.id, isa.name ORDER BY closedUnitsInfluenced DESC, appointmentsSet DESC, assignedLeads DESC`)
    : Promise.resolve(null);

  const taskPromise = access.tasks
    ? db.execute(sql`SELECT task.id, task.title, task.priority, task.dueDate, owner.name AS ownerName,
        task.relatedTransactionId, task.relatedContactId, task.relatedAgentConnectionId, relatedTransaction.purchasePrice AS transactionValue
      FROM tasks task
      LEFT JOIN users owner ON owner.id = task.assignedToId
      LEFT JOIN transactions relatedTransaction ON relatedTransaction.id = task.relatedTransactionId
      WHERE task.status IN ('pending', 'in_progress') AND task.dueDate IS NOT NULL AND task.dueDate < ${now}
        ${filters.agentId ? sql`AND (relatedTransaction.agentId = ${filters.agentId} OR task.assignedToId = ${filters.agentId})` : sql``}
        ${filters.marketProfileId ? sql`AND ${agentInMarket(sql`relatedTransaction.agentId`, filters.marketProfileId)}` : sql``}
      ORDER BY FIELD(task.priority, 'urgent', 'high', 'medium', 'low'), task.dueDate ASC LIMIT 30`)
    : Promise.resolve(null);

  const transactionRiskPromise = access.financial || access.tasks
    ? db.execute(sql`SELECT t.id, t.transactionNumber, t.closingDate, t.contractDate, t.purchasePrice, t.grossCommissionIncome,
        t.payoutIntegrityFlag, t.transactionType, owner.name AS ownerName,
        CONCAT(contact.firstName, ' ', contact.lastName) AS clientName,
        SUM(CASE WHEN task.status IN ('pending', 'in_progress') AND task.dueDate < ${now} THEN 1 ELSE 0 END) AS overdueTaskCount
      FROM transactions t
      LEFT JOIN users owner ON owner.id = t.agentId
      LEFT JOIN contacts contact ON contact.id = t.primaryContactId
      LEFT JOIN tasks task ON task.relatedTransactionId = t.id
      WHERE ${activeContractScope}
      GROUP BY t.id, t.transactionNumber, t.closingDate, t.contractDate, t.purchasePrice, t.grossCommissionIncome, t.payoutIntegrityFlag, t.transactionType, owner.name, contact.firstName, contact.lastName
      ORDER BY t.closingDate ASC LIMIT 60`)
    : Promise.resolve(null);

  const staleConnectionPromise = access.pipeline
    ? db.execute(sql`SELECT connection.id, connection.pipelineStatus, connection.followUpDate,
        DATEDIFF(${now}, COALESCE(connection.agingUpdatedAt, connection.updatedAt)) AS ageDays,
        agent.name AS ownerName, CONCAT(contact.firstName, ' ', contact.lastName) AS contactName
      FROM agent_connections connection
      LEFT JOIN contacts contact ON contact.id = connection.contactId
      LEFT JOIN users agent ON agent.id = connection.agentId
      WHERE ${connectionCurrentScope}
        AND ((connection.pipelineStatus = 'new_lead' AND TIMESTAMPDIFF(HOUR, COALESCE(connection.agingUpdatedAt, connection.updatedAt), ${now}) >= ${configuredNewLeadSlaHours})
          OR (connection.pipelineStatus = 'active_client' AND DATEDIFF(${now}, COALESCE(connection.agingUpdatedAt, connection.updatedAt)) >= ${configuredPipelineStaleDays}))
      ORDER BY ageDays DESC LIMIT 30`)
    : Promise.resolve(null);

  const qualityPromise = access.contacts || access.financial
    ? db.execute(sql`SELECT
        (SELECT COUNT(*) FROM contacts contact WHERE ${contactScope(filters, true)} AND contact.leadSourceId IS NULL) AS missingLeadSource,
        (SELECT COUNT(*) FROM contacts contact WHERE ${contactScope(filters, true)} AND (contact.phone IS NULL OR contact.phone = '') AND (contact.email IS NULL OR contact.email = '')) AS missingContactMethod,
        (SELECT COUNT(*) FROM contacts contact WHERE ${contactScope(filters, true)} AND contact.assignedIsaId IS NULL) AS missingIsaAssignment,
        (SELECT COUNT(*) FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId WHERE ${activeContractScope} AND t.closingDate IS NULL) AS missingClosingDate,
        (SELECT COUNT(*) FROM transactions t LEFT JOIN users owner ON owner.id = t.agentId LEFT JOIN contacts contact ON contact.id = t.primaryContactId WHERE ${activeContractScope} AND (t.purchasePrice IS NULL OR t.grossCommissionIncome IS NULL)) AS missingFinancialFields`)
    : Promise.resolve(null);

  const [reviews, financialResult, futureResult, pipelineResult, sourceResult, agentResult, marketResult, isaResult, taskResult, riskResult, staleResult, qualityResult] = await Promise.all([
    reviewPromise,
    financialPromise,
    futureProductionPromise,
    pipelinePromise,
    sourcePromise,
    agentPromise,
    marketPromise,
    isaPromise,
    taskPromise,
    transactionRiskPromise,
    staleConnectionPromise,
    qualityPromise,
  ]);

  const currentClosed = financialResult ? toMetric(rows<QueryRow>(financialResult[0])[0]) : null;
  const priorClosed = financialResult ? toMetric(rows<QueryRow>(financialResult[1])[0]) : null;
  const activeContracts = financialResult ? toMetric(rows<QueryRow>(financialResult[2])[0]) : null;
  const trend = financialResult ? rows<QueryRow>(financialResult[3]).map((row) => ({
    period: String(row.period),
    closedUnits: number(row.closedUnits),
    closedVolume: number(row.closedVolume),
    closedGci: number(row.closedGci),
    underContractUnits: number(row.underContractUnits),
    underContractVolume: number(row.underContractVolume),
    underContractGci: number(row.underContractGci),
  })) : [];
  const future = futureResult ? {
    days30: toMetric(rows<QueryRow>(futureResult[0])[0]),
    days60: toMetric(rows<QueryRow>(futureResult[1])[0]),
    days90: toMetric(rows<QueryRow>(futureResult[2])[0]),
    closings: rows<QueryRow>(futureResult[3]).map((row) => ({
      ...row,
      id: number(row.id),
      purchasePrice: nullableNumber(row.purchasePrice),
      grossCommissionIncome: nullableNumber(row.grossCommissionIncome),
      overdueTaskCount: number(row.overdueTaskCount),
    })),
  } : null;

  const settingValues = settings ? {
    goalYear: settings.goalYear,
    companyGciGoal: nullableNumber(settings.companyGciGoal),
    companyVolumeGoal: nullableNumber(settings.companyVolumeGoal),
    companyUnitsGoal: settings.companyUnitsGoal ?? null,
    newLeadSlaHours: settings.newLeadSlaHours,
    pipelineStaleDays: settings.pipelineStaleDays,
  } : {
    goalYear: currentYear,
    companyGciGoal: null,
    companyVolumeGoal: null,
    companyUnitsGoal: null,
    newLeadSlaHours: 24,
    pipelineStaleDays: 14,
  };

  const pipeline = pipelineResult ? {
    cohort: rows<QueryRow>(pipelineResult[0]).map((row) => ({
      stage: String(row.stage), count: number(row.count), averageAgeDays: number(row.averageAgeDays), staleCount: number(row.staleCount),
    })),
    current: rows<QueryRow>(pipelineResult[1]).map((row) => ({
      stage: String(row.stage), count: number(row.count), averageAgeDays: number(row.averageAgeDays), staleCount: number(row.staleCount),
    })),
  } : null;

  const sources = sourceResult ? rows<QueryRow>(sourceResult).map((row) => {
    const leads = number(row.leads);
    const closedUnits = number(row.closedUnits);
    const closedGci = number(row.closedGci);
    return {
      id: number(row.id), name: String(row.name ?? "Unattributed"), leads, closedUnits,
      closedVolume: number(row.closedVolume), closedGci,
      closeRate: leads ? (closedUnits / leads) * 100 : null,
      gciPerLead: leads ? closedGci / leads : null,
    };
  }) : [];

  const agents = agentResult ? rows<QueryRow>(agentResult).map((row) => {
    const units90 = number(row.units90);
    const annualGoal = nullableNumber(row.annualClosingsGoal);
    const annualPace = annualGoal ? (units90 / 90) * 365 / annualGoal * 100 : null;
    return {
      id: number(row.id), name: String(row.name ?? "Unknown"), marketName: row.marketName ? String(row.marketName) : null,
      units30: number(row.units30), units60: number(row.units60), units90, gci90: number(row.gci90),
      activeClients: number(row.activeClients), staleClients: number(row.staleClients),
      underContractUnits: number(row.underContractUnits), underContractVolume: number(row.underContractVolume),
      annualClosingsGoal: annualGoal, annualGciGoal: nullableNumber(row.annualGciGoal), annualPace,
      health: units90 >= 3 && number(row.staleClients) === 0 ? "on_pace" : units90 >= 3 ? "watch" : units90 > 0 ? "needs_coaching" : "at_risk",
    };
  }) : [];

  const markets = marketResult ? rows<QueryRow>(marketResult).map((row) => {
    const capacity = nullableNumber(row.configuredCapacity);
    const leadCount = nullableNumber(row.configuredLeadCount);
    const activeAgents = number(row.activeAgents);
    const closedGci = number(row.closedGci);
    const annualGoal = nullableNumber(row.annualGciGoal);
    return {
      id: number(row.id), name: String(row.name), state: String(row.state), activeAgents,
      productiveAgents: number(row.productiveAgents), underContractUnits: number(row.underContractUnits),
      underContractVolume: number(row.underContractVolume), closedUnits: number(row.closedUnits),
      closedVolume: number(row.closedVolume), closedGci, annualGciGoal: annualGoal,
      goalPercent: annualGoal ? (closedGci / annualGoal) * 100 : null,
      configuredCapacity: capacity, configuredLeadCount: leadCount,
      capacityStatus: capacity === null || leadCount === null ? "not_configured" : leadCount >= capacity ? "capacity_constrained" : "available",
    };
  }) : [];

  const isas = isaResult ? rows<QueryRow>(isaResult).map((row) => ({
    id: number(row.id), name: String(row.name ?? "Unknown"), assignedLeads: number(row.assignedLeads),
    appointmentsSet: number(row.appointmentsSet), activeConnections: number(row.activeConnections),
    staleActiveClients: number(row.staleActiveClients), closedUnitsInfluenced: number(row.closedUnitsInfluenced),
  })) : [];

  const tasks: Array<QueryRow & { id: number; transactionValue: number | null }> = taskResult
    ? rows<QueryRow>(taskResult).map((row) => ({
      ...row, id: number(row.id), transactionValue: nullableNumber(row.transactionValue),
    }))
    : [];
  const transactionRisks: Array<QueryRow & { id: number; purchasePrice: number | null; grossCommissionIncome: number | null; overdueTaskCount: number }> = riskResult
    ? rows<QueryRow>(riskResult).map((row) => ({
      ...row,
      id: number(row.id), purchasePrice: nullableNumber(row.purchasePrice), grossCommissionIncome: nullableNumber(row.grossCommissionIncome),
      overdueTaskCount: number(row.overdueTaskCount),
    }))
    : [];
  const staleConnections: Array<QueryRow & { id: number; ageDays: number }> = staleResult
    ? rows<QueryRow>(staleResult).map((row) => ({ ...row, id: number(row.id), ageDays: number(row.ageDays) }))
    : [];
  const quality = qualityResult ? rows<QueryRow>(qualityResult)[0] : null;

  const rawAlerts: Array<{
    alertKey: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
    owner: string | null;
    age: string;
    estimatedImpact: number | null;
    actionLabel: string;
    actionUrl: string;
  }> = [];

  for (const transaction of transactionRisks) {
    const issues: string[] = [];
    if (!transaction.closingDate) issues.push("missing closing date");
    if (!transaction.purchasePrice) issues.push("missing sales volume");
    if (!transaction.grossCommissionIncome) issues.push("missing GCI");
    if (Boolean(transaction.payoutIntegrityFlag)) issues.push("commission integrity flag");
    if (transaction.overdueTaskCount > 0) issues.push(`${transaction.overdueTaskCount} overdue transaction task${transaction.overdueTaskCount === 1 ? "" : "s"}`);
    const closesSoon = transaction.closingDate && new Date(String(transaction.closingDate)).getTime() <= next7.getTime();
    if (issues.length || closesSoon) {
      rawAlerts.push({
        alertKey: `transaction:${transaction.id}:operations`,
        severity: issues.length || closesSoon ? "high" : "medium",
        title: `Transaction ${transaction.transactionNumber ?? `#${transaction.id}`} needs operational review`,
        detail: issues.length ? issues.join(" · ") : "Closing within 7 days",
        owner: transaction.ownerName ? String(transaction.ownerName) : null,
        age: transaction.closingDate ? `Closing ${new Date(String(transaction.closingDate)).toLocaleDateString()}` : "Closing date missing",
        estimatedImpact: transaction.purchasePrice,
        actionLabel: "Review transaction",
        actionUrl: `/transactions/${transaction.id}`,
      });
    }
  }

  for (const task of tasks) {
    const dueDate = task.dueDate ? new Date(String(task.dueDate)) : now;
    const daysOverdue = Math.max(1, Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000));
    rawAlerts.push({
      alertKey: `task:${task.id}:overdue`,
      severity: task.priority === "urgent" || task.priority === "high" ? "high" : "medium",
      title: String(task.title),
      detail: "Overdue operational task",
      owner: task.ownerName ? String(task.ownerName) : null,
      age: `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`,
      estimatedImpact: nullableNumber(task.transactionValue),
      actionLabel: "Open task",
      actionUrl: `/tasks/${task.id}`,
    });
  }

  for (const connection of staleConnections) {
    const isNewLead = connection.pipelineStatus === "new_lead";
    rawAlerts.push({
      alertKey: `connection:${connection.id}:${isNewLead ? "new-lead-sla" : "stale-client"}`,
      severity: isNewLead ? "medium" : "high",
      title: isNewLead ? `${connection.contactName ?? "Lead"} has not been worked within SLA` : `${connection.contactName ?? "Client"} is stale in active client stage`,
      detail: isNewLead ? "New lead connection has no qualifying activity in the configured SLA window" : "Active client has no qualifying activity within the configured aging threshold",
      owner: connection.ownerName ? String(connection.ownerName) : null,
      age: `${connection.ageDays} day${connection.ageDays === 1 ? "" : "s"} without qualifying activity`,
      estimatedImpact: null,
      actionLabel: "Open pipeline",
      actionUrl: "/pipeline",
    });
  }

  const reviewByKey = new Map(reviews.map((review) => [review.alertKey, review]));
  const alerts = rawAlerts
    .filter((alert) => {
      const review = reviewByKey.get(alert.alertKey);
      if (!review) return true;
      if (review.status === "reviewed") return false;
      return !review.snoozedUntil || review.snoozedUntil.getTime() <= now.getTime();
    })
    .sort((a, b) => alertSeverityRank(b.severity) - alertSeverityRank(a.severity) || (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0))
    .slice(0, 40);

  const insights: Array<{
    id: string;
    kind: "win" | "risk" | "opportunity" | "data_quality";
    title: string;
    metric: string;
    context: string;
    whyItMatters: string;
    recommendedAction: string;
    actionUrl: string;
  }> = [];

  if (currentClosed && priorClosed) {
    const gciChange = percentage(currentClosed.gci, priorClosed.gci);
    if (gciChange !== null && gciChange <= -20) {
      insights.push({
        id: "gci-decline", kind: "risk", title: "Closed GCI is down versus the prior equivalent period",
        metric: `${gciChange.toFixed(0)}% change`, context: `${currentClosed.gci.toLocaleString()} current versus ${priorClosed.gci.toLocaleString()} prior`,
        whyItMatters: "Closed GCI is a lagging revenue outcome and a material decline can widen the annual goal gap.",
        recommendedAction: "Review active contracts and near-term scheduled closings for recoverable production.", actionUrl: "/transaction-reporting",
      });
    } else if (gciChange !== null && gciChange >= 20) {
      insights.push({
        id: "gci-growth", kind: "win", title: "Closed GCI improved versus the prior equivalent period",
        metric: `${gciChange.toFixed(0)}% change`, context: `${currentClosed.gci.toLocaleString()} current versus ${priorClosed.gci.toLocaleString()} prior`,
        whyItMatters: "The selected period has materially stronger realized revenue than its matched comparison.",
        recommendedAction: "Identify the markets and sources behind the gain before reallocating lead capacity.", actionUrl: "/transaction-reporting",
      });
    }
  }
  if (alerts.filter((alert) => alert.severity === "high").length > 0) {
    insights.push({
      id: "high-risk-queue", kind: "risk", title: `${alerts.filter((alert) => alert.severity === "high").length} high-priority operational items need review`,
      metric: "High-severity action queue", context: "Transaction completeness, closing readiness, and overdue work are ranked by operational urgency.",
      whyItMatters: "Incomplete near-term transactions and overdue operational work can delay closings or weaken reporting integrity.",
      recommendedAction: "Work the high-priority queue before reviewing lower-severity backlog.", actionUrl: "#needs-attention",
    });
  }
  if (!settingValues.companyGciGoal || !settingValues.companyVolumeGoal || !settingValues.companyUnitsGoal) {
    insights.push({
      id: "company-goals-missing", kind: "data_quality", title: "Company goal coverage is incomplete",
      metric: "Goal not configured", context: "One or more annual company targets for GCI, volume, or units has not been configured.",
      whyItMatters: "Without company targets, leadership cannot see an accurate gap-to-goal or pace status.",
      recommendedAction: "Set annual command-center goals and operating thresholds.", actionUrl: "#goal-settings",
    });
  }
  if (quality && number(quality.missingLeadSource) > 0) {
    insights.push({
      id: "source-attribution-gap", kind: "data_quality", title: "Lead source attribution needs cleanup",
      metric: `${number(quality.missingLeadSource)} contacts without lead source`, context: "Counts are limited to unarchived contacts created in the selected period.",
      whyItMatters: "Missing attribution reduces confidence in source-level revenue and conversion analysis.",
      recommendedAction: "Assign the correct source to the affected contacts before evaluating partner quality.", actionUrl: "/contacts",
    });
  }
  const topSource = sources.find((source) => source.leads >= 5 && source.gciPerLead !== null);
  if (topSource) {
    insights.push({
      id: `source-opportunity-${topSource.id}`, kind: "opportunity", title: `${topSource.name} is the strongest measured source by GCI per lead`,
      metric: `$${Math.round(topSource.gciPerLead ?? 0).toLocaleString()} GCI per lead`, context: `${topSource.leads} leads created and ${topSource.closedUnits} closed units in the selected view.`,
      whyItMatters: "Source value should be evaluated on downstream production, not lead volume alone.",
      recommendedAction: "Validate capacity and consider prioritizing this source where quality remains stable.", actionUrl: "/analytics",
    });
  }

  return {
    generatedAt: now,
    filters: {
      ...filters,
      dateFrom: filters.dateFrom.toISOString(),
      dateTo: filters.dateTo.toISOString(),
    },
    access,
    settings: settingValues,
    executive: currentClosed ? {
      closed: currentClosed,
      priorClosed,
      activeContracts,
      goalProgress: {
        gci: goalProgress(currentClosed.gci, settingValues.companyGciGoal, filters),
        volume: goalProgress(currentClosed.volume, settingValues.companyVolumeGoal, filters),
        units: goalProgress(currentClosed.units, settingValues.companyUnitsGoal, filters),
      },
      changes: {
        gci: percentage(currentClosed.gci, priorClosed?.gci ?? 0),
        volume: percentage(currentClosed.volume, priorClosed?.volume ?? 0),
        units: percentage(currentClosed.units, priorClosed?.units ?? 0),
      },
      trend,
    } : null,
    forecast: future,
    pipeline,
    sources,
    agents,
    isas,
    markets,
    transactionHealth: {
      activeContracts: activeContracts?.units ?? 0,
      atRisk: transactionRisks.filter((transaction) => !transaction.closingDate || !transaction.purchasePrice || !transaction.grossCommissionIncome || transaction.overdueTaskCount > 0 || Boolean(transaction.payoutIntegrityFlag)).length,
      records: transactionRisks,
    },
    quality: quality ? {
      missingLeadSource: number(quality.missingLeadSource),
      missingContactMethod: number(quality.missingContactMethod),
      missingIsaAssignment: number(quality.missingIsaAssignment),
      missingClosingDate: number(quality.missingClosingDate),
      missingFinancialFields: number(quality.missingFinancialFields),
    } : null,
    actionQueue: { total: alerts.length, items: alerts },
    insights: insights.slice(0, 6),
    limitations: [
      "Appointment-held, contact-attempt, response-time, and stage-history metrics are omitted because SavvyOS does not have a complete canonical source for them.",
      "The forecast is scheduled under-contract production with recorded closing dates; it is not a prediction of uncontracted pipeline conversion.",
      "ISA and capacity views are limited to the records with configured attribution and capacity assignments.",
    ],
  };
}
