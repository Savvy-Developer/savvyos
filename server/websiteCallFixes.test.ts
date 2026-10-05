/**
 * The website changes from the 1 Oct walkthrough with Tyler: Zillow import by
 * the summary, auto-save, the pro-forma numbers button, Write with AI, the
 * homepage featured order, the case study editor, agent cards on posts and
 * case studies, and address suggestions on the seller form.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { llmCalls } = vi.hoisted(() => ({ llmCalls: [] as any[] }));
// Only websiteSeoWriter reaches the model from this file's imports, and it uses
// invokeLLM alone; the rest of the module is kept so nothing else is disturbed.
vi.mock("./_core/llm", async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    invokeLLM: async (params: any) => {
      llmCalls.push(params);
      return {
        choices: [
          {
            message: {
              role: "assistant",
              content: '{"metaTitle": "3BR Gatlinburg Cabin", "metaDescription": "Three beds and a hot tub."}',
            },
          },
        ],
      };
    },
  };
});

import { extractZillowDescription } from "./externalApis";
import {
  CASE_EXCERPT_MAX,
  SEO_DESCRIPTION_MAX,
  allowSeoWrite,
  buildSeoMessages,
  fitTo,
  parseSeoAnswer,
  plainText,
  writeSeoText,
} from "./websiteSeoWriter";
import { WEBSITE_PUBLIC_TRPC_PATHS, allowAddressLookup } from "./routers/website";
import { WEBSITE_FEATURED_LISTINGS_BACKFILL, WEBSITE_FEATURED_LISTINGS_DDL } from "./websiteFeaturedSchema";

const root = path.resolve(import.meta.dirname, "..");
// Line endings are normalised: core.autocrlf checks these files out with CRLF
// on Windows, which would break every assertion that spans a line break.
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const router = read("server/routers/website.ts");
const websiteTab = read("client/src/components/website/PropertyWebsiteTab.tsx");
const editor = read("client/src/components/website/ContentEditor.tsx");
const publicSite = read("client/src/pages/PublicWebsite.tsx");
const section = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

describe("Import from Zillow beside the public summary", () => {
  it("reads the listing's own description, tidied", () => {
    expect(extractZillowDescription({ propertyDetails: { description: "  Lake views.\r\n\r\n\r\n\r\nHot   tub. " } })).toBe(
      "Lake views.\n\nHot tub."
    );
    expect(extractZillowDescription({ propertyDetails: { description: "" } })).toBeNull();
    expect(extractZillowDescription(null)).toBeNull();
    expect(extractZillowDescription({ propertyDetails: { description: "x".repeat(5000) } })?.length).toBe(4000);
  });

  it("returns the description with the photos, and only fails when there is neither", () => {
    const importer = section(router, "importZillowPhotos: protectedProcedure", "savePropertyWebsiteContent: protectedProcedure");
    expect(importer).toContain("if (!photos.length && !description)");
    expect(importer).toContain("return { photos, description, zillowUrl: link };");
  });

  it("never replaces a summary someone already wrote", () => {
    expect(websiteTab).toContain("summary: prior.summary.trim() || !description ? prior.summary : description");
    expect(websiteTab).toContain('label="Public summary"');
    expect(websiteTab).toContain("Import from Zillow");
  });
});

describe("auto-save of the website listing", () => {
  const save = section(router, "savePropertyWebsiteContent: protectedProcedure", "writeSeoWithAi");
  it("only ever writes a draft, never a live or archived listing", () => {
    expect(save).toContain('if (input.autosave && input.status !== "draft")');
    expect(save).toContain('if (input.autosave && existing && existing.status !== "draft")');
  });
  it("does not log every auto-save", () => {
    expect(save).toContain("if (!input.autosave) {");
  });
  it("auto-saves drafts on the form, and keeps a live listing's edits in the browser", () => {
    expect(websiteTab).toContain('const canAutoSave = draft.status === "draft" && (savedStatus === null || savedStatus === "draft");');
    expect(websiteTab).toContain("autoSave.mutate({ ...payloadFor(draft, listingExists), autosave: true });");
    expect(websiteTab).toContain("writeUnsavedEdits(propertyId, draft);");
    expect(websiteTab).toContain("readUnsavedEdits(propertyId)");
  });
});

describe("Use the pro-forma numbers", () => {
  it("shows whenever a pro-forma is linked, not only after typing a different number", () => {
    const hint = websiteTab.slice(websiteTab.indexOf("function ProformaNumbersHint"));
    expect(hint).not.toContain("if (!mismatch) return null;");
    expect(hint).toContain("Use the pro-forma numbers");
    expect(hint).toContain("disabled={!hasNumbers}");
  });
});

describe("Write with AI", () => {
  it("asks for title and description from the facts only, with the length limits", () => {
    const [system, user] = buildSeoMessages({
      kind: "property",
      facts: { city: "Gatlinburg", state: "TN", beds: 3, empty: "", none: null },
      text: "<p>Cabin with a <b>hot tub</b>.</p>",
    });
    expect(system.content).toContain("Never invent a number");
    expect(system.content).toContain("no em dashes");
    expect(system.content).toContain("include the city and state");
    const body = JSON.parse(user.content);
    expect(body.facts).toEqual({ city: "Gatlinburg", state: "TN", beds: "3" });
    expect(body.text).toBe("Cabin with a hot tub .");
  });

  it("asks a case study for an excerpt, not a meta title", () => {
    const [system] = buildSeoMessages({ kind: "case", facts: {} });
    expect(system.content).toContain(`${CASE_EXCERPT_MAX}-character-or-shorter excerpt`);
  });

  it("reads the answer through code fences and keeps it within the limits", () => {
    const long = "word ".repeat(80);
    const answer = parseSeoAnswer(
      '```json\n{"metaTitle": "3BR Gatlinburg Cabin — Hot Tub", "metaDescription": "' + long + '"}\n```',
      "property"
    );
    expect(answer.metaTitle).toBe("3BR Gatlinburg Cabin , Hot Tub");
    expect(answer.metaDescription.length <= SEO_DESCRIPTION_MAX + 10).toBe(true);
    expect(answer.metaDescription.endsWith(" ")).toBe(false);
    let failed = false;
    try {
      parseSeoAnswer("sorry", "post");
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it("cuts at a word, never mid-word", () => {
    expect(fitTo("alpha beta gamma delta", 12)).toBe("alpha beta");
    expect(fitTo("short", 60)).toBe("short");
  });

  it("strips markup from a post body", () => {
    expect(plainText("## Heading\n\n[link](https://x.y) and ![img](a.png) <em>here</em>&nbsp;now")).toBe(
      "Heading link and here now"
    );
  });

  it("limits each person to 12 a minute", () => {
    const now = 1_000_000;
    for (let index = 0; index < 12; index += 1) expect(allowSeoWrite(990001, now + index)).toBe(true);
    expect(allowSeoWrite(990001, now + 20)).toBe(false);
    expect(allowSeoWrite(990001, now + 61_000)).toBe(true);
  });

  it("leaves gpt-5-mini room to answer instead of spending it all on reasoning", async () => {
    llmCalls.length = 0;
    const answer = await writeSeoText({ kind: "property", facts: { city: "Gatlinburg", state: "TN", beds: 3 } });
    expect(llmCalls).toHaveLength(1);
    const [request] = llmCalls;
    expect(request.model).toBe("gpt-5-mini");
    expect(request.reasoning).toEqual({ effort: "minimal" });
    expect(request.maxTokens).toBeGreaterThanOrEqual(1000);
    expect(request.responseFormat).toEqual({ type: "json_object" });
    expect(answer.metaTitle).toBe("3BR Gatlinburg Cabin");
  });

  it("checks access before calling the model, and is on all three editors", () => {
    const writer = section(router, "writeSeoWithAi: protectedProcedure", "importZillowPhotos: protectedProcedure");
    expect(writer.indexOf("propertyWebsiteAccess")).toBeLessThan(writer.indexOf("writeSeoText"));
    expect(writer.indexOf("requireContentAuthor")).toBeLessThan(writer.indexOf("writeSeoText"));
    expect(websiteTab.match(/<WriteWithAiButton/g)?.length).toBe(2);
    expect(editor.match(/<WriteWithAiButton/g)?.length).toBe(5);
  });
});

describe("homepage featured listings", () => {
  it("are the most recently featured, capped, with no manual order", () => {
    const home = section(router, "async function homepageFeaturedListings", "async function recordFeatured");
    expect(home).toContain("desc(websiteFeaturedListings.featuredAt), desc(websiteProperties.publishedAt)");
    expect(home).toContain(".limit(HOMEPAGE_FEATURED_LIMIT)");
    expect(home).toContain("catch (error)");
    expect(websiteTab).not.toContain("<Label>Order</Label>");
    expect(websiteTab).not.toContain("sortOrder");
  });

  it("stamps the date when a listing is switched on and clears it when switched off", () => {
    const save = section(router, "savePropertyWebsiteContent: protectedProcedure", "writeSeoWithAi");
    expect(save).toContain("await recordFeatured(db, existing.id, !!existing.isFeatured, input.isFeatured);");
    expect(save).toContain("await recordFeatured(db, newId, false, input.isFeatured);");
  });

  it("creates its table at startup, and backfills listings already featured", () => {
    expect(WEBSITE_FEATURED_LISTINGS_DDL).toContain("CREATE TABLE IF NOT EXISTS `website_featured_listings`");
    expect(WEBSITE_FEATURED_LISTINGS_BACKFILL).toContain("INSERT IGNORE");
    expect(read("server/_core/index.ts")).toContain("await ensureWebsiteFeaturedSchema();");
  });
});

describe("case study editor", () => {
  it("explains Eyebrow and Excerpt and links a property by typing its address", () => {
    expect(editor).toContain("The short line shown above the title");
    expect(editor).toContain("Lead with the result");
    expect(editor).toContain("<PropertyPicker");
    expect(editor).toContain('placeholder="Type the address or city"');
  });
});

describe("agent cards on case studies and blog posts", () => {
  it("use the same contact options as a property's agent card", () => {
    const card = section(publicSite, "function AgentContactCard", "function marketsLine");
    for (const text of ["Message {firstName}", "Schedule a Call", "Call {firstName}", "View Full Profile"]) {
      expect(card).toContain(text);
    }
    expect(publicSite).toContain('heading="Written by"');
    // Case study, blog post, and (Rock 1 punch list) the property page.
    expect(publicSite.match(/<AgentContactCard/g)?.length).toBe(3);
  });

  it("shows a post author's contact details only from a published profile", () => {
    const post = section(router, "publicPost: publicProcedure", "publicAddressSuggestions");
    expect(post).toContain('const live = row.authorProfileStatus === "published";');
    expect(post).toContain("authorPhone: live ? row.authorPhone : null");
  });
});

describe("seller form address suggestions", () => {
  it("is served on the public host and limited", () => {
    expect(WEBSITE_PUBLIC_TRPC_PATHS.has("website.publicAddressSuggestions")).toBe(true);
    const now = 5_000_000;
    for (let index = 0; index < 40; index += 1) expect(allowAddressLookup("visitor-a", now + index)).toBe(true);
    expect(allowAddressLookup("visitor-a", now + 50)).toBe(false);
    expect(allowAddressLookup("visitor-b", now + 50)).toBe(true);
  });

  it("is on the Sell page form", () => {
    expect(publicSite).toContain('<PublicAddressInput\n            id="seller-address"');
  });
});
