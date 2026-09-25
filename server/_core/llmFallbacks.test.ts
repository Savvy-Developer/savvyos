import { describe, expect, it } from "vitest";
import {
  extractCoachingFallbackCommitments,
  formatKnowledgeBaseFallback,
} from "./llmFallbacks";

describe("formatKnowledgeBaseFallback", () => {
  it("preserves source content while normalizing lightweight Markdown", () => {
    expect(
      formatKnowledgeBaseFallback(
        "  • First item  \r\n\r\n\r\n* Second item\r\n"
      )
    ).toBe("- First item\n\n- Second item");
  });
});

describe("extractCoachingFallbackCommitments", () => {
  it("extracts explicit commitments from both bullets and prose sentences", () => {
    const commitments = extractCoachingFallbackCommitments(
      "- Agent will call the five warm leads by Friday. Coach will review the pipeline dashboard before the next session."
    );

    expect(commitments).toEqual([
      expect.objectContaining({
        description: "Agent will call the five warm leads by Friday.",
        owner: "agent",
        relatedMetric: "Pipeline",
      }),
      expect.objectContaining({
        description:
          "Coach will review the pipeline dashboard before the next session.",
        owner: "coach",
        relatedMetric: "Pipeline",
      }),
    ]);
  });

  it("does not create commitments from notes without a clear action", () => {
    expect(
      extractCoachingFallbackCommitments(
        "The agent discussed market conditions and recent results."
      )
    ).toEqual([]);
  });

  it("preserves explicit source language as agreement evidence", () => {
    const commitments = extractCoachingFallbackCommitments(
      "Agent: I will call the five oldest leads before Friday.\nCoach: I will send the listing-training recording today."
    );

    expect(commitments).toHaveLength(2);
    expect(commitments[0]).toMatchObject({
      owner: "agent",
      agreementEvidence: "Agent: I will call the five oldest leads before Friday.",
      confidence: "high",
    });
    expect(commitments[1]).toMatchObject({
      owner: "coach",
      agreementEvidence: "Coach: I will send the listing-training recording today.",
    });
  });

  it("does not turn coaching advice into a commitment", () => {
    expect(
      extractCoachingFallbackCommitments(
        "The coach recommended calling five stale leads and reviewing the pipeline tomorrow."
      )
    ).toEqual([]);
  });
});
