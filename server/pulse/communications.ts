import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { Resend } from "resend";
import { ENV } from "../_core/env";
import {
  pulseCommunicationAcknowledgments,
  pulseCommunicationRecipientLedger,
  pulseCommunicationTargets,
  pulseCommunications,
  pulseDomainEvents,
  pulseNotificationDeliveries,
  pulseNotificationIntents,
  pulsePeople,
  pulsePersonAccounts,
  pulseScopeMemberships,
  pulseScopes,
  users,
} from "../../drizzle/schema";
import { appendPulseEvent } from "./events";
import { canCreate, canView, getActiveScope, getPersonForAccount, type PulseActor, type PulsePolicyDb } from "./policy";

type CommunicationType = "cascade" | "announcement";
type CommunicationChannel = "in_app" | "email" | "slack";
type DeliveryOutcome = "delivered" | "suppressed" | "skipped" | "failed";

async function requireActorPerson(db: PulsePolicyDb, actor: PulseActor) {
  const personId = await getPersonForAccount(db, actor.userId);
  if (!personId) throw new Error("Authenticated account is not linked to an active Pulse person.");
  return personId;
}

async function canComposeInScope(db: PulsePolicyDb, scopeId: number, actor: PulseActor) {
  const decision = await canCreate(db, "communication", scopeId, actor);
  if (!decision.allowed) throw new Error("You cannot create communication in this active Scope.");
}

/** Recipients are frozen from the selected target Scope membership policy at publication, never inferred later. */
async function targetRecipients(db: PulsePolicyDb, targetScopeId: number) {
  const scope = await getActiveScope(db, targetScopeId);
  if (!scope) throw new Error("A target Scope is archived or unavailable.");
  if (scope.membershipPolicy === "owner_only") return scope.ownerPersonId ? [scope.ownerPersonId] : [];
  if (scope.membershipPolicy === "active_accounts") {
    const rows = await db.select({ personId: pulsePersonAccounts.personId })
      .from(pulsePersonAccounts).innerJoin(users, eq(pulsePersonAccounts.userId, users.id))
      .where(and(isNull(pulsePersonAccounts.unlinkedAt), eq(users.personType, "full_user"), eq(users.isActive, true)));
    return Array.from(new Set(rows.map((row: any) => row.personId)));
  }
  const rows = await db.select({ personId: pulseScopeMemberships.personId }).from(pulseScopeMemberships)
    .where(and(eq(pulseScopeMemberships.scopeId, targetScopeId), eq(pulseScopeMemberships.isActive, true)));
  return Array.from(new Set(rows.map((row: any) => row.personId)));
}

async function accountForPerson(db: PulsePolicyDb, personId: number) {
  const rows = await db.select({ userId: pulsePersonAccounts.userId, personType: users.personType, isActive: users.isActive, email: users.email, personEmail: pulsePeople.primaryEmail, displayName: pulsePeople.displayName })
    .from(pulsePersonAccounts).innerJoin(users, eq(pulsePersonAccounts.userId, users.id)).innerJoin(pulsePeople, eq(pulsePersonAccounts.personId, pulsePeople.id))
    .where(and(eq(pulsePersonAccounts.personId, personId), isNull(pulsePersonAccounts.unlinkedAt))).limit(1);
  return rows[0] ?? null;
}

/**
 * The sole notification eligibility evaluator. It checks object access before composing and again
 * before delivery. Role is never consulted; active Scope membership and archive state decide.
 */
export async function evaluatePulseNotificationPolicy(db: PulsePolicyDb, input: { communicationId: number; recipientPersonId: number; targetScopeIds: number[] }) {
  const account = await accountForPerson(db, input.recipientPersonId);
  if (!account || account.personType !== "full_user" || !account.isActive) return { allowed: false, reason: "Recipient has no active authenticated account", account: null } as const;
  for (const scopeId of input.targetScopeIds) {
    const decision = await canView(db, scopeId, { userId: account.userId });
    if (decision.allowed) return { allowed: true, reason: null, account } as const;
  }
  return { allowed: false, reason: "Recipient cannot currently open any frozen target Scope", account } as const;
}

