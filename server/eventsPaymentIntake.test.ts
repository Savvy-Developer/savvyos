import { describe, expect, it } from "vitest";
import { extractSwoogoPaymentIntake } from "./eventsPaymentIntake";

describe("extractSwoogoPaymentIntake", () => {
  it("accepts a clear ACH registration and retains useful matching data", () => {
    expect(
      extractSwoogoPaymentIntake({
        type: "registrant.created",
        data: {
          event_id: "SW-89104",
          registrant_id: 12345,
          payment_method: "ACH bank transfer",
          total_due: "$5,000.00",
          company_name: "Ishita Interiors",
          first_name: "Ishita",
          last_name: "Patel",
          email: "ishita@example.com",
        },
      })
    ).toMatchObject({
      providerEventId: "SW-89104",
      registrantId: "12345",
      paymentMethod: "ach",
      amount: 5000,
      registrantName: "Ishita Patel",
      registrantEmail: "ishita@example.com",
      sponsorCandidates: ["Ishita Interiors", "Ishita Patel"],
    });
  });

  it("accepts wire transaction signals but rejects non-offline payment methods", () => {
    expect(
      extractSwoogoPaymentIntake({
        registrant: {
          event_id: "SW-89104",
          id: "wire-9",
          transaction_type: "wire_transfer_payment",
        },
      })?.paymentMethod
    ).toBe("wire");
    expect(
      extractSwoogoPaymentIntake({
        registrant: {
          event_id: "SW-89104",
          id: "card-9",
          payment_method: "credit card",
        },
      })
    ).toBeNull();
  });
});
