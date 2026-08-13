import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  pulseMeasurableAlerts,
  pulseMeasurableEntries,
  pulseMeasurablePlacements,
  pulseMeasurables,
  pulsePeople,
  pulseStrategyNodes,
  pulseStrategyRaci,
  pulseStrategyScopePlacements,
} from "../../drizzle/schema";
import { resolvePulseCalendar } from "./calendar";
import { appendPulseEvent } from "./events";
import { canCreate, canView, getPersonForAccount, type PulseActor, type PulsePolicyDb } from "./policy";

export type MeasurableCadence = "weekly" | "monthly" | "quarterly";
export type StrategyNodeType = "vision" | "annual_goal" | "quarterly_rock" | "milestone";
export type StrategyStatus = "not_started" | "on_track" | "at_risk" | "complete" | "skipped";

type CanonicalPeriod = { key: string; type: "operating_week" | "month" | "quarter"; startsOn: string; endsOn: string; calendarConfigId: number; timezone: string; fiscalYear: number };

function isoDateToDbDate(value: string) { return new Date(`${value}T00:00:00.000Z`); }

async function requireActorPerson(db: PulsePolicyDb, actor: PulseActor) {
  const personId = await getPersonForAccount(db, actor.userId);
  if (!personId) throw new Error("Authenticated account is not linked to an active Pulse person.");
  return personId;
}

/** The sole measurable/report period authority. It delegates all boundaries to resolvePulseCalendar. */
export async function resolveMeasurablePeriod(db: PulsePolicyDb, cadence: MeasurableCadence, now = new Date()): Promise<CanonicalPeriod> {
  const calendar = await resolvePulseCalendar(db, now);
  if (!calendar) throw new Error("Configure the Pulse calendar before recording measurable entries.");
  if (cadence === "weekly") return {
    key: `operating_week:${calendar.operatingWeekStart}`, type: "operating_week", startsOn: calendar.operatingWeekStart, endsOn: calendar.operatingWeekEnd,
    calendarConfigId: calendar.config.id, timezone: calendar.config.timezone, fiscalYear: calendar.fiscalYear,
  };
  const targetType = cadence === "monthly" ? "month" : "quarter";
  const period = calendar.reportingPeriods.find((candidate) => candidate.periodType === targetType);
  if (!period) throw new Error(`Create an active ${targetType} reporting period in the Pulse calendar before using ${cadence} measurables.`);
  return {
    key: `${targetType}:${period.id}`, type: targetType, startsOn: period.startsOn, endsOn: period.endsOn,
    calendarConfigId: calendar.config.id, timezone: calendar.config.timezone, fiscalYear: calendar.fiscalYear,
  };
}

function thresholdState(measurable: any, observed: number): "warning" | "critical" | null {
  if (!measurable.alertEnabled) return null;
  const warning = measurable.warningValue === null ? null : Number(measurable.warningValue);
  const critical = measurable.criticalValue === null ? null : Number(measurable.criticalValue);
  if (measurable.direction === "higher_is_better") {
    if (critical !== null && observed <= critical) return "critical";
    if (warning !== null && observed <= warning) return "warning";
  } else {
    if (critical !== null && observed >= critical) return "critical";
    if (warning !== null && observed >= warning) return "warning";
  }
  return null;
}

async function requireScopeWrite(db: PulsePolicyDb, scopeId: number, actor: PulseActor) {
  const decision = await canCreate(db, "measurable", scopeId, actor);
  if (!decision.allowed) throw new Error("You cannot change measurables in this active Scope.");
}

