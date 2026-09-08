import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { calendarConnections } from "../../drizzle/schema";
import { disconnectGoogleCalendar, isGoogleCalendarConfigured } from "../calendarService";
import { getDb, logActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const calendarConnectionsRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [connection] = await db
      .select({
        provider: calendarConnections.provider,
        calendarId: calendarConnections.calendarId,
        connectedEmail: calendarConnections.connectedEmail,
        status: calendarConnections.status,
        lastError: calendarConnections.lastError,
        lastSyncedAt: calendarConnections.lastSyncedAt,
        disconnectedAt: calendarConnections.disconnectedAt,
      })
      .from(calendarConnections)
      .where(and(eq(calendarConnections.userId, ctx.user.id), eq(calendarConnections.provider, "google")))
      .limit(1);
    return { configured: isGoogleCalendarConfigured(), connection: connection ?? null };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await disconnectGoogleCalendar(ctx.user.id);
    await logActivity({
      userId: ctx.user.id,
      action: "google_calendar_disconnected",
      entityType: "calendar_connection",
      entityId: ctx.user.id,
      details: { provider: "google" },
    });
    return { success: true };
  }),
});
