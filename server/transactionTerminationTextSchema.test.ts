import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("transaction termination text storage", () => {
  it("uses large text storage for both termination record copies", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read(
      "drizzle/20260929_expand_transaction_termination_text.sql"
    );

    expect(schema).toContain(
      'terminationReason: mediumtext("terminationReason")'
    );
    expect(schema).toContain('content: mediumtext("content").notNull()');
    expect(migration).toContain(
      "ALTER TABLE `transactions` MODIFY COLUMN `terminationReason` mediumtext NULL"
    );
    expect(migration).toContain(
      "ALTER TABLE `transaction_notes` MODIFY COLUMN `content` mediumtext NOT NULL"
    );
  });

  it("runs the compatibility guard before SavvyOS serves traffic", () => {
    const guard = read("server/transactionTerminationTextSchema.ts");
    const entrypoint = read("server/_core/index.ts");

    expect(guard).toContain("information_schema.columns");
    expect(guard).toContain(
      '"ALTER TABLE `transactions` MODIFY COLUMN `terminationReason` mediumtext NULL"'
    );
    expect(guard).toContain(
      '"ALTER TABLE `transaction_notes` MODIFY COLUMN `content` mediumtext NOT NULL"'
    );
    expect(entrypoint).toContain(
      "await ensureTransactionTerminationTextSchema();"
    );
  });
});
