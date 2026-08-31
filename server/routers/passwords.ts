import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { passwordEntries, passwordListShares, passwordLists, users } from "../../drizzle/schema";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";

const PASSWORD_LIST_SUPER_USERS = new Set([
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
]);

const sharedUserIdsSchema = z.array(z.number().int().positive()).max(500).optional();

type PasswordViewer = {
  id: number;
  email?: string | null;
  role?: string | null;
};

function isPasswordListSuperUser(user: PasswordViewer) {
  return user.role === "admin" || PASSWORD_LIST_SUPER_USERS.has((user.email ?? "").toLowerCase());
}

function canCreatePasswordLists(user: PasswordViewer) {
  return user.role === "admin" || isPasswordListSuperUser(user);
}

async function getAccessibleLists(db: any, user: PasswordViewer) {
  const [lists, shares] = await Promise.all([
    db.select({
      id: passwordLists.id,
      name: passwordLists.name,
      description: passwordLists.description,
      createdByUserId: passwordLists.createdByUserId,
      createdAt: passwordLists.createdAt,
      updatedAt: passwordLists.updatedAt,
      ownerName: users.name,
      ownerEmail: users.email,
    })
      .from(passwordLists)
      .leftJoin(users, eq(passwordLists.createdByUserId, users.id))
      .orderBy(desc(passwordLists.createdAt)),
    db.select({ listId: passwordListShares.listId, userId: passwordListShares.userId })
      .from(passwordListShares),
  ]);

  const sharedUserIdsByList = new Map<number, number[]>();
  for (const share of shares) {
    const existing = sharedUserIdsByList.get(share.listId) ?? [];
    existing.push(share.userId);
    sharedUserIdsByList.set(share.listId, existing);
  }

  const isSuperUser = isPasswordListSuperUser(user);
  return lists
    .filter((list: any) => {
      const isOwner = list.createdByUserId === user.id;
      const isSharedWithUser = (sharedUserIdsByList.get(list.id) ?? []).includes(user.id);
      return isSuperUser || isOwner || isSharedWithUser;
    })
    .map((list: any) => {
      const isOwner = list.createdByUserId === user.id;
      const canManage = isSuperUser || isOwner;
      return {
        ...list,
        ownerName: list.ownerName ?? "Unassigned",
        ownerEmail: list.ownerEmail ?? null,
        isOwner,
        canManage,
        sharedUserIds: canManage
          ? (sharedUserIdsByList.get(list.id) ?? []).filter((userId) => userId !== list.createdByUserId)
          : [],
      };
    });
}

async function requireListAccess(db: any, user: PasswordViewer, listId: number) {
  const list = (await getAccessibleLists(db, user)).find((candidate: any) => candidate.id === listId);
  if (!list) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this password list." });
  }
  return list;
}

async function requireListManager(db: any, user: PasswordViewer, listId: number) {
  const list = await requireListAccess(db, user, listId);
  if (!list.canManage) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only this list's owner can manage it." });
  }
  return list;
}

async function validateSharedUserIds(db: any, userIds: number[] | undefined, ownerUserId: number) {
  const normalizedIds = Array.from(new Set(userIds ?? [])).filter((userId) => userId !== ownerUserId);
  if (normalizedIds.length === 0) return normalizedIds;

  const activeUsers = await db.select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, normalizedIds), eq(users.isActive, true)));

  if (activeUsers.length !== normalizedIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Password lists can only be shared with active SavvyOS users.",
    });
  }

  return normalizedIds;
}

