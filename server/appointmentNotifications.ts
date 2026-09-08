import { Resend } from "resend";
import { ENV } from "./_core/env";

const FROM_ADDRESS = "Savvy STR Agents <notifications@savvy-agents.com>";

type AppointmentEmailInput = {
  recipientEmail: string;
  recipientName?: string | null;
  clientName: string;
  agentName: string;
  title: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  location?: string | null;
  notes?: string | null;
  appointmentId: number;
  action: "scheduled" | "rescheduled" | "canceled";
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[char] ?? char);
}

function formatDateTime(value: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(value);
  } catch {
    return value.toLocaleString();
  }
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function appointmentIcs(input: AppointmentEmailInput): string {
  const status = input.action === "canceled" ? "CANCELLED" : "CONFIRMED";
  const sequence = input.action === "scheduled" ? 0 : 1;
  const description = [
    `Client: ${input.clientName}`,
    `Agent: ${input.agentName}`,
    input.notes?.trim() || "",
  ].filter(Boolean).join("\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Savvy STR Agents//SavvyOS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:savvyos-appointment-${input.appointmentId}@savvy-agents.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.startAt)}`,
    `DTEND:${icsDate(input.endAt)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `SUMMARY:${icsEscape(input.title)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    input.location?.trim() ? `LOCATION:${icsEscape(input.location.trim())}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function subjectFor(input: AppointmentEmailInput): string {
  if (input.action === "canceled") return `Canceled: ${input.title}`;
  if (input.action === "rescheduled") return `Updated: ${input.title}`;
  return `Confirmed appointment: ${input.title}`;
}

function emailHtml(input: AppointmentEmailInput): string {
  const isCanceled = input.action === "canceled";
  const verb = isCanceled ? "has been canceled" : input.action === "rescheduled" ? "has been updated" : "is scheduled";
  const dateTime = formatDateTime(input.startAt, input.timezone);
  const recipient = input.recipientName?.trim() || "there";
  return `
    <div style="background:#f5f6f7;padding:28px 16px;font-family:Arial,sans-serif;color:#111827;">
      <div style="max-width:600px;margin:auto;background:#ffffff;border:1px solid #e8eaed;border-radius:12px;overflow:hidden;">
        <div style="padding:22px 28px;background:#0A0A0A;color:#ffffff;">
          <p style="margin:0;font-size:18px;font-weight:700;">Savvy STR Agents</p>
          <p style="margin:6px 0 0;font-size:13px;color:#b8eff8;">Appointment update</p>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(recipient)},</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${escapeHtml(input.title)} ${verb}.</p>
          <div style="border:1px solid #d8e8ec;background:#f7fcfd;border-radius:10px;padding:18px;margin:0 0 20px;">
            <p style="margin:0 0 8px;font-size:16px;font-weight:700;">${escapeHtml(input.title)}</p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.5;"><strong>When:</strong> ${escapeHtml(dateTime)}</p>
            ${input.location?.trim() ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;"><strong>Where:</strong> ${escapeHtml(input.location.trim())}</p>` : ""}
            <p style="margin:0;font-size:14px;line-height:1.5;"><strong>With:</strong> ${escapeHtml(input.agentName)} and ${escapeHtml(input.clientName)}</p>
          </div>
          ${input.notes?.trim() ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;"><strong>Notes:</strong> ${escapeHtml(input.notes.trim())}</p>` : ""}
          ${isCanceled ? "" : "<p style=\"margin:0;color:#4b5563;font-size:13px;line-height:1.5;\">A calendar invitation is attached. Add it to your preferred calendar if it does not appear automatically.</p>"}
        </div>
      </div>
    </div>`;
}

/**
 * Sends a transactional iCalendar invitation when no connected Google Calendar
 * can send a native invitation. These messages intentionally bypass marketing
 * opt-out rules because they confirm a user-requested appointment.
 */
export async function sendAppointmentEmail(input: AppointmentEmailInput): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  if (!ENV.resendApiKey) return { sent: false, error: "Resend is not configured" };
  try {
    const resend = new Resend(ENV.resendApiKey);
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.recipientEmail,
      subject: subjectFor(input),
      html: emailHtml(input),
      attachments: input.action === "canceled" ? undefined : [{
        filename: "savvyos-appointment.ics",
        content: appointmentIcs(input),
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      }],
      tags: [
        { name: "category", value: "appointment" },
        { name: "appointment_id", value: String(input.appointmentId) },
      ],
    });
    if (result.error) return { sent: false, error: result.error.message || "Resend rejected the email" };
    return { sent: true, messageId: result.data?.id };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export const __testables__ = { appointmentIcs, formatDateTime };
