import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  landingPages,
  shortLinkClicks,
  shortLinks,
  users,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";
import { publicShortLinkUrl } from "../shortLinkRedirects";
import { canAdminUsePermission } from "./permissions";

const linkStatuses = ["active", "disabled", "archived"] as const;
const reservedSlugs = new Set([
  "admin",
  "api",
  "assets",
  "careers",
  "healthz",
  "login",
  "partner-lead",
  "talent-profile",
]);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and hyphens only."
  )
  .min(2)
  .max(120)
  .refine(
    value => !reservedSlugs.has(value),
    "That slug is reserved by SavvyOS."
  );

const destinationUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a destination URL.")
  .max(2000)
  .superRefine((value, ctx) => {
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) {
        ctx.addIssue({
          code: "custom",
          message: "Use an http:// or https:// destination URL.",
        });
      }
      if (!url.hostname) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a complete destination URL.",
        });
      }
      if (url.username || url.password) {
        ctx.addIssue({
          code: "custom",
          message: "Destination URLs cannot include credentials.",
        });
      }
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid destination URL, including https://.",
      });
    }
  });

const createInput = z.object({
  name: z.string().trim().min(2).max(255),
  slug: slugSchema,
  destinationUrl: destinationUrlSchema,
  preserveQueryParams: z.boolean().default(true),
});

const updateInput = createInput;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function shortLinksPermission() {
  return protectedProcedure.use(async ({ ctx, next }) => {
    if (!(await canAdminUsePermission(ctx.user, "canViewShortLinks"))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your Super Permissions do not allow this Short Links action.",
      });
    }
    return next({ ctx });
  });
}

function normaliseDestinationUrl(value: string) {
  const url = new URL(value.trim());
  return url.toString();
}

async function assertSlugAvailable(
  db: Database,
  slug: string,
  excludeShortLinkId?: number
) {
  const [existingLink] = await db
    .select({ id: shortLinks.id })
    .from(shortLinks)
    .where(eq(shortLinks.slug, slug))
    .limit(1);
  if (existingLink && existingLink.id !== excludeShortLinkId) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "That public slug is already in use.",
    });
  }

  const [landingPage] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(eq(landingPages.slug, slug))
    .limit(1);
  if (landingPage) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "That public slug is already reserved by a Landing Page.",
    });
  }
}

async function getManagedLink(
  db: Database,
  user: { id: number; role: string },
  id: number
) {
  const conditions = [eq(shortLinks.id, id)];
  if (user.role !== "admin")
    conditions.push(eq(shortLinks.createdById, user.id));
  const [link] = await db
    .select()
    .from(shortLinks)
    .where(and(...conditions))
    .limit(1);
  if (!link)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Short link not found.",
    });
  return link;
}

export const shortLinksRouter = router({
  list: shortLinksPermission().query(async ({ ctx }) => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database unavailable.",
      });

    const conditions =
      ctx.user.role === "admin"
        ? []
        : [eq(shortLinks.createdById, ctx.user.id)];
    const rows = await db
      .select({ link: shortLinks, createdByName: users.name })
      .from(shortLinks)
      .leftJoin(users, eq(shortLinks.createdById, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(shortLinks.updatedAt));

    return rows.map(({ link, createdByName }) => ({
      ...link,
      createdByName,
      publicUrl: publicShortLinkUrl(link.slug),
    }));
  }),

  create: shortLinksPermission()
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });

      await assertSlugAvailable(db, input.slug);
      const [result] = await db.insert(shortLinks).values({
        name: input.name,
        slug: input.slug,
        destinationUrl: normaliseDestinationUrl(input.destinationUrl),
        preserveQueryParams: input.preserveQueryParams,
        createdById: ctx.user.id,
      });
      const id = Number((result as any).insertId);
      await logActivity({
        userId: ctx.user.id,
        action: "short_link_created",
        entityType: "short_link",
        entityId: id,
        details: {
          name: input.name,
          slug: input.slug,
          publicUrl: publicShortLinkUrl(input.slug),
        },
      });
      return { id, publicUrl: publicShortLinkUrl(input.slug) };
    }),

  update: shortLinksPermission()
    .input(z.object({ id: z.number().int().positive(), data: updateInput }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });

      const existing = await getManagedLink(db, ctx.user, input.id);
      if (existing.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Archived short links cannot be edited.",
        });
      }
      await assertSlugAvailable(db, input.data.slug, existing.id);
      await db
        .update(shortLinks)
        .set({
          name: input.data.name,
          slug: input.data.slug,
          destinationUrl: normaliseDestinationUrl(input.data.destinationUrl),
          preserveQueryParams: input.data.preserveQueryParams,
        })
        .where(eq(shortLinks.id, existing.id));
      await logActivity({
        userId: ctx.user.id,
        action: "short_link_updated",
        entityType: "short_link",
        entityId: existing.id,
        details: {
          name: input.data.name,
          slug: input.data.slug,
          slugChanged: existing.slug !== input.data.slug,
        },
      });
      return { success: true, publicUrl: publicShortLinkUrl(input.data.slug) };
    }),

  setStatus: shortLinksPermission()
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(linkStatuses),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });

      const existing = await getManagedLink(db, ctx.user, input.id);
      await db
        .update(shortLinks)
        .set({ status: input.status })
        .where(eq(shortLinks.id, existing.id));
      await logActivity({
        userId: ctx.user.id,
        action: "short_link_status_changed",
        entityType: "short_link",
        entityId: existing.id,
        details: {
          slug: existing.slug,
          oldStatus: existing.status,
          newStatus: input.status,
        },
      });
      return { success: true };
    }),

  analytics: shortLinksPermission()
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable.",
        });

      const link = await getManagedLink(db, ctx.user, input.id);
      const now = new Date();
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const [today, lastSevenDays, clicks] = await Promise.all([
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(shortLinkClicks)
          .where(
            and(
              eq(shortLinkClicks.shortLinkId, link.id),
              gte(shortLinkClicks.clickedAt, todayStart)
            )
          ),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(shortLinkClicks)
          .where(
            and(
              eq(shortLinkClicks.shortLinkId, link.id),
              gte(shortLinkClicks.clickedAt, sevenDaysAgo)
            )
          ),
        db
          .select({
            id: shortLinkClicks.id,
            clickedAt: shortLinkClicks.clickedAt,
            referrerUrl: shortLinkClicks.referrerUrl,
            deviceCategory: shortLinkClicks.deviceCategory,
          })
          .from(shortLinkClicks)
          .where(eq(shortLinkClicks.shortLinkId, link.id))
          .orderBy(desc(shortLinkClicks.clickedAt))
          .limit(100),
      ]);

      return {
        link: { ...link, publicUrl: publicShortLinkUrl(link.slug) },
        todayClicks: Number(today[0]?.count ?? 0),
        lastSevenDaysClicks: Number(lastSevenDays[0]?.count ?? 0),
        recentClicks: clicks,
      };
    }),
});
