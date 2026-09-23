import { describe, expect, it } from "vitest";
import {
  cleanTags,
  compactMoney,
  hasAnyTag,
  inInvestmentBand,
  isInvestmentBand,
  parseTagText,
  popularTags,
  tagLabel,
} from "@shared/websiteContentFilters";

describe("investment bands", () => {
  it("matches the old site's boundaries", () => {
    expect(inInvestmentBand(499_999, "under-500k")).toBe(true);
    expect(inInvestmentBand(500_000, "under-500k")).toBe(false);
    expect(inInvestmentBand(500_000, "500k-1m")).toBe(true);
    expect(inInvestmentBand(1_000_000, "500k-1m")).toBe(true);
    expect(inInvestmentBand(1_000_001, "1m-plus")).toBe(true);
    expect(inInvestmentBand(1_000_000, "1m-plus")).toBe(false);
  });

  it("reads decimal strings from the database, and matches nothing without an amount", () => {
    expect(inInvestmentBand("1140000.00", "1m-plus")).toBe(true);
    expect(inInvestmentBand(null, "under-500k")).toBe(false);
    expect(inInvestmentBand("", "under-500k")).toBe(false);
    expect(inInvestmentBand("abc", "under-500k")).toBe(false);
  });

  it("only accepts known bands from the address bar", () => {
    expect(isInvestmentBand("500k-1m")).toBe(true);
    expect(isInvestmentBand("2m-plus")).toBe(false);
  });
});

describe("compactMoney", () => {
  it("reads like a card label", () => {
    expect(compactMoney(1_140_000)).toBe("$1.1M");
    expect(compactMoney(1_000_000)).toBe("$1M");
    expect(compactMoney(355_000)).toBe("$355K");
    expect(compactMoney("974701.00")).toBe("$975K");
    expect(compactMoney(999_600)).toBe("$1M");
    expect(compactMoney(null)).toBeNull();
    expect(compactMoney(0)).toBeNull();
  });
});

describe("tags", () => {
  it("turns slug tags into words but keeps real hyphens", () => {
    expect(tagLabel("smoky-mountains-str")).toBe("smoky mountains str");
    expect(tagLabel("Short-Term Rental Investing")).toBe("Short-Term Rental Investing");
    expect(tagLabel("Cash-Flow")).toBe("Cash-Flow");
  });

  it("drops repeats that differ only in case, keeping the first spelling", () => {
    expect(cleanTags(["STR Investing", "str investing", " STR  Investing ", "", 3, "Q3"])).toEqual([
      "STR Investing",
      "Q3",
    ]);
    expect(parseTagText("jersey shore, belmar,, Jersey Shore")).toEqual(["jersey shore", "belmar"]);
  });

  it("offers the tags more than one post uses, most used first, without brand tags", () => {
    const posts = [
      { tags: ["jersey shore", "belmar", "savvy-str-agents"] },
      { tags: ["Jersey Shore", "belmar", "Savvy STR Agents"] },
      { tags: ["jersey shore", "one-off"] },
      { tags: null },
    ];
    expect(popularTags(posts)).toEqual([
      { key: "jersey shore", label: "jersey shore", count: 3 },
      { key: "belmar", label: "belmar", count: 2 },
    ]);
  });

  it("matches a post that has any chosen tag", () => {
    expect(hasAnyTag(["Jersey Shore", "belmar"], ["jersey shore"])).toBe(true);
    expect(hasAnyTag(["smoky-mountains-str"], ["smoky mountains str"])).toBe(true);
    expect(hasAnyTag(["belmar"], ["cape cod"])).toBe(false);
    expect(hasAnyTag(null, [])).toBe(true);
  });
});