function renderCommunication(communication: any) {
  // Called only after evaluatePulseNotificationPolicy reports allowed. Keep content composition here.
  return { subject: communication.title, text: `${communication.title}\n\n${communication.body}`, html: `<h2>${escapeHtml(communication.title)}</h2><p>${escapeHtml(communication.body).replace(/\n/g, "<br/>")}</p>` };
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character)); }

export async function createCommunication(db: PulsePolicyDb, actor: PulseActor, input: { communicationType: CommunicationType; sourceScopeId: number; title: string; body: string; targetScopeIds: number[] }) {
  const actorPersonId = await requireActorPerson(db, actor);
  await canComposeInScope(db, input.sourceScopeId, actor);
  const targets = Array.from(new Set(input.targetScopeIds));
  if (!targets.length) throw new Error("Select at least one explicit target Scope.");
  for (const targetScopeId of targets) if (!await getActiveScope(db, targetScopeId)) throw new Error("Every target Scope must be active before publication.");
  return db.transaction(async (tx: any) => {
    const [result] = await tx.insert(pulseCommunications).values({ communicationType: input.communicationType, sourceScopeId: input.sourceScopeId, title: input.title.trim(), body: input.body.trim(), status: "draft", createdByPersonId: actorPersonId });
    const communicationId = Number((result as any).insertId);
    for (const targetScopeId of targets) await tx.insert(pulseCommunicationTargets).values({ communicationId, targetScopeId });
    await appendPulseEvent(tx, { eventType: "communication_created", scopeId: input.sourceScopeId, actorPersonId, payload: { communicationId, communicationType: input.communicationType, sourceScopeId: input.sourceScopeId } });
    return communicationId;
  });
}

/** Publishing freezes recipients and creates intents. It never calls a transport. */
export async function publishCommunication(db: PulsePolicyDb, actor: PulseActor, input: { communicationId: number; channels?: CommunicationChannel[]; scheduledFor?: Date }) {
  const actorPersonId = await requireActorPerson(db, actor);
  const communication = (await db.select().from(pulseCommunications).where(eq(pulseCommunications.id, input.communicationId)).limit(1))[0];
  if (!communication || communication.status !== "draft") throw new Error("Only a draft communication can be published.");
  await canComposeInScope(db, communication.sourceScopeId, actor);
  const targets = await db.select({ scopeId: pulseCommunicationTargets.targetScopeId }).from(pulseCommunicationTargets).where(eq(pulseCommunicationTargets.communicationId, communication.id));
  if (!targets.length) throw new Error("Communication has no explicit targets.");
  const recipients = new Map<number, number[]>();
  for (const target of targets) for (const personId of await targetRecipients(db, target.scopeId)) recipients.set(personId, [...(recipients.get(personId) ?? []), target.scopeId]);
  if (!recipients.size) throw new Error("No active recipients are present in the selected target Scopes.");
  const channels = Array.from(new Set(input.channels?.length ? input.channels : ["in_app", "email", "slack"])) as CommunicationChannel[];
  return db.transaction(async (tx: any) => {
    await tx.update(pulseCommunications).set({ status: "published", publishedAt: new Date() }).where(eq(pulseCommunications.id, communication.id));
    let count = 0;
    const recipientEntries = Array.from(recipients.entries());
    for (let index = 0; index < recipientEntries.length; index += 1) {
      const recipientPersonId = recipientEntries[index][0];
      const targetScopeIds = recipientEntries[index][1];
      const [ledgerResult] = await tx.insert(pulseCommunicationRecipientLedger).values({ communicationId: communication.id, recipientPersonId, targetScopeIds: Array.from(new Set(targetScopeIds)) });
      const ledgerId = Number((ledgerResult as any).insertId);
      const [intentResult] = await tx.insert(pulseNotificationIntents).values({ communicationId: communication.id, recipientLedgerId: ledgerId, recipientPersonId, requestedChannels: channels, scheduledFor: input.scheduledFor ?? new Date(), status: "pending" });
      const intentId = Number((intentResult as any).insertId);
      await appendPulseEvent(tx, { eventType: "notification_intent_created", scopeId: communication.sourceScopeId, actorPersonId, payload: { communicationId: communication.id, recipientPersonId, intentId } });
      count += 1;
    }
    await appendPulseEvent(tx, { eventType: "communication_published", scopeId: communication.sourceScopeId, actorPersonId, payload: { communicationId: communication.id, recipientCount: count } });
    return { recipientCount: count, channels };
  });
}

