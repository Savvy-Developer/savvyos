import { and, eq, isNull } from "drizzle-orm";
import { pulsePeople, pulsePersonAccounts, pulseScopeMemberships, pulseScopes, pulseWorkItemPlacements, pulseWorkItems, users } from "../../drizzle/schema";

/** Shared query surface for both the root Drizzle client and transaction callbacks. */
export type PulsePolicyDb = any;
export type PulseActor = { userId: number };
export type ScopeBoundItem = { primaryScopeId: number; assigneePersonId?: number | null };
export type ScopeBoundNotification = { scopeId: number; recipientPersonId: number };
export type WorkItemDecision = ScopeDecision & { accessScopeId?: number; viaPlacement?: boolean };

export type ScopeDecision = {
  allowed: boolean;
  reason: "scope_inactive" | "no_person" | "no_membership" | "owner_required" | "not_l10" | "recipient_unavailable" | "allowed";
};

/**
 * Resolves an authenticated SavvyOS account to its explicit Pulse person. It does not infer a
 * person from an email, credential, user type, or missing field.
 */
export async function getPersonForAccount(db: PulsePolicyDb, userId: number) {
  const rows = await db
    .select({ personId: pulsePeople.id, personActive: pulsePeople.isActive, accountActive: users.isActive })
    .from(pulsePersonAccounts)
    .innerJoin(pulsePeople, eq(pulsePersonAccounts.personId, pulsePeople.id))
    .innerJoin(users, eq(pulsePersonAccounts.userId, users.id))
    .where(and(eq(pulsePersonAccounts.userId, userId), isNull(pulsePersonAccounts.unlinkedAt)))
    .limit(1);
  return rows[0]?.personActive && rows[0]?.accountActive ? rows[0].personId as number : null;
}

/** Archive state is intentionally read first, before policy, membership, or role evaluation. */
export async function getActiveScope(db: PulsePolicyDb, scopeId: number) {
  const rows = await db.select().from(pulseScopes).where(and(eq(pulseScopes.id, scopeId), eq(pulseScopes.isActive, true))).limit(1);
  return rows[0] ?? null;
}

async function hasActiveMembership(db: PulsePolicyDb, scopeId: number, personId: number) {
  const rows = await db
    .select({ membershipRole: pulseScopeMemberships.membershipRole })
    .from(pulseScopeMemberships)
    .where(and(
      eq(pulseScopeMemberships.scopeId, scopeId),
      eq(pulseScopeMemberships.personId, personId),
      eq(pulseScopeMemberships.isActive, true),
    ))
    .limit(1);
  return rows[0]?.membershipRole as "owner" | "manager" | "member" | "viewer" | undefined;
}

async function resolveViewDecision(db: PulsePolicyDb, scopeId: number, actor: PulseActor): Promise<ScopeDecision & { personId?: number; scope?: any; role?: string }> {
  const scope = await getActiveScope(db, scopeId);
  if (!scope) return { allowed: false, reason: "scope_inactive" };

  const personId = await getPersonForAccount(db, actor.userId);
  if (!personId) return { allowed: false, reason: "no_person" };

  if (scope.accessPolicy === "owner_only") {
    return scope.ownerPersonId === personId
      ? { allowed: true, reason: "allowed", personId, scope, role: "owner" }
      : { allowed: false, reason: "owner_required", personId, scope };
  }

  if (scope.membershipPolicy === "active_accounts" && scope.accessPolicy === "members") {
    return { allowed: true, reason: "allowed", personId, scope, role: "member" };
  }

  const role = await hasActiveMembership(db, scope.id, personId);
  return role
    ? { allowed: true, reason: "allowed", personId, scope, role }
    : { allowed: false, reason: "no_membership", personId, scope };
}

/** Named policy question: may this authenticated account currently view this active scope? */
export async function canView(db: PulsePolicyDb, scopeId: number, actor: PulseActor): Promise<ScopeDecision> {
  const decision = await resolveViewDecision(db, scopeId, actor);
  return { allowed: decision.allowed, reason: decision.reason };
}

/**
 * Canonical work-item decision. The item's primary Scope is evaluated first, then each active
 * normalized placement. Each candidate delegates to canView, preserving archive-first semantics.
 */
export async function canViewWorkItem(db: PulsePolicyDb, itemId: number, actor: PulseActor): Promise<WorkItemDecision> {
  const item = await db.select({ primaryScopeId: pulseWorkItems.primaryScopeId }).from(pulseWorkItems).where(eq(pulseWorkItems.id, itemId)).limit(1);
  if (!item[0]) return { allowed: false, reason: "no_membership" };
  const primary = await canView(db, item[0].primaryScopeId, actor);
  if (primary.allowed) return { ...primary, accessScopeId: item[0].primaryScopeId, viaPlacement: false };
  const placements = await db.select({ scopeId: pulseWorkItemPlacements.scopeId }).from(pulseWorkItemPlacements).where(and(eq(pulseWorkItemPlacements.itemId, itemId), eq(pulseWorkItemPlacements.isActive, true)));
  for (const placement of placements) {
    const decision = await canView(db, placement.scopeId, actor);
    if (decision.allowed) return { ...decision, accessScopeId: placement.scopeId, viaPlacement: true };
  }
  return primary;
}

