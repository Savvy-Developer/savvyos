import { describe, expect, it } from "vitest";

import {
  isDailyEmailEngagementCandidate,
  isScheduledSendDue,
  linkKeyFromUrl,
  parseEmailList,
  renderBroadcastEmail,
  renderSubject,
  runIdFromTags,
  trackedUrl,
  type BroadcastListing,
} from "./websiteDailyEmailLogic";

const listing = (overrides: Partial<BroadcastListing> = {}): BroadcastListing => ({
  propertyId: 1,
  slug: "88-creekside-lane-gatlinburg",
  headline: "Creekside cabin with mountain views",
  address: "88 Creekside Lane",
  city: "Gatlinburg",
  state: "TN",
  listPrice: "725000",
  beds: "4",
  baths: "3.5",
  heroImageUrl: "https://example.com/hero.jpg",
  ...overrides,
});

describe("renderSubject", () => {
  it("reads correctly for one listing and for many with no template", () => {
    expect(renderSubject(null, 1)).toBe("A new STR investment property");
    expect(renderSubject("", 4)).toBe("4 new STR investment properties");
  });

  it("fills {count} in a custom subject", () => {
    expect(renderSubject("Fresh today: {count} STR deals", 3)).toBe("Fresh today: 3 STR deals");
    expect(renderSubject("No count here", 3)).toBe("No count here");
  });
});

describe("trackedUrl", () => {
  it("adds the campaign tags with the right separator", () => {
    expect(trackedUrl("https://x.com/a", "2026-09-24")).toBe(
      "https://x.com/a?utm_source=savvy&utm_medium=email&utm_campaign=daily-properties-2026-09-24"
    );
    expect(trackedUrl("https://x.com/a?b=1", "2026-09-24")).toContain("?b=1&utm_source=savvy");
  });
});

describe("renderBroadcastEmail", () => {
  const { html, text } = renderBroadcastEmail({
    listings: [listing(), listing({ propertyId: 2, slug: "second", headline: "<b>Lake</b> house" })],
    subject: "2 new STR investment properties",
    intro: null,
    runDate: "2026-09-24",
  });

  it("links each listing on the public site with tracking", () => {
    expect(html).toContain(
      "https://home.savvy-agents.com/newsite/properties/88-creekside-lane-gatlinburg?utm_source=savvy"
    );
    expect(text).toContain("/newsite/properties/second?utm_source=savvy");
  });

  it("shows only public facts", () => {
    expect(html).toContain("$725,000");
    expect(html).toContain("4 bed");
    expect(html).toContain("3.5 bath");
    expect(html.toLowerCase()).not.toContain("cash on cash");
    expect(html.toLowerCase()).not.toContain("cap rate");
  });

  it("escapes headlines", () => {
    expect(html).toContain("&lt;b&gt;Lake&lt;/b&gt; house");
    expect(html).not.toContain("<b>Lake</b>");
  });

  it("uses Resend's unsubscribe placeholder unless told otherwise", () => {
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(text).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    const copy = renderBroadcastEmail({
      listings: [listing()],
      subject: "s",
      intro: "Hello team",
      runDate: "2026-09-24",
      unsubscribeUrl: "https://example.com/prefs",
    });
    expect(copy.html).toContain("https://example.com/prefs");
    expect(copy.html).not.toContain("RESEND_UNSUBSCRIBE_URL");
    expect(copy.html).toContain("Hello team");
  });
});

describe("isScheduledSendDue", () => {
  const base = {
    enabled: true,
    masterSwitch: true,
    sendHourEt: 17,
    easternHour: 17,
    alreadySentToday: false,
  };

  it("is due from the chosen hour for three hours", () => {
    expect(isScheduledSendDue(base)).toBe(true);
    expect(isScheduledSendDue({ ...base, easternHour: 19 })).toBe(true);
    expect(isScheduledSendDue({ ...base, easternHour: 16 })).toBe(false);
    expect(isScheduledSendDue({ ...base, easternHour: 20 })).toBe(false);
  });

  it("never fires twice, or with either switch off", () => {
    expect(isScheduledSendDue({ ...base, alreadySentToday: true })).toBe(false);
    expect(isScheduledSendDue({ ...base, enabled: false })).toBe(false);
    expect(isScheduledSendDue({ ...base, masterSwitch: false })).toBe(false);
  });
});

describe("linkKeyFromUrl", () => {
  it("returns the property slug, or other", () => {
    expect(
      linkKeyFromUrl("https://home.savvy-agents.com/newsite/properties/88-creekside?utm_source=savvy")
    ).toBe("88-creekside");
    expect(linkKeyFromUrl("https://home.savvy-agents.com/newsite/properties?utm_source=savvy")).toBe("other");
    expect(linkKeyFromUrl(null)).toBe("other");
  });
});

describe("runIdFromTags", () => {
  it("reads the run from object or array tags", () => {
    expect(runIdFromTags({ daily_email_run: "12" })).toBe(12);
    expect(runIdFromTags([{ name: "daily_email_run", value: "7" }])).toBe(7);
    expect(runIdFromTags({ other: "1" })).toBeNull();
    expect(runIdFromTags(undefined)).toBeNull();
    expect(runIdFromTags({ daily_email_run: "abc" })).toBeNull();
  });
});

describe("parseEmailList", () => {
  it("splits, lowercases, drops junk and duplicates", () => {
    expect(parseEmailList("A@x.com, b@y.com\nnot-an-email; a@X.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
});

describe("isDailyEmailEngagementCandidate", () => {
  it("accepts opens and clicks with our tag or a broadcast ID", () => {
    expect(
      isDailyEmailEngagementCandidate({
        type: "email.opened",
        data: { email_id: "e1", tags: { daily_email_run: "4" } },
      })
    ).toBe(true);
    expect(
      isDailyEmailEngagementCandidate({
        type: "email.clicked",
        data: { email_id: "e1", broadcast_id: "b1" },
      })
    ).toBe(true);
  });

  it("skips everything else", () => {
    expect(
      isDailyEmailEngagementCandidate({ type: "email.delivered", data: { email_id: "e1", broadcast_id: "b1" } })
    ).toBe(false);
    expect(isDailyEmailEngagementCandidate({ type: "email.opened", data: { email_id: "e1" } })).toBe(false);
    expect(isDailyEmailEngagementCandidate({ type: "email.opened", data: { broadcast_id: "b1" } })).toBe(false);
    expect(isDailyEmailEngagementCandidate(null)).toBe(false);
  });
});
