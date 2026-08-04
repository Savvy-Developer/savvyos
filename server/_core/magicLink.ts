import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { magicLinkTokens, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerMagicLinkRoutes(app: Express) {
  /**
   * GET /api/auth/magic-link?token=xxx
   *
   * Validates the magic link token, sets a session cookie for the user,
   * and redirects to the stored redirect path.
   */
  app.get("/api/auth/magic-link", async (req: Request, res: Response) => {
    const token = getQueryParam(req, "token");

    if (!token) {
      return res.redirect(302, "/login?error=invalid_link");
    }

    try {
      const db = await getDb();
      if (!db) {
        return res.redirect(302, "/login?error=server_error");
      }

      // Look up the token
      const [magicToken] = await db
        .select()
        .from(magicLinkTokens)
        .where(eq(magicLinkTokens.token, token))
        .limit(1);

      if (!magicToken) {
        return res.redirect(302, "/login?error=invalid_link");
      }

      // Check if token is expired
      if (magicToken.expiresAt < new Date()) {
        return res.redirect(302, "/login?error=link_expired");
      }

      // Check if token was already used
      if (magicToken.usedAt) {
        // Token already used — still redirect to the path (user might already be logged in)
        return res.redirect(302, magicToken.redirectPath ?? "/");
      }

      // Mark the token as used
      await db
        .update(magicLinkTokens)
        .set({ usedAt: new Date() })
        .where(eq(magicLinkTokens.id, magicToken.id));

      // Look up the user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, magicToken.userId))
        .limit(1);

      if (!user) {
        return res.redirect(302, "/login?error=user_not_found");
      }

      if (!user.isActive) {
        return res.redirect(302, "/login?error=account_deactivated");
      }

      // Create a session token and set the cookie
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? user.email ?? "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Update last signed in
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));

      // Redirect to the intended path
      const redirectPath = magicToken.redirectPath ?? "/";
      return res.redirect(302, redirectPath);
    } catch (error) {
      console.error("[MagicLink] Error processing magic link:", error);
      return res.redirect(302, "/login?error=server_error");
    }
  });
}
