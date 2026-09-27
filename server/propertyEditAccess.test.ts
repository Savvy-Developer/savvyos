import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Found while testing the agent flow live on 27 Sep:
 * - properties.update had no access check, so any signed-in user could change
 *   any property's price, beds or baths, which is what the website shows.
 * - Nothing could mark a pro-forma Final, and only a Final pro-forma feeds a
 *   website listing's revenue range and comps, so no listing ever showed them.
 */
const source = readFileSync(path.resolve(import.meta.dirname, "routers/properties.ts"), "utf8").replace(/\r\n/g, "\n");

function body(name: string) {
  const start = source.indexOf(`  ${name}: protectedProcedure`);
  expect(start).toBeGreaterThan(-1);
  const next = source.slice(start + 1).search(/\n  [a-zA-Z]+: protectedProcedure/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("editing a property's facts", () => {
  it("is checked before anything is written", () => {
    const text = body("update");
    const check = text.indexOf("canEditPropertyFacts(ctx.user, input.id)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(text.indexOf("updateProperty("));
    expect(text).toContain('code: "FORBIDDEN"');
  });

  it("allows admins, the agent who owns it, and the pro-forma's author", () => {
    const start = source.indexOf("export async function canEditPropertyFacts(");
    const helper = source.slice(start, source.indexOf("\n}\n", start));
    expect(helper).toContain('user.role === "admin"');
    expect(helper).toContain("properties.addedByUserId, user.id");
    expect(helper).toContain("transactions.agentId, user.id");
    expect(helper).toContain("listings.agentId, user.id");
    expect(helper).toContain("proformas.createdByUserId, user.id");
  });
});

describe("marking a pro-forma final", () => {
  it("exists, and only its author or an admin may do it", () => {
    const text = body("setProformaStatus");
    expect(text).toContain('z.enum(["draft", "final"])');
    expect(text).toContain('ctx.user.role !== "admin" && row.createdByUserId !== ctx.user.id');
    expect(text).toContain("update(proformas).set({ status: input.status }");
  });
});
