import { describe, expect, it } from "vitest";
import { formatActivityEntry } from "../client/src/lib/activityFormatter";

describe("ISA activity event formatting", () => {
  it("labels a recorded ISA page opening with its friendly page name", () => {
    const result = formatActivityEntry({
      log: {
        id: 1,
        action: "page_opened",
        entityType: "page",
        details: { pageName: "All Contacts", path: "/contacts" },
        createdAt: new Date("2026-08-19T12:00:00.000Z"),
      },
      user: { name: "Isa Example" },
    });

    expect(result.title).toBe("Opened a page");
    expect(result.lines).toEqual(["All Contacts"]);
  });

  it("labels a recorded ISA contact opening distinctly from contact edits", () => {
    const result = formatActivityEntry({
      log: {
        id: 2,
        action: "contact_opened",
        entityType: "contact",
        details: {},
        createdAt: new Date("2026-08-19T12:00:00.000Z"),
      },
      user: { name: "Isa Example" },
    });

    expect(result.title).toBe("Opened a contact");
    expect(result.icon).toBe("info");
  });
});
