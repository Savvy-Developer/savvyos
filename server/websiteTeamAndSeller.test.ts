import { describe, expect, it } from "vitest";

import {
  normalizeTeamMember,
  publishedTeam,
  safeImageUrl,
  safeWebUrl,
  teamInitials,
} from "@shared/websiteTeam";
import {
  SELLER_REQUIRED,
  buildSellerMessage,
  canSubmitSeller,
  emptySellerValues,
  validateSeller,
  validateSellerField,
} from "@shared/websiteSellerLead";

describe("team members", () => {
  it("drops a row with no name instead of showing a nameless card", () => {
    expect(normalizeTeamMember({ name: "   ", title: "Founder" })).toBeNull();
    expect(normalizeTeamMember(null)).toBeNull();
    expect(normalizeTeamMember("Tyler")).toBeNull();
  });

  it("never fills in a title, bio or photo that was not given", () => {
    const row = normalizeTeamMember({ name: "Dyl Renken" })!;
    expect(row).toEqual({
      name: "Dyl Renken",
      title: null,
      bio: null,
      imageUrl: null,
      email: null,
      linkedinUrl: null,
      status: "draft",
      sortOrder: 0,
    });
  });

  it("only links to real web addresses", () => {
    expect(safeWebUrl("https://linkedin.com/in/someone")).toBe("https://linkedin.com/in/someone");
    expect(safeWebUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebUrl("linkedin.com/in/someone")).toBeNull();
    expect(safeImageUrl("/uploads/a.jpg")).toBe("/uploads/a.jpg");
    expect(safeImageUrl("//evil.example/a.jpg")).toBeNull();
    expect(safeImageUrl("data:image/png;base64,xx")).toBeNull();
  });

  it("shows published rows only, in the Studio order", () => {
    const rows = publishedTeam([
      { name: "B", status: "published", sortOrder: 2 },
      { name: "A", status: "draft", sortOrder: 0 },
      { name: "C", status: "published", sortOrder: 1 },
      { name: "D", status: "archived", sortOrder: 0 },
      { name: "", status: "published", sortOrder: 0 },
    ]);
    expect(rows.map(row => row.name)).toEqual(["C", "B"]);
    expect(publishedTeam(undefined)).toEqual([]);
  });

  it("makes initials for a card with no photo", () => {
    expect(teamInitials("Tyler Coon")).toBe("TC");
    expect(teamInitials("Elana")).toBe("E");
    expect(teamInitials("  mary  ann   lee ")).toBe("ML");
  });
});

describe("seller form", () => {
  const filled = {
    ...emptySellerValues(),
    firstName: "Sam",
    lastName: "Seller",
    email: "sam@example.com",
    phone: "(828) 555-0100",
    address: "412 Gulf Shore Dr, Destin, FL 32541",
    timeline: "In the next 3 months",
  };

  it("needs all six required answers", () => {
    expect(canSubmitSeller(filled)).toBe(true);
    expect(Object.keys(validateSeller(emptySellerValues())).sort()).toEqual(
      [...SELLER_REQUIRED].sort()
    );
  });

  it("asks for a street number or ZIP, not just a city", () => {
    expect(validateSellerField("address", { ...filled, address: "Destin" })).toBe(
      "Add the street number or ZIP code"
    );
    expect(validateSellerField("address", { ...filled, address: "Gulf Shore Dr 32541" })).toBeNull();
  });

  it("checks the phone and email look real", () => {
    expect(validateSellerField("phone", { ...filled, phone: "555-01" })).toBe("Check the phone number");
    expect(validateSellerField("email", { ...filled, email: "sam@" })).toBe("Check the email address");
  });

  it("writes the answers as lines, leaving blank optional ones out", () => {
    const message = buildSellerMessage({ ...filled, revenue: "$82k", message: "Has a hot tub." });
    expect(message).toBe(
      [
        "Seller inquiry from the website Sell page",
        "Property: 412 Gulf Shore Dr, Destin, FL 32541",
        "Timeline: In the next 3 months",
        "Last 12 months revenue: $82k",
        "",
        "Has a hot tub.",
      ].join("\n")
    );
    expect(message).not.toContain("Bedrooms");
  });

  it("stays inside the lead message limit", () => {
    expect(buildSellerMessage({ ...filled, message: "x".repeat(5000) }).length).toBe(4000);
  });
});
