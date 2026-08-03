import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  coachingProfiles,
  coachingSessions,
  coachingCommitments,
  performanceResets,
  performanceResetRequirements,
  performanceResetCheckpoints,
  capacityEscalations,
  coachOutRecommendations,
  coachingAssessments,
  coachingHistorySnapshots,
  coachingSettings,
  users,
  agentGoals,
  transactions,
  agentConnections,
  tasks,
  marketProfiles,
  marketAgentAssignments,
  groups,
  groupMembers,
  agentProfiles,
  userProfiles,
} from "../../drizzle/schema";
import { eq, desc, asc, and, sql, or, inArray, isNull, isNotNull, ne, gte, lte, lt, gt, between, like } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { logActivity } from "../db";
import { invokeLLM } from "../_core/llm";


// ─── Helper: admin or coach guard ────────────────────────────────────────────
function requireAdminOrCoach(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
}

// ─── Helper: get live production stats for an agent ──────────────────────────
async function getAgentProductionStats(db: any, agentId: number) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [prodStats] = await db
    .select({
      trailing90Units: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN ${transactions.id} END)`,
      trailing90Volume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      trailing90GCI: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      trailing30Units: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${thirtyDaysAgo} THEN ${transactions.id} END)`,
      trailing30Volume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${thirtyDaysAgo} THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      ytdUnits: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${yearStart} THEN ${transactions.id} END)`,
      ytdVolume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${yearStart} THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      ytdGCI: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${yearStart} THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      underContractUnits: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
      underContractVolume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'under_contract' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      underContractGCI: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'under_contract' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      terminatedUnits: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'terminated' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN ${transactions.id} END)`,
      terminatedVolume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'terminated' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.agentId, agentId));

  // Lead stats
  const [leadStats] = await db
    .select({
      totalLeads: sql<number>`COUNT(*)`,
      activeLeads: sql<number>`COUNT(CASE WHEN ${agentConnections.pipelineStatus} IN ('new_lead','attempted_contact','nurture','active_client') THEN 1 END)`,
      newLeads30d: sql<number>`COUNT(CASE WHEN ${agentConnections.createdAt} >= ${thirtyDaysAgo} THEN 1 END)`,
      underContractLeads: sql<number>`COUNT(CASE WHEN ${agentConnections.pipelineStatus} = 'under_contract' THEN 1 END)`,
      deadLeads: sql<number>`COUNT(CASE WHEN ${agentConnections.pipelineStatus} = 'dead' THEN 1 END)`,
      avgLeadAgeDays: sql<number>`COALESCE(AVG(DATEDIFF(NOW(), ${agentConnections.createdAt})), 0)`,
      staleLeads: sql<number>`COUNT(CASE WHEN ${agentConnections.pipelineStatus} IN ('new_lead','attempted_contact','nurture','active_client') AND ${agentConnections.agingUpdatedAt} < ${thirtyDaysAgo} THEN 1 END)`,
    })
    .from(agentConnections)
    .where(eq(agentConnections.agentId, agentId));

  // Task stats
  const [taskStats] = await db
    .select({
      totalPendingTasks: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'pending' THEN 1 END)`,
      overdueTasks: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'pending' AND ${tasks.dueDate} < NOW() THEN 1 END)`,
      completedTasks30d: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'completed' AND ${tasks.completedAt} >= ${thirtyDaysAgo} THEN 1 END)`,
    })
    .from(tasks)
    .where(eq(tasks.assignedToId, agentId));

  return {
    ...(prodStats ?? {}),
    ...(leadStats ?? {}),
    ...(taskStats ?? {}),
  };
}

// ─── Helper: get agent goals with progress ──────────────────────────────────
async function getAgentGoalsWithProgress(db: any, agentId: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const goals = await db
    .select()
    .from(agentGoals)
    .where(and(eq(agentGoals.agentId, agentId), eq(agentGoals.year, currentYear)));

  // Get YTD actuals
  const yearStart = new Date(currentYear, 0, 1);
  const [ytdActuals] = await db
    .select({
      ytdClosings: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' THEN ${transactions.id} END)`,
      ytdVolume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      ytdGCI: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.agentId, agentId), gte(transactions.closingDate, yearStart)));

  const annualGoal = goals.find((g: any) => g.month === 0);
  const monthlyGoals = goals.filter((g: any) => g.month > 0);

  return {
    annualGoal: annualGoal ?? null,
    monthlyGoals,
    ytdActuals: ytdActuals ?? { ytdClosings: 0, ytdVolume: 0, ytdGCI: 0 },
    currentMonth,
    currentYear,
  };
}

// ─── Helper: get pipeline data for an agent ─────────────────────────────────
async function getAgentPipelineData(db: any, agentId: number) {
  const pipelineByStatus = await db
    .select({
      status: agentConnections.pipelineStatus,
      count: sql<number>`COUNT(*)`,
    })
    .from(agentConnections)
    .where(eq(agentConnections.agentId, agentId))
    .groupBy(agentConnections.pipelineStatus);

  return {
    pipelineByStatus: Object.fromEntries(pipelineByStatus.map((r: any) => [r.status, Number(r.count)])),
  };
}

// ─── Helper: get coaching history summary for AI context ────────────────────
async function getCoachingHistoryForAI(db: any, agentId: number, limit = 10) {
  const sessions = await db
    .select({
      id: coachingSessions.id,
      sessionDate: coachingSessions.sessionDate,
      sessionType: coachingSessions.sessionType,
      status: coachingSessions.status,
      aiSummary: coachingSessions.aiSummary,
      primaryDiagnosis: coachingSessions.primaryDiagnosis,
      diagnosisEvidence: coachingSessions.diagnosisEvidence,
      sourceNotes: coachingSessions.sourceNotes,
    })
    .from(coachingSessions)
    .where(and(eq(coachingSessions.agentId, agentId), eq(coachingSessions.status, "Completed")))
    .orderBy(desc(coachingSessions.sessionDate))
    .limit(limit);

  const commitments = await db
    .select()
    .from(coachingCommitments)
    .where(eq(coachingCommitments.agentId, agentId))
    .orderBy(desc(coachingCommitments.createdAt))
    .limit(30);

  return { sessions, commitments };
}