export async function createMeasurable(db: PulsePolicyDb, actor: PulseActor, input: {
  name: string; definition?: string | null; unit?: string; cadence?: MeasurableCadence; aggregation?: "last" | "sum" | "average";
  direction?: "higher_is_better" | "lower_is_better"; targetValue?: number | null; warningValue?: number | null; criticalValue?: number | null;
  ownerPersonId?: number | null; alertEnabled?: boolean; placementScopeIds: number[];
}) {
  const actorPersonId = await requireActorPerson(db, actor);
  const scopeIds = Array.from(new Set(input.placementScopeIds));
  if (!scopeIds.length) throw new Error("A measurable must be intentionally placed in at least one Scope.");
  for (const scopeId of scopeIds) await requireScopeWrite(db, scopeId, actor);
  if (input.ownerPersonId) {
    const owner = await db.select({ id: pulsePeople.id }).from(pulsePeople).where(and(eq(pulsePeople.id, input.ownerPersonId), eq(pulsePeople.isActive, true))).limit(1);
    if (!owner[0]) throw new Error("Measurable owner must be an active Pulse person.");
  }
  return db.transaction(async (tx: any) => {
    const [result] = await tx.insert(pulseMeasurables).values({
      name: input.name.trim(), definition: input.definition?.trim() || null, unit: input.unit?.trim() || "count", cadence: input.cadence ?? "weekly",
      aggregation: input.aggregation ?? "last", direction: input.direction ?? "higher_is_better", targetValue: input.targetValue === null || input.targetValue === undefined ? null : String(input.targetValue),
      warningValue: input.warningValue === null || input.warningValue === undefined ? null : String(input.warningValue), criticalValue: input.criticalValue === null || input.criticalValue === undefined ? null : String(input.criticalValue),
      ownerPersonId: input.ownerPersonId ?? null, alertEnabled: input.alertEnabled ?? true, isActive: true, createdByPersonId: actorPersonId,
    });
    const measurableId = Number((result as any).insertId);
    for (let index = 0; index < scopeIds.length; index += 1) {
      const scopeId = scopeIds[index];
      await tx.insert(pulseMeasurablePlacements).values({ measurableId, scopeId, displayOrder: index, isActive: true, addedByPersonId: actorPersonId });
      await appendPulseEvent(tx, { eventType: "measurable_placed", scopeId, actorPersonId, payload: { measurableId, scopeId } });
    }
    await appendPulseEvent(tx, { eventType: "measurable_created", scopeId: scopeIds[0], actorPersonId, payload: { measurableId, name: input.name.trim() } });
    return measurableId;
  });
}

export async function updateMeasurable(db: PulsePolicyDb, actor: PulseActor, input: {
  measurableId: number; name?: string; definition?: string | null; unit?: string; cadence?: MeasurableCadence; aggregation?: "last" | "sum" | "average";
  direction?: "higher_is_better" | "lower_is_better"; targetValue?: number | null; warningValue?: number | null; criticalValue?: number | null; ownerPersonId?: number | null; alertEnabled?: boolean; isActive?: boolean;
}) {
  const measurable = (await db.select().from(pulseMeasurables).where(eq(pulseMeasurables.id, input.measurableId)).limit(1))[0];
  if (!measurable) throw new Error("Measurable not found.");
  const placements = await db.select({ scopeId: pulseMeasurablePlacements.scopeId }).from(pulseMeasurablePlacements).where(and(eq(pulseMeasurablePlacements.measurableId, measurable.id), eq(pulseMeasurablePlacements.isActive, true)));
  if (!placements.length) throw new Error("Measurable has no active Scope placement.");
  for (const placement of placements) await requireScopeWrite(db, placement.scopeId, actor);
  if (input.ownerPersonId) await validateStrategyPeople(db, input.ownerPersonId, null);
  // Entries are deliberately not touched: owner is current definition metadata, submitter belongs to each historical value cell.
  await db.update(pulseMeasurables).set({
    ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.definition !== undefined ? { definition: input.definition?.trim() || null } : {}),
    ...(input.unit !== undefined ? { unit: input.unit.trim() } : {}), ...(input.cadence !== undefined ? { cadence: input.cadence } : {}), ...(input.aggregation !== undefined ? { aggregation: input.aggregation } : {}),
    ...(input.direction !== undefined ? { direction: input.direction } : {}), ...(input.targetValue !== undefined ? { targetValue: input.targetValue === null ? null : String(input.targetValue) } : {}),
    ...(input.warningValue !== undefined ? { warningValue: input.warningValue === null ? null : String(input.warningValue) } : {}), ...(input.criticalValue !== undefined ? { criticalValue: input.criticalValue === null ? null : String(input.criticalValue) } : {}),
    ...(input.ownerPersonId !== undefined ? { ownerPersonId: input.ownerPersonId } : {}), ...(input.alertEnabled !== undefined ? { alertEnabled: input.alertEnabled } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  }).where(eq(pulseMeasurables.id, measurable.id));
}

