import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  activityLog,
  adminProfiles,
  ptoBalanceAdjustments,
  ptoDepartments,
  ptoPolicies,
  ptoRequestEvents,
  ptoRequests,
  ptoSettings,
  users,
} from "../../drizzle/schema";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { canAdminUsePermission } from "./permissions";

const PTO_TYPES = ["vacation", "sick", "personal", "bereavement", "other"] as const;
type PtoType = typeof PTO_TYPES[number];
const PTO_STATUSES = ["pending", "approved", "declined", "withdrawn"] as const;

/**
 * Default PTO policy, seeded exactly once when the feature is first used. PTO
 * administrators can revise rates and effective dates in the administration page.
 */
const DEFAULT_POLICIES: Array<{
  ptoType: PtoType;
  annualAccrualDays: string;
  carryoverCapDays: string;
  waitingPeriodDays: number;
}> = [
  { ptoType: "vacation", annualAccrualDays: "15.00", carryoverCapDays: "5.00", waitingPeriodDays: 90 },
  { ptoType: "sick", annualAccrualDays: "5.00", carryoverCapDays: "0.00", waitingPeriodDays: 0 },
  { ptoType: "personal", annualAccrualDays: "3.00", carryoverCapDays: "0.00", waitingPeriodDays: 90 },
  { ptoType: "bereavement", annualAccrualDays: "3.00", carryoverCapDays: "0.00", waitingPeriodDays: 0 },
  { ptoType: "other", annualAccrualDays: "0.00", carryoverCapDays: "0.00", waitingPeriodDays: 0 },
];

const DEFAULT_POLICY_EFFECTIVE_DATE = "2026-01-01";
const DEFAULT_PTO_DEPARTMENTS = ["Executive", "Operations", "Marketing", "Expansion", "Finance", "Other"] as const;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const requestedDaysSchema = z.number().finite().min(0.25).max(366).refine(
  (value) => Math.abs(value * 4 - Math.round(value * 4)) < 0.000001,
  "Days must be in quarter-day increments.",
);

function isoDate(value: string | Date | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateMs(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function addCalendarDays(value: string, days: number): string {
  return new Date(dateMs(value) + days * 86_400_000).toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function inclusiveCalendarDays(startDate: string, endDate: string): number {
  return Math.floor((dateMs(endDate) - dateMs(startDate)) / 86_400_000) + 1;
}

function roundDays(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numeric(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function labelForType(type: PtoType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function labelForStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PTO data is temporarily unavailable." });
  return db;
}

async function ensurePtoDepartments(db: any) {
  const existing = await db.select().from(ptoDepartments);
  const existingNames = new Set(existing.map((department: any) => department.name.toLowerCase()));
  const missing = DEFAULT_PTO_DEPARTMENTS
    .filter((name) => !existingNames.has(name.toLowerCase()))
    .map((name) => ({ name, isActive: true }));
  if (missing.length > 0) await db.insert(ptoDepartments).values(missing);

  const departments = await db.select().from(ptoDepartments);
  const departmentByName = new Map<string, any>(departments.map((department: any) => [department.name.toLowerCase(), department] as [string, any]));
  // Reuse the established Admin Profile buckets as a one-time starting point,
  // without treating project departments as employee departments.
  const profiles = await db.select({ userId: adminProfiles.userId, adminType: adminProfiles.adminType }).from(adminProfiles);
  for (const profile of profiles) {
    if (!profile.adminType) continue;
    const department = departmentByName.get(profile.adminType.toLowerCase());
    if (department) await db.update(users).set({ ptoDepartmentId: department.id }).where(and(eq(users.id, profile.userId), eq(users.employmentType, "w2"), sql`${users.ptoDepartmentId} IS NULL`));
  }
  // Every active PTO user receives a bucket. Administrators can refine these
  // assignments in PTO Administration; Other is a deliberately conservative
  // default so unassigned people still receive red same-bucket safeguards.
  const otherDepartment = departmentByName.get("other");
  if (otherDepartment) await db.update(users)
    .set({ ptoDepartmentId: otherDepartment.id })
    .where(and(eq(users.isActive, true), eq(users.personType, "full_user"), eq(users.employmentType, "w2"), sql`${users.ptoDepartmentId} IS NULL`));
  return departments;
}

async function ensurePtoDefaults(db: any) {
  await ensurePtoDepartments(db);
  const settingsRows = await db.select().from(ptoSettings).limit(1);
  if (settingsRows.length === 0) {
    await db.insert(ptoSettings).values({
      negativeBalanceAllowed: false,
      payoutAllowed: false,
      reportingLineSource: "users.reportsToId",
    });
  }

  const existingPolicies = await db.select({ ptoType: ptoPolicies.ptoType }).from(ptoPolicies);
  const existingTypes = new Set(existingPolicies.map((policy: any) => policy.ptoType));
  const missingPolicies = DEFAULT_POLICIES
    .filter((policy) => !existingTypes.has(policy.ptoType))
    .map((policy) => ({ ...policy, effectiveDate: DEFAULT_POLICY_EFFECTIVE_DATE, isActive: true }));
  if (missingPolicies.length > 0) {
    await db.insert(ptoPolicies).values(missingPolicies as any);
  }

  const [settings] = await db.select().from(ptoSettings).limit(1);
  return settings;
}

async function getActivePolicies(db: any) {
  await ensurePtoDefaults(db);
  return db
    .select()
    .from(ptoPolicies)
    .where(eq(ptoPolicies.isActive, true))
    .orderBy(desc(ptoPolicies.effectiveDate), desc(ptoPolicies.id));
}

function policyAt(policies: any[], ptoType: PtoType, asOf: string) {
  // No policy is applied before its explicit effective date. This prevents the
  // launch policy from manufacturing retroactive accrual or carryover.
  return policies
    .filter((policy) => policy.ptoType === ptoType && isoDate(policy.effectiveDate) <= asOf)
    .sort((a, b) => isoDate(b.effectiveDate).localeCompare(isoDate(a.effectiveDate)))[0] ?? null;
}

async function requireEligibleEmployee(db: any, userId: number) {
  const [employee] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      personType: users.personType,
      employmentType: users.employmentType,
      reportsToId: users.reportsToId,
      ptoDepartmentId: users.ptoDepartmentId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!employee || !employee.isActive || employee.personType !== "full_user" || employee.employmentType !== "w2") {
    throw new TRPCError({ code: "FORBIDDEN", message: "PTO is available only to active W-2 SavvyOS users." });
  }
  return employee;
}

async function currentManagerForEmployee(db: any, employeeId: number) {
  const employee = await requireEligibleEmployee(db, employeeId);
  if (!employee.reportsToId || employee.reportsToId === employee.id) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Your reporting manager is not configured. Please contact a PTO administrator before submitting PTO.",
    });
  }
  const [manager] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, employee.reportsToId))
    .limit(1);
  if (!manager?.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Your reporting manager is not active. Please contact a PTO administrator." });
  }
  if (!(await canAdminUsePermission(manager, "canApprovePto" as any))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Your reporting manager does not have PTO approval access. Please contact a PTO administrator." });
  }
  return { employee, manager };
}

