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
} from "../drizzle/schema";
import { and, eq, lte, isNotNull, sql } from "drizzle-orm";
import { sendAircallSMS } from "./_core/aircall";
import { sendSmartPlanEmail } from "./_core/smartPlanEmail";
import { renderMergeTags } from "./_core/smartPlanMergeTags";

let isRunning = false;

// ─── Business Hours Helpers ───────────────────────────────────────────────────

/**
 * Check whether a given UTC Date falls within business hours
 * (Mon–Fri, 9:00am–6:00pm) in the specified IANA timezone.
 */
function isBusinessHours(date: Date, timezone: string): boolean {
  try {
    // Get the weekday (0=Sun, 1=Mon, ..., 6=Sat) and hour in the target timezone
    const weekdayStr = date.toLocaleString("en-US", { timeZone: timezone, weekday: "short" });
    const hourStr = date.toLocaleString("en-US", { timeZone: timezone, hour: "numeric", hour12: false });
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);
    const hour = parseInt(hourStr, 10);
    // Mon–Fri = 1–5, 9:00 (hour 9) to before 18:00 (hour 18)
    return weekday >= 1 && weekday <= 5 && hour >= 9 && hour < 18;
  } catch {
    return true; // Fallback: allow send if timezone parsing fails
  }
}

/**
 * Given a UTC Date that falls outside business hours, return the next
 * Mon–Fri 9:00am moment in the given timezone as a UTC Date.
 */
