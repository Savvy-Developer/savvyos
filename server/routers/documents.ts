import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createDocument, deleteDocument, getDocuments } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

export const documentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      contactId: z.number().optional(),
      transactionId: z.number().optional(),
      propertyId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return getDocuments(input);
    }),

  // Get a presigned upload URL for direct browser upload
  getUploadUrl: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      mimeType: z.string(),
      fileSize: z.number(),
      documentType: z.enum(["contract","disclosure","addendum","inspection","title","closing","voice_note","other"]).optional(),
      relatedContactId: z.number().optional().nullable(),
      relatedTransactionId: z.number().optional().nullable(),
      relatedPropertyId: z.number().optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const suffix = nanoid(8);
      const fileKey = `documents/${ctx.user.id}/${suffix}-${input.fileName}`;
      // We'll return the key and let the client upload via a separate endpoint
      return { fileKey, uploadReady: true };
    }),

  // Save document metadata after upload
  save: protectedProcedure
    .input(z.object({
      name: z.string(),
      fileKey: z.string(),
      fileUrl: z.string(),
      mimeType: z.string().optional().nullable(),
      fileSize: z.number().optional().nullable(),
      documentType: z.enum(["contract","disclosure","addendum","inspection","title","closing","voice_note","other"]).optional(),
      relatedContactId: z.number().optional().nullable(),
      relatedTransactionId: z.number().optional().nullable(),
      relatedPropertyId: z.number().optional().nullable(),
      relatedAgentId: z.number().optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createDocument({
        ...input,
        uploadedById: ctx.user.id,
        documentType: input.documentType ?? "other",
      } as any);
      return { id };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteDocument(input.id);
      return { success: true };
    }),
});
