import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  pulseIssues,
  pulseMeetingRegistry,
  pulseMeetingSessions,
  pulsePeople,
  pulseScopeMemberships,
  pulseScopes,
  pulseSessionItemCaptures,
  pulseSessionReports,
  pulseSessionStepSnapshots,
  pulseSessionVotes,
  pulseWorkItems,
} from "../../drizzle/schema";
import { appendPulseEvent } from "./events";
import { getPersonForAccount, canManageMeeting, canView, canVote, type PulseActor, type PulsePolicyDb } from "./policy";
import { createCanonicalWorkItem } from "./work";

export const L10_RUNNER_STEPS = [
  "segue", "cascaded_to_us", "headlines", "scorecard", "rock_review", "todo_list", "ids", "conclude", "closing_snapshot",
] as const;
export const ONE_ON_ONE_RUNNER_STEPS = ["segue", "headlines", "rock_review", "todo_list", "ids", "conclude", "closing_snapshot"] as const;
export type RunnerStepKey = (typeof L10_RUNNER_STEPS)[number];
export type MeetingKind = "l10" | "one_on_one";

export const STEP_LABELS: Record<string, string> = {
  segue: "Segue",
  cascaded_to_us: "Cascaded to Us",
  headlines: "Headlines",
  scorecard: "Scorecard",
  rock_review: "Rock Review",
  todo_list: "To-Do List",
  ids: "IDS",
  conclude: "Conclude",
  closing_snapshot: "Closing Snapshot",
};

function defaultVisibility(kind: MeetingKind) {
  return Object.fromEntries(L10_RUNNER_STEPS.map((step) => [step, kind === "one_on_one" ? !["scorecard", "cascaded_to_us"].includes(step) : true]));
}

function runnerSteps(kind: MeetingKind, visibility: Record<string, boolean>) {
  const grammar = kind === "l10" ? L10_RUNNER_STEPS : ONE_ON_ONE_RUNNER_STEPS;
  return grammar.map((stepKey, index) => ({ stepKey, ordinal: index + 1, isVisible: visibility[stepKey] !== false }));
}

function secondsBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function classifyCompletedSession(startedAt: Date, endedAt: Date, minimumValidDurationMinutes: number) {
  return secondsBetween(startedAt, endedAt) >= minimumValidDurationMinutes * 60 ? "valid" : "too_short";
}

async function actorPerson(db: PulsePolicyDb, actor: PulseActor) {
  const personId = await getPersonForAccount(db, actor.userId);
  if (!personId) throw new Error("Authenticated account is not linked to an active Pulse person.");
  return personId;
}

async function loadRegistry(db: PulsePolicyDb, registryId: number, requireActive = true) {
  const rows = await db.select().from(pulseMeetingRegistry).where(eq(pulseMeetingRegistry.id, registryId)).limit(1);
  const registry = rows[0];
  if (!registry || (requireActive && !registry.isActive)) throw new Error("This meeting registry entry is inactive or unavailable.");
  return registry;
}

async function requireMeetingManager(db: PulsePolicyDb, registryId: number, actor: PulseActor, requireActive = true) {
  const registry = await loadRegistry(db, registryId, requireActive);
  const permission = await canManageMeeting(db, registry.scopeId, actor);
  if (!permission.allowed) throw new Error("You cannot manage this active meeting Scope.");
  return registry;
}

async function loadSessionWithRegistry(db: PulsePolicyDb, sessionId: string, actor: PulseActor, requireRegistryActive = true) {
  const sessions = await db.select().from(pulseMeetingSessions).where(eq(pulseMeetingSessions.id, sessionId)).limit(1);
  const session = sessions[0];
  if (!session) throw new Error("Session not found.");
  const registry = await loadRegistry(db, session.registryId, requireRegistryActive);
  const access = await canView(db, session.scopeId, actor);
  if (!access.allowed) throw new Error("This session is unavailable in your active Pulse Scope.");
  return { session, registry };
}

