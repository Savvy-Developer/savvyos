import { getTableConfig } from "drizzle-orm/mysql-core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  agentChecklistApplicationItems,
  agentChecklistApplications,
  agentChecklistTemplateItems,
  agentChecklistTemplates,
} from "../drizzle/schema";
import { canAccessChecklistTarget } from "./checklistAuthorization";
import {
  addCalendarDaysAtNoonUtc,
  eventToNoonUtc,
  resolveChecklistAnchor,
  resolveChecklistDueDate,
  toNoonUtc,
} from "./checklistDates";
import {
  buildChecklistItemSnapshots,
  checklistTemplateMatchesTarget,
  type ChecklistTargetSnapshot,
} from "./checklistService";

describe("checklist calendar date helpers", () => {
  const listingTarget = {
    targetType: "listing" as const,
    createdAt: new Date("2026-03-08T01:30:00-05:00"),
    listDate: "2026-03-10",
    contractDate: null,
    closingDate: null,
  };

  it("normalizes dates to noon UTC and applies signed calendar-day offsets", () => {
    expect(toNoonUtc("2026-03-08")?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
    expect(addCalendarDaysAtNoonUtc("2026-03-08", -10)?.toISOString()).toBe(
      "2026-02-26T12:00:00.000Z"
    );
    expect(addCalendarDaysAtNoonUtc("2026-12-30", 5)?.toISOString()).toBe(
      "2027-01-04T12:00:00.000Z"
    );
  });

  it("uses event time for listing under-contract anchors and leaves missing closing anchors null", () => {
    expect(
      resolveChecklistAnchor(listingTarget, "under_contract", {
        underContractEventAt: "2026-03-22T23:58:00-07:00",
      })?.toISOString()
    ).toBe("2026-03-23T12:00:00.000Z");
    expect(resolveChecklistDueDate(listingTarget, "closing", 7)).toBeNull();
    expect(resolveChecklistDueDate(listingTarget, "listing_live", -2)?.toISOString()).toBe(
      "2026-03-08T12:00:00.000Z"
    );
  });

  it("uses the Eastern business date for event timestamps near UTC midnight", () => {
    expect(eventToNoonUtc("2026-03-22T01:00:00.000Z")?.toISOString()).toBe(
      "2026-03-21T12:00:00.000Z"
    );
    expect(eventToNoonUtc("2026-11-01T05:30:00.000Z")?.toISOString()).toBe(
      "2026-11-01T12:00:00.000Z"
    );
  });
});

describe("checklist application snapshots", () => {
  const target: ChecklistTargetSnapshot = {
    targetType: "transaction",
    targetId: 50,
    agentUserId: 12,
    transactionType: "buyer",
    createdAt: "2026-04-01T18:00:00Z",
    contractDate: "2026-04-03T09:00:00Z",
    closingDate: null,
    listDate: null,
  };

  it("copies independent actionable values and resolves owner/specific assignment", () => {
    const source = [
      {
        id: 100,
        title: "Order inspection",
        notes: "Call preferred vendor",
        sectionName: "Due diligence",
        sortOrder: 4,
        dueAnchor: "under_contract" as const,
        dueOffsetDays: -1,
        assignmentType: "owner" as const,
        assignedUserId: null,
      },
      {
        id: 101,
        title: "Review disclosures",
        notes: null,
        sectionName: "Documents",
        sortOrder: 5,
        dueAnchor: "closing" as const,
        dueOffsetDays: -3,
        assignmentType: "specific" as const,
        assignedUserId: 99,
      },
    ];
    const snapshots = buildChecklistItemSnapshots(source, target, {
      underContractEventAt: "2026-04-05T23:00:00-07:00",
    });

    expect(snapshots[0]).toMatchObject({
      templateItemId: 100,
      title: "Order inspection",
      notes: "Call preferred vendor",
      sectionName: "Due diligence",
      sortOrder: 4,
      dueAnchorSnapshot: "under_contract",
      dueOffsetDaysSnapshot: -1,
      assignmentTypeSnapshot: "owner",
      configuredAssignedUserIdSnapshot: null,
      assignedUserId: 12,
      completed: false,
    });
    expect(snapshots[0].dueDate?.toISOString()).toBe("2026-04-05T12:00:00.000Z");
    expect(snapshots[1].configuredAssignedUserIdSnapshot).toBe(99);
    expect(snapshots[1].assignedUserId).toBe(99);
    expect(snapshots[1].dueDate).toBeNull();

    source[0].title = "Changed later";
    expect(snapshots[0].title).toBe("Order inspection");
  });

  it("matches transaction filters without applying them to listings", () => {
    expect(
      checklistTemplateMatchesTarget(
        { targetType: "transaction", transactionTypeFilter: "buyer" },
        target
      )
    ).toBe(true);
    expect(
      checklistTemplateMatchesTarget(
        { targetType: "transaction", transactionTypeFilter: "seller" },
        target
      )
    ).toBe(false);
    expect(
      checklistTemplateMatchesTarget(
        { targetType: "listing", transactionTypeFilter: "any" },
        { ...target, targetType: "listing", transactionType: null }
      )
    ).toBe(true);
  });
});

describe("checklist authorization helpers", () => {
  it("limits agents to assigned targets while allowing administrators", () => {
    const target = { agentUserId: 7 };
    expect(canAccessChecklistTarget({ id: 7, role: "agent" }, target)).toBe(true);
    expect(canAccessChecklistTarget({ id: 8, role: "agent" }, target)).toBe(false);
    expect(canAccessChecklistTarget({ id: 99, role: "admin" }, target)).toBe(true);
  });
});

describe("checklist schema", () => {
  it("exposes snapshot, soft-removal, ordering, and idempotency fields", () => {
    const templateColumns = getTableConfig(agentChecklistTemplates).columns.map(column => column.name);
    const templateItemColumns = getTableConfig(agentChecklistTemplateItems).columns.map(column => column.name);
    const applicationColumns = getTableConfig(agentChecklistApplications).columns.map(column => column.name);
    const applicationItemColumns = getTableConfig(agentChecklistApplicationItems).columns.map(column => column.name);

    expect(templateColumns).toEqual(
      expect.arrayContaining([
        "ownerUserId",
        "targetType",
        "transactionTypeFilter",
        "automaticDefaultEvent",
        "archivedAt",
      ])
    );
    expect(templateItemColumns).toEqual(
      expect.arrayContaining([
        "sectionName",
        "sortOrder",
        "notes",
        "dueAnchor",
        "dueOffsetDays",
        "assignmentType",
        "assignedUserId",
      ])
    );
    expect(applicationColumns).toEqual(
      expect.arrayContaining([
        "transactionId",
        "listingId",
        "source",
        "autoKey",
        "templateNameSnapshot",
        "templateOwnerUserIdSnapshot",
        "removedAt",
      ])
    );
    expect(applicationItemColumns).toEqual(
      expect.arrayContaining([
        "templateItemId",
        "title",
        "notes",
        "sectionName",
        "sortOrder",
        "dueDate",
        "dueDateManuallyOverridden",
        "assignedUserId",
        "completed",
        "completedAt",
        "completedByUserId",
        "removedAt",
      ])
    );
  });

  it("defines the exactly-one-target check and unique automatic key", () => {
    const config = getTableConfig(agentChecklistApplications);
    const migration = readFileSync(
      new URL("../drizzle/20260911_agent_checklists.sql", import.meta.url),
      "utf8"
    );
    expect(migration).toContain("agent_checklist_applications_exact_target_chk");
    expect(
      config.indexes.some(
        index => index.config.unique && index.config.columns.some(column => "name" in column && column.name === "autoKey")
      )
    ).toBe(true);
  });
});
