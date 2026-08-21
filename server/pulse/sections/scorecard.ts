import { disabled, enabled, scorecard, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.scorecard) return disabled("scorecard");
  const scorecardData = await scorecard(ctx);
  return enabled("scorecard", { tabs: scorecardData.tabs, configurationNotes: scorecardData.configurationNotes }, scorecardData.items);
}
