import { describe, expect, it } from "vitest";
import {
  dependentPermissionKeys,
  enforcePagePermissionDependencies,
  parentPagePermissionKey,
} from "./permissionDependencies";

const definitions = [
  { key: "canViewReferrals" },
  { key: "canCreateReferrals" },
  { key: "canEditReferrals" },
  { key: "canViewReferralFinancials" },
  { key: "canViewProperties" },
  { key: "canManageWebsiteProperties" },
];

describe("page permission dependencies", () => {
  it("identifies the explicit capabilities owned by View Referrals", () => {
    expect(dependentPermissionKeys("canViewReferrals", definitions)).toEqual([
      "canCreateReferrals",
      "canEditReferrals",
      "canViewReferralFinancials",
    ]);
  });

  it("revokes referral capabilities when View Referrals is disabled", () => {
    expect(
      enforcePagePermissionDependencies(
        {
          canViewReferrals: false,
          canCreateReferrals: true,
          canEditReferrals: true,
          canViewReferralFinancials: true,
        },
        definitions
      )
    ).toMatchObject({
      canViewReferrals: false,
      canCreateReferrals: false,
      canEditReferrals: false,
      canViewReferralFinancials: false,
    });
  });

  it("identifies the parent page for a dependent capability", () => {
    expect(parentPagePermissionKey("canEditReferrals")).toBe(
      "canViewReferrals"
    );
  });

  it("does not confuse internal Properties with Website Properties", () => {
    expect(dependentPermissionKeys("canViewProperties", definitions)).toEqual(
      []
    );
    expect(
      enforcePagePermissionDependencies(
        {
          canViewProperties: false,
          canManageWebsiteProperties: true,
        },
        definitions
      )
    ).toMatchObject({
      canViewProperties: false,
      canManageWebsiteProperties: true,
    });
  });
});