export async function placeMeasurable(db: PulsePolicyDb, actor: PulseActor, input: { measurableId: number; scopeId: number; displayOrder?: number }) {
  await requireScopeWrite(db, input.scopeId, actor);
  const actorPersonId = await requireActorPerson(db, actor);
  const measurable = await db.select({ id: pulseMeasurables.id }).from(pulseMeasurables).where(and(eq(pulseMeasurables.id, input.measurableId), eq(pulseMeasurables.isActive, true))).limit(1);
  if (!measurable[0]) throw new Error("Measurable not found.");
  await db.insert(pulseMeasurablePlacements).values({ measurableId: input.measurableId, scopeId: input.scopeId, displayOrder: input.displayOrder ?? 0, isActive: true, addedByPersonId: actorPersonId }).onDuplicateKeyUpdate({ set: { isActive: true, displayOrder: input.displayOrder ?? 0, addedByPersonId: actorPersonId } });
  await appendPulseEvent(db, { eventType: "measurable_placed", scopeId: input.scopeId, actorPersonId, payload: { measurableId: input.measurableId, scopeId: input.scopeId } });
}

export async function recordMeasurableEntry(db: PulsePolicyDb, actor: PulseActor, input: { measurableId: number; scopeId: number; value: number; note?: string | null; now?: Date }) {
  await requireScopeWrite(db, input.scopeId, actor);
  const actorPersonId = await requireActorPerson(db, actor);
  const measurable = (await db.select().from(pulseMeasurables).where(and(eq(pulseMeasurables.id, input.measurableId), eq(pulseMeasurables.isActive, true))).limit(1))[0];
  if (!measurable) throw new Error("Measurable not found.");
  const placement = await db.select({ id: pulseMeasurablePlacements.id }).from(pulseMeasurablePlacements).where(and(eq(pulseMeasurablePlacements.measurableId, measurable.id), eq(pulseMeasurablePlacements.scopeId, input.scopeId), eq(pulseMeasurablePlacements.isActive, true))).limit(1);
  if (!placement[0]) throw new Error("This measurable is not placed in the requested Scope.");
  const period = await resolveMeasurablePeriod(db, measurable.cadence as MeasurableCadence, input.now);
  return db.transaction(async (tx: any) => {
    await tx.insert(pulseMeasurableEntries).values({ measurableId: measurable.id, periodKey: period.key, periodStart: isoDateToDbDate(period.startsOn), periodEnd: isoDateToDbDate(period.endsOn), value: String(input.value), note: input.note?.trim() || null, submittedByPersonId: actorPersonId, submittedAt: new Date() })
      .onDuplicateKeyUpdate({ set: { value: String(input.value), note: input.note?.trim() || null, submittedByPersonId: actorPersonId, submittedAt: new Date() } });
    const entry = (await tx.select().from(pulseMeasurableEntries).where(and(eq(pulseMeasurableEntries.measurableId, measurable.id), eq(pulseMeasurableEntries.periodKey, period.key))).limit(1))[0];
    const state = thresholdState(measurable, input.value);
    const placements = await tx.select({ scopeId: pulseMeasurablePlacements.scopeId }).from(pulseMeasurablePlacements).where(and(eq(pulseMeasurablePlacements.measurableId, measurable.id), eq(pulseMeasurablePlacements.isActive, true)));
    await tx.delete(pulseMeasurableAlerts).where(eq(pulseMeasurableAlerts.entryId, entry.id));
    if (state) for (const placementRow of placements) {
      await tx.insert(pulseMeasurableAlerts).values({ measurableId: measurable.id, entryId: entry.id, scopeId: placementRow.scopeId, alertState: state, observedValue: String(input.value), periodKey: period.key });
      await appendPulseEvent(tx, { eventType: "measurable_alert_raised", scopeId: placementRow.scopeId, actorPersonId, payload: { measurableId: measurable.id, entryId: entry.id, alertState: state } });
    }
    await appendPulseEvent(tx, { eventType: "measurable_entry_recorded", scopeId: input.scopeId, actorPersonId, payload: { measurableId: measurable.id, entryId: entry.id, periodKey: period.key } });
    return { entryId: entry.id, period, alertState: state };
  });
}

async function requireScorecardScope(db: PulsePolicyDb, scopeId: number, actor: PulseActor) {
  const decision = await canView(db, scopeId, actor);
  if (!decision.allowed) throw new Error("Scorecard is unavailable in this active Scope.");
}

