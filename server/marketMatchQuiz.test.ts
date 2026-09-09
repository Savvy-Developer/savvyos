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

  it("turns submitted criteria into a readable investor brief without combining cash and setup funds", () => {
    const brief = __testables__.deterministicInvestorBrief({
      primaryGoal: "cash_flow", investmentGoals: ["cash_flow", "tax_strategy", "appreciation"], timeline: "0_3",
      budget: { min: "$500,000", max: "$1,000,000" }, cashAvailable: { min: "$100,000", max: "$600,000" }, setupBudget: { min: "$300,000", max: "$600,000" },
      financing: "exploring", lenderOpenness: true, locationPreference: "Smokies or a mountain market", propertyType: ["cabin"], managementPreference: "property_manager", freeformWin: "A strong first investment with room to grow.",
    });
    expect(brief).toContain("primary objective is cash flow");
    expect(brief).toContain("$500,000 – $1,000,000");
    expect(brief).toContain("$100,000 – $600,000 for down payment and closing");
    expect(brief).toContain("separate $300,000 – $600,000");
    expect(brief).toContain("purchase within 0–3 months");
    expect(brief).toContain("Smokies or a mountain market");
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

  it("does not allow a stated West Coast or Midwest constraint to fall back to an unrelated market", () => {
    const answers = { budget: { min: "400000", max: "800000" }, investmentGoals: ["cash_flow"], geographyFlexibility: "regional", locationPreference: "West Coast or Midwest" };
    const unrelated = __testables__.scoreMarket({
      name: "Asheville", state: "NC", region: "Western NC", priorityWeight: 0,
      profile: { bestFitInvestors: ["Buyers seeking rental income"], buyBox: { purchasePriceGuidance: "Observed purchases between $400,000 and $800,000" } }, answers,
    });
    const midwest = __testables__.scoreMarket({
      name: "Indianapolis", state: "IN", region: "Midwestern", priorityWeight: 0,
      profile: { bestFitInvestors: ["Buyers seeking rental income"], buyBox: { purchasePriceGuidance: "Observed purchases between $400,000 and $800,000" } }, answers,
    });
    const floridaWestCoast = __testables__.scoreMarket({
      name: "Bradenton/Sarasota", state: "FL", region: "Central West Coast FL", priorityWeight: 0,
      profile: { bestFitInvestors: ["Buyers seeking rental income"], buyBox: { purchasePriceGuidance: "Observed purchases between $400,000 and $800,000" } }, answers,
    });
    expect(unrelated.matchesLocationConstraint).toBe(false);
    expect(midwest.matchesLocationConstraint).toBe(true);
    expect(floridaWestCoast.matchesLocationConstraint).toBe(false);
  });

  it("recognizes a named state in a market record even when the state field is unavailable", () => {
    const scored = __testables__.scoreMarket({
      name: "Phoenix, Arizona", state: "N/A", region: null, priorityWeight: 0,
      profile: { bestFitInvestors: ["Buyers seeking rental income"], buyBox: { purchasePriceGuidance: "Observed purchases between $400,000 and $800,000" } },
      answers: { budget: { min: "400000", max: "800000" }, investmentGoals: ["cash_flow"], geographyFlexibility: "specific", locationPreference: "Phoenix, Arizona" },
    });
    expect(scored.matchesLocationConstraint).toBe(true);
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

  it("selects a source-grounded STR fact from a current Market AI profile", () => {
    const fact = __testables__.factForMarket({
      id: 11, name: "Smokies", state: "TN", profile: {
        executiveSummary: "Savvy Market AI has current STR diligence notes for this destination market.",
        buyBox: { purchasePriceGuidance: "Observed STR purchase prices in supplied Savvy data range from $400,000 to $700,000." },
      }, intelligenceGeneratedAt: new Date("2026-09-07T00:00:00Z"),
    } as any, "session-seed");
    expect(fact).toMatchObject({ marketName: "Smokies", state: "TN" });
    expect(fact?.fact).toContain("STR");
    expect(fact?.fact).not.toContain("guarantee");
    expect(fact?.title).not.toBe("Savvy Market AI snapshot");
  });
});
