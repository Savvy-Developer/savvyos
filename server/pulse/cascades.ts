import { TRPCError } from "@trpc/server";
import { hasPulseCapability, pulseMemberProcedure, pulseProcedure } from "./authorization";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  pulseCascadeDestinations,
  pulseCascadeRecipients,
  pulseCascadingMessages,
  pulseActivityLog,
  pulseMeetingMembers,
  pulseMeetingSessions,
  pulseMeetings,
  pulseNotifications,
  users,
} from "../../drizzle/schema";
import { getCascadeRoutingPresentation } from "../../shared/pulseCascadePresentation";
import {
  decodeCascadeContent,
  encodeCascadeContent,
} from "../../shared/pulseCascadeContent";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { getPendingCascadePayloads } from "./cascadePayload";
import {
  is_visible_meeting_manager,
  require_visible_meeting,
  visible_meeting_ids,
} from "./access";
import { getPulseNotificationPreference } from "./notifications";

const id = () => crypto.randomUUID();
const cascadeInput = z.object({
  toMeetingIds: z.array(z.string().uuid()).min(1).max(20),
  subject: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(4000),
});

type CascadeInput = z.infer<typeof cascadeInput>;
type SourceMeeting = { id: string; name: string };

async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pulse is not available right now. Please try again.",
    });
  return db;
}

/** A team acknowledgment is a live-runner decision, made by the facilitator, Administrator, or a runner-authorized Pulse user. */
async function requireTeamCascadeAcknowledgmentAuthority(db: any, user: { id: number }, meetingId: string, sessionId: string) {
  const meeting = await require_visible_meeting(db, user.id, meetingId);
  const canRun = await is_visible_meeting_manager(db, user.id, meetingId) || await hasPulseCapability(db, user, "run_l10s");
  if (!canRun) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only this meeting’s facilitator, Administrator, or a Pulse user with meeting-run authority can acknowledge a cascade for the team." });
  }
  const [session] = await db.select({ id: pulseMeetingSessions.id })
    .from(pulseMeetingSessions)
    .where(and(
      eq(pulseMeetingSessions.id, sessionId),
      eq(pulseMeetingSessions.meetingId, meetingId),
      inArray(pulseMeetingSessions.status, ["running", "paused"]),
    ))
    .limit(1);
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "This active meeting session is not available." });
  return meeting;
}

/** Resolves the frozen delivery audience and rejects cross-meeting context leaks before any data is written. */
async function prepareCascadeDelivery(
  db: any,
  actorId: number,
  sourceMeeting: SourceMeeting,
  toMeetingIds: string[]
) {
  const destinationIds = Array.from(new Set(toMeetingIds));
  if (destinationIds.includes(sourceMeeting.id)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose another meeting to receive this message.",
    });
  }
  for (const targetId of destinationIds)
    await require_visible_meeting(db, actorId, targetId);

  const destinations = await db
    .select({ id: pulseMeetings.id, name: pulseMeetings.name })
    .from(pulseMeetings)
    .where(inArray(pulseMeetings.id, destinationIds));
  const destinationNameById = new Map(
    destinations.map((destination: any) => [destination.id, destination.name])
  );
  const toMeetingNames = destinationIds
    .map(destinationId => destinationNameById.get(destinationId))
    .filter(Boolean) as string[];

  const frozenRecipients: Array<{ personId: number; viaMeetingId: string }> =
    [];
  for (const targetId of destinationIds) {
    const members = await db
      .select({ personId: pulseMeetingMembers.personId })
      .from(pulseMeetingMembers)
      .where(
        and(
          eq(pulseMeetingMembers.meetingId, targetId),
          isNull(pulseMeetingMembers.removedAt),
          isNull(pulseMeetingMembers.deletedAt)
        )
      );
    members.forEach((member: any) =>
      frozenRecipients.push({
        personId: member.personId,
        viaMeetingId: targetId,
      })
    );
  }

  const recipientIds = Array.from(
    new Set(frozenRecipients.map(recipient => recipient.personId))
  );
  for (const recipientId of recipientIds) {
    const sourceAccess = await visible_meeting_ids(db, recipientId);
    if (!sourceAccess.includes(sourceMeeting.id)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "This cascade cannot be sent because one or more recipients cannot see the source meeting. Add them to the source meeting first.",
      });
    }
  }
  const recipientUsers: Array<{
    id: number;
    name: string | null;
    email: string | null;
  }> = recipientIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, recipientIds))
    : [];

  return {
    destinationIds,
    toMeetingNames,
    frozenRecipients,
    recipientIds,
    recipientUserById: new Map<
      number,
      { id: number; name: string | null; email: string | null }
    >(recipientUsers.map(recipient => [recipient.id, recipient])),
  };
}

