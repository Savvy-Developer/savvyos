const SAVVY_LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

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
              <td style="padding:24px 32px; background-color:#ffffff; border:1px solid #e5e7eb; border-bottom:0; border-radius:12px 12px 0 0;">
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

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function plainTextToEmailHtml(value: string): string {
  return value
    .split("\n")
    .map((line) => `<p style="margin:0 0 14px;">${line ? escapeEmailHtml(line) : "&nbsp;"}</p>`)
    .join("");
}

/** Returns true when the composer supplied a complete document rather than a message fragment. */
export function isCompleteEmailDocument(value: string): boolean {
  return /^\s*(?:<!doctype[^>]*>\s*)?<html[\s>]/i.test(value);
}

/**
 * Produces the standard Savvy email shell around a message fragment. A complete
 * HTML document is intentionally left intact so a sender can replace the
 * default template from the editor's HTML mode.
 */
export function renderSavvyEmail(subject: string, body: string, isHtml = false): string {
  const bodyHtml = isHtml ? body : plainTextToEmailHtml(body);
  return SAVVY_EMAIL_TEMPLATE_HTML
    .replace("{{SUBJECT}}", escapeEmailHtml(subject))
    .replace("{{BODY}}", `<div style="font-size:16px; line-height:1.65; color:#334155;">${bodyHtml}</div>`);
}

/**
 * Adds the sender's saved signature to a fully custom document without applying
 * Savvy's default shell. This preserves intentionally bespoke outbound HTML.
 */
export function appendSignatureToCustomEmail(documentHtml: string, signatureHtml: string): string {
  if (!signatureHtml.trim()) return documentHtml;
  const signature = `<div style="margin-top:28px;">${signatureHtml}</div>`;
  return /<\/body\s*>/i.test(documentHtml)
    ? documentHtml.replace(/<\/body\s*>/i, `${signature}</body>`)
    : `${documentHtml}${signature}`;
}
