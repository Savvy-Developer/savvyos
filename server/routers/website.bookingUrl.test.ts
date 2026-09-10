import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { normalizeBookingUrl } from "./website";

describe("normalizeBookingUrl", () => {
  it("fixes the real-world case that broke the button", () => {
    // Stored exactly like this in production, and rendered as a relative path.
    expect(normalizeBookingUrl("calendly.com/ana-savvy")).toBe(
      "https://calendly.com/ana-savvy"
    );
  });

  it("leaves an already absolute https link alone", () => {
    expect(normalizeBookingUrl("https://calendly.com/mollie-savvy")).toBe(
      "https://calendly.com/mollie-savvy"
    );
  });

  it("keeps http rather than silently upgrading it", () => {
    expect(normalizeBookingUrl("http://example.com/book")).toBe(
      "http://example.com/book"
    );
  });

  it("treats a protocol-relative link as https", () => {
    expect(normalizeBookingUrl("//calendly.com/x")).toBe("https://calendly.com/x");
  });

  it("preserves query strings, which carry booking prefills and tracking", () => {
    expect(normalizeBookingUrl("calendly.com/x?utm_source=site&name=A")).toBe(
      "https://calendly.com/x?utm_source=site&name=A"
    );
  });

  it("trims incidental whitespace", () => {
    expect(normalizeBookingUrl("  calendly.com/x  ")).toBe("https://calendly.com/x");
  });

  it.each([null, undefined, "", "   "])("returns null for %p", value => {
    expect(normalizeBookingUrl(value as any)).toBeNull();
  });

  // These render into an href, so a non-http scheme would run in the visitor's
  // browser. Reject rather than repair.
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("rejects %p instead of rewriting it", value => {
    expect(normalizeBookingUrl(value)).toBeNull();
  });

  it("rejects a bare word that is not a host", () => {
    expect(normalizeBookingUrl("book-with-me")).toBeNull();
  });
});
