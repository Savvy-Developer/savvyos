import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  activityLog,
  agentRenewals,
  groupMembers,
  groups,
  marketAgentAssignments,
  marketProfiles,
  transactions,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date in YYYY-MM-DD format.");

const completionInput = z.object({
  renewalId: z.number().int().positive(),
  meetingDate: dateInput,
  attendees: z.string().trim().max(2000).nullable().optional(),
  discussionSummary: z.string().trim().min(3, "Add a brief summary of the renewal conversation.").max(12000),
  productionReview: z.string().trim().max(8000).nullable().optional(),
  goalsAndCommitments: z.string().trim().max(8000).nullable().optional(),
  followUpItems: z.string().trim().max(8000).nullable().optional(),
  splitNotes: z.string().trim().max(4000).nullable().optional(),
  agreement: z.object({
    url: z.string().url(),
    key: z.string().min(1).max(500),
    name: z.string().min(1).max(255),
    mimeType: z.string().max(255).nullable().optional(),
  }).nullable().optional(),
});

function dateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function dateFromKey(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function addOneYear(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year + 1, month - 1, day));
  // Feb. 29 renewals correctly move to Feb. 28 in non-leap years.
  if (next.getUTCMonth() !== month - 1) next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

function startOfToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function twelveMonthsAgo(): Date {
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - 12);
  return threshold;
}

async function requireRenewalAccess(user: { id: number; role: string; email?: string | null }) {
  if (!(await canAdminUsePermission(user, "canViewAgentRenewals"))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Agent Renewals permission is required." });
  }
}

