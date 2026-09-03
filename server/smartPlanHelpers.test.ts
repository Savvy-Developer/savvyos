import { describe, expect, it } from "vitest";
import {
  extractOfferSheetReferralPropertyAddress,
  isOfferSheetReferralPlan,
  OFFER_SHEET_REFERRAL_PLAN_NAME,
  OFFER_SHEET_REFERRAL_SOURCE_NAME,
} from "./smartPlanPropertyContext";
import {
  DEFAULT_SMART_PLAN_DELIVERY_WINDOW,
  isWithinSmartPlanSendWindow,
  LEGACY_BUSINESS_HOURS_WINDOW,
  nextSmartPlanSendWindowStart,
} from "./smartPlanScheduling";
import { compareSmartPlanStepsByTiming } from "./smartPlanStepOrder";
import { capabilitiesForPasswordShare, normalizePasswordShareGrant, sharedAccessLabel } from "./passwordListSharing";

describe("Offer Sheet referral property extraction", () => {
  it("extracts an address from the current no-space intake format", () => {
    const notes = `New referral property lead received:\nAddress of Interested Property184 Hyland Dr, East Stroudsburg, PA, 18301\nNameEric Eustice\nEmailericeustice@gmail.com\nPhone2482504658\nMessage:\nSubmitted2026-08-28T18:09:04.038Z`;
    expect(extractOfferSheetReferralPropertyAddress(notes)).toBe(
      "184 Hyland Dr, East Stroudsburg, PA, 18301"
    );
  });

  it("extracts an address from a spaced multiline intake format", () => {
    const notes = `System Note\nzapier: New referral property lead received:\nAddress of Interested Property 48308 River Park Drive, Index, WA, 98256\nName Jonathan Zilli\nEmail jrzilli@yahoo.com\nPhone 8055013432\nMessage Interested in this property.`;
    expect(extractOfferSheetReferralPropertyAddress(notes)).toBe(
      "48308 River Park Drive, Index, WA, 98256"
    );
  });

  it("does not infer an address from unrelated notes", () => {
    expect(
      extractOfferSheetReferralPropertyAddress(
        "Call client about an upcoming showing."
      )
    ).toBeNull();
  });

  it("limits property behavior to the requested plan and source", () => {
    expect(
      isOfferSheetReferralPlan(
        OFFER_SHEET_REFERRAL_PLAN_NAME,
        OFFER_SHEET_REFERRAL_SOURCE_NAME
      )
    ).toBe(true);
    expect(
      isOfferSheetReferralPlan(
        "Offer Sheet MM New Lead (Texts)",
        OFFER_SHEET_REFERRAL_SOURCE_NAME
      )
    ).toBe(false);
    expect(
      isOfferSheetReferralPlan(
        OFFER_SHEET_REFERRAL_PLAN_NAME,
        "The Offer Sheet Referral Campaign"
      )
    ).toBe(false);
  });
});

describe("Smart Plan send windows", () => {
  it("defaults plan delivery to Sunday–Saturday from 8 AM through 8 PM Eastern", () => {
    expect(DEFAULT_SMART_PLAN_DELIVERY_WINDOW).toEqual({
      days: [0, 1, 2, 3, 4, 5, 6],
      startHour: 8,
      endHour: 20,
      timezone: "America/New_York",
    });
    expect(isWithinSmartPlanSendWindow(new Date("2026-08-30T12:00:00.000Z"), DEFAULT_SMART_PLAN_DELIVERY_WINDOW)).toBe(true);
    expect(isWithinSmartPlanSendWindow(new Date("2026-08-30T00:00:00.000Z"), DEFAULT_SMART_PLAN_DELIVERY_WINDOW)).toBe(false);
  });

  it("retains the legacy Monday–Friday 9 AM–6 PM business-hours behavior", () => {
    expect(
      isWithinSmartPlanSendWindow(
        new Date("2026-08-28T17:00:00.000Z"),
        LEGACY_BUSINESS_HOURS_WINDOW
      )
    ).toBe(true);
    expect(
      isWithinSmartPlanSendWindow(
        new Date("2026-08-28T22:00:00.000Z"),
        LEGACY_BUSINESS_HOURS_WINDOW
      )
    ).toBe(false);
    expect(
      isWithinSmartPlanSendWindow(
        new Date("2026-08-29T15:00:00.000Z"),
        LEGACY_BUSINESS_HOURS_WINDOW
      )
    ).toBe(false);
  });

  it("supports custom weekend delivery days and times", () => {
    const weekendWindow = {
      days: [0, 6],
      startHour: 10,
      endHour: 14,
      timezone: "America/New_York",
    };
    expect(
      isWithinSmartPlanSendWindow(
        new Date("2026-08-29T15:00:00.000Z"),
        weekendWindow
      )
    ).toBe(true);
    expect(
      isWithinSmartPlanSendWindow(
        new Date("2026-08-31T15:00:00.000Z"),
        weekendWindow
      )
    ).toBe(false);
  });

  it("defers an after-hours delivery into the next valid configured window", () => {
    const next = nextSmartPlanSendWindowStart(
      new Date("2026-08-28T22:00:00.000Z"),
      LEGACY_BUSINESS_HOURS_WINDOW
    );
    expect(next.getTime()).toBeGreaterThan(
      new Date("2026-08-28T22:00:00.000Z").getTime()
    );
    expect(
      isWithinSmartPlanSendWindow(next, LEGACY_BUSINESS_HOURS_WINDOW)
    ).toBe(true);
  });
});

describe("Smart Plan timing order", () => {
  it("places shorter waits first and retains authored order for equal waits", () => {
    const steps = [
      { id: 30, stepOrder: 0, delayDays: 0, delayHours: 0 },
      { id: 31, stepOrder: 1, delayDays: 1, delayHours: 0 },
      { id: 40, stepOrder: 8, delayDays: 0, delayHours: 2 },
      { id: 32, stepOrder: 2, delayDays: 2, delayHours: 0 },
      { id: 33, stepOrder: 3, delayDays: 2, delayHours: 0 },
    ];
    expect([...steps].sort(compareSmartPlanStepsByTiming).map((step) => step.id)).toEqual([30, 40, 31, 32, 33]);
  });
});

describe("Password list share capabilities", () => {
  it("makes create and edit grants viewable without granting list management", () => {
    expect(normalizePasswordShareGrant({ userId: 7, canView: false, canCreate: true, canEdit: false })).toEqual({ userId: 7, canView: true, canCreate: true, canEdit: false });
    expect(capabilitiesForPasswordShare({ userId: 7, canView: false, canCreate: false, canEdit: true })).toEqual({ canView: true, canCreateEntries: false, canEditEntries: true });
    expect(sharedAccessLabel({ canView: true, canCreateEntries: true, canEditEntries: true })).toBe("Shared: view, create & edit");
  });
});
