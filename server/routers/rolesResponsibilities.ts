import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import {
  activityLog,
  adminPermissions,
  adminProfiles,
  agentConnections,
  rrMetricAutoConfigs,
  rrMetricValues,
  rrResources,
  rrScorecardMetrics,
  rrSopSteps,
  rrSops,
  rrTaskLinks,
  rolesResponsibilities,
  tasks,
  transactions,
  userDocuments,
  users,
} from "../../drizzle/schema";

const CADENCES = ["ongoing", "daily", "weekly", "biweekly", "monthly", "quarterly", "annually", "as_needed", "custom"] as const;
const METRIC_FREQUENCIES = ["weekly", "monthly", "quarterly", "annually"] as const;
const METRIC_TYPES = ["manual", "automatic"] as const;
const DISPLAY_FORMATS = ["number", "percentage", "currency", "duration"] as const;
const ROLLUP_METHODS = ["sum", "average", "count", "percentage", "latest"] as const;
const DATA_SOURCES = ["tasks", "transactions", "agent_connections"] as const;
const RESOURCE_TYPES = ["link", "document", "file", "savvy_page", "template", "form", "video"] as const;

const responsibilityInput = z.object({
  title: z.string().trim().min(2).max(255),
  ownerId: z.number().int().positive(),
  description: z.string().max(50_000).nullable().optional(),
  cadence: z.enum(CADENCES),
  cadenceDetails: z.string().max(2_000).nullable().optional(),
});

const autoConfigInput = z.object({
  dataSource: z.enum(DATA_SOURCES),
  dateField: z.string().min(1).max(64),
  calculation: z.enum(["count", "sum", "average", "percentage", "latest"]),
  valueField: z.string().max(64).nullable().optional(),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])).nullable().optional(),
  numeratorFilters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])).nullable().optional(),
  denominatorFilters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])).nullable().optional(),
});

const metricInput = z.object({
  responsibilityId: z.number().int().positive(),
  name: z.string().trim().min(2).max(255),
  metricType: z.enum(METRIC_TYPES),
  frequency: z.enum(METRIC_FREQUENCIES),
  targetValue: z.number().finite().nullable().optional(),
  performanceDirection: z.enum(["higher", "lower"]),
  displayFormat: z.enum(DISPLAY_FORMATS),
  rollupMethod: z.enum(ROLLUP_METHODS),
  isCumulative: z.boolean(),
  cumulativeReset: z.enum(["monthly", "quarterly", "annually", "never"]).nullable().optional(),
  status: z.enum(["active", "inactive"]),
  autoConfig: autoConfigInput.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.metricType === "automatic" && !value.autoConfig) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Automatic metrics require an automatic calculation configuration.", path: ["autoConfig"] });
  }
  if (value.metricType === "manual" && value.autoConfig) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Manual metrics cannot include an automatic calculation configuration.", path: ["autoConfig"] });
  }
  if (value.isCumulative && !value.cumulativeReset) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a reset period for cumulative metrics.", path: ["cumulativeReset"] });
  }
});

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Viewer = { id: number; role: string; email?: string | null };
type SupportedSource = typeof DATA_SOURCES[number];
type FilterMap = Record<string, string | number | boolean | Array<string | number>>;

function parseJson<T>(value: string): T {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(normalized) as T;
}

function llmText(result: Awaited<ReturnType<typeof invokeLLM>>): string {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("\n").trim();
  return "";
}

async function requireRrAccess(db: Db, viewer: Viewer): Promise<void> {
  if (viewer.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Roles & Responsibilities is available to authorized administrators only." });
  if ((viewer.email ?? "").toLowerCase() === "tyler@savvy.realty") return;
  const [permission] = await db.select({ canViewRolesResponsibilities: adminPermissions.canViewRolesResponsibilities })
    .from(adminPermissions).where(eq(adminPermissions.userId, viewer.id)).limit(1);
  if (permission && !permission.canViewRolesResponsibilities) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to Roles & Responsibilities." });
  }
}

async function requireAdminOwner(db: Db, ownerId: number): Promise<{ id: number; name: string | null; email: string | null; title: string | null }> {
  const [owner] = await db.select({ id: users.id, name: users.name, email: users.email, title: users.title, role: users.role, isActive: users.isActive })
    .from(users).where(eq(users.id, ownerId)).limit(1);
  if (!owner || owner.role !== "admin" || !owner.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The responsibility owner must be an active admin user." });
  }
  return owner;
}

async function getResponsibilityOrThrow(db: Db, id: number) {
  const [responsibility] = await db.select().from(rolesResponsibilities).where(eq(rolesResponsibilities.id, id)).limit(1);
  if (!responsibility) throw new TRPCError({ code: "NOT_FOUND", message: "Responsibility not found." });
  return responsibility;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function periodBounds(frequency: typeof METRIC_FREQUENCIES[number], reference = new Date()): { start: Date; end: Date } {
  const day = startOfUtcDay(reference);
  if (frequency === "weekly") {
    const weekday = day.getUTCDay();
    const offset = weekday === 0 ? -6 : 1 - weekday;
    const start = addDays(day, offset);
    return { start, end: addDays(start, 7) };
  }
  if (frequency === "monthly") {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    return { start, end: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1)) };
  }
  if (frequency === "quarterly") {
    const month = Math.floor(day.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(day.getUTCFullYear(), month, 1));
    return { start, end: new Date(Date.UTC(day.getUTCFullYear(), month + 3, 1)) };
  }
  const start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return { start, end: new Date(Date.UTC(day.getUTCFullYear() + 1, 0, 1)) };
}

export function cumulativeBounds(metric: { frequency: typeof METRIC_FREQUENCIES[number]; isCumulative: boolean; cumulativeReset: "monthly" | "quarterly" | "annually" | "never" | null }, reference = new Date()) {
  const display = periodBounds(metric.frequency, reference);
  if (!metric.isCumulative || !metric.cumulativeReset) return display;
  if (metric.cumulativeReset === "never") return { start: new Date(Date.UTC(2000, 0, 1)), end: display.end };
  return { start: periodBounds(metric.cumulativeReset, reference).start, end: display.end };
}

export function sourceFields(source: SupportedSource) {
  if (source === "tasks") return {
    dates: ["createdAt", "updatedAt", "dueDate", "completedAt"],
    numbers: ["id"],
    filters: ["status", "priority", "taskType", "isAutomated"],
  };
  if (source === "transactions") return {
    dates: ["createdAt", "updatedAt", "closingDate"],
    numbers: ["grossCommissionIncome", "purchasePrice", "commissionRate", "id"],
    filters: ["status", "transactionType", "marketId"],
  };
  return {
    dates: ["createdAt", "updatedAt", "followUpDate"],
    numbers: ["id"],
    filters: ["pipelineStatus", "agentId"],
  };
}

