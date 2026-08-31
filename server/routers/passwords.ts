import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { passwordEntries, passwordListShares, passwordLists, users } from "../../drizzle/schema";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { capabilitiesForPasswordShare, normalizePasswordShareGrant, type PasswordShareGrant } from "../passwordListSharing";

const PASSWORD_LIST_SUPER_USERS = new Set([
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
]);

const sharedUserIdsSchema = z.array(z.number().int().positive()).max(500).optional();
const shareGrantSchema = z.object({
  userId: z.number().int().positive(),
  canView: z.boolean().default(false),
  canCreate: z.boolean().default(false),
  canEdit: z.boolean().default(false),
});
const shareGrantsSchema = z.array(shareGrantSchema).max(500).optional();

type PasswordViewer = {
  id: number;
  email?: string | null;
  role?: string | null;
};

function isPasswordListSuperUser(user: PasswordViewer) {
  return PASSWORD_LIST_SUPER_USERS.has((user.email ?? "").toLowerCase());
}

function canCreatePasswordLists(user: PasswordViewer) {
  return user.role === "admin" || isPasswordListSuperUser(user);
}

function fullListCapabilities() {
  return { canView: true, canCreateEntries: true, canEditEntries: true };
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
    db.select({
      listId: passwordListShares.listId,
      userId: passwordListShares.userId,
      canView: passwordListShares.canView,
      canCreate: passwordListShares.canCreate,
      canEdit: passwordListShares.canEdit,
    }).from(passwordListShares),
  ]);

  const sharesByList = new Map<number, PasswordShareGrant[]>();
  for (const share of shares) {
    const listShares = sharesByList.get(share.listId) ?? [];
    listShares.push(normalizePasswordShareGrant({
      userId: share.userId,
      canView: share.canView,
      canCreate: share.canCreate,
      canEdit: share.canEdit,
    }));
    sharesByList.set(share.listId, listShares);
  }

  const isSuperUser = isPasswordListSuperUser(user);
  return lists
    .map((list: any) => {
      const isOwner = list.createdByUserId === user.id;
      const canManage = isSuperUser || isOwner;
      const ownGrant = sharesByList.get(list.id)?.find((grant) => grant.userId === user.id);
      const capabilities = canManage ? fullListCapabilities() : capabilitiesForPasswordShare(ownGrant);
      return {
        ...list,
        ownerName: list.ownerName ?? "Unassigned",
        ownerEmail: list.ownerEmail ?? null,
        isOwner,
        canManage,
        ...capabilities,
        // Keep this additive legacy field for any existing caller that only
        // knows whether a person has list visibility.
        sharedUserIds: canManage
          ? (sharesByList.get(list.id) ?? []).filter((grant) => grant.userId !== list.createdByUserId).map((grant) => grant.userId)
          : [],
        // Only managers can inspect or alter another person's permissions.
        shareGrants: canManage
          ? (sharesByList.get(list.id) ?? []).filter((grant) => grant.userId !== list.createdByUserId)
          : [],
      };
    })
    .filter((list: any) => list.canView);
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
    throw new TRPCError({ code: "FORBIDDEN", message: "Only this list's owner can manage its sharing and settings." });
  }
  return list;
}

async function requireListEntryCreator(db: any, user: PasswordViewer, listId: number) {
  const list = await requireListAccess(db, user, listId);
  if (!list.canCreateEntries) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to create password entries in this list." });
  }
  return list;
}

async function requireListEntryEditor(db: any, user: PasswordViewer, listId: number) {
  const list = await requireListAccess(db, user, listId);
  if (!list.canEditEntries) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to edit password entries in this list." });
  }
  return list;
}

function normalizeRequestedGrants(input: {
  sharedUserIds?: number[];
  shareGrants?: PasswordShareGrant[];
}): PasswordShareGrant[] | undefined {
  if (input.shareGrants !== undefined) {
    const byUserId = new Map<number, PasswordShareGrant>();
    for (const rawGrant of input.shareGrants) {
      const grant = normalizePasswordShareGrant(rawGrant);
      const existing = byUserId.get(grant.userId);
      byUserId.set(grant.userId, existing ? normalizePasswordShareGrant({
        userId: grant.userId,
        canView: existing.canView || grant.canView,
        canCreate: existing.canCreate || grant.canCreate,
        canEdit: existing.canEdit || grant.canEdit,
      }) : grant);
    }
    return Array.from(byUserId.values()).filter((grant) => grant.canView);
  }
  if (input.sharedUserIds !== undefined) {
    return Array.from(new Set(input.sharedUserIds)).map((userId) => ({ userId, canView: true, canCreate: false, canEdit: false }));
  }
  return undefined;
}

