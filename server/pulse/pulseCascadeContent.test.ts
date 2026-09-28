import { describe, expect, it } from "vitest";
import {
  decodeCascadeContent,
  encodeCascadeContent,
} from "../../shared/pulseCascadeContent";

describe("Pulse cascade content", () => {
  it("round-trips a subject and message body without a schema change", () => {
    expect(
      decodeCascadeContent(
        encodeCascadeContent(
          "Staffing handoff",
          "Confirm the final interview panel."
        )
      )
    ).toEqual({
      subject: "Staffing handoff",
      body: "Confirm the final interview panel.",
    });
  });

  it("retains legacy cascade records as a readable message", () => {
    expect(decodeCascadeContent("Historical message")).toEqual({
      subject: "Cascading message",
      body: "Historical message",
    });
  });
});
