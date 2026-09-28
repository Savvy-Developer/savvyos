import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  pulseCascadeDestinations,
  pulseCascadeRecipients,
  pulseCascadingMessages,
  pulseMeetings,
} from "../../drizzle/schema";
import { getCascadeRoutingPresentation } from "../../shared/pulseCascadePresentation";
import { decodeCascadeContent } from "../../shared/pulseCascadeContent";
import { visible_meeting_ids } from "./access";

export type CascadePayload = {
  id: string;
  subject: string;
  body: string;
  fromMeetingId: string;
  fromMeetingName: string;
  toMeetingNames: string[];
  createdAt: Date;
  recipientCount: number;
  acknowledgedCount: number;
  myAcknowledgedAt: Date | null;
  canAcknowledge: boolean;
  recipientMeetingIds: string[];
  destinationMeetingIds: string[];
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
    .where(and(inArray(pulseCascadingMessages.id, messageIds), eq(pulseCascadingMessages.deliveryStatus, "published"), isNull(pulseCascadingMessages.deletedAt)))
    .orderBy(desc(pulseCascadingMessages.createdAt));

  if (!messages.length) return [];
  const ids = messages.map((message: any) => message.id);
  const destinations = await db.select({
    cascadingMessageId: pulseCascadeDestinations.cascadingMessageId,
    meetingId: pulseCascadeDestinations.meetingId,
    meetingName: pulseMeetings.name,
  })
    .from(pulseCascadeDestinations)
    .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseCascadeDestinations.meetingId))
    .where(inArray(pulseCascadeDestinations.cascadingMessageId, ids))
    .orderBy(asc(pulseMeetings.name));
  const recipients = await db.select({
    cascadingMessageId: pulseCascadeRecipients.cascadingMessageId,
    personId: pulseCascadeRecipients.personId,
    viaMeetingId: pulseCascadeRecipients.viaMeetingId,
    acknowledgedAt: pulseCascadeRecipients.acknowledgedAt,
  })
    .from(pulseCascadeRecipients)
    .where(inArray(pulseCascadeRecipients.cascadingMessageId, ids));

  const destinationNames = new Map<string, string[]>();
  const destinationMeetingIds = new Map<string, string[]>();
  destinations.forEach((destination: any) => {
    const names = destinationNames.get(destination.cascadingMessageId) ?? [];
    names.push(destination.meetingName);
    destinationNames.set(destination.cascadingMessageId, names);
    const ids = destinationMeetingIds.get(destination.cascadingMessageId) ?? [];
    ids.push(destination.meetingId);
    destinationMeetingIds.set(destination.cascadingMessageId, ids);
  });

  const recipientStates = new Map<string, Map<number, { acknowledgedAt: Date | null; viaMeetingId: string }[]>>();
  recipients.forEach((recipient: any) => {
    const byPerson = recipientStates.get(recipient.cascadingMessageId) ?? new Map();
    const rows = byPerson.get(recipient.personId) ?? [];
    rows.push({ acknowledgedAt: recipient.acknowledgedAt, viaMeetingId: recipient.viaMeetingId });
    byPerson.set(recipient.personId, rows);
    recipientStates.set(recipient.cascadingMessageId, byPerson);
  });

  return messages.map((message: any) => {
    const content = decodeCascadeContent(message.body);
    const byPerson = recipientStates.get(message.id) ?? new Map();
    const myRows = byPerson.get(viewerId) ?? [];
    const recipientCount = byPerson.size;
    const allRecipientRows = Array.from(byPerson.values()) as Array<Array<{ acknowledgedAt: Date | null; viaMeetingId: string }>>;
    const acknowledgedCount = allRecipientRows.filter((rows) => rows.length > 0 && rows.every((row) => !!row.acknowledgedAt)).length;
    const myAcknowledgedAt = myRows.length && myRows.every((row: { acknowledgedAt: Date | null; viaMeetingId: string }) => !!row.acknowledgedAt)
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
      subject: content.subject,
      body: content.body,
      ...details,
      myAcknowledgedAt,
      canAcknowledge: myRows.length > 0 && !myAcknowledgedAt,
      recipientMeetingIds: Array.from(new Set(myRows.map((row: any) => row.viaMeetingId))),
      destinationMeetingIds: destinationMeetingIds.get(message.id) ?? [],
      routing: getCascadeRoutingPresentation(details),
    };
  });
}

/** Messages render only while the viewer can still see their source and local recipient context. */
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
  const visibleIds = await visible_meeting_ids(db, viewerId);
  const messages = await hydrateCascadeMessages(db, viewerId, Array.from(new Set(rows.map((row: any) => row.id))) as string[]);
  return messages.filter((message) => (
    visibleIds.includes(message.fromMeetingId)
    && (message.fromMeetingId === meetingId || message.recipientMeetingIds.includes(meetingId))
  ));
}

/** My Work keeps the frozen delivery record but honors current meeting access. */
export async function getPendingCascadePayloads(db: any, viewerId: number) {
  const rows = await db.select({ id: pulseCascadeRecipients.cascadingMessageId })
    .from(pulseCascadeRecipients)
    .innerJoin(pulseCascadingMessages, eq(pulseCascadingMessages.id, pulseCascadeRecipients.cascadingMessageId))
    .where(and(
      eq(pulseCascadeRecipients.personId, viewerId),
      isNull(pulseCascadeRecipients.acknowledgedAt),
      isNull(pulseCascadingMessages.deletedAt),
    ));
  const visibleIds = await visible_meeting_ids(db, viewerId);
  const messages = await hydrateCascadeMessages(db, viewerId, Array.from(new Set(rows.map((row: any) => row.id))) as string[]);
  return messages.filter((message) => (
    visibleIds.includes(message.fromMeetingId)
    && message.recipientMeetingIds.some((meetingId) => visibleIds.includes(meetingId))
  ));
}
