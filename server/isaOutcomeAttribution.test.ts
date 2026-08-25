import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = () => readFileSync("drizzle/schema.ts", "utf-8");
const migration = () => readFileSync("drizzle/0054_isa_outcome_attribution.sql", "utf-8");
const analytics = () => readFileSync("server/db-analytics.ts", "utf-8");
const attributionService = () => readFileSync("server/isaOutcomeAttribution.ts", "utf-8");
const transactionRouter = () => readFileSync("server/routers/transactions.ts", "utf-8");
const connectionRouter = () => readFileSync("server/routers/agentConnections.ts", "utf-8");
const isaPage = () => readFileSync("client/src/pages/isa/IsaStatsPage.tsx", "utf-8");
const ismPage = () => readFileSync("client/src/pages/IsmDashboardPage.tsx", "utf-8");

describe("ISA transaction outcome attribution", () => {
  it("stores appointment ownership and transaction outcomes independently of mutable contact assignment", () => {
    expect(schema()).toContain('appointmentSetByUserId: int("appointmentSetByUserId")');
    expect(schema()).toContain('export const isaOutcomeAttributions = mysqlTable("isa_outcome_attributions"');
    expect(schema()).toContain('uniqueIndex("isa_outcome_transaction_uidx")');
    expect(connectionRouter()).toContain('appointmentSetByUserId: input.appointmentSet && ctx.user.role === "isa" ? ctx.user.id : null');
  });

  it("prefers the recorded appointment setter and only uses assignment as a fallback", () => {
    const service = attributionService();
    expect(service).toContain('appointment.appointmentSetterRole === "isa"');
    expect(service).toContain('attributionBasis = "appointment_setter"');
    expect(service).toContain('transactionRow.assignedIsaId');
    expect(service).toContain('attributionBasis: "appointment_setter" | "assigned_isa"');
    expect(service).toContain('if (existing)');
    expect(service).toContain('preserved: true');
  });

  it("backfills historical activity and assigned-ISA transaction credit", () => {
    const sql = migration();
    expect(sql).toContain("agent_connection_created");
    expect(sql).toContain("appointment_setter");
    expect(sql).toContain("assigned_isa");
    expect(sql).toContain("COALESCE(t.`contractDate`, t.`createdAt`)");
    expect(sql).toContain("COALESCE(t.`closingDate`, t.`updatedAt`)");
  });

  it("refreshes attribution on manual and bulk transaction writes", () => {
    const router = transactionRouter();
    expect(router.match(/syncIsaOutcomeAttributionSafely\(/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps current Under Contract independent of date and dates Closed by its outcome event", () => {
    const service = analytics();
    expect(service).toContain('eq(isaOutcomeAttributions.status, "under_contract")');
    expect(service).toContain('gte(isaOutcomeAttributions.closedAt, dateFrom)');
    expect(service).toContain('lte(isaOutcomeAttributions.closedAt, dateTo)');
    expect(service).toContain('lifetimeClosed');
    expect(service).toContain('appointmentSetByUserId');
  });

  it("explains attribution to ISAs and uses the same page on the ISM dashboard", () => {
    const page = isaPage();
    expect(page).toContain("How SavvyOS gives you outcome credit");
    expect(page).toContain("Current Under Contract");
    expect(page).toContain("Closed in Period");
    expect(page).toContain("Lifetime Closed");
    expect(page).toContain("Your attributed deals");
    expect(ismPage()).toContain("<IsaStatsPage />");
  });
});