export function classifySession(session: { status: string; startedAt: Date; endedAt?: Date | null; classification: string; registrySnapshot: Record<string, unknown> }, now = new Date()) {
  if (session.status === "completed" || session.status === "auto_closed") return session.classification;
  const expectedDurationMinutes = Number((session.registrySnapshot as any).expectedDurationMinutes ?? 90);
  return secondsBetween(session.startedAt, now) > expectedDurationMinutes * 120 ? "stuck" : "in_progress";
}

export async function createMeetingRegistry(db: PulsePolicyDb, actor: PulseActor, input: {
  scopeId: number; meetingKind: MeetingKind; displayName: string; scheduleDay?: string | null; scheduleTime?: string | null;
  timezone?: string; expectedDurationMinutes?: number; minimumValidDurationMinutes?: number; sectionVisibility?: Record<string, boolean>;
}) {
  const scopeRows = await db.select().from(pulseScopes).where(eq(pulseScopes.id, input.scopeId)).limit(1);
  const scope = scopeRows[0];
  if (!scope || !scope.isActive) throw new Error("Meeting Scope must be active.");
  if (scope.scopeType !== input.meetingKind) throw new Error("Meeting kind must match its Scope type.");
  const actorPersonId = await actorPerson(db, actor);
  const permission = await canManageMeeting(db, input.scopeId, actor);
  if (!permission.allowed) throw new Error("You cannot configure this meeting Scope.");
  const existing = await db.select({ id: pulseMeetingRegistry.id }).from(pulseMeetingRegistry).where(eq(pulseMeetingRegistry.scopeId, input.scopeId)).limit(1);
  if (existing[0]) throw new Error("This Scope already has a meeting registry entry.");
  const visibility = { ...defaultVisibility(input.meetingKind), ...(input.sectionVisibility ?? {}) };
  const [result] = await db.insert(pulseMeetingRegistry).values({
    scopeId: input.scopeId, meetingKind: input.meetingKind, displayName: input.displayName.trim(), scheduleDay: input.scheduleDay as any ?? null,
    scheduleTime: input.scheduleTime ?? null, timezone: input.timezone ?? "America/New_York",
    expectedDurationMinutes: input.expectedDurationMinutes ?? 90, minimumValidDurationMinutes: input.minimumValidDurationMinutes ?? 15,
    sectionVisibility: visibility, isActive: true, createdByPersonId: actorPersonId,
  });
  const registryId = Number((result as any).insertId);
  await appendPulseEvent(db, { eventType: "meeting_created", scopeId: input.scopeId, actorPersonId, payload: { registryId, scopeId: input.scopeId, meetingKind: input.meetingKind } });
  return registryId;
}

export async function updateMeetingRegistry(db: PulsePolicyDb, actor: PulseActor, input: {
  registryId: number; displayName?: string; scheduleDay?: string | null; scheduleTime?: string | null; timezone?: string;
  expectedDurationMinutes?: number; minimumValidDurationMinutes?: number; sectionVisibility?: Record<string, boolean>;
}) {
  const registry = await requireMeetingManager(db, input.registryId, actor);
  const visibility = input.sectionVisibility ? { ...defaultVisibility(registry.meetingKind), ...input.sectionVisibility } : undefined;
  await db.update(pulseMeetingRegistry).set({
    ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
    ...(input.scheduleDay !== undefined ? { scheduleDay: input.scheduleDay as any } : {}),
    ...(input.scheduleTime !== undefined ? { scheduleTime: input.scheduleTime } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.expectedDurationMinutes !== undefined ? { expectedDurationMinutes: input.expectedDurationMinutes } : {}),
    ...(input.minimumValidDurationMinutes !== undefined ? { minimumValidDurationMinutes: input.minimumValidDurationMinutes } : {}),
    ...(visibility ? { sectionVisibility: visibility } : {}),
  }).where(eq(pulseMeetingRegistry.id, registry.id));
}

