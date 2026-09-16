import { describe, expect, it } from "vitest";

import { RESERVED_PAGE_SLUGS } from "./website";

/**
 * The public router matches its built-in routes before falling through to CMS
 * pages. A page saved at one of those addresses would save cleanly, show as
 * published in the studio, and never appear on the site. That is the worst
 * shape a bug can take: everything says it worked.
 */
describe("reserved page addresses", () => {
  it("covers every address the public site serves from code", () => {
    for (const slug of [
      "properties",
      "agents",
      "case-studies",
      "resources",
      "about",
      "contact",
      "markets",
    ]) {
      expect(RESERVED_PAGE_SLUGS.has(slug)).toBe(true);
    }
  });

  it("covers the investor account addresses too", () => {
    for (const slug of [
      "sign-in",
      "sign-up",
      "forgot-password",
      "reset-password",
      "account",
    ]) {
      expect(RESERVED_PAGE_SLUGS.has(slug)).toBe(true);
    }
  });

  it("leaves ordinary page addresses free", () => {
    for (const slug of [
      "join-the-team",
      "faq",
      "privacy",
      "terms",
      "how-it-works",
    ]) {
      expect(RESERVED_PAGE_SLUGS.has(slug)).toBe(false);
    }
  });
});
