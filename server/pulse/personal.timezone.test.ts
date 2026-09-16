import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./personal";

describe("nextOccurrence", () => {
  it("uses the configured New York wall-clock time instead of the server timezone", () => {
    const occurrence = nextOccurrence("wednesday", "14:00", "America/New_York", new Date("2026-09-15T12:00:00.000Z"));
    expect(occurrence).toBe("2026-09-16T18:00:00.000Z");
  });

  it("keeps the configured wall-clock time correct after the fall daylight-saving transition", () => {
    const occurrence = nextOccurrence("tuesday", "14:30", "America/New_York", new Date("2026-10-30T12:00:00.000Z"));
    expect(occurrence).toBe("2026-11-03T19:30:00.000Z");
  });

  it("uses each meeting's configured timezone", () => {
    const occurrence = nextOccurrence("monday", "09:00", "America/Los_Angeles", new Date("2026-09-13T20:00:00.000Z"));
    expect(occurrence).toBe("2026-09-14T16:00:00.000Z");
  });
});
