import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

// Stamped at server startup. Railway injects RAILWAY_GIT_COMMIT_SHA at
// runtime; we fall back to a timestamp so local dev still gets a unique id.
const BUILD_ID =
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.RAILWAY_DEPLOYMENT_ID ??
  String(Date.now());

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
      buildId: BUILD_ID,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
