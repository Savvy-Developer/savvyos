import { z } from "zod";
import { createCommunication, getAgentConnectionById, getCommunications, getTransactionById, resetLeadAgingByConnectionId } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { agentConnections, communications } from "../../drizzle/schema";
import { and, eq, isNull } from "drizzle-orm";

async function requireAgentCommunicationScope(input: {
  contactId?: number;
  transactionId?: number;
  agentConnectionId?: number;
}, user: { id: number; role: string }) {
  if (user.role !== "agent") return;

  if (input.agentConnectionId) {
    const connection = await getAgentConnectionById(input.agentConnectionId);
    if (!connection || (connection as any).connection?.agentId !== user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only access communication for your own pipeline." });
    }
    return;
  }
  if (input.transactionId) {
    const transaction = await getTransactionById(input.transactionId);
    if (!transaction || (transaction as any).transaction?.agentId !== user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only access communication for your own transactions." });
    }
    return;
  }
  if (input.contactId) {
    const db = await getDb();
    const owned = db ? await db.select({ id: agentConnections.id }).from(agentConnections)
      .where(and(eq(agentConnections.agentId, user.id), eq(agentConnections.contactId, input.contactId), isNull(agentConnections.archivedAt)))
      .limit(1) : [];
    if (!owned[0]) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only access communication for your own pipeline." });
    }
  }
}

export const communicationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      contactId: z.number().optional(),
      transactionId: z.number().optional(),
      agentConnectionId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await requireAgentCommunicationScope(input, ctx.user);
      return getCommunications(input);
    }),

  create: protectedProcedure
    .input(z.object({
      type: z.enum(["note","call","email","sms","meeting","voice_note"]),
      subject: z.string().optional().nullable(),
      body: z.string(),
      direction: z.enum(["inbound","outbound","internal"]).optional(),
      relatedContactId: z.number().optional().nullable(),
      relatedTransactionId: z.number().optional().nullable(),
      relatedPropertyId: z.number().optional().nullable(),
      relatedAgentConnectionId: z.number().optional().nullable(),
      audioFileUrl: z.string().optional().nullable(),
      transcription: z.string().optional().nullable(),
      communicatedAt: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await requireAgentCommunicationScope({
        contactId: input.relatedContactId ?? undefined,
        transactionId: input.relatedTransactionId ?? undefined,
        agentConnectionId: input.relatedAgentConnectionId ?? undefined,
      }, ctx.user);
      const id = await createCommunication({
        ...input,
        authorId: ctx.user.id,
        communicatedAt: input.communicatedAt ? new Date(input.communicatedAt) : new Date(),
      } as any);

      // Reset the stale/aging clock when an agent logs activity on a connection
      if (ctx.user.role === "agent" && input.relatedAgentConnectionId) {
        try { await resetLeadAgingByConnectionId(input.relatedAgentConnectionId, ctx.user.id); } catch (_) {}
      }

      return { id };
    }),

  // ── Edit a note (author-only) ────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      body: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Fetch existing record
      const [existing] = await db
        .select()
        .from(communications)
        .where(eq(communications.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      // Only the original author may edit
      if (existing.authorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the note author can edit this note" });
      }
      // Preserve original body on first edit
      const originalBody = existing.originalBody ?? existing.body;
      await db
        .update(communications)
        .set({
          body: input.body,
          originalBody,
          editedAt: new Date(),
          editedById: ctx.user.id,
        })
        .where(eq(communications.id, input.id));

      // Editing an agent-authored connection note is meaningful lead work too.
      if (ctx.user.role === "agent" && existing.relatedAgentConnectionId) {
        try { await resetLeadAgingByConnectionId(existing.relatedAgentConnectionId, ctx.user.id); } catch (_) {}
      }
      return { success: true };
    }),

  // ── Pin a contact note (one pinned note per contact) ─────────────────────────
  setPinned: protectedProcedure
    .input(z.object({
      id: z.number(),
      isPinned: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select()
        .from(communications)
        .where(eq(communications.id, input.id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      if (existing.type !== "note" || !existing.relatedContactId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only contact notes can be pinned" });
      }

      const contactId = existing.relatedContactId;
      if (input.isPinned) {
        await db.transaction(async (tx) => {
          await tx
            .update(communications)
            .set({ isPinned: false })
            .where(and(
              eq(communications.relatedContactId, contactId),
              eq(communications.type, "note"),
              eq(communications.isPinned, true),
            ));
          await tx
            .update(communications)
            .set({ isPinned: true })
            .where(eq(communications.id, input.id));
        });
      } else {
        await db
          .update(communications)
          .set({ isPinned: false })
          .where(eq(communications.id, input.id));
      }

      return { success: true, isPinned: input.isPinned };
    }),
});
