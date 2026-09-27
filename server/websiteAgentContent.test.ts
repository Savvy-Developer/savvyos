import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { nextPublishedAt, ownsCaseStudy, ownsPost } from "@shared/websiteContentOwnership";

describe("which content an agent may edit", () => {
  it("is their own: created by them or credited to them", () => {
    expect(ownsCaseStudy({ createdById: 7, agentUserId: null }, 7)).toBe(true);
    expect(ownsCaseStudy({ createdById: 1, agentUserId: 7 }, 7)).toBe(true);
    expect(ownsCaseStudy({ createdById: 1, agentUserId: 2 }, 7)).toBe(false);
    expect(ownsPost({ createdById: 1, authorUserId: 7 }, 7)).toBe(true);
    expect(ownsPost({ createdById: 1, authorUserId: null }, 7)).toBe(false);
    expect(ownsPost(null, 7)).toBe(false);
  });
});

describe("publish date", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  it("is stamped on first publish and then kept", () => {
    expect(nextPublishedAt("published", null, now)).toEqual(now);
    expect(nextPublishedAt("published", "2026-03-01T00:00:00Z", now)).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(nextPublishedAt("draft", null, now)).toBeNull();
    expect(nextPublishedAt("archived", "2026-03-01T00:00:00Z", now)).toEqual(new Date("2026-03-01T00:00:00Z"));
  });
});

describe("agent content procedures", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "routers/website.ts"), "utf8").replace(/\r\n/g, "\n");
  const body = (name: string) => {
    const start = source.indexOf(`  ${name}: protectedProcedure`);
    expect(start).toBeGreaterThan(-1);
    const next = source.slice(start + 1).search(/\n  [a-zA-Z]+: (protectedProcedure|publicProcedure)/);
    return source.slice(start, next === -1 ? undefined : start + 1 + next);
  };

  it("only lets agents and admins in", () => {
    for (const name of ["myWebsiteContent", "saveMyCaseStudy", "saveMyPost"]) {
      expect(body(name)).toContain("requireContentAuthor(ctx)");
    }
  });

  it("refuses to edit someone else's case study or post", () => {
    expect(body("saveMyCaseStudy")).toContain("ownsCaseStudy(existing, me)");
    expect(body("saveMyPost")).toContain("ownsPost(existing, me)");
  });

  it("only links a case study to the agent's own property", () => {
    expect(body("saveMyCaseStudy")).toContain("agentOwnsProperty(db, me, input.propertyId)");
  });

  it("never lets an agent feature content or reorder the site", () => {
    for (const name of ["saveMyCaseStudy", "saveMyPost"]) {
      const text = body(name);
      expect(text).not.toContain("input.isFeatured");
      expect(text).not.toContain("input.sortOrder");
    }
  });
});
