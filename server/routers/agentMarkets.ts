import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  marketAgentAssignments,
  marketIntelligenceProfiles,
  marketProfileSources,
  marketProfiles,
  users,
} from "../../drizzle/schema";
import {
  collectMarketProfileDraft,
  refreshMarketIntelligence,
} from "../agentMarketsIntelligence";
import { getDb, logActivity } from "../db";
import pdfParse from "../lib/pdf-parse-safe";
import { storageDelete, storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const EXTRACTABLE_TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/json",
  "application/xml",
  "text/xml",
]);

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Agent Markets is available to administrators only." });
  }
  return canAdminUsePermission(ctx.user, "canViewAgentMarkets").then(allowed => {
    if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Agent Markets permission is required." });
    return next({ ctx });
  });
});

function cleanText(value: string, max = MAX_TEXT_CHARS): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "market-source";
}

function sourceTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 512) || "Uploaded market source";
}

async function extractTextFromUpload(buffer: Buffer, mimeType: string, fileName: string): Promise<{ content: string | null; status: "ready" | "failed" }> {
  try {
    if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      const result = await pdfParse(buffer);
      const content = cleanText(result.text);
      return content ? { content, status: "ready" } : { content: null, status: "failed" };
    }
    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName.toLowerCase().endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const content = cleanText(result.value);
      return content ? { content, status: "ready" } : { content: null, status: "failed" };
    }
    if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mimeType === "application/vnd.ms-excel" || /\.(xlsx|xls)$/i.test(fileName)) {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const content = cleanText(workbook.SheetNames.slice(0, 8).map(name => {
        const worksheet = workbook.Sheets[name];
        return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(worksheet)}`;
      }).join("\n\n"));
      return content ? { content, status: "ready" } : { content: null, status: "failed" };
    }
    if (EXTRACTABLE_TEXT_TYPES.has(mimeType) || /\.(txt|md|csv|json|xml|html?)$/i.test(fileName)) {
      const content = cleanText(buffer.toString("utf8"));
      return content ? { content, status: "ready" } : { content: null, status: "failed" };
    }
  } catch (error) {
    console.warn("[AgentMarkets] Source extraction failed:", error instanceof Error ? error.message : error);
  }
  return { content: null, status: "failed" };
}

async function getMarketDetail(marketId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  const [market] = await db.select({
    id: marketProfiles.id,
    name: marketProfiles.name,
    state: marketProfiles.state,
    region: marketProfiles.region,
    status: marketProfiles.status,
    annualGciGoal: marketProfiles.annualGciGoal,
    createdAt: marketProfiles.createdAt,
    updatedAt: marketProfiles.updatedAt,
  }).from(marketProfiles).where(eq(marketProfiles.id, marketId)).limit(1);
  if (!market) throw new TRPCError({ code: "NOT_FOUND", message: "Market not found." });

  const [intelligence] = await db.select().from(marketIntelligenceProfiles)
    .where(eq(marketIntelligenceProfiles.marketProfileId, marketId)).limit(1);
  const sourceRows = await db.select({
    id: marketProfileSources.id,
    sourceType: marketProfileSources.sourceType,
    title: marketProfileSources.title,
    fileUrl: marketProfileSources.fileUrl,
    fileName: marketProfileSources.fileName,
    mimeType: marketProfileSources.mimeType,
    fileSize: marketProfileSources.fileSize,
    extractionStatus: marketProfileSources.extractionStatus,
    contentLength: sql<number>`CHAR_LENGTH(COALESCE(${marketProfileSources.content}, ''))`,
    createdAt: marketProfileSources.createdAt,
    updatedAt: marketProfileSources.updatedAt,
  }).from(marketProfileSources)
    .where(eq(marketProfileSources.marketProfileId, marketId))
    .orderBy(desc(marketProfileSources.updatedAt));

  const assignments = await db.select({
    id: marketAgentAssignments.id,
    agentId: users.id,
    agentName: users.name,
    agentEmail: users.email,
    isPrimary: marketAgentAssignments.isPrimary,
    isAvailable: marketAgentAssignments.isAvailable,
    notes: marketAgentAssignments.notes,
    createdAt: marketAgentAssignments.createdAt,
  }).from(marketAgentAssignments)
    .innerJoin(users, eq(marketAgentAssignments.agentId, users.id))
    .where(eq(marketAgentAssignments.marketProfileId, marketId))
    .orderBy(asc(users.name));

  const draft = await collectMarketProfileDraft(marketId);
  return {
    market,
    intelligence: intelligence ?? null,
    sources: sourceRows.map(row => ({ ...row, contentLength: Number(row.contentLength ?? 0) })),
    assignments,
    liveEvidence: draft ? { evidenceSnapshot: draft.evidenceSnapshot, sourceSnapshot: draft.sourceSnapshot } : null,
  };
}

export const agentMarketsRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const rows = await db.select({
      id: marketProfiles.id,
      name: marketProfiles.name,
      state: marketProfiles.state,
      region: marketProfiles.region,
      status: marketProfiles.status,
      annualGciGoal: marketProfiles.annualGciGoal,
      updatedAt: marketProfiles.updatedAt,
      intelligenceStatus: marketIntelligenceProfiles.status,
      generatedAt: marketIntelligenceProfiles.generatedAt,
      sourceCount: sql<number>`(SELECT COUNT(*) FROM ${marketProfileSources} mps WHERE mps.marketProfileId = ${marketProfiles.id})`,
      agentCount: sql<number>`(SELECT COUNT(DISTINCT maa.agentId) FROM ${marketAgentAssignments} maa WHERE maa.marketProfileId = ${marketProfiles.id})`,
    }).from(marketProfiles)
      .leftJoin(marketIntelligenceProfiles, eq(marketIntelligenceProfiles.marketProfileId, marketProfiles.id))
      .orderBy(asc(marketProfiles.name));
    return rows.map(row => ({ ...row, sourceCount: Number(row.sourceCount ?? 0), agentCount: Number(row.agentCount ?? 0) }));
  }),

  get: adminProcedure.input(z.object({ marketId: z.number().int().positive() }))
    .query(async ({ input }) => getMarketDetail(input.marketId)),

  listAssignableAgents: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    return db.select({ id: users.id, name: users.name, email: users.email, marketProfileId: users.marketProfileId })
      .from(users)
      .where(and(eq(users.role, "agent"), eq(users.isActive, true)))
      .orderBy(asc(users.name));
  }),

  create: adminProcedure.input(z.object({
    name: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(50),
    region: z.string().trim().max(50).nullable().optional(),
    status: z.enum(["active", "recruiting", "paused", "future"]).default("active"),
    annualGciGoal: z.number().nonnegative().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [result] = await db.insert(marketProfiles).values({
      name: input.name,
      state: input.state,
      region: input.region || null,
      status: input.status,
      annualGciGoal: input.annualGciGoal?.toString() ?? null,
    });
    const marketId = Number((result as any).insertId);
    await db.insert(marketIntelligenceProfiles).values({ marketProfileId: marketId, status: "refreshing", refreshReason: "manual" });
    void refreshMarketIntelligence(marketId, "manual");
    void logActivity({ userId: ctx.user.id, action: "agent_market_created", entityType: "market", entityId: marketId, details: { marketName: input.name } });
    return { id: marketId };
  }),

  update: adminProcedure.input(z.object({
    marketId: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    state: z.string().trim().min(1).max(50),
    region: z.string().trim().max(50).nullable().optional(),
    status: z.enum(["active", "recruiting", "paused", "future"]),
    annualGciGoal: z.number().nonnegative().nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const { marketId, ...details } = input;
    await db.update(marketProfiles).set({
      ...details,
      region: details.region || null,
      annualGciGoal: details.annualGciGoal?.toString() ?? null,
      updatedAt: new Date(),
    }).where(eq(marketProfiles.id, marketId));
    void refreshMarketIntelligence(marketId, "manual");
    void logActivity({ userId: ctx.user.id, action: "agent_market_updated", entityType: "market", entityId: marketId, details: { marketName: input.name } });
    return { success: true };
  }),

  addNote: adminProcedure.input(z.object({
    marketId: z.number().int().positive(),
    title: z.string().trim().min(1).max(512),
    content: z.string().trim().min(1).max(MAX_TEXT_CHARS),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [result] = await db.insert(marketProfileSources).values({
      marketProfileId: input.marketId,
      sourceType: "note",
      title: input.title,
      content: cleanText(input.content),
      extractionStatus: "ready",
      createdById: ctx.user.id,
    });
    void refreshMarketIntelligence(input.marketId, "source_added");
    void logActivity({ userId: ctx.user.id, action: "agent_market_source_added", entityType: "market", entityId: input.marketId, details: { sourceType: "note", title: input.title } });
    return { id: Number((result as any).insertId) };
  }),

  uploadSource: adminProcedure.input(z.object({
    marketId: z.number().int().positive(),
    fileName: z.string().trim().min(1).max(512),
    mimeType: z.string().trim().min(1).max(128),
    base64Data: z.string().min(1).max(17_000_000),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const buffer = Buffer.from(input.base64Data, "base64");
    if (!buffer.length || buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Market source files must be 12 MB or smaller." });
    }
    const name = safeFileName(input.fileName);
    const key = `agent-markets/${input.marketId}/sources/${nanoid(12)}-${name}`;
    const [{ url }, extracted] = await Promise.all([
      storagePut(key, buffer, input.mimeType),
      extractTextFromUpload(buffer, input.mimeType, input.fileName),
    ]);
    const [result] = await db.insert(marketProfileSources).values({
      marketProfileId: input.marketId,
      sourceType: "file",
      title: sourceTitle(input.fileName),
      content: extracted.content,
      fileUrl: url,
      fileKey: key,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: buffer.byteLength,
      extractionStatus: extracted.status,
      createdById: ctx.user.id,
    });
    void refreshMarketIntelligence(input.marketId, "source_added");
    void logActivity({ userId: ctx.user.id, action: "agent_market_source_added", entityType: "market", entityId: input.marketId, details: { sourceType: "file", fileName: input.fileName, extractionStatus: extracted.status } });
    return { id: Number((result as any).insertId), extractionStatus: extracted.status };
  }),

  deleteSource: adminProcedure.input(z.object({ sourceId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [source] = await db.select({ marketProfileId: marketProfileSources.marketProfileId, title: marketProfileSources.title, fileKey: marketProfileSources.fileKey })
        .from(marketProfileSources).where(eq(marketProfileSources.id, input.sourceId)).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found." });
      if (source.fileKey) await storageDelete(source.fileKey);
      await db.delete(marketProfileSources).where(eq(marketProfileSources.id, input.sourceId));
      void refreshMarketIntelligence(source.marketProfileId, "manual");
      void logActivity({ userId: ctx.user.id, action: "agent_market_source_removed", entityType: "market", entityId: source.marketProfileId, details: { title: source.title } });
      return { success: true };
    }),

  refresh: adminProcedure.input(z.object({ marketId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await db.insert(marketIntelligenceProfiles).values({ marketProfileId: input.marketId, status: "refreshing", refreshReason: "manual" })
        .onDuplicateKeyUpdate({ set: { status: "refreshing", refreshReason: "manual", errorMessage: null, updatedAt: new Date() } });
      void refreshMarketIntelligence(input.marketId, "manual");
      void logActivity({ userId: ctx.user.id, action: "agent_market_refresh_requested", entityType: "market", entityId: input.marketId, details: {} });
      return { success: true };
    }),

  upsertAssignment: adminProcedure.input(z.object({
    marketId: z.number().int().positive(),
    agentId: z.number().int().positive(),
    isPrimary: z.boolean().default(false),
    isAvailable: z.boolean().default(true),
    notes: z.string().trim().max(4000).nullable().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const [agent] = await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, input.agentId)).limit(1);
    if (!agent || agent.role !== "agent" || !agent.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active agent." });
    await db.transaction(async tx => {
      if (input.isPrimary) {
        await tx.update(marketAgentAssignments).set({ isPrimary: false }).where(eq(marketAgentAssignments.agentId, input.agentId));
        await tx.update(users).set({ marketProfileId: input.marketId }).where(eq(users.id, input.agentId));
      }
      const [existing] = await tx.select({ id: marketAgentAssignments.id }).from(marketAgentAssignments)
        .where(and(eq(marketAgentAssignments.marketProfileId, input.marketId), eq(marketAgentAssignments.agentId, input.agentId))).limit(1);
      const values = { isPrimary: input.isPrimary, isAvailable: input.isAvailable, notes: input.notes || null };
      if (existing) await tx.update(marketAgentAssignments).set(values).where(eq(marketAgentAssignments.id, existing.id));
      else await tx.insert(marketAgentAssignments).values({ marketProfileId: input.marketId, agentId: input.agentId, ...values });
    });
    void refreshMarketIntelligence(input.marketId, "manual");
    void logActivity({ userId: ctx.user.id, action: "agent_market_assignment_updated", entityType: "market", entityId: input.marketId, details: { agentId: input.agentId, isPrimary: input.isPrimary } });
    return { success: true };
  }),

  removeAssignment: adminProcedure.input(z.object({ assignmentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [assignment] = await db.select().from(marketAgentAssignments).where(eq(marketAgentAssignments.id, input.assignmentId)).limit(1);
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found." });
      await db.transaction(async tx => {
        await tx.delete(marketAgentAssignments).where(eq(marketAgentAssignments.id, input.assignmentId));
        if (assignment.isPrimary) {
          const [replacement] = await tx.select({ marketId: marketAgentAssignments.marketProfileId })
            .from(marketAgentAssignments).where(eq(marketAgentAssignments.agentId, assignment.agentId))
            .orderBy(desc(marketAgentAssignments.isPrimary), asc(marketAgentAssignments.id)).limit(1);
          await tx.update(users).set({ marketProfileId: replacement?.marketId ?? null }).where(eq(users.id, assignment.agentId));
          if (replacement) await tx.update(marketAgentAssignments).set({ isPrimary: true }).where(and(eq(marketAgentAssignments.agentId, assignment.agentId), eq(marketAgentAssignments.marketProfileId, replacement.marketId)));
        }
      });
      void refreshMarketIntelligence(assignment.marketProfileId, "manual");
      void logActivity({ userId: ctx.user.id, action: "agent_market_assignment_removed", entityType: "market", entityId: assignment.marketProfileId, details: { agentId: assignment.agentId } });
      return { success: true };
    }),
});
