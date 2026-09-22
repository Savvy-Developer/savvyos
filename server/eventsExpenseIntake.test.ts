import { afterEach, describe, expect, it } from "vitest";
import { categorizeExpenseInvoice } from "./eventsExpenseIntake";

describe("categorizeExpenseInvoice", () => {
  it("classifies extractable catering invoices and captures labeled totals", () => {
    const result = categorizeExpenseInvoice(
      "Tin-Kitchen-invoice.pdf",
      "Tin Kitchen Catering\nInvoice Date: Oct 5, 2026\nTotal Due: $12,450.00"
    );

    expect(result.category).toBe("Food & beverage");
    expect(result.amount).toBe(12450);
    expect(result.expenseDate).toBe("2026-10-05");
    expect(result.description).toContain("Tin Kitchen Catering");
  });

  it("uses filename cues without inventing an amount", () => {
    const result = categorizeExpenseInvoice("Savvy-Summit-AV-invoice.png");

    expect(result.category).toBe("Production & A/V");
    expect(result.amount).toBeNull();
    expect(result.categorizationNote).toContain("filename");
  });

  describe("invoice date in any time zone", () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    // East of UTC is where toISOString() used to move the date back a day.
    for (const tz of ["Asia/Kolkata", "America/New_York", "UTC", "Pacific/Auckland"]) {
      it(`keeps the printed date in ${tz}`, () => {
        process.env.TZ = tz;
        expect(
          categorizeExpenseInvoice("invoice.pdf", "Invoice Date: Oct 5, 2026").expenseDate
        ).toBe("2026-10-05");
        expect(
          categorizeExpenseInvoice("invoice.pdf", "Invoice Date: 1/31/2026").expenseDate
        ).toBe("2026-01-31");
      });
    }
  });
});
