/**
 * Merge tag renderer for Smart Plan email/SMS templates.
 * Supported tags: {{first_name}}/{{firstname}}, {{last_name}}, {{full_name}},
 * {{agent_name}}, {{lead_source}}, {{property}}, {{market_match_resume_url}},
 * and appointment lifecycle tags such as {{appointment_date}}.
 */

export type MergeTagContext = {
  firstName?: string | null;
  lastName?: string | null;
  agentName?: string | null;
  leadSource?: string | null;
  propertyAddress?: string | null;
  marketMatchResumeUrl?: string | null;
  appointmentTitle?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  appointmentTimezone?: string | null;
  appointmentLocation?: string | null;
};

export function renderMergeTags(template: string, ctx: MergeTagContext): string {
  const fullName = [ctx.firstName, ctx.lastName].filter(Boolean).join(" ") || "there";
  return template
    .replace(/\{\{(?:first_name|firstname)\}\}/gi, ctx.firstName || "there")
    .replace(/\{\{last_name\}\}/gi, ctx.lastName || "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{agent_name\}\}/gi, ctx.agentName || "Your Agent")
    .replace(/\{\{lead_source\}\}/gi, ctx.leadSource || "")
    .replace(/\{\{property\}\}/gi, ctx.propertyAddress || "")
    .replace(/\{\{market_match_resume_url\}\}/gi, ctx.marketMatchResumeUrl || "")
    .replace(/\{\{appointment_title\}\}/gi, ctx.appointmentTitle || "your appointment")
    .replace(/\{\{appointment_date\}\}/gi, ctx.appointmentDate || "")
    .replace(/\{\{appointment_time\}\}/gi, ctx.appointmentTime || "")
    .replace(/\{\{appointment_timezone\}\}/gi, ctx.appointmentTimezone || "")
    .replace(/\{\{appointment_location\}\}/gi, ctx.appointmentLocation || "");
}
