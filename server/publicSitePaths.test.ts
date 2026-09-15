import { describe, expect, it } from "vitest";

import {
  PUBLIC_SITE_BASE,
  publicPath,
  safeNextPath,
} from "../client/src/lib/publicSitePaths";

/**
 * The sign-in page sends people on to wherever they were headed. That is a
 * redirect driven by a query string, which is the classic way a login page on
 * a real domain ends up forwarding people to somebody else's.
 */
describe("safeNextPath", () => {
  it("keeps a path inside the public site", () => {
    expect(safeNextPath(`${PUBLIC_SITE_BASE}/properties/123-main-st`)).toBe(
      `${PUBLIC_SITE_BASE}/properties/123-main-st`
    );
  });

  it("falls back to the site root when there is nothing to go back to", () => {
    expect(safeNextPath(null)).toBe(publicPath());
    expect(safeNextPath(undefined)).toBe(publicPath());
    expect(safeNextPath("")).toBe(publicPath());
  });

  it("refuses an absolute URL on another host", () => {
    expect(safeNextPath("https://evil.example/login")).toBe(publicPath());
  });

  it("refuses a protocol-relative URL", () => {
    // A browser reads a leading "//" as "same scheme, different host", so this
    // leaves the site entirely despite looking like a path.
    expect(safeNextPath("//evil.example")).toBe(publicPath());
    expect(safeNextPath(`${PUBLIC_SITE_BASE}//evil.example`)).toBe(
      publicPath()
    );
  });

  it("refuses a path outside the public site", () => {
    expect(safeNextPath("/admin")).toBe(publicPath());
    expect(safeNextPath("/login")).toBe(publicPath());
  });
});
