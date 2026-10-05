import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("website lead form and GoHighLevel", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "website.ts"), "utf8");
  const submitLead = source.slice(
    source.indexOf("submitLead: publicProcedure"),
    source.indexOf("adminOverview: protectedProcedure")
  );

  it("syncs a new website contact to GoHighLevel, like every other create path", () => {
    expect(submitLead.length).toBeGreaterThan(0);
    const insert = submitLead.indexOf("contactId = Number((result as any)[0]?.insertId);");
    const sync = submitLead.indexOf("if (contactId) triggerGhlContactSync(contactId);");
    expect(insert).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(insert);
    expect(source).toContain('import { triggerGhlContactSync } from "../_core/ghlSync";');
  });
});
