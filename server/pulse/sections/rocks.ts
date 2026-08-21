import { getMeetingRocks } from "../rocks";
import { disabled, enabled, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.rocks) return disabled("rocks");
  const items = await getMeetingRocks(ctx.db, ctx.viewerId, ctx.meeting.id);
  return enabled("rocks", { prompt: "Keep your rock current so the meeting can act early." }, items);
}
