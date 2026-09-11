import { describe, expect, it } from "vitest";
import { __fitProfileTestables__ } from "./marketMatchFitProfiles";

describe("Market Match fit profile normalization", () => {
  it("keeps only allowed, evidence-backed matching tags", () => {
    const profile = __fitProfileTestables__.normalizeMarketMatchFitProfile({
      version: "v1",
      evidenceConfidence: "medium",
      readyForMatching: true,
      priceGuidance: { min: 400000, max: 750000, evidence: "Observed range" },
      investorGoals: ["cash_flow", "invented_goal"],
      experienceFit: ["first_str"],
      destinationStyles: ["mountain", "moon"],
      guestSegments: ["families"],
      propertyTypes: ["cabin"],
      projectAppetite: ["turnkey"],
      managementFit: ["property_manager"],
      accessPreferences: ["drive_to"],
      operatingConsiderations: ["seasonality"],
      locationAliases: ["Smokies"],
      overlapGroup: "",
      evidence: [{ field: "price", quote: "Observed range" }],
      gaps: [],
    });
    expect(profile.readyForMatching).toBe(true);
    expect(profile.investorGoals).toEqual(["cash_flow"]);
    expect(profile.destinationStyles).toEqual(["mountain"]);
    expect(profile.priceGuidance).toMatchObject({ min: 400000, max: 750000 });
  });

  it("does not mark a profile ready when it lacks a decision signal", () => {
    const profile = __fitProfileTestables__.normalizeMarketMatchFitProfile({
      version: "v1", evidenceConfidence: "limited", readyForMatching: true,
      priceGuidance: { min: 0, max: 0, evidence: "No verified range" },
      investorGoals: [], experienceFit: [], destinationStyles: [], guestSegments: [], propertyTypes: [], projectAppetite: [], managementFit: [], accessPreferences: [], operatingConsiderations: [], locationAliases: [], overlapGroup: "", evidence: [{ field: "gap", quote: "More evidence needed" }], gaps: ["Research needed"],
    });
    expect(profile.readyForMatching).toBe(false);
  });
});
