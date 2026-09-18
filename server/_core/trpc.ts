import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { auditLogMutation, shouldAuditLog } from "./auditMiddleware";
import { accountFromRequest } from "./websiteAccountAuth";
import { stripSensitiveUserFields } from "./userResponse";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// ─── Global Audit Middleware ──────────────────────────────────────────────────
// Logs every successful mutation to the activity_log table for a complete audit trail.
// Audit persistence errors are contained, so this never changes mutation outcomes.
const auditMiddleware = t.middleware(async (opts) => {
  const result = await opts.next();

  // Only log successful mutations
  if (result.ok && shouldAuditLog(opts.type, opts.path)) {
    const user = opts.ctx.user;
    await auditLogMutation({
      userId: user?.id ?? null,
      userName: user?.name ?? null,
      userRole: user?.role ?? null,
      path: opts.path,
      input: opts.input,
    });
  }

  // Endpoint DTOs are the primary contract. This recursive scrub is a final
  // guardrail for nested user joins so authentication records never reach a
  // browser if a future procedure accidentally returns a raw user row.
  if (result.ok) {
    return {
      ...result,
      data: stripSensitiveUserFields(result.data),
    };
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

/**
 * A procedure for the public website's signed-in investors.
 *
 * Deliberately not built on requireUser. `ctx.user` is a member of staff; an
 * investor is someone else entirely, resolved from their own cookie against
 * their own table. Keeping the two apart at the procedure level means a
 * website endpoint cannot accidentally accept a staff session, and a staff
 * endpoint cannot accidentally accept an investor's.
 */
const requireWebsiteAccount = t.middleware(async opts => {
  const { ctx, next } = opts;
  const account = await accountFromRequest(ctx.req as any);
  if (!account) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in." });
  }
  return next({ ctx: { ...ctx, account } });
});

export const websiteAccountProcedure = t.procedure
  .use(auditMiddleware)
  .use(requireWebsiteAccount);

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
