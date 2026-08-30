import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { aircallApiRequest, isAircallApiConfigured, sendAircallSMS } from "../_core/aircall";
import { getDb, logActivity } from "../db";
import {
  aircallIntegrationState,
  aircallIsaAssignments,
  aircallMessages,
  contacts,
} from "../../drizzle/schema";
import { persistAircallMessage, type AircallMessageData } from "../aircallMessaging";
import { normalizePhone } from "../aircall";

const positiveId = z.number().int().positive();

interface AircallNumber {
  id: number;
  name?: string | null;
  digits?: string | null;
}

interface AircallNumbersResponse {
  numbers?: AircallNumber[];
  meta?: { next_page_link?: string | null };
}

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

function requireAircallApi() {
  if (!isAircallApiConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Add the Aircall API credentials before selecting a marketing text number.",
    });
  }
}

function toE164(value: string): string {
  const digits = normalizePhone(value);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new TRPCError({ code: "BAD_REQUEST", message: "This contact does not have a valid mobile number." });
}

async function marketingLine(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  const [state] = await db
    .select()
    .from(aircallIntegrationState)
    .where(eq(aircallIntegrationState.id, 1))
    .limit(1);
  return state ?? null;
}

async function listAircallNumbers(): Promise<AircallNumber[]> {
  requireAircallApi();
  const numbers: AircallNumber[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await aircallApiRequest(`/v1/numbers?page=${page}&per_page=50`);
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: detail ? `Aircall could not list phone numbers: ${detail.slice(0, 300)}` : "Aircall could not list phone numbers.",
      });
    }
    const data = (await response.json()) as AircallNumbersResponse;
    numbers.push(...(data.numbers ?? []));
    if (!data.meta?.next_page_link) break;
  }
  return numbers;
}

function nativeMessagePayload(
  responseMessage: Record<string, unknown> | undefined,
  fallback: { messageId: string; body: string; destination: string; numberId: number; numberName: string | null; numberDigits: string | null },
): AircallMessageData {
  const nestedNumber = responseMessage?.number as Partial<AircallMessageData["number"]> | undefined;
  return {
    ...(responseMessage ?? {}),
    id: String(responseMessage?.id ?? fallback.messageId),
    direction: "outbound",
    status: typeof responseMessage?.status === "string" ? responseMessage.status : "pending",
    body: typeof responseMessage?.body === "string" ? responseMessage.body : fallback.body,
    raw_digits: typeof responseMessage?.raw_digits === "string" ? responseMessage.raw_digits : fallback.destination,
    number: {
      id: typeof nestedNumber?.id === "number" ? nestedNumber.id : fallback.numberId,
      name: typeof nestedNumber?.name === "string" ? nestedNumber.name : fallback.numberName,
      digits: typeof nestedNumber?.digits === "string" ? nestedNumber.digits : fallback.numberDigits,
    },
  };
}