/** All scorecard-facing surfaces call this one query so period boundaries remain identical. */
export async function getScopeScorecard(db: PulsePolicyDb, actor: PulseActor, scopeId: number, now = new Date()) {
  await requireScorecardScope(db, scopeId, actor);
  const placements = await db.select({ measurable: pulseMeasurables, placement: pulseMeasurablePlacements, ownerName: pulsePeople.displayName })
    .from(pulseMeasurablePlacements).innerJoin(pulseMeasurables, eq(pulseMeasurablePlacements.measurableId, pulseMeasurables.id)).leftJoin(pulsePeople, eq(pulseMeasurables.ownerPersonId, pulsePeople.id))
    .where(and(eq(pulseMeasurablePlacements.scopeId, scopeId), eq(pulseMeasurablePlacements.isActive, true), eq(pulseMeasurables.isActive, true))).orderBy(asc(pulseMeasurablePlacements.displayOrder), asc(pulseMeasurables.name));
  const rows: any[] = [];
  for (const row of placements) {
    const period = await resolveMeasurablePeriod(db, row.measurable.cadence as MeasurableCadence, now);
    const entry = (await db.select().from(pulseMeasurableEntries).where(and(eq(pulseMeasurableEntries.measurableId, row.measurable.id), eq(pulseMeasurableEntries.periodKey, period.key))).limit(1))[0] ?? null;
    const latestAlert = entry ? (await db.select().from(pulseMeasurableAlerts).where(and(eq(pulseMeasurableAlerts.entryId, entry.id), eq(pulseMeasurableAlerts.scopeId, scopeId))).orderBy(desc(pulseMeasurableAlerts.createdAt)).limit(1))[0] ?? null : null;
    rows.push({ ...row.measurable, ownerName: row.ownerName ?? null, period, entry, alert: latestAlert });
  }
  return { periodSource: "pulse_calendar_service", rows };
}

// Dashboard, analytics, and report contracts deliberately return the same central period-bearing scorecard surface.
export const getDashboardScorecard = getScopeScorecard;
export const getAnalyticsScorecard = getScopeScorecard;
export const getReportScorecard = getScopeScorecard;

function validParentType(nodeType: StrategyNodeType) {
  return ({ vision: null, annual_goal: "vision", quarterly_rock: "annual_goal", milestone: "quarterly_rock" } as const)[nodeType];
}

async function validateStrategyPeople(db: PulsePolicyDb, accountablePersonId: number, responsiblePersonId?: number | null) {
  const ids = Array.from(new Set([accountablePersonId, ...(responsiblePersonId ? [responsiblePersonId] : [])]));
  const people = await db.select({ id: pulsePeople.id }).from(pulsePeople).where(and(inArray(pulsePeople.id, ids), eq(pulsePeople.isActive, true)));
  if (people.length !== ids.length) throw new Error("Accountable and Responsible assignments require active Pulse people.");
}

export async function createStrategyNode(db: PulsePolicyDb, actor: PulseActor, input: {
  nodeType: StrategyNodeType; parentId?: number | null; title: string; description?: string | null; status?: StrategyStatus; startsOn?: string | null; dueOn?: string | null; sortOrder?: number;
  accountablePersonId: number; responsiblePersonId?: number | null; consultedPersonIds?: number[]; informedPersonIds?: number[]; placementScopeIds: number[];
}) {
  const actorPersonId = await requireActorPerson(db, actor);
  const scopeIds = Array.from(new Set(input.placementScopeIds));
  if (!scopeIds.length) throw new Error("A strategy node must be intentionally placed in at least one Scope.");
  for (const scopeId of scopeIds) await requireScopeWrite(db, scopeId, actor);
  await validateStrategyPeople(db, input.accountablePersonId, input.responsiblePersonId);
  const expectedParent = validParentType(input.nodeType);
  if (expectedParent === null && input.parentId) throw new Error("Vision is the hierarchy root and cannot have a parent.");
  if (expectedParent && !input.parentId) throw new Error(`${input.nodeType.replaceAll("_", " ")} requires a ${expectedParent.replaceAll("_", " ")} parent.`);
  if (input.parentId) {
    const parent = (await db.select({ nodeType: pulseStrategyNodes.nodeType }).from(pulseStrategyNodes).where(eq(pulseStrategyNodes.id, input.parentId)).limit(1))[0];
    if (!parent || parent.nodeType !== expectedParent) throw new Error("Strategy parent does not match the required hierarchy.");
  }
  return db.transaction(async (tx: any) => {
    const [result] = await tx.insert(pulseStrategyNodes).values({ nodeType: input.nodeType, parentId: input.parentId ?? null, title: input.title.trim(), description: input.description?.trim() || null, status: input.status ?? "not_started", startsOn: input.startsOn ? isoDateToDbDate(input.startsOn) : null, dueOn: input.dueOn ? isoDateToDbDate(input.dueOn) : null, sortOrder: input.sortOrder ?? 0, accountablePersonId: input.accountablePersonId, responsiblePersonId: input.responsiblePersonId ?? null, createdByPersonId: actorPersonId });
    const nodeId = Number((result as any).insertId);
    const raci = [
      { personId: input.accountablePersonId, role: "accountable" as const },
      ...(input.responsiblePersonId ? [{ personId: input.responsiblePersonId, role: "responsible" as const }] : []),
      ...(input.consultedPersonIds ?? []).map((personId) => ({ personId, role: "consulted" as const })),
      ...(input.informedPersonIds ?? []).map((personId) => ({ personId, role: "informed" as const })),
    ];
    for (const assignment of raci) await tx.insert(pulseStrategyRaci).values({ nodeId, personId: assignment.personId, role: assignment.role, isActive: true, assignedByPersonId: actorPersonId });
    for (const scopeId of scopeIds) {
      await tx.insert(pulseStrategyScopePlacements).values({ nodeId, scopeId, isVisible: true, presentationStatus: null, addedByPersonId: actorPersonId });
      await appendPulseEvent(tx, { eventType: "strategy_scope_placed", scopeId, actorPersonId, payload: { nodeId, scopeId } });
    }
    await appendPulseEvent(tx, { eventType: "strategy_node_created", scopeId: scopeIds[0], actorPersonId, payload: { nodeId, nodeType: input.nodeType } });
    await appendPulseEvent(tx, { eventType: "strategy_raci_updated", scopeId: scopeIds[0], actorPersonId, payload: { nodeId, accountablePersonId: input.accountablePersonId } });
    return nodeId;
  });
}

