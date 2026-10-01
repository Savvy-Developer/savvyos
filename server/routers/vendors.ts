import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { userProfiles, users, vendorBillingPayments, vendorCategories, vendorFeaturedSubscriptions, vendorLists, vendors } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { isValidOptionalUsPhone, normalizeOptionalUsPhone } from "../../shared/phone";
import { createFeaturedVendorCheckoutInvite } from "../vendorBilling";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
function normalizeWebsite(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const optionalUrl = z.string().trim().max(512).nullable().optional().transform(normalizeWebsite).refine((value) => value === null || value.length <= 512, "Website address is too long.");

// Which list a call acts on. An agent may have several (one per market); with
// no listId the call uses the agent's first list, as before multiple lists.
const listId = z.number().int().positive().optional();
const listLabel = z.string().trim().max(120).nullable().optional();

/** Most Vendor Lists one agent may keep (one per market they serve). */
export const MAX_VENDOR_LISTS_PER_AGENT = 20;

const listSettingsInput = z.object({
  agentId: z.number().int().positive().optional(),
  listId,
  label: listLabel,
  displayName: z.string().trim().min(2).max(160),
  headline: optionalText(255),
  intro: optionalText(6000),
  publicSlug: z.string().trim().toLowerCase().min(3).max(120).regex(slugPattern, "Use lowercase letters, numbers, and single hyphens only."),
  isPublished: z.boolean(),
});

const categoryInput = z.object({
  agentId: z.number().int().positive().optional(),
  listId,
  name: z.string().trim().min(2).max(120),
  description: optionalText(1500),
  isVisible: z.boolean().default(true),
});

const vendorInput = z.object({
  agentId: z.number().int().positive().optional(),
  listId,
  vendorCategoryId: z.number().int().positive(),
  businessName: z.string().trim().min(2).max(255),
  contactName: optionalText(160),
  phone: optionalText(64).refine(isValidOptionalUsPhone, "Phone number must contain exactly 10 digits."),
  email: z.string().trim().email().max(320).nullable().optional().or(z.literal("")),
  website: optionalUrl,
  address: optionalText(3000),
  serviceArea: optionalText(255),
  description: optionalText(6000),
  isFeatured: z.boolean().default(false),
  isVisible: z.boolean().default(true),
});

type RouterContext = { user: { id: number; role: string; name?: string | null } };

function requireVendorManager(ctx: RouterContext, requestedAgentId?: number): number {
  if (ctx.user.role === "agent") {
    if (requestedAgentId && requestedAgentId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage your own Vendor List." });
    }
    return ctx.user.id;
  }
  if (ctx.user.role === "admin") {
    if (!requestedAgentId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Select an agent Vendor List to manage." });
    }
    return requestedAgentId;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Vendor Lists are available to agents and administrators." });
}

/**
 * Whether this user may manage this list. Agents only their own lists; admins
 * any list (and when they also name an agent, it must be the list's owner).
 */
export function assertVendorListAccess(
  ctx: RouterContext,
  list: { agentId: number },
  requestedAgentId?: number,
): void {
  if (ctx.user.role === "agent") {
    if (list.agentId !== ctx.user.id || (requestedAgentId && requestedAgentId !== ctx.user.id)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage your own Vendor Lists." });
    }
    return;
  }
  if (ctx.user.role === "admin") {
    if (requestedAgentId && requestedAgentId !== list.agentId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That Vendor List belongs to a different agent." });
    }
    return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Vendor Lists are available to agents and administrators." });
}

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function defaultDisplayName(name?: string | null): string {
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `${firstName}'s Vendor List` : "My Vendor List";
}

function defaultSlug(agentId: number, label?: string | null): string {
  return label?.trim() ? `vendors-${agentId}-${label}` : `vendors-${agentId}`;
}

function defaultListName(name: string | null | undefined, label: string | null): string {
  if (!label) return defaultDisplayName(name);
  const firstName = name?.trim().split(/\s+/)[0];
  return (firstName ? `${firstName}'s ${label} Vendor List` : `${label} Vendor List`).slice(0, 160);
}

async function assertAgent(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, agentId: number) {
  const [agent] = await db.select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, agentId))
    .limit(1);
  if (!agent || agent.role !== "agent") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found." });
  }
  return agent;
}

