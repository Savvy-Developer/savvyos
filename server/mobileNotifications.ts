import { and, eq, inArray } from "drizzle-orm";
import { mobileDevices } from "../drizzle/schema";
import { getDb } from "./db";

type MobileNotification = {
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null>;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TOKEN_PREFIX = /^(ExponentPushToken|ExpoPushToken)\[/;

/**
 * Sends one transaction-safe event notification per registered device. This is
 * intentionally best-effort: a provider outage must never block a task,
 * pipeline, or Chat mutation.
 */
export async function notifyMobileUsers(
  userIds: number[],
  notification: MobileNotification
): Promise<void> {
  const uniqueUserIds = Array.from(
    new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))
  );
  if (!uniqueUserIds.length) return;

  try {
    const db = await getDb();
    if (!db) return;

    const devices = await db
      .select({ id: mobileDevices.id, deviceToken: mobileDevices.deviceToken })
      .from(mobileDevices)
      .where(
        and(
          inArray(mobileDevices.userId, uniqueUserIds),
          eq(mobileDevices.isActive, true)
        )
      );

    const validDevices = devices.filter((device) => TOKEN_PREFIX.test(device.deviceToken));
    if (!validDevices.length) return;

    for (let start = 0; start < validDevices.length; start += 100) {
      const chunk = validDevices.slice(start, start + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chunk.map((device) => ({
            to: device.deviceToken,
            sound: "default",
            title: notification.title.slice(0, 120),
            body: notification.body.slice(0, 500),
            data: notification.data,
          }))
        ),
      });

      if (!response.ok) {
        console.warn("[MobilePush] Expo push request failed", response.status);
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      const tickets = Array.isArray(payload?.data) ? payload.data : [];
      const invalidIds = tickets
        .map((ticket: any, index: number) =>
          ticket?.details?.error === "DeviceNotRegistered" ? chunk[index]?.id : null
        )
        .filter((id: number | null): id is number => id !== null);

      if (invalidIds.length) {
        await db
          .update(mobileDevices)
          .set({ isActive: false })
          .where(inArray(mobileDevices.id, invalidIds));
      }
    }
  } catch (error) {
    console.warn("[MobilePush] Notification delivery skipped", error);
  }
}
