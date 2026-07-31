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
} from "../../drizzle/schema";
import { eq, desc, and, sql, or, inArray, isNull, isNotNull, ne } from "drizzle-orm";
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

  const [prodStats] = await db
    .select({
      trailing90Units: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN ${transactions.id} END)`,
      trailing90Volume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'closed' AND ${transactions.closingDate} >= ${ninetyDaysAgo} THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      underContractUnits: sql<number>`COUNT(DISTINCT CASE WHEN ${transactions.status} = 'under_contract' THEN ${transactions.id} END)`,
      underContractVolume: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.status} = 'under_contract' THEN CAST(${transactions.purchasePrice} AS DECIMAL(15,2)) ELSE 0 END), 0)`,
      totalLeads: sql<number>`COUNT(DISTINCT ${agentConnections.id})`,
      overdueTaskCount: sql<number>`COUNT(DISTINCT CASE WHEN ${tasks.status} = 'pending' AND ${tasks.dueDate} < NOW() THEN ${tasks.id} END)`,
    })
    .from(users)
    .leftJoin(transactions, eq(transactions.agentId, users.id))
    .leftJoin(agentConnections, eq(agentConnections.agentId, users.id))
      .leftJoin(tasks, and(eq(tasks.assignedToId, users.id), eq(tasks.status, "pending")))
    .where(eq(users.id, agentId))
    .groupBy(users.id);

  return prodStats ?? {
    trailing90Units: 0,
    trailing90Volume: 0,
    underContractUnits: 0,
    underContractVolume: 0,
    totalLeads: 0,
    overdueTaskCount: 0,
  };
}

