import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_THROTTLE_RULES,
  SlidingWindowThrottle,
  allowAccountAttempt,
  clientIp,
  throttleKey,
} from "./websiteAccountThrottle";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("SlidingWindowThrottle", () => {
  it("allows up to the limit, then refuses until the window passes", () => {
    const c = clock();
    const t = new SlidingWindowThrottle(c.now);
    const rule = { limit: 3, windowMs: 60_000 };
    expect([1, 2, 3].map(() => t.attempt("k", rule))).toEqual([true, true, true]);
    expect(t.attempt("k", rule)).toBe(false);
    c.advance(30_000);
    expect(t.attempt("k", rule)).toBe(false);
    c.advance(30_001);
    expect(t.attempt("k", rule)).toBe(true);
  });

  it("does not count refused attempts, so waiting always works", () => {
    const c = clock();
    const t = new SlidingWindowThrottle(c.now);
    const rule = { limit: 1, windowMs: 1_000 };
    t.attempt("k", rule);
    for (let i = 0; i < 50; i += 1) t.attempt("k", rule);
    c.advance(1_001);
    expect(t.attempt("k", rule)).toBe(true);
  });

  it("forgets idle keys so memory does not grow forever", () => {
    const c = clock();
    const t = new SlidingWindowThrottle(c.now);
    for (let i = 0; i < 100; i += 1) t.attempt(`k${i}`, { limit: 5, windowMs: 1_000 });
    c.advance(2 * 60 * 60 * 1000);
    t.attempt("fresh", { limit: 5, windowMs: 1_000 });
    expect(t.size()).toBe(1);
  });
});

describe("allowAccountAttempt", () => {
  it("stops password guessing against one address after ten tries", () => {
    const t = new SlidingWindowThrottle(clock().now);
    const tries = Array.from({ length: 12 }, (_, i) =>
      allowAccountAttempt(
        [
          { scope: "signInPerEmail", value: "Investor@Example.com" },
          { scope: "signInPerIp", value: `10.0.0.${i}` },
        ],
        t
      )
    );
    expect(tries.filter(Boolean)).toHaveLength(ACCOUNT_THROTTLE_RULES.signInPerEmail.limit);
    expect(tries[11]).toBe(false);
  });

  it("treats an address the same whatever its case or spacing", () => {
    expect(throttleKey("resetPerEmail", " A@B.com ")).toBe(throttleKey("resetPerEmail", "a@b.com"));
    expect(throttleKey("resetPerEmail", "a@b.com")).not.toContain("a@b.com");
  });
});

describe("clientIp", () => {
  it("uses the address Railway appended, not one the client supplied", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 9.9.9.9" } })).toBe("9.9.9.9");
    expect(clientIp({ headers: {}, ip: "5.5.5.5" })).toBe("5.5.5.5");
  });
});

describe("wiring", () => {
  const router = readFileSync(
    path.resolve(import.meta.dirname, "routers/websiteAccount.ts"),
    "utf8"
  ).replace(/\r\n/g, "\n");

  it("checks the limit on sign in, sign up and password reset", () => {
    for (const scope of ["signInPerEmail", "signInPerIp", "signUpPerIp", "resetPerEmail", "resetPerIp"]) {
      expect(router).toContain(`scope: "${scope}"`);
    }
  });

  it("answers an over-limit reset like any other, so it reveals nothing", () => {
    const reset = router.slice(router.indexOf("requestPasswordReset:"), router.indexOf("resetPassword:"));
    const throttled = reset.slice(reset.indexOf("allowAccountAttempt"), reset.indexOf("const db"));
    expect(throttled).toContain("return NEUTRAL_RESET_REPLY");
    expect(throttled).not.toContain("TRPCError");
  });
});
