/**
 * The listings and transactions CSV uploads with a property that is probably
 * one SavvyOS already has. No database: the db helpers are stubbed, and the
 * real DuplicatePropertyError classes are kept so the routers' instanceof
 * checks run as they do in production.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
    createProperty: vi.fn(),
    findPropertyDuplicate: vi.fn(),
    createContact: vi.fn(),
    createListing: vi.fn(),
    createTransaction: vi.fn(),
    logActivity: vi.fn(),
  };
});
vi.mock("./checklistService", () => ({ applyAutomaticChecklists: vi.fn(), recalculateChecklistDueDates: vi.fn() }));
vi.mock("./isaOutcomeAttribution", () => ({ syncIsaOutcomeAttribution: vi.fn() }));

import { contacts, properties, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { DuplicatePropertyError, PossibleDuplicatePropertyError } from "./db";
import { appRouter } from "./routers";

const mocked = db as unknown as Record<
  "getDb" | "createProperty" | "findPropertyDuplicate" | "createContact" | "createListing" | "createTransaction",
  ReturnType<typeof vi.fn>
>;

const OVERLOOK = { id: 861, address: "360 E Overlook", city: "Glendale", state: "UT", zip: "84729" };
const MESSAGE = "Possible duplicate of #861 (360 E Overlook, Glendale, UT 84729)";

/** select().from(table).where() answers with that table's rows, awaited or with limit(). */
function fakeDb(rowsFor: Map<unknown, unknown[]>) {
  return {
    select: () => ({
      from: (table: unknown) => {
        const rows = rowsFor.get(table) ?? [];
        const where = () => ({
          limit: async () => rows,
          then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(rows).then(resolve, reject),
        });
        return { where };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
}

function adminCaller() {
  const user = {
    id: 1,
    openId: "admin-open-id",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus" as const,
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    realUser: user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listings CSV upload: possible duplicate property", () => {
  const row = {
    address: "360 E Overlook Ln",
    city: "Glendale",
    state: "UT",
    zip: "84729",
    listPrice: "450000",
    sellerFirstName: "Pat",
    sellerLastName: "Seller",
  };

  beforeEach(() => {
    mocked.getDb.mockResolvedValue(fakeDb(new Map()));
  });

  it("reports the row as a possible duplicate of the existing property and creates nothing", async () => {
    mocked.createProperty.mockRejectedValue(new PossibleDuplicatePropertyError(OVERLOOK));
    const result = await adminCaller().listings.bulkUpload({ rows: [row] });
    expect(result).toMatchObject({ created: 0, skipped: 1, errors: 0 });
    expect(result.results).toEqual([{ row: 1, status: "skipped", reason: MESSAGE, label: "360 E Overlook Ln" }]);
    expect(mocked.createContact).not.toHaveBeenCalled();
    expect(mocked.createListing).not.toHaveBeenCalled();
  });

  it("lists the listing on the existing property when the address is an exact duplicate", async () => {
    mocked.createProperty.mockRejectedValue(new DuplicatePropertyError(OVERLOOK));
    mocked.createContact.mockResolvedValue(55);
    mocked.createListing.mockResolvedValue(300);
    const result = await adminCaller().listings.bulkUpload({ rows: [{ ...row, address: "360 east overlook" }] });
    expect(result).toMatchObject({ created: 1, skipped: 0, errors: 0 });
    expect(mocked.createListing.mock.calls[0][0]).toMatchObject({ propertyId: 861 });
  });
});

describe("transactions CSV upload: possible duplicate property", () => {
  const row = {
    rowIndex: 1,
    transactionType: "buyer",
    status: "closed",
    agentEmail: "agent@example.com",
    primaryContactFirstName: "Pat",
    primaryContactLastName: "Buyer",
    primaryContactEmail: "pat@example.com",
    propertyAddress: "360 E Overlook Ln",
    propertyCity: "Glendale",
    propertyState: "UT",
    propertyZip: "84729",
  };

  beforeEach(() => {
    mocked.getDb.mockResolvedValue(fakeDb(new Map<unknown, unknown[]>([
      [users, [{ id: 7, email: "agent@example.com", name: "Agent", commissionSplit: "70" }]],
      [contacts, []],
      [properties, []],
    ])));
    mocked.createContact.mockResolvedValue(55);
    mocked.createProperty.mockResolvedValue(2001);
    mocked.createTransaction.mockResolvedValue(900);
  });

  it("rejects the row before creating its contact, so no orphan contact is left", async () => {
    mocked.findPropertyDuplicate.mockResolvedValue(new PossibleDuplicatePropertyError(OVERLOOK));
    const result = await adminCaller().transactions.bulkUpload({ rows: [row] });
    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
    expect(result.results[0].errors).toEqual([
      `${MESSAGE}. Use the existing property's exact address, or add the property first.`,
    ]);
    expect(mocked.createContact).not.toHaveBeenCalled();
    expect(mocked.createProperty).not.toHaveBeenCalled();
    expect(mocked.createTransaction).not.toHaveBeenCalled();
  });

  it("links an exact duplicate to the existing property without creating one", async () => {
    mocked.findPropertyDuplicate.mockResolvedValue(new DuplicatePropertyError(OVERLOOK));
    const result = await adminCaller().transactions.bulkUpload({ rows: [row] });
    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(mocked.createProperty).not.toHaveBeenCalled();
    expect(mocked.createTransaction.mock.calls[0][0]).toMatchObject({ propertyId: 861, primaryContactId: 55 });
  });

  it("creates a new property after the contact when there is no duplicate", async () => {
    mocked.findPropertyDuplicate.mockResolvedValue(null);
    const result = await adminCaller().transactions.bulkUpload({ rows: [row] });
    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(mocked.createProperty.mock.calls[0][0]).toMatchObject({ address: "360 E Overlook Ln", zip: "84729" });
    expect(mocked.createTransaction.mock.calls[0][0]).toMatchObject({ propertyId: 2001 });
  });

  it("does not create the property for a row that fails validation", async () => {
    mocked.findPropertyDuplicate.mockResolvedValue(null);
    const result = await adminCaller().transactions.bulkUpload({ rows: [{ ...row, agentEmail: "nobody@example.com" }] });
    expect(result).toMatchObject({ succeeded: 0, failed: 1 });
    expect(mocked.findPropertyDuplicate).not.toHaveBeenCalled();
    expect(mocked.createProperty).not.toHaveBeenCalled();
    expect(mocked.createContact).not.toHaveBeenCalled();
  });
});
