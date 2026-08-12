import { describe, expect, it } from "vitest";
import { rankBetween, rebalanceRanks, shouldRebalance } from "./fractionalRank";

describe("fractional ranking", () => {
  it("creates a sortable rank between two neighbors", () => {
    const middle = rankBetween("a", "c");
    expect(middle > "a").toBe(true);
    expect(middle < "c").toBe(true);
  });

  it("keeps 10,000 sequential inserts at position zero strictly ordered", () => {
    let first: string | null = null;
    const ranks: string[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      first = rankBetween(null, first);
      ranks.unshift(first);
    }
    const sorted = [...ranks].sort();
    expect(sorted).toEqual(ranks);
    expect(new Set(ranks).size).toBe(10_000);
  });

  it("identifies long ranks and creates evenly spaced replacement ranks", () => {
    expect(shouldRebalance(["a", "b".repeat(51)])).toBe(true);
    const rebalanced = rebalanceRanks([{ id: 1, position: "z" }, { id: 2, position: "zz" }, { id: 3, position: "zzz" }]);
    expect(rebalanced.map(item => item.position)).toEqual([...rebalanced].map(item => item.position).sort());
  });
});
