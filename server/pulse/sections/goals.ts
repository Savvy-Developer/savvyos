import { disabled, enabled, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.goals) return disabled("goals");
  return enabled("goals", { cadence: ctx.meeting.cadence, prompt: "Review the goals this meeting owns." }, []);
}
