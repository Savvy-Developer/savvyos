import { describe, expect, it } from "vitest";

import {
  renderDailyPropertyEmail,
  type EmailListing,
} from "./dailyPropertyEmail";
import { BOOK_A_CALL_URL, EMAIL_LOGO_WHITE_URL, MARKETING_POSTAL_ADDRESS } from "./websiteDailyEmailLogic";

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
  baths: "3.5",
  sqft: 2100,
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

  // The old site's digest showed revenue and ROI, and the people this goes to
  // have accounts, so the figures are back in (Rock 1 M2 parity).
  it("shows ROI and projected revenue, as the old digest did", () => {
    const { html, text } = renderDailyPropertyEmail(
      "Dana",
      [listing({ projectedRevenue: "98000", cashOnCash: "0.114" })],
      null,
      { runDate: "2026-10-05" }
    );
    expect(html).toContain("11.4% ROI");
    expect(html).toContain("$98,000 / yr projected revenue");
    expect(text).toContain("11.4% ROI");
    expect(text).toContain("$98,000 / yr projected revenue");
  });

  it("leaves out ROI and revenue for a listing without them, with no placeholder", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null, { runDate: "2026-10-05" });
    expect(html).not.toContain("% ROI");
    expect(html).not.toContain("projected revenue");
    expect(html).not.toContain("NaN");
  });

  it("has the logo, the Book a Call block, the unsubscribe link and the postal address", () => {
    const { html, text } = renderDailyPropertyEmail(
      "Dana",
      [listing()],
      "https://os.savvy-agents.com/api/unsubscribe?token=abc",
      { runDate: "2026-10-05" }
    );
    expect(html).toContain(`src="${EMAIL_LOGO_WHITE_URL}"`);
    expect(html).toContain("STR Success Starts with The Perfect Market Match");
    expect(html).toContain("Book a Call with Our Market Advisors Today");
    expect(html).toContain(">Book a Call</a>");
    expect(html).toContain(`${BOOK_A_CALL_URL}?utm_source=savvy`);
    expect(html).toContain("token=abc");
    expect(html).toContain(">Unsubscribe</a>");
    expect(html).toContain(MARKETING_POSTAL_ADDRESS);
    expect(text).toContain("Book a Call with Our Market Advisors Today");
    expect(text).toContain(MARKETING_POSTAL_ADDRESS);
  });

  it("carries the old digest's headline, sub-line and date", () => {
    const { html } = renderDailyPropertyEmail(
      "Dana",
      [listing(), listing({ propertyId: 2, slug: "second" })],
      null,
      { runDate: "2026-10-05" }
    );
    expect(html).toContain("Don't Sleep on These 2 New STR Deals");
    expect(html).toContain("2 New Hand-Picked Properties");
    expect(html).toContain("Monday, October 5, 2026");
    expect(html).toContain("Open before these properties are snatched up");
  });

  it("stacks on a phone", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null, { runDate: "2026-10-05" });
    expect(html).toContain('name="viewport"');
    expect(html).toContain("@media only screen and (max-width:600px)");
    expect(html).toContain("max-width:600px");
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
    expect(long).toContain('href="https://home.savvy-agents.com/newsite/properties/88-creekside-lane-gatlinburg?utm_source=savvy');
  });

  it("leaves the card as it was for a listing with no blurb", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(html).not.toContain("likes this property");
    expect(html).not.toContain("See more...");
  });

  it("shows the price, bedrooms, bathrooms and size", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(html).toContain("$725,000");
    expect(html).toContain("4 bd &middot; 3.5 ba &middot; 2,100 sqft");
    expect(html).toContain("Gatlinburg, TN");
  });

  it("omits the price rather than printing a placeholder when it is unknown", () => {
    const { html } = renderDailyPropertyEmail(
      "Dana",
      [listing({ listPrice: null })],
      null
    );
    expect(html).not.toContain("$NaN");
    expect(html).toContain("4 bd");
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

  it("always offers the preferences page, and unsubscribes there with no one-click link", () => {
    const { html } = renderDailyPropertyEmail("Dana", [listing()], null);
    expect(html).toContain("/newsite/account/preferences");
    expect(html).toContain('href="https://home.savvy-agents.com/newsite/account/preferences" style="color:#aebcc4;text-decoration:underline;">Unsubscribe</a>');
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
    // Only the two logos remain.
    expect(html.match(/<img/g)).toHaveLength(2);
    expect(html).not.toContain('src="null"');
    expect(html).toContain("Creekside cabin");
  });
});
