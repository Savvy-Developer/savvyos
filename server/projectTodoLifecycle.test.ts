import { describe, expect, it } from "vitest";
import {
  advanceRecurringDueDate,
  completionUpdate,
  reopenUpdate,
} from "./projectTodoLifecycle";

describe("project todo lifecycle", () => {
  it("rolls recurring todos forward instead of leaving them completed", () => {
    const completedAt = new Date("2026-09-18T12:00:00.000Z");
    expect(completionUpdate({ dueDate: completedAt, recurrence: "weekly" }, completedAt)).toMatchObject({
      status: "not_started",
      completed: false,
      completedAt: null,
      rolledForward: true,
      dueDate: new Date("2026-09-25T12:00:00.000Z"),
    });
  });

  it("skips weekends for weekday recurrences", () => {
    const friday = new Date("2026-09-18T12:00:00.000Z");
    expect(advanceRecurringDueDate(friday, "weekdays", friday)).toEqual(
      new Date("2026-09-21T12:00:00.000Z"),
    );
  });

  it("keeps one-time todo completions completed", () => {
    const completedAt = new Date("2026-09-18T12:00:00.000Z");
    expect(completionUpdate({ dueDate: null, recurrence: "none" }, completedAt)).toEqual({
      status: "completed",
      completed: true,
      completedAt,
      rolledForward: false,
    });
  });

  it("reopens a completed todo as not started", () => {
    expect(reopenUpdate()).toEqual({
      status: "not_started",
      completed: false,
      completedAt: null,
      rolledForward: false,
    });
  });
});
