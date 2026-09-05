import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";
import {
  smartPlans,
  smartPlanSteps,
  smartPlanEnrollments,
  smartPlanExecutions,
  leadSources,
  contacts,
  oneTimeSends,
  oneTimeSendRecipients,
  oneTimeSendMessageEvents,
  users,
  aircallIntegrationState,
} from "../../drizzle/schema";
import { and, eq, desc, asc, sql, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { sendAircallSMS } from "../_core/aircall";
import { renderSavvyCampaignEmail, sendSmartPlanEmail } from "../_core/smartPlanEmail";
import { renderMergeTags } from "../_core/smartPlanMergeTags";
import { getResendEmailStatus } from "../_core/resendEmailStatus";
import { refreshOneTimeSendMetrics } from "../oneTimeSendTracking";
import {
  SMART_PLAN_TRIGGER_TYPES,
  enrollContactInPlan,
  countContactsMatchingPlan,
  countContactsMatchingTrigger,
  getCurrentContactIdsMatchingTrigger,
  oneTimeRecipientScheduledAt,
  processOneTimeSmartPlanSends,
  contactChannelAddresses,
  bulkEnrollExistingContacts,
} from "../smartPlanScheduler";
import { DEFAULT_SMART_PLAN_DELIVERY_WINDOW, isValidSmartPlanSendWindow, normaliseSmartPlanSendWindow } from "../smartPlanScheduling";
import { compareSmartPlanStepsByTiming } from "../smartPlanStepOrder";
import { analyzeSmartPlanPerformance } from "../smartPlanAiAnalysis";

// ─── Plans ────────────────────────────────────────────────────────────────────
const smartPlanTriggerSchema = z.enum(SMART_PLAN_TRIGGER_TYPES);

const calendarDateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a calendar date in YYYY-MM-DD format.")
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");

const planInput = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  triggerLeadSourceId: z.number().optional().nullable(),
  triggerLeadSourceIds: z.array(z.number()).optional().nullable(),
  triggerType: smartPlanTriggerSchema.optional(),
  triggerScope: z.enum(["new_only", "existing_and_new", "manual"]).optional(),
  pauseOnReply: z.boolean().optional(),
  defaultSendWindowEnabled: z.boolean().optional(),
  defaultSendDays: z.array(z.number().int().min(0).max(6)).optional(),
  defaultSendStartHour: z.number().int().min(0).max(23).optional(),
  defaultSendEndHour: z.number().int().min(1).max(24).optional(),
  defaultSendTimezone: z.string().optional(),
  status: z.enum(["active", "paused", "draft"]).optional(),
});

const oneTimeSendInput = z.object({
  name: z.string().trim().min(1).max(255),
  channel: z.enum(["email", "sms"]),
  subject: z.string().trim().max(255).optional().nullable(),
  body: z.string().trim().min(1).max(100_000),
  triggerType: smartPlanTriggerSchema,
  triggerLeadSourceIds: z.array(z.number()).optional().nullable(),
  dateAddedFrom: calendarDateInput.optional().nullable(),
  dateAddedTo: calendarDateInput.optional().nullable(),
  scheduledAt: z.coerce.date().optional(),
  staggerEnabled: z.boolean().optional().default(false),
  staggerPerHour: z.number().int().min(1).max(360).optional().nullable(),
}).superRefine((input, ctx) => {
  if (input.staggerEnabled && !input.staggerPerHour) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter the number of messages to send per hour.",
      path: ["staggerPerHour"],
    });
  }
  const supportsDateAddedFilter =
    input.triggerType === "lead_source" || input.triggerType === "all_lead_sources";
  if (!supportsDateAddedFilter && (input.dateAddedFrom || input.dateAddedTo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Date added filters are available only for Lead Source and All Lead Sources audiences.",
      path: ["dateAddedFrom"],
    });
  }
  if (input.dateAddedFrom && input.dateAddedTo && input.dateAddedFrom > input.dateAddedTo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "The date added start must be on or before the end date.",
      path: ["dateAddedFrom"],
    });
  }
});

const CONTACT_QUERY_BATCH_SIZE = 1_000;
const PROVIDER_STATUS_REFRESH_LIMIT = 100;

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

type OneTimeRecipientTarget = { contactId: number; recipientAddress: string };
type OneTimeExclusionReasons = {
  doNotContact: number;
  bounced: number;
  unsubscribed: number;
  emailNotVerified: number;
  noEmailAddress: number;
  noPhoneAddress: number;
  smsOptedOut: number;
};

export function oneTimeExclusionReason(contact: typeof contacts.$inferSelect, channel: "email" | "sms"): keyof OneTimeExclusionReasons | null {
  if (contact.doNotContact || contact.isaStatus === "do_not_contact") return "doNotContact";
  if (channel === "email") {
    if (contact.emailStatus === "bounced") return "bounced";
    if (contact.emailStatus === "unsubscribed") return "unsubscribed";
    if (contact.emailStatus !== "valid") return "emailNotVerified";
    return contactChannelAddresses(contact, channel).length ? null : "noEmailAddress";
  }
  if (contact.smsMarketingOptedOutAt) return "smsOptedOut";
  return contactChannelAddresses(contact, channel).length ? null : "noPhoneAddress";
}

function recipientTargetsForContact(contact: typeof contacts.$inferSelect, channel: "email" | "sms"): string[] {
  return oneTimeExclusionReason(contact, channel) ? [] : contactChannelAddresses(contact, channel);
}

async function contactsForIds(db: any, contactIds: number[]): Promise<Array<typeof contacts.$inferSelect>> {
  const rows: Array<typeof contacts.$inferSelect> = [];
  for (let start = 0; start < contactIds.length; start += CONTACT_QUERY_BATCH_SIZE) {
    const ids = contactIds.slice(start, start + CONTACT_QUERY_BATCH_SIZE);
    rows.push(...await db.select().from(contacts).where(sql`${contacts.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`));
  }
  return rows;
}

