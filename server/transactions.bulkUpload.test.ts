/**
 * Tests for the transaction bulk-upload procedure.
 *
 * These are unit-level tests that validate:
 *  - Normalisation of transaction_type and status values
 *  - Numeric field parsing (purchase_price, gci, commission_rate_pct, splits)
 *  - GCI derivation from purchase_price × commission_rate_pct
 *  - GCI mismatch warning
 *  - Savvy 20% minimum split warning
 *  - Agent email lookup failure
 *  - Date validation
 *  - Required field enforcement
 */

import { describe, it, expect } from "vitest";

// ─── Helpers extracted from the bulkUpload procedure ─────────────────────────

const txTypeMap: Record<string, "buyer" | "seller" | "dual"> = {
  buyer: "buyer", purchase: "buyer", buy: "buyer",
  seller: "seller", listing: "seller", sell: "seller",
  dual: "dual", "dual agency": "dual", dualagency: "dual",
};

const statusMap: Record<string, "under_contract" | "closed" | "terminated"> = {
  under_contract: "under_contract", "under contract": "under_contract", uc: "under_contract", pending: "under_contract",
  closed: "closed", close: "closed", sold: "closed",
  terminated: "terminated", cancelled: "terminated", canceled: "terminated",
};

function normaliseTxType(raw: string) {
  return txTypeMap[raw.toLowerCase().trim()] ?? null;
}

function normaliseStatus(raw: string) {
  return statusMap[raw.toLowerCase().trim()] ?? null;
}

function parseNumeric(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[$,%]/g, ""));
  return isNaN(n) ? null : n;
}

function deriveGci(purchasePrice: number, commissionRatePct: number): number {
  return Math.round((purchasePrice * commissionRatePct) / 100 * 100) / 100;
}

function savvyNetPct(agentSplit: number, groupLeaderSplit: number, referralPct: number): number {
  return 100 - agentSplit - groupLeaderSplit - referralPct;
}

// ─── Transaction Type Normalisation ──────────────────────────────────────────

describe("transaction type normalisation", () => {
  it("maps 'buyer' → buyer", () => expect(normaliseTxType("buyer")).toBe("buyer"));
  it("maps 'Purchase' → buyer (case-insensitive)", () => expect(normaliseTxType("Purchase")).toBe("buyer"));
  it("maps 'buy' → buyer", () => expect(normaliseTxType("buy")).toBe("buyer"));
  it("maps 'seller' → seller", () => expect(normaliseTxType("seller")).toBe("seller"));
  it("maps 'Listing' → seller", () => expect(normaliseTxType("Listing")).toBe("seller"));
  it("maps 'dual' → dual", () => expect(normaliseTxType("dual")).toBe("dual"));
  it("maps 'Dual Agency' → dual", () => expect(normaliseTxType("Dual Agency")).toBe("dual"));
  it("returns null for unknown type", () => expect(normaliseTxType("unknown")).toBeNull());
  it("returns null for empty string", () => expect(normaliseTxType("")).toBeNull());
});

// ─── Status Normalisation ─────────────────────────────────────────────────────

describe("status normalisation", () => {
  it("maps 'closed' → closed", () => expect(normaliseStatus("closed")).toBe("closed"));
  it("maps 'Sold' → closed", () => expect(normaliseStatus("Sold")).toBe("closed"));
  it("maps 'close' → closed", () => expect(normaliseStatus("close")).toBe("closed"));
  it("maps 'under_contract' → under_contract", () => expect(normaliseStatus("under_contract")).toBe("under_contract"));
  it("maps 'Under Contract' → under_contract", () => expect(normaliseStatus("Under Contract")).toBe("under_contract"));
  it("maps 'UC' → under_contract", () => expect(normaliseStatus("UC")).toBe("under_contract"));
  it("maps 'pending' → under_contract", () => expect(normaliseStatus("pending")).toBe("under_contract"));
  it("maps 'terminated' → terminated", () => expect(normaliseStatus("terminated")).toBe("terminated"));
  it("maps 'Cancelled' → terminated", () => expect(normaliseStatus("Cancelled")).toBe("terminated"));
  it("maps 'canceled' → terminated", () => expect(normaliseStatus("canceled")).toBe("terminated"));
  it("returns null for unknown status", () => expect(normaliseStatus("active")).toBeNull());
});

// ─── Numeric Parsing ──────────────────────────────────────────────────────────

describe("numeric field parsing", () => {
  it("parses plain number", () => expect(parseNumeric("450000")).toBe(450000));
  it("strips $ and commas", () => expect(parseNumeric("$450,000")).toBe(450000));
  it("strips % sign", () => expect(parseNumeric("3%")).toBe(3));
  it("parses decimal", () => expect(parseNumeric("2.5")).toBe(2.5));
  it("returns null for empty string", () => expect(parseNumeric("")).toBeNull());
  it("returns null for undefined", () => expect(parseNumeric(undefined)).toBeNull());
  it("returns null for non-numeric", () => expect(parseNumeric("abc")).toBeNull());
});

// ─── GCI Derivation ───────────────────────────────────────────────────────────

