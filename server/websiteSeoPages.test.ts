import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  STATIC_PAGES,
  absoluteImage,
  buildRobotsTxt,
  buildSitemapXml,
  describeText,
  pageTitle,
  parseWebsitePath,
} from "./websiteSeoPages";
import { injectLandingPageHtml } from "./landingPageHtml";
import { EDITABLE_LIST_PAGES, editableListPage } from "@shared/websiteEditablePages";

const ORIGIN = "https://home.savvy-agents.com";

describe("parseWebsitePath", () => {
  it("routes /newsite addresses the way the client does", () => {
    expect(parseWebsitePath("/newsite")).toEqual({ kind: "home" });
    expect(parseWebsitePath("/newsite/")).toEqual({ kind: "home" });
    expect(parseWebsitePath("/newsite/properties")).toEqual({ kind: "properties" });
    expect(parseWebsitePath("/newsite/properties/12-oak-st")).toEqual({ kind: "property", slug: "12-oak-st" });
    expect(parseWebsitePath("/newsite/agents/ana-estevez")).toEqual({ kind: "agent", slug: "ana-estevez" });
    expect(parseWebsitePath("/newsite/case-studies/a-b")).toEqual({ kind: "caseStudy", slug: "a-b" });
    expect(parseWebsitePath("/newsite/resources/a-b")).toEqual({ kind: "resource", slug: "a-b" });
    expect(parseWebsitePath("/newsite/markets")).toEqual({ kind: "markets" });
    expect(parseWebsitePath("/newsite/privacy")).toEqual({ kind: "page", slug: "privacy" });
  });

  it("treats account screens as account pages, so they get noindex", () => {
    for (const p of ["/newsite/sign-in", "/newsite/sign-up", "/newsite/account/saved", "/newsite/reset-password"]) {
      expect(parseWebsitePath(p)).toEqual({ kind: "account" });
    }
  });

  it("ignores everything outside /newsite, including look-alikes", () => {
    expect(parseWebsitePath("/")).toBeNull();
    expect(parseWebsitePath("/some-landing-page")).toBeNull();
    expect(parseWebsitePath("/newsitefoo")).toBeNull();
    expect(parseWebsitePath("/newsite/properties/a/b")).toBeNull();
  });
});

describe("page text", () => {
  it("titles pages the same way usePageTitle does", () => {
    expect(pageTitle("")).toBe("Savvy STR Agents");
    expect(pageTitle("STR Markets")).toBe("STR Markets | Savvy STR Agents");
  });

  it("keeps the static titles word for word with the client", () => {
    const client = readFileSync(
      path.resolve(import.meta.dirname, "../client/src/pages/PublicWebsite.tsx"),
      "utf8"
    );
    for (const page of Object.values(STATIC_PAGES)) {
      if (!page.title) continue;
      // List pages take their title from the shared designed wording (so the
      // CMS can reword it), not from a literal in the page. Check both ends:
      // the page reads that wording, and the wording matches the server.
      const listPage = editableListPage(page.path.replace(/^\//, ""));
      if (listPage) {
        expect(listPage.starter.metaTitle).toBe(page.title);
        expect(client).toContain(`useListHeading("${listPage.slug}")`);
      } else {
        expect(client).toContain(`usePageTitle("${page.title}")`);
      }
    }
  });

  it("covers every editable list page with a static title", () => {
    const paths = new Set(Object.values(STATIC_PAGES).map(page => page.path));
    for (const listPage of EDITABLE_LIST_PAGES) {
      expect(paths.has(`/${listPage.slug}`)).toBe(true);
    }
  });

  it("turns Markdown into a clean description cut at a word", () => {
    expect(describeText("## Hello\n\nA [link](https://x.y) and **bold**.")).toBe("Hello A link and bold.");
    const long = describeText("word ".repeat(80), 60)!;
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/wor…$/);
    expect(describeText("   ")).toBeNull();
    expect(describeText(null)).toBeNull();
  });

  it("only offers images a preview bot can fetch", () => {
    expect(absoluteImage("https://cdn.example.com/a.jpg", ORIGIN)).toBe("https://cdn.example.com/a.jpg");
    expect(absoluteImage("/uploads/a.jpg", ORIGIN)).toBe(`${ORIGIN}/uploads/a.jpg`);
    expect(absoluteImage("a.jpg", ORIGIN)).toBeNull();
    expect(absoluteImage(null, ORIGIN)).toBeNull();
  });
});

describe("sitemap and robots", () => {
  it("lists each page once, under /newsite, with escaped addresses", () => {
    const xml = buildSitemapXml(ORIGIN, [
      { path: "/" },
      { path: "/properties" },
      { path: "/properties" },
      { path: "/resources/a&b", lastModified: new Date("2026-09-01T12:00:00Z") },
    ]);
    expect(xml).toContain(`<loc>${ORIGIN}/newsite</loc>`);
    expect(xml.match(/newsite\/properties</g)).toHaveLength(1);
    expect(xml).toContain("/newsite/resources/a&amp;b</loc><lastmod>2026-09-01</lastmod>");
  });

  it("points crawlers at the sitemap and away from the API and account screens", () => {
    const robots = buildRobotsTxt(ORIGIN);
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /newsite/account");
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });
});

describe("injected HTML", () => {
  it("uses the page's own canonical address, not a landing-page slug", () => {
    const html = injectLandingPageHtml("<html><head><title>x</title></head><body></body></html>", {
      slug: "",
      canonicalUrl: `${ORIGIN}/newsite/markets`,
      pageTitle: "STR Markets | Savvy STR Agents",
      metaDescription: "Markets <we> cover",
      socialImageUrl: null,
      noindex: false,
      trackingSettings: {},
    });
    expect(html).toContain("<title>STR Markets | Savvy STR Agents</title>");
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/newsite/markets" />`);
    expect(html).toContain('content="Markets &lt;we&gt; cover"');
    expect(html).not.toContain("<script");
  });
});
