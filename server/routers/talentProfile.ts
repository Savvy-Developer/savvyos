/**
 * Savvy Talent Profile — tRPC Router
 * Public procedures: start, save, resume, submit assessment
 * Admin procedures: view results, manage role profiles, item bank, reports, audit
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { invokeLLM } from "../_core/llm";
import {
  calcAllDimensionScores,
  calcWorkStrengths,
  calcMotivatorResults,
  calcResponseConfidence,
  getStrengthsUnderPressure,
  getRoleAlignment,
  DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  DIMENSION_BANDS,
  MOTIVATORS,
  WORK_STRENGTH_THEMES,
  SCORING_VERSION,
} from "../lib/stpScoring";

const APP_URL = process.env.APP_URL || "https://os.savvy-agents.com";

// ── Helper: verify session token ──────────────────────────────────────────────
async function verifySessionToken(db: any, token: string) {
  const rows = await db.execute(
    sql`SELECT * FROM stp_sessions WHERE token = ${token} LIMIT 1`
  );
  const session = rows[0]?.[0] ?? rows[0];
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid session token." });
  if (session.status === "expired") throw new TRPCError({ code: "UNAUTHORIZED", message: "Session has expired." });
  return session;
}

// ── Helper: get all items from DB ─────────────────────────────────────────────
async function getAllItems(db: any) {
  const rows = await db.execute(sql`SELECT id, dimension, itemText, responseScale, isReversed, sortOrder FROM stp_items WHERE status = 'active' ORDER BY sortOrder`);
  return ((rows as unknown as any[][])[0] ?? (rows as unknown as any[])) as Array<{ id: number; dimension: string; itemText: string; responseScale: string; isReversed: number; sortOrder: number }>;
}

// ── Helper: write audit log ───────────────────────────────────────────────────
async function writeAudit(db: any, userId: string | null, action: string, objectType: string, objectId: string, prev?: any, next?: any) {
  await db.execute(sql`
    INSERT INTO stp_audit_log (userId, action, objectType, objectId, previousValueJson, newValueJson)
    VALUES (${userId}, ${action}, ${objectType}, ${objectId}, ${prev ? JSON.stringify(prev) : null}, ${next ? JSON.stringify(next) : null})
  `);
}

export const talentProfileRouter = router({

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC PROCEDURES
  // ══════════════════════════════════════════════════════════════════════════

  // ── Get assessment items for a session ────────────────────────────────────
  getAssessmentItems: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const session = await verifySessionToken(db, input.token);
      const items = await getAllItems(db);
      const workstyleItems = items.filter(i => i.dimension !== "motivator" && i.dimension !== "consistency");
      const motivatorItems = items.filter(i => i.dimension === "motivator");
      const consistencyItems = items.filter(i => i.dimension === "consistency");
      return {
        session: {
          id: session.id,
          status: session.status,
          candidateName: session.candidateName,
          candidateEmail: session.candidateEmail,
          jobPostingId: session.jobPostingId,
          consentGiven: session.consentGiven,
          currentSection: session.currentSection,
          responsesJson: session.responsesJson ? JSON.parse(session.responsesJson) : {},
        },
        workstyleItems: workstyleItems.map(i => ({
          id: i.id,
          dimension: i.dimension,
          itemText: i.itemText,
          isReversed: Boolean(i.isReversed),
        })),
        motivatorItems: motivatorItems.map(i => ({
          id: i.id,
          motivatorId: i.itemText.split(" — ")[0].toLowerCase().replace(/\s+/g, "_"),
          label: i.itemText.split(" — ")[0],
          description: i.itemText.split(" — ")[1] ?? "",
        })),
        consistencyItems: consistencyItems.map(i => ({
          id: i.id,
          itemText: i.itemText,
          sourceNote: i.sortOrder,
        })),
        dimensions: DIMENSIONS.map(d => ({
          id: d,
          label: DIMENSION_LABELS[d],
          definition: DIMENSION_DESCRIPTIONS[d].definition,
          lowAnchor: DIMENSION_DESCRIPTIONS[d].low,
          highAnchor: DIMENSION_DESCRIPTIONS[d].high,
        })),
      };
    }),

  // ── Record consent ─────────────────────────────────────────────────────────
  recordConsent: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      consentGiven: z.boolean(),
      consentText: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const session = await verifySessionToken(db, input.token);
      await db.execute(sql`
        UPDATE stp_sessions SET consentGiven = ${input.consentGiven ? 1 : 0}, consentTimestamp = NOW(),
        status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
        startedAt = CASE WHEN startedAt IS NULL THEN NOW() ELSE startedAt END
        WHERE id = ${session.id}
      `);
      await db.execute(sql`
        INSERT INTO stp_consent_records (sessionId, consentText, consentGiven)
        VALUES (${session.id}, ${input.consentText}, ${input.consentGiven ? 1 : 0})
      `);
      return { ok: true };
    }),

  // ── Save answer(s) ─────────────────────────────────────────────────────────
  saveAnswers: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      responses: z.record(z.string(), z.number().int().min(1).max(6)),
      currentSection: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const session = await verifySessionToken(db, input.token);
      if (session.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Assessment already completed." });

      const existing = session.responsesJson ? JSON.parse(session.responsesJson) : {};
      const merged = { ...existing, ...input.responses };

      await db.execute(sql`
        UPDATE stp_sessions SET responsesJson = ${JSON.stringify(merged)},
        currentSection = ${input.currentSection ?? session.currentSection},
        lastSavedAt = NOW(), status = 'in_progress'
        WHERE id = ${session.id}
      `);
      return { ok: true, savedCount: Object.keys(input.responses).length };
    }),

  // ── Save motivator rankings ────────────────────────────────────────────────
  saveMotivatorRankings: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      rankings: z.array(z.object({ motivatorId: z.string(), rank: z.number().int().min(1).max(10) })),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const session = await verifySessionToken(db, input.token);
      if (session.status === "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Assessment already completed." });

      const existing = session.responsesJson ? JSON.parse(session.responsesJson) : {};
      existing.__motivator_rankings = input.rankings;
      await db.execute(sql`
        UPDATE stp_sessions SET responsesJson = ${JSON.stringify(existing)}, lastSavedAt = NOW() WHERE id = ${session.id}
      `);
      return { ok: true };
    }),

  // ── Submit assessment ──────────────────────────────────────────────────────
  submitAssessment: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const session = await verifySessionToken(db, input.token);
      if (session.status === "completed") return { ok: true, sessionId: session.id };

      const responses: Record<number, number> = {};
      const rawResponses = session.responsesJson ? JSON.parse(session.responsesJson) : {};
      for (const [k, v] of Object.entries(rawResponses)) {
        if (k !== "__motivator_rankings") responses[parseInt(k)] = v as number;
      }

      const items = await getAllItems(db);
      const workstyleItems = items.filter(i => i.dimension !== "motivator" && i.dimension !== "consistency");
      const consistencyItems = items.filter(i => i.dimension === "consistency");

      // Calculate dimension scores
      const dimensionScores = calcAllDimensionScores(
        workstyleItems.map(i => ({ id: i.id, dimension: i.dimension, isReversed: Boolean(i.isReversed) })),
        responses
      );

      // Save dimension scores
      for (const dim of DIMENSIONS) {
        const ds = dimensionScores[dim];
        await db.execute(sql`
          INSERT INTO stp_dimension_scores (sessionId, dimension, scaledScore, band, itemCount, answeredCount, scoringVersion)
          VALUES (${session.id}, ${dim}, ${ds.scaledScore}, ${ds.band}, ${ds.itemCount}, ${ds.answeredCount}, ${SCORING_VERSION})
        `);
      }

      // Calculate work strengths
      const strengths = calcWorkStrengths(dimensionScores);
      await db.execute(sql`
        INSERT INTO stp_work_strength_results (sessionId, strengthsJson, topStrengths, scoringVersion)
        VALUES (${session.id}, ${JSON.stringify(strengths)}, ${strengths.slice(0, 5).map(s => s.name).join(", ")}, ${SCORING_VERSION})
      `);

      // Calculate motivator results
      const motivatorRankings = rawResponses.__motivator_rankings ?? [];
      if (motivatorRankings.length > 0) {
        const motivatorResults = calcMotivatorResults(motivatorRankings);
        await db.execute(sql`
          INSERT INTO stp_motivator_results (sessionId, motivatorsJson, topMotivators, scoringVersion)
          VALUES (${session.id}, ${JSON.stringify(motivatorResults)}, ${motivatorResults.slice(0, 3).map((m: any) => m.label).join(", ")}, ${SCORING_VERSION})
        `);
      }

      // Calculate response confidence
      const consistencyPairs = [
        { itemA: consistencyItems[0]?.id, itemB: consistencyItems[1]?.id, expectOpposite: true },
        { itemA: consistencyItems[2]?.id, itemB: consistencyItems[3]?.id, expectOpposite: true },
        { itemA: consistencyItems[4]?.id, itemB: consistencyItems[5]?.id, expectOpposite: true },
      ].filter(p => p.itemA && p.itemB);

      const confidence = calcResponseConfidence({
        totalItems: workstyleItems.length,
        answeredItems: Object.keys(responses).length,
        consistencyPairs,
        responses,
      });
      await db.execute(sql`
        INSERT INTO stp_response_confidence (sessionId, completionRate, consistencyScore, repetitionFlag, confidenceLabel)
        VALUES (${session.id}, ${confidence.completionRate}, ${confidence.consistencyScore}, ${confidence.repetitionFlag ? 1 : 0}, ${confidence.label})
      `);

      // Mark session complete
      await db.execute(sql`
        UPDATE stp_sessions SET status = 'completed', completedAt = NOW() WHERE id = ${session.id}
      `);

      await writeAudit(db, null, "assessment_submitted", "stp_session", String(session.id));
      return { ok: true, sessionId: session.id };
    }),

  // ── Get candidate results (for candidate-facing report) ───────────────────
  getCandidateResults: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const session = await verifySessionToken(db, input.token);
      if (session.status !== "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Assessment not yet completed." });

      const dimRows = await db.execute(sql`SELECT * FROM stp_dimension_scores WHERE sessionId = ${session.id}`);
      const dimScores = (dimRows as unknown as any[][])[0] ?? (dimRows as unknown as any[]);

      const strengthRows = await db.execute(sql`SELECT * FROM stp_work_strength_results WHERE sessionId = ${session.id} LIMIT 1`);
      const strengthResult = ((strengthRows as unknown as any[][])[0] ?? (strengthRows as unknown as any[]))[0];

      const motivatorRows = await db.execute(sql`SELECT * FROM stp_motivator_results WHERE sessionId = ${session.id} LIMIT 1`);
      const motivatorResult = ((motivatorRows as unknown as any[][])[0] ?? (motivatorRows as unknown as any[]))[0];

      const confidenceRows = await db.execute(sql`SELECT * FROM stp_response_confidence WHERE sessionId = ${session.id} LIMIT 1`);
      const confidence = ((confidenceRows as unknown as any[][])[0] ?? (confidenceRows as unknown as any[]))[0];

      const dimensionMap: Record<string, any> = {};
      for (const row of dimScores) {
        dimensionMap[row.dimension] = {
          scaledScore: row.scaledScore,
          band: row.band,
          answeredCount: row.answeredCount,
          itemCount: row.itemCount,
          label: DIMENSION_LABELS[row.dimension as typeof DIMENSIONS[number]] ?? row.dimension,
          description: DIMENSION_DESCRIPTIONS[row.dimension as typeof DIMENSIONS[number]],
          bands: DIMENSION_BANDS[row.dimension as typeof DIMENSIONS[number]],
        };
      }

      const strengths = strengthResult ? JSON.parse(strengthResult.strengthsJson) : [];
      const motivators = motivatorResult ? JSON.parse(motivatorResult.motivatorsJson) : [];

      // Generate strengths under pressure
      const dimScoreMap = Object.fromEntries(
        dimScores.map((d: any) => [d.dimension, { scaledScore: d.scaledScore }])
      ) as any;
      const pressurePatterns = getStrengthsUnderPressure(dimScoreMap);

      return {
        session: { id: session.id, candidateName: session.candidateName, candidateEmail: session.candidateEmail, completedAt: session.completedAt },
        dimensions: dimensionMap,
        topStrengths: strengths.slice(0, 5),
        allStrengths: strengths,
        motivators,
        pressurePatterns,
        confidence: confidence ? { label: confidence.confidenceLabel, completionRate: confidence.completionRate } : null,
        disclaimer: "PROVISIONAL: Initial scoring ranges and interpretations are provisional and have not yet been validated against a normative sample. Results should be used as one input in a broader hiring process, not as a standalone selection tool.",
      };
    }),

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN PROCEDURES
  // ══════════════════════════════════════════════════════════════════════════

  // ── Create assessment session (admin sends link to candidate) ─────────────
  createSession: protectedProcedure
    .input(z.object({
      candidateEmail: z.string().email(),
      candidateName: z.string().optional(),
      jobApplicationId: z.number().int().positive().optional(),
      jobPostingId: z.number().int().positive().optional(),
      roleId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const token = nanoid(64);
      await db.execute(sql`
        INSERT INTO stp_sessions (candidateEmail, candidateName, jobApplicationId, jobPostingId, roleId, token, status)
        VALUES (${input.candidateEmail}, ${input.candidateName ?? null}, ${input.jobApplicationId ?? null}, ${input.jobPostingId ?? null}, ${input.roleId ?? null}, ${token}, 'not_started')
      `);

      const assessmentLink = `${APP_URL}/talent-profile?token=${token}`;
      await writeAudit(db, String(ctx.user.id), "session_created", "stp_session", token, null, { candidateEmail: input.candidateEmail });
      return { ok: true, token, assessmentLink };
    }),

  // ── List all assessment sessions ──────────────────────────────────────────
  listSessions: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      jobPostingId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return { sessions: [], total: 0 };

      let whereClause = sql`1=1`;
      if (input.status) whereClause = sql`${whereClause} AND s.status = ${input.status}`;
      if (input.jobPostingId) whereClause = sql`${whereClause} AND s.jobPostingId = ${input.jobPostingId}`;

      const rows = await db.execute(sql`
        SELECT s.id, s.candidateEmail, s.candidateName, s.status, s.jobPostingId, s.jobApplicationId,
               s.completedAt, s.startedAt, s.createdAt,
               ds.scaledScore as avgScore,
               wsr.topStrengths,
               mr.topMotivators,
               rc.confidenceLabel
        FROM stp_sessions s
        LEFT JOIN (SELECT sessionId, AVG(scaledScore) as scaledScore FROM stp_dimension_scores GROUP BY sessionId) ds ON ds.sessionId = s.id
        LEFT JOIN stp_work_strength_results wsr ON wsr.sessionId = s.id
        LEFT JOIN stp_motivator_results mr ON mr.sessionId = s.id
        LEFT JOIN stp_response_confidence rc ON rc.sessionId = s.id
        WHERE ${whereClause}
        ORDER BY s.createdAt DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);

      const countRows = await db.execute(sql`SELECT COUNT(*) as total FROM stp_sessions s WHERE ${whereClause}`);
      const total = ((countRows as unknown as any[][])[0] ?? (countRows as unknown as any[]))[0]?.total ?? 0;

      return { sessions: rows[0] ?? rows, total };
    }),

  // ── Get full admin view of a session ──────────────────────────────────────
  getSessionAdmin: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const sessionRows = await db.execute(sql`SELECT * FROM stp_sessions WHERE id = ${input.sessionId} LIMIT 1`);
      const session = ((sessionRows as unknown as any[][])[0] ?? (sessionRows as unknown as any[]))[0];
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });

      const dimRows = await db.execute(sql`SELECT * FROM stp_dimension_scores WHERE sessionId = ${input.sessionId}`);
      const strengthRows = await db.execute(sql`SELECT * FROM stp_work_strength_results WHERE sessionId = ${input.sessionId} LIMIT 1`);
      const motivatorRows = await db.execute(sql`SELECT * FROM stp_motivator_results WHERE sessionId = ${input.sessionId} LIMIT 1`);
      const confidenceRows = await db.execute(sql`SELECT * FROM stp_response_confidence WHERE sessionId = ${input.sessionId} LIMIT 1`);
      const reportRows = await db.execute(sql`SELECT id, reportType, generatedAt, generatedBy FROM stp_reports WHERE sessionId = ${input.sessionId} ORDER BY generatedAt DESC`);
      const outcomeRows = await db.execute(sql`SELECT * FROM stp_outcome_records WHERE sessionId = ${input.sessionId} ORDER BY checkpointDays`);
      const importRows = await db.execute(sql`SELECT * FROM stp_licensed_imports WHERE sessionId = ${input.sessionId}`);

      const dimScores = (dimRows as unknown as any[][])[0] ?? (dimRows as unknown as any[]);
      const strengthResult = ((strengthRows as unknown as any[][])[0] ?? (strengthRows as unknown as any[]))[0];
      const motivatorResult = ((motivatorRows as unknown as any[][])[0] ?? (motivatorRows as unknown as any[]))[0];
      const confidence = ((confidenceRows as unknown as any[][])[0] ?? (confidenceRows as unknown as any[]))[0];

      const dimensionMap: Record<string, any> = {};
      for (const row of dimScores) {
        dimensionMap[row.dimension] = {
          scaledScore: row.scaledScore,
          band: row.band,
          answeredCount: row.answeredCount,
          itemCount: row.itemCount,
          label: DIMENSION_LABELS[row.dimension as typeof DIMENSIONS[number]] ?? row.dimension,
          description: DIMENSION_DESCRIPTIONS[row.dimension as typeof DIMENSIONS[number]],
        };
      }

      const strengths = strengthResult ? JSON.parse(strengthResult.strengthsJson) : [];
      const motivators = motivatorResult ? JSON.parse(motivatorResult.motivatorsJson) : [];

      const dimScoreMap = Object.fromEntries(dimScores.map((d: any) => [d.dimension, { scaledScore: d.scaledScore }])) as any;
      const pressurePatterns = Object.keys(dimScoreMap).length > 0 ? getStrengthsUnderPressure(dimScoreMap) : [];

      return {
        session,
        dimensions: dimensionMap,
        topStrengths: strengths.slice(0, 5),
        allStrengths: strengths,
        motivators,
        pressurePatterns,
        confidence: confidence ? { label: confidence.confidenceLabel, completionRate: confidence.completionRate, consistencyScore: confidence.consistencyScore, repetitionFlag: confidence.repetitionFlag } : null,
        reports: reportRows[0] ?? reportRows,
        outcomes: outcomeRows[0] ?? outcomeRows,
        licensedImports: importRows[0] ?? importRows,
        disclaimer: "PROVISIONAL: Initial scoring ranges and interpretations are provisional. Professional review by a qualified I-O psychologist and employment counsel is recommended before using results as a high-weight selection or rejection tool.",
      };
    }),

  // ── Generate AI narrative report ──────────────────────────────────────────
  generateReport: protectedProcedure
    .input(z.object({
      sessionId: z.number().int().positive(),
      reportType: z.enum(["candidate", "hiring", "manager"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const sessionRows = await db.execute(sql`SELECT * FROM stp_sessions WHERE id = ${input.sessionId} LIMIT 1`);
      const session = ((sessionRows as unknown as any[][])[0] ?? (sessionRows as unknown as any[]))[0];
      if (!session || session.status !== "completed") throw new TRPCError({ code: "BAD_REQUEST", message: "Session not completed." });

      const dimRows = await db.execute(sql`SELECT * FROM stp_dimension_scores WHERE sessionId = ${input.sessionId}`);
      const dimScores = (dimRows as unknown as any[][])[0] ?? (dimRows as unknown as any[]);
      const strengthRows = await db.execute(sql`SELECT * FROM stp_work_strength_results WHERE sessionId = ${input.sessionId} LIMIT 1`);
      const strengthResult = ((strengthRows as unknown as any[][])[0] ?? (strengthRows as unknown as any[]))[0];
      const motivatorRows = await db.execute(sql`SELECT * FROM stp_motivator_results WHERE sessionId = ${input.sessionId} LIMIT 1`);
      const motivatorResult = ((motivatorRows as unknown as any[][])[0] ?? (motivatorRows as unknown as any[]))[0];

      const strengths = strengthResult ? JSON.parse(strengthResult.strengthsJson).slice(0, 5) : [];
      const motivators = motivatorResult ? JSON.parse(motivatorResult.motivatorsJson).slice(0, 3) : [];

      const dimSummary = dimScores.map((d: any) =>
        `${DIMENSION_LABELS[d.dimension as typeof DIMENSIONS[number]] ?? d.dimension}: ${d.scaledScore}/100 (${d.band})`
      ).join("\n");

      const strengthSummary = strengths.map((s: any) => `${s.name} (score: ${s.score})`).join(", ");
      const motivatorSummary = motivators.map((m: any) => `${m.label} (rank ${m.rank})`).join(", ");

      const dimScoreMap = Object.fromEntries(dimScores.map((d: any) => [d.dimension, { scaledScore: d.scaledScore }])) as any;
      const pressurePatterns = getStrengthsUnderPressure(dimScoreMap);

      let prompt = "";
      const candidateName = session.candidateName ?? "the candidate";

      if (input.reportType === "candidate") {
        prompt = `You are writing a professional, encouraging, and honest workstyle report for ${candidateName} based on their Savvy Talent Profile assessment results.

IMPORTANT RULES:
- Do NOT use any language from DISC, Predictive Index, Kolbe, CliftonStrengths, or any other proprietary assessment
- Do NOT say things like "You are a High D" or "You are a Quick Start"
- Do NOT make clinical inferences or use mental health terminology
- Do NOT claim the assessment is validated or predictive
- Label all interpretations as provisional
- Be respectful, balanced, and practical

Assessment Results:
${dimSummary}

Top Work Strengths: ${strengthSummary}
Top Motivators: ${motivatorSummary}

Write a 4-section candidate report:
1. Personal Operating Summary (2-3 paragraphs describing how this person tends to approach work, based ONLY on the scores above)
2. How I Work Best (bullet points covering: communication style, decision-making, information needs, approach to change, collaboration preferences)
3. Motivator Insights (what energizes this person and what may drain them, based on their top motivators)
4. Growth Opportunities (2-3 practical development suggestions framed positively, not as deficiencies)

End with: "Note: These results are provisional and should be interpreted as one perspective on your natural tendencies, not a fixed description of who you are."`;
      } else if (input.reportType === "hiring") {
        const pressureSummary = pressurePatterns.slice(0, 3).map(p => `${p.pattern}: ${p.description}`).join("\n");
        prompt = `You are writing a private hiring team report for ${candidateName} based on their Savvy Talent Profile results.

IMPORTANT RULES:
- Do NOT create an overall "good/bad candidate" score
- Do NOT recommend rejection based on personality results
- Do NOT use clinical language
- Keep workstyle evidence clearly separate from job-specific evidence
- Label all interpretations as provisional

Assessment Results:
${dimSummary}

Top Work Strengths: ${strengthSummary}
Top Motivators: ${motivatorSummary}

Potential Strengths Under Pressure:
${pressureSummary || "None identified at current score thresholds."}

Write a 4-section hiring team report:
1. Candidate Workstyle Summary (2 paragraphs — what this person's natural operating style looks like in a salaried role)
2. Likely Contributions (3-4 bullet points based on top strengths)
3. Areas to Explore in Interview (3-4 specific interview questions based on the pressure patterns and lower-scoring dimensions — frame as exploration, not red flags)
4. Management Considerations (how to onboard and manage this person effectively if hired)

End with: "IMPORTANT: This report reflects one evidence lane. Workstyle results must be weighed alongside structured interview evidence, work samples, and job-specific judgment. No personality result should be used as a standalone rejection criterion."`;
      } else {
        prompt = `You are writing a manager onboarding guide for ${candidateName} based on their Savvy Talent Profile results. This report is used AFTER hire.

Assessment Results:
${dimSummary}
Top Motivators: ${motivatorSummary}

Write a practical manager guide with:
1. Best Ways to Communicate (3-4 bullet points)
2. How to Delegate Effectively (2-3 bullet points)
3. What Motivates and Sustains Them (based on top motivators)
4. Potential Friction Points (2-3 areas where management approach may need adjustment)
5. 30/60/90 Day Coaching Questions (2 questions per milestone)

End with: "These suggestions are starting hypotheses. Update your approach based on observed behavior — real performance data is always more authoritative than assessment results."`;
      }

      const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], model: "gpt-5-mini" });
      const rawContent = response.choices?.[0]?.message?.content;
      const narrative = (typeof rawContent === "string" ? rawContent : null) ?? "Unable to generate report.";

      const contentJson = JSON.stringify({ dimensions: dimScores, strengths, motivators, pressurePatterns });
      const reportRows = await db.execute(sql`
        INSERT INTO stp_reports (sessionId, reportType, contentJson, narrativeHtml, aiModel, aiPromptVersion, aiInputJson, generatedBy)
        VALUES (${input.sessionId}, ${input.reportType}, ${contentJson}, ${narrative}, 'gpt-5-mini', '1.0', ${prompt}, ${ctx.user.email ?? "admin"})
      `);

      await db.execute(sql`
        INSERT INTO stp_ai_generation_log (sessionId, model, promptVersion, inputJson, outputText)
        VALUES (${input.sessionId}, 'gpt-5-mini', '1.0', ${prompt}, ${narrative})
      `);

      return { ok: true, narrative, reportId: (reportRows[0] as any)?.insertId };
    }),

  // ── Get a specific report ─────────────────────────────────────────────────
  getReport: protectedProcedure
    .input(z.object({ reportId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.execute(sql`SELECT * FROM stp_reports WHERE id = ${input.reportId} LIMIT 1`);
      const report = ((rows as unknown as any[][])[0] ?? (rows as unknown as any[]))[0];
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      return report;
    }),

  // ── Role Profile CRUD ─────────────────────────────────────────────────────
  listRoleProfiles: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`SELECT id, title, department, status, version, approvedBy, approvedAt, createdAt FROM stp_role_profiles ORDER BY createdAt DESC`);
      return rows[0] ?? rows;
    }),

  getRoleProfile: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.execute(sql`SELECT * FROM stp_role_profiles WHERE id = ${input.id} LIMIT 1`);
      const profile = ((rows as unknown as any[][])[0] ?? (rows as unknown as any[]))[0];
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      const dimRows = await db.execute(sql`SELECT * FROM stp_role_dimension_ranges WHERE roleProfileId = ${input.id}`);
      const successRows = await db.execute(sql`SELECT * FROM stp_role_success_profiles WHERE roleProfileId = ${input.id}`);
      return { ...profile, dimensionRanges: dimRows[0] ?? dimRows, successProfiles: successRows[0] ?? successRows };
    }),

  upsertRoleProfile: protectedProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      title: z.string().min(1).max(255),
      department: z.string().max(128).optional(),
      reportingManager: z.string().max(255).optional(),
      jobDescription: z.string().optional(),
      primaryOutcomes: z.string().optional(),
      criticalTasks: z.string().optional(),
      status: z.enum(["draft", "active", "archived"]).default("draft"),
      dimensionRanges: z.array(z.object({
        dimension: z.string(),
        preferredMin: z.number().int().min(0).max(100).optional(),
        preferredMax: z.number().int().min(0).max(100).optional(),
        acceptableMin: z.number().int().min(0).max(100).optional(),
        acceptableMax: z.number().int().min(0).max(100).optional(),
        importance: z.enum(["important", "useful", "neutral", "irrelevant"]).default("neutral"),
        rationale: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let profileId = input.id;
      if (profileId) {
        await db.execute(sql`
          UPDATE stp_role_profiles SET title = ${input.title}, department = ${input.department ?? null},
          reportingManager = ${input.reportingManager ?? null}, jobDescription = ${input.jobDescription ?? null},
          primaryOutcomes = ${input.primaryOutcomes ?? null}, criticalTasks = ${input.criticalTasks ?? null},
          status = ${input.status}, updatedAt = NOW()
          WHERE id = ${profileId}
        `);
        await writeAudit(db, String(ctx.user.id), "role_profile_updated", "stp_role_profile", String(profileId));
      } else {
        const result = await db.execute(sql`
          INSERT INTO stp_role_profiles (title, department, reportingManager, jobDescription, primaryOutcomes, criticalTasks, status)
          VALUES (${input.title}, ${input.department ?? null}, ${input.reportingManager ?? null}, ${input.jobDescription ?? null}, ${input.primaryOutcomes ?? null}, ${input.criticalTasks ?? null}, ${input.status})
        `);
        profileId = (result[0] as any)?.insertId;
        await writeAudit(db, String(ctx.user.id), "role_profile_created", "stp_role_profile", String(profileId));
      }

      if (input.dimensionRanges && profileId) {
        await db.execute(sql`DELETE FROM stp_role_dimension_ranges WHERE roleProfileId = ${profileId}`);
        for (const dr of input.dimensionRanges) {
          await db.execute(sql`
            INSERT INTO stp_role_dimension_ranges (roleProfileId, dimension, preferredMin, preferredMax, acceptableMin, acceptableMax, importance, rationale)
            VALUES (${profileId}, ${dr.dimension}, ${dr.preferredMin ?? null}, ${dr.preferredMax ?? null}, ${dr.acceptableMin ?? null}, ${dr.acceptableMax ?? null}, ${dr.importance}, ${dr.rationale ?? null})
          `);
        }
      }

      return { ok: true, id: profileId };
    }),

  // ── AI-draft role profile from job description ────────────────────────────
  aiDraftRoleProfile: protectedProcedure
    .input(z.object({ jobDescription: z.string().min(50), title: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const prompt = `You are an industrial-organizational psychology consultant helping draft a role profile for a salaried corporate position.

Job Title: ${input.title}
Job Description:
${input.jobDescription}

Based on this role, provide a JSON response with:
{
  "criticalTasks": "3-5 most critical tasks for success in this role",
  "primaryOutcomes": "What success looks like in 90 days",
  "dimensionRanges": [
    {
      "dimension": "leadership_drive|social_expression|operating_tempo|execution_structure|evidence_orientation|change_experimentation|pressure_stability|interpersonal_approach",
      "preferredMin": 0-100,
      "preferredMax": 0-100,
      "importance": "important|useful|neutral|irrelevant",
      "rationale": "Why this range matters for this role"
    }
  ],
  "interviewQuestions": ["3-5 structured interview questions specific to this role"],
  "successProfileNote": "Brief description of what a successful hire looks like"
}

IMPORTANT: This is a DRAFT for human review. Do not claim these ranges are validated. Provide all 8 dimensions.`;

      const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], model: "gpt-5-mini" });
      const rawContent = response.choices?.[0]?.message?.content;
      const text = (typeof rawContent === "string" ? rawContent : "") ?? "";

      let draft: any = {};
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) draft = JSON.parse(jsonMatch[0]);
      } catch { draft = { raw: text }; }

      return { ok: true, draft, disclaimer: "This is an AI-generated draft for human review only. All ranges and recommendations must be reviewed and approved before becoming active." };
    }),

  // ── Compare candidate to role profile ─────────────────────────────────────
  compareToRoleProfile: protectedProcedure
    .input(z.object({ sessionId: z.number().int().positive(), roleProfileId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const dimRows = await db.execute(sql`SELECT * FROM stp_dimension_scores WHERE sessionId = ${input.sessionId}`);
      const dimScores = (dimRows as unknown as any[][])[0] ?? (dimRows as unknown as any[]);
      const rangeRows = await db.execute(sql`SELECT * FROM stp_role_dimension_ranges WHERE roleProfileId = ${input.roleProfileId}`);
      const ranges = ((rangeRows as unknown as any[][])[0] ?? (rangeRows as unknown as any[])) as any[];

      const alignment = dimScores.map((ds: any) => {
        const range = ranges.find((r: any) => r.dimension === ds.dimension);
        const status = range
          ? getRoleAlignment(ds.scaledScore, range.preferredMin, range.preferredMax, range.acceptableMin, range.acceptableMax, range.importance)
          : "not_material";
        return {
          dimension: ds.dimension,
          label: DIMENSION_LABELS[ds.dimension as typeof DIMENSIONS[number]] ?? ds.dimension,
          candidateScore: ds.scaledScore,
          band: ds.band,
          alignmentStatus: status,
          preferredRange: range ? `${range.preferredMin}–${range.preferredMax}` : null,
          importance: range?.importance ?? "neutral",
          rationale: range?.rationale ?? null,
        };
      });

      return { alignment, disclaimer: "Role alignment is one input. Workstyle results must not be used as a standalone rejection criterion." };
    }),

  // ── Add outcome record ────────────────────────────────────────────────────
  addOutcomeRecord: protectedProcedure
    .input(z.object({
      sessionId: z.number().int().positive(),
      checkpointDays: z.number().int(),
      stillEmployed: z.boolean().optional(),
      managerRating: z.number().int().min(1).max(5).optional(),
      workQuality: z.number().int().min(1).max(5).optional(),
      reliability: z.number().int().min(1).max(5).optional(),
      ownership: z.number().int().min(1).max(5).optional(),
      adaptability: z.number().int().min(1).max(5).optional(),
      managerComments: z.string().optional(),
      retentionRisk: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        INSERT INTO stp_outcome_records (sessionId, checkpointDays, stillEmployed, managerRating, workQuality, reliability, ownership, adaptability, managerComments, retentionRisk, recordedBy)
        VALUES (${input.sessionId}, ${input.checkpointDays}, ${input.stillEmployed !== undefined ? (input.stillEmployed ? 1 : 0) : null},
        ${input.managerRating ?? null}, ${input.workQuality ?? null}, ${input.reliability ?? null},
        ${input.ownership ?? null}, ${input.adaptability ?? null}, ${input.managerComments ?? null},
        ${input.retentionRisk ?? null}, ${ctx.user.email ?? "admin"})
      `);
      return { ok: true };
    }),

  // ── Item bank management ──────────────────────────────────────────────────
  listItems: protectedProcedure
    .input(z.object({ dimension: z.string().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      let whereClause = sql`1=1`;
      if (input.dimension) whereClause = sql`${whereClause} AND dimension = ${input.dimension}`;
      if (input.status) whereClause = sql`${whereClause} AND status = ${input.status}`;
      const rows = await db.execute(sql`SELECT * FROM stp_items WHERE ${whereClause} ORDER BY dimension, sortOrder`);
      return rows[0] ?? rows;
    }),

  updateItemStatus: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "retired", "draft"]) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`UPDATE stp_items SET status = ${input.status} WHERE id = ${input.id}`);
      await writeAudit(db, String(ctx.user.id), "item_status_updated", "stp_item", String(input.id), null, { status: input.status });
      return { ok: true };
    }),

  // ── Audit log ─────────────────────────────────────────────────────────────
  getAuditLog: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(sql`SELECT * FROM stp_audit_log ORDER BY createdAt DESC LIMIT ${input.limit}`);
      return rows[0] ?? rows;
    }),
});
