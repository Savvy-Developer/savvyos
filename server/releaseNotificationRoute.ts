import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "./_core/env";
import { notifySavvyOSRelease } from "./_core/slackNotifications";

const releaseNotificationInput = z.object({
  commitMessage: z.string().trim().min(1).max(6_000),
  changedFiles: z.array(z.string().max(512)).max(100),
  diff: z.string().max(60_000),
});

function secretsMatch(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

/**
 * Receives a trusted main-branch release payload from the repository workflow.
 * The source diff never leaves SavvyOS; the server posts only its factual,
 * plain-language summary to the configured internal Slack channel.
 */
export function registerReleaseNotificationRoute(app: Express): void {
  app.post(
    "/api/internal/release-notification",
    async (req: Request, res: Response) => {
      const suppliedSecret =
        req.headers["x-savvyos-release-notification-secret"];
      if (!secretsMatch(suppliedSecret, ENV.releaseNotificationSecret)) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const parsed = releaseNotificationInput.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid release payload" });
      }

      try {
        const delivered = await notifySavvyOSRelease(parsed.data);
        if (!delivered) {
          return res
            .status(502)
            .json({ ok: false, error: "Slack delivery failed" });
        }
        return res.json({ ok: true });
      } catch (error) {
        console.error(
          "[ReleaseNotification] Unable to deliver release summary:",
          error
        );
        return res
          .status(500)
          .json({ ok: false, error: "Release summary failed" });
      }
    }
  );
}

export const __testables__ = { secretsMatch };
