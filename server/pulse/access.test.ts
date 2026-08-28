import { describe, expect, it } from "vitest";
import { can_run_meeting_for_member } from "./access";

describe("Pulse meeting Run Meeting access", () => {
  const meeting = { ownerId: 10, administratorId: 20 };

  it("denies access when a meeting has no attendees", () => {
    expect(can_run_meeting_for_member(meeting, 10, [])).toBe(false);
    expect(can_run_meeting_for_member(meeting, 20, [])).toBe(false);
  });

  it("allows the active facilitator", () => {
    expect(can_run_meeting_for_member(meeting, 10, [10, 20, 30])).toBe(true);
  });

  it("allows the active administrator", () => {
    expect(can_run_meeting_for_member(meeting, 20, [10, 20, 30])).toBe(true);
  });

  it("denies a regular attendee", () => {
    expect(can_run_meeting_for_member(meeting, 30, [10, 20, 30])).toBe(false);
  });

  it("denies an unauthorized user", () => {
    expect(can_run_meeting_for_member(meeting, 40, [10, 20, 30])).toBe(false);
  });

  it("denies the facilitator after removal from the active roster", () => {
    expect(can_run_meeting_for_member(meeting, 10, [20, 30])).toBe(false);
  });

  it("does not grant Tyler a meeting-level bypass", () => {
    const tylerId = 99;
    expect(can_run_meeting_for_member(meeting, tylerId, [10, 20, tylerId])).toBe(false);
    expect(can_run_meeting_for_member(meeting, tylerId, [])).toBe(false);
  });
});
