import { describe, expect, it } from "vitest";
import {
  CONTACT_FORM_TOKEN,
  EDITABLE_BUILT_IN_PAGES,
  EDITABLE_BUILT_IN_SLUGS,
  EDITABLE_LIST_PAGES,
  EDITABLE_PAGE_SLUGS,
  editableBuiltInPage,
  editableListPage,
  listPageHeading,
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

describe("editable list page headings", () => {
  it("covers the five list pages, all of them real site addresses", () => {
    expect(EDITABLE_LIST_PAGES.map(page => page.slug).sort()).toEqual([
      "agents",
      "case-studies",
      "markets",
      "properties",
      "resources",
    ]);
    for (const page of EDITABLE_LIST_PAGES) {
      expect(RESERVED_PAGE_SLUGS.has(page.slug)).toBe(true);
      expect(EDITABLE_PAGE_SLUGS.has(page.slug)).toBe(true);
      expect(page.starter.heroTitle.length).toBeGreaterThan(0);
    }
    expect(EDITABLE_PAGE_SLUGS.has("about")).toBe(true);
  });

  it("shows the designed wording when nothing is published", () => {
    const starter = editableListPage("properties")!.starter;
    expect(listPageHeading(starter, null)).toEqual(starter);
  });

  it("uses the published wording, falling back field by field", () => {
    const starter = editableListPage("properties")!.starter;
    const heading = listPageHeading(starter, {
      heroEyebrow: "  New this week ",
      heroTitle: "STR homes for sale",
      heroSubtitle: "   ",
      metaTitle: null,
    });
    expect(heading.heroEyebrow).toBe("New this week");
    expect(heading.heroTitle).toBe("STR homes for sale");
    expect(heading.heroSubtitle).toBe(starter.heroSubtitle);
    expect(heading.metaTitle).toBe(starter.metaTitle);
  });

  it("hides the small top line when a published version clears it", () => {
    const starter = editableListPage("agents")!.starter;
    expect(listPageHeading(starter, { heroEyebrow: "", heroTitle: "Agents" }).heroEyebrow).toBe("");
  });
});