function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export const agentRenewalsRouter = router({
  /** An admin-facing annual renewal queue with production, market, and split context. */
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    await requireRenewalAccess(ctx.user);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

    const agents = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      commissionSplit: users.commissionSplit,
      marketProfileId: users.marketProfileId,
    }).from(users).where(and(eq(users.role, "agent"), eq(users.isActive, true))).orderBy(asc(users.name));
    const agentIds = agents.map((agent) => agent.id);
    if (agentIds.length === 0) {
      return { upcoming: [], missingDates: [], history: [], summary: { due: 0, overdue: 0, missingDates: 0, completedLast12Months: 0 } };
    }

    const [renewalRows, transactionRows, assignmentRows, groupRows] = await Promise.all([
      db.select().from(agentRenewals).where(inArray(agentRenewals.agentId, agentIds)),
      db.select({
        agentId: transactions.agentId,
        status: transactions.status,
        purchasePrice: transactions.purchasePrice,
        closingDate: transactions.closingDate,
      }).from(transactions).where(inArray(transactions.agentId, agentIds)),
      db.select({
        agentId: marketAgentAssignments.agentId,
        marketName: marketProfiles.name,
        marketState: marketProfiles.state,
        isPrimary: marketAgentAssignments.isPrimary,
      }).from(marketAgentAssignments)
        .innerJoin(marketProfiles, eq(marketAgentAssignments.marketProfileId, marketProfiles.id))
        .where(inArray(marketAgentAssignments.agentId, agentIds)),
      db.select({
        agentId: groupMembers.userId,
        groupName: groups.name,
        groupSplit: groups.leaderCommissionSplit,
        splitOverride: groupMembers.leaderSplitOverride,
      }).from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .where(inArray(groupMembers.userId, agentIds)),
    ]);

    const fallbackMarketIds = Array.from(new Set(agents.map((agent) => agent.marketProfileId).filter((id): id is number => id != null)));
    const fallbackMarkets = fallbackMarketIds.length > 0
      ? await db.select({ id: marketProfiles.id, name: marketProfiles.name, state: marketProfiles.state })
        .from(marketProfiles).where(inArray(marketProfiles.id, fallbackMarketIds))
      : [];
    const fallbackMarketById = new Map(fallbackMarkets.map((market) => [market.id, market]));

    const marketsByAgent = new Map<number, Array<{ name: string; state: string; isPrimary: boolean }>>();
    for (const row of assignmentRows) {
      const current = marketsByAgent.get(row.agentId) ?? [];
      current.push({ name: row.marketName, state: row.marketState, isPrimary: Boolean(row.isPrimary) });
      marketsByAgent.set(row.agentId, current);
    }

    const groupByAgent = new Map<number, Array<{ name: string; split: number | null }>>();
    for (const row of groupRows) {
      const current = groupByAgent.get(row.agentId) ?? [];
      current.push({ name: row.groupName, split: row.splitOverride ?? row.groupSplit ?? null });
      groupByAgent.set(row.agentId, current);
    }

    const productionByAgent = new Map<number, { t12Volume: number; t12Units: number; underContractVolume: number; underContractUnits: number }>();
    const productionThreshold = twelveMonthsAgo();
    for (const row of transactionRows) {
      const current = productionByAgent.get(row.agentId) ?? { t12Volume: 0, t12Units: 0, underContractVolume: 0, underContractUnits: 0 };
      const price = Number(row.purchasePrice ?? 0);
      if (row.status === "closed" && row.closingDate && new Date(row.closingDate) >= productionThreshold) {
        current.t12Units += 1;
        current.t12Volume += price;
      }
      if (row.status === "under_contract") {
        current.underContractUnits += 1;
        current.underContractVolume += price;
      }
      productionByAgent.set(row.agentId, current);
    }

    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const currentDate = startOfToday();
    const toAgentContext = (agentId: number) => {
      const agent = agentById.get(agentId)!;
      const assignedMarkets = marketsByAgent.get(agentId) ?? [];
      const fallback = assignedMarkets.length === 0 && agent.marketProfileId ? fallbackMarketById.get(agent.marketProfileId) : null;
      const marketNames = (fallback ? [{ name: fallback.name, state: fallback.state, isPrimary: true }] : assignedMarkets)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name))
        .map((market) => `${market.name}${market.state ? `, ${market.state}` : ""}`);
      const agentSplit = agent.commissionSplit ?? null;
      const groupSplits = groupByAgent.get(agentId) ?? [];
      return {
        agentId,
        agentName: agent.name ?? agent.email ?? `Agent #${agentId}`,
        agentEmail: agent.email ?? null,
        markets: marketNames,
        production: productionByAgent.get(agentId) ?? { t12Volume: 0, t12Units: 0, underContractVolume: 0, underContractUnits: 0 },
        splits: {
          agent: agentSplit,
          savvy: agentSplit == null ? null : 100 - agentSplit,
          groups: groupSplits,
        },
      };
    };

    const scheduled = renewalRows.filter((row) => row.status === "scheduled");
    const completed = renewalRows.filter((row) => row.status === "completed");
    const completedById = new Map<number, { name: string | null; email: string | null }>();
    const completedByIds = Array.from(new Set(completed.map((row) => row.completedById).filter((id): id is number => id != null)));
    if (completedByIds.length > 0) {
      const completionUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, completedByIds));
      for (const user of completionUsers) completedById.set(user.id, user);
    }

    const upcoming = scheduled
      .map((renewal) => ({
        renewal: { ...renewal, renewalDate: dateKey(renewal.renewalDate) },
        ...toAgentContext(renewal.agentId),
        isOverdue: (dateKey(renewal.renewalDate) ?? "") < currentDate,
      }))
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return (a.renewal.renewalDate ?? "").localeCompare(b.renewal.renewalDate ?? "");
      });

    const scheduledAgentIds = new Set(scheduled.map((renewal) => renewal.agentId));
    const missingDates = agents
      .filter((agent) => !scheduledAgentIds.has(agent.id))
      .map((agent) => toAgentContext(agent.id));

    const historyThreshold = twelveMonthsAgo();
    const history = completed
      .filter((renewal) => renewal.completedAt && new Date(renewal.completedAt) >= historyThreshold)
      .map((renewal) => ({
        renewal: {
          ...renewal,
          renewalDate: dateKey(renewal.renewalDate),
          meetingDate: dateKey(renewal.meetingDate),
          completedBy: renewal.completedById ? (completedById.get(renewal.completedById)?.name ?? completedById.get(renewal.completedById)?.email ?? null) : null,
        },
        ...toAgentContext(renewal.agentId),
      }))
      .sort((a, b) => new Date(b.renewal.completedAt ?? 0).getTime() - new Date(a.renewal.completedAt ?? 0).getTime());

    return {
      upcoming,
      missingDates,
      history,
      summary: {
        due: upcoming.length,
        overdue: upcoming.filter((item) => item.isOverdue).length,
        missingDates: missingDates.length,
        completedLast12Months: history.length,
      },
    };
  }),

  schedule: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive(), renewalDate: dateInput }))
    .mutation(async ({ ctx, input }) => {
      await requireRenewalAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

      const [agent] = await db.select({ id: users.id, role: users.role, isActive: users.isActive })
        .from(users).where(eq(users.id, input.agentId)).limit(1);
      if (!agent || agent.role !== "agent" || !agent.isActive) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Active agent not found." });
      }
      const [existing] = await db.select({ id: agentRenewals.id }).from(agentRenewals)
        .where(and(eq(agentRenewals.agentId, input.agentId), eq(agentRenewals.status, "scheduled"))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "This agent already has a scheduled renewal." });

      const result = await db.insert(agentRenewals).values({ agentId: input.agentId, renewalDate: dateFromKey(input.renewalDate) });
      const renewalId = Number(result[0].insertId);
      await db.insert(activityLog).values({
        userId: ctx.user.id,
        action: "scheduled_agent_renewal",
        entityType: "agent_renewal",
        entityId: renewalId,
        details: { agentId: input.agentId, renewalDate: input.renewalDate },
      });
      return { id: renewalId };
    }),

  complete: protectedProcedure
    .input(completionInput)
    .mutation(async ({ ctx, input }) => {
      await requireRenewalAccess(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

      const result = await db.transaction(async (tx) => {
        const [renewal] = await tx.select().from(agentRenewals).where(eq(agentRenewals.id, input.renewalId)).limit(1);
        if (!renewal) throw new TRPCError({ code: "NOT_FOUND", message: "Renewal not found." });
        if (renewal.status === "completed") throw new TRPCError({ code: "CONFLICT", message: "This renewal has already been completed." });

        const scheduledDate = dateKey(renewal.renewalDate);
        if (!scheduledDate) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Renewal date is unavailable." });
        const nextRenewalDate = addOneYear(scheduledDate);
        const [existingNext] = await tx.select({ id: agentRenewals.id, renewalDate: agentRenewals.renewalDate })
          .from(agentRenewals)
          .where(and(eq(agentRenewals.agentId, renewal.agentId), eq(agentRenewals.status, "scheduled")))
          .limit(1);

        await tx.update(agentRenewals).set({
          status: "completed",
          meetingDate: dateFromKey(input.meetingDate),
          completedAt: new Date(),
          completedById: ctx.user.id,
          attendees: optionalText(input.attendees),
          discussionSummary: input.discussionSummary.trim(),
          productionReview: optionalText(input.productionReview),
          goalsAndCommitments: optionalText(input.goalsAndCommitments),
          followUpItems: optionalText(input.followUpItems),
          splitNotes: optionalText(input.splitNotes),
          agreementUrl: input.agreement?.url ?? null,
          agreementKey: input.agreement?.key ?? null,
          agreementName: input.agreement?.name ?? null,
          agreementMimeType: input.agreement?.mimeType ?? null,
        }).where(eq(agentRenewals.id, renewal.id));

        let nextRenewalId = existingNext?.id ?? null;
        let actualNextRenewalDate = existingNext ? dateKey(existingNext.renewalDate) : nextRenewalDate;
        if (!existingNext) {
          const next = await tx.insert(agentRenewals).values({ agentId: renewal.agentId, renewalDate: dateFromKey(nextRenewalDate) });
          nextRenewalId = Number(next[0].insertId);
        }

        await tx.insert(activityLog).values({
          userId: ctx.user.id,
          action: "completed_agent_renewal",
          entityType: "agent_renewal",
          entityId: renewal.id,
          details: { agentId: renewal.agentId, meetingDate: input.meetingDate, nextRenewalDate: actualNextRenewalDate, agreementAttached: Boolean(input.agreement) },
        });
        return { nextRenewalId, nextRenewalDate: actualNextRenewalDate };
      });

      return { success: true, ...result };
    }),
});
