import { describe, expect, it } from "vitest";
import { renderArticleMarkdown } from "../client/src/lib/articleMarkdown";

describe("renderArticleMarkdown", () => {
  it("renders markdown formatting from the editor", () => {
    const html = renderArticleMarkdown("## Heading\n\nSome **bold** text.");
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("keeps plain-text bodies working, which is what is already in the database", () => {
    const html = renderArticleMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html).toContain("First paragraph.");
    expect(html).toContain("Second paragraph.");
  });

  it("renders lists and links", () => {
    const html = renderArticleMarkdown("- one\n- two\n\n[Savvy](https://example.com)");
    expect(html).toContain("<ul>");
    expect(html).toContain('href="https://example.com"');
  });

  // The body reaches the browser through dangerouslySetInnerHTML, so anything
  // that survives escaping would execute on a public page.
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<iframe src='https://evil.example'></iframe>",
    "<svg/onload=alert(1)>",
  ])("escapes raw HTML rather than rendering it: %s", payload => {
    const html = renderArticleMarkdown(payload);
    // No dangerous element reaches the browser as an actual tag. The payload
    // text survives escaped, which is correct: the author sees what they typed,
    // the browser sees inert characters.
    for (const tag of ["<script", "<iframe", "<svg", "<img"]) {
      expect(html).not.toContain(tag);
    }
    expect(html).toContain("&lt;");
    // Only markup marked generated should be present.
    const tags = html.match(/<[a-z][^>]*>/gi) || [];
    expect(tags.every(t => /^<\/?(p|h[1-6]|ul|ol|li|strong|em|del|code|pre|blockquote|hr|br|a)\b/i.test(t))).toBe(true);
  });

  // marked does not filter hrefs, so this is our own renderer doing the work.
  // Angle-bracket escaping does not help here: the link syntax has no brackets.
  it.each([
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](data:text/html;base64,PHNjcmlwdD4=)",
    "[click](vbscript:msgbox(1))",
  ])("strips a dangerous link scheme but keeps the text: %s", source => {
    const html = renderArticleMarkdown(source);
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html.toLowerCase()).not.toContain("vbscript:");
    expect(html.toLowerCase()).not.toContain("data:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("click");
  });

  it("keeps ordinary links, and makes them safe to click", () => {
    const html = renderArticleMarkdown("[Savvy](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });

  it("allows mailto, tel and in-page anchors", () => {
    for (const [source, expected] of [
      ["[mail](mailto:a@b.com)", "mailto:a@b.com"],
      ["[call](tel:+15551234)", "tel:+15551234"],
      ["[jump](#section)", "#section"],
    ] as const) {
      expect(renderArticleMarkdown(source)).toContain(`href="${expected}"`);
    }
  });

  it("strips a dangerous image source but keeps the alt text", () => {
    const html = renderArticleMarkdown("![alt text](javascript:alert(1))");
    expect(html).not.toContain("<img");
    expect(html).toContain("alt text");
  });

  it.each([null, undefined, "", "   "])("returns empty string for %p", value => {
    expect(renderArticleMarkdown(value as any)).toBe("");
  });
});
