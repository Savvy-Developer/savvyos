import { disabled, enabled, scorecard, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.scorecard) return disabled("scorecard");
  const items = await scorecard(ctx);
  return enabled("scorecard", { prompt: "Enter this week's number before the meeting.", period: new Date().toISOString().slice(0, 10) }, items);
}