async function uniqueSlug(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, raw: string, exceptListId?: number): Promise<string> {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110) || "vendors";
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [existing] = await db.select({ id: vendorLists.id })
      .from(vendorLists)
      .where(eq(vendorLists.publicSlug, candidate))
      .limit(1);
    if (!existing || existing.id === exceptListId) return candidate;
    candidate = `${base.slice(0, 110)}-${suffix}`;
    suffix += 1;
  }
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** The agent's first list (oldest), which is what every call used before multiple lists. */
async function firstListOf(db: Db, agentId: number) {
  const [list] = await db.select().from(vendorLists)
    .where(eq(vendorLists.agentId, agentId))
    .orderBy(asc(vendorLists.id))
    .limit(1);
  return list ?? null;
}

async function getListPayload(db: Db, list: typeof vendorLists.$inferSelect) {

  const categories = await db.select()
    .from(vendorCategories)
    .where(eq(vendorCategories.vendorListId, list.id))
    .orderBy(asc(vendorCategories.sortOrder), asc(vendorCategories.name));
  const categoryIds = categories.map((category) => category.id);
  const vendorRows = categoryIds.length
    ? await db.select().from(vendors)
      .where(inArray(vendors.vendorCategoryId, categoryIds))
      .orderBy(asc(vendors.sortOrder), asc(vendors.businessName))
    : [];
  const vendorIds = vendorRows.map((vendor) => vendor.id);
  const billingRows = vendorIds.length
    ? await db.select({
      vendorId: vendorFeaturedSubscriptions.vendorId,
      monthlyAmountCents: vendorFeaturedSubscriptions.monthlyAmountCents,
      billingStatus: vendorFeaturedSubscriptions.billingStatus,
      checkoutUrl: vendorFeaturedSubscriptions.checkoutUrl,
      invitationSentAt: vendorFeaturedSubscriptions.invitationSentAt,
      createdAt: vendorFeaturedSubscriptions.createdAt,
    }).from(vendorFeaturedSubscriptions)
      .where(inArray(vendorFeaturedSubscriptions.vendorId, vendorIds))
      .orderBy(desc(vendorFeaturedSubscriptions.createdAt))
    : [];
  const billingByVendor = new Map<number, typeof billingRows[number]>();
  for (const row of billingRows) {
    if (!billingByVendor.has(row.vendorId)) billingByVendor.set(row.vendorId, row);
  }
  const vendorsByCategory = new Map<number, typeof vendorRows>();
  for (const vendor of vendorRows) {
    const collection = vendorsByCategory.get(vendor.vendorCategoryId) ?? [];
    collection.push(vendor);
    vendorsByCategory.set(vendor.vendorCategoryId, collection);
  }

  return {
    ...list,
    categories: categories.map((category) => ({
      ...category,
      vendors: (vendorsByCategory.get(category.id) ?? []).map((vendor) => ({
        ...vendor,
        billing: billingByVendor.get(vendor.id) ?? null,
      })),
    })),
  };
}

/**
 * The list a call acts on, ownership checked. With a listId: that list, if this
 * user may manage it. Without: the agent's first list (backwards compatible).
 */
async function resolveList(db: Db, ctx: RouterContext, input: { agentId?: number; listId?: number }) {
  if (input.listId) {
    const [list] = await db.select().from(vendorLists).where(eq(vendorLists.id, input.listId)).limit(1);
    if (!list) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor List not found." });
    assertVendorListAccess(ctx, list, input.agentId);
    return list;
  }
  const agentId = requireVendorManager(ctx, input.agentId);
  const list = await firstListOf(db, agentId);
  if (!list) {
    throw new TRPCError({ code: "NOT_FOUND", message: "This agent has not created a Vendor List yet." });
  }
  return list;
}

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  return db;
}

async function assertCategoryInList(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, categoryId: number, listId: number) {
  const [category] = await db.select().from(vendorCategories)
    .where(and(eq(vendorCategories.id, categoryId), eq(vendorCategories.vendorListId, listId)))
    .limit(1);
  if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor category not found." });
  return category;
}

async function assertVendorInList(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, vendorId: number, listId: number) {
  const [row] = await db.select({ vendor: vendors, vendorListId: vendorCategories.vendorListId })
    .from(vendors)
    .innerJoin(vendorCategories, eq(vendors.vendorCategoryId, vendorCategories.id))
    .where(eq(vendors.id, vendorId))
    .limit(1);
  if (!row || row.vendorListId !== listId) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found." });
  return row.vendor;
}

