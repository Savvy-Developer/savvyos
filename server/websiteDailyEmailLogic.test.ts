import { describe, expect, it } from "vitest";

import {
  BOOK_A_CALL_URL,
  DEFAULT_DEALS_FROM,
  DEFAULT_DEALS_REPLY_TO,
  DEFAULT_SEND_HOUR_ET,
  EMAIL_LOGO_WHITE_URL,
  OLD_SITE_DIGEST_SEGMENTS,
  dealsSender,
  digestHeadline,
  digestSubLine,
  resolveDailyEmailSettings,
  roiPercent,
  MARKETING_POSTAL_ADDRESS,
  BLURB_LINE_CHARS,
  BLURB_MAX_LINES,
  SUBJECT_MAX_LENGTH,
  blurbHeading,
  clampBlurb,
  creativeSubject,
  renderBlurbHtml,
  renderBlurbText,
  shortMoney,
  isDailyEmailEngagementCandidate,
  isScheduledSendDue,
  listUnsubscribeHeaders,
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

describe("the subject written from the day's listings", () => {
  const batch = [
    listing(),
    listing({ propertyId: 2, city: "Destin", state: "FL", listPrice: "1250000" }),
    listing({ propertyId: 3, city: "Blue Ridge", state: "GA", listPrice: "529000" }),
  ];
  const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];

  it("is used when no custom subject is saved, and only then", () => {
    const written = renderSubject(null, batch.length, { listings: batch, runDate: "2026-10-05" });
    expect(written).not.toBe("3 new STR investment properties");
    expect(written).toBe(creativeSubject({ listings: batch, runDate: "2026-10-05" }));
    expect(renderSubject("Fresh today: {count} STR deals", 3, { listings: batch, runDate: "2026-10-05" })).toBe(
      "Fresh today: 3 STR deals"
    );
  });

  it("is the same for the same day and listings, so preview, test and send match", () => {
    for (const runDate of days) {
      expect(creativeSubject({ listings: batch, runDate })).toBe(creativeSubject({ listings: batch, runDate }));
    }
  });

  it("never reads the same two days in a row, and uses at least six wordings in a week", () => {
    const week = days.map(runDate => creativeSubject({ listings: batch, runDate }));
    for (let index = 1; index < week.length; index += 1) expect(week[index]).not.toBe(week[index - 1]);
    expect(new Set(week).size).toBeGreaterThanOrEqual(6);
  });

  it("says how many, where and the price range, and fits an inbox", () => {
    const week = days.map(runDate => creativeSubject({ listings: batch, runDate }) as string);
    for (const subject of week) {
      expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
      expect(subject).not.toMatch(/—/);
    }
    const all = week.join(" | ");
    expect(all).toContain("3 new STRs in Gatlinburg, Destin and 1 more");
    expect(all).toContain("Just listed: 3 STRs from $529K to $1.25M");
    expect(all).toContain("starting at $529K");
  });

  it("reads correctly for a single listing", () => {
    const week = days.map(runDate => creativeSubject({ listings: [listing()], runDate }) as string);
    for (const subject of week) {
      expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
      expect(subject).not.toMatch(/\b1 new STRs\b|\b1 STRs\b/);
    }
    const all = week.join(" | ");
    expect(all).toContain("New in Gatlinburg: 4-bed STR at $725K");
    expect(all).toContain("Just listed: Creekside cabin with mountain views");
  });

  it("never puts revenue or returns in the subject", () => {
    const gated = batch.map(item => ({ ...item, projectedRevenue: "98000", cashOnCash: "0.114", capRate: "0.072" }));
    for (const runDate of days) {
      const subject = creativeSubject({ listings: gated as any, runDate }) as string;
      expect(subject).not.toMatch(/98|11\.4|7\.2|ROI|revenue|cash/i);
    }
  });

  it("copes with listings that have no city or no price", () => {
    const bare = [
      listing({ city: null, state: null, listPrice: null }),
      listing({ propertyId: 2, city: null, state: null, listPrice: null }),
    ];
    expect(creativeSubject({ listings: bare, runDate: "2026-10-05" })).toBeNull();
    expect(renderSubject(null, 2, { listings: bare, runDate: "2026-10-05" })).toBe("2 new STR investment properties");
    expect(creativeSubject({ listings: [], runDate: "2026-10-05" })).toBeNull();
    const noPrice = [listing({ listPrice: null }), listing({ propertyId: 2, city: "Destin", listPrice: null })];
    for (const runDate of days) {
      expect(creativeSubject({ listings: noPrice, runDate })).toMatch(/Gatlinburg and Destin/);
    }
  });

  it("names one place and counts the rest when two names would not fit", () => {
    const long = [
      listing({ city: "Treasure Coast Cocoa Beach" }),
      listing({ propertyId: 2, city: "Pompano Beach Fort Lauderdale" }),
      listing({ propertyId: 3, city: "Destin" }),
    ];
    for (const runDate of days) {
      const subject = creativeSubject({ listings: long, runDate }) as string;
      expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
    }
  });

  it("writes short prices", () => {
    expect(shortMoney("529000")).toBe("$529K");
    expect(shortMoney(1250000)).toBe("$1.25M");
    expect(shortMoney(2000000)).toBe("$2M");
    expect(shortMoney(1200000)).toBe("$1.2M");
    expect(shortMoney(null)).toBeNull();
    expect(shortMoney("0")).toBeNull();
  });
});

