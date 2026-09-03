import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { aliasedTable, and, eq, gte, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";
import { getDb } from "../db";
import { resendInboxMessages } from "../../drizzle/schema";
import {
  archiveResendInboxThread,
  backfillResendInbox,
  getResendInboxAttachmentUrl,
  getResendInboxThread,
  getResendInboxThreads,
  getResendInboxUnreadCount,
  finishResendInboxThread,
  sendResendInboxReply,
  setResendInboxThreadUnread,
} from "../resendInbox";

async function assertInboxAccess(user: {
  id: number;
  role: string;
  email?: string | null;
}) {
  if (user.role === "isa") return;
  const permitted = await canAdminUsePermission(user, "canViewResendInbox");
  if (!permitted) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to the Resend Inbox",
    });
  }
}

const SPEED_TO_LEAD_WINDOWS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All Time" },
] as const;

function startForWindow(
  window: (typeof SPEED_TO_LEAD_WINDOWS)[number]
): Date | null {
  const now = new Date();
  if (window.key === "all") return null;
  if (window.key === "today") {
    now.setHours(0, 0, 0, 0);
    return now;
  }
  if (window.key === "ytd") return new Date(now.getFullYear(), 0, 1);
  const start = new Date(now);
  start.setDate(start.getDate() - (window.days ?? 0));
  return start;
}

async function getEmailSpeedToLead() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  const inbound = aliasedTable(
    resendInboxMessages,
    "speed_to_lead_inbound_email"
  );
  const outbound = aliasedTable(
    resendInboxMessages,
    "speed_to_lead_outbound_email"
  );
  const outboundAlias = sql.raw("`speed_to_lead_outbound_email`");
  const responseAt = sql<Date | null>`(
    SELECT MIN(${outbound.receivedAt})
    FROM ${resendInboxMessages} AS ${outboundAlias}
    WHERE ${outbound.threadId} = ${inbound.threadId}
      AND ${outbound.direction} = 'outbound'
      AND ${outbound.receivedAt} > ${inbound.receivedAt}
  )`;
  // Count every real inbound email. Open messages accrue until a reply, finish,
  // or archive event; closing a thread retains the response time already earned.
  const stoppedAt = sql<Date>`COALESCE(${inbound.speedToLeadStoppedAt}, NOW())`;
  const elapsedUntil = sql<Date>`CASE
    WHEN ${responseAt} IS NOT NULL AND ${responseAt} < ${stoppedAt} THEN ${responseAt}
    ELSE ${stoppedAt}
  END`;
  // DMARC aggregate reports are the single automated email category that is
  // intentionally excluded. This also covers legacy rows stored before the
  // inbox began filtering those reports at ingest time.
  const isDmarcAggregateReport = sql<boolean>`(
    LOWER(${inbound.subject}) REGEXP '^report[[:space:]]+domain:[[:space:]]*[^[:space:]]+.*report-id[[:space:]]*:'
    OR (
      LOWER(${inbound.fromEmail}) REGEXP '(^|[.@_-])dmarc([.@_-]|$)'
      AND LOWER(${inbound.subject}) REGEXP 'dmarc[[:space:]]+(aggregate|rua)[[:space:]]+report'
    )
  )`;
  return Promise.all(
    SPEED_TO_LEAD_WINDOWS.map(async window => {
      const start = startForWindow(window);
      const [metrics] = await db
        .select({
          incomingCount: sql<number>`COUNT(*)`,
          respondedCount: sql<number>`SUM(CASE WHEN ${responseAt} IS NOT NULL AND ${responseAt} <= ${stoppedAt} THEN 1 ELSE 0 END)`,
          averageMinutes: sql<
            number | null
          >`AVG(TIMESTAMPDIFF(SECOND, ${inbound.receivedAt}, ${elapsedUntil}) / 60.0)`,
        })
        .from(inbound)
        .where(
          and(
            eq(inbound.direction, "inbound"),
            sql`NOT ${isDmarcAggregateReport}`,
            ...(start ? [gte(inbound.receivedAt, start)] : [])
          )
        );
      return {
        key: window.key,
        label: window.label,
        averageMinutes:
          metrics?.averageMinutes == null
            ? null
            : Number(metrics.averageMinutes),
        respondedCount: Number(metrics?.respondedCount ?? 0),
        incomingCount: Number(metrics?.incomingCount ?? 0),
      };
    })
  );
}

export const resendInboxRouter = router({
  list: protectedProcedure
    .input(
      z.object({ archived: z.boolean().optional().default(false) }).optional()
    )
    .query(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return getResendInboxThreads(ctx.user.id, input?.archived ?? false);
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    await assertInboxAccess(ctx.user);
    return { count: await getResendInboxUnreadCount(ctx.user.id) };
  }),

  /** Mean elapsed time from every inbound email to the first SavvyOS reply in its thread. */
  speedToLead: protectedProcedure.query(async ({ ctx }) => {
    await assertInboxAccess(ctx.user);
    return { windows: await getEmailSpeedToLead() };
  }),

  getThread: protectedProcedure
    .input(z.object({ threadId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      const conversation = await getResendInboxThread(
        input.threadId,
        ctx.user.id
      );
      if (!conversation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      return conversation;
    }),

  setUnread: protectedProcedure
    .input(
      z.object({
        threadId: z.number().int().positive(),
        markedUnread: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return setResendInboxThreadUnread(
        input.threadId,
        ctx.user.id,
        input.markedUnread
      );
    }),

  archive: protectedProcedure
    .input(
      z.object({ threadId: z.number().int().positive(), archived: z.boolean() })
    )
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return archiveResendInboxThread(
        input.threadId,
        ctx.user.id,
        input.archived
      );
    }),

  /** Closes a conversation without treating it as an unanswered response obligation. */
  finish: protectedProcedure
    .input(
      z.object({
        threadId: z.number().int().positive(),
        archive: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return finishResendInboxThread(
        input.threadId,
        ctx.user.id,
        input.archive
      );
    }),

  reply: protectedProcedure
    .input(
      z.object({
        threadId: z.number().int().positive(),
        bodyHtml: z.string().trim().min(1).max(200_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return sendResendInboxReply({ ...input, userId: ctx.user.id });
    }),

  getAttachmentUrl: protectedProcedure
    .input(
      z.object({
        messageId: z.number().int().positive(),
        attachmentId: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      return {
        url: await getResendInboxAttachmentUrl(
          input.messageId,
          input.attachmentId
        ),
      };
    }),

  sync: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional().default(100),
          after: z.string().min(1).max(255).optional(),
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      await assertInboxAccess(ctx.user);
      try {
        return await backfillResendInbox({
          limit: input?.limit ?? 100,
          after: input?.after,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unable to sync inbox from Resend",
        });
      }
    }),
});
