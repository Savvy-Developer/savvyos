/**
 * Smart Plans email helper using Resend.
 *
 * The complete Savvy campaign shell lives in savvyEmailTemplate so direct
 * outreach and Smart Plan campaigns share one editable branded default.
 */
import {
  renderSavvyEmail,
  withEmailUnsubscribeUrl,
} from "./savvyEmailTemplate";
import { createMarketingUnsubscribeUrl } from "../marketingEmailUnsubscribe";

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Savvy STR Agents <hello@savvy-agents.com>";

function plainTextFooter(unsubscribeUrl: string): string {
  return `

---
You are receiving this email because you are a contact of Savvy STR Agents.
To unsubscribe, visit: ${unsubscribeUrl}
Savvy STR Agents | hello@savvy-agents.com`;
}

/**
 * Backward-compatible Smart Plan renderer. The template can be replaced in the
 * shared module without changing Smart Plan scheduling or sending logic.
 */
export function renderSavvyCampaignEmail(
  subject: string,
  body: string,
  isHtml = false
): string {
  return renderSavvyEmail(subject, body, isHtml);
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
  if (!params.to)
    return { success: false, error: "No recipient email address" };

  const unsubscribeUrl = createMarketingUnsubscribeUrl(params.to);
  if (!unsubscribeUrl) {
    console.error(
      "[SmartPlanEmail] Unable to create campaign unsubscribe URL."
    );
    return { success: false, error: "Campaign unsubscribe link unavailable" };
  }

  const htmlContent = withEmailUnsubscribeUrl(
    renderSavvyCampaignEmail(params.subject, params.body, params.isHtml),
    unsubscribeUrl
  );
  const textContent =
    params.body.replace(/<[^>]+>/g, " ") + plainTextFooter(unsubscribeUrl);

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [params.to],
        subject: params.subject,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        html: htmlContent,
        text: textContent,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[SmartPlanEmail] Send failed (${response.status}):`,
        errorText
      );
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }
    const data = (await response.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[SmartPlanEmail] Send error:", message);
    return { success: false, error: message };
  }
}
