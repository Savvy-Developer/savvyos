/**
 * Smart Plan Scheduler
 * Called on a cron interval to process due enrollment steps.
 * Dispatches email (Resend) or SMS (Aircall) for each due step.
 */

import { getDb } from "./db";
import {
  smartPlanEnrollments,
  smartPlanSteps,
  smartPlanExecutions,
  smartPlans,
  contacts,
  users,
  leadSources,
  transactions,
  listings,
  oneTimeSends,
  oneTimeSendRecipients,
  aircallIntegrationState,
} from "../drizzle/schema";
import { and, eq, gte, inArray, lte, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { sendSmartPlanEmail } from "./_core/smartPlanEmail";
import { sendAircallSMS } from "./_core/aircall";
import { renderMergeTags } from "./_core/smartPlanMergeTags";
import { persistOutboundAircallSend } from "./aircallMessaging";
import { refreshOneTimeSendMetrics } from "./oneTimeSendTracking";
import { extractOfferSheetReferralPropertyAddress, OFFER_SHEET_REFERRAL_SOURCE_NAME } from "./smartPlanPropertyContext";
import {
  isValidSmartPlanSendWindow,
  isWithinSmartPlanSendWindow,
  LEGACY_BUSINESS_HOURS_WINDOW,
  nextSmartPlanSendWindowStart,
  normaliseSmartPlanSendWindow,
} from "./smartPlanScheduling";

let isRunning = false;

const EMAIL_SEND_INTERVAL_MS = 125; // 8/s, below Resend's default 10/s team limit.
const SMS_SEND_INTERVAL_MS = 10_000; // 6/min, keeping under Aircall's 10,000/day US/Canada number limit.
const SMART_PLAN_DUE_BATCH_SIZE = 2; // Up to six distinct contact channels per five-minute scheduler pass.
let nextEmailSendAt = 0;
let nextSmsSendAt = 0;
const SMS_DAILY_SEND_LIMIT = Math.max(1, Number(process.env.SAVVY_SMS_DAILY_LIMIT ?? 1_000));
let smsReservationDate = "";
let smsReservedToday = 0;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function paceProvider(channel: "email" | "sms"): Promise<void> {
  const now = Date.now();
  const nextAt = channel === "email" ? nextEmailSendAt : nextSmsSendAt;
  if (nextAt > now) await pause(nextAt - now);
  const interval = channel === "email" ? EMAIL_SEND_INTERVAL_MS : SMS_SEND_INTERVAL_MS;
  if (channel === "email") nextEmailSendAt = Date.now() + interval;
  else nextSmsSendAt = Date.now() + interval;
}

/** Reserve an SMS slot against a conservative per-day cap before calling Aircall. */
async function reserveSmsCapacity(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<boolean> {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  if (smsReservationDate !== dayKey) {
    const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
    const [oneTime] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(oneTimeSendRecipients)
      .where(and(eq(oneTimeSendRecipients.status, "sent"), gte(oneTimeSendRecipients.sentAt, dayStart)));
    const [smartPlan] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(smartPlanExecutions)
      .where(and(eq(smartPlanExecutions.channel, "sms"), eq(smartPlanExecutions.status, "sent"), gte(smartPlanExecutions.sentAt, dayStart)));
    smsReservationDate = dayKey;
    smsReservedToday = Number(oneTime?.count ?? 0) + Number(smartPlan?.count ?? 0);
  }
  if (smsReservedToday >= SMS_DAILY_SEND_LIMIT) return false;
  smsReservedToday++;
  return true;
}

/** Return distinct deliverable addresses stored on a contact for the selected campaign channel. */
export function contactChannelAddresses(contact: Pick<typeof contacts.$inferSelect, "email" | "secondaryEmail" | "spouseEmail" | "phone" | "secondaryPhone" | "spousePhone">, channel: "email" | "sms"): string[] {
  const candidates = channel === "email"
    ? [contact.email, contact.secondaryEmail, contact.spouseEmail]
    : [contact.phone, contact.secondaryPhone, contact.spousePhone];
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const candidate of candidates) {
    const address = candidate?.trim();
    if (!address) continue;
    const key = channel === "email" ? address.toLowerCase() : address.replace(/\D/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    addresses.push(address);
  }
  return addresses;
}

/** Marketing SMS requires documented consent and honors an explicit opt-out. */
export function smsMarketingEligibility(contact: Pick<typeof contacts.$inferSelect, "smsMarketingConsentAt" | "smsMarketingOptedOutAt">): { eligible: boolean; error?: string } {
  if (contact.smsMarketingOptedOutAt) return { eligible: false, error: "Contact opted out of marketing texts" };
  if (!contact.smsMarketingConsentAt) return { eligible: false, error: "Marketing SMS consent has not been recorded" };
  return { eligible: true };
}

async function marketingSender(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<{ id: number; name: string | null; digits: string | null } | null> {
  const [state] = await db
    .select({
      id: aircallIntegrationState.marketingNumberId,
      name: aircallIntegrationState.marketingNumberName,
      digits: aircallIntegrationState.marketingNumberDigits,
    })
    .from(aircallIntegrationState)
    .where(eq(aircallIntegrationState.id, 1))
    .limit(1);
  return state?.id ? { id: state.id, name: state.name, digits: state.digits } : null;
}

export async function processSmartPlanSteps(): Promise<void> {
  if (isRunning) return; // Prevent overlapping runs
  isRunning = true;

  try {
    const db = await getDb();
    if (!db) return;

    const now = new Date();

    // Find all active enrollments where nextStepAt <= now
    const dueEnrollments = await db
      .select({
        enrollment: smartPlanEnrollments,
        plan: smartPlans,
        contact: contacts,
      })
      .from(smartPlanEnrollments)
      .innerJoin(smartPlans, eq(smartPlanEnrollments.planId, smartPlans.id))
      .innerJoin(contacts, eq(smartPlanEnrollments.contactId, contacts.id))
      .where(
        and(
          eq(smartPlanEnrollments.status, "active"),
          eq(smartPlans.status, "active"),
          isNotNull(smartPlanEnrollments.nextStepAt),
          lte(smartPlanEnrollments.nextStepAt, now)
        )
      )
      .limit(SMART_PLAN_DUE_BATCH_SIZE);

    for (const row of dueEnrollments) {
      await processEnrollmentStep(db, row.enrollment, row.plan, row.contact);
    }
  } catch (err) {
    console.error("[SmartPlanScheduler] Error:", err);
  } finally {
    isRunning = false;
  }
}

async function processEnrollmentStep(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  enrollment: typeof smartPlanEnrollments.$inferSelect,
  plan: typeof smartPlans.$inferSelect,
  contact: typeof contacts.$inferSelect
): Promise<void> {
  // Provider reply processing pauses plans immediately. This query is a durable
  // guard against a provider retry or a transient error between recording a reply
  // and changing enrollment state.
  if (plan.pauseOnReply) {
    const reply = await db
      .select({ id: smartPlanExecutions.id })
      .from(smartPlanExecutions)
      .where(and(
        eq(smartPlanExecutions.enrollmentId, enrollment.id),
        isNotNull(smartPlanExecutions.repliedAt),
      ))
      .limit(1);
    if (reply[0]) {
      await db
        .update(smartPlanEnrollments)
        .set({ status: "paused", nextStepAt: null })
        .where(eq(smartPlanEnrollments.id, enrollment.id));
      return;
    }
  }

  // Get all steps for this plan ordered by stepOrder
  const steps = await db
    .select()
    .from(smartPlanSteps)
    .where(eq(smartPlanSteps.planId, plan.id))
    .orderBy(smartPlanSteps.stepOrder);

  const stepIndex = enrollment.currentStepIndex;
  if (stepIndex >= steps.length) {
    // All steps done — mark enrollment complete
    await db
      .update(smartPlanEnrollments)
      .set({ status: "completed", completedAt: new Date(), nextStepAt: null })
      .where(eq(smartPlanEnrollments.id, enrollment.id));
    return;
  }

  const step = steps[stepIndex];

  // ── Configurable send-window check ────────────────────────────────────────
  // Retain legacy business-hours behavior for any rows awaiting migration.
  const configuredWindow = step.sendWindowEnabled
    ? normaliseSmartPlanSendWindow({
      days: step.sendDays,
      startHour: step.sendStartHour,
      endHour: step.sendEndHour,
      timezone: step.timezone,
    })
    : step.businessHoursOnly
      ? { ...LEGACY_BUSINESS_HOURS_WINDOW, timezone: step.timezone || LEGACY_BUSINESS_HOURS_WINDOW.timezone }
      : null;
  if (configuredWindow && isValidSmartPlanSendWindow(configuredWindow)) {
    if (!isWithinSmartPlanSendWindow(new Date(), configuredWindow)) {
      // Keep the current step untouched; it will run at the opening of the next window.
      const deferredAt = nextSmartPlanSendWindowStart(new Date(), configuredWindow);
      await db
        .update(smartPlanEnrollments)
        .set({ nextStepAt: deferredAt })
        .where(eq(smartPlanEnrollments.id, enrollment.id));
      return;
    }
  }

  // Build merge tag context — simplified, admin-only sends (no agent names)
  const leadSourceRows = contact.leadSourceId
    ? await db.select().from(leadSources).where(eq(leadSources.id, contact.leadSourceId)).limit(1)
    : [];
  const leadSourceName = leadSourceRows[0]?.name ?? null;

  const mergeCtx = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    agentName: null, // Not used — admin-only sends
    leadSource: leadSourceName,
    propertyAddress: plan.propertyAddressFromNotes && leadSourceName === OFFER_SHEET_REFERRAL_SOURCE_NAME
      ? extractOfferSheetReferralPropertyAddress(contact.notes)
      : null,
  };

  const propertyFallbackRequired = plan.propertyAddressFromNotes
    && leadSourceName === OFFER_SHEET_REFERRAL_SOURCE_NAME
    && !mergeCtx.propertyAddress
    && Boolean(plan.propertyAddressFallbackText);
  const bodyTemplate = propertyFallbackRequired
    ? plan.propertyAddressFallbackText!
    : step.body;
  const renderedBody = renderMergeTags(bodyTemplate, mergeCtx);
  const renderedSubject = step.subject ? renderMergeTags(step.subject, mergeCtx) : "";

  let status: "sent" | "failed" | "skipped" = "sent";
  let errorMessage: string | undefined;
  let provider: string | undefined;
  let providerMessageId: string | undefined;
  let replyToken: string | undefined;

  if (contact.doNotContact || contact.isaStatus === "do_not_contact") {
    status = "skipped";
    errorMessage = "Contact is marked Do Not Contact";
  } else if (step.channel === "email") {
    const addresses = contactChannelAddresses(contact, "email");
    if (!addresses.length) {
      status = "skipped";
      errorMessage = "Contact has no email address";
    } else if (contact.emailStatus === "bounced") {
      status = "skipped";
      errorMessage = "Contact email has hard bounced — suppressed";
    } else if (contact.emailStatus === "unsubscribed") {
      status = "skipped";
      errorMessage = "Contact has unsubscribed from marketing emails";
    } else {
      provider = "resend";
      const replyDomain = process.env.SMART_PLAN_REPLY_DOMAIN?.trim();
      replyToken = replyDomain ? `sp-${nanoid(20)}` : undefined;
      let sent = 0;
      const failures: string[] = [];
      for (const address of addresses) {
        await paceProvider("email");
        const result = await sendSmartPlanEmail({
          to: address,
          subject: renderedSubject || plan.name,
          body: renderedBody,
          isHtml: true,
          replyTo: replyToken && replyDomain ? `${replyToken}@${replyDomain}` : undefined,
        });
        if (result.success) {
          sent++;
          providerMessageId = result.messageId ?? providerMessageId;
        } else failures.push(`${address}: ${result.error ?? "send failed"}`);
      }
      status = sent > 0 ? "sent" : "failed";
      errorMessage = failures.length ? failures.join("; ") : undefined;
    }
  } else if (step.channel === "sms") {
    const eligibility = smsMarketingEligibility(contact);
    const sender = await marketingSender(db);
    const addresses = contactChannelAddresses(contact, "sms");
    if (!eligibility.eligible) {
      status = "skipped";
      errorMessage = eligibility.error;
    } else if (!sender) {
      status = "failed";
      errorMessage = "A dedicated Aircall marketing number has not been selected";
    } else if (!addresses.length) {
      status = "skipped";
      errorMessage = "Contact has no phone number";
    } else {
      provider = "aircall";
      let sent = 0;
      const failures: string[] = [];
      for (const address of addresses) {
        if (!(await reserveSmsCapacity(db))) {
          failures.push(`${address}: daily SMS campaign limit reached`);
          continue;
        }
        await paceProvider("sms");
        const result = await sendAircallSMS(address, renderedBody, sender.id);
        if (result.success) {
          sent++;
          providerMessageId = result.messageId ?? providerMessageId;
          if (result.messageId) {
            await persistOutboundAircallSend({
              messageId: result.messageId,
              body: renderedBody,
              destination: address.startsWith("+") ? address : `+1${address.replace(/\D/g, "")}`,
              aircallNumberId: sender.id,
              aircallNumberName: sender.name,
              aircallNumberDigits: sender.digits,
              responseMessage: result.message,
              contactId: contact.id,
            });
          }
        } else failures.push(`${address}: ${result.error ?? "send failed"}`);
      }
      status = sent > 0 ? "sent" : "failed";
      errorMessage = failures.length ? failures.join("; ") : undefined;
    }
  }

  // Persist the provider response immediately; Resend webhooks later enrich this
  // execution with delivered, opened, click, bounce, complaint, and reply signals.
  await db.insert(smartPlanExecutions).values({
    enrollmentId: enrollment.id,
    stepId: step.id,
    channel: step.channel,
    provider: provider ?? null,
    providerMessageId: providerMessageId ?? null,
    replyToken: replyToken ?? null,
    sentAt: new Date(),
    status,
    errorMessage: errorMessage ?? null,
  });

  // Advance to next step
  const nextIndex = stepIndex + 1;
  if (nextIndex >= steps.length) {
    // No more steps — complete
    await db
      .update(smartPlanEnrollments)
      .set({ status: "completed", completedAt: new Date(), currentStepIndex: nextIndex, nextStepAt: null })
      .where(eq(smartPlanEnrollments.id, enrollment.id));
  } else {
    // Schedule next step
    const nextStep = steps[nextIndex];
    const nextStepAt = new Date();
    nextStepAt.setDate(nextStepAt.getDate() + nextStep.delayDays);
    nextStepAt.setHours(nextStepAt.getHours() + nextStep.delayHours);

    await db
      .update(smartPlanEnrollments)
      .set({ currentStepIndex: nextIndex, nextStepAt })
      .where(eq(smartPlanEnrollments.id, enrollment.id));
  }
}

export const SMART_PLAN_TRIGGER_TYPES = [
  "lead_source",
  "all_lead_sources",
  "buyer_under_contract",
  "seller_under_contract",
  "new_listing",
  "buyer_closed",
  "seller_closed",
] as const;

export type SmartPlanTriggerType = (typeof SMART_PLAN_TRIGGER_TYPES)[number];

export type TriggerConfiguration = {
  triggerType: SmartPlanTriggerType;
  triggerLeadSourceIds?: number[] | null;
  triggerLeadSourceId?: number | null;
};

function normalizedLeadSourceIds(config: TriggerConfiguration): number[] {
  const ids = [...(config.triggerLeadSourceIds ?? [])];
  if (config.triggerLeadSourceId) ids.push(config.triggerLeadSourceId);
  return Array.from(new Set(ids));
}

function contactIdsForTransaction(
  transaction: Pick<typeof transactions.$inferSelect, "transactionType" | "primaryContactId" | "sellerContactId" | "buyerContactId">,
  triggerType: SmartPlanTriggerType,
): number[] {
  const isBuyerTrigger = triggerType === "buyer_under_contract" || triggerType === "buyer_closed";
  const isSellerTrigger = triggerType === "seller_under_contract" || triggerType === "seller_closed";

  if (isBuyerTrigger) {
    if (transaction.transactionType === "buyer") return [transaction.primaryContactId];
    if (transaction.transactionType === "dual" && transaction.buyerContactId) return [transaction.buyerContactId];
  }
  if (isSellerTrigger) {
    if (transaction.transactionType === "seller") return [transaction.primaryContactId];
    if (transaction.transactionType === "dual") return [transaction.sellerContactId ?? transaction.primaryContactId];
  }
  return [];
}

async function matchingCurrentContactIds(config: TriggerConfiguration): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const triggerType = config.triggerType ?? "lead_source";
  if (triggerType === "all_lead_sources") {
    // Explicit all-source selection for one-time broadcasts and Smart Plan enrollment.
    const rows = await db.select({ id: contacts.id }).from(contacts);
    return rows.map((row) => row.id);
  }

  if (triggerType === "lead_source") {
    const sourceIds = normalizedLeadSourceIds(config);
    if (!sourceIds.length) return [];
    const rows = await db.select({ id: contacts.id }).from(contacts).where(inArray(contacts.leadSourceId, sourceIds));
    return rows.map((row) => row.id);
  }

  if (triggerType === "new_listing") {
    const rows = await db.select({ contactId: listings.contactId }).from(listings);
    return rows.flatMap((row) => row.contactId ? [row.contactId] : []);
  }

  const status = triggerType.endsWith("_closed") ? "closed" : "under_contract";
  const rows = await db
    .select({
      transactionType: transactions.transactionType,
      primaryContactId: transactions.primaryContactId,
      sellerContactId: transactions.sellerContactId,
      buyerContactId: transactions.buyerContactId,
    })
    .from(transactions)
    .where(eq(transactions.status, status));
  return rows.flatMap((transaction) => contactIdsForTransaction(transaction, triggerType));
}

async function matchingUnenrolledContactIds(planId: number, config: TriggerConfiguration): Promise<number[]> {
  const matchingIds = Array.from(new Set(await matchingCurrentContactIds(config)));
  if (!matchingIds.length) return [];

  const db = await getDb();
  if (!db) return [];
  const existingEnrollments = await db
    .select({ contactId: smartPlanEnrollments.contactId })
    .from(smartPlanEnrollments)
    .where(eq(smartPlanEnrollments.planId, planId));
  const enrolledIds = new Set(existingEnrollments.map((row) => row.contactId));
  return matchingIds.filter((contactId) => !enrolledIds.has(contactId));
}

/**
 * Enroll a contact in a Smart Plan exactly once. Returns whether an enrollment was created.
 */
export async function enrollContactInPlan(contactId: number, planId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const existing = await db
    .select({ id: smartPlanEnrollments.id })
    .from(smartPlanEnrollments)
    .where(and(eq(smartPlanEnrollments.contactId, contactId), eq(smartPlanEnrollments.planId, planId)))
    .limit(1);
  if (existing.length > 0) return false;

  const firstSteps = await db
    .select()
    .from(smartPlanSteps)
    .where(eq(smartPlanSteps.planId, planId))
    .orderBy(smartPlanSteps.stepOrder)
    .limit(1);

  let nextStepAt: Date | null = null;
  if (firstSteps.length > 0) {
    nextStepAt = new Date();
    nextStepAt.setDate(nextStepAt.getDate() + firstSteps[0].delayDays);
    nextStepAt.setHours(nextStepAt.getHours() + firstSteps[0].delayHours);
  }

  await db.insert(smartPlanEnrollments).values({
    planId,
    contactId,
    currentStepIndex: 0,
    enrolledAt: new Date(),
    nextStepAt,
    status: "active",
  });
  return true;
}

/**
 * Enroll a newly-created contact in active lead-source Smart Plans that match it.
 */
export async function triggerSmartPlansForContact(contactId: number, leadSourceId: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const plans = await db.select().from(smartPlans).where(and(eq(smartPlans.status, "active"), inArray(smartPlans.triggerType, ["lead_source", "all_lead_sources"])));
  for (const plan of plans) {
    if (plan.triggerScope === "manual") continue;
    if (plan.triggerType === "all_lead_sources" || (leadSourceId !== null && normalizedLeadSourceIds(plan).includes(leadSourceId))) {
      await enrollContactInPlan(contactId, plan.id);
    }
  }
}

/**
 * Enroll a contact when a matching transaction or listing event occurs.
 */
export async function triggerSmartPlansForEvent(contactId: number, triggerType: Exclude<SmartPlanTriggerType, "lead_source" | "all_lead_sources">): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const plans = await db
    .select()
    .from(smartPlans)
    .where(and(eq(smartPlans.status, "active"), eq(smartPlans.triggerType, triggerType)));
  for (const plan of plans) {
    if (plan.triggerScope !== "manual") await enrollContactInPlan(contactId, plan.id);
  }
}

