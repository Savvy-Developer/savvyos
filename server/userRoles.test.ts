import { describe, expect, it } from "vitest";
import {
  canManageUserRoles,
  normalizeUserRoles,
  validateRoleSelection,
} from "./userRoles";

describe("multi-role management", () => {
  it("allows only Tyler and Elana to manage additional roles", () => {
    expect(
      canManageUserRoles({ role: "admin", email: "tyler@savvy.realty" })
    ).toBe(true);
    expect(
      canManageUserRoles({ role: "admin", email: "elana@savvy.realty" })
    ).toBe(true);
    expect(
      canManageUserRoles({ role: "admin", email: "dyl@savvy.realty" })
    ).toBe(false);
    expect(
      canManageUserRoles({ role: "isa", email: "tyler@savvy.realty" })
    ).toBe(false);
  });

  it("never infers a role or default workspace", () => {
    expect(() => validateRoleSelection(undefined, [])).toThrow(
      "Select at least one role."
    );
    expect(() => validateRoleSelection(undefined, ["admin"])).toThrow(
      "Select a default workspace role."
    );
    expect(() => validateRoleSelection("isa", ["admin"])).toThrow(
      "must be one of the selected roles"
    );
  });

  it("retains only roles selected by the caller", () => {
    expect(normalizeUserRoles(["admin", "isa", "admin"])).toEqual([
      "admin",
      "isa",
    ]);
    expect(validateRoleSelection("admin", ["admin", "isa"])).toEqual([
      "admin",
      "isa",
    ]);
  });
});