async function nextSortOrder(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, table: "categories" | "vendors", parentId: number): Promise<number> {
  const field = table === "categories" ? vendorCategories.sortOrder : vendors.sortOrder;
  const parentField = table === "categories" ? vendorCategories.vendorListId : vendors.vendorCategoryId;
  const source = table === "categories" ? vendorCategories : vendors;
  const [result] = await db.select({ highest: sql<number>`coalesce(max(${field}), -1)` })
    .from(source)
    .where(eq(parentField, parentId));
  return Number(result?.highest ?? -1) + 1;
}

export const vendorsRouter = router({
  /**
   * One editable list: the given listId (ownership checked), else the agent's
   * first list. Agents get their own; admins name an agent or a list.
   */
  getManageableList: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive().optional(), listId }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      let list: typeof vendorLists.$inferSelect | null;
      if (input?.listId) {
        list = await resolveList(db, ctx, { agentId: input.agentId, listId: input.listId });
      } else {
        const agentId = requireVendorManager(ctx, input?.agentId);
        await assertAgent(db, agentId);
        list = await firstListOf(db, agentId);
      }
      if (!list) return null;
      const agent = await assertAgent(db, list.agentId);
      const payload = await getListPayload(db, list);
      return { ...payload, agentName: agent.name };
    }),

  /** Every list the agent keeps, oldest first, for the list switcher. */
  myLists: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const agentId = requireVendorManager(ctx, input?.agentId);
      const db = await requireDb();
      return db.select({
        id: vendorLists.id,
        agentId: vendorLists.agentId,
        label: vendorLists.label,
        displayName: vendorLists.displayName,
        publicSlug: vendorLists.publicSlug,
        isPublished: vendorLists.isPublished,
        updatedAt: vendorLists.updatedAt,
      }).from(vendorLists)
        .where(eq(vendorLists.agentId, agentId))
        .orderBy(asc(vendorLists.id));
    }),

  /**
   * Creates a list for the agent: the first one, or another for a different
   * market (label). Admins may create a list on an agent's behalf.
   */
  createList: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive().optional(), label: listLabel }).optional())
    .mutation(async ({ ctx, input }) => {
      const agentId = requireVendorManager(ctx, input?.agentId);
      const db = await requireDb();
      const agent = await assertAgent(db, agentId);
      const label = nullable(input?.label);
      const existing = await db.select({ id: vendorLists.id }).from(vendorLists).where(eq(vendorLists.agentId, agentId));
      if (existing.length >= MAX_VENDOR_LISTS_PER_AGENT) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `An agent can keep up to ${MAX_VENDOR_LISTS_PER_AGENT} Vendor Lists.` });
      }
      if (existing.length > 0 && !label) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Name the market for this list, e.g. Lake of the Ozarks." });
      }
      const publicSlug = await uniqueSlug(db, defaultSlug(agentId, label));
      let result;
      try {
        result = await db.insert(vendorLists).values({
          agentId,
          label,
          displayName: defaultListName(agent.name, label),
          publicSlug,
          isPublished: false,
        });
      } catch (error: any) {
        if (error?.code === "ER_DUP_ENTRY" || error?.cause?.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "Another Vendor List can't be added yet. Please try again shortly." });
        }
        throw error;
      }
      return { success: true, id: Number(result[0].insertId) };
    }),

  updateList: protectedProcedure
    .input(listSettingsInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      const publicSlug = await uniqueSlug(db, input.publicSlug, list.id);
      await db.update(vendorLists).set({
        ...(input.label !== undefined ? { label: nullable(input.label) } : {}),
        displayName: input.displayName,
        headline: nullable(input.headline),
        intro: nullable(input.intro),
        publicSlug,
        isPublished: input.isPublished,
      }).where(eq(vendorLists.id, list.id));
      return { success: true, publicSlug };
    }),

  createCategory: protectedProcedure
    .input(categoryInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      const sortOrder = await nextSortOrder(db, "categories", list.id);
      const result = await db.insert(vendorCategories).values({
        vendorListId: list.id,
        name: input.name,
        description: nullable(input.description),
        isVisible: input.isVisible,
        sortOrder,
      });
      return { id: Number(result[0].insertId) };
    }),

  updateCategory: protectedProcedure
    .input(categoryInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      await assertCategoryInList(db, input.id, list.id);
      await db.update(vendorCategories).set({
        name: input.name,
        description: nullable(input.description),
        isVisible: input.isVisible,
      }).where(eq(vendorCategories.id, input.id));
      return { success: true };
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive().optional(), listId, id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      await assertCategoryInList(db, input.id, list.id);
      await db.delete(vendorCategories).where(eq(vendorCategories.id, input.id));
      return { success: true };
    }),

  reorderCategories: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive().optional(), listId, orderedIds: z.array(z.number().int().positive()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      const categories = await db.select({ id: vendorCategories.id }).from(vendorCategories).where(eq(vendorCategories.vendorListId, list.id));
      const actualIds = categories.map((category) => category.id).sort((a, b) => a - b);
      const orderedIds = Array.from(new Set(input.orderedIds)).sort((a, b) => a - b);
      if (actualIds.length !== orderedIds.length || actualIds.some((id, index) => id !== orderedIds[index])) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The category order must include every category in this Vendor List." });
      }
      await Promise.all(input.orderedIds.map((id, index) => db.update(vendorCategories).set({ sortOrder: index }).where(eq(vendorCategories.id, id))));
      return { success: true };
    }),

  createVendor: protectedProcedure
    .input(vendorInput)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      await assertCategoryInList(db, input.vendorCategoryId, list.id);
      const sortOrder = await nextSortOrder(db, "vendors", input.vendorCategoryId);
      const result = await db.insert(vendors).values({
        vendorCategoryId: input.vendorCategoryId,
        businessName: input.businessName,
        contactName: nullable(input.contactName),
        phone: normalizeOptionalUsPhone(input.phone),
        email: nullable(input.email),
        website: nullable(input.website),
        address: nullable(input.address),
        serviceArea: nullable(input.serviceArea),
        description: nullable(input.description),
        isFeatured: input.isFeatured,
        isVisible: input.isVisible,
        sortOrder,
      });
      return { id: Number(result[0].insertId) };
    }),

  updateVendor: protectedProcedure
    .input(vendorInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      await assertVendorInList(db, input.id, list.id);
      await assertCategoryInList(db, input.vendorCategoryId, list.id);
      await db.update(vendors).set({
        vendorCategoryId: input.vendorCategoryId,
        businessName: input.businessName,
        contactName: nullable(input.contactName),
        phone: normalizeOptionalUsPhone(input.phone),
        email: nullable(input.email),
        website: nullable(input.website),
        address: nullable(input.address),
        serviceArea: nullable(input.serviceArea),
        description: nullable(input.description),
        isFeatured: input.isFeatured,
        isVisible: input.isVisible,
      }).where(eq(vendors.id, input.id));
      return { success: true };
    }),

  /** Creates a vendor-specific monthly Stripe Checkout link and emails it to the Featured vendor. */
  createFeaturedPaymentInvite: protectedProcedure
    .input(z.object({
      agentId: z.number().int().positive().optional(),
      listId,
      vendorId: z.number().int().positive(),
      monthlyAmountDollars: z.number().int().min(1).max(10_000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Billing is tied to the agent who owns the vendor's list. With a listId
      // that is the list's owner (checked); billing then confirms the vendor
      // sits on one of that agent's lists.
      const agentId = input.listId
        ? (await resolveList(await requireDb(), ctx, input)).agentId
        : requireVendorManager(ctx, input.agentId);
      try {
        return await createFeaturedVendorCheckoutInvite({
          vendorId: input.vendorId,
          agentId,
          monthlyAmountCents: input.monthlyAmountDollars * 100,
        });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Could not create the Featured vendor payment invitation.",
        });
      }
    }),

  deleteVendor: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive().optional(), listId, id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      await assertVendorInList(db, input.id, list.id);
      await db.delete(vendors).where(eq(vendors.id, input.id));
      return { success: true };
    }),

  reorderVendors: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive().optional(), listId, vendorCategoryId: z.number().int().positive(), orderedIds: z.array(z.number().int().positive()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const list = await resolveList(db, ctx, input);
      await assertCategoryInList(db, input.vendorCategoryId, list.id);
      const currentVendors = await db.select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.vendorCategoryId, input.vendorCategoryId));
      const actualIds = currentVendors.map((vendor) => vendor.id).sort((a, b) => a - b);
      const orderedIds = Array.from(new Set(input.orderedIds)).sort((a, b) => a - b);
      if (actualIds.length !== orderedIds.length || actualIds.some((id, index) => id !== orderedIds[index])) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The vendor order must include every vendor in this category." });
      }
      await Promise.all(input.orderedIds.map((id, index) => db.update(vendors).set({ sortOrder: index }).where(eq(vendors.id, id))));
      return { success: true };
    }),

  /** Active-agent adoption and publishing health for the administrator overview. */
  adminStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

    // Agents may have several lists, so agents are counted distinct; the
    // published/draft figures count lists.
    const [stats] = await db.select({
      activeAgentCount: sql<number>`count(distinct ${users.id})`,
      activeAgentWithListCount: sql<number>`count(distinct ${vendorLists.agentId})`,
      publishedListCount: sql<number>`coalesce(sum(case when ${vendorLists.isPublished} = 1 then 1 else 0 end), 0)`,
      draftListCount: sql<number>`coalesce(sum(case when ${vendorLists.id} is not null and ${vendorLists.isPublished} = 0 then 1 else 0 end), 0)`,
    }).from(users)
      .leftJoin(vendorLists, eq(vendorLists.agentId, users.id))
      .where(and(eq(users.role, "agent"), eq(users.isActive, true)));

    const activeAgentCount = Number(stats?.activeAgentCount ?? 0);
    const activeAgentWithListCount = Number(stats?.activeAgentWithListCount ?? 0);
    return {
      activeAgentCount,
      activeAgentWithListCount,
      activeAgentWithoutListCount: Math.max(0, activeAgentCount - activeAgentWithListCount),
      publishedListCount: Number(stats?.publishedListCount ?? 0),
      draftListCount: Number(stats?.draftListCount ?? 0),
    };
  }),

  /**
   * Admin overview: one row per list (agents may have several), only agents
   * who have made a list. Billing figures are per list, from the vendors on
   * that list, so an agent's totals are not repeated on each of their lists.
   */
  adminList: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Administrator access is required." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
    const listVendorIds = sql`(
      select list_vendor.id
      from vendors list_vendor
      inner join vendor_categories list_category on list_vendor.vendorCategoryId = list_category.id
      where list_category.vendorListId = ${vendorLists.id}
    )`;
    return db.select({
      id: vendorLists.id,
      agentId: vendorLists.agentId,
      label: vendorLists.label,
      agentName: users.name,
      agentEmail: users.email,
      displayName: vendorLists.displayName,
      publicSlug: vendorLists.publicSlug,
      isPublished: vendorLists.isPublished,
      updatedAt: vendorLists.updatedAt,
      categoryCount: sql<number>`count(distinct ${vendorCategories.id})`,
      vendorCount: sql<number>`count(distinct ${vendors.id})`,
      invitedVendorCount: sql<number>`(
        select count(distinct ${vendorFeaturedSubscriptions.vendorId})
        from ${vendorFeaturedSubscriptions}
        where ${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}
      )`,
      pendingInviteCount: sql<number>`(
        select count(*)
        from ${vendorFeaturedSubscriptions}
        where ${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}
          and ${vendorFeaturedSubscriptions.billingStatus} = 'pending_checkout'
      )`,
      activeSubscriptionCount: sql<number>`(
        select count(*)
        from ${vendorFeaturedSubscriptions}
        where ${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}
          and ${vendorFeaturedSubscriptions.billingStatus} = 'active'
      )`,
      activeMonthlyRevenueCents: sql<number>`coalesce((
        select sum(${vendorFeaturedSubscriptions.monthlyAmountCents})
        from ${vendorFeaturedSubscriptions}
        where ${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}
          and ${vendorFeaturedSubscriptions.billingStatus} = 'active'
      ), 0)`,
      activeAgentShareCents: sql<number>`coalesce((
        select sum(round(${vendorFeaturedSubscriptions.monthlyAmountCents} * 0.75))
        from ${vendorFeaturedSubscriptions}
        where ${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}
          and ${vendorFeaturedSubscriptions.billingStatus} = 'active'
      ), 0)`,
      collectedRevenueCents: sql<number>`coalesce((
        select sum(${vendorBillingPayments.amountPaidCents})
        from ${vendorBillingPayments}
        inner join ${vendorFeaturedSubscriptions}
          on ${vendorBillingPayments.vendorFeaturedSubscriptionId} = ${vendorFeaturedSubscriptions.id}
        where ${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}
          and ${vendorBillingPayments.paymentStatus} = 'paid'
      ), 0)`,
      agentEarningsCents: sql<number>`coalesce((
        select sum(${vendorBillingPayments.agentEarningsCents})
        from ${vendorBillingPayments}
        inner join ${vendorFeaturedSubscriptions}
          on ${vendorBillingPayments.vendorFeaturedSubscriptionId} = ${vendorFeaturedSubscriptions.id}
        where ${vendorFeaturedSubscriptions.vendorId} in ${listVendorIds}
          and ${vendorBillingPayments.paymentStatus} = 'paid'
      ), 0)`,
    }).from(vendorLists)
      .innerJoin(users, eq(vendorLists.agentId, users.id))
      .leftJoin(vendorCategories, eq(vendorCategories.vendorListId, vendorLists.id))
      .leftJoin(vendors, eq(vendors.vendorCategoryId, vendorCategories.id))
      .groupBy(
        vendorLists.id,
        vendorLists.agentId,
        vendorLists.label,
        users.name,
        users.email,
        vendorLists.displayName,
        vendorLists.publicSlug,
        vendorLists.isPublished,
        vendorLists.updatedAt,
      )
      .orderBy(desc(vendorLists.updatedAt));
  }),

  /** Public payload deliberately excludes draft, hidden categories, and hidden vendors. */
  getPublic: publicProcedure
    .input(z.object({ slug: z.string().trim().toLowerCase().min(3).max(120).regex(slugPattern) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const [list] = await db.select({
        id: vendorLists.id,
        displayName: vendorLists.displayName,
        headline: vendorLists.headline,
        intro: vendorLists.intro,
        publicSlug: vendorLists.publicSlug,
        agentName: users.name,
        agentTitle: users.title,
        agentEmail: users.email,
        agentPhone: users.phone,
        agentCallBookingLink: users.callBookingLink,
        agentProfilePhone: userProfiles.primaryPhone,
        agentProfilePhotoUrl: userProfiles.profilePhotoUrl,
      }).from(vendorLists)
        .innerJoin(users, eq(vendorLists.agentId, users.id))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(and(eq(vendorLists.publicSlug, input.slug), eq(vendorLists.isPublished, true)))
        .limit(1);
      if (!list) return null;

      const categories = await db.select()
        .from(vendorCategories)
        .where(and(eq(vendorCategories.vendorListId, list.id), eq(vendorCategories.isVisible, true)))
        .orderBy(asc(vendorCategories.sortOrder), asc(vendorCategories.name));
      const categoryIds = categories.map((category) => category.id);
      const vendorRows = categoryIds.length
        ? await db.select().from(vendors)
          .where(and(inArray(vendors.vendorCategoryId, categoryIds), eq(vendors.isVisible, true)))
          .orderBy(desc(vendors.isFeatured), asc(vendors.sortOrder), asc(vendors.businessName))
        : [];
      const vendorsByCategory = new Map<number, typeof vendorRows>();
      for (const vendor of vendorRows) {
        const collection = vendorsByCategory.get(vendor.vendorCategoryId) ?? [];
        collection.push(vendor);
        vendorsByCategory.set(vendor.vendorCategoryId, collection);
      }
      return {
        displayName: list.displayName,
        headline: list.headline,
        intro: list.intro,
        publicSlug: list.publicSlug,
        agentName: list.agentName,
        agentTitle: list.agentTitle,
        agentEmail: list.agentEmail,
        agentPhone: list.agentPhone ?? list.agentProfilePhone,
        agentCallBookingLink: normalizeWebsite(list.agentCallBookingLink),
        agentProfilePhotoUrl: list.agentProfilePhotoUrl,
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          description: category.description,
          vendors: (vendorsByCategory.get(category.id) ?? []).map((vendor) => ({
            id: vendor.id,
            businessName: vendor.businessName,
            contactName: vendor.contactName,
            phone: vendor.phone,
            email: vendor.email,
            website: vendor.website,
            address: vendor.address,
            serviceArea: vendor.serviceArea,
            description: vendor.description,
            isFeatured: vendor.isFeatured,
          })),
        })),
      };
    }),
});
