import { ENV } from "./env";

const SAVVYOS_BASE_URL = "https://os.savvy-agents.com";
const SLACK_TEXT_LIMIT = 3_500;

export type SavvyOSFeatureUpdateNotification = {
  event: "published" | "revised" | "unpublished";
  title: string;
  summary: string;
  details?: string | null;
  actionUrl?: string | null;
};

function trimToLength(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}

function sanitizeForSlack(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/@(channel|here|everyone)\b/gi, "@\u200b$1")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function toSavvyOSUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null;
  if (actionUrl.startsWith("/")) return `${SAVVYOS_BASE_URL}${actionUrl}`;
  if (actionUrl.startsWith(`${SAVVYOS_BASE_URL}/`)) return actionUrl;
  return null;
}

function eventLabel(event: SavvyOSFeatureUpdateNotification["event"]): string {
  if (event === "published") return "published";
  if (event === "revised") return "revised";
  return "unpublished";
}

/**
 * Posts a concise, agent-safe Feature Update message to #savvyos-prompt-queue.
 * The webhook is optional so local development and a temporarily unavailable
 * Slack integration never prevent a Feature Update from being saved.
 */
export async function notifySavvyOSFeatureUpdate(
  notification: SavvyOSFeatureUpdateNotification
): Promise<boolean> {
  const webhookUrl = ENV.slackSavvyosPromptQueueWebhookUrl;
  if (!webhookUrl) {
    console.warn(
      "[Slack] Feature Update notification skipped: SLACK_SAVVYOS_PROMPT_QUEUE_WEBHOOK_URL is not configured."
    );
    return false;
  }

  const actionUrl = toSavvyOSUrl(notification.actionUrl);
  const lines = [
    `:mega: *SavvyOS Feature Update ${eventLabel(notification.event)}*`,
    `*${sanitizeForSlack(notification.title)}*`,
    sanitizeForSlack(notification.summary),
  ];

  if (notification.details?.trim()) {
    lines.push(`Details: ${sanitizeForSlack(notification.details.trim())}`);
  }

  if (actionUrl) {
    lines.push(`<${actionUrl}|Open in SavvyOS>`);
  }

  const text = trimToLength(lines.join("\n"), SLACK_TEXT_LIMIT);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Slack] Feature Update notification failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Slack] Feature Update notification failed:", error);
    return false;
  }
}

export const __testables__ = {
  sanitizeForSlack,
  toSavvyOSUrl,
  trimToLength,
};
