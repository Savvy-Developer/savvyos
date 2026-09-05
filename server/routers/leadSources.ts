import { TRPCError } from "@trpc/server";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { getDb } from "../db";
import { leadSources, contacts } from "../../drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { createPartnerPortalPreviewUrl, normalizePartnerPortalEmail, sendPartnerPortalInvitation } from "../_core/partnerPortalAuth";

const PARTNER_PORTAL_PARENT_NAMES = ["Referral Partner (Leads in)", "Affiliate Referral"] as const;
const PARTNER_CHEAT_SHEET_ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "code", "pre", "a"];
const SOP_ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "a", "hr"];

function isPartnerCheatSheetParent(name: string | null | undefined): boolean {
  return PARTNER_PORTAL_PARENT_NAMES.includes(name as typeof PARTNER_PORTAL_PARENT_NAMES[number]);
}

function sanitizePartnerCheatSheet(value: string): string | null {
  const clean = sanitizeHtml(value, {
    allowedTags: PARTNER_CHEAT_SHEET_ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
  }).trim();
  return clean || null;
}

function sanitizeSop(value: string): string | null {
  const clean = sanitizeHtml(value, {
    allowedTags: SOP_ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
  }).trim();
  return clean || null;
}

async function requirePartnerCheatSheetSource(sourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [source] = await db.select({ id: leadSources.id, parentId: leadSources.parentId })
    .from(leadSources)
    .where(eq(leadSources.id, sourceId))
    .limit(1);
  if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Lead source not found." });
  if (!source.parentId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cheat sheets are available only for eligible partner sub-sources." });
  }
  const [parent] = await db.select({ name: leadSources.name }).from(leadSources).where(eq(leadSources.id, source.parentId)).limit(1);
  if (!isPartnerCheatSheetParent(parent?.name)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cheat sheets are available only for Affiliate Referral or Referral Partner (Leads in) sub-sources." });
  }
  return db;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getLeadSourceWithCounts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      ls: leadSources,
      contactCount: sql<number>`COUNT(DISTINCT ${contacts.id})`,
    })
    .from(leadSources)
    .leftJoin(contacts, eq(contacts.leadSourceId, leadSources.id))
    .groupBy(leadSources.id)
    .orderBy(leadSources.parentId, leadSources.name);
  return rows;
}

async function assertAgreementRequirement(
  parentId: number | null | undefined,
  agreementUrl: string | null | undefined,
) {
  if (!parentId || agreementUrl) return;

  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [parent] = await db
    .select({ requireAgreementForSubSources: leadSources.requireAgreementForSubSources })
    .from(leadSources)
    .where(eq(leadSources.id, parentId))
    .limit(1);

  if (parent?.requireAgreementForSubSources) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An agreement document is required for sub-sources in this category.",
    });
  }
}

async function resolvePartnerPortalConfiguration(input: {
  parentId: number | null;
  allowPartnerPortal: boolean;
  partnerPortalEmail: string | null;
}) {
  const email = input.partnerPortalEmail ? normalizePartnerPortalEmail(input.partnerPortalEmail) : null;
  if (!input.allowPartnerPortal) {
    return { allowPartnerPortal: false, partnerPortalEmail: null };
  }
  if (!email) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A partner email is required when Partner Portal access is enabled." });
  }
  if (!input.parentId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Partner Portal access is only available to a Referral Partner (Leads in) or Affiliate Referral sub-source." });
  }

  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [parent] = await db
    .select({ name: leadSources.name })
    .from(leadSources)
    .where(eq(leadSources.id, input.parentId))
    .limit(1);
  if (!parent || !PARTNER_PORTAL_PARENT_NAMES.includes(parent.name as typeof PARTNER_PORTAL_PARENT_NAMES[number])) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Partner Portal access is only available to a Referral Partner (Leads in) or Affiliate Referral sub-source." });
  }
  return { allowPartnerPortal: true, partnerPortalEmail: email };
}

