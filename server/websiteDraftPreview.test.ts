import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(__dirname, "routers/website.ts"), "utf8");
const slice = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));

describe("draft preview for case studies and blog posts", () => {
  it("case studies: drafts only for signed-in Savvy staff, published for everyone", () => {
    const detail = slice("publicCaseStudy: publicProcedure", "publicPosts: publicProcedure");
    expect(detail).toContain("visitorIsStaff(ctx.req)");
    expect(detail).toMatch(/isStaff\s*\?\s*inArray\(websiteCaseStudies\.status, \["published", "draft"\]\)\s*:\s*eq\(websiteCaseStudies\.status, "published"\)/);
    expect(detail).not.toContain('"archived"');
  });

  it("blog posts: drafts only for signed-in Savvy staff, published for everyone", () => {
    const detail = slice("publicPost: publicProcedure", "submitLead: publicProcedure");
    expect(detail).toContain("visitorIsStaff(ctx.req)");
    expect(detail).toMatch(/isStaff\s*\?\s*inArray\(websiteBlogPosts\.status, \["published", "draft"\]\)\s*:\s*eq\(websiteBlogPosts\.status, "published"\)/);
    expect(detail).not.toContain('"archived"');
  });

  it("the lists stay published-only, so drafts never appear on the public pages", () => {
    const posts = slice("publicPosts: publicProcedure", "publicPost: publicProcedure");
    expect(posts).toContain('eq(websiteBlogPosts.status, "published")');
    expect(posts).not.toContain("visitorIsStaff");
  });

  it("staff check reads only the website staff session and fails closed", () => {
    const helper = slice("async function visitorIsStaff", "async function visitorIsSignedIn");
    expect(helper).toContain("staffFromRequest");
    expect(helper).toContain("return false");
  });
});
