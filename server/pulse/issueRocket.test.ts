import { describe, expect, it } from "vitest";
import { isRocketedIssue, nextRocketSortOrder, ROCKET_SORT_ORDER } from "./issueRocket";

describe("Pulse Issue Rocket state", () => {
  it("uses a negative sort position for the first Rocketed Issue", () => {
    expect(ROCKET_SORT_ORDER).toBe(-1);
    expect(nextRocketSortOrder(null)).toBe(-1);
  });

  it("keeps multiple Rocketed Issues and places each new one first", () => {
    expect(nextRocketSortOrder(-1)).toBe(-2);
    expect(nextRocketSortOrder(-4)).toBe(-5);
  });

  it("recognizes every negative Issue position as Rocketed", () => {
    expect(isRocketedIssue(ROCKET_SORT_ORDER)).toBe(true);
    expect(isRocketedIssue(-5)).toBe(true);
    expect(isRocketedIssue(0)).toBe(false);
    expect(isRocketedIssue(null)).toBe(false);
    expect(isRocketedIssue(undefined)).toBe(false);
  });
});