async function deliverPartnerPortalInvite(email: string, partnerName: string) {
  try {
    const delivery = await sendPartnerPortalInvitation({ email, partnerName });
    return delivery.sent;
  } catch (error) {
    console.error("[PartnerPortal] Invitation delivery failed", { email, error });
    return false;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const leadSourcesRouter = router({
  list: protectedProcedure.query(async () => {
    const all = await getLeadSourceWithCounts();
    return all.filter(r => r.ls.isActive !== false);
  }),

  listInactive: protectedProcedure.query(async () => {
    const all = await getLeadSourceWithCounts();
    return all.filter(r => r.ls.isActive === false);
  }),

  listFlat: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ ls: leadSources })
      .from(leadSources)
      .where(eq(leadSources.isActive, true))
      .orderBy(leadSources.parentId, leadSources.name);
  }),

  // Return an SOP only when it is published to agents, unless the caller is an
  // administrator editing the source. This keeps drafts private by default.
  getSop: protectedProcedure
    .input(z.object({ sourceId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [source] = await db.select({
        id: leadSources.id,
        name: leadSources.name,
        sopContent: leadSources.sopContent,
        sopVisibleToAgents: leadSources.sopVisibleToAgents,
      }).from(leadSources).where(eq(leadSources.id, input.sourceId)).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Lead source not found." });
      if (ctx.user.role !== "admin" && !source.sopVisibleToAgents) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This SOP is not published to agents." });
      }
      return source;
    }),

  updateSop: protectedProcedure
    .input(z.object({
      sourceId: z.number().int().positive(),
      sopContent: z.string().max(60_000).nullable(),
      sopVisibleToAgents: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.id, input.sourceId)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lead source not found." });
      const sopContent = input.sopContent ? sanitizeSop(input.sopContent) : null;
      await db.update(leadSources).set({
        sopContent,
        sopVisibleToAgents: Boolean(sopContent) && input.sopVisibleToAgents,
      }).where(eq(leadSources.id, input.sourceId));
      return { success: true, hasSop: Boolean(sopContent) };
    }),

  createPartnerPortalPreview: protectedProcedure
    .input(z.object({ sourceId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [source] = await db
        .select({ enabled: leadSources.allowPartnerPortal, email: leadSources.partnerPortalEmail, active: leadSources.isActive })
        .from(leadSources)
        .where(eq(leadSources.id, input.sourceId))
        .limit(1);
      if (!source?.enabled || source.active === false || !source.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Partner Portal is not enabled for this active lead source." });
      }
      return { url: await createPartnerPortalPreviewUrl(input.sourceId) };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      parentId: z.number().nullable().optional(),
      campaignType: z.enum(["buyer", "seller", "both"]).nullable().optional(),
      description: z.string().nullable().optional(),
      agreementUrl: z.string().nullable().optional(),
      agreementKey: z.string().nullable().optional(),
      requireAgreementForSubSources: z.boolean().optional(),
      allowPartnerPortal: z.boolean().optional(),
      partnerPortalEmail: z.string().trim().email().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const parentId = input.parentId ?? null;
      // Guard: prevent creating a 3rd-level source (parent must be top-level)
      if (parentId !== null) {
        const [parentRow] = await db.select({ parentId: leadSources.parentId }).from(leadSources).where(eq(leadSources.id, parentId)).limit(1);
        if (parentRow?.parentId != null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create a third-level sub-source. Sources can only be top-level categories or direct sub-sources of a category." });
        }
      }
      await assertAgreementRequirement(parentId, input.agreementUrl);
      const portalConfig = await resolvePartnerPortalConfiguration({
        parentId,
        allowPartnerPortal: input.allowPartnerPortal ?? false,
        partnerPortalEmail: input.partnerPortalEmail ?? null,
      });
      const [result] = await db.insert(leadSources).values({
        name: input.name,
        parentId,
        campaignType: input.campaignType ?? null,
        description: input.description ?? null,
        agreementUrl: input.agreementUrl ?? null,
        agreementKey: input.agreementKey ?? null,
        requireAgreementForSubSources: parentId ? false : input.requireAgreementForSubSources ?? false,
        ...portalConfig,
      });
      const id = (result as any).insertId as number;
      const invitationSent = portalConfig.allowPartnerPortal
        ? await deliverPartnerPortalInvite(portalConfig.partnerPortalEmail!, input.name)
        : false;
      return { id, invitationSent };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      parentId: z.number().nullable().optional(),
      campaignType: z.enum(["buyer", "seller", "both"]).nullable().optional(),
      referralPercent: z.number().nullable().optional(),
      description: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
      agreementUrl: z.string().nullable().optional(),
      agreementKey: z.string().nullable().optional(),
      requireAgreementForSubSources: z.boolean().optional(),
      allowPartnerPortal: z.boolean().optional(),
      partnerPortalEmail: z.string().trim().email().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...data } = input;
      const [existing] = await db
        .select({
          parentId: leadSources.parentId,
          agreementUrl: leadSources.agreementUrl,
          allowPartnerPortal: leadSources.allowPartnerPortal,
          partnerPortalEmail: leadSources.partnerPortalEmail,
        })
        .from(leadSources)
        .where(eq(leadSources.id, id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lead source not found." });

      const targetParentId = data.parentId !== undefined ? data.parentId : existing.parentId;
      // Guard: prevent moving a source to create a 3rd-level
      if (targetParentId !== null) {
        const [parentRow] = await db.select({ parentId: leadSources.parentId }).from(leadSources).where(eq(leadSources.id, targetParentId)).limit(1);
        if (parentRow?.parentId != null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create a third-level sub-source. Sources can only be top-level categories or direct sub-sources of a category." });
        }
      }
      const targetAgreementUrl = data.agreementUrl !== undefined ? data.agreementUrl : existing.agreementUrl;
      await assertAgreementRequirement(targetParentId, targetAgreementUrl);
      const portalConfig = await resolvePartnerPortalConfiguration({
        parentId: targetParentId,
        allowPartnerPortal: data.allowPartnerPortal ?? existing.allowPartnerPortal,
        partnerPortalEmail: data.partnerPortalEmail !== undefined ? data.partnerPortalEmail : existing.partnerPortalEmail,
      });

      const updateData: Record<string, unknown> = { ...data };
      if (targetParentId !== null) updateData.requireAgreementForSubSources = false;
      updateData.allowPartnerPortal = portalConfig.allowPartnerPortal;
      updateData.partnerPortalEmail = portalConfig.partnerPortalEmail;
      await db.update(leadSources).set(updateData as any).where(eq(leadSources.id, id));
      const shouldInvite = portalConfig.allowPartnerPortal && (
        !existing.allowPartnerPortal ||
        normalizePartnerPortalEmail(existing.partnerPortalEmail ?? "") !== portalConfig.partnerPortalEmail
      );
      const invitationSent = shouldInvite
        ? await deliverPartnerPortalInvite(portalConfig.partnerPortalEmail!, data.name ?? "Savvy Partner")
        : false;
      return { success: true, invitationSent };
    }),

  // Get the agent-facing referral and affiliate partner cards, including commission details and published cheat sheets.
  referralPartners: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const parents = await db
      .select({ id: leadSources.id, name: leadSources.name })
      .from(leadSources)
      .where(inArray(leadSources.name, [...PARTNER_PORTAL_PARENT_NAMES]));
    if (!parents.length) return [];
    const parentNames = new Map(parents.map((parent) => [parent.id, parent.name]));
    const rows = await db
      .select()
      .from(leadSources)
      .where(and(inArray(leadSources.parentId, parents.map((parent) => parent.id)), eq(leadSources.isActive, true)))
      .orderBy(leadSources.name);
    return rows.map((row) => ({
      ...row,
      partnerCategory: parentNames.get(row.parentId ?? 0) ?? "Referral Partner",
      hasPartnerCheatSheet: Boolean(row.partnerCheatSheet?.trim()),
    }));
  }),

  getPartnerCheatSheet: protectedProcedure
    .input(z.object({ sourceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await requirePartnerCheatSheetSource(input.sourceId);
      const [source] = await db.select({ id: leadSources.id, name: leadSources.name, partnerCheatSheet: leadSources.partnerCheatSheet })
        .from(leadSources)
        .where(eq(leadSources.id, input.sourceId))
        .limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Lead source not found." });
      return source;
    }),

  updatePartnerCheatSheet: protectedProcedure
    .input(z.object({ sourceId: z.number().int().positive(), partnerCheatSheet: z.string().max(60_000).nullable() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requirePartnerCheatSheetSource(input.sourceId);
      const partnerCheatSheet = input.partnerCheatSheet ? sanitizePartnerCheatSheet(input.partnerCheatSheet) : null;
      await db.update(leadSources).set({ partnerCheatSheet }).where(eq(leadSources.id, input.sourceId));
      return { success: true, hasPartnerCheatSheet: Boolean(partnerCheatSheet) };
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Check if source is protected
      const [source] = await db.select({ isProtected: leadSources.isProtected }).from(leadSources).where(eq(leadSources.id, input.id));
      if (source?.isProtected) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This lead source is system-protected and cannot be deleted." });
      }
      const [contactCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contacts)
        .where(eq(contacts.leadSourceId, input.id));
      if ((contactCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete: ${contactCount?.count} contact(s) use this lead source. Deactivate it instead.`,
        });
      }
      const [childCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(leadSources)
        .where(eq(leadSources.parentId, input.id));
      if ((childCount?.count ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete: this category has ${childCount?.count} sub-source(s). Delete them first.`,
        });
      }
      await db.delete(leadSources).where(eq(leadSources.id, input.id));
      return { success: true };
    }),
});