async function assertPtoEmployee(ctx: any): Promise<boolean> {
  // My PTO is an employment benefit, not a Super Permission. W-2 status is the
  // single source of employee PTO access; approval and administration remain separate.
  return ctx.user.employmentType === "w2";
}

async function assertPtoManager(ctx: any): Promise<boolean> {
  return canAdminUsePermission(ctx.user, "canApprovePto" as any);
}

async function assertPtoAdmin(ctx: any): Promise<boolean> {
  return canAdminUsePermission(ctx.user, "canAdministerPto" as any);
}

async function directReportIds(db: any, managerId: number): Promise<number[]> {
  const reports = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.reportsToId, managerId), eq(users.isActive, true), eq(users.personType, "full_user"), eq(users.employmentType, "w2")));
  return reports.map((report: any) => report.id);
}

async function getPtoConflictFlags(db: any, request: any) {
  const [employeeRow] = await db
    .select({ departmentId: users.ptoDepartmentId, departmentName: ptoDepartments.name })
    .from(users)
    .leftJoin(ptoDepartments, eq(users.ptoDepartmentId, ptoDepartments.id))
    .where(eq(users.id, request.employeeId))
    .limit(1);

  const overlaps = await db
    .select({ employeeId: ptoRequests.employeeId, departmentId: users.ptoDepartmentId })
    .from(ptoRequests)
    .innerJoin(users, eq(ptoRequests.employeeId, users.id))
    .where(and(
      eq(ptoRequests.status, "approved"),
      eq(users.employmentType, "w2"),
      ne(ptoRequests.id, request.id),
      lte(ptoRequests.startDate, dbDate(isoDate(request.endDate))),
      gte(ptoRequests.endDate, dbDate(isoDate(request.startDate))),
    ));

  const departmentId = employeeRow?.departmentId ?? null;
  const sameDepartmentOverlaps = departmentId === null
    ? []
    : overlaps.filter((overlap: any) => overlap.departmentId === departmentId);
  return {
    departmentId,
    departmentName: employeeRow?.departmentName ?? null,
    companyOverlapCount: overlaps.length,
    sameDepartmentOverlapCount: sameDepartmentOverlaps.length,
    hasCompanyConflict: overlaps.length > 0,
    requiresCoveragePlan: sameDepartmentOverlaps.length > 0,
  };
}

