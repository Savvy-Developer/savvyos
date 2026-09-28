import { describe, expect, it } from "vitest";
import { isRocketedIssue, ROCKET_SORT_ORDER } from "./issueRocket";

describe("Pulse Issue Rocket state", () => {
  it("uses one stable sort position for the current Rocketed Issue", () => {
    expect(ROCKET_SORT_ORDER).toBe(-1);
  });

  it("recognizes only promoted Issue positions as Rocketed", () => {
    expect(isRocketedIssue(ROCKET_SORT_ORDER)).toBe(true);
    expect(isRocketedIssue(-5)).toBe(true);
    expect(isRocketedIssue(0)).toBe(false);
    expect(isRocketedIssue(null)).toBe(false);
    expect(isRocketedIssue(undefined)).toBe(false);
  });
});
