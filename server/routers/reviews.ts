import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, isNull, lte, aliasedTable } from "drizzle-orm";
import { z } from "zod";
import { contacts, properties, reviewRequests, reviews, transactions, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { canAdminUsePermission } from "./permissions";

const APP_URL = "https://os.savvy-agents.com";
const REVIEW_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_TOKEN_MIN_LENGTH = 48;
const publicSubmissionAttempts = new Map<string, { count: number; resetAt: number }>();

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createPublicToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function formatName(contact: { firstName: string | null; lastName: string | null }): string {
  return `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "Savvy client";
}

function formatSpouseName(contact: { spouseFirstName: string | null; spouseLastName: string | null }): string {
  return `${contact.spouseFirstName ?? ""} ${contact.spouseLastName ?? ""}`.trim() || "Savvy client";
}

function formatPropertyAddress(property: { address: string; city: string | null; state: string | null } | null): string | undefined {
  if (!property) return undefined;
  return [property.address, property.city, property.state].filter(Boolean).join(", ") || undefined;
}

function checkPublicSubmissionRateLimit(ip: string): void {
  const now = Date.now();
  const current = publicSubmissionAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    publicSubmissionAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  if (current.count >= 12) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait a few minutes before trying again." });
  }
  current.count += 1;
}

function getRequestIp(ctx: { req: any }): string {
  return (ctx.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    ?? ctx.req.socket?.remoteAddress
    ?? "unknown";
}

async function sendReviewRequestEmail(params: {
  requestId: number;
  recipientEmail: string;
  recipientName: string;
  token: string;
  agentName: string | null;
  agentEmail: string | null;
  transactionNumber: string | null;
  propertyAddress?: string;
}): Promise<boolean> {
  const result = await sendTransactionalEmail("transaction_review_request", {
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    agentName: params.agentName ?? "your Savvy STR Agents representative",
    transactionNumber: params.transactionNumber ?? undefined,
    propertyAddress: params.propertyAddress,
    reviewUrl: `${APP_URL}/review?token=${params.token}`,
    replyToEmail: params.agentEmail ?? undefined,
  }, {
    injectMagicLinks: false,
    idempotencyKey: `review-request-${params.requestId}`,
  });
  return result.sent;
}

async function createAndSendReviewRequest(params: {
  transactionId: number;
  agentId: number;
  contactId?: number | null;
  recipientName: string;
  recipientEmail: string;
  recipientType: "client" | "spouse" | "test";
  isTest?: boolean;
  agentName: string | null;
  agentEmail: string | null;
  transactionNumber: string | null;
  propertyAddress?: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const token = createPublicToken();
  const expiresAt = new Date(Date.now() + REVIEW_LINK_TTL_MS);
  const [result] = await db.insert(reviewRequests).values({
    transactionId: params.transactionId,
    agentId: params.agentId,
    contactId: params.contactId ?? null,
    recipientName: params.recipientName,
    recipientEmail: params.recipientEmail.trim().toLowerCase(),
    recipientType: params.recipientType,
    tokenHash: tokenHash(token),
    expiresAt,
    isTest: params.isTest ?? false,
  });
  const requestId = Number((result as any).insertId);

  const sent = await sendReviewRequestEmail({
    requestId,
    recipientEmail: params.recipientEmail,
    recipientName: params.recipientName,
    token,
    agentName: params.agentName,
    agentEmail: params.agentEmail,
    transactionNumber: params.transactionNumber,
    propertyAddress: params.propertyAddress,
  });

  if (!sent) {
    await db.delete(reviewRequests).where(eq(reviewRequests.id, requestId));
    return false;
  }

  await db.update(reviewRequests).set({ sentAt: new Date() }).where(eq(reviewRequests.id, requestId));
  return true;
}

/**
 * Called only when a transaction transitions to Closed.  Every unique client email
 * on the deal receives a separate, one-time public review link.  The request record
 * is created before delivery and removed when delivery is rejected, avoiding dead links.
 */
export async function sendReviewRequestsForClosedTransaction(transactionId: number): Promise<{ sent: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0 };

  const buyerContacts = aliasedTable(contacts, "reviewBuyerContacts");
  const sellerContacts = aliasedTable(contacts, "reviewSellerContacts");
  const [row] = await db
    .select({
      transaction: transactions,
      agent: { id: users.id, name: users.name, email: users.email },
      primaryContact: contacts,
      buyerContact: buyerContacts,
      sellerContact: sellerContacts,
      property: { address: properties.address, city: properties.city, state: properties.state },
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.agentId, users.id))
    .leftJoin(contacts, eq(transactions.primaryContactId, contacts.id))
    .leftJoin(buyerContacts, eq(transactions.buyerContactId, buyerContacts.id))
    .leftJoin(sellerContacts, eq(transactions.sellerContactId, sellerContacts.id))
    .leftJoin(properties, eq(transactions.propertyId, properties.id))
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!row || row.transaction.status !== "closed" || !row.agent) return { sent: 0, skipped: 0 };

  const involvedContacts = [row.primaryContact, row.buyerContact, row.sellerContact]
    .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));
  const contactsById = new Map<number, (typeof involvedContacts)[number]>();
  for (const contact of involvedContacts) contactsById.set(contact.id, contact);
  const uniqueContacts = Array.from(contactsById.values());
  const existing = await db
    .select({ recipientEmail: reviewRequests.recipientEmail })
    .from(reviewRequests)
    .where(eq(reviewRequests.transactionId, transactionId));
  const usedEmails = new Set(existing.map((request) => request.recipientEmail.trim().toLowerCase()));
  const candidates: Array<{ contactId: number; recipientName: string; recipientEmail: string; recipientType: "client" | "spouse" }> = [];

  for (const contact of uniqueContacts) {
    // Do-not-contact and email deliverability controls extend to a spouse/partner record.
    if (contact.doNotContact || contact.emailStatus === "bounced" || contact.emailStatus === "unsubscribed") continue;
    if (contact.email?.trim()) {
      candidates.push({
        contactId: contact.id,
        recipientName: formatName(contact),
        recipientEmail: contact.email.trim(),
        recipientType: "client",
      });
    }
    if (contact.spouseEmail?.trim()) {
      candidates.push({
        contactId: contact.id,
        recipientName: formatSpouseName(contact),
        recipientEmail: contact.spouseEmail.trim(),
        recipientType: "spouse",
      });
    }
  }

  let sent = 0;
  let skipped = 0;
  const propertyAddress = formatPropertyAddress(row.property);
  for (const candidate of candidates) {
    const normalizedEmail = candidate.recipientEmail.toLowerCase();
    if (usedEmails.has(normalizedEmail)) {
      skipped += 1;
      continue;
    }
    usedEmails.add(normalizedEmail);
    try {
      const delivered = await createAndSendReviewRequest({
        transactionId,
        agentId: row.agent.id,
        contactId: candidate.contactId,
        recipientName: candidate.recipientName,
        recipientEmail: candidate.recipientEmail,
        recipientType: candidate.recipientType,
        agentName: row.agent.name,
        agentEmail: row.agent.email,
        transactionNumber: row.transaction.transactionNumber,
        propertyAddress,
      });
      if (delivered) sent += 1;
      else skipped += 1;
    } catch (error) {
      console.error("[Reviews] Could not send client review request", { transactionId, recipient: candidate.recipientEmail, error });
      skipped += 1;
    }
  }

  return { sent, skipped };
}

function parseDateStart(value?: string): Date | undefined {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function parseDateEnd(value?: string): Date | undefined {
  return value ? new Date(`${value}T23:59:59.999Z`) : undefined;
}

async function assertReviewAccess(user: { id: number; role: string; email?: string | null }): Promise<void> {
  if (user.role === "agent") return;
  if (user.role !== "admin" || !(await canAdminUsePermission(user, "canViewReviews"))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to reviews." });
  }
}

export const reviewsRouter = router({
  list: protectedProcedure
    .input(z.object({
      agentId: z.number().int().positive().optional(),
      dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      await assertReviewAccess(ctx.user);
      const db = await getDb();
      if (!db) return { rows: [], total: 0, page: input.page, limit: input.limit };

      const effectiveAgentId = ctx.user.role === "agent" ? ctx.user.id : input.agentId;
      const conditions = [] as any[];
      if (effectiveAgentId) conditions.push(eq(reviews.agentId, effectiveAgentId));
      const dateFrom = parseDateStart(input.dateFrom);
      const dateTo = parseDateEnd(input.dateTo);
      if (dateFrom) conditions.push(gte(reviews.submittedAt, dateFrom));
      if (dateTo) conditions.push(lte(reviews.submittedAt, dateTo));
      const where = conditions.length ? and(...conditions) : undefined;

      const [countResult, rows] = await Promise.all([
        db.select({ count: reviews.id }).from(reviews).where(where),
        db.select({
          review: reviews,
          request: reviewRequests,
          transaction: { id: transactions.id, transactionNumber: transactions.transactionNumber, closingDate: transactions.closingDate },
          agent: { id: users.id, name: users.name, email: users.email },
          property: { address: properties.address, city: properties.city, state: properties.state },
        })
          .from(reviews)
          .innerJoin(reviewRequests, eq(reviews.requestId, reviewRequests.id))
          .innerJoin(transactions, eq(reviews.transactionId, transactions.id))
          .innerJoin(users, eq(reviews.agentId, users.id))
          .leftJoin(properties, eq(transactions.propertyId, properties.id))
          .where(where)
          .orderBy(desc(reviews.submittedAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
      ]);

      return { rows, total: countResult.length, page: input.page, limit: input.limit };
    }),

  getPublic: publicProcedure
    .input(z.object({ token: z.string().min(PUBLIC_TOKEN_MIN_LENGTH).max(128) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { status: "invalid" as const };
      const [row] = await db.select({
        request: reviewRequests,
        transaction: { transactionNumber: transactions.transactionNumber },
        agent: { name: users.name },
        property: { address: properties.address, city: properties.city, state: properties.state },
      })
        .from(reviewRequests)
        .innerJoin(transactions, eq(reviewRequests.transactionId, transactions.id))
        .innerJoin(users, eq(reviewRequests.agentId, users.id))
        .leftJoin(properties, eq(transactions.propertyId, properties.id))
        .where(eq(reviewRequests.tokenHash, tokenHash(input.token)))
        .limit(1);

      if (!row || row.request.expiresAt < new Date()) return { status: "invalid" as const };
      if (row.request.submittedAt) return { status: "submitted" as const };
      return {
        status: "ready" as const,
        agentName: row.agent.name ?? "your Savvy STR Agents representative",
        propertyAddress: formatPropertyAddress(row.property),
        isTest: row.request.isTest,
      };
    }),

  submitPublic: publicProcedure
    .input(z.object({
      token: z.string().min(PUBLIC_TOKEN_MIN_LENGTH).max(128),
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(5000).optional(),
      _hp: z.string().max(0, "Bot detected").optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input._hp) return { status: "submitted" as const };
      checkPublicSubmissionRateLimit(getRequestIp(ctx));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The review form is temporarily unavailable." });

      const now = new Date();
      const requestHash = tokenHash(input.token);
      const [request] = await db.select().from(reviewRequests)
        .where(and(eq(reviewRequests.tokenHash, requestHash), isNull(reviewRequests.submittedAt), gte(reviewRequests.expiresAt, now)))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "This review link is invalid, expired, or has already been used." });

      await db.transaction(async (tx) => {
        const updateResult = await tx.update(reviewRequests)
          .set({ submittedAt: now })
          .where(and(eq(reviewRequests.id, request.id), isNull(reviewRequests.submittedAt)));
        if (Number((updateResult as any)[0]?.affectedRows ?? (updateResult as any).affectedRows ?? 0) !== 1) {
          throw new TRPCError({ code: "CONFLICT", message: "This review has already been submitted." });
        }
        await tx.insert(reviews).values({
          requestId: request.id,
          transactionId: request.transactionId,
          agentId: request.agentId,
          contactId: request.contactId,
          reviewerName: request.recipientName,
          reviewerEmail: request.recipientEmail,
          reviewerType: request.recipientType,
          rating: input.rating,
          comment: input.comment?.trim() || null,
          isTest: request.isTest,
          submittedAt: now,
        });
      });

      return { status: "submitted" as const };
    }),

  sendTestRequest: protectedProcedure
    .input(z.object({ transactionId: z.number().int().positive(), recipientEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" || !(await canAdminUsePermission(ctx.user, "canViewReviews"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to review testing." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [row] = await db.select({
        transaction: transactions,
        agent: { id: users.id, name: users.name, email: users.email },
        property: { address: properties.address, city: properties.city, state: properties.state },
      })
        .from(transactions)
        .innerJoin(users, eq(transactions.agentId, users.id))
        .leftJoin(properties, eq(transactions.propertyId, properties.id))
        .where(eq(transactions.id, input.transactionId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found." });

      const recipientEmail = input.recipientEmail.trim().toLowerCase();
      const [existing] = await db.select({ id: reviewRequests.id }).from(reviewRequests)
        .where(and(eq(reviewRequests.transactionId, input.transactionId), eq(reviewRequests.recipientEmail, recipientEmail)))
        .limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "A review link has already been created for this recipient and transaction." });

      const sent = await createAndSendReviewRequest({
        transactionId: input.transactionId,
        agentId: row.agent.id,
        recipientName: "Tyler",
        recipientEmail,
        recipientType: "test",
        isTest: true,
        agentName: row.agent.name,
        agentEmail: row.agent.email,
        transactionNumber: row.transaction.transactionNumber,
        propertyAddress: formatPropertyAddress(row.property),
      });
      if (!sent) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The test email could not be delivered." });
      return { sent: true };
    }),
});
