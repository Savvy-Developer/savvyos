import { describe, expect, it } from "vitest";
import { canViewPmWorkload } from "./pmAccess";
import { pmRouter } from "./pm";

describe("Projects Workload access", () => {
  it.each([
    "dyl@savvy.realty",
    "ELANA@SAVVY.REALTY",
    "tyler@savvy.realty",
    "kryzll@savvy.realty",
  ])("allows the designated workload viewer %s", email => {
    expect(canViewPmWorkload({ email })).toBe(true);
  });

  it("rejects every user outside the designated allow-list", () => {
    expect(canViewPmWorkload({ email: "other@savvy.realty" })).toBe(false);
    expect(canViewPmWorkload({ email: null })).toBe(false);
    expect(canViewPmWorkload({})).toBe(false);
  });

  it("rejects a restricted Workload request at the server boundary", async () => {
    const caller = pmRouter.createCaller({
      user: { id: 999_999, role: "admin", email: "other@savvy.realty" },
    } as any);
    await expect(caller.workload.get()).rejects.toThrow(
      "The Projects Workload tab is restricted to designated team leaders."
    );
  });
});
