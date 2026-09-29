import { describe, expect, it } from "vitest";
import {
  getL10RunnerSteps,
  normaliseL10RunnerDurations,
} from "./l10RunnerAgenda";

describe("L10 Meeting Runner agenda", () => {
  it("uses the required operating order and keeps incoming cascades as a runner checkpoint", () => {
    expect(
      getL10RunnerSteps({
        segue: true,
        headlines: true,
        scorecard: true,
        rocks: true,
        todos: true,
        issues: true,
      })
    ).toEqual([
      "segue",
      "headlines",
      "cascades",
      "scorecard",
      "rocks",
      "todos",
      "issues",
      "conclude",
    ]);
  });

  it("honors disabled optional sections without removing Cascades or Conclude", () => {
    expect(
      getL10RunnerSteps({
        segue: false,
        headlines: false,
        scorecard: false,
        rocks: true,
        todos: true,
        issues: false,
      })
    ).toEqual(["cascades", "rocks", "todos", "conclude"]);
  });

  it("keeps the 90-minute default when adding Cascades to existing meetings", () => {
    const durations = normaliseL10RunnerDurations({});

    expect(durations).toMatchObject({ cascades: 5, issues: 55 });
    expect(
      Object.values(durations).reduce((total, minutes) => total + minutes, 0)
    ).toBe(90);
  });
});
