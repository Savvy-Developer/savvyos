/**
 * Case studies get their own meta title and meta description, each with
 * "Write with AI" (Dhruv, 2 Oct: properties and blog posts had the fields,
 * case studies did not).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { WEBSITE_CASE_STUDY_SEO_DDL, cleanCaseStudySeo, loadCaseStudySeo, saveCaseStudySeo, withCaseStudySeo } from "./websiteCaseStudySeo";
import { CASE_EXCERPT_MAX, SEO_TITLE_ASK, buildSeoMessages } from "./websiteSeoWriter";

const root = path.resolve(import.meta.dirname, "..");
// Normalised: the Windows checkout is CRLF.
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const router = read("server/routers/website.ts");
const editor = read("client/src/components/website/ContentEditor.tsx");
const section = (source: string, from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

/** A database that fails every call, as when the table was never created. */
const brokenDb = {
  select: () => {
    throw new Error("Table 'website_case_study_seo' doesn't exist");
  },
  insert: () => {
    throw new Error("Table 'website_case_study_seo' doesn't exist");
  },
  delete: () => {
    throw new Error("Table 'website_case_study_seo' doesn't exist");
  },
};

describe("case study meta text", () => {
  it("trims, and treats blank as nothing", () => {
    expect(cleanCaseStudySeo({ metaTitle: "  Cabin deal  ", metaDescription: "   " })).toEqual({
      metaTitle: "Cabin deal",
      metaDescription: null,
    });
    expect(cleanCaseStudySeo({})).toEqual({ metaTitle: null, metaDescription: null });
    expect(cleanCaseStudySeo({ metaTitle: "x".repeat(400) }).metaTitle?.length).toBe(255);
  });

  it("reads as blank, and never throws, when its table is missing", async () => {
    expect((await loadCaseStudySeo(brokenDb, [1, 2])).size).toBe(0);
    expect(await withCaseStudySeo(brokenDb, [{ id: 7, title: "Story" }])).toEqual([
      { id: 7, title: "Story", metaTitle: null, metaDescription: null },
    ]);
    expect(await saveCaseStudySeo(brokenDb, 7, { metaTitle: "A" })).toBe(false);
    expect(await saveCaseStudySeo(brokenDb, 0, { metaTitle: "A" })).toBe(false);
  });

  it("asks the database nothing when there are no case studies", async () => {
    expect((await loadCaseStudySeo(brokenDb, [])).size).toBe(0);
  });

  it("lives in its own table, created at startup", () => {
    expect(WEBSITE_CASE_STUDY_SEO_DDL).toContain("CREATE TABLE IF NOT EXISTS `website_case_study_seo`");
    expect(read("server/_core/index.ts")).toContain("await ensureWebsiteCaseStudySeoSchema();");
    // Not columns on website_case_studies: every screen selects that whole table.
    const table = section(read("drizzle/schema.ts"), "export const websiteCaseStudies = mysqlTable(", "export const websiteBlogPosts");
    expect(table).not.toContain("metaTitle");
  });
});

describe("saving and loading", () => {
  it("saves the fields only when the form sent them, from both editors", () => {
    const studio = section(router, "saveCaseStudy: protectedProcedure", "savePost: protectedProcedure");
    expect(studio).toContain("const { metaTitle, metaDescription, ...caseFields } = input;");
    expect(studio).toContain("sentCaseStudySeo(input)");
    expect(studio).toContain("return { success: true, seoSaved };");
    const agent = section(router, "saveMyCaseStudy: protectedProcedure", "saveMyPost: protectedProcedure");
    expect(agent).toContain("sentCaseStudySeo(input) && id");
    // The agent's ownership check still comes first.
    expect(agent.indexOf("ownsCaseStudy")).toBeGreaterThan(-1);
    expect(agent.indexOf("ownsCaseStudy") < agent.indexOf("saveCaseStudySeo")).toBe(true);
  });

  it("gives both editors the saved text", () => {
    expect(router.match(/caseStudies: await withCaseStudySeo\(db, caseRows\)/g)?.length).toBe(2);
  });

  it("puts the two fields, each with Write with AI, on the case study form", () => {
    const caseForm = section(editor, 'label="Investment amount', "{!isAgent && (\n            <div>\n              <Label>Author</Label>");
    expect(caseForm).toContain('label="Meta title"');
    expect(caseForm).toContain('label="Meta description"');
    expect(caseForm.match(/kind="caseSeo"/g)?.length).toBe(2);
    expect(editor).toContain("metaTitle: draft.metaTitle || null,\n        metaDescription: draft.metaDescription || null,\n      } as any);\n    else");
  });
});

describe("what Google gets", () => {
  it("is the meta title and description when written, else the title and excerpt", () => {
    const seo = section(read("server/websiteSeo.ts"), 'case "caseStudy": {', 'case "resource": {');
    expect(seo).toContain("title: seo?.metaTitle || row.title,");
    expect(seo).toContain("describeText(seo?.metaDescription) ?? describeText(row.excerpt) ?? describeText(row.body)");
  });
});

describe("Write with AI for a case study", () => {
  it("writes a meta title and description for caseSeo, and still an excerpt for case", () => {
    const [seoSystem] = buildSeoMessages({ kind: "caseSeo", facts: {} });
    expect(seoSystem.content).toContain(`at most ${SEO_TITLE_ASK} characters`);
    expect(seoSystem.content).toContain("lead with the result the client got");
    expect(seoSystem.content).toContain("Never name the client or give a street address");
    const [excerptSystem] = buildSeoMessages({ kind: "case", facts: {} });
    expect(excerptSystem.content).toContain(`${CASE_EXCERPT_MAX}-character-or-shorter excerpt`);
  });

  it("is allowed by the endpoint, and a linked property gives only its city and state", () => {
    const writer = section(router, "writeSeoWithAi: protectedProcedure", "importZillowPhotos: protectedProcedure");
    expect(writer).toContain('kind: z.enum(["property", "post", "case", "caseSeo"])');
    expect(writer).toContain('if (input.kind === "property") Object.assign(facts, property);');
    expect(writer).toContain("else Object.assign(facts, { city: property.city, state: property.state });");
  });
});
