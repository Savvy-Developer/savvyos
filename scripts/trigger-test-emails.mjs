/**
 * Trigger all 9 transactional email types to Tyler@savvy.realty
 * Run: node scripts/trigger-test-emails.mjs
 */
import { Resend } from "resend";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = join(__dirname, "../.env");
let RESEND_API_KEY = process.env.RESEND_API_KEY;
try {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k?.trim() === "RESEND_API_KEY") RESEND_API_KEY = v.join("=").trim().replace(/^"|"$/g, "");
  }
} catch {}

if (!RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY not found in env");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

const RECIPIENT = "Tyler@savvy.realty";
const RECIPIENT_NAME = "Tyler";
const APP_URL = "https://savvyos-rgtcxhr8.manus.space";
const BRAND_COLOR = "#0891b2"; // cyan-600
const BLACK = "#111827";

function emailLayout(content, previewText = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SavvyOS</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <!-- Header -->
      <tr><td style="background:${BRAND_COLOR};padding:24px 32px;">
        <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">SavvyOS</span>
        <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:8px;">by Savvy STR Agents</span>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:32px;">
        ${content}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
          © ${new Date().getFullYear()} Savvy STR Agents · SavvyOS CRM Platform<br/>
          <a href="${APP_URL}" style="color:${BRAND_COLOR};text-decoration:none;">Open SavvyOS</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function heading(text, color = BLACK) {
  return `<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:${color};letter-spacing:-0.5px;">${text}</h1>`;
}

function greeting(name) {
  return `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name ?? "there"},</p>`;
}

function infoCard(lines) {
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:16px 0;">
    ${lines.map(l => `<p style="margin:4px 0;font-size:14px;color:#374151;">${l}</p>`).join("")}
  </div>`;
}

function ctaButton(label, url) {
  return `<div style="margin:24px 0 0;">
    <a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">${label}</a>
  </div>`;
}

const emails = [
  {
    type: "lead_assigned",
    subject: "New Lead Assigned — Jane Smith",
    html: emailLayout(
      `${heading("New Lead Assigned")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">A new lead has been assigned to you in SavvyOS.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Contact:</strong>&nbsp; Jane Smith`,
        `<strong style="color:${BLACK};">Notes:</strong>&nbsp; Interested in STR investment, budget $500k`,
      ])}
      ${ctaButton("View Lead in SavvyOS", APP_URL)}`,
      "New lead Jane Smith assigned to you"
    ),
  },
  {
    type: "transaction_created",
    subject: "New Transaction Created — #TXN-TEST-001",
    html: emailLayout(
      `${heading("New Transaction Created")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">A new transaction has been created and assigned to you in SavvyOS.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Transaction:</strong>&nbsp; #TXN-TEST-001`,
        `<strong style="color:${BLACK};">Contact:</strong>&nbsp; Jane Smith`,
        `<strong style="color:${BLACK};">Type:</strong>&nbsp; Buyer`,
        `<strong style="color:${BLACK};">Property:</strong>&nbsp; 123 Mountain View Dr, Asheville, NC`,
        `<strong style="color:${BLACK};">Purchase Price:</strong>&nbsp; $525,000`,
      ])}
      ${ctaButton("View Transaction", APP_URL)}`,
      "New transaction #TXN-TEST-001 created"
    ),
  },
  {
    type: "transaction_status_changed",
    subject: "Transaction Status Updated — #TXN-TEST-001",
    html: emailLayout(
      `${heading("Transaction Status Updated")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">A transaction you're involved in has been updated.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Transaction:</strong>&nbsp; #TXN-TEST-001`,
        `<strong style="color:${BLACK};">Contact:</strong>&nbsp; Jane Smith`,
        `<strong style="color:${BLACK};">New Status:</strong>&nbsp; <span style="font-weight:700;color:${BRAND_COLOR};">Under Contract</span>`,
      ])}
      ${ctaButton("View Transaction", APP_URL)}`,
      "Transaction #TXN-TEST-001 status changed to Under Contract"
    ),
  },
  {
    type: "transaction_closed",
    subject: "🎉 Transaction Closed — #TXN-TEST-001",
    html: emailLayout(
      `${heading("🎉 Transaction Closed!")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">Congratulations! A transaction has been successfully closed.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Transaction:</strong>&nbsp; #TXN-TEST-001`,
        `<strong style="color:${BLACK};">Contact:</strong>&nbsp; Jane Smith`,
        `<strong style="color:${BLACK};">Purchase Price:</strong>&nbsp; $525,000`,
      ])}
      ${ctaButton("View Closed Transaction", APP_URL)}`,
      "Transaction #TXN-TEST-001 has been closed"
    ),
  },
  {
    type: "commission_calculated",
    subject: "Commission Calculated — #TXN-TEST-001",
    html: emailLayout(
      `${heading("Commission Calculated")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">Your commission has been calculated for a transaction.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Transaction:</strong>&nbsp; #TXN-TEST-001`,
        `<strong style="color:${BLACK};">Your Split:</strong>&nbsp; 80%`,
        `<strong style="color:${BLACK};">Your Amount:</strong>&nbsp; <span style="font-weight:700;color:#059669;">$12,600</span>`,
      ])}
      ${ctaButton("View Commission Details", APP_URL)}`,
      "Commission of $12,600 calculated for TXN-TEST-001"
    ),
  },
  {
    type: "task_assigned",
    subject: "Task Assigned — Follow up with Jane Smith re: buy box",
    html: emailLayout(
      `${heading("Task Assigned to You")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">A new task has been assigned to you in SavvyOS.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Task:</strong>&nbsp; Follow up with Jane Smith re: buy box`,
        `<strong style="color:${BLACK};">Contact:</strong>&nbsp; Jane Smith`,
        `<strong style="color:${BLACK};">Due Date:</strong>&nbsp; Mar 25, 2026`,
      ])}
      ${ctaButton("View Task", APP_URL)}`,
      "New task: Follow up with Jane Smith re: buy box"
    ),
  },
  {
    type: "task_due",
    subject: "⏰ Task Due Soon — Follow up with Jane Smith re: buy box",
    html: emailLayout(
      `${heading("⏰ Task Due Soon")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">You have a task coming up soon. Don't let it slip!</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Task:</strong>&nbsp; Follow up with Jane Smith re: buy box`,
        `<strong style="color:${BLACK};">Due:</strong>&nbsp; <span style="font-weight:700;color:#dc2626;">Today</span>`,
      ])}
      ${ctaButton("Complete Task", APP_URL)}`,
      "Task due: Follow up with Jane Smith re: buy box"
    ),
  },
  {
    type: "payout_integrity_fail",
    subject: "⚠️ Commission Integrity Issue — Action Required",
    html: emailLayout(
      `${heading("⚠️ Commission Integrity Issue", "#DC2626")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">A commission payout integrity issue was detected on a transaction you're involved in. The total payout percentages exceed 100%.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Transaction:</strong>&nbsp; #TXN-TEST-001`,
        `<strong style="color:#dc2626;">Action Required:</strong>&nbsp; Please review and correct the payout splits.`,
      ])}
      ${ctaButton("Review Payouts", APP_URL)}`,
      "Commission integrity issue on TXN-TEST-001"
    ),
  },
  {
    type: "listing_created",
    subject: "New Listing Created — 456 Blue Ridge Pkwy, Asheville, NC",
    html: emailLayout(
      `${heading("New Listing Created")}
      ${greeting(RECIPIENT_NAME)}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;">A new listing has been created and assigned to you in SavvyOS.</p>
      ${infoCard([
        `<strong style="color:${BLACK};">Property:</strong>&nbsp; 456 Blue Ridge Pkwy, Asheville, NC`,
        `<strong style="color:${BLACK};">Seller:</strong>&nbsp; Bob Seller`,
        `<strong style="color:${BLACK};">List Price:</strong>&nbsp; <span style="font-weight:700;color:${BRAND_COLOR};">$875,000</span>`,
        `<strong style="color:${BLACK};">Listed:</strong>&nbsp; Mar 18, 2026`,
        `<strong style="color:${BLACK};">Expires:</strong>&nbsp; Jun 18, 2026`,
      ])}
      ${ctaButton("View Listing in SavvyOS", APP_URL)}`,
      "New listing created — 456 Blue Ridge Pkwy, Asheville, NC"
    ),
  },
];

async function main() {
  console.log(`📧 Sending ${emails.length} test emails to ${RECIPIENT}...\n`);
  const results = {};
  for (const email of emails) {
    try {
      const res = await resend.emails.send({
        from: "Savvy STR Agents <notifications@savvy-agents.com>",
        to: [RECIPIENT],
        subject: email.subject,
        html: email.html,
      });
      if (res.error) {
        results[email.type] = `error: ${res.error.message}`;
        console.log(`❌ ${email.type}: ${res.error.message}`);
      } else {
        results[email.type] = "sent";
        console.log(`✅ ${email.type}: sent (id: ${res.data?.id})`);
      }
    } catch (e) {
      results[email.type] = `error: ${e.message}`;
      console.log(`❌ ${email.type}: ${e.message}`);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }
  console.log("\n📊 Summary:");
  const sent = Object.values(results).filter(v => v === "sent").length;
  const errors = Object.values(results).filter(v => v.startsWith("error")).length;
  console.log(`  ✅ Sent: ${sent}/${emails.length}`);
  if (errors > 0) console.log(`  ❌ Errors: ${errors}`);
  console.log("\nFull results:", JSON.stringify(results, null, 2));
}

main().catch(console.error);