export async function setMeetingRegistryActive(db: PulsePolicyDb, actor: PulseActor, input: { registryId: number; isActive: boolean; reason?: string | null }) {
  const registry = await requireMeetingManager(db, input.registryId, actor, !input.isActive);
  const actorPersonId = await actorPerson(db, actor);
  await db.update(pulseMeetingRegistry).set(input.isActive
    ? { isActive: true, deactivatedAt: null, deactivatedByPersonId: null, deactivationReason: null }
    : { isActive: false, deactivatedAt: new Date(), deactivatedByPersonId: actorPersonId, deactivationReason: input.reason?.trim() || null },
  ).where(eq(pulseMeetingRegistry.id, registry.id));
  await appendPulseEvent(db, { eventType: input.isActive ? "meeting_reactivated" : "meeting_deactivated", scopeId: registry.scopeId, actorPersonId, payload: { registryId: registry.id, scopeId: registry.scopeId } });
}

export async function listVisibleMeetingRegistry(db: PulsePolicyDb, actor: PulseActor) {
  const registries = await db.select().from(pulseMeetingRegistry).where(eq(pulseMeetingRegistry.isActive, true)).orderBy(asc(pulseMeetingRegistry.displayName));
  const visible: any[] = [];
  for (const registry of registries) {
    const decision = await canView(db, registry.scopeId, actor);
    if (decision.allowed) visible.push(registry);
  }
  return visible;
}

export async function startMeetingSession(db: PulsePolicyDb, actor: PulseActor, registryId: number) {
  const registry = await requireMeetingManager(db, registryId, actor);
  const actorPersonId = await actorPerson(db, actor);
  const existing = await db.select({ id: pulseMeetingSessions.id }).from(pulseMeetingSessions).where(and(eq(pulseMeetingSessions.registryId, registryId), eq(pulseMeetingSessions.status, "in_progress"))).limit(1);
  if (existing[0]) throw new Error("This meeting already has an in-progress session.");
  const memberships = await db.select({ personId: pulsePeople.id, displayName: pulsePeople.displayName, membershipRole: pulseScopeMemberships.membershipRole })
    .from(pulseScopeMemberships).innerJoin(pulsePeople, eq(pulseScopeMemberships.personId, pulsePeople.id))
    .where(and(eq(pulseScopeMemberships.scopeId, registry.scopeId), eq(pulseScopeMemberships.isActive, true))).orderBy(asc(pulsePeople.displayName));
  const steps = runnerSteps(registry.meetingKind, registry.sectionVisibility as Record<string, boolean>);
  const firstVisible = steps.find((step) => step.isVisible);
  const sessionId = randomUUID();
  const startedAt = new Date();
  const registrySnapshot = { registryId: registry.id, displayName: registry.displayName, meetingKind: registry.meetingKind, expectedDurationMinutes: registry.expectedDurationMinutes, minimumValidDurationMinutes: registry.minimumValidDurationMinutes, timezone: registry.timezone, sectionVisibility: registry.sectionVisibility };
  await db.transaction(async (tx: any) => {
    await tx.insert(pulseMeetingSessions).values({
      id: sessionId, registryId: registry.id, scopeId: registry.scopeId, status: "in_progress", classification: "in_progress",
      activeStepKey: firstVisible?.stepKey ?? null, agendaState: { steps: steps.map((step) => ({ ...step, label: STEP_LABELS[step.stepKey] })) },
      registrySnapshot, attendeeSnapshot: memberships, startedByPersonId: actorPersonId, startedAt,
    });
    for (const step of steps) await tx.insert(pulseSessionStepSnapshots).values({
      sessionId, stepKey: step.stepKey, ordinal: step.ordinal, isVisible: step.isVisible,
      state: step.isVisible && step.stepKey === firstVisible?.stepKey ? "active" : step.isVisible ? "pending" : "skipped",
      startedAt: step.stepKey === firstVisible?.stepKey ? startedAt : null, snapshot: { label: STEP_LABELS[step.stepKey] },
    });
    await appendPulseEvent(tx, { eventType: "session_started", scopeId: registry.scopeId, actorPersonId, payload: { sessionId, registryId: registry.id, scopeId: registry.scopeId } });
  });
  return sessionId;
}

