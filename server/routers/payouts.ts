import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllPayoutItems, updatePayoutItem, getDb, getAgentGroupLeadership } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { transactionPayoutItems, transactions, contacts, users, groups, groupMembers } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const payoutsRouter = router({
  /** Admin/ISA: all payout items across brokerage */
  listAll: protectedProcedure
    .input(z.object({
      paid: z.boolean().optional(),
      agentId: z.number().optional(),
      payeeType: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "isa") throw new TRPCError({ code: "FORBIDDEN" });
      return getAllPayoutItems({
        paid: input?.paid,
        agentId: input?.agentId,
        payeeType: input?.payeeType,
        dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined,
        dateTo: input?.dateTo ? new Date(input.dateTo) : undefined,
        sortOrder: input?.sortOrder ?? "desc",
      });
    }),

  /** Agent: only payout items where they are the payee */
  myPayouts: protectedProcedure
    .input(z.object({
      paid: z.boolean().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      // Only return "agent" type payouts — group_leader payouts are shown on the Group Leader Commissions page
      return getAllPayoutItems({ payeeUserId: ctx.user.id, paid: input?.paid, payeeType: "agent" });
    }),

  /** Group leader: payouts where payeeType = group_leader and payeeUserId = current user */
  groupLeaderPayouts: protectedProcedure
    .input(z.object({
      paid: z.boolean().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { payouts: [], group: null };
      // Check if user is a group leader
      const group = await getAgentGroupLeadership(ctx.user.id);
      const conditions = [
        eq(transactionPayoutItems.payeeType, "group_leader"),
        eq(transactionPayoutItems.payeeUserId, ctx.user.id),
      ];
      if (input?.paid !== undefined) conditions.push(eq(transactionPayoutItems.isPaid, input.paid));
      const payouts = await db
        .select({
          payout: transactionPayoutItems,
          transaction: transactions,
          contact: contacts,
          agent: { id: users.id, name: users.name },
        })
        .from(transactionPayoutItems)
        .leftJoin(transactions, eq(transactionPayoutItems.transactionId, transactions.id))
        .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
        .leftJoin(users, eq(transactions.agentId, users.id))
        .where(and(...conditions))
        .orderBy(desc(transactionPayoutItems.createdAt));
      // Get group members
      let members: Array<{ id: number; name: string | null }> = [];
      if (group) {
        const memberRows = await db
          .select({ userId: groupMembers.userId, name: users.name })
          .from(groupMembers)
          .leftJoin(users, eq(groupMembers.userId, users.id))
          .where(eq(groupMembers.groupId, group.id));
        members = memberRows.map(m => ({ id: m.userId, name: m.name }));
      }
      return { payouts, group, members };
    }),

  markPaid: protectedProcedure
    .input(z.object({
      id: z.number(),
      paid: z.boolean(),
      paidDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await updatePayoutItem(input.id, {
        isPaid: input.paid,
        paidDate: input.paid ? (input.paidDate ? new Date(input.paidDate) : new Date()) : null,
      } as any);
      return { success: true };
    }),
});