async function oneTimeAudience(db: any, contactIds: number[], channel: "email" | "sms") {
  const matchingContacts = await contactsForIds(db, contactIds);
  const recipientTargets: OneTimeRecipientTarget[] = [];
  // Resend Marketing Broadcasts operate on contact email addresses rather than
  // CRM records. Avoid importing or emailing a shared address twice while
  // retaining the first associated SavvyOS contact for activity reporting.
  const selectedEmailAddresses = new Set<string>();
  const exclusionReasons: OneTimeExclusionReasons = {
    doNotContact: 0,
    bounced: 0,
    unsubscribed: 0,
    emailNotVerified: 0,
    noEmailAddress: 0,
    noPhoneAddress: 0,
    smsOptedOut: 0,
  };
  let eligibleContactCount = 0;
  for (const contact of matchingContacts) {
    const exclusionReason = oneTimeExclusionReason(contact, channel);
    if (exclusionReason) {
      exclusionReasons[exclusionReason]++;
      continue;
    }
    const addresses = recipientTargetsForContact(contact, channel);
    eligibleContactCount++;
    for (const recipientAddress of addresses) {
      const normalizedAddress = recipientAddress.trim().toLowerCase();
      if (channel === "email" && selectedEmailAddresses.has(normalizedAddress)) continue;
      if (channel === "email") selectedEmailAddresses.add(normalizedAddress);
      recipientTargets.push({ contactId: contact.id, recipientAddress });
    }
  }
  return { recipientTargets, eligibleContactCount, exclusionReasons };
}

