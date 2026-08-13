import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  pulseIssueVotes,
  pulseIssues,
  pulsePeople,
  pulsePersonAccounts,
  pulseScopeMemberships,
  pulseScopes,
  pulseTodos,
  pulseWorkItemActivity,
  pulseWorkItemComments,
  pulseWorkItemMentions,
  pulseWorkItemNotificationIntents,
  pulseWorkItemPlacements,
  pulseWorkItems,
} from "../../drizzle/schema";
import { appendPulseEvent } from "./events";
import { canAssign, canCreate, canDeliver, canView, canViewWorkItem, canVote, getActiveScope, type PulseActor, type PulsePolicyDb } from "./policy";

export type WorkStatus = "not_started" | "in_progress" | "blocked" | "complete" | "skipped";
export type WorkItemType = "todo" | "issue";

function substantive(note: string | null | undefined) {
  return !!note && note.trim().length >= 3;
}

export async function appendWorkActivity(db: PulsePolicyDb, input: { itemId: number; activityType: "created" | "moved" | "status_changed" | "assigned" | "comment_added" | "mention_added" | "placement_added" | "placement_removed"; actorPersonId?: number | null; note?: string | null; payload: Record<string, unknown> }) {
  await db.insert(pulseWorkItemActivity).values({
    itemId: input.itemId,
    activityType: input.activityType,
    actorPersonId: input.actorPersonId ?? null,
    note: input.note ?? null,
    payload: input.payload,
  });
}

async function requireWorkManager(db: PulsePolicyDb, scopeId: number, actor: PulseActor) {
  const decision = await canCreate(db, "work_item", scopeId, actor);
  if (!decision.allowed) throw new Error("You cannot manage work in this active scope.");
}

async function requireWorkView(db: PulsePolicyDb, itemId: number, actor: PulseActor) {
  const decision = await canViewWorkItem(db, itemId, actor);
  if (!decision.allowed) throw new Error("This work item is unavailable in your active Pulse scopes.");
  return decision;
}

export async function createCanonicalWorkItem(db: PulsePolicyDb, actor: PulseActor, input: {
  itemType: WorkItemType;
  title: string;
  description?: string | null;
  primaryScopeId: number;
  assigneePersonId?: number | null;
  createdInScopeId?: number | null;
  createdInSessionId?: string | null;
  placementScopeIds?: number[];
  todo?: { dueDate?: Date | null; priority?: "low" | "medium" | "high" | "urgent"; isFlagged?: boolean; recurrenceId?: number | null };
  issue?: { priority?: "low" | "medium" | "high" | "critical"; timeframe?: "this_week" | "this_quarter" | "this_year" | "someday" | "unscheduled" };
}) {
  await requireWorkManager(db, input.primaryScopeId, actor);
  const createdInScopeId = input.createdInScopeId === undefined ? input.primaryScopeId : input.createdInScopeId;
  if (createdInScopeId !== null) {
    const provenanceDecision = await canView(db, createdInScopeId, actor);
    if (!provenanceDecision.allowed) throw new Error("Creation provenance scope is unavailable.");
  }
  if (input.assigneePersonId) {
    const assignmentDecision = await canAssign(db, { primaryScopeId: input.primaryScopeId }, input.assigneePersonId, actor);
    if (!assignmentDecision.allowed) throw new Error("The assignee is not available in this active scope.");
  }
  const placementScopeIds = Array.from(new Set((input.placementScopeIds ?? []).filter((scopeId) => scopeId !== input.primaryScopeId)));
  for (const placementScopeId of placementScopeIds) await requireWorkManager(db, placementScopeId, actor);

  const actorPersonId = await actorPersonForWrite(db, actor);
  return db.transaction(async (tx: any) => {
    const [result] = await tx.insert(pulseWorkItems).values({
      itemType: input.itemType,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      primaryScopeId: input.primaryScopeId,
      assigneePersonId: input.assigneePersonId ?? null,
      status: "not_started",
      createdByPersonId: actorPersonId,
      createdInScopeId,
      createdInSessionId: input.createdInSessionId ?? null,
    });
    const itemId = Number((result as any).insertId);
    if (input.itemType === "todo") {
      await tx.insert(pulseTodos).values({ itemId, dueDate: input.todo?.dueDate ?? null, priority: input.todo?.priority ?? "medium", isFlagged: input.todo?.isFlagged ?? false, recurrenceId: input.todo?.recurrenceId ?? null });
    } else {
      await tx.insert(pulseIssues).values({ itemId, priority: input.issue?.priority ?? "medium", timeframe: input.issue?.timeframe ?? "unscheduled" });
    }
    for (const scopeId of placementScopeIds) {
      await tx.insert(pulseWorkItemPlacements).values({ itemId, scopeId, placementKind: "secondary", addedByPersonId: actorPersonId, isActive: true });
      await appendWorkActivity(tx, { itemId, activityType: "placement_added", actorPersonId, payload: { scopeId, placementKind: "secondary" } });
    }
    await appendWorkActivity(tx, { itemId, activityType: "created", actorPersonId, payload: { itemType: input.itemType, primaryScopeId: input.primaryScopeId, createdInScopeId, createdInSessionId: input.createdInSessionId ?? null } });
    await appendPulseEvent(tx, { eventType: "work_item_created", scopeId: input.primaryScopeId, actorPersonId, payload: { itemId, itemType: input.itemType, primaryScopeId: input.primaryScopeId } });
    if (input.assigneePersonId && input.assigneePersonId !== actorPersonId) await createNotificationIntent(tx, itemId, input.assigneePersonId, "assignment", actor, { itemId, source: "creation" });
    return itemId;
  });
}