/**
 * Count current matching contacts not already enrolled in the plan. Used by the Settings checkbox.
 */
export async function countContactsMatchingPlan(planId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [plan] = await db.select().from(smartPlans).where(eq(smartPlans.id, planId)).limit(1);
  if (!plan) return 0;
  return (await matchingUnenrolledContactIds(planId, plan)).length;
}

/**
 * Return unique contact IDs matching an unsaved trigger configuration.
 * Used by the one-time send audience preview and queue builder.
 */
export async function getCurrentContactIdsMatchingTrigger(config: TriggerConfiguration): Promise<number[]> {
  return Array.from(new Set(await matchingCurrentContactIds(config)));
}

/**
 * Preview the current-contact count for an unsaved trigger configuration.
 */
export async function countContactsMatchingTrigger(config: TriggerConfiguration): Promise<number> {
  return (await getCurrentContactIdsMatchingTrigger(config)).length;
}

/**
 * Enroll all current contacts that match a plan trigger. Duplicate enrollments are ignored.
 */
export async function bulkEnrollExistingContacts(planId: number): Promise<{ enrolled: number }> {
  const db = await getDb();
  if (!db) return { enrolled: 0 };
  const [plan] = await db.select().from(smartPlans).where(eq(smartPlans.id, planId)).limit(1);
  if (!plan) return { enrolled: 0 };

  const contactIds = await matchingUnenrolledContactIds(planId, plan);
  let enrolled = 0;
  for (const contactId of contactIds) {
    if (await enrollContactInPlan(contactId, planId)) enrolled++;
  }
  return { enrolled };
}


