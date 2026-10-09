import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";
import { parse as parseCookieHeader } from "cookie";
import { agentSupportAssignments } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { isUserRole, type UserRole } from "@shared/userRoles";

export const SIMULATE_COOKIE = "simulate_user_id";
export const SIMULATE_OWNER_EMAIL = "tyler@savvy.realty";
export const WORK_AS_COOKIE = "work_as_agent_id";
export const ACTIVE_ROLE_COOKIE = "active_workspace_role";

export type ContextUser = User & {
  /** All roles explicitly assigned to this user. */
  roles: UserRole[];
  /** Persisted default workspace role from users.role. */
  primaryRole: UserRole;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: ContextUser | null;
  /** The real authenticated user (before simulation) */
  realUser: ContextUser | null;
};

async function resolveWorkspaceUser(
  rawUser: User,
  requestedRole?: string
): Promise<ContextUser> {
  const primaryRole = rawUser.role as UserRole;
  const roles = await db.getUserRoles(rawUser.id, primaryRole);
  const activeRole =
    requestedRole && isUserRole(requestedRole) && roles.includes(requestedRole)
      ? requestedRole
      : primaryRole;

  return {
    ...rawUser,
    role: activeRole,
    roles,
    primaryRole,
  };
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let rawUser: User | null = null;

  try {
    rawUser = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    rawUser = null;
  }

  // Deactivated accounts and directory-only Teammates can never receive an authenticated session.
  if (rawUser && (rawUser.isActive === false || rawUser.personType === "teammate")) {
    rawUser = null;
  }

  const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
  let realUser = rawUser
    ? await resolveWorkspaceUser(rawUser, cookies[ACTIVE_ROLE_COOKIE])
    : null;
  let user = realUser;

  // Simulation is evaluated using the active workspace role. A multi-role user
  // must deliberately switch into Admin before using an administrator action.
  if (user && user.role === "admin") {
    const simulateId = cookies[SIMULATE_COOKIE];
    if (simulateId) {
      const targetUser = await db.getUserById(parseInt(simulateId, 10));
      if (targetUser) {
        // A workspace choice belongs to the real authenticated identity, not
        // the simulated target. Start each simulated identity at its saved
        // default workspace instead of reusing a potentially unrelated cookie.
        user = await resolveWorkspaceUser(targetUser);
      }
    }
  }

  // A simulated target must also be a Full User; directory-only records never become navigable.
  if (user && user.personType === "teammate") {
    user = null;
  }

  // Agent Support: work-as-agent — scoped to assigned agents only.
  if (user && user.role === "agent_support") {
    const workAsId = cookies[WORK_AS_COOKIE];
    if (workAsId) {
      const agentId = parseInt(workAsId, 10);
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
          if (
            targetAgent &&
            (await db.userHasRole(targetAgent.id, targetAgent.role, "agent"))
          ) {
            // Work-as is explicitly an Agent workflow even when the target has
            // other memberships, so a stale workspace cookie cannot alter it.
            user = await resolveWorkspaceUser(targetAgent, "agent");
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
