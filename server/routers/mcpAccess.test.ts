import { describe, expect, it } from "vitest";
import { isMcpAuthorizedUser } from "./mcpAccess";

describe("SavvyOS MCP access", () => {
  it("permits the approved users to authenticate through OAuth", () => {
    for (const email of [
      "tyler@savvy.realty",
      "elana@savvy.realty",
      "dyl@savvy.realty",
      "philleone@savvy.realty",
      "scott.asbell@savvy.realty",
      "amyrollins@savvy.realty",
    ]) {
      expect(isMcpAuthorizedUser(email)).toBe(true);
    }
  });

  it("rejects unapproved users", () => {
    expect(isMcpAuthorizedUser("outside@example.com")).toBe(false);
    expect(isMcpAuthorizedUser(null)).toBe(false);
  });
});
