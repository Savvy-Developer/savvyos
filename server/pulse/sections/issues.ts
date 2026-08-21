import { disabled, enabled, meetingItems, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.issues) return disabled("issues");
  const all = await meetingItems(ctx, "issue");
  const items = all.filter((item: any) => !item.isProposed);
  const proposals = all.filter((item: any) => item.isProposed);
  return enabled("issues", { prompt: "Name the issue that needs a decision.", proposals }, items);
}
