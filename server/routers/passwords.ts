import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { passwordLists, passwordEntries } from "../../drizzle/schema";
import { eq, like, or, desc } from "drizzle-orm";

export const passwordsRouter = router({
  // ─── Lists ──────────────────────────────────────────────────────────────────

  /** Get all password lists */
  getLists: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(passwordLists).orderBy(desc(passwordLists.createdAt));
  }),

  /** Create a new password list */
  createList: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(passwordLists).values({
        name: input.name,
        description: input.description ?? null,
        createdByUserId: ctx.user.id,
      });
      return { id: result[0].insertId };
    }),

  /** Update a password list */
  updateList: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(passwordLists).set({
        name: input.name,
        description: input.description ?? null,
      }).where(eq(passwordLists.id, input.id));
      return { success: true };
    }),

  /** Delete a password list (cascades to entries) */
  deleteList: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(passwordLists).where(eq(passwordLists.id, input.id));
      return { success: true };
    }),

  // ─── Entries ────────────────────────────────────────────────────────────────

  /** Get all entries for a specific list */
  getEntries: protectedProcedure
    .input(z.object({ listId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(passwordEntries)
        .where(eq(passwordEntries.listId, input.listId))
        .orderBy(desc(passwordEntries.createdAt));
    }),

  /** Search entries across all lists */
  searchEntries: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const pattern = `%${input.query}%`;
      return db.select({
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
        .where(
          or(
            like(passwordEntries.title, pattern),
            like(passwordEntries.username, pattern),
            like(passwordEntries.notes, pattern),
            like(passwordEntries.loginUrl, pattern),
          )
        )
        .orderBy(desc(passwordEntries.createdAt));
    }),

  /** Create a new password entry */
  createEntry: protectedProcedure
    .input(z.object({
      listId: z.number(),
      title: z.string().min(1).max(255),
      username: z.string().max(255).optional(),
      password: z.string().max(500).optional(),
      loginUrl: z.string().max(1000).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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

  /** Update a password entry */
  updateEntry: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255),
      username: z.string().max(255).optional(),
      password: z.string().max(500).optional(),
      loginUrl: z.string().max(1000).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(passwordEntries).set({
        title: input.title,
        username: input.username ?? null,
        password: input.password ?? null,
        loginUrl: input.loginUrl ?? null,
        notes: input.notes ?? null,
      }).where(eq(passwordEntries.id, input.id));
      return { success: true };
    }),

  /** Delete a password entry */
  deleteEntry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(passwordEntries).where(eq(passwordEntries.id, input.id));
      return { success: true };
    }),
});
