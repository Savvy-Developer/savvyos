import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normaliseIsmAppointmentSearch } from "./ismAppointments";

const appointmentAnalytics = () =>
  readFileSync("server/analytics/ismAppointments.ts", "utf-8");
const analyticsRouter = () =>
  readFileSync("server/routers/analytics.ts", "utf-8");
const ismDashboard = () =>
  readFileSync("client/src/pages/IsmDashboardPage.tsx", "utf-8");
const appointmentsTab = () =>
  readFileSync("client/src/pages/ism/IsmAppointmentsTab.tsx", "utf-8");

describe("ISM ISA appointment activity", () => {
  it("normalizes optional search input before it reaches the activity query", () => {
    expect(normaliseIsmAppointmentSearch(undefined)).toBeUndefined();
    expect(normaliseIsmAppointmentSearch("   ")).toBeUndefined();
    expect(normaliseIsmAppointmentSearch("  Taylor   Jordan ")).toBe(
      "Taylor Jordan"
    );
  });

  it("uses canonical appointment attribution and ISA-created connection records without duplicate appointments", () => {
    const source = appointmentAnalytics();
    expect(source).toContain("appointment_isa.id = ac.appointmentSetByUserId");
    expect(source).toContain("activity.action = 'agent_connection_created'");
    expect(source).toContain("AND appointment_isa.id IS NULL");
    expect(source).toContain(
      "CASE WHEN ac.appointmentSet = 1 THEN 'appointment' ELSE 'connection' END"
    );
    expect(source).toContain(
      "ORDER BY isa_events.eventAt DESC, isa_events.connectionId DESC"
    );
  });

  it("limits the activity stream to authorized ISM dashboard administrators", () => {
    const router = analyticsRouter();
    expect(router).toContain("ismAppointmentActivity: protectedProcedure");
    expect(router).toContain(
      'canAdminUsePermission(ctx.user, "canViewIsmDashboard")'
    );
    expect(router).toContain("return getIsmAppointmentActivity({");
  });

  it("surfaces the ISA Appts tab with live refresh and record drill-through", () => {
    expect(ismDashboard()).toContain('TabsTrigger value="appointments"');
    const page = appointmentsTab();
    expect(page).toContain("Live every 30 seconds");
    expect(page).toContain("refetchInterval: 30_000");
    expect(page).toContain("trpc.analytics.ismAppointmentActivity.useQuery");
    expect(page).toContain("href={`/contacts/${row.contact.id}`}");
    expect(page).toContain("href={`/pipeline/${row.connectionId}`}");
  });
});