export const passwordsRouter = router({
  // ─── Lists ──────────────────────────────────────────────────────────────────

  /** Get lists the current user owns, is shared on, or may manage as an administrator or designated super user. */
  getLists: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return getAccessibleLists(db, ctx.user as PasswordViewer);
  }),

  /** Lightweight access check for showing the Passwords navigation item to shared recipients. */
  hasAccessibleLists: protectedProcedure.query(async ({ ctx }) => {
    const viewer = ctx.user as PasswordViewer;
    const db = await getDb();
    if (!db) return { hasAccessibleLists: false, canCreateLists: canCreatePasswordLists(viewer) };
    const lists = await getAccessibleLists(db, viewer);
    return {
      hasAccessibleLists: lists.length > 0,
      canCreateLists: canCreatePasswordLists(viewer),
    };
  }),

  /** Active users available to a list owner when granting access. */
  getShareableUsers: protectedProcedure.query(async ({ ctx }) => {
    if (!canCreatePasswordLists(ctx.user as PasswordViewer)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.name);
  }),

  /** Create a new password list owned by the creator and optionally shared with selected people. */
  createList: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      sharedUserIds: sharedUserIdsSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const viewer = ctx.user as PasswordViewer;
      if (!canCreatePasswordLists(viewer)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const sharedUserIds = await validateSharedUserIds(db, input.sharedUserIds, viewer.id);
      const result = await db.transaction(async (tx: any) => {
        const created = await tx.insert(passwordLists).values({
          name: input.name,
          description: input.description ?? null,
          createdByUserId: viewer.id,
        });
        const listId = created[0].insertId;
        if (sharedUserIds.length > 0) {
          await tx.insert(passwordListShares).values(
            sharedUserIds.map((userId) => ({ listId, userId, sharedByUserId: viewer.id }))
          );
        }
        return listId;
      });

      return { id: result };
    }),

  /** Update list details and sharing. Only the owner, an administrator, or a designated super user can manage a list. */
  updateList: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      sharedUserIds: sharedUserIdsSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const viewer = ctx.user as PasswordViewer;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const list = await requireListManager(db, viewer, input.id);
      const sharedUserIds = input.sharedUserIds === undefined
        ? undefined
        : await validateSharedUserIds(db, input.sharedUserIds, list.createdByUserId!);

      await db.transaction(async (tx: any) => {
        await tx.update(passwordLists).set({
          name: input.name,
          description: input.description ?? null,
        }).where(eq(passwordLists.id, input.id));

        if (sharedUserIds !== undefined) {
          await tx.delete(passwordListShares).where(eq(passwordListShares.listId, input.id));
          if (sharedUserIds.length > 0) {
            await tx.insert(passwordListShares).values(
              sharedUserIds.map((userId) => ({ listId: input.id, userId, sharedByUserId: viewer.id }))
            );
          }
        }
      });
      return { success: true };
    }),

  /** Delete a password list (cascades to sharing records and entries). */
  deleteList: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await requireListManager(db, ctx.user as PasswordViewer, input.id);
      await db.delete(passwordLists).where(eq(passwordLists.id, input.id));
      return { success: true };
    }),

  // ─── Entries ────────────────────────────────────────────────────────────────

  /** Get password entries only after confirming list-level visibility. */
  getEntries: protectedProcedure
    .input(z.object({ listId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const list = await requireListAccess(db, ctx.user as PasswordViewer, input.listId);
      const entries = await db.select().from(passwordEntries)
        .where(eq(passwordEntries.listId, input.listId))
        .orderBy(desc(passwordEntries.createdAt));
      return entries.map((entry: any) => ({ ...entry, canManage: list.canManage }));
    }),

  /** Search entries only across password lists visible to the current user. */
  searchEntries: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const accessibleLists = await getAccessibleLists(db, ctx.user as PasswordViewer);
      if (accessibleLists.length === 0) return [];

      const pattern = `%${input.query}%`;
      const entries = await db.select({
        id: passwordEntries.id,
        listId: passwordEntries.listId,
        title: passwordEntries.title,
        username: passwordEntries.username,
        password: passwordEntries.password,
        loginUrl: passwordEntries.loginUrl,
        notes: passwordEntries.notes,
        createdAt: passwordEntries.createdAt,
        listName: passwordLists.name,
      })
        .from(passwordEntries)
        .innerJoin(passwordLists, eq(passwordEntries.listId, passwordLists.id))
        .where(and(
          inArray(passwordEntries.listId, accessibleLists.map((list: any) => list.id)),
          or(
            like(passwordEntries.title, pattern),
            like(passwordEntries.username, pattern),
            like(passwordEntries.notes, pattern),
            like(passwordEntries.loginUrl, pattern),
          )
        ))
        .orderBy(desc(passwordEntries.createdAt));

      const managerByListId = new Map(accessibleLists.map((list: any) => [list.id, list.canManage]));
      return entries.map((entry) => ({ ...entry, canManage: managerByListId.get(entry.listId) === true }));
    }),

  /** Create a password entry. Shared recipients are read-only; owners and administrators can manage entries. */
  createEntry: protectedProcedure
    .input(z.object({
      listId: z.number().int().positive(),
      title: z.string().min(1).max(255),
      username: z.string().max(255).optional(),
      password: z.string().max(500).optional(),
      loginUrl: z.string().max(1000).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await requireListManager(db, ctx.user as PasswordViewer, input.listId);
      const result = await db.insert(passwordEntries).values({
        listId: input.listId,
        title: input.title,
        username: input.username ?? null,
        password: input.password ?? null,
        loginUrl: input.loginUrl ?? null,
        notes: input.notes ?? null,
        createdByUserId: ctx.user.id,
      });
      return { id: result[0].insertId };
    }),

  /** Update a password entry when the user manages its parent list. */
  updateEntry: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).max(255),
      username: z.string().max(255).optional(),
      password: z.string().max(500).optional(),
      loginUrl: z.string().max(1000).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [entry] = await db.select({ listId: passwordEntries.listId })
        .from(passwordEntries)
        .where(eq(passwordEntries.id, input.id))
        .limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      await requireListManager(db, ctx.user as PasswordViewer, entry.listId);
      await db.update(passwordEntries).set({
        title: input.title,
        username: input.username ?? null,
        password: input.password ?? null,
        loginUrl: input.loginUrl ?? null,
        notes: input.notes ?? null,
      }).where(eq(passwordEntries.id, input.id));
      return { success: true };
    }),

  /** Delete a password entry when the user manages its parent list. */
  deleteEntry: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [entry] = await db.select({ listId: passwordEntries.listId })
        .from(passwordEntries)
        .where(eq(passwordEntries.id, input.id))
        .limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      await requireListManager(db, ctx.user as PasswordViewer, entry.listId);
      await db.delete(passwordEntries).where(eq(passwordEntries.id, input.id));
      return { success: true };
    }),
});
