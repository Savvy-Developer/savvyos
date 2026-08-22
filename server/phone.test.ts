import { describe, expect, it } from "vitest";
import {
  formatUsPhone,
  formatUsPhoneInput,
  isValidOptionalUsPhone,
  normalizeOptionalUsPhone,
  normalizePhoneFields,
} from "@shared/phone";

describe("canonical U.S. phone handling", () => {
  it("normalizes common ten-digit and country-code-prefixed input", () => {
    expect(normalizeOptionalUsPhone("5551234567")).toBe("(555) 123-4567");
    expect(normalizeOptionalUsPhone("+1 555.123.4567")).toBe("(555) 123-4567");
    expect(normalizeOptionalUsPhone("(555) 123-4567")).toBe("(555) 123-4567");
  });

  it("returns null for blank optional values and rejects malformed populated values", () => {
    expect(normalizeOptionalUsPhone("  ")).toBeNull();
    expect(isValidOptionalUsPhone("")).toBe(true);
    expect(isValidOptionalUsPhone("555123456")).toBe(false);
    expect(isValidOptionalUsPhone("+44 20 7946 0958")).toBe(false);
    expect(() => normalizeOptionalUsPhone("555123456")).toThrow("exactly 10 digits");
  });

  it("formats as the user types or pastes", () => {
    expect(formatUsPhoneInput("555")).toBe("555");
    expect(formatUsPhoneInput("55512")).toBe("(555) 12");
    expect(formatUsPhoneInput("5551234567")).toBe("(555) 123-4567");
    expect(formatUsPhoneInput("+1 (555) 123-4567")).toBe("(555) 123-4567");
  });

  it("formats valid stored values for display without obscuring noncanonical legacy data", () => {
    expect(formatUsPhone("15551234567")).toBe("(555) 123-4567");
    expect(formatUsPhone("5551234567")).toBe("(555) 123-4567");
    expect(formatUsPhone("unusable legacy value")).toBe("unusable legacy value");
  });

  it("normalizes only declared phone fields in persistence payloads", () => {
    expect(normalizePhoneFields({ phone: "5551234567", firstName: "Taylor" }, ["phone"])).toEqual({
      phone: "(555) 123-4567",
      firstName: "Taylor",
    });
    expect(normalizePhoneFields({ phone: undefined, email: "taylor@example.com" }, ["phone"])).toEqual({
      phone: undefined,
      email: "taylor@example.com",
    });
  });
});
