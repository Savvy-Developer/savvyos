import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Website Studio used to stamp "now" as the publish date on every save of a
 * published post or case study, and wipe it on drafts. That made old articles
 * look new after a typo fix, and left no way to carry the old site's dates
 * over. Admins can now set the date; otherwise it is stamped once and kept.
 */
const source = readFileSync(path.resolve(import.meta.dirname, "routers/website.ts"), "utf8").replace(/\r\n/g, "\n");

function body(name: string) {
  const start = source.indexOf(`  ${name}: protectedProcedure`);
  expect(start).toBeGreaterThan(-1);
  const next = source.slice(start + 1).search(/\n  [a-zA-Z]+: (protectedProcedure|publicProcedure)/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("publish date in Website Studio", () => {
  it("keeps the existing date or takes the admin's, instead of stamping now on every save", () => {
    for (const name of ["savePost", "saveCaseStudy"]) {
      const text = body(name);
      expect(text).toContain("studioPublishedAt(input.status, input.publishedAt, existing?.publishedAt)");
      expect(text).not.toContain('input.status === "published" ? new Date() : null');
    }
  });

  it("refuses an invalid or future date", () => {
    const start = source.indexOf("function studioPublishedAt(");
    const helper = source.slice(start, source.indexOf("\n}\n", start));
    expect(helper).toContain("Publish date is not a valid date.");
    expect(helper).toContain("Publish date cannot be in the future.");
  });

  it("never lets an agent set the date on their own content", () => {
    for (const name of ["saveMyPost", "saveMyCaseStudy"]) {
      expect(body(name)).not.toContain("input.publishedAt");
    }
  });
});