/** Validates draft routes before they are saved so a closeout cannot fail on an avoidable access mismatch. */
export async function validateCascadeDelivery(
  db: any,
  actorId: number,
  sourceMeeting: SourceMeeting,
  toMeetingIds: string[]
) {
  await prepareCascadeDelivery(db, actorId, sourceMeeting, toMeetingIds);
}

async function deliveryPreferences(db: any, recipientIds: number[]) {
  const entries = await Promise.all(
    recipientIds.map(
      async recipientId =>
        [
          recipientId,
          await getPulseNotificationPreference(db, recipientId, "cascade_sent"),
        ] as const
    )
  );
  return new Map(entries);
}

async function sendCascadeEmails({
  messageId,
  sourceMeeting,
  subject,
  body,
  createdAt,
  toMeetingNames,
  recipientIds,
  recipientUserById,
  preferences,
}: {
  messageId: string;
  sourceMeeting: SourceMeeting;
  subject: string;
  body: string;
  createdAt: Date;
  toMeetingNames: string[];
  recipientIds: number[];
  recipientUserById: Map<
    number,
    { id: number; name: string | null; email: string | null }
  >;
  preferences: Map<number, { inApp: boolean; email: boolean }>;
}) {
  const routing = getCascadeRoutingPresentation({
    fromMeetingName: sourceMeeting.name,
    toMeetingNames,
    createdAt,
    recipientCount: recipientIds.length,
    acknowledgedCount: 0,
  });
  const emailRecipients = recipientIds.filter(
    recipientId =>
      preferences.get(recipientId)?.email &&
      recipientUserById.get(recipientId)?.email
  );
  const results = await Promise.all(
    emailRecipients.map(async recipientId => {
      const recipient = recipientUserById.get(recipientId)!;
      return sendTransactionalEmail(
        "cascade_sent",
        {
          recipientEmail: recipient.email!,
          recipientName: recipient.name ?? undefined,
          pulseMeetingName: sourceMeeting.name,
          pulseCascadeSubject: subject,
          pulseCascadeSource: routing.source,
          pulseCascadeDestinations: routing.destinations,
          pulseCascadeAcknowledgment: routing.acknowledgment,
          pulseCascadeBody: body,
          pulseActionUrl: "https://os.savvy-agents.com/pulse/dashboard",
        },
        { idempotencyKey: `pulse-cascade-${messageId}-${recipientId}` }
      );
    })
  );
  return results.filter(result => result.sent || result.skipped).length;
}