async function actorPersonForWrite(db: PulsePolicyDb, actor: PulseActor) {
  const accounts = await db.select({ personId: pulsePersonAccounts.personId }).from(pulsePersonAccounts).where(and(eq(pulsePersonAccounts.userId, actor.userId), isNull(pulsePersonAccounts.unlinkedAt))).limit(1);
  if (!accounts[0]) throw new Error("Authenticated account is not linked to a Pulse person.");
  return accounts[0].personId as number;
}

export async function moveCanonicalWorkItem(db: PulsePolicyDb, actor: PulseActor, input: { itemId: number; toScopeId: number; note: string }) {
  if (!substantive(input.note)) throw new Error("A substantive move note is required.");
  const item = await db.select().from(pulseWorkItems).where(eq(pulseWorkItems.id, input.itemId)).limit(1);
  if (!item[0]) throw new Error("Work item not found.");
  await requireWorkManager(db, item[0].primaryScopeId, actor);
  await requireWorkManager(db, input.toScopeId, actor);
  const actorPersonId = await actorPersonForWrite(db, actor);
  return db.transaction(async (tx: any) => {
    await tx.update(pulseWorkItems).set({ primaryScopeId: input.toScopeId }).where(eq(pulseWorkItems.id, input.itemId));
    await appendWorkActivity(tx, { itemId: input.itemId, activityType: "moved", actorPersonId, note: input.note.trim(), payload: { fromScopeId: item[0].primaryScopeId, toScopeId: input.toScopeId, createdInScopeId: item[0].createdInScopeId } });
    await appendPulseEvent(tx, { eventType: "work_item_moved", scopeId: input.toScopeId, actorPersonId, payload: { itemId: input.itemId, fromScopeId: item[0].primaryScopeId, toScopeId: input.toScopeId } });
  });
}

