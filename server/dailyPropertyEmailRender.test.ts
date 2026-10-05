import { describe, expect, it } from "vitest";

import {
  renderDailyPropertyEmail,
  type EmailListing,
} from "./dailyPropertyEmail";
import { MARKETING_POSTAL_ADDRESS } from "./websiteDailyEmailLogic";

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
  it("carries the postal address in the footer (CAN-SPAM)", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], "https://os.example.com/unsub");
    expect(html).toContain(MARKETING_POSTAL_ADDRESS);
  });

  it("names the recipient and counts the listings", () => {
    const { subject, html } = renderDailyPropertyEmail(
      "Dana",
      [listing(), listing({ propertyId: 2, slug: "second" })],
      null
    );
    expect(subject).toBe("2 new investment properties in your search");
    expect(html).toContain("Hi Dana,");
  });

  it("uses the singular for one property", () => {
    const { subject } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(subject).toBe("A new investment property in your search");
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
   */
  it("never carries the gated figures", () => {
    const withFigures = {
      ...listing(),
      projectedRevenue: "98000",
      cashOnCash: "0.114",
      capRate: "0.072",
      occupancyRate: "0.68",
      averageDailyRate: "412",
    } as any;
    const { html } = renderDailyPropertyEmail("Dana", [withFigures], null);
    for (const secret of [
      "98000",
      "0.114",
      "0.072",
      "0.68",
      "412",
    ]) {
      expect(html).not.toContain(secret);
    }
  });

  // The agent's blurb used to be held back with the figures. The client asked
  // on 3 Oct for it in the daily email, cut to five lines with a link to the
  // rest, so it now shows. The figures above are still never sent.
  it("shows the agent's blurb, cut to five lines with a See more link", () => {
    const short = renderDailyPropertyEmail(
      "Dana",
      [listing({ agentBlurb: "The creek frontage is the whole deal here.", agentName: "Liz Davis" })],
      null
    ).html;
    expect(short).toContain("Why Liz Davis likes this property");
    expect(short).toContain("The creek frontage is the whole deal here.");
    expect(short).not.toContain("See more...");

    const long = renderDailyPropertyEmail(
      "Dana",
      [listing({ agentBlurb: "Walk to the creek. ".repeat(40), agentName: "Liz Davis" })],
      null
    ).html;
    expect(long).toContain("See more...</a>");
    expect(long.match(/Walk to the creek/g)!.length).toBeLessThan(20);
    expect(long).toContain('href="https://home.savvy-agents.com/newsite/properties/88-creekside-lane-gatlinburg"');
  });

  it("leaves the card as it was for a listing with no blurb", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(html).not.toContain("likes this property");
    expect(html).not.toContain("See more...");
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
