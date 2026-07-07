import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { kbCategories, kbArticles } from "../../drizzle/schema";
import { eq, asc, and, inArray } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
}

/** Returns the list of roles that can view an article given the user's role */
function canViewArticle(visibleToRoles: string, userRole: string): boolean {
  if (userRole === "admin") return true;
  const roles = visibleToRoles.split(",").map((r) => r.trim());
  // agent_support gets the same KB visibility as agent
  const effectiveRole = userRole === "agent_support" ? "agent" : userRole;
  return roles.includes(effectiveRole);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const knowledgeBaseRouter = router({
  // ── Categories ──────────────────────────────────────────────────────────────

  /** List all categories. Agents/ISAs get only categories that have at least one visible article. */
  listCategories: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const cats = await db
      .select()
      .from(kbCategories)
      .orderBy(asc(kbCategories.sortOrder), asc(kbCategories.name));
    return cats;
  }),

  createCategory: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        type: z.enum(["sop", "reference", "training"]),
        description: z.string().optional(),
        sortOrder: z.number().int().default(0),
        visibleToRoles: z.string().default("admin,agent,isa"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(kbCategories).values({
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        visibleToRoles: input.visibleToRoles,
      });
      return { id: (result as any).insertId };
    }),

  updateCategory: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(255).optional(),
        type: z.enum(["sop", "reference", "training"]).optional(),
        description: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        visibleToRoles: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(kbCategories).set(data).where(eq(kbCategories.id, id));
      return { success: true };
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(kbCategories).where(eq(kbCategories.id, input.id));
      return { success: true };
    }),

  // ── Articles ────────────────────────────────────────────────────────────────

  /** List articles in a category, filtered by visibility for non-admins */
  listArticles: protectedProcedure
    .input(z.object({ categoryId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const all = await db
        .select({
          id: kbArticles.id,
          categoryId: kbArticles.categoryId,
          title: kbArticles.title,
          visibleToRoles: kbArticles.visibleToRoles,
          status: kbArticles.status,
          sortOrder: kbArticles.sortOrder,
          createdAt: kbArticles.createdAt,
          updatedAt: kbArticles.updatedAt,
        })
        .from(kbArticles)
        .where(eq(kbArticles.categoryId, input.categoryId))
        .orderBy(asc(kbArticles.sortOrder), asc(kbArticles.title));

      if (ctx.user.role === "admin") return all;

      // Non-admins: only published articles visible to their role
      return all.filter(
        (a) =>
          a.status === "published" && canViewArticle(a.visibleToRoles, ctx.user.role)
      );
    }),

  /** Get a single article with full content */
  getArticle: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [article] = await db
        .select()
        .from(kbArticles)
        .where(eq(kbArticles.id, input.id));
      if (!article) throw new TRPCError({ code: "NOT_FOUND" });

      if (ctx.user.role !== "admin") {
        if (
          article.status !== "published" ||
          !canViewArticle(article.visibleToRoles, ctx.user.role)
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      return article;
    }),

  createArticle: protectedProcedure
    .input(
      z.object({
        categoryId: z.number().int(),
        title: z.string().min(1).max(512),
        content: z.string().default(""),
        visibleToRoles: z.string().default("admin"),
        status: z.enum(["draft", "published"]).default("draft"),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(kbArticles).values({
        categoryId: input.categoryId,
        title: input.title,
        content: input.content,
        visibleToRoles: input.visibleToRoles,
        status: input.status,
        sortOrder: input.sortOrder,
        createdById: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  updateArticle: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().min(1).max(512).optional(),
        content: z.string().optional(),
        categoryId: z.number().int().optional(),
        visibleToRoles: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(kbArticles).set(data).where(eq(kbArticles.id, id));
      return { success: true };
    }),

  deleteArticle: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(kbArticles).where(eq(kbArticles.id, input.id));
      return { success: true };
    }),

  /** Toggle visibility — admin only. Accepts a comma-separated roles string like "admin,agent,isa" */
  setVisibility: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        visibleToRoles: z.string(), // e.g. "admin,agent,isa"
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(kbArticles)
        .set({ visibleToRoles: input.visibleToRoles })
        .where(eq(kbArticles.id, input.id));
      return { success: true };
    }),

  /** Toggle published/draft status */
  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["draft", "published"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(kbArticles)
        .set({ status: input.status })
        .where(eq(kbArticles.id, input.id));
      return { success: true };
    }),

  /** Search articles by title (respects visibility) */
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const all = await db
        .select({
          id: kbArticles.id,
          categoryId: kbArticles.categoryId,
          title: kbArticles.title,
          visibleToRoles: kbArticles.visibleToRoles,
          status: kbArticles.status,
          sortOrder: kbArticles.sortOrder,
          createdAt: kbArticles.createdAt,
          updatedAt: kbArticles.updatedAt,
        })
        .from(kbArticles)
        .orderBy(asc(kbArticles.title));

      const q = input.query.toLowerCase();
      const filtered = all.filter((a) => a.title.toLowerCase().includes(q));

      if (ctx.user.role === "admin") return filtered;
      return filtered.filter(
        (a) =>
          a.status === "published" && canViewArticle(a.visibleToRoles, ctx.user.role)
      );
    }),
});