async function assertCurrentDirectManager(db: any, managerId: number, employeeId: number) {
  const employee = await requireEligibleEmployee(db, employeeId);
  if (employee.reportsToId !== managerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This PTO request is not assigned to your current reporting line." });
  }
  return employee;
}

/**
 * Policy accrual is calendar-day prorated from the employee account's creation
 * date, after the configured waiting period. Balances are ledger based: approved
 * requests and named administrator adjustments are the only persisted changes.
 */
async function calculateBalances(db: any, employee: any, asOf = todayIso()) {
  const [policies, adjustments, approvedRequests] = await Promise.all([
    getActivePolicies(db),
    db.select().from(ptoBalanceAdjustments).where(and(eq(ptoBalanceAdjustments.employeeId, employee.id), lte(ptoBalanceAdjustments.effectiveDate, dbDate(asOf)))),
    db.select().from(ptoRequests).where(and(eq(ptoRequests.employeeId, employee.id), eq(ptoRequests.status, "approved"))),
  ]);

  const employmentStart = isoDate(employee.createdAt);
  const employmentYear = Number(employmentStart.slice(0, 4));
  const asOfYear = Number(asOf.slice(0, 4));

  const calculateYear = (ptoType: PtoType, year: number): { accrued: number; carryover: number; adjustments: number; remaining: number } => {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const effectiveEnd = minDate(asOf, yearEnd);
    if (year < employmentYear || effectiveEnd < yearStart) return { accrued: 0, carryover: 0, adjustments: 0, remaining: 0 };

    const policy = policyAt(policies, ptoType, effectiveEnd);
    if (!policy) return { accrued: 0, carryover: 0, adjustments: 0, remaining: 0 };
    const waitingStart = addCalendarDays(employmentStart, numeric(policy.waitingPeriodDays));
    const accrualStart = maxDate(yearStart, waitingStart);
    const accrued = effectiveEnd < accrualStart
      ? 0
      : roundDays(numeric(policy.annualAccrualDays) * inclusiveCalendarDays(accrualStart, effectiveEnd) / 365);
    const yearAdjustments = roundDays(adjustments
      .filter((adjustment: any) => adjustment.ptoType === ptoType)
      .filter((adjustment: any) => {
        const effectiveDate = isoDate(adjustment.effectiveDate);
        return effectiveDate >= yearStart && effectiveDate <= effectiveEnd;
      })
      .reduce((total: number, adjustment: any) => total + numeric(adjustment.amountDays), 0));

    let carryover = 0;
    if (year > employmentYear) {
      const prior = calculateYear(ptoType, year - 1);
      const priorPolicy = policyAt(policies, ptoType, `${year - 1}-12-31`);
      carryover = priorPolicy ? roundDays(Math.min(numeric(priorPolicy.carryoverCapDays), Math.max(0, prior.remaining))) : 0;
    }

    return {
      accrued,
      carryover,
      adjustments: yearAdjustments,
      remaining: roundDays(accrued + carryover + yearAdjustments),
    };
  };

  return PTO_TYPES.map((ptoType) => {
    const current = calculateYear(ptoType, asOfYear);
    const yearStart = `${asOfYear}-01-01`;
    const yearEnd = `${asOfYear}-12-31`;
    const relevantApproved = approvedRequests.filter((request: any) => request.ptoType === ptoType && isoDate(request.startDate) >= yearStart && isoDate(request.startDate) <= yearEnd);
    const used = roundDays(relevantApproved
      .filter((request: any) => isoDate(request.startDate) <= asOf)
      .reduce((total: number, request: any) => total + numeric(request.requestedDays), 0));
    const scheduled = roundDays(relevantApproved
      .filter((request: any) => isoDate(request.startDate) > asOf)
      .reduce((total: number, request: any) => total + numeric(request.requestedDays), 0));
    const manualAdjustments = roundDays(adjustments
      .filter((adjustment: any) => adjustment.ptoType === ptoType && adjustment.sourceType === "admin_adjustment")
      .filter((adjustment: any) => {
        const effectiveDate = isoDate(adjustment.effectiveDate);
        return effectiveDate >= yearStart && effectiveDate <= asOf;
      })
      .reduce((total: number, adjustment: any) => total + numeric(adjustment.amountDays), 0));
    const policy = policyAt(policies, ptoType, asOf);

    return {
      ptoType,
      label: labelForType(ptoType),
      annualAccrualDays: roundDays(numeric(policy?.annualAccrualDays)),
      waitingPeriodDays: numeric(policy?.waitingPeriodDays),
      carryoverCapDays: roundDays(numeric(policy?.carryoverCapDays)),
      accrued: current.accrued,
      carryover: current.carryover,
      manualAdjustments,
      used,
      scheduled,
      // Scheduled requests already have ledger deductions with a future effective
      // date. Reserve them in remaining now while continuing to expose the amount
      // separately so a manager can see the employee's upcoming commitments.
      remaining: roundDays(current.remaining - scheduled),
    };
  });
}

