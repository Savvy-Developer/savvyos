import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contactsRouter = () => readFileSync("server/routers/contacts.ts", "utf-8");
const transactionsRouter = () => readFileSync("server/routers/transactions.ts", "utf-8");
const contactDetail = () => readFileSync("client/src/pages/ContactDetail.tsx", "utf-8");
const transactionDetail = () => readFileSync("client/src/pages/TransactionDetail.tsx", "utf-8");

describe("lead-source attribution correction access", () => {
  it("allows administrators to correct contact attribution without a separate permission", () => {
    const source = contactsRouter();

    expect(source).toContain('if (ctx.user.role !== "admin")');
    expect(source).not.toContain("canAdminUsePermission");
    expect(contactDetail()).toContain("const canEditContactLeadSource = isAdmin;");
  });

  it("allows administrators to correct transaction attribution without a separate permission", () => {
    const source = transactionsRouter();

    expect(source).toContain('if (ctx.user.role !== "admin")');
    expect(source).not.toContain("canAdminUsePermission");
    expect(transactionDetail()).toContain("const canEditTransactionLeadSource = isAdmin;");
  });
});
