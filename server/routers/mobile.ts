import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getMyOverdueTaskCount } from "../db";
import { mobileDevices, chatChannelMembers, chatMessages, chatChannelReads, tasks } from "../../drizzle/schema";
import { canOpenChatWorkspace, type ChatRole } from "../chatAccess";
import { canAdminUsePermission } from "./permissions";

export const mobileRouter = router({
  registerDevice: protectedProcedure
    .input(
      z.object({
        deviceToken: z.string().min(1),
        platform: z.enum(["ios", "android"]),
        appVersion: z.string().optional(),
        deviceModel: z.string().optional(),
        osVersion: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select()
        .from(mobileDevices)
        .where(eq(mobileDevices.deviceToken, input.deviceToken))
        .limit(1);

      if (existing) {
        await db
          .update(mobileDevices)
          .set({
            userId: ctx.user.id,
            platform: input.platform,
            appVersion: input.appVersion ?? existing.appVersion,
            deviceModel: input.deviceModel ?? existing.deviceModel,
            osVersion: input.osVersion ?? existing.osVersion,
            isActive: true,
            lastSeenAt: new Date(),
          })
          .where(eq(mobileDevices.id, existing.id));
      } else {
        await db.insert(mobileDevices).values({
          userId: ctx.user.id,
          deviceToken: input.deviceToken,
          platform: input.platform,
          appVersion: input.appVersion,
          deviceModel: input.deviceModel,
          osVersion: input.osVersion,
          isActive: true,
          lastSeenAt: new Date(),
        });
      }

      return { success: true };
    }),

  unregisterDevice: protectedProcedure
    .input(z.object({ deviceToken: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: true };

      await db
        .update(mobileDevices)
        .set({ isActive: false })
        .where(
          and(
            eq(mobileDevices.deviceToken, input.deviceToken),
            eq(mobileDevices.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  quickActionCounts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      return {
        overdueTasks: 0,
        pendingTasksToday: 0,
        canAccessChat: false,
        unreadChatCount: 0,
      };
    }

    // 1. Overdue tasks count
    const overdueTasks = await getMyOverdueTaskCount(ctx.user.id);

    // 2. Pending tasks due today or earlier
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [pendingTodayRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedToId, ctx.user.id),
          sql`${tasks.status} IN ('pending', 'in_progress')`,
          sql`${tasks.dueDate} <= ${todayEnd}`
        )
      );
    const pendingTasksToday = Number(pendingTodayRow?.count ?? 0);

    // 3. Chat access check
    const role = ctx.user.role as ChatRole;
    const isChatAdmin =
      ctx.user.role === "admin"
        ? await canAdminUsePermission(ctx.user, "canManageChat")
        : false;
    const hasChatViewPermission =
      ctx.user.role === "admin"
        ? await canAdminUsePermission(ctx.user, "canViewChat")
        : false;

    const memberRows = await db
      .select({ channelId: chatChannelMembers.channelId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.userId, ctx.user.id));

    const canAccessChat = canOpenChatWorkspace({
      role,
      email: ctx.user.email,
      hasChatViewPermission,
      isChatAdmin,
      isGroupMember: memberRows.length > 0,
    });

    let unreadChatCount = 0;
    if (canAccessChat && memberRows.length > 0) {
      const channelIds = memberRows.map(r => r.channelId);
      const reads = await db
        .select({
          channelId: chatChannelReads.channelId,
          lastReadMessageId: chatChannelReads.lastReadMessageId,
        })
        .from(chatChannelReads)
        .where(
          and(
            inArray(chatChannelReads.channelId, channelIds),
            eq(chatChannelReads.userId, ctx.user.id)
          )
        );

      const readsMap = new Map(reads.map(r => [r.channelId, r.lastReadMessageId ?? 0]));

      for (const channelId of channelIds) {
        const lastRead = readsMap.get(channelId) ?? 0;
        const [unreadRow] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.channelId, channelId),
              gt(chatMessages.id, lastRead),
              sql`${chatMessages.senderId} <> ${ctx.user.id}`
            )
          );
        unreadChatCount += Number(unreadRow?.count ?? 0);
      }
    }

    return {
      overdueTasks,
      pendingTasksToday,
      canAccessChat,
      unreadChatCount,
    };
  }),
});
