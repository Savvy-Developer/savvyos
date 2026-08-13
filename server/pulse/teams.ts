import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  pulseMeetingSessions,
  pulsePeople,
  pulsePersonAccounts,
  pulseScopeMemberships,
  pulseScopes,
  pulseSessionItemCaptures,
  pulseStrategyNodes,
  pulseStrategyScopePlacements,
  pulseTeamScopeLinks,
  pulseTodos,
  pulseWorkItemActivity,
  pulseWorkItems,
} from "../../drizzle/schema";
import { resolvePulseOperatingWeekWindows } from "./calendar";
import { canCreate, canView, getActiveScope, type PulseActor, type PulsePolicyDb } from "./policy";
import { enrichCanonicalWorkItems } from "./work";

export type TeamLinkType = "reports_to" | "receives_cascades_from" | "work_rollup_from";

async function requireTeamScope(db: PulsePolicyDb, teamScopeId: number, actor: PulseActor, write = false) {
  const scope = await getActiveScope(db, teamScopeId);
  if (!scope || scope.scopeType !== "team") throw new Error("An active Team Scope is required.");
  const decision = write ? await canCreate(db, "scope_configuration", teamScopeId, actor) : await canView(db, teamScopeId, actor);
  if (!decision.allowed) throw new Error("You cannot open this active Team Scope.");
  return scope;
}

export async function createTeamScopeLink(db: PulsePolicyDb, actor: PulseActor, input: { teamScopeId: number; l10ScopeId: number; relationshipType: TeamLinkType }) {
  await requireTeamScope(db, input.teamScopeId, actor, true);
  const l10 = await getActiveScope(db, input.l10ScopeId);
  if (!l10 || l10.scopeType !== "l10") throw new Error("An active L10 Scope is required for a Team relationship.");
  const account = (await db.select({ personId: pulsePersonAccounts.personId }).from(pulsePersonAccounts).where(and(eq(pulsePersonAccounts.userId, actor.userId), isNull(pulsePersonAccounts.unlinkedAt))).limit(1))[0];
  if (!account) throw new Error("Authenticated account is not linked to a Pulse person.");
  await db.insert(pulseTeamScopeLinks).values({ ...input, createdByPersonId: account.personId, isActive: true }).onDuplicateKeyUpdate({ set: { isActive: true, updatedAt: new Date() } });
}

async function teamLinks(db: PulsePolicyDb, teamScopeId: number) {
  const links = await db.select({ link: pulseTeamScopeLinks, l10: pulseScopes }).from(pulseTeamScopeLinks).innerJoin(pulseScopes, eq(pulseTeamScopeLinks.l10ScopeId, pulseScopes.id))
    .where(and(eq(pulseTeamScopeLinks.teamScopeId, teamScopeId), eq(pulseTeamScopeLinks.isActive, true), eq(pulseScopes.isActive, true)));
  return links.filter((row: any) => row.l10.scopeType === "l10");
}

/** Independent policy: direct-team Todo primary scope OR session-created Todo from a work_rollup_from L10. */
async function teamTodoIds(db: PulsePolicyDb, teamScopeId: number) {
  const direct = await db.select({ id: pulseWorkItems.id }).from(pulseWorkItems).where(and(eq(pulseWorkItems.primaryScopeId, teamScopeId), eq(pulseWorkItems.itemType, "todo")));
  const links = await teamLinks(db, teamScopeId);
  const rollupL10Ids = links.filter((row: any) => row.link.relationshipType === "work_rollup_from").map((row: any) => row.link.l10ScopeId);
  if (!rollupL10Ids.length) return { directIds: direct.map((row: any) => row.id), linkedMeetingOriginIds: [], ids: direct.map((row: any) => row.id) };
  const captured = await db.select({ itemId: pulseSessionItemCaptures.itemId, meetingScopeId: pulseMeetingSessions.scopeId })
    .from(pulseSessionItemCaptures).innerJoin(pulseMeetingSessions, eq(pulseSessionItemCaptures.sessionId, pulseMeetingSessions.id)).innerJoin(pulseWorkItems, eq(pulseSessionItemCaptures.itemId, pulseWorkItems.id))
    .where(and(eq(pulseSessionItemCaptures.captureKind, "todo"), inArray(pulseMeetingSessions.scopeId, rollupL10Ids), eq(pulseWorkItems.itemType, "todo")));
  const directIds = direct.map((row: any) => row.id);
  const linkedMeetingOriginIds = Array.from(new Set(captured.map((row: any) => row.itemId).filter((id: number) => !directIds.includes(id))));
  return { directIds, linkedMeetingOriginIds, ids: Array.from(new Set([...directIds, ...linkedMeetingOriginIds])) };
}

