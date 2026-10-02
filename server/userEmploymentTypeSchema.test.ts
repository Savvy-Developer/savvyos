import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("contract labor employment type", () => {
  it("keeps the schema and committed migration aligned", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read(
      "drizzle/20261002_user_contract_labor_employment_type.sql"
    );

    expect(schema).toContain(
      'employmentType: mysqlEnum("employmentType", ["w2", "1099", "contract_labor"])'
    );
    expect(migration).toContain(
      "MODIFY COLUMN `employmentType` enum('w2', '1099', 'contract_labor') NULL"
    );
  });

  it("runs the compatibility guard before SavvyOS serves traffic", () => {
    const guard = read("server/userEmploymentTypeSchema.ts");
    const entrypoint = read("server/_core/index.ts");

    expect(guard).toContain("INFORMATION_SCHEMA.COLUMNS");
    expect(guard).toContain(
      "ALTER TABLE `users` MODIFY COLUMN `employmentType` enum('w2', '1099', 'contract_labor') NULL"
    );
    expect(entrypoint).toContain("await ensureUserEmploymentTypeSchema();");
  });
});
