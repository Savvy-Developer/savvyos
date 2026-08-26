import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  PULSE_MEETING_PRESETS,
  PULSE_SECTION_KEYS,
  companyGoals,
  pulseMeetingGoals,
  pulseMeetingMembers,
  pulseMeetingRocks,
  pulseMeetingScorecardMetrics,
  pulseMeetingTodos,
  pulseMeetings,
  pulsePermissions,
  pulseMeetingsArchive,
  pulseWorkItems,
  rrScorecardMetrics,
  rolesResponsibilities,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { router } from "../_core/trpc";
import { canOpenPulseSettings, PULSE_CAPABILITIES, requireMeetingConfigurationAccess, requirePulseSettingsAccess, pulseProcedure } from "./authorization";

const id = () => crypto.randomUUID();
const daySchema = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const cadenceSchema = z.enum(["weekly", "biweekly", "monthly", "daily", "ad_hoc"]);
const labelSchema = z.enum(["level_10", "one_on_one", "other"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:30.");
const sectionKeySchema = z.enum(PULSE_SECTION_KEYS);
const meetingIdSchema = z.string().uuid();

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  return db;
}


async function assertActivePerson(db: any, personId: number) {
  const [person] = await db.select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, personId), eq(users.isActive, true), sql`${users.openId} NOT LIKE 'pulse_slice_fixture_%'`))
    .limit(1);
  if (!person) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS person." });
  return person;
}

function defaultSectionDurations(order: readonly string[]) {
  return Object.fromEntries(order.map((section) => [section, 5]));
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function trend(values: number[]) {
  if (values.length < 3) return "flat" as const;
  const pivot = Math.ceil(values.length / 2);
  const older = average(values.slice(0, pivot));
  const newer = average(values.slice(pivot));
  if (older == null || newer == null) return "flat" as const;
  const tolerance = Math.max(Math.abs(older) * 0.05, 0.1);
  return newer > older + tolerance ? "up" as const : newer < older - tolerance ? "down" as const : "flat" as const;
}

async function ensureLeadershipMemberships(db: any, meetingId: string, ownerId: number, administratorId: number, actorId: number) {
  await assertActivePerson(db, ownerId);
  await assertActivePerson(db, administratorId);
  const [meeting] = await db.select({ ownerId: pulseMeetings.ownerId, administratorId: pulseMeetings.administratorId })
    .from(pulseMeetings).where(eq(pulseMeetings.id, meetingId)).limit(1);
  if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists. Go to your meetings." });

  await db.update(pulseMeetings).set({ ownerId, administratorId }).where(eq(pulseMeetings.id, meetingId));

  const leaders = new Map<number, "owner" | "administrator">();
  leaders.set(ownerId, "owner");
  if (administratorId !== ownerId) leaders.set(administratorId, "administrator");
  for (const [personId, meetingRole] of Array.from(leaders.entries())) {
    await db.insert(pulseMeetingMembers).values({ id: id(), meetingId, personId, meetingRole, addedById: actorId })
      .onDuplicateKeyUpdate({ set: { meetingRole, removedAt: null, deletedAt: null, addedById: actorId } });
  }

  for (const priorId of [meeting.ownerId, meeting.administratorId]) {
    if (!leaders.has(priorId)) {
      await db.update(pulseMeetingMembers).set({ meetingRole: "member" })
        .where(and(eq(pulseMeetingMembers.meetingId, meetingId), eq(pulseMeetingMembers.personId, priorId), isNull(pulseMeetingMembers.deletedAt)));
    }
  }
}

async function meetingMembers(db: any, meetingId: string) {
  return db.select({
    personId: users.id,
    name: users.name,
    email: users.email,
    meetingRole: pulseMeetingMembers.meetingRole,
    addedAt: pulseMeetingMembers.addedAt,
  }).from(pulseMeetingMembers)
    .innerJoin(users, eq(users.id, pulseMeetingMembers.personId))
    .where(and(eq(pulseMeetingMembers.meetingId, meetingId), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt)))
    .orderBy(asc(users.name));
}

