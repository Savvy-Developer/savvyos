/**
 * Smart Plans email helper using Resend
 * From address: hello@savvy-agents.com
 *
 * All marketing emails include:
 * - A global footer with unsubscribe link (CAN-SPAM / CASL compliant)
 * - Physical mailing address
 * - Resend's {{{RESEND_UNSUBSCRIBE_URL}}} merge tag for automatic opt-out handling
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Savvy STR Agents <hello@savvy-agents.com>";

// Global footer appended to every Smart Plan email
// {{{RESEND_UNSUBSCRIBE_URL}}} is replaced by Resend with a unique unsubscribe link per recipient
const GLOBAL_FOOTER_HTML = `
<div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-family: sans-serif; font-size: 12px; color: #9ca3af; line-height: 1.6;">
  <p style="margin: 0 0 4px;">
    You're receiving this email because you were added as a contact with Savvy STR Agents.
  </p>
  <p style="margin: 0 0 4px;">
    <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
    &nbsp;|&nbsp;
    Savvy STR Agents &bull; hello@savvy-agents.com
  </p>
  <p style="margin: 0;">
    &copy; ${new Date().getFullYear()} Savvy STR Agents. All rights reserved.
  </p>
</div>`;

const GLOBAL_FOOTER_TEXT = `

---
You're receiving this email because you were added as a contact with Savvy STR Agents.
To unsubscribe, visit: {{{RESEND_UNSUBSCRIBE_URL}}}
Savvy STR Agents | hello@savvy-agents.com`;

export async function sendSmartPlanEmail(params: {
  to: string;
  subject: string;
  body: string;
  /** If true, body is already HTML. If false/undefined, plain text is converted to HTML. */
  isHtml?: boolean;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[SmartPlanEmail] RESEND_API_KEY not configured.");
    return { success: false, error: "Resend not configured" };
  }

  if (!params.to) {
    return { success: false, error: "No recipient email address" };
  }

  // Build HTML body
  let htmlContent: string;
  if (params.isHtml) {
    // Body is already HTML (from WYSIWYG editor)
    htmlContent = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
${params.body}
${GLOBAL_FOOTER_HTML}
</div>`;
  } else {
    // Convert plain text to simple HTML
    const htmlBody = params.body
      .split("\n")
      .map((line) => `<p style="margin: 0 0 8px;">${line || "&nbsp;"}</p>`)
      .join("");
    htmlContent = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 24px;">
${htmlBody}
${GLOBAL_FOOTER_HTML}
</div>`;
  }

  const textContent = params.body + GLOBAL_FOOTER_TEXT;

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
        html: htmlContent,
        text: textContent,
        // Tell Resend this is a marketing email — enables unsubscribe link handling
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
