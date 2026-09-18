import { describe, expect, it } from "vitest";
import type { User } from "../../drizzle/schema";
import {
  hasSensitiveUserFields,
  SENSITIVE_USER_FIELDS,
  stripSensitiveUserFields,
  toAdminUser,
  toProfileUser,
  toSessionUser,
  toUserListItem,
} from "./userResponse";

function makeUser(): User {
  return {
    id: 7,
    openId: "internal-oauth-subject",
    name: "Taylor Agent",
    email: "taylor@example.com",
    phone: "828-555-0100",
    title: "Agent",
    reportsToId: 2,
    ptoDepartmentId: 4,
    marketProfileId: 9,
    loginMethod: "manual",
    personType: "full_user",
    employmentType: "1099",
    role: "agent",
    commissionSplit: 80,
    callBookingLink: "https://cal.example.com/taylor",
    isActive: true,
    allowHiddenNav: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    lastSignedIn: new Date("2026-01-03T00:00:00.000Z"),
    passwordHash: "bcrypt-hash",
    passwordResetToken: "active-reset-token",
    passwordResetExpiry: new Date("2026-01-04T00:00:00.000Z"),
  };
}

describe("user API response security", () => {
  it("uses explicit allow-lists for each user response shape", () => {
    const user = makeUser();
    const responses = [
      toSessionUser(user),
      toUserListItem(user),
      toProfileUser(user),
      toAdminUser(user),
    ];

    for (const response of responses) {
      expect(hasSensitiveUserFields(response)).toBe(false);
      for (const field of SENSITIVE_USER_FIELDS) {
        expect(response).not.toHaveProperty(field);
      }
    }

    expect(toSessionUser(user)).not.toHaveProperty("openId");
    expect(toUserListItem(user)).not.toHaveProperty("commissionSplit");
    expect(toUserListItem(user)).not.toHaveProperty("employmentType");
  });

  it("removes sensitive fields anywhere in a nested response without mutating the source", () => {
    const user = makeUser();
    const response = {
      currentUser: user,
      simulation: {
        realUser: user,
        rows: [{ member: { id: 1 }, user }],
      },
    };

    const sanitized = stripSensitiveUserFields(response);

    expect(hasSensitiveUserFields(sanitized)).toBe(false);
    expect(hasSensitiveUserFields(response)).toBe(true);
    expect(response.currentUser.passwordResetToken).toBe("active-reset-token");
  });
});
