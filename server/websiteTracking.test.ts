import { describe, expect, it } from "vitest";

import {
  injectWebsiteTags,
  isWebsitePageRequest,
  websiteClarityId,
  websiteGtmId,
  websiteTagsForRequest,
} from "./websiteTracking";

const req = (host: string, path: string) => ({ hostname: host, headers: { host }, path }) as any;

describe("website analytics tags", () => {
  it("loads the old site's Tag Manager container and Clarity by default", () => {
    expect(websiteGtmId({})).toBe("GTM-NHP839WJ");
    expect(websiteClarityId({})).toBe("x7g7afshlc");
  });

  it("can be switched off or changed from the environment, and ignores junk", () => {
    expect(websiteGtmId({ WEBSITE_GTM_ID: "off" })).toBeNull();
    expect(websiteGtmId({ WEBSITE_GTM_ID: "GTM-ABC1234" })).toBe("GTM-ABC1234");
    expect(websiteGtmId({ WEBSITE_GTM_ID: "GTM-1');alert(1)//" })).toBeNull();
    expect(websiteClarityId({ WEBSITE_CLARITY_ID: "OFF" })).toBeNull();
  });

  it("only tags public website pages, never the SavvyOS app or landing pages", () => {
    expect(isWebsitePageRequest("home.savvy-agents.com", "/newsite")).toBe(true);
    expect(isWebsitePageRequest("home.savvy-agents.com", "/newsite/sign-in")).toBe(true);
    expect(isWebsitePageRequest("home.savvy-agents.com:443", "/newsite/properties/x")).toBe(true);
    expect(isWebsitePageRequest("os.savvy-agents.com", "/newsite")).toBe(false);
    expect(isWebsitePageRequest("home.savvy-agents.com", "/some-landing-page")).toBe(false);
    expect(isWebsitePageRequest("home.savvy-agents.com", "/newsiteX")).toBe(false);
  });

  it("puts the container first in head and the noscript first in body", () => {
    const tags = websiteTagsForRequest(req("home.savvy-agents.com", "/newsite/sell"), {});
    const html = injectWebsiteTags("<html><head><title>x</title></head><body><div id=\"root\"></div></body></html>", tags);
    expect(html).toMatch(/<head>\s*<script>\(function\(w,d,s,l,i\)/);
    expect(html).toContain("GTM-NHP839WJ");
    expect(html).toContain("www.clarity.ms/tag/");
    expect(html).toMatch(/<body>\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-NHP839WJ"/);
  });

  it("leaves other pages untouched", () => {
    const tags = websiteTagsForRequest(req("os.savvy-agents.com", "/contacts"), {});
    expect(tags).toBeNull();
    expect(injectWebsiteTags("<head></head>", tags)).toBe("<head></head>");
  });
});
