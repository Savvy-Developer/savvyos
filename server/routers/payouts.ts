import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getAllPayoutItems, getDb, getAgentGroupLeadership } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { transactionPayoutItems, transactions, contacts, users, groupMembers } from "../../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { PAYOUT_STATUSES } from "@shared/payoutStatus";
import { setPayoutStatus } from "../payoutStatusWorkflow";

const payoutStatusSchema = z.enum(PAYOUT_STATUSES);

export const payoutsRouter = router({
  listAll: protectedProcedure
    .input(z.object({ paid: z.boolean().optional(), status: payoutStatusSchema.optional(), agentId: z.number().optional(), payeeType: z.string().optional(), search: z.string().trim().max(200).optional(), dateFrom: z.string().optional(), dateTo: z.string().optional(), sortOrder: z.enum(["asc", "desc"]).default("desc") }).optional())
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "isa") throw new TRPCError({ code: "FORBIDDEN" });
      return getAllPayoutItems({ paid: input?.paid, status: input?.status, agentId: input?.agentId, payeeType: input?.payeeType, search: input?.search, dateFrom: input?.dateFrom ? new Date(input.dateFrom) : undefined, dateTo: input?.dateTo ? new Date(input.dateTo) : undefined, sortOrder: input?.sortOrder ?? "desc" });
    }),
  myPayouts: protectedProcedure
    .input(z.object({ paid: z.boolean().optional(), status: payoutStatusSchema.optional() }).optional())
    .query(({ input, ctx }) => getAllPayoutItems({ payeeUserId: ctx.user.id, paid: input?.paid, status: input?.status, payeeType: "agent" })),
  groupLeaderPayouts: protectedProcedure
    .input(z.object({ paid: z.boolean().optional(), status: payoutStatusSchema.optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { payouts: [], group: null };
      const group = await getAgentGroupLeadership(ctx.user.id);
      const conditions = [eq(transactionPayoutItems.payeeType, "group_leader"), eq(transactionPayoutItems.payeeUserId, ctx.user.id)];
      if (input?.status) conditions.push(eq(transactionPayoutItems.status, input.status));
      else if (input?.paid !== undefined) conditions.push(inArray(transactionPayoutItems.status, input.paid ? ["paid", "settled"] : ["unreviewed", "reviewed"]));
      const payouts = await db.select({ payout: transactionPayoutItems, transaction: transactions, contact: contacts, agent: { id: users.id, name: users.name } }).from(transactionPayoutItems).leftJoin(transactions, eq(transactionPayoutItems.transactionId, transactions.id)).leftJoin(contacts, eq(transactions.primaryContactId, contacts.id)).leftJoin(users, eq(transactions.agentId, users.id)).where(and(...conditions)).orderBy(desc(transactionPayoutItems.createdAt));
      let members: Array<{ id: number; name: string | null }> = [];
      if (group) {
        const memberRows = await db.select({ userId: groupMembers.userId, name: users.name }).from(groupMembers).leftJoin(users, eq(groupMembers.userId, users.id)).where(eq(groupMembers.groupId, group.id));
        members = memberRows.map(m => ({ id: m.userId, name: m.name }));
      }
      return { payouts, group, members };
    }),
  setStatus: protectedProcedure
    .input(z.object({ id: z.number(), transactionId: z.number(), status: payoutStatusSchema, confirmSettlement: z.boolean().optional(), overrideSettled: z.boolean().optional(), overrideReason: z.string().trim().max(1000).optional() }))
    .mutation(({ input, ctx }) => setPayoutStatus(ctx.user, { payoutItemId: input.id, transactionId: input.transactionId, status: input.status, confirmSettlement: input.confirmSettlement, overrideSettled: input.overrideSettled, overrideReason: input.overrideReason })),
  // Deprecated compatibility route. Delegation retains the settled lock and audit trail.
  markPaid: protectedProcedure
    .input(z.object({ id: z.number(), paid: z.boolean(), paidDate: z.string().optional() }))
    .mutation(({ input, ctx }) => setPayoutStatus(ctx.user, { payoutItemId: input.id, status: input.paid ? "paid" : "unreviewed" })),
});