function validateRequestRange(startDate: string, endDate: string, requestedDays: number) {
  if (endDate < startDate) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The end date must be on or after the start date." });
  }
  const calculatedDays = inclusiveCalendarDays(startDate, endDate);
  if (requestedDays > calculatedDays) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Requested PTO cannot exceed the ${calculatedDays} calendar day${calculatedDays === 1 ? "" : "s"} selected.` });
  }
  return calculatedDays;
}

function requestSummary(request: any) {
  return `${labelForType(request.ptoType as PtoType)} PTO · ${isoDate(request.startDate)} to ${isoDate(request.endDate)} · ${numeric(request.requestedDays)} day${numeric(request.requestedDays) === 1 ? "" : "s"}`;
}

async function notifyManagerOfSubmission(input: { request: any; employee: any; manager: any }) {
  if (!input.manager.email) return;
  const { request, employee, manager } = input;
  const delivery = await sendTransactionalEmail("pto_request_submitted", {
    recipientEmail: manager.email,
    recipientName: manager.name ?? undefined,
    employeeName: employee.name ?? employee.email ?? "A direct report",
    ptoType: labelForType(request.ptoType as PtoType),
    ptoDateRange: `${isoDate(request.startDate)} to ${isoDate(request.endDate)}`,
    ptoRequestedDays: `${numeric(request.requestedDays)} day${numeric(request.requestedDays) === 1 ? "" : "s"}`,
    coverageNotes: request.coverageNotes ?? undefined,
  }, { idempotencyKey: `pto-request-submitted-${request.id}-${manager.id}` });
  if (!delivery.sent && !delivery.skipped) console.error("[PTO] Failed to notify manager of new request", { requestId: request.id, reason: delivery.reason });
}

async function notifyEmployeeOfDecision(input: { request: any; employee: any; manager: any }) {
  if (!input.employee.email) return;
  const { request, employee, manager } = input;
  const delivery = await sendTransactionalEmail("pto_request_decision", {
    recipientEmail: employee.email,
    recipientName: employee.name ?? undefined,
    managerName: manager.name ?? manager.email ?? "Your manager",
    decisionStatus: labelForStatus(request.status),
    decisionReason: request.decisionReason ?? undefined,
    ptoType: labelForType(request.ptoType as PtoType),
    ptoDateRange: `${isoDate(request.startDate)} to ${isoDate(request.endDate)}`,
    ptoRequestedDays: `${numeric(request.requestedDays)} day${numeric(request.requestedDays) === 1 ? "" : "s"}`,
  }, { idempotencyKey: `pto-request-decision-${request.id}-${request.status}` });
  if (!delivery.sent && !delivery.skipped) console.error("[PTO] Failed to notify employee of PTO decision", { requestId: request.id, reason: delivery.reason });
}

export const ptoRouter = router({
  access: protectedProcedure.query(async ({ ctx }) => ({
    canView: await assertPtoEmployee(ctx),
    canApprove: await assertPtoManager(ctx),
    canAdminister: await assertPtoAdmin(ctx),
  })),

  myDashboard: protectedProcedure.query(async ({ ctx }) => {
    if (!(await assertPtoEmployee(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have My PTO access." });
    const db = requireDb(await getDb());
    const employee = await requireEligibleEmployee(db, ctx.user.id);
    const [balances, requests, managerRows] = await Promise.all([
      calculateBalances(db, employee),
      db.select().from(ptoRequests).where(eq(ptoRequests.employeeId, ctx.user.id)).orderBy(desc(ptoRequests.createdAt)),
      employee.reportsToId
        ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, employee.reportsToId)).limit(1)
        : Promise.resolve([]),
    ]);
    return {
      reportingLineSource: "users.reportsToId",
      manager: managerRows[0] ?? null,
      balances,
      requests: requests.map((request: any) => ({ ...request, requestedDays: numeric(request.requestedDays) })),
    };
  }),

  submitRequest: protectedProcedure
    .input(z.object({
      startDate: dateSchema,
      endDate: dateSchema,
      requestedDays: requestedDaysSchema,
      ptoType: z.enum(PTO_TYPES),
      coverageNotes: z.string().trim().max(5_000).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await assertPtoEmployee(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have My PTO access." });
      const db = requireDb(await getDb());
      validateRequestRange(input.startDate, input.endDate, input.requestedDays);
      const { employee, manager } = await currentManagerForEmployee(db, ctx.user.id);
      const requestResult = await db.transaction(async (tx: any) => {
        const insertResult = await tx.insert(ptoRequests).values({
          employeeId: employee.id,
          managerId: manager.id,
          ptoType: input.ptoType,
          startDate: input.startDate,
          endDate: input.endDate,
          requestedDays: input.requestedDays.toFixed(2),
          coverageNotes: input.coverageNotes || null,
          status: "pending",
        });
        const requestId = Number((insertResult as any)[0]?.insertId ?? (insertResult as any).insertId);
        await tx.insert(ptoRequestEvents).values({ ptoRequestId: requestId, actorId: ctx.user.id, eventType: "submitted" });
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "pto_request_submitted",
          entityType: "pto_request",
          entityId: requestId,
          details: { ptoType: input.ptoType, startDate: input.startDate, endDate: input.endDate, requestedDays: input.requestedDays, managerId: manager.id },
        });
        const [request] = await tx.select().from(ptoRequests).where(eq(ptoRequests.id, requestId)).limit(1);
        return request;
      });
      if (!requestResult) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PTO request could not be created." });
      void notifyManagerOfSubmission({ request: requestResult, employee, manager }).catch((error) => console.error("[PTO] Submission notification error", error));
      return { success: true, requestId: requestResult.id };
    }),

  withdrawRequest: protectedProcedure
    .input(z.object({ requestId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!(await assertPtoEmployee(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have My PTO access." });
      const db = requireDb(await getDb());
      const [request] = await db.select().from(ptoRequests).where(eq(ptoRequests.id, input.requestId)).limit(1);
      if (!request || request.employeeId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "Pending PTO request not found." });
      if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending PTO requests can be withdrawn." });
      await db.transaction(async (tx: any) => {
        await tx.update(ptoRequests).set({ status: "withdrawn", withdrawnAt: new Date() }).where(and(eq(ptoRequests.id, request.id), eq(ptoRequests.status, "pending")));
        await tx.insert(ptoRequestEvents).values({ ptoRequestId: request.id, actorId: ctx.user.id, eventType: "withdrawn" });
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "pto_request_withdrawn",
          entityType: "pto_request",
          entityId: request.id,
          details: { ptoType: request.ptoType, startDate: isoDate(request.startDate), endDate: isoDate(request.endDate) },
        });
      });
      return { success: true };
    }),

  managerQueue: protectedProcedure.query(async ({ ctx }) => {
    if (!(await assertPtoManager(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO approval access." });
    const db = requireDb(await getDb());
    await ensurePtoDepartments(db);
    const reportIds = await directReportIds(db, ctx.user.id);
    if (reportIds.length === 0) return [];
    const rows = await db
      .select({ request: ptoRequests, employee: users })
      .from(ptoRequests)
      .innerJoin(users, eq(ptoRequests.employeeId, users.id))
      .where(inArray(ptoRequests.employeeId, reportIds))
      .orderBy(asc(ptoRequests.createdAt));
    const employeeMap = new Map<number, any>();
    for (const row of rows) employeeMap.set(row.employee.id, row.employee);
    const balanceMap = new Map<number, any>();
    for (const employee of Array.from(employeeMap.values())) balanceMap.set(employee.id, await calculateBalances(db, employee));
    return Promise.all(rows.map(async (row: any) => ({
      ...row.request,
      requestedDays: numeric(row.request.requestedDays),
      employee: { id: row.employee.id, name: row.employee.name, email: row.employee.email },
      remainingBalance: balanceMap.get(row.employee.id)?.find((balance: any) => balance.ptoType === row.request.ptoType)?.remaining ?? 0,
      conflictFlags: await getPtoConflictFlags(db, row.request),
    })));
  }),

  managerRequestDetails: protectedProcedure
    .input(z.object({ requestId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!(await assertPtoManager(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO approval access." });
      const db = requireDb(await getDb());
      await ensurePtoDepartments(db);
      const [request] = await db.select().from(ptoRequests).where(eq(ptoRequests.id, input.requestId)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "PTO request not found." });
      const employee = await assertCurrentDirectManager(db, ctx.user.id, request.employeeId);
      const reportIds = await directReportIds(db, ctx.user.id);
      const [events, approvedOverlaps, balances, conflictFlags] = await Promise.all([
        db.select({ event: ptoRequestEvents, actorName: users.name, actorEmail: users.email })
          .from(ptoRequestEvents)
          .innerJoin(users, eq(ptoRequestEvents.actorId, users.id))
          .where(eq(ptoRequestEvents.ptoRequestId, request.id))
          .orderBy(asc(ptoRequestEvents.createdAt)),
        reportIds.length === 0 ? Promise.resolve([]) : db.select({ request: ptoRequests, employeeName: users.name })
          .from(ptoRequests)
          .innerJoin(users, eq(ptoRequests.employeeId, users.id))
          .where(and(
            inArray(ptoRequests.employeeId, reportIds),
            eq(ptoRequests.status, "approved"),
            ne(ptoRequests.id, request.id),
            lte(ptoRequests.startDate, dbDate(isoDate(request.endDate))),
            gte(ptoRequests.endDate, dbDate(isoDate(request.startDate))),
          ))
          .orderBy(asc(ptoRequests.startDate)),
        calculateBalances(db, employee),
        getPtoConflictFlags(db, request),
      ]);
      return {
        request: { ...request, requestedDays: numeric(request.requestedDays) },
        employee: { id: employee.id, name: employee.name, email: employee.email },
        balances,
        conflictFlags,
        history: events.map((entry: any) => ({ ...entry.event, actorName: entry.actorName ?? entry.actorEmail ?? "SavvyOS user" })),
        overlappingApprovedRequests: approvedOverlaps.map((entry: any) => ({
          ...entry.request,
          requestedDays: numeric(entry.request.requestedDays),
          employeeName: entry.employeeName ?? "Direct report",
        })),
      };
    }),

  decideRequest: protectedProcedure
    .input(z.object({ requestId: z.number().int().positive(), decision: z.enum(["approved", "declined"]), reason: z.string().trim().max(5_000).optional().nullable(), approverCoveragePlan: z.string().trim().max(5_000).optional().nullable() }))
    .mutation(async ({ input, ctx }) => {
      if (!(await assertPtoManager(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO approval access." });
      if (input.decision === "declined" && !input.reason?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A reason is required when declining a PTO request." });
      }
      const db = requireDb(await getDb());
      const decision = await db.transaction(async (tx: any) => {
        const [request] = await tx.select().from(ptoRequests).where(eq(ptoRequests.id, input.requestId)).limit(1);
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "PTO request not found." });
        if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "This PTO request has already been decided or withdrawn." });
        const employee = await assertCurrentDirectManager(tx, ctx.user.id, request.employeeId);
        // Serialize approvals for this employee so two simultaneous approvals cannot overdraw a balance.
        await tx.execute(sql`SELECT id FROM users WHERE id = ${employee.id} FOR UPDATE`);
        if (employee.ptoDepartmentId) await tx.execute(sql`SELECT id FROM users WHERE ptoDepartmentId = ${employee.ptoDepartmentId} FOR UPDATE`);
        await ensurePtoDefaults(tx);
        const conflictFlags = await getPtoConflictFlags(tx, request);
        if (input.decision === "approved" && conflictFlags.requiresCoveragePlan && !input.approverCoveragePlan?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `A coverage plan is required because ${conflictFlags.sameDepartmentOverlapCount} approved PTO request${conflictFlags.sameDepartmentOverlapCount === 1 ? "" : "s"} overlap in the ${conflictFlags.departmentName ?? "assigned"} department.`,
          });
        }
        if (input.decision === "approved") {
          const [settings] = await tx.select().from(ptoSettings).limit(1);
          const balances = await calculateBalances(tx, employee);
          const balance = balances.find((candidate: any) => candidate.ptoType === request.ptoType);
          if (!settings?.negativeBalanceAllowed && (!balance || balance.remaining + 0.000001 < numeric(request.requestedDays))) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Approval would exceed the employee's available ${labelForType(request.ptoType as PtoType)} PTO balance (${roundDays(balance?.remaining ?? 0)} days).`,
            });
          }
          await tx.insert(ptoBalanceAdjustments).values({
            employeeId: employee.id,
            ptoType: request.ptoType,
            amountDays: (-numeric(request.requestedDays)).toFixed(2),
            sourceType: "approved_request",
            ptoRequestId: request.id,
            reason: `Approved PTO request: ${requestSummary(request)}`,
            recordedById: ctx.user.id,
            effectiveDate: isoDate(request.startDate),
          });
        }
        await tx.update(ptoRequests).set({
          status: input.decision,
          decisionById: ctx.user.id,
          decisionReason: input.reason?.trim() || null,
          approverCoveragePlan: input.decision === "approved" ? input.approverCoveragePlan?.trim() || null : null,
          coveragePlanById: input.decision === "approved" && input.approverCoveragePlan?.trim() ? ctx.user.id : null,
          coveragePlanAt: input.decision === "approved" && input.approverCoveragePlan?.trim() ? new Date() : null,
          decidedAt: new Date(),
        }).where(and(eq(ptoRequests.id, request.id), eq(ptoRequests.status, "pending")));
        await tx.insert(ptoRequestEvents).values({ ptoRequestId: request.id, actorId: ctx.user.id, eventType: input.decision, reason: input.reason?.trim() || null });
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: input.decision === "approved" ? "pto_request_approved" : "pto_request_declined",
          entityType: "pto_request",
          entityId: request.id,
          details: { employeeId: employee.id, ptoType: request.ptoType, startDate: isoDate(request.startDate), endDate: isoDate(request.endDate), requestedDays: numeric(request.requestedDays), reason: input.reason?.trim() || null, companyOverlapCount: conflictFlags.companyOverlapCount, sameDepartmentOverlapCount: conflictFlags.sameDepartmentOverlapCount, approverCoveragePlan: input.decision === "approved" ? input.approverCoveragePlan?.trim() || null : null },
        });
        const [updated] = await tx.select().from(ptoRequests).where(eq(ptoRequests.id, request.id)).limit(1);
        return { request: updated, employee };
      });
      if (!decision.request) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PTO request could not be updated." });
      const [manager] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      void notifyEmployeeOfDecision({ request: decision.request, employee: decision.employee, manager: manager ?? { name: "Your manager", id: ctx.user.id } }).catch((error) => console.error("[PTO] Decision notification error", error));
      return { success: true, status: input.decision };
    }),

  pendingCount: protectedProcedure.query(async ({ ctx }) => {
    if (!(await assertPtoManager(ctx))) return { count: 0 };
    const db = requireDb(await getDb());
    const reportIds = await directReportIds(db, ctx.user.id);
    if (!reportIds.length) return { count: 0 };
    const pending = await db.select({ id: ptoRequests.id }).from(ptoRequests).where(and(inArray(ptoRequests.employeeId, reportIds), eq(ptoRequests.status, "pending")));
    return { count: pending.length };
  }),

  adminOverview: protectedProcedure.query(async ({ ctx }) => {
    if (!(await assertPtoAdmin(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO administration access." });
    const db = requireDb(await getDb());
    const settings = await ensurePtoDefaults(db);
    const [policies, departments, employeeRows, adjustmentRows] = await Promise.all([
      getActivePolicies(db),
      db.select().from(ptoDepartments).where(eq(ptoDepartments.isActive, true)).orderBy(asc(ptoDepartments.name)),
      db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, reportsToId: users.reportsToId, ptoDepartmentId: users.ptoDepartmentId })
        .from(users)
        .where(and(eq(users.isActive, true), eq(users.personType, "full_user"), eq(users.employmentType, "w2")))
        .orderBy(asc(users.name)),
      db.select().from(ptoBalanceAdjustments).orderBy(desc(ptoBalanceAdjustments.createdAt)).limit(100),
    ]);
    const departmentById = new Map(departments.map((department: any) => [department.id, department]));
    const usersById = new Map(employeeRows.map((employee: any) => [employee.id, employee]));
    const balances = [];
    for (const employee of employeeRows) {
      balances.push({ employee: { ...employee, department: employee.ptoDepartmentId ? departmentById.get(employee.ptoDepartmentId) ?? null : null }, balances: await calculateBalances(db, employee) });
    }
    return {
      settings,
      departments,
      policies: policies.map((policy: any) => ({ ...policy, annualAccrualDays: numeric(policy.annualAccrualDays), carryoverCapDays: numeric(policy.carryoverCapDays) })),
      employees: balances,
      adjustments: adjustmentRows.filter((adjustment: any) => usersById.has(adjustment.employeeId)).map((adjustment: any) => ({
        ...adjustment,
        amountDays: numeric(adjustment.amountDays),
        employeeName: usersById.get(adjustment.employeeId)?.name ?? String(adjustment.employeeId),
        recordedByName: usersById.get(adjustment.recordedById)?.name ?? String(adjustment.recordedById),
      })),
    };
  }),

  createDepartment: protectedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(128) }))
    .mutation(async ({ input, ctx }) => {
      if (!(await assertPtoAdmin(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO administration access." });
      const db = requireDb(await getDb());
      await ensurePtoDefaults(db);
      const [existing] = await db.select({ id: ptoDepartments.id }).from(ptoDepartments).where(eq(ptoDepartments.name, input.name)).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A PTO department with that name already exists." });
      const result = await db.insert(ptoDepartments).values({ name: input.name, isActive: true, createdById: ctx.user.id });
      const departmentId = Number((result as any)[0]?.insertId ?? (result as any).insertId);
      await db.insert(activityLog).values({ userId: ctx.user.id, action: "pto_department_created", entityType: "pto_department", entityId: departmentId, details: { name: input.name } });
      return { success: true, departmentId };
    }),

  assignEmployeeDepartment: protectedProcedure
    .input(z.object({ employeeId: z.number().int().positive(), departmentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!(await assertPtoAdmin(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO administration access." });
      const db = requireDb(await getDb());
      await ensurePtoDefaults(db);
      const employee = await requireEligibleEmployee(db, input.employeeId);
      const [department] = await db.select().from(ptoDepartments).where(and(eq(ptoDepartments.id, input.departmentId), eq(ptoDepartments.isActive, true))).limit(1);
      if (!department) throw new TRPCError({ code: "NOT_FOUND", message: "Active PTO department not found." });
      await db.update(users).set({ ptoDepartmentId: department.id }).where(eq(users.id, employee.id));
      await db.insert(activityLog).values({ userId: ctx.user.id, action: "pto_department_assigned", entityType: "user", entityId: employee.id, details: { departmentId: department.id, departmentName: department.name } });
      return { success: true };
    }),

  savePolicies: protectedProcedure
    .input(z.array(z.object({
      ptoType: z.enum(PTO_TYPES),
      annualAccrualDays: z.number().finite().min(0).max(366),
      carryoverCapDays: z.number().finite().min(0).max(366),
      waitingPeriodDays: z.number().int().min(0).max(365),
      effectiveDate: dateSchema,
      isActive: z.boolean().default(true),
    })).min(1))
    .mutation(async ({ input, ctx }) => {
      if (!(await assertPtoAdmin(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO administration access." });
      const uniqueTypes = new Set(input.map((policy) => policy.ptoType));
      if (uniqueTypes.size !== input.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Submit only one policy record per PTO type at a time." });
      const db = requireDb(await getDb());
      await ensurePtoDefaults(db);
      await db.transaction(async (tx: any) => {
        for (const policy of input) {
          const existing = await tx.select({ id: ptoPolicies.id }).from(ptoPolicies).where(and(eq(ptoPolicies.ptoType, policy.ptoType), eq(ptoPolicies.effectiveDate, dbDate(policy.effectiveDate)))).limit(1);
          const values = {
            annualAccrualDays: policy.annualAccrualDays.toFixed(2),
            carryoverCapDays: policy.carryoverCapDays.toFixed(2),
            waitingPeriodDays: policy.waitingPeriodDays,
            isActive: policy.isActive,
            updatedById: ctx.user.id,
          };
          if (existing.length > 0) {
            await tx.update(ptoPolicies).set(values).where(eq(ptoPolicies.id, existing[0].id));
          } else {
            await tx.insert(ptoPolicies).values({ ...policy, ...values });
          }
        }
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "pto_policy_updated",
          entityType: "pto_policy",
          details: { policies: input.map((policy) => ({ ptoType: policy.ptoType, effectiveDate: policy.effectiveDate, annualAccrualDays: policy.annualAccrualDays, carryoverCapDays: policy.carryoverCapDays, waitingPeriodDays: policy.waitingPeriodDays })) },
        });
      });
      return { success: true };
    }),

  recordAdjustment: protectedProcedure
    .input(z.object({
      employeeId: z.number().int().positive(),
      ptoType: z.enum(PTO_TYPES),
      amountDays: z.number().finite().min(-366).max(366).refine((value) => Math.abs(value) >= 0.01, "Adjustment cannot be zero."),
      effectiveDate: dateSchema,
      reason: z.string().trim().min(3).max(5_000),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await assertPtoAdmin(ctx))) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have PTO administration access." });
      const db = requireDb(await getDb());
      const employee = await requireEligibleEmployee(db, input.employeeId);
      const settings = await ensurePtoDefaults(db);
      const projected = await calculateBalances(db, employee, input.effectiveDate);
      const balance = projected.find((candidate: any) => candidate.ptoType === input.ptoType);
      if (!settings?.negativeBalanceAllowed && (balance?.remaining ?? 0) + input.amountDays < -0.000001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This adjustment would create a negative PTO balance, which the current policy does not allow." });
      }
      const result = await db.transaction(async (tx: any) => {
        const insertResult = await tx.insert(ptoBalanceAdjustments).values({
          employeeId: input.employeeId,
          ptoType: input.ptoType,
          amountDays: input.amountDays.toFixed(2),
          sourceType: "admin_adjustment",
          reason: input.reason,
          recordedById: ctx.user.id,
          effectiveDate: input.effectiveDate,
        });
        const adjustmentId = Number((insertResult as any)[0]?.insertId ?? (insertResult as any).insertId);
        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "pto_balance_adjusted",
          entityType: "pto_adjustment",
          entityId: adjustmentId,
          details: { employeeId: input.employeeId, ptoType: input.ptoType, amountDays: input.amountDays, effectiveDate: input.effectiveDate, reason: input.reason },
        });
        return adjustmentId;
      });
      return { success: true, adjustmentId: result };
    }),
});

export { PTO_TYPES, calculateBalances, inclusiveCalendarDays, validateRequestRange };
