import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { aircallApiRequest, isAircallApiConfigured } from "../_core/aircall";
import { getDb, logActivity } from "../db";
import {
  aircallCalls,
  aircallIsaAssignments,
  aircallMessages,
  contacts,
} from "../../drizzle/schema";
import { normalizePhone } from "../aircall";
import {
  persistAircallMessage,
  type AircallMessageData,
} from "../aircallMessaging";

const positiveId = z.number().int().positive();

function requireIsa(role: string) {
  if (role !== "isa") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Aircall communications are available to ISA users only.",
    });
  }
}

function toE164(value: string): string {
  const digits = normalizePhone(value);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "This contact does not have a valid phone number.",
  });
}

async function requireAssignment(savvyUserId: number) {
  if (!isAircallApiConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Aircall API credentials are not configured. Ask an administrator to complete Aircall setup.",
    });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const [assignment] = await db
    .select()
    .from(aircallIsaAssignments)
    .where(eq(aircallIsaAssignments.savvyUserId, savvyUserId))
    .limit(1);
  if (!assignment) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "No Aircall caller number has been assigned to you. Ask an administrator to assign one.",
    });
  }
  return { db, assignment };
}

async function responseError(
  response: Response,
  fallback: string
): Promise<never> {
  const detail = (await response.text()).trim();
  throw new TRPCError({
    code: "BAD_GATEWAY",
    message: detail
      ? `${fallback}: ${detail.slice(0, 300)}`
      : `${fallback} (HTTP ${response.status})`,
  });
}

export const aircallCommunicationsRouter = router({
  /** The authenticated ISA's Aircall calls, limited to their exclusive line. */
  listMyCalls: protectedProcedure.query(async ({ ctx }) => {
    requireIsa(ctx.user.role);
    const { db, assignment } = await requireAssignment(ctx.user.id);
    const rows = await db
      .select({
        id: aircallCalls.id,
        aircallCallId: aircallCalls.aircallCallId,
        contactId: aircallCalls.contactId,
        direction: aircallCalls.direction,
        status: aircallCalls.status,
        duration: aircallCalls.duration,
        startedAt: aircallCalls.startedAt,
        endedAt: aircallCalls.endedAt,
        callerNumber: aircallCalls.callerNumber,
        calleeNumber: aircallCalls.calleeNumber,
        recordingUrl: aircallCalls.recordingUrl,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
      })
      .from(aircallCalls)
      .leftJoin(contacts, eq(contacts.id, aircallCalls.contactId))
      .where(eq(aircallCalls.aircallNumberId, assignment.aircallNumberId))
      .orderBy(desc(aircallCalls.startedAt))
      .limit(150);
    return rows;
  }),

  /** Text history for the signed-in ISA's assigned line, including Contact links. */
  listMyMessages: protectedProcedure.query(async ({ ctx }) => {
    requireIsa(ctx.user.role);
    const { db, assignment } = await requireAssignment(ctx.user.id);
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
      })
      .from(aircallMessages)
      .leftJoin(contacts, eq(contacts.id, aircallMessages.contactId))
      .where(eq(aircallMessages.aircallNumberId, assignment.aircallNumberId))
      .orderBy(desc(aircallMessages.sentAt), desc(aircallMessages.createdAt))
      .limit(500);
    return rows;
  }),

  /** Contact-specific text thread, constrained to the ISA's own Aircall line. */
  listContactMessages: protectedProcedure
    .input(z.object({ contactId: positiveId }))
    .query(async ({ ctx, input }) => {
      requireIsa(ctx.user.role);
      const { db, assignment } = await requireAssignment(ctx.user.id);
      return db
        .select()
        .from(aircallMessages)
        .where(
          and(
            eq(aircallMessages.aircallNumberId, assignment.aircallNumberId),
            eq(aircallMessages.contactId, input.contactId)
          )
        )
        .orderBy(desc(aircallMessages.sentAt), desc(aircallMessages.createdAt))
        .limit(200);
    }),

  /** Sends an Aircall native SMS from the ISA's exclusive line and records it on the Contact immediately. */
  sendContactText: protectedProcedure
    .input(
      z.object({
        contactId: positiveId,
        body: z
          .string()
          .trim()
          .min(1, "Write a text message first.")
          .max(1600, "Texts are limited to 1,600 characters."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireIsa(ctx.user.role);
      const { db, assignment } = await requireAssignment(ctx.user.id);
      const [contact] = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
          doNotContact: contacts.doNotContact,
        })
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);
      if (!contact)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found.",
        });
      if (contact.doNotContact) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This contact is marked Do Not Contact and cannot be texted.",
        });
      }
      if (!contact.phone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a primary phone number to this contact before texting.",
        });
      }

      const destination = toE164(contact.phone);
      const response = await aircallApiRequest(
        `/v1/numbers/${assignment.aircallNumberId}/messages/native/send`,
        {
          method: "POST",
          body: JSON.stringify({ to: destination, body: input.body }),
        }
      );
      if (!response.ok)
        await responseError(response, "Aircall could not send the text");
      const apiMessage = (await response.json()) as Partial<AircallMessageData>;
      if (!apiMessage.id) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            "Aircall accepted the text but did not return a message identifier.",
        });
      }

      const normalized: AircallMessageData = {
        ...apiMessage,
        id: String(apiMessage.id),
        direction: "outbound",
        status: apiMessage.status ?? "pending",
        body: apiMessage.body ?? input.body,
        raw_digits: apiMessage.raw_digits ?? destination,
        number: apiMessage.number ?? {
          id: assignment.aircallNumberId,
          name: assignment.aircallNumberName,
          digits: assignment.aircallNumberDigits,
        },
      };
      await persistAircallMessage(normalized, {
        contactId: contact.id,
        savvyUserId: ctx.user.id,
      });
      await logActivity({
        userId: ctx.user.id,
        action: "aircall_contact_text_sent",
        entityType: "contact",
        entityId: contact.id,
        relatedContactId: contact.id,
        details: {
          aircallMessageId: normalized.id,
          aircallNumberId: assignment.aircallNumberId,
          destination,
          contactName: `${contact.firstName} ${contact.lastName}`.trim(),
        },
      });
      return { success: true, messageId: normalized.id, destination };
    }),
});
