import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { transactionAgentViews, transactionCustomFields, transactionCustomFieldValues, transactions } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

export const fieldTypeSchema = z.enum(["date", "money", "number", "percent", "checkbox", "select"]);
export const customFilterSchema = z.object({
  fieldId: z.number().int().positive(),
  operator: z.enum(["eq", "gte", "lte", "empty", "not_empty"]),
  value: z.string().max(255).optional(),
});
export type CustomFilter = z.infer<typeof customFilterSchema>;
type Field = typeof transactionCustomFields.$inferSelect;

export function normalizeCustomValue(field: Pick<Field, "type" | "options">, raw: string): string {
  const value = raw.trim();
  if (field.type === "checkbox") {
    if (value !== "true" && value !== "false") throw new Error("Choose Yes or No.");
    return value;
  }
  if (field.type === "select") {
    if (!(field.options ?? []).includes(value)) throw new Error("Choose an available option.");
    return value;
  }
  if (field.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Enter a valid date.");
    return value;
  }
  const decimals = field.type === "number" ? 4 : 2;
  if (!new RegExp(`^-?\\d{1,12}(?:\\.\\d{1,${decimals}})?$`).test(value) || !Number.isFinite(Number(value))) throw new Error(`Enter a number with up to ${decimals} decimal places.`);
  if (field.type === "percent" && (Number(value) < 0 || Number(value) > 100)) throw new Error("Percent must be between 0 and 100.");
  return String(Number(value));
}

export function customFilterCondition(filter: CustomFilter, field: Field, agentId: number): SQL {
  const base = sql`cv.fieldId = ${field.id} AND cf.id = cv.fieldId AND cf.agentId = ${agentId} AND cv.transactionId = ${transactions.id}`;
  const exists = (condition?: SQL) => sql`EXISTS (SELECT 1 FROM transaction_custom_field_values cv INNER JOIN transaction_custom_fields cf ON cf.id = cv.fieldId WHERE ${base}${condition ? sql` AND ${condition}` : sql``})`;
  if (filter.operator === "empty") return sql`NOT ${exists()}`;
  if (filter.operator === "not_empty") return exists();
  if (filter.value === undefined || filter.value.trim() === "") throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a filter value." });
  if ((field.type === "checkbox" || field.type === "select") && filter.operator !== "eq") throw new TRPCError({ code: "BAD_REQUEST", message: "This field only supports Equals or Is empty." });
  let value: string;
  try { value = normalizeCustomValue(field, filter.value); }
  catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message }); }
  const comparison = field.type === "date" || field.type === "select" || field.type === "checkbox"
    ? sql`cv.value` : sql`CAST(cv.value AS DECIMAL(18,4))`;
  const rhs = field.type === "date" || field.type === "select" || field.type === "checkbox"
    ? sql`${value}` : sql`CAST(${value} AS DECIMAL(18,4))`;
  const condition = filter.operator === "gte" ? sql`${comparison} >= ${rhs}`
    : filter.operator === "lte" ? sql`${comparison} <= ${rhs}` : sql`${comparison} = ${rhs}`;
  return exists(condition);
}

export async function resolveCustomFilters(filters: CustomFilter[] | undefined, agentId: number): Promise<SQL[]> {
  if (!filters?.length) return [];
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const ids = Array.from(new Set(filters.map(f => f.fieldId)));
  const fields = await db.select().from(transactionCustomFields).where(and(eq(transactionCustomFields.agentId, agentId), inArray(transactionCustomFields.id, ids)));
  if (fields.length !== ids.length) throw new TRPCError({ code: "FORBIDDEN", message: "Custom field not found for this agent." });
  const byId = new Map(fields.map(field => [field.id, field]));
  return filters.map(filter => customFilterCondition(filter, byId.get(filter.fieldId)!, agentId));
}

