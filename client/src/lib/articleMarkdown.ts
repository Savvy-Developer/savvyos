import { Marked } from "marked";

/**
 * Only these schemes may appear in a link or image on a public page. marked
 * does not filter hrefs itself, so `[click](javascript:alert(1))` renders as a
 * live javascript: link unless we stop it. Angle-bracket escaping does not
 * catch that, because the markdown link syntax contains no angle brackets.
 */
const SAFE_SCHEME = /^(https?:|mailto:|tel:|\/|#|$)/i;

function safeUrl(href: string | null | undefined): string | null {
  const value = String(href ?? "").trim();
  if (!value) return null;
  // Strip whitespace and control characters that let a scheme be smuggled past
  // the test, for example "java\tscript:" or a leading null byte.
  const collapsed = value.replace(/[\u0000-\u0020]/g, "");
  return SAFE_SCHEME.test(collapsed) ? value : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A marked instance scoped to this renderer, so overriding link and image here
 * cannot leak into any other use of marked in the app.
 */
const articleMarked = new Marked({
  renderer: {
    link(this: any, { href, title, tokens }: any) {
      const text = this.parser.parseInline(tokens);
      const url = safeUrl(href);
      // A rejected link keeps its text, so the reader still sees what was
      // written, it just is not clickable.
      if (!url) return text;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(url)}"${titleAttr} rel="nofollow noopener noreferrer" target="_blank">${text}</a>`;
    },
    image({ href, title, text }: any) {
      const url = safeUrl(href);
      if (!url) return escapeHtml(String(text ?? ""));
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(String(text ?? ""))}"${titleAttr}>`;
    },
  } as any,
});

/**
 * Render a blog post or case study body for the public site.
 *
 * Bodies are markdown, authored in the Website Studio. Ones written before the
 * rich text editor existed are plain text, which is valid markdown, so they
 * keep rendering as paragraphs without a migration.
 *
 * Two layers of defence, because this output goes through
 * dangerouslySetInnerHTML on a public page:
 *
 * 1. Angle brackets in the source are escaped, so raw HTML in the body is shown
 *    as text rather than executed. Authors are admins, but "the author is
 *    trusted" is a weak reason to run arbitrary markup, and a WYSIWYG never
 *    needs to emit raw HTML anyway.
 * 2. Link and image URLs are restricted to safe schemes, which escaping alone
 *    does not cover.
 */
export function renderArticleMarkdown(markdown: string | null | undefined): string {
  const source = String(markdown ?? "");
  if (!source.trim()) return "";
  const escaped = source.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return articleMarked.parse(escaped, { async: false }) as string;
}
