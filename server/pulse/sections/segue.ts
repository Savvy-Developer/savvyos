import { disabled, enabled, meetingUpdates, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.segue) return disabled("segue");
  const items = await meetingUpdates(ctx, "segue");
  const mine = items.find((item: any) => item.authorId === ctx.viewerId) ?? null;
  return enabled("segue", { prompt: "Share one useful thing from this week.", mineSubmitted: !!mine }, items);
}