// ─── Coaching Router ──────────────────────────────────────────────────────────
export const coachingRouter = router({

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND CENTER — Dashboard with metrics, action queues, and AI brief
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get the full Coaching Command Center data */
  getCommandCenter: protectedProcedure.query(async ({ ctx }) => {
    requireAdminOrCoach(ctx.user.role);
    const db = await getDb();
    if (!db) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ─── Metrics ───────────────────────────────────────────────────────────
    const [
      statusCounts,
      riskCounts,
      diagnosisCounts,
      totalAgents,
      sessionsThisWeek,
      sessionsToday,
      overdueCommitments,
      openCommitmentsCount,
      activeResetsCount,
      openEscalationsCount,
      pendingCoachOuts,
      launchAgents,
      unassignedCoachAgents,
      noSessionIn14Days,
    ] = await Promise.all([
      db.select({ status: coachingProfiles.performanceStatus, count: sql<number>`COUNT(*)` })
        .from(coachingProfiles).groupBy(coachingProfiles.performanceStatus),
      db.select({ risk: coachingProfiles.retentionRiskStatus, count: sql<number>`COUNT(*)` })
        .from(coachingProfiles).groupBy(coachingProfiles.retentionRiskStatus),
      db.select({ diagnosis: coachingProfiles.currentPrimaryDiagnosis, count: sql<number>`COUNT(*)` })
        .from(coachingProfiles).where(isNotNull(coachingProfiles.currentPrimaryDiagnosis)).groupBy(coachingProfiles.currentPrimaryDiagnosis),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingProfiles),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingSessions)
        .where(and(eq(coachingSessions.status, "Scheduled"), gte(coachingSessions.sessionDate, today), lte(coachingSessions.sessionDate, sevenDaysFromNow))),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingSessions)
        .where(and(eq(coachingSessions.status, "Scheduled"), gte(coachingSessions.sessionDate, today), lt(coachingSessions.sessionDate, tomorrow))),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingCommitments)
        .where(and(inArray(coachingCommitments.status, ["Not Started", "In Progress"]), lt(coachingCommitments.dueDate, now))),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingCommitments)
        .where(inArray(coachingCommitments.status, ["Not Started", "In Progress", "AI Suggested"])),
      db.select({ count: sql<number>`COUNT(*)` }).from(performanceResets)
        .where(inArray(performanceResets.status, ["Active", "Improving", "Extension Requested"])),
      db.select({ count: sql<number>`COUNT(*)` }).from(capacityEscalations)
        .where(inArray(capacityEscalations.status, ["Submitted", "Assigned", "In Progress", "Waiting for Information"])),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachOutRecommendations)
        .where(inArray(coachOutRecommendations.status, ["Submitted", "Under Review"])),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingProfiles)
        .where(eq(coachingProfiles.performanceStatus, "Launch")),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingProfiles)
        .where(isNull(coachingProfiles.coachOfRecordId)),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingProfiles)
        .where(and(
          or(isNull(coachingProfiles.nextSessionDate), lt(coachingProfiles.nextSessionDate, fourteenDaysAgo)),
          isNotNull(coachingProfiles.coachOfRecordId),
        )),
    ]);

    // ─── Action Queues ─────────────────────────────────────────────────────
    const coachAlias = aliasedTable(users, "coach");

    // Sessions due today
    const sessionsDueToday = await db
      .select({
        session: coachingSessions,
        agentName: users.name,
        coachName: coachAlias.name,
      })
      .from(coachingSessions)
      .leftJoin(users, eq(coachingSessions.agentId, users.id))
      .leftJoin(coachAlias, eq(coachingSessions.scheduledCoachId, coachAlias.id))
      .where(and(eq(coachingSessions.status, "Scheduled"), gte(coachingSessions.sessionDate, today), lt(coachingSessions.sessionDate, tomorrow)))
      .orderBy(coachingSessions.sessionDate)
      .limit(20);

    // Sessions needing AI processing (completed but no summary)
    const sessionsNeedingProcessing = await db
      .select({
        session: coachingSessions,
        agentName: users.name,
      })
      .from(coachingSessions)
      .leftJoin(users, eq(coachingSessions.agentId, users.id))
      .where(and(
        eq(coachingSessions.status, "Completed"),
        or(eq(coachingSessions.aiProcessingStatus, "None"), isNull(coachingSessions.aiProcessingStatus)),
        or(isNotNull(coachingSessions.sourceNotes), isNotNull(coachingSessions.transcript)),
      ))
      .orderBy(desc(coachingSessions.completedAt))
      .limit(10);

    // AI commitments needing review
    const aiCommitmentsNeedingReview = await db
      .select({
        commitment: coachingCommitments,
        agentName: users.name,
      })
      .from(coachingCommitments)
      .leftJoin(users, eq(coachingCommitments.agentId, users.id))
      .where(eq(coachingCommitments.status, "AI Suggested"))
      .orderBy(desc(coachingCommitments.createdAt))
      .limit(20);

    // Overdue commitments
    const overdueCommitmentsList = await db
      .select({
        commitment: coachingCommitments,
        agentName: users.name,
      })
      .from(coachingCommitments)
      .leftJoin(users, eq(coachingCommitments.agentId, users.id))
      .where(and(
        inArray(coachingCommitments.status, ["Not Started", "In Progress"]),
        lt(coachingCommitments.dueDate, now),
      ))
      .orderBy(asc(coachingCommitments.dueDate))
      .limit(20);

    // Agents needing setup (no coach assigned)
    const agentsNeedingSetup = await db
      .select({
        profile: coachingProfiles,
        agentName: users.name,
      })
      .from(coachingProfiles)
      .leftJoin(users, eq(coachingProfiles.agentId, users.id))
      .where(or(
        eq(coachingProfiles.coachingSetupRequired, true),
        isNull(coachingProfiles.coachOfRecordId),
      ))
      .limit(20);

    // Launch agents at risk
    const launchAtRisk = await db
      .select({
        profile: coachingProfiles,
        agentName: users.name,
      })
      .from(coachingProfiles)
      .leftJoin(users, eq(coachingProfiles.agentId, users.id))
      .where(and(
        eq(coachingProfiles.performanceStatus, "Launch"),
        inArray(coachingProfiles.launchHealthStatus, ["At Risk", "Critical"]),
      ))
      .limit(20);

    // Red/Yellow agents without next session
    const atRiskNoSession = await db
      .select({
        profile: coachingProfiles,
        agentName: users.name,
      })
      .from(coachingProfiles)
      .leftJoin(users, eq(coachingProfiles.agentId, users.id))
      .where(and(
        inArray(coachingProfiles.performanceStatus, ["Red", "Yellow"]),
        or(isNull(coachingProfiles.nextSessionDate), lt(coachingProfiles.nextSessionDate, now)),
      ))
      .limit(20);

    // Elevated/Critical retention risk
    const retentionAlerts = await db
      .select({
        profile: coachingProfiles,
        agentName: users.name,
        coachName: coachAlias.name,
      })
      .from(coachingProfiles)
      .leftJoin(users, eq(coachingProfiles.agentId, users.id))
      .leftJoin(coachAlias, eq(coachingProfiles.coachOfRecordId, coachAlias.id))
      .where(inArray(coachingProfiles.retentionRiskStatus, ["Elevated", "Critical"]))
      .limit(20);

    // Upcoming sessions this week
    const upcomingSessions = await db
      .select({
        session: coachingSessions,
        agentName: users.name,
        coachName: coachAlias.name,
      })
      .from(coachingSessions)
      .leftJoin(users, eq(coachingSessions.agentId, users.id))
      .leftJoin(coachAlias, eq(coachingSessions.scheduledCoachId, coachAlias.id))
      .where(and(eq(coachingSessions.status, "Scheduled"), gte(coachingSessions.sessionDate, today), lte(coachingSessions.sessionDate, sevenDaysFromNow)))
      .orderBy(coachingSessions.sessionDate)
      .limit(30);

    // Performance reset checkpoints due this week
    const checkpointsDueThisWeek = await db
      .select({
        checkpoint: performanceResetCheckpoints,
        resetId: performanceResetCheckpoints.resetId,
      })
      .from(performanceResetCheckpoints)
      .where(and(
        eq(performanceResetCheckpoints.status, "Pending"),
        gte(performanceResetCheckpoints.checkpointDate, today),
        lte(performanceResetCheckpoints.checkpointDate, sevenDaysFromNow),
      ))
      .limit(10);

    return {
      metrics: {
        totalAgents: Number(totalAgents[0]?.count ?? 0),
        statusCounts: Object.fromEntries(statusCounts.map((r: any) => [r.status, Number(r.count)])),
        riskCounts: Object.fromEntries(riskCounts.map((r: any) => [r.risk, Number(r.count)])),
        diagnosisCounts: Object.fromEntries(diagnosisCounts.map((r: any) => [r.diagnosis, Number(r.count)])),
        sessionsThisWeek: Number(sessionsThisWeek[0]?.count ?? 0),
        sessionsToday: Number(sessionsToday[0]?.count ?? 0),
        overdueCommitments: Number(overdueCommitments[0]?.count ?? 0),
        openCommitments: Number(openCommitmentsCount[0]?.count ?? 0),
        activeResets: Number(activeResetsCount[0]?.count ?? 0),
        openEscalations: Number(openEscalationsCount[0]?.count ?? 0),
        pendingCoachOuts: Number(pendingCoachOuts[0]?.count ?? 0),
        launchAgents: Number(launchAgents[0]?.count ?? 0),
        unassignedCoachAgents: Number(unassignedCoachAgents[0]?.count ?? 0),
        noSessionIn14Days: Number(noSessionIn14Days[0]?.count ?? 0),
      },
      actionQueues: {
        sessionsDueToday,
        sessionsNeedingProcessing,
        aiCommitmentsNeedingReview,
        overdueCommitmentsList,
        agentsNeedingSetup,
        launchAtRisk,
        atRiskNoSession,
        retentionAlerts,
        checkpointsDueThisWeek,
      },
      upcomingSessions,
    };
  }),

  /** Generate AI Agent Success Brief for the Command Center */
  generateCommandCenterBrief: protectedProcedure.mutation(async ({ ctx }) => {
    requireAdminOrCoach(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Gather org-level data for AI synthesis
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [orgStats] = await db
      .select({
        totalAgents: sql<number>`COUNT(DISTINCT ${coachingProfiles.agentId})`,
        redAgents: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Red' THEN 1 END)`,
        yellowAgents: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Yellow' THEN 1 END)`,
        greenAgents: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Green' THEN 1 END)`,
        eliteAgents: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Elite' THEN 1 END)`,
        launchAgents: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Launch' THEN 1 END)`,
        criticalRisk: sql<number>`COUNT(CASE WHEN ${coachingProfiles.retentionRiskStatus} = 'Critical' THEN 1 END)`,
        elevatedRisk: sql<number>`COUNT(CASE WHEN ${coachingProfiles.retentionRiskStatus} = 'Elevated' THEN 1 END)`,
      })
      .from(coachingProfiles);

    const recentSessions = await db
      .select({
        count: sql<number>`COUNT(*)`,
        completedCount: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'Completed' THEN 1 END)`,
        noShowCount: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'No Show' THEN 1 END)`,
      })
      .from(coachingSessions)
      .where(gte(coachingSessions.sessionDate, thirtyDaysAgo));

    const [commitmentStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} = 'Completed' THEN 1 END)`,
        missed: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} = 'Missed' THEN 1 END)`,
        overdue: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} IN ('Not Started','In Progress') AND ${coachingCommitments.dueDate} < NOW() THEN 1 END)`,
      })
      .from(coachingCommitments)
      .where(gte(coachingCommitments.createdAt, thirtyDaysAgo));

    const response = await invokeLLM({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are the AI coaching intelligence for Savvy STR Agents. Generate a concise executive brief (3-5 paragraphs) for the coaching leadership team. Focus on: organizational health, key risks, patterns, and recommended priorities for this week. Use the Four-C framework (Commitment, Capability, Cadence, Capacity). Be direct and actionable.`,
        },
        {
          role: "user",
          content: `Organization Stats (last 30 days):
- Total agents: ${orgStats?.totalAgents ?? 0}
- Performance: Red=${orgStats?.redAgents ?? 0}, Yellow=${orgStats?.yellowAgents ?? 0}, Green=${orgStats?.greenAgents ?? 0}, Elite=${orgStats?.eliteAgents ?? 0}, Launch=${orgStats?.launchAgents ?? 0}
- Retention Risk: Critical=${orgStats?.criticalRisk ?? 0}, Elevated=${orgStats?.elevatedRisk ?? 0}
- Sessions (30d): Total=${recentSessions[0]?.count ?? 0}, Completed=${recentSessions[0]?.completedCount ?? 0}, No-Shows=${recentSessions[0]?.noShowCount ?? 0}
- Commitments (30d): Total=${commitmentStats?.total ?? 0}, Completed=${commitmentStats?.completed ?? 0}, Missed=${commitmentStats?.missed ?? 0}, Currently Overdue=${commitmentStats?.overdue ?? 0}

Generate a brief covering: 1) Overall health assessment, 2) Key risks requiring immediate attention, 3) Patterns observed, 4) Recommended coaching priorities this week.`,
        },
      ],
    });

    const brief = response.choices[0]?.message?.content ?? "Unable to generate brief.";
    return { brief, generatedAt: new Date().toISOString() };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT PORTFOLIO — Full roster with comprehensive data
  // ═══════════════════════════════════════════════════════════════════════════

  /** List all agent coaching profiles with live production stats */
  listProfiles: protectedProcedure
    .input(z.object({
      performanceStatus: z.string().optional(),
      retentionRiskStatus: z.string().optional(),
      coachOfRecordId: z.number().optional(),
      diagnosis: z.string().optional(),
      launchHealthStatus: z.string().optional(),
      marketProtectionStatus: z.string().optional(),
      hasActiveReset: z.boolean().optional(),
      search: z.string().optional(),
      sortBy: z.string().default("name"),
      sortDir: z.enum(["asc", "desc"]).default("asc"),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const coachAlias = aliasedTable(users, "coach");

      const conditions: any[] = [eq(users.role, "agent"), sql`users.isActive = 1`];
      if (input?.performanceStatus) conditions.push(eq(coachingProfiles.performanceStatus, input.performanceStatus as any));
      if (input?.retentionRiskStatus) conditions.push(eq(coachingProfiles.retentionRiskStatus, input.retentionRiskStatus as any));
      if (input?.coachOfRecordId) conditions.push(eq(coachingProfiles.coachOfRecordId, input.coachOfRecordId));
      if (input?.diagnosis) conditions.push(eq(coachingProfiles.currentPrimaryDiagnosis, input.diagnosis as any));
      if (input?.launchHealthStatus) conditions.push(eq(coachingProfiles.launchHealthStatus, input.launchHealthStatus as any));
      if (input?.marketProtectionStatus) conditions.push(eq(coachingProfiles.marketProtectionStatus, input.marketProtectionStatus as any));
      if (input?.search) conditions.push(sql`users.name LIKE ${`%${input.search}%`}`);

      const [rows, countRows] = await Promise.all([
        db.select({
          profile: coachingProfiles,
          agent: { id: users.id, name: users.name, email: users.email },
          coach: { id: coachAlias.id, name: coachAlias.name, email: coachAlias.email },
        })
          .from(users)
          .leftJoin(coachingProfiles, eq(coachingProfiles.agentId, users.id))
          .leftJoin(coachAlias, eq(coachingProfiles.coachOfRecordId, coachAlias.id))
          .where(and(...conditions))
          .orderBy(users.name)
          .limit(input?.limit ?? 100)
          .offset(input?.offset ?? 0),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(users)
          .leftJoin(coachingProfiles, eq(coachingProfiles.agentId, users.id))
          .where(and(...conditions)),
      ]);

      return { rows, total: Number(countRows[0]?.count ?? 0) };
    }),

  /** Full portfolio view with all 33 columns of real data */
  listPortfolio: protectedProcedure
    .input(z.object({
      performanceStatus: z.string().optional(),
      retentionRiskStatus: z.string().optional(),
      coachOfRecordId: z.number().optional(),
      diagnosis: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().default(200),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const coachAlias = aliasedTable(users, "coach");
      const conditions: any[] = [eq(users.role, "agent"), sql`users.isActive = 1`];
      if (input?.performanceStatus) conditions.push(eq(coachingProfiles.performanceStatus, input.performanceStatus as any));
      if (input?.retentionRiskStatus) conditions.push(eq(coachingProfiles.retentionRiskStatus, input.retentionRiskStatus as any));
      if (input?.coachOfRecordId) conditions.push(eq(coachingProfiles.coachOfRecordId, input.coachOfRecordId));
      if (input?.diagnosis) conditions.push(eq(coachingProfiles.currentPrimaryDiagnosis, input.diagnosis as any));
      if (input?.search) conditions.push(sql`users.name LIKE ${`%${input.search}%`}`);

      // Get all agent IDs matching filters
      const agentRows = await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .leftJoin(coachingProfiles, eq(coachingProfiles.agentId, users.id))
        .leftJoin(coachAlias, eq(coachingProfiles.coachOfRecordId, coachAlias.id))
        .where(and(...conditions))
        .orderBy(users.name)
        .limit(input?.limit ?? 200)
        .offset(input?.offset ?? 0);

      if (agentRows.length === 0) return { rows: [], total: 0 };
      const agentIds = agentRows.map((a: any) => a.id);

      // Batch: profiles + coach
      const profileRows = await db.select({
        profile: coachingProfiles,
        coach: { id: coachAlias.id, name: coachAlias.name },
      })
        .from(coachingProfiles)
        .leftJoin(coachAlias, eq(coachingProfiles.coachOfRecordId, coachAlias.id))
        .where(inArray(coachingProfiles.agentId, agentIds));

      // Batch: production stats per agent (YTD + T90 + UC)
      const prodRows = await db.select({
        agentId: transactions.agentId,
        ytdUnits: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${yearStart} THEN ${transactions.id} END)`,
        ytdVolume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${yearStart} THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
        ytdGCI: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${yearStart} THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
        t90Units: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN ${transactions.id} END)`,
        t90GCI: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
        ucUnits: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
        ucVolume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'under_contract' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
        termRate: sql<number>`ROUND(COUNT(DISTINCT CASE WHEN ${transactions.status} = 'terminated' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN ${transactions.id} END) * 100.0 / NULLIF(COUNT(DISTINCT CASE WHEN ${transactions.closingDate} >= ${ninetyDaysAgo} THEN ${transactions.id} END), 0), 1)`,
      })
        .from(transactions)
        .where(inArray(transactions.agentId, agentIds))
        .groupBy(transactions.agentId);

      // Batch: lead stats per agent
      const leadRows = await db.select({
        agentId: agentConnections.agentId,
        totalLeads: sql<number>`COUNT(*)`,
        activeLeads: sql<number>`COUNT(CASE WHEN ${agentConnections.pipelineStatus} IN ('new_lead','attempted_contact','nurture','active_client') THEN 1 END)`,
        staleLeads: sql<number>`COUNT(CASE WHEN ${agentConnections.pipelineStatus} IN ('new_lead','attempted_contact','nurture','active_client') AND ${agentConnections.agingUpdatedAt} < ${thirtyDaysAgo} THEN 1 END)`,
        avgLeadAge: sql<number>`COALESCE(ROUND(AVG(DATEDIFF(NOW(), ${agentConnections.createdAt}))), 0)`,
      })
        .from(agentConnections)
        .where(inArray(agentConnections.agentId, agentIds))
        .groupBy(agentConnections.agentId);

      // Batch: overdue tasks per agent
      const taskRows = await db.select({
        agentId: tasks.assignedToId,
        overdueTasks: sql<number>`COUNT(CASE WHEN ${tasks.status} = 'pending' AND ${tasks.dueDate} < NOW() THEN 1 END)`,
      })
        .from(tasks)
        .where(inArray(tasks.assignedToId, agentIds))
        .groupBy(tasks.assignedToId);

      // Batch: goals per agent (annual)
      const goalRows = await db.select({
        agentId: agentGoals.agentId,
        targetUnits: agentGoals.closingsTarget,
      })
        .from(agentGoals)
        .where(and(inArray(agentGoals.agentId, agentIds), eq(agentGoals.year, now.getFullYear()), eq(agentGoals.month, 0)));

      // Batch: commitment completion rate per agent
      const commitRows = await db.select({
        agentId: coachingCommitments.agentId,
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} = 'Completed' THEN 1 END)`,
      })
        .from(coachingCommitments)
        .where(inArray(coachingCommitments.agentId, agentIds))
        .groupBy(coachingCommitments.agentId);

      // Batch: sessions in last 30 days per agent
      const sessionRows = await db.select({
        agentId: coachingSessions.agentId,
        sessions30d: sql<number>`COUNT(CASE WHEN ${coachingSessions.sessionDate} >= ${thirtyDaysAgo} AND ${coachingSessions.status} IN ('Completed','In Progress') THEN 1 END)`,
        lastSessionDate: sql<string>`MAX(CASE WHEN ${coachingSessions.status} IN ('Completed','In Progress') THEN ${coachingSessions.sessionDate} END)`,
      })
        .from(coachingSessions)
        .where(inArray(coachingSessions.agentId, agentIds))
        .groupBy(coachingSessions.agentId);

      // Batch: assessments count per agent
      const assessRows = await db.select({
        agentId: coachingAssessments.agentId,
        count: sql<number>`COUNT(*)`,
      })
        .from(coachingAssessments)
        .where(inArray(coachingAssessments.agentId, agentIds))
        .groupBy(coachingAssessments.agentId);

      // Batch: active resets per agent
      const resetRows = await db.select({
        agentId: performanceResets.agentId,
      })
        .from(performanceResets)
        .where(and(
          inArray(performanceResets.agentId, agentIds),
          inArray(performanceResets.status, ["Active", "Improving", "Extended"]),
        ));

      // Batch: active escalations per agent
      const escalationRows = await db.select({
        agentId: capacityEscalations.agentId,
      })
        .from(capacityEscalations)
        .where(and(
          inArray(capacityEscalations.agentId, agentIds),
          inArray(capacityEscalations.status, ["Submitted", "Assigned", "In Progress", "Waiting for Information"]),
        ));

      // Batch: market assignments per agent (primary market name)
      const marketRows = await db.select({
        agentId: marketAgentAssignments.agentId,
        marketName: marketProfiles.name,
        isPrimary: marketAgentAssignments.isPrimary,
      })
        .from(marketAgentAssignments)
        .innerJoin(marketProfiles, eq(marketAgentAssignments.marketProfileId, marketProfiles.id))
        .where(inArray(marketAgentAssignments.agentId, agentIds));

      // Batch: group membership per agent
      const groupRows = await db.select({
        userId: groupMembers.userId,
        groupName: groups.name,
      })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .where(inArray(groupMembers.userId, agentIds));

      // Build lookup maps
      const profileMap = new Map(profileRows.map((r: any) => [r.profile?.agentId, r]));
      const prodMap = new Map(prodRows.map((r: any) => [r.agentId, r]));
      const leadMap = new Map(leadRows.map((r: any) => [r.agentId, r]));
      const taskMap = new Map(taskRows.map((r: any) => [r.agentId, r]));
      const goalMap = new Map(goalRows.map((r: any) => [r.agentId, r]));
      const commitMap = new Map(commitRows.map((r: any) => [r.agentId, r]));
      const sessionMap = new Map(sessionRows.map((r: any) => [r.agentId, r]));
      const assessMap = new Map(assessRows.map((r: any) => [r.agentId, r]));
      const resetSet = new Set(resetRows.map((r: any) => r.agentId));
      const escalationSet = new Set(escalationRows.map((r: any) => r.agentId));
      const marketMap = new Map<number, string>();
      for (const r of marketRows as any[]) {
        if (r.isPrimary || !marketMap.has(r.agentId)) marketMap.set(r.agentId, r.marketName);
      }
      const groupMap = new Map<number, string>();
      for (const r of groupRows as any[]) {
        groupMap.set(r.userId, r.groupName);
      }

      // Assemble rows
      const assembled = agentRows.map((agent: any) => {
        const pRow = profileMap.get(agent.id);
        const profile = pRow?.profile ?? null;
        const coach = pRow?.coach ?? null;
        const prod = prodMap.get(agent.id);
        const leads = leadMap.get(agent.id);
        const tsk = taskMap.get(agent.id);
        const goal = goalMap.get(agent.id);
        const commit = commitMap.get(agent.id);
        const sess = sessionMap.get(agent.id);
        const assess = assessMap.get(agent.id);

        const ytdUnits = Number(prod?.ytdUnits ?? 0);
        const goalTarget = Number(goal?.targetUnits ?? 0);
        const goalAttainment = goalTarget > 0 ? Math.round((ytdUnits / goalTarget) * 100) : null;
        const commitTotal = Number(commit?.total ?? 0);
        const commitCompleted = Number(commit?.completed ?? 0);
        const commitRate = commitTotal > 0 ? Math.round((commitCompleted / commitTotal) * 100) : null;
        const lastSession = sess?.lastSessionDate ?? null;
        const daysSinceLastSession = lastSession ? Math.round((now.getTime() - new Date(lastSession).getTime()) / (1000 * 60 * 60 * 24)) : null;

        return {
          agent: { id: agent.id, name: agent.name, email: agent.email },
          profile,
          coach,
          market: marketMap.get(agent.id) ?? null,
          group: groupMap.get(agent.id) ?? null,
          ytdUnits,
          ytdVolume: Number(prod?.ytdVolume ?? 0),
          ytdGCI: Number(prod?.ytdGCI ?? 0),
          t90Units: Number(prod?.t90Units ?? 0),
          t90GCI: Number(prod?.t90GCI ?? 0),
          ucUnits: Number(prod?.ucUnits ?? 0),
          ucVolume: Number(prod?.ucVolume ?? 0),
          termRate: Number(prod?.termRate ?? 0),
          totalLeads: Number(leads?.totalLeads ?? 0),
          activeLeads: Number(leads?.activeLeads ?? 0),
          staleLeads: Number(leads?.staleLeads ?? 0),
          avgLeadAge: Number(leads?.avgLeadAge ?? 0),
          overdueTasks: Number(tsk?.overdueTasks ?? 0),
          goalsSet: goalTarget > 0,
          goalAttainment,
          commitRate,
          sessions30d: Number(sess?.sessions30d ?? 0),
          assessmentsUploaded: Number(assess?.count ?? 0),
          resetActive: resetSet.has(agent.id),
          escalationActive: escalationSet.has(agent.id),
          lastSessionDate: lastSession,
          daysSinceLastSession,
        };
      });

      // Count
      const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .leftJoin(coachingProfiles, eq(coachingProfiles.agentId, users.id))
        .where(and(...conditions));

      return { rows: assembled, total: Number(countResult?.count ?? 0) };
    }),


  // ═══════════════════════════════════════════════════════════════════════════
  // INDIVIDUAL AGENT — Full coaching intelligence page
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get a single agent's full coaching profile with all intelligence */
  getProfile: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const coachAlias = aliasedTable(users, "coach");
      const nextCoachAlias = aliasedTable(users, "nextCoach");

      const [row] = await db
        .select({
          profile: coachingProfiles,
          agent: { id: users.id, name: users.name, email: users.email },
          coach: { id: coachAlias.id, name: coachAlias.name, email: coachAlias.email },
          nextCoach: { id: nextCoachAlias.id, name: nextCoachAlias.name, email: nextCoachAlias.email },
        })
        .from(users)
        .leftJoin(coachingProfiles, eq(coachingProfiles.agentId, users.id))
        .leftJoin(coachAlias, eq(coachingProfiles.coachOfRecordId, coachAlias.id))
        .leftJoin(nextCoachAlias, eq(coachingProfiles.nextSessionCoachId, nextCoachAlias.id))
        .where(eq(users.id, input.agentId));

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const typedRow = row as any;

      // Get live production stats
      const prodStats = await getAgentProductionStats(db, input.agentId);

      // Get goals with progress
      const goalsData = await getAgentGoalsWithProgress(db, input.agentId);

      // Get pipeline data
      const pipelineData = await getAgentPipelineData(db, input.agentId);

      // Get recent sessions
      const recentSessions = await db
        .select()
        .from(coachingSessions)
        .where(eq(coachingSessions.agentId, input.agentId))
        .orderBy(desc(coachingSessions.sessionDate))
        .limit(10);

      // Get open commitments
      const openCommitments = await db
        .select()
        .from(coachingCommitments)
        .where(and(
          eq(coachingCommitments.agentId, input.agentId),
          inArray(coachingCommitments.status, ["Not Started", "In Progress", "Submitted for Verification", "AI Suggested"]),
        ))
        .orderBy(coachingCommitments.dueDate)
        .limit(20);

      // Get commitment stats
      const [commitmentStats] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} = 'Completed' THEN 1 END)`,
          missed: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} = 'Missed' THEN 1 END)`,
          overdue: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} IN ('Not Started','In Progress') AND ${coachingCommitments.dueDate} < NOW() THEN 1 END)`,
          repeated: sql<number>`COUNT(CASE WHEN ${coachingCommitments.isRepeated} = 1 THEN 1 END)`,
        })
        .from(coachingCommitments)
        .where(eq(coachingCommitments.agentId, input.agentId));

      // Get active performance reset
      const [activeReset] = await db
        .select()
        .from(performanceResets)
        .where(and(
          eq(performanceResets.agentId, input.agentId),
          inArray(performanceResets.status, ["Active", "Improving", "Extension Requested", "Extended"]),
        ))
        .limit(1);

      // Get market assignments
      const marketAssignments = await db
        .select({
          assignment: marketAgentAssignments,
          market: { id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state, status: marketProfiles.status },
        })
        .from(marketAgentAssignments)
        .leftJoin(marketProfiles, eq(marketAgentAssignments.marketProfileId, marketProfiles.id))
        .where(eq(marketAgentAssignments.agentId, input.agentId));

      // Get assessments
      const assessments = await db
        .select()
        .from(coachingAssessments)
        .where(eq(coachingAssessments.agentId, input.agentId))
        .orderBy(desc(coachingAssessments.assessmentDate));

      // Session stats
      const [sessionStats] = await db
        .select({
          totalSessions: sql<number>`COUNT(*)`,
          completedSessions: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'Completed' THEN 1 END)`,
          noShowSessions: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'No Show' THEN 1 END)`,
          canceledSessions: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'Canceled' THEN 1 END)`,
        })
        .from(coachingSessions)
        .where(eq(coachingSessions.agentId, input.agentId));

      return {
        profile: typedRow.profile,
        agent: typedRow.agent,
        coach: typedRow.coach,
        nextCoach: typedRow.nextCoach,
        prodStats,
        goalsData,
        pipelineData,
        recentSessions,
        openCommitments,
        commitmentStats: commitmentStats ?? { total: 0, completed: 0, missed: 0, overdue: 0, repeated: 0 },
        activeReset: activeReset ?? null,
        marketAssignments,
        assessments,
        sessionStats: sessionStats ?? { totalSessions: 0, completedSessions: 0, noShowSessions: 0, canceledSessions: 0 },
      };
    }),

  /** Generate AI Coaching Insights for an individual agent */
    generateAgentInsights: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // ─── Gather comprehensive agent data for AI synthesis ───────────────
      const [agentRow] = await db.select({ name: users.name, email: users.email, marketProfileId: users.marketProfileId, commissionSplit: users.commissionSplit, createdAt: users.createdAt }).from(users).where(eq(users.id, input.agentId));
      const agentName = agentRow?.name ?? "Unknown Agent";
      const prodStats = await getAgentProductionStats(db, input.agentId);
      const goalsData = await getAgentGoalsWithProgress(db, input.agentId);
      const pipelineData = await getAgentPipelineData(db, input.agentId);
      const history = await getCoachingHistoryForAI(db, input.agentId);

      // ─── Company Benchmarks (avg/median across all agents) ─────────────
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const [companyBenchmarks] = await db.select({
        avgYtdUnits: sql<number>`AVG(sub.ytd_units)`,
        avgYtdVolume: sql<number>`AVG(sub.ytd_vol)`,
        avgYtdGCI: sql<number>`AVG(sub.ytd_gci)`,
        totalAgents: sql<number>`COUNT(*)`,
      }).from(sql`(SELECT t.agentId, COUNT(DISTINCT CASE WHEN t.status='closed' AND t.closingDate >= ${yearStart} THEN t.id END) as ytd_units, COALESCE(SUM(CASE WHEN t.status='closed' AND t.closingDate >= ${yearStart} THEN t.purchasePrice ELSE 0 END),0) as ytd_vol, COALESCE(SUM(CASE WHEN t.status='closed' AND t.closingDate >= ${yearStart} THEN t.grossCommissionIncome ELSE 0 END),0) as ytd_gci FROM ${transactions} t JOIN ${users} u ON u.id = t.agentId WHERE u.role='agent' AND u.isActive=1 GROUP BY t.agentId) as sub`);

      // ─── Market & Group Context ────────────────────────────────────────
      let marketName = "Not Assigned";
      let groupName = "Not in Group";
      let groupLeaderName = "N/A";
      if (agentRow?.marketProfileId) {
        const [mkt] = await db.select({ name: marketProfiles.name }).from(marketProfiles).where(eq(marketProfiles.id, agentRow.marketProfileId));
        if (mkt) marketName = mkt.name;
      }
      const [grpMembership] = await db.select({ groupId: groupMembers.groupId }).from(groupMembers).where(eq(groupMembers.userId, input.agentId));
      if (grpMembership) {
        const [grp] = await db.select({ name: groups.name, leaderId: groups.leaderId }).from(groups).where(eq(groups.id, grpMembership.groupId));
        if (grp) {
          groupName = grp.name;
          if (grp.leaderId) {
            const [leader] = await db.select({ name: users.name }).from(users).where(eq(users.id, grp.leaderId));
            if (leader) groupLeaderName = leader.name ?? "Unknown";
          }
        }
      }

      // ─── Agent Profile Context (start date, tenure) ────────────────────
      const [agentProfile] = await db.select({ startDateWithSavvy: agentProfiles.startDateWithSavvy }).from(agentProfiles).where(eq(agentProfiles.userId, input.agentId));
      const [userProfile] = await db.select({ onboardedDate: userProfiles.onboardedDate }).from(userProfiles).where(eq(userProfiles.userId, input.agentId));
      const startDate = agentProfile?.startDateWithSavvy ?? userProfile?.onboardedDate ?? agentRow?.createdAt;
      const tenureDays = startDate ? Math.floor((now.getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) : null;

      // ─── Termination Details ───────────────────────────────────────────
      const terminations = await db.select({ terminationReason: transactions.terminationReason, closingDate: transactions.closingDate, purchasePrice: transactions.purchasePrice }).from(transactions).where(and(eq(transactions.agentId, input.agentId), eq(transactions.status, "terminated"))).orderBy(desc(transactions.closingDate)).limit(10);

      // ─── Assessments ───────────────────────────────────────────────────
      const assessments = await db
        .select({ assessmentType: coachingAssessments.assessmentType, preferredCoachingStyle: coachingAssessments.preferredCoachingStyle, communicationStyle: coachingAssessments.communicationStyle, motivators: coachingAssessments.motivators, stressBehaviors: coachingAssessments.stressBehaviors, decisionMakingStyle: coachingAssessments.decisionMakingStyle, accountabilityPreferences: coachingAssessments.accountabilityPreferences, likelyStrengths: coachingAssessments.likelyStrengths, likelyBlindSpots: coachingAssessments.likelyBlindSpots })
        .from(coachingAssessments)
        .where(eq(coachingAssessments.agentId, input.agentId))
        .limit(5);
      // Get profile for current status
      const [profile] = await db.select().from(coachingProfiles).where(eq(coachingProfiles.agentId, input.agentId));

      const sessionSummaries = history.sessions.map((s: any) =>
        `[${s.sessionDate ? new Date(s.sessionDate).toLocaleDateString() : 'N/A'}] ${s.sessionType} - Diagnosis: ${s.primaryDiagnosis ?? 'None'} - ${s.aiSummary ? s.aiSummary.substring(0, 300) : (s.sourceNotes ? s.sourceNotes.substring(0, 200) : 'No notes')}`
      ).join("\n");

      const commitmentSummary = history.commitments.map((c: any) =>
        `[${c.status}] ${c.description} (Due: ${c.dueDate ? new Date(c.dueDate).toLocaleDateString() : 'N/A'}) ${c.isRepeated ? '⚠️ REPEATED' : ''}`
      ).join("\n");

            // ─── Build comprehensive context for AI ─────────────────────────────
      const terminationSummary = terminations.length > 0
        ? terminations.map((t: any) => `$${Number(t.purchasePrice ?? 0).toLocaleString()} - ${t.terminationReason ?? 'No reason given'}`).join("; ")
        : "None";
      const benchmarkContext = companyBenchmarks
        ? `Company Avg YTD: ${Math.round(Number(companyBenchmarks.avgYtdUnits ?? 0))} units, $${Math.round(Number(companyBenchmarks.avgYtdVolume ?? 0)).toLocaleString()} volume, $${Math.round(Number(companyBenchmarks.avgYtdGCI ?? 0)).toLocaleString()} GCI (across ${companyBenchmarks.totalAgents} active agents)`
        : "Benchmarks unavailable";

      const response = await invokeLLM({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert real estate coaching analyst for Savvy STR Agents. Generate comprehensive coaching insights using the Four-C Diagnosis Framework:
- COMMITMENT: Agent's dedication, follow-through on commitments, consistency of effort
- CAPABILITY: Skills, knowledge, market expertise, ability to execute
- CADENCE: Activity levels, lead follow-up speed, consistency of daily actions
- CAPACITY: Time management, bandwidth, life circumstances affecting work

You must output JSON with this exact structure:
{
  "executiveSummary": "3-4 paragraph narrative covering: where agent stands today, key patterns observed, what needs to happen next, and expected trajectory if coaching recommendations are followed",
  "performanceDiagnosis": {
    "primaryDiagnosis": "Commitment|Capability|Cadence|Capacity",
    "secondaryDiagnosis": "Commitment|Capability|Cadence|Capacity|null",
    "confidence": "high|medium|low",
    "evidence": ["Evidence point 1", "Evidence point 2", "Evidence point 3"],
    "rootCauseAnalysis": "Deep analysis of WHY this diagnosis applies - not just what, but why",
    "comparedToBenchmark": "How this agent compares to company averages and what that means"
  },
  "coachingHistorySynthesis": {
    "recurringThemes": ["Theme 1", "Theme 2"],
    "approachesThatWorked": ["What worked"],
    "approachesThatDidntWork": ["What didn't work"],
    "commitmentCompletionRate": "X% - analysis of pattern",
    "sessionEngagementTrend": "Improving|Stable|Declining - with evidence"
  },
  "personalityAndStyle": {
    "communicationApproach": "How to communicate with this agent based on assessments and history",
    "motivationalDrivers": ["What motivates them"],
    "accountabilityStyle": "What type of accountability works best",
    "potentialTriggers": ["What to avoid or be careful about"],
    "coachingDosAndDonts": {"do": ["Do this"], "dont": ["Don't do this"]}
  },
  "productionAnalysis": {
    "trajectory": "up|flat|down",
    "trajectoryDetail": "Detailed explanation with numbers",
    "strengthAreas": ["Where they excel"],
    "gapAreas": ["Where they're falling short"],
    "terminationAnalysis": "Analysis of deal terminations if any",
    "pipelineHealth": "Assessment of current pipeline quality and quantity",
    "goalProgress": "On track / behind / ahead with specifics"
  },
  "riskAssessment": {
    "retentionRisk": "Low|Watch|Elevated|Critical",
    "retentionRiskReasoning": "Why this risk level",
    "riskFactors": ["Specific risk factor 1", "Specific risk factor 2"],
    "positiveSignals": ["Positive signal 1", "Positive signal 2"],
    "earlyWarningIndicators": ["What to watch for"]
  },
  "recommendations": {
    "developmentPriority": "The single most important thing to focus on right now",
    "recommendedSessionType": "COACH|Accountability|Pipeline Review|Goal Setting|Performance Review|Market Strategy",
    "recommendedAgenda": ["Agenda item 1 with rationale", "Agenda item 2 with rationale", "Agenda item 3 with rationale"],
    "powerQuestions": ["Thought-provoking question 1", "Question 2", "Question 3", "Question 4", "Question 5"],
    "suggestedCommitments": [{"description": "Specific measurable action", "rationale": "Why this matters now", "metric": "What to measure", "timeline": "When to complete"}],
    "nextSessionFocus": "What the next session should primarily address",
    "escalationRecommendation": "None|Monitor|Performance Reset|Leadership Involvement - with reasoning"
  },
  "dataQualityWarnings": ["Any data gaps or quality issues that affect this analysis"]
}`,
          },
          {
            role: "user",
            content: `AGENT PROFILE:
Name: ${agentName} | Email: ${agentRow?.email ?? 'N/A'}
Market: ${marketName} | Group: ${groupName} | Group Leader: ${groupLeaderName}
Commission Split: ${agentRow?.commissionSplit ?? 'N/A'}% | Tenure: ${tenureDays ? `${tenureDays} days (${Math.round(tenureDays/30)} months)` : 'Unknown'}
Current Coaching Status: ${profile?.performanceStatus ?? 'No profile'} | Risk: ${profile?.retentionRiskStatus ?? 'Unknown'} | Diagnosis: ${profile?.currentPrimaryDiagnosis ?? 'None set'}
Launch Phase: ${profile?.launchHealthStatus ?? 'N/A'}

PRODUCTION DATA:
- Trailing 90-day: ${prodStats.trailing90Units} units, $${Number(prodStats.trailing90Volume).toLocaleString()} volume, $${Number(prodStats.trailing90GCI).toLocaleString()} GCI
- Trailing 30-day: ${prodStats.trailing30Units} units, $${Number(prodStats.trailing30Volume).toLocaleString()} volume
- Under Contract: ${prodStats.underContractUnits} units, $${Number(prodStats.underContractVolume).toLocaleString()} volume
- YTD: ${prodStats.ytdUnits} units, $${Number(prodStats.ytdVolume).toLocaleString()} volume, $${Number(prodStats.ytdGCI).toLocaleString()} GCI
- Terminated (all time): ${terminations.length} deals
- Termination Details: ${terminationSummary}

COMPANY BENCHMARKS:
${benchmarkContext}
Agent vs Avg: ${prodStats.ytdUnits} units vs ${Math.round(Number(companyBenchmarks?.avgYtdUnits ?? 0))} avg (${prodStats.ytdUnits > Number(companyBenchmarks?.avgYtdUnits ?? 0) ? 'ABOVE' : 'BELOW'} average)

GOALS:
- Annual Goal: ${goalsData.annualGoal ? `${goalsData.annualGoal.closingsTarget} closings, $${Number(goalsData.annualGoal.volumeTarget ?? 0).toLocaleString()} volume, $${Number(goalsData.annualGoal.gciTarget ?? 0).toLocaleString()} GCI` : 'Not set'}
- YTD Actuals: ${goalsData.ytdActuals.ytdClosings} closings, $${Number(goalsData.ytdActuals.ytdVolume).toLocaleString()} volume, $${Number(goalsData.ytdActuals.ytdGCI).toLocaleString()} GCI
- Goal Attainment: ${goalsData.annualGoal?.closingsTarget ? `${Math.round((goalsData.ytdActuals.ytdClosings / goalsData.annualGoal.closingsTarget) * 100)}% of closings goal` : 'No goal set'}

LEADS & PIPELINE:
- Total Leads: ${prodStats.totalLeads}, Active: ${prodStats.activeLeads}, New (30d): ${prodStats.newLeads30d}
- Stale Leads (no activity 30d): ${prodStats.staleLeads}, Dead: ${prodStats.deadLeads}
- Avg Lead Age: ${Math.round(prodStats.avgLeadAgeDays)} days
- Pipeline Breakdown: ${JSON.stringify(pipelineData.pipelineByStatus)}

TASKS:
- Pending: ${prodStats.totalPendingTasks}, Overdue: ${prodStats.overdueTasks}, Completed (30d): ${prodStats.completedTasks30d}

PERSONALITY ASSESSMENTS:
${assessments.map((a: any) => `- ${a.assessmentType}:\n  Communication: ${a.communicationStyle ?? 'N/A'}\n  Decision-Making: ${a.decisionMakingStyle ?? 'N/A'}\n  Motivators: ${a.motivators ?? 'N/A'}\n  Stress Behaviors: ${a.stressBehaviors ?? 'N/A'}\n  Accountability Pref: ${a.accountabilityPreferences ?? 'N/A'}\n  Strengths: ${a.likelyStrengths ?? 'N/A'}\n  Blind Spots: ${a.likelyBlindSpots ?? 'N/A'}\n  Coaching Style: ${a.preferredCoachingStyle ?? 'N/A'}`).join("\n") || "None uploaded - recommend uploading DISC or similar assessment"}

COACHING HISTORY (last 10 sessions):
${sessionSummaries || "No completed sessions yet - this may be a new coaching relationship"}

COMMITMENTS (last 30):
${commitmentSummary || "No commitments tracked yet"}

Please provide your comprehensive coaching analysis.`,
          },
        ],
        response_format: { type: "json_object" },
      });
      const rawContent = response.choices[0]?.message?.content;
      const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "{}"));
      // Update profile with AI insights
      const updateFields: any = { updatedAt: sql`NOW()`, aiInsightsJson: JSON.stringify(parsed), aiInsightsGeneratedAt: sql`NOW()` };
      if (parsed.performanceDiagnosis?.primaryDiagnosis && ["Commitment", "Capability", "Cadence", "Capacity"].includes(parsed.performanceDiagnosis.primaryDiagnosis)) {
        updateFields.currentPrimaryDiagnosis = parsed.performanceDiagnosis.primaryDiagnosis;
      }
      if (parsed.performanceDiagnosis?.secondaryDiagnosis && ["Commitment", "Capability", "Cadence", "Capacity"].includes(parsed.performanceDiagnosis.secondaryDiagnosis)) {
        updateFields.secondaryDiagnosis = parsed.performanceDiagnosis.secondaryDiagnosis;
      }
      if (parsed.recommendations?.developmentPriority) {
        updateFields.currentDevelopmentPriority = parsed.recommendations.developmentPriority;
      }
      if (parsed.riskAssessment?.retentionRisk && ["Low", "Watch", "Elevated", "Critical"].includes(parsed.riskAssessment.retentionRisk)) {
        updateFields.retentionRiskStatus = parsed.riskAssessment.retentionRisk;
      }
      if (profile) {
        await db.update(coachingProfiles).set(updateFields).where(eq(coachingProfiles.agentId, input.agentId));
      }
      // Also update the user_profiles.coachingSummary with executive summary
      if (parsed.executiveSummary) {
        await db.update(userProfiles).set({ coachingSummary: parsed.executiveSummary, coachingSummaryGeneratedAt: sql`NOW()` }).where(eq(userProfiles.userId, input.agentId));
      }
      return {
        insights: parsed,
        context: { marketName, groupName, groupLeaderName, tenureDays, benchmarks: companyBenchmarks },
        generatedAt: new Date().toISOString(),
      };
    }),

  /** Create or update a coaching profile for an agent */
  upsertProfile: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      coachOfRecordId: z.number().nullable().optional(),
      performanceStatus: z.enum(["Launch", "Red", "Yellow", "Green", "Elite"]).optional(),
      marketProtectionStatus: z.string().optional(),
      retentionRiskStatus: z.enum(["Low", "Watch", "Elevated", "Critical"]).optional(),
      currentPrimaryDiagnosis: z.enum(["Commitment", "Capability", "Cadence", "Capacity"]).nullable().optional(),
      currentDevelopmentPriority: z.string().nullable().optional(),
      nextSessionCoachId: z.number().nullable().optional(),
      nextSessionDate: z.string().nullable().optional(),
      coachingSetupRequired: z.boolean().optional(),
      launchStartDate: z.string().nullable().optional(),
      launchHealthStatus: z.enum(["On Track", "At Risk", "Critical"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { agentId, ...fields } = input;
      const insertValues: any = { agentId, ...fields };
      if (fields.nextSessionDate) insertValues.nextSessionDate = new Date(fields.nextSessionDate);
      if (fields.launchStartDate) insertValues.launchStartDate = new Date(fields.launchStartDate);

      await db.insert(coachingProfiles)
        .values(insertValues)
        .onDuplicateKeyUpdate({ set: { ...fields, nextSessionDate: fields.nextSessionDate ? new Date(fields.nextSessionDate) : undefined, launchStartDate: fields.launchStartDate ? new Date(fields.launchStartDate) : undefined, updatedAt: sql`NOW()` } as any });

      void logActivity({
        userId: ctx.user.id,
        action: "coaching_profile_updated",
        entityType: "coaching_profile",
        entityId: agentId,
        details: { updatedFields: Object.keys(fields) },
      });

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSIONS — Full lifecycle with staged workspace
  // ═══════════════════════════════════════════════════════════════════════════

  /** List coaching sessions with full filtering */
  listSessions: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      coachId: z.number().optional(),
      status: z.string().optional(),
      sessionType: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const agentAlias = aliasedTable(users, "sessionAgent");
      const coachAlias = aliasedTable(users, "sessionCoach");

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(coachingSessions.agentId, input.agentId));
      if (input?.coachId) conditions.push(or(
        eq(coachingSessions.scheduledCoachId, input.coachId),
        eq(coachingSessions.actualCoachId, input.coachId),
      ));
      if (input?.status) conditions.push(eq(coachingSessions.status, input.status as any));
      if (input?.sessionType) conditions.push(eq(coachingSessions.sessionType, input.sessionType));
      if (input?.dateFrom) conditions.push(gte(coachingSessions.sessionDate, new Date(input.dateFrom)));
      if (input?.dateTo) conditions.push(lte(coachingSessions.sessionDate, new Date(input.dateTo)));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        db.select({
          session: coachingSessions,
          agent: { id: agentAlias.id, name: agentAlias.name, email: agentAlias.email },
          coach: { id: coachAlias.id, name: coachAlias.name, email: coachAlias.email },
        })
          .from(coachingSessions)
          .leftJoin(agentAlias, eq(coachingSessions.agentId, agentAlias.id))
          .leftJoin(coachAlias, eq(coachingSessions.scheduledCoachId, coachAlias.id))
          .where(whereClause)
          .orderBy(desc(coachingSessions.sessionDate))
          .limit(input?.limit ?? 20)
          .offset(input?.offset ?? 0),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(coachingSessions)
          .where(whereClause),
      ]);

      return { rows, total: Number(countRows[0]?.count ?? 0) };
    }),

  /** Get a single session with full context for the Session Workspace */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const agentAlias = aliasedTable(users, "sAgent");
      const coachAlias = aliasedTable(users, "sCoach");
      const actualCoachAlias = aliasedTable(users, "sActualCoach");

      const [row] = await db
        .select({
          session: coachingSessions,
          agent: { id: agentAlias.id, name: agentAlias.name, email: agentAlias.email },
          scheduledCoach: { id: coachAlias.id, name: coachAlias.name, email: coachAlias.email },
          actualCoach: { id: actualCoachAlias.id, name: actualCoachAlias.name, email: actualCoachAlias.email },
        })
        .from(coachingSessions)
        .leftJoin(agentAlias, eq(coachingSessions.agentId, agentAlias.id))
        .leftJoin(coachAlias, eq(coachingSessions.scheduledCoachId, coachAlias.id))
        .leftJoin(actualCoachAlias, eq(coachingSessions.actualCoachId, actualCoachAlias.id))
        .where(eq(coachingSessions.id, input.sessionId));

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      // Get commitments for this session
      const commitments = await db
        .select()
        .from(coachingCommitments)
        .where(eq(coachingCommitments.sessionId, input.sessionId))
        .orderBy(coachingCommitments.createdAt);

      // Get agent's open commitments from prior sessions (for review)
      const priorCommitments = await db
        .select()
        .from(coachingCommitments)
        .where(and(
          eq(coachingCommitments.agentId, (row as any).agent.id),
          ne(coachingCommitments.sessionId, input.sessionId),
          inArray(coachingCommitments.status, ["Not Started", "In Progress", "Submitted for Verification"]),
        ))
        .orderBy(coachingCommitments.dueDate)
        .limit(15);

      // Get agent's coaching profile for context
      const [profile] = await db
        .select()
        .from(coachingProfiles)
        .where(eq(coachingProfiles.agentId, (row as any).agent.id));

      return { ...row, commitments, priorCommitments, profile: profile ?? null };
    }),

  /** Generate pre-session brief (AI-powered preparation) */
  generatePreSessionBrief: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select({ agentId: coachingSessions.agentId, sessionType: coachingSessions.sessionType })
        .from(coachingSessions)
        .where(eq(coachingSessions.id, input.sessionId));

      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const agentId = session.agentId;
      const [agentRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, agentId));
      const prodStats = await getAgentProductionStats(db, agentId);
      const goalsData = await getAgentGoalsWithProgress(db, agentId);
      const history = await getCoachingHistoryForAI(db, agentId, 5);
      const [profile] = await db.select().from(coachingProfiles).where(eq(coachingProfiles.agentId, agentId));

      const lastSessionSummary = history.sessions[0]?.aiSummary || history.sessions[0]?.sourceNotes || "No prior session data";
      const openCommitments = history.commitments
        .filter((c: any) => ["Not Started", "In Progress"].includes(c.status))
        .map((c: any) => `- [${c.status}] ${c.description} (Due: ${c.dueDate ? new Date(c.dueDate).toLocaleDateString() : 'N/A'})`)
        .join("\n");

      const response = await invokeLLM({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are preparing a coaching session brief for a coach at Savvy STR Agents. Generate a concise, actionable pre-session brief that helps the coach walk in prepared. Use the Four-C framework. Output JSON:
{
  "agentSnapshot": "2-3 sentence current state summary",
  "lastSessionRecap": "Key takeaways from last session",
  "openCommitmentsReview": "Status of outstanding commitments",
  "suggestedAgenda": ["Item 1", "Item 2", "Item 3", "Item 4"],
  "suggestedQuestions": ["Question 1", "Question 2", "Question 3"],
  "watchFor": ["Warning sign 1", "Warning sign 2"],
  "celebrateIf": ["Win to acknowledge 1", "Win to acknowledge 2"],
  "dataHighlights": ["Key data point 1", "Key data point 2"]
}`,
          },
          {
            role: "user",
            content: `Agent: ${agentRow?.name ?? 'Unknown'} | Status: ${profile?.performanceStatus ?? 'Unknown'} | Session Type: ${session.sessionType}
Production: ${prodStats.trailing90Units} closings (90d), ${prodStats.underContractUnits} under contract, ${prodStats.overdueTasks} overdue tasks
Goals: Annual=${goalsData.annualGoal?.closingsTarget ?? 'Not set'} closings, YTD=${goalsData.ytdActuals.ytdClosings} closings
Last Session: ${lastSessionSummary.substring(0, 500)}
Open Commitments:\n${openCommitments || "None"}`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices[0]?.message?.content;
      const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "{}"));

      // Store the brief on the session
      await db.update(coachingSessions).set({
        aiRecommendedAgenda: JSON.stringify(parsed.suggestedAgenda ?? []),
        aiRecommendedQuestions: JSON.stringify(parsed.suggestedQuestions ?? []),
        preparationStatus: "Ready",
        updatedAt: sql`NOW()`,
      }).where(eq(coachingSessions.id, input.sessionId));

      return { brief: parsed, generatedAt: new Date().toISOString() };
    }),

  /** Create a new coaching session */
  createSession: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      scheduledCoachId: z.number().optional(),
      sessionDate: z.string().optional(),
      sessionType: z.string().default("Standard COACH"),
      meetingLink: z.string().optional(),
      reasonForSession: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get the agent's coach of record
      const [profile] = await db
        .select({ coachOfRecordId: coachingProfiles.coachOfRecordId })
        .from(coachingProfiles)
        .where(eq(coachingProfiles.agentId, input.agentId));

      const [result] = await db.insert(coachingSessions).values({
        agentId: input.agentId,
        coachOfRecordId: profile?.coachOfRecordId ?? null,
        scheduledCoachId: input.scheduledCoachId ?? profile?.coachOfRecordId ?? null,
        sessionDate: input.sessionDate ? new Date(input.sessionDate) : null,
        sessionType: input.sessionType,
        meetingLink: input.meetingLink,
        reasonForSession: input.reasonForSession,
        status: "Scheduled",
      });

      // Update profile next session date
      if (input.sessionDate) {
        await db.update(coachingProfiles).set({
          nextSessionDate: new Date(input.sessionDate),
          nextSessionCoachId: input.scheduledCoachId ?? profile?.coachOfRecordId ?? null,
          updatedAt: sql`NOW()`,
        }).where(eq(coachingProfiles.agentId, input.agentId));
      }

      void logActivity({
        userId: ctx.user.id,
        action: "coaching_session_created",
        entityType: "coaching_session",
        entityId: (result as any).insertId,
        details: { agentId: input.agentId, sessionType: input.sessionType },
      });

      return { success: true, sessionId: (result as any).insertId };
    }),

  /** Start a session (transition to In Progress) */
  startSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(coachingSessions).set({
        status: "In Progress",
        actualCoachId: ctx.user.id,
        startedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      }).where(eq(coachingSessions.id, input.sessionId));

      return { success: true };
    }),

  /** Complete a session (transition to Completed) */
  completeSession: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      durationMinutes: z.number().optional(),
      primaryDiagnosis: z.enum(["Commitment", "Capability", "Cadence", "Capacity"]).nullable().optional(),
      secondaryDiagnosis: z.enum(["Commitment", "Capability", "Cadence", "Capacity"]).nullable().optional(),
      diagnosisEvidence: z.string().nullable().optional(),
      nextSessionCoachId: z.number().nullable().optional(),
      nextSessionDate: z.string().nullable().optional(),
      nextSessionType: z.string().nullable().optional(),
      noNextSessionReason: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { sessionId, ...fields } = input;
      const updateValues: any = {
        status: "Completed" as const,
        completedAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
        ...fields,
      };
      if (fields.nextSessionDate) updateValues.nextSessionDate = new Date(fields.nextSessionDate);

      await db.update(coachingSessions).set(updateValues).where(eq(coachingSessions.id, sessionId));

      // Update coaching profile with next session and diagnosis
      const [session] = await db.select({ agentId: coachingSessions.agentId }).from(coachingSessions).where(eq(coachingSessions.id, sessionId));
      if (session) {
        const profileUpdate: any = { updatedAt: sql`NOW()` };
        if (fields.nextSessionDate) profileUpdate.nextSessionDate = new Date(fields.nextSessionDate);
        if (fields.nextSessionCoachId !== undefined) profileUpdate.nextSessionCoachId = fields.nextSessionCoachId;
        if (fields.primaryDiagnosis !== undefined) profileUpdate.currentPrimaryDiagnosis = fields.primaryDiagnosis;
        await db.update(coachingProfiles).set(profileUpdate).where(eq(coachingProfiles.agentId, session.agentId));

        // Auto-create next session if date provided
        if (fields.nextSessionDate) {
          await db.insert(coachingSessions).values({
            agentId: session.agentId,
            coachOfRecordId: fields.nextSessionCoachId ?? null,
            scheduledCoachId: fields.nextSessionCoachId ?? null,
            sessionDate: new Date(fields.nextSessionDate),
            sessionType: fields.nextSessionType ?? "Standard COACH",
            status: "Scheduled",
          });
        }
      }

      void logActivity({
        userId: ctx.user.id,
        action: "coaching_session_completed",
        entityType: "coaching_session",
        entityId: sessionId,
        details: { diagnosis: fields.primaryDiagnosis },
      });

      return { success: true };
    }),

  /** Update a coaching session */
  updateSession: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      status: z.enum(["Scheduled", "In Progress", "Completed", "Canceled", "No Show"]).optional(),
      actualCoachId: z.number().nullable().optional(),
      sessionDate: z.string().nullable().optional(),
      sessionType: z.string().optional(),
      meetingLink: z.string().nullable().optional(),
      reasonForSession: z.string().nullable().optional(),
      sourceNotes: z.string().nullable().optional(),
      durationMinutes: z.number().nullable().optional(),
      primaryDiagnosis: z.enum(["Commitment", "Capability", "Cadence", "Capacity"]).nullable().optional(),
      secondaryDiagnosis: z.enum(["Commitment", "Capability", "Cadence", "Capacity"]).nullable().optional(),
      diagnosisEvidence: z.string().nullable().optional(),
      nextSessionCoachId: z.number().nullable().optional(),
      nextSessionDate: z.string().nullable().optional(),
      nextSessionType: z.string().nullable().optional(),
      noNextSessionReason: z.string().nullable().optional(),
      preparationStatus: z.enum(["Not Started", "In Progress", "Ready"]).optional(),
      recordingFileUrl: z.string().nullable().optional(),
      recordingFileKey: z.string().nullable().optional(),
      recordingDurationSeconds: z.number().nullable().optional(),
      transcript: z.string().nullable().optional(),
      transcriptionStatus: z.enum(["None", "Pending", "Processing", "Completed", "Failed"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { sessionId, ...fields } = input;
      const updateValues: any = { ...fields, updatedAt: sql`NOW()` };
      if (fields.sessionDate !== undefined) updateValues.sessionDate = fields.sessionDate ? new Date(fields.sessionDate) : null;
      if (fields.nextSessionDate !== undefined) updateValues.nextSessionDate = fields.nextSessionDate ? new Date(fields.nextSessionDate) : null;
      if (fields.status === "In Progress" && !updateValues.startedAt) updateValues.startedAt = sql`NOW()`;
      if (fields.status === "Completed" && !updateValues.completedAt) updateValues.completedAt = sql`NOW()`;

      await db.update(coachingSessions).set(updateValues).where(eq(coachingSessions.id, sessionId));

      // If session completed and has a next session date, update the coaching profile
      if (fields.status === "Completed" && fields.nextSessionDate) {
        const [session] = await db.select({ agentId: coachingSessions.agentId }).from(coachingSessions).where(eq(coachingSessions.id, sessionId));
        if (session) {
          await db.update(coachingProfiles).set({
            nextSessionDate: new Date(fields.nextSessionDate),
            nextSessionCoachId: fields.nextSessionCoachId ?? null,
            updatedAt: sql`NOW()`,
          }).where(eq(coachingProfiles.agentId, session.agentId));
        }
      }

      // Update coaching profile diagnosis if provided
      if (fields.primaryDiagnosis !== undefined) {
        const [session] = await db.select({ agentId: coachingSessions.agentId }).from(coachingSessions).where(eq(coachingSessions.id, sessionId));
        if (session) {
          await db.update(coachingProfiles).set({
            currentPrimaryDiagnosis: fields.primaryDiagnosis,
            updatedAt: sql`NOW()`,
          }).where(eq(coachingProfiles.agentId, session.agentId));
        }
      }

      void logActivity({
        userId: ctx.user.id,
        action: "coaching_session_updated",
        entityType: "coaching_session",
        entityId: sessionId,
        details: { updatedFields: Object.keys(fields) },
      });

      return { success: true };
    }),

  /** Approve AI-generated session summary */
  approveSessionSummary: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(coachingSessions).set({ isSummaryApproved: true, updatedAt: sql`NOW()` }).where(eq(coachingSessions.id, input.sessionId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMITMENTS — Full lifecycle with verification
  // ═══════════════════════════════════════════════════════════════════════════

  /** List commitments with comprehensive filtering */
  listCommitments: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      sessionId: z.number().optional(),
      status: z.string().optional(),
      includeCompleted: z.boolean().default(false),
      overdueOnly: z.boolean().default(false),
      aiSuggestedOnly: z.boolean().default(false),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const agentAlias = aliasedTable(users, "commitAgent");

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(coachingCommitments.agentId, input.agentId));
      if (input?.sessionId) conditions.push(eq(coachingCommitments.sessionId, input.sessionId));
      if (input?.status) conditions.push(eq(coachingCommitments.status, input.status as any));
      if (!input?.includeCompleted) {
        conditions.push(sql`${coachingCommitments.status} NOT IN ('Completed', 'Waived', 'No Longer Relevant')`);
      }
      if (input?.overdueOnly) {
        conditions.push(and(
          inArray(coachingCommitments.status, ["Not Started", "In Progress"]),
          lt(coachingCommitments.dueDate, sql`NOW()`),
        ));
      }
      if (input?.aiSuggestedOnly) {
        conditions.push(eq(coachingCommitments.status, "AI Suggested"));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        db.select({
          commitment: coachingCommitments,
          agentName: agentAlias.name,
        })
          .from(coachingCommitments)
          .leftJoin(agentAlias, eq(coachingCommitments.agentId, agentAlias.id))
          .where(whereClause)
          .orderBy(coachingCommitments.dueDate, coachingCommitments.createdAt)
          .limit(input?.limit ?? 50)
          .offset(input?.offset ?? 0),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(coachingCommitments)
          .where(whereClause),
      ]);

      return { rows, total: Number(countRows[0]?.count ?? 0) };
    }),

  /** Create a commitment */
  createCommitment: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      sessionId: z.number().nullable().optional(),
      description: z.string().min(1),
      ownerId: z.number().optional(),
      dueDate: z.string().optional(),
      expectedResult: z.string().optional(),
      relatedGoalId: z.number().nullable().optional(),
      relatedMetric: z.string().optional(),
      visibilityLabel: z.enum(["Agent Visible", "Internal", "Leadership"]).default("Agent Visible"),
      consequence: z.string().optional(),
      isAiExtracted: z.boolean().default(false),
      aiConfidence: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.insert(coachingCommitments).values({
        ...input,
        createdById: ctx.user.id,
        ownerId: input.ownerId ?? input.agentId,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: input.isAiExtracted ? "AI Suggested" : "Not Started",
      });

      return { success: true, commitmentId: (result as any).insertId };
    }),

  /** Update a commitment */
  updateCommitment: protectedProcedure
    .input(z.object({
      commitmentId: z.number(),
      description: z.string().optional(),
      status: z.enum(["AI Suggested", "Not Started", "In Progress", "Submitted for Verification", "Completed", "Partially Completed", "Missed", "Waived", "No Longer Relevant"]).optional(),
      dueDate: z.string().nullable().optional(),
      expectedResult: z.string().nullable().optional(),
      completionEvidence: z.string().nullable().optional(),
      coachVerificationStatus: z.enum(["Pending", "Verified", "Rejected"]).optional(),
      consequence: z.string().nullable().optional(),
      visibilityLabel: z.enum(["Agent Visible", "Internal", "Leadership"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { commitmentId, ...fields } = input;
      const updateValues: any = { ...fields, updatedAt: sql`NOW()` };
      if (fields.dueDate !== undefined) updateValues.dueDate = fields.dueDate ? new Date(fields.dueDate) : null;
      if (fields.status === "Completed") updateValues.completedDate = sql`NOW()`;

      await db.update(coachingCommitments).set(updateValues).where(eq(coachingCommitments.id, commitmentId));
      return { success: true };
    }),

  /** Bulk approve AI-suggested commitments */
  bulkApproveCommitments: protectedProcedure
    .input(z.object({ commitmentIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(coachingCommitments)
        .set({ status: "Not Started", updatedAt: sql`NOW()` })
        .where(and(
          inArray(coachingCommitments.id, input.commitmentIds),
          eq(coachingCommitments.status, "AI Suggested"),
        ));

      return { success: true, approvedCount: input.commitmentIds.length };
    }),

  /** Bulk dismiss AI-suggested commitments */
  bulkDismissCommitments: protectedProcedure
    .input(z.object({ commitmentIds: z.array(z.number()) }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.delete(coachingCommitments)
        .where(and(
          inArray(coachingCommitments.id, input.commitmentIds),
          eq(coachingCommitments.status, "AI Suggested"),
        ));

      return { success: true };
    }),

  /** Delete a commitment */
  deleteCommitment: protectedProcedure
    .input(z.object({ commitmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(coachingCommitments).where(eq(coachingCommitments.id, input.commitmentId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE RESETS
  // ═══════════════════════════════════════════════════════════════════════════

  /** List performance resets */
  listResets: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(performanceResets.agentId, input.agentId));
      if (input?.status) conditions.push(eq(performanceResets.status, input.status as any));

      const resets = await db
        .select()
        .from(performanceResets)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(performanceResets.createdAt));

      const resetIds = resets.map((r: any) => r.id);
      if (resetIds.length === 0) return [];

      const [requirements, checkpoints] = await Promise.all([
        db.select().from(performanceResetRequirements).where(inArray(performanceResetRequirements.resetId, resetIds)),
        db.select().from(performanceResetCheckpoints).where(inArray(performanceResetCheckpoints.resetId, resetIds)),
      ]);

      return resets.map((reset: any) => ({
        ...reset,
        requirements: requirements.filter((r: any) => r.resetId === reset.id),
        checkpoints: checkpoints.filter((c: any) => c.resetId === reset.id),
      }));
    }),

  /** Create a performance reset */
  createReset: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      requiredStandard: z.string().optional(),
      currentResult: z.string().optional(),
      goalGap: z.string().optional(),
      evidenceSummary: z.string().optional(),
      consequence: z.string().optional(),
      requirements: z.array(z.object({ description: z.string() })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [profile] = await db.select({ coachOfRecordId: coachingProfiles.coachOfRecordId }).from(coachingProfiles).where(eq(coachingProfiles.agentId, input.agentId));

      const [result] = await db.insert(performanceResets).values({
        agentId: input.agentId,
        coachOfRecordId: profile?.coachOfRecordId ?? null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        requiredStandard: input.requiredStandard,
        currentResult: input.currentResult,
        goalGap: input.goalGap,
        evidenceSummary: input.evidenceSummary,
        consequence: input.consequence,
        status: "Draft",
      });

      const resetId = (result as any).insertId;

      if (input.requirements && input.requirements.length > 0) {
        await db.insert(performanceResetRequirements).values(
          input.requirements.map((r, i) => ({ resetId, description: r.description, sortOrder: i }))
        );
      }

      // Auto-create checkpoints
      if (input.startDate) {
        const start = new Date(input.startDate);
        const checkpointDefs = [
          { type: "Week 1", days: 7 },
          { type: "Day 14", days: 14 },
          { type: "Week 3", days: 21 },
          { type: "Day 30", days: 30 },
        ];
        await db.insert(performanceResetCheckpoints).values(
          checkpointDefs.map(cp => ({
            resetId,
            checkpointDate: new Date(start.getTime() + cp.days * 24 * 60 * 60 * 1000),
            checkpointType: cp.type,
            status: "Pending" as const,
          }))
        );
      }

      // Update agent performance status to Red when reset is created
      await db.update(coachingProfiles).set({
        performanceStatus: "Red",
        updatedAt: sql`NOW()`,
      }).where(eq(coachingProfiles.agentId, input.agentId));

      void logActivity({
        userId: ctx.user.id,
        action: "performance_reset_created",
        entityType: "performance_reset",
        entityId: resetId,
        details: { agentId: input.agentId },
      });

      return { success: true, resetId };
    }),

  /** Update a performance reset */
  updateReset: protectedProcedure
    .input(z.object({
      resetId: z.number(),
      status: z.string().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      requiredStandard: z.string().nullable().optional(),
      currentResult: z.string().nullable().optional(),
      goalGap: z.string().nullable().optional(),
      evidenceSummary: z.string().nullable().optional(),
      consequence: z.string().nullable().optional(),
      extensionReason: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { resetId, ...fields } = input;
      const updateValues: any = { ...fields, updatedAt: sql`NOW()` };
      if (fields.startDate !== undefined) updateValues.startDate = fields.startDate ? new Date(fields.startDate) : null;
      if (fields.endDate !== undefined) updateValues.endDate = fields.endDate ? new Date(fields.endDate) : null;

      await db.update(performanceResets).set(updateValues).where(eq(performanceResets.id, resetId));
      return { success: true };
    }),

  /** Update a reset requirement */
  updateResetRequirement: protectedProcedure
    .input(z.object({
      requirementId: z.number(),
      status: z.enum(["Pending", "Met", "Missed"]).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { requirementId, ...fields } = input;
      await db.update(performanceResetRequirements).set(fields).where(eq(performanceResetRequirements.id, requirementId));
      return { success: true };
    }),

  /** Update a reset checkpoint */
  updateResetCheckpoint: protectedProcedure
    .input(z.object({
      checkpointId: z.number(),
      status: z.enum(["Pending", "Completed", "Missed"]).optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { checkpointId, ...fields } = input;
      await db.update(performanceResetCheckpoints).set({
        ...fields,
        conductedById: ctx.user.id,
      }).where(eq(performanceResetCheckpoints.id, checkpointId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPACITY ESCALATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** List capacity escalations */
  listEscalations: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      status: z.string().optional(),
      urgency: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(capacityEscalations.agentId, input.agentId));
      if (input?.status) conditions.push(eq(capacityEscalations.status, input.status as any));
      if (input?.urgency) conditions.push(eq(capacityEscalations.urgency, input.urgency as any));

      const agentAlias = aliasedTable(users, "escAgent");
      const ownerAlias = aliasedTable(users, "escOwner");
      const submitterAlias = aliasedTable(users, "escSubmitter");

      return db
        .select({
          escalation: capacityEscalations,
          agent: { id: agentAlias.id, name: agentAlias.name },
          owner: { id: ownerAlias.id, name: ownerAlias.name },
          submitter: { id: submitterAlias.id, name: submitterAlias.name },
        })
        .from(capacityEscalations)
        .leftJoin(agentAlias, eq(capacityEscalations.agentId, agentAlias.id))
        .leftJoin(ownerAlias, eq(capacityEscalations.assignedOwnerId, ownerAlias.id))
        .leftJoin(submitterAlias, eq(capacityEscalations.submittedById, submitterAlias.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(capacityEscalations.createdAt));
    }),

  /** Create a capacity escalation */
  createEscalation: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      relatedSessionId: z.number().nullable().optional(),
      issueCategory: z.string().optional(),
      description: z.string().min(1),
      evidence: z.string().optional(),
      estimatedProductionImpact: z.string().optional(),
      urgency: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.insert(capacityEscalations).values({
        ...input,
        submittedById: ctx.user.id,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: "Submitted",
      });

      return { success: true, escalationId: (result as any).insertId };
    }),

  /** Update a capacity escalation */
  updateEscalation: protectedProcedure
    .input(z.object({
      escalationId: z.number(),
      status: z.string().optional(),
      assignedOwnerId: z.number().nullable().optional(),
      resolution: z.string().nullable().optional(),
      coachConfirmation: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { escalationId, ...fields } = input;
      const updateValues: any = { ...fields, updatedAt: sql`NOW()` };
      if (fields.status === "Resolved") updateValues.resolutionDate = sql`NOW()`;

      await db.update(capacityEscalations).set(updateValues).where(eq(capacityEscalations.id, escalationId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // COACH-OUT RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** List coach-out recommendations */
  listCoachOuts: protectedProcedure
    .input(z.object({ agentId: z.number().optional(), status: z.string().optional() }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(coachOutRecommendations.agentId, input.agentId));
      if (input?.status) conditions.push(eq(coachOutRecommendations.status, input.status as any));

      const agentAlias = aliasedTable(users, "coAgent");
      const coachAlias = aliasedTable(users, "coCoach");

      return db
        .select({
          coachOut: coachOutRecommendations,
          agent: { id: agentAlias.id, name: agentAlias.name },
          coach: { id: coachAlias.id, name: coachAlias.name },
        })
        .from(coachOutRecommendations)
        .leftJoin(agentAlias, eq(coachOutRecommendations.agentId, agentAlias.id))
        .leftJoin(coachAlias, eq(coachOutRecommendations.coachOfRecordId, coachAlias.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(coachOutRecommendations.createdAt));
    }),

  /** Create a coach-out recommendation */
  createCoachOut: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      performanceHistory: z.string().optional(),
      supportProvided: z.string().optional(),
      culturalConcerns: z.string().optional(),
      engagementConcerns: z.string().optional(),
      marketImpact: z.string().optional(),
      recommendation: z.string().optional(),
      proposedEffectiveDate: z.string().optional(),
      marketOpeningRecommendation: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [profile] = await db.select({ coachOfRecordId: coachingProfiles.coachOfRecordId }).from(coachingProfiles).where(eq(coachingProfiles.agentId, input.agentId));

      const [result] = await db.insert(coachOutRecommendations).values({
        ...input,
        coachOfRecordId: profile?.coachOfRecordId ?? null,
        proposedEffectiveDate: input.proposedEffectiveDate ? new Date(input.proposedEffectiveDate) : null,
        status: "Draft",
      });

      void logActivity({
        userId: ctx.user.id,
        action: "coach_out_recommendation_created",
        entityType: "coach_out_recommendation",
        entityId: (result as any).insertId,
        details: { agentId: input.agentId },
      });

      return { success: true, coachOutId: (result as any).insertId };
    }),

  /** Update a coach-out recommendation */
  updateCoachOut: protectedProcedure
    .input(z.object({
      coachOutId: z.number(),
      status: z.string().optional(),
      performanceHistory: z.string().nullable().optional(),
      supportProvided: z.string().nullable().optional(),
      culturalConcerns: z.string().nullable().optional(),
      engagementConcerns: z.string().nullable().optional(),
      marketImpact: z.string().nullable().optional(),
      recommendation: z.string().nullable().optional(),
      proposedEffectiveDate: z.string().nullable().optional(),
      marketOpeningRecommendation: z.string().nullable().optional(),
      reviewNotes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { coachOutId, ...fields } = input;
      const updateValues: any = { ...fields, updatedAt: sql`NOW()` };
      if (fields.proposedEffectiveDate !== undefined) updateValues.proposedEffectiveDate = fields.proposedEffectiveDate ? new Date(fields.proposedEffectiveDate) : null;
      if (["Approved", "Declined", "More Information Required"].includes(fields.status ?? "")) {
        updateValues.reviewedById = ctx.user.id;
        updateValues.reviewedAt = sql`NOW()`;
      }

      await db.update(coachOutRecommendations).set(updateValues).where(eq(coachOutRecommendations.id, coachOutId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSESSMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /** List assessments for an agent */
  listAssessments: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      return db.select().from(coachingAssessments).where(eq(coachingAssessments.agentId, input.agentId)).orderBy(desc(coachingAssessments.assessmentDate));
    }),

  /** Create an assessment */
  createAssessment: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      assessmentType: z.string().min(1),
      assessmentProvider: z.string().optional(),
      assessmentDate: z.string().optional(),
      rawText: z.string().optional(),
      fileUrl: z.string().optional(),
      fileKey: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [result] = await db.insert(coachingAssessments).values({
        ...input,
        uploadedById: ctx.user.id,
        assessmentDate: input.assessmentDate ? new Date(input.assessmentDate) : null,
      });

      return { success: true, assessmentId: (result as any).insertId };
    }),

  /** Update an assessment */
  updateAssessment: protectedProcedure
    .input(z.object({
      assessmentId: z.number(),
      communicationStyle: z.string().nullable().optional(),
      decisionMakingStyle: z.string().nullable().optional(),
      motivators: z.string().nullable().optional(),
      stressBehaviors: z.string().nullable().optional(),
      accountabilityPreferences: z.string().nullable().optional(),
      likelyStrengths: z.string().nullable().optional(),
      likelyBlindSpots: z.string().nullable().optional(),
      preferredCoachingStyle: z.string().nullable().optional(),
      potentialCoachingRisks: z.string().nullable().optional(),
      aiSummary: z.string().nullable().optional(),
      isSummaryApproved: z.boolean().optional(),
      rawText: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { assessmentId, ...fields } = input;
      await db.update(coachingAssessments).set({ ...fields, updatedAt: sql`NOW()` }).where(eq(coachingAssessments.id, assessmentId));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // AI PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  /** Generate AI summary and extract commitments from session notes/transcript */
  generateSessionSummary: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      forceRegenerate: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db
        .select({
          session: coachingSessions,
          agentName: users.name,
        })
        .from(coachingSessions)
        .leftJoin(users, eq(coachingSessions.agentId, users.id))
        .where(eq(coachingSessions.id, input.sessionId));

      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      if (!session.session.sourceNotes && !session.session.transcript) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No notes or transcript available to summarize." });
      }
      if (session.session.aiProcessingStatus === "Completed" && !input.forceRegenerate) {
        return { success: true, alreadyProcessed: true };
      }

      await db.update(coachingSessions).set({ aiProcessingStatus: "Processing" }).where(eq(coachingSessions.id, input.sessionId));

      try {
        const content = session.session.transcript || session.session.sourceNotes || "";
        const agentName = session.agentName ?? "the agent";

        // Get agent context for better AI analysis
        const [profile] = await db.select().from(coachingProfiles).where(eq(coachingProfiles.agentId, session.session.agentId));
        const goalsData = await getAgentGoalsWithProgress(db, session.session.agentId);

        const systemPrompt = `You are an expert real estate coaching analyst for Savvy STR Agents. 
You specialize in the Four-C coaching framework: Commitment, Capability, Cadence, and Capacity.
Your role is to analyze coaching session notes and produce structured, actionable summaries.

Definitions:
- Commitment: The agent's motivation, mindset, and dedication to the work.
- Capability: The agent's skills, knowledge, and ability to execute.
- Cadence: The agent's consistency, habits, and activity rhythms.
- Capacity: External constraints limiting the agent (lead volume, tools, support, market conditions).

Output JSON with this exact structure:
{
  "summary": "2-4 paragraph narrative summary of the session",
  "primaryDiagnosis": "Commitment|Capability|Cadence|Capacity|null",
  "secondaryDiagnosis": "Commitment|Capability|Cadence|Capacity|null",
  "diagnosisEvidence": "1-2 sentences explaining why this diagnosis was selected",
  "keyThemes": ["theme1", "theme2"],
  "commitments": [
    {
      "description": "Specific action item",
      "owner": "agent|coach",
      "dueDate": "YYYY-MM-DD or null",
      "expectedResult": "What success looks like",
      "relatedMetric": "GCI|Closings|Pipeline|Activity|null",
      "confidence": "high|medium|low"
    }
  ],
  "recommendedNextSessionFocus": "Brief description of what to cover next session",
  "coachingStyleNote": "Any observations about how to best coach this agent",
  "riskFlags": ["Any concerning patterns or red flags observed"],
  "wins": ["Any wins or positive progress to acknowledge"]
}`;

        const response = await invokeLLM({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Agent: ${agentName}\nCurrent Status: ${profile?.performanceStatus ?? 'Unknown'}\nAnnual Goal: ${goalsData.annualGoal?.closingsTarget ?? 'Not set'} closings\n\nSession Notes/Transcript:\n${content}` },
          ],
          response_format: { type: "json_object" },
        });

        const rawContent = response.choices[0]?.message?.content;
        const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "{}"));

        await db.update(coachingSessions).set({
          aiSummary: parsed.summary ?? null,
          primaryDiagnosis: (["Commitment", "Capability", "Cadence", "Capacity"].includes(parsed.primaryDiagnosis)) ? parsed.primaryDiagnosis : null,
          secondaryDiagnosis: (["Commitment", "Capability", "Cadence", "Capacity"].includes(parsed.secondaryDiagnosis)) ? parsed.secondaryDiagnosis : null,
          diagnosisEvidence: parsed.diagnosisEvidence ?? null,
          aiRecommendedCommitments: JSON.stringify(parsed.commitments ?? []),
          aiProcessingStatus: "Completed",
          updatedAt: sql`NOW()`,
        }).where(eq(coachingSessions.id, input.sessionId));

        // Auto-create AI-suggested commitments
        if (parsed.commitments && parsed.commitments.length > 0) {
          await db.insert(coachingCommitments).values(
            parsed.commitments.map((c: any) => ({
              agentId: session.session.agentId,
              sessionId: input.sessionId,
              description: c.description,
              ownerId: c.owner === "coach" ? (session.session.scheduledCoachId ?? session.session.agentId) : session.session.agentId,
              createdById: ctx.user.id,
              dueDate: c.dueDate ? new Date(c.dueDate) : null,
              expectedResult: c.expectedResult ?? null,
              relatedMetric: c.relatedMetric ?? null,
              status: "AI Suggested" as const,
              isAiExtracted: true,
              aiConfidence: c.confidence ?? "medium",
              visibilityLabel: "Agent Visible" as const,
            }))
          );
        }

        return { success: true, summary: parsed.summary, commitmentCount: parsed.commitments?.length ?? 0, parsed };
      } catch (err) {
        await db.update(coachingSessions).set({ aiProcessingStatus: "Failed" }).where(eq(coachingSessions.id, input.sessionId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI processing failed. Please try again." });
      }
    }),

  /** Generate AI summary for an assessment */
  generateAssessmentSummary: protectedProcedure
    .input(z.object({ assessmentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [assessment] = await db
        .select({
          assessment: coachingAssessments,
          agentName: users.name,
        })
        .from(coachingAssessments)
        .leftJoin(users, eq(coachingAssessments.agentId, users.id))
        .where(eq(coachingAssessments.id, input.assessmentId));

      if (!assessment) throw new TRPCError({ code: "NOT_FOUND" });
      if (!assessment.assessment.rawText) throw new TRPCError({ code: "BAD_REQUEST", message: "No assessment text available." });

      const response = await invokeLLM({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a coaching expert analyzing a ${assessment.assessment.assessmentType} assessment for a real estate agent. Extract and summarize the key coaching insights in JSON format: { "summary": "2-3 paragraph narrative", "communicationStyle": "How this person communicates", "decisionMakingStyle": "How they make decisions", "motivators": "What drives them", "stressBehaviors": "How they behave under pressure", "accountabilityPreferences": "How they prefer to be held accountable", "likelyStrengths": "Likely strengths as a real estate agent", "likelyBlindSpots": "Likely blind spots or growth areas", "preferredCoachingStyle": "Recommended coaching approach", "potentialCoachingRisks": "Risks or challenges in coaching this person" }`,
          },
          { role: "user", content: `Agent: ${assessment.agentName}\n\nAssessment Results:\n${assessment.assessment.rawText}` },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent2 = response.choices[0]?.message?.content;
      const parsed = JSON.parse(typeof rawContent2 === "string" ? rawContent2 : JSON.stringify(rawContent2 ?? "{}"));

      await db.update(coachingAssessments).set({
        aiSummary: parsed.summary ?? null,
        communicationStyle: parsed.communicationStyle ?? null,
        decisionMakingStyle: parsed.decisionMakingStyle ?? null,
        motivators: parsed.motivators ?? null,
        stressBehaviors: parsed.stressBehaviors ?? null,
        accountabilityPreferences: parsed.accountabilityPreferences ?? null,
        likelyStrengths: parsed.likelyStrengths ?? null,
        likelyBlindSpots: parsed.likelyBlindSpots ?? null,
        preferredCoachingStyle: parsed.preferredCoachingStyle ?? null,
        potentialCoachingRisks: parsed.potentialCoachingRisks ?? null,
        updatedAt: sql`NOW()`,
      }).where(eq(coachingAssessments.id, input.assessmentId));

      return { success: true, summary: parsed.summary };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKET COVERAGE
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get market coverage overview for coaching context */
  getMarketCoverage: protectedProcedure.query(async ({ ctx }) => {
    requireAdminOrCoach(ctx.user.role);
    const db = await getDb();
    if (!db) return [];

    const markets = await db
      .select({
        market: marketProfiles,
        agentCount: sql<number>`COUNT(DISTINCT ${marketAgentAssignments.agentId})`,
      })
      .from(marketProfiles)
      .leftJoin(marketAgentAssignments, eq(marketAgentAssignments.marketProfileId, marketProfiles.id))
      .groupBy(marketProfiles.id)
      .orderBy(marketProfiles.name);

    return markets;
  }),

  /** Get agents in a specific market with coaching context */
  getMarketAgents: protectedProcedure
    .input(z.object({ marketProfileId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          assignment: marketAgentAssignments,
          agent: { id: users.id, name: users.name, email: users.email },
          profile: coachingProfiles,
        })
        .from(marketAgentAssignments)
        .leftJoin(users, eq(marketAgentAssignments.agentId, users.id))
        .leftJoin(coachingProfiles, eq(coachingProfiles.agentId, users.id))
        .where(eq(marketAgentAssignments.marketProfileId, input.marketProfileId));
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get executive coaching scorecard */
  getExecutiveScorecard: protectedProcedure
    .input(z.object({ period: z.enum(["30d", "90d", "ytd"]).default("30d") }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return null;

      const now = new Date();
      let startDate: Date;
      if (input?.period === "90d") startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      else if (input?.period === "ytd") startDate = new Date(now.getFullYear(), 0, 1);
      else startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [sessionMetrics] = await db
        .select({
          totalSessions: sql<number>`COUNT(*)`,
          completedSessions: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'Completed' THEN 1 END)`,
          noShowSessions: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'No Show' THEN 1 END)`,
          canceledSessions: sql<number>`COUNT(CASE WHEN ${coachingSessions.status} = 'Canceled' THEN 1 END)`,
          avgDuration: sql<number>`AVG(${coachingSessions.durationMinutes})`,
        })
        .from(coachingSessions)
        .where(gte(coachingSessions.sessionDate, startDate));

      const [commitmentMetrics] = await db
        .select({
          totalCreated: sql<number>`COUNT(*)`,
          completed: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} = 'Completed' THEN 1 END)`,
          missed: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} = 'Missed' THEN 1 END)`,
          overdue: sql<number>`COUNT(CASE WHEN ${coachingCommitments.status} IN ('Not Started','In Progress') AND ${coachingCommitments.dueDate} < NOW() THEN 1 END)`,
        })
        .from(coachingCommitments)
        .where(gte(coachingCommitments.createdAt, startDate));

      const statusMovement = await db
        .select({
          status: coachingProfiles.performanceStatus,
          count: sql<number>`COUNT(*)`,
        })
        .from(coachingProfiles)
        .groupBy(coachingProfiles.performanceStatus);

      // Coach portfolio breakdown
      const coachPortfolios = await db
        .select({
          coachId: coachingProfiles.coachOfRecordId,
          coachName: users.name,
          agentCount: sql<number>`COUNT(*)`,
          redCount: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Red' THEN 1 END)`,
          yellowCount: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Yellow' THEN 1 END)`,
          greenCount: sql<number>`COUNT(CASE WHEN ${coachingProfiles.performanceStatus} = 'Green' THEN 1 END)`,
        })
        .from(coachingProfiles)
        .leftJoin(users, eq(coachingProfiles.coachOfRecordId, users.id))
        .where(isNotNull(coachingProfiles.coachOfRecordId))
        .groupBy(coachingProfiles.coachOfRecordId, users.name);

      return {
        period: input?.period ?? "30d",
        sessionMetrics: sessionMetrics ?? {},
        commitmentMetrics: commitmentMetrics ?? {},
        statusDistribution: Object.fromEntries(statusMovement.map((r: any) => [r.status, Number(r.count)])),
        coachPortfolios,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY SNAPSHOTS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get coaching history snapshots for an agent */
  getHistorySnapshots: protectedProcedure
    .input(z.object({ agentId: z.number(), limit: z.number().default(12) }))
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(coachingHistorySnapshots)
        .where(eq(coachingHistorySnapshots.agentId, input.agentId))
        .orderBy(desc(coachingHistorySnapshots.snapshotDate))
        .limit(input.limit);
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get all coaching settings */
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    requireAdminOrCoach(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    return db.select().from(coachingSettings).orderBy(coachingSettings.settingGroup, coachingSettings.settingKey);
  }),

  /** Upsert a coaching setting */
  upsertSetting: protectedProcedure
    .input(z.object({
      settingKey: z.string().min(1),
      settingValue: z.string(),
      settingLabel: z.string().optional(),
      settingGroup: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.insert(coachingSettings)
        .values({ ...input, updatedById: ctx.user.id })
        .onDuplicateKeyUpdate({ set: { settingValue: input.settingValue, updatedById: ctx.user.id, updatedAt: sql`NOW()` } });

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD SUMMARY (legacy — kept for backward compat)
  // ═══════════════════════════════════════════════════════════════════════════

  getDashboardSummary: protectedProcedure.query(async ({ ctx }) => {
    requireAdminOrCoach(ctx.user.role);
    const db = await getDb();
    if (!db) return null;

    const [statusCounts, riskCounts, upcomingSessions, openCommitmentsCount, activeResetsCount] = await Promise.all([
      db.select({ status: coachingProfiles.performanceStatus, count: sql<number>`COUNT(*)` }).from(coachingProfiles).groupBy(coachingProfiles.performanceStatus),
      db.select({ risk: coachingProfiles.retentionRiskStatus, count: sql<number>`COUNT(*)` }).from(coachingProfiles).groupBy(coachingProfiles.retentionRiskStatus),
      db.select({ session: coachingSessions, agentName: users.name })
        .from(coachingSessions).leftJoin(users, eq(coachingSessions.agentId, users.id))
        .where(and(eq(coachingSessions.status, "Scheduled"), sql`${coachingSessions.sessionDate} >= NOW()`, sql`${coachingSessions.sessionDate} <= DATE_ADD(NOW(), INTERVAL 7 DAY)`))
        .orderBy(coachingSessions.sessionDate).limit(10),
      db.select({ count: sql<number>`COUNT(*)` }).from(coachingCommitments).where(inArray(coachingCommitments.status, ["Not Started", "In Progress", "AI Suggested"])),
      db.select({ count: sql<number>`COUNT(*)` }).from(performanceResets).where(inArray(performanceResets.status, ["Active", "Improving"])),
    ]);

    return {
      statusCounts: Object.fromEntries(statusCounts.map((r: any) => [r.status, Number(r.count)])),
      riskCounts: Object.fromEntries(riskCounts.map((r: any) => [r.risk, Number(r.count)])),
      upcomingSessions,
      openCommitmentsCount: Number(openCommitmentsCount[0]?.count ?? 0),
      activeResetsCount: Number(activeResetsCount[0]?.count ?? 0),
    };
  }),

  /** Get list of all admin users for coach assignment dropdowns */
  listCoaches: protectedProcedure.query(async ({ ctx }) => {
    requireAdminOrCoach(ctx.user.role);
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(eq(users.role, "admin"), sql`users.isActive = 1`))
      .orderBy(users.name);
  }),
});
