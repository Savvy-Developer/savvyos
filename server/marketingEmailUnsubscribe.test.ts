import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  process.env.JWT_SECRET = "marketing-unsubscribe-test-secret";
});

describe("marketing email unsubscribe links", () => {
  it("creates a signed recipient-specific URL that can be read back", async () => {
    const {
      createMarketingUnsubscribeUrl,
      emailFromMarketingUnsubscribeToken,
    } = await import("./marketingEmailUnsubscribe");
    const url = createMarketingUnsubscribeUrl("Client@Example.com ");
    const token = new URL(url!).searchParams.get("token");

    expect(url).toContain("https://os.savvy-agents.com/api/unsubscribe?token=");
    expect(emailFromMarketingUnsubscribeToken(token)).toBe(
      "client@example.com"
    );
  });

  it("rejects a tampered unsubscribe token", async () => {
    const {
      createMarketingUnsubscribeUrl,
      emailFromMarketingUnsubscribeToken,
    } = await import("./marketingEmailUnsubscribe");
    const url = createMarketingUnsubscribeUrl("client@example.com");
    const token = new URL(url!).searchParams.get("token")!;
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(emailFromMarketingUnsubscribeToken(tampered)).toBeNull();
  });
});
