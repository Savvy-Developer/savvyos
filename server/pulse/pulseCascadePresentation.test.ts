import { describe, expect, it } from "vitest";
import { getCascadeRoutingPresentation } from "../../shared/pulseCascadePresentation";

describe("getCascadeRoutingPresentation", () => {
  it("keeps source, all destinations, and acknowledgement progress together", () => {
    const presentation = getCascadeRoutingPresentation({
      fromMeetingName: "Leadership L10",
      toMeetingNames: ["Operations L10", "ISA 1:1"],
      createdAt: "2026-09-27T12:00:00.000Z",
      recipientCount: 4,
      acknowledgedCount: 2,
    });
    expect(presentation.source).toContain("From Leadership L10");
    expect(presentation.destinations).toBe("To Operations L10, ISA 1:1");
    expect(presentation.acknowledgment).toBe("2 of 4 acknowledged");
    expect(presentation.text).toContain(presentation.source);
    expect(presentation.text).toContain(presentation.destinations);
    expect(presentation.text).toContain(presentation.acknowledgment);
  });
});
