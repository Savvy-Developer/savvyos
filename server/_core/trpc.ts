import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { auditLogMutation, shouldAuditLog } from "./auditMiddleware";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// ─── Global Audit Middleware ──────────────────────────────────────────────────
// Logs every mutation to the activity_log table for a complete audit trail.
// Runs AFTER the mutation succeeds (fire-and-forget, non-blocking).
const auditMiddleware = t.middleware(async (opts) => {
  const result = await opts.next();

  // Only log successful mutations
  if (result.ok && shouldAuditLog(opts.type, opts.path)) {
    const user = opts.ctx.user;
    void auditLogMutation({
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      userRole: user?.role ?? null,
      path: opts.path,
      input: opts.input,
    });
  }

  return result;
});

export const publicProcedure = t.procedure.use(auditMiddleware);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(auditMiddleware).use(requireUser);

export const adminProcedure = t.procedure.use(auditMiddleware).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