function nextBusinessHoursStart(from: Date, timezone: string): Date {
  // Advance minute-by-minute until we're in business hours (max 7 days)
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  // Round up to next hour boundary for cleaner scheduling
  candidate.setMinutes(0);
  candidate.setHours(candidate.getHours() + 1);

  for (let i = 0; i < 7 * 24; i++) {
    if (isBusinessHours(candidate, timezone)) return candidate;
    candidate.setHours(candidate.getHours() + 1);
  }
  return candidate; // Fallback
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
      );

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

  // ── Business-hours check: if the step requires business hours and we're outside, defer ──
  if (step.businessHoursOnly) {
    const tz = step.timezone || "America/New_York";
    if (!isBusinessHours(new Date(), tz)) {
      // Defer nextStepAt to the next business-hours window (keep currentStepIndex unchanged)
      const deferredAt = nextBusinessHoursStart(new Date(), tz);
      await db
        .update(smartPlanEnrollments)
        .set({ nextStepAt: deferredAt })
        .where(eq(smartPlanEnrollments.id, enrollment.id));
      return; // Will be retried at deferredAt
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
  };

  const renderedBody = renderMergeTags(step.body, mergeCtx);
  const renderedSubject = step.subject ? renderMergeTags(step.subject, mergeCtx) : "";

  let status: "sent" | "failed" | "skipped" = "sent";
  let errorMessage: string | undefined;

  if (step.channel === "email") {
    if (!contact.email) {
      status = "skipped";
      errorMessage = "Contact has no email address";
    } else if ((contact as any).emailStatus === "bounced") {
      status = "skipped";
      errorMessage = "Contact email has hard bounced — suppressed";
      console.log(`[SmartPlanScheduler] Skipping ${contact.email} — hard bounce suppression`);
    } else if ((contact as any).emailStatus === "unsubscribed") {
      status = "skipped";
      errorMessage = "Contact has unsubscribed from marketing emails";
      console.log(`[SmartPlanScheduler] Skipping ${contact.email} — unsubscribed`);
    } else {
      const result = await sendSmartPlanEmail({
        to: contact.email,
        subject: renderedSubject || plan.name,
        body: renderedBody,
        isHtml: true,
      });
      status = result.success ? "sent" : "failed";
      errorMessage = result.error;
    }
  } else if (step.channel === "sms") {
    const phone = contact.phone;
    if (!phone) {
      status = "skipped";
      errorMessage = "Contact has no phone number";
    } else {
      const result = await sendAircallSMS(phone, renderedBody);
      status = result.success ? "sent" : "failed";
      errorMessage = result.error;
    }
  }

  // Log the execution
  await db.insert(smartPlanExecutions).values({
    enrollmentId: enrollment.id,
    stepId: step.id,
    channel: step.channel,
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

/**
 * Enroll a contact in a Smart Plan.
 * Called when a new contact is created with a matching lead source.
 */
export async function enrollContactInPlan(contactId: number, planId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check not already enrolled in this plan
  const existing = await db
    .select()
    .from(smartPlanEnrollments)
    .where(
      and(
        eq(smartPlanEnrollments.contactId, contactId),
        eq(smartPlanEnrollments.planId, planId)
      )
    )
    .limit(1);

  if (existing.length > 0) return; // Already enrolled

  // Get first step to compute nextStepAt
  const firstSteps = await db
    .select()
    .from(smartPlanSteps)
    .where(eq(smartPlanSteps.planId, planId))
    .orderBy(smartPlanSteps.stepOrder)
    .limit(1);

  let nextStepAt: Date | null = null;
  if (firstSteps.length > 0) {
    const firstStep = firstSteps[0];
    nextStepAt = new Date();
    nextStepAt.setDate(nextStepAt.getDate() + firstStep.delayDays);
    nextStepAt.setHours(nextStepAt.getHours() + firstStep.delayHours);
  }

  await db.insert(smartPlanEnrollments).values({
    planId,
    contactId,
    currentStepIndex: 0,
    enrolledAt: new Date(),
    nextStepAt,
    status: "active",
  });
}

/**
 * Find all active plans triggered by a given lead source and enroll the contact.
 * Supports both legacy single-source and new multi-source plans.
 * Only enrolls if triggerScope is 'new_only' or 'existing_and_new' (not 'manual').
 */
export async function triggerSmartPlansForContact(contactId: number, leadSourceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all active plans that are not manual-only
  const allActivePlans = await db
    .select()
    .from(smartPlans)
    .where(
      and(
        eq(smartPlans.status, "active")
      )
    );

  // Filter to plans that match this lead source (legacy single OR new multi-source)
  const matchingPlans = allActivePlans.filter((plan) => {
    if (plan.triggerScope === "manual") return false;
    // Multi-source check (new)
    const ids = plan.triggerLeadSourceIds as number[] | null;
    if (ids && ids.length > 0) {
      return ids.includes(leadSourceId);
    }
    // Legacy single-source check
    return plan.triggerLeadSourceId === leadSourceId;
  });

  for (const plan of matchingPlans) {
    await enrollContactInPlan(contactId, plan.id);
  }
}

/**
 * Count how many existing contacts match a plan's lead source trigger.
 * Used to show the confirmation count before bulk-enrolling existing contacts.
 */
export async function countContactsMatchingPlan(planId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const plan = await db.select().from(smartPlans).where(eq(smartPlans.id, planId)).limit(1);
  if (!plan[0]) return 0;

  const p = plan[0];
  const ids = p.triggerLeadSourceIds as number[] | null;
  const sourceIds: number[] = [];
  if (ids && ids.length > 0) sourceIds.push(...ids);
  if (p.triggerLeadSourceId) sourceIds.push(p.triggerLeadSourceId);

  if (sourceIds.length === 0) return 0;

  // Count contacts with matching leadSourceId not already enrolled
  const { inArray } = await import("drizzle-orm");
  const matchingContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(inArray(contacts.leadSourceId, sourceIds));

  // Subtract already-enrolled contacts
  const alreadyEnrolled = await db
    .select({ contactId: smartPlanEnrollments.contactId })
    .from(smartPlanEnrollments)
    .where(
      and(
        eq(smartPlanEnrollments.planId, planId),
        eq(smartPlanEnrollments.status, "active")
      )
    );

  const enrolledIds = new Set(alreadyEnrolled.map((e) => e.contactId));
  return matchingContacts.filter((c) => !enrolledIds.has(c.id)).length;
}

/**
 * Bulk-enroll all existing contacts matching a plan's lead source trigger.
 * Called explicitly after admin confirmation.
 */
export async function bulkEnrollExistingContacts(planId: number): Promise<{ enrolled: number }> {
  const db = await getDb();
  if (!db) return { enrolled: 0 };

  const plan = await db.select().from(smartPlans).where(eq(smartPlans.id, planId)).limit(1);
  if (!plan[0]) return { enrolled: 0 };

  const p = plan[0];
  const ids = p.triggerLeadSourceIds as number[] | null;
  const sourceIds: number[] = [];
  if (ids && ids.length > 0) sourceIds.push(...ids);
  if (p.triggerLeadSourceId) sourceIds.push(p.triggerLeadSourceId);

  if (sourceIds.length === 0) return { enrolled: 0 };

  const { inArray } = await import("drizzle-orm");
  const matchingContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(inArray(contacts.leadSourceId, sourceIds));

  let enrolled = 0;
  for (const c of matchingContacts) {
    try {
      await enrollContactInPlan(c.id, planId);
      enrolled++;
    } catch {
      // Skip duplicates / errors silently
    }
  }
  return { enrolled };
}