async function validateShareGrants(db: any, grants: PasswordShareGrant[] | undefined, ownerUserId: number): Promise<PasswordShareGrant[] | undefined> {
  if (grants === undefined) return undefined;
  const normalized = grants
    .filter((grant) => grant.userId !== ownerUserId)
    .map(normalizePasswordShareGrant);
  if (normalized.length === 0) return [];

  const activeUsers = await db.select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, normalized.map((grant) => grant.userId)), eq(users.isActive, true)));
  if (activeUsers.length !== normalized.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Password lists can only be shared with active SavvyOS users.",
    });
  }
  return normalized;
}

async function replaceShareGrants(tx: any, listId: number, sharedByUserId: number, grants: PasswordShareGrant[]): Promise<void> {
  await tx.delete(passwordListShares).where(eq(passwordListShares.listId, listId));
  if (grants.length) {
    await tx.insert(passwordListShares).values(grants.map((grant) => ({
      listId,
      userId: grant.userId,
      canView: grant.canView,
      canCreate: grant.canCreate,
      canEdit: grant.canEdit,
      sharedByUserId,
    })));
  }
}

export const passwordsRouter = router({
  // ─── Lists ──────────────────────────────────────────────────────────────────

  /** Get only lists the current user owns, is shared on, or is a designated super user for. */
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
      shareGrants: shareGrantsSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const viewer = ctx.user as PasswordViewer;
      if (!canCreatePasswordLists(viewer)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const requestedGrants = normalizeRequestedGrants(input);
      const shareGrants = await validateShareGrants(db, requestedGrants, viewer.id) ?? [];
      const result = await db.transaction(async (tx: any) => {
        const created = await tx.insert(passwordLists).values({
          name: input.name,
          description: input.description ?? null,
          createdByUserId: viewer.id,
        });
        const listId = created[0].insertId;
        if (shareGrants.length) {
          await tx.insert(passwordListShares).values(shareGrants.map((grant) => ({
            listId,
            userId: grant.userId,
            canView: grant.canView,
            canCreate: grant.canCreate,
            canEdit: grant.canEdit,
            sharedByUserId: viewer.id,
          })));
        }
        return listId;
      });
      return { id: result };
    }),

  /** Update list details and sharing. Only the owner or a designated super user can manage a list. */
  updateList: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      sharedUserIds: sharedUserIdsSchema,
      shareGrants: shareGrantsSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const viewer = ctx.user as PasswordViewer;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const list = await requireListManager(db, viewer, input.id);
      const requestedGrants = normalizeRequestedGrants(input);
      const shareGrants = await validateShareGrants(db, requestedGrants, list.createdByUserId!);

      await db.transaction(async (tx: any) => {
        await tx.update(passwordLists).set({
          name: input.name,
          description: input.description ?? null,
        }).where(eq(passwordLists.id, input.id));
        if (shareGrants !== undefined) await replaceShareGrants(tx, input.id, viewer.id, shareGrants);
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
      return entries.map((entry: any) => ({
        ...entry,
        canManage: list.canManage,
        canCreateEntries: list.canCreateEntries,
        canEditEntries: list.canEditEntries,
      }));
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

      const capabilitiesByListId = new Map(accessibleLists.map((list: any) => [list.id, list]));
      return entries.map((entry) => {
        const list = capabilitiesByListId.get(entry.listId) as any;
        return {
          ...entry,
          canManage: list?.canManage === true,
          canCreateEntries: list?.canCreateEntries === true,
          canEditEntries: list?.canEditEntries === true,
        };
      });
    }),

  /** Create a password entry when the owner or a share grant allows it. */
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
      await requireListEntryCreator(db, ctx.user as PasswordViewer, input.listId);
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

  /** Update a password entry when the owner or a share grant allows it. */
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
      await requireListEntryEditor(db, ctx.user as PasswordViewer, entry.listId);
      await db.update(passwordEntries).set({
        title: input.title,
        username: input.username ?? null,
        password: input.password ?? null,
        loginUrl: input.loginUrl ?? null,
        notes: input.notes ?? null,
      }).where(eq(passwordEntries.id, input.id));
      return { success: true };
    }),

  /** Delete a password entry when the owner or a share grant allows it. */
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
      await requireListEntryEditor(db, ctx.user as PasswordViewer, entry.listId);
      await db.delete(passwordEntries).where(eq(passwordEntries.id, input.id));
      return { success: true };
    }),
});
