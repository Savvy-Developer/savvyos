import { disabled, enabled, meetingItems, type SectionContext } from "./shared";
export async function getSectionData(ctx: SectionContext) {
  if (!ctx.meeting.sectionsEnabled.todos) return disabled("todos");
  const items = await meetingItems(ctx, "todo");
  return enabled("todos", { prompt: "Finish your next clear step." }, items);
}