export const pulseSettingsRouter = router({
  configuration: pulseProcedure
    .input(z.object({ meetingId: meetingIdSchema }))
    .query(async ({ ctx, input }) => {
      const db = await database();
      await requireMeetingConfigurationAccess(db, ctx.user, input.meetingId);
      const [meeting] = await db.select().from(pulseMeetings).where(and(eq(pulseMeetings.id, input.meetingId), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists. Go to your meetings." });
      const [members, metricMappings, goalMappings, rockMappings, todoMappings, archive, metricCandidates, goalCandidates, rockCandidates, todoCandidates] = await Promise.all([
        meetingMembers(db, meeting.id),
        db.select({ id: pulseMeetingScorecardMetrics.id, metricId: rrScorecardMetrics.id, name: rrScorecardMetrics.name, ownerName: users.name, sortOrder: pulseMeetingScorecardMetrics.sortOrder })
          .from(pulseMeetingScorecardMetrics).leftJoin(rrScorecardMetrics, eq(rrScorecardMetrics.id, pulseMeetingScorecardMetrics.savvyosMetricId)).leftJoin(users, eq(users.id, rrScorecardMetrics.createdById))
          .where(eq(pulseMeetingScorecardMetrics.meetingId, meeting.id)).orderBy(asc(pulseMeetingScorecardMetrics.sortOrder)),
        db.select({ id: pulseMeetingGoals.id, goalId: companyGoals.id, title: companyGoals.title, ownerName: users.name, sortOrder: pulseMeetingGoals.sortOrder })
          .from(pulseMeetingGoals).leftJoin(companyGoals, eq(companyGoals.id, pulseMeetingGoals.savvyosGoalId)).leftJoin(users, eq(users.id, companyGoals.ownerId))
          .where(eq(pulseMeetingGoals.meetingId, meeting.id)).orderBy(asc(pulseMeetingGoals.sortOrder)),
        db.select({ id: pulseMeetingRocks.id, workItemId: pulseWorkItems.id, title: pulseWorkItems.title, ownerName: users.name, sortOrder: pulseMeetingRocks.sortOrder })
          .from(pulseMeetingRocks).innerJoin(pulseWorkItems, eq(pulseWorkItems.id, pulseMeetingRocks.workItemId)).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
          .where(and(eq(pulseMeetingRocks.meetingId, meeting.id), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseMeetingRocks.sortOrder)),
        db.select({ id: pulseMeetingTodos.id, workItemId: pulseWorkItems.id, title: pulseWorkItems.title, ownerName: users.name, sortOrder: pulseMeetingTodos.sortOrder })
          .from(pulseMeetingTodos).innerJoin(pulseWorkItems, eq(pulseWorkItems.id, pulseMeetingTodos.workItemId)).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
          .where(and(eq(pulseMeetingTodos.meetingId, meeting.id), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseMeetingTodos.sortOrder)),
        db.select({ id: pulseMeetingsArchive.id, occurredAt: pulseMeetingsArchive.occurredAt, durationActualMinutes: pulseMeetingsArchive.durationActualMinutes, attendeeIds: pulseMeetingsArchive.attendeeIds, todosCreated: pulseMeetingsArchive.todosCreated, todosCompleted: pulseMeetingsArchive.todosCompleted, issuesResolved: pulseMeetingsArchive.issuesResolved, rating: pulseMeetingsArchive.rating, notes: pulseMeetingsArchive.notes })
          .from(pulseMeetingsArchive).where(and(eq(pulseMeetingsArchive.meetingId, meeting.id), isNull(pulseMeetingsArchive.deletedAt))).orderBy(asc(pulseMeetingsArchive.occurredAt)),
        db.select({ id: rrScorecardMetrics.id, title: rrScorecardMetrics.name, ownerName: users.name }).from(rrScorecardMetrics).innerJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId)).innerJoin(users, eq(users.id, rolesResponsibilities.ownerId)).where(eq(rrScorecardMetrics.status, "active")).orderBy(asc(rrScorecardMetrics.name)),
        db.select({ id: companyGoals.id, title: companyGoals.title, ownerName: users.name }).from(companyGoals).leftJoin(users, eq(users.id, companyGoals.ownerId)).where(eq(companyGoals.status, "active")).orderBy(asc(companyGoals.title)),
        db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, ownerName: users.name }).from(pulseWorkItems).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId)).where(and(eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseWorkItems.title)),
        db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, ownerName: users.name }).from(pulseWorkItems).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId)).where(and(eq(pulseWorkItems.type, "todo"), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseWorkItems.title)),
      ]);
      return { meeting, members, metricMappings, goalMappings, rockMappings, todoMappings, archive, metricCandidates, goalCandidates, rockCandidates, todoCandidates };
    }),

  setContentMapping: pulseProcedure
    .input(z.object({ meetingId: meetingIdSchema, kind: z.enum(["metric", "goal", "rock", "todo"]), sourceId: z.union([z.number().int().positive(), z.string().uuid()]), selected: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requireMeetingConfigurationAccess(db, ctx.user, input.meetingId);
      if (input.kind === "metric") {
        const metricId = Number(input.sourceId);
        if (input.selected) {
          const [metric] = await db.select({ id: rrScorecardMetrics.id }).from(rrScorecardMetrics).where(and(eq(rrScorecardMetrics.id, metricId), eq(rrScorecardMetrics.status, "active"))).limit(1);
          if (!metric) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS metric." });
          const rows = await db.select({ sortOrder: pulseMeetingScorecardMetrics.sortOrder }).from(pulseMeetingScorecardMetrics).where(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId));
          await db.insert(pulseMeetingScorecardMetrics).values({ id: id(), meetingId: input.meetingId, savvyosMetricId: metricId, sortOrder: rows.length ? Math.max(...rows.map((row: any) => row.sortOrder)) + 1 : 0, addedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { savvyosMetricId: metricId } });
        } else await db.delete(pulseMeetingScorecardMetrics).where(and(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId), eq(pulseMeetingScorecardMetrics.savvyosMetricId, metricId)));
      }
      if (input.kind === "goal") {
        const goalId = Number(input.sourceId);
        if (input.selected) {
          const [goal] = await db.select({ id: companyGoals.id }).from(companyGoals).where(and(eq(companyGoals.id, goalId), eq(companyGoals.status, "active"))).limit(1);
          if (!goal) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS company goal." });
          const rows = await db.select({ sortOrder: pulseMeetingGoals.sortOrder }).from(pulseMeetingGoals).where(eq(pulseMeetingGoals.meetingId, input.meetingId));
          await db.insert(pulseMeetingGoals).values({ id: id(), meetingId: input.meetingId, savvyosGoalId: goalId, sortOrder: rows.length ? Math.max(...rows.map((row: any) => row.sortOrder)) + 1 : 0 }).onDuplicateKeyUpdate({ set: { savvyosGoalId: goalId } });
        } else await db.delete(pulseMeetingGoals).where(and(eq(pulseMeetingGoals.meetingId, input.meetingId), eq(pulseMeetingGoals.savvyosGoalId, goalId)));
      }
      if (input.kind === "rock") {
        const workItemId = String(input.sourceId);
        if (input.selected) {
          const [rock] = await db.select({ id: pulseWorkItems.id }).from(pulseWorkItems).where(and(eq(pulseWorkItems.id, workItemId), eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt))).limit(1);
          if (!rock) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Pulse rock." });
          const rows = await db.select({ sortOrder: pulseMeetingRocks.sortOrder }).from(pulseMeetingRocks).where(eq(pulseMeetingRocks.meetingId, input.meetingId));
          await db.insert(pulseMeetingRocks).values({ id: id(), meetingId: input.meetingId, workItemId, sortOrder: rows.length ? Math.max(...rows.map((row: any) => row.sortOrder)) + 1 : 0 }).onDuplicateKeyUpdate({ set: { workItemId } });
        } else await db.delete(pulseMeetingRocks).where(and(eq(pulseMeetingRocks.meetingId, input.meetingId), eq(pulseMeetingRocks.workItemId, workItemId)));
      }
      if (input.kind === "todo") {
        const workItemId = String(input.sourceId);
        if (input.selected) {
          const [todo] = await db.select({ id: pulseWorkItems.id }).from(pulseWorkItems).where(and(eq(pulseWorkItems.id, workItemId), eq(pulseWorkItems.type, "todo"), isNull(pulseWorkItems.deletedAt))).limit(1);
          if (!todo) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Pulse To-Do." });
          const rows = await db.select({ sortOrder: pulseMeetingTodos.sortOrder }).from(pulseMeetingTodos).where(eq(pulseMeetingTodos.meetingId, input.meetingId));
          await db.insert(pulseMeetingTodos).values({ id: id(), meetingId: input.meetingId, workItemId, sortOrder: rows.length ? Math.max(...rows.map((row: any) => row.sortOrder)) + 1 : 0, addedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { workItemId } });
        } else await db.delete(pulseMeetingTodos).where(and(eq(pulseMeetingTodos.meetingId, input.meetingId), eq(pulseMeetingTodos.workItemId, workItemId)));
      }
      return { success: true };
    }),

  configurationMeetings: pulseProcedure.query(async ({ ctx }) => {
    const db = await database();
    if (await canOpenPulseSettings(db, ctx.user)) {
      return db.select({ id: pulseMeetings.id, name: pulseMeetings.name, label: pulseMeetings.label, meetingRole: pulseMeetingMembers.meetingRole })
        .from(pulseMeetings)
        .leftJoin(pulseMeetingMembers, and(eq(pulseMeetingMembers.meetingId, pulseMeetings.id), eq(pulseMeetingMembers.personId, ctx.user.id), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt)))
        .where(and(eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name));
    }
    return db.select({ id: pulseMeetings.id, name: pulseMeetings.name, label: pulseMeetings.label, meetingRole: pulseMeetingMembers.meetingRole })
      .from(pulseMeetings).innerJoin(pulseMeetingMembers, and(eq(pulseMeetingMembers.meetingId, pulseMeetings.id), eq(pulseMeetingMembers.personId, ctx.user.id), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt)))
      .where(and(eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt), inArray(pulseMeetingMembers.meetingRole, ["owner", "administrator"]))).orderBy(asc(pulseMeetings.name));
  }),

  searchPeople: pulseProcedure
    .input(z.object({ meetingId: meetingIdSchema, query: z.string().trim().max(100).default("") }))
    .query(async ({ ctx, input }) => {
      const db = await database();
      await requireMeetingConfigurationAccess(db, ctx.user, input.meetingId);
      const condition = input.query ? or(like(users.name, `%${input.query}%`), like(users.email, `%${input.query}%`)) : undefined;
      return db.select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.isActive, true), sql`${users.openId} NOT LIKE 'pulse_slice_fixture_%'`, condition))
        .orderBy(asc(users.name)).limit(50);
    }),

  updateMeeting: pulseProcedure
    .input(z.object({
      meetingId: meetingIdSchema,
      name: z.string().trim().min(1).max(255).optional(),
      purpose: z.string().trim().min(1).max(500).nullable().optional(),
      label: labelSchema.optional(),
      dayOfWeek: daySchema.nullable().optional(),
      startTime: timeSchema.nullable().optional(),
      durationMinutes: z.number().int().min(5).max(480).optional(),
      timezone: z.string().trim().min(1).max(64).optional(),
      cadence: cadenceSchema.optional(),
      reminderDay: daySchema.nullable().optional(),
      reminderTime: timeSchema.nullable().optional(),
      segueResetDay: daySchema.nullable().optional(),
      headlinesResetDay: daySchema.nullable().optional(),
      notificationConfig: z.record(z.string(), z.object({ enabled: z.boolean().optional(), email: z.boolean().optional(), inApp: z.boolean().optional() })).nullable().optional(),
      sectionsEnabled: z.record(sectionKeySchema, z.boolean()).optional(),
      sectionOrder: z.array(sectionKeySchema).min(1).max(PULSE_SECTION_KEYS.length).optional(),
      sectionDurations: z.record(sectionKeySchema, z.number().int().min(0).max(240)).optional(),
      ownerId: z.number().int().positive().optional(),
      administratorId: z.number().int().positive().optional(),
    }).refine((value) => Object.keys(value).some((key) => key !== "meetingId"), { message: "Choose a meeting setting to update." }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requireMeetingConfigurationAccess(db, ctx.user, input.meetingId);
      const [meeting] = await db.select().from(pulseMeetings).where(and(eq(pulseMeetings.id, input.meetingId), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists. Go to your meetings." });
      const { meetingId, ownerId, administratorId, ...changes } = input;
      if (changes.sectionOrder && changes.sectionsEnabled) {
        for (const section of PULSE_SECTION_KEYS) if (!(section in changes.sectionsEnabled)) changes.sectionsEnabled[section] = false;
      }
      const effectiveLabel = changes.label ?? meeting.label;
      const effectiveOrder = changes.sectionOrder ?? meeting.sectionOrder;
      const effectiveEnabled = changes.sectionsEnabled ?? meeting.sectionsEnabled;
      if (effectiveLabel === "level_10") {
        if (!effectiveOrder.includes("issues") || !effectiveOrder.includes("conclude") || !effectiveEnabled.issues || !effectiveEnabled.conclude) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Every L10 requires IDS and Conclude." });
        }
        changes.cadence = "weekly";
      }
      if (Object.keys(changes).length) await db.update(pulseMeetings).set(changes).where(eq(pulseMeetings.id, meetingId));
      if (ownerId !== undefined || administratorId !== undefined) {
        await ensureLeadershipMemberships(db, meetingId, ownerId ?? meeting.ownerId, administratorId ?? meeting.administratorId, ctx.user.id);
      }
      return { success: true };
    }),

  setMemberAccess: pulseProcedure
    .input(z.object({ meetingId: meetingIdSchema, personId: z.number().int().positive(), hasAccess: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requireMeetingConfigurationAccess(db, ctx.user, input.meetingId);
      const [meeting] = await db.select().from(pulseMeetings).where(and(eq(pulseMeetings.id, input.meetingId), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists. Go to your meetings." });
      const [existing] = await db.select({ meetingRole: pulseMeetingMembers.meetingRole, removedAt: pulseMeetingMembers.removedAt })
        .from(pulseMeetingMembers).where(and(eq(pulseMeetingMembers.meetingId, input.meetingId), eq(pulseMeetingMembers.personId, input.personId), isNull(pulseMeetingMembers.deletedAt))).limit(1);
      if (input.hasAccess) {
        await assertActivePerson(db, input.personId);
        await db.insert(pulseMeetingMembers).values({ id: id(), meetingId: input.meetingId, personId: input.personId, meetingRole: "member", addedById: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { removedAt: null, deletedAt: null, meetingRole: existing?.meetingRole ?? "member", addedById: ctx.user.id } });
      } else {
        if (input.personId === meeting.ownerId || input.personId === meeting.administratorId || existing?.meetingRole === "owner" || existing?.meetingRole === "administrator") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a new owner or administrator before removing this person." });
        }
        await db.update(pulseMeetingMembers).set({ removedAt: new Date() }).where(and(eq(pulseMeetingMembers.meetingId, input.meetingId), eq(pulseMeetingMembers.personId, input.personId), isNull(pulseMeetingMembers.deletedAt)));
      }
      return { success: true, undo: { meetingId: input.meetingId, personId: input.personId, restoreAccess: !input.hasAccess } };
    }),

  restoreMemberAccess: pulseProcedure
    .input(z.object({ meetingId: meetingIdSchema, personId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requireMeetingConfigurationAccess(db, ctx.user, input.meetingId);
      await assertActivePerson(db, input.personId);
      await db.update(pulseMeetingMembers).set({ removedAt: null, addedById: ctx.user.id })
        .where(and(eq(pulseMeetingMembers.meetingId, input.meetingId), eq(pulseMeetingMembers.personId, input.personId), isNull(pulseMeetingMembers.deletedAt)));
      return { success: true };
    }),

  peopleForAdministration: pulseProcedure.query(async ({ ctx }) => {
    const db = await database();
    await requirePulseSettingsAccess(db, ctx.user);
    return db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.isActive, true), sql`${users.openId} NOT LIKE 'pulse_slice_fixture_%'`)).orderBy(asc(users.name));
  }),

  createMeeting: pulseProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(255), purpose: z.string().trim().min(1).max(500), label: labelSchema, ownerId: z.number().int().positive(), administratorId: z.number().int().positive(), memberIds: z.array(z.number().int().positive()).max(100).default([]),
      dayOfWeek: daySchema.nullable().optional(), startTime: timeSchema.nullable().optional(), durationMinutes: z.number().int().min(5).max(480).default(90), timezone: z.string().trim().min(1).max(64).default("America/New_York"), cadence: cadenceSchema.default("weekly"), reminderDay: daySchema.nullable().optional(), reminderTime: timeSchema.nullable().optional(), segueResetDay: daySchema.nullable().optional(), headlinesResetDay: daySchema.nullable().optional(), notificationConfig: z.record(z.string(), z.object({ enabled: z.boolean().optional(), email: z.boolean().optional(), inApp: z.boolean().optional() })).nullable().optional(),
      sectionsEnabled: z.record(sectionKeySchema, z.boolean()).optional(), sectionOrder: z.array(sectionKeySchema).min(1).max(PULSE_SECTION_KEYS.length).optional(), sectionDurations: z.record(sectionKeySchema, z.number().int().min(0).max(240)).optional(),
    }).superRefine((value, context) => {
      if (value.label === "one_on_one" && value.ownerId === value.administratorId) context.addIssue({ code: "custom", message: "A one-on-one requires a distinct owner and administrator." });
      if (value.label === "one_on_one" && value.memberIds.length) context.addIssue({ code: "custom", message: "A one-on-one includes only its owner and administrator." });
      if (value.label === "level_10") {
        const order = value.sectionOrder ?? PULSE_MEETING_PRESETS.level_10;
        const enabled = value.sectionsEnabled ?? Object.fromEntries(PULSE_SECTION_KEYS.map((section) => [section, order.includes(section)]));
        if (!order.includes("issues") || !order.includes("conclude") || !enabled.issues || !enabled.conclude) context.addIssue({ code: "custom", message: "Every L10 requires IDS and Conclude." });
      }
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requirePulseSettingsAccess(db, ctx.user);
      await assertActivePerson(db, input.ownerId); await assertActivePerson(db, input.administratorId);
      const meetingId = id();
      const sectionOrder = input.sectionOrder ?? PULSE_MEETING_PRESETS[input.label];
      const sectionsEnabled = input.sectionsEnabled ?? Object.fromEntries(PULSE_SECTION_KEYS.map((section) => [section, sectionOrder.includes(section)]));
      const sectionDurations = input.sectionDurations ?? defaultSectionDurations(sectionOrder);
      const memberIds = new Set([input.ownerId, input.administratorId, ...input.memberIds]);
      await db.transaction(async (tx: any) => {
        await tx.insert(pulseMeetings).values({ id: meetingId, name: input.name, purpose: input.purpose, label: input.label, ownerId: input.ownerId, administratorId: input.administratorId, dayOfWeek: input.dayOfWeek ?? null, startTime: input.startTime ?? null, durationMinutes: input.durationMinutes, timezone: input.timezone, cadence: input.label === "level_10" ? "weekly" : input.cadence, reminderDay: input.reminderDay ?? null, reminderTime: input.reminderTime ?? null, segueResetDay: input.segueResetDay ?? input.dayOfWeek ?? null, headlinesResetDay: input.headlinesResetDay ?? input.dayOfWeek ?? null, notificationConfig: input.notificationConfig ?? { submission_reminder: { enabled: true, email: true, inApp: true }, submission_confirmation: { enabled: true, email: true, inApp: false }, todo_assigned: { enabled: true, email: true, inApp: true }, recap: { enabled: true, email: true, inApp: true } }, sectionsEnabled, sectionOrder, sectionDurations });
        await tx.insert(pulseMeetingMembers).values(Array.from(memberIds).map((personId) => ({ id: id(), meetingId, personId, meetingRole: personId === input.ownerId ? "owner" as const : personId === input.administratorId ? "administrator" as const : "member" as const, addedById: ctx.user.id })));
      });
      return { id: meetingId };
    }),

  deleteMeeting: pulseProcedure
    .input(z.object({ meetingId: meetingIdSchema, confirmation: z.string().trim().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requireMeetingConfigurationAccess(db, ctx.user, input.meetingId);
      const [meeting] = await db.select().from(pulseMeetings).where(and(eq(pulseMeetings.id, input.meetingId), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists. Go to your meetings." });
      if (input.confirmation !== meeting.name) throw new TRPCError({ code: "BAD_REQUEST", message: "Type the meeting name exactly to delete it." });
      await db.update(pulseMeetings).set({ isActive: false, deletedAt: new Date() }).where(eq(pulseMeetings.id, meeting.id));
      return { success: true };
    }),

  effectiveness: pulseProcedure.query(async ({ ctx }) => {
    const db = await database();
    await requirePulseSettingsAccess(db, ctx.user);
    const meetings = await db.select({ id: pulseMeetings.id, name: pulseMeetings.name, scheduledMinutes: pulseMeetings.durationMinutes }).from(pulseMeetings).where(and(eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name));
    return Promise.all(meetings.map(async (meeting: any) => {
      const [occurrencesDescending, members] = await Promise.all([
        db.select({ id: pulseMeetingsArchive.id, occurredAt: pulseMeetingsArchive.occurredAt, durationActualMinutes: pulseMeetingsArchive.durationActualMinutes, attendeeIds: pulseMeetingsArchive.attendeeIds, todosCreated: pulseMeetingsArchive.todosCreated, todosCompleted: pulseMeetingsArchive.todosCompleted, issuesResolved: pulseMeetingsArchive.issuesResolved, rating: pulseMeetingsArchive.rating, notes: pulseMeetingsArchive.notes }).from(pulseMeetingsArchive).where(and(eq(pulseMeetingsArchive.meetingId, meeting.id), isNull(pulseMeetingsArchive.deletedAt))).orderBy(desc(pulseMeetingsArchive.occurredAt)).limit(8),
        db.select({ personId: pulseMeetingMembers.personId }).from(pulseMeetingMembers).where(and(eq(pulseMeetingMembers.meetingId, meeting.id), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt))),
      ]);
      const occurrences = [...(occurrencesDescending as any[])].reverse();
      const durations = occurrences.map((row) => row.durationActualMinutes).filter((value): value is number => value != null);
      const attendance = occurrences.map((row) => members.length ? row.attendeeIds.length / members.length : 0);
      const ratings = occurrences.map((row) => row.rating).filter((value): value is number => value != null);
      const todoCreated = occurrences.map((row) => row.todosCreated);
      const todoCompleted = occurrences.map((row) => row.todosCompleted);
      const issuesResolved = occurrences.map((row) => row.issuesResolved);
      return {
        meeting: { id: meeting.id, name: meeting.name, scheduledMinutes: meeting.scheduledMinutes, memberCount: members.length },
        occurrenceCount: occurrences.length,
        duration: { average: average(durations), scheduledMinutes: meeting.scheduledMinutes, trend: trend(durations) },
        todos: { completed: todoCompleted.reduce((total, value) => total + value, 0), created: todoCreated.reduce((total, value) => total + value, 0), trend: trend(todoCompleted.map((value, index) => value - todoCreated[index])) },
        issues: { resolved: issuesResolved.reduce((total, value) => total + value, 0), perOccurrence: average(issuesResolved), trend: trend(issuesResolved) },
        attendance: { average: average(attendance), trend: trend(attendance) },
        rating: { average: average(ratings), trend: trend(ratings) },
      };
    }));
  }),

  effectivenessHistory: pulseProcedure.input(z.object({ meetingId: meetingIdSchema })).query(async ({ ctx, input }) => {
    const db = await database();
    await requirePulseSettingsAccess(db, ctx.user);
    const [meeting] = await db.select({ id: pulseMeetings.id, name: pulseMeetings.name, scheduledMinutes: pulseMeetings.durationMinutes }).from(pulseMeetings).where(and(eq(pulseMeetings.id, input.meetingId), isNull(pulseMeetings.deletedAt))).limit(1);
    if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists." });
    const [occurrences, members] = await Promise.all([
      db.select({ id: pulseMeetingsArchive.id, occurredAt: pulseMeetingsArchive.occurredAt, durationActualMinutes: pulseMeetingsArchive.durationActualMinutes, attendeeIds: pulseMeetingsArchive.attendeeIds, todosCreated: pulseMeetingsArchive.todosCreated, todosCompleted: pulseMeetingsArchive.todosCompleted, issuesCreated: pulseMeetingsArchive.issuesCreated, issuesResolved: pulseMeetingsArchive.issuesResolved, rating: pulseMeetingsArchive.rating, notes: pulseMeetingsArchive.notes }).from(pulseMeetingsArchive).where(and(eq(pulseMeetingsArchive.meetingId, input.meetingId), isNull(pulseMeetingsArchive.deletedAt))).orderBy(asc(pulseMeetingsArchive.occurredAt)),
      db.select({ personId: pulseMeetingMembers.personId }).from(pulseMeetingMembers).where(and(eq(pulseMeetingMembers.meetingId, input.meetingId), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt))),
    ]);
    return { meeting: { ...meeting, memberCount: members.length }, occurrences };
  }),

  permissioning: pulseProcedure.query(async ({ ctx }) => {
    const db = await database();
    await requirePulseSettingsAccess(db, ctx.user);
      const [people, meetings, memberships, capabilities] = await Promise.all([
        db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.isActive, true), sql`${users.openId} NOT LIKE 'pulse_slice_fixture_%'`)).orderBy(asc(users.name)),
        db.select({ id: pulseMeetings.id, name: pulseMeetings.name, ownerId: pulseMeetings.ownerId, administratorId: pulseMeetings.administratorId, notificationConfig: pulseMeetings.notificationConfig }).from(pulseMeetings).where(and(eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name)),
        db.select({ meetingId: pulseMeetingMembers.meetingId, personId: pulseMeetingMembers.personId, meetingRole: pulseMeetingMembers.meetingRole }).from(pulseMeetingMembers).where(and(isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt))),
        db.select({ personId: pulsePermissions.personId, capability: pulsePermissions.capability, allowed: pulsePermissions.allowed }).from(pulsePermissions),
      ]);
      return { people, meetings, memberships, capabilities, capabilityKeys: PULSE_CAPABILITIES };
  }),

  setPulseCapability: pulseProcedure
    .input(z.object({ personId: z.number().int().positive(), capability: z.enum(PULSE_CAPABILITIES), allowed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requirePulseSettingsAccess(db, ctx.user);
      const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.personId)).limit(1);
      if (person?.email?.toLowerCase() === "tyler@savvy.realty" && !input.allowed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tyler retains every Pulse capability." });
      }
      await assertActivePerson(db, input.personId);
      await db.insert(pulsePermissions).values({ id: id(), personId: input.personId, capability: input.capability, allowed: input.allowed, grantedById: ctx.user.id })
        .onDuplicateKeyUpdate({ set: { allowed: input.allowed, grantedById: ctx.user.id } });
      return { success: true };
    }),

  setPermission: pulseProcedure
    .input(z.object({ meetingId: meetingIdSchema, personId: z.number().int().positive(), hasAccess: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requirePulseSettingsAccess(db, ctx.user);
      const [meeting] = await db.select().from(pulseMeetings).where(and(eq(pulseMeetings.id, input.meetingId), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).limit(1);
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND", message: "This meeting no longer exists." });
      const [person] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.personId)).limit(1);
      if (!input.hasAccess && person?.email?.toLowerCase() === "tyler@savvy.realty") throw new TRPCError({ code: "BAD_REQUEST", message: "Tyler retains access to every Pulse meeting." });
      if (!input.hasAccess && (input.personId === meeting.ownerId || input.personId === meeting.administratorId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a new owner or administrator before removing this person." });
      if (input.hasAccess) {
        await assertActivePerson(db, input.personId);
        await db.insert(pulseMeetingMembers).values({ id: id(), meetingId: input.meetingId, personId: input.personId, meetingRole: "member", addedById: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { removedAt: null, deletedAt: null, addedById: ctx.user.id } });
      } else {
        await db.update(pulseMeetingMembers).set({ removedAt: new Date() }).where(and(eq(pulseMeetingMembers.meetingId, input.meetingId), eq(pulseMeetingMembers.personId, input.personId), isNull(pulseMeetingMembers.deletedAt)));
      }
      return { success: true, undo: { meetingId: input.meetingId, personId: input.personId, restoreAccess: !input.hasAccess } };
    }),

});
