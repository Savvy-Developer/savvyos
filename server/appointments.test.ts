import { describe, expect, it } from "vitest";
import { __testables__ as appointmentTests } from "./routers/appointments";
import { __testables__ as notificationTests } from "./appointmentNotifications";

describe("appointment helpers", () => {
  it("detects only truly overlapping availability blocks", () => {
    const start = new Date("2026-09-10T14:00:00.000Z");
    const end = new Date("2026-09-10T14:30:00.000Z");
    expect(appointmentTests.intervalsOverlap(start, end, [{ start: "2026-09-10T13:00:00.000Z", end: "2026-09-10T14:00:00.000Z" }])).toBe(false);
    expect(appointmentTests.intervalsOverlap(start, end, [{ start: "2026-09-10T14:15:00.000Z", end: "2026-09-10T15:00:00.000Z" }])).toBe(true);
  });

  it("separates Calendly names into usable contact fields", () => {
    expect(appointmentTests.splitName("Taylor Jordan")).toEqual({ firstName: "Taylor", lastName: "Jordan" });
    expect(appointmentTests.splitName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
  });

  it("builds a cancellable iCalendar invitation", () => {
    const ics = notificationTests.appointmentIcs({
      recipientEmail: "client@example.com",
      clientName: "Taylor Jordan",
      agentName: "Jordan Agent",
      title: "Investment strategy call",
      startAt: new Date("2026-09-10T14:00:00.000Z"),
      endAt: new Date("2026-09-10T14:30:00.000Z"),
      timezone: "America/New_York",
      location: "https://meet.google.com/example",
      appointmentId: 42,
      action: "scheduled",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:savvyos-appointment-42@savvy-agents.com");
    expect(ics).toContain("SUMMARY:Investment strategy call");
  });
});