export async function getCustomValuesForRows(ids: number[], ownerId: number) {
  if (!ids.length) return new Map<number, Record<number, string>>();
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const rows = await db.select({ transactionId: transactionCustomFieldValues.transactionId, fieldId: transactionCustomFieldValues.fieldId, value: transactionCustomFieldValues.value })
    .from(transactionCustomFieldValues)
    .innerJoin(transactionCustomFields, eq(transactionCustomFieldValues.fieldId, transactionCustomFields.id))
    .innerJoin(transactions, eq(transactionCustomFieldValues.transactionId, transactions.id))
    .where(and(inArray(transactionCustomFieldValues.transactionId, ids), eq(transactionCustomFields.agentId, ownerId), eq(transactions.agentId, ownerId)));
  const byTransaction = new Map<number, Record<number, string>>();
  for (const row of rows) {
    const values = byTransaction.get(row.transactionId) ?? {};
    values[row.fieldId] = row.value;
    byTransaction.set(row.transactionId, values);
  }
  return byTransaction;
}

const fieldInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: fieldTypeSchema,
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});
const viewSchema = z.object({
  visibleColumns: z.array(z.string().max(50)).max(50),
  statusFilter: z.string().max(40), typeFilter: z.string().max(40),
  marketFilter: z.string().max(40), agentFilter: z.string().max(40), leadSourceFilter: z.string().max(40),
  txSearch: z.string().max(200), closingDateFrom: z.string().max(20), closingDateTo: z.string().max(20),
  contractDateFrom: z.string().max(20), contractDateTo: z.string().max(20),
  sortColumn: z.string().max(50), sortOrder: z.enum(["asc", "desc"]),
  txLimit: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]),
  customFilters: z.array(customFilterSchema).max(10),
  flagNoClosingDate: z.boolean().default(false),
  flagPastClosingDate: z.boolean().default(false),
  flagPayoutIntegrity: z.boolean().default(false),
  groupLeaderId: z.number().int().positive().optional(),
  includeLeaderStats: z.boolean().default(false),
});

function requireAgent(role: string) {
  if (role !== "agent") throw new TRPCError({ code: "FORBIDDEN", message: "Only agents can manage private transaction fields and views." });
}
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

