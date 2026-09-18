import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const appLayout = readFileSync(path.join(root, "client/src/components/AppLayout.tsx"), "utf8");
const reportingPage = readFileSync(path.join(root, "client/src/pages/ReportingSuitePage.tsx"), "utf8");
const transactionsPage = readFileSync(path.join(root, "client/src/pages/TransactionsPage.tsx"), "utf8");
const permissionsRouter = readFileSync(path.join(root, "server/routers/permissions.ts"), "utf8");

function adminNavigationSource() {
  const start = appLayout.indexOf("function buildAdminNav(");
  const end = appLayout.indexOf("// ─── Sidebar Nav Content", start);
  return appLayout.slice(start, end);
}

describe("admin navigation consolidation", () => {
  it("uses the requested category sequence and omits destinations moved onto their parent pages", () => {
    const source = adminNavigationSource();
    const expectedGroups = [
      "Overview",
      "CRM",
      "ISA",
      "Transactions",
      "Agent Success Team",
      "Work",
      "Marketing",
      "Tech",
      "Approvals",
      "HR",
      "Admin",
    ];

    let priorIndex = -1;
    for (const group of expectedGroups) {
      const index = source.indexOf(`label: \"${group}\"`);
      expect(index).toBeGreaterThan(priorIndex);
      priorIndex = index;
    }

    expect(source).not.toContain('label: "Custom Reports", path: "/custom-reports"');
    expect(source).not.toContain('label: "Transaction Exports", path: "/transaction-reporting"');
    expect(source).toContain('label: "Agent Pipelines", path: "/pipeline"');
    expect(source).toContain('label: "Commissions and Payouts"');
    expect(source).toContain('path: "/commission"');
    expect(source).toContain('label: "Agent Celebration"');
    expect(source).toContain('label: "Knowledgebase", path: "/kb"');
    expect(source).toContain('label: "Tech Requests", path: "/tech-requests"');
    expect(source).toContain('label: "Transaction Checklists"');
    expect(source).toContain('path: "/checklists"');
    expect(appLayout).toContain('{ icon: CheckSquare, label: "My Checklists", path: "/checklists" }');

    const agentSuccessStart = source.indexOf('label: "Agent Success Team"');
    const workStart = source.indexOf('label: "Work"', agentSuccessStart);
    const techStart = source.indexOf('label: "Tech"', workStart);
    const hrStart = source.indexOf('label: "HR"', techStart);
    const adminStart = source.indexOf('label: "Admin"', hrStart);
    const agentSuccessSection = source.slice(agentSuccessStart, workStart);
    const workSection = source.slice(workStart, techStart);
    const techSection = source.slice(techStart, hrStart);
    const hrSection = source.slice(hrStart, adminStart);
    const adminSection = source.slice(adminStart);
    expect(agentSuccessSection).toContain('path: "/agent-celebrations"');
    expect(agentSuccessSection).toContain('path: "/checklists"');
    expect(workSection).not.toContain('path: "/checklists"');
    expect(techSection).toContain('path: "/website"');
    expect(techSection).toContain('path: "/tech-requests"');
    expect(techSection).toContain('path: "/email-notifications"');
    expect(techSection).toContain('path: "/webhooks"');
    expect(hrSection).toContain('path: "/users"');
    expect(hrSection).toContain('path: "/pto/admin"');
    expect(hrSection).toContain('path: "/pto/approvals"');
    expect(hrSection).toContain('path: "/agent-renewals"');
    expect(hrSection).toContain('path: "/onboarding"');
    expect(hrSection).toContain('path: "/org-chart"');
    expect(hrSection).toContain('path: "/agent-directory"');
    expect(hrSection).toContain('path: "/roles-responsibilities"');
    expect(agentSuccessSection).not.toContain('path: "/admin/market-match-quiz"');
    expect(adminSection).toContain('path: "/admin/market-match-quiz"');
  });

  it("renders category labels as expanded-by-default accessible collapse controls", () => {
    expect(appLayout).toContain('const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(');
    expect(appLayout).toContain('() => new Set()');
    expect(appLayout).toContain('onClick={() => toggleGroup(group.label)}');
    expect(appLayout).toContain('aria-expanded={!isGroupCollapsed}');
    expect(appLayout).toContain('(collapsed || !isGroupCollapsed) && (');
  });

  it("keeps relocated actions discoverable and governed by their existing permissions", () => {
    expect(reportingPage).toContain('const canViewCustomReports = !!(permissions as Record<string, boolean> | undefined)?.canViewCustomReports;');
    expect(reportingPage).toContain('onClick={() => navigate("/custom-reports")}');
    expect(transactionsPage).toContain('const canViewTransactionExports = !!(adminPermissions as Record<string, boolean> | undefined)?.canViewTransactionExports;');
    expect(transactionsPage).toContain('onClick={() => navigate("/transaction-reporting")}');
    expect(permissionsRouter).toContain('{ key: "canViewCustomReports",          label: "Custom Reports",             group: "Overview" }');
    expect(permissionsRouter).toContain('{ key: "canViewTransactionExports",     label: "Transaction Exports",        group: "Transactions" }');
    expect(permissionsRouter).toContain('{ key: "canViewAgentCelebrations",      label: "Agent Celebration",          group: "Agent Success Team" }');
    expect(permissionsRouter).toContain('{ key: "canViewMarketMatchQuiz",        label: "Market Match Quiz",          group: "Admin" }');
    expect(permissionsRouter).toContain('{ key: "canViewTechRequests",           label: "Tech Requests",              group: "Tech" }');
    expect(permissionsRouter).toContain('{ key: "canViewTransactionChecklists",  label: "Transaction Checklists",     group: "Agent Success Team" }');
  });
});
