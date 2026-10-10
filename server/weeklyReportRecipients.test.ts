import { describe, expect, it } from "vitest";
import { WEEKLY_LEAD_REPORT_RECIPIENTS } from "./weeklyLeadReportScheduler";
import { WEEKLY_REFERRAL_REPORT_RECIPIENTS } from "./weeklyOperationsReportsScheduler";

const AMY_EMAIL = "amyrollins@savvy.realty";

describe("weekly report recipient defaults", () => {
  it("sends the Weekly Lead Report to the current leadership distribution", () => {
    expect(WEEKLY_LEAD_REPORT_RECIPIENTS.map(recipient => recipient.email)).toEqual([
      "marcusclay@savvy.realty",
      "nataliacallejas@savvy.realty",
      "camilo@savvy.realty",
      "dhruv@savvy.realty",
      "elana@savvy.realty",
      "dyl@savvy.realty",
      "tyler@savvy.realty",
    ]);
  });

  it("removes Amy from all static weekly report distributions", () => {
    expect(WEEKLY_LEAD_REPORT_RECIPIENTS.map(recipient => recipient.email)).not.toContain(AMY_EMAIL);
    expect(WEEKLY_REFERRAL_REPORT_RECIPIENTS.map(recipient => recipient.email)).not.toContain(AMY_EMAIL);
  });
});
