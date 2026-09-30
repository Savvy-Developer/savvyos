import { describe, expect, it } from "vitest";
import { formatTodoDueMonthDay } from "../shared/todoDueDate";

describe("compact Project to-do due dates", () => {
  it("shows only the month and day in an inline due date label", () => {
    expect(formatTodoDueMonthDay(new Date(2028, 8, 30, 12))).toBe("Sep 30");
  });

  it("does not expose the year in the inline label", () => {
    const label = formatTodoDueMonthDay(new Date(2032, 1, 29, 12));
    expect(label).toBe("Feb 29");
    expect(label).not.toContain("2032");
  });
});
