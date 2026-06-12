/**
 * Webhooks Admin tRPC Router
 *
 * Provides admin-only procedures for managing webhook endpoints and viewing logs.
 * All procedures require admin role.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { getDb } from "../db";
import { webhookEndpoints, webhookLogs, users, leadSources, contacts } from "../../drizzle/schema";
import { eq, desc, and, like, isNull, or, count, sql } from "drizzle-orm";
import crypto from "crypto";

// ── IP Rate Limiter (in-memory, resets on server restart) ─────────────────────
// Allows max 5 submissions per IP per 15-minute window
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const ipSubmissions = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const entry = ipSubmissions.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipSubmissions.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many submissions. Please wait a few minutes and try again.",
    });
  }
}

function adminOnly() {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    return next({ ctx });
  });
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export const webhooksRouter = router({
  // ── Endpoint Management ────────────────────────────────────────────────────

  listEndpoints: adminOnly()
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.limit;

      const rows = await db
        .select({
          id: webhookEndpoints.id,
          name: webhookEndpoints.name,
          slug: webhookEndpoints.slug,
          handlerType: webhookEndpoints.handlerType,
          isActive: webhookEndpoints.isActive,
          signatureHeader: webhookEndpoints.signatureHeader,
          hasSecret: sql<boolean>`(${webhookEndpoints.secret} IS NOT NULL)`,
          defaultLeadSourceId: webhookEndpoints.defaultLeadSourceId,
          defaultAgentId: webhookEndpoints.defaultAgentId,
          createdAt: webhookEndpoints.createdAt,
          updatedAt: webhookEndpoints.updatedAt,
        })
        .from(webhookEndpoints)
        .orderBy(desc(webhookEndpoints.createdAt))
        .limit(input.limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(webhookEndpoints);

      return { rows, total };
    }),

  getEndpoint: adminOnly()
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      // Mask secret — only return whether it exists
      return { ...row, secret: row.secret ? "***" : null };
    }),

  createEndpoint: adminOnly()
    .input(z.object({
      name: z.string().min(1).max(255),
      handlerType: z.enum(["contact_create", "contact_update", "lead_ingest", "custom"]),
      generateSecret: z.boolean().default(true),
      signatureHeader: z.string().default("x-savvy-signature"),
      defaultLeadSourceId: z.number().optional(),
      defaultAgentId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Generate unique slug
      let slug = generateSlug(input.name);
      // Check for collision and append random suffix if needed
      const [existing] = await db
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.slug, slug))
        .limit(1);
      if (existing) {
        slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
      }

      const secret = input.generateSecret ? generateSecret() : null;

      const [result] = await db.insert(webhookEndpoints).values({
        name: input.name,
        slug,
        handlerType: input.handlerType,
        secret,
        signatureHeader: input.signatureHeader,
        defaultLeadSourceId: input.defaultLeadSourceId ?? null,
        defaultAgentId: input.defaultAgentId ?? null,
        isActive: true,
        createdById: ctx.user.id,
      });

      return {
        id: (result as any).insertId,
        slug,
        // Return the plain secret only on creation — it won't be shown again
        secret: secret ?? null,
      };
    }),

  updateEndpoint: adminOnly()
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      handlerType: z.enum(["contact_create", "contact_update", "lead_ingest", "custom"]).optional(),
      isActive: z.boolean().optional(),
      signatureHeader: z.string().optional(),
      defaultLeadSourceId: z.number().nullable().optional(),
      defaultAgentId: z.number().nullable().optional(),
      rotateSecret: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.handlerType !== undefined) updates.handlerType = input.handlerType;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      if (input.signatureHeader !== undefined) updates.signatureHeader = input.signatureHeader;
      if (input.defaultLeadSourceId !== undefined) updates.defaultLeadSourceId = input.defaultLeadSourceId;
      if (input.defaultAgentId !== undefined) updates.defaultAgentId = input.defaultAgentId;

      let newSecret: string | null = null;
      if (input.rotateSecret) {
        newSecret = generateSecret();
        updates.secret = newSecret;
      }

      await db.update(webhookEndpoints).set(updates).where(eq(webhookEndpoints.id, input.id));
      return { ok: true, newSecret };
    }),

  deleteEndpoint: adminOnly()
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Nullify endpointId in logs before deleting (FK set null)
      await db
        .update(webhookLogs)
        .set({ endpointId: null })
        .where(eq(webhookLogs.endpointId, input.id));
      await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, input.id));
      return { ok: true };
    }),

  // ── Log Viewer ────────────────────────────────────────────────────────────

  listLogs: adminOnly()
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
      endpointId: z.number().optional(),
      outcome: z.enum(["success", "auth_failed", "validation_error", "handler_error", "not_found"]).optional(),
      slug: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.endpointId) conditions.push(eq(webhookLogs.endpointId, input.endpointId));
      if (input.outcome) conditions.push(eq(webhookLogs.outcome, input.outcome));
      if (input.slug) conditions.push(like(webhookLogs.slug, `%${input.slug}%`));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          id: webhookLogs.id,
          endpointId: webhookLogs.endpointId,
          slug: webhookLogs.slug,
          statusCode: webhookLogs.statusCode,
          outcome: webhookLogs.outcome,
          errorMessage: webhookLogs.errorMessage,
          contactId: webhookLogs.contactId,
          sourceIp: webhookLogs.sourceIp,
          createdAt: webhookLogs.createdAt,
        })
        .from(webhookLogs)
        .where(where)
        .orderBy(desc(webhookLogs.createdAt))
        .limit(input.limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(webhookLogs)
        .where(where);

      return { rows, total };
    }),

  getLog: adminOnly()
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select()
        .from(webhookLogs)
        .where(eq(webhookLogs.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  // ── Public: Partner Lead Intake ─────────────────────────────────────────────

  // Returns active lead sources so the public form can populate the partner dropdown
  listPartnerSources: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ id: leadSources.id, name: leadSources.name })
      .from(leadSources)
      .where(eq(leadSources.isActive, true))
      .orderBy(leadSources.name);
  }),

  // Public form submission — no auth required
  submitPartnerLead: publicProcedure
    .input(z.object({
      clientName: z.string().min(1, "Client name is required"),
      phone: z.string().optional(),
      email: z.string().email("Invalid email").optional(),
      notes: z.string().optional(),
      // Partner source — either a lead source ID (from dropdown) or a free-text name (from URL param)
      partnerSourceId: z.number().optional(),
      partnerSourceName: z.string().optional(),
      // Partner's own email for confirmation receipt
      partnerEmail: z.string().email().optional(),
      partnerName: z.string().optional(),
      // Honeypot — must be empty; bots fill it automatically
      _hp: z.string().max(0, "Bot detected").optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Honeypot check — silently succeed to not tip off bots
      if (input._hp) {
        return { ok: true, contactId: 0, action: "created" as const };
      }

      // IP rate limiting
      const ip = (ctx.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        ?? (ctx.req.socket as any)?.remoteAddress
        ?? "unknown";
      checkRateLimit(ip);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Resolve lead source
      let leadSourceId: number | null = input.partnerSourceId ?? null;
      if (!leadSourceId && input.partnerSourceName) {
        // Try to match by name (case-insensitive)
        const [found] = await db
          .select({ id: leadSources.id })
          .from(leadSources)
          .where(and(eq(leadSources.isActive, true), sql`LOWER(${leadSources.name}) = LOWER(${input.partnerSourceName})`));
        if (found) leadSourceId = found.id;
      }

      // Split client name into first/last
      const nameParts = input.clientName.trim().split(/\s+/);
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Dedup check
      let contactId: number;
      let action: "created" | "updated" = "created";
      const existing = input.email || input.phone
        ? await db
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              or(
                input.email ? eq(contacts.email, input.email) : undefined,
                input.phone ? eq(contacts.phone, input.phone) : undefined,
              )
            )
            .limit(1)
        : [];

      if (existing.length > 0) {
        contactId = existing[0].id;
        action = "updated";
        const updates: Record<string, unknown> = {};
        if (firstName) updates.firstName = firstName;
        if (lastName) updates.lastName = lastName;
        if (input.email) updates.email = input.email;
        if (input.phone) updates.phone = input.phone;
        if (input.notes) updates.notes = input.notes;
        if (leadSourceId) updates.leadSourceId = leadSourceId;
        if (Object.keys(updates).length > 0) {
          await db.update(contacts).set(updates).where(eq(contacts.id, contactId));
        }
      } else {
        const [result] = await db.insert(contacts).values({
          firstName,
          lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          notes: input.notes ?? null,
          leadSourceId,
        });
        contactId = (result as any).insertId;
      }

      // Notify admins
      const partnerLabel = input.partnerSourceName || (input.partnerSourceId ? `Source #${input.partnerSourceId}` : "Unknown Partner");
      await notifyOwner({
        title: "New Partner Lead Submitted",
        content: `A new lead was submitted via the Partner Intake Form.\n\nClient: ${input.clientName}\nPhone: ${input.phone || "—"}\nEmail: ${input.email || "—"}\nPartner Source: ${partnerLabel}\nNotes: ${input.notes || "—"}\n\nContact ID: ${contactId} (${action})`,
      }).catch(() => {/* non-blocking */});

      // Send confirmation email to partner if they provided their email
      if (input.partnerEmail) {
        sendTransactionalEmail("partner_lead_confirmation", {
          recipientEmail: input.partnerEmail,
          recipientName: input.partnerName,
          partnerName: input.partnerName,
          partnerEmail: input.partnerEmail,
          contactName: input.clientName,
          notes: input.notes,
        }).catch(() => {/* non-blocking */});
      }

      // Increment submission count for the resolved lead source
      if (leadSourceId) {
        await db
          .update(leadSources)
          .set({ submissionCount: sql`${leadSources.submissionCount} + 1` })
          .where(eq(leadSources.id, leadSourceId))
          .catch(() => {/* non-blocking */});
      }

      return { ok: true, contactId, action };
    }),

  // ── Partner Link Analytics ────────────────────────────────────────────────

  // Public: called when a partner opens their link (fire-and-forget)
  trackPartnerClick: publicProcedure
    .input(z.object({ leadSourceId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: true };
      await db
        .update(leadSources)
        .set({ clickCount: sql`${leadSources.clickCount} + 1` })
        .where(eq(leadSources.id, input.leadSourceId));
      return { ok: true };
    }),

  // Admin: returns click + submission counts for all active partner sources
  getPartnerLinkAnalytics: adminOnly().query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: leadSources.id,
        name: leadSources.name,
        clickCount: leadSources.clickCount,
        submissionCount: leadSources.submissionCount,
      })
      .from(leadSources)
      .where(eq(leadSources.isActive, true))
      .orderBy(leadSources.name);
  }),

  // ── Stats ──────────────────────────────────────────────────────────────────

  stats: adminOnly().query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, success: 0, failed: 0, endpoints: 0 };

    const [totals] = await db
      .select({ total: count() })
      .from(webhookLogs);

    const [successes] = await db
      .select({ total: count() })
      .from(webhookLogs)
      .where(eq(webhookLogs.outcome, "success"));

    const [endpointCount] = await db
      .select({ total: count() })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.isActive, true));

    return {
      total: totals.total,
      success: successes.total,
      failed: totals.total - successes.total,
      endpoints: endpointCount.total,
    };
  }),
});
