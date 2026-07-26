import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

// ─── Bug Fix Tests: March 20 ──────────────────────────────────────────────────

describe("ISA coverage dashboard — stable render contract", () => {
  it("uses the rebuilt ISA coverage component instead of the removed legacy tab", () => {
    const content = readFileSync("client/src/pages/AnalyticsPage.tsx", "utf-8");
    expect(content).toContain("function IsaDashboard");
    expect(content).not.toContain("function IsaPerformanceTab()");
  });

  it("renders assignment coverage and ISA-book data without component-local conditional hooks", () => {
    const content = readFileSync("client/src/pages/AnalyticsPage.tsx", "utf-8");
    const start = content.indexOf("function IsaDashboard");
    const end = content.indexOf("function MarketsDashboard", start);
    const section = content.slice(start, end);
    expect(section).toContain("assignmentCoverage");
    expect(section).toContain("isaBooks");
    expect(section).not.toMatch(/use(?:Memo|State|Effect)\(/);
  });
});

describe("UsersPage — Market field only shown for Agent role", () => {
  it("Market field is wrapped in agent-only conditional guard", () => {
    const content = readFileSync("client/src/pages/UsersPage.tsx", "utf-8");
    const marketLabelPos = content.indexOf("<Label>Market</Label>");
    expect(marketLabelPos).toBeGreaterThan(-1);
    // The agent guard should appear within 200 chars before the Market label
    const agentGuardPos = content.lastIndexOf('form.role === "agent"', marketLabelPos);
    expect(agentGuardPos).toBeGreaterThan(-1);
    expect(marketLabelPos - agentGuardPos).toBeLessThan(200);
  });

  it("Onboarding checkbox is agent-only (ISA removed from guard)", () => {
    const content = readFileSync("client/src/pages/UsersPage.tsx", "utf-8");
    // Old combined guard should be gone
    expect(content).not.toContain('(form.role === "agent" || form.role === "isa")');
  });
});

describe("UsersPage — User list refreshes immediately after add/edit/delete", () => {
  it("does NOT use the wrong cache key utils.users.list.invalidate()", () => {
    const content = readFileSync("client/src/pages/UsersPage.tsx", "utf-8");
    expect(content).not.toContain("utils.users.list.invalidate()");
  });

  it("uses the correct cache key listWithDocCounts in all three mutations", () => {
    const content = readFileSync("client/src/pages/UsersPage.tsx", "utf-8");
    const matches = content.match(/utils\.users\.listWithDocCounts\.invalidate\(\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  it("query and invalidation use the same key", () => {
    const content = readFileSync("client/src/pages/UsersPage.tsx", "utf-8");
    expect(content).toContain("trpc.users.listWithDocCounts.useQuery()");
    expect(content).toContain("utils.users.listWithDocCounts.invalidate()");
  });
});
