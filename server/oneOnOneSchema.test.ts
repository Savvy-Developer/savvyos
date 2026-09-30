import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("server/oneOnOneSchema.ts", "utf8");
const migration = readFileSync("drizzle/20260930_hr_one_on_ones.sql", "utf8");

describe("HR 1:1 startup schema compatibility", () => {
  it("guards every table and permission column in the committed migration", () => {
    for (const table of [
      "one_on_one_relationships",
      "one_on_one_meetings",
      "one_on_one_commitments",
      "one_on_one_issues",
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
      expect(source).toContain("CREATE TABLE IF NOT EXISTS");
      expect(source).toContain("\\`" + table + "\\`");
    }
    expect(migration).toContain("`canViewOneOnOneMeetings`");
    expect(source).toContain('"canViewOneOnOneMeetings"');
  });

  it("runs before the SavvyOS server accepts traffic", () => {
    const entrypoint = readFileSync("server/_core/index.ts", "utf8");
    expect(entrypoint).toContain("await ensureOneOnOneSchema();");
  });
});