// ─── Coaching Router ──────────────────────────────────────────────────────────
export const coachingRouter = router({

  // ─── Profiles ─────────────────────────────────────────────────────────────

  /** List all agent coaching profiles with live production stats */
  listProfiles: protectedProcedure
    .input(z.object({
      performanceStatus: z.string().optional(),
      retentionRiskStatus: z.string().optional(),
      coachOfRecordId: z.number().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const coachAlias = aliasedTable(users, "coach");

      const conditions: any[] = [eq(users.role, "agent"), sql`users.isActive = 1`];
      if (input?.performanceStatus) conditions.push(eq(coachingProfiles.performanceStatus, input.performanceStatus as any));
      if (input?.retentionRiskStatus) conditions.push(eq(coachingProfiles.retentionRiskStatus, input.retentionRiskStatus as any));
      if (input?.coachOfRecordId) conditions.push(eq(coachingProfiles.coachOfRecordId, input.coachOfRecordId));
      if (input?.search) conditions.push(sql`users.name LIKE ${`%${input.search}%`}`);

      const profiles = await db
        .select({
          profile: coachingProfiles,
          agent: { id: users.id, name: users.name, email: users.email },
          coach: { id: coachAlias.id, name: coachAlias.name, email: coachAlias.email },
        })
        .from(users)
        .leftJoin(coachingProfiles, eq(coachingProfiles.agentId, users.id))
        .leftJoin(coachAlias, eq(coachingProfiles.coachOfRecordId, coachAlias.id))
        .where(and(...conditions))
        .orderBy(users.name);

      return profiles;
    }),

  /** Get a single agent's full coaching profile */
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

      // Get recent sessions
      const recentSessions = await db
        .select()
        .from(coachingSessions)
        .where(eq(coachingSessions.agentId, input.agentId))
        .orderBy(desc(coachingSessions.sessionDate))
        .limit(5);

      // Get open commitments
      const openCommitments = await db
        .select()
        .from(coachingCommitments)
        .where(and(
          eq(coachingCommitments.agentId, input.agentId),
          inArray(coachingCommitments.status, ["Not Started", "In Progress", "Submitted for Verification", "AI Suggested"]),
        ))
        .orderBy(coachingCommitments.dueDate)
        .limit(10);

      // Get active performance reset
      const [activeReset] = await db
        .select()
        .from(performanceResets)
        .where(and(
          eq(performanceResets.agentId, input.agentId),
          inArray(performanceResets.status, ["Active", "Improving", "Extension Requested", "Extended"]),
        ))
        .limit(1);

      return {
        profile: typedRow.profile,
        agent: typedRow.agent,
        coach: typedRow.coach,
        nextCoach: typedRow.nextCoach,
        prodStats,
        recentSessions,
        openCommitments,
        activeReset: activeReset ?? null,
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
      const updateValues: any = { ...fields };
      if (fields.nextSessionDate) updateValues.nextSessionDate = new Date(fields.nextSessionDate);
      if (fields.launchStartDate) updateValues.launchStartDate = new Date(fields.launchStartDate);
      updateValues.updatedAt = sql`NOW()`;

      await db
        .insert(coachingProfiles)
        .values(insertValues)
        .onDuplicateKeyUpdate({ set: updateValues });

      void logActivity({
        userId: ctx.user.id,
        action: "coaching_profile_updated",
        entityType: "coaching_profile",
        entityId: agentId,
        details: { updatedFields: Object.keys(fields) },
      });

      return { success: true };
    }),

  // ─── Sessions ─────────────────────────────────────────────────────────────

  /** List coaching sessions for an agent */
  listSessions: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      coachId: z.number().optional(),
      status: z.string().optional(),
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

  /** Get a single session with its commitments */
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

      const commitments = await db
        .select()
        .from(coachingCommitments)
        .where(eq(coachingCommitments.sessionId, input.sessionId))
        .orderBy(coachingCommitments.createdAt);

      return { ...row, commitments };
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

      void logActivity({
        userId: ctx.user.id,
        action: "coaching_session_created",
        entityType: "coaching_session",
        entityId: (result as any).insertId,
        details: { agentId: input.agentId, sessionType: input.sessionType },
      });

      return { success: true, sessionId: (result as any).insertId };
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

  // ─── Commitments ──────────────────────────────────────────────────────────

  /** List commitments for an agent */
  listCommitments: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      sessionId: z.number().optional(),
      status: z.string().optional(),
      includeCompleted: z.boolean().default(false),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(coachingCommitments.agentId, input.agentId));
      if (input?.sessionId) conditions.push(eq(coachingCommitments.sessionId, input.sessionId));
      if (input?.status) conditions.push(eq(coachingCommitments.status, input.status as any));
      if (!input?.includeCompleted) {
        conditions.push(sql`${coachingCommitments.status} NOT IN ('Completed', 'Waived', 'No Longer Relevant')`);
      }

      return db
        .select()
        .from(coachingCommitments)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(coachingCommitments.dueDate, coachingCommitments.createdAt);
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

  // ─── Performance Resets ───────────────────────────────────────────────────

  /** List performance resets for an agent */
  listResets: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const resets = await db
        .select()
        .from(performanceResets)
        .where(eq(performanceResets.agentId, input.agentId))
        .orderBy(desc(performanceResets.createdAt));

      // Fetch requirements and checkpoints for each reset
      const resetIds = resets.map(r => r.id);
      if (resetIds.length === 0) return [];

      const [requirements, checkpoints] = await Promise.all([
        db.select().from(performanceResetRequirements).where(inArray(performanceResetRequirements.resetId, resetIds)),
        db.select().from(performanceResetCheckpoints).where(inArray(performanceResetCheckpoints.resetId, resetIds)),
      ]);

      return resets.map(reset => ({
        ...reset,
        requirements: requirements.filter(r => r.resetId === reset.id),
        checkpoints: checkpoints.filter(c => c.resetId === reset.id),
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

      // Create requirements if provided
      if (input.requirements && input.requirements.length > 0) {
        await db.insert(performanceResetRequirements).values(
          input.requirements.map((r, i) => ({ resetId, description: r.description, sortOrder: i }))
        );
      }

      // Auto-create checkpoints: Week 1, Week 2, Week 3, Day 30
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

  // ─── Capacity Escalations ─────────────────────────────────────────────────

  /** List capacity escalations */
  listEscalations: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(capacityEscalations.agentId, input.agentId));
      if (input?.status) conditions.push(eq(capacityEscalations.status, input.status as any));

      const agentAlias = aliasedTable(users, "escAgent");
      const ownerAlias = aliasedTable(users, "escOwner");

      return db
        .select({
          escalation: capacityEscalations,
          agent: { id: agentAlias.id, name: agentAlias.name },
          owner: { id: ownerAlias.id, name: ownerAlias.name },
        })
        .from(capacityEscalations)
        .leftJoin(agentAlias, eq(capacityEscalations.agentId, agentAlias.id))
        .leftJoin(ownerAlias, eq(capacityEscalations.assignedOwnerId, ownerAlias.id))
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

  // ─── Coach-Out Recommendations ────────────────────────────────────────────

  /** List coach-out recommendations */
  listCoachOuts: protectedProcedure
    .input(z.object({ agentId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      requireAdminOrCoach(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      const conditions: any[] = [];
      if (input?.agentId) conditions.push(eq(coachOutRecommendations.agentId, input.agentId));

      return db
        .select()
        .from(coachOutRecommendations)
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

  // ─── Assessments ──────────────────────────────────────────────────────────

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

  // ─── AI Processing ────────────────────────────────────────────────────────

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

      // Mark as processing
      await db.update(coachingSessions).set({ aiProcessingStatus: "Processing" }).where(eq(coachingSessions.id, input.sessionId));

      try {
        const content = session.session.transcript || session.session.sourceNotes || "";
        const agentName = session.agentName ?? "the agent";

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
  "coachingStyleNote": "Any observations about how to best coach this agent"
}`;

        const response = await invokeLLM({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Agent: ${agentName}\n\nSession Notes/Transcript:\n${content}` },
          ],
          response_format: { type: "json_object" },
        });

        const rawContent = response.choices[0]?.message?.content;
        const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "{}"));

        // Update session with AI results
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

        return { success: true, summary: parsed.summary, commitmentCount: parsed.commitments?.length ?? 0 };
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

  // ─── History Snapshots ────────────────────────────────────────────────────

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

  // ─── Settings ─────────────────────────────────────────────────────────────

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

  // ─── Dashboard Summary ────────────────────────────────────────────────────

  /** Get a high-level coaching hub dashboard summary */
  getDashboardSummary: protectedProcedure.query(async ({ ctx }) => {
    requireAdminOrCoach(ctx.user.role);
    const db = await getDb();
    if (!db) return null;

    const [statusCounts, riskCounts, upcomingSessions, openCommitmentsCount, activeResetsCount] = await Promise.all([
      db.select({
        status: coachingProfiles.performanceStatus,
        count: sql<number>`COUNT(*)`,
      }).from(coachingProfiles).groupBy(coachingProfiles.performanceStatus),

      db.select({
        risk: coachingProfiles.retentionRiskStatus,
        count: sql<number>`COUNT(*)`,
      }).from(coachingProfiles).groupBy(coachingProfiles.retentionRiskStatus),

      db.select({
        session: coachingSessions,
        agentName: users.name,
      })
        .from(coachingSessions)
        .leftJoin(users, eq(coachingSessions.agentId, users.id))
        .where(and(
          eq(coachingSessions.status, "Scheduled"),
          sql`${coachingSessions.sessionDate} >= NOW()`,
          sql`${coachingSessions.sessionDate} <= DATE_ADD(NOW(), INTERVAL 7 DAY)`,
        ))
        .orderBy(coachingSessions.sessionDate)
        .limit(10),

      db.select({ count: sql<number>`COUNT(*)` })
        .from(coachingCommitments)
        .where(inArray(coachingCommitments.status, ["Not Started", "In Progress", "AI Suggested"])),

      db.select({ count: sql<number>`COUNT(*)` })
        .from(performanceResets)
        .where(inArray(performanceResets.status, ["Active", "Improving"])),
    ]);

    return {
      statusCounts: Object.fromEntries(statusCounts.map(r => [r.status, Number(r.count)])),
      riskCounts: Object.fromEntries(riskCounts.map(r => [r.risk, Number(r.count)])),
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
