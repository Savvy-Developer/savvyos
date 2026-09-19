/**
 * The public website host serves only the procedures on an allowlist, and the
 * allowlist is maintained by hand in a different place from the procedures.
 *
 * That gap has now failed silently twice. `publicMarketDirectory` shipped,
 * worked on the admin host and in development, and returned 404 on the public
 * site — the only host where the page that calls it actually runs. Four older
 * procedures turned out to be missing the same way. Then `recordArticleView`
 * turned out to be missing too, and the first version of this test did not
 * catch it, because it keyed on the `public` name prefix and that procedure
 * does not have one.
 *
 * So the invariant is taken from the call sites instead. What the public site
 * calls is what the public host has to serve, whatever it happens to be named.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { WEBSITE_PUBLIC_TRPC_PATHS, websiteRouter } from "./routers/website";

/**
 * Every file the public site is built from. Add an entry here when the public
 * site grows one, or this test will quietly stop covering the new calls.
 */
const PUBLIC_SITE_SOURCES = [
  "client/src/pages/PublicWebsite.tsx",
  "client/src/components/website/publicAccountPages.tsx",
];

const repoRoot = path.resolve(import.meta.dirname, "..");

const calledProcedures = Array.from(
  new Set(
    PUBLIC_SITE_SOURCES.flatMap(relative =>
      Array.from(
        readFileSync(path.join(repoRoot, relative), "utf8").matchAll(
          /\btrpc\.([a-zA-Z]+)\.([a-zA-Z]+)/g
        )
      ).map(match => `${match[1]}.${match[2]}`)
    )
  )
).sort();

/**
 * Called by the public site and knowingly not reachable from the public host.
 *
 * Every investor account procedure. The host guard rejects protected calls
 * "before they can reach authentication", which reads as a deliberate decision
 * about staff authentication — but investor sign-in is a separate auth system,
 * so whether it was meant to be covered is an open question for the repo owner.
 * Until that is answered, sign in, sign up, saved properties, email
 * preferences, view history and My Transactions do not work on the public site.
 *
 * This list is not permission for the gap. It is a record of it, kept in code
 * so it cannot be forgotten the way it was found.
 */
const KNOWN_UNREACHABLE_ON_PUBLIC_HOST = [
  "websiteAccount.me",
  "websiteAccount.myTransactions",
  "websiteAccount.preferences",
  "websiteAccount.recordView",
  "websiteAccount.requestPasswordReset",
  "websiteAccount.resetPassword",
  "websiteAccount.savePreferences",
  "websiteAccount.savedProperties",
  "websiteAccount.setSaved",
  "websiteAccount.signIn",
  "websiteAccount.signOut",
  "websiteAccount.signUp",
  "websiteAccount.viewHistory",
].sort();

const procedureNames = Object.keys((websiteRouter as any)._def.procedures);

/**
 * Deliberately not reachable from the public host.
 *
 * Empty today. Anything added here is a decision that a `public`-prefixed
 * procedure stays off the public site, and it needs a reason next to it.
 */
const INTENTIONALLY_NOT_PUBLIC_HOST: string[] = [];

describe("the public website host allowlist", () => {
  it("found the call sites it is supposed to be checking", () => {
    // Guards the regex and the file list: if either breaks, every other
    // assertion here passes vacuously.
    expect(calledProcedures.length).toBeGreaterThan(20);
    expect(calledProcedures).toContain("website.publicHome");
  });

  it("covers every procedure the public site actually calls", () => {
    const unreachable = calledProcedures.filter(
      procedure => !WEBSITE_PUBLIC_TRPC_PATHS.has(procedure)
    );
    // Exact equality in both directions. A new call site that nobody
    // allowlisted fails here, and so does an entry left behind after the gap
    // it describes has been closed.
    expect(unreachable).toEqual(KNOWN_UNREACHABLE_ON_PUBLIC_HOST);
  });

  it("covers every public procedure in the website router", () => {
    const missing = procedureNames
      .filter(name => name.startsWith("public"))
      .filter(name => !INTENTIONALLY_NOT_PUBLIC_HOST.includes(name))
      .filter(name => !WEBSITE_PUBLIC_TRPC_PATHS.has(`website.${name}`));
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
