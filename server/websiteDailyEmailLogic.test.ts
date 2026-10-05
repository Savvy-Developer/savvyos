import { describe, expect, it } from "vitest";

import {
  BLURB_CHARS_PER_LINE,
  BLURB_MAX_LINES,
  SUBJECT_MAX_LENGTH,
  SUBJECT_PATTERN_COUNT,
  buildSubject,
  clampBlurb,
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

/** Consecutive run dates, "YYYY-MM-DD", starting from a given day. */
const runDates = (from: string, days: number): string[] =>
  Array.from({ length: days }, (_, index) =>
    new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10)
  );

// Two listings in two places with two prices, like a normal day's batch.
const batch = [
  listing({ city: "Bentonville", state: "AR", listPrice: "999000", marketName: "Northwest Arkansas" }),
  listing({ propertyId: 2, city: "Columbus", state: "OH", listPrice: "2500000", marketName: "Columbus, OH" }),
];

describe("buildSubject", () => {
  it("writes the count, the markets and the price range", () => {
    // 2026-10-10 is a day on the first pattern.
    expect(buildSubject(batch, "2026-10-10")).toBe(
      "2 new STR deals: Columbus & Northwest Arkansas, $999K to $2.5M"
    );
  });

  it("has at least six patterns and uses a different one each day", () => {
    expect(SUBJECT_PATTERN_COUNT).toBeGreaterThanOrEqual(6);
    const subjects = runDates("2026-10-05", SUBJECT_PATTERN_COUNT).map(date =>
      buildSubject(batch, date)
    );
    expect(new Set(subjects).size).toBe(SUBJECT_PATTERN_COUNT);
  });

  it("never reads the same two days in a row", () => {
    const sparse = [
      listing({ city: null, state: null, listPrice: null }),
      listing({ propertyId: 2, city: null, state: null, listPrice: null }),
    ];
    for (const listings of [batch, [batch[0]], sparse, [sparse[0]]]) {
      const subjects = runDates("2026-01-01", 400).map(date => buildSubject(listings, date));
      for (let day = 1; day < subjects.length; day += 1) {
        expect(subjects[day]).not.toBe(subjects[day - 1]);
      }
    }
  });

  it("gives the same subject for the same run date and listings, in any order", () => {
    for (const date of runDates("2026-10-05", 8)) {
      const first = buildSubject(batch, date);
      expect(buildSubject(batch, date)).toBe(first);
      expect(buildSubject([...batch].reverse(), date)).toBe(first);
    }
  });

  it("reads correctly for a single listing", () => {
    const one = [listing({ beds: "4.0" })];
    const subjects = runDates("2026-10-05", 8).map(date => buildSubject(one, date));
    expect(new Set(subjects).size).toBe(8);
    for (const subject of subjects) {
      // Never "1 new STR deals" or any other plural for one listing.
      expect(subject).not.toMatch(/\b1 /);
      expect(subject).not.toMatch(/deals|properties|listings|options|picks/);
      expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
    }
    expect(subjects).toContain("New STR deal in Gatlinburg, TN: 4 bed, $725K");
    expect(subjects).toContain("Today's STR pick: Gatlinburg, TN, $725K");
  });

  it("stays within the length limit, however many places there are", () => {
    const cities = [
      ["Port Orange", "FL"],
      ["Ocean Isle Beach", "NC"],
      ["Oak Island", "NC"],
      ["Saint Peters", "MO"],
      ["Key Colony Beach", "FL"],
      ["Kill Devil Hills", "NC"],
      ["Whitefish", "MT"],
    ];
    for (let size = 1; size <= cities.length; size += 1) {
      const listings = cities.slice(0, size).map(([city, state], index) =>
        listing({ propertyId: index + 1, city, state, listPrice: String(300_000 + index * 350_000) })
      );
      for (const date of runDates("2026-10-05", 8)) {
        const subject = buildSubject(listings, date);
        expect(subject.length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
        expect(subject).toMatch(size === 1 ? /STR/ : new RegExp(`\\b${size} `));
      }
    }
    // A market name too long to fit is dropped rather than cut in half.
    const longName = [
      listing({ marketName: "Whitefish - Glacier National Park" }),
      listing({ propertyId: 2, marketName: "Whitefish - Glacier National Park" }),
    ];
    for (const date of runDates("2026-10-05", 8)) {
      expect(buildSubject(longName, date).length).toBeLessThanOrEqual(SUBJECT_MAX_LENGTH);
    }
  });

  it("names a market once, and a city with its state", () => {
    const outerBanks = [
      listing({ city: "Nags Head", state: "NC", marketName: "Outer Banks, North Carolina" }),
      listing({ propertyId: 2, city: "Kill Devil Hills", state: "NC", marketName: "Outer Banks, North Carolina" }),
      listing({ propertyId: 3, city: "Glendale", state: "UT", marketName: null }),
    ];
    expect(buildSubject(outerBanks, "2026-10-11")).toBe(
      "Just listed in Outer Banks & Glendale UT: 3 STR properties"
    );
  });

  it("keeps revenue and returns out, and uses no em dash", () => {
    const withFigures = batch.map(item => ({
      ...item,
      projectedRevenue: "98000",
      cashOnCash: "0.114",
      capRate: "0.072",
    }));
    for (const date of runDates("2026-10-05", 8)) {
      const subject = buildSubject(withFigures, date);
      expect(subject).not.toMatch(/98|11\.4|7\.2|ROI|revenue|return|cash|cap rate/i);
      expect(subject).not.toContain("\u2014");
    }
  });

  it("still says something when a listing has no place or price", () => {
    const bare = [listing({ city: null, state: null, listPrice: null, beds: null })];
    const subjects = runDates("2026-10-05", 8).map(date => buildSubject(bare, date));
    expect(new Set(subjects).size).toBe(8);
    for (const subject of subjects) expect(subject).not.toMatch(/null|undefined|NaN|\$/);
  });
});

describe("renderSubject", () => {
  it("writes the subject from the listings when no custom one is saved", () => {
    expect(renderSubject(null, batch, "2026-10-10")).toBe(buildSubject(batch, "2026-10-10"));
    expect(renderSubject("   ", batch, "2026-10-10")).toBe(buildSubject(batch, "2026-10-10"));
  });

  it("uses a saved custom subject every day, filling {count}", () => {
    for (const date of runDates("2026-10-05", 3)) {
      expect(renderSubject("Fresh today: {count} STR deals", batch, date)).toBe(
        "Fresh today: 2 STR deals"
      );
    }
    expect(renderSubject("{count} in, {count} out", [batch[0]], "2026-10-05")).toBe("1 in, 1 out");
    expect(renderSubject("No count here", batch, "2026-10-05")).toBe("No count here");
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

const LONG_BLURB =
  "I love this one because the lake is a two minute walk and the owners have already furnished the whole place for groups, so on day one you are ready for bookings. The numbers work without a remodel, the HOA allows nightly rentals in writing, and the street has three other rentals that stay full from May to October. If you want a turnkey property in a proven pocket, this is the first one I would go and see this month.";
const SHORT_BLURB = "Creek frontage, a hot tub and a flat driveway. Hard to find all three here.";

/** How many lines a text takes at the card width, wrapping on words. */
const linesOf = (text: string): number =>
  text.split("\n").reduce((total, paragraph) => {
    let lines = 1;
    let column = 0;
    for (const word of paragraph.split(" ")) {
      if (column > 0 && column + 1 + word.length > BLURB_CHARS_PER_LINE) {
        lines += 1;
        column = word.length;
      } else {
        column += (column > 0 ? 1 : 0) + word.length;
      }
    }
    return total + lines;
  }, 0);

describe("clampBlurb", () => {
  it("leaves a short note whole", () => {
    expect(clampBlurb(SHORT_BLURB)).toEqual({ text: SHORT_BLURB, truncated: false });
  });

  it("cuts a long note to five lines at a word boundary", () => {
    const { text, truncated } = clampBlurb(LONG_BLURB);
    expect(truncated).toBe(true);
    expect(text.endsWith("\u2026")).toBe(true);
    const kept = text.slice(0, -1);
    // The kept text is the start of the note and stops between two words.
    expect(LONG_BLURB.startsWith(kept)).toBe(true);
    expect(LONG_BLURB.charAt(kept.length)).toBe(" ");
    // With the link on the end it still fits in five lines.
    expect(linesOf(`${text} See more...`)).toBeLessThanOrEqual(BLURB_MAX_LINES);
    // And it is not cut early: one more word would not fit.
    const nextWord = LONG_BLURB.slice(kept.length + 1).split(" ")[0];
    expect(linesOf(`${kept} ${nextWord}\u2026 See more...`)).toBeGreaterThan(BLURB_MAX_LINES);
  });

  it("counts the agent's own line breaks as lines", () => {
    const sixLines = "One.\nTwo.\r\nThree.\n\nFour.\nFive.\nSix.\nSeven.";
    expect(clampBlurb(sixLines)).toEqual({
      text: "One.\nTwo.\nThree.\nFour.\nFive.",
      truncated: true,
    });
    const fiveLines = "One.\nTwo.\nThree.\nFour.\nFive.";
    expect(clampBlurb(fiveLines)).toEqual({ text: fiveLines, truncated: false });
  });

  it("tidies stray spacing and treats an empty note as no note", () => {
    expect(clampBlurb("  Great   views.  \n\n\n  Quiet street. ")).toEqual({
      text: "Great views.\nQuiet street.",
      truncated: false,
    });
    for (const empty of [null, undefined, "", "  \n "]) {
      expect(clampBlurb(empty)).toEqual({ text: "", truncated: false });
    }
  });

  it("cuts one unbroken run rather than letting it through", () => {
    const { text, truncated } = clampBlurb("x".repeat(2000));
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(BLURB_MAX_LINES * BLURB_CHARS_PER_LINE);
  });
});

describe("renderBroadcastEmail, the agent's note", () => {
  const render = (overrides: Partial<BroadcastListing>) =>
    renderBroadcastEmail({
      listings: [listing(overrides)],
      subject: "s",
      intro: null,
      runDate: "2026-10-05",
    });
  const cardUrl =
    "https://home.savvy-agents.com/newsite/properties/88-creekside-lane-gatlinburg?utm_source=savvy&utm_medium=email&utm_campaign=daily-properties-2026-10-05";

  it("cuts a long note and links See more to the listing with the card's tracked URL", () => {
    const { html, text } = render({ agentBlurb: LONG_BLURB, agentName: "Dana Reyes" });
    const shown = clampBlurb(LONG_BLURB).text;
    expect(html).toContain("Why Dana Reyes likes this property");
    expect(html).toContain(shown);
    expect(html).not.toContain("go and see this month");
    expect(html).toContain(`<a href="${cardUrl.replace(/&/g, "&amp;")}"`);
    expect(html).toMatch(/\u2026 <a href="[^"]+" style="[^"]+">See more\.\.\.<\/a>/);
    // Same link as the card's own, so the click counts for the same listing.
    expect(html.split(cardUrl.replace(/&/g, "&amp;")).length - 1).toBe(4);

    expect(text).toContain("Why Dana Reyes likes this property:");
    expect(text).toContain(`${shown} See more... ${cardUrl}`);
    expect(text).not.toContain("go and see this month");
  });

  it("shows a short note in full with no link", () => {
    const { html, text } = render({ agentBlurb: SHORT_BLURB, agentName: "Dana Reyes" });
    expect(html).toContain("Why Dana Reyes likes this property");
    expect(html).toContain(SHORT_BLURB);
    expect(html).not.toContain("See more");
    expect(text).toContain(`Why Dana Reyes likes this property:\n${SHORT_BLURB}\n`);
    expect(text).not.toContain("See more");
  });

  it("adds nothing when the listing has no note", () => {
    for (const agentBlurb of [null, undefined, "   "]) {
      const { html, text } = render({ agentBlurb, agentName: "Dana Reyes" });
      expect(html).not.toContain("likes this property");
      expect(html).not.toContain("See more");
      expect(text).not.toContain("likes this property");
    }
  });

  it("escapes the note and the agent's name, and keeps line breaks", () => {
    const { html } = render({
      agentBlurb: 'Views <b>for days</b> & a "wow" deck.\nSleeps ten.',
      agentName: "<i>Dana</i>",
    });
    expect(html).toContain("Views &lt;b&gt;for days&lt;/b&gt; &amp; a &quot;wow&quot; deck.<br />Sleeps ten.");
    expect(html).not.toContain("<b>for days</b>");
    expect(html).toContain("Why &lt;i&gt;Dana&lt;/i&gt; likes this property");
  });

  it("says we when no agent is assigned", () => {
    const { html, text } = render({ agentBlurb: SHORT_BLURB, agentName: null });
    expect(html).toContain("Why we like this property");
    expect(text).toContain("Why we like this property:");
  });

  it("still carries none of the figures behind the login", () => {
    const withFigures = {
      ...listing({ agentBlurb: SHORT_BLURB, agentName: "Dana Reyes" }),
      projectedRevenue: "98000",
      cashOnCash: "0.114",
      capRate: "0.072",
      occupancyRate: "0.68",
      averageDailyRate: "412",
    } as BroadcastListing;
    const { html, text } = renderBroadcastEmail({
      listings: [withFigures],
      subject: "s",
      intro: null,
      runDate: "2026-10-05",
    });
    for (const secret of ["98000", "0.114", "0.072", "0.68", "412"]) {
      expect(html).not.toContain(secret);
      expect(text).not.toContain(secret);
    }
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
