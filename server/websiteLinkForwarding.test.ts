import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  LINK_FORWARDING_OFF,
  forwardedPath,
  forwardingCheckUrl,
  forwardingExample,
  forwardingTarget,
  isForwardSourceHost,
  normalizeTargetOrigin,
} from "@shared/websiteLinkForwarding";
import { WEBSITE_LINK_FORWARDING_DDL } from "./websiteLinkForwardingSchema";

const ON_DROP = { enabled: true, targetOrigin: "https://savvy-agents.com", keepBasePath: false };
const ON_KEEP = { enabled: true, targetOrigin: "https://savvy-agents.com", keepBasePath: true };
const BIRDIE =
  "/newsite/properties/8188-clover-spring-lane?utm_source=instagram&utm_medium=social&utm_campaign=oct-reels&utm_term=str&utm_content=reel-3";

const req = (originalUrl: string, host = "home.savvy-agents.com") => ({
  host,
  path: originalUrl.split("?")[0],
  originalUrl,
});

describe("forwardingTarget", () => {
  it("does nothing while forwarding is off", () => {
    expect(forwardingTarget(req(BIRDIE), LINK_FORWARDING_OFF)).toBeNull();
    expect(forwardingTarget(req(BIRDIE), { ...ON_DROP, enabled: false })).toBeNull();
  });

  it("keeps all five UTMs exactly as they arrived", () => {
    expect(forwardingTarget(req(BIRDIE), ON_DROP)).toBe(
      "https://savvy-agents.com/properties/8188-clover-spring-lane?utm_source=instagram&utm_medium=social&utm_campaign=oct-reels&utm_term=str&utm_content=reel-3"
    );
  });

  it("keeps /newsite when the new address still has it", () => {
    expect(forwardingTarget(req(BIRDIE), ON_KEEP)).toBe(`https://savvy-agents.com${BIRDIE}`);
  });

  it("sends the site's home page to the new home page", () => {
    expect(forwardingTarget(req("/newsite"), ON_DROP)).toBe("https://savvy-agents.com/");
    expect(forwardingTarget(req("/newsite/"), ON_DROP)).toBe("https://savvy-agents.com/");
    expect(forwardingTarget(req("/newsite?utm_source=x"), ON_DROP)).toBe("https://savvy-agents.com/?utm_source=x");
    expect(forwardingTarget(req("/newsite"), ON_KEEP)).toBe("https://savvy-agents.com/newsite");
  });

  it("only touches /newsite pages on home.savvy-agents.com", () => {
    expect(forwardingTarget(req("/api/trpc/website.publicHome"), ON_DROP)).toBeNull();
    expect(forwardingTarget(req("/some-landing-page"), ON_DROP)).toBeNull();
    expect(forwardingTarget(req("/newsiteX"), ON_DROP)).toBeNull();
    expect(forwardingTarget(req(BIRDIE, "os.savvy-agents.com"), ON_DROP)).toBeNull();
    expect(forwardingTarget(req(BIRDIE, "savvy-agents.com"), ON_KEEP)).toBeNull();
    expect(forwardingTarget(req(BIRDIE, "www.home.savvy-agents.com"), ON_DROP)).not.toBeNull();
    expect(forwardingTarget(req(BIRDIE, "home.savvy-agents.com:443"), ON_DROP)).not.toBeNull();
  });

  it("never forwards to a saved address that points back at itself", () => {
    expect(forwardingTarget(req(BIRDIE), { ...ON_KEEP, targetOrigin: "https://home.savvy-agents.com" })).toBeNull();
  });

  it("drops an empty query string", () => {
    expect(forwardingTarget(req("/newsite/contact?"), ON_DROP)).toBe("https://savvy-agents.com/contact");
  });
});

describe("normalizeTargetOrigin", () => {
  it("accepts a plain https address, with or without the scheme", () => {
    expect(normalizeTargetOrigin("https://savvy-agents.com")).toEqual({ origin: "https://savvy-agents.com" });
    expect(normalizeTargetOrigin(" savvy-agents.com ")).toEqual({ origin: "https://savvy-agents.com" });
    expect(normalizeTargetOrigin("https://WWW.Savvy-Agents.com/")).toEqual({ origin: "https://www.savvy-agents.com" });
  });

  it("refuses what would break or loop", () => {
    for (const bad of [
      "",
      "http://savvy-agents.com",
      "https://savvy-agents.com/newsite",
      "https://savvy-agents.com?x=1",
      "https://savvy-agents.com:8443",
      "https://home.savvy-agents.com",
      "https://www.home.savvy-agents.com",
      "localhost",
      "not a url",
    ]) {
      expect("error" in normalizeTargetOrigin(bad)).toBe(true);
    }
  });
});

describe("helpers", () => {
  it("maps paths", () => {
    expect(forwardedPath("/newsite/agents/aaron-dominy", false)).toBe("/agents/aaron-dominy");
    expect(forwardedPath("/newsite/agents/aaron-dominy", true)).toBe("/newsite/agents/aaron-dominy");
    expect(forwardedPath("/other", false)).toBeNull();
  });

  it("recognises the source host only", () => {
    expect(isForwardSourceHost("home.savvy-agents.com")).toBe(true);
    expect(isForwardSourceHost("HOME.savvy-agents.com:443")).toBe(true);
    expect(isForwardSourceHost("savvy-agents.com")).toBe(false);
    expect(isForwardSourceHost(undefined)).toBe(false);
  });

  it("checks the new home page before switching on", () => {
    expect(forwardingCheckUrl("https://savvy-agents.com", false)).toBe("https://savvy-agents.com/");
    expect(forwardingCheckUrl("https://savvy-agents.com", true)).toBe("https://savvy-agents.com/newsite");
  });

  it("shows an example with UTMs kept", () => {
    expect(forwardingExample({ targetOrigin: "savvy-agents.com", keepBasePath: false }).to).toBe(
      "https://savvy-agents.com/properties?utm_source=instagram&utm_medium=social"
    );
    expect(forwardingExample({ targetOrigin: "", keepBasePath: false }).to).toBeNull();
  });
});

describe("wiring", () => {
  const index = readFileSync(path.resolve(import.meta.dirname, "_core/index.ts"), "utf8");

  it("creates its table at startup, off by default", () => {
    expect(WEBSITE_LINK_FORWARDING_DDL).toContain("CREATE TABLE IF NOT EXISTS `website_link_forwarding`");
    expect(WEBSITE_LINK_FORWARDING_DDL).toContain("`enabled` tinyint(1) NOT NULL DEFAULT 0");
    expect(index).toContain("await ensureWebsiteLinkForwardingSchema();");
  });

  it("runs before every other redirect", () => {
    const forwarding = index.indexOf("registerWebsiteLinkForwarding(app);");
    expect(forwarding).toBeGreaterThan(0);
    expect(forwarding).toBeLessThan(index.indexOf("registerLandingPageRedirects(app);"));
    expect(forwarding).toBeLessThan(index.indexOf("registerLegacySiteRedirects(app);"));
  });

  it("refuses to switch on until the new address answers", () => {
    const server = readFileSync(path.resolve(import.meta.dirname, "websiteLinkForwarding.ts"), "utf8");
    expect(server).toContain("const check = await checkForwardingTarget(targetOrigin, input.keepBasePath);");
    expect(server).toContain('res.redirect(301, to)');
  });
});