export async function transitionCanonicalWorkItem(db: PulsePolicyDb, actor: PulseActor, input: { itemId: number; status: WorkStatus; note?: string | null; mode?: "standard" | "runner_bulk_completion"; blockerType?: "person" | "dependency" | "waiting" | "external" | "decision" | "other" | null; blockerPersonId?: number | null; completionNote?: string | null }) {
  const item = await db.select().from(pulseWorkItems).where(eq(pulseWorkItems.id, input.itemId)).limit(1);
  if (!item[0]) throw new Error("Work item not found.");
  await requireWorkManager(db, item[0].primaryScopeId, actor);
  const mode = input.mode ?? "standard";
  if (mode === "runner_bulk_completion" && input.status !== "complete") throw new Error("Runner bulk completion may only set complete status.");
  if (mode !== "runner_bulk_completion" && !substantive(input.note)) throw new Error("A substantive transition note is required.");
  if (input.status === "blocked" && !input.blockerType) throw new Error("Blocked status requires a blocker type.");
  if (input.status === "blocked" && input.blockerType === "person" && !input.blockerPersonId) throw new Error("A person blocker requires the blocker person.");
  const actorPersonId = await actorPersonForWrite(db, actor);
  return db.transaction(async (tx: any) => {
    await tx.update(pulseWorkItems).set({ status: input.status, lastTransitionNote: input.note?.trim() || null, lastTransitionMode: mode, blockerType: input.status === "blocked" ? input.blockerType ?? null : null, blockerPersonId: input.status === "blocked" ? input.blockerPersonId ?? null : null }).where(eq(pulseWorkItems.id, input.itemId));
    if (item[0].itemType === "todo" && input.status === "complete") await tx.update(pulseTodos).set({ completionNote: input.completionNote?.trim() || input.note?.trim() || null }).where(eq(pulseTodos.itemId, input.itemId));
    await appendWorkActivity(tx, { itemId: input.itemId, activityType: "status_changed", actorPersonId, note: input.note?.trim() || null, payload: { fromStatus: item[0].status, toStatus: input.status, mode, blockerType: input.status === "blocked" ? input.blockerType ?? null : null, blockerPersonId: input.status === "blocked" ? input.blockerPersonId ?? null : null } });
    await appendPulseEvent(tx, { eventType: "work_item_status_changed", scopeId: item[0].primaryScopeId, actorPersonId, payload: { itemId: input.itemId, fromStatus: item[0].status, toStatus: input.status } });
  });
}

export async function assignCanonicalWorkItem(db: PulsePolicyDb, actor: PulseActor, itemId: number, assigneePersonId: number | null) {
  const item = await db.select().from(pulseWorkItems).where(eq(pulseWorkItems.id, itemId)).limit(1);
  if (!item[0]) throw new Error("Work item not found.");
  const actorPersonId = await actorPersonForWrite(db, actor);
  if (assigneePersonId) {
    const decision = await canAssign(db, { primaryScopeId: item[0].primaryScopeId }, assigneePersonId, actor);
    if (!decision.allowed) throw new Error("The assignee is not available in this scope.");
  } else await requireWorkManager(db, item[0].primaryScopeId, actor);
  return db.transaction(async (tx: any) => {
    await tx.update(pulseWorkItems).set({ assigneePersonId }).where(eq(pulseWorkItems.id, itemId));
    await appendWorkActivity(tx, { itemId, activityType: "assigned", actorPersonId, payload: { assigneePersonId } });
    await appendPulseEvent(tx, { eventType: "work_item_assigned", scopeId: item[0].primaryScopeId, actorPersonId, payload: { itemId, assigneePersonId } });
    if (assigneePersonId && assigneePersonId !== actorPersonId) await createNotificationIntent(tx, itemId, assigneePersonId, "assignment", actor, { itemId, source: "assignment" });
  });
}

async function createNotificationIntent(db: PulsePolicyDb, itemId: number, recipientPersonId: number, intentType: "assignment" | "mention" | "status_change" | "comment", actor: PulseActor, payload: Record<string, unknown>) {
  const item = await db.select({ primaryScopeId: pulseWorkItems.primaryScopeId }).from(pulseWorkItems).where(eq(pulseWorkItems.id, itemId)).limit(1);
  if (!item[0]) return;
  const delivery = await canDeliver(db, { scopeId: item[0].primaryScopeId, recipientPersonId }, actor);
  await db.insert(pulseWorkItemNotificationIntents).values({ itemId, recipientPersonId, intentType, status: delivery.allowed ? "pending" : "suppressed", payload: { ...payload, suppressionReason: delivery.allowed ? null : delivery.reason } });
}