async function selectedMarketingNumberId(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<number | null> {
  const [state] = await db
    .select({ marketingNumberId: aircallIntegrationState.marketingNumberId })
    .from(aircallIntegrationState)
    .where(eq(aircallIntegrationState.id, 1))
    .limit(1);
  return state?.marketingNumberId ?? null;
}

const testSendInput = z.object({
  channel: z.enum(["email", "sms"]),
  subject: z.string().trim().max(255).optional().nullable(),
  body: z.string().trim().min(1).max(100_000),
  recipientEmail: z.string().trim().email().optional().nullable(),
  recipientPhone: z.string().trim().min(7).max(32).optional().nullable(),
});

function testMergeContext(agentName: string | null | undefined) {
  return {
    firstName: "Test",
    lastName: "Recipient",
    agentName: agentName ?? "Your Agent",
    leadSource: "Test Lead",
  };
}

async function orderPlanStepsByTiming(db: any, planId: number): Promise<void> {
  const currentSteps = await db
    .select()
    .from(smartPlanSteps)
    .where(eq(smartPlanSteps.planId, planId))
    .orderBy(asc(smartPlanSteps.stepOrder));
  const orderedSteps = [...currentSteps].sort(compareSmartPlanStepsByTiming);
  const currentIds = currentSteps.map((step: any) => step.id);
  const changed = orderedSteps.some((step, index) => step.id !== currentIds[index]);
  if (!changed) return;

  // Enrollment progress stores the positional next-step index. Preserve the
  // actual pending step when timing normalization changes visible ordering.
  const liveEnrollments = await db
    .select({ id: smartPlanEnrollments.id, currentStepIndex: smartPlanEnrollments.currentStepIndex })
    .from(smartPlanEnrollments)
    .where(and(
      eq(smartPlanEnrollments.planId, planId),
      inArray(smartPlanEnrollments.status, ["active", "paused"]),
      isNull(smartPlanEnrollments.archivedAt),
    ));
  const orderedIndexById = new Map(orderedSteps.map((step, index) => [step.id, index]));

  for (let index = 0; index < orderedSteps.length; index++) {
    await db.update(smartPlanSteps).set({ stepOrder: index }).where(eq(smartPlanSteps.id, orderedSteps[index].id));
  }
  for (const enrollment of liveEnrollments) {
    const pendingStepId = currentIds[enrollment.currentStepIndex];
    const nextIndex = pendingStepId === undefined ? enrollment.currentStepIndex : orderedIndexById.get(pendingStepId);
    if (nextIndex !== undefined && nextIndex !== enrollment.currentStepIndex) {
      await db.update(smartPlanEnrollments).set({ currentStepIndex: nextIndex }).where(eq(smartPlanEnrollments.id, enrollment.id));
    }
  }
}

function validateDefaultSendWindow(input: z.infer<typeof planInput>): void {
  if (!input.defaultSendWindowEnabled) return;
  const window = normaliseSmartPlanSendWindow({
    days: input.defaultSendDays,
    startHour: input.defaultSendStartHour,
    endHour: input.defaultSendEndHour,
    timezone: input.defaultSendTimezone,
  });
  if ((input.defaultSendDays?.length === 0) || !isValidSmartPlanSendWindow(window)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one default delivery day and an end time after the start time." });
  }
}

export const smartPlansRouter = router({
  // ── Plan CRUD ──────────────────────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ plan: smartPlans, leadSource: leadSources })
      .from(smartPlans)
      .leftJoin(leadSources, eq(smartPlans.triggerLeadSourceId, leadSources.id))
      .orderBy(asc(smartPlans.name));

    // Fetch all lead sources once for multi-source lookup
    const allLeadSources = await db.select({ id: leadSources.id, name: leadSources.name, parentId: leadSources.parentId }).from(leadSources);
    const lsMap = new Map(allLeadSources.map((ls) => [ls.id, ls]));

    // Attach step count and enrollment count
    const result = await Promise.all(
      rows.map(async (row) => {
        const stepRows = await db
          .select({ id: smartPlanSteps.id })
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, row.plan.id));
        const enrollmentRows = await db
          .select({ id: smartPlanEnrollments.id })
          .from(smartPlanEnrollments)
          .where(and(
            eq(smartPlanEnrollments.planId, row.plan.id),
            eq(smartPlanEnrollments.status, "active")
          ));
        // Build triggerLeadSources array for multi-source plans
        const ids = (row.plan.triggerLeadSourceIds as number[] | null) ?? (row.plan.triggerLeadSourceId ? [row.plan.triggerLeadSourceId] : []);
        const triggerLeadSources = ids.map((id) => {
          const source = lsMap.get(id);
          const parent = source?.parentId ? lsMap.get(source.parentId) : null;
          return {
            id,
            name: source?.name ?? `#${id}`,
            parentName: parent?.name ?? null,
          };
        });
        return {
          ...row,
          triggerLeadSources,
          stepCount: stepRows.length,
          activeEnrollments: enrollmentRows.length,
        };
      })
    );
    return result;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select({ plan: smartPlans, leadSource: leadSources })
        .from(smartPlans)
        .leftJoin(leadSources, eq(smartPlans.triggerLeadSourceId, leadSources.id))
        .where(eq(smartPlans.id, input.id))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      const steps = await db
        .select()
        .from(smartPlanSteps)
        .where(eq(smartPlanSteps.planId, input.id))
        .orderBy(asc(smartPlanSteps.stepOrder));
      return { ...rows[0], steps };
    }),

  create: protectedProcedure
    .input(planInput)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      validateDefaultSendWindow(input);
      const [result] = await db.insert(smartPlans).values({
        name: input.name,
        description: input.description ?? null,
        triggerLeadSourceId: null,
        triggerLeadSourceIds: input.triggerLeadSourceIds ?? null,
        triggerType: input.triggerType ?? "lead_source",
        triggerScope: input.triggerScope ?? "new_only",
        defaultSendWindowEnabled: input.defaultSendWindowEnabled ?? true,
        defaultSendDays: input.defaultSendDays ?? DEFAULT_SMART_PLAN_DELIVERY_WINDOW.days,
        defaultSendStartHour: input.defaultSendStartHour ?? DEFAULT_SMART_PLAN_DELIVERY_WINDOW.startHour,
        defaultSendEndHour: input.defaultSendEndHour ?? DEFAULT_SMART_PLAN_DELIVERY_WINDOW.endHour,
        defaultSendTimezone: input.defaultSendTimezone ?? DEFAULT_SMART_PLAN_DELIVERY_WINDOW.timezone,
        status: input.status ?? "draft",
      });
      const newId = (result as any).insertId as number;
      await logActivity({ userId: ctx.user.id, action: "smart_plan_created", entityType: "smart_plan", entityId: newId, details: { name: input.name } });
      return { id: newId };
    }),

  // Create a draft plan (returns id immediately for wizard flow)
  createDraft: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional().nullable(),
      triggerLeadSourceIds: z.array(z.number()).optional().nullable(),
      triggerType: smartPlanTriggerSchema.optional(),
      triggerScope: z.enum(["new_only", "existing_and_new", "manual"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(smartPlans).values({
        name: input.name,
        description: input.description ?? null,
        triggerLeadSourceId: null,
        triggerLeadSourceIds: input.triggerLeadSourceIds ?? null,
        triggerType: input.triggerType ?? "lead_source",
        triggerScope: input.triggerScope ?? "new_only",
        defaultSendWindowEnabled: true,
        defaultSendDays: DEFAULT_SMART_PLAN_DELIVERY_WINDOW.days,
        defaultSendStartHour: DEFAULT_SMART_PLAN_DELIVERY_WINDOW.startHour,
        defaultSendEndHour: DEFAULT_SMART_PLAN_DELIVERY_WINDOW.endHour,
        defaultSendTimezone: DEFAULT_SMART_PLAN_DELIVERY_WINDOW.timezone,
        status: "draft",
      });
      const draftId = (result as any).insertId as number;
      await logActivity({ userId: ctx.user.id, action: "smart_plan_created", entityType: "smart_plan", entityId: draftId, details: { name: input.name, status: "draft" } });
      return { id: draftId };
    }),

  // Count existing contacts that would be enrolled by the persisted plan.
  countMatchingContacts: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const count = await countContactsMatchingPlan(input.planId);
      return { count };
    }),

  // Preview the current-contact count for the trigger configuration being edited.
  countMatchingContactsForTrigger: protectedProcedure
    .input(z.object({
      triggerType: smartPlanTriggerSchema,
      triggerLeadSourceIds: z.array(z.number()).optional().nullable(),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const count = await countContactsMatchingTrigger(input);
      return { count };
    }),

  // Bulk-enroll existing contacts after explicit admin confirmation
  bulkEnrollExisting: protectedProcedure
    .input(z.object({ planId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await bulkEnrollExistingContacts(input.planId);
      return result;
    }),

  // Send exactly one labeled test message without enrolling, queuing, or changing campaign metrics.
  testSend: protectedProcedure
    .input(testSendInput)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      if (input.channel === "email" && !input.recipientEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter an email address for the test send." });
      }
      if (input.channel === "sms" && !input.recipientPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a phone number for the test send." });
      }
      if (input.channel === "email" && !input.subject?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An email subject is required." });
      }
      if (input.channel === "sms" && input.body.length > 160) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Text messages are limited to 160 characters." });
      }

      const mergeContext = testMergeContext(ctx.user.name);
      const body = renderMergeTags(input.body, mergeContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const marketingNumberId = input.channel === "sms" ? await selectedMarketingNumberId(db) : null;
      if (input.channel === "sms" && !marketingNumberId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Select a dedicated Aircall marketing number before sending a text test." });
      }
      const result = input.channel === "email"
        ? await sendSmartPlanEmail({
          to: input.recipientEmail!,
          subject: `[TEST] ${renderMergeTags(input.subject!, mergeContext)}`,
          body,
          isHtml: true,
        })
        : await sendAircallSMS(input.recipientPhone!, `[TEST] ${body}`, marketingNumberId);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Unable to send the test message." });
      }
      await logActivity({
        userId: ctx.user.id,
        action: "smart_plan_test_sent",
        entityType: "smart_plan_test",
        details: { channel: input.channel, recipient: input.channel === "email" ? input.recipientEmail : input.recipientPhone, providerMessageId: result.messageId ?? null },
      });
      return { success: true, messageId: result.messageId ?? null };
    }),

  // ── One Time Sends ─────────────────────────────────────────────────────────
  oneTimeSends: router({
    preview: protectedProcedure
      .input(oneTimeSendInput)
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (input.channel === "email" && !input.subject?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "An email subject is required." });
        }
        if (input.channel === "sms" && input.body.length > 160) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Text messages are limited to 160 characters." });
        }
        if (input.triggerType === "lead_source" && !input.triggerLeadSourceIds?.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one lead source." });
        }
        const contactIds = await getCurrentContactIdsMatchingTrigger(input);
        if (!contactIds.length) return {
          matchingCount: 0,
          eligibleContactCount: 0,
          recipientCount: 0,
          excludedCount: 0,
          exclusionReasons: { doNotContact: 0, bounced: 0, unsubscribed: 0, emailNotVerified: 0, noEmailAddress: 0, noPhoneAddress: 0 },
        };
        const audience = await oneTimeAudience(db, contactIds, input.channel);
        return {
          matchingCount: contactIds.length,
          eligibleContactCount: audience.eligibleContactCount,
          recipientCount: audience.recipientTargets.length,
          excludedCount: contactIds.length - audience.eligibleContactCount,
          exclusionReasons: audience.exclusionReasons,
        };
    }),

    queue: protectedProcedure
      .input(oneTimeSendInput.safeExtend({ confirmed: z.literal(true) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (input.channel === "email" && !input.subject?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "An email subject is required." });
        }
        if (input.channel === "sms" && input.body.length > 160) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Text messages are limited to 160 characters." });
        }
        if (input.triggerType === "lead_source" && !input.triggerLeadSourceIds?.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one lead source." });
        }
        if (input.channel === "sms" && !(await selectedMarketingNumberId(db))) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Select a dedicated Aircall marketing number before queueing a text campaign." });
        }
        const now = new Date();
        const scheduledAt = input.scheduledAt ?? now;
        if (scheduledAt.getTime() < now.getTime() - 60_000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a scheduled date and time that has not already passed." });
        }
        // Resend's Marketing Broadcast service owns email pacing. Keep the
        // existing hourly throttle only for Aircall text messages.
        const staggerPerHour = input.channel === "sms" && input.staggerEnabled
          ? input.staggerPerHour!
          : null;

        const contactIds = await getCurrentContactIdsMatchingTrigger(input);
        const audience = await oneTimeAudience(db, contactIds, input.channel);
        if (!audience.recipientTargets.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No eligible recipients match this audience and channel." });
        }

        const [result] = await db.insert(oneTimeSends).values({
          name: input.name,
          channel: input.channel,
          subject: input.channel === "email" ? input.subject?.trim() ?? null : null,
          body: input.body,
          triggerType: input.triggerType,
          triggerLeadSourceIds: input.triggerType === "lead_source" ? input.triggerLeadSourceIds ?? null : null,
          dateAddedFrom: input.dateAddedFrom ?? null,
          dateAddedTo: input.dateAddedTo ?? null,
          emailDeliveryMethod: input.channel === "email" ? "resend_broadcast" : null,
          status: "queued",
          totalRecipients: audience.recipientTargets.length,
          createdById: ctx.user.id,
          confirmedAt: new Date(),
          scheduledAt,
          staggerEnabled: input.channel === "sms" && input.staggerEnabled,
          staggerPerHour,
        });
        const sendId = Number((result as any).insertId);
        for (let start = 0; start < audience.recipientTargets.length; start += 500) {
          await db.insert(oneTimeSendRecipients).values(
            audience.recipientTargets.slice(start, start + 500).map((target, offset) => ({
              sendId,
              contactId: target.contactId,
              recipientAddress: target.recipientAddress,
              status: "queued" as const,
              scheduledAt: oneTimeRecipientScheduledAt(
                scheduledAt,
                start + offset,
                staggerPerHour
              ),
            })),
          );
        }
        await logActivity({
          userId: ctx.user.id,
          action: "one_time_send_queued",
          entityType: "one_time_send",
          entityId: sendId,
          details: {
            channel: input.channel,
            triggerType: input.triggerType,
            dateAddedFrom: input.dateAddedFrom ?? null,
            dateAddedTo: input.dateAddedTo ?? null,
            matchingContacts: contactIds.length,
            eligibleContacts: audience.eligibleContactCount,
            totalRecipients: audience.recipientTargets.length,
            scheduledAt: scheduledAt.toISOString(),
            staggerPerHour,
          },
        });
        if (scheduledAt.getTime() <= now.getTime()) void processOneTimeSmartPlanSends();
        return {
          id: sendId,
          totalRecipients: audience.recipientTargets.length,
          eligibleContacts: audience.eligibleContactCount,
          excludedCount: contactIds.length - audience.eligibleContactCount,
          scheduledAt,
          staggerPerHour,
          estimatedDurationHours: staggerPerHour
            ? Math.ceil(audience.recipientTargets.length / staggerPerHour)
            : 0,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db
        .select({ send: oneTimeSends, createdBy: { id: users.id, name: users.name, email: users.email } })
        .from(oneTimeSends)
        .leftJoin(users, eq(oneTimeSends.createdById, users.id))
        .orderBy(desc(oneTimeSends.createdAt))
        .limit(25);
    }),

    detail: protectedProcedure
      .input(z.object({
        sendId: z.number().int().positive(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(50),
        status: z.enum(["queued", "sent", "skipped", "failed"]).optional(),
        activity: z.enum(["delivered", "opened", "clicked", "replied", "bounced", "complained", "suppressed"]).optional(),
      }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [sendRow] = await db
          .select({ send: oneTimeSends, createdBy: { id: users.id, name: users.name, email: users.email } })
          .from(oneTimeSends)
          .leftJoin(users, eq(oneTimeSends.createdById, users.id))
          .where(eq(oneTimeSends.id, input.sendId))
          .limit(1);
        if (!sendRow) throw new TRPCError({ code: "NOT_FOUND", message: "One-time send not found." });

        const conditions = [eq(oneTimeSendRecipients.sendId, input.sendId)];
        if (input.status) conditions.push(eq(oneTimeSendRecipients.status, input.status));
        if (input.activity === "delivered") {
          conditions.push(or(
            isNotNull(oneTimeSendRecipients.deliveredAt),
            isNotNull(oneTimeSendRecipients.openedAt),
            isNotNull(oneTimeSendRecipients.clickedAt),
            inArray(oneTimeSendRecipients.providerLastEvent, ["delivered", "opened", "clicked"]),
          )!);
        }
        if (input.activity === "opened") {
          conditions.push(or(isNotNull(oneTimeSendRecipients.openedAt), inArray(oneTimeSendRecipients.providerLastEvent, ["opened", "clicked"]))!);
        }
        if (input.activity === "clicked") conditions.push(or(isNotNull(oneTimeSendRecipients.clickedAt), eq(oneTimeSendRecipients.providerLastEvent, "clicked"))!);
        if (input.activity === "replied") conditions.push(isNotNull(oneTimeSendRecipients.repliedAt));
        if (input.activity === "bounced") conditions.push(or(isNotNull(oneTimeSendRecipients.bouncedAt), eq(oneTimeSendRecipients.providerLastEvent, "bounced"))!);
        if (input.activity === "complained") conditions.push(or(isNotNull(oneTimeSendRecipients.complainedAt), eq(oneTimeSendRecipients.providerLastEvent, "complained"))!);
        if (input.activity === "suppressed") conditions.push(or(isNotNull(oneTimeSendRecipients.suppressedAt), eq(oneTimeSendRecipients.providerLastEvent, "suppressed"))!);
        const where = and(...conditions);
        const offset = (input.page - 1) * input.limit;
        const [countRows, rows] = await Promise.all([
          db.select({ count: sql<number>`count(*)` }).from(oneTimeSendRecipients).where(where),
          db
            .select({ recipient: oneTimeSendRecipients, contact: contacts })
            .from(oneTimeSendRecipients)
            .innerJoin(contacts, eq(oneTimeSendRecipients.contactId, contacts.id))
            .where(where)
            .orderBy(desc(oneTimeSendRecipients.sentAt), desc(oneTimeSendRecipients.id))
            .limit(input.limit)
            .offset(offset),
        ]);
        const recipientIds = rows.map((row) => row.recipient.id);
        const events = recipientIds.length === 0
          ? []
          : await db
              .select()
              .from(oneTimeSendMessageEvents)
              .where(inArray(oneTimeSendMessageEvents.recipientId, recipientIds))
              .orderBy(desc(oneTimeSendMessageEvents.occurredAt));
        const eventsByRecipient = new Map<number, typeof events>();
        for (const event of events) {
          const current = eventsByRecipient.get(event.recipientId) ?? [];
          current.push(event);
          eventsByRecipient.set(event.recipientId, current);
        }

        return {
          ...sendRow,
          emailPreviewHtml: sendRow.send.channel === "email"
            ? renderSavvyCampaignEmail(sendRow.send.subject || sendRow.send.name, sendRow.send.body, true)
            : null,
          recipients: rows.map((row) => ({ ...row, events: eventsByRecipient.get(row.recipient.id) ?? [] })),
          totalRecipients: Number(countRows[0]?.count ?? 0),
          page: input.page,
          limit: input.limit,
        };
      }),

    syncProviderStatus: protectedProcedure
      .input(z.object({ sendId: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const [send] = await db.select({ id: oneTimeSends.id }).from(oneTimeSends).where(eq(oneTimeSends.id, input.sendId)).limit(1);
        if (!send) throw new TRPCError({ code: "NOT_FOUND", message: "One-time send not found." });

        const recipients = await db
          .select({ id: oneTimeSendRecipients.id, providerMessageId: oneTimeSendRecipients.providerMessageId })
          .from(oneTimeSendRecipients)
          .where(and(
            eq(oneTimeSendRecipients.sendId, input.sendId),
            eq(oneTimeSendRecipients.provider, "resend"),
            isNotNull(oneTimeSendRecipients.providerMessageId),
          ))
          .orderBy(desc(oneTimeSendRecipients.sentAt))
          .limit(PROVIDER_STATUS_REFRESH_LIMIT);
        const checkedAt = new Date();
        const outcomes = await mapWithConcurrency(recipients, 5, async (recipient) => {
          const result = await getResendEmailStatus(recipient.providerMessageId!);
          if (!result.success) return { updated: false, error: result.error };
          const lastEvent = result.data.lastEvent;
          const update: Record<string, unknown> = { providerLastEvent: lastEvent, providerStatusCheckedAt: checkedAt };
          if (lastEvent === "failed") {
            update.status = "failed";
            update.errorMessage = "Resend reports this email as failed.";
          }
          await db.update(oneTimeSendRecipients).set(update as any).where(eq(oneTimeSendRecipients.id, recipient.id));
          return { updated: true };
        });
        await refreshOneTimeSendMetrics(db, input.sendId);
        const updated = outcomes.filter((outcome) => outcome.updated).length;
        const failed = outcomes.length - updated;
        await logActivity({
          userId: ctx.user.id,
          action: "one_time_send_provider_status_refreshed",
          entityType: "one_time_send",
          entityId: input.sendId,
          details: { refreshedRecipients: recipients.length, updated, failed },
        });
        return { refreshedRecipients: recipients.length, updated, failed, checkedAt };
      }),
  }),

  // Publish a draft plan
  publish: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Validate plan has at least one step
      const steps = await db
        .select({ id: smartPlanSteps.id })
        .from(smartPlanSteps)
        .where(eq(smartPlanSteps.planId, input.id));
      if (steps.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Plan must have at least one step before publishing." });
      await db.update(smartPlans).set({ status: "active" }).where(eq(smartPlans.id, input.id));
      await logActivity({ userId: ctx.user.id, action: "smart_plan_published", entityType: "smart_plan", entityId: input.id });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: planInput.partial().extend({ includeExistingContacts: z.boolean().optional() }) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { includeExistingContacts, ...data } = input.data;
      const [existingPlan] = await db.select().from(smartPlans).where(eq(smartPlans.id, input.id)).limit(1);
      if (!existingPlan) throw new TRPCError({ code: "NOT_FOUND" });
      const windowChanged = data.defaultSendWindowEnabled !== undefined ||
        data.defaultSendDays !== undefined ||
        data.defaultSendStartHour !== undefined ||
        data.defaultSendEndHour !== undefined ||
        data.defaultSendTimezone !== undefined;
      if (windowChanged) {
        validateDefaultSendWindow({
          ...existingPlan,
          ...data,
          defaultSendWindowEnabled: data.defaultSendWindowEnabled ?? existingPlan.defaultSendWindowEnabled,
          defaultSendDays: data.defaultSendDays ?? existingPlan.defaultSendDays,
          defaultSendStartHour: data.defaultSendStartHour ?? existingPlan.defaultSendStartHour,
          defaultSendEndHour: data.defaultSendEndHour ?? existingPlan.defaultSendEndHour,
          defaultSendTimezone: data.defaultSendTimezone ?? existingPlan.defaultSendTimezone,
        });
      }
      await db.update(smartPlans).set(data).where(eq(smartPlans.id, input.id));
      const enrollment = includeExistingContacts ? await bulkEnrollExistingContacts(input.id) : { enrolled: 0 };
      await logActivity({
        userId: ctx.user.id,
        action: "smart_plan_updated",
        entityType: "smart_plan",
        entityId: input.id,
        details: { includeExistingContacts: !!includeExistingContacts, enrolledCurrentContacts: enrollment.enrolled },
      });
      return { success: true, enrolled: enrollment.enrolled };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Delete in dependency order
      const enrollmentIds = await db
        .select({ id: smartPlanEnrollments.id })
        .from(smartPlanEnrollments)
        .where(eq(smartPlanEnrollments.planId, input.id));
      for (const e of enrollmentIds) {
        await db.delete(smartPlanExecutions).where(eq(smartPlanExecutions.enrollmentId, e.id));
      }
      await db.delete(smartPlanEnrollments).where(eq(smartPlanEnrollments.planId, input.id));
      await db.delete(smartPlanSteps).where(eq(smartPlanSteps.planId, input.id));
      await db.delete(smartPlans).where(eq(smartPlans.id, input.id));
      await logActivity({ userId: ctx.user.id, action: "smart_plan_deleted", entityType: "smart_plan", entityId: input.id });
      return { success: true };
    }),

  // ── Steps CRUD ─────────────────────────────────────────────────────────────
  steps: router({
    // Legacy bulk upsert (kept for compatibility)
    upsert: protectedProcedure
      .input(z.object({
        planId: z.number(),
        steps: z.array(z.object({
          id: z.number().optional(),
          stepOrder: z.number(),
          channel: z.enum(["email", "sms"]),
          delayDays: z.number().min(0).default(0),
          delayHours: z.number().min(0).max(23).default(0),
          subject: z.string().optional().nullable(),
          body: z.string().min(1),
          businessHoursOnly: z.boolean().default(false),
          sendWindowOverride: z.boolean().default(false),
          sendWindowEnabled: z.boolean().default(false),
          sendDays: z.array(z.number().int().min(0).max(6)).default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.days),
          sendStartHour: z.number().int().min(0).max(23).default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.startHour),
          sendEndHour: z.number().int().min(1).max(24).default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.endHour),
          timezone: z.string().default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.timezone),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(smartPlanSteps).where(eq(smartPlanSteps.planId, input.planId));
        if (input.steps.length > 0) {
          await db.insert(smartPlanSteps).values(
            input.steps.map((s) => ({
              planId: input.planId,
              stepOrder: s.stepOrder,
              channel: s.channel,
              delayDays: s.delayDays,
              delayHours: s.delayHours,
              subject: s.subject ?? null,
              body: s.body,
              businessHoursOnly: s.businessHoursOnly,
              sendWindowOverride: s.sendWindowOverride,
              sendWindowEnabled: s.sendWindowEnabled,
              sendDays: s.sendDays,
              sendStartHour: s.sendStartHour,
              sendEndHour: s.sendEndHour,
              timezone: s.timezone,
            }))
          );
        }
        await orderPlanStepsByTiming(db, input.planId);
        return { success: true };
      }),

    // Add a single step to a plan (wizard flow — saves immediately)
    add: protectedProcedure
      .input(z.object({
        planId: z.number(),
        channel: z.enum(["email", "sms"]),
        delayDays: z.number().min(0).default(0),
        delayHours: z.number().min(0).max(23).default(0),
        subject: z.string().optional().nullable(),
        body: z.string().min(1),
        businessHoursOnly: z.boolean().default(false),
        sendWindowOverride: z.boolean().default(false),
        sendWindowEnabled: z.boolean().default(false),
        sendDays: z.array(z.number().int().min(0).max(6)).default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.days),
        sendStartHour: z.number().int().min(0).max(23).default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.startHour),
        sendEndHour: z.number().int().min(1).max(24).default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.endHour),
        timezone: z.string().default(DEFAULT_SMART_PLAN_DELIVERY_WINDOW.timezone),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (input.sendWindowEnabled && (input.sendDays.length === 0 || !isValidSmartPlanSendWindow(normaliseSmartPlanSendWindow({
          days: input.sendDays,
          startHour: input.sendStartHour,
          endHour: input.sendEndHour,
          timezone: input.timezone,
        })))) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one day and an end time after the start time." });
        }
        // Get current max stepOrder
        const existing = await db
          .select({ stepOrder: smartPlanSteps.stepOrder })
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, input.planId))
          .orderBy(desc(smartPlanSteps.stepOrder))
          .limit(1);
        const nextOrder = existing.length > 0 ? existing[0].stepOrder + 1 : 0;
        const [result] = await db.insert(smartPlanSteps).values({
          planId: input.planId,
          stepOrder: nextOrder,
          channel: input.channel,
          delayDays: input.delayDays,
          delayHours: input.delayHours,
          subject: input.subject ?? null,
          body: input.body,
          businessHoursOnly: input.businessHoursOnly,
          sendWindowOverride: input.sendWindowOverride,
          sendWindowEnabled: input.sendWindowEnabled,
          sendDays: input.sendDays,
          sendStartHour: input.sendStartHour,
          sendEndHour: input.sendEndHour,
          timezone: input.timezone,
        });
        await orderPlanStepsByTiming(db, input.planId);
        const insertedId = (result as any).insertId as number;
        const [insertedStep] = await db.select({ stepOrder: smartPlanSteps.stepOrder }).from(smartPlanSteps).where(eq(smartPlanSteps.id, insertedId)).limit(1);
        return { id: insertedId, stepOrder: insertedStep?.stepOrder ?? nextOrder };
      }),

    // Update a single step
    updateOne: protectedProcedure
      .input(z.object({
        stepId: z.number(),
        channel: z.enum(["email", "sms"]).optional(),
        delayDays: z.number().min(0).optional(),
        delayHours: z.number().min(0).max(23).optional(),
        subject: z.string().optional().nullable(),
        body: z.string().min(1).optional(),
        businessHoursOnly: z.boolean().optional(),
        sendWindowOverride: z.boolean().optional(),
        sendWindowEnabled: z.boolean().optional(),
        sendDays: z.array(z.number().int().min(0).max(6)).optional(),
        sendStartHour: z.number().int().min(0).max(23).optional(),
        sendEndHour: z.number().int().min(1).max(24).optional(),
        timezone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { stepId, ...data } = input;
        if (data.sendWindowEnabled) {
          const [existing] = await db.select().from(smartPlanSteps).where(eq(smartPlanSteps.id, stepId)).limit(1);
          if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
          if (data.sendDays?.length === 0 || !isValidSmartPlanSendWindow(normaliseSmartPlanSendWindow({
            days: data.sendDays ?? existing.sendDays,
            startHour: data.sendStartHour ?? existing.sendStartHour,
            endHour: data.sendEndHour ?? existing.sendEndHour,
            timezone: data.timezone ?? existing.timezone,
          }))) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one day and an end time after the start time." });
          }
        }
        await db.update(smartPlanSteps).set(data).where(eq(smartPlanSteps.id, stepId));
        const [updatedStep] = await db.select({ planId: smartPlanSteps.planId }).from(smartPlanSteps).where(eq(smartPlanSteps.id, stepId)).limit(1);
        if (updatedStep) await orderPlanStepsByTiming(db, updatedStep.planId);
        return { success: true };
      }),

    // Delete a single step and reorder remaining
    delete: protectedProcedure
      .input(z.object({ stepId: z.number(), planId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(smartPlanSteps).where(eq(smartPlanSteps.id, input.stepId));
        // Reorder remaining steps
        const remaining = await db
          .select()
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, input.planId))
          .orderBy(asc(smartPlanSteps.stepOrder));
        for (let i = 0; i < remaining.length; i++) {
          await db
            .update(smartPlanSteps)
            .set({ stepOrder: i })
            .where(eq(smartPlanSteps.id, remaining[i].id));
        }
        return { success: true };
      }),

    // Move a step up or down
    reorder: protectedProcedure
      .input(z.object({ planId: z.number(), stepId: z.number(), direction: z.enum(["up", "down"]) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const steps = await db
          .select()
          .from(smartPlanSteps)
          .where(eq(smartPlanSteps.planId, input.planId))
          .orderBy(asc(smartPlanSteps.stepOrder));
        const idx = steps.findIndex((s) => s.id === input.stepId);
        if (idx === -1) throw new TRPCError({ code: "NOT_FOUND" });
        const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= steps.length) return { success: true };
        // Swap stepOrder values
        const aOrder = steps[idx].stepOrder;
        const bOrder = steps[swapIdx].stepOrder;
        await db.update(smartPlanSteps).set({ stepOrder: bOrder }).where(eq(smartPlanSteps.id, steps[idx].id));
        await db.update(smartPlanSteps).set({ stepOrder: aOrder }).where(eq(smartPlanSteps.id, steps[swapIdx].id));
        // Timing remains the primary order; a manual move can only establish
        // the sequence between two steps that have the same wait time.
        await orderPlanStepsByTiming(db, input.planId);
        return { success: true };
      }),
  }),

  // ── Analytics ──────────────────────────────────────────────────────────────
  analytics: router({
    get: protectedProcedure
      .input(z.object({ planId: z.number() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // This is intentionally aggregated in MySQL rather than loading every
        // execution into application memory. It remains fast for plans with many
        // steps and large enrollment cohorts.
        const rows = await db
          .select({
            step: smartPlanSteps,
            executions: sql<number>`count(${smartPlanExecutions.id})`,
            sent: sql<number>`coalesce(sum(case when ${smartPlanExecutions.status} = 'sent' then 1 else 0 end), 0)`,
            skipped: sql<number>`coalesce(sum(case when ${smartPlanExecutions.status} = 'skipped' then 1 else 0 end), 0)`,
            failed: sql<number>`coalesce(sum(case when ${smartPlanExecutions.status} = 'failed' then 1 else 0 end), 0)`,
            delivered: sql<number>`coalesce(sum(case when ${smartPlanExecutions.deliveredAt} is not null then 1 else 0 end), 0)`,
            opened: sql<number>`coalesce(sum(case when ${smartPlanExecutions.openedAt} is not null then 1 else 0 end), 0)`,
            clicked: sql<number>`coalesce(sum(case when ${smartPlanExecutions.clickedAt} is not null then 1 else 0 end), 0)`,
            bounced: sql<number>`coalesce(sum(case when ${smartPlanExecutions.bouncedAt} is not null then 1 else 0 end), 0)`,
            complained: sql<number>`coalesce(sum(case when ${smartPlanExecutions.complainedAt} is not null then 1 else 0 end), 0)`,
            suppressed: sql<number>`coalesce(sum(case when ${smartPlanExecutions.suppressedAt} is not null then 1 else 0 end), 0)`,
            replied: sql<number>`coalesce(sum(case when ${smartPlanExecutions.repliedAt} is not null then 1 else 0 end), 0)`,
          })
          .from(smartPlanSteps)
          .leftJoin(smartPlanExecutions, eq(smartPlanExecutions.stepId, smartPlanSteps.id))
          .where(eq(smartPlanSteps.planId, input.planId))
          .groupBy(smartPlanSteps.id)
          .orderBy(asc(smartPlanSteps.stepOrder));

        const toNumber = (value: unknown) => Number(value ?? 0);
        const steps = rows.map((row) => ({
          ...row.step,
          metrics: {
            executions: toNumber(row.executions),
            sent: toNumber(row.sent),
            skipped: toNumber(row.skipped),
            failed: toNumber(row.failed),
            delivered: toNumber(row.delivered),
            opened: toNumber(row.opened),
            clicked: toNumber(row.clicked),
            bounced: toNumber(row.bounced),
            complained: toNumber(row.complained),
            suppressed: toNumber(row.suppressed),
            replied: toNumber(row.replied),
          },
        }));

        const totals = steps.reduce((acc, step) => {
          for (const [key, value] of Object.entries(step.metrics)) {
            acc[key as keyof typeof acc] += value;
          }
          return acc;
        }, {
          executions: 0, sent: 0, skipped: 0, failed: 0, delivered: 0,
          opened: 0, clicked: 0, bounced: 0, complained: 0, suppressed: 0, replied: 0,
        });

        return { steps, totals };
      }),
  }),

  aiAnalysis: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await analyzeSmartPlanPerformance();
      await logActivity({
        userId: ctx.user.id,
        action: "smart_plan_ai_analysis_generated",
        entityType: "smart_plan_analysis",
        entityId: 0,
        details: { generatedAt: result.generatedAt, totalEmailSends: (result.evidence as any)?.totalEmailSends ?? 0 },
      });
      return result;
    }),

  // ── Enrollments ────────────────────────────────────────────────────────────
  enrollments: router({
    list: protectedProcedure
      .input(z.object({
        planId: z.number().optional(),
        contactId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input.planId) conditions.push(eq(smartPlanEnrollments.planId, input.planId));
        if (input.contactId) conditions.push(eq(smartPlanEnrollments.contactId, input.contactId));

        const rows = await db
          .select({
            enrollment: smartPlanEnrollments,
            plan: smartPlans,
            contact: contacts,
          })
          .from(smartPlanEnrollments)
          .innerJoin(smartPlans, eq(smartPlanEnrollments.planId, smartPlans.id))
          .innerJoin(contacts, eq(smartPlanEnrollments.contactId, contacts.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(smartPlanEnrollments.enrolledAt));

        // Load the entire delivery path in two bounded queries, so the UI can
        // explain completed, upcoming, skipped, and failed steps per contact.
        const planIds = Array.from(new Set(rows.map((row) => row.enrollment.planId)));
        const enrollmentIds = rows.map((row) => row.enrollment.id);
        const [allSteps, allExecutions] = await Promise.all([
          planIds.length
            ? db.select().from(smartPlanSteps).where(inArray(smartPlanSteps.planId, planIds)).orderBy(asc(smartPlanSteps.planId), asc(smartPlanSteps.stepOrder))
            : Promise.resolve([]),
          enrollmentIds.length
            ? db.select().from(smartPlanExecutions).where(inArray(smartPlanExecutions.enrollmentId, enrollmentIds)).orderBy(desc(smartPlanExecutions.sentAt), desc(smartPlanExecutions.id))
            : Promise.resolve([]),
        ]);
        const stepsByPlan = new Map<number, typeof allSteps>();
        for (const step of allSteps) {
          const planSteps = stepsByPlan.get(step.planId) ?? [];
          planSteps.push(step);
          stepsByPlan.set(step.planId, planSteps);
        }
        const executionsByEnrollment = new Map<number, typeof allExecutions>();
        for (const execution of allExecutions) {
          const enrollmentExecutions = executionsByEnrollment.get(execution.enrollmentId) ?? [];
          enrollmentExecutions.push(execution);
          executionsByEnrollment.set(execution.enrollmentId, enrollmentExecutions);
        }
        const enriched = rows.map((row) => {
          const steps = stepsByPlan.get(row.enrollment.planId) ?? [];
          const executions = executionsByEnrollment.get(row.enrollment.id) ?? [];
          return { ...row, currentStep: steps[row.enrollment.currentStepIndex] ?? null, totalSteps: steps.length, steps, executions };
        });

        return enriched;
      }),

    manualEnroll: protectedProcedure
      .input(z.object({ planId: z.number(), contactId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await enrollContactInPlan(input.contactId, input.planId);
        return { success: true };
      }),

    resume: protectedProcedure
      .input(z.object({ enrollmentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(smartPlanEnrollments)
          .set({ status: "active", pauseReason: null, nextStepAt: new Date(), bypassInitialSendWindow: false })
          .where(and(
            eq(smartPlanEnrollments.id, input.enrollmentId),
            eq(smartPlanEnrollments.status, "paused"),
          ));
        return { success: true };
      }),

    cancel: protectedProcedure
      .input(z.object({ enrollmentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(smartPlanEnrollments)
          .set({ status: "cancelled" })
          .where(eq(smartPlanEnrollments.id, input.enrollmentId));
        return { success: true };
      }),
  }),

  // ── Executions (message history) ───────────────────────────────────────────
  executions: router({
    list: protectedProcedure
      .input(z.object({
        enrollmentId: z.number().optional(),
        contactId: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) return [];

        if (input.contactId) {
          // Get all executions for all enrollments of this contact
          const enrollments = await db
            .select({ id: smartPlanEnrollments.id })
            .from(smartPlanEnrollments)
            .where(eq(smartPlanEnrollments.contactId, input.contactId));

          if (enrollments.length === 0) return [];

          const enrollmentIds = enrollments.map((e) => e.id);
          const rows = await db
            .select({
              execution: smartPlanExecutions,
              step: smartPlanSteps,
              enrollment: smartPlanEnrollments,
              plan: smartPlans,
            })
            .from(smartPlanExecutions)
            .innerJoin(smartPlanSteps, eq(smartPlanExecutions.stepId, smartPlanSteps.id))
            .innerJoin(smartPlanEnrollments, eq(smartPlanExecutions.enrollmentId, smartPlanEnrollments.id))
            .innerJoin(smartPlans, eq(smartPlanEnrollments.planId, smartPlans.id))
            .where(
              enrollmentIds.length === 1
                ? eq(smartPlanExecutions.enrollmentId, enrollmentIds[0])
                : and(...enrollmentIds.map((id) => eq(smartPlanExecutions.enrollmentId, id)))
            )
            .orderBy(desc(smartPlanExecutions.sentAt));
          return rows;
        }

        if (input.enrollmentId) {
          return db
            .select({
              execution: smartPlanExecutions,
              step: smartPlanSteps,
              enrollment: smartPlanEnrollments,
              plan: smartPlans,
            })
            .from(smartPlanExecutions)
            .innerJoin(smartPlanSteps, eq(smartPlanExecutions.stepId, smartPlanSteps.id))
            .innerJoin(smartPlanEnrollments, eq(smartPlanExecutions.enrollmentId, smartPlanEnrollments.id))
            .innerJoin(smartPlans, eq(smartPlanEnrollments.planId, smartPlans.id))
            .where(eq(smartPlanExecutions.enrollmentId, input.enrollmentId))
            .orderBy(desc(smartPlanExecutions.sentAt));
        }

        return [];
      }),
  }),
});
