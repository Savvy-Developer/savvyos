import { getMeetingGoals } from "../goals";
import { disabled, enabled, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.goals) return disabled("goals");
  const goals = await getMeetingGoals(ctx.db, ctx.viewerId, ctx.meeting.id);
  return enabled("goals", { configurationNotes: goals.configurationNotes, prompt: "Review the SavvyOS company goals this meeting is tracking." }, goals.items);
}
