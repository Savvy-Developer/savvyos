import { describe, it, expect } from "vitest";
import { calculateCommission, CommissionResult } from "./commissionEngine";

function getPayout(result: CommissionResult, type: string) {
  return result.payouts.find((p) => p.payeeType === type);
}

describe("Commission Engine", () => {
  const GCI = 10000; // $10,000 for easy math

  describe("Solo Agents — no referral", () => {
    it("50/50 split", () => {
      const r = calculateCommission({ agentSplit: 50, isInGroup: false, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(50);
      expect(r.flagForReview).toBe(false);
    });

    it("80/20 split", () => {
      const r = calculateCommission({ agentSplit: 80, isInGroup: false, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(80);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
    });
  });

  describe("Solo Agents — with referral", () => {
    it("50/50 with 30% referral: Savvy pays all", () => {
      const r = calculateCommission({ agentSplit: 50, isInGroup: false, referralPercent: 30, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(30);
      expect(getPayout(r, "referral_partner")?.referralFeePaidBy).toBe("savvy");
    });

    it("60/40 with 25% referral: Savvy protects its 20% floor before the agent pays the balance", () => {
      const r = calculateCommission({ agentSplit: 60, isInGroup: false, referralPercent: 25, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(55); // 60 - 5
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20); // 40 - 20
      expect(getPayout(r, "referral_partner")?.percentage).toBe(25);
    });

    it("70/30 with 30% referral: Agent pays 20%, Savvy pays 10%", () => {
      const r = calculateCommission({ agentSplit: 70, isInGroup: false, referralPercent: 30, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50); // 70 - 20
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20); // 30 - 10
      expect(getPayout(r, "referral_partner")?.percentage).toBe(30);
    });

    it("80/20 with 30% referral: Agent pays all", () => {
      const r = calculateCommission({ agentSplit: 80, isInGroup: false, referralPercent: 30, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50); // 80 - 30
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(30);
      expect(getPayout(r, "referral_partner")?.referralFeePaidBy).toBe("agent");
    });

    it("50/50 with 30% referral flags Savvy below 20%? No — Savvy gets 20%", () => {
      const r = calculateCommission({ agentSplit: 50, isInGroup: false, referralPercent: 30, gci: GCI });
      // Savvy = 50 - 30 = 20, which is exactly 20 — no flag
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(r.flagForReview).toBe(false);
    });
  });

  describe("Group Leader at 10% (Agent=50%, Savvy=40%, GL=10%)", () => {
    const opts = { agentSplit: 50, isInGroup: true, groupLeaderSplit: 10 };

    it("30% referral: Agent=50, Savvy=20, Ref=30, GL=0", () => {
      const r = calculateCommission({ ...opts, referralPercent: 30, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(30);
      expect(getPayout(r, "group_leader")?.percentage).toBe(0);
    });

    it("25% referral: Agent=50, Savvy=20, Ref=25, GL=5", () => {
      const r = calculateCommission({ ...opts, referralPercent: 25, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(25);
      expect(getPayout(r, "group_leader")?.percentage).toBe(5);
    });

    it("20% referral: Agent=50, Savvy=20, Ref=20, GL=10", () => {
      const r = calculateCommission({ ...opts, referralPercent: 20, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(20);
      expect(getPayout(r, "group_leader")?.percentage).toBe(10);
    });

    it("15% referral: Agent=50, Savvy=25, Ref=15, GL=10", () => {
      const r = calculateCommission({ ...opts, referralPercent: 15, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(25);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(15);
      expect(getPayout(r, "group_leader")?.percentage).toBe(10);
    });

    it("10% referral: Agent=50, Savvy=30, Ref=10, GL=10", () => {
      const r = calculateCommission({ ...opts, referralPercent: 10, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(30);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(10);
      expect(getPayout(r, "group_leader")?.percentage).toBe(10);
    });

    it("5% referral: Agent=50, Savvy=35, Ref=5, GL=10", () => {
      const r = calculateCommission({ ...opts, referralPercent: 5, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(35);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(5);
      expect(getPayout(r, "group_leader")?.percentage).toBe(10);
    });
  });

  describe("Group Leader at 20% (Agent=50%, Savvy=30%, GL=20%)", () => {
    const opts = { agentSplit: 50, isInGroup: true, groupLeaderSplit: 20 };

    it("30% referral: Agent=50, Savvy=20, Ref=30, GL=0", () => {
      const r = calculateCommission({ ...opts, referralPercent: 30, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(30);
      expect(getPayout(r, "group_leader")?.percentage).toBe(0);
    });

    it("25% referral: Agent=50, Savvy=20, Ref=25, GL=5", () => {
      const r = calculateCommission({ ...opts, referralPercent: 25, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(25);
      expect(getPayout(r, "group_leader")?.percentage).toBe(5);
    });

    it("15% referral: Agent=50, Savvy=20, Ref=15, GL=15", () => {
      const r = calculateCommission({ ...opts, referralPercent: 15, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(15);
      expect(getPayout(r, "group_leader")?.percentage).toBe(15);
    });

    it("20% referral: Agent=50, Savvy=20, Ref=20, GL=10", () => {
      const r = calculateCommission({ ...opts, referralPercent: 20, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(20);
      expect(getPayout(r, "group_leader")?.percentage).toBe(10);
    });

    it("10% referral: Agent=50, Savvy=20, Ref=10, GL=20", () => {
      const r = calculateCommission({ ...opts, referralPercent: 10, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(10);
      expect(getPayout(r, "group_leader")?.percentage).toBe(20);
    });

    it("5% referral: Agent=50, Savvy=25, Ref=5, GL=20", () => {
      const r = calculateCommission({ ...opts, referralPercent: 5, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(25);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(5);
      expect(getPayout(r, "group_leader")?.percentage).toBe(20);
    });
  });

  describe("Group Leader at 30% (Agent=50%, Savvy=20%, GL=30%)", () => {
    const opts = { agentSplit: 50, isInGroup: true, groupLeaderSplit: 30 };

    it("30% referral: GL pays all, GL net = 0", () => {
      const r = calculateCommission({ ...opts, referralPercent: 30, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(getPayout(r, "referral_partner")?.percentage).toBe(30);
      expect(getPayout(r, "group_leader")?.percentage).toBe(0);
      expect(getPayout(r, "referral_partner")?.referralFeePaidBy).toBe("group_leader");
    });

    it("10% referral: GL pays all, GL net = 20", () => {
      const r = calculateCommission({ ...opts, referralPercent: 10, gci: GCI });
      expect(getPayout(r, "group_leader")?.percentage).toBe(20);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
    });

    it("no referral: standard split", () => {
      const r = calculateCommission({ ...opts, referralPercent: 0, gci: GCI });
      expect(getPayout(r, "agent")?.percentage).toBe(50);
      expect(getPayout(r, "group_leader")?.percentage).toBe(30);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
    });
  });

  describe("Savvy minimum flag", () => {
    it("preserves Savvy's 20% floor when the agent absorbs the remaining referral fee", () => {
      const r = calculateCommission({ agentSplit: 70, isInGroup: false, referralPercent: 15, gci: GCI });
      // Savvy pays 10 points down to its floor; the agent absorbs the remaining 5.
      expect(getPayout(r, "agent")?.percentage).toBe(65);
      expect(getPayout(r, "savvy_str_agents")?.percentage).toBe(20);
      expect(r.flagForReview).toBe(false);
    });
  });
});