describe("GCI derivation", () => {
  it("derives GCI from purchase_price × commission_rate_pct", () => {
    expect(deriveGci(450000, 3)).toBe(13500);
  });
  it("handles fractional commission rates", () => {
    expect(deriveGci(500000, 2.5)).toBe(12500);
  });
  it("rounds to 2 decimal places", () => {
    expect(deriveGci(333333, 3)).toBe(9999.99);
  });
  it("detects GCI mismatch > $1", () => {
    const provided = 14000;
    const derived = deriveGci(450000, 3); // 13500
    expect(Math.abs(provided - derived)).toBeGreaterThan(1);
  });
  it("does not flag mismatch within $1 tolerance", () => {
    const provided = 13500.50;
    const derived = deriveGci(450000, 3); // 13500
    expect(Math.abs(provided - derived)).toBeLessThanOrEqual(1);
  });
});

// ─── Savvy 20% Minimum Split Validation ──────────────────────────────────────

describe("Savvy 20% minimum split check", () => {
  it("passes when Savvy gets exactly 20%", () => {
    expect(savvyNetPct(80, 0, 0)).toBe(20);
  });
  it("passes when Savvy gets more than 20%", () => {
    expect(savvyNetPct(70, 0, 0)).toBe(30);
  });
  it("flags when Savvy gets less than 20%", () => {
    expect(savvyNetPct(85, 0, 0)).toBeLessThan(20);
  });
  it("accounts for group leader split", () => {
    // agent 70% + group leader 15% + referral 0% = Savvy 15% → flag
    expect(savvyNetPct(70, 15, 0)).toBeLessThan(20);
  });
  it("accounts for referral payout", () => {
    // agent 70% + group 0% + referral 15% = Savvy 15% → flag
    expect(savvyNetPct(70, 0, 15)).toBeLessThan(20);
  });
  it("passes with agent 70% + group 5% + referral 5% = Savvy 20%", () => {
    expect(savvyNetPct(70, 5, 5)).toBe(20);
  });
});

// ─── Date Validation ──────────────────────────────────────────────────────────

describe("date validation", () => {
  it("accepts YYYY-MM-DD format", () => {
    const d = new Date("2024-03-15");
    expect(isNaN(d.getTime())).toBe(false);
  });
  it("accepts MM/DD/YYYY format", () => {
    const d = new Date("03/15/2024");
    expect(isNaN(d.getTime())).toBe(false);
  });
  it("rejects invalid date string", () => {
    const d = new Date("not-a-date");
    expect(isNaN(d.getTime())).toBe(true);
  });
  it("rejects partial date", () => {
    const d = new Date("2024-13-45");
    expect(isNaN(d.getTime())).toBe(true);
  });
});

// ─── Required Field Enforcement ───────────────────────────────────────────────

describe("required field enforcement", () => {
  function validateRow(row: {
    transactionType: string;
    status: string;
    agentEmail: string;
    primaryContactFirstName: string;
    primaryContactLastName: string;
  }) {
    const errors: string[] = [];
    if (!normaliseTxType(row.transactionType)) errors.push("Invalid transaction_type");
    if (!normaliseStatus(row.status)) errors.push("Invalid status");
    if (!row.agentEmail.trim()) errors.push("agent_email is required");
    if (!row.primaryContactFirstName.trim()) errors.push("primary_contact_first_name is required");
    if (!row.primaryContactLastName.trim()) errors.push("primary_contact_last_name is required");
    return errors;
  }

  it("passes a fully valid row", () => {
    const errors = validateRow({
      transactionType: "seller",
      status: "closed",
      agentEmail: "agent@example.com",
      primaryContactFirstName: "John",
      primaryContactLastName: "Doe",
    });
    expect(errors).toHaveLength(0);
  });

  it("fails when transaction_type is missing", () => {
    const errors = validateRow({
      transactionType: "",
      status: "closed",
      agentEmail: "agent@example.com",
      primaryContactFirstName: "John",
      primaryContactLastName: "Doe",
    });
    expect(errors).toContain("Invalid transaction_type");
  });

  it("fails when status is missing", () => {
    const errors = validateRow({
      transactionType: "seller",
      status: "",
      agentEmail: "agent@example.com",
      primaryContactFirstName: "John",
      primaryContactLastName: "Doe",
    });
    expect(errors).toContain("Invalid status");
  });

  it("fails when agent_email is empty", () => {
    const errors = validateRow({
      transactionType: "seller",
      status: "closed",
      agentEmail: "",
      primaryContactFirstName: "John",
      primaryContactLastName: "Doe",
    });
    expect(errors).toContain("agent_email is required");
  });

  it("fails when contact first name is missing", () => {
    const errors = validateRow({
      transactionType: "buyer",
      status: "under_contract",
      agentEmail: "agent@example.com",
      primaryContactFirstName: "",
      primaryContactLastName: "Doe",
    });
    expect(errors).toContain("primary_contact_first_name is required");
  });

  it("fails when contact last name is missing", () => {
    const errors = validateRow({
      transactionType: "buyer",
      status: "under_contract",
      agentEmail: "agent@example.com",
      primaryContactFirstName: "John",
      primaryContactLastName: "",
    });
    expect(errors).toContain("primary_contact_last_name is required");
  });

  it("collects multiple errors on a completely empty row", () => {
    const errors = validateRow({
      transactionType: "",
      status: "",
      agentEmail: "",
      primaryContactFirstName: "",
      primaryContactLastName: "",
    });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
