import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import {
  pulseCascadeRecipients,
  pulseCascadingMessages,
  pulseMeetingMembers,
  pulseMeetings,
  pulseNotificationPreferences,
  pulseNotifications,
  pulseWorkItemComments,
  pulseWorkItemNotifications,
  pulseWorkItems,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getEmailPreview, sendTransactionalEmail } from "../_core/resendEmail";
import { visible_meeting_ids } from "./access";
import { hasPulseCapability } from "./capabilities";

export const PULSE_NOTIFICATION_TEMPLATE_KEYS = [
  "meeting_reminder",
  "todo_assigned",
  "cascade_sent",
  "overdue_digest",
  "mention",
  "rock_completed",
  "welcome",
] as const;

export type PulseNotificationTemplateKey = (typeof PULSE_NOTIFICATION_TEMPLATE_KEYS)[number];
const templateKeySchema = z.enum(PULSE_NOTIFICATION_TEMPLATE_KEYS);

function id() {
  return crypto.randomUUID();
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  return db;
}

async function requireSettingsAccess(
  db: any,
  user: { id: number; role: string; email?: string | null },
) {
  if (await hasPulseCapability(user, "canViewPulseSettings")) return;
  const [membership] = await db.select({ meetingRole: pulseMeetingMembers.meetingRole }).from(pulseMeetingMembers)
    .where(and(eq(pulseMeetingMembers.personId, user.id), inArray(pulseMeetingMembers.meetingRole, ["owner", "administrator"]), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt))).limit(1);
  if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "This Pulse page is not available." });
}

function sampleContext(person: { name: string | null; email: string }, templateKey: PulseNotificationTemplateKey) {
  return {
    recipientName: person.name ?? "Pulse teammate",
    recipientEmail: person.email,
    pulseMeetingName: "Leadership",
    pulseWorkItemTitle: "Confirm next week’s market update",
    pulseItemUrl: "https://os.savvy-agents.com/pulse/work",
    pulseActionUrl: "https://os.savvy-agents.com/pulse/meetings",
    pulseCascadeSource: "From: Leadership",
    pulseCascadeDestinations: "To: Operations",
    pulseCascadeAcknowledgment: "1 of 3 acknowledged",
    pulseCascadeBody: "Please align the handoff before the next meeting.",
    pulseOverdueCount: "2",
    pulseOverdueList: "<p style=\"font-size:15px;color:#374151;\">• Confirm the follow-up plan<br/>• Share the updated checklist</p>",
    templateKey,
  };
}


export async function getPulseNotificationPreference(
  db: any,
  personId: number,
  templateKey: PulseNotificationTemplateKey,
) {
  const [preference] = await db.select({ inApp: pulseNotificationPreferences.inApp, email: pulseNotificationPreferences.email })
    .from(pulseNotificationPreferences)
    .where(and(
      eq(pulseNotificationPreferences.personId, personId),
      eq(pulseNotificationPreferences.templateKey, templateKey),
    ))
    .limit(1);

  return { inApp: preference?.inApp ?? true, email: preference?.email ?? true };
}

/**
 * Mission Control response items only. Cascades deliberately live in the separate
 * acknowledgement section; this query never adds a third kind of home-screen block.
 */
