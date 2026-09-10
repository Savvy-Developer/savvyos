import { describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));
vi.mock("./permissions", () => ({ canAdminUsePermission: vi.fn() }));

import { websiteRouter } from "./website";

/**
 * unpublishProperty must remove the websiteProperties row and nothing else.
 * These assertions are about the shape of the procedure rather than a live DB:
 * the guarantee that matters is that `properties` is never a delete target.
 */
describe("unpublishProperty", () => {
  it("is registered on the website router", () => {
    expect(websiteRouter._def.procedures).toHaveProperty("unpublishProperty");
  });

  it("only ever deletes from websiteProperties, never from properties", () => {
    const source = readSource();
    const body = extractProcedure(source, "unpublishProperty");
    expect(body).toContain("db.delete(websiteProperties)");
    expect(body).not.toContain("delete(properties)");
  });

  it("requires the website property management permission", () => {
    const body = extractProcedure(readSource(), "unpublishProperty");
    expect(body).toContain('requireWebsitePermission(ctx, "canManageWebsiteProperties")');
  });

  it("404s rather than silently succeeding when the row is gone", () => {
    const body = extractProcedure(readSource(), "unpublishProperty");
    expect(body).toContain('code: "NOT_FOUND"');
  });
});

function readSource() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs");
  const path = require("node:path");
  return fs.readFileSync(path.join(__dirname, "website.ts"), "utf8");
}

/** Grab one procedure's source, from its name to the start of the next one. */
function extractProcedure(source: string, name: string) {
  const start = source.indexOf(`  ${name}: protectedProcedure`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\n  }),\n", start);
  return source.slice(start, next);
}
