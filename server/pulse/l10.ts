import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  pulseActivityLog,
  pulseCascadeDestinations,
  pulseCascadeRecipients,
  pulseCascadingMessages,
  pulseMeetingMembers,
  pulseMeetingRocks,
  pulseMeetingScorecardMetrics,
  pulseMeetingSessions,
  pulseMeetings,
  pulseNotifications,
  pulsePermissions,
  pulseSessionRatings,
  pulseSessionReports,
  pulseWorkItemMoves,
  pulseWorkItemStatusNotes,
  pulseWorkItemComments,
  pulseWorkItemAttachments,
  pulseIssueResultingTodos,
  pulseWorkItems,
  rrMetricValues,
  rrScorecardMetrics,
  rolesResponsibilities,
  users,
} from "../../drizzle/schema";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { require_visible_meeting, visible_meeting_ids } from "./access";
import { hasPulseCapability, PULSE_CAPABILITIES, pulseMemberProcedure, requirePulseCapability } from "./authorization";

const id = () => crypto.randomUUID();
const day = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:30.");
const meetingId = z.string().uuid();
const sessionId = z.string().uuid();
const dashboardSections = ["overview", "segue", "headlines", "scorecard", "rocks", "todos", "issues", "archive"] as const;
const runnerSteps = ["segue", "scorecard", "rocks", "headlines", "todos", "issues", "conclude"] as const;
const workType = z.enum(["todo", "issue", "rock"]);
const rockStatus = z.enum(["on_track", "at_risk", "off_track", "done", "dropped"]);
const todoStatus = z.enum(["not_started", "in_progress", "blocked", "completed"]);

const L10_DEFAULT_SECTIONS: Record<(typeof dashboardSections)[number], boolean> = {
  overview: true,
  segue: true,
  headlines: true,
  scorecard: true,
  rocks: true,
  todos: true,
  issues: true,
  archive: true,
};

function unavailable() {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
}

function notFound(message = "This L10 is not available.") {
  return new TRPCError({ code: "NOT_FOUND", message });
}

async function database() {
  const db = await getDb();
  if (!db) throw unavailable();
  return db;
}

function normaliseSections(stored: Record<string, boolean> | null | undefined) {
  return { ...L10_DEFAULT_SECTIONS, ...(stored ?? {}) };
}

function normaliseDurations(stored: Record<string, number> | null | undefined) {
  return { segue: 5, scorecard: 5, rocks: 5, headlines: 5, todos: 5, issues: 60, conclude: 5, ...(stored ?? {}) };
}

function dateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString().slice(0, 10);
}

function currentQuarter(reference = new Date()) {
  return `${reference.getUTCFullYear()}-Q${Math.floor(reference.getUTCMonth() / 3) + 1}`;
}

function defaultDueDate() {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 7);
  return value.toISOString().slice(0, 10);
}

function scheduledNow() {
  const value = new Date();
  value.setUTCSeconds(0, 0);
  return value;
}

async function writeActivity(db: any, personId: number, entityType: string, entityId: string, action: string, oldValue?: unknown, newValue?: unknown) {
  await db.insert(pulseActivityLog).values({ id: id(), personId, entityType, entityId, action, oldValue: oldValue ?? null, newValue: newValue ?? null });
}

async function activeMembership(db: any, personId: number, targetMeetingId: string, includeArchived = false) {
  const [row] = await db.select({ id: pulseMeetingMembers.id, meeting: pulseMeetings })
    .from(pulseMeetingMembers)
    .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseMeetingMembers.meetingId))
    .where(and(
      eq(pulseMeetingMembers.meetingId, targetMeetingId),
      eq(pulseMeetingMembers.personId, personId),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
      isNull(pulseMeetings.deletedAt),
      ...(includeArchived ? [] : [eq(pulseMeetings.isActive, true)]),
    ))
    .limit(1);
  if (!row) throw notFound(includeArchived ? "This L10 history is not available." : undefined);
  return row.meeting;
}

async function requireL10Capability(db: any, user: { id: number }, targetMeetingId: string, capability: (typeof PULSE_CAPABILITIES)[number]) {
  const meeting = await activeMembership(db, user.id, targetMeetingId);
  if (!await hasPulseCapability(db, user, capability)) throw new TRPCError({ code: "FORBIDDEN", message: "Your Pulse permissions do not allow this action." });
  return meeting;
}

async function requireL10Runner(db: any, user: { id: number }, targetMeetingId: string) {
  const meeting = await activeMembership(db, user.id, targetMeetingId);
  const hasMatrixRunAuthority = await hasPulseCapability(db, user, "run_l10s");
  if (!hasMatrixRunAuthority && meeting.administratorId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Only this L10’s Administrator or a Pulse user with meeting-run authority can run it." });
  return meeting;
}

async function listMembers(db: any, targetMeetingId: string) {
  return db.select({ id: users.id, name: users.name, email: users.email })
    .from(pulseMeetingMembers)
    .innerJoin(users, eq(users.id, pulseMeetingMembers.personId))
    .where(and(eq(pulseMeetingMembers.meetingId, targetMeetingId), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt)))
    .orderBy(asc(users.name));
}