/** Independent policy: Team Issues are direct Team Scope only, regardless of any L10 link or session provenance. */
async function teamIssueIds(db: PulsePolicyDb, teamScopeId: number) {
  const rows = await db.select({ id: pulseWorkItems.id }).from(pulseWorkItems).where(and(eq(pulseWorkItems.primaryScopeId, teamScopeId), eq(pulseWorkItems.itemType, "issue")));
  return rows.map((row: any) => row.id);
}

function dateKey(value: unknown) { return value ? String(value).slice(0, 10) : null; }
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function weekForDate(iso: string | null, weeks: Array<{ key: string; startsOn: string; endsOn: string }>) { return iso ? weeks.find((week) => iso >= week.startsOn && iso <= week.endsOn) ?? null : null; }

/**
 * The canonical Team dashboard projection. Every Team panel reads a slice of this value; Overview
 * never introduces a count or item which cannot be found in its dedicated tab.
 */
export async function getTeamDashboard(db: PulsePolicyDb, actor: PulseActor, teamScopeId: number) {
  const team = await requireTeamScope(db, teamScopeId, actor);
  const calendar = await resolvePulseOperatingWeekWindows(db, 6);
  const todoPolicy = await teamTodoIds(db, teamScopeId);
  const issueIds = await teamIssueIds(db, teamScopeId);
  const [todos, issues, links, members, strategy] = await Promise.all([
    enrichCanonicalWorkItems(db, actor, { itemIds: todoPolicy.ids }),
    enrichCanonicalWorkItems(db, actor, { itemIds: issueIds }),
    teamLinks(db, teamScopeId),
    db.select({ personId: pulseScopeMemberships.personId, name: pulsePeople.displayName }).from(pulseScopeMemberships).innerJoin(pulsePeople, eq(pulseScopeMemberships.personId, pulsePeople.id)).where(and(eq(pulseScopeMemberships.scopeId, teamScopeId), eq(pulseScopeMemberships.isActive, true))).orderBy(asc(pulsePeople.displayName)),
    db.select({ node: pulseStrategyNodes, placement: pulseStrategyScopePlacements, ownerName: pulsePeople.displayName }).from(pulseStrategyScopePlacements).innerJoin(pulseStrategyNodes, eq(pulseStrategyScopePlacements.nodeId, pulseStrategyNodes.id)).leftJoin(pulsePeople, eq(pulseStrategyNodes.responsiblePersonId, pulsePeople.id)).where(and(eq(pulseStrategyScopePlacements.scopeId, teamScopeId), eq(pulseStrategyScopePlacements.isVisible, true), eq(pulseStrategyNodes.nodeType, "quarterly_rock"))),
  ]);
  const excludedRecurring = new Set(todos.filter((item: any) => item.status === "skipped" && item.todo?.recurrenceId).map((item: any) => item.id));
  const capacityTodos = todos.filter((item: any) => !excludedRecurring.has(item.id));
  const currentWeek = calendar?.weeks[calendar.weeks.length - 1] ?? null;
  const activeTodos = capacityTodos.filter((item: any) => !["complete", "skipped"].includes(item.status));
  const urgencyOrder = ["urgent", "high", "medium", "low"] as const;
  const workloadByPerson = members.map((member: any) => {
    const assigned = activeTodos.filter((item: any) => item.assigneePersonId === member.personId);
    return { personId: member.personId, name: member.name, capacityLabel: "Assigned active work", total: assigned.length, urgency: urgencyOrder.map((priority) => ({ priority, count: assigned.filter((item: any) => item.todo?.priority === priority).length })) };
  });
  const activityIds = capacityTodos.map((item: any) => item.id);
  const activities = activityIds.length ? await db.select().from(pulseWorkItemActivity).where(inArray(pulseWorkItemActivity.itemId, activityIds)) : [];
  const heatmap = members.map((member: any) => ({ personId: member.personId, name: member.name, weeks: (calendar?.weeks ?? []).map((week) => {
    const assigned = capacityTodos.filter((item: any) => item.assigneePersonId === member.personId && weekForDate(dateKey(item.createdAt), calendar?.weeks ?? [])?.key === week.key).length + activities.filter((activity: any) => activity.activityType === "assigned" && activity.payload?.assigneePersonId === member.personId && weekForDate(dateKey(activity.occurredAt), calendar?.weeks ?? [])?.key === week.key).length;
    const completed = activities.filter((activity: any) => activity.activityType === "status_changed" && activity.payload?.toStatus === "complete" && weekForDate(dateKey(activity.occurredAt), calendar?.weeks ?? [])?.key === week.key && capacityTodos.some((item: any) => item.id === activity.itemId && item.assigneePersonId === member.personId)).length;
    return { ...week, assigned, completed };
  }) }));
  const completedActivities = activities.filter((activity: any) => activity.activityType === "status_changed" && activity.payload?.toStatus === "complete");
  const completedIds = new Set(completedActivities.map((activity: any) => activity.itemId));
  const nowIso = calendar?.snapshot.localDate ?? null;
  const overdue = capacityTodos.filter((item: any) => item.todo?.dueDate && nowIso && dateKey(item.todo.dueDate)! < nowIso && !["complete", "skipped"].includes(item.status)).length;
  const durations = completedActivities.map((activity: any) => { const item = capacityTodos.find((candidate: any) => candidate.id === activity.itemId); return item ? Math.max(0, (new Date(activity.occurredAt).getTime() - new Date(item.createdAt).getTime()) / 86400000) : null; }).filter((value: number | null): value is number => value !== null);
  const carryover = activeTodos.filter((item: any) => currentWeek && dateKey(item.createdAt)! < currentWeek.startsOn).length;
  const aging = activeTodos.map((item: any) => nowIso ? Math.max(0, Math.floor((new Date(`${nowIso}T00:00:00Z`).getTime() - new Date(item.createdAt).getTime()) / 86400000)) : 0);
  const sessionCaptures = activityIds.length ? await db.select({ itemId: pulseSessionItemCaptures.itemId }).from(pulseSessionItemCaptures).where(inArray(pulseSessionItemCaptures.itemId, activityIds)) : [];
  const captureQuality = capacityTodos.length ? Math.round((new Set(sessionCaptures.map((row: any) => row.itemId)).size / capacityTodos.length) * 100) : 0;
  const rockGroups = new Map<string, { owner: string; rocks: any[] }>();
  for (const row of strategy as any[]) { const owner = row.ownerName ?? "Unassigned"; if (!rockGroups.has(owner)) rockGroups.set(owner, { owner, rocks: [] }); rockGroups.get(owner)!.rocks.push({ ...row.node, presentationStatus: row.placement.presentationStatus, displayedOwner: owner }); }
  const overview = { directTodoCount: todoPolicy.directIds.length, linkedMeetingOriginTodoCount: todoPolicy.linkedMeetingOriginIds.length, issueCount: issues.length, activeTodoCount: activeTodos.length, rockCount: strategy.length, memberCount: members.length, relationshipCount: links.length };
  return {
    team,
    calendar,
    policies: { todos: "direct_team_todos + linked_meeting_origin_todos via work_rollup_from only", issues: "direct_team_issues only" },
    links: links.map((row: any) => ({ ...row.link, l10Name: row.l10.name })),
    overview,
    todos: { policy: overview, items: todos },
    issues: { policy: "direct_team_issues", items: issues },
    rocks: { nodes: strategy.map((row: any) => ({ ...row.node, presentationStatus: row.placement.presentationStatus, displayedOwner: row.ownerName ?? "Unassigned" })), groups: Array.from(rockGroups.values()).sort((a, b) => a.owner.localeCompare(b.owner)) },
    workload: { framing: "Capacity view: assigned work and completed work are paired without individual performance scoring.", byPerson: workloadByPerson, heatmap },
    productivity: { framing: "Team flow and capacity health; not individual performance.", completed: completedIds.size, netFlow: completedIds.size - capacityTodos.filter((item: any) => currentWeek && weekForDate(dateKey(item.createdAt), calendar?.weeks ?? [])?.key === currentWeek.key).length, overdue, medianCompletionDays: median(durations), carryover, agingDays: aging.length ? { median: median(aging), max: Math.max(...aging) } : { median: null, max: null }, captureQualityPercent: captureQuality, skippedRecurringExcluded: excludedRecurring.size },
  };
}
