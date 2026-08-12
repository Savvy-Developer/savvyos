import { describe, expect, it } from "vitest";
import { needsRebalance, rankBetween, rebalanceRanks } from "./fractionalRank";

describe("fractional ranks", () => {
  it("keeps 10,000 repeated inserts at position zero ordered with threshold-based rebalancing", () => {
    let ranks: string[] = [];
    let rebalanceCount = 0;
    for (let index = 0; index < 10_000; index += 1) {
      const next = rankBetween(null, ranks[0] ?? null);
      ranks.unshift(next);
      if (needsRebalance(next)) {
        ranks = rebalanceRanks(ranks.length);
        rebalanceCount += 1;
      }
    }
    expect([...ranks].sort()).toEqual(ranks);
    expect(ranks.every(rank => !needsRebalance(rank))).toBe(true);
    expect(rebalanceCount).toBeGreaterThan(0);
  });

  it("produces compact, ordered ranks during a rebalance", () => {
    const ranks = rebalanceRanks(10_000);
    expect(ranks).toHaveLength(10_000);
    expect([...ranks].sort()).toEqual(ranks);
    expect(ranks.every(rank => !needsRebalance(rank))).toBe(true);
  });
});