/**
 * Query contract for all scope lists. It begins with active scopes, then delegates every
 * candidate to the same canView logic used by direct reads. UI pages do not filter scopes.
 */
export async function visibleScopes(db: PulsePolicyDb, actor: PulseActor) {
  const activeScopes = await db.select().from(pulseScopes).where(eq(pulseScopes.isActive, true));
  const visible: any[] = [];
  for (const scope of activeScopes) {
    const decision = await canView(db, scope.id, actor);
    if (decision.allowed) visible.push(scope);
  }
  return visible.sort((a, b) => `${a.scopeType}:${a.name}`.localeCompare(`${b.scopeType}:${b.name}`));
}

/** Named policy question for canonical item mutations. Work objects will call this service directly. */
export async function canCreate(db: PulsePolicyDb, _itemType: string, scopeId: number, actor: PulseActor): Promise<ScopeDecision> {
  const decision = await resolveViewDecision(db, scopeId, actor);
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  // Owner-only scopes already require owner. For other active scopes, manager/owner govern creation.
  return ["owner", "manager"].includes(decision.role ?? "")
    ? { allowed: true, reason: "allowed" }
    : { allowed: false, reason: "no_membership" };
}

/** Named policy question for assignments; actor authority and recipient visibility share the same scope rule. */
export async function canAssign(db: PulsePolicyDb, item: ScopeBoundItem, recipientPersonId: number, actor: PulseActor): Promise<ScopeDecision> {
  const creator = await canCreate(db, "work_item", item.primaryScopeId, actor);
  if (!creator.allowed) return creator;
  const scope = await getActiveScope(db, item.primaryScopeId);
  if (!scope) return { allowed: false, reason: "scope_inactive" };
  if (scope.accessPolicy === "owner_only") {
    return scope.ownerPersonId === recipientPersonId
      ? { allowed: true, reason: "allowed" }
      : { allowed: false, reason: "recipient_unavailable" };
  }
  if (scope.membershipPolicy === "active_accounts" && scope.accessPolicy === "members") {
    const person = await db.select({ id: pulsePeople.id }).from(pulsePeople).where(and(eq(pulsePeople.id, recipientPersonId), eq(pulsePeople.isActive, true))).limit(1);
    return person[0] ? { allowed: true, reason: "allowed" } : { allowed: false, reason: "recipient_unavailable" };
  }
  const role = await hasActiveMembership(db, scope.id, recipientPersonId);
  return role ? { allowed: true, reason: "allowed" } : { allowed: false, reason: "recipient_unavailable" };
}

/** Named policy question for IDS voting; meeting/session provenance never replaces current scope access. */
export async function canVote(db: PulsePolicyDb, issue: ScopeBoundItem, _sessionId: number, actor: PulseActor): Promise<ScopeDecision> {
  return canView(db, issue.primaryScopeId, actor);
}

/** Named policy question for L10 configuration and session management. */
export async function canManageMeeting(db: PulsePolicyDb, scopeId: number, actor: PulseActor): Promise<ScopeDecision> {
  const decision = await resolveViewDecision(db, scopeId, actor);
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  if (!["l10", "one_on_one"].includes(decision.scope?.scopeType ?? "")) return { allowed: false, reason: "not_l10" };
  return ["owner", "manager"].includes(decision.role ?? "")
    ? { allowed: true, reason: "allowed" }
    : { allowed: false, reason: "no_membership" };
}

/** Named policy question for delivery workers. Delivery is scope access evaluated before composition and delivery. */
export async function canDeliver(db: PulsePolicyDb, notification: ScopeBoundNotification, actor: PulseActor): Promise<ScopeDecision> {
  const decision = await resolveViewDecision(db, notification.scopeId, actor);
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  const scope = await getActiveScope(db, notification.scopeId);
  if (!scope) return { allowed: false, reason: "scope_inactive" };
  if (scope.accessPolicy === "owner_only") {
    return scope.ownerPersonId === notification.recipientPersonId
      ? { allowed: true, reason: "allowed" }
      : { allowed: false, reason: "recipient_unavailable" };
  }
  if (scope.membershipPolicy === "active_accounts" && scope.accessPolicy === "members") return { allowed: true, reason: "allowed" };
  const recipientRole = await hasActiveMembership(db, scope.id, notification.recipientPersonId);
  return recipientRole ? { allowed: true, reason: "allowed" } : { allowed: false, reason: "recipient_unavailable" };
}
