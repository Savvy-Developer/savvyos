import { Resend } from "resend";
import sanitizeHtml from "sanitize-html";
import { ENV } from "./env";

export const PIPELINE_EMAIL_DAILY_LIMIT = 250;
export const PIPELINE_EMAIL_BATCH_LIMIT = 250;
export const PIPELINE_EMAIL_TIME_ZONE = "America/New_York";

const FROM_ADDRESS = "Savvy STR Agents <notifications@savvy-agents.com>";
const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "blockquote", "code", "pre", "span", "div", "img", "table",
  "thead", "tbody", "tr", "th", "td", "hr",
];

export function sanitizePipelineEmailHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["style", "class"],
      a: ["href", "target", "rel", "title", "style", "class"],
      img: ["src", "alt", "width", "height", "title", "style", "class"],
      table: ["width", "cellpadding", "cellspacing", "border", "role", "style", "class"],
      td: ["width", "colspan", "rowspan", "align", "valign", "style", "class"],
      th: ["width", "colspan", "rowspan", "align", "valign", "style", "class"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "cid"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  }).trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type PipelineMergeValues = {
  first_name: string;
  last_name: string;
  full_name: string;
  agent_name: string;
  sender_name: string;
  lead_source: string;
};

export function renderPipelineMergeTags(
  value: string,
  values: PipelineMergeValues,
  output: "html" | "text"
): string {
  return value.replace(/{{\s*(first_name|last_name|full_name|agent_name|sender_name|lead_source)\s*}}/gi, (_match, key: string) => {
    const rendered = values[key.toLowerCase() as keyof PipelineMergeValues] ?? "";
    return output === "html" ? escapeHtml(rendered) : rendered;
  });
}

export function pipelineUsageDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PIPELINE_EMAIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function wrapPipelineEmail(bodyHtml: string, signatureHtml?: string | null): string {
  const signature = signatureHtml ? sanitizePipelineEmailHtml(signatureHtml) : "";
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;">
        <tr><td style="padding:0 0 24px;"><img src="${LOGO_URL}" width="170" alt="Savvy STR Agents" style="display:block;height:auto;border:0;"></td></tr>
        <tr><td style="font-size:15px;line-height:1.65;">${sanitizePipelineEmailHtml(bodyHtml)}</td></tr>
        ${signature ? `<tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;">${signature}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type PipelineEmailMessage = {
  to: string;
  subject: string;
  html: string;
  replyTo: string;
};

export type PipelineEmailSendResult = {
  index: number;
  status: "accepted" | "failed";
  resendEmailId?: string;
  errorMessage?: string;
};

export async function sendPipelineEmailBatch(
  messages: PipelineEmailMessage[],
  batchId: string
): Promise<PipelineEmailSendResult[]> {
  if (!ENV.resendApiKey) throw new Error("RESEND_API_KEY is not configured");
  const resend = new Resend(ENV.resendApiKey);
  const results: PipelineEmailSendResult[] = [];

  for (let offset = 0; offset < messages.length; offset += 100) {
    const chunk = messages.slice(offset, offset + 100);
    const response = await resend.batch.send(
      chunk.map(message => ({
        from: FROM_ADDRESS,
        to: message.to,
        subject: message.subject,
        html: message.html,
        replyTo: message.replyTo,
      })),
      {
        idempotencyKey: `pipeline-${batchId}-${offset / 100}`,
        batchValidation: "strict",
      }
    );

    if (response.error) {
      chunk.forEach((_message, index) => {
        results.push({
          index: offset + index,
          status: "failed",
          errorMessage: response.error?.message ?? "Resend batch request failed",
        });
      });
      continue;
    }

    chunk.forEach((_message, index) => {
      results.push({
        index: offset + index,
        status: "accepted",
        resendEmailId: response.data?.data[index]?.id,
      });
    });
  }

  return results.sort((a, b) => a.index - b.index);
}