async function recordDelivery(db: PulsePolicyDb, input: { intentId: number; communicationId: number; recipientPersonId: number; channel: CommunicationChannel; outcome: DeliveryOutcome; reason?: string | null; providerMessageId?: string | null }) {
  const deduplicationKey = `pulse-communication:${input.communicationId}:intent:${input.intentId}:recipient:${input.recipientPersonId}:channel:${input.channel}`;
  const existing = await db.select({ id: pulseNotificationDeliveries.id }).from(pulseNotificationDeliveries).where(eq(pulseNotificationDeliveries.deduplicationKey, deduplicationKey)).limit(1);
  if (existing[0]) return { created: false, deliveryId: existing[0].id };
  const [result] = await db.insert(pulseNotificationDeliveries).values({ ...input, deduplicationKey, reason: input.reason ?? null, providerMessageId: input.providerMessageId ?? null, completedAt: new Date() });
  return { created: true, deliveryId: Number((result as any).insertId) };
}

async function deliverChannel(channel: CommunicationChannel, account: any, content: ReturnType<typeof renderCommunication>, deduplicationKey: string, dryRun: boolean): Promise<{ outcome: DeliveryOutcome; reason?: string; providerMessageId?: string }> {
  if (channel === "in_app") return { outcome: "delivered" };
  if (channel === "slack") return { outcome: "skipped", reason: "Slack delivery adapter is not configured" };
  const email = account.personEmail || account.email;
  if (!email) return { outcome: "skipped", reason: "Recipient has no email address" };
  if (dryRun) return { outcome: "delivered", reason: "Dry-run email delivery" };
  if (!ENV.resendApiKey) return { outcome: "skipped", reason: "Email transport is not configured" };
  try {
    const resend = new Resend(ENV.resendApiKey);
    const result = await resend.emails.send({ from: "Savvy STR Agents <notifications@savvy-agents.com>", to: email, subject: content.subject, html: content.html }, { idempotencyKey: deduplicationKey });
    if (result.error) return { outcome: "failed", reason: result.error.message };
    return { outcome: "delivered", providerMessageId: result.data?.id };
  } catch (error) { return { outcome: "failed", reason: error instanceof Error ? error.message : String(error) }; }
}

