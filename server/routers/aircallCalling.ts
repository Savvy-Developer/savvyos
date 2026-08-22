import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { aircallApiRequest, isAircallApiConfigured } from "../_core/aircall";
import { getDb, logActivity } from "../db";
import { aircallIsaAssignments, contacts, users } from "../../drizzle/schema";
import { normalizeOptionalUsPhone } from "@shared/phone";

type AircallUser = {
  id: number;
  name?: string | null;
  email?: string | null;
  available?: boolean | null;
  availability_status?: string | null;
};

type AircallNumber = {
  id: number;
  name?: string | null;
  digits?: string | null;
  availability_status?: string | null;
};

type AircallPaginated<T> = {
  users?: T[];
  numbers?: T[];
  meta?: {
    total?: number;
    current_page?: number;
    per_page?: number;
    next_page_link?: string | null;
  };
};

const positiveId = z.number().int().positive();

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
}

function requireIsa(role: string) {
  if (role !== "isa") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Aircall calling is available to ISA users only",
    });
  }
}

function requireAircallConfiguration() {
  if (!isAircallApiConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Aircall API credentials are not configured. Ask an administrator to complete Aircall setup.",
    });
  }
}

async function aircallErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const text = (await response.text()).trim();
  if (!text) return `${fallback} (HTTP ${response.status})`;
  return `${fallback} (HTTP ${response.status}): ${text.slice(0, 300)}`;
}

async function listPagedAircallUsers(): Promise<AircallUser[]> {
  const all: AircallUser[] = [];
  let page = 1;
  for (let attempts = 0; attempts < 50; attempts += 1) {
    const response = await aircallApiRequest(
      `/v1/users?page=${page}&per_page=100`
    );
    if (!response.ok)
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: await aircallErrorMessage(
          response,
          "Could not retrieve Aircall users"
        ),
      });
    const data = (await response.json()) as AircallPaginated<AircallUser>;
    all.push(...(data.users ?? []));
    if (!data.meta?.next_page_link) break;
    page += 1;
  }
  return all;
}

async function listPagedNumbersForAircallUser(
  aircallUserId: number
): Promise<AircallNumber[]> {
  const all: AircallNumber[] = [];
  let page = 1;
  for (let attempts = 0; attempts < 50; attempts += 1) {
    const response = await aircallApiRequest(
      `/v2/users/${aircallUserId}/numbers?page=${page}&per_page=100`
    );
    if (!response.ok)
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: await aircallErrorMessage(
          response,
          "Could not retrieve this Aircall user's numbers"
        ),
      });
    const data = (await response.json()) as AircallPaginated<AircallNumber>;
    all.push(...(data.numbers ?? []));
    if (!data.meta?.next_page_link) break;
    page += 1;
  }
  return all;
}

function normalizeToE164(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      "This contact does not have a valid phone number for an Aircall call.",
  });
}

