import { describe, expect, it } from "vitest";
import {
  ACCOUNTABILITY_CHART_INTAKE_SEATS,
  uniqueSeatByHolder,
} from "./accountabilityChartIntake";

describe("Accountability Chart intake", () => {
  const byKey = new Map(ACCOUNTABILITY_CHART_INTAKE_SEATS.map(seat => [seat.key, seat]));

  it("applies the requested reporting and holder corrections without Chief of Staff", () => {
    expect(byKey.get("director-marketing")?.holderAliases).toEqual([["Natalia"]]);
    expect(byKey.get("strategic-partnerships")?.title).toBe("Strategic Partnerships Manager");
    expect(byKey.get("strategic-partnerships")?.holderAliases).toEqual([["Morgan Loftus", "Morgan"]]);
    expect(byKey.get("director-operations")?.holderAliases).toEqual([["Dyl Renken", "Dyl"]]);
    expect(byKey.get("ea-to-ceo")?.title).toBe("EA to CEO");
    expect(byKey.get("eos")?.title).toBe("EOS");
    expect(byKey.get("office-manager")?.holderAliases).toEqual([["Dyl Renken", "Dyl"]]);
    expect(byKey.get("recruitment-va-ea")).toMatchObject({
      parentKey: "director-operations",
      holderAliases: [["Heart"]],
    });
    expect(ACCOUNTABILITY_CHART_INTAKE_SEATS.some(seat => /chief of staff/i.test(seat.title))).toBe(false);
  });

  it("marks an existing strategic-partnerships seat for rename rather than duplicating it", () => {
    expect(byKey.get("strategic-partnerships")?.aliases).toContain("Director of Strategic Partnerships");
    expect(byKey.get("director-operations")?.aliases).toContain("Sr. Director of Business Operations");
    expect(byKey.get("ea-to-ceo")?.aliases).toContain("EA to CEO (Tyler)");
    expect(byKey.get("eos")?.aliases).toContain("EOS Tool Owner");
  });

  it("links existing R&Rs only for holders with one Accountability seat", () => {
    const seatByHolder = uniqueSeatByHolder([
      { userId: 1, seatId: 101 },
      { userId: 2, seatId: 102 },
      { userId: 2, seatId: 103 },
      { userId: 3, seatId: 104 },
      { userId: 3, seatId: 104 },
    ]);

    expect(seatByHolder.get(1)).toBe(101);
    expect(seatByHolder.has(2)).toBe(false);
    expect(seatByHolder.get(3)).toBe(104);
  });
});
