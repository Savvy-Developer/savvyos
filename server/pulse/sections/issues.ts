import { disabled, enabled, meetingItems, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.issues) return disabled("issues");
  const items = await meetingItems(ctx, "issue");
  return enabled("issues", { prompt: "Name the issue that needs a decision." }, items);
}
