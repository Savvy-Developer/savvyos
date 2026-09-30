import { describe, expect, it } from "vitest";
import { inferTodoDueDate, maxTodoDueDay } from "../shared/todoDueDate";

describe("compact Project to-do due dates", () => {
  const septemberTenth = new Date(2026, 8, 10, 9);

  it("uses the current year when the selected month and day have not passed", () => {
    expect(inferTodoDueDate(8, 30, septemberTenth)).toEqual(
      new Date(2026, 8, 30, 12)
    );
  });

  it("uses next year when the selected month and day have already passed", () => {
    expect(inferTodoDueDate(0, 15, septemberTenth)).toEqual(
      new Date(2027, 0, 15, 12)
    );
  });

  it("keeps a selected date due today in the current year", () => {
    expect(inferTodoDueDate(8, 10, septemberTenth)).toEqual(
      new Date(2026, 8, 10, 12)
    );
  });

  it("keeps leap day available when it occurs in an inferred future year", () => {
    expect(maxTodoDueDay(1, new Date(2026, 8, 10))).toBe(29);
    expect(inferTodoDueDate(1, 29, new Date(2026, 8, 10))).toEqual(
      new Date(2028, 1, 29, 12)
    );
  });
});
