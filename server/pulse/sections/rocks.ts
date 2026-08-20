import { disabled, enabled, meetingItems, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.rocks) return disabled("rocks");
  const items = await meetingItems(ctx, "rock");
  return enabled("rocks", { prompt: "Keep your rock current so the meeting can act early." }, items);
}