/** Creates and immediately delivers a source-meeting cascade. */
export async function sendPublishedCascade(
  db: any,
  actorId: number,
  sourceMeeting: SourceMeeting,
  input: CascadeInput
) {
  const delivery = await prepareCascadeDelivery(
    db,
    actorId,
    sourceMeeting,
    input.toMeetingIds
  );
  const preferences = await deliveryPreferences(db, delivery.recipientIds);
  const messageId = id();
  const publishedAt = new Date();
  const routing = getCascadeRoutingPresentation({
    fromMeetingName: sourceMeeting.name,
    toMeetingNames: delivery.toMeetingNames,
    createdAt: publishedAt,
    recipientCount: delivery.recipientIds.length,
    acknowledgedCount: 0,
  });
  const notificationRecipientIds = delivery.recipientIds.filter(
    recipientId => preferences.get(recipientId)?.inApp
  );

  await db.transaction(async (tx: any) => {
    await tx.insert(pulseCascadingMessages).values({
      id: messageId,
      fromMeetingId: sourceMeeting.id,
      toMeetingId: delivery.destinationIds[0],
      deliveryStatus: "published",
      publishedAt,
      body: encodeCascadeContent(input.subject, input.body),
      createdById: actorId,
      createdAt: publishedAt,
    });
    await tx.insert(pulseCascadeDestinations).values(
      delivery.destinationIds.map(meetingId => ({
        id: id(),
        cascadingMessageId: messageId,
        meetingId,
      }))
    );
    if (delivery.frozenRecipients.length) {
      await tx.insert(pulseCascadeRecipients).values(
        delivery.frozenRecipients.map(recipient => ({
          id: id(),
          cascadingMessageId: messageId,
          personId: recipient.personId,
          viaMeetingId: recipient.viaMeetingId,
        }))
      );
    }
    if (notificationRecipientIds.length) {
      await tx.insert(pulseNotifications).values(
        notificationRecipientIds.map(personId => ({
          id: id(),
          personId,
          notificationType: "cascade" as const,
          requiresAction: true,
          sourceType: "cascade",
          sourceId: messageId,
          meetingId: sourceMeeting.id,
          body: `${input.subject}\n${routing.text}`,
        }))
      );
    }
  });

  const emailCount = await sendCascadeEmails({
    messageId,
    sourceMeeting,
    subject: input.subject,
    body: input.body,
    createdAt: publishedAt,
    toMeetingNames: delivery.toMeetingNames,
    recipientIds: delivery.recipientIds,
    recipientUserById: delivery.recipientUserById,
    preferences,
  });
  return {
    messageId,
    recipientCount: delivery.recipientIds.length,
    notificationCount: notificationRecipientIds.length,
    emailCount,
  };
}

/** Publishes an existing L10 draft after re-checking its current recipient access boundary. */
export async function publishDraftCascade(
  db: any,
  actorId: number,
  message: {
    id: string;
    fromMeetingId: string;
    body: string;
    createdById: number;
  }
) {
  const content = decodeCascadeContent(message.body);
  const [source] = await db
    .select({ id: pulseMeetings.id, name: pulseMeetings.name })
    .from(pulseMeetings)
    .where(eq(pulseMeetings.id, message.fromMeetingId))
    .limit(1);
  if (!source)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This source meeting is no longer available.",
    });
  const destinations = await db
    .select({ meetingId: pulseCascadeDestinations.meetingId })
    .from(pulseCascadeDestinations)
    .where(eq(pulseCascadeDestinations.cascadingMessageId, message.id));
  const delivery = await prepareCascadeDelivery(
    db,
    actorId,
    source,
    destinations.map((destination: any) => destination.meetingId)
  );
  const preferences = await deliveryPreferences(db, delivery.recipientIds);
  const publishedAt = new Date();
  const routing = getCascadeRoutingPresentation({
    fromMeetingName: source.name,
    toMeetingNames: delivery.toMeetingNames,
    createdAt: publishedAt,
    recipientCount: delivery.recipientIds.length,
    acknowledgedCount: 0,
  });
  const notificationRecipientIds = delivery.recipientIds.filter(
    recipientId => preferences.get(recipientId)?.inApp
  );

  await db.transaction(async (tx: any) => {
    if (delivery.frozenRecipients.length) {
      await tx.insert(pulseCascadeRecipients).values(
        delivery.frozenRecipients.map(recipient => ({
          id: id(),
          cascadingMessageId: message.id,
          personId: recipient.personId,
          viaMeetingId: recipient.viaMeetingId,
        }))
      );
    }
    if (notificationRecipientIds.length) {
      await tx.insert(pulseNotifications).values(
        notificationRecipientIds.map(personId => ({
          id: id(),
          personId,
          notificationType: "cascade" as const,
          requiresAction: true,
          sourceType: "cascade",
          sourceId: message.id,
          meetingId: source.id,
          body: `${content.subject}\n${routing.text}`,
        }))
      );
    }
    await tx
      .update(pulseCascadingMessages)
      .set({ deliveryStatus: "published", publishedAt })
      .where(eq(pulseCascadingMessages.id, message.id));
  });

  const emailCount = await sendCascadeEmails({
    messageId: message.id,
    sourceMeeting: source,
    subject: content.subject,
    body: content.body,
    createdAt: publishedAt,
    toMeetingNames: delivery.toMeetingNames,
    recipientIds: delivery.recipientIds,
    recipientUserById: delivery.recipientUserById,
    preferences,
  });
  return {
    id: message.id,
    subject: content.subject,
    body: content.body,
    destinations: delivery.toMeetingNames,
    recipientCount: delivery.recipientIds.length,
    emailCount,
  };
}

