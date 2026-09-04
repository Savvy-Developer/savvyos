import { describe, expect, it } from "vitest";
import {
  extractMarketMatchSignals,
  mergeLiveTranscriptEvents,
  rankMarketMatches,
  type MarketMatchCandidate,
} from "./marketMatch";

describe("Market Match V1 signal extraction", () => {
  it("extracts a grounded budget, financing, location, and investment goal", () => {
    const signals = extractMarketMatchSignals(
      "We want to spend about $550k on a short-term rental in North Carolina. We are pre-approved for financing and care most about cash flow."
    );

    expect(signals.budget).toMatchObject({
      min: 467_500,
      max: 632_500,
      label: "About $550,000",
    });
    expect(signals.financing).toContain("Financing");
    expect(signals.locations).toContain("North Carolina");
    expect(signals.goals).toContain("Cash flow");
    expect(signals.goals).toContain("Short-term rental");
    expect(signals.confidence).toBe("high");
  });

  it("marks contradictory coast preferences as low confidence", () => {
    const signals = extractMarketMatchSignals(
      "I am torn between the East Coast and West Coast, so I am not sure where we should look."
    );
    expect(signals.regions).toEqual(
      expect.arrayContaining(["East Coast", "West Coast"])
    );
    expect(signals.confidence).toBe("low");
  });
});

describe("Market Match live transcript handling", () => {
  it("flattens incremental Aircall utterance payloads and removes repeated utterances", () => {
    const utterances = mergeLiveTranscriptEvents([
      {
        receivedAt: new Date("2026-09-04T18:00:05Z"),
        payload: {
          data: {
            content: {
              utterances: [
                {
                  start_time: 4,
                  participant_type: "internal",
                  text: "What is your budget?",
                },
                {
                  start_time: 8,
                  participant_type: "external",
                  text: "About five hundred thousand.",
                },
              ],
            },
          },
        },
      },
      {
        receivedAt: new Date("2026-09-04T18:00:10Z"),
        payload: {
          data: {
            content: {
              utterances: [
                {
                  start_time: 8,
                  participant_type: "external",
                  text: "About five hundred thousand.",
                },
                {
                  start_time: 15,
                  participant_type: "external",
                  text: "North Carolina sounds good.",
                },
              ],
            },
          },
        },
      },
    ]);

    expect(utterances).toEqual([
      {
        start_time: 4,
        participant_type: "internal",
        text: "What is your budget?",
        end_time: undefined,
        timestamp: undefined,
      },
      {
        start_time: 8,
        participant_type: "external",
        text: "About five hundred thousand.",
        end_time: undefined,
        timestamp: undefined,
      },
      {
        start_time: 15,
        participant_type: "external",
        text: "North Carolina sounds good.",
        end_time: undefined,
        timestamp: undefined,
      },
    ]);
  });
});

describe("Market Match V1 ranking", () => {
  const candidates: MarketMatchCandidate[] = [
    {
      id: 1,
      name: "Blue Ridge",
      state: "North Carolina",
      region: "Southeast",
      intelligenceStatus: "ready",
      agents: [
        {
          id: 11,
          name: "Casey Agent",
          callBookingLink: "https://calendly.com/casey",
          isPrimary: true,
          isAvailable: true,
        },
      ],
      profile: {
        executiveSummary:
          "A strong short-term rental destination for cash-flow-minded investors.",
        bestFitInvestors: ["Cash flow investors"],
        buyBox: {
          purchasePriceGuidance: "$450k to $650k",
          locations: ["Asheville", "Blue Ridge"],
          propertyTypes: ["Cabin"],
          propertyCharacteristics: [],
        },
        marketDynamics: [],
        agentGuidance: [],
      },
    },
    {
      id: 2,
      name: "Coastal California",
      state: "California",
      region: "West Coast",
      intelligenceStatus: "ready",
      agents: [
        {
          id: 22,
          name: "Jamie Agent",
          callBookingLink: null,
          isPrimary: true,
          isAvailable: true,
        },
      ],
      profile: {
        executiveSummary: "An appreciation-focused coastal market.",
        bestFitInvestors: ["Long-term appreciation buyers"],
        buyBox: {
          purchasePriceGuidance: "$900k to $1.4m",
          locations: ["San Diego"],
          propertyTypes: ["Condo"],
          propertyCharacteristics: [],
        },
        marketDynamics: [],
        agentGuidance: [],
      },
    },
    {
      id: 3,
      name: "Gulf Shores",
      state: "Alabama",
      region: "Southeast",
      intelligenceStatus: "refreshing",
      agents: [],
      profile: {
        executiveSummary: "Active coverage is still being prepared.",
        buyBox: {
          purchasePriceGuidance: "$400k to $650k",
          locations: [],
          propertyTypes: [],
          propertyCharacteristics: [],
        },
      },
    },
  ];

  it("prioritizes active-market evidence that aligns with the live call", () => {
    const transcript =
      "Our budget is around $550k. We are looking in North Carolina for a short-term rental with good cash flow.";
    const matches = rankMarketMatches(
      candidates,
      extractMarketMatchSignals(transcript),
      transcript
    );

    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({
      rank: 1,
      market: { id: 1, name: "Blue Ridge" },
      confidence: "high",
    });
    expect(matches[0].reasons).toEqual(
      expect.arrayContaining([
        "Location alignment",
        "Budget fit",
        "Investment-goal fit",
      ])
    );
    expect(matches[0].agents[0].callBookingLink).toBe(
      "https://calendly.com/casey"
    );
  });

  it("honors a valid configured maximum and falls back to five for an invalid maximum", () => {
    const transcript =
      "Our budget is around $550k. We are looking in North Carolina for a short-term rental with good cash flow.";
    const signals = extractMarketMatchSignals(transcript);

    expect(rankMarketMatches(candidates, signals, transcript, 3)).toHaveLength(3);
    expect(rankMarketMatches(candidates, signals, transcript, 2)).toHaveLength(3);
  });
});
