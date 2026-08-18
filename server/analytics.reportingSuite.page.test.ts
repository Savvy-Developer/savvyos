import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const reportPage = () => readFileSync("client/src/pages/ReportingSuitePage.tsx", "utf-8");
const reportService = () => readFileSync("server/analytics/reportingSuite.ts", "utf-8");
const analyticsRouter = () => readFileSync("server/routers/analytics.ts", "utf-8");
const expansionService = () => readFileSync("server/analytics/reportingExpansion.ts", "utf-8");
const expansionViews = () => readFileSync("client/src/pages/ReportingExpansionViews.tsx", "utf-8");
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
    expect(content).toContain("function ColumnShare");
    expect(content).toContain('({share === null ? "—" : percentage(share)})');
    expect(content).toContain("function SortableMetricHeader");
    expect(content).toContain("Show agents with all 0's");
    expect(content).toContain("<AgentMetric value={agent.grossCommission} total={totals.grossCommission}>");
    expect(content).not.toContain("<AgentMetric value={agent.overdueTasks} total={totals.overdueTasks}>");
    expect(content).not.toContain("<AgentMetric value={flagCount} total={totals.flags}>");
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
    expect(content).toContain("Under Contract GCI");
    expect(content).toContain("Under Contract Savvy net");
    expect(content).toContain("Terminated rate");
    expect(content).toContain("Number(agent.terminations) / Number(agent.closings)");
    expect(content).toContain("visibleOutcomeAgents");
    expect(content).toContain('<SortableMetricHeader label="GCI" column="grossCommission"');
    expect(content).toContain("Show agents with all 0's");
    expect(content.indexOf('title="Focused transaction views"')).toBeLessThan(content.indexOf('title={isTerminationView ? "Terminations by agent" : "Outcomes by agent"}'));
    expect(content).toContain("const [search, setSearch] = useState(() => window.location.search)");
    expect(content).toContain("setSearch(serialized ? `?${serialized}` : \"\")");
    expect(service).toContain("terminationRate");
    expect(service).toContain("underContractMonthlyRows");
    expect(service).toContain("monthlyPerformanceScope");
    expect(service).toContain("periodOutcomeScope");
    expect(service).toContain("closedUnits: closed");
    expect(service).toContain("priorScope");
    expect(service).toContain("LIMIT ${limit} OFFSET ${offset}");
  });

  it("keeps the five expansion reports decision-ready, filterable, and backed by bounded evidence", () => {
    const page = reportPage();
    const service = expansionService();
    const views = expansionViews();
    const router = analyticsRouter();

    expect(page).toContain('id: "onboarding"');
    expect(page).toContain('id: "markets"');
    expect(page).toContain('id: "tasks"');
    expect(page).toContain('id: "isa"');
    expect(page).toContain('id: "sources"');
    expect(page).toContain("marketProfileId");
    expect(page).toContain("isaId");
    expect(page).toContain("leadSourceId");

    expect(views).toContain("export function OnboardingReport");
    expect(views).toContain("export function MarketAnalyticsReport");
    expect(views).toContain("export function TasksReport");
    expect(views).toContain("export function IsaActivitiesReport");
    expect(views).toContain("export function LeadSourcesReport");
    expect(views).toContain("Overdue");
    expect(views).toContain("Follow-up");
    expect(views).toContain("Under Contract volume");

    expect(service).toContain("getAgentOnboardingReportingData");
    expect(service).toContain("getMarketAnalyticsReportingData");
    expect(service).toContain("getTasksReportingData");
    expect(service).toContain("getIsaActivitiesReportingData");
    expect(service).toContain("getLeadSourcesReportingData");
    expect(service).toContain("isa_status");
    expect(service).toContain("LIMIT ${limit} OFFSET ${offset}");

    expect(router).toContain("agentOnboardingReport: protectedProcedure");
    expect(router).toContain("marketAnalyticsReport: protectedProcedure");
    expect(router).toContain("tasksReport: protectedProcedure");
    expect(router).toContain("isaActivitiesReport: protectedProcedure");
    expect(router).toContain("leadSourcesReport: protectedProcedure");
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