export const aircallCallingRouter = router({
  /** Returns the saved caller mapping to its ISA owner or an administrator. */
  getAssignment: protectedProcedure
    .input(z.object({ userId: positiveId }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.id !== input.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(aircallIsaAssignments)
        .where(eq(aircallIsaAssignments.savvyUserId, input.userId))
        .limit(1);
      return rows[0] ?? null;
    }),

  /** Indicates whether the signed-in ISA can launch a Contact call. */
  myStatus: protectedProcedure.query(async ({ ctx }) => {
    requireIsa(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db
      .select()
      .from(aircallIsaAssignments)
      .where(eq(aircallIsaAssignments.savvyUserId, ctx.user.id))
      .limit(1);
    const assignment = rows[0] ?? null;
    const configured = isAircallApiConfigured();
    const reason = !configured
      ? "Aircall is not configured yet."
      : !assignment
        ? "No Aircall caller number has been assigned to you yet."
        : null;
    return {
      ready: configured && !!assignment,
      reason,
      assignment: assignment
        ? {
            numberName: assignment.aircallNumberName,
            numberDigits: assignment.aircallNumberDigits,
            verifiedAt: assignment.verifiedAt,
          }
        : null,
    };
  }),

  /** Admin inventory endpoint for selecting an existing Aircall user. */
  listAircallUsers: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
    requireAircallConfiguration();
    const members = await listPagedAircallUsers();
    return members
      .filter(member => Number.isInteger(member.id))
      .map(member => ({
        id: member.id,
        name: member.name ?? "Unnamed Aircall user",
        email: member.email ?? null,
        availabilityStatus: member.availability_status ?? null,
      }))
      .sort((a, b) =>
        `${a.name} ${a.email ?? ""}`.localeCompare(`${b.name} ${b.email ?? ""}`)
      );
  }),

  /** Admin inventory endpoint for the numbers currently associated with an Aircall user. */
  listAircallUserNumbers: protectedProcedure
    .input(z.object({ aircallUserId: positiveId }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      requireAircallConfiguration();
      const numbers = await listPagedNumbersForAircallUser(input.aircallUserId);
      return numbers
        .filter(number => Number.isInteger(number.id))
        .map(number => ({
          id: number.id,
          name: number.name ?? "Unnamed Aircall number",
          digits: number.digits ?? null,
          availabilityStatus: number.availability_status ?? null,
        }))
        .sort((a, b) =>
          `${a.name} ${a.digits ?? ""}`.localeCompare(
            `${b.name} ${b.digits ?? ""}`
          )
        );
    }),

  /** Saves a mutually exclusive Aircall caller mapping after live Aircall validation. */
  setAssignment: protectedProcedure
    .input(
      z.object({
        savvyUserId: positiveId,
        aircallUserId: positiveId,
        aircallNumberId: positiveId,
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      requireAircallConfiguration();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [savvyUser] = await db
        .select({ id: users.id, role: users.role, name: users.name })
        .from(users)
        .where(eq(users.id, input.savvyUserId))
        .limit(1);
      if (!savvyUser || savvyUser.role !== "isa") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Aircall caller assignments can only be made for ISA users.",
        });
      }

      const aircallNumbers = await listPagedNumbersForAircallUser(
        input.aircallUserId
      );
      const selectedNumber = aircallNumbers.find(
        number => number.id === input.aircallNumberId
      );
      if (!selectedNumber) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The selected Aircall number is not associated with the selected Aircall user. Update the Aircall assignment first, then retry.",
        });
      }

      const conflicts = await db
        .select()
        .from(aircallIsaAssignments)
        .where(
          and(eq(aircallIsaAssignments.aircallUserId, input.aircallUserId))
        );
      const numberConflicts = await db
        .select()
        .from(aircallIsaAssignments)
        .where(
          and(eq(aircallIsaAssignments.aircallNumberId, input.aircallNumberId))
        );
      const hasConflictingAircallUser = conflicts.some(
        assignment => assignment.savvyUserId !== input.savvyUserId
      );
      const hasConflictingNumber = numberConflicts.some(
        assignment => assignment.savvyUserId !== input.savvyUserId
      );
      if (hasConflictingAircallUser || hasConflictingNumber) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "That Aircall user or number is already assigned to another ISA in SavvyOS.",
        });
      }

      const values = {
        aircallUserId: input.aircallUserId,
        aircallNumberId: input.aircallNumberId,
        aircallNumberName: selectedNumber.name ?? null,
        aircallNumberDigits: normalizeOptionalUsPhone(selectedNumber.digits),
        verifiedAt: new Date(),
      };
      const existing = await db
        .select({ id: aircallIsaAssignments.id })
        .from(aircallIsaAssignments)
        .where(eq(aircallIsaAssignments.savvyUserId, input.savvyUserId))
        .limit(1);
      if (existing[0]) {
        await db
          .update(aircallIsaAssignments)
          .set(values)
          .where(eq(aircallIsaAssignments.id, existing[0].id));
      } else {
        await db
          .insert(aircallIsaAssignments)
          .values({ savvyUserId: input.savvyUserId, ...values });
      }

      await logActivity({
        userId: ctx.user.id,
        action: "aircall_isa_assignment_saved",
        entityType: "user",
        entityId: input.savvyUserId,
        details: {
          aircallUserId: input.aircallUserId,
          aircallNumberId: input.aircallNumberId,
          aircallNumberName: selectedNumber.name ?? null,
          targetUserName: savvyUser.name ?? null,
        },
      });
      return {
        success: true,
        number: {
          id: selectedNumber.id,
          name: selectedNumber.name ?? null,
          digits: selectedNumber.digits ?? null,
        },
      };
    }),

  removeAssignment: protectedProcedure
    .input(z.object({ savvyUserId: positiveId }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .delete(aircallIsaAssignments)
        .where(eq(aircallIsaAssignments.savvyUserId, input.savvyUserId));
      await logActivity({
        userId: ctx.user.id,
        action: "aircall_isa_assignment_removed",
        entityType: "user",
        entityId: input.savvyUserId,
      });
      return { success: true };
    }),

  /** Starts a direct outbound call from a Contact record, only for the signed-in ISA. */
  startContactCall: protectedProcedure
    .input(z.object({ contactId: positiveId }))
    .mutation(async ({ ctx, input }) => {
      requireIsa(ctx.user.role);
      requireAircallConfiguration();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [assignment] = await db
        .select()
        .from(aircallIsaAssignments)
        .where(eq(aircallIsaAssignments.savvyUserId, ctx.user.id))
        .limit(1);
      if (!assignment) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No Aircall caller number has been assigned to you. Ask an administrator to assign one.",
        });
      }

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
          message: "Contact not found",
        });
      if (contact.doNotContact) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This contact is marked Do Not Contact and cannot be called.",
        });
      }
      if (!contact.phone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a primary phone number to this contact before calling.",
        });
      }

      // Re-check the relationship in Aircall immediately before dialing. This
      // protects callers when an assignment is changed outside SavvyOS.
      const availableNumbers = await listPagedNumbersForAircallUser(
        assignment.aircallUserId
      );
      if (
        !availableNumbers.some(
          number => number.id === assignment.aircallNumberId
        )
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Your saved Aircall caller number is no longer associated with your Aircall user. Ask an administrator to refresh your assignment.",
        });
      }

      const destination = normalizeToE164(contact.phone);
      const response = await aircallApiRequest(
        `/v1/users/${assignment.aircallUserId}/calls`,
        {
          method: "POST",
          body: JSON.stringify({
            number_id: assignment.aircallNumberId,
            to: destination,
          }),
        }
      );
      if (!response.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: await aircallErrorMessage(
            response,
            "Aircall could not start the call"
          ),
        });
      }

      await db
        .update(aircallIsaAssignments)
        .set({ verifiedAt: new Date() })
        .where(eq(aircallIsaAssignments.id, assignment.id));
      await logActivity({
        userId: ctx.user.id,
        action: "aircall_contact_call_started",
        entityType: "contact",
        entityId: contact.id,
        relatedContactId: contact.id,
        details: {
          contactName: `${contact.firstName} ${contact.lastName}`.trim(),
          destination,
          aircallUserId: assignment.aircallUserId,
          aircallNumberId: assignment.aircallNumberId,
          aircallNumberName: assignment.aircallNumberName,
        },
      });
      return {
        success: true,
        destination,
        callerNumber:
          assignment.aircallNumberDigits ??
          assignment.aircallNumberName ??
          null,
      };
    }),
});
