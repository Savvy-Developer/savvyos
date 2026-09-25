import { createHash } from "node:crypto";

/**
 * Moving website images off the old site's storage: the decisions, kept pure
 * so they can be tested. The fetching and saving live in websiteImageRehost.ts.
 *
 * The content imported from the old savvy-agents.com still points at its
 * Supabase storage (and one Google-hosted photo). Those links stop working
 * when that account is closed, so the images are copied into SavvyOS's own
 * storage and the records are pointed at the copies.
 */

/** Hosts whose images are copied. Everything else is left alone. */
const MOVE_HOST_SUFFIXES = [".supabase.co", ".googleusercontent.com"];

export function shouldMoveImage(url: string | null | undefined): boolean {
  if (!url) return false;
  const value = url.trim();
  if (value.startsWith("data:image/")) return true;
  try {
    const { protocol, hostname } = new URL(value);
    if (protocol !== "https:" && protocol !== "http:") return false;
    return MOVE_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

/** Every image address in a Markdown body, in order, including data: images. */
export function markdownImageUrls(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  const pattern = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const match of markdown.matchAll(pattern)) out.push(match[1]);
  return out;
}

/**
 * Image references that cannot work at all: not a web address and not an
 * embedded image, like a "PASTE_IMAGE_URL_HERE" left in by a writer. Reported
 * so a person fixes the article, never changed automatically.
 */
export function brokenImageRefs(markdown: string | null | undefined): string[] {
  return markdownImageUrls(markdown).filter(url => {
    if (url.startsWith("data:image/") || url.startsWith("/")) return false;
    try {
      const { protocol } = new URL(url);
      return protocol !== "https:" && protocol !== "http:";
    } catch {
      return true;
    }
  });
}

/** Swap each old address for its copy. Addresses not in the map are kept. */
export function replaceImageUrls(markdown: string, moved: Map<string, string>): string {
  let out = markdown;
  moved.forEach((next, previous) => {
    if (previous !== next) out = out.split(previous).join(next);
  });
  return out;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export function extensionFor(contentType: string | null | undefined): string {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  return EXTENSIONS[type] ?? "jpg";
}

/**
 * Where the copy is stored. Named from a hash of the original address, so
 * running the move twice writes the same file rather than a second copy.
 */
export function movedImageKey(source: string, contentType: string | null | undefined): string {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 24);
  return `website/migrated/${hash}.${extensionFor(contentType)}`;
}

/** An embedded "data:image/...;base64,..." image as bytes. */
export function decodeDataImage(uri: string): { contentType: string; bytes: Buffer } | null {
  const match = uri.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  return bytes.length ? { contentType: match[1].toLowerCase(), bytes } : null;
}