async function assertMember(db: any, targetMeetingId: string, personId: number) {
  const members = await listMembers(db, targetMeetingId);
  if (!members.some((member: any) => member.id === personId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a participant in this L10." });
}

async function getActiveSession(db: any, targetMeetingId: string) {
  const [session] = await db.select().from(pulseMeetingSessions)
    .where(and(eq(pulseMeetingSessions.meetingId, targetMeetingId), inArray(pulseMeetingSessions.status, ["running", "paused"])))
    .orderBy(desc(pulseMeetingSessions.startedAt))
    .limit(1);
  return session ?? null;
}

async function requireSession(db: any, targetMeetingId: string, targetSessionId: string, activeOnly = false) {
  const [session] = await db.select().from(pulseMeetingSessions)
    .where(and(eq(pulseMeetingSessions.id, targetSessionId), eq(pulseMeetingSessions.meetingId, targetMeetingId)))
    .limit(1);
  if (!session || (activeOnly && !["running", "paused"].includes(session.status))) throw notFound("This L10 session is not available.");
  return session;
}

async function getScorecard(db: any, targetMeetingId: string, historyWeeks: number) {
  const mappings = await db.select({ mappingId: pulseMeetingScorecardMetrics.id, metric: rrScorecardMetrics, responsibility: rolesResponsibilities, owner: users })
    .from(pulseMeetingScorecardMetrics)
    .innerJoin(rrScorecardMetrics, eq(rrScorecardMetrics.id, pulseMeetingScorecardMetrics.savvyosMetricId))
    .innerJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId))
    .leftJoin(users, eq(users.id, rolesResponsibilities.ownerId))
    .where(and(eq(pulseMeetingScorecardMetrics.meetingId, targetMeetingId), eq(rrScorecardMetrics.status, "active")))
    .orderBy(asc(pulseMeetingScorecardMetrics.sortOrder));
  const ids = mappings.map((row: any) => row.metric.id);
  const values = ids.length ? await db.select().from(rrMetricValues).where(inArray(rrMetricValues.metricId, ids)).orderBy(desc(rrMetricValues.periodEnd)) : [];
  const byMetric = new Map<number, any[]>();
  values.forEach((value: any) => byMetric.set(value.metricId, [...(byMetric.get(value.metricId) ?? []), value]));
  return mappings.map((row: any) => {
    const history = (byMetric.get(row.metric.id) ?? []).slice(0, historyWeeks).reverse().map((value: any) => ({
      periodStart: dateValue(value.periodStart),
      periodEnd: dateValue(value.periodEnd),
      value: Number(value.actualValue),
      note: value.note ?? null,
    }));
    const current = history.at(-1) ?? null;
    const target = row.metric.targetValue == null ? null : Number(row.metric.targetValue);
    const onTarget = current?.value == null || target == null ? null : row.metric.performanceDirection === "higher" ? current.value >= target : current.value <= target;
    return {
      mappingId: row.mappingId,
      metricId: row.metric.id,
      name: row.metric.name,
      owner: { id: row.owner?.id ?? null, name: row.owner?.name ?? row.owner?.email ?? "Unassigned" },
      target,
      direction: row.metric.performanceDirection,
      displayFormat: row.metric.displayFormat,
      frequency: row.metric.frequency,
      current,
      history,
      onTarget,
      canEnter: row.metric.metricType === "manual",
    };
  });
}

async function getRocks(db: any, targetMeetingId: string) {
  const homeRocks = await db.select({ item: pulseWorkItems, ownerName: users.name, homeName: pulseMeetings.name })
    .from(pulseWorkItems)
    .leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
    .leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId))
    .where(and(eq(pulseWorkItems.type, "rock"), eq(pulseWorkItems.meetingId, targetMeetingId), isNull(pulseWorkItems.deletedAt)));
  const visibleRocks = await db.select({ item: pulseWorkItems, ownerName: users.name, homeName: pulseMeetings.name })
    .from(pulseMeetingRocks)
    .innerJoin(pulseWorkItems, eq(pulseWorkItems.id, pulseMeetingRocks.workItemId))
    .leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
    .leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId))
    .where(and(eq(pulseMeetingRocks.meetingId, targetMeetingId), eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt)))
    .orderBy(asc(pulseMeetingRocks.sortOrder));
  const seen = new Set<string>();
  return [...homeRocks, ...visibleRocks].filter((row: any) => !seen.has(row.item.id) && Boolean(seen.add(row.item.id))).map((row: any) => ({
    id: row.item.id,
    title: row.item.title,
    status: row.item.status,
    percentComplete: row.item.percentComplete,
    quarter: row.item.quarter,
    ownerId: row.item.assigneeId,
    ownerName: row.ownerName ?? "Unassigned",
    definitionOfDone: row.item.definitionOfDone,
    homeMeetingId: row.item.meetingId,
    homeMeetingName: row.homeName ?? "Another L10",
    reviewedHere: true,
  }));
}

async function getTodos(db: any, targetMeetingId: string) {
  return db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, status: pulseWorkItems.status, dueDate: pulseWorkItems.dueDate, priorityLevel: pulseWorkItems.priorityLevel, assigneeId: pulseWorkItems.assigneeId, assigneeName: users.name, sourceSessionId: pulseWorkItems.sourceSessionId, parentWorkItemId: pulseWorkItems.parentWorkItemId, createdAt: pulseWorkItems.createdAt, commentCount: sql<number>`(select count(*) from ${pulseWorkItemComments} where ${pulseWorkItemComments.workItemId} = ${pulseWorkItems.id} and ${pulseWorkItemComments.deletedAt} is null)`.as("commentCount"), attachmentCount: sql<number>`(select count(*) from ${pulseWorkItemAttachments} where ${pulseWorkItemAttachments.workItemId} = ${pulseWorkItems.id} and ${pulseWorkItemAttachments.deletedAt} is null)`.as("attachmentCount"), linkedSubTodoCount: sql<number>`(select count(*) from \`pulse_work_items\` child where child.\`parentWorkItemId\` = ${pulseWorkItems.id} and child.\`deletedAt\` is null)`.as("linkedSubTodoCount") })
    .from(pulseWorkItems)
    .leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
    .where(and(eq(pulseWorkItems.meetingId, targetMeetingId), eq(pulseWorkItems.type, "todo"), ne(pulseWorkItems.status, "completed"), isNull(pulseWorkItems.deletedAt)))
    .orderBy(asc(pulseWorkItems.status), asc(pulseWorkItems.dueDate), desc(pulseWorkItems.createdAt));
}

async function getIssues(db: any, targetMeetingId: string) {
  return db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, description: pulseWorkItems.description, status: pulseWorkItems.status, priority: pulseWorkItems.priority, priorityLevel: pulseWorkItems.priorityLevel, issueTimeframe: pulseWorkItems.issueTimeframe, dueDate: pulseWorkItems.dueDate, parentWorkItemId: pulseWorkItems.parentWorkItemId, assigneeId: pulseWorkItems.assigneeId, assigneeName: users.name, createdAt: pulseWorkItems.createdAt, commentCount: sql<number>`(select count(*) from ${pulseWorkItemComments} where ${pulseWorkItemComments.workItemId} = ${pulseWorkItems.id} and ${pulseWorkItemComments.deletedAt} is null)`.as("commentCount"), attachmentCount: sql<number>`(select count(*) from ${pulseWorkItemAttachments} where ${pulseWorkItemAttachments.workItemId} = ${pulseWorkItems.id} and ${pulseWorkItemAttachments.deletedAt} is null)`.as("attachmentCount"), linkedSubTodoCount: sql<number>`(select count(*) from \`pulse_work_items\` child where child.\`parentWorkItemId\` = ${pulseWorkItems.id} and child.\`deletedAt\` is null)`.as("linkedSubTodoCount") })
    .from(pulseWorkItems)
    .leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
    .where(and(eq(pulseWorkItems.meetingId, targetMeetingId), eq(pulseWorkItems.type, "issue"), ne(pulseWorkItems.status, "completed"), isNull(pulseWorkItems.deletedAt)))
    .orderBy(asc(pulseWorkItems.status), asc(pulseWorkItems.priority), asc(pulseWorkItems.createdAt));
}

