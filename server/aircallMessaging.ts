import { and, eq } from "drizzle-orm";
import {
  aircallIsaAssignments,
  aircallMessages,
  communications,
} from "../drizzle/schema";
import { getDb } from "./db";
import { findContactByPhoneDB, normalizePhone } from "./aircall";

export type AircallMessageData = {
  id: string;
  status?: string | null;
  direction?: "inbound" | "outbound" | null;
  created_at?: number | string | null;
  sent_at?: number | string | null;
  updated_at?: number | string | null;
  raw_digits?: string | null;
  body?: string | null;
  number?: {
    id?: number | null;
    name?: string | null;
    digits?: string | null;
  } | null;
};

export type AircallMessageWebhook = {
  event?: string;
  event_name?: string;
  resource?: string;
  timestamp?: number;
  token?: string;
  data: AircallMessageData;
};

type PersistOptions = {
  contactId?: number | null;
  savvyUserId?: number | null;
};

function asDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toStoredPhone(value: string | null | undefined): string | null {
  const digits = normalizePhone(value);
  if (!digits) return value?.trim() || null;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

function resolveDirection(value: unknown): "inbound" | "outbound" {
  return value === "inbound" ? "inbound" : "outbound";
}

function messageTitle(direction: "inbound" | "outbound"): string {
  return direction === "inbound"
    ? "Inbound text via Aircall"
    : "Outbound text via Aircall";
}

/**
 * Idempotently writes an Aircall native-message event into SavvyOS. Outbound API
 * sends call this immediately; webhooks subsequently update delivery status.
 */
export async function persistAircallMessage(
  payload: AircallMessageData,
  options: PersistOptions = {}
): Promise<{ contactId: number | null; communicationId: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!payload?.id || !payload.number?.id) {
    throw new Error(
      "Aircall message payload is missing its message or number identifier"
    );
  }

  const direction = resolveDirection(payload.direction);
  const status =
    payload.status?.trim() ||
    (direction === "inbound" ? "received" : "pending");
  const participant = toStoredPhone(payload.raw_digits);
  const lineNumber = toStoredPhone(payload.number.digits);
  const sentAt = asDate(payload.sent_at ?? payload.created_at);
  const receivedAt = direction === "inbound" ? (sentAt ?? new Date()) : null;

  const [existing] = await db
    .select()
    .from(aircallMessages)
    .where(eq(aircallMessages.aircallMessageId, String(payload.id)))
    .limit(1);

  const assignment = options.savvyUserId
    ? null
    : ((
        await db
          .select({ savvyUserId: aircallIsaAssignments.savvyUserId })
          .from(aircallIsaAssignments)
          .where(eq(aircallIsaAssignments.aircallNumberId, payload.number.id))
          .limit(1)
      )[0] ?? null);

  let contactId = options.contactId ?? existing?.contactId ?? null;
  if (!contactId && participant) {
    const contact = await findContactByPhoneDB(participant);
    contactId = contact?.id ?? null;
  }
  const savvyUserId =
    options.savvyUserId ??
    existing?.savvyUserId ??
    assignment?.savvyUserId ??
    null;
  let communicationId = existing?.communicationId ?? null;

  if (!existing && contactId) {
    const communication = await db.insert(communications).values({
      type: "sms",
      subject: messageTitle(direction),
      body: payload.body?.trim() || null,
      direction,
      authorId: direction === "outbound" ? savvyUserId : null,
      relatedContactId: contactId,
      communicatedAt: sentAt ?? receivedAt ?? new Date(),
    });
    communicationId = Number(communication[0].insertId);
  } else if (communicationId) {
    await db
      .update(communications)
      .set({
        subject: messageTitle(direction),
        body: payload.body?.trim() || null,
        direction,
        ...(contactId ? { relatedContactId: contactId } : {}),
        ...(direction === "outbound" && savvyUserId
          ? { authorId: savvyUserId }
          : {}),
        communicatedAt: sentAt ?? receivedAt ?? new Date(),
      })
      .where(eq(communications.id, communicationId));
  }

  const values = {
    contactId,
    communicationId,
    savvyUserId,
    aircallNumberId: payload.number.id,
    direction,
    status,
    fromNumber: direction === "inbound" ? participant : lineNumber,
    toNumber: direction === "inbound" ? lineNumber : participant,
    body: payload.body?.trim() || null,
    sentAt,
    receivedAt,
    rawPayload: payload as Record<string, unknown>,
  };

  if (existing) {
    await db
      .update(aircallMessages)
      .set(values)
      .where(eq(aircallMessages.id, existing.id));
  } else {
    await db.insert(aircallMessages).values({
      aircallMessageId: String(payload.id),
      ...values,
    });
  }

  return { contactId, communicationId };
}

export function isAircallMessageWebhook(
  payload: unknown
): payload is AircallMessageWebhook {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AircallMessageWebhook>;
  const event = candidate.event ?? candidate.event_name;
  return Boolean(
    event?.startsWith("message.") &&
      candidate.data &&
      typeof candidate.data.id === "string" &&
      typeof candidate.data.number?.id === "number"
  );
}
