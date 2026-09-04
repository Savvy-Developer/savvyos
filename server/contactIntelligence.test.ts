import { describe, expect, it } from "vitest";
import { __testables__ } from "./contactIntelligence";

describe("Contact Intelligence structured response parsing", () => {
  it("parses standard strict JSON output", () => {
    expect(__testables__.parseStructuredResponse('{"profile":{},"signals":[]}')).toEqual({
      profile: {},
      signals: [],
    });
  });

  it("recovers JSON from a fenced provider response", () => {
    expect(__testables__.parseStructuredResponse('```json\n{"profile":{},"signals":[]}\n```')).toEqual({
      profile: {},
      signals: [],
    });
  });

  it("recovers an object after a short provider preface", () => {
    expect(__testables__.parseStructuredResponse('Here is the response:\n{"profile":{},"signals":[]}')).toEqual({
      profile: {},
      signals: [],
    });
  });
});
