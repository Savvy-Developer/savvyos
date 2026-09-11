import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getAgentCelebrationFeed,
  markAgentCelebration,
  reopenAgentCelebration,
  type CelebrationEvent,
} from "../agentCelebrations";
import { canAdminUsePermission } from "./permissions";

const celebrationProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Agent Celebration is available to administrators only.",
    });
  }
  const allowed = await canAdminUsePermission(
    ctx.user,
    "canViewAgentCelebrations"
  );
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Agent Celebration permission is required.",
    });
  }
  return next({ ctx });
});

const celebrationEventSchema = z.object({
  key: z.string().min(1).max(255),
  agentId: z.number().int().positive(),
  agentName: z.string().min(1).max(255),
  email: z.string().email().nullable(),
  phone: z.string().max(64).nullable(),
  profilePhotoUrl: z.string().nullable(),
  category: z.enum(["personal", "production", "team", "review", "goal"]),
  type: z.string().min(1).max(64),
  timeframe: z.enum(["recent", "today", "upcoming"]),
  occurredAt: z.string().datetime(),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(2_000),
  suggestedMessage: z.string().min(1).max(2_000),
  valueLabel: z.string().max(255).nullable(),
  relatedUrl: z.string().min(1).max(512),
  priority: z.number().int().min(0).max(100),
  celebrations: z.array(
    z.object({
      adminId: z.number().int().positive(),
      adminName: z.string().min(1).max(255),
      profilePhotoUrl: z.string().nullable(),
      celebratedAt: z.string().datetime(),
    })
  ),
});

export const agentCelebrationsRouter = router({
  feed: celebrationProcedure
    .input(
      z
        .object({
          daysBack: z.number().int().min(7).max(120).default(30),
          daysForward: z.number().int().min(7).max(90).default(30),
        })
        .default({ daysBack: 30, daysForward: 30 })
    )
    .query(({ input }) => getAgentCelebrationFeed(input)),

  markCelebrated: celebrationProcedure
    .input(celebrationEventSchema)
    .mutation(async ({ input, ctx }) => {
      await markAgentCelebration({
        event: input as CelebrationEvent,
        celebratedById: ctx.user.id,
      });
      return { success: true } as const;
    }),

  reopen: celebrationProcedure
    .input(z.object({ eventKey: z.string().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      await reopenAgentCelebration(input.eventKey, ctx.user.id);
      return { success: true } as const;
    }),
});
