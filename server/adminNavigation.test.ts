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
      "Approvals",
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
    expect(source).toContain('label: "Commissions and Payouts", path: "/commission"');
    expect(source).toContain('label: "Knowledgebase", path: "/kb"');
  });

  it("renders category labels as expanded-by-default accessible collapse controls", () => {
    expect(appLayout).toContain('const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());');
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
  });
});
