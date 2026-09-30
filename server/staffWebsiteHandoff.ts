import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { magicLinkTokens, users, websiteAgentProfiles } from "../drizzle/schema";
import { getDb, logActivity } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

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

/**
 * Issue a one-time SavvyOS sign-in link for this user, landing on `path`.
 * Only paths from STAFF_SITE_TARGETS (or the default) are ever passed in.
 */
export async function createStaffHandoff(userId: number, path: string = STAFF_HANDOFF_PATH): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const token = crypto.randomBytes(32).toString("base64url");
  await db.insert(magicLinkTokens).values({
    userId,
    token: hashHandoffToken(token),
    redirectPath: safeHandoffRedirect(path),
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


// ─── Staff session on the public website ─────────────────────────────────────

/**
 * Staff who sign in on the website stay signed in on the website.
 *
 * Their session there is its own cookie with its own token audience, separate
 * from both the investor cookie and the SavvyOS staff cookie. It does two
 * things only: it shows the gated listing figures, and it lets the header menu
 * ask for a one-time link into a fixed list of SavvyOS pages. It never grants
 * any SavvyOS procedure on the public host; SavvyOS itself still runs on its
 * own host behind its own login, reached through the handoff above.
 *
 * Because the menu can mint SavvyOS sign-in links, this cookie is treated as a
 * staff credential: httpOnly, seven days rather than the investor's thirty, and
 * the user is re-checked (active, staff role) on every read, so deactivating
 * someone in SavvyOS signs them out of the website on their next request.
 */
export const STAFF_SITE_COOKIE = "savvy_website_staff";
const STAFF_SITE_AUDIENCE = "savvy-website-staff";
export const STAFF_SITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function staffSiteKey() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createStaffSiteSession(
  userId: number,
  expiresInMs = STAFF_SITE_LIFETIME_MS
): Promise<string> {
  return new SignJWT({ websiteStaff: true, userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setAudience(STAFF_SITE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
    .sign(staffSiteKey());
}

export async function readStaffSiteSession(token: string | null | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, staffSiteKey(), {
      algorithms: ["HS256"],
      audience: STAFF_SITE_AUDIENCE,
    });
    if (payload.websiteStaff !== true) return null;
    const userId = Number(payload.userId);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null;
  }
}

function readStaffSiteCookie(req: Request): string | null {
  const header = req.headers.cookie ?? "";
  const match = header
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${STAFF_SITE_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(STAFF_SITE_COOKIE.length + 1)) : null;
}

/**
 * SameSite=Lax, unlike the other session cookies, which are None. The website
 * only ever calls its own API from its own pages, so it never needs this
 * cookie on a request from another site, and Lax keeps the browser from
 * sending it on one. That matters here because this cookie can mint SavvyOS
 * sign-in links (staffOpen): a page elsewhere must not be able to spend it.
 */
export function staffSiteCookieOptions(req: Request) {
  const base = getSessionCookieOptions(req);
  return { httpOnly: true, path: "/", secure: base.secure, sameSite: "lax" as const };
}

export async function staffSiteCookieFor(req: Request, userId: number) {
  return {
    name: STAFF_SITE_COOKIE,
    value: await createStaffSiteSession(userId),
    options: { ...staffSiteCookieOptions(req), maxAge: STAFF_SITE_LIFETIME_MS },
  };
}

export function clearedStaffSiteCookie(req: Request) {
  return {
    name: STAFF_SITE_COOKIE,
    value: "",
    options: { ...staffSiteCookieOptions(req), maxAge: 0 },
  };
}

/** The origins the public website's own pages are served from. */
export function websiteOrigins(): Set<string> {
  const host = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
  const extra = (process.env.STAFF_SITE_EXTRA_ORIGINS || "")
    .split(",")
    .map(value => value.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);
  return new Set([`https://${host}`, `https://www.${host}`, ...extra]);
}

/**
 * Whether a request came from one of the website's own pages.
 *
 * A second line behind the Lax cookie for staffOpen: the browser sets Origin
 * on every cross-site POST and a page cannot forge it. A request with no
 * Origin is accepted only when the browser itself says it is same-origin
 * (Sec-Fetch-Site). Local development hosts are allowed outside production.
 */
export function isFromWebsiteOrigin(req: Pick<Request, "headers">): boolean {
  const originHeader = req.headers.origin;
  const origin = (Array.isArray(originHeader) ? originHeader[0] : originHeader || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
  if (origin) {
    if (websiteOrigins().has(origin)) return true;
    if (
      process.env.NODE_ENV !== "production" &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    )
      return true;
    return false;
  }
  const fetchSite = req.headers["sec-fetch-site"];
  return (Array.isArray(fetchSite) ? fetchSite[0] : fetchSite) === "same-origin";
}

/**
 * Where the staff menu can send someone in SavvyOS. A fixed list: the client
 * names a key, never a path, so the website cannot be used to mint a link to
 * anywhere else.
 */
export const STAFF_SITE_TARGETS = {
  properties: { label: "Manage properties", adminOnly: false },
  caseStudies: { label: "My case studies", adminOnly: false },
  blog: { label: "My blog posts", adminOnly: false },
  profile: { label: "My website profile", adminOnly: false },
  websiteStudio: { label: "Website Studio", adminOnly: true },
  dashboard: { label: "Open SavvyOS", adminOnly: false },
} as const;

export type StaffSiteTarget = keyof typeof STAFF_SITE_TARGETS;
export const STAFF_SITE_TARGET_KEYS = Object.keys(STAFF_SITE_TARGETS) as [StaffSiteTarget, ...StaffSiteTarget[]];

export function staffTargetPath(target: StaffSiteTarget, userId: number): string {
  switch (target) {
    case "properties":
      return "/properties";
    case "caseStudies":
      return "/my-website/case-studies";
    case "blog":
      return "/my-website/blog";
    case "profile":
      return `/agents/${userId}?tab=website-profile`;
    case "websiteStudio":
      return "/website";
    default:
      return "/";
  }
}

export function staffMenuFor(role: string | null | undefined): Array<{ key: StaffSiteTarget; label: string }> {
  return STAFF_SITE_TARGET_KEYS.filter(key => !STAFF_SITE_TARGETS[key].adminOnly || role === "admin").map(key => ({
    key,
    label: STAFF_SITE_TARGETS[key].label,
  }));
}

/** The staff member signed in on the website, or null. */
export async function staffFromRequest(req: Request) {
  const userId = await readStaffSiteSession(readStaffSiteCookie(req));
  if (!userId) return null;
  const db = await getDb();
  if (!db) return null;
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      personType: users.personType,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !isHandoffEligible(user)) return null;
  const [profile] = await db
    .select({ imageUrl: websiteAgentProfiles.imageUrl, slug: websiteAgentProfiles.slug, status: websiteAgentProfiles.status })
    .from(websiteAgentProfiles)
    .where(eq(websiteAgentProfiles.userId, user.id))
    .limit(1);
  return {
    id: user.id,
    name: user.name ?? user.email ?? "Savvy team",
    email: user.email ?? "",
    role: user.role as string,
    imageUrl: profile?.imageUrl ?? null,
    profileSlug: profile?.status === "published" ? profile.slug : null,
  };
}
