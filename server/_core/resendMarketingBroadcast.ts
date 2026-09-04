import { renderSavvyCampaignEmail } from "./smartPlanEmail";

const RESEND_API_URL = "https://api.resend.com";
export const RESEND_MARKETING_FROM_ADDRESS =
  "Savvy STR Agents <hello@savvy-agents.com>";

type ResendApiSuccess<T> = { success: true; data: T };
type ResendApiFailure = { success: false; error: string };
type ResendApiResult<T> = ResendApiSuccess<T> | ResendApiFailure;

export type ResendContactImportStatus = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | string;
  counts?: {
    total?: number;
    created?: number;
    updated?: number;
    skipped?: number;
    failed?: number;
  };
};

export type ResendBroadcastStatus = {
  id: string;
  status: "draft" | "queued" | "sent" | string;
  scheduled_at?: string | null;
  sent_at?: string | null;
};

export type ResendBroadcastContact = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  leadSource: string | null;
};

function errorText(status: number, text: string): string {
  const compact = text.replace(/\s+/g, " ").trim().slice(0, 500);
  return `Resend API request failed (${status})${compact ? `: ${compact}` : ""}`;
}

async function resendJson<T>(
  path: string,
  init: RequestInit = {}
): Promise<ResendApiResult<T>> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, error: "Resend is not configured" };

  try {
    const response = await fetch(`${RESEND_API_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok)
      return { success: false, error: errorText(response.status, text) };
    return { success: true, data: JSON.parse(text) as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resendForm<T>(
  path: string,
  form: FormData
): Promise<ResendApiResult<T>> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, error: "Resend is not configured" };

  try {
    const response = await fetch(`${RESEND_API_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    if (!response.ok)
      return { success: false, error: errorText(response.status, text) };
    return { success: true, data: JSON.parse(text) as T };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function csvField(value: string | null | undefined): string {
  const normalized = value ?? "";
  return `"${normalized.replaceAll('"', '""')}"`;
}

/** Builds a portable contact-import file and preserves only the fields needed by One Time Email merge tags. */
export function buildOneTimeBroadcastCsv(
  contacts: ResendBroadcastContact[]
): string {
  const header = ["Email", "First Name", "Last Name", "Savvy Lead Source"];
  const rows = contacts.map(contact =>
    [contact.email, contact.firstName, contact.lastName, contact.leadSource]
      .map(csvField)
      .join(",")
  );
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

/**
 * Converts SavvyOS merge tags to Resend Broadcast contact fields. Resend replaces
 * these fields separately for every recipient after the audience import completes.
 */
export function renderOneTimeBroadcastMergeTags(template: string): string {
  return (
    template
      .replace(
        /\{\{(?:first_name|firstname)\}\}/gi,
        "{{{contact.first_name|there}}}"
      )
      .replace(/\{\{last_name\}\}/gi, "{{{contact.last_name|}}}")
      .replace(
        /\{\{full_name\}\}/gi,
        "{{{contact.first_name|there}}} {{{contact.last_name|}}}"
      )
      .replace(/\{\{agent_name\}\}/gi, "Your Agent")
      .replace(/\{\{lead_source\}\}/gi, "{{{savvy_lead_source|}}}")
      // One-time sends are not linked to a transaction property. This matches the
      // direct sender's existing blank-property fallback.
      .replace(/\{\{property\}\}/gi, "")
  );
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderOneTimeBroadcastEmail(params: {
  subject: string;
  body: string;
}): { subject: string; html: string; text: string } {
  const subject = renderOneTimeBroadcastMergeTags(params.subject);
  const body = renderOneTimeBroadcastMergeTags(params.body);
  const html = renderSavvyCampaignEmail(subject, body, true).replaceAll(
    "{{UNSUBSCRIBE_URL}}",
    "{{{RESEND_UNSUBSCRIBE_URL}}}"
  );
  const text = `${htmlToText(body)}\n\n---\nYou are receiving this email because you are a contact of Savvy STR Agents.\nTo unsubscribe, visit: {{{RESEND_UNSUBSCRIBE_URL}}}\nSavvy STR Agents | hello@savvy-agents.com`;
  return { subject, html, text };
}

export async function createResendSegment(
  name: string
): Promise<ResendApiResult<{ id: string }>> {
  return resendJson("/segments", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function createResendContactImport(params: {
  csv: string;
  segmentId: string;
}): Promise<ResendApiResult<{ id: string }>> {
  const form = new FormData();
  form.set(
    "file",
    new Blob([params.csv], { type: "text/csv" }),
    "savvyos-one-time-send.csv"
  );
  form.set(
    "column_map",
    JSON.stringify({
      email: "Email",
      first_name: "First Name",
      last_name: "Last Name",
      properties: {
        savvy_lead_source: { column: "Savvy Lead Source", type: "string" },
      },
    })
  );
  form.set("on_conflict", "upsert");
  form.set("segments", JSON.stringify([{ id: params.segmentId }]));
  return resendForm("/contacts/imports", form);
}

export async function getResendContactImport(
  importId: string
): Promise<ResendApiResult<ResendContactImportStatus>> {
  return resendJson(`/contacts/imports/${encodeURIComponent(importId)}`);
}

export async function createResendBroadcast(params: {
  name: string;
  segmentId: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<ResendApiResult<{ id: string }>> {
  return resendJson("/broadcasts", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      segment_id: params.segmentId,
      from: RESEND_MARKETING_FROM_ADDRESS,
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });
}

export async function sendResendBroadcast(
  broadcastId: string
): Promise<ResendApiResult<{ id: string }>> {
  return resendJson(`/broadcasts/${encodeURIComponent(broadcastId)}/send`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getResendBroadcast(
  broadcastId: string
): Promise<ResendApiResult<ResendBroadcastStatus>> {
  return resendJson(`/broadcasts/${encodeURIComponent(broadcastId)}`);
}

/** Best-effort mirroring for legacy SavvyOS unsubscribe links. Local opt-out is never contingent on this API call. */
export async function unsubscribeResendMarketingContact(
  email: string
): Promise<void> {
  const result = await resendJson<{ id: string }>(
    `/contacts/${encodeURIComponent(email.trim().toLowerCase())}`,
    {
      method: "PATCH",
      body: JSON.stringify({ unsubscribed: true }),
    }
  );
  if (!result.success && !result.error.includes("(404)")) {
    console.warn(
      "[ResendMarketingBroadcast] Unable to mirror unsubscribe:",
      result.error
    );
  }
}
