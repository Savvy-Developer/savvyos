import { disabled, enabled, cascades, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.cascading) return disabled("cascading");
  const items = await cascades(ctx);
  return enabled("cascading", { prompt: "Acknowledge what this meeting needs to carry forward." }, items);
}