export async function addCanonicalWorkComment(db: PulsePolicyDb, actor: PulseActor, input: { itemId: number; body: string; mentionedPersonIds?: number[] }) {
  if (!substantive(input.body)) throw new Error("A substantive comment is required.");
  await requireWorkView(db, input.itemId, actor);
  const actorPersonId = await actorPersonForWrite(db, actor);
  const mentions = Array.from(new Set(input.mentionedPersonIds ?? []));
  return db.transaction(async (tx: any) => {
    const [result] = await tx.insert(pulseWorkItemComments).values({ itemId: input.itemId, authorPersonId: actorPersonId, body: input.body.trim() });
    const commentId = Number((result as any).insertId);
    await appendWorkActivity(tx, { itemId: input.itemId, activityType: "comment_added", actorPersonId, payload: { commentId } });
    const item = await tx.select({ primaryScopeId: pulseWorkItems.primaryScopeId }).from(pulseWorkItems).where(eq(pulseWorkItems.id, input.itemId)).limit(1);
    await appendPulseEvent(tx, { eventType: "work_item_comment_added", scopeId: item[0]?.primaryScopeId ?? null, actorPersonId, payload: { itemId: input.itemId, commentId } });
    for (const mentionedPersonId of mentions) {
      await tx.insert(pulseWorkItemMentions).values({ commentId, itemId: input.itemId, mentionedPersonId, createdByPersonId: actorPersonId });
      await appendWorkActivity(tx, { itemId: input.itemId, activityType: "mention_added", actorPersonId, payload: { commentId, mentionedPersonId } });
      await appendPulseEvent(tx, { eventType: "work_item_mention_added", scopeId: item[0]?.primaryScopeId ?? null, actorPersonId, payload: { itemId: input.itemId, mentionedPersonId } });
      if (mentionedPersonId !== actorPersonId) await createNotificationIntent(tx, input.itemId, mentionedPersonId, "mention", actor, { itemId: input.itemId, commentId });
    }
    return commentId;
  });
}

async function sourceLabel(db: PulsePolicyDb, scopeId: number | null, viewerPersonId: number) {
  if (!scopeId) return "Data quality: missing creation scope";
  const scope = await db.select().from(pulseScopes).where(eq(pulseScopes.id, scopeId)).limit(1);
  if (!scope[0]) return `Data quality: unresolved creation scope #${scopeId}`;
  if (scope[0].scopeType === "private") return "Personal";
  if (scope[0].scopeType === "one_on_one") {
    const members = await db.select({ personId: pulseScopeMemberships.personId, name: pulsePeople.displayName }).from(pulseScopeMemberships).innerJoin(pulsePeople, eq(pulseScopeMemberships.personId, pulsePeople.id)).where(and(eq(pulseScopeMemberships.scopeId, scopeId), eq(pulseScopeMemberships.isActive, true))).orderBy(asc(pulsePeople.displayName));
    const counterpart = members.find((member: any) => member.personId !== viewerPersonId);
    return counterpart ? `1:1 with ${counterpart.name}` : `Data quality: unresolved 1:1 counterpart in ${scope.name}`;
  }
  return scope[0].name;
}