export async function enterSessionStep(db: PulsePolicyDb, actor: PulseActor, input: { sessionId: string; stepKey: string }) {
  const { session, registry } = await loadSessionWithRegistry(db, input.sessionId, actor, true);
  if (session.status !== "in_progress") throw new Error("Only an in-progress session can change steps.");
  await requireMeetingManager(db, registry.id, actor);
  const actorPersonId = await actorPerson(db, actor);
  const steps = await db.select().from(pulseSessionStepSnapshots).where(eq(pulseSessionStepSnapshots.sessionId, session.id)).orderBy(asc(pulseSessionStepSnapshots.ordinal));
  const target = steps.find((step: any) => step.stepKey === input.stepKey && step.isVisible);
  if (!target) throw new Error("This step is not available in the session grammar.");
  if (session.activeStepKey === target.stepKey) return;
  const now = new Date();
  await db.transaction(async (tx: any) => {
    const current = steps.find((step: any) => step.stepKey === session.activeStepKey && step.state === "active");
    if (current) await tx.update(pulseSessionStepSnapshots).set({ state: "completed", endedAt: now, durationSeconds: secondsBetween(current.startedAt ?? now, now) }).where(eq(pulseSessionStepSnapshots.id, current.id));
    await tx.update(pulseSessionStepSnapshots).set({ state: "active", startedAt: target.startedAt ?? now }).where(eq(pulseSessionStepSnapshots.id, target.id));
    const sessionUpdate: any = { activeStepKey: target.stepKey };
    if (target.stepKey === "ids" && session.idsIssueCountSnapshot === null) {
      const activeIssues = await tx.select({ id: pulseWorkItems.id }).from(pulseWorkItems).innerJoin(pulseIssues, eq(pulseIssues.itemId, pulseWorkItems.id)).where(eq(pulseWorkItems.primaryScopeId, session.scopeId));
      sessionUpdate.idsIssueCountSnapshot = activeIssues.filter((issue: any) => !["complete", "skipped"].includes(issue.status)).length;
      await appendPulseEvent(tx, { eventType: "session_ids_snapshot", scopeId: session.scopeId, actorPersonId, payload: { sessionId: session.id, issueCount: sessionUpdate.idsIssueCountSnapshot } });
    }
    await tx.update(pulseMeetingSessions).set(sessionUpdate).where(eq(pulseMeetingSessions.id, session.id));
    await appendPulseEvent(tx, { eventType: "session_step_entered", scopeId: session.scopeId, actorPersonId, payload: { sessionId: session.id, stepKey: target.stepKey } });
  });
}

export async function castSessionVote(db: PulsePolicyDb, actor: PulseActor, input: { sessionId: string; issueItemId: number; voteKind: "priority" | "rocket" }) {
  const { session, registry } = await loadSessionWithRegistry(db, input.sessionId, actor, true);
  if (session.status !== "in_progress") throw new Error("Voting is unavailable after session conclusion.");
  const issue = await db.select({ primaryScopeId: pulseWorkItems.primaryScopeId }).from(pulseWorkItems).innerJoin(pulseIssues, eq(pulseIssues.itemId, pulseWorkItems.id)).where(eq(pulseWorkItems.id, input.issueItemId)).limit(1);
  if (!issue[0] || issue[0].primaryScopeId !== session.scopeId) throw new Error("Only issues currently scoped to this meeting may be voted in its IDS session.");
  const permission = await canVote(db, { primaryScopeId: issue[0].primaryScopeId }, 0, actor);
  if (!permission.allowed) throw new Error("You cannot vote on this issue in its active Scope.");
  const actorPersonId = await actorPerson(db, actor);
  await db.insert(pulseSessionVotes).values({ sessionId: session.id, issueItemId: input.issueItemId, voterPersonId: actorPersonId, voteKind: input.voteKind }).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });
  await appendPulseEvent(db, { eventType: "session_vote_cast", scopeId: session.scopeId, actorPersonId, payload: { sessionId: session.id, issueItemId: input.issueItemId, voterPersonId: actorPersonId, voteKind: input.voteKind } });
}