/** The only batched delivery boundary. No feature mutation calls this worker or a transport. */
export async function processPulseCommunicationDeliveryBatch(db: PulsePolicyDb, input: { limit?: number; dryRun?: boolean } = {}) {
  const now = new Date(); const limit = input.limit ?? 100; const dryRun = input.dryRun ?? false;
  const intents = await db.select({ intent: pulseNotificationIntents, communication: pulseCommunications, ledger: pulseCommunicationRecipientLedger })
    .from(pulseNotificationIntents).innerJoin(pulseCommunications, eq(pulseNotificationIntents.communicationId, pulseCommunications.id)).innerJoin(pulseCommunicationRecipientLedger, eq(pulseNotificationIntents.recipientLedgerId, pulseCommunicationRecipientLedger.id))
    .where(and(eq(pulseNotificationIntents.status, "pending"), lte(pulseNotificationIntents.scheduledFor, now), eq(pulseCommunications.status, "published"))).orderBy(asc(pulseNotificationIntents.scheduledFor)).limit(limit);
  const summary = { processed: 0, delivered: 0, suppressed: 0, skipped: 0, failed: 0 };
  for (const row of intents as any[]) {
    const decision = await evaluatePulseNotificationPolicy(db, { communicationId: row.communication.id, recipientPersonId: row.intent.recipientPersonId, targetScopeIds: row.ledger.targetScopeIds as number[] });
    const channels = row.intent.requestedChannels as CommunicationChannel[];
    if (!decision.allowed) {
      for (const channel of channels) await recordDelivery(db, { intentId: row.intent.id, communicationId: row.communication.id, recipientPersonId: row.intent.recipientPersonId, channel, outcome: "suppressed", reason: decision.reason });
      await db.update(pulseNotificationIntents).set({ status: "suppressed", evaluatedAt: now }).where(eq(pulseNotificationIntents.id, row.intent.id));
      await appendPulseEvent(db, { eventType: "notification_suppressed", scopeId: row.communication.sourceScopeId, actorPersonId: null, payload: { communicationId: row.communication.id, recipientPersonId: row.intent.recipientPersonId, reason: decision.reason } });
      summary.processed += 1; summary.suppressed += 1; continue;
    }
    // Object access was allowed; only now is content composed for channels.
    const content = renderCommunication(row.communication);
    let hadDelivered = false;
    for (const channel of channels) {
      const key = `pulse-communication:${row.communication.id}:intent:${row.intent.id}:recipient:${row.intent.recipientPersonId}:channel:${channel}`;
      const result = await deliverChannel(channel, decision.account, content, key, dryRun);
      const delivery = await recordDelivery(db, { intentId: row.intent.id, communicationId: row.communication.id, recipientPersonId: row.intent.recipientPersonId, channel, outcome: result.outcome, reason: result.reason, providerMessageId: result.providerMessageId });
      if (!delivery.created) continue;
      if (result.outcome === "delivered") { hadDelivered = true; summary.delivered += 1; await appendPulseEvent(db, { eventType: "notification_delivered", scopeId: row.communication.sourceScopeId, actorPersonId: null, payload: { communicationId: row.communication.id, recipientPersonId: row.intent.recipientPersonId, channel } }); }
      else if (result.outcome === "skipped") summary.skipped += 1; else if (result.outcome === "failed") summary.failed += 1;
    }
    await db.update(pulseNotificationIntents).set({ status: hadDelivered ? "delivered" : "evaluated", evaluatedAt: now }).where(eq(pulseNotificationIntents.id, row.intent.id));
    summary.processed += 1;
  }
  return summary;
}

async function recipientLedgerForActor(db: PulsePolicyDb, communicationId: number, actor: PulseActor) {
  const personId = await requireActorPerson(db, actor);
  const ledger = (await db.select().from(pulseCommunicationRecipientLedger).where(and(eq(pulseCommunicationRecipientLedger.communicationId, communicationId), eq(pulseCommunicationRecipientLedger.recipientPersonId, personId))).limit(1))[0];
  if (!ledger) throw new Error("You are not in this communication's frozen recipient ledger.");
  const decision = await evaluatePulseNotificationPolicy(db, { communicationId, recipientPersonId: personId, targetScopeIds: ledger.targetScopeIds as number[] });
  if (!decision.allowed) throw new Error("This communication is no longer accessible under current Scope policy.");
  return { personId, ledger };
}