export const marketingTextInboxRouter = router({
  /** Configuration status for the dedicated Smart Plan marketing line. */
  configuration: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const line = await marketingLine(db);
    return {
      apiConfigured: isAircallApiConfigured(),
      marketingNumber: line?.marketingNumberId
        ? {
            id: line.marketingNumberId,
            name: line.marketingNumberName,
            digits: line.marketingNumberDigits,
            configuredAt: line.marketingNumberConfiguredAt,
          }
        : null,
      sendReady: isAircallApiConfigured() && !!line?.marketingNumberId,
    };
  }),

  /** Lists Aircall numbers that are not reserved for an ISA's personal line. */
  listAvailableNumbers: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [numbers, assigned] = await Promise.all([
      listAircallNumbers(),
      db.select({ aircallNumberId: aircallIsaAssignments.aircallNumberId }).from(aircallIsaAssignments),
    ]);
    const reservedIds = new Set(assigned.map((row) => row.aircallNumberId));
    return numbers
      .filter((number) => !reservedIds.has(number.id))
      .map((number) => ({ id: number.id, name: number.name ?? null, digits: number.digits ?? null }));
  }),

  /** Saves the shared line that Smart Plans and the marketing inbox use. */
  selectMarketingNumber: protectedProcedure
    .input(z.object({ numberId: positiveId }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [assigned] = await db
        .select({ id: aircallIsaAssignments.id })
        .from(aircallIsaAssignments)
        .where(eq(aircallIsaAssignments.aircallNumberId, input.numberId))
        .limit(1);
      if (assigned) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Choose a dedicated number that is not assigned to an ISA.",
        });
      }

      const number = (await listAircallNumbers()).find((item) => item.id === input.numberId);
      if (!number) throw new TRPCError({ code: "NOT_FOUND", message: "That Aircall number is no longer available." });

      const now = new Date();
      await db.insert(aircallIntegrationState).values({
        id: 1,
        marketingNumberId: number.id,
        marketingNumberName: number.name ?? null,
        marketingNumberDigits: number.digits ?? null,
        marketingNumberConfiguredAt: now,
      }).onDuplicateKeyUpdate({
        set: {
          marketingNumberId: number.id,
          marketingNumberName: number.name ?? null,
          marketingNumberDigits: number.digits ?? null,
          marketingNumberConfiguredAt: now,
        },
      });
      await logActivity({
        userId: ctx.user.id,
        action: "marketing_text_number_selected",
        entityType: "aircall_number",
        entityId: number.id,
        details: { name: number.name ?? null, digits: number.digits ?? null },
      });
      return { id: number.id, name: number.name ?? null, digits: number.digits ?? null };
    }),

  /** Lists only CRM contacts who have replied to the dedicated marketing line. */
  listThreads: protectedProcedure
    .input(z.object({ search: z.string().trim().max(160).optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId) return [];

      const rows = await db
        .select({
          id: aircallMessages.id,
          aircallMessageId: aircallMessages.aircallMessageId,
          contactId: aircallMessages.contactId,
          direction: aircallMessages.direction,
          status: aircallMessages.status,
          body: aircallMessages.body,
          fromNumber: aircallMessages.fromNumber,
          toNumber: aircallMessages.toNumber,
          sentAt: aircallMessages.sentAt,
          receivedAt: aircallMessages.receivedAt,
          createdAt: aircallMessages.createdAt,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
          contactPhone: contacts.phone,
          doNotContact: contacts.doNotContact,
          smsMarketingOptedOutAt: contacts.smsMarketingOptedOutAt,
        })
        .from(aircallMessages)
        .leftJoin(contacts, eq(contacts.id, aircallMessages.contactId))
        .where(eq(aircallMessages.aircallNumberId, line.marketingNumberId))
        .orderBy(desc(aircallMessages.sentAt), desc(aircallMessages.createdAt))
        .limit(750);

      const query = input?.search?.toLowerCase();
      const threads = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        // This is a reply inbox, not an outbound delivery log. Exclude status
        // callbacks, blank-body records, and unmatched numbers so every row
        // opens a useful, replyable CRM conversation.
        if (row.direction !== "inbound" || !row.contactId || !row.body?.trim()) continue;
        const key = `contact:${row.contactId}`;
        const label = `${row.contactFirstName ?? ""} ${row.contactLastName ?? ""} ${row.contactPhone ?? ""} ${row.fromNumber ?? ""} ${row.toNumber ?? ""} ${row.body ?? ""}`.toLowerCase();
        if (query && !label.includes(query)) continue;
        if (!threads.has(key)) threads.set(key, row);
      }
      return Array.from(threads.values());
    }),

  /** Returns the complete thread for a marketing contact. */
  getThread: protectedProcedure
    .input(z.object({ contactId: positiveId }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const line = await marketingLine(db);
      if (!line?.marketingNumberId) return [];
      return db
        .select()
        .from(aircallMessages)
        .where(and(eq(aircallMessages.aircallNumberId, line.marketingNumberId), eq(aircallMessages.contactId, input.contactId)))
        .orderBy(asc(aircallMessages.sentAt), asc(aircallMessages.createdAt))
        .limit(300);
    }),

  /** Sends a manual reply from the shared marketing line and writes it to the CRM immediately. */
  sendReply: protectedProcedure
    .input(z.object({ contactId: positiveId, body: z.string().trim().min(1).max(160) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [line, contact] = await Promise.all([
        marketingLine(db),
        db.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1).then((rows) => rows[0] ?? null),
      ]);
      if (!line?.marketingNumberId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Select a dedicated Aircall marketing number before sending texts." });
      }
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found." });
      if (contact.doNotContact || contact.smsMarketingOptedOutAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This contact is opted out of marketing outreach and cannot be texted." });
      }
      if (!contact.phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Add a primary phone number before sending a reply." });

      const destination = toE164(contact.phone);
      const result = await sendAircallSMS(destination, input.body, line.marketingNumberId);
      if (!result.success || !result.messageId) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: result.error || "Aircall did not return a message identifier." });
      }
      const payload = nativeMessagePayload(result.message, {
        messageId: result.messageId,
        body: input.body,
        destination,
        numberId: line.marketingNumberId,
        numberName: line.marketingNumberName,
        numberDigits: line.marketingNumberDigits,
      });
      await persistAircallMessage(payload, { contactId: contact.id, savvyUserId: ctx.user.id });
      await logActivity({
        userId: ctx.user.id,
        action: "marketing_text_reply_sent",
        entityType: "contact",
        entityId: contact.id,
        relatedContactId: contact.id,
        details: { aircallMessageId: result.messageId, aircallNumberId: line.marketingNumberId },
      });
      return { success: true, messageId: result.messageId };
    }),

  /** Records a contact's marketing-text opt-out immediately without overwriting a broader Do Not Contact preference. */
  optOutContact: protectedProcedure
    .input(z.object({ contactId: positiveId, reason: z.string().trim().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(contacts).set({
        smsMarketingOptedOutAt: new Date(),
        smsMarketingOptOutReason: input.reason,
      }).where(eq(contacts.id, input.contactId));
      await logActivity({
        userId: ctx.user.id,
        action: "contact_marked_sms_marketing_opt_out",
        entityType: "contact",
        entityId: input.contactId,
        relatedContactId: input.contactId,
        details: { reason: input.reason },
      });
      return { success: true };
    }),
});
