import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getMyOverdueTaskCount } from "../db";
import {
  mobileDevices,
  chatChannelMembers,
  chatMessages,
  chatChannelReads,
  chatUserAccess,
  tasks,
  agentConnections,
  transactions,
  properties,
  contacts,
  agentGoals,
} from "../../drizzle/schema";
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
    const explicitAccessRows = await db
      .select({ isEnabled: chatUserAccess.isEnabled })
      .from(chatUserAccess)
      .where(eq(chatUserAccess.userId, ctx.user.id))
      .limit(1);

    const canAccessChat = canOpenChatWorkspace({
      role,
      hasChatViewPermission,
      isChatAdmin,
      hasExplicitAccess: explicitAccessRows[0]?.isEnabled === true,
      hasConversationMembership: memberRows.length > 0,
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

  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      return {
        agentName: ctx.user.name ?? "Agent",
        agentEmail: ctx.user.email,
        role: ctx.user.role,
        activePipelineCount: 0,
        underContractCount: 0,
        underContractVolume: 0,
        closedCountYtd: 0,
        closedGciYtd: 0,
        annualGciGoal: 0,
        goalPacePct: 0,
        overdueTasks: 0,
        pendingTasksToday: 0,
        totalPendingTasks: 0,
        canAccessChat: false,
        unreadChatCount: 0,
        upcomingClosings: [],
        urgentFollowUps: [],
      };
    }

    const currentYear = new Date().getFullYear();
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Pipeline active count
    const [activePipelineRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(agentConnections)
      .where(
        and(
          eq(agentConnections.agentId, ctx.user.id),
          isNull(agentConnections.archivedAt),
          sql`${agentConnections.pipelineStatus} NOT IN ('closed', 'dead', 'do_not_contact')`
        )
      );
    const activePipelineCount = Number(activePipelineRow?.count ?? 0);

    // 2. Under contract transactions
    const underContractRows = await db
      .select({
        id: transactions.id,
        purchasePrice: transactions.purchasePrice,
        grossCommissionIncome: transactions.grossCommissionIncome,
        closingDate: transactions.closingDate,
        status: transactions.status,
        transactionType: transactions.transactionType,
        propertyAddressSnapshot: transactions.propertyAddressSnapshot,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        propertyAddress: properties.address,
        propertyCity: properties.city,
        propertyState: properties.state,
      })
      .from(transactions)
      .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
      .leftJoin(properties, eq(transactions.propertyId, properties.id))
      .where(
        and(
          eq(transactions.agentId, ctx.user.id),
          eq(transactions.status, "under_contract"),
          // Match transactions.list exactly. Referrals belong in the separate
          // Referral report and must never inflate the mobile deal count.
          sql`${transactions.referralId} IS NULL AND NOT EXISTS (
            SELECT 1 FROM \`referral_transaction_links\` rtl
            WHERE rtl.\`transactionId\` = ${transactions.id}
          )`
        )
      )
      .orderBy(transactions.closingDate);

    const underContractCount = underContractRows.length;
    const underContractVolume = underContractRows.reduce(
      (sum, r) => sum + Number(r.purchasePrice ?? 0),
      0
    );

    const upcomingClosings = underContractRows.slice(0, 5).map((r) => {
      const clientName = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") || "Client";
      const address =
        r.propertyAddressSnapshot ||
        [r.propertyAddress, r.propertyCity, r.propertyState].filter(Boolean).join(", ") ||
        "Property";
      return {
        id: r.id,
        clientName,
        address,
        purchasePrice: Number(r.purchasePrice ?? 0),
        gci: Number(r.grossCommissionIncome ?? 0),
        closingDate: r.closingDate ? r.closingDate.toISOString().split("T")[0] : null,
        transactionType: r.transactionType,
      };
    });

    // 3. Closed YTD & Goal
    const [closedYtdRow] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${transactions.id})`,
        gci: sql<number>`COALESCE(SUM(CAST(${transactions.grossCommissionIncome} AS DECIMAL(15,2))), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.agentId, ctx.user.id),
          eq(transactions.status, "closed"),
          sql`YEAR(${transactions.closingDate}) = ${currentYear}`
        )
      );

    const closedCountYtd = Number(closedYtdRow?.count ?? 0);
    const closedGciYtd = Number(closedYtdRow?.gci ?? 0);

    const [goalRow] = await db
      .select({ gciTarget: agentGoals.gciTarget })
      .from(agentGoals)
      .where(
        and(
          eq(agentGoals.agentId, ctx.user.id),
          eq(agentGoals.year, currentYear),
          eq(agentGoals.month, 0)
        )
      )
      .limit(1);

    const annualGciGoal = goalRow?.gciTarget ? Number(goalRow.gciTarget) : 0;
    const goalPacePct = annualGciGoal > 0 ? Math.round((closedGciYtd / annualGciGoal) * 100) : 0;

    // 4. Tasks counts
    const overdueTasks = await getMyOverdueTaskCount(ctx.user.id);
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

    const [totalPendingRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tasks)
      .where(
        and(
          eq(tasks.assignedToId, ctx.user.id),
          sql`${tasks.status} IN ('pending', 'in_progress')`
        )
      );
    const totalPendingTasks = Number(totalPendingRow?.count ?? 0);

    // 5. Urgent follow-ups / recent connections
    const followUpRows = await db
      .select({
        id: agentConnections.id,
        pipelineStatus: agentConnections.pipelineStatus,
        relationshipType: agentConnections.relationshipType,
        followUpDate: agentConnections.followUpDate,
        agingUpdatedAt: agentConnections.agingUpdatedAt,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactPhone: contacts.phone,
        contactEmail: contacts.email,
      })
      .from(agentConnections)
      .leftJoin(contacts, eq(agentConnections.contactId, contacts.id))
      .where(
        and(
          eq(agentConnections.agentId, ctx.user.id),
          isNull(agentConnections.archivedAt),
          sql`${agentConnections.pipelineStatus} NOT IN ('closed', 'dead', 'do_not_contact')`
        )
      )
      .orderBy(
        sql`CASE WHEN ${agentConnections.followUpDate} IS NOT NULL THEN 0 ELSE 1 END`,
        agentConnections.followUpDate,
        agentConnections.agingUpdatedAt
      )
      .limit(5);

    const urgentFollowUps = followUpRows.map((r) => {
      const contactName = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") || "Contact";
      const now = Date.now();
      const lastAction = r.agingUpdatedAt ? new Date(r.agingUpdatedAt).getTime() : now;
      const daysIdle = Math.max(0, Math.floor((now - lastAction) / (1000 * 60 * 60 * 24)));
      return {
        id: r.id,
        contactName,
        phone: r.contactPhone,
        email: r.contactEmail,
        pipelineStatus: r.pipelineStatus,
        relationshipType: r.relationshipType,
        followUpDate: r.followUpDate ? r.followUpDate.toISOString().split("T")[0] : null,
        daysIdle,
      };
    });

    // 6. Chat access & unread counts
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
    const explicitAccessRows = await db
      .select({ isEnabled: chatUserAccess.isEnabled })
      .from(chatUserAccess)
      .where(eq(chatUserAccess.userId, ctx.user.id))
      .limit(1);

    const canAccessChat = canOpenChatWorkspace({
      role,
      hasChatViewPermission,
      isChatAdmin,
      hasExplicitAccess: explicitAccessRows[0]?.isEnabled === true,
      hasConversationMembership: memberRows.length > 0,
    });

    let unreadChatCount = 0;
    if (canAccessChat && memberRows.length > 0) {
      const channelIds = memberRows.map((r) => r.channelId);
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

      const readsMap = new Map(reads.map((r) => [r.channelId, r.lastReadMessageId ?? 0]));

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
      agentName: ctx.user.name ?? "Agent",
      agentEmail: ctx.user.email,
      role: ctx.user.role,
      activePipelineCount,
      underContractCount,
      underContractVolume,
      closedCountYtd,
      closedGciYtd,
      annualGciGoal,
      goalPacePct,
      overdueTasks,
      pendingTasksToday,
      totalPendingTasks,
      canAccessChat,
      unreadChatCount,
      upcomingClosings,
      urgentFollowUps,
    };
  }),
});
