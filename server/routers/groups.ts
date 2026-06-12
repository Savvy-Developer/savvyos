import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
  getUserById,
  getAgentGroupMembership,
  getAgentGroupLeadership,
} from "../db";
import { getDb } from "../db";
import { groupMembers, groups, transactions, agentConnections, agentGoals, users } from "../../drizzle/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";

export const groupsRouter = router({
  list: protectedProcedure.query(async () => {
    return getGroups();
  }),

  // Returns the current agent's group membership info (for commission calculations)
  myGroupInfo: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "agent") return null;
    const db = await getDb();
    if (!db) return null;
    // Check if agent is a group leader
    const leadership = await getAgentGroupLeadership(ctx.user.id);
    if (leadership) {
      return {
        isLeader: true as const,
        groupId: leadership.id,
        groupName: leadership.name,
        leaderCommissionSplit: leadership.leaderCommissionSplit,
        leaderSplitOverride: null as number | null,
      };
    }
    // Check if agent is a group member
    const membership = await getAgentGroupMembership(ctx.user.id);
    if (membership) {
      const [groupRow] = await db.select().from(groups).where(eq(groups.id, membership.groupId)).limit(1);
      return {
        isLeader: false as const,
        groupId: membership.groupId,
        groupName: groupRow?.name ?? null,
        leaderCommissionSplit: groupRow?.leaderCommissionSplit ?? null,
        leaderSplitOverride: membership.leaderSplitOverride ?? null,
      };
    }
    return null;
  }),

  /** Returns true if the current user is a group leader */
  isGroupLeader: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "agent") return { isLeader: false };
    const group = await getAgentGroupLeadership(ctx.user.id);
    return { isLeader: !!group, groupId: group?.id ?? null, groupName: group?.name ?? null };
  }),

  /** Returns true if a specific user (by id) is a group leader — admin use */
  isGroupLeaderForUser: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") return { isLeader: false };
      const group = await getAgentGroupLeadership(input.userId);
      return { isLeader: !!group, groupId: group?.id ?? null, groupName: group?.name ?? null };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      leaderId: z.number().optional().nullable(),
      leaderCommissionSplit: z.number().min(0).max(100).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      // Validate leader is an agent and not already in another group
      if (input.leaderId) {
        const leader = await getUserById(input.leaderId);
        if (!leader || leader.role !== "agent") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Group leader must be an Agent." });
        }
        const existingMembership = await getAgentGroupMembership(input.leaderId);
        if (existingMembership) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${leader.name ?? "This agent"} is already a member of another group.` });
        }
        const existingLeadership = await getAgentGroupLeadership(input.leaderId);
        if (existingLeadership) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${leader.name ?? "This agent"} is already a leader of another group.` });
        }
      }
      const id = await createGroup({ name: input.name, leaderId: input.leaderId ?? undefined, leaderCommissionSplit: input.leaderCommissionSplit ?? undefined });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      leaderId: z.number().optional().nullable(),
      leaderCommissionSplit: z.number().min(0).max(100).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      // Validate new leader is an agent and not already in another group
      if (input.leaderId != null) {
        const leader = await getUserById(input.leaderId);
        if (!leader || leader.role !== "agent") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Group leader must be an Agent." });
        }
        const existingMembership = await getAgentGroupMembership(input.leaderId);
        if (existingMembership && existingMembership.groupId !== input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${leader.name ?? "This agent"} is already a member of another group.` });
        }
        const existingLeadership = await getAgentGroupLeadership(input.leaderId);
        if (existingLeadership && existingLeadership.id !== input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${leader.name ?? "This agent"} is already a leader of another group.` });
        }
      }
      const { id, ...data } = input;
      await updateGroup(id, data as any);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await deleteGroup(input.id);
      return { success: true };
    }),

  /**
   * Group Leader Dashboard: returns team-level KPIs and per-member stats.
   * Accessible by the group leader (agent who leads the group) or admins.
   */
  teamDashboard: protectedProcedure
    .input(z.object({ year: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const year = input.year ?? new Date().getFullYear();
      // Resolve which group to show
      let groupRow: typeof groups.$inferSelect | undefined;
      if (ctx.user.role === "admin") {
        // Admin must pass a groupId via the year param — not supported here; return null
        return null;
      }
      groupRow = await getAgentGroupLeadership(ctx.user.id);
      if (!groupRow) throw new TRPCError({ code: "FORBIDDEN", message: "Not a group leader" });
      const groupId = groupRow.id;
      // Get all members
      const memberRows = await getGroupMembers(groupId);
      const memberIds = memberRows.map((r) => r.user?.id).filter(Boolean) as number[];
      // Include the leader themselves
      const allAgentIds = Array.from(new Set([ctx.user.id, ...memberIds]));
      if (allAgentIds.length === 0) {
        return { group: groupRow, members: [], teamStats: { totalGCI: 0, closedDeals: 0, activeDeals: 0, totalPipeline: 0 } };
      }
      // YTD transactions for all agents in the group
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);
      const txRows = await db
        .select()
        .from(transactions)
        .where(
          and(
            inArray(transactions.agentId, allAgentIds),
            sql`${transactions.closingDate} >= ${yearStart}`,
            sql`${transactions.closingDate} <= ${yearEnd}`
          )
        );
      // Pipeline counts for all agents
      const pipelineRows = await db
        .select()
        .from(agentConnections)
        .where(inArray(agentConnections.agentId, allAgentIds));
      // Goals for all agents
      const goalRows = await db
        .select()
        .from(agentGoals)
        .where(and(inArray(agentGoals.agentId, allAgentIds), eq(agentGoals.year, year)));
      // Per-member stats
      const memberStats = allAgentIds.map((agentId) => {
        const member = memberRows.find((r) => r.user?.id === agentId);
        const isLeader = agentId === ctx.user.id;
        const agentUser = isLeader ? ctx.user : member?.user;
        const agentTx = txRows.filter((t) => t.agentId === agentId);
        const closedTx = agentTx.filter((t) => t.status === "closed");
        const activeTx = agentTx.filter((t) => t.status === "under_contract");
        const gci = closedTx.reduce((sum, t) => sum + Number(t.grossCommissionIncome ?? 0), 0);
        const pipeline = pipelineRows.filter(
          (p) => p.agentId === agentId && p.pipelineStatus !== "closed" && p.pipelineStatus !== "dead"
        ).length;
        const goal = goalRows.find((g) => g.agentId === agentId);
        const gciTarget = goal ? Number(goal.gciTarget ?? 0) : 0;
        const gciPct = gciTarget > 0 ? Math.min(Math.round((gci / gciTarget) * 100), 100) : null;
        return {
          agentId,
          name: agentUser?.name ?? "Unknown",
          avatarUrl: (agentUser as any)?.avatarUrl ?? null,
          isLeader,
          closedDeals: closedTx.length,
          activeDeals: activeTx.length,
          gci,
          gciTarget,
          gciPct,
          pipeline,
        };
      });
      // Team totals
      const teamStats = {
        totalGCI: memberStats.reduce((s, m) => s + m.gci, 0),
        closedDeals: memberStats.reduce((s, m) => s + m.closedDeals, 0),
        activeDeals: memberStats.reduce((s, m) => s + m.activeDeals, 0),
        totalPipeline: memberStats.reduce((s, m) => s + m.pipeline, 0),
      };
      return { group: groupRow, members: memberStats, teamStats, year };
    }),

  members: router({
    list: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .query(async ({ input }) => {
        return getGroupMembers(input.groupId);
      }),

    add: protectedProcedure
      .input(z.object({ groupId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        // Only agents can be added as members
        const user = await getUserById(input.userId);
        if (!user || user.role !== "agent") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only Agents can be added to groups." });
        }
        // Agent cannot already be in another group (as member or leader)
        const existingMembership = await getAgentGroupMembership(input.userId);
        if (existingMembership && existingMembership.groupId !== input.groupId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${user.name ?? "This agent"} is already a member of another group.` });
        }
        const existingLeadership = await getAgentGroupLeadership(input.userId);
        if (existingLeadership && existingLeadership.id !== input.groupId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${user.name ?? "This agent"} is already a leader of another group.` });
        }
        await addGroupMember(input.groupId, input.userId);
        return { success: true };
      }),

    remove: protectedProcedure
      .input(z.object({ groupId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        await removeGroupMember(input.groupId, input.userId);
        return { success: true };
      }),

    updateSplit: protectedProcedure
      .input(z.object({ groupId: z.number(), userId: z.number(), leaderSplitOverride: z.number().min(0).max(100).nullable() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new Error("DB unavailable");
        await db.update(groupMembers)
          .set({ leaderSplitOverride: input.leaderSplitOverride })
          .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, input.userId)));
        return { success: true };
      }),
  }),
});
