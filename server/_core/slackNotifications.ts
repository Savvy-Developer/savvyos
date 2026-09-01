import { ENV } from "./env";
import { invokeLLM } from "./llm";

const SAVVYOS_BASE_URL = "https://os.savvy-agents.com";
const SLACK_TEXT_LIMIT = 3_500;
const RELEASE_DIFF_LIMIT = 36_000;

export type SavvyOSFeatureUpdateNotification = {
  event: "published" | "revised";
  title: string;
  summary: string;
  details?: string | null;
  actionUrl?: string | null;
};

export type SavvyOSReleaseNotification = {
  commitMessage: string;
  changedFiles: string[];
  diff: string;
};

type ReleaseSummary = {
  audience: string;
  whatChanged: string;
  howToUse: string;
  whyItMatters: string;
  additionalImpact: string;
};

const releaseSummarySchema = {
  name: "savvyos_release_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      audience: { type: "string" },
      whatChanged: { type: "string" },
      howToUse: { type: "string" },
      whyItMatters: { type: "string" },
      additionalImpact: { type: "string" },
    },
    required: ["audience", "whatChanged", "howToUse", "whyItMatters", "additionalImpact"],
    additionalProperties: false,
  },
} as const;

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

function normalizeSentence(value: string, maximumLength = 600): string {
  return trimToLength(value.replace(/\s+/g, " ").trim(), maximumLength);
}

function toSavvyOSUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null;
  if (actionUrl.startsWith("/")) return `${SAVVYOS_BASE_URL}${actionUrl}`;
  if (actionUrl.startsWith(`${SAVVYOS_BASE_URL}/`)) return actionUrl;
  return null;
}

function getResponseText(
  response: Awaited<ReturnType<typeof invokeLLM>>
): string {
  const content = response.choices[0]?.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (item): item is { type: "text"; text: string } => item.type === "text"
      )
      .map(item => item.text)
      .join("\n");
  }
  return "";
}

function isReleaseSummary(value: unknown): value is ReleaseSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["audience", "whatChanged", "howToUse", "whyItMatters", "additionalImpact"].every(
    key => typeof candidate[key] === "string"
  );
}

type NavigationLocation = {
  label: string;
  group?: string;
  path?: string;
};

type ReleaseArea = {
  name: string;
  audience: string;
  howToUse: string;
  whyItMatters: string;
};