export const pulseCascadesRouter = router({
  send: pulseProcedure
    .input(z.object({ fromMeetingId: z.string().uuid() }).merge(cascadeInput))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      if (
        !(await is_visible_meeting_manager(
          db,
          ctx.user.id,
          input.fromMeetingId
        ))
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This meeting is not available.",
        });
      }
      const source = await require_visible_meeting(
        db,
        ctx.user.id,
        input.fromMeetingId
      );
      return sendPublishedCascade(
        db,
        ctx.user.id,
        { id: source.id, name: source.name },
        input
      );
    }),

  acknowledge: pulseMemberProcedure
    .input(
      z.object({
        messageId: z.string().uuid(),
        from: z.string().max(64).default("pulse"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const rows = await db
        .select({
          id: pulseCascadeRecipients.id,
          viaMeetingId: pulseCascadeRecipients.viaMeetingId,
          fromMeetingId: pulseCascadingMessages.fromMeetingId,
        })
        .from(pulseCascadeRecipients)
        .innerJoin(
          pulseCascadingMessages,
          eq(
            pulseCascadingMessages.id,
            pulseCascadeRecipients.cascadingMessageId
          )
        )
        .where(
          and(
            eq(pulseCascadeRecipients.cascadingMessageId, input.messageId),
            eq(pulseCascadeRecipients.personId, ctx.user.id),
            eq(pulseCascadingMessages.deliveryStatus, "published"),
            isNull(pulseCascadingMessages.deletedAt)
          )
        );
      if (!rows.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This message is not available.",
        });
      const visibleIds = await visible_meeting_ids(db, ctx.user.id);
      if (
        !visibleIds.includes(rows[0].fromMeetingId) ||
        !rows.some((row: any) => visibleIds.includes(row.viaMeetingId))
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This message is not available.",
        });
      }

      const now = new Date();
      await db.transaction(async (tx: any) => {
        await tx
          .update(pulseCascadeRecipients)
          .set({ acknowledgedAt: now, acknowledgedFrom: input.from })
          .where(
            and(
              eq(pulseCascadeRecipients.cascadingMessageId, input.messageId),
              eq(pulseCascadeRecipients.personId, ctx.user.id)
            )
          );
        await tx
          .update(pulseNotifications)
          .set({ clearedAt: now })
          .where(
            and(
              eq(pulseNotifications.personId, ctx.user.id),
              eq(pulseNotifications.sourceType, "cascade"),
              eq(pulseNotifications.sourceId, input.messageId),
              isNull(pulseNotifications.clearedAt)
            )
          );
      });
      return { success: true };
    }),

  acknowledgeForMeeting: pulseMemberProcedure
    .input(z.object({
      messageId: z.string().uuid(),
      meetingId: z.string().uuid(),
      sessionId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      await requireTeamCascadeAcknowledgmentAuthority(db, ctx.user, input.meetingId, input.sessionId);
      const visibleIds = await visible_meeting_ids(db, ctx.user.id);
      const [message] = await db.select({
        id: pulseCascadingMessages.id,
        fromMeetingId: pulseCascadingMessages.fromMeetingId,
      })
        .from(pulseCascadingMessages)
        .innerJoin(pulseCascadeDestinations, eq(pulseCascadeDestinations.cascadingMessageId, pulseCascadingMessages.id))
        .where(and(
          eq(pulseCascadingMessages.id, input.messageId),
          eq(pulseCascadeDestinations.meetingId, input.meetingId),
          eq(pulseCascadingMessages.deliveryStatus, "published"),
          isNull(pulseCascadingMessages.deletedAt),
        ))
        .limit(1);
      if (!message || !visibleIds.includes(message.fromMeetingId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This message is not available." });
      }

      const outstanding = await db.select({
        id: pulseCascadeRecipients.id,
        personId: pulseCascadeRecipients.personId,
      })
        .from(pulseCascadeRecipients)
        .where(and(
          eq(pulseCascadeRecipients.cascadingMessageId, input.messageId),
          eq(pulseCascadeRecipients.viaMeetingId, input.meetingId),
          isNull(pulseCascadeRecipients.acknowledgedAt),
        ));
      const recipientIds = Array.from(new Set(outstanding.map((row: any) => row.personId)));
      if (!recipientIds.length) return { success: true, acknowledgedRecipientCount: 0, remainingRecipientCount: 0 };

      const now = new Date();
      let remainingRecipientCount = 0;
      await db.transaction(async (tx: any) => {
        await tx.update(pulseCascadeRecipients)
          .set({ acknowledgedAt: now, acknowledgedFrom: "meeting_runner_team" })
          .where(and(
            eq(pulseCascadeRecipients.cascadingMessageId, input.messageId),
            eq(pulseCascadeRecipients.viaMeetingId, input.meetingId),
            isNull(pulseCascadeRecipients.acknowledgedAt),
          ));
        const remaining = await tx.select({ personId: pulseCascadeRecipients.personId })
          .from(pulseCascadeRecipients)
          .where(and(
            eq(pulseCascadeRecipients.cascadingMessageId, input.messageId),
            inArray(pulseCascadeRecipients.personId, recipientIds),
            isNull(pulseCascadeRecipients.acknowledgedAt),
          ));
        const remainingPersonIds = new Set(remaining.map((row: any) => row.personId));
        remainingRecipientCount = remainingPersonIds.size;
        const clearedPersonIds = recipientIds.filter((personId) => !remainingPersonIds.has(personId));
        if (clearedPersonIds.length) {
          await tx.update(pulseNotifications)
            .set({ clearedAt: now })
            .where(and(
              inArray(pulseNotifications.personId, clearedPersonIds),
              eq(pulseNotifications.sourceType, "cascade"),
              eq(pulseNotifications.sourceId, input.messageId),
              isNull(pulseNotifications.clearedAt),
            ));
        }
        await tx.insert(pulseActivityLog).values({
          id: id(),
          entityType: "cascade",
          entityId: input.messageId,
          personId: ctx.user.id,
          action: "acknowledged_for_meeting",
          newValue: {
            meetingId: input.meetingId,
            sessionId: input.sessionId,
            acknowledgedRecipientCount: recipientIds.length,
          },
        });
      });
      return { success: true, acknowledgedRecipientCount: recipientIds.length, remainingRecipientCount };
    }),

  pending: pulseProcedure.query(async ({ ctx }) => {
    const db = await database();
    return getPendingCascadePayloads(db, ctx.user.id);
  }),
});
