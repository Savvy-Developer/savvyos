import { describe, expect, it } from "vitest";

/**
 * The website-image upload gate.
 *
 * An agent may publish a listing for a property they own, so they have to be
 * able to add its photos. That was not true until canUploadWebsiteImage
 * existed: the route asked canAdminUsePermission, which is false for every
 * non-admin before it reads a permission row, and agents got "Website
 * permission is required" with no setting that could fix it.
 *
 * These assertions read the source rather than issue a live request, matching
 * website.unpublish.test.ts. The guarantee worth pinning is that the route
 * keeps asking the ownership-aware helper and that the helper keeps both
 * routes into it.
 */
describe("canUploadWebsiteImage", () => {
  it("guards the website-image route in place of the admin-only check", () => {
    const body = extractRoute(readSource(), "/api/upload/website-image");
    expect(body).toContain("canUploadWebsiteImage(user, req.body?.propertyId)");
    expect(body).not.toContain('canAdminUsePermission(user, "canViewWebsite")');
  });

  it("keeps the Website Studio permission as the admin route", () => {
    const helper = extractHelper(readSource());
    expect(helper).toContain('user.role === "admin"');
    expect(helper).toContain('canAdminUsePermission(user, "canViewWebsite")');
  });

  it("lets an agent through only for a property they own", () => {
    const helper = extractHelper(readSource());
    expect(helper).toContain('user.role !== "agent"');
    expect(helper).toContain("agentOwnsProperty(db, user.id, propertyId)");
  });

  it("refuses signed-out and deactivated users", () => {
    const helper = extractHelper(readSource());
    expect(helper).toContain("!user || user.isActive === false");
  });

  it("leaves the landing-page upload on its own permission", () => {
    const body = extractRoute(readSource(), "/api/upload/landing-page-image");
    expect(body).toContain('canAdminUsePermission(user, "canEditLandingPages")');
  });
});

function readSource() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs");
  const path = require("node:path");
  // Normalised because core.autocrlf gives Windows checkouts CRLF while the
  // blob is LF, and the extractors below anchor on newlines.
  return fs.readFileSync(path.join(__dirname, "uploadRoutes.ts"), "utf8").replace(/\r\n/g, "\n");
}

/** One route handler's source, from its app.post to the start of the next. */
function extractRoute(source: string, route: string) {
  const start = source.indexOf(`app.post("${route}"`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\n  app.post(", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

/** The helper's source, from its declaration to its closing brace. */
function extractHelper(source: string) {
  const start = source.indexOf("async function canUploadWebsiteImage");
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\n}\n", start);
  expect(next).toBeGreaterThan(-1);
  return source.slice(start, next);
}
