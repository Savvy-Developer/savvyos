import { describe, expect, it } from "vitest";

import {
  MIN_PRICE_DROP,
  checkPrice,
  priceDropKey,
  renderPriceDropEmail,
  shouldAlertAccount,
} from "./websitePriceDropLogic";

describe("checkPrice", () => {
  it("starts tracking a listing without alerting", () => {
    expect(checkPrice(null, "500000")).toEqual({ action: "set_baseline", baseline: 500000 });
  });

  it("moves the baseline up on a price rise, without alerting", () => {
    expect(checkPrice("500000", "525000")).toEqual({ action: "set_baseline", baseline: 525000 });
  });

  it("alerts on a drop of at least the minimum", () => {
    expect(checkPrice("500000", 500000 - MIN_PRICE_DROP)).toEqual({
      action: "drop",
      oldPrice: 500000,
      newPrice: 499000,
      baseline: 499000,
    });
  });

  it("ignores small cuts, but lets them add up against the old baseline", () => {
    expect(checkPrice("500000", "499500")).toEqual({ action: "none" });
    expect(checkPrice("500000", "498900").action).toBe("drop");
  });

  it("does nothing without a usable price", () => {
    expect(checkPrice("500000", null)).toEqual({ action: "none" });
    expect(checkPrice("500000", "0")).toEqual({ action: "none" });
    expect(checkPrice("500000", "500000")).toEqual({ action: "none" });
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

  it("shows the old and new price and the saving", () => {
    expect(email.html).toContain("$725,000");
    expect(email.html).toContain("$699,000");
    expect(email.html).toContain("$26,000 lower");
    expect(email.text).toContain("Was $725,000, now $699,000");
  });

  it("links to the listing on the public site with tracking, and escapes the name", () => {
    expect(email.html).toContain(
      "https://home.savvy-agents.com/newsite/properties/88-creekside?utm_source=savvy&amp;utm_medium=email&amp;utm_campaign=price-drop-2026-09-25"
    );
    expect(email.html).toContain("Creekside &lt;cabin&gt;");
    expect(email.subject).toBe("Price drop: Creekside <cabin>");
  });

  it("has an unsubscribe link and no return figures", () => {
    expect(email.html).toContain("api/unsubscribe?token=x");
    expect(email.html.toLowerCase()).not.toContain("cash on cash");
    expect(email.html).toContain("Hi Dana,");
  });
});