async function pendingResponseItems(db: any, personId: number) {
  const visibleMeetingIds = await visible_meeting_ids(db, personId);
  const generic = await db.select({
    id: pulseNotifications.id,
    notificationType: pulseNotifications.notificationType,
    sourceType: pulseNotifications.sourceType,
    sourceId: pulseNotifications.sourceId,
    body: pulseNotifications.body,
    meetingId: pulseNotifications.meetingId,
    meetingName: pulseMeetings.name,
    createdAt: pulseNotifications.createdAt,
  }).from(pulseNotifications)
    .leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseNotifications.meetingId))
    .where(and(
      eq(pulseNotifications.personId, personId),
      eq(pulseNotifications.requiresAction, true),
      isNull(pulseNotifications.clearedAt),
      ne(pulseNotifications.notificationType, "cascade"),
    ));

  const visibleLegacyMeetingCondition = visibleMeetingIds.length
    ? or(isNull(pulseWorkItems.meetingId), inArray(pulseWorkItems.meetingId, visibleMeetingIds))
    : isNull(pulseWorkItems.meetingId);
  const legacyMentions = await db.select({
    id: pulseWorkItemNotifications.id,
    notificationType: pulseWorkItemNotifications.notificationType,
    workItemId: pulseWorkItemNotifications.workItemId,
    workItemTitle: pulseWorkItems.title,
    dueDate: pulseWorkItems.dueDate,
    meetingId: pulseWorkItems.meetingId,
    meetingName: pulseMeetings.name,
    commentBody: pulseWorkItemComments.body,
    commentAuthorName: users.name,
    createdAt: pulseWorkItemNotifications.createdAt,
  }).from(pulseWorkItemNotifications)
    .innerJoin(pulseWorkItems, eq(pulseWorkItems.id, pulseWorkItemNotifications.workItemId))
    .leftJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId))
    .leftJoin(pulseWorkItemComments, eq(pulseWorkItemComments.id, pulseWorkItemNotifications.commentId))
    .leftJoin(users, eq(users.id, pulseWorkItemComments.authorId))
    .where(and(
      eq(pulseWorkItemNotifications.recipientId, personId),
      eq(pulseWorkItemNotifications.notificationType, "mention"),
      isNull(pulseWorkItemNotifications.actionedAt),
      isNull(pulseWorkItemNotifications.deletedAt),
      isNull(pulseWorkItems.deletedAt),
      visibleLegacyMeetingCondition,
    ));

  const genericWorkItemIds = generic
    .filter((notification: any) => notification.sourceType === "work_item")
    .map((notification: any) => notification.sourceId);
  const genericWorkItems = genericWorkItemIds.length
    ? await db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, dueDate: pulseWorkItems.dueDate })
      .from(pulseWorkItems)
      .where(and(inArray(pulseWorkItems.id, genericWorkItemIds), isNull(pulseWorkItems.deletedAt)))
    : [];
  const workItemById = new Map(genericWorkItems.map((item: any) => [item.id, item]));

  const genericItems = generic.map((notification: any) => {
    const workItem = (notification.sourceType === "work_item" ? workItemById.get(notification.sourceId) : null) as { id: string; title: string; dueDate: Date | null } | null;
    const isAssignment = notification.notificationType === "assignment";
    return {
      id: notification.id,
      kind: "notification" as const,
      notificationType: notification.notificationType,
      headline: isAssignment ? "A to-do was assigned to you" : "A Pulse response needs you",
      body: notification.body || workItem?.title || "Open this Pulse item to respond.",
      meetingId: notification.meetingId,
      meetingName: notification.meetingName ?? "Pulse",
      workItemId: workItem?.id ?? null,
      dueDate: workItem?.dueDate ?? null,
      canComplete: isAssignment && !!workItem,
      createdAt: notification.createdAt,
    };
  });

  const legacyItems = legacyMentions.map((notification: any) => ({
    id: notification.id,
    kind: "work_item_notification" as const,
    notificationType: notification.notificationType,
    headline: `${notification.commentAuthorName ?? "A teammate"} mentioned you`,
    body: notification.commentBody ?? notification.workItemTitle,
    meetingId: notification.meetingId,
    meetingName: notification.meetingName ?? "Personal work",
    workItemId: notification.workItemId,
    dueDate: notification.dueDate,
    canComplete: false,
    createdAt: notification.createdAt,
  }));

  return [...genericItems, ...legacyItems].sort((left: any, right: any) => (
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  ));
}

