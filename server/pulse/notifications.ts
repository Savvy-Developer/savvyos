import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { pulseNotificationPreferences, pulseNotifications } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const PULSE_NOTIFICATION_TEMPLATE_KEYS = [
  "meeting_reminder",
  "todo_assigned",
  "cascade_sent",
  "overdue_digest",
  "mention",
  "rock_completed",
  "welcome",
] as const;

export type PulseNotificationTemplateKey = (typeof PULSE_NOTIFICATION_TEMPLATE_KEYS)[number];
const templateKeySchema = z.enum(PULSE_NOTIFICATION_TEMPLATE_KEYS);

function id() {
  return crypto.randomUUID();
}

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
  return db;
}

export async function getPulseNotificationPreference(
  db: any,
  personId: number,
  templateKey: PulseNotificationTemplateKey,
) {
  const [preference] = await db.select({ inApp: pulseNotificationPreferences.inApp, email: pulseNotificationPreferences.email })
    .from(pulseNotificationPreferences)
    .where(and(
      eq(pulseNotificationPreferences.personId, personId),
      eq(pulseNotificationPreferences.templateKey, templateKey),
    ))
    .limit(1);

  return { inApp: preference?.inApp ?? true, email: preference?.email ?? true };
}

export const pulseNotificationsRouter = router({
  preferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    const rows = await db.select({ templateKey: pulseNotificationPreferences.templateKey, inApp: pulseNotificationPreferences.inApp, email: pulseNotificationPreferences.email })
      .from(pulseNotificationPreferences)
      .where(eq(pulseNotificationPreferences.personId, ctx.user.id));
    const byKey = new Map(rows.map((row: any) => [row.templateKey, row]));

    return PULSE_NOTIFICATION_TEMPLATE_KEYS.map((templateKey) => ({
      templateKey,
      inApp: byKey.get(templateKey)?.inApp ?? true,
      email: byKey.get(templateKey)?.email ?? true,
    }));
  }),

  setPreference: protectedProcedure
    .input(z.object({
      templateKey: templateKeySchema,
      inApp: z.boolean().optional(),
      email: z.boolean().optional(),
    }).refine((input) => input.inApp !== undefined || input.email !== undefined, {
      message: "Choose a delivery setting to update.",
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await database();
      const current = await getPulseNotificationPreference(db, ctx.user.id, input.templateKey);
      const next = {
        inApp: input.inApp ?? current.inApp,
        email: input.email ?? current.email,
      };

      await db.insert(pulseNotificationPreferences).values({
        id: id(),
        personId: ctx.user.id,
        templateKey: input.templateKey,
        ...next,
      }).onDuplicateKeyUpdate({ set: next });

      return { templateKey: input.templateKey, ...next };
    }),

  pending: protectedProcedure.query(async ({ ctx }) => {
    const db = await database();
    return db.select()
      .from(pulseNotifications)
      .where(and(
        eq(pulseNotifications.personId, ctx.user.id),
        eq(pulseNotifications.requiresAction, true),
        isNull(pulseNotifications.clearedAt),
      ));
  }),
});
