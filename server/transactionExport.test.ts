import { describe, expect, it } from "vitest";
import {
  buildTransactionCsv,
  buildTransactionExportFilterSummary,
  escapeCsvCell,
  TRANSACTION_EXPORT_COLUMNS,
} from "./transactionExport";

describe("transaction export CSV", () => {
  it("escapes quotes and protects spreadsheet formulas", () => {
    expect(escapeCsvCell('Smith, "Jane"')).toBe('"Smith, ""Jane"""');
    expect(escapeCsvCell("=HYPERLINK(\"https://example.com\")")).toBe('"\'=HYPERLINK(""https://example.com"")"');
    expect(escapeCsvCell("  +1-555-0100")).toBe('"\'  +1-555-0100"');
  });

  it("serializes all configured columns and transaction values", () => {
    const csv = buildTransactionCsv([{
      transaction: {
        id: 42,
        transactionNumber: "TXN-42",
        status: "closed",
        transactionType: "buyer",
        purchasePrice: "500000.00",
        grossCommissionIncome: "15000.00",
        commissionRate: "0.0300",
        commissionType: "percentage",
        contractDate: new Date("2026-01-02T12:00:00.000Z"),
        closingDate: new Date("2026-02-03T12:00:00.000Z"),
        payoutIntegrityFlag: false,
        referralPayoutPct: "10.00",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-03T00:00:00.000Z"),
      },
      agent: { name: "Alex Agent", email: "alex@example.com" },
      contact: { firstName: "Jamie", lastName: "Buyer", email: "jamie@example.com", phone: "555-0100" },
      property: { address: "123 Main St", city: "Asheville", state: "NC", zip: "28801" },
      leadSource: { id: 2, name: "Partner", parentId: 1 },
      parentLeadSource: { id: 1, name: "Referral" },
    }]);

    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split(",")).toHaveLength(TRANSACTION_EXPORT_COLUMNS.length);
    expect(lines[1]).toContain('"TXN-42"');
    expect(lines[1]).toContain('"3.00"');
    expect(lines[1]).toContain('"Referral"');
    expect(lines[1]).toContain('"Partner"');
  });
});

describe("transaction export filter summary", () => {
  it("returns an all-records label when no filters are active", () => {
    expect(buildTransactionExportFilterSummary({})).toBe("All transactions");
  });

  it("describes named and date filters for the audit trail", () => {
    const summary = buildTransactionExportFilterSummary({
      status: "under_contract",
      agentId: 7,
      marketId: 3,
      closingDateFrom: "2026-01-01",
      closingDateTo: "2026-03-31",
      flagPayoutIntegrity: true,
    }, {
      agentName: "Alex Agent",
      marketName: "Asheville",
    });

    expect(summary).toContain("Status: Under Contract");
    expect(summary).toContain("Agent: Alex Agent");
    expect(summary).toContain("Market: Asheville");
    expect(summary).toContain("Closing date: 2026-01-01 to 2026-03-31");
    expect(summary).toContain("Payout integrity issue");
  });
});
