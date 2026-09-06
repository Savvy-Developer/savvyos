import { describe, expect, it } from "vitest";
import { __testables__, DEFAULT_QUIZ_QUESTIONS } from "./marketMatchQuiz";

describe("Market Match quiz helpers", () => {
  it("builds a transparent buy box from explicit answers", () => {
    const box = __testables__.buyBoxFromAnswers({
      budget: { min: "350000", max: "625000" },
      investmentGoals: ["cash_flow", "lifestyle"],
      propertyType: ["cabin"],
      locationPreference: "Smokies",
      financing: "need_lender",
      timeline: "3_6",
    });
    expect(box.purchaseRange).toBe("$350,000 – $625,000");
    expect(box.investmentGoals).toEqual(["cash_flow", "lifestyle"]);
    expect(box.locationPreference).toBe("Smokies");
  });

  it("keeps AI-derived signals explicitly labeled and lower confidence", () => {
    const box = __testables__.buyBoxFromAnswers({
      inferredPreferences: {
        inferences: [{ field: "personalUse", value: "Wants family ski weekends", confidence: "medium", evidence: "family ski weekends" }],
      },
    });
    expect(box.inferredPreferences).toEqual([
      { field: "personalUse", value: "Wants family ski weekends", confidence: "medium", evidence: "family ski weekends" },
    ]);
  });

  it("rewards qualified market evidence without inventing a guarantee", () => {
    const scored = __testables__.scoreMarket({
      name: "Smoky Mountains",
      state: "Tennessee",
      region: "Southeast",
      priorityWeight: 0,
      profile: {
        bestFitInvestors: ["Buyers seeking rental income and personal-use flexibility"],
        buyBox: { purchasePriceGuidance: "Observed purchases between $300,000 and $700,000", propertyTypes: ["cabin"] },
      },
      answers: { budget: { min: "400000", max: "600000" }, investmentGoals: ["cash_flow", "lifestyle"], propertyType: ["cabin"], locationPreference: "Tennessee", geographyFlexibility: "regional" },
    });
    expect(scored.score).toBeGreaterThan(1);
    expect(scored.qualified).toBe(true);
    expect(scored.reasons).toContain("Fits the purchase range you shared");
    expect(scored.reasons).toContain("Aligned with several investment goals");
  });

  it("falls back to the approved default questions when a version configuration is invalid", () => {
    expect(__testables__.questionsFromConfig([{ id: "broken" }])).toEqual(DEFAULT_QUIZ_QUESTIONS);
  });

  it("marks a market without profile or preference evidence as unqualified", () => {
    const scored = __testables__.scoreMarket({
      name: "Example Market", state: "Example State", region: null, priorityWeight: 0,
      profile: {}, answers: { geographyFlexibility: "open" },
    });
    expect(scored.qualified).toBe(false);
  });

  it("attaches non-identifying Calendly source tracking", () => {
    const url = __testables__.appendTracking("https://calendly.com/savvy/demo", 42, "agent");
    expect(url).toContain("utm_source=MarketMatchSurvey");
    expect(url).toContain("utm_content=mm-42-agent");
    expect(url).not.toContain("email");
  });
});
