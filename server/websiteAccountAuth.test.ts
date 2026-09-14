import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(), logActivity: vi.fn() }));

// env.ts snapshots process.env at import time, so assigning JWT_SECRET inside
// a test is too late: the module graph has already read "" and signingKey()
// throws. A mutable mock lets the tests choose the secret, and change it, at
// the moment the code actually reads it.
const envState = vi.hoisted(() => ({
  cookieSecret: "test-secret-for-website-account-sessions",
}));
vi.mock("./_core/env", () => ({ ENV: envState }));

import {
  WEBSITE_SESSION_COOKIE,
  createAccountSession,
  hashPassword,
  normalizeAccountEmail,
  passwordProblem,
  readAccountSession,
  readSessionCookie,
  verifyPassword,
} from "./_core/websiteAccountAuth";

/**
 * These accounts belong to strangers on the open internet, and they sit in the
 * same application as the CRM. The tests that matter are the ones about
 * isolation: a token minted for the website must be useless anywhere else, and
 * a password must not be recoverable from what is stored.
 */

describe("normalizeAccountEmail", () => {
  it("lowercases and trims, so one person cannot hold two accounts", () => {
    expect(normalizeAccountEmail("  Investor@Example.COM ")).toBe("investor@example.com");
  });

  it("survives missing input", () => {
    expect(normalizeAccountEmail(undefined as any)).toBe("");
  });
});

describe("passwordProblem", () => {
  it("accepts an ordinary long password", () => {
    expect(passwordProblem("correct horse battery")).toBeNull();
  });

  it("rejects anything under ten characters", () => {
    expect(passwordProblem("Short1!")).toBe("Use at least 10 characters.");
  });

  it("rejects the passwords that appear in every breach list", () => {
    // Composition rules push people to "Password1!" and no further, so length
    // plus a short deny list is the rule here. These must not slip through.
    for (const weak of ["password123", "PASSWORD123", "12345678", "changeme"]) {
      expect(passwordProblem(weak)).not.toBeNull();
    }
  });

  it("rejects an absurdly long password rather than hashing it", () => {
    expect(passwordProblem("a".repeat(500))).toBe("That password is too long.");
  });
});

describe("password hashing", () => {
  it("never stores the password itself", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toContain("correct horse battery");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("produces a different hash each time, so two people sharing a password are not visibly matched", async () => {
    const [a, b] = await Promise.all([hashPassword("same password here"), hashPassword("same password here")]);
    expect(a).not.toBe(b);
  });

  it("verifies the right password and refuses the wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batteries", hash)).toBe(false);
  });

  it("refuses rather than throws when the stored hash is missing or corrupt", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-bcrypt-hash")).toBe(false);
  });
});

describe("session tokens", () => {
  const secret = "test-secret-for-website-account-sessions";

  beforeEach(() => {
    envState.cookieSecret = secret;
  });

  it("round-trips the account id", async () => {
    const token = await createAccountSession(4321);
    expect(await readAccountSession(token)).toBe(4321);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createAccountSession(4321);
    envState.cookieSecret = "a-completely-different-secret-value";
    expect(await readAccountSession(token)).toBeNull();
  });

  it("rejects a token for a different audience", async () => {
    // This is the isolation guarantee. A token issued for the partner portal,
    // or any other part of SavvyOS, must not authenticate an investor, and
    // vice versa. The audience is what enforces it.
    const { SignJWT } = await import("jose");
    const foreign = await new SignJWT({ websiteAccount: true, accountId: 1 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setAudience("savvy-partner-portal")
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + 60_000) / 1000))
      .sign(new TextEncoder().encode(secret));
    expect(await readAccountSession(foreign)).toBeNull();
  });

  it("rejects a correctly signed token that is not a website session", async () => {
    const { SignJWT } = await import("jose");
    const wrongShape = await new SignJWT({ accountId: 7 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setAudience("savvy-website-account")
      .setIssuedAt()
      .setExpirationTime(Math.floor((Date.now() + 60_000) / 1000))
      .sign(new TextEncoder().encode(secret));
    expect(await readAccountSession(wrongShape)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await createAccountSession(99, -1000);
    expect(await readAccountSession(token)).toBeNull();
  });

  it("rejects an account id that is not a positive integer", async () => {
    const { SignJWT } = await import("jose");
    for (const accountId of [0, -5, 1.5, "abc"]) {
      const token = await new SignJWT({ websiteAccount: true, accountId })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setAudience("savvy-website-account")
        .setIssuedAt()
        .setExpirationTime(Math.floor((Date.now() + 60_000) / 1000))
        .sign(new TextEncoder().encode(secret));
      expect(await readAccountSession(token)).toBeNull();
    }
  });

  it("treats junk and absent tokens as signed out rather than throwing", async () => {
    expect(await readAccountSession(null)).toBeNull();
    expect(await readAccountSession("")).toBeNull();
    expect(await readAccountSession("not.a.jwt")).toBeNull();
  });
});

describe("readSessionCookie", () => {
  const req = (cookie: string) => ({ headers: { cookie } }) as any;

  it("finds the cookie among others", () => {
    expect(readSessionCookie(req(`other=1; ${WEBSITE_SESSION_COOKIE}=abc123; third=x`))).toBe("abc123");
  });

  it("does not match a cookie whose name merely ends with ours", () => {
    // "savvy_website_session_backup=..." must not be read as the session.
    expect(readSessionCookie(req(`not_${WEBSITE_SESSION_COOKIE}=abc123`))).toBeNull();
  });

  it("returns nothing when there are no cookies at all", () => {
    expect(readSessionCookie({ headers: {} } as any)).toBeNull();
  });
});
