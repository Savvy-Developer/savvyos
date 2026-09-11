import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { proformaMetrics } from "./website";

/**
 * The website content editor now lives on the property page, where the author
 * can attach a saved pro-forma instead of retyping its numbers. The rule that
 * decides what actually gets stored is "blank inherits, typed wins", and it is
 * the one piece of that save worth pinning down: get it wrong in one direction
 * and an author cannot override a single figure, get it wrong in the other and
 * attaching a pro-forma does nothing.
 */
const proforma = {
  grossRevenue: "84000.00",
  cashOnCash: "0.1120",
  capRate: "0.0680",
};

describe("proformaMetrics", () => {
  it("fills every blank field from the pro-forma", () => {
    expect(
      proformaMetrics(
        { projectedRevenue: null, cashOnCash: null, capRate: null },
        proforma
      )
    ).toEqual({
      projectedRevenue: "84000.00",
      cashOnCash: "0.1120",
      capRate: "0.0680",
    });
  });

  it("keeps a number the author actually entered", () => {
    expect(
      proformaMetrics(
        { projectedRevenue: 91000, cashOnCash: null, capRate: null },
        proforma
      )
    ).toEqual({
      projectedRevenue: "91000",
      cashOnCash: "0.1120",
      capRate: "0.0680",
    });
  });

  it("lets the author override every field at once", () => {
    expect(
      proformaMetrics(
        { projectedRevenue: 91000, cashOnCash: 0.09, capRate: 0.05 },
        proforma
      )
    ).toEqual({
      projectedRevenue: "91000",
      cashOnCash: "0.09",
      capRate: "0.05",
    });
  });

  it("treats zero as a real entry, not a blank", () => {
    // Zero occupancy or a zero return is a claim the author is making. If this
    // fell through to the pro-forma, a deliberate 0 would silently become the
    // pro-forma's number.
    expect(
      proformaMetrics(
        { projectedRevenue: 0, cashOnCash: 0, capRate: 0 },
        proforma
      )
    ).toEqual({
      projectedRevenue: "0",
      cashOnCash: "0",
      capRate: "0",
    });
  });

  it("stores only what was entered when no pro-forma is attached", () => {
    expect(
      proformaMetrics({ projectedRevenue: 72000, cashOnCash: null, capRate: null }, null)
    ).toEqual({
      projectedRevenue: "72000",
      cashOnCash: null,
      capRate: null,
    });
  });

  it("treats a missing field the same as an explicit null", () => {
    // The input arrives from zod, where an optional field can be absent rather
    // than null. Both mean "the author left it blank".
    expect(proformaMetrics({}, proforma)).toEqual({
      projectedRevenue: "84000.00",
      cashOnCash: "0.1120",
      capRate: "0.0680",
    });
  });

  it("leaves a blank field blank when the pro-forma has no value either", () => {
    expect(
      proformaMetrics({}, { grossRevenue: null, cashOnCash: null, capRate: null })
    ).toEqual({
      projectedRevenue: null,
      cashOnCash: null,
      capRate: null,
    });
  });
});
