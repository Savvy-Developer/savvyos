import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";
import {
  archiveResendInboxThread,
  backfillResendInbox,
  getResendInboxAttachmentUrl,
  getResendInboxThread,
  getResendInboxThreads,
  getResendInboxUnreadCount,
  sendResendInboxReply,
  setResendInboxThreadUnread,
} from "../resendInbox";

async function assertInboxAccess(user: { id: number; role: string; email?: string | null }) {
  const permitted = await canAdminUsePermission(user, "canViewResendInbox");
  if (!permitted) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to the Resend Inbox" });
  }
}

export const resendInboxRouter = router({
  list: protectedProcedure
    .input(z.object({ archived: z.boolean().optional().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return getResendInboxThreads(ctx.user.id, input?.archived ?? false);
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    await assertInboxAccess(ctx.user);
    return { count: await getResendInboxUnreadCount(ctx.user.id) };
  }),

  getThread: protectedProcedure
    .input(z.object({ threadId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      const conversation = await getResendInboxThread(input.threadId, ctx.user.id);
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      return conversation;
    }),

  setUnread: protectedProcedure
    .input(z.object({ threadId: z.number().int().positive(), markedUnread: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return setResendInboxThreadUnread(input.threadId, ctx.user.id, input.markedUnread);
    }),

  archive: protectedProcedure
    .input(z.object({ threadId: z.number().int().positive(), archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return archiveResendInboxThread(input.threadId, ctx.user.id, input.archived);
    }),

  reply: protectedProcedure
    .input(z.object({
      threadId: z.number().int().positive(),
      bodyHtml: z.string().trim().min(1).max(200_000),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return sendResendInboxReply({ ...input, userId: ctx.user.id });
    }),

  getAttachmentUrl: protectedProcedure
    .input(z.object({ messageId: z.number().int().positive(), attachmentId: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return { url: await getResendInboxAttachmentUrl(input.messageId, input.attachmentId) };
    }),

  sync: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).optional().default(100),
      after: z.string().min(1).max(255).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      try {
        return await backfillResendInbox({ limit: input?.limit ?? 100, after: input?.after });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Unable to sync inbox from Resend",
        });
      }
    }),
});