export async function captureRunnerItem(db: PulsePolicyDb, actor: PulseActor, input: {
  sessionId: string; itemType: "todo" | "issue"; title: string; description?: string | null; destinationScopeId: number; assigneePersonId?: number | null;
  todo?: { dueDate?: Date | null; priority?: "low" | "medium" | "high" | "urgent"; isFlagged?: boolean; recurrenceId?: number | null };
  issue?: { priority?: "low" | "medium" | "high" | "critical"; timeframe?: "this_week" | "this_quarter" | "this_year" | "someday" | "unscheduled" };
}) {
  const { session, registry } = await loadSessionWithRegistry(db, input.sessionId, actor, true);
  if (session.status !== "in_progress") throw new Error("Items cannot be captured after session conclusion.");
  await requireMeetingManager(db, registry.id, actor);
  const actorPersonId = await actorPerson(db, actor);
  const itemId = await createCanonicalWorkItem(db, actor, {
    itemType: input.itemType, title: input.title, description: input.description ?? null, primaryScopeId: input.destinationScopeId,
    assigneePersonId: input.assigneePersonId ?? null, createdInScopeId: input.destinationScopeId, createdInSessionId: session.id,
    todo: input.todo, issue: input.issue,
  });
  await db.transaction(async (tx: any) => {
    await tx.insert(pulseSessionItemCaptures).values({ sessionId: session.id, itemId, destinationScopeId: input.destinationScopeId, captureKind: input.itemType, capturedByPersonId: actorPersonId });
    await appendPulseEvent(tx, { eventType: "session_item_captured", scopeId: session.scopeId, actorPersonId, payload: { sessionId: session.id, itemId, destinationScopeId: input.destinationScopeId } });
  });
  const destination = await txlessScopeName(db, input.destinationScopeId);
  return { itemId, destinationScopeId: input.destinationScopeId, destinationName: destination };
}

async function txlessScopeName(db: PulsePolicyDb, scopeId: number) {
  const scope = await db.select({ name: pulseScopes.name }).from(pulseScopes).where(eq(pulseScopes.id, scopeId)).limit(1);
  return scope[0]?.name ?? `Data quality: unresolved destination Scope #${scopeId}`;
}