async function getUpdates(db: any, targetMeetingId: string, updateType: "segue" | "headline" | "brief") {
  const { pulseMeetingUpdates } = await import("../../drizzle/schema");
  return db.select({ id: pulseMeetingUpdates.id, body: pulseMeetingUpdates.body, tone: pulseMeetingUpdates.tone, authorName: users.name, createdAt: pulseMeetingUpdates.createdAt, sessionId: pulseMeetingUpdates.sessionId })
    .from(pulseMeetingUpdates)
    .leftJoin(users, eq(users.id, pulseMeetingUpdates.authorId))
    .where(and(eq(pulseMeetingUpdates.meetingId, targetMeetingId), eq(pulseMeetingUpdates.updateType, updateType), isNull(pulseMeetingUpdates.deletedAt)))
    .orderBy(desc(pulseMeetingUpdates.createdAt)).limit(30);
}

async function getReports(db: any, targetMeetingId: string) {
  return db.select({ report: pulseSessionReports, session: pulseMeetingSessions })
    .from(pulseSessionReports)
    .innerJoin(pulseMeetingSessions, eq(pulseMeetingSessions.id, pulseSessionReports.sessionId))
    .where(eq(pulseSessionReports.meetingId, targetMeetingId))
    .orderBy(desc(pulseSessionReports.createdAt));
}

function healthFromReports(reports: any[], scheduledMinutes: number) {
  const latest = reports.slice(0, 8);
  const rated = latest.filter((row) => row.report.ratingAverage != null).map((row) => Number(row.report.ratingAverage));
  const attendance = latest.map((row) => {
    const attendeeIds = Array.isArray(row.session.attendeeIds) ? row.session.attendeeIds : [];
    return attendeeIds.length;
  });
  const onTimeStarts = latest.filter((row) => Math.abs(new Date(row.session.startedAt).getTime() - new Date(row.session.scheduledFor).getTime()) <= 5 * 60_000).length;
  const durations = latest.map((row) => Math.round(row.session.elapsedSeconds / 60));
  return {
    sessionsMeasured: latest.length,
    averageRating: rated.length ? Math.round((rated.reduce((sum, value) => sum + value, 0) / rated.length) * 10) / 10 : null,
    averageAttendance: attendance.length ? Math.round((attendance.reduce((sum, value) => sum + value, 0) / attendance.length) * 10) / 10 : null,
    onTimeStartRate: latest.length ? Math.round((onTimeStarts / latest.length) * 100) : null,
    averageDurationMinutes: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    scheduledMinutes,
  };
}

async function dashboardPayload(db: any, user: { id: number }, targetMeetingId: string) {
  const meeting = await require_visible_meeting(db, user.id, targetMeetingId);
  const [members, scorecard, rocks, todos, issues, segue, headlines, briefs, reports, activeSession] = await Promise.all([
    listMembers(db, targetMeetingId),
    getScorecard(db, targetMeetingId, Math.max(1, Math.min(16, meeting.scorecardHistoryWeeks ?? 8))),
    getRocks(db, targetMeetingId),
    getTodos(db, targetMeetingId),
    getIssues(db, targetMeetingId),
    getUpdates(db, targetMeetingId, "segue"),
    getUpdates(db, targetMeetingId, "headline"),
    getUpdates(db, targetMeetingId, "brief"),
    getReports(db, targetMeetingId),
    getActiveSession(db, targetMeetingId),
  ]);
  const sectionsEnabled = normaliseSections(meeting.sectionsEnabled);
  const [canConfigure, hasMatrixRunAuthority, canViewAllHealth] = await Promise.all([
    hasPulseCapability(db, user, "manage_l10s"),
    hasPulseCapability(db, user, "run_l10s"),
    hasPulseCapability(db, user, "view_all_l10_health"),
  ]);
  const canRun = hasMatrixRunAuthority || meeting.administratorId === user.id;
  const attention = [
    ...scorecard.filter((metric: any) => metric.onTarget === false).map((metric: any) => ({ kind: "metric", id: String(metric.metricId), title: metric.name, detail: "Off target" })),
    ...rocks.filter((rock) => ["at_risk", "off_track"].includes(rock.status)).map((rock) => ({ kind: "rock", id: rock.id, title: rock.title, detail: rock.status.replace("_", " ") })),
    ...todos.filter((todo: any) => todo.status !== "completed" && todo.dueDate && new Date(todo.dueDate) < new Date()).map((todo: any) => ({ kind: "todo", id: todo.id, title: todo.title, detail: "Past due" })),
  ].slice(0, 8);
  const facilitator = members.find((member: any) => member.id === meeting.facilitatorId) ?? null;
  const administrator = members.find((member: any) => member.id === meeting.administratorId) ?? null;
  return {
    meeting: {
      id: meeting.id,
      name: meeting.name,
      label: meeting.label,
      purpose: meeting.purpose,
      dayOfWeek: meeting.dayOfWeek,
      startTime: meeting.startTime,
      durationMinutes: meeting.durationMinutes,
      timezone: meeting.timezone,
      scorecardHistoryWeeks: meeting.scorecardHistoryWeeks ?? 8,
      scorecardDeadlineDay: meeting.scorecardDeadlineDay,
      scorecardDeadlineTime: meeting.scorecardDeadlineTime,
      sectionsEnabled,
      isActive: meeting.isActive,
      facilitator,
      administrator,
    },
    members,
    activeSession,
    permissions: { canConfigure, canRun: meeting.label === "level_10" && canRun, canViewAllHealth },
    sections: {
      overview: { attention, latestReport: reports[0]?.report ?? null, health: healthFromReports(reports, meeting.durationMinutes) },
      segue,
      headlines,
      briefs,
      scorecard,
      rocks,
      todos: todos.map((todo: any) => ({ ...todo, dueDate: dateValue(todo.dueDate) })),
      issues,
      archive: reports.map((row: any) => ({ id: row.report.id, sessionId: row.session.id, scheduledFor: row.session.scheduledFor, closedAt: row.session.closedAt, ratingAverage: row.report.ratingAverage, ratingCount: row.report.ratingCount, commitments: row.report.commitmentsSnapshot, resolvedIssues: row.report.resolvedIssuesSnapshot })),
    },
  };
}

