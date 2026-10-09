import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const transactionsRouter = () => read("server/routers/transactions.ts");

function procedure(name: string) {
  const source = transactionsRouter();
  const start = source.indexOf(`  ${name}: protectedProcedure`);
  expect(start).toBeGreaterThan(-1);
  const next = source
    .slice(start + 1)
    .search(/\n  [a-zA-Z]+: protectedProcedure/);
  return source.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("transaction termination reason backfills", () => {
  it("keeps new terminations reason-required in the normal update path", () => {
    const update = procedure("update");

    expect(update).toContain(
      'const isNewTermination = input.data.status === "terminated" && before.status !== "terminated";'
    );
    expect(update).toContain(
      "A termination reason is required when terminating a transaction."
    );
    expect(update).toContain(
      "Use the authorized missing termination reason workflow for this transaction."
    );
  });

  it("isolates legacy missing-reason corrections behind an explicit admin permission", () => {
    const correction = procedure("addMissingTerminationReason");

    expect(correction).toContain('ctx.user.role === "admin"');
    expect(correction).toContain(
      'canAdminUsePermission(ctx.user, "canAddMissingTerminationReason")'
    );
    expect(correction).toContain(
      'existing.transaction.status !== "terminated"'
    );
    expect(correction).toContain(
      "existing.transaction.terminationReason?.trim()"
    );
    expect(correction).toContain(
      ".set({ terminationReason: input.terminationReason })"
    );
    expect(correction).not.toContain(".set({ status:");
    expect(correction).not.toContain(".set({ closingDate:");
  });

  it("makes the capability default-off and configurable through Super Permissions", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read(
      "drizzle/20261009_transaction_termination_reason_backfill_permission.sql"
    );
    const permissions = read("server/routers/permissions.ts");
    const dependencies = read("shared/permissionDependencies.ts");
    const superPermissions = read("client/src/pages/SuperPermissionsPage.tsx");

    expect(schema).toContain(
      'canAddMissingTerminationReason: boolean("canAddMissingTerminationReason")'
    );
    expect(schema).toContain(".default(false)");
    expect(migration).toContain(
      "ADD COLUMN `canAddMissingTerminationReason` boolean NOT NULL DEFAULT false"
    );
    expect(permissions).toContain(
      '{ key: "canAddMissingTerminationReason", label: "Add Missing Termination Reason", group: "Transactions" }'
    );
    expect(permissions).toContain('"canAddMissingTerminationReason",');
    expect(dependencies).toContain('"canAddMissingTerminationReason",');
    expect(superPermissions).toContain('"canAddMissingTerminationReason",');
  });

  it("only exposes a reason-entry control to an authorized admin and preserves the original date", () => {
    const detail = read("client/src/pages/TransactionDetail.tsx");

    expect(detail).toContain("const canAddMissingTerminationReason = isAdmin");
    expect(detail).toContain("{canAddMissingTerminationReason && (");
    expect(detail).toContain(
      "disabled={updateStatus.isPending || !terminationReason.trim()}"
    );
    expect(detail).toContain(
      "This fills the missing reason for this existing terminated transaction without changing its original termination date."
    );
    expect(detail).toContain(
      "disabled={addMissingTerminationReason.isPending || !missingTerminationReason.trim()}"
    );
  });

  it("ensures the default-off permission column before production serves it", () => {
    const guard = read("server/transactionTerminationBackfillSchema.ts");
    const entrypoint = read("server/_core/index.ts");

    expect(guard).toContain("information_schema.columns");
    expect(guard).toContain(
      "ADD COLUMN `canAddMissingTerminationReason` boolean NOT NULL DEFAULT false"
    );
    expect(entrypoint).toContain(
      "await ensureTransactionTerminationBackfillSchema();"
    );
  });
});