export const pulseNotificationsRouter = router({
  preferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    await requireSettingsAccess(db, ctx.user);
    const rows = await db.select({ templateKey: pulseNotificationPreferences.templateKey, inApp: pulseNotificationPreferences.inApp, email: pulseNotificationPreferences.email })
      .from(pulseNotificationPreferences)
      .where(eq(pulseNotificationPreferences.personId, ctx.user.id));
    const byKey = new Map(rows.map((row: any) => [row.templateKey, row]));

    return PULSE_NOTIFICATION_TEMPLATE_KEYS.map((templateKey) => ({
      templateKey,
      inApp: byKey.get(templateKey)?.inApp ?? true,
      email: byKey.get(templateKey)?.email ?? true,
    }));
  }),

  setPreference: protectedProcedure
    .input(z.object({
      templateKey: templateKeySchema,
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
    }).refine((input) => input.inApp !== undefined || input.email !== undefined, {
      message: "Choose a delivery setting to update.",
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requireSettingsAccess(db, ctx.user);
      const current = await getPulseNotificationPreference(db, ctx.user.id, input.templateKey);
      const next = { inApp: input.inApp ?? current.inApp, email: input.email ?? current.email };
      await db.insert(pulseNotificationPreferences).values({ id: id(), personId: ctx.user.id, templateKey: input.templateKey, ...next })
        .onDuplicateKeyUpdate({ set: next });
      return { templateKey: input.templateKey, ...next };
    }),

  templatePreview: protectedProcedure.input(z.object({ templateKey: templateKeySchema })).query(async ({ ctx, input }) => {
    const db = await database();
    await requireSettingsAccess(db, ctx.user);
    const [person] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!person?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Add an email address to your SavvyOS account before previewing or testing email." });
    const preview = getEmailPreview(input.templateKey, sampleContext({ name: person.name, email: person.email }, input.templateKey));
    return { ...preview, recipientEmail: person.email };
  }),

  sendTemplateTest: protectedProcedure.input(z.object({ templateKey: templateKeySchema })).mutation(async ({ ctx, input }) => {
    const db = await database();
    await requireSettingsAccess(db, ctx.user);
    const [person] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!person?.email) throw new TRPCError({ code: "BAD_REQUEST", message: "Add an email address to your SavvyOS account before sending a test." });
    const result = await sendTransactionalEmail(input.templateKey, sampleContext({ name: person.name, email: person.email }, input.templateKey), { bypassNotificationSetting: true, idempotencyKey: `pulse-template-test:${ctx.user.id}:${input.templateKey}:${Date.now()}` });
    if (!result.sent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.reason ?? "The test email could not be delivered." });
    return { success: true, recipientEmail: person.email };
  }),

  pending: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    return pendingResponseItems(db, ctx.user.id);
  }),

  clear: protectedProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const [notification] = await db.select({ notificationType: pulseNotifications.notificationType })
        .from(pulseNotifications)
        .where(and(eq(pulseNotifications.id, input.notificationId), eq(pulseNotifications.personId, ctx.user.id), isNull(pulseNotifications.clearedAt)))
        .limit(1);
      if (!notification) throw new TRPCError({ code: "NOT_FOUND", message: "This notification is no longer available." });
      if (notification.notificationType === "cascade") throw new TRPCError({ code: "BAD_REQUEST", message: "Use Got it to acknowledge this cascading message." });
      await db.update(pulseNotifications).set({ clearedAt: new Date() }).where(eq(pulseNotifications.id, input.notificationId));
      return { success: true };
    }),

  clearWorkItemNotification: protectedProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const [notification] = await db.select({ id: pulseWorkItemNotifications.id })
        .from(pulseWorkItemNotifications)
        .where(and(
          eq(pulseWorkItemNotifications.id, input.notificationId),
          eq(pulseWorkItemNotifications.recipientId, ctx.user.id),
          isNull(pulseWorkItemNotifications.actionedAt),
          isNull(pulseWorkItemNotifications.deletedAt),
        ))
        .limit(1);
      if (!notification) throw new TRPCError({ code: "NOT_FOUND", message: "This notification is no longer available." });
      await db.update(pulseWorkItemNotifications).set({ actionedAt: new Date() }).where(eq(pulseWorkItemNotifications.id, notification.id));
      return { success: true };
    }),

  adminOutstanding: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    if (!await hasPulseCapability(ctx.user, "canViewPulseSettings")) {
      throw new TRPCError({ code: "NOT_FOUND", message: "This Pulse page is not available." });
    }
    const [cascades, notifications, legacyMentions] = await Promise.all([
      db.select({ personId: pulseCascadeRecipients.personId, messageId: pulseCascadeRecipients.cascadingMessageId, createdAt: pulseCascadingMessages.createdAt })
        .from(pulseCascadeRecipients)
        .innerJoin(pulseCascadingMessages, eq(pulseCascadingMessages.id, pulseCascadeRecipients.cascadingMessageId))
        .where(and(isNull(pulseCascadeRecipients.acknowledgedAt), isNull(pulseCascadingMessages.deletedAt))),
      db.select({ personId: pulseNotifications.personId, createdAt: pulseNotifications.createdAt })
        .from(pulseNotifications)
        .where(and(eq(pulseNotifications.requiresAction, true), isNull(pulseNotifications.clearedAt), ne(pulseNotifications.notificationType, "cascade"))),
      db.select({ personId: pulseWorkItemNotifications.recipientId, createdAt: pulseWorkItemNotifications.createdAt })
        .from(pulseWorkItemNotifications)
        .where(and(eq(pulseWorkItemNotifications.notificationType, "mention"), isNull(pulseWorkItemNotifications.actionedAt), isNull(pulseWorkItemNotifications.deletedAt))),
    ]);
    const personIds = Array.from(new Set([...cascades.map((row: any) => row.personId), ...notifications.map((row: any) => row.personId), ...legacyMentions.map((row: any) => row.personId)]));
    const people = personIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, personIds)) : [];
    const personById = new Map(people.map((person: any) => [person.id, person]));
    const byPerson = new Map<number, { cascadeIds: Set<string>; notificationCount: number; oldestAt: Date | null }>();
    const add = (personId: number, createdAt: Date, kind: "cascade" | "notification", messageId?: string) => {
      const current = byPerson.get(personId) ?? { cascadeIds: new Set<string>(), notificationCount: 0, oldestAt: null };
      if (kind === "cascade" && messageId) current.cascadeIds.add(messageId);
      if (kind === "notification") current.notificationCount += 1;
      if (!current.oldestAt || new Date(createdAt).getTime() < new Date(current.oldestAt).getTime()) current.oldestAt = createdAt;
      byPerson.set(personId, current);
    };
    cascades.forEach((row: any) => add(row.personId, row.createdAt, "cascade", row.messageId));
    notifications.forEach((row: any) => add(row.personId, row.createdAt, "notification"));
    legacyMentions.forEach((row: any) => add(row.personId, row.createdAt, "notification"));

    return Array.from(byPerson.entries()).map(([personId, outstanding]) => ({
      personId,
      personName: personById.get(personId)?.name ?? "Former Pulse member",
      unacknowledgedCascades: outstanding.cascadeIds.size,
      unclearedNotifications: outstanding.notificationCount,
      oldestAt: outstanding.oldestAt,
    })).sort((left, right) => new Date(left.oldestAt ?? 0).getTime() - new Date(right.oldestAt ?? 0).getTime());
  }),
});
