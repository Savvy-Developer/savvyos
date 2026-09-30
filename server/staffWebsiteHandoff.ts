import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { magicLinkTokens, users } from "../drizzle/schema";
import { getDb, logActivity } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";

/**
 * Staff who sign in on the public website get handed to SavvyOS.
 *
 * The website's Sign in box is for investors, but agents and admins keep typing
 * their SavvyOS email and password into it. When those credentials belong to an
 * active SavvyOS user, the website does not create an investor session.
 * Instead it issues a one-time link that signs them into SavvyOS and opens the
 * Properties page.
 *
 * The website (home.savvy-agents.com) and SavvyOS (os.savvy-agents.com) are
 * different hosts, so the staff cookie cannot simply be set from the website.
 * The one-time link is the bridge:
 *
 * - It is issued only after the SavvyOS password has been checked, so the
 *   website never reveals whether an email belongs to staff.
 * - Only a SHA-256 hash of it is stored (in magic_link_tokens), so a database
 *   read does not yield a usable link, and the emailed magic-link route, which
 *   looks tokens up raw, can never redeem one.
 * - It lives for two minutes and is consumed with a conditional update, so it
 *   works once even if two tabs race for it.
 * - It is redeemed on the SavvyOS host only. The public host already answers
 *   404 to every /api path that is not an allowlisted tRPC call.
 */

export const STAFF_HANDOFF_ROUTE = "/api/auth/staff-handoff";
export const STAFF_HANDOFF_PATH = "/properties";
export const STAFF_HANDOFF_TTL_MS = 2 * 60 * 1000;

const STAFF_ROLES = new Set(["admin", "agent", "isa", "agent_support"]);

/** Where SavvyOS lives. APP_URL is not used: it still points at the old Manus host. */
export function staffAppBaseUrl(): string {
  return (process.env.STAFF_APP_URL || "https://os.savvy-agents.com").replace(/\/+$/, "");
}

export function hashHandoffToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Only same-site paths. Anything else lands on the dashboard. */
export function safeHandoffRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/";
  }
  return path;
}

type StaffCandidate = {
  passwordHash?: string | null;
  isActive?: boolean | null;
  personType?: string | null;
  role?: string | null;
};

/**
 * Whether this user may be handed to SavvyOS at all, before any password check.
 * Mirrors auth.login: active, a real sign-in record, and a staff role.
 */
export function isHandoffEligible(user: StaffCandidate | null | undefined): boolean {
  return Boolean(
    user &&
      user.passwordHash &&
      user.isActive &&
      user.personType !== "teammate" &&
      user.role &&
      STAFF_ROLES.has(user.role)
  );
}

// A real bcrypt hash to compare against when the email is not staff, so a
// staff email and any other email take the same time to answer.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = bcrypt.hash(crypto.randomBytes(16).toString("hex"), 12);
  return dummyHash;
}

async function passwordMatches(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * The SavvyOS user these credentials belong to, or null.
 *
 * Always runs exactly one bcrypt comparison, whether or not the email exists,
 * so the answer time does not reveal who is staff.
 */
export async function findStaffForWebsiteSignIn(
  email: string,
  password: string
): Promise<{ id: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      isActive: users.isActive,
      personType: users.personType,
      role: users.role,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const eligible = isHandoffEligible(user);
  const hash = eligible && user?.passwordHash ? user.passwordHash : await getDummyHash();
  const valid = await passwordMatches(password, hash);
  return eligible && valid && user ? { id: user.id } : null;
}

/** Issue a one-time SavvyOS sign-in link for this user. */
export async function createStaffHandoff(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(magicLinkTokens).values({
    userId,
    token: hashHandoffToken(token),
    redirectPath: STAFF_HANDOFF_PATH,
    expiresAt: new Date(Date.now() + STAFF_HANDOFF_TTL_MS),
  });
  return `${staffAppBaseUrl()}${STAFF_HANDOFF_ROUTE}?token=${encodeURIComponent(token)}`;
}

const EXPIRED_REDIRECT = "/login?error=handoff_expired";

export function registerStaffWebsiteHandoffRoute(app: Express) {
  app.get(STAFF_HANDOFF_ROUTE, async (req: Request, res: Response) => {
    // The token is in the address. Keep it out of caches and out of any
    // Referer the next page sends.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");

    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (token.length < 20 || token.length > 200) return res.redirect(302, EXPIRED_REDIRECT);

    try {
      const db = await getDb();
      if (!db) return res.redirect(302, "/login?error=server_error");

      const tokenHash = hashHandoffToken(token);
      const [row] = await db
        .select()
        .from(magicLinkTokens)
        .where(eq(magicLinkTokens.token, tokenHash))
        .limit(1);
      if (!row) return res.redirect(302, EXPIRED_REDIRECT);

      // Consume it in the same statement that checks it is unused and in date,
      // so two requests with the same link cannot both get through.
      const result = await db
        .update(magicLinkTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(magicLinkTokens.id, row.id),
            isNull(magicLinkTokens.usedAt),
            gt(magicLinkTokens.expiresAt, new Date())
          )
        );
      const consumed = Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
      if (consumed !== 1) return res.redirect(302, EXPIRED_REDIRECT);

      const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
      // Checked again here: the account could have been deactivated in the
      // two minutes since the website issued the link.
      if (!user || !isHandoffEligible(user)) return res.redirect(302, EXPIRED_REDIRECT);

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? user.email ?? "",
      });
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });

      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      void logActivity({
        userId: user.id,
        action: "user_login",
        entityType: "user",
        entityId: user.id,
        details: { email: user.email, name: user.name, via: "website_sign_in" },
      });

      return res.redirect(302, safeHandoffRedirect(row.redirectPath));
    } catch (error) {
      console.error("[StaffHandoff] Error redeeming website sign-in link:", error);
      return res.redirect(302, "/login?error=server_error");
    }
  });
}
