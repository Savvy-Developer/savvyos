import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  accountabilitySeatHolders,
  accountabilitySeats,
  activityLog,
  adminPermissions,
  rolesResponsibilities,
  users,
} from "../../drizzle/schema";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Viewer = { id: number; role: string; email?: string | null };

const seatInput = z.object({
  title: z.string().trim().min(2).max(255),
  description: z.string().trim().max(10_000).nullable().optional(),
  parentSeatId: z.number().int().positive().nullable().optional(),
  holderIds: z.array(z.number().int().positive()).max(50).default([]),
});

async function requireAccountabilityAccess(db: Db, viewer: Viewer): Promise<void> {
  if (viewer.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "The Accountability Chart is available to authorized administrators only.",
    });
  }

  // Keep the same administrative access boundary used by Roles & Responsibilities.
  // Tyler retains the existing owner-level exception; no permissions are changed here.
  if ((viewer.email ?? "").toLowerCase() === "tyler@savvy.realty") return;
  const [permission] = await db
    .select({ canViewRolesResponsibilities: adminPermissions.canViewRolesResponsibilities })
    .from(adminPermissions)
    .where(eq(adminPermissions.userId, viewer.id))
    .limit(1);
  if (permission && !permission.canViewRolesResponsibilities) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to the Accountability Chart.",
    });
  }
}

async function getSeatOrThrow(db: Db, id: number) {
  const [seat] = await db
    .select()
    .from(accountabilitySeats)
    .where(eq(accountabilitySeats.id, id))
    .limit(1);
  if (!seat) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Accountability seat not found." });
  }
  return seat;
}

async function assertValidParent(
  db: Db,
  parentSeatId: number | null,
  seatId?: number
): Promise<void> {
  if (parentSeatId == null) return;
  if (parentSeatId === seatId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A seat cannot report to itself." });
  }

  const seats = await db
    .select({ id: accountabilitySeats.id, parentSeatId: accountabilitySeats.parentSeatId })
    .from(accountabilitySeats);
  const seatById = new Map(seats.map(seat => [seat.id, seat]));
  if (!seatById.has(parentSeatId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an existing parent seat." });
  }

  // Walking upward from the proposed parent prevents placing a seat beneath one
  // of its own descendants, which would make the chart impossible to render.
  const seen = new Set<number>();
  let cursor: number | null = parentSeatId;
  while (cursor != null) {
    if (cursor === seatId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A seat cannot report to one of its own child seats.",
      });
    }
    if (seen.has(cursor)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The seat hierarchy contains a cycle." });
    }
    seen.add(cursor);
    cursor = seatById.get(cursor)?.parentSeatId ?? null;
  }
}

async function assertActivePeople(db: Db, holderIds: number[]): Promise<number[]> {
  const uniqueIds = Array.from(new Set(holderIds));
  if (!uniqueIds.length) return uniqueIds;
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, uniqueIds), eq(users.isActive, true)));
  if (people.length !== uniqueIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Each seat holder must be an active SavvyOS user.",
    });
  }
  return uniqueIds;
}

async function replaceHolders(db: Db, seatId: number, holderIds: number[]): Promise<void> {
  await db.delete(accountabilitySeatHolders).where(eq(accountabilitySeatHolders.seatId, seatId));
  if (!holderIds.length) return;
  await db.insert(accountabilitySeatHolders).values(
    holderIds.map((userId, sortOrder) => ({ seatId, userId, sortOrder }))
  );
}