async function publishSessionCascades(db: any, actorId: number, targetMeetingId: string, targetSessionId: string) {
  const drafts = await db.select().from(pulseCascadingMessages).where(and(eq(pulseCascadingMessages.sessionId, targetSessionId), eq(pulseCascadingMessages.deliveryStatus, "draft"), isNull(pulseCascadingMessages.deletedAt)));
  const published: any[] = [];
  for (const message of drafts) {
    const destinations = await db.select({ meetingId: pulseCascadeDestinations.meetingId, name: pulseMeetings.name })
      .from(pulseCascadeDestinations)
      .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseCascadeDestinations.meetingId))
      .where(eq(pulseCascadeDestinations.cascadingMessageId, message.id));
    const recipientRows: Array<{ messageId: string; personId: number; viaMeetingId: string }> = [];
    for (const destination of destinations) {
      const recipients = await listMembers(db, destination.meetingId);
      recipients.forEach((person: any) => recipientRows.push({ messageId: message.id, personId: person.id, viaMeetingId: destination.meetingId }));
    }
    await db.transaction(async (tx: any) => {
      if (recipientRows.length) {
        await tx.insert(pulseCascadeRecipients).values(recipientRows.map((recipient) => ({ id: id(), cascadingMessageId: recipient.messageId, personId: recipient.personId, viaMeetingId: recipient.viaMeetingId })));
        await tx.insert(pulseNotifications).values(recipientRows.map((recipient) => ({ id: id(), personId: recipient.personId, notificationType: "cascade" as const, requiresAction: true, sourceType: "cascade", sourceId: recipient.messageId, meetingId: targetMeetingId, body: `New cascading message from this L10: ${message.body}` })));
      }
      await tx.update(pulseCascadingMessages).set({ deliveryStatus: "published", publishedAt: new Date() }).where(eq(pulseCascadingMessages.id, message.id));
    });
    published.push({ id: message.id, body: message.body, destinations: destinations.map((destination: any) => destination.name), recipientCount: new Set(recipientRows.map((recipient) => recipient.personId)).size });
  }
  return published;
}

async function requireVisibleRock(db: any, userId: number, targetMeetingId: string, workItemId: string) {
  const visibleMeetingIds = await visible_meeting_ids(db, userId);
  if (!visibleMeetingIds.includes(targetMeetingId)) throw notFound();
  const [home] = await db.select({ item: pulseWorkItems }).from(pulseWorkItems).where(and(eq(pulseWorkItems.id, workItemId), eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt))).limit(1);
  if (!home) throw notFound("This Rock is not available.");
  if (home.item.meetingId === targetMeetingId) return home.item;
  const [mapping] = await db.select({ id: pulseMeetingRocks.id }).from(pulseMeetingRocks).where(and(eq(pulseMeetingRocks.meetingId, targetMeetingId), eq(pulseMeetingRocks.workItemId, workItemId))).limit(1);
  if (!mapping) throw notFound("This Rock is not reviewed in this L10.");
  return home.item;
}

