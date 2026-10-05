import { describe, expect, it } from "vitest";

import {
  renderDailyPropertyEmail as renderForRunDate,
  type EmailListing,
} from "./dailyPropertyEmail";
import { buildSubject, clampBlurb } from "./websiteDailyEmailLogic";

const RUN_DATE = "2026-10-05";

/** The email as it would be rendered on RUN_DATE. */
const renderDailyPropertyEmail = (
  firstName: string | null,
  listings: EmailListing[],
  unsubscribeUrl: string | null
) => renderForRunDate(firstName, listings, unsubscribeUrl, RUN_DATE);

const listing = (overrides: Partial<EmailListing> = {}): EmailListing => ({
  propertyId: 1,
  slug: "88-creekside-lane-gatlinburg",
  headline: "Creekside cabin with mountain views",
  address: "88 Creekside Lane",
  city: "Gatlinburg",
  state: "TN",
  zip: "37738",
  listPrice: "725000",
  beds: "4",
  heroImageUrl: "https://example.com/hero.jpg",
  publishedAt: new Date("2026-09-15T12:00:00Z"),
  ...overrides,
});

describe("renderDailyPropertyEmail", () => {
  it("names the recipient and counts the listings", () => {
    const { subject, html } = renderDailyPropertyEmail(
      "Dana",
      [listing(), listing({ propertyId: 2, slug: "second", listPrice: "450000" })],
      null
    );
    expect(subject).toBe("New today: 2 STR properties, $450K to $725K");
    expect(html).toContain("Hi Dana,");
    expect(html).toContain("2 new properties matching what you are looking for.");
  });

  it("uses the singular for one property", () => {
    const { subject, html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(subject).toBe("New today: 4 bed STR property at $725K");
    expect(html).toContain("A new property matching what you are looking for.");
  });

  /**
   * The subject comes from the same builder as the big-list email, written
   * from this person's own listings.
   */
  it("uses the shared subject builder, so it rotates by day and repeats for the same day", () => {
    const listings = [listing(), listing({ propertyId: 2, slug: "second", listPrice: "450000" })];
    const dates = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"];
    const subjects = dates.map(date => renderForRunDate("Dana", listings, null, date).subject);
    expect(subjects).toEqual(dates.map(date => buildSubject(listings, date)));
    expect(new Set(subjects).size).toBe(dates.length);
    expect(renderForRunDate("Sam", listings, null, "2026-10-05").subject).toBe(subjects[0]);
  });

  it("greets an account with no first name without an empty gap", () => {
    const { html } = renderDailyPropertyEmail(null, [listing()], null);
    expect(html).toContain("Hi,");
    expect(html).not.toContain("Hi null");
    expect(html).not.toContain("Hi ,");
  });

  /**
   * The rule that matters most here. Those figures sit behind the login on the
   * site, and an email is the least private place there is. Putting them in
   * the email would quietly undo the gating rather than respect it.
   *
   * The agent's note used to be in this list. It is now shown on purpose (see
   * the tests below), as the old site's digest shows it; the figures are not.
   */
  it("never carries the gated figures", () => {
    const withFigures = {
      ...listing(),
      projectedRevenue: "98000",
      cashOnCash: "0.114",
      capRate: "0.072",
      occupancyRate: "0.68",
      averageDailyRate: "412",
      agentBlurb: "The creek frontage is the whole deal here.",
    } as any;
    const { subject, html, text } = renderDailyPropertyEmail("Dana", [withFigures], null);
    for (const secret of ["98000", "0.114", "0.072", "0.68", "412"]) {
      expect(html).not.toContain(secret);
      expect(text).not.toContain(secret);
      expect(subject).not.toContain(secret);
    }
  });

  describe("the agent's note", () => {
    const LONG_BLURB =
      "I love this one because the lake is a two minute walk and the owners have already furnished the whole place for groups, so on day one you are ready for bookings. The numbers work without a remodel, the HOA allows nightly rentals in writing, and the street has three other rentals that stay full from May to October. If you want a turnkey property in a proven pocket, this is the first one I would go and see this month.";
    const SHORT_BLURB = "The creek frontage is the whole deal here.";
    const cardUrl =
      "https://home.savvy-agents.com/newsite/properties/88-creekside-lane-gatlinburg";

    it("cuts a long note to five lines and links See more to the listing", () => {
      const { html, text } = renderDailyPropertyEmail(
        "Dana",
        [listing({ agentBlurb: LONG_BLURB, agentName: "Riley Stone" })],
        null
      );
      const shown = clampBlurb(LONG_BLURB);
      expect(shown.truncated).toBe(true);
      expect(html).toContain("Why Riley Stone likes this property");
      expect(html).toContain(shown.text);
      expect(html).not.toContain("go and see this month");
      expect(html).toMatch(
        new RegExp(`\\u2026 <a href="${cardUrl}" style="[^"]+">See more\\.\\.\\.</a>`)
      );
      expect(text).toContain("Why Riley Stone likes this property:");
      expect(text).toContain(`${shown.text} See more... ${cardUrl}`);
      expect(text).not.toContain("go and see this month");
    });

    it("shows a short note in full with no link", () => {
      const { html, text } = renderDailyPropertyEmail(
        "Dana",
        [listing({ agentBlurb: SHORT_BLURB, agentName: "Riley Stone" })],
        null
      );
      expect(html).toContain("Why Riley Stone likes this property");
      expect(html).toContain(SHORT_BLURB);
      expect(html).not.toContain("See more");
      expect(text).toContain(`Why Riley Stone likes this property:\n${SHORT_BLURB}\n`);
      expect(text).not.toContain("See more");
    });

    it("adds nothing when the listing has no note", () => {
      for (const agentBlurb of [null, undefined, "  "]) {
        const { html, text } = renderDailyPropertyEmail(
          "Dana",
          [listing({ agentBlurb, agentName: "Riley Stone" })],
          null
        );
        expect(html).not.toContain("likes this property");
        expect(html).not.toContain("See more");
        expect(text).not.toContain("likes this property");
      }
    });

    it("escapes the note", () => {
      const { html } = renderDailyPropertyEmail(
        "Dana",
        [listing({ agentBlurb: "<script>alert(1)</script> & more", agentName: "Riley Stone" })],
        null
      );
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    });

    it("only puts the note on the listing it belongs to", () => {
      const { html } = renderDailyPropertyEmail(
        "Dana",
        [
          listing({ agentBlurb: SHORT_BLURB, agentName: "Riley Stone" }),
          listing({ propertyId: 2, slug: "second", headline: "Second cabin" }),
        ],
        null
      );
      expect(html.split("likes this property").length - 1).toBe(1);
      expect(html.indexOf("likes this property")).toBeLessThan(html.indexOf("Second cabin"));
    });
  });

  it("sends a plain text version with the same listings and links", () => {
    const { text } = renderDailyPropertyEmail(
      "Dana",
      [listing()],
      "https://os.savvy-agents.com/api/unsubscribe?token=abc"
    );
    expect(text).toContain("Hi Dana,");
    expect(text).toContain("Creekside cabin with mountain views");
    expect(text).toContain("Gatlinburg, TN · $725,000");
    expect(text).toContain("/newsite/properties/88-creekside-lane-gatlinburg");
    expect(text).toContain("/newsite/account/preferences");
    expect(text).toContain("Unsubscribe: https://os.savvy-agents.com/api/unsubscribe?token=abc");
    expect(renderDailyPropertyEmail(null, [listing()], null).text).not.toContain("Unsubscribe");
  });

  it("shows the price and bedrooms a logged out visitor may see", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(html).toContain("$725,000");
    expect(html).toContain("4 bed");
    expect(html).toContain("Gatlinburg, TN");
  });

  it("omits the price rather than printing a placeholder when it is unknown", () => {
    const { html } = renderDailyPropertyEmail(
      "Dana",
      [listing({ listPrice: null })],
      null
    );
    expect(html).not.toContain("$NaN");
    expect(html).not.toContain("—");
    expect(html).toContain("4 bed");
  });

  it("links each listing to its page on the site", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(html).toContain(
      "/newsite/properties/88-creekside-lane-gatlinburg"
    );
  });

  it("includes the unsubscribe link when one is available", () => {
    const { html } = renderDailyPropertyEmail(
      "Dana",
      [listing()],
      "https://os.savvy-agents.com/api/unsubscribe?token=abc"
    );
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("token=abc");
  });

  it("always offers the preferences page, even with no unsubscribe link", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(html).toContain("/newsite/account/preferences");
    expect(html).not.toContain("Unsubscribe");
  });

  it("escapes a headline that contains markup", () => {
    const { html } = renderDailyPropertyEmail(
      "Dana",
      [listing({ headline: '<script>alert("x")</script>' })],
      null
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a recipient name that contains markup", () => {
    const { html } = renderDailyPropertyEmail("<b>Dana</b>", [listing()], null);
    expect(html).toContain("&lt;b&gt;Dana&lt;/b&gt;");
  });

  it("falls back to the address when a listing has no headline", () => {
    const { html } = renderDailyPropertyEmail(
      "Dana",
      [listing({ headline: null })],
      null
    );
    expect(html).toContain("88 Creekside Lane");
  });

  it("renders without an image rather than an empty picture frame", () => {
    const { html } = renderDailyPropertyEmail(
      "Dana",
      [listing({ heroImageUrl: null })],
      null
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("Creekside cabin");
  });
});
