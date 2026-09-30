import sanitizeHtml from "sanitize-html";

const LINK_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const ALLOWED_DETAIL_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "ul",
  "ol",
  "li",
  "a",
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkifyPlainText(value: string) {
  let result = "";
  let position = 0;

  LINK_PATTERN.lastIndex = 0;
  let match = LINK_PATTERN.exec(value);
  while (match) {
    const url = match[0];
    const index = match.index;
    result += escapeHtml(value.slice(position, index));
    result += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    position = index + url.length;
    match = LINK_PATTERN.exec(value);
  }

  result += escapeHtml(value.slice(position));
  return result.replace(/\r?\n/g, "<br />");
}

function looksLikeSupportedHtml(value: string) {
  return /<\/?(?:p|br|strong|em|b|i|ul|ol|li|a)(?:\s|>|\/)/i.test(value);
}

/**
 * Project To-Do details may contain a deliberately small rich-text subset. This
 * guard keeps stored content safe and also turns legacy plain-text URLs into
 * links when those notes are first read through the new task surface.
 */
export function sanitizeProjectTodoDetails(value?: string | null) {
  if (!value?.trim()) return null;

  const source = looksLikeSupportedHtml(value)
    ? value
    : `<p>${linkifyPlainText(value)}</p>`;

  const sanitized = sanitizeHtml(source, {
    allowedTags: ALLOWED_DETAIL_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  }).trim();

  return sanitized || null;
}
