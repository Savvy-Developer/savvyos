import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, logActivity } from "./db";
import { canAdminUsePermission } from "./routers/permissions";
import { setPayoutStatus } from "./payoutStatusWorkflow";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock("./routers/permissions", () => ({
  canAdminUsePermission: vi.fn(),
}));

type PayoutRow = {
  id: number;
  transactionId: number;
  payeeName: string | null;
  payeeType: "agent";
  status: "unreviewed" | "reviewed" | "paid" | "settled";
  isPaid: boolean;
  paidDate: Date | null;
};

const admin = {
  id: 11,
  role: "admin",
  name: "Finance Admin",
  email: "finance@savvy.realty",
};
const agent = {
  id: 12,
  role: "agent",
  name: "Agent",
  email: "agent@savvy.realty",
};

function payout(overrides: Partial<PayoutRow> = {}): PayoutRow {
  return {
    id: 23,
    transactionId: 45,
    payeeName: "Avery Agent",
    payeeType: "agent",
    status: "unreviewed",
    isPaid: false,
    paidDate: null,
    ...overrides,
  };
}

function makeDb(rows: PayoutRow[], affectedRows = 1) {
  const updateWhere = vi.fn().mockResolvedValue([{ affectedRows }]);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const select = vi.fn(() => {
    const query = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    query.limit.mockResolvedValue(rows);
    return query;
  });
  return {
    select,
    update: vi.fn(() => ({ set: updateSet })),
    updateSet,
    updateWhere,
  };
}

describe("payout status workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canAdminUsePermission).mockResolvedValue(false);
  });

  it("moves an authorized non-settled payee through the workflow and synchronizes legacy payment fields", async () => {
    const db = makeDb([payout()]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    await expect(
      setPayoutStatus(admin, {
        payoutItemId: 23,
        transactionId: 45,
        status: "reviewed",
      })
    ).resolves.toMatchObject({
      success: true,
      status: "reviewed",
      isLocked: false,
    });

    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "reviewed",
        isPaid: false,
        paidDate: null,
      })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payout_status_changed",
        entityType: "transaction",
        entityId: 45,
        details: expect.objectContaining({
          payoutItemId: 23,
          payee: "Avery Agent",
          previousStatus: "unreviewed",
          newStatus: "reviewed",
          actingAdministrator: expect.objectContaining({ id: 11 }),
          timestamp: expect.any(String),
        }),
      })
    );
  });

  it("requires an explicit confirmation before settling a payee", async () => {
    const db = makeDb([
      payout({
        status: "paid",
        isPaid: true,
        paidDate: new Date("2026-09-01"),
      }),
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    await expect(
      setPayoutStatus(admin, {
        payoutItemId: 23,
        transactionId: 45,
        status: "settled",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("locks a settled payee from normal administrators at the backend", async () => {
    const db = makeDb([
      payout({
        status: "settled",
        isPaid: true,
        paidDate: new Date("2026-09-01"),
      }),
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);

    await expect(
      setPayoutStatus(admin, {
        payoutItemId: 23,
        transactionId: 45,
        status: "paid",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers before a status change can be attempted", async () => {
    await expect(
      setPayoutStatus(agent, {
        payoutItemId: 23,
        transactionId: 45,
        status: "reviewed",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("allows only a Transactions Admin to deliberately override a settled status and audits the reason", async () => {
    const db = makeDb([
      payout({
        status: "settled",
        isPaid: true,
        paidDate: new Date("2026-09-01"),
      }),
    ]);
    vi.mocked(getDb).mockResolvedValue(db as any);
    vi.mocked(canAdminUsePermission).mockResolvedValue(true);

    await expect(
      setPayoutStatus(admin, {
        payoutItemId: 23,
        transactionId: 45,
        status: "paid",
        overrideSettled: true,
        overrideReason: "Payment correction confirmed by accounting.",
      })
    ).resolves.toMatchObject({
      success: true,
      status: "paid",
      overrideRecorded: true,
    });

    expect(canAdminUsePermission).toHaveBeenCalledWith(
      admin,
      "canAdministerTransactions"
    );
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid", isPaid: true })
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payout_status_override",
        details: expect.objectContaining({
          previousStatus: "settled",
          newStatus: "paid",
          reason: "Payment correction confirmed by accounting.",
        }),
      })
    );
  });

  it("does not overwrite a payout settled by a simultaneous request", async () => {
    const initial = payout({ status: "reviewed" });
    const latest = payout({
      status: "settled",
      isPaid: true,
      paidDate: new Date("2026-09-01"),
    });
    const db = makeDb([initial], 0);
    const firstQuery = db.select.mock.results[0];
    void firstQuery;
    db.select
      .mockImplementationOnce(() => {
        const query = {
          from: vi.fn(),
          where: vi.fn(),
          limit: vi.fn().mockResolvedValue([initial]),
        };
        query.from.mockReturnValue(query);
        query.where.mockReturnValue(query);
        return query;
      })
      .mockImplementationOnce(() => {
        const query = {
          from: vi.fn(),
          where: vi.fn(),
          limit: vi
            .fn()
            .mockResolvedValue([
              { status: latest.status, isPaid: latest.isPaid },
            ]),
        };
        query.from.mockReturnValue(query);
        query.where.mockReturnValue(query);
        return query;
      });
    vi.mocked(getDb).mockResolvedValue(db as any);

    await expect(
      setPayoutStatus(admin, {
        payoutItemId: 23,
        transactionId: 45,
        status: "paid",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe("payout workflow migration", () => {
  it("maps legacy paid records to Paid and remaining records to Unreviewed without deleting transaction data", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0135_payout_status_workflow.sql"),
      "utf8"
    );
    expect(migration).toContain(
      "ADD COLUMN `status` enum('unreviewed','reviewed','paid','settled')"
    );
    expect(migration).toContain(
      "CASE WHEN `isPaid` = 1 THEN 'paid' ELSE 'unreviewed' END"
    );
    expect(migration).not.toMatch(
      /DELETE\s+FROM\s+`?(transaction_payout_items|transactions)`?/i
    );
  });
});
