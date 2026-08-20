import { disabled, enabled, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.conclude) return disabled("conclude");
  return enabled("conclude", { prompt: "Close with the decision, rating, and next clear step." }, []);
}
