import Stripe from "stripe";
import { afterEach, describe, expect, it } from "vitest";
import {
  calculateAgentEarningsCents,
  constructStripeWebhookEvent,
  formatUsdFromCents,
  isStripeConfigured,
  publicVendorListUrl,
} from "./vendorBilling";

const originalSecretKey = process.env.STRIPE_SECRET_KEY;
const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function restoreEnvironment() {
  if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalSecretKey;
  if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
}

afterEach(restoreEnvironment);

describe("vendor billing Stripe safeguards", () => {
  it("formats monetary values and applies the 75% agent share exactly", () => {
    expect(formatUsdFromCents(10_000)).toBe("$100.00");
    expect(calculateAgentEarningsCents(10_000)).toBe(7_500);
    expect(calculateAgentEarningsCents(333)).toBe(250);
  });

  it("only reports Stripe as configured when a secret key is present", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
    expect(isStripeConfigured()).toBe(true);
  });

  it("includes a public Vendor List URL only after the agent publishes the list", () => {
    expect(publicVendorListUrl("casey-vendors", true)).toBe("https://os.savvy-agents.com/vendors/casey-vendors");
    expect(publicVendorListUrl("casey-vendors", false)).toBeUndefined();
  });

  it("accepts a correctly signed raw Stripe event and rejects a bad signature", () => {
    const secretKey = "sk_test_fixture";
    const webhookSecret = "whsec_fixture";
    process.env.STRIPE_SECRET_KEY = secretKey;
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    const payload = JSON.stringify({
      id: "evt_fixture",
      object: "event",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_fixture", object: "subscription" } },
    });
    const stripe = new Stripe(secretKey);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });

    expect(constructStripeWebhookEvent(Buffer.from(payload), signature).id).toBe("evt_fixture");
    expect(() => constructStripeWebhookEvent(Buffer.from(payload), "t=1,v1=bad")).toThrow();
  });
});
