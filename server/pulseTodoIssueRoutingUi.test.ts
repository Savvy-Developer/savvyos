import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const editor = read("client/src/components/pulse/PulseItemEditor.tsx");
const calendarControl = read(
  "client/src/components/pulse/PulseTodoDueDateControl.tsx"
);
const workItems = read("server/pulse/workItems.ts");

describe("Pulse compact To-Do controls and Issue routing", () => {
  it("uses a compact month-day calendar control for Pulse To-Do due dates", () => {
    expect(editor).toContain("<PulseTodoDueDateControl");
    expect(editor).toContain("h-7 w-[7rem] shrink-0");
    expect(editor).toContain("h-7 w-[5.5rem] shrink-0");
    expect(editor).toContain("h-7 w-[7rem] shrink-0 bg-background");
    expect(calendarControl).toContain(
      'import { Calendar } from "@/components/ui/calendar"'
    );
    expect(calendarControl).toContain("<Calendar");
    expect(calendarControl).toContain("onSelect={selectDate}");
    expect(calendarControl).toContain('captionLayout="dropdown"');
    expect(calendarControl).toContain("formatTodoDueMonthDay(currentDate)");
    expect(calendarControl).toContain('aria-label="To-Do due date"');
  });

  it("routes an open meeting To-Do into Issues without creating a duplicate", () => {
    expect(editor).toContain("sendTodoToIssues.useMutation");
    expect(editor).toContain('aria-label="Send To-Do to Issues"');
    expect(editor).toContain('<Flag className="h-4 w-4" />');
    expect(workItems).toContain("sendTodoToIssues: pulseMemberProcedure");
    expect(workItems).toContain(
      "Only open meeting To-Dos can be sent to Issues."
    );
    expect(workItems).toContain('type: "issue"');
    expect(workItems).toContain("dueDate: null");
    expect(workItems).toContain("sortOrder: 0");
    expect(workItems).toContain('"todo_sent_to_issues"');
  });

  it("permits clearing a To-Do due date from the shared calendar control", () => {
    expect(workItems).toContain("dueDate: dateSchema.nullable().optional()");
    expect(calendarControl).toContain("Clear due date");
  });
});
