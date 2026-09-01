import { and, eq } from "drizzle-orm";
import {
  aircallIntegrationState,
  aircallIsaAssignments,
  aircallMessages,
  communications,
  contacts,
  marketingTextInboxThreads,
} from "../drizzle/schema";
import { getDb } from "./db";
import { findContactByPhoneDB, normalizePhone } from "./aircall";
import { pauseSmartPlansForSmsReply } from "./smartPlanReplyHandling";

export type AircallMessageData = {
  id?: string;
  group_message_id?: string;
  group_conversation_id?: string;
  participants?: string[];
  status?: string | null;
  direction?: "inbound" | "outbound" | null;
  created_at?: number | string | null;
  sent_at?: number | string | null;
  updated_at?: number | string | null;
  raw_digits?: string | null;
  external_number?: string | null;
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
  direction?: "inbound" | "outbound";
  rawPayload?: Record<string, unknown>;
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

/** Resolve Aircall's sender/recipient variants to a canonical CRM phone value. */
export function messageParticipantNumber(payload: Pick<AircallMessageData, "raw_digits" | "external_number">): string | null {
  return toStoredPhone(payload.raw_digits ?? payload.external_number);
}

function resolveDirection(value: unknown): "inbound" | "outbound" {
  return value === "inbound" ? "inbound" : "outbound";
}

/** Message webhook names are the authoritative source of message direction. */
export function directionFromAircallMessageEvent(event: unknown): "inbound" | "outbound" | undefined {
  if (event === "message.received" || event === "group_message.received") return "inbound";
  if (event === "message.sent" || event === "group_message.sent") return "outbound";
  return undefined;
}

function messageTitle(direction: "inbound" | "outbound"): string {
  return direction === "inbound"
    ? "Inbound text via Aircall"
    : "Outbound text via Aircall";
}

const SMS_MARKETING_OPT_OUT_PATTERN = /^(?:stop|unsubscribe|cancel|end|quit|revoke|opt\s*out)$/i;

function isMarketingOptOut(body: string | null | undefined): boolean {
  return !!body?.trim() && SMS_MARKETING_OPT_OUT_PATTERN.test(body.trim());
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
  const providerMessageId = payload?.id ?? payload?.group_message_id;
  if (!providerMessageId || !payload.number?.id) {
    throw new Error(
      "Aircall message payload is missing its message or number identifier"
    );
  }

  const [existing] = await db
    .select()
    .from(aircallMessages)
    .where(eq(aircallMessages.aircallMessageId, String(providerMessageId)))
    .limit(1);

  // Status-update events do not repeat direction or the full message body, so
  // retain the original record instead of converting a lead reply to outbound.
  const direction = options.direction ?? (payload.direction ? resolveDirection(payload.direction) : existing?.direction ?? "outbound");
  const status = payload.status?.trim() || (direction === "inbound" ? "received" : "pending");
  const participant = messageParticipantNumber(payload);
  const lineNumber = toStoredPhone(payload.number.digits);
  const sentAt = asDate(payload.sent_at ?? payload.created_at) ?? existing?.sentAt ?? null;
  const receivedAt = direction === "inbound" ? (sentAt ?? existing?.receivedAt ?? new Date()) : existing?.receivedAt ?? null;
  const body = payload.body?.trim() || existing?.body || null;
  const fromNumber = direction === "inbound" ? (participant ?? existing?.fromNumber ?? null) : (lineNumber ?? existing?.fromNumber ?? null);
  const toNumber = direction === "inbound" ? (lineNumber ?? existing?.toNumber ?? null) : (participant ?? existing?.toNumber ?? null);

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
    const contact = await findContactByPhoneDB(participant, {
      aircallNumberId: payload.number.id,
    });
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
      body,
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
        // Delivery-status webhooks omit the message body; retain the full
        // original text in the contact's activity rather than blanking it.
        body,
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
    fromNumber,
    toNumber,
    body,
    sentAt,
    receivedAt,
    rawPayload: options.rawPayload ?? payload as Record<string, unknown>,
  };

  // Honor standard carrier-recognized opt-out keywords sent to the dedicated
  // marketing line as soon as the inbound message is persisted.
  if (direction === "inbound" && contactId && isMarketingOptOut(payload.body)) {
    const [integration] = await db
      .select({ marketingNumberId: aircallIntegrationState.marketingNumberId })
      .from(aircallIntegrationState)
      .where(eq(aircallIntegrationState.id, 1))
      .limit(1);
    if (integration?.marketingNumberId === payload.number.id) {
      await db
        .update(contacts)
        .set({
          smsMarketingOptedOutAt: new Date(),
          smsMarketingOptOutReason: `Inbound SMS keyword: ${(payload.body ?? "OPT-OUT").trim().toUpperCase()}`,
        })
        .where(eq(contacts.id, contactId));
    }
    // A fresh reply should return an archived marketing conversation to the
    // working inbox, while preserving the CRM communication history.
    if (integration?.marketingNumberId === payload.number.id) {
      await db
        .update(marketingTextInboxThreads)
        .set({ archivedAt: null, archivedById: null })
        .where(eq(marketingTextInboxThreads.contactId, contactId));
    }
  }

  if (existing) {
    await db
      .update(aircallMessages)
      .set(values)
      .where(eq(aircallMessages.id, existing.id));
  } else {
    await db.insert(aircallMessages).values({
      aircallMessageId: String(providerMessageId),
      ...values,
    });
  }

  if (direction === "inbound" && contactId) {
    await pauseSmartPlansForSmsReply(contactId, receivedAt ?? new Date());
  }

  return { contactId, communicationId };
}

/**
 * Persists a successful native API send immediately. Aircall's later webhook is
 * idempotent and enriches the same row with its final delivery status.
 */
export async function persistOutboundAircallSend(input: {
  messageId: string;
  body: string;
  destination: string;
  aircallNumberId: number;
  aircallNumberName?: string | null;
  aircallNumberDigits?: string | null;
  responseMessage?: Record<string, unknown>;
  contactId: number;
  savvyUserId?: number | null;
}): Promise<{ contactId: number | null; communicationId: number | null }> {
  const response = input.responseMessage ?? {};
  const responseNumber = response.number as { id?: number; name?: string | null; digits?: string | null } | undefined;
  return persistAircallMessage({
    ...response,
    id: String(response.id ?? input.messageId),
    direction: "outbound",
    status: typeof response.status === "string" ? response.status : "pending",
    body: typeof response.body === "string" ? response.body : input.body,
    raw_digits: typeof response.raw_digits === "string" ? response.raw_digits : input.destination,
    number: {
      id: typeof responseNumber?.id === "number" ? responseNumber.id : input.aircallNumberId,
      name: typeof responseNumber?.name === "string" ? responseNumber.name : input.aircallNumberName ?? null,
      digits: typeof responseNumber?.digits === "string" ? responseNumber.digits : input.aircallNumberDigits ?? null,
    },
  }, {
    contactId: input.contactId,
    savvyUserId: input.savvyUserId ?? null,
  });
}

export function isAircallMessageWebhook(
  payload: unknown
): payload is AircallMessageWebhook {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<AircallMessageWebhook>;
  const event = candidate.event ?? candidate.event_name;
  return Boolean(
    (event?.startsWith("message.") || event?.startsWith("group_message.")) &&
    candidate.data &&
      (typeof candidate.data.id === "string" || typeof candidate.data.group_message_id === "string") &&
      typeof candidate.data.number?.id === "number"
  );
}
