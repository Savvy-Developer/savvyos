import { describe, expect, it } from "vitest";
import { sortActivityTimeline } from "@shared/activityTimeline";

describe("sortActivityTimeline", () => {
  it("returns a new newest-first list across event types", () => {
    const oldest = {
      id: "note-1",
      occurredAt: "2026-09-01T10:00:00.000Z",
      kind: "communication",
    };
    const newest = {
      id: "event-2",
      occurredAt: "2026-09-03T14:30:00.000Z",
      kind: "activity",
    };
    const middle = {
      id: "sms-3",
      occurredAt: "2026-09-02T08:15:00.000Z",
      kind: "communication",
    };
    const source = [oldest, newest, middle];

    expect(sortActivityTimeline(source)).toEqual([newest, middle, oldest]);
    expect(source).toEqual([oldest, newest, middle]);
  });

  it("places missing or invalid timestamps after dated activity", () => {
    const dated = {
      id: "event-1",
      occurredAt: new Date("2026-09-03T14:30:00.000Z"),
    };
    const missing = { id: "event-2", occurredAt: null };
    const invalid = { id: "event-3", occurredAt: "not-a-date" };

    expect(sortActivityTimeline([missing, dated, invalid])).toEqual([
      dated,
      missing,
      invalid,
    ]);
  });

  it("preserves source order for events with matching timestamps", () => {
    const first = { id: "activity-1", occurredAt: "2026-09-03T14:30:00.000Z" };
    const second = {
      id: "communication-2",
      occurredAt: "2026-09-03T14:30:00.000Z",
    };

    expect(sortActivityTimeline([first, second])).toEqual([first, second]);
  });
});
