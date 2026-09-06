import { describe, expect, it } from "vitest";
import { isMarketingOptOut } from "./aircallMessaging";

describe("isMarketingOptOut", () => {
  it.each([
    "STOP",
    " unsubscribe ",
    "Cancel",
    "END",
    "quit",
    "Revoke",
    "opt out",
    "OPT   OUT",
  ])("recognizes the SMS opt-out keyword %s", body => {
    expect(isMarketingOptOut(body)).toBe(true);
  });

  it.each([
    "Please stop calling me",
    "I want to hear more",
    "Can you send details?",
    "",
    "  ",
    null,
  ])("does not treat an ordinary reply as an opt-out: %s", body => {
    expect(isMarketingOptOut(body)).toBe(false);
  });
});
