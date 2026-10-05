import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRICE_DROP_MIN_PERCENT,
  PRICE_DROP_MIN_VIEWS,
  checkPrice,
  priceDropMinPercent,
  priceDropKey,
  renderPriceDropEmail,
  shouldAlertAccount,
} from "./websitePriceDropLogic";
import { MARKETING_POSTAL_ADDRESS } from "./websiteDailyEmailLogic";

describe("checkPrice", () => {
  it("starts tracking a listing without alerting", () => {
    expect(checkPrice(null, "500000")).toEqual({ action: "set_baseline", baseline: 500000 });
  });

  it("moves the baseline up on a price rise, without alerting", () => {
    expect(checkPrice("500000", "525000")).toEqual({ action: "set_baseline", baseline: 525000 });
  });

  it("alerts at a 1% drop, the old site's threshold, with no dollar minimum", () => {
    expect(DEFAULT_PRICE_DROP_MIN_PERCENT).toBe(1);
    expect(checkPrice("500000", "495000")).toEqual({
      action: "drop",
      oldPrice: 500000,
      newPrice: 495000,
      baseline: 495000,
    });
    // A cheap listing alerts on a small dollar drop, as the old site did.
    expect(checkPrice("80000", "79200").action).toBe("drop");
  });

  it("ignores cuts under 1%, but lets them add up against the old baseline", () => {
    expect(checkPrice("500000", "495001")).toEqual({ action: "none" });
    expect(checkPrice("500000", "499500")).toEqual({ action: "none" });
    expect(checkPrice("500000", "494900").action).toBe("drop");
  });

  it("uses the configured percentage when one is given", () => {
    expect(checkPrice("500000", "495000", 2).action).toBe("none");
    expect(checkPrice("500000", "490000", 2).action).toBe("drop");
    expect(checkPrice("500000", "499000", 0.2).action).toBe("drop");
  });

  it("does nothing without a usable price", () => {
    expect(checkPrice("500000", null)).toEqual({ action: "none" });
    expect(checkPrice("500000", "0")).toEqual({ action: "none" });
    expect(checkPrice("500000", "500000")).toEqual({ action: "none" });
  });
});

describe("priceDropMinPercent", () => {
  it("defaults to 1% and reads PRICE_DROP_MIN_PERCENT", () => {
    expect(priceDropMinPercent({})).toBe(1);
    expect(priceDropMinPercent({ PRICE_DROP_MIN_PERCENT: "" })).toBe(1);
    expect(priceDropMinPercent({ PRICE_DROP_MIN_PERCENT: "2.5" })).toBe(2.5);
  });

  it("ignores a value that makes no sense", () => {
    for (const bad of ["abc", "0", "-1", "100", "250"]) {
      expect(priceDropMinPercent({ PRICE_DROP_MIN_PERCENT: bad })).toBe(1);
    }
  });

  it("alerts returning visitors only, as the old site did", () => {
    expect(PRICE_DROP_MIN_VIEWS).toBe(3);
  });
});

describe("priceDropKey", () => {
  it("is the same for the same drop and different for another", () => {
    expect(priceDropKey(7, 500000, 480000)).toBe("7:500000.00:480000.00");
    expect(priceDropKey(7, 480000, 470000)).not.toBe(priceDropKey(7, 500000, 480000));
  });
});

describe("shouldAlertAccount", () => {
  const base = { status: "active", notificationsEnabled: true, emailFrequency: "daily", contactEmailStatus: "valid" };

  it("alerts an active account that has not said no", () => {
    expect(shouldAlertAccount(base)).toBe(true);
    expect(shouldAlertAccount({ ...base, notificationsEnabled: null, emailFrequency: null, contactEmailStatus: null })).toBe(true);
  });

  it("skips anyone who opted out, bounced, unsubscribed or is suspended", () => {
    expect(shouldAlertAccount({ ...base, notificationsEnabled: false })).toBe(false);
    expect(shouldAlertAccount({ ...base, emailFrequency: "never" })).toBe(false);
    expect(shouldAlertAccount({ ...base, contactEmailStatus: "unsubscribed" })).toBe(false);
    expect(shouldAlertAccount({ ...base, contactEmailStatus: "bounced" })).toBe(false);
    expect(shouldAlertAccount({ ...base, status: "suspended" })).toBe(false);
  });
});

describe("renderPriceDropEmail", () => {
  const email = renderPriceDropEmail({
    listing: {
      slug: "88-creekside",
      headline: "Creekside <cabin>",
      address: "88 Creekside Lane",
      city: "Gatlinburg",
      state: "TN",
      beds: "4",
      baths: "3",
      heroImageUrl: "https://example.com/a.jpg",
    },
    oldPrice: 725000,
    newPrice: 699000,
    firstName: "Dana",
    unsubscribeUrl: "https://os.example.com/api/unsubscribe?token=x",
    dateKey: "2026-09-25",
  });

  it("shows the old and new price and the drop, in the old site's words", () => {
    expect(email.html).toContain("A property you looked at just dropped in price.");
    expect(email.html).toContain('<span style="text-decoration:line-through;">$725,000</span>');
    expect(email.html).toContain("$699,000");
    expect(email.html).toContain("Down $26,000 (3.6%)");
    expect(email.html).toContain("View the listing");
    expect(email.html).toContain("Questions about this one? Reply on the listing page");
    expect(email.text).toContain("Was $725,000, now $699,000");
    expect(email.text).toContain("Down $26,000 (3.6%)");
  });

  it("has the old subject line, with the new price", () => {
    expect(email.subject).toBe("Price drop: Creekside <cabin> is now $699,000");
  });

  it("links to the listing on the public site with tracking, and escapes the name", () => {
    expect(email.html).toContain(
      "https://home.savvy-agents.com/newsite/properties/88-creekside?src=price-drop&amp;utm_source=savvy&amp;utm_medium=email&amp;utm_campaign=price-drop"
    );
    expect(email.html).toContain("Creekside &lt;cabin&gt;");
    expect(email.html).not.toContain("Creekside <cabin>");
  });

  it("has the logo, the postal address and an unsubscribe link (CAN-SPAM)", () => {
    expect(email.html).toContain("savvy-logo-white.png");
    expect(email.html).toContain(MARKETING_POSTAL_ADDRESS);
    expect(email.text).toContain(MARKETING_POSTAL_ADDRESS);
    expect(email.html).toContain("api/unsubscribe?token=x");
    expect(email.html).toContain("Unsubscribe</a>");
  });

  it("greets by first name, or as there", () => {
    expect(email.html).toContain("Hi Dana,");
    const anonymous = renderPriceDropEmail({
      listing: { slug: "x", headline: null, address: "1 Main St", city: null, state: null, beds: null, baths: null, heroImageUrl: null },
      oldPrice: 100000,
      newPrice: 99000,
      firstName: null,
      unsubscribeUrl: null,
      dateKey: "2026-10-05",
    });
    expect(anonymous.html).toContain("Hi there,");
    expect(anonymous.html).toContain("Down $1,000 (1.0%)");
    expect(anonymous.html).not.toContain("<img src=\"null");
    // With no one-click link, unsubscribe still goes to the preferences page.
    expect(anonymous.html).toContain("/newsite/account/preferences");
  });
});
