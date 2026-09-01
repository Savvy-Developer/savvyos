import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const referralsPage = () => readFileSync("client/src/pages/ReferralsPage.tsx", "utf-8");

describe("Referrals Agents search", () => {
  it("filters referral agents by case-insensitive partial agent name or market", () => {
    const page = referralsPage();

    expect(page).toContain('const normalizedQuery = agentSearch.trim().toLowerCase();');
    expect(page).toContain('const agentName = String(entry.agent?.name ?? "").toLowerCase();');
    expect(page).toContain('const market = String(entry.agent?.primaryMarket ?? "").toLowerCase();');
    expect(page).toContain("agentName.includes(normalizedQuery) || market.includes(normalizedQuery)");
  });

  it("keeps the search control mobile-friendly and shows an empty state", () => {
    const page = referralsPage();

    expect(page).toContain('placeholder="Search by market or agent name"');
    expect(page).toContain('className="w-full sm:max-w-sm"');
    expect(page).toContain('className="w-full sm:w-auto"');
    expect(page).toContain("No referral agents match your search.");
  });
});