// ─── One-Time Send Worker ─────────────────────────────────────────────────────

const ONE_TIME_SEND_BATCH_SIZE = 50; // Small database pages; the worker drains email pages in one run while provider pacing protects Resend.
let isOneTimeSendRunning = false;

function oneTimeMergeContext(contact: typeof contacts.$inferSelect, leadSourceName: string | null) {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    agentName: null,
    leadSource: leadSourceName,
  };
}

async function incrementOneTimeSendCounts(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  sendId: number,
  outcome: "sent" | "skipped" | "failed",
): Promise<void> {
  const field = outcome === "sent" ? oneTimeSends.sentCount : outcome === "skipped" ? oneTimeSends.skippedCount : oneTimeSends.failedCount;
  await db
    .update(oneTimeSends)
    .set({ [outcome === "sent" ? "sentCount" : outcome === "skipped" ? "skippedCount" : "failedCount"]: sql`${field} + 1` })
    .where(eq(oneTimeSends.id, sendId));
}

async function deliverOneTimeRecipient(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  send: typeof oneTimeSends.$inferSelect,
  recipient: typeof oneTimeSendRecipients.$inferSelect,
  contact: typeof contacts.$inferSelect,
): Promise<"sent" | "skipped" | "failed" | "deferred"> {
  let outcome: "sent" | "skipped" | "failed" = "sent";
  let provider: string | null = null;
  let providerMessageId: string | null = null;
  let replyToken: string | null = null;
  let errorMessage: string | null = null;

  if (contact.doNotContact || contact.isaStatus === "do_not_contact") {
    outcome = "skipped";
    errorMessage = "Contact is marked do not contact";
  } else {
    const leadSourceRows = contact.leadSourceId
      ? await db.select({ name: leadSources.name }).from(leadSources).where(eq(leadSources.id, contact.leadSourceId)).limit(1)
      : [];
    const mergeContext = oneTimeMergeContext(contact, leadSourceRows[0]?.name ?? null);
    const body = renderMergeTags(send.body, mergeContext);

    if (send.channel === "email") {
      if (contact.emailStatus === "bounced") {
        outcome = "skipped";
        errorMessage = "Contact email has hard bounced";
      } else if (contact.emailStatus === "unsubscribed") {
        outcome = "skipped";
        errorMessage = "Contact has unsubscribed from marketing emails";
      } else {
        provider = "resend";
        const replyDomain = process.env.SMART_PLAN_REPLY_DOMAIN?.trim();
        replyToken = replyDomain ? `sp-${nanoid(20)}` : null;
        await paceProvider("email");
        const result = await sendSmartPlanEmail({
          to: recipient.recipientAddress,
          subject: renderMergeTags(send.subject ?? send.name, mergeContext),
          body,
          isHtml: true,
          replyTo: replyToken && replyDomain ? `${replyToken}@${replyDomain}` : undefined,
        });
        outcome = result.success ? "sent" : "failed";
        providerMessageId = result.messageId ?? null;
        errorMessage = result.error ?? null;
      }
    } else {
      const eligibility = smsMarketingEligibility(contact);
      const sender = await marketingSender(db);
      if (!eligibility.eligible) {
        outcome = "skipped";
        errorMessage = eligibility.error ?? "Marketing SMS is not permitted";
      } else if (!sender) {
        outcome = "failed";
        errorMessage = "A dedicated Aircall marketing number has not been selected";
      } else if (!(await reserveSmsCapacity(db))) {
        // Preserve this recipient as queued. The worker will resume it after the UTC daily reset.
        return "deferred";
      } else {
        provider = "aircall";
        await paceProvider("sms");
        const result = await sendAircallSMS(recipient.recipientAddress, body, sender.id);
        outcome = result.success ? "sent" : "failed";
        providerMessageId = result.messageId ?? null;
        errorMessage = result.error ?? null;
        if (result.success && result.messageId) {
          await persistOutboundAircallSend({
            messageId: result.messageId,
            body,
            destination: recipient.recipientAddress.startsWith("+") ? recipient.recipientAddress : `+1${recipient.recipientAddress.replace(/\D/g, "")}`,
            aircallNumberId: sender.id,
            aircallNumberName: sender.name,
            aircallNumberDigits: sender.digits,
            responseMessage: result.message,
            contactId: contact.id,
          });
        }
      }
    }
  }

  await db
    .update(oneTimeSendRecipients)
    .set({
      status: outcome,
      provider,
      providerMessageId,
      replyToken,
      errorMessage,
      sentAt: new Date(),
    })
    .where(eq(oneTimeSendRecipients.id, recipient.id));
  await incrementOneTimeSendCounts(db, send.id, outcome);
  return outcome;
}

