import { disabled, enabled, meetingUpdates, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.headlines) return disabled("headlines");
  const items = await meetingUpdates(ctx, "headline");
  return enabled("headlines", { prompt: "Add the headline this meeting needs to hear." }, items);
}