function releaseSubject(commitMessage: string): string {
  const firstContentLine = commitMessage
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !/^Release (?:Audience|Changes|How|Why|Also)\s*:/i.test(line));
  return (firstContentLine ?? "SavvyOS update")
    .replace(/^(?:feat|fix|chore|refactor|docs|test|build|ci)(?:\([^)]*\))?!?\s*:\s*/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(value: string): string {
  if (!value) return "SavvyOS has been updated";
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function changedLines(diff: string): string[] {
  return diff
    .split(/\r?\n/)
    .filter(line => line.startsWith("+") && !line.startsWith("+++"))
    .map(line => line.slice(1));
}

function findNavigationLocation(diff: string): NavigationLocation | null {
  for (const line of changedLines(diff)) {
    const label = line.match(/label:\s*["']([^"']+)["']/)?.[1];
    if (!label) continue;
    const group = line.match(/group:\s*["']([^"']+)["']/)?.[1];
    const path = line.match(/path:\s*["']([^"']+)["']/)?.[1];
    return { label, group, path };
  }
  return null;
}

function findEnforcedRule(diff: string): string | null {
  for (const line of changedLines(diff)) {
    const message = line.match(/message:\s*["']([^"']+)["']/)?.[1];
    if (message && /(?:must|cannot|only|require)/i.test(message)) return message;
  }
  return null;
}

function releaseArea(notification: SavvyOSReleaseNotification, subject: string): ReleaseArea {
  const material = `${subject}\n${notification.changedFiles.join("\n")}\n${notification.diff}`.toLowerCase();
  if (/(?:agent renewal|renewal)/.test(material)) {
    return {
      name: "Agent Renewals",
      audience: "SavvyOS administrators",
      howToUse: "Open Agent Renewals in the left navigation to review and complete the renewal queue.",
      whyItMatters: "Keeps annual agent renewal work visible and easier to complete on time.",
    };
  }
  if (/(?:pulse|eos)/.test(material)) {
    return {
      name: "Pulse",
      audience: "SavvyOS users who work in Pulse",
      howToUse: "Open Pulse from the left navigation and continue in the updated workspace.",
      whyItMatters: "Keeps meeting, preparation, and personal-work workflows easier to follow.",
    };
  }
  if (/(?:referral)/.test(material)) {
    return {
      name: "Referrals",
      audience: "SavvyOS users who manage referrals",
      howToUse: "Open Referrals from the left navigation and use the updated workflow.",
      whyItMatters: "Makes referral work faster to find and manage.",
    };
  }
  if (/(?:onboarding)/.test(material)) {
    return {
      name: "Onboarding",
      audience: "SavvyOS administrators and agents completing onboarding",
      howToUse: "Open Onboarding from the left navigation and continue with the updated steps.",
      whyItMatters: "Keeps onboarding responsibilities clear and easier to complete.",
    };
  }
  if (/(?:crm|contact|pipeline|task)/.test(material)) {
    return {
      name: "CRM",
      audience: "SavvyOS administrators and CRM users",
      howToUse: "Open the CRM section from the left navigation and use the updated workflow.",
      whyItMatters: "Keeps everyday client-management work easier to find and complete.",
    };
  }
  return {
    name: "SavvyOS",
    audience: "SavvyOS users affected by the updated area",
    howToUse: "Open the updated area in SavvyOS and continue using the workflow as usual.",
    whyItMatters: "Keeps the related workflow clearer and easier to use.",
  };
}

function summaryFromSubject(subject: string, area: ReleaseArea): string {
  const normalized = subject.toLowerCase();
  const remainder = (pattern: RegExp) => subject.replace(pattern, "").trim();
  if (/^add\b/i.test(subject)) return `${sentenceCase(remainder(/^add\s+/i))} is now available in SavvyOS.`;
  if (/^(?:move|place|surface|restore)\b/i.test(subject)) return `${sentenceCase(remainder(/^(?:move|place|surface|restore)\s+/i))} has been updated to make it easier to find.`;
  if (/^simplify\b/i.test(subject)) return `${sentenceCase(remainder(/^simplify\s+/i))} has been simplified for clearer navigation.`;
  if (/^enforce\b/i.test(subject)) return `SavvyOS now enforces ${remainder(/^enforce\s+/i)}.`;
  if (/^tie\b/i.test(subject)) return `${sentenceCase(remainder(/^tie\s+/i))} is now handled automatically in ${area.name}.`;
  if (/^remove\b/i.test(subject)) return `${sentenceCase(remainder(/^remove\s+/i))} has been removed from the workflow.`;
  if (/^improve\b/i.test(subject)) return `${sentenceCase(remainder(/^improve\s+/i))} has been improved.`;
  if (/^fix\b/i.test(subject)) return `${sentenceCase(remainder(/^fix\s+/i))} has been corrected.`;
  return `${sentenceCase(normalized === "savvyos update" ? "SavvyOS workflow" : subject)} has been updated.`;
}

function fallbackReleaseSummary(notification: SavvyOSReleaseNotification): ReleaseSummary {
  const subject = releaseSubject(notification.commitMessage);
  const location = findNavigationLocation(notification.diff);
  const enforcedRule = findEnforcedRule(notification.diff);
  const area = releaseArea(notification, subject);

  if (location?.group) {
    const action = `Open the left navigation, choose ${location.group}, then select ${location.label}.`;
    return {
      audience: location.group === "Admin" || location.group === "CRM" ? "SavvyOS administrators" : area.audience,
      whatChanged: `${location.label} is now located in the ${location.group} section of the left navigation.`,
      howToUse: action,
      whyItMatters: `${location.label} is easier to find in the workflow where it belongs.`,
      additionalImpact: "",
    };
  }

  if (/^enforce\b/i.test(subject) && enforcedRule) {
    const isPulse = area.name === "Pulse";
    return {
      audience: area.audience,
      whatChanged: `${isPulse ? "Pulse" : "SavvyOS"} now enforces this rule: ${sentenceCase(enforcedRule)}`,
      howToUse: isPulse
        ? "When moving a To-Do or Issue in Pulse, choose an authorized meeting destination."
        : area.howToUse,
      whyItMatters: isPulse
        ? "Keeps shared work in the correct meeting context and protects the intended workflow."
        : area.whyItMatters,
      additionalImpact: "",
    };
  }

  return {
    audience: area.audience,
    whatChanged: summaryFromSubject(subject, area),
    howToUse: area.howToUse,
    whyItMatters: area.whyItMatters,
    additionalImpact: "",
  };
}

/**
 * A release author can supply pre-approved, customer-safe Slack copy in the
 * commit body. This is deterministic and prevents an LLM outage from reducing
 * a material product announcement to a generic fallback.
 */
function getCommitReleaseSummary(commitMessage: string): ReleaseSummary | null {
  const fields: Partial<Record<"audience" | "whatChanged" | "howToUse" | "whyItMatters" | "additionalImpact", string>> = {};
  const labels: Record<string, keyof typeof fields> = {
    "Release Audience": "audience",
    "Release Changes": "whatChanged",
    "Release How": "howToUse",
    "Release Why": "whyItMatters",
    "Release Also": "additionalImpact",
  };

  for (const line of commitMessage.split(/\r?\n/)) {
    const match = line.match(/^\s*(Release (?:Audience|Changes|How|Why|Also))\s*:\s*(.+?)\s*$/i);
    if (match) fields[labels[match[1].replace(/\s+/g, " ").replace(/\b\w/g, char => char.toUpperCase())]] = match[2];
  }

  if (!fields.audience || !fields.whatChanged || !fields.howToUse || !fields.whyItMatters) return null;
  return {
    audience: normalizeSentence(fields.audience, 180),
    whatChanged: normalizeSentence(fields.whatChanged, 1_000),
    howToUse: normalizeSentence(fields.howToUse, 900),
    whyItMatters: normalizeSentence(fields.whyItMatters, 900),
    additionalImpact: normalizeSentence(fields.additionalImpact ?? "", 600),
  };
}

function buildReleaseSummaryPrompt(
  notification: SavvyOSReleaseNotification
): string {
  const changedFiles =
    notification.changedFiles.slice(0, 100).join("\n") ||
    "No file list available.";
  const diff =
    trimToLength(notification.diff, RELEASE_DIFF_LIMIT) ||
    "No code diff available.";

  return `You write accurate, plain-language internal release announcements for Savvy OS, a short-term-rental real-estate operating system. Review the trusted release material below and return JSON only using the requested schema.

The Slack message will already start with “Savvy OS has just been updated!” Your job is to explain the update in real-world language. Describe only actual end-user behavior supported by the release material. Say who it affects, using specific groups such as admins, agents, ISAs, agent support, or “SavvyOS users” only when the source supports it. State the concrete features or behavior that changed, exactly how an affected person can find or use them, why they matter, and any important workflow impact. Do not collapse a feature release into a generic maintenance message when the material supports specific features. If the commit message contains Release Audience, Release Changes, Release How, and Release Why lines, those are approved, factual release notes: preserve all of their meaning in the corresponding fields.

Never mention commits, GitHub, source code, file paths, tests, prompts, model names, deployment mechanics, or developer terminology. Never include a customer, employee, email address, phone number, property address, secret, URL, or example record from the release material. Do not infer a feature that is not documented. Use 1–2 concise sentences for each populated field. Leave additionalImpact empty unless there is a material related effect.

Release title:
${notification.commitMessage}

Changed files:
${changedFiles}

Release material:
${diff}`;
}

async function createReleaseSummary(
  notification: SavvyOSReleaseNotification
): Promise<ReleaseSummary> {
  try {
    const releaseNotes = getCommitReleaseSummary(notification.commitMessage);
    if (releaseNotes) return releaseNotes;

    const response = await invokeLLM({
      model: "gpt-5-mini",
      maxTokens: 700,
      responseFormat: {
        type: "json_schema",
        json_schema: releaseSummarySchema,
      },
      messages: [
        {
          role: "system",
          content:
            "Produce factual Savvy OS release summaries. Do not add capabilities, audiences, or outcomes not directly supported by the supplied release material.",
        },
        { role: "user", content: buildReleaseSummaryPrompt(notification) },
      ],
    });
    const parsed = JSON.parse(getResponseText(response));
    if (!isReleaseSummary(parsed))
      throw new Error("Release summary did not match the expected schema.");

    return {
      audience: normalizeSentence(parsed.audience, 180) || "SavvyOS users",
      whatChanged: normalizeSentence(parsed.whatChanged, 1_000),
      howToUse: normalizeSentence(parsed.howToUse, 900),
      whyItMatters: normalizeSentence(parsed.whyItMatters, 900),
      additionalImpact: normalizeSentence(parsed.additionalImpact, 600),
    };
  } catch (error) {
    console.warn(
      "[Slack] Release summary generation failed; using a safe fallback:",
      error
    );
    return fallbackReleaseSummary(notification);
  }
}

async function postToSavvyOSPromptQueue(
  text: string,
  context: string
): Promise<boolean> {
  const webhookUrl = ENV.slackSavvyosPromptQueueWebhookUrl;
  if (!webhookUrl) {
    console.warn(
      `[Slack] ${context} notification skipped: SLACK_SAVVYOS_PROMPT_QUEUE_WEBHOOK_URL is not configured.`
    );
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: trimToLength(text, SLACK_TEXT_LIMIT) }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Slack] ${context} notification failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[Slack] ${context} notification failed:`, error);
    return false;
  }
}

/**
 * Posts a concise, agent-safe Feature Update message to #savvyos-prompt-queue.
 * The webhook is optional so local development and a temporarily unavailable
 * Slack integration never prevent a Feature Update from being saved.
 */
export async function notifySavvyOSFeatureUpdate(
  notification: SavvyOSFeatureUpdateNotification
): Promise<boolean> {
  const actionUrl = toSavvyOSUrl(notification.actionUrl);
  const lines = [
    ":mega: *Savvy OS has just been updated!*",
    `*${sanitizeForSlack(notification.title)}*`,
    sanitizeForSlack(notification.summary),
  ];

  if (notification.details?.trim()) {
    lines.push(sanitizeForSlack(notification.details.trim()));
  }

  if (actionUrl) {
    lines.push(`<${actionUrl}|Open in SavvyOS>`);
  }

  return postToSavvyOSPromptQueue(lines.join("\n"), "Feature Update");
}

/**
 * Turns the actual main-branch code change into a factual, non-technical Slack
 * announcement. The source material stays server-side; only the summary posts.
 */
export async function notifySavvyOSRelease(
  notification: SavvyOSReleaseNotification
): Promise<boolean> {
  const summary = await createReleaseSummary(notification);
  const lines = [
    ":mega: *Savvy OS has just been updated!*",
    `*Who this helps:* ${sanitizeForSlack(summary.audience)}`,
    `*What's new:* ${sanitizeForSlack(summary.whatChanged)}`,
    `*How to use it:* ${sanitizeForSlack(summary.howToUse)}`,
    `*Why it matters:* ${sanitizeForSlack(summary.whyItMatters)}`,
  ];

  if (summary.additionalImpact) {
    lines.push(`*Also affects:* ${sanitizeForSlack(summary.additionalImpact)}`);
  }

  return postToSavvyOSPromptQueue(lines.join("\n"), "release");
}

export const __testables__ = {
  buildReleaseSummaryPrompt,
  fallbackReleaseSummary,
  findEnforcedRule,
  findNavigationLocation,
  getCommitReleaseSummary,
  normalizeSentence,
  releaseSubject,
  sanitizeForSlack,
  toSavvyOSUrl,
  trimToLength,
};
