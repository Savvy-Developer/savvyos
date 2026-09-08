import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import {
  CalendarIntegrationError,
  connectGoogleCalendar,
  googleAuthorizationUrl,
  isGoogleCalendarConfigured,
  parseGoogleOAuthState,
} from "./calendarService";
import { getUserById, logActivity } from "./db";

function profileRedirect(status: string) {
  return `/profile?calendar=${encodeURIComponent(status)}`;
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to connect Google Calendar.";
}

export function registerCalendarOAuthRoutes(app: Express) {
  app.get("/api/calendar/google/connect", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || user.isActive === false || user.personType === "teammate") {
        return res.redirect(302, "/login");
      }
      if (!isGoogleCalendarConfigured()) {
        return res.redirect(302, profileRedirect("not_configured"));
      }
      return res.redirect(302, googleAuthorizationUrl(user.id, user.email));
    } catch {
      return res.redirect(302, "/login");
    }
  });

  app.get("/api/calendar/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const googleError = typeof req.query.error === "string" ? req.query.error : null;
    if (googleError) return res.redirect(302, profileRedirect("declined"));
    if (!code || !state) return res.redirect(302, profileRedirect("failed"));
    try {
      const { userId } = parseGoogleOAuthState(state);
      const user = await getUserById(userId);
      if (!user || user.isActive === false || user.personType === "teammate") {
        return res.redirect(302, profileRedirect("failed"));
      }
      await connectGoogleCalendar(userId, code);
      await logActivity({
        userId,
        action: "google_calendar_connected",
        entityType: "calendar_connection",
        entityId: userId,
        details: { provider: "google" },
      });
      return res.redirect(302, profileRedirect("connected"));
    } catch (error) {
      console.error("[GoogleCalendar] OAuth callback failed:", detail(error));
      const status = error instanceof CalendarIntegrationError && error.code === "not_configured"
        ? "not_configured"
        : "failed";
      return res.redirect(302, profileRedirect(status));
    }
  });
}