/** Shared projection for personal, Scope, and notification surfaces. */
export async function enrichCanonicalWorkItems(db: PulsePolicyDb, actor: PulseActor, filters: { scopeId?: number; assigneePersonId?: number; notificationRecipientPersonId?: number } = {}) {
  const actorPersonId = await actorPersonForWrite(db, actor);
  let candidates: any[];
  if (filters.notificationRecipientPersonId) {
    candidates = await db.select({ item: pulseWorkItems }).from(pulseWorkItemNotificationIntents).innerJoin(pulseWorkItems, eq(pulseWorkItemNotificationIntents.itemId, pulseWorkItems.id)).where(and(eq(pulseWorkItemNotificationIntents.recipientPersonId, filters.notificationRecipientPersonId), eq(pulseWorkItemNotificationIntents.status, "pending"))).orderBy(desc(pulseWorkItemNotificationIntents.createdAt));
    candidates = candidates.map((row: any) => row.item);
  } else if (filters.assigneePersonId) {
    candidates = await db.select().from(pulseWorkItems).where(eq(pulseWorkItems.assigneePersonId, filters.assigneePersonId)).orderBy(desc(pulseWorkItems.updatedAt));
  } else if (filters.scopeId) {
    const primary = await db.select().from(pulseWorkItems).where(eq(pulseWorkItems.primaryScopeId, filters.scopeId));
    const placed = await db.select({ item: pulseWorkItems }).from(pulseWorkItemPlacements).innerJoin(pulseWorkItems, eq(pulseWorkItemPlacements.itemId, pulseWorkItems.id)).where(and(eq(pulseWorkItemPlacements.scopeId, filters.scopeId), eq(pulseWorkItemPlacements.isActive, true)));
    candidates = Array.from(new Map([...primary, ...placed.map((row: any) => row.item)].map((item: any) => [item.id, item])).values());
  } else {
    candidates = await db.select().from(pulseWorkItems).orderBy(desc(pulseWorkItems.updatedAt));
  }
  const result: any[] = [];
  for (const item of candidates) {
    const access = await canViewWorkItem(db, item.id, actor);
    if (!access.allowed) continue;
    const [owner, activities, todo, issue] = await Promise.all([
      item.assigneePersonId ? db.select({ id: pulsePeople.id, displayName: pulsePeople.displayName }).from(pulsePeople).where(eq(pulsePeople.id, item.assigneePersonId)).limit(1) : [],
      db.select().from(pulseWorkItemActivity).where(eq(pulseWorkItemActivity.itemId, item.id)).orderBy(desc(pulseWorkItemActivity.occurredAt)).limit(12),
      item.itemType === "todo" ? db.select().from(pulseTodos).where(eq(pulseTodos.itemId, item.id)).limit(1) : [],
      item.itemType === "issue" ? db.select().from(pulseIssues).where(eq(pulseIssues.itemId, item.id)).limit(1) : [],
    ]);
    const currentScope = await db.select({ id: pulseScopes.id, name: pulseScopes.name, scopeType: pulseScopes.scopeType, isActive: pulseScopes.isActive }).from(pulseScopes).where(eq(pulseScopes.id, item.primaryScopeId)).limit(1);
    result.push({ ...item, owner: owner[0] ?? null, currentScope: currentScope[0] ?? null, sourceLabel: await sourceLabel(db, item.createdInScopeId, actorPersonId), access, activity: activities, todo: todo[0] ?? null, issue: issue[0] ?? null });
  }
  return result;
}

export async function voteCanonicalIssue(db: PulsePolicyDb, actor: PulseActor, itemId: number, sessionId?: string | null) {
  const item = await db.select().from(pulseWorkItems).where(eq(pulseWorkItems.id, itemId)).limit(1);
  if (!item[0] || item[0].itemType !== "issue") throw new Error("Issue not found.");
  const vote = await canVote(db, { primaryScopeId: item[0].primaryScopeId }, 0, actor);
  if (!vote.allowed) throw new Error("You cannot vote on this issue in the active Scope.");
  const actorPersonId = await actorPersonForWrite(db, actor);
  await db.insert(pulseIssueVotes).values({ issueItemId: itemId, voterPersonId: actorPersonId, sessionId: sessionId ?? null }).onDuplicateKeyUpdate({ set: { createdAt: new Date() } });
}
