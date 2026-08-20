import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  pulseCascadeDestinations,
  pulseCascadeRecipients,
  pulseCascadingMessages,
  pulseMeetings,
} from "../../drizzle/schema";
import { getCascadeRoutingPresentation } from "../../shared/pulseCascadePresentation";

export type CascadePayload = {
  id: string;
  body: string;
  fromMeetingId: string;
  fromMeetingName: string;
  toMeetingNames: string[];
  createdAt: Date;
  recipientCount: number;
  acknowledgedCount: number;
  myAcknowledgedAt: Date | null;
  canAcknowledge: boolean;
  routing: ReturnType<typeof getCascadeRoutingPresentation>;
};

async function hydrateCascadeMessages(db: any, viewerId: number, messageIds: string[]): Promise<CascadePayload[]> {
  if (!messageIds.length) return [];
  const fromMeeting = pulseMeetings;
  const messages = await db.select({
    id: pulseCascadingMessages.id,
    body: pulseCascadingMessages.body,
    fromMeetingId: pulseCascadingMessages.fromMeetingId,
    fromMeetingName: fromMeeting.name,
    createdAt: pulseCascadingMessages.createdAt,
  })
    .from(pulseCascadingMessages)
    .innerJoin(fromMeeting, eq(fromMeeting.id, pulseCascadingMessages.fromMeetingId))
    .where(and(inArray(pulseCascadingMessages.id, messageIds), isNull(pulseCascadingMessages.deletedAt)))
    .orderBy(desc(pulseCascadingMessages.createdAt));

  if (!messages.length) return [];
  const ids = messages.map((message: any) => message.id);
  const destinations = await db.select({
    cascadingMessageId: pulseCascadeDestinations.cascadingMessageId,
    meetingName: pulseMeetings.name,
  })
    .from(pulseCascadeDestinations)
    .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseCascadeDestinations.meetingId))
    .where(inArray(pulseCascadeDestinations.cascadingMessageId, ids))
    .orderBy(asc(pulseMeetings.name));
  const recipients = await db.select({
    cascadingMessageId: pulseCascadeRecipients.cascadingMessageId,
    personId: pulseCascadeRecipients.personId,
    acknowledgedAt: pulseCascadeRecipients.acknowledgedAt,
  })
    .from(pulseCascadeRecipients)
    .where(inArray(pulseCascadeRecipients.cascadingMessageId, ids));

  const destinationNames = new Map<string, string[]>();
  destinations.forEach((destination: any) => {
    const names = destinationNames.get(destination.cascadingMessageId) ?? [];
    names.push(destination.meetingName);
    destinationNames.set(destination.cascadingMessageId, names);
  });

  const recipientStates = new Map<string, Map<number, { acknowledgedAt: Date | null }[]>>();
  recipients.forEach((recipient: any) => {
    const byPerson = recipientStates.get(recipient.cascadingMessageId) ?? new Map();
    const rows = byPerson.get(recipient.personId) ?? [];
    rows.push({ acknowledgedAt: recipient.acknowledgedAt });
    byPerson.set(recipient.personId, rows);
    recipientStates.set(recipient.cascadingMessageId, byPerson);
  });

  return messages.map((message: any) => {
    const byPerson = recipientStates.get(message.id) ?? new Map();
    const myRows = byPerson.get(viewerId) ?? [];
    const recipientCount = byPerson.size;
    const allRecipientRows = Array.from(byPerson.values()) as Array<Array<{ acknowledgedAt: Date | null }>>;
    const acknowledgedCount = allRecipientRows.filter((rows) => rows.length > 0 && rows.every((row) => !!row.acknowledgedAt)).length;
    const myAcknowledgedAt = myRows.length && myRows.every((row: { acknowledgedAt: Date | null }) => !!row.acknowledgedAt)
      ? myRows[0]?.acknowledgedAt ?? null
      : null;
    const details = {
      fromMeetingName: message.fromMeetingName,
      toMeetingNames: destinationNames.get(message.id) ?? [],
      createdAt: message.createdAt,
      recipientCount,
      acknowledgedCount,
    };

    return {
      ...message,
      ...details,
      myAcknowledgedAt,
      canAcknowledge: myRows.length > 0 && !myAcknowledgedAt,
      routing: getCascadeRoutingPresentation(details),
    };
  });
}

/** Messages are visible in either their source meeting or any frozen destination meeting. */
export async function getMeetingCascadePayloads(db: any, viewerId: number, meetingId: string) {
  const rows = await db.select({ id: pulseCascadingMessages.id })
    .from(pulseCascadingMessages)
    .leftJoin(pulseCascadeDestinations, eq(pulseCascadeDestinations.cascadingMessageId, pulseCascadingMessages.id))
    .where(and(
      isNull(pulseCascadingMessages.deletedAt),
      or(
        eq(pulseCascadingMessages.fromMeetingId, meetingId),
        eq(pulseCascadeDestinations.meetingId, meetingId),
      ),
    ));
  return hydrateCascadeMessages(db, viewerId, Array.from(new Set(rows.map((row: any) => row.id))) as string[]);
}

/** Mission Control is based on the frozen recipient record, never current membership. */
export async function getPendingCascadePayloads(db: any, viewerId: number) {
  const rows = await db.select({ id: pulseCascadeRecipients.cascadingMessageId })
    .from(pulseCascadeRecipients)
    .innerJoin(pulseCascadingMessages, eq(pulseCascadingMessages.id, pulseCascadeRecipients.cascadingMessageId))
    .where(and(
      eq(pulseCascadeRecipients.personId, viewerId),
      isNull(pulseCascadeRecipients.acknowledgedAt),
      isNull(pulseCascadingMessages.deletedAt),
    ));
  return hydrateCascadeMessages(db, viewerId, Array.from(new Set(rows.map((row: any) => row.id))) as string[]);
}
