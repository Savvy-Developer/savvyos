import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { isCrossSiteWrite, isTrustedOrigin, trustedOrigins } from "./_core/corsPolicy";

const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
const req = (method: string, p: string, origin?: string) =>
  ({ method, path: p, headers: origin ? { origin } : {} }) as any;

describe("trusted origins", () => {
  it("trusts our own hosts", () => {
    for (const origin of [
      "https://os.savvy-agents.com",
      "https://home.savvy-agents.com",
      "https://www.home.savvy-agents.com",
      "https://savvy-agents.com",
    ]) {
      expect(isTrustedOrigin(origin, prod)).toBe(true);
    }
  });

  it("does not trust other sites, look-alikes, null or plain http", () => {
    for (const origin of [
      "https://evil.example",
      "https://os.savvy-agents.com.evil.example",
      "https://evilsavvy-agents.com",
      "http://os.savvy-agents.com",
      "null",
      "",
    ]) {
      expect(isTrustedOrigin(origin, prod)).toBe(false);
    }
  });

  it("allows localhost only outside production", () => {
    expect(isTrustedOrigin("http://localhost:3000", prod)).toBe(false);
    expect(isTrustedOrigin("http://localhost:3000", { NODE_ENV: "development" } as any)).toBe(true);
  });

  it("adds hosts from CORS_TRUSTED_ORIGINS and PUBLIC_LANDING_PAGE_HOST", () => {
    const env = { ...prod, CORS_TRUSTED_ORIGINS: "https://a.example, b.example", PUBLIC_LANDING_PAGE_HOST: "site.example" } as any;
    const set = trustedOrigins(env);
    expect(set.has("https://a.example")).toBe(true);
    expect(set.has("https://b.example")).toBe(true);
    expect(set.has("https://site.example")).toBe(true);
    expect(set.has("https://www.site.example")).toBe(true);
  });
});

describe("cross-site writes", () => {
  it("refuses a state-changing /api call from another site", () => {
    expect(isCrossSiteWrite(req("POST", "/api/trpc/users.update", "https://evil.example"), prod)).toBe(true);
    expect(isCrossSiteWrite(req("POST", "/api/upload/headshot", "https://evil.example"), prod)).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", "/api/anything", "null"), prod)).toBe(true);
  });

  it("allows our own pages, reads, and calls with no Origin", () => {
    expect(isCrossSiteWrite(req("POST", "/api/trpc/x", "https://os.savvy-agents.com"), prod)).toBe(false);
    expect(isCrossSiteWrite(req("POST", "/api/trpc/x", "https://home.savvy-agents.com"), prod)).toBe(false);
    expect(isCrossSiteWrite(req("GET", "/api/trpc/x", "https://evil.example"), prod)).toBe(false);
    expect(isCrossSiteWrite(req("OPTIONS", "/api/trpc/x", "https://evil.example"), prod)).toBe(false);
    expect(isCrossSiteWrite(req("POST", "/api/trpc/x"), prod)).toBe(false);
  });

  it("leaves webhooks, scheduled jobs and unsubscribe alone", () => {
    for (const p of ["/api/webhooks/resend", "/api/webhooks/stripe", "/api/scheduled/duplicate-scan", "/api/unsubscribe"]) {
      expect(isCrossSiteWrite(req("POST", p, "https://evil.example"), prod)).toBe(false);
    }
  });

  it("ignores non-API paths", () => {
    expect(isCrossSiteWrite(req("POST", "/oauth/token", "https://client.example"), prod)).toBe(false);
  });
});

describe("wiring", () => {
  const index = readFileSync(path.join(__dirname, "_core/index.ts"), "utf8");

  it("only sends Allow-Credentials for trusted origins", () => {
    const block = index.slice(index.indexOf("isCrossSiteWrite(req)"), index.indexOf("if (req.method === \"OPTIONS\")"));
    expect(block).toContain("if (isTrustedOrigin(origin))");
    const credentials = block.indexOf("Access-Control-Allow-Credentials");
    expect(credentials).toBeGreaterThan(block.indexOf("if (isTrustedOrigin(origin))"));
  });

  it("never echoes credentials unconditionally any more", () => {
    expect(index).not.toMatch(/res\.setHeader\("Access-Control-Allow-Origin", origin\);\s*res\.setHeader\("Access-Control-Allow-Credentials", "true"\)/);
  });
});
