import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  migrateOnboardingLifecycleSchema,
  normalizeOnboardingStatusStatement,
  widenOnboardingStatusStatement,
} from "./onboardingLifecycleSchema";

const legacyStatus = {
  columnType: "enum('in_progress','completed')",
  isNullable: false,
  columnDefault: "in_progress",
};

describe("onboarding lifecycle schema guard", () => {
  it("widens the legacy enum before converting historical completions", () => {
    expect(widenOnboardingStatusStatement(legacyStatus)).toBe(
      "ALTER TABLE `onboarding_instances` MODIFY COLUMN `status` enum('in_progress','completed','graduated','terminated') NOT NULL DEFAULT 'in_progress'"
    );
  });

  it("removes the retired completed enum only after the backfill", () => {
    expect(
      normalizeOnboardingStatusStatement({
        ...legacyStatus,
        columnType: "enum('in_progress','completed','graduated','terminated')",
      })
    ).toBe(
      "ALTER TABLE `onboarding_instances` MODIFY COLUMN `status` enum('in_progress','graduated','terminated') NOT NULL DEFAULT 'in_progress'"
    );
  });

  it("does not alter an already-current status enum", () => {
    const currentStatus = {
      ...legacyStatus,
      columnType: "enum('in_progress','graduated','terminated')",
    };
    expect(widenOnboardingStatusStatement(currentStatus)).toBeNull();
    expect(normalizeOnboardingStatusStatement(currentStatus)).toBeNull();
  });

  it("repairs the legacy table without changing active onboarding records", async () => {
    const columns = new Set(["status", "startedAt", "completedAt"]);
    let statusType = "enum('in_progress','completed')";
    const query = vi.fn(async (statement: unknown, parameters?: unknown[]) => {
      const text = String(statement);
      if (text.includes("INFORMATION_SCHEMA.COLUMNS")) {
        const columnName = String(parameters?.[1] ?? "");
        if (!columns.has(columnName)) return [[]];
        return [
          [
            {
              columnType: columnName === "status" ? statusType : "int(11)",
              isNullable: columnName === "status" ? "NO" : "YES",
              columnDefault: columnName === "status" ? "in_progress" : null,
            },
          ],
        ];
      }

      const addedColumn = /ADD COLUMN `([^`]+)`/.exec(text)?.[1];
      if (addedColumn) columns.add(addedColumn);
      if (text.includes("MODIFY COLUMN `status`")) {
        statusType = text.includes("'completed'")
          ? "enum('in_progress','completed','graduated','terminated')"
          : "enum('in_progress','graduated','terminated')";
      }
      return [[]];
    });

    await migrateOnboardingLifecycleSchema({ query } as any);

    const statements = query.mock.calls.map(([statement]) => String(statement));
    expect(statements).toContain(
      "ALTER TABLE `onboarding_instances` MODIFY COLUMN `status` enum('in_progress','completed','graduated','terminated') NOT NULL DEFAULT 'in_progress'"
    );
    expect(statements).toContain(
      "ALTER TABLE `onboarding_instances` ADD COLUMN `terminatedAt` timestamp NULL AFTER `graduatedByUserId`"
    );
    expect(
      statements.some(statement =>
        statement.includes("SET `status` = 'graduated'")
      )
    ).toBe(true);
    expect(statements).toContain(
      "ALTER TABLE `onboarding_instances` MODIFY COLUMN `status` enum('in_progress','graduated','terminated') NOT NULL DEFAULT 'in_progress'"
    );
  });

  it("runs the schema guard before Railway accepts traffic", () => {
    const guard = readFileSync("server/onboardingLifecycleSchema.ts", "utf8");
    const entrypoint = readFileSync("server/_core/index.ts", "utf8");
    const tracker = readFileSync(
      "client/src/pages/OnboardingTrackerPage.tsx",
      "utf8"
    );

    expect(guard).toContain("INFORMATION_SCHEMA.COLUMNS");
    expect(guard).toContain("needsCompletedBackfill");
    expect(guard).toContain("Active records remain");
    expect(entrypoint).toContain("await ensureOnboardingLifecycleSchema();");
    expect(tracker).toContain("error: instancesError");
    expect(tracker).toContain("Unable to load onboarding");
  });
});
