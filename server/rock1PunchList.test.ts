/**
 * Rock 1, Milestone 1 punch list fixes: pro-forma auto-save on leaving the
 * page, the pro-forma numbers button with nothing linked, the Zillow paste
 * box, the featured order tie-break, and the case study property search.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { proformaSnapshot } from "../client/src/lib/proformaSnapshot";

const read = (file: string) => readFileSync(path.resolve(__dirname, "..", file), "utf8");
const proformaPage = read("client/src/pages/ProformaPage.tsx");
const websiteTab = read("client/src/components/website/PropertyWebsiteTab.tsx");
const contentEditor = read("client/src/components/website/ContentEditor.tsx");
const websiteRouter = read("server/routers/website.ts");

describe("pro-forma auto-save", () => {
  it("treats a rename alone as a change", () => {
    const form = { purchasePrice: "500000" };
    expect(proformaSnapshot(form, "25% down")).not.toBe(proformaSnapshot(form, "30% down"));
    expect(proformaSnapshot(form, "25% down")).toBe(proformaSnapshot({ purchasePrice: "500000" }, "25% down"));
    expect(proformaPage).toContain("onChange={e => { hasDirtyChanges.current = true; setTitle(e.target.value); }}");
  });

  it("saves straight away on leaving the page instead of dropping the last 2 seconds", () => {
    expect(proformaPage).toContain('document.addEventListener("visibilitychange", onHidden)');
    expect(proformaPage).toContain('window.addEventListener("beforeunload", onBeforeUnload)');
    expect(proformaPage).toMatch(/mountedRef\.current = false;\s*flushAutoSave\(\);/);
  });

  it("never creates a second row for a new pro-forma, and a refresh reopens it", () => {
    expect(proformaPage).toContain("editingIdRef.current = result.id;");
    expect(proformaPage).toContain("proforma?load=${result.id}`, { replace: true }");
  });

  it("keeps edits typed during a save marked unsaved, and says when a save fails", () => {
    expect(proformaPage).not.toContain("hasDirtyChanges.current = false;\n    } catch (e) { console.error");
    expect(proformaPage).toContain("hasDirtyChanges.current = proformaSnapshot(formRef.current, titleRef.current) !== snapshot;");
    expect(proformaPage).toContain('toast.error("Auto-save failed.');
  });

  it("refreshes the Website tab's pro-forma list after a save", () => {
    expect(proformaPage).toContain("utils.website.propertyWebsiteContent.invalidate({ propertyId })");
  });
});

describe("Use the pro-forma numbers with nothing linked", () => {
  const hint = websiteTab.slice(websiteTab.indexOf("function ProformaNumbersHint"));
  it("still shows the button, disabled, with what to do first", () => {
    expect(hint).not.toContain("if (!proforma) return null;");
    expect(hint).toContain("Link a pro-forma above first");
    expect(hint).toContain("This property has no pro-forma yet.");
    expect(hint).toContain("/proforma?new=true");
  });
});

describe("Import from Zillow paste box", () => {
  it("stays open while the link is typed", () => {
    expect(websiteTab).not.toContain("zillowPasteOpen && !zillowLink.trim()");
    expect(websiteTab).toContain("disabled={!draft.sourceUrl.trim() || importZillow.isPending}");
  });
});

describe("homepage featured order", () => {
  it("breaks ties by id so the order is stable", () => {
    expect(websiteRouter).toContain(
      "desc(websiteFeaturedListings.featuredAt), desc(websiteProperties.publishedAt), desc(websiteProperties.id)"
    );
  });
});

describe("case study property search", () => {
  it("matches every typed word across address, city, state and zip", () => {
    expect(contentEditor).toContain("words.every(word => haystack.includes(word))");
    expect(websiteRouter).toMatch(/city: properties\.city,\s*state: properties\.state,\s*zip: properties\.zip,/);
  });
});
