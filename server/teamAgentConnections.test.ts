import { describe, expect, it, vi } from "vitest";
import { ensureTeamAgentConnection, ensureTeamAgentConnections } from "./db";

type FakeDbOptions = {
  selectResponses: Array<Array<Record<string, unknown>>>;
  insertResult?: Array<{ insertId: number }>;
  insertError?: unknown;
};

function makeFakeDb({
  selectResponses,
  insertResult = [{ insertId: 101 }],
  insertError,
}: FakeDbOptions) {
  const limit = vi.fn(async () => selectResponses.shift() ?? []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const values = vi.fn(async () => {
    if (insertError) throw insertError;
    return insertResult;
  });
  const insert = vi.fn(() => ({ values }));
  return { db: { select, insert }, select, insert, values };
}

describe("ensureTeamAgentConnection", () => {
  it("creates an active agent's missing client connection", async () => {
    const fake = makeFakeDb({
      selectResponses: [[{ role: "agent", isActive: true }], []],
      insertResult: [{ insertId: 44 }],
    });

    const result = await ensureTeamAgentConnection({
      agentId: 7,
      contactId: 19,
      pipelineStatus: "under_contract",
      db: fake.db,
    });

    expect(result).toEqual({ created: true, connectionId: 44 });
    expect(fake.values).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 7,
        contactId: 19,
        pipelineStatus: "under_contract",
        agingUpdatedAt: expect.any(Date),
      })
    );
  });

  it("does not create a second connection or overwrite the existing pipeline record", async () => {
    const fake = makeFakeDb({
      selectResponses: [[{ role: "agent", isActive: true }], [{ id: 21 }]],
    });

    const result = await ensureTeamAgentConnection({
      agentId: 7,
      contactId: 19,
      pipelineStatus: "closed",
      db: fake.db,
    });

    expect(result).toEqual({ created: false, connectionId: 21 });
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("skips non-agent and inactive users because they do not own agent pipelines", async () => {
    const admin = makeFakeDb({
      selectResponses: [[{ role: "admin", isActive: true }]],
    });
    const inactiveAgent = makeFakeDb({
      selectResponses: [[{ role: "agent", isActive: false }]],
    });

    await expect(
      ensureTeamAgentConnection({
        agentId: 1,
        contactId: 2,
        pipelineStatus: "active_client",
        db: admin.db,
      })
    ).resolves.toEqual({ created: false });
    await expect(
      ensureTeamAgentConnection({
        agentId: 3,
        contactId: 4,
        pipelineStatus: "active_client",
        db: inactiveAgent.db,
      })
    ).resolves.toEqual({ created: false });

    expect(admin.insert).not.toHaveBeenCalled();
    expect(inactiveAgent.insert).not.toHaveBeenCalled();
  });

  it("treats a concurrent unique-index insert as a no-op", async () => {
    const fake = makeFakeDb({
      selectResponses: [[{ role: "agent", isActive: true }], [], [{ id: 88 }]],
      insertError: { code: "ER_DUP_ENTRY" },
    });

    await expect(
      ensureTeamAgentConnection({
        agentId: 7,
        contactId: 19,
        pipelineStatus: "active_client",
        db: fake.db,
      })
    ).resolves.toEqual({ created: false, connectionId: 88 });
  });

  it("deduplicates deal contacts and maps the record status to the initial pipeline stage", async () => {
    const fake = makeFakeDb({
      selectResponses: [
        [{ role: "agent", isActive: true }],
        [],
        [{ role: "agent", isActive: true }],
        [],
      ],
      insertResult: [{ insertId: 55 }],
    });

    await ensureTeamAgentConnections({
      agentId: 7,
      contactIds: [19, 19, null, 26],
      recordStatus: "under_contract",
      db: fake.db,
    });

    expect(fake.values).toHaveBeenCalledTimes(2);
    expect(fake.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contactId: 19,
        pipelineStatus: "under_contract",
      })
    );
    expect(fake.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contactId: 26,
        pipelineStatus: "under_contract",
      })
    );
  });
});

describe("transaction and listing coverage", () => {
  it("routes all record creates and updates through the shared connection helper", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./db.ts", import.meta.url), "utf8");

    for (const helper of [
      "createTransaction",
      "updateTransaction",
      "createListing",
      "updateListing",
    ]) {
      const start = source.indexOf(`export async function ${helper}(`);
      const next = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, next === -1 ? source.length : next);
      expect(body).toContain("ensureTeamAgentConnections");
    }
  });
});
