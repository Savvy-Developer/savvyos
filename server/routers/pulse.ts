import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  pulseCalendarConfig,
  pulseDomainEvents,
  pulseHolidays,
  pulseL10Settings,
  pulsePeople,
  pulsePersonAccounts,
  pulseReportingPeriods,
  pulseScopeMemberships,
  pulseScopes,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";
import { resolvePulseCalendar } from "../pulse/calendar";
import { appendPulseEvent } from "../pulse/events";
import { ensurePulsePersonForAccount } from "../pulse/people";
import { canAssign, canCreate, canDeliver, canManageMeeting, canView, canViewWorkItem, canVote, getActiveScope, visibleScopes } from "../pulse/policy";
import { addCanonicalWorkComment, assignCanonicalWorkItem, createCanonicalWorkItem, enrichCanonicalWorkItems, moveCanonicalWorkItem, transitionCanonicalWorkItem, voteCanonicalIssue } from "../pulse/work";

const scopeTypeSchema = z.enum(["company", "l10", "team", "one_on_one", "private"]);
const membershipPolicySchema = z.enum(["explicit", "active_accounts", "owner_only"]);
const accessPolicySchema = z.enum(["members", "explicit_members", "owner_only"]);
const membershipRoleSchema = z.enum(["owner", "manager", "member", "viewer"]);
const daySchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

function l10SettingsSchema() {
  return z.object({
    scheduleDay: daySchema.default("monday"),
    scheduleTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("09:00"),
    timezone: z.string().trim().min(1).max(64).default("America/New_York"),
    durationMinutes: z.number().int().min(15).max(480).default(90),
    sectionVisibility: z.record(z.string(), z.boolean()).default({ overview: true, scorecard: true, rocks: true, todos: true, issues: true }),
  });
}

type Db = any;
type Actor = { userId: number; personId: number };

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db as Db;
}

async function requirePulseAdmin(ctx: { user: { id: number; role: string; email?: string | null } }) {
  if (!(await canAdminUsePermission(ctx.user, "canViewPulse"))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Pulse configuration access is required." });
  }
}

async function resolveActor(db: Db, userId: number): Promise<Actor> {
  return { userId, personId: await ensurePulsePersonForAccount(db, userId) };
}

function defaultPolicies(scopeType: z.infer<typeof scopeTypeSchema>) {
  if (scopeType === "company") return { membershipPolicy: "active_accounts" as const, accessPolicy: "members" as const };
  if (scopeType === "private") return { membershipPolicy: "owner_only" as const, accessPolicy: "owner_only" as const };
  return { membershipPolicy: "explicit" as const, accessPolicy: "members" as const };
}

async function requireManageScope(db: Db, scopeId: number, actor: Actor) {
  const permission = await canCreate(db, "scope_configuration", scopeId, actor);
  if (!permission.allowed) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot manage this active scope." });
}

