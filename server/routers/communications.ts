import { z } from "zod";
import { createCommunication, getCommunications } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { communications } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const communicationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      contactId: z.number().optional(),
      transactionId: z.number().optional(),
      agentConnectionId: z.number().optional(),
    }))
    .query(async ({ input }) => {
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
      const id = await createCommunication({
        ...input,
        authorId: ctx.user.id,
        communicatedAt: input.communicatedAt ? new Date(input.communicatedAt) : new Date(),
      } as any);
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
      return { success: true };
    }),
});
