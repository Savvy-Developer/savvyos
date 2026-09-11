import { describe, expect, it } from "vitest";
import { buildCelebrationFeed } from "./agentCelebrations";

const now = new Date("2026-09-10T15:00:00.000Z");

const agents = [
  {
    id: 1,
    name: "Avery Agent",
    email: "avery@example.com",
    phone: "555-0101",
    profilePhotoUrl: null,
    dateOfBirth: new Date("1990-09-12T12:00:00.000Z"),
    workAnniversaryDate: new Date("2024-09-08T12:00:00.000Z"),
    onboardedDate: null,
    startDateWithSavvy: null,
    birthdayRecognitionOptIn: true,
    anniversaryRecognitionOptIn: true,
  },
  {
    id: 2,
    name: "Blake Broker",
    email: "blake@example.com",
    phone: null,
    profilePhotoUrl: null,
    dateOfBirth: null,
    workAnniversaryDate: null,
    onboardedDate: null,
    startDateWithSavvy: null,
    birthdayRecognitionOptIn: true,
    anniversaryRecognitionOptIn: true,
  },
];

const transactions = [
  {
    id: 1,
    agentId: 1,
    status: "closed" as const,
    purchasePrice: "100000",
    grossCommissionIncome: "3000",
    contractDate: "2026-07-20T12:00:00.000Z",
    closingDate: "2026-08-01T12:00:00.000Z",
    propertyAddress: "1 First St",
    propertyCity: "Austin",
    propertyState: "TX",
  },
  {
    id: 2,
    agentId: 1,
    status: "closed" as const,
    purchasePrice: "250000",
    grossCommissionIncome: "7500",
    contractDate: "2026-09-01T12:00:00.000Z",
    closingDate: "2026-09-02T12:00:00.000Z",
    propertyAddress: "2 Record Rd",
    propertyCity: "Austin",
    propertyState: "TX",
  },
  {
    id: 3,
    agentId: 1,
    status: "closed" as const,
    purchasePrice: "200000",
    grossCommissionIncome: "6000",
    contractDate: "2026-09-02T12:00:00.000Z",
    closingDate: "2026-09-03T12:00:00.000Z",
    propertyAddress: "3 Win Way",
    propertyCity: "Austin",
    propertyState: "TX",
  },
  {
    id: 4,
    agentId: 2,
    status: "closed" as const,
    purchasePrice: "150000",
    grossCommissionIncome: "4500",
    contractDate: "2026-09-01T12:00:00.000Z",
    closingDate: "2026-09-04T12:00:00.000Z",
    propertyAddress: "4 Team Trl",
    propertyCity: "Denver",
    propertyState: "CO",
  },
  {
    id: 5,
    agentId: 2,
    status: "under_contract" as const,
    purchasePrice: "300000",
    grossCommissionIncome: null,
    contractDate: "2026-09-05T12:00:00.000Z",
    closingDate: "2026-10-01T12:00:00.000Z",
    propertyAddress: "5 Momentum Ave",
    propertyCity: "Denver",
    propertyState: "CO",
  },
  {
    id: 6,
    agentId: 2,
    status: "under_contract" as const,
    purchasePrice: "350000",
    grossCommissionIncome: null,
    contractDate: "2026-09-06T12:00:00.000Z",
    closingDate: "2026-10-03T12:00:00.000Z",
    propertyAddress: "6 Momentum Ave",
    propertyCity: "Denver",
    propertyState: "CO",
  },
];

describe("buildCelebrationFeed", () => {
  it("finds personal moments, records, reviews, goals, and completed-period team leaders", () => {
    const events = buildCelebrationFeed({
      agents,
      transactions,
      reviews: [
        {
          id: 10,
          transactionId: 2,
          agentId: 1,
          rating: 5,
          reviewerName: "Happy Client",
          comment: "Absolutely exceptional.",
          submittedAt: "2026-09-09T12:00:00.000Z",
        },
      ],
      goals: [
        {
          agentId: 1,
          year: 2026,
          gciTarget: "15000",
          closingsTarget: 3,
          volumeTarget: "500000",
        },
      ],
      acknowledgements: [],
      now,
      daysBack: 30,
      daysForward: 30,
    });

    expect(
      events.some(
        event =>
          event.key === "birthday:1:2026" && event.timeframe === "upcoming"
      )
    ).toBe(true);
    expect(
      events.some(
        event =>
          event.key === "anniversary:1:2026" && event.valueLabel === "2 years"
      )
    ).toBe(true);
    expect(events.some(event => event.key === "largest_closing:1:2")).toBe(
      true
    );
    expect(
      events.some(event => event.key === "personal_best_week:1:2026-08-31")
    ).toBe(true);
    expect(events.some(event => event.key === "five_star_review:10")).toBe(
      true
    );
    expect(
      events.some(event => event.key === "annual_goal:1:2026:closings")
    ).toBe(true);
    expect(
      events.some(event => event.key === "team_leader:closed:week:2026-08-31:1")
    ).toBe(true);
    expect(
      events.some(
        event => event.key === "team_leader:under_contract:week:2026-08-31:2"
      )
    ).toBe(true);
  });

  it("respects recognition opt-outs and preserves celebrated state", () => {
    const optedOutAgents = [
      {
        ...agents[0],
        birthdayRecognitionOptIn: false,
        anniversaryRecognitionOptIn: false,
      },
    ];
    const events = buildCelebrationFeed({
      agents: optedOutAgents,
      transactions: transactions.filter(row => row.agentId === 1),
      reviews: [],
      goals: [],
      acknowledgements: [
        {
          eventKey: "largest_closing:1:2",
          celebratedAt: "2026-09-09T18:00:00.000Z",
          celebratedById: 99,
        },
      ],
      now,
      daysBack: 30,
      daysForward: 30,
    });

    expect(events.some(event => event.category === "personal")).toBe(false);
    expect(
      events.find(event => event.key === "largest_closing:1:2")
    ).toMatchObject({
      celebratedAt: "2026-09-09T18:00:00.000Z",
      celebratedById: 99,
    });
  });
});