/**
 * Processes a bounded batch of queued recipients for the oldest pending one-time send.
 * The recurring Smart Plan worker calls this every five minutes, and the confirmation
 * mutation invokes it once immediately to minimize the time to the first messages.
 */
export async function processOneTimeSmartPlanSends(): Promise<void> {
  if (isOneTimeSendRunning) return;
  isOneTimeSendRunning = true;

  try {
    const db = await getDb();
    if (!db) return;

    const [send] = await db
      .select()
      .from(oneTimeSends)
      .where(inArray(oneTimeSends.status, ["queued", "processing"]))
      .orderBy(oneTimeSends.createdAt)
      .limit(1);
    if (!send) return;

    if (send.status === "queued") {
      await db.update(oneTimeSends).set({ status: "processing", startedAt: new Date() }).where(eq(oneTimeSends.id, send.id));
    }

    // Drain all queued email recipients during this worker run. Resend pacing keeps
    // delivery below the provider limit while avoiding multi-hour campaigns caused
    // by processing only one small page every five minutes. SMS deferrals remain
    // queued when the daily capacity is reached.
    let shouldPause = false;
    while (!shouldPause) {
      const pendingRecipients = await db
        .select({ recipient: oneTimeSendRecipients, contact: contacts })
        .from(oneTimeSendRecipients)
        .innerJoin(contacts, eq(oneTimeSendRecipients.contactId, contacts.id))
        .where(and(eq(oneTimeSendRecipients.sendId, send.id), eq(oneTimeSendRecipients.status, "queued")))
        .orderBy(oneTimeSendRecipients.id)
        .limit(ONE_TIME_SEND_BATCH_SIZE);
      if (pendingRecipients.length === 0) break;

      for (const row of pendingRecipients) {
        try {
          const delivery = await deliverOneTimeRecipient(db, send, row.recipient, row.contact);
          if (delivery === "deferred") {
            shouldPause = true;
            break;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await db.update(oneTimeSendRecipients).set({ status: "failed", errorMessage, sentAt: new Date() }).where(eq(oneTimeSendRecipients.id, row.recipient.id));
          await incrementOneTimeSendCounts(db, send.id, "failed");
        }
      }
    }

    await refreshOneTimeSendMetrics(db, send.id);

    const remaining = await db
      .select({ id: oneTimeSendRecipients.id })
      .from(oneTimeSendRecipients)
      .where(and(eq(oneTimeSendRecipients.sendId, send.id), eq(oneTimeSendRecipients.status, "queued")))
      .limit(1);
    if (remaining.length === 0) {
      await db.update(oneTimeSends).set({ status: "completed", completedAt: new Date() }).where(eq(oneTimeSends.id, send.id));
    }
  } catch (error) {
    console.error("[OneTimeSend] Worker error:", error);
  } finally {
    isOneTimeSendRunning = false;
  }
}
