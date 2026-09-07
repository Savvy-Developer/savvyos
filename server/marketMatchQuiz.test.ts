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

  it("keeps primary, cash, and setup criteria distinct in the BUYBOX", () => {
    const box = __testables__.buyBoxFromAnswers({
      primaryGoal: "cash_flow", investmentGoals: ["cash_flow", "portfolio"],
      budget: { min: "400000", max: "600000" }, cashAvailable: { min: "100000", max: "150000" }, setupBudget: { min: "30000", max: "50000" },
    });
    expect(box.primaryGoal).toBe("cash_flow");
    expect(box.investmentGoals).toEqual(["cash_flow", "portfolio"]);
    expect(box.cashAvailable).toBe("$100,000 – $150,000");
    expect(box.setupBudget).toBe("$30,000 – $50,000");
  });

  it("formats comma-delimited currency answers and asks goals before primary priority", () => {
    const box = __testables__.buyBoxFromAnswers({ budget: { min: "$400,000", max: "$600,000" } });
    expect(box.purchaseRange).toBe("$400,000 – $600,000");
    expect(DEFAULT_QUIZ_QUESTIONS[0]).toMatchObject({ id: "investmentGoals", type: "multi", required: true });
    expect(DEFAULT_QUIZ_QUESTIONS[1]).toMatchObject({ id: "primaryGoal", type: "single", required: true });
    expect(DEFAULT_QUIZ_QUESTIONS.find(question => question.id === "experience")?.options?.map(option => option.value)).not.toContain("not_sure");
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

  it("normalizes legacy Calendly links before tracking", () => {
    const url = __testables__.appendTracking("calendly.com/savvy/demo", 42, "agent");
    expect(url).toMatch(/^https:\/\/calendly\.com\/savvy\/demo/);
    expect(url).toContain("utm_source=MarketMatchSurvey");
  });

  it("uses a private public-host resume URL and no CRM information", () => {
    const url = __testables__.publicMarketMatchUrl("private-resume-token");
    expect(url).toBe("https://home.savvy-agents.com/marketmatch?resume=private-resume-token");
    expect(url).not.toContain("contact");
  });

  it("formats private result details with a market-specific tradeoff", () => {
    const details = __testables__.marketResultsEmailDetails([{ marketName: "Smokies", state: "Tennessee", reasons: ["Fits your stated range"] }], null);
    expect(details).toContain("Smokies, Tennessee");
    expect(details).toContain("Validate next");
  });
});
