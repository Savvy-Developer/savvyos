/**
 * Which lead-source Smart Plans a new contact starts. Pure functions and
 * source wiring only: nothing here enrolls anyone or reaches a database.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null), logActivity: vi.fn() }));

import { expandLeadSourceIdsWithChildren, leadSourcePlanMatches } from "./smartPlanScheduler";

// Shaped like production: "Savvy-Agents.com" (360031) and its form sub-sources.
const SAVVY_AGENTS_COM = 360031;
const PROPERTY_INQUIRY = 360051;
const BOOK_A_SHOWING = 360052;
const LEGACY_WEBSITE = 360015; // "Savvy-Agents > Website", the old site's source
const LEGACY_PARENT = 330001;

const plan = (ids: number[]) => ({ triggerType: "lead_source" as const, triggerLeadSourceIds: ids });

describe("leadSourcePlanMatches", () => {
  it("starts a plan on the contact's own source, as before", () => {
    expect(leadSourcePlanMatches(plan([PROPERTY_INQUIRY]), PROPERTY_INQUIRY, SAVVY_AGENTS_COM)).toBe(true);
    expect(leadSourcePlanMatches({ triggerType: "lead_source", triggerLeadSourceId: LEGACY_WEBSITE }, LEGACY_WEBSITE, LEGACY_PARENT)).toBe(true);
  });

  it("starts a plan on the parent source for a lead filed under a sub-source", () => {
    expect(leadSourcePlanMatches(plan([SAVVY_AGENTS_COM]), PROPERTY_INQUIRY, SAVVY_AGENTS_COM)).toBe(true);
    expect(leadSourcePlanMatches(plan([SAVVY_AGENTS_COM]), BOOK_A_SHOWING, SAVVY_AGENTS_COM)).toBe(true);
  });

  it("does not cross into another source's plan", () => {
    // Today's production gap: the website plan is on the old site's source only.
    expect(leadSourcePlanMatches(plan([LEGACY_WEBSITE]), PROPERTY_INQUIRY, SAVVY_AGENTS_COM)).toBe(false);
    // A plan on a sub-source does not start for its siblings or its parent.
    expect(leadSourcePlanMatches(plan([PROPERTY_INQUIRY]), BOOK_A_SHOWING, SAVVY_AGENTS_COM)).toBe(false);
    expect(leadSourcePlanMatches(plan([PROPERTY_INQUIRY]), SAVVY_AGENTS_COM, null)).toBe(false);
  });

  it("starts only all-source plans for a contact with no source", () => {
    expect(leadSourcePlanMatches(plan([SAVVY_AGENTS_COM]), null, null)).toBe(false);
    expect(leadSourcePlanMatches({ triggerType: "all_lead_sources" }, null, null)).toBe(true);
  });
});

describe("expandLeadSourceIdsWithChildren", () => {
  const sources = [
    { id: SAVVY_AGENTS_COM, parentId: null },
    { id: PROPERTY_INQUIRY, parentId: SAVVY_AGENTS_COM },
    { id: BOOK_A_SHOWING, parentId: SAVVY_AGENTS_COM },
    { id: LEGACY_WEBSITE, parentId: LEGACY_PARENT },
  ];

  it("adds the sub-sources of a selected parent, and nothing else", () => {
    expect(expandLeadSourceIdsWithChildren([SAVVY_AGENTS_COM], sources).sort()).toEqual(
      [SAVVY_AGENTS_COM, PROPERTY_INQUIRY, BOOK_A_SHOWING].sort()
    );
    expect(expandLeadSourceIdsWithChildren([PROPERTY_INQUIRY], sources)).toEqual([PROPERTY_INQUIRY]);
    expect(expandLeadSourceIdsWithChildren([], sources)).toEqual([]);
  });
});

describe("wiring", () => {
  const read = (file: string) => readFileSync(path.resolve(import.meta.dirname, file), "utf8").replace(/\r\n/g, "\n");

  it("new contacts start plans through the parent-aware match", () => {
    const scheduler = read("smartPlanScheduler.ts");
    const trigger = scheduler.slice(scheduler.indexOf("export async function triggerSmartPlansForContact"));
    expect(trigger.slice(0, trigger.indexOf("\n}\n"))).toContain("leadSourcePlanMatches(plan, leadSourceId, parentLeadSourceId)");
  });

  it("new-site leads and accounts call the trigger even without a source", () => {
    const website = read("routers/website.ts");
    const call = website.indexOf("await triggerSmartPlansForContact(newContactId, leadSourceId)");
    expect(call).toBeGreaterThan(-1);
    expect(website.slice(call - 400, call)).not.toContain("if (leadSourceId)");

    const activity = read("websiteActivity.ts");
    const accountCall = activity.indexOf("await triggerSmartPlansForContact(contactId, leadSourceId)");
    expect(accountCall).toBeGreaterThan(-1);
    expect(activity.slice(accountCall - 200, accountCall)).not.toContain("if (leadSourceId)");
  });

  it("the 'no Smart Plan' report counts a sub-source as covered by its parent's plan", () => {
    const router = read("routers/smartPlans.ts");
    expect(router).toContain("coveredSourceIds.has(source.parentId)");
  });
});
