import { describe, expect, it } from "vitest";
import {
  isMcpAccessManager,
  isMcpAuthorizedUser,
} from "./mcpAccess";

describe("SavvyOS MCP access", () => {
  it("keeps desktop-key management limited to MCP managers", () => {
    expect(isMcpAccessManager("tyler@savvy.realty")).toBe(true);
    expect(isMcpAccessManager("elana@savvy.realty")).toBe(true);
    expect(isMcpAccessManager("dyl@savvy.realty")).toBe(true);
    expect(isMcpAccessManager("amyrollins@savvy.realty")).toBe(false);
  });

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
