import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const reportPage = () => readFileSync("client/src/pages/ReportingSuitePage.tsx", "utf-8");
const reportService = () => readFileSync("server/analytics/reportingSuite.ts", "utf-8");
const analyticsRouter = () => readFileSync("server/routers/analytics.ts", "utf-8");
const expansionService = () => readFileSync("server/analytics/reportingExpansion.ts", "utf-8");
const expansionViews = () => readFileSync("client/src/pages/ReportingExpansionViews.tsx", "utf-8");
const appRoutes = () => readFileSync("client/src/App.tsx", "utf-8");
const pipelineReportView = () => readFileSync("client/src/pages/PipelineReport.tsx", "utf-8");
const financialService = () => readFileSync("server/db-analytics.ts", "utf-8");
const financialView = () => readFileSync("client/src/pages/analytics/FinancialPerformanceTab.tsx", "utf-8");
const commandCenterService = () => readFileSync("server/analytics/adminCommandCenter.ts", "utf-8");
const transactionsPage = () => readFileSync("client/src/pages/TransactionsPage.tsx", "utf-8");
const adminDashboard = () => readFileSync("client/src/pages/admin/AdminDashboard.tsx", "utf-8");
const transactionsDb = () => readFileSync("server/db.ts", "utf-8");
const workspaceService = () => readFileSync("server/analytics/workspace.ts", "utf-8");

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

  it("keeps the Pipeline Report agent-level, live, and operationally actionable", () => {
    const page = reportPage();
    const view = pipelineReportView();
    const service = reportService();
    const router = analyticsRouter();
    expect(page).toContain('id: "pipelines"');
    expect(page).toContain("pipelineReport.useQuery");
    expect(view).toContain("Live Pipeline Snapshot");
    expect(view).toContain("Agent pipeline scorecard");
    expect(view).toContain("Follow-up coverage");
    expect(view).toContain("/pipeline?agentId=${agent.agentId}");
    expect(service).toContain("export async function getPipelineReport");
    expect(service).toContain("missingFollowUps");
    expect(service).toContain("criticalCount");
    expect(router).toContain("pipelineReport: protectedProcedure");
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
    expect(content).toContain("Selected-status volume");
    expect(content).not.toContain("scheduledProduction.total.volume");
    expect(content).toContain("summary.change?.grossCommission");
    expect(content).toContain("Under Contract GCI");
    expect(content).toContain("Under Contract Savvy net");
    expect(content).toContain("Under Contract volume");
    expect(content).toContain("productionTrendTooltip");
    expect(content).toContain("filterNull");
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
    expect(service).not.toContain("scheduledUnderContractScope");
    expect(service).not.toContain("scheduledProduction: {");
    expect(service).toContain("monthlyPerformanceScope");
    expect(service).toContain("monthlyPerformanceStatus");
    expect(service).toContain("periodOutcomeScope");
    expect(service).toContain("closedUnits: closed");
    expect(service).toContain("priorScope");
    expect(service).toContain("LIMIT ${limit} OFFSET ${offset}");
  });

  it("keeps closed actuals and live UC inventory distinct while prioritizing actionable representation averages", () => {
    const financial = financialService();
    const view = financialView();
    const commandCenter = commandCenterService();
    const transactions = transactionsPage();
    const agentReport = reportPage();
    const service = reportService();

    expect(financial).not.toContain("const ucScheduledWhere");
    expect(view).toContain('label="Closed Actuals"');
    expect(view).toContain('label="Live UC Inventory"');
    expect(view).not.toContain('label="Scheduled UC"');
    expect(view).toContain("Closed Actuals vs Live Under-Contract Inventory");
    expect(agentReport).toContain("Avg. purchase price");
    expect(agentReport).toContain("Avg. commission");
    expect(agentReport).toContain("Buyer ${money(buyerAverages.averagePurchasePrice, true)} · Seller ${money(sellerAverages.averagePurchasePrice, true)}");
    expect(service).toContain("representationAverages");
    expect(service).toContain("AVG(t.\\`purchasePrice\\`) AS averagePurchasePrice");
    expect(commandCenter).toContain('transactionScope(filters, { status: "closed" })');
    expect(commandCenter).toContain('transactionScope({ ...filters, transactionStatus: undefined }, { status: undefined })');
    expect(commandCenter).not.toContain("DATE_SUB(CURDATE(), INTERVAL 5 MONTH)");
    expect(commandCenter).not.toContain("const selectedProductionStatus");
    expect(transactions).toContain('if (s === "closed" && !closingDateFrom && !closingDateTo && !contractDateFrom && !contractDateTo)');
    expect(transactions).toContain('setClosingDateFrom(`${today.slice(0, 4)}-01-01`)');
    expect(adminDashboard()).toContain("const closedTransactionsQuery = new URLSearchParams");
    expect(adminDashboard()).toContain("navigate(`/transactions?${closedTransactionsQuery}`)");
  });

  it("keeps referral lifecycle and referral-fee reporting separate from transaction reporting", () => {
    const page = reportPage();
    const service = reportService();
    const router = analyticsRouter();
    const commandCenter = commandCenterService();
    const financial = financialService();
    const workspace = workspaceService();
    const transactionSource = transactionsDb();

    expect(page).toContain('id: "referrals"');
    expect(page).toContain("Referral Report");
    expect(page).toContain("Referral performance");
    expect(page).toContain("Referral status mix");
    expect(page).toContain("Referral evidence");
    expect(page).toContain("referralReport.useQuery");
    expect(service).toContain("export async function getReferralReport");
    expect(service).toContain("referral_payments");
    expect(service).toContain("referral_transaction_links");
    expect(service).toContain("t.\\`referralId\\` IS NULL");
    expect(router).toContain("referralReport: protectedProcedure");
    expect(commandCenter).toContain("t.referralId IS NULL AND NOT EXISTS");
    expect(financial).toContain("function excludeReferralTransactions");
    expect(workspace).toContain("referral_transaction_links");
    expect(transactionSource).toContain("transactions.referralId} IS NULL AND NOT EXISTS");
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
    expect(views).toContain("Appointments set by agent");
    expect(views).toContain("agentAppointments");
    expect(views).toContain("w-full xl:w-1/2");
    expect(views).toContain("agents with no appointments");
    expect(views).toContain("agent.marketName");
    expect(views).toContain("/agents/${agent.agentId}");
    expect(views).toContain("appointment-set date");
    expect(views).toContain("Under Contract volume");
    expect(views).toContain("marketTrendTooltip");
    expect(views).toContain("filterNull");

    expect(service).toContain("getAgentOnboardingReportingData");
    expect(service).toContain("getMarketAnalyticsReportingData");
    expect(service).toContain("getTasksReportingData");
    expect(service).toContain("getIsaActivitiesReportingData");
    expect(service).toContain("getLeadSourcesReportingData");
    expect(service).toContain("appointmentScope");
    expect(service).toContain("agentRosterScope");
    expect(service).toContain("appointmentCounts");
    expect(service).toContain("No market assigned");
    expect(service).toContain("agentAppointments");
    expect(service).toContain("COALESCE(ac.\\`appointmentSetAt\\`, ac.\\`createdAt\\`)");
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
    expect(router).toContain("pipelineReport: protectedProcedure");
    expect(router).toContain("groupLeaderReport: protectedProcedure");
    expect(router).toContain("transactionStatisticsReport: protectedProcedure");
    expect(router).toContain('ctx.user.role !== "admin"');
    expect(routes).toContain('path="/analytics"');
    expect(routes).toContain("<ReportingSuitePage />");
  });
});