function validateAutoConfig(config: z.infer<typeof autoConfigInput>): void {
  const fields = sourceFields(config.dataSource);
  if (!fields.dates.includes(config.dateField)) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected date field is not supported for this data source." });
  if (["sum", "average", "latest"].includes(config.calculation) && (!config.valueField || !fields.numbers.includes(config.valueField))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a supported numeric field for this calculation." });
  }
  const allFilters = [config.filters, config.numeratorFilters, config.denominatorFilters];
  for (const filters of allFilters) {
    for (const key of Object.keys(filters ?? {})) {
      if (!fields.filters.includes(key)) throw new TRPCError({ code: "BAD_REQUEST", message: `The filter ${key} is not supported for this data source.` });
    }
  }
}

export function matchesFilters(row: Record<string, unknown>, filters?: FilterMap | null): boolean {
  if (!filters) return true;
  return Object.entries(filters).every(([key, expected]) => {
    const actual = row[key];
    if (Array.isArray(expected)) return expected.map(String).includes(String(actual));
    return String(actual) === String(expected);
  });
}

function numberValue(row: Record<string, unknown>, field?: string | null): number {
  const value = field ? row[field] : undefined;
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function aggregateRows(rows: Record<string, unknown>[], calculation: "count" | "sum" | "average" | "percentage" | "latest", valueField?: string | null, numeratorFilters?: FilterMap | null, denominatorFilters?: FilterMap | null) {
  if (calculation === "count") return { value: rows.length, recordCount: rows.length };
  if (calculation === "sum") return { value: rows.reduce((sum, row) => sum + numberValue(row, valueField), 0), recordCount: rows.length };
  if (calculation === "average") return { value: rows.length ? rows.reduce((sum, row) => sum + numberValue(row, valueField), 0) / rows.length : 0, recordCount: rows.length };
  if (calculation === "latest") {
    const sorted = [...rows].sort((a, b) => new Date(String(b.updatedAt ?? b.createdAt ?? 0)).getTime() - new Date(String(a.updatedAt ?? a.createdAt ?? 0)).getTime());
    return { value: sorted.length ? numberValue(sorted[0], valueField) : 0, recordCount: rows.length };
  }
  const denominator = rows.filter((row) => matchesFilters(row, denominatorFilters));
  const numerator = rows.filter((row) => matchesFilters(row, numeratorFilters));
  return { value: denominator.length ? (numerator.length / denominator.length) * 100 : 0, recordCount: denominator.length };
}

async function loadAutomaticRecords(db: Db, source: SupportedSource, ownerId: number, dateField: string, start: Date, end: Date): Promise<Record<string, unknown>[]> {
  if (source === "tasks") {
    const column = ({ createdAt: tasks.createdAt, updatedAt: tasks.updatedAt, dueDate: tasks.dueDate, completedAt: tasks.completedAt } as const)[dateField as "createdAt" | "updatedAt" | "dueDate" | "completedAt"];
    if (!column) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported task date field." });
    return (await db.select().from(tasks).where(and(eq(tasks.assignedToId, ownerId), gte(column, start), lt(column, end)))) as unknown as Record<string, unknown>[];
  }
  if (source === "transactions") {
    const column = ({ createdAt: transactions.createdAt, updatedAt: transactions.updatedAt, closingDate: transactions.closingDate } as const)[dateField as "createdAt" | "updatedAt" | "closingDate"];
    if (!column) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported transaction date field." });
    return (await db.select().from(transactions).where(and(eq(transactions.agentId, ownerId), gte(column, start), lt(column, end)))) as unknown as Record<string, unknown>[];
  }
  const column = ({ createdAt: agentConnections.createdAt, updatedAt: agentConnections.updatedAt, followUpDate: agentConnections.followUpDate } as const)[dateField as "createdAt" | "updatedAt" | "followUpDate"];
  if (!column) throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported connection date field." });
  return (await db.select().from(agentConnections).where(and(eq(agentConnections.agentId, ownerId), gte(column, start), lt(column, end)))) as unknown as Record<string, unknown>[];
}

export async function refreshAutomaticMetric(db: Db, metricId: number): Promise<{ metricId: number; value: number; recordCount: number; periodStart: string; periodEnd: string }> {
  const [record] = await db.select({ metric: rrScorecardMetrics, responsibility: rolesResponsibilities, config: rrMetricAutoConfigs })
    .from(rrScorecardMetrics)
    .innerJoin(rolesResponsibilities, eq(rrScorecardMetrics.responsibilityId, rolesResponsibilities.id))
    .innerJoin(rrMetricAutoConfigs, eq(rrMetricAutoConfigs.metricId, rrScorecardMetrics.id))
    .where(eq(rrScorecardMetrics.id, metricId)).limit(1);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Automatic metric configuration not found." });
  const metric = record.metric;
  const config = record.config;
  const bounds = cumulativeBounds(metric as any);
  try {
    const all = await loadAutomaticRecords(db, config.dataSource as SupportedSource, record.responsibility.ownerId, config.dateField, bounds.start, bounds.end);
    const filtered = all.filter((row) => matchesFilters(row, (config.filters ?? null) as FilterMap | null));
    const result = aggregateRows(filtered, config.calculation as any, config.valueField, (config.numeratorFilters ?? null) as FilterMap | null, (config.denominatorFilters ?? null) as FilterMap | null);
    const periodStart = dateOnly(bounds.start);
    const periodEnd = dateOnly(addDays(bounds.end, -1));
    const metadata = { dataSource: config.dataSource, dateField: config.dateField, calculation: config.calculation, matchedRecords: result.recordCount };
    const [existing] = await db.select({ id: rrMetricValues.id }).from(rrMetricValues).where(and(eq(rrMetricValues.metricId, metricId), eq(rrMetricValues.periodStart, periodStart), eq(rrMetricValues.periodEnd, periodEnd))).limit(1);
    if (existing) {
      await db.update(rrMetricValues).set({ actualValue: String(result.value), valueSource: "automatic", calculationMetadata: metadata, enteredAt: new Date() }).where(eq(rrMetricValues.id, existing.id));
    } else {
      await db.insert(rrMetricValues).values({ metricId, periodStart, periodEnd, actualValue: String(result.value), valueSource: "automatic", calculationMetadata: metadata });
    }
    await db.update(rrMetricAutoConfigs).set({ lastRefreshedAt: new Date(), lastRecordCount: result.recordCount, lastError: null }).where(eq(rrMetricAutoConfigs.metricId, metricId));
    return { metricId, value: result.value, recordCount: result.recordCount, periodStart, periodEnd };
  } catch (error: any) {
    await db.update(rrMetricAutoConfigs).set({ lastError: error?.message ?? "Automatic calculation failed." }).where(eq(rrMetricAutoConfigs.metricId, metricId));
    throw error;
  }
}

async function performanceForMetric(db: Db, metric: typeof rrScorecardMetrics.$inferSelect) {
  const bounds = cumulativeBounds(metric as any);
  const periodStart = dateOnly(bounds.start);
  const periodEnd = dateOnly(addDays(bounds.end, -1));
  const values = await db.select().from(rrMetricValues).where(eq(rrMetricValues.metricId, metric.id)).orderBy(desc(rrMetricValues.periodEnd)).limit(2);
  const current = values.find((value) => value.periodStart === periodStart && value.periodEnd === periodEnd) ?? values[0] ?? null;
  const prior = values.find((value) => value.id !== current?.id) ?? null;
  const actual = current ? Number(current.actualValue) : null;
  const target = metric.targetValue == null ? null : Number(metric.targetValue);
  const onTarget = actual == null || target == null ? null : metric.performanceDirection === "higher" ? actual >= target : actual <= target;
  return { ...metric, currentValue: current, actual, target, onTarget, trend: actual != null && prior ? actual - Number(prior.actualValue) : null, periodStart, periodEnd };
}

async function detailedResponsibility(db: Db, responsibilityId: number) {
  const [base] = await db.select({ responsibility: rolesResponsibilities, owner: users, ownerProfile: adminProfiles })
    .from(rolesResponsibilities)
    .innerJoin(users, eq(rolesResponsibilities.ownerId, users.id))
    .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
    .where(eq(rolesResponsibilities.id, responsibilityId)).limit(1);
  if (!base) throw new TRPCError({ code: "NOT_FOUND", message: "Responsibility not found." });
  const [sops, responsibilityResources, metricRows, taskLinks] = await Promise.all([
    db.select().from(rrSops).where(eq(rrSops.responsibilityId, responsibilityId)).orderBy(asc(rrSops.sortOrder), asc(rrSops.id)),
    db.select({ resource: rrResources, document: userDocuments }).from(rrResources).leftJoin(userDocuments, eq(rrResources.userDocumentId, userDocuments.id)).where(eq(rrResources.responsibilityId, responsibilityId)).orderBy(asc(rrResources.sortOrder)),
    db.select({ metric: rrScorecardMetrics, config: rrMetricAutoConfigs }).from(rrScorecardMetrics).leftJoin(rrMetricAutoConfigs, eq(rrScorecardMetrics.id, rrMetricAutoConfigs.metricId)).where(eq(rrScorecardMetrics.responsibilityId, responsibilityId)).orderBy(asc(rrScorecardMetrics.name)),
    db.select({ link: rrTaskLinks, task: tasks }).from(rrTaskLinks).innerJoin(tasks, eq(rrTaskLinks.taskId, tasks.id)).where(eq(rrTaskLinks.responsibilityId, responsibilityId)).orderBy(desc(tasks.updatedAt)),
  ]);
  const sopIds = sops.map((sop) => sop.id);
  const [steps, sopResources] = sopIds.length ? await Promise.all([
    db.select().from(rrSopSteps).where(inArray(rrSopSteps.sopId, sopIds)).orderBy(asc(rrSopSteps.sortOrder), asc(rrSopSteps.id)),
    db.select({ resource: rrResources, document: userDocuments }).from(rrResources).leftJoin(userDocuments, eq(rrResources.userDocumentId, userDocuments.id)).where(inArray(rrResources.sopId, sopIds)).orderBy(asc(rrResources.sortOrder)),
  ]) : [[], []] as const;
  const metrics = await Promise.all(metricRows.map(async ({ metric, config }) => ({ ...(await performanceForMetric(db, metric)), autoConfig: config })));
  return {
    ...base.responsibility,
    owner: { id: base.owner.id, name: base.owner.name, email: base.owner.email, title: base.owner.title, department: base.ownerProfile?.adminType ?? null, reportsToId: base.owner.reportsToId },
    resources: responsibilityResources.map((row) => ({ ...row.resource, document: row.document })),
    sops: sops.map((sop) => ({ ...sop, steps: steps.filter((step) => step.sopId === sop.id), resources: sopResources.filter((row) => row.resource.sopId === sop.id).map((row) => ({ ...row.resource, document: row.document })) })),
    metrics,
    tasks: taskLinks.map((row) => row.task),
  };
}

async function ownershipAiContext(db: Db, ownerId: number) {
  const [owner, owned, recentTasks, docs] = await Promise.all([
    requireAdminOwner(db, ownerId),
    db.select().from(rolesResponsibilities).where(eq(rolesResponsibilities.ownerId, ownerId)).orderBy(asc(rolesResponsibilities.sortOrder)),
    db.select({ title: tasks.title, description: tasks.description, taskType: tasks.taskType, status: tasks.status }).from(tasks).where(eq(tasks.assignedToId, ownerId)).orderBy(desc(tasks.updatedAt)).limit(40),
    db.select({ label: userDocuments.label, summary: userDocuments.aiSummary, category: userDocuments.category }).from(userDocuments).where(eq(userDocuments.userId, ownerId)).orderBy(desc(userDocuments.createdAt)).limit(20),
  ]);
  const [profile] = await db.select().from(adminProfiles).where(eq(adminProfiles.userId, ownerId)).limit(1);
  return { owner, profile, responsibilities: owned, recentTasks, documents: docs };
}

export const rolesResponsibilitiesRouter = router({
  capability: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    return { canView: true, canManage: true, automaticDataSources: DATA_SOURCES.map((source) => ({ source, ...sourceFields(source) })) };
  }),

  listAdmins: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await requireRrAccess(db, ctx.user as Viewer);
    return db.select({ id: users.id, name: users.name, email: users.email, title: users.title, reportsToId: users.reportsToId, department: adminProfiles.adminType })
      .from(users).leftJoin(adminProfiles, eq(adminProfiles.userId, users.id)).where(and(eq(users.role, "admin"), eq(users.isActive, true))).orderBy(asc(users.name));
  }),

  list: protectedProcedure.input(z.object({ ownerId: z.number().int().positive().optional(), status: z.enum(["active", "archived", "all"]).default("active"), search: z.string().trim().max(200).optional(), department: z.string().max(64).optional(), cadence: z.enum(CADENCES).optional(), sort: z.enum(["owner", "title", "cadence"]).default("owner") }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      await requireRrAccess(db, ctx.user as Viewer);
      const conditions: any[] = [];
      if (input?.ownerId) conditions.push(eq(rolesResponsibilities.ownerId, input.ownerId));
      if (input?.status && input.status !== "all") conditions.push(eq(rolesResponsibilities.status, input.status));
      if (input?.cadence) conditions.push(eq(rolesResponsibilities.cadence, input.cadence));
      if (input?.department) conditions.push(eq(adminProfiles.adminType, input.department as any));
      if (input?.search) conditions.push(or(sql`lower(${rolesResponsibilities.title}) like ${`%${input.search.toLowerCase()}%`}`, sql`lower(coalesce(${rolesResponsibilities.description}, '')) like ${`%${input.search.toLowerCase()}%`}`));
      const order = input?.sort === "title" ? [asc(rolesResponsibilities.title)] : input?.sort === "cadence" ? [asc(rolesResponsibilities.cadence), asc(rolesResponsibilities.title)] : [asc(users.name), asc(rolesResponsibilities.sortOrder), asc(rolesResponsibilities.title)];
      const rows = await db.select({ responsibility: rolesResponsibilities, owner: users, ownerProfile: adminProfiles })
        .from(rolesResponsibilities).innerJoin(users, eq(rolesResponsibilities.ownerId, users.id)).leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
        .where(conditions.length ? and(...conditions) : undefined).orderBy(...order);
      const ids = rows.map((row) => row.responsibility.id);
      if (!ids.length) return [];
      const [sopCounts, metricCounts] = await Promise.all([
        db.select({ responsibilityId: rrSops.responsibilityId, count: sql<number>`count(*)` }).from(rrSops).where(inArray(rrSops.responsibilityId, ids)).groupBy(rrSops.responsibilityId),
        db.select({ responsibilityId: rrScorecardMetrics.responsibilityId, count: sql<number>`count(*)` }).from(rrScorecardMetrics).where(inArray(rrScorecardMetrics.responsibilityId, ids)).groupBy(rrScorecardMetrics.responsibilityId),
      ]);
      const sopMap = new Map(sopCounts.map((row) => [row.responsibilityId, Number(row.count)]));
      const metricMap = new Map(metricCounts.map((row) => [row.responsibilityId, Number(row.count)]));
      return rows.map(({ responsibility, owner, ownerProfile }) => ({ ...responsibility, owner: { id: owner.id, name: owner.name, email: owner.email, title: owner.title, reportsToId: owner.reportsToId, department: ownerProfile?.adminType ?? null }, sopCount: sopMap.get(responsibility.id) ?? 0, metricCount: metricMap.get(responsibility.id) ?? 0 }));
    }),

  get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    return detailedResponsibility(db, input.id);
  }),

  create: protectedProcedure.input(responsibilityInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    await requireAdminOwner(db, input.ownerId);
    const [last] = await db.select({ sortOrder: rolesResponsibilities.sortOrder }).from(rolesResponsibilities).where(eq(rolesResponsibilities.ownerId, input.ownerId)).orderBy(desc(rolesResponsibilities.sortOrder)).limit(1);
    const result = await db.insert(rolesResponsibilities).values({ ...input, description: input.description ?? null, cadenceDetails: input.cadenceDetails ?? null, sortOrder: (last?.sortOrder ?? -1) + 1, createdById: ctx.user.id });
    const id = Number(result[0].insertId);
    await db.insert(activityLog).values({ userId: ctx.user.id, action: "rr_created", entityType: "responsibility", entityId: id, details: { title: input.title, ownerId: input.ownerId } });
    return { id };
  }),

  update: protectedProcedure.input(responsibilityInput.partial().extend({ id: z.number().int().positive() }).refine((value) => Object.keys(value).length > 1, "Provide at least one change.")).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    await getResponsibilityOrThrow(db, input.id);
    if (input.ownerId) await requireAdminOwner(db, input.ownerId);
    const { id, ...data } = input;
    await db.update(rolesResponsibilities).set(data as any).where(eq(rolesResponsibilities.id, id));
    await db.insert(activityLog).values({ userId: ctx.user.id, action: "rr_updated", entityType: "responsibility", entityId: id, details: { fields: Object.keys(data) } });
    return { success: true };
  }),

  archive: protectedProcedure.input(z.object({ id: z.number().int().positive(), archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    await getResponsibilityOrThrow(db, input.id);
    await db.update(rolesResponsibilities).set({ status: input.archived ? "archived" : "active" }).where(eq(rolesResponsibilities.id, input.id));
    await db.insert(activityLog).values({ userId: ctx.user.id, action: input.archived ? "rr_archived" : "rr_restored", entityType: "responsibility", entityId: input.id });
    return { success: true };
  }),

  reorder: protectedProcedure.input(z.object({ ownerId: z.number().int().positive(), ids: z.array(z.number().int().positive()).min(1) })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    const rows = await db.select({ id: rolesResponsibilities.id }).from(rolesResponsibilities).where(and(eq(rolesResponsibilities.ownerId, input.ownerId), inArray(rolesResponsibilities.id, input.ids)));
    if (rows.length !== input.ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Every responsibility must belong to the selected owner." });
    await db.transaction(async (tx: any) => { for (let sortOrder = 0; sortOrder < input.ids.length; sortOrder += 1) await tx.update(rolesResponsibilities).set({ sortOrder }).where(eq(rolesResponsibilities.id, input.ids[sortOrder])); });
    return { success: true };
  }),

  transferPreview: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    const detail = await detailedResponsibility(db, input.id);
    return { currentOwner: detail.owner, title: detail.title, counts: { sops: detail.sops.length, steps: detail.sops.reduce((total: number, sop: any) => total + sop.steps.length, 0), resources: detail.resources.length + detail.sops.reduce((total: number, sop: any) => total + sop.resources.length, 0), metrics: detail.metrics.length, linkedTasks: detail.tasks.filter((task: any) => !["completed", "cancelled"].includes(task.status)).length } };
  }),

  transfer: protectedProcedure.input(z.object({ id: z.number().int().positive(), newOwnerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    const newOwner = await requireAdminOwner(db, input.newOwnerId);
    const transfer = await db.transaction(async (tx: any) => {
      const [responsibility] = await tx.select().from(rolesResponsibilities).where(eq(rolesResponsibilities.id, input.id)).limit(1);
      if (!responsibility) throw new TRPCError({ code: "NOT_FOUND", message: "Responsibility not found." });
      if (responsibility.ownerId === input.newOwnerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a different owner." });
      const [last] = await tx.select({ sortOrder: rolesResponsibilities.sortOrder }).from(rolesResponsibilities).where(eq(rolesResponsibilities.ownerId, input.newOwnerId)).orderBy(desc(rolesResponsibilities.sortOrder)).limit(1);
      const resources = await tx.select({ userDocumentId: rrResources.userDocumentId }).from(rrResources).where(or(eq(rrResources.responsibilityId, input.id), sql`${rrResources.sopId} in (select ${rrSops.id} from ${rrSops} where ${rrSops.responsibilityId} = ${input.id})`));
      const documentIds = resources.map((resource: any) => resource.userDocumentId).filter((id: number | null): id is number => !!id);
      if (documentIds.length) await tx.update(userDocuments).set({ userId: input.newOwnerId }).where(inArray(userDocuments.id, documentIds));
      const linked = await tx.select({ taskId: rrTaskLinks.taskId }).from(rrTaskLinks).where(eq(rrTaskLinks.responsibilityId, input.id));
      const linkedTaskIds = linked.map((row: any) => row.taskId);
      const openTaskIds = linkedTaskIds.length ? (await tx.select({ id: tasks.id }).from(tasks).where(and(inArray(tasks.id, linkedTaskIds), ne(tasks.status, "completed"), ne(tasks.status, "cancelled")))).map((task: any) => task.id) : [];
      if (openTaskIds.length) await tx.update(tasks).set({ assignedToId: input.newOwnerId }).where(inArray(tasks.id, openTaskIds));
      await tx.update(rolesResponsibilities).set({ ownerId: input.newOwnerId, sortOrder: (last?.sortOrder ?? -1) + 1 }).where(eq(rolesResponsibilities.id, input.id));
      await tx.insert(activityLog).values({ userId: ctx.user.id, action: "rr_transferred", entityType: "responsibility", entityId: input.id, details: { fromOwnerId: responsibility.ownerId, toOwnerId: input.newOwnerId, movedDocumentCount: documentIds.length, reassignedOpenTaskCount: openTaskIds.length } });
      return { fromOwnerId: responsibility.ownerId, movedDocumentCount: documentIds.length, reassignedOpenTaskCount: openTaskIds.length };
    });
    return { success: true, newOwner, ...transfer };
  }),

  createSop: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive(), title: z.string().trim().min(2).max(255), overview: z.string().max(50_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    await getResponsibilityOrThrow(db, input.responsibilityId);
    const [last] = await db.select({ sortOrder: rrSops.sortOrder }).from(rrSops).where(eq(rrSops.responsibilityId, input.responsibilityId)).orderBy(desc(rrSops.sortOrder)).limit(1);
    const result = await db.insert(rrSops).values({ ...input, overview: input.overview ?? null, sortOrder: (last?.sortOrder ?? -1) + 1, createdById: ctx.user.id });
    return { id: Number(result[0].insertId) };
  }),

  updateSop: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().trim().min(2).max(255).optional(), overview: z.string().max(50_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    const [sop] = await db.select().from(rrSops).where(eq(rrSops.id, input.id)).limit(1);
    if (!sop) throw new TRPCError({ code: "NOT_FOUND", message: "SOP not found." });
    const { id, ...data } = input;
    await db.update(rrSops).set(data).where(eq(rrSops.id, id));
    return { success: true };
  }),

  deleteSop: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    await db.delete(rrSops).where(eq(rrSops.id, input.id));
    return { success: true };
  }),

  duplicateSop: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireRrAccess(db, ctx.user as Viewer);
    const [source] = await db.select().from(rrSops).where(eq(rrSops.id, input.id)).limit(1);
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "SOP not found." });
    const sourceSteps = await db.select().from(rrSopSteps).where(eq(rrSopSteps.sopId, source.id)).orderBy(asc(rrSopSteps.sortOrder));
    const result = await db.transaction(async (tx: any) => {
      const created = await tx.insert(rrSops).values({ responsibilityId: source.responsibilityId, title: `${source.title} (Copy)`, overview: source.overview, sortOrder: source.sortOrder + 1, createdById: ctx.user.id });
      const sopId = Number(created[0].insertId);
      if (sourceSteps.length) await tx.insert(rrSopSteps).values(sourceSteps.map((step) => ({ sopId, instruction: step.instruction, details: step.details, showCheckbox: step.showCheckbox, resourceLabel: step.resourceLabel, resourceUrl: step.resourceUrl, sortOrder: step.sortOrder })));
      return sopId;
    });
    return { id: result };
  }),

  reorderSops: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive(), ids: z.array(z.number().int().positive()).min(1) })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer);
    const rows = await db.select({ id: rrSops.id }).from(rrSops).where(and(eq(rrSops.responsibilityId, input.responsibilityId), inArray(rrSops.id, input.ids)));
    if (rows.length !== input.ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Every SOP must belong to the responsibility." });
    await db.transaction(async (tx: any) => { for (let sortOrder = 0; sortOrder < input.ids.length; sortOrder += 1) await tx.update(rrSops).set({ sortOrder }).where(eq(rrSops.id, input.ids[sortOrder])); }); return { success: true };
  }),

  saveSopStep: protectedProcedure.input(z.object({ id: z.number().int().positive().optional(), sopId: z.number().int().positive(), instruction: z.string().trim().min(1).max(50_000), details: z.string().max(50_000).nullable().optional(), showCheckbox: z.boolean().default(true), resourceLabel: z.string().max(255).nullable().optional(), resourceUrl: z.string().url().max(4_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer);
    const [sop] = await db.select().from(rrSops).where(eq(rrSops.id, input.sopId)).limit(1); if (!sop) throw new TRPCError({ code: "NOT_FOUND", message: "SOP not found." });
    const { id, ...data } = input;
    if (id) { const [existing] = await db.select().from(rrSopSteps).where(and(eq(rrSopSteps.id, id), eq(rrSopSteps.sopId, input.sopId))).limit(1); if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Step not found." }); await db.update(rrSopSteps).set(data).where(eq(rrSopSteps.id, id)); return { id }; }
    const [last] = await db.select({ sortOrder: rrSopSteps.sortOrder }).from(rrSopSteps).where(eq(rrSopSteps.sopId, input.sopId)).orderBy(desc(rrSopSteps.sortOrder)).limit(1);
    const result = await db.insert(rrSopSteps).values({ ...data, sortOrder: (last?.sortOrder ?? -1) + 1 }); return { id: Number(result[0].insertId) };
  }),

  deleteSopStep: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); await db.delete(rrSopSteps).where(eq(rrSopSteps.id, input.id)); return { success: true }; }),
  reorderSopSteps: protectedProcedure.input(z.object({ sopId: z.number().int().positive(), ids: z.array(z.number().int().positive()).min(1) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); const rows = await db.select({ id: rrSopSteps.id }).from(rrSopSteps).where(and(eq(rrSopSteps.sopId, input.sopId), inArray(rrSopSteps.id, input.ids))); if (rows.length !== input.ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Every step must belong to the SOP." }); await db.transaction(async (tx: any) => { for (let sortOrder = 0; sortOrder < input.ids.length; sortOrder += 1) await tx.update(rrSopSteps).set({ sortOrder }).where(eq(rrSopSteps.id, input.ids[sortOrder])); }); return { success: true }; }),

  createResource: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive().nullable().optional(), sopId: z.number().int().positive().nullable().optional(), resourceType: z.enum(RESOURCE_TYPES), label: z.string().trim().min(1).max(255), url: z.string().url().max(4_000).nullable().optional() }).refine((value) => !!value.responsibilityId || !!value.sopId, "Choose an R&R or SOP for the resource.")).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer);
    if (input.responsibilityId) await getResponsibilityOrThrow(db, input.responsibilityId);
    if (input.sopId) { const [sop] = await db.select().from(rrSops).where(eq(rrSops.id, input.sopId)).limit(1); if (!sop) throw new TRPCError({ code: "NOT_FOUND", message: "SOP not found." }); }
    const result = await db.insert(rrResources).values({ ...input, createdById: ctx.user.id, url: input.url ?? null }); return { id: Number(result[0].insertId) };
  }),

  uploadResourceFile: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive().nullable().optional(), sopId: z.number().int().positive().nullable().optional(), label: z.string().trim().min(1).max(255), fileName: z.string().min(1).max(500), mimeType: z.string().min(1).max(100), fileSize: z.number().int().positive().max(10 * 1024 * 1024), fileBase64: z.string().min(1) }).refine((value) => !!value.responsibilityId || !!value.sopId, "Choose an R&R or SOP for the file.")).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer);
    let responsibilityId = input.responsibilityId ?? null; let ownerId: number | null = null;
    if (responsibilityId) ownerId = (await getResponsibilityOrThrow(db, responsibilityId)).ownerId;
    if (input.sopId) { const [sop] = await db.select().from(rrSops).where(eq(rrSops.id, input.sopId)).limit(1); if (!sop) throw new TRPCError({ code: "NOT_FOUND", message: "SOP not found." }); responsibilityId = sop.responsibilityId; ownerId = (await getResponsibilityOrThrow(db, sop.responsibilityId)).ownerId; }
    if (!ownerId) throw new TRPCError({ code: "BAD_REQUEST", message: "Could not determine the responsibility owner." });
    const buffer = Buffer.from(input.fileBase64, "base64"); if (buffer.byteLength > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Files must be 10 MB or smaller." });
    const key = `user-documents/${ownerId}/rr-${nanoid(10)}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { url } = await storagePut(key, buffer, input.mimeType);
    const created = await db.transaction(async (tx: any) => {
      const documentResult = await tx.insert(userDocuments).values({ userId: ownerId, uploadedBy: ctx.user.id, label: input.label, fileUrl: url, fileKey: key, fileName: input.fileName, fileSize: input.fileSize, mimeType: input.mimeType, category: "R&R Resource", aiSummaryStatus: "not_requested" });
      const userDocumentId = Number(documentResult[0].insertId);
      const resourceResult = await tx.insert(rrResources).values({ responsibilityId: input.responsibilityId ?? null, sopId: input.sopId ?? null, resourceType: "file", label: input.label, url, userDocumentId, createdById: ctx.user.id });
      return { resourceId: Number(resourceResult[0].insertId), userDocumentId, url };
    });
    return created;
  }),

  deleteResource: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); await db.delete(rrResources).where(eq(rrResources.id, input.id)); return { success: true }; }),

  linkTask: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive(), taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); await getResponsibilityOrThrow(db, input.responsibilityId); const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, input.taskId)).limit(1); if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." }); await db.insert(rrTaskLinks).values({ ...input, createdById: ctx.user.id }).onDuplicateKeyUpdate({ set: { responsibilityId: input.responsibilityId } }); return { success: true }; }),
  unlinkTask: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive(), taskId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); await db.delete(rrTaskLinks).where(and(eq(rrTaskLinks.responsibilityId, input.responsibilityId), eq(rrTaskLinks.taskId, input.taskId))); return { success: true }; }),

  saveMetric: protectedProcedure.input(metricInput.safeExtend({ id: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); await getResponsibilityOrThrow(db, input.responsibilityId); if (input.autoConfig) validateAutoConfig(input.autoConfig);
    const { id, autoConfig, ...metricData } = input; const data = { ...metricData, targetValue: metricData.targetValue == null ? null : String(metricData.targetValue), cumulativeReset: metricData.isCumulative ? (metricData.cumulativeReset ?? null) : null, createdById: ctx.user.id } as any;
    const metricId = await db.transaction(async (tx: any) => {
      let targetId = id;
      if (targetId) { const [existing] = await tx.select().from(rrScorecardMetrics).where(eq(rrScorecardMetrics.id, targetId)).limit(1); if (!existing || existing.responsibilityId !== input.responsibilityId) throw new TRPCError({ code: "NOT_FOUND", message: "Metric not found." }); await tx.update(rrScorecardMetrics).set(data).where(eq(rrScorecardMetrics.id, targetId)); }
      else { const result = await tx.insert(rrScorecardMetrics).values(data); targetId = Number(result[0].insertId); }
      if (autoConfig) await tx.insert(rrMetricAutoConfigs).values({ metricId: targetId!, ...autoConfig, filters: autoConfig.filters ?? null, numeratorFilters: autoConfig.numeratorFilters ?? null, denominatorFilters: autoConfig.denominatorFilters ?? null, valueField: autoConfig.valueField ?? null }).onDuplicateKeyUpdate({ set: { ...autoConfig, filters: autoConfig.filters ?? null, numeratorFilters: autoConfig.numeratorFilters ?? null, denominatorFilters: autoConfig.denominatorFilters ?? null, valueField: autoConfig.valueField ?? null } });
      else await tx.delete(rrMetricAutoConfigs).where(eq(rrMetricAutoConfigs.metricId, targetId!));
      return targetId!;
    });
    if (input.metricType === "automatic") await refreshAutomaticMetric(db, metricId);
    return { id: metricId };
  }),

  deleteMetric: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); await db.delete(rrScorecardMetrics).where(eq(rrScorecardMetrics.id, input.id)); return { success: true }; }),

  saveManualValue: protectedProcedure.input(z.object({ metricId: z.number().int().positive(), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), actualValue: z.number().finite(), note: z.string().max(5_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer);
    const [metric] = await db.select().from(rrScorecardMetrics).where(eq(rrScorecardMetrics.id, input.metricId)).limit(1); if (!metric) throw new TRPCError({ code: "NOT_FOUND", message: "Metric not found." }); if (metric.metricType !== "manual") throw new TRPCError({ code: "BAD_REQUEST", message: "Only manual metrics accept manually entered values." }); if (input.periodEnd < input.periodStart) throw new TRPCError({ code: "BAD_REQUEST", message: "The measurement period is invalid." });
    const [existing] = await db.select({ id: rrMetricValues.id }).from(rrMetricValues).where(and(eq(rrMetricValues.metricId, input.metricId), eq(rrMetricValues.periodStart, input.periodStart), eq(rrMetricValues.periodEnd, input.periodEnd))).limit(1);
    const data = { actualValue: String(input.actualValue), note: input.note ?? null, valueSource: "manual" as const, enteredById: ctx.user.id, enteredAt: new Date() };
    if (existing) await db.update(rrMetricValues).set(data).where(eq(rrMetricValues.id, existing.id)); else await db.insert(rrMetricValues).values({ metricId: input.metricId, periodStart: input.periodStart, periodEnd: input.periodEnd, ...data });
    return { success: true };
  }),

  refreshMetric: protectedProcedure.input(z.object({ metricId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); return refreshAutomaticMetric(db, input.metricId); }),

  scorecard: protectedProcedure.input(z.object({ ownerId: z.number().int().positive().optional(), status: z.enum(["active", "inactive", "all"]).default("active"), metricType: z.enum(["manual", "automatic", "all"]).default("all"), onTarget: z.enum(["all", "on_target", "off_target"]).default("all") }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) return []; await requireRrAccess(db, ctx.user as Viewer);
    const conditions: any[] = []; if (input?.ownerId) conditions.push(eq(rolesResponsibilities.ownerId, input.ownerId)); if (input?.status !== "all") conditions.push(eq(rrScorecardMetrics.status, input?.status ?? "active")); if (input?.metricType !== "all") conditions.push(eq(rrScorecardMetrics.metricType, input?.metricType ?? "manual"));
    const metrics = await db.select({ metric: rrScorecardMetrics, responsibility: rolesResponsibilities, owner: users, department: adminProfiles.adminType, config: rrMetricAutoConfigs }).from(rrScorecardMetrics).innerJoin(rolesResponsibilities, eq(rrScorecardMetrics.responsibilityId, rolesResponsibilities.id)).innerJoin(users, eq(rolesResponsibilities.ownerId, users.id)).leftJoin(adminProfiles, eq(adminProfiles.userId, users.id)).leftJoin(rrMetricAutoConfigs, eq(rrMetricAutoConfigs.metricId, rrScorecardMetrics.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(users.name), asc(rolesResponsibilities.title), asc(rrScorecardMetrics.name));
    const performance = await Promise.all(metrics.map(async (row) => ({ ...(await performanceForMetric(db, row.metric)), responsibility: { id: row.responsibility.id, title: row.responsibility.title }, owner: { id: row.owner.id, name: row.owner.name, title: row.owner.title, department: row.department ?? null }, autoConfig: row.config })));
    return input?.onTarget === "all" ? performance : performance.filter((metric) => input?.onTarget === "on_target" ? metric.onTarget === true : metric.onTarget === false);
  }),

  profileSummary: protectedProcedure.input(z.object({ ownerId: z.number().int().positive(), includeArchived: z.boolean().default(false) })).query(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) return { responsibilities: [], scorecard: [] }; await requireRrAccess(db, ctx.user as Viewer); await requireAdminOwner(db, input.ownerId);
    const responsibilities = await db.select().from(rolesResponsibilities).where(and(eq(rolesResponsibilities.ownerId, input.ownerId), input.includeArchived ? undefined : eq(rolesResponsibilities.status, "active"))).orderBy(asc(rolesResponsibilities.sortOrder));
    const scorecardRows = await db.select({ metric: rrScorecardMetrics, responsibility: rolesResponsibilities })
      .from(rrScorecardMetrics)
      .innerJoin(rolesResponsibilities, eq(rrScorecardMetrics.responsibilityId, rolesResponsibilities.id))
      .where(and(eq(rolesResponsibilities.ownerId, input.ownerId), eq(rolesResponsibilities.status, "active"), eq(rrScorecardMetrics.status, "active")));
    const scorecard = await Promise.all(scorecardRows.map(async ({ metric, responsibility }) => ({ ...(await performanceForMetric(db, metric)), responsibilityId: responsibility.id, responsibilityTitle: responsibility.title })));
    return { responsibilities, scorecard };
  }),

  aiDraftResponsibilities: protectedProcedure.input(z.object({ ownerId: z.number().int().positive(), prompt: z.string().max(4_000).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); const context = await ownershipAiContext(db, input.ownerId);
    const result = await invokeLLM({ model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1800, messages: [{ role: "system", content: "You draft concise operational roles and responsibilities. Use only the supplied SavvyOS context. Return JSON with a drafts array. Every draft must have title, description, cadence, cadenceDetails. Cadence must be one of ongoing,daily,weekly,biweekly,monthly,quarterly,annually,as_needed,custom. Do not claim unobserved responsibilities; make clear proposals, not completed actions." }, { role: "user", content: JSON.stringify({ request: input.prompt ?? "Draft practical responsibilities for this staff member.", context }) }] });
    const parsed = parseJson<{ drafts: Array<{ title: string; description: string; cadence: string; cadenceDetails?: string }> }>(llmText(result));
    return { drafts: (parsed.drafts ?? []).filter((draft) => draft.title && draft.description).slice(0, 12) };
  }),

  aiImproveResponsibility: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive(), prompt: z.string().max(4_000).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); const detail = await detailedResponsibility(db, input.responsibilityId);
    const result = await invokeLLM({ model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1200, messages: [{ role: "system", content: "Improve a responsibility without changing ownership or creating records. Return JSON only with title, description, cadence, cadenceDetails, and rationale. Be practical, specific, and concise." }, { role: "user", content: JSON.stringify({ request: input.prompt ?? "Clarify and make this responsibility more measurable.", responsibility: { title: detail.title, description: detail.description, cadence: detail.cadence, cadenceDetails: detail.cadenceDetails, owner: detail.owner, sops: detail.sops.map((sop: any) => sop.title) } }) }] });
    return parseJson(llmText(result));
  }),

  aiGenerateSop: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive(), prompt: z.string().max(4_000).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); const detail = await detailedResponsibility(db, input.responsibilityId);
    const result = await invokeLLM({ model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1800, messages: [{ role: "system", content: "Create a simple SOP proposal. Return JSON only with title, overview, steps (array of instruction, details, showCheckbox), and resources (array of label, url, resourceType). Never claim to have performed work. Keep steps ordered, actionable, and non-enterprise." }, { role: "user", content: JSON.stringify({ request: input.prompt ?? "Draft an SOP for this responsibility.", responsibility: { title: detail.title, description: detail.description, cadence: detail.cadence, resources: detail.resources.map((resource: any) => ({ label: resource.label, url: resource.url, documentSummary: resource.document?.aiSummary ?? null })), linkedTasks: detail.tasks.map((task: any) => ({ title: task.title, description: task.description })) } }) }] });
    return parseJson(llmText(result));
  }),

  aiImproveSop: protectedProcedure.input(z.object({ sopId: z.number().int().positive(), prompt: z.string().max(4_000).optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); const [sop] = await db.select().from(rrSops).where(eq(rrSops.id, input.sopId)).limit(1); if (!sop) throw new TRPCError({ code: "NOT_FOUND", message: "SOP not found." }); const steps = await db.select().from(rrSopSteps).where(eq(rrSopSteps.sopId, input.sopId)).orderBy(asc(rrSopSteps.sortOrder));
    const result = await invokeLLM({ model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1800, messages: [{ role: "system", content: "Improve a simple operational SOP. Return JSON only with title, overview, steps (array of instruction, details, showCheckbox), and rationale. Do not save, approve, or execute anything." }, { role: "user", content: JSON.stringify({ request: input.prompt ?? "Clarify, organize, and fill obvious gaps in this SOP.", sop, steps }) }] });
    return parseJson(llmText(result));
  }),

  aiSuggestMetrics: protectedProcedure.input(z.object({ responsibilityId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer); const detail = await detailedResponsibility(db, input.responsibilityId);
    const result = await invokeLLM({ model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1400, messages: [{ role: "system", content: "Suggest practical scorecard metrics for one responsibility. Return JSON only with suggestions array. Each suggestion needs name, metricType (manual or automatic), frequency (weekly/monthly/quarterly/annually), targetValue or null, performanceDirection (higher/lower), displayFormat (number/percentage/currency/duration), rollupMethod (sum/average/count/percentage/latest), isCumulative, rationale, and possibleDataSource (tasks/transactions/agent_connections/null). Recommendations must be proposals requiring review." }, { role: "user", content: JSON.stringify({ responsibility: { title: detail.title, description: detail.description, cadence: detail.cadence, sops: detail.sops.map((sop: any) => sop.title) } }) }] });
    return parseJson(llmText(result));
  }),

  aiOwnershipSearch: protectedProcedure.input(z.object({ question: z.string().trim().min(2).max(2_000) })).mutation(async ({ ctx, input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer);
    const records = await db.select({ id: rolesResponsibilities.id, title: rolesResponsibilities.title, description: rolesResponsibilities.description, cadence: rolesResponsibilities.cadence, ownerId: users.id, ownerName: users.name, ownerTitle: users.title }).from(rolesResponsibilities).innerJoin(users, eq(rolesResponsibilities.ownerId, users.id)).where(eq(rolesResponsibilities.status, "active"));
    const result = await invokeLLM({ model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 1000, messages: [{ role: "system", content: "Answer ownership questions only from the supplied current responsibility records. Return JSON with summary and matches, where matches is an array of responsibilityId plus a short reason. Never invent an owner or responsibility." }, { role: "user", content: JSON.stringify({ question: input.question, records }) }] });
    const parsed = parseJson<{ summary?: string; matches?: Array<{ responsibilityId: number; reason: string }> }>(llmText(result));
    const valid = new Map(records.map((record) => [record.id, record]));
    return { summary: parsed.summary ?? "", matches: (parsed.matches ?? []).filter((match) => valid.has(match.responsibilityId)).map((match) => ({ ...match, responsibility: valid.get(match.responsibilityId), responsibilityUrl: `/roles-responsibilities/${match.responsibilityId}`, ownerProfileUrl: `/agents/${valid.get(match.responsibilityId)!.ownerId}` })) };
  }),

  aiQualityReview: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" }); await requireRrAccess(db, ctx.user as Viewer);
    const records = await db.select({ id: rolesResponsibilities.id, title: rolesResponsibilities.title, description: rolesResponsibilities.description, cadence: rolesResponsibilities.cadence, ownerId: users.id, ownerName: users.name, status: rolesResponsibilities.status, sopCount: sql<number>`(select count(*) from ${rrSops} where ${rrSops.responsibilityId} = ${rolesResponsibilities.id})`, metricCount: sql<number>`(select count(*) from ${rrScorecardMetrics} where ${rrScorecardMetrics.responsibilityId} = ${rolesResponsibilities.id} and ${rrScorecardMetrics.status} = 'active')` }).from(rolesResponsibilities).innerJoin(users, eq(rolesResponsibilities.ownerId, users.id)).where(eq(rolesResponsibilities.status, "active"));
    const result = await invokeLLM({ model: "gpt-4o-mini", responseFormat: { type: "json_object" }, maxTokens: 2000, messages: [{ role: "system", content: "Review the supplied responsibilities for quality. Return JSON only with findings array. Each finding must have type (overlap, duplicate, unclear_description, missing_sop, missing_cadence, missing_metric, confusing_workload), responsibilityIds array, severity (low/medium/high), recommendation. Do not change or delete anything." }, { role: "user", content: JSON.stringify({ records }) }] });
    return parseJson(llmText(result));
  }),
});