export const transactionCustomFieldsRouter = router({
  definitions: protectedProcedure.input(z.object({ agentId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await database();
    const ownerId = ctx.user.role === "admin" ? input?.agentId : ctx.user.role === "agent" ? ctx.user.id : undefined;
    if (!ownerId) return [];
    return db.select().from(transactionCustomFields).where(eq(transactionCustomFields.agentId, ownerId)).orderBy(transactionCustomFields.id);
  }),
  forTransaction: protectedProcedure.input(z.object({ transactionId: z.number().int().positive(), viewerId: z.number().int().positive().optional(), viewerRole: z.enum(["admin", "agent"]).optional() })).query(async ({ ctx, input }) => {
    const db = await database();
    const [transaction] = await db.select({ agentId: transactions.agentId }).from(transactions).where(eq(transactions.id, input.transactionId)).limit(1);
    if (!transaction) throw new TRPCError({ code: "NOT_FOUND" });
    if (ctx.user.role !== "admin" && (ctx.user.role !== "agent" || transaction.agentId !== ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN" });
    const fields = await db.select({ field: transactionCustomFields, value: transactionCustomFieldValues.value })
      .from(transactionCustomFields)
      .leftJoin(transactionCustomFieldValues, and(eq(transactionCustomFieldValues.fieldId, transactionCustomFields.id), eq(transactionCustomFieldValues.transactionId, input.transactionId)))
      .where(ctx.user.role === "admin"
        ? sql`${transactionCustomFields.agentId} = ${transaction.agentId} OR ${transactionCustomFieldValues.id} IS NOT NULL`
        : eq(transactionCustomFields.agentId, ctx.user.id))
      .orderBy(transactionCustomFields.agentId, transactionCustomFields.id);
    return fields;
  }),
  create: protectedProcedure.input(fieldInput).mutation(async ({ ctx, input }) => {
    requireAgent(ctx.user.role);
    const db = await database();
    const options = input.type === "select" ? (input.options ?? []).map(o => o.trim()) : null;
    if (input.type === "select" && (!options?.length || new Set(options.map(o => o.toLowerCase())).size !== options.length)) throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one unique dropdown choice." });
    const existing = await db.select({ id: transactionCustomFields.id, name: transactionCustomFields.name }).from(transactionCustomFields).where(eq(transactionCustomFields.agentId, ctx.user.id));
    if (existing.length >= 50) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum of 50 custom fields." });
    if (existing.some(f => f.name.toLowerCase() === input.name.toLowerCase())) throw new TRPCError({ code: "BAD_REQUEST", message: "A field with this name already exists." });
    const [result] = await db.insert(transactionCustomFields).values({ agentId: ctx.user.id, name: input.name, type: input.type, options });
    return { id: result.insertId };
  }),
  remove: protectedProcedure.input(z.object({ fieldId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    requireAgent(ctx.user.role);
    const db = await database();
    const [field] = await db.select({ id: transactionCustomFields.id }).from(transactionCustomFields).where(and(eq(transactionCustomFields.id, input.fieldId), eq(transactionCustomFields.agentId, ctx.user.id))).limit(1);
    if (!field) throw new TRPCError({ code: "NOT_FOUND" });
    await db.delete(transactionCustomFields).where(and(eq(transactionCustomFields.id, input.fieldId), eq(transactionCustomFields.agentId, ctx.user.id)));
    return { ok: true };
  }),
  setValue: protectedProcedure.input(z.object({ transactionId: z.number().int().positive(), fieldId: z.number().int().positive(), value: z.string().max(255).nullable() })).mutation(async ({ ctx, input }) => {
    requireAgent(ctx.user.role);
    const db = await database();
    const [[transaction], [field]] = await Promise.all([
      db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, input.transactionId), eq(transactions.agentId, ctx.user.id))).limit(1),
      db.select().from(transactionCustomFields).where(and(eq(transactionCustomFields.id, input.fieldId), eq(transactionCustomFields.agentId, ctx.user.id))).limit(1),
    ]);
    if (!transaction || !field) throw new TRPCError({ code: "FORBIDDEN", message: "Field or transaction is not yours." });
    if (input.value === null || input.value.trim() === "") {
      await db.delete(transactionCustomFieldValues).where(and(eq(transactionCustomFieldValues.fieldId, field.id), eq(transactionCustomFieldValues.transactionId, transaction.id)));
      return { ok: true };
    }
    let value: string;
    try { value = normalizeCustomValue(field, input.value); }
    catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message }); }
    await db.insert(transactionCustomFieldValues).values({ fieldId: field.id, transactionId: transaction.id, value })
      .onDuplicateKeyUpdate({ set: { value } });
    return { ok: true };
  }),
  myView: protectedProcedure.input(z.object({ viewerId: z.number().int().positive().optional() }).optional()).query(async ({ ctx }) => {
    requireAgent(ctx.user.role);
    const db = await database();
    const [row] = await db.select({ settings: transactionAgentViews.settings }).from(transactionAgentViews).where(eq(transactionAgentViews.agentId, ctx.user.id)).limit(1);
    const parsed = viewSchema.safeParse(row?.settings);
    return parsed.success ? parsed.data : null;
  }),
  saveView: protectedProcedure.input(viewSchema).mutation(async ({ ctx, input }) => {
    requireAgent(ctx.user.role);
    const db = await database();
    const fields = await db.select({ id: transactionCustomFields.id }).from(transactionCustomFields).where(eq(transactionCustomFields.agentId, ctx.user.id));
    const owned = new Set(fields.map(f => f.id));
    if (input.customFilters.some(f => !owned.has(f.fieldId)) || input.visibleColumns.some(c => c.startsWith("custom:") && !owned.has(Number(c.slice(7))))) throw new TRPCError({ code: "FORBIDDEN", message: "View contains another agent's field." });
    await resolveCustomFilters(input.customFilters, ctx.user.id);
    await db.insert(transactionAgentViews).values({ agentId: ctx.user.id, settings: input }).onDuplicateKeyUpdate({ set: { settings: input } });
    return { ok: true };
  }),
});