export async function completeMeetingSession(db: PulsePolicyDb, actor: PulseActor, input: { sessionId: string; ratings?: Record<string, unknown>; completionData?: Record<string, unknown>; automatic?: boolean }) {
  const { session, registry } = await loadSessionWithRegistry(db, input.sessionId, actor, true);
  if (session.status !== "in_progress") throw new Error("This session has already concluded.");
  await requireMeetingManager(db, registry.id, actor);
  const actorPersonId = await actorPerson(db, actor);
  const endedAt = new Date();
  const classification = input.automatic ? "auto_closed" : classifyCompletedSession(session.startedAt, endedAt, registry.minimumValidDurationMinutes);
  return db.transaction(async (tx: any) => {
    const steps = await tx.select().from(pulseSessionStepSnapshots).where(eq(pulseSessionStepSnapshots.sessionId, session.id)).orderBy(asc(pulseSessionStepSnapshots.ordinal));
    const active = steps.find((step: any) => step.state === "active");
    if (active) await tx.update(pulseSessionStepSnapshots).set({ state: "completed", endedAt, durationSeconds: secondsBetween(active.startedAt ?? endedAt, endedAt) }).where(eq(pulseSessionStepSnapshots.id, active.id));
    await tx.update(pulseMeetingSessions).set({ status: input.automatic ? "auto_closed" : "completed", classification, activeStepKey: null, ratings: input.ratings ?? null, completionData: input.completionData ?? null, completedByPersonId: actorPersonId, endedAt }).where(eq(pulseMeetingSessions.id, session.id));
    const captures = await tx.select().from(pulseSessionItemCaptures).where(eq(pulseSessionItemCaptures.sessionId, session.id)).orderBy(asc(pulseSessionItemCaptures.createdAt));
    const votes = await tx.select().from(pulseSessionVotes).where(eq(pulseSessionVotes.sessionId, session.id)).orderBy(asc(pulseSessionVotes.createdAt));
    const reportPayload = {
      meeting: session.registrySnapshot, sessionId: session.id, startedAt: session.startedAt.toISOString(), endedAt: endedAt.toISOString(),
      durationSeconds: secondsBetween(session.startedAt, endedAt), classification, idsIssueCountSnapshot: session.idsIssueCountSnapshot,
      ratings: input.ratings ?? null, completionData: input.completionData ?? null, steps, captures, votes,
    };
    const [result] = await tx.insert(pulseSessionReports).values({ sessionId: session.id, registryId: registry.id, scopeId: session.scopeId, classification, reportPayload, concludedAt: endedAt });
    const reportId = Number((result as any).insertId);
    await appendPulseEvent(tx, { eventType: input.automatic ? "session_auto_closed" : "session_completed", scopeId: session.scopeId, actorPersonId, payload: { sessionId: session.id, classification } });
    await appendPulseEvent(tx, { eventType: "session_report_created", scopeId: session.scopeId, actorPersonId, payload: { sessionId: session.id, reportId } });
    return { reportId, classification, endedAt };
  });
}

export async function getRunnerSession(db: PulsePolicyDb, actor: PulseActor, sessionId: string) {
  const { session, registry } = await loadSessionWithRegistry(db, sessionId, actor, true);
  const [steps, captures, votes] = await Promise.all([
    db.select().from(pulseSessionStepSnapshots).where(eq(pulseSessionStepSnapshots.sessionId, session.id)).orderBy(asc(pulseSessionStepSnapshots.ordinal)),
    db.select().from(pulseSessionItemCaptures).where(eq(pulseSessionItemCaptures.sessionId, session.id)).orderBy(asc(pulseSessionItemCaptures.createdAt)),
    db.select().from(pulseSessionVotes).where(eq(pulseSessionVotes.sessionId, session.id)).orderBy(desc(pulseSessionVotes.createdAt)),
  ]);
  return { registry, session: { ...session, liveClassification: classifySession(session) }, steps, captures, votes };
}

export async function listMeetingHistory(db: PulsePolicyDb, actor: PulseActor, registryId: number) {
  const registry = await loadRegistry(db, registryId, false);
  const access = await canView(db, registry.scopeId, actor);
  if (!access.allowed) throw new Error("Meeting history is unavailable in your active Scope.");
  return db.select().from(pulseSessionReports).where(eq(pulseSessionReports.registryId, registry.id)).orderBy(desc(pulseSessionReports.concludedAt));
}

export async function getMeetingReport(db: PulsePolicyDb, actor: PulseActor, reportId: number) {
  const reports = await db.select().from(pulseSessionReports).where(eq(pulseSessionReports.id, reportId)).limit(1);
  const report = reports[0];
  if (!report) throw new Error("Meeting report not found.");
  const access = await canView(db, report.scopeId, actor);
  if (!access.allowed) throw new Error("Meeting report is unavailable in your active Scope.");
  return report;
}
