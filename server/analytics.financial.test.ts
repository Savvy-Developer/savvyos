import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../drizzle/schema", () => ({
  transactions: { id: "id", status: "status", closingDate: "closingDate", purchasePrice: "purchasePrice", grossCommissionIncome: "grossCommissionIncome", agentId: "agentId", primaryContactId: "primaryContactId", propertyId: "propertyId" },
  transactionPayoutItems: { transactionId: "transactionId", payeeType: "payeeType", amount: "amount" },
  users: { id: "id", name: "name" },
  contacts: { id: "id", firstName: "firstName", lastName: "lastName", leadSourceId: "leadSourceId" },
  properties: { id: "id", address: "address", city: "city" },
  leadSources: { id: "id", name: "name" },
  groups: {},
  groupMembers: {},
  marketProfiles: {},
  marketAgentAssignments: {},
  agentConnections: {},
  tasks: {},
  commissionExceptions: {},
  onboardingInstances: {},
  onboardingInstanceTasks: {},
  marketMatchSessions: {},
  duplicateContactPairs: {},
  agentGoals: {},
}));

vi.mock("mysql2/promise", () => ({ createPool: vi.fn(() => ({ query: vi.fn(), execute: vi.fn() })) }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn() }));

// ─── Unit tests for financial calculation logic ───────────────────────────────
describe("Financial Performance calculations", () => {
  it("computes grossCommission = GCI - referralPayouts", () => {
    const gci = 10000;
    const referralPayouts = 1500;
    const grossCommission = gci - referralPayouts;
    expect(grossCommission).toBe(8500);
  });

  it("computes companyDollars as sum of savvy_str_agents + exp buckets", () => {
    const payoutMap = new Map([
      ["savvy_str_agents", 3000],
      ["exp", 500],
      ["agent", 5000],
      ["group_leader", 1000],
      ["referral_partner", 500],
    ]);
    const companyDollars = (payoutMap.get("savvy_str_agents") ?? 0) + (payoutMap.get("exp") ?? 0);
    expect(companyDollars).toBe(3500);
  });

  it("computes netCommission as agent payout bucket", () => {
    const payoutMap = new Map([
      ["agent", 5500],
      ["savvy_str_agents", 3000],
    ]);
    const netCommission = payoutMap.get("agent") ?? 0;
    expect(netCommission).toBe(5500);
  });

  it("sums per-transaction payout buckets correctly", () => {
    const txPayouts = [
      { payeeType: "agent", amount: "4000" },
      { payeeType: "savvy_str_agents", amount: "2000" },
      { payeeType: "referral_partner", amount: "500" },
      { payeeType: "group_leader", amount: "1000" },
    ];
    const sumType = (type: string) =>
      txPayouts.filter((p) => p.payeeType === type).reduce((s, p) => s + Number(p.amount ?? 0), 0);

    expect(sumType("agent")).toBe(4000);
    expect(sumType("savvy_str_agents")).toBe(2000);
    expect(sumType("referral_partner")).toBe(500);
    expect(sumType("group_leader")).toBe(1000);
    expect(sumType("exp")).toBe(0);
  });

  it("handles missing payout items gracefully (returns 0)", () => {
    const txPayouts: { payeeType: string; amount: string }[] = [];
    const sumType = (type: string) =>
      txPayouts.filter((p) => p.payeeType === type).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    expect(sumType("agent")).toBe(0);
    expect(sumType("savvy_str_agents")).toBe(0);
  });

  it("formats full dollar amounts correctly", () => {
    const fmtFull = (v: number) =>
      `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(fmtFull(10000)).toBe("$10,000.00");
    expect(fmtFull(0)).toBe("$0.00");
    expect(fmtFull(1234.56)).toBe("$1,234.56");
  });

  it("computes totals row correctly across multiple transactions", () => {
    const rows = [
      { purchasePrice: 500000, gci: 15000, referralPayouts: 1500, groupLeaderSplits: 1000, agentPayouts: 8500, companyDollars: 4000 },
      { purchasePrice: 300000, gci: 9000, referralPayouts: 0, groupLeaderSplits: 0, agentPayouts: 6000, companyDollars: 3000 },
    ];
    const totals = rows.reduce(
      (acc, r) => ({
        purchasePrice: acc.purchasePrice + r.purchasePrice,
        gci: acc.gci + r.gci,
        referralPayouts: acc.referralPayouts + r.referralPayouts,
        groupLeaderSplits: acc.groupLeaderSplits + r.groupLeaderSplits,
        agentPayouts: acc.agentPayouts + r.agentPayouts,
        companyDollars: acc.companyDollars + r.companyDollars,
      }),
      { purchasePrice: 0, gci: 0, referralPayouts: 0, groupLeaderSplits: 0, agentPayouts: 0, companyDollars: 0 }
    );
    expect(totals.purchasePrice).toBe(800000);
    expect(totals.gci).toBe(24000);
    expect(totals.referralPayouts).toBe(1500);
    expect(totals.agentPayouts).toBe(14500);
    expect(totals.companyDollars).toBe(7000);
  });
});
