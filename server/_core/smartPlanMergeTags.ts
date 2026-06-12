/**
 * Merge tag renderer for Smart Plan email/SMS templates.
 * Supported tags: {{first_name}}, {{last_name}}, {{full_name}}, {{agent_name}}, {{lead_source}}
 */

export type MergeTagContext = {
  firstName?: string | null;
  lastName?: string | null;
  agentName?: string | null;
  leadSource?: string | null;
};

export function renderMergeTags(template: string, ctx: MergeTagContext): string {
  const fullName = [ctx.firstName, ctx.lastName].filter(Boolean).join(" ") || "there";
  return template
    .replace(/\{\{first_name\}\}/gi, ctx.firstName || "there")
    .replace(/\{\{last_name\}\}/gi, ctx.lastName || "")
    .replace(/\{\{full_name\}\}/gi, fullName)
    .replace(/\{\{agent_name\}\}/gi, ctx.agentName || "Your Agent")
    .replace(/\{\{lead_source\}\}/gi, ctx.leadSource || "");
}
