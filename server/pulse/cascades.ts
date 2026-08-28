import { TRPCError } from "@trpc/server";
import { pulseMemberProcedure, pulseProcedure } from "./authorization";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  pulseCascadeDestinations,
  pulseCascadeRecipients,
  pulseCascadingMessages,
  pulseMeetingMembers,
  pulseNotifications,
  pulseMeetings,
  users,
} from "../../drizzle/schema";
import { getCascadeRoutingPresentation } from "../../shared/pulseCascadePresentation";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { getPendingCascadePayloads } from "./cascadePayload";
import { is_visible_meeting_manager, require_visible_meeting, visible_meeting_ids } from "./access";
import { getPulseNotificationPreference } from "./notifications";

const id = () => crypto.randomUUID();

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  return db;
}

export const pulseCascadesRouter = router({
  send: pulseProcedure
    .input(z.object({
      fromMeetingId: z.string().uuid(),
      toMeetingIds: z.array(z.string().uuid()).min(1).max(20),
      body: z.string().trim().min(1).max(4000),
    }).refine((input) => !input.toMeetingIds.includes(input.fromMeetingId), {
      message: "Choose another meeting to receive this message.",
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      if (!await is_visible_meeting_manager(db, ctx.user.id, input.fromMeetingId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This meeting is not available." });
      }

      const destinationIds = Array.from(new Set(input.toMeetingIds));
      for (const targetId of destinationIds) await require_visible_meeting(db, ctx.user.id, targetId);
      const [sourceMeeting] = await db.select({ name: pulseMeetings.name }).from(pulseMeetings).where(eq(pulseMeetings.id, input.fromMeetingId)).limit(1);
      const destinationRows = await db.select({ id: pulseMeetings.id, name: pulseMeetings.name }).from(pulseMeetings)
        .where(inArray(pulseMeetings.id, destinationIds));
      const destinationNameById = new Map(destinationRows.map((row: any) => [row.id, row.name]));
      const toMeetingNames = destinationIds.map((destinationId) => destinationNameById.get(destinationId)).filter(Boolean) as string[];
      const messageId = id();
      const createdAt = new Date();
      const frozenRecipients: Array<{ personId: number; viaMeetingId: string }> = [];

      for (const targetId of destinationIds) {
        const members = await db.select({ personId: pulseMeetingMembers.personId })
          .from(pulseMeetingMembers)
          .where(and(
            eq(pulseMeetingMembers.meetingId, targetId),
            isNull(pulseMeetingMembers.removedAt),
            isNull(pulseMeetingMembers.deletedAt),
          ));
        members.forEach((member: any) => frozenRecipients.push({ personId: member.personId, viaMeetingId: targetId }));
      }

      const recipientIds = Array.from(new Set(frozenRecipients.map((recipient) => recipient.personId)));
      const recipientUsers = recipientIds.length
        ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users)
          .where(inArray(users.id, recipientIds))
        : [];
      const recipientUserById = new Map(recipientUsers.map((user: any) => [user.id, user]));
      const recipientsWithSourceAccess = new Set<number>();
      for (const recipientId of recipientIds) {
        const visibleIds = await visible_meeting_ids(db, recipientId);
        if (visibleIds.includes(input.fromMeetingId)) recipientsWithSourceAccess.add(recipientId);
      }
      const invisibleRecipientCount = recipientIds.length - recipientsWithSourceAccess.size;
      if (invisibleRecipientCount > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This message cannot be sent because one or more recipients cannot see the source meeting. Add them to the source meeting first.",
        });
      }

      const preferences = new Map<number, { inApp: boolean; email: boolean }>();
      for (const recipientId of recipientIds) {
        preferences.set(recipientId, await getPulseNotificationPreference(db, recipientId, "cascade_sent"));
      }
      const routing = getCascadeRoutingPresentation({
        fromMeetingName: sourceMeeting?.name ?? "A Pulse meeting",
        toMeetingNames,
        createdAt,
        recipientCount: recipientIds.length,
        acknowledgedCount: 0,
      });
      const notificationRecipients = recipientIds.filter((recipientId) => preferences.get(recipientId)?.inApp);

      await db.transaction(async (tx: any) => {
        await tx.insert(pulseCascadingMessages).values({
          id: messageId,
          fromMeetingId: input.fromMeetingId,
          // Kept for backward compatibility. Frozen destination rows are authoritative.
          toMeetingId: destinationIds[0],
          body: input.body,
          createdById: ctx.user.id,
          createdAt,
        });
        await tx.insert(pulseCascadeDestinations).values(destinationIds.map((meetingId) => ({
          id: id(),
          cascadingMessageId: messageId,
          meetingId,
        })));
        if (frozenRecipients.length) {
          await tx.insert(pulseCascadeRecipients).values(frozenRecipients.map((recipient) => ({
            id: id(),
            cascadingMessageId: messageId,
            personId: recipient.personId,
            viaMeetingId: recipient.viaMeetingId,
          })));
        }
        if (notificationRecipients.length) {
          await tx.insert(pulseNotifications).values(notificationRecipients.map((personId) => ({
            id: id(),
            personId,
            notificationType: "cascade" as const,
            requiresAction: true,
            sourceType: "cascade",
            sourceId: messageId,
            meetingId: input.fromMeetingId,
            body: routing.text,
          })));
        }
      });

      const emailRecipients = recipientIds.filter((recipientId) => (
        preferences.get(recipientId)?.email && !!recipientUserById.get(recipientId)?.email
      ));
      const emailResults = await Promise.all(emailRecipients.map(async (recipientId) => {
        const recipient = recipientUserById.get(recipientId);
        return sendTransactionalEmail("cascade_sent", {
          recipientEmail: recipient.email,
          recipientName: recipient.name ?? undefined,
          pulseMeetingName: sourceMeeting?.name ?? "A Pulse meeting",
          pulseCascadeSource: routing.source,
          pulseCascadeDestinations: routing.destinations,
          pulseCascadeAcknowledgment: routing.acknowledgment,
          pulseCascadeBody: input.body,
          pulseActionUrl: "https://os.savvy-agents.com/pulse/mission",
        }, { idempotencyKey: `pulse-cascade-${messageId}-${recipientId}` });
      }));

      return {
        messageId,
        recipientCount: recipientIds.length,
        notificationCount: notificationRecipients.length,
        emailCount: emailResults.filter((result) => result.sent).length,
      };
    }),

  acknowledge: pulseMemberProcedure
    .input(z.object({ messageId: z.string().uuid(), from: z.string().max(64).default("pulse") }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const rows = await db.select({ id: pulseCascadeRecipients.id })
        .from(pulseCascadeRecipients)
        .where(and(
          eq(pulseCascadeRecipients.cascadingMessageId, input.messageId),
          eq(pulseCascadeRecipients.personId, ctx.user.id),
        ));
      // A frozen recipient row remains the authority after meeting membership changes.
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "This message is not available." });

      const now = new Date();
      await db.transaction(async (tx: any) => {
        await tx.update(pulseCascadeRecipients).set({ acknowledgedAt: now, acknowledgedFrom: input.from })
          .where(and(
            eq(pulseCascadeRecipients.cascadingMessageId, input.messageId),
            eq(pulseCascadeRecipients.personId, ctx.user.id),
          ));
        await tx.update(pulseNotifications).set({ clearedAt: now })
          .where(and(
            eq(pulseNotifications.personId, ctx.user.id),
            eq(pulseNotifications.sourceType, "cascade"),
            eq(pulseNotifications.sourceId, input.messageId),
            isNull(pulseNotifications.clearedAt),
          ));
      });
      return { success: true };
    }),

  pending: pulseProcedure.query(async ({ ctx }) => {
    const db = await database();
    return getPendingCascadePayloads(db, ctx.user.id);
  }),
});
