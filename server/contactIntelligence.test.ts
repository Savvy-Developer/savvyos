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

  it("uses no inferred signals when structured extraction is unavailable", () => {
    const result = __testables__.nativeSummaryFallback({
      communication: { body: "Conversation\n\nAircall Summary:\nCaller requested a follow-up." },
    } as any);
    expect(result.signals).toEqual([]);
    expect(result.profile.intentTier).toBe("unknown");
    expect(result.profile.intentScore).toBe(0);
    expect(result.profile.confidence).toBe("low");
    expect(result.profile.executiveBriefing).toContain("Caller requested a follow-up.");
  });
});
