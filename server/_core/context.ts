import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";
import { parse as parseCookieHeader } from "cookie";
import { agentSupportAssignments } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";

export const SIMULATE_COOKIE = "simulate_user_id";
export const SIMULATE_OWNER_EMAIL = "tyler@savvy.realty";
export const WORK_AS_COOKIE = "work_as_agent_id";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** The real authenticated user (before simulation) */
  realUser: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }

  // Block deactivated users from accessing the app
  if (user && user.isActive === false) {
    user = null;
  }

  const realUser = user;

  // Simulation: allowed for any admin user
  if (user && user.role === "admin") {
    const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
    const simulateId = cookies[SIMULATE_COOKIE];
    if (simulateId) {
      const targetUser = await db.getUserById(parseInt(simulateId, 10));
      if (targetUser) {
        user = targetUser;
      }
    }
  }

  // Agent Support: work-as-agent — scoped to assigned agents only
  if (user && user.role === "agent_support") {
    const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
    const workAsId = cookies[WORK_AS_COOKIE];
    if (workAsId) {
      const agentId = parseInt(workAsId, 10);
      // Verify assignment still exists before allowing impersonation
      const dbConn = await db.getDb();
      if (dbConn) {
        const [assignment] = await dbConn
          .select()
          .from(agentSupportAssignments)
          .where(
            and(
              eq(agentSupportAssignments.agentSupportUserId, user.id),
              eq(agentSupportAssignments.agentId, agentId)
            )
          )
          .limit(1);
        if (assignment) {
          const targetAgent = await db.getUserById(agentId);
          if (targetAgent && targetAgent.role === "agent") {
            user = targetAgent;
          }
        }
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    realUser,
  };
}