export async function setStrategyNodeStatus(db: PulsePolicyDb, actor: PulseActor, input: { nodeId: number; status: StrategyStatus }) {
  const node = (await db.select().from(pulseStrategyNodes).where(eq(pulseStrategyNodes.id, input.nodeId)).limit(1))[0];
  if (!node) throw new Error("Strategy node not found.");
  const placement = (await db.select({ scopeId: pulseStrategyScopePlacements.scopeId }).from(pulseStrategyScopePlacements).where(and(eq(pulseStrategyScopePlacements.nodeId, node.id), eq(pulseStrategyScopePlacements.isVisible, true))).limit(1))[0];
  if (!placement) throw new Error("Strategy node has no visible Scope placement.");
  await requireScopeWrite(db, placement.scopeId, actor);
  const actorPersonId = await requireActorPerson(db, actor);
  await db.update(pulseStrategyNodes).set({ status: input.status }).where(eq(pulseStrategyNodes.id, node.id));
  await appendPulseEvent(db, { eventType: "strategy_node_status_changed", scopeId: placement.scopeId, actorPersonId, payload: { nodeId: node.id, status: input.status } });
}

export async function setStrategyScopePresentation(db: PulsePolicyDb, actor: PulseActor, input: { nodeId: number; scopeId: number; isVisible?: boolean; presentationStatus?: StrategyStatus | null }) {
  await requireScopeWrite(db, input.scopeId, actor);
  const actorPersonId = await requireActorPerson(db, actor);
  await db.insert(pulseStrategyScopePlacements).values({ nodeId: input.nodeId, scopeId: input.scopeId, isVisible: input.isVisible ?? true, presentationStatus: input.presentationStatus ?? null, addedByPersonId: actorPersonId })
    .onDuplicateKeyUpdate({ set: { isVisible: input.isVisible ?? true, presentationStatus: input.presentationStatus ?? null, addedByPersonId: actorPersonId } });
  await appendPulseEvent(db, { eventType: "strategy_scope_placed", scopeId: input.scopeId, actorPersonId, payload: { nodeId: input.nodeId, scopeId: input.scopeId } });
}

