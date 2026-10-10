import { describe, expect, it } from "vitest";
import { dueDateFromEventStart } from "./eventsDeliverableSchedule";

describe("dueDateFromEventStart", () => {
  it("uses signed calendar-day offsets without a time-zone shift", () => {
    expect(
      dueDateFromEventStart("2026-10-10", -30)?.toISOString().slice(0, 10)
    ).toBe("2026-09-10");
    expect(
      dueDateFromEventStart("2026-10-10", 0)?.toISOString().slice(0, 10)
    ).toBe("2026-10-10");
    expect(
      dueDateFromEventStart("2026-10-10", 7)?.toISOString().slice(0, 10)
    ).toBe("2026-10-17");
  });

  it("works with database Date values and waits for an Event start date", () => {
    expect(
      dueDateFromEventStart(new Date("2026-02-28T12:00:00.000Z"), 1)
        ?.toISOString()
        .slice(0, 10)
    ).toBe("2026-03-01");
    expect(dueDateFromEventStart(null, -30)).toBeNull();
    expect(dueDateFromEventStart("2026-10-10", null)).toBeNull();
  });
});