describe("the Why I like this block", () => {
  const url = "https://home.savvy-agents.com/newsite/properties/88-creekside-lane-gatlinburg?utm_source=savvy";
  const long =
    "Prime location in downtown Lawrenceburg! This mixed use commercial property includes 3 gorgeous studio Short Term Rentals, " +
    "a restaurant space currently leased through April 2029, and another commercial space currently leased by the Lawrenceburg " +
    "Tourism Office. YTD 2026 revenue on Airbnb/VRBO is strong, but the seller mentioned they did not have operations optimized " +
    "until May. Per AirDNA, one bedrooms here should do well, and there is room to add a fourth unit upstairs with separate access.";

  it("shows a short blurb in full, with no link", () => {
    const { lines, truncated } = clampBlurb("The creek frontage is the whole deal here.");
    expect(lines).toEqual(["The creek frontage is the whole deal here."]);
    expect(truncated).toBe(false);
    const html = renderBlurbHtml({ agentBlurb: "The creek frontage is the whole deal here.", agentName: "Liz Davis" }, url);
    expect(html).toContain("Why Liz Davis likes this property");
    expect(html).toContain("The creek frontage is the whole deal here.");
    expect(html).not.toContain("See more...");
  });

  it("cuts a long blurb to five lines on a word, with a See more link to the listing", () => {
    const { lines, truncated } = clampBlurb(long);
    expect(truncated).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeLessThanOrEqual(BLURB_MAX_LINES * BLURB_LINE_CHARS);
    expect(lines[0].endsWith("...")).toBe(true);
    // The cut text is the start of the original, ending on a whole word.
    const kept = lines[0].slice(0, -3);
    expect(long.startsWith(kept)).toBe(true);
    expect(long.charAt(kept.length)).toMatch(/[\s,;:.!?-]/);
    const html = renderBlurbHtml({ agentBlurb: long, agentName: "Liz Davis" }, url);
    expect(html).toContain(`<a href="${url.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("See more...</a>");
    expect(html).not.toContain("separate access");
  });

  it("counts the agent's own line breaks as lines", () => {
    const { lines, truncated } = clampBlurb("One\nTwo\n\nThree\r\nFour\nFive\nSix\nSeven");
    expect(lines).toEqual(["One", "Two", "Three", "Four", "Five"]);
    expect(truncated).toBe(true);
    const five = clampBlurb("One\nTwo\nThree\nFour\nFive");
    expect(five.lines).toHaveLength(5);
    expect(five.truncated).toBe(false);
  });

  it("renders nothing for a listing with no blurb", () => {
    expect(renderBlurbHtml({ agentBlurb: null, agentName: "Liz Davis" }, url)).toBe("");
    expect(renderBlurbHtml({ agentBlurb: "   \n  ", agentName: "Liz Davis" }, url)).toBe("");
    expect(renderBlurbHtml({}, url)).toBe("");
    expect(renderBlurbText({ agentBlurb: "" }, url)).toEqual([]);
  });

  it("escapes the blurb and the agent's name", () => {
    const html = renderBlurbHtml({ agentBlurb: "Great <script>alert(1)</script> views", agentName: "A <b>B</b>" }, url);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Why A &lt;b&gt;B&lt;/b&gt; likes this property");
  });

  it("has a plain heading when the listing has no agent", () => {
    expect(blurbHeading(null)).toBe("Why we like this property");
    expect(blurbHeading("  Liz   Davis ")).toBe("Why Liz Davis likes this property");
  });

  it("appears in the shared email, HTML and plain text, only on listings that have one", () => {
    const { html, text } = renderBroadcastEmail({
      listings: [
        listing({ agentBlurb: long, agentName: "Liz Davis" }),
        listing({ propertyId: 2, slug: "second", agentBlurb: null, agentName: "Sam Roe" }),
      ],
      subject: "x",
      intro: null,
      runDate: "2026-10-05",
    });
    expect(html.match(/likes this property/g)).toHaveLength(1);
    expect(html).toContain("Why Liz Davis likes this property");
    expect(html).toContain("See more...</a>");
    expect(html).not.toContain("Why Sam Roe likes this property");
    expect(text).toContain("Why Liz Davis likes this property");
    expect(text).toContain(
      "See more: https://home.savvy-agents.com/newsite/properties/88-creekside-lane-gatlinburg?utm_source=savvy"
    );
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

  it("shows price, rooms, and ROI and revenue where the listing has them", () => {
    expect(html).toContain("$725,000");
    expect(html).toContain("4 bd &middot; 3.5 ba");
    const withFigures = renderBroadcastEmail({
      listings: [listing({ projectedRevenue: "98000", cashOnCash: "0.114", sqft: 2100 })],
      subject: "s",
      intro: null,
      runDate: "2026-09-24",
    });
    expect(withFigures.html).toContain("11.4% ROI");
    expect(withFigures.html).toContain("$98,000 / yr projected revenue");
    expect(withFigures.html).toContain("2,100 sqft");
    expect(withFigures.text).toContain("$725,000 · 11.4% ROI");
    // Cap rate and occupancy were never in the old digest and stay out.
    expect(html.toLowerCase()).not.toContain("cap rate");
    expect(html).not.toContain("% ROI");
  });

  it("has the logo, the Book a Call block and the agent's photo by the note", () => {
    expect(html).toContain(`src="${EMAIL_LOGO_WHITE_URL}"`);
    expect(html).toContain("Book a Call with Our Market Advisors Today");
    expect(html).toContain(`${BOOK_A_CALL_URL}?utm_source=savvy`);
    const withAgent = renderBroadcastEmail({
      listings: [listing({ agentBlurb: "Great creek.", agentName: "Liz Davis", agentPhotoUrl: "https://example.com/liz.jpg" })],
      subject: "s",
      intro: null,
      runDate: "2026-09-24",
    });
    expect(withAgent.html).toContain('src="https://example.com/liz.jpg"');
    expect(withAgent.html).toContain("Why Liz Davis likes this property");
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

  it("carries the postal address the old digest had in its footer (CAN-SPAM)", () => {
    expect(MARKETING_POSTAL_ADDRESS).toBe("Savvy STR Agents, 37 Haywood St., #300, Asheville, NC 28801");
    expect(html).toContain(MARKETING_POSTAL_ADDRESS);
    expect(text).toContain(MARKETING_POSTAL_ADDRESS);
  });
});

describe("the old site's digest, as defaults", () => {
  it("sends from the deals lane, overridable by EMAIL_FROM_DEALS and EMAIL_REPLY_TO_DEALS", () => {
    expect(DEFAULT_DEALS_FROM).toBe("Savvy <deals@deals.savvy-agents.com>");
    expect(dealsSender({})).toEqual({ from: DEFAULT_DEALS_FROM, replyTo: DEFAULT_DEALS_REPLY_TO });
    expect(dealsSender({ EMAIL_FROM_DEALS: " Team <a@b.com> ", EMAIL_REPLY_TO_DEALS: "r@b.com" })).toEqual({
      from: "Team <a@b.com>",
      replyTo: "r@b.com",
    });
  });

  it("goes to the old digest's three lists at 5 PM Eastern when nothing was saved", () => {
    expect(OLD_SITE_DIGEST_SEGMENTS.map(segment => segment.name)).toEqual([
      "All Savvy-Agent Users",
      "Old Lofty Leads",
      "Platform Leads",
    ]);
    const settings = resolveDailyEmailSettings(null);
    expect(settings.segmentIds).toEqual(OLD_SITE_DIGEST_SEGMENTS.map(segment => segment.id));
    // No coded internal recipient: the copy goes to the Email Notifications list.
    expect(settings.internalRecipients).toEqual([]);
    expect(settings.sendHourEt).toBe(17);
    expect(DEFAULT_SEND_HOUR_ET).toBe(17);
    expect(settings.enabled).toBe(false);
    expect(settings.personalEmailsEnabled).toBe(true);
  });

  it("uses the old lists for a saved row that never chose any (null), but keeps a choice of none", () => {
    const row = { enabled: 0, sendHourEt: 17, segmentIds: null, internalRecipients: null, personalEmailsEnabled: 1 };
    expect(resolveDailyEmailSettings(row).segmentIds).toHaveLength(3);
    expect(resolveDailyEmailSettings({ ...row, segmentIds: [] }).segmentIds).toEqual([]);
    expect(resolveDailyEmailSettings({ ...row, internalRecipients: [] }).internalRecipients).toEqual([]);
    expect(resolveDailyEmailSettings({ ...row, segmentIds: ["only-one"] }).segmentIds).toEqual(["only-one"]);
    expect(resolveDailyEmailSettings({ ...row, sendHourEt: 9 }).sendHourEt).toBe(9);
    expect(resolveDailyEmailSettings({ ...row, sendHourEt: null }).sendHourEt).toBe(17);
  });

  it("is due at the old send time and not before", () => {
    const due = (easternHour: number) =>
      isScheduledSendDue({
        enabled: true,
        masterSwitch: true,
        sendHourEt: resolveDailyEmailSettings(null).sendHourEt,
        easternHour,
        alreadySentToday: false,
      });
    expect(due(16)).toBe(false);
    expect(due(17)).toBe(true);
  });

  it("writes the old headline and sub-line, singular and plural", () => {
    expect(digestHeadline(4)).toBe("Don't Sleep on These 4 New STR Deals");
    expect(digestHeadline(1)).toBe("Don't Sleep on This New STR Deal");
    expect(digestSubLine(1)).toBe("1 New Hand-Picked Property");
    expect(digestSubLine(3)).toBe("3 New Hand-Picked Properties");
  });

  it("turns cash on cash into the ROI badge", () => {
    expect(roiPercent("0.114")).toBe(11.4);
    expect(roiPercent(0.08)).toBe(8);
    expect(roiPercent(null)).toBeNull();
    expect(roiPercent("0")).toBeNull();
    expect(roiPercent("abc")).toBeNull();
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

describe("listUnsubscribeHeaders", () => {
  it("offers one-click unsubscribe with the signed link", () => {
    expect(listUnsubscribeHeaders("https://os.example.com/api/unsubscribe?token=abc")).toEqual({
      "List-Unsubscribe": "<https://os.example.com/api/unsubscribe?token=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});

describe("internal copy recipients", () => {
  it("has no address in the code: the Studio list, else the Email Notifications recipients (none by default)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const read = (file: string) => readFileSync(path.resolve(__dirname, file), "utf8");
    for (const file of ["websiteDailyEmail.ts", "websiteDailyEmailLogic.ts"]) {
      expect(read(file)).not.toMatch(/@savvy\.realty/);
    }
    const send = read("websiteDailyEmail.ts");
    expect(send).toContain('resolveNotificationRecipients("website_daily_email_internal_copy", [])');
    expect(send).toContain("const internalRecipients = await dailyEmailInternalRecipients(settings.internalRecipients);");
    expect(read("_core/resendEmail.ts")).toContain('"website_daily_email_internal_copy",');
    expect(read("../client/src/pages/EmailNotificationsPage.tsx")).toContain('"website_daily_email_internal_copy",\n]);');
  });
});