export async function setStrategyRaci(db: PulsePolicyDb, actor: PulseActor, input: { nodeId: number; accountablePersonId: number; responsiblePersonId?: number | null; consultedPersonIds?: number[]; informedPersonIds?: number[] }) {
  const node = (await db.select().from(pulseStrategyNodes).where(eq(pulseStrategyNodes.id, input.nodeId)).limit(1))[0];
  if (!node) throw new Error("Strategy node not found.");
  const placement = (await db.select({ scopeId: pulseStrategyScopePlacements.scopeId }).from(pulseStrategyScopePlacements).where(and(eq(pulseStrategyScopePlacements.nodeId, node.id), eq(pulseStrategyScopePlacements.isVisible, true))).limit(1))[0];
  if (!placement) throw new Error("Strategy node has no visible Scope placement.");
  await requireScopeWrite(db, placement.scopeId, actor);
  await validateStrategyPeople(db, input.accountablePersonId, input.responsiblePersonId);
  const actorPersonId = await requireActorPerson(db, actor);
  await db.transaction(async (tx: any) => {
    await tx.update(pulseStrategyNodes).set({ accountablePersonId: input.accountablePersonId, responsiblePersonId: input.responsiblePersonId ?? null }).where(eq(pulseStrategyNodes.id, node.id));
    const existingAccountable = (await tx.select().from(pulseStrategyRaci).where(and(eq(pulseStrategyRaci.nodeId, node.id), eq(pulseStrategyRaci.role, "accountable"), eq(pulseStrategyRaci.isActive, true))).limit(1))[0];
    if (existingAccountable) await tx.update(pulseStrategyRaci).set({ personId: input.accountablePersonId, assignedByPersonId: actorPersonId }).where(eq(pulseStrategyRaci.id, existingAccountable.id));
    else await tx.insert(pulseStrategyRaci).values({ nodeId: node.id, personId: input.accountablePersonId, role: "accountable", isActive: true, assignedByPersonId: actorPersonId });
    await tx.update(pulseStrategyRaci).set({ isActive: false }).where(and(eq(pulseStrategyRaci.nodeId, node.id), eq(pulseStrategyRaci.role, "responsible")));
    if (input.responsiblePersonId) await tx.insert(pulseStrategyRaci).values({ nodeId: node.id, personId: input.responsiblePersonId, role: "responsible", isActive: true, assignedByPersonId: actorPersonId }).onDuplicateKeyUpdate({ set: { isActive: true, assignedByPersonId: actorPersonId } });
    await appendPulseEvent(tx, { eventType: "strategy_raci_updated", scopeId: placement.scopeId, actorPersonId, payload: { nodeId: node.id, accountablePersonId: input.accountablePersonId } });
  });
}

export async function getScopeStrategy(db: PulsePolicyDb, actor: PulseActor, scopeId: number, filters: { nodeType?: StrategyNodeType; status?: StrategyStatus } = {}) {
  const view = await canView(db, scopeId, actor);
  if (!view.allowed) throw new Error("Strategy is unavailable in this active Scope.");
  const placements = await db.select({ node: pulseStrategyNodes, placement: pulseStrategyScopePlacements, ownerName: pulsePeople.displayName })
    .from(pulseStrategyScopePlacements).innerJoin(pulseStrategyNodes, eq(pulseStrategyScopePlacements.nodeId, pulseStrategyNodes.id)).leftJoin(pulsePeople, eq(pulseStrategyNodes.responsiblePersonId, pulsePeople.id))
    .where(and(eq(pulseStrategyScopePlacements.scopeId, scopeId), eq(pulseStrategyScopePlacements.isVisible, true))).orderBy(asc(pulseStrategyNodes.sortOrder), asc(pulseStrategyNodes.title));
  // Filter canonical base fields before grouping; Scope presentation never alters node.status.
  const filtered = placements.filter((row: any) => (!filters.nodeType || row.node.nodeType === filters.nodeType) && (!filters.status || row.node.status === filters.status));
  const groups = new Map<string, { owner: { personId: number | null; name: string }; rocks: any[] }>();
  for (const row of filtered) {
    if (row.node.nodeType !== "quarterly_rock") continue;
    const key = row.node.responsiblePersonId ? `person:${row.node.responsiblePersonId}` : "unassigned";
    if (!groups.has(key)) groups.set(key, { owner: { personId: row.node.responsiblePersonId ?? null, name: row.ownerName ?? "Unassigned" }, rocks: [] });
    groups.get(key)!.rocks.push({ ...row.node, presentationStatus: row.placement.presentationStatus, displayedOwner: row.ownerName ?? "Unassigned" });
  }
  return { nodes: filtered.map((row: any) => ({ ...row.node, presentationStatus: row.placement.presentationStatus, displayedOwner: row.ownerName ?? "Unassigned" })), rockGroups: Array.from(groups.values()).sort((a, b) => a.owner.name.localeCompare(b.owner.name)) };
}

// VTO is a planning projection over the same Strategy nodes; it is deliberately not a separate structure.
export const getVto = getScopeStrategy;