export const pulseRouter = router({
  /** Admin tab contract: configuration exists only under centralized SavvyOS super permission. */
  getFoundation: protectedProcedure.query(async ({ ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const scopes = await visibleScopes(db, actor);
    const scopeIds = scopes.map((scope: any) => scope.id);
    const [memberships, l10Settings, people, calendar, events, calendarSnapshot] = await Promise.all([
      scopeIds.length ? db.select().from(pulseScopeMemberships).where(and(inArray(pulseScopeMemberships.scopeId, scopeIds), eq(pulseScopeMemberships.isActive, true))).orderBy(asc(pulseScopeMemberships.scopeId)) : [],
      scopeIds.length ? db.select().from(pulseL10Settings).where(inArray(pulseL10Settings.scopeId, scopeIds)) : [],
      db.select({ id: pulsePeople.id, displayName: pulsePeople.displayName, primaryEmail: pulsePeople.primaryEmail, isActive: pulsePeople.isActive, accountUserId: pulsePersonAccounts.userId, accountActive: users.isActive })
        .from(pulsePeople)
        .leftJoin(pulsePersonAccounts, and(eq(pulsePersonAccounts.personId, pulsePeople.id), isNull(pulsePersonAccounts.unlinkedAt)))
        .leftJoin(users, eq(pulsePersonAccounts.userId, users.id))
        .orderBy(asc(pulsePeople.displayName)),
      db.select().from(pulseCalendarConfig).where(eq(pulseCalendarConfig.isActive, true)).orderBy(asc(pulseCalendarConfig.id)).limit(1),
      scopeIds.length
        ? db.select().from(pulseDomainEvents).where(or(inArray(pulseDomainEvents.scopeId, scopeIds), isNull(pulseDomainEvents.scopeId))).orderBy(desc(pulseDomainEvents.occurredAt)).limit(30)
        : db.select().from(pulseDomainEvents).where(isNull(pulseDomainEvents.scopeId)).orderBy(desc(pulseDomainEvents.occurredAt)).limit(30),
      resolvePulseCalendar(db),
    ]);
    return { actorPersonId: actor.personId, scopes, memberships, l10Settings, people, calendar: calendar[0] ?? null, calendarSnapshot, events };
  }),

  /** Single query-led scope list for API and UI; every type uses the same archive-first policy resolver. */
  visibleScopes: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    return visibleScopes(db, actor);
  }),

  getScope: protectedProcedure.input(z.object({ scopeId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const decision = await canView(db, input.scopeId, actor);
    if (!decision.allowed) throw new TRPCError({ code: decision.reason === "scope_inactive" ? "NOT_FOUND" : "FORBIDDEN", message: "This Pulse scope is unavailable." });
    return getActiveScope(db, input.scopeId);
  }),

  /** Compatibility navigation remains a policy-backed resource list; it exposes no static resource names. */
  getNavigation: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const scopes = await visibleScopes(db, actor);
    return scopes.map((scope: any) => ({ id: `scope-${scope.id}`, label: scope.name, path: `/pulse?scope=${scope.id}`, resourceType: scope.scopeType, scopeId: scope.id }));
  }),

  createPerson: protectedProcedure.input(z.object({ displayName: z.string().trim().min(2).max(255), primaryEmail: z.string().email().optional().nullable(), timezone: z.string().trim().max(64).optional().nullable() })).mutation(async ({ input, ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    await resolveActor(db, ctx.user.id);
    const [result] = await db.insert(pulsePeople).values({ displayName: input.displayName, primaryEmail: input.primaryEmail ?? null, timezone: input.timezone ?? null, isActive: true });
    return { id: Number((result as any).insertId) };
  }),

  createScope: protectedProcedure.input(z.object({
    scopeType: scopeTypeSchema,
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().max(5000).optional().nullable(),
    ownerPersonId: z.number().int().positive().optional(),
    membershipPolicy: membershipPolicySchema.optional(),
    accessPolicy: accessPolicySchema.optional(),
    memberPersonIds: z.array(z.number().int().positive()).max(200).default([]),
    l10: l10SettingsSchema().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const defaults = defaultPolicies(input.scopeType);
    const ownerPersonId = input.ownerPersonId ?? actor.personId;
    if (input.scopeType === "private" && ownerPersonId !== actor.personId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Private scopes must be owned by their creator." });
    }
    const memberIds = Array.from(new Set([ownerPersonId, ...input.memberPersonIds]));
    const existingPeople = await db.select({ id: pulsePeople.id }).from(pulsePeople).where(and(inArray(pulsePeople.id, memberIds), eq(pulsePeople.isActive, true)));
    if (existingPeople.length !== memberIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Every scope member must be an active Pulse person." });

    const scopeId = await db.transaction(async (tx: Db) => {
      const [created] = await tx.insert(pulseScopes).values({
        scopeType: input.scopeType,
        name: input.name,
        description: input.description ?? null,
        membershipPolicy: input.membershipPolicy ?? defaults.membershipPolicy,
        accessPolicy: input.accessPolicy ?? defaults.accessPolicy,
        ownerPersonId,
        createdByPersonId: actor.personId,
        isActive: true,
      });
      const id = Number((created as any).insertId);
      for (const personId of memberIds) {
        await tx.insert(pulseScopeMemberships).values({
          scopeId: id,
          personId,
          membershipRole: personId === ownerPersonId ? "owner" : "member",
          grantedByPersonId: actor.personId,
          isActive: true,
        });
      }
      if (input.scopeType === "l10") {
        const config = input.l10 ?? l10SettingsSchema().parse({});
        await tx.insert(pulseL10Settings).values({ scopeId: id, ...config });
      }
      await appendPulseEvent(tx, { eventType: "scope_created", scopeId: id, actorPersonId: actor.personId, payload: { scopeType: input.scopeType, name: input.name } });
      return id;
    });
    return { id: scopeId };
  }),

  grantMembership: protectedProcedure.input(z.object({ scopeId: z.number().int().positive(), personId: z.number().int().positive(), membershipRole: membershipRoleSchema.default("member") })).mutation(async ({ input, ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    await requireManageScope(db, input.scopeId, actor);
    const target = await db.select({ id: pulsePeople.id }).from(pulsePeople).where(and(eq(pulsePeople.id, input.personId), eq(pulsePeople.isActive, true))).limit(1);
    if (!target[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Membership recipient must be an active Pulse person." });
    await db.transaction(async (tx: Db) => {
      await tx.insert(pulseScopeMemberships).values({ scopeId: input.scopeId, personId: input.personId, membershipRole: input.membershipRole, grantedByPersonId: actor.personId, isActive: true, revokedAt: null, revokedByPersonId: null }).onDuplicateKeyUpdate({ set: { membershipRole: input.membershipRole, grantedByPersonId: actor.personId, grantedAt: new Date(), isActive: true, revokedAt: null, revokedByPersonId: null } });
      await appendPulseEvent(tx, { eventType: "membership_granted", scopeId: input.scopeId, actorPersonId: actor.personId, payload: { scopeId: input.scopeId, personId: input.personId, membershipRole: input.membershipRole } });
    });
    return { success: true };
  }),

  archiveScope: protectedProcedure.input(z.object({ scopeId: z.number().int().positive(), reason: z.string().trim().max(2000).optional() })).mutation(async ({ input, ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    // This policy call evaluates scope.active before management capability; there is no role bypass.
    await requireManageScope(db, input.scopeId, actor);
    await db.transaction(async (tx: Db) => {
      await tx.update(pulseScopes).set({ isActive: false, archivedAt: new Date(), archivedByPersonId: actor.personId, archiveReason: input.reason ?? null }).where(eq(pulseScopes.id, input.scopeId));
      await appendPulseEvent(tx, { eventType: "scope_archived", scopeId: input.scopeId, actorPersonId: actor.personId, payload: { scopeId: input.scopeId, reason: input.reason ?? null } });
    });
    return { success: true };
  }),

  getCalendar: protectedProcedure.query(async ({ ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    await resolveActor(db, ctx.user.id);
    return resolvePulseCalendar(db);
  }),

  configureCalendar: protectedProcedure.input(z.object({ timezone: z.string().trim().min(1).max(64), fiscalYearStartMonth: z.number().int().min(1).max(12), operatingWeekStartsOn: z.number().int().min(0).max(6), dueWindowDays: z.number().int().min(0).max(90) })).mutation(async ({ input, ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    await db.transaction(async (tx: Db) => {
      const current = await tx.select().from(pulseCalendarConfig).where(eq(pulseCalendarConfig.isActive, true)).limit(1);
      if (current[0]) await tx.update(pulseCalendarConfig).set({ ...input, updatedByPersonId: actor.personId }).where(eq(pulseCalendarConfig.id, current[0].id));
      else await tx.insert(pulseCalendarConfig).values({ ...input, updatedByPersonId: actor.personId, isActive: true });
      await appendPulseEvent(tx, { eventType: "calendar_configured", actorPersonId: actor.personId, payload: { timezone: input.timezone, fiscalYearStartMonth: input.fiscalYearStartMonth, operatingWeekStartsOn: input.operatingWeekStartsOn, dueWindowDays: input.dueWindowDays } });
    });
    return { success: true };
  }),

  addReportingPeriod: protectedProcedure.input(z.object({ periodType: z.enum(["month", "quarter", "year", "custom"]), name: z.string().trim().min(2).max(128), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).mutation(async ({ input, ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const calendar = await db.select().from(pulseCalendarConfig).where(eq(pulseCalendarConfig.isActive, true)).limit(1);
    if (!calendar[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure the Pulse calendar before adding reporting periods." });
    const [result] = await db.insert(pulseReportingPeriods).values({ calendarConfigId: calendar[0].id, ...input });
    await appendPulseEvent(db, { eventType: "reporting_period_created", actorPersonId: actor.personId, payload: { periodType: input.periodType, name: input.name, startsOn: input.startsOn, endsOn: input.endsOn } });
    return { id: Number((result as any).insertId) };
  }),

  addHoliday: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(255), holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), isBusinessDay: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
    await requirePulseAdmin(ctx);
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const calendar = await db.select().from(pulseCalendarConfig).where(eq(pulseCalendarConfig.isActive, true)).limit(1);
    if (!calendar[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure the Pulse calendar before adding holidays." });
    const [result] = await db.insert(pulseHolidays).values({ calendarConfigId: calendar[0].id, ...input });
    await appendPulseEvent(db, { eventType: "holiday_created", actorPersonId: actor.personId, payload: { name: input.name, holidayDate: input.holidayDate, isBusinessDay: input.isBusinessDay } });
    return { id: Number((result as any).insertId) };
  }),

  /** Policy-contract endpoint used by acceptance tests and future query-led surfaces. */
  policyPreview: protectedProcedure.input(z.object({ scopeId: z.number().int().positive(), recipientPersonId: z.number().int().positive().optional() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const item = { primaryScopeId: input.scopeId };
    return {
      canView: await canView(db, input.scopeId, actor),
      canCreate: await canCreate(db, "work_item", input.scopeId, actor),
      canAssign: input.recipientPersonId ? await canAssign(db, item, input.recipientPersonId, actor) : null,
      canVote: await canVote(db, item, 0, actor),
      canManageMeeting: await canManageMeeting(db, input.scopeId, actor),
      canDeliver: input.recipientPersonId ? await canDeliver(db, { scopeId: input.scopeId, recipientPersonId: input.recipientPersonId }, actor) : null,
    };
  }),

  createWorkItem: protectedProcedure.input(z.object({
    itemType: z.enum(["todo", "issue"]),
    title: z.string().trim().min(2).max(512),
    description: z.string().trim().max(10000).optional().nullable(),
    primaryScopeId: z.number().int().positive(),
    assigneePersonId: z.number().int().positive().optional().nullable(),
    createdInScopeId: z.number().int().positive().optional().nullable(),
    createdInSessionId: z.string().trim().min(1).max(128).optional().nullable(),
    placementScopeIds: z.array(z.number().int().positive()).max(25).default([]),
    todo: z.object({ dueDate: z.coerce.date().optional().nullable(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), isFlagged: z.boolean().optional(), recurrenceId: z.number().int().positive().optional().nullable() }).optional(),
    issue: z.object({ priority: z.enum(["low", "medium", "high", "critical"]).optional(), timeframe: z.enum(["this_week", "this_quarter", "this_year", "someday", "unscheduled"]).optional() }).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    try { return { id: await createCanonicalWorkItem(db, actor, input) }; }
    catch (error: any) { throw new TRPCError({ code: "FORBIDDEN", message: error.message }); }
  }),

  myWork: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    return enrichCanonicalWorkItems(db, actor, { assigneePersonId: actor.personId });
  }),

  scopeWork: protectedProcedure.input(z.object({ scopeId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    return enrichCanonicalWorkItems(db, actor, { scopeId: input.scopeId });
  }),

  notificationWork: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    return enrichCanonicalWorkItems(db, actor, { notificationRecipientPersonId: actor.personId });
  }),

  getWorkItem: protectedProcedure.input(z.object({ itemId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    const access = await canViewWorkItem(db, input.itemId, actor);
    if (!access.allowed) throw new TRPCError({ code: access.reason === "scope_inactive" ? "NOT_FOUND" : "FORBIDDEN", message: "This work item is unavailable." });
    return (await enrichCanonicalWorkItems(db, actor)).find((item: any) => item.id === input.itemId) ?? null;
  }),

  moveWorkItem: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), toScopeId: z.number().int().positive(), note: z.string().trim().min(3).max(5000) })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    try { await moveCanonicalWorkItem(db, actor, input); return { success: true }; }
    catch (error: any) { throw new TRPCError({ code: "FORBIDDEN", message: error.message }); }
  }),

  transitionWorkItem: protectedProcedure.input(z.object({
    itemId: z.number().int().positive(),
    status: z.enum(["not_started", "in_progress", "blocked", "complete", "skipped"]),
    note: z.string().trim().max(5000).optional().nullable(),
    mode: z.enum(["standard", "runner_bulk_completion"]).default("standard"),
    blockerType: z.enum(["person", "dependency", "waiting", "external", "decision", "other"]).optional().nullable(),
    blockerPersonId: z.number().int().positive().optional().nullable(),
    completionNote: z.string().trim().max(5000).optional().nullable(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    try { await transitionCanonicalWorkItem(db, actor, input); return { success: true }; }
    catch (error: any) { throw new TRPCError({ code: "BAD_REQUEST", message: error.message }); }
  }),

  assignWorkItem: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), assigneePersonId: z.number().int().positive().nullable() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    try { await assignCanonicalWorkItem(db, actor, input.itemId, input.assigneePersonId); return { success: true }; }
    catch (error: any) { throw new TRPCError({ code: "FORBIDDEN", message: error.message }); }
  }),

  addWorkComment: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), body: z.string().trim().min(3).max(10000), mentionedPersonIds: z.array(z.number().int().positive()).max(50).default([]) })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    try { return { id: await addCanonicalWorkComment(db, actor, input) }; }
    catch (error: any) { throw new TRPCError({ code: "FORBIDDEN", message: error.message }); }
  }),

  voteIssue: protectedProcedure.input(z.object({ itemId: z.number().int().positive(), sessionId: z.string().trim().min(1).max(128).optional().nullable() })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const actor = await resolveActor(db, ctx.user.id);
    try { await voteCanonicalIssue(db, actor, input.itemId, input.sessionId); return { success: true }; }
    catch (error: any) { throw new TRPCError({ code: "FORBIDDEN", message: error.message }); }
  }),
});
