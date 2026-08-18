/**
 * Smart Plans email helper using Resend.
 *
 * Savvy's campaign presentation lives entirely in SAVVY_EMAIL_TEMPLATE_HTML and
 * renderSavvyCampaignEmail below. To use a different look for a future campaign,
 * replace that HTML template while leaving the sendSmartPlanEmail API unchanged.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Savvy STR Agents <hello@savvy-agents.com>";
const SAVVY_LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

// This complete, table-based HTML shell is intentionally centralized and editable.
// Email clients have inconsistent CSS support, so presentation styles are inline.
const SAVVY_EMAIL_TEMPLATE_HTML = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>{{SUBJECT}}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f6f8; color:#1f2937; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#f4f6f8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; border-collapse:separate; border-spacing:0;">
            <tr>
              <td style="padding:24px 32px; background-color:#0d2137; border-radius:12px 12px 0 0;">
                <img src="${SAVVY_LOGO_URL}" width="136" alt="Savvy STR Agents" style="display:block; width:136px; max-width:100%; height:auto; border:0; outline:none; text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td style="height:4px; line-height:4px; font-size:4px; background-color:#f6a526;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:36px 32px 28px; background-color:#ffffff; font-size:16px; line-height:1.65; color:#334155;">
                {{BODY}}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 26px; background-color:#ffffff; border-top:1px solid #e5e7eb; font-size:12px; line-height:1.65; color:#64748b;">
                <p style="margin:0 0 8px;">You are receiving this email because you are a contact of Savvy STR Agents.</p>
                <p style="margin:0 0 8px;"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#475569; text-decoration:underline;">Unsubscribe</a><span style="padding:0 6px;">|</span>Savvy STR Agents<span style="padding:0 6px;">|</span><a href="mailto:hello@savvy-agents.com" style="color:#475569; text-decoration:underline;">hello@savvy-agents.com</a></p>
                <p style="margin:0;">&copy; ${new Date().getFullYear()} Savvy STR Agents. All rights reserved.</p>
              </td>
            </tr>
            <tr>
              <td style="height:14px; line-height:14px; font-size:14px; background-color:#f4f6f8; border-radius:0 0 12px 12px;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const GLOBAL_FOOTER_TEXT = `

---
You are receiving this email because you are a contact of Savvy STR Agents.
To unsubscribe, visit: {{{RESEND_UNSUBSCRIBE_URL}}}
Savvy STR Agents | hello@savvy-agents.com`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function plainTextToHtml(value: string): string {
  return value
    .split("\n")
    .map((line) => `<p style="margin:0 0 14px;">${line ? escapeHtml(line) : "&nbsp;"}</p>`)
    .join("");
}

/**
 * Produces the complete Savvy-branded email HTML. The template and its branding
 * can be removed or replaced in this function without changing campaign logic.
 */
export function renderSavvyCampaignEmail(subject: string, body: string, isHtml = false): string {
  const bodyHtml = isHtml ? body : plainTextToHtml(body);
  return SAVVY_EMAIL_TEMPLATE_HTML
    .replace("{{SUBJECT}}", escapeHtml(subject))
    .replace("{{BODY}}", `<div style="font-size:16px; line-height:1.65; color:#334155;">${bodyHtml}</div>`);
}

export async function sendSmartPlanEmail(params: {
  to: string;
  subject: string;
  body: string;
  /** If true, body is already HTML. If false/undefined, plain text is safely converted to HTML. */
  isHtml?: boolean;
  /** Optional Resend receiving address used to attribute a contact's reply. */
  replyTo?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[SmartPlanEmail] RESEND_API_KEY not configured.");
    return { success: false, error: "Resend not configured" };
  }
  if (!params.to) return { success: false, error: "No recipient email address" };

  const htmlContent = renderSavvyCampaignEmail(params.subject, params.body, params.isHtml);
  const textContent = params.body.replace(/<[^>]+>/g, " ") + GLOBAL_FOOTER_TEXT;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [params.to],
        subject: params.subject,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        html: htmlContent,
        text: textContent,
        headers: {
          "List-Unsubscribe": "<{{{RESEND_UNSUBSCRIBE_URL}}}>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SmartPlanEmail] Send failed (${response.status}):`, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }
    const data = await response.json() as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[SmartPlanEmail] Send error:", message);
    return { success: false, error: message };
  }
}