/** User-facing display reads only their frozen ledger entries; it never expands target Scope memberships. */
export async function listMyCommunications(db: PulsePolicyDb, actor: PulseActor) {
  const personId = await requireActorPerson(db, actor);
  const rows = await db.select({ communication: pulseCommunications, ledger: pulseCommunicationRecipientLedger, acknowledgment: pulseCommunicationAcknowledgments })
    .from(pulseCommunicationRecipientLedger).innerJoin(pulseCommunications, eq(pulseCommunicationRecipientLedger.communicationId, pulseCommunications.id)).leftJoin(pulseCommunicationAcknowledgments, and(eq(pulseCommunicationAcknowledgments.communicationId, pulseCommunicationRecipientLedger.communicationId), eq(pulseCommunicationAcknowledgments.recipientPersonId, personId)))
    .where(and(eq(pulseCommunicationRecipientLedger.recipientPersonId, personId), eq(pulseCommunications.status, "published"))).orderBy(asc(pulseCommunications.publishedAt));
  const visible: any[] = [];
  for (const row of rows as any[]) {
    const decision = await evaluatePulseNotificationPolicy(db, { communicationId: row.communication.id, recipientPersonId: personId, targetScopeIds: row.ledger.targetScopeIds as number[] });
    if (!decision.allowed) continue;
    visible.push({ ...row.communication, ledgerId: row.ledger.id, targetScopeIds: row.ledger.targetScopeIds, acknowledgedAt: row.acknowledgment?.acknowledgedAt ?? null });
  }
  return visible;
}

/** Publisher/admin audience report also reads only frozen ledger rows, making audience equality inspectable. */
export async function getCommunicationAudience(db: PulsePolicyDb, actor: PulseActor, communicationId: number) {
  const communication = (await db.select().from(pulseCommunications).where(eq(pulseCommunications.id, communicationId)).limit(1))[0];
  if (!communication) throw new Error("Communication not found.");
  await canComposeInScope(db, communication.sourceScopeId, actor);
  const audience = await db.select({ ledgerId: pulseCommunicationRecipientLedger.id, recipientPersonId: pulseCommunicationRecipientLedger.recipientPersonId, targetScopeIds: pulseCommunicationRecipientLedger.targetScopeIds, displayName: pulsePeople.displayName })
    .from(pulseCommunicationRecipientLedger).innerJoin(pulsePeople, eq(pulseCommunicationRecipientLedger.recipientPersonId, pulsePeople.id)).where(eq(pulseCommunicationRecipientLedger.communicationId, communicationId));
  const deliveryAudience = await db.select({ recipientPersonId: pulseNotificationDeliveries.recipientPersonId }).from(pulseNotificationDeliveries).where(eq(pulseNotificationDeliveries.communicationId, communicationId));
  const deliveryRecipientIds: number[] = Array.from(new Set<number>(deliveryAudience.map((row: any) => Number(row.recipientPersonId))));
  return { communicationId, frozenAudience: audience, deliveryAudience: deliveryRecipientIds.sort((a, b) => a - b) };
}

export async function acknowledgeCommunication(db: PulsePolicyDb, actor: PulseActor, communicationId: number) {
  const { personId } = await recipientLedgerForActor(db, communicationId, actor);
  const existing = await db.select({ id: pulseCommunicationAcknowledgments.id }).from(pulseCommunicationAcknowledgments).where(and(eq(pulseCommunicationAcknowledgments.communicationId, communicationId), eq(pulseCommunicationAcknowledgments.recipientPersonId, personId))).limit(1);
  if (existing[0]) return { acknowledged: true, alreadyAcknowledged: true };
  await db.insert(pulseCommunicationAcknowledgments).values({ communicationId, recipientPersonId: personId });
  const communication = (await db.select({ sourceScopeId: pulseCommunications.sourceScopeId }).from(pulseCommunications).where(eq(pulseCommunications.id, communicationId)).limit(1))[0];
  await appendPulseEvent(db, { eventType: "communication_acknowledged", scopeId: communication?.sourceScopeId ?? null, actorPersonId: personId, payload: { communicationId, recipientPersonId: personId } });
  return { acknowledged: true, alreadyAcknowledged: false };
}
