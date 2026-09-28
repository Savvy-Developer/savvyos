import { describe, expect, it } from "vitest";
import { nextRocketSortOrder } from "./issueRocket";

describe("Pulse Issue Rocket ordering", () => {
  it("places the first rocketed Issue ahead of existing unranked Issues", () => {
    expect(nextRocketSortOrder(null)).toBe(-1);
    expect(nextRocketSortOrder(undefined)).toBe(-1);
  });

  it("keeps the newest Rocket action at the very top", () => {
    expect(nextRocketSortOrder(-4)).toBe(-5);
    expect(nextRocketSortOrder(12)).toBe(11);
  });

  it("stays within the signed integer range", () => {
    expect(nextRocketSortOrder(-2_147_483_646)).toBe(-2_147_483_646);
  });
});
