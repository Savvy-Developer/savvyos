/**
 * The public website host serves only the procedures on an allowlist, and the
 * allowlist is maintained by hand in a different place from the procedures.
 *
 * That gap failed silently once already: `publicMarketDirectory` shipped, worked
 * on the admin host and in development, and returned 404 on the public site —
 * the only host where the page that calls it actually runs. Four older
 * procedures turned out to be missing the same way.
 *
 * So both directions are pinned here. A procedure cannot be added to the router
 * without a decision about the public host, and a path cannot be left in the
 * allowlist after the procedure behind it is renamed or removed.
 */

import { describe, expect, it } from "vitest";

import { WEBSITE_PUBLIC_TRPC_PATHS, websiteRouter } from "./routers/website";

const procedureNames = Object.keys((websiteRouter as any)._def.procedures);

/**
 * Deliberately not reachable from the public host.
 *
 * Empty today. Anything added here is a decision that a `public`-prefixed
 * procedure stays off the public site, and it needs a reason next to it.
 */
const INTENTIONALLY_NOT_PUBLIC_HOST: string[] = [];

describe("the public website host allowlist", () => {
  it("covers every public procedure in the website router", () => {
    const missing = procedureNames
      .filter(name => name.startsWith("public"))
      .filter(name => !INTENTIONALLY_NOT_PUBLIC_HOST.includes(name))
      .filter(name => !WEBSITE_PUBLIC_TRPC_PATHS.has(`website.${name}`));
    // A procedure here means the public site will 404 on it while everything
    // else about the feature looks correct.
    expect(missing).toEqual([]);
  });

  it("does not allow paths whose procedure no longer exists", () => {
    const orphaned = Array.from(WEBSITE_PUBLIC_TRPC_PATHS).filter(
      path => !procedureNames.includes(path.replace(/^website\./, ""))
    );
    expect(orphaned).toEqual([]);
  });

  it("only allows procedures from this router", () => {
    const foreign = Array.from(WEBSITE_PUBLIC_TRPC_PATHS).filter(
      path => !path.startsWith("website.")
    );
    expect(foreign).toEqual([]);
  });
});
