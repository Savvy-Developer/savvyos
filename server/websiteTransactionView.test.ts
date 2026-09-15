import { describe, expect, it } from "vitest";

import {
  NEVER_SHARED_TRANSACTION_FIELDS,
  buyerVisibleTransaction,
  transactionSteps,
} from "./websiteTransactionView";

const contractDate = new Date("2026-08-01T00:00:00Z");
const closingDate = new Date("2026-09-30T00:00:00Z");

const row = {
  id: 501,
  transactionType: "buyer" as const,
  status: "under_contract" as const,
  propertyAddressSnapshot: "88 Creekside Lane, Gatlinburg, TN",
  address: "88 Creekside Ln",
  purchasePrice: "725000.00",
  contractDate,
  closingDate,
  agentName: "Casey Rivers",
  agentEmail: "casey@savvy.realty",
  agentPhone: "+18655551234",
  agentImageUrl: "https://example.com/casey.jpg",
  agentSlug: "casey-rivers",
};

describe("buyerVisibleTransaction", () => {
  it("shares the deal the client is actually in", () => {
    const view = buyerVisibleTransaction(row);
    expect(view.id).toBe(501);
    expect(view.side).toBe("purchase");
    expect(view.status).toBe("under_contract");
    expect(view.statusLabel).toBe("Under contract");
    expect(view.propertyAddress).toBe("88 Creekside Lane, Gatlinburg, TN");
    expect(view.purchasePrice).toBe("725000.00");
    expect(view.agent.name).toBe("Casey Rivers");
  });

  /**
   * The test that actually does the protecting. A row is handed in carrying
   * every confidential column on the transactions table, and the whole output
   * is searched for them, values included, not just the top-level keys. If
   * somebody widens the projection, this says which field escaped.
   */
  it("never carries a confidential field, at any depth", () => {
    const leaky = {
      ...row,
      grossCommissionIncome: "21750.00",
      commissionRate: "0.0300",
      commissionType: "percentage",
      buyerCommissionRate: "0.0250",
      buyerCommissionType: "percentage",
      referralSourceName: "Partner Brokerage LLC",
      referralPayoutPct: "25.00",
      referralId: 77,
      payoutIntegrityFlag: true,
      payoutIntegrityNote: "Split disputed, do not pay yet",
      terminationReason: "Buyer got cold feet after inspection",
      notes: "Client is slow to respond, chase twice a week",
      buyerNotes: "Pre-approval looked shaky",
      transactionNumber: "TR-2026-0501",
      transactionLeadSourceId: 12,
      agentId: 9,
      primaryContactId: 4242,
      sellerContactId: 4243,
      buyerContactId: 4242,
    };

    const view = buyerVisibleTransaction(leaky as any);
    const serialized = JSON.stringify(view);

    for (const field of NEVER_SHARED_TRANSACTION_FIELDS) {
      expect(view).not.toHaveProperty(field);
    }
    for (const secret of [
      "21750.00",
      "Partner Brokerage LLC",
      "Split disputed, do not pay yet",
      "Buyer got cold feet after inspection",
      "Client is slow to respond, chase twice a week",
      "Pre-approval looked shaky",
      "TR-2026-0501",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("prefers the address on the paperwork over a later property edit", () => {
    const view = buyerVisibleTransaction({
      ...row,
      propertyAddressSnapshot: "88 Creekside Lane, Gatlinburg, TN",
      address: "88 Creekside Lane UNIT B",
    });
    expect(view.propertyAddress).toBe("88 Creekside Lane, Gatlinburg, TN");
  });

  it("falls back to the property address when no snapshot was taken", () => {
    const view = buyerVisibleTransaction({
      ...row,
      propertyAddressSnapshot: null,
    });
    expect(view.propertyAddress).toBe("88 Creekside Ln");
  });

  it("reads a dual-agency deal as a purchase from the buyer's seat", () => {
    expect(buyerVisibleTransaction({ ...row, transactionType: "dual" }).side).toBe(
      "purchase"
    );
  });

  it("reads a listing as a sale", () => {
    expect(
      buyerVisibleTransaction({ ...row, transactionType: "seller" }).side
    ).toBe("sale");
  });
});

describe("transactionSteps", () => {
  it("puts a live deal at the closing step", () => {
    const steps = transactionSteps("under_contract", contractDate, closingDate);
    expect(steps.map(s => s.state)).toEqual(["done", "current", "upcoming"]);
    expect(steps[1].label).toBe("Closing expected");
    expect(steps[1].date).toBe(closingDate);
    expect(steps[2].date).toBeNull();
  });

  it("completes every step once closed", () => {
    const steps = transactionSteps("closed", contractDate, closingDate);
    expect(steps.every(s => s.state === "done")).toBe(true);
    expect(steps[2].date).toBe(closingDate);
  });

  it("stops a terminated deal rather than implying more is coming", () => {
    const steps = transactionSteps("terminated", contractDate, closingDate);
    expect(steps).toHaveLength(2);
    expect(steps[1].state).toBe("stopped");
    expect(steps[1].label).toBe("Did not close");
  });

  it("says nothing about why a deal ended", () => {
    const view = buyerVisibleTransaction({
      ...row,
      status: "terminated",
      terminationReason: "Buyer got cold feet after inspection",
    } as any);
    expect(view.statusLabel).toBe("Did not close");
    expect(JSON.stringify(view)).not.toContain("cold feet");
  });

  it("copes with a deal that has no dates on it yet", () => {
    const steps = transactionSteps("under_contract", null, null);
    expect(steps[0].date).toBeNull();
    expect(steps[1].date).toBeNull();
    expect(steps.map(s => s.state)).toEqual(["done", "current", "upcoming"]);
  });
});