export const accountabilityChartRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireAccountabilityAccess(db, ctx.user as Viewer);

    const seats = await db
      .select()
      .from(accountabilitySeats)
      .orderBy(asc(accountabilitySeats.sortOrder), asc(accountabilitySeats.title));
    const seatIds = seats.map(seat => seat.id);
    if (!seatIds.length) return [];

    const [holderRows, responsibilityCounts] = await Promise.all([
      db
        .select({ seatId: accountabilitySeatHolders.seatId, user: users })
        .from(accountabilitySeatHolders)
        .innerJoin(users, eq(accountabilitySeatHolders.userId, users.id))
        .where(inArray(accountabilitySeatHolders.seatId, seatIds))
        .orderBy(asc(accountabilitySeatHolders.sortOrder), asc(users.name)),
      db
        .select({ seatId: rolesResponsibilities.seatId, count: sqlCount() })
        .from(rolesResponsibilities)
        .where(and(inArray(rolesResponsibilities.seatId, seatIds), eq(rolesResponsibilities.status, "active")))
        .groupBy(rolesResponsibilities.seatId),
    ]);

    const holdersBySeat = new Map<number, Array<{ id: number; name: string | null; email: string | null; title: string | null }>>();
    for (const row of holderRows) {
      const holders = holdersBySeat.get(row.seatId) ?? [];
      holders.push({
        id: row.user.id,
        name: row.user.name,
        email: row.user.email,
        title: row.user.title,
      });
      holdersBySeat.set(row.seatId, holders);
    }
    const responsibilityCountBySeat = new Map(
      responsibilityCounts
        .filter(row => row.seatId != null)
        .map(row => [row.seatId!, Number(row.count)])
    );

    return seats.map(seat => ({
      ...seat,
      holders: holdersBySeat.get(seat.id) ?? [],
      responsibilityCount: responsibilityCountBySeat.get(seat.id) ?? 0,
    }));
  }),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await requireAccountabilityAccess(db, ctx.user as Viewer);

      const seat = await getSeatOrThrow(db, input.id);
      const [holderRows, responsibilityRows] = await Promise.all([
        db
          .select({ user: users })
          .from(accountabilitySeatHolders)
          .innerJoin(users, eq(accountabilitySeatHolders.userId, users.id))
          .where(eq(accountabilitySeatHolders.seatId, input.id))
          .orderBy(asc(accountabilitySeatHolders.sortOrder), asc(users.name)),
        db
          .select({ responsibility: rolesResponsibilities, owner: users })
          .from(rolesResponsibilities)
          .innerJoin(users, eq(rolesResponsibilities.ownerId, users.id))
          .where(and(eq(rolesResponsibilities.seatId, input.id), eq(rolesResponsibilities.status, "active")))
          .orderBy(asc(rolesResponsibilities.title)),
      ]);

      return {
        ...seat,
        holders: holderRows.map(({ user }) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          title: user.title,
        })),
        responsibilities: responsibilityRows.map(({ responsibility, owner }) => ({
          id: responsibility.id,
          title: responsibility.title,
          cadence: responsibility.cadence,
          owner: { id: owner.id, name: owner.name, email: owner.email, title: owner.title },
        })),
      };
    }),

  people: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await requireAccountabilityAccess(db, ctx.user as Viewer);
    return db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        title: users.title,
        role: users.role,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.name));
  }),

  seatOptions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await requireAccountabilityAccess(db, ctx.user as Viewer);
    return db
      .select({ id: accountabilitySeats.id, title: accountabilitySeats.title, parentSeatId: accountabilitySeats.parentSeatId })
      .from(accountabilitySeats)
      .orderBy(asc(accountabilitySeats.sortOrder), asc(accountabilitySeats.title));
  }),

  create: protectedProcedure.input(seatInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    await requireAccountabilityAccess(db, ctx.user as Viewer);
    const parentSeatId = input.parentSeatId ?? null;
    const holderIds = await assertActivePeople(db, input.holderIds);
    await assertValidParent(db, parentSeatId);

    const [last] = await db
      .select({ sortOrder: accountabilitySeats.sortOrder })
      .from(accountabilitySeats)
      .orderBy(desc(accountabilitySeats.sortOrder))
      .limit(1);
    const [result] = await db.insert(accountabilitySeats).values({
      title: input.title,
      description: input.description ?? null,
      parentSeatId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdById: ctx.user.id,
    });
    const id = Number((result as any).insertId);
    await replaceHolders(db, id, holderIds);
    await db.insert(activityLog).values({
      userId: ctx.user.id,
      action: "accountability_seat_created",
      entityType: "accountability_seat",
      entityId: id,
      details: { title: input.title, parentSeatId, holderIds },
    });
    return { id };
  }),

  update: protectedProcedure
    .input(seatInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      await requireAccountabilityAccess(db, ctx.user as Viewer);
      await getSeatOrThrow(db, input.id);
      const parentSeatId = input.parentSeatId ?? null;
      const holderIds = await assertActivePeople(db, input.holderIds);
      await assertValidParent(db, parentSeatId, input.id);

      await db
        .update(accountabilitySeats)
        .set({ title: input.title, description: input.description ?? null, parentSeatId })
        .where(eq(accountabilitySeats.id, input.id));
      await replaceHolders(db, input.id, holderIds);
      await db.insert(activityLog).values({
        userId: ctx.user.id,
        action: "accountability_seat_updated",
        entityType: "accountability_seat",
        entityId: input.id,
        details: { title: input.title, parentSeatId, holderIds },
      });
      return { id: input.id };
    }),
});

// Kept as a helper so Drizzle emits a portable grouped count for MySQL.
function sqlCount() {
  return sql<number>`count(*)`;
}
