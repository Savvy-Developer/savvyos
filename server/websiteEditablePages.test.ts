import { describe, expect, it } from "vitest";
import {
  CONTACT_FORM_TOKEN,
  EDITABLE_BUILT_IN_PAGES,
  EDITABLE_BUILT_IN_SLUGS,
  editableBuiltInPage,
  splitOnContactForm,
} from "@shared/websiteEditablePages";
import { RESERVED_PAGE_SLUGS } from "./routers/website";

describe("editable site pages", () => {
  it("offers About, Contact and Join Our Team, and nothing that lists live records", () => {
    expect(Array.from(EDITABLE_BUILT_IN_SLUGS).sort()).toEqual(["about", "contact", "join-our-team"]);
    for (const slug of ["properties", "agents", "markets", "case-studies", "resources"]) {
      expect(EDITABLE_BUILT_IN_SLUGS.has(slug)).toBe(false);
    }
  });

  it("only covers pages that exist in code, so each one has a designed page to fall back to", () => {
    for (const page of EDITABLE_BUILT_IN_PAGES) {
      expect(RESERVED_PAGE_SLUGS.has(page.slug)).toBe(true);
      expect(page.starter.heroTitle.length).toBeGreaterThan(0);
      expect(page.starter.bodyMarkdown.length).toBeGreaterThan(0);
    }
  });

  it("starts the Contact page with the contact form in it", () => {
    expect(editableBuiltInPage("contact")!.starter.bodyMarkdown).toContain(CONTACT_FORM_TOKEN);
    expect(editableBuiltInPage("legal")).toBeNull();
  });
});

describe("splitOnContactForm", () => {
  it("splits around the token on its own line", () => {
    expect(splitOnContactForm("Before\n\n[[contact-form]]\n\nAfter")).toEqual(["Before\n\n", "\n\nAfter"]);
  });

  it("recognises the escaped form the rich text editor saves", () => {
    expect(splitOnContactForm("A\n\\[\\[contact-form\\]\\]\nB")).toHaveLength(2);
  });

  it("leaves the token alone inside a sentence, and a page without it whole", () => {
    expect(splitOnContactForm("Use [[contact-form]] to embed it.")).toHaveLength(1);
    expect(splitOnContactForm("No form here")).toEqual(["No form here"]);
  });
});
