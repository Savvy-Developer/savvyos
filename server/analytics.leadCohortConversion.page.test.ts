import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reportPage = () => readFileSync("client/src/pages/LeadCohortConversionPage.tsx", "utf-8");
const analyticsRouter = () => readFileSync("server/routers/analytics.ts", "utf-8");
const reportService = () => readFileSync("server/analytics/leadCohortConversion.ts", "utf-8");
const appRoutes = () => readFileSync("client/src/App.tsx", "utf-8");
const contactDetail = () => readFileSync("client/src/pages/ContactDetail.tsx", "utf-8");
const clientMain = () => readFileSync("client/src/main.tsx", "utf-8");

describe("Lead Cohort Conversion report — stable cohort and evidence contract", () => {
  it("keeps cohort, downstream conversion, timing, source, owner, and production measures visible", () => {
    const content = reportPage();
    expect(content).toContain("Cohort leads");
    expect(content).toContain("Ever contracted");
    expect(content).toContain("Observed close conversion");
    expect(content).toContain("Average days to contract");
    expect(content).toContain("Average days to close");
    expect(content).toContain("Downstream closed volume");
    expect(content).toContain("Source cohort outcomes");
    expect(content).toContain("First-owner cohort scorecards");
  });

  it("distinguishes a lead-created cohort from current-state operational work", () => {
    const service = reportService();
    const content = reportPage();
    expect(content).toContain("lead-created date");
    expect(content).toContain("not a historical conversion funnel");
    expect(service).toContain("A valid close is necessarily a downstream contract outcome");
    expect(service).toContain("A closing is counted as an observed contract outcome");
    expect(service).toContain("not days-to-contract");
  });

  it("provides a separate deep-report route, reciprocal library navigation, and contact evidence return context", () => {
    const content = reportPage();
    const routes = appRoutes();
    expect(content).toContain("Analytics report library");
    expect(content).toContain("01 · Transaction Intelligence");
    expect(content).toContain("02 · Lead Cohort Conversion");
    expect(content).toContain('navigate(`/contacts/${contactId}?analytics=1&report=lead-cohort-conversion&returnTo=${encodeURIComponent(location)}`)');
    expect(routes).toContain('path="/analytics/lead-cohorts"');
    const contact = contactDetail();
    expect(contact).toContain('candidate?.startsWith("/analytics")');
    expect(contact).toContain('analyticsReturnTo ? "Back to report" : "Back"');
  });

  it("uses a distinct administrator-gated report and scoped intelligence endpoints", () => {
    const router = analyticsRouter();
    expect(router).toContain("leadCohortConversion: protectedProcedure");
    expect(router).toContain("leadCohortConversionInsights: protectedProcedure");
    expect(router).toContain("refreshLeadCohortConversionInsights: protectedProcedure");
    const focusedSection = router.slice(router.indexOf("leadCohortConversion: protectedProcedure"));
    expect(focusedSection).toContain('ctx.user.role !== "admin"');
    expect(focusedSection).toContain("Lead Cohort Conversion is currently available to administrators only.");
    expect(reportPage()).toContain("refreshLeadCohortConversionInsights.useMutation");
  });

  it("keeps breakdown intermediates server-side and isolates the report request", () => {
    const service = reportService();
    const main = clientMain();
    expect(service).toContain("rows: groupRows");
    expect(service).not.toContain("...group, ...summarize(group.rows)");
    expect(main).toContain('op.path === "analytics.leadCohortConversion"');
    expect(main).toContain("httpLink({");
  });
});