export const pulseL10Router = router({
  dashboard: pulseMemberProcedure.input(z.object({ meetingId })).query(async ({ ctx, input }) => dashboardPayload(await database(), ctx.user, input.meetingId)),

  runner: pulseMemberProcedure.input(z.object({ meetingId })).query(async ({ ctx, input }) => {
    const db = await database();
    await requireL10Runner(db, ctx.user, input.meetingId);
    const dashboard = await dashboardPayload(db, ctx.user, input.meetingId);
    return { ...dashboard, runner: { steps: runnerSteps.filter((step) => step === "conclude" || dashboard.meeting.sectionsEnabled[step]), durations: normaliseDurations((await require_visible_meeting(db, ctx.user.id, input.meetingId)).sectionDurations) } };
  }),

  startSession: pulseMemberProcedure.input(z.object({ meetingId, scheduledFor: z.coerce.date().optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const meeting = await requireL10Runner(db, ctx.user, input.meetingId);
    if (meeting.label !== "level_10") throw new TRPCError({ code: "BAD_REQUEST", message: "Only Level 10 meetings use this runner." });
    const current = await getActiveSession(db, input.meetingId);
    if (current) return { session: current, resumed: true };
    const newSession = { id: id(), meetingId: input.meetingId, scheduledFor: input.scheduledFor ?? scheduledNow(), activeStep: normaliseSections(meeting.sectionsEnabled).segue ? "segue" : "scorecard", startedById: ctx.user.id, attendeeIds: [] as number[] };
    await db.insert(pulseMeetingSessions).values(newSession);
    await writeActivity(db, ctx.user.id, "session", newSession.id, "started", null, { meetingId: input.meetingId });
    return { session: newSession, resumed: false };
  }),

  updateSession: pulseMemberProcedure.input(z.object({ meetingId, sessionId, status: z.enum(["running", "paused"]).optional(), activeStep: z.enum(runnerSteps).optional(), elapsedSeconds: z.number().int().min(0).max(86_400).optional(), attendeeIds: z.array(z.number().int().positive()).max(100).optional(), notes: z.string().max(16_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const meeting = await requireL10Runner(db, ctx.user, input.meetingId);
    const session = await requireSession(db, input.meetingId, input.sessionId, true);
    if (input.activeStep && input.activeStep !== "conclude" && !normaliseSections(meeting.sectionsEnabled)[input.activeStep]) throw new TRPCError({ code: "BAD_REQUEST", message: "That disabled section is not part of this L10." });
    if (input.attendeeIds) for (const personId of input.attendeeIds) await assertMember(db, input.meetingId, personId);
    const { meetingId: _meetingId, sessionId: _sessionId, ...changes } = input;
    await db.update(pulseMeetingSessions).set({ ...changes, pausedAt: input.status === "paused" ? new Date() : input.status === "running" ? null : undefined }).where(eq(pulseMeetingSessions.id, session.id));
    return { success: true };
  }),

  rateSession: pulseMemberProcedure.input(z.object({ meetingId, sessionId, rating: z.number().int().min(1).max(10) })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await require_visible_meeting(db, ctx.user.id, input.meetingId);
    await requireSession(db, input.meetingId, input.sessionId);
    await db.insert(pulseSessionRatings).values({ id: id(), sessionId: input.sessionId, personId: ctx.user.id, rating: input.rating }).onDuplicateKeyUpdate({ set: { rating: input.rating } });
    return { success: true };
  }),

  createUpdate: pulseMemberProcedure.input(z.object({ meetingId, sessionId: sessionId.optional(), updateType: z.enum(["segue", "headline"]), body: z.string().trim().min(1).max(4000), tone: z.enum(["green", "amber", "red"]).optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await require_visible_meeting(db, ctx.user.id, input.meetingId);
    if (input.sessionId) await requireSession(db, input.meetingId, input.sessionId, true);
    const { pulseMeetingUpdates } = await import("../../drizzle/schema");
    await db.insert(pulseMeetingUpdates).values({ id: id(), meetingId: input.meetingId, sessionId: input.sessionId ?? null, authorId: ctx.user.id, updateType: input.updateType, tone: input.updateType === "headline" ? input.tone ?? "green" : null, body: input.body });
    return { success: true };
  }),

  createWorkItem: pulseMemberProcedure.input(z.object({ meetingId, sessionId: sessionId.optional(), type: workType, title: z.string().trim().min(1).max(500), assigneeId: z.number().int().positive().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), quarter: z.string().trim().max(16).optional(), definitionOfDone: z.string().trim().max(8000).optional(), description: z.string().trim().max(8000).optional() }).superRefine((input, refinement) => {
    if (input.type === "rock" && !input.definitionOfDone) refinement.addIssue({ code: z.ZodIssueCode.custom, path: ["definitionOfDone"], message: "Every Rock needs a definition of done." });
  })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await require_visible_meeting(db, ctx.user.id, input.meetingId);
    if (input.sessionId) await requireSession(db, input.meetingId, input.sessionId, true);
    const assigneeId = input.assigneeId ?? ctx.user.id;
    await assertMember(db, input.meetingId, assigneeId);
    const workItemId = id();
    await db.transaction(async (tx: any) => {
      await tx.insert(pulseWorkItems).values({
        id: workItemId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        meetingId: input.meetingId,
        sourceSessionId: input.sessionId ?? null,
        ownerPersonId: null,
        assigneeId,
        createdById: ctx.user.id,
        status: input.type === "todo" ? "not_started" : input.type === "issue" ? "not_started" : "on_track",
        dueDate: input.type === "todo" ? input.dueDate ?? defaultDueDate() : null,
        quarter: input.type === "rock" ? input.quarter ?? currentQuarter() : null,
        definitionOfDone: input.type === "rock" ? input.definitionOfDone ?? null : null,
        percentComplete: 0,
        percentSource: "manual",
      });
      await writeActivity(tx, ctx.user.id, "work_item", workItemId, "created", null, { meetingId: input.meetingId, sourceSessionId: input.sessionId ?? null, type: input.type });
    });
    return { id: workItemId };
  }),

  setTodoStatus: pulseMemberProcedure.input(z.object({ meetingId, workItemId: z.string().uuid(), status: todoStatus, statusNote: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await require_visible_meeting(db, ctx.user.id, input.meetingId);
    const [item] = await db.select().from(pulseWorkItems).where(and(eq(pulseWorkItems.id, input.workItemId), eq(pulseWorkItems.meetingId, input.meetingId), eq(pulseWorkItems.type, "todo"), isNull(pulseWorkItems.deletedAt))).limit(1);
    if (!item) throw notFound("This To-Do is not available.");
    await db.transaction(async (tx: any) => {
      await tx.update(pulseWorkItems).set({ status: input.status, completedAt: input.status === "completed" ? new Date() : null, completedById: input.status === "completed" ? ctx.user.id : null, solvedNote: input.status === "completed" ? input.statusNote : item.solvedNote }).where(eq(pulseWorkItems.id, item.id));
      await tx.insert(pulseWorkItemStatusNotes).values({ id: id(), workItemId: item.id, fromStatus: item.status, toStatus: input.status, note: input.statusNote, personId: ctx.user.id });
      await writeActivity(tx, ctx.user.id, "work_item", item.id, "status_changed", item.status, { status: input.status, statusNote: input.statusNote, meetingId: input.meetingId });
    });
    return { success: true };
  }),

  setRockStatus: pulseMemberProcedure.input(z.object({ meetingId, workItemId: z.string().uuid(), status: rockStatus, note: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const item = await requireVisibleRock(db, ctx.user.id, input.meetingId, input.workItemId);
    await db.transaction(async (tx: any) => {
      await tx.update(pulseWorkItems).set({ status: input.status, completedAt: input.status === "done" ? new Date() : null, completedById: input.status === "done" ? ctx.user.id : null }).where(eq(pulseWorkItems.id, item.id));
      await tx.insert(pulseWorkItemStatusNotes).values({ id: id(), workItemId: item.id, fromStatus: item.status, toStatus: input.status, note: input.note ?? null, personId: ctx.user.id });
      await writeActivity(tx, ctx.user.id, "work_item", item.id, "rock_status_changed", item.status, { status: input.status, reviewedInMeetingId: input.meetingId });
    });
    return { success: true };
  }),

  resolveIssue: pulseMemberProcedure.input(z.object({ meetingId, workItemId: z.string().uuid(), sessionId: sessionId.optional(), solvedNote: z.string().trim().min(1).max(2000), commitment: z.object({ title: z.string().trim().min(1).max(500), assigneeId: z.number().int().positive(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await require_visible_meeting(db, ctx.user.id, input.meetingId);
    if (input.sessionId) await requireSession(db, input.meetingId, input.sessionId, true);
    const [issue] = await db.select().from(pulseWorkItems).where(and(eq(pulseWorkItems.id, input.workItemId), eq(pulseWorkItems.meetingId, input.meetingId), eq(pulseWorkItems.type, "issue"), isNull(pulseWorkItems.deletedAt))).limit(1);
    if (!issue) throw notFound("This Issue is not available.");
    if (input.commitment) await assertMember(db, input.meetingId, input.commitment.assigneeId);
    const commitmentId = input.commitment ? id() : null;
    await db.transaction(async (tx: any) => {
      await tx.update(pulseWorkItems).set({ status: "completed", solvedNote: input.solvedNote, completedAt: new Date(), completedById: ctx.user.id, resolvedInSessionId: input.sessionId ?? null }).where(eq(pulseWorkItems.id, issue.id));
      await tx.insert(pulseWorkItemStatusNotes).values({ id: id(), workItemId: issue.id, fromStatus: issue.status, toStatus: "completed", note: input.solvedNote, personId: ctx.user.id });
      if (input.commitment && commitmentId) await tx.insert(pulseWorkItems).values({ id: commitmentId, type: "todo", title: input.commitment.title, meetingId: input.meetingId, sourceSessionId: input.sessionId ?? null, ownerPersonId: null, assigneeId: input.commitment.assigneeId, createdById: ctx.user.id, status: "not_started", dueDate: input.commitment.dueDate ?? defaultDueDate(), percentComplete: 0, percentSource: "manual" });
      await writeActivity(tx, ctx.user.id, "work_item", issue.id, "issue_solved", issue.status, { sessionId: input.sessionId ?? null, commitmentId });
    });
    return { success: true, commitmentId };
  }),

  draftCascade: pulseMemberProcedure.input(z.object({ meetingId, sessionId, toMeetingIds: z.array(meetingId).min(1).max(20), body: z.string().trim().min(1).max(4000) })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireL10Capability(db, ctx.user, input.meetingId, "run_l10s");
    await requireSession(db, input.meetingId, input.sessionId, true);
    const targets = Array.from(new Set(input.toMeetingIds));
    if (targets.includes(input.meetingId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose another L10 to receive this message." });
    const visible = await visible_meeting_ids(db, ctx.user.id);
    if (targets.some((target) => !visible.includes(target))) throw new TRPCError({ code: "FORBIDDEN", message: "You can only cascade to another L10 you belong to." });
    const messageId = id();
    await db.transaction(async (tx: any) => {
      await tx.insert(pulseCascadingMessages).values({ id: messageId, fromMeetingId: input.meetingId, toMeetingId: targets[0], sessionId: input.sessionId, deliveryStatus: "draft", body: input.body, createdById: ctx.user.id });
      await tx.insert(pulseCascadeDestinations).values(targets.map((targetMeetingId) => ({ id: id(), cascadingMessageId: messageId, meetingId: targetMeetingId })));
      await writeActivity(tx, ctx.user.id, "session", input.sessionId, "cascade_drafted", null, { messageId, targets });
    });
    return { id: messageId };
  }),

  closeSession: pulseMemberProcedure.input(z.object({ meetingId, sessionId, elapsedSeconds: z.number().int().min(0).max(86_400), attendeeIds: z.array(z.number().int().positive()).max(100), notes: z.string().max(16_000).nullable().optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const meeting = await requireL10Runner(db, ctx.user, input.meetingId);
    const session = await requireSession(db, input.meetingId, input.sessionId, true);
    for (const personId of input.attendeeIds) await assertMember(db, input.meetingId, personId);
    const [scorecard, rocks, commitments, resolvedIssues, ratings] = await Promise.all([
      getScorecard(db, input.meetingId, Math.max(1, Math.min(16, meeting.scorecardHistoryWeeks ?? 8))),
      getRocks(db, input.meetingId),
      db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, assigneeId: pulseWorkItems.assigneeId, dueDate: pulseWorkItems.dueDate, status: pulseWorkItems.status }).from(pulseWorkItems).where(and(eq(pulseWorkItems.sourceSessionId, input.sessionId), eq(pulseWorkItems.type, "todo"), isNull(pulseWorkItems.deletedAt))),
      db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, solvedNote: pulseWorkItems.solvedNote, assigneeId: pulseWorkItems.assigneeId }).from(pulseWorkItems).where(and(eq(pulseWorkItems.resolvedInSessionId, input.sessionId), eq(pulseWorkItems.type, "issue"), isNull(pulseWorkItems.deletedAt))),
      db.select({ rating: pulseSessionRatings.rating }).from(pulseSessionRatings).where(eq(pulseSessionRatings.sessionId, input.sessionId)),
    ]);
    const cascades = await publishSessionCascades(db, ctx.user.id, input.meetingId, input.sessionId);
    const ratingAverage = ratings.length ? (ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length).toFixed(1) : null;
    const reportId = id();
    await db.transaction(async (tx: any) => {
      await tx.update(pulseMeetingSessions).set({ status: "closed", activeStep: "conclude", elapsedSeconds: input.elapsedSeconds, attendeeIds: input.attendeeIds, notes: input.notes ?? session.notes, closedAt: new Date() }).where(eq(pulseMeetingSessions.id, input.sessionId));
      await tx.insert(pulseSessionReports).values({ id: reportId, sessionId: input.sessionId, meetingId: input.meetingId, ratingAverage, ratingCount: ratings.length, scorecardSnapshot: scorecard, rocksSnapshot: rocks, commitmentsSnapshot: commitments.map((item: any) => ({ ...item, dueDate: dateValue(item.dueDate) })), resolvedIssuesSnapshot: resolvedIssues, cascadesSnapshot: cascades });
      await writeActivity(tx, ctx.user.id, "session", input.sessionId, "closed", null, { reportId, ratingAverage, ratingCount: ratings.length });
    });
    return { success: true, reportId, cascadesPublished: cascades.length };
  }),

  report: pulseMemberProcedure.input(z.object({ meetingId, reportId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const db = await database();
    await activeMembership(db, ctx.user.id, input.meetingId, true);
    const [row] = await db.select({ report: pulseSessionReports, session: pulseMeetingSessions })
      .from(pulseSessionReports).innerJoin(pulseMeetingSessions, eq(pulseMeetingSessions.id, pulseSessionReports.sessionId))
      .where(and(eq(pulseSessionReports.id, input.reportId), eq(pulseSessionReports.meetingId, input.meetingId))).limit(1);
    if (!row) throw notFound("This L10 report is not available.");
    return row;
  }),

  configuration: pulseMemberProcedure.input(z.object({ meetingId })).query(async ({ ctx, input }) => {
    const db = await database();
    const meeting = await activeMembership(db, ctx.user.id, input.meetingId, true);
    if (!await hasPulseCapability(db, ctx.user, "manage_l10s")) throw new TRPCError({ code: "FORBIDDEN", message: "Your Pulse permissions do not allow L10 configuration." });
    const [members, metricMappings, rocks, reports, people, metricCandidates, rockCandidates] = await Promise.all([
      listMembers(db, input.meetingId),
      db.select({ metricId: rrScorecardMetrics.id, name: rrScorecardMetrics.name, ownerName: users.name }).from(pulseMeetingScorecardMetrics).innerJoin(rrScorecardMetrics, eq(rrScorecardMetrics.id, pulseMeetingScorecardMetrics.savvyosMetricId)).leftJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId)).leftJoin(users, eq(users.id, rolesResponsibilities.ownerId)).where(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId)).orderBy(asc(pulseMeetingScorecardMetrics.sortOrder)),
      getRocks(db, input.meetingId),
      getReports(db, input.meetingId),
      db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
      db.select({ id: rrScorecardMetrics.id, name: rrScorecardMetrics.name, ownerName: users.name }).from(rrScorecardMetrics).leftJoin(rolesResponsibilities, eq(rolesResponsibilities.id, rrScorecardMetrics.responsibilityId)).leftJoin(users, eq(users.id, rolesResponsibilities.ownerId)).where(eq(rrScorecardMetrics.status, "active")).orderBy(asc(rrScorecardMetrics.name)),
      db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, ownerName: users.name, homeMeetingId: pulseWorkItems.meetingId }).from(pulseWorkItems).leftJoin(users, eq(users.id, pulseWorkItems.assigneeId)).where(and(eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseWorkItems.title)),
    ]);
    return { meeting: { ...meeting, sectionsEnabled: normaliseSections(meeting.sectionsEnabled), sectionDurations: normaliseDurations(meeting.sectionDurations) }, members, metricMappings, rocks, reports, people, metricCandidates, rockCandidates, sections: dashboardSections };
  }),

  createMeeting: pulseMemberProcedure.input(z.object({ name: z.string().trim().min(1).max(255), purpose: z.string().trim().max(500).nullable().optional(), dayOfWeek: day.nullable().optional(), startTime: time.nullable().optional(), durationMinutes: z.number().int().min(15).max(240).default(90), timezone: z.string().trim().min(1).max(64).default("America/New_York"), facilitatorId: z.number().int().positive(), administratorId: z.number().int().positive(), participantIds: z.array(z.number().int().positive()).min(1).max(100), scorecardHistoryWeeks: z.number().int().min(1).max(16).default(8), scorecardDeadlineDay: day.nullable().optional(), scorecardDeadlineTime: time.nullable().optional(), sectionsEnabled: z.record(z.enum(dashboardSections), z.boolean()).optional() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requirePulseCapability(db, ctx.user, "manage_l10s");
    const participants = Array.from(new Set([ctx.user.id, ...input.participantIds]));
    if (!participants.includes(input.facilitatorId)) throw new TRPCError({ code: "BAD_REQUEST", message: "The Facilitator must be a participant in this L10." });
    if (!participants.includes(input.administratorId)) throw new TRPCError({ code: "BAD_REQUEST", message: "The Administrator must be a participant in this L10." });
    const people = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, participants), eq(users.isActive, true)));
    if (people.length !== participants.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose active SavvyOS people as L10 participants." });
    const newMeetingId = id();
    await db.transaction(async (tx: any) => {
      await tx.insert(pulseMeetings).values({ id: newMeetingId, name: input.name, purpose: input.purpose ?? null, label: "level_10", ownerId: ctx.user.id, administratorId: input.administratorId, facilitatorId: input.facilitatorId, dayOfWeek: input.dayOfWeek ?? null, startTime: input.startTime ?? null, durationMinutes: input.durationMinutes, timezone: input.timezone, cadence: "weekly", scorecardHistoryWeeks: input.scorecardHistoryWeeks, scorecardDeadlineDay: input.scorecardDeadlineDay ?? null, scorecardDeadlineTime: input.scorecardDeadlineTime ?? null, sectionsEnabled: { ...L10_DEFAULT_SECTIONS, ...(input.sectionsEnabled ?? {}) }, sectionOrder: [...dashboardSections], sectionDurations: normaliseDurations({}) });
      await tx.insert(pulseMeetingMembers).values(participants.map((personId) => ({ id: id(), meetingId: newMeetingId, personId, meetingRole: personId === ctx.user.id ? "owner" as const : "member" as const, addedById: ctx.user.id })));
      await writeActivity(tx, ctx.user.id, "meeting", newMeetingId, "created", null, { participants, facilitatorId: input.facilitatorId, administratorId: input.administratorId });
    });
    return { id: newMeetingId };
  }),

  updateMeeting: pulseMemberProcedure.input(z.object({ meetingId, name: z.string().trim().min(1).max(255).optional(), purpose: z.string().trim().max(500).nullable().optional(), dayOfWeek: day.nullable().optional(), startTime: time.nullable().optional(), durationMinutes: z.number().int().min(15).max(240).optional(), timezone: z.string().trim().min(1).max(64).optional(), facilitatorId: z.number().int().positive().optional(), administratorId: z.number().int().positive().optional(), scorecardHistoryWeeks: z.number().int().min(1).max(16).optional(), scorecardDeadlineDay: day.nullable().optional(), scorecardDeadlineTime: time.nullable().optional(), sectionsEnabled: z.record(z.enum(dashboardSections), z.boolean()).optional() }).refine((value) => Object.keys(value).length > 1, { message: "Choose at least one setting to update." })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireL10Capability(db, ctx.user, input.meetingId, "manage_l10s");
    if (input.facilitatorId) await assertMember(db, input.meetingId, input.facilitatorId);
    if (input.administratorId) await assertMember(db, input.meetingId, input.administratorId);
    const { meetingId: _meetingId, sectionsEnabled, ...changes } = input;
    const values = { ...changes, ...(sectionsEnabled ? { sectionsEnabled: normaliseSections(sectionsEnabled) } : {}) };
    await db.transaction(async (tx: any) => {
      await tx.update(pulseMeetings).set(values).where(eq(pulseMeetings.id, input.meetingId));
      await writeActivity(tx, ctx.user.id, "meeting", input.meetingId, "configured", null, values);
    });
    return { success: true };
  }),

  setMember: pulseMemberProcedure.input(z.object({ meetingId, personId: z.number().int().positive(), included: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    const meeting = await requireL10Capability(db, ctx.user, input.meetingId, "manage_l10s");
    if (input.included) {
      const [person] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, input.personId), eq(users.isActive, true))).limit(1);
      if (!person) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active SavvyOS person." });
      await db.insert(pulseMeetingMembers).values({ id: id(), meetingId: input.meetingId, personId: input.personId, meetingRole: "member", addedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { removedAt: null, deletedAt: null, addedById: ctx.user.id } });
    } else {
      if ([meeting.facilitatorId, meeting.ownerId, meeting.administratorId].includes(input.personId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Assign another facilitator and management contact before removing this participant." });
      await db.update(pulseMeetingMembers).set({ removedAt: new Date() }).where(and(eq(pulseMeetingMembers.meetingId, input.meetingId), eq(pulseMeetingMembers.personId, input.personId), isNull(pulseMeetingMembers.deletedAt)));
    }
    await writeActivity(db, ctx.user.id, "meeting", input.meetingId, input.included ? "participant_added" : "participant_removed", null, { personId: input.personId });
    return { success: true };
  }),

  setScorecardMetric: pulseMemberProcedure.input(z.object({ meetingId, metricId: z.number().int().positive(), selected: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireL10Capability(db, ctx.user, input.meetingId, "manage_l10s");
    if (input.selected) {
      const [metric] = await db.select({ id: rrScorecardMetrics.id }).from(rrScorecardMetrics).where(and(eq(rrScorecardMetrics.id, input.metricId), eq(rrScorecardMetrics.status, "active"))).limit(1);
      if (!metric) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Scorecard Metric." });
      const rows = await db.select({ sortOrder: pulseMeetingScorecardMetrics.sortOrder }).from(pulseMeetingScorecardMetrics).where(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId));
      await db.insert(pulseMeetingScorecardMetrics).values({ id: id(), meetingId: input.meetingId, savvyosMetricId: input.metricId, sortOrder: rows.length ? Math.max(...rows.map((row) => row.sortOrder)) + 1 : 0, addedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { savvyosMetricId: input.metricId } });
    } else await db.delete(pulseMeetingScorecardMetrics).where(and(eq(pulseMeetingScorecardMetrics.meetingId, input.meetingId), eq(pulseMeetingScorecardMetrics.savvyosMetricId, input.metricId)));
    return { success: true };
  }),

  setRockVisibility: pulseMemberProcedure.input(z.object({ meetingId, workItemId: z.string().uuid(), visible: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireL10Capability(db, ctx.user, input.meetingId, "manage_l10s");
    const [rock] = await db.select({ id: pulseWorkItems.id }).from(pulseWorkItems).where(and(eq(pulseWorkItems.id, input.workItemId), eq(pulseWorkItems.type, "rock"), isNull(pulseWorkItems.deletedAt))).limit(1);
    if (!rock) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active Pulse Rock." });
    if (input.visible) await db.insert(pulseMeetingRocks).values({ id: id(), meetingId: input.meetingId, workItemId: input.workItemId, sortOrder: 0 }).onDuplicateKeyUpdate({ set: { workItemId: input.workItemId } });
    else await db.delete(pulseMeetingRocks).where(and(eq(pulseMeetingRocks.meetingId, input.meetingId), eq(pulseMeetingRocks.workItemId, input.workItemId)));
    return { success: true };
  }),

  archiveMeeting: pulseMemberProcedure.input(z.object({ meetingId })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireL10Capability(db, ctx.user, input.meetingId, "manage_l10s");
    await db.update(pulseMeetings).set({ isActive: false, archivedAt: new Date() }).where(eq(pulseMeetings.id, input.meetingId));
    await writeActivity(db, ctx.user.id, "meeting", input.meetingId, "archived");
    return { success: true };
  }),

  reactivateMeeting: pulseMemberProcedure.input(z.object({ meetingId })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await activeMembership(db, ctx.user.id, input.meetingId, true);
    await requirePulseCapability(db, ctx.user, "manage_l10s");
    await db.update(pulseMeetings).set({ isActive: true, archivedAt: null }).where(eq(pulseMeetings.id, input.meetingId));
    await writeActivity(db, ctx.user.id, "meeting", input.meetingId, "reactivated");
    return { success: true };
  }),

  permissionMatrix: pulseMemberProcedure.query(async ({ ctx }) => {
    const db = await database();
    await requirePulseCapability(db, ctx.user, "manage_permission_matrix");
    const [people, grants] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(eq(users.isActive, true), ne(users.role, "agent"))).orderBy(asc(users.name)),
      db.select({ personId: pulsePermissions.personId, capability: pulsePermissions.capability, allowed: pulsePermissions.allowed, grantedById: pulsePermissions.grantedById }).from(pulsePermissions),
    ]);
    return { people, grants, capabilityKeys: PULSE_CAPABILITIES };
  }),

  setPermission: pulseMemberProcedure.input(z.object({ personId: z.number().int().positive(), capability: z.enum(PULSE_CAPABILITIES), allowed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requirePulseCapability(db, ctx.user, "manage_permission_matrix");
    if (!input.allowed && input.capability === "manage_permission_matrix") {
      const rows = await db.select({ personId: pulsePermissions.personId }).from(pulsePermissions).where(and(eq(pulsePermissions.capability, "manage_permission_matrix"), eq(pulsePermissions.allowed, true)));
      if (rows.length <= 1 && rows[0]?.personId === input.personId) throw new TRPCError({ code: "BAD_REQUEST", message: "Pulse must retain at least one permission-matrix administrator." });
    }
    const [person] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, input.personId), eq(users.isActive, true), ne(users.role, "agent"))).limit(1);
    if (!person) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active non-agent SavvyOS person." });
    await db.insert(pulsePermissions).values({ id: id(), personId: input.personId, capability: input.capability, allowed: input.allowed, grantedById: ctx.user.id }).onDuplicateKeyUpdate({ set: { allowed: input.allowed, grantedById: ctx.user.id } });
    await writeActivity(db, ctx.user.id, "permission", `${input.personId}:${input.capability}`, input.allowed ? "granted" : "revoked");
    return { success: true };
  }),
});
