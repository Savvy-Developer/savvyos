import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { kbCategories, kbArticles } from "../../drizzle/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { formatKnowledgeBaseFallback } from "../_core/llmFallbacks";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(role: string) {
  if (role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
}

/** Returns the list of roles that can view an article given the user's role */
function canViewArticle(visibleToRoles: string, userRole: string): boolean {
  if (userRole === "admin") return true;
  const roles = visibleToRoles.split(",").map((r) => r.trim());
  // Agent Support can receive dedicated content and retains access to agent-facing references.
  return roles.includes(userRole) || (userRole === "agent_support" && roles.includes("agent"));
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
    if (ctx.user.role === "admin") return cats;

    const articles = await db
      .select({
        categoryId: kbArticles.categoryId,
        visibleToRoles: kbArticles.visibleToRoles,
        status: kbArticles.status,
      })
      .from(kbArticles);

    return cats.filter((category) =>
      canViewArticle(category.visibleToRoles, ctx.user.role) &&
      articles.some(
        (article) =>
          article.categoryId === category.id &&
          article.status === "published" &&
          canViewArticle(article.visibleToRoles, ctx.user.role)
      )
    );
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
      const [category] = await db
        .select({ visibleToRoles: kbCategories.visibleToRoles })
        .from(kbCategories)
        .where(eq(kbCategories.id, input.categoryId));
      if (!category) return [];
      if (ctx.user.role !== "admin" && !canViewArticle(category.visibleToRoles, ctx.user.role)) {
        return [];
      }

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
        const [category] = await db
          .select({ visibleToRoles: kbCategories.visibleToRoles })
          .from(kbCategories)
          .where(eq(kbCategories.id, article.categoryId));
        if (
          !category ||
          article.status !== "published" ||
          !canViewArticle(category.visibleToRoles, ctx.user.role) ||
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

  /** AI-powered content formatter — rewrites pasted/messy content into clean Markdown */
  formatWithAI: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(50000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      try {
        const result = await invokeLLM({
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content: `You are a professional technical writer for a short-term rental real estate brokerage called Savvy STR Agents.
Your job is to take raw, unformatted, or poorly formatted content and rewrite it into clean, well-structured Markdown.

Rules:
- Preserve ALL factual information — do not add or remove content, only restructure and clean it up.
- Use proper Markdown: headings (##, ###), bullet lists, numbered lists, bold for key terms, code blocks for scripts/commands.
- Fix grammar, punctuation, and capitalization.
- Break long walls of text into logical sections with clear headings.
- If the content is already well-formatted, return it as-is with only minor improvements.
- Return ONLY the Markdown — no preamble, no explanation, no code fences around the whole response.`,
            },
            {
              role: "user",
              content: `Please format the following content:\n\n${input.content}`,
            },
          ],
          maxTokens: 8192,
        });

        const markdown = result.choices[0]?.message?.content;
        if (typeof markdown !== "string") {
          throw new Error("AI returned no content");
        }
        return { markdown: markdown.trim(), source: "ai" as const };
      } catch (error) {
        // Keep an editorial workflow available during a provider outage. This
        // conservative fallback preserves content and performs only mechanical
        // Markdown cleanup; it never presents a generated rewrite as AI output.
        console.error("Knowledgebase AI formatter unavailable; using safe cleanup", error);
        return { markdown: formatKnowledgeBaseFallback(input.content), source: "fallback" as const };
      }
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

      const categories = await db
        .select({ id: kbCategories.id, visibleToRoles: kbCategories.visibleToRoles })
        .from(kbCategories);
      const categoriesById = new Map(categories.map((category) => [category.id, category]));
      return filtered.filter((a) => {
        const category = categoriesById.get(a.categoryId);
        return Boolean(
          category &&
          a.status === "published" &&
          canViewArticle(category.visibleToRoles, ctx.user.role) &&
          canViewArticle(a.visibleToRoles, ctx.user.role)
        );
      });
    }),
});
