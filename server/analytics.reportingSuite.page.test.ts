import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const reportPage = () => readFileSync("client/src/pages/ReportingSuitePage.tsx", "utf-8");
const reportService = () => readFileSync("server/analytics/reportingSuite.ts", "utf-8");
const analyticsRouter = () => readFileSync("server/routers/analytics.ts", "utf-8");
const appRoutes = () => readFileSync("client/src/App.tsx", "utf-8");

describe("Reporting suite — stable decision and evidence contract", () => {
  it("keeps the Agent Performance report centered on production, financial contribution, and operational attention", () => {
    const content = reportPage();
    expect(content).toContain("Agent Performance");
    expect(content).toContain("Gross commission");
    expect(content).toContain("Savvy net");
    expect(content).toContain("Overdue tasks");
    expect(content).toContain("Past expected close");
    expect(content).toContain("No expected close");
    expect(content).toContain("Overdue task queue");
  });

  it("keeps Group Leader Review in a selectable, coaching-ready team context", () => {
    const content = reportPage();
    expect(content).toContain("Group Leader Review");
    expect(content).toContain("Group leader");
    expect(content).toContain("Coaching queue");
    expect(content).toContain("Conversation starting point");
    expect(content).toContain("priority === \"high\"");
  });

  it("keeps Transaction Statistics filtered, trend-aware, and backed by paginated evidence", () => {
    const content = reportPage();
    const service = reportService();
    expect(content).toContain("Transaction Statistics");
    expect(content).toContain("Termination rate");
    expect(content).toContain("Representation contribution");
    expect(content).toContain("Transaction evidence");
    expect(content).toContain("summary.closedUnits");
    expect(content).toContain("summary.change?.grossCommission");
    expect(service).toContain("terminationRate");
    expect(service).toContain("closedUnits: closed");
    expect(service).toContain("priorScope");
    expect(service).toContain("LIMIT ${limit} OFFSET ${offset}");
  });

  it("keeps report data on explicit administrator-only procedures and makes the new suite the analytics route", () => {
    const router = analyticsRouter();
    const routes = appRoutes();
    expect(router).toContain("reportingFilters: protectedProcedure");
    expect(router).toContain("agentReport: protectedProcedure");
    expect(router).toContain("groupLeaderReport: protectedProcedure");
    expect(router).toContain("transactionStatisticsReport: protectedProcedure");
    expect(router).toContain('ctx.user.role !== "admin"');
    expect(routes).toContain('path="/analytics"');
    expect(routes).toContain("<ReportingSuitePage />");
  });
});
