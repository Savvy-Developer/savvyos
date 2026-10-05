import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import path from "node:path";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  WEBSITE_PATH_REDIRECTS,
  WEBSITE_PATH_REDIRECT_ERRORS,
  buildPathRedirectTable,
  websitePathRedirectTarget,
} from "@shared/websitePathRedirects";
import { legacyTarget, resolveLegacyTarget } from "./legacySiteRedirectRules";
import { registerWebsitePathRedirects } from "./websitePathRedirects";

const OLD = "/newsite/properties/overlook-glendale-ut";
const NEW = "/newsite/properties/360-e-overlook-ln-glendale-t7in53";

describe("websitePathRedirectTarget", () => {
  it("redirects the retired Overlook listing address to its new slug", () => {
    expect(websitePathRedirectTarget(OLD)).toBe(NEW);
  });

  it("leaves every other address alone", () => {
    for (const p of [NEW, "/newsite", "/newsite/properties", "/properties/overlook-glendale-ut", "/api/trpc/x", "/"]) {
      expect(websitePathRedirectTarget(p)).toBeNull();
    }
  });

  it("keeps the query string exactly as it arrived", () => {
    expect(websitePathRedirectTarget(OLD, `${OLD}?utm_source=meta&utm_campaign=fall&fbclid=abc`)).toBe(
      `${NEW}?utm_source=meta&utm_campaign=fall&fbclid=abc`
    );
    expect(websitePathRedirectTarget(OLD, `${OLD}?`)).toBe(NEW);
  });

  it("matches with a trailing slash, doubled slashes or different case", () => {
    expect(websitePathRedirectTarget(`${OLD}/`, `${OLD}/?a=1`)).toBe(`${NEW}?a=1`);
    expect(websitePathRedirectTarget("/newsite//properties/Overlook-Glendale-UT")).toBe(NEW);
  });

  it("ships a valid list: same-site targets, no loops, no chains, no duplicates", () => {
    expect(WEBSITE_PATH_REDIRECT_ERRORS).toEqual([]);
    for (const entry of WEBSITE_PATH_REDIRECTS) {
      expect(entry.from.startsWith("/newsite/")).toBe(true);
      expect(entry.to.startsWith("/newsite/")).toBe(true);
      expect(entry.reason.trim()).not.toBe("");
    }
  });
});

describe("buildPathRedirectTable", () => {
  const entry = (from: string, to: string) => ({ from, to, reason: "test" });

  it("rejects loops", () => {
    const table = buildPathRedirectTable([entry("/newsite/a", "/newsite/b"), entry("/newsite/b", "/newsite/a")]);
    expect(table.targets.size).toBe(0);
    expect(table.errors).toHaveLength(2);
    expect(websitePathRedirectTarget("/newsite/a", "/newsite/a", table)).toBeNull();
  });

  it("rejects a redirect to itself, even with a trailing slash", () => {
    const table = buildPathRedirectTable([entry("/newsite/a/", "/newsite/a")]);
    expect(table.targets.size).toBe(0);
    expect(table.errors[0]).toMatch(/itself/);
  });

  it("rejects chains but keeps the final hop", () => {
    const table = buildPathRedirectTable([entry("/newsite/a", "/newsite/b"), entry("/newsite/b", "/newsite/c")]);
    expect(websitePathRedirectTarget("/newsite/a", "/newsite/a", table)).toBeNull();
    expect(websitePathRedirectTarget("/newsite/b", "/newsite/b", table)).toBe("/newsite/c");
    expect(table.errors.join(" ")).toMatch(/final page/);
  });

  it("only allows relative targets on this site", () => {
    const table = buildPathRedirectTable([
      entry("/newsite/a", "https://evil.example/x"),
      entry("/newsite/b", "//evil.example/x"),
      entry("/newsite/c", "/admin/users"),
      entry("/newsite/d", "/newsite/../admin"),
      entry("/elsewhere", "/newsite/x"),
      entry("/newsite/e?x=1", "/newsite/x"),
    ]);
    expect(table.targets.size).toBe(0);
    expect(table.errors).toHaveLength(6);
  });

  it("rejects the same old address listed twice", () => {
    const table = buildPathRedirectTable([entry("/newsite/a", "/newsite/b"), entry("/newsite/A/", "/newsite/c")]);
    expect(websitePathRedirectTarget("/newsite/a", "/newsite/a", table)).toBe("/newsite/b");
    expect(table.errors).toHaveLength(1);
  });
});

describe("old savvy-agents.com addresses use the table too", () => {
  const redirectFor = (p: string) => websitePathRedirectTarget(p);

  it("sends an old listing slug straight to the renamed listing, in one hop", () => {
    const target = legacyTarget("/properties/608-touchstone-circle-port-orange-3h6m91")!;
    expect(resolveLegacyTarget(target, false, redirectFor)).toEqual({
      to: "/newsite/properties/608-touchstone-circle-port-orange",
      permanent: true,
    });
  });

  it("sends a renamed market to its new address", () => {
    const target = legacyTarget("/markets/fl/daytona")!;
    expect(resolveLegacyTarget(target, false, redirectFor)).toEqual({
      to: "/newsite/markets/fl/daytona-beach",
      permanent: true,
    });
  });

  it("changes nothing for addresses not in the table", () => {
    const target = legacyTarget("/properties/some-old-listing")!;
    expect(resolveLegacyTarget(target, false, redirectFor)).toEqual({ to: "/newsite/properties", permanent: false });
  });
});

describe("the Express hook", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    const app = express();
    registerWebsitePathRedirects(app);
    app.use((_req, res) => res.status(200).send("page"));
    await new Promise<void>(resolve => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  it("answers 301 with the new address and the query string", async () => {
    const res = await fetch(`${base}${OLD}/?utm_source=ig`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${NEW}?utm_source=ig`);
  });

  it("serves everything else as usual", async () => {
    for (const p of [NEW, "/newsite/properties", "/api/trpc/website.publicHome"]) {
      const res = await fetch(`${base}${p}`, { redirect: "manual" });
      expect(res.status).toBe(200);
    }
    const post = await fetch(`${base}${OLD}`, { method: "POST", redirect: "manual" });
    expect(post.status).toBe(200);
  });
});

describe("wiring", () => {
  it("runs after the hand-made redirects and before the old-site redirects", () => {
    const index = readFileSync(path.resolve(import.meta.dirname, "_core/index.ts"), "utf8");
    const handMade = index.indexOf("registerLandingPageRedirects(app)");
    const paths = index.indexOf("registerWebsitePathRedirects(app)");
    const legacy = index.indexOf("registerLegacySiteRedirects(app)");
    expect(handMade).toBeGreaterThan(-1);
    expect(paths).toBeGreaterThan(handMade);
    expect(legacy).toBeGreaterThan(paths);
  });
});
