import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNotNull, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, createListing, createTransaction, logActivity, updateListing, updateTransaction } from "../db";
import { canAdminUsePermission, type PermissionKey } from "./permissions";
import { normalizeOptionalUsPhone } from "@shared/phone";
import {
  contacts,
  listings,
  properties,
  referralAgentCoverage,
  referralAgents,
  referralAgreements,
  referralDocuments,
  referralEvents,
  referralListingLinks,
  referralPayments,
  referralReassignments,
  referrals,
  referralStatusOptions,
  referralTransactionLinks,
  transactions,
  users,
} from "../../drizzle/schema";

const REFERRAL_TYPES = ["buyer", "seller", "buyer_seller", "other"] as const;
const PAYMENT_STATUSES = ["not_yet_due", "due", "invoiced", "processing", "paid", "disputed", "written_off"] as const;
const EVENT_TYPES = ["note", "referral_agent_update", "call", "email", "follow_up", "important_date"] as const;
const AGREEMENT_STATUSES = ["not_created", "sent", "awaiting_signature", "executed", "expired", "superseded"] as const;

const defaultStatusOptions = [
  ["referral_sent", "Referral Sent", "active", 10],
  ["agent_accepted", "Agent Accepted", "active", 20],
  ["agent_contacted_client", "Agent Contacted Client", "active", 30],
  ["consultation_scheduled", "Consultation Scheduled", "active", 40],
  ["consultation_completed", "Consultation Completed", "active", 50],
  ["actively_working", "Actively Working", "active", 60],
  ["listing_opportunity", "Listing Opportunity", "active", 70],
  ["listing_signed", "Listing Signed", "active", 80],
  ["buyer_searching", "Buyer Searching", "active", 90],
  ["under_contract", "Under Contract", "active", 100],
  ["closed", "Closed", "closed", 110],
  ["lost", "Lost", "lost", 120],
  ["on_hold", "On Hold", "on_hold", 130],
] as const;

type ReferralPermission = Extract<PermissionKey,
  | "canViewReferrals"
  | "canCreateReferrals"
  | "canEditReferrals"
  | "canManageReferralAgents"
  | "canEditReferralSplits"
  | "canViewReferralFinancials"
  | "canUpdateReferralPayments"
  | "canManageReferralAgreements"
  | "canEditHistoricalReferrals"
>;

function asDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function percentage(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Referral percentage must be between 0 and 100" });
  }
  return parsed.toFixed(2);
}

function amount(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be a positive number" });
  }
  return parsed.toFixed(2);
}

function daysSince(date: Date | string | null | undefined) {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
}

function money(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function assertReferralAccess(ctx: any, permission: ReferralPermission) {
  if (ctx.user.role === "agent" || ctx.user.role === "agent_support") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Referral operations are restricted to Savvy operations staff" });
  }
  // ISAs can operate referrals but cannot touch the financial controls reserved for admins.
  if (ctx.user.role === "isa") {
    if (["canViewReferralFinancials", "canUpdateReferralPayments", "canEditReferralSplits", "canEditHistoricalReferrals"].includes(permission)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Referral financial controls require administrator access" });
    }
    return;
  }
  if (ctx.user.role !== "admin" || !(await canAdminUsePermission(ctx.user, permission))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to perform this referral action" });
  }
}

async function ensureStatusOptions() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  for (const [key, name, category, sortOrder] of defaultStatusOptions) {
    await db.insert(referralStatusOptions).values({ key, name, category, sortOrder, isSystem: true }).onDuplicateKeyUpdate({ set: { name, category, sortOrder } });
  }
  return db;
}

async function getStatus(key: string) {
  const db = await ensureStatusOptions();
  const rows = await db.select().from(referralStatusOptions).where(and(eq(referralStatusOptions.key, key), eq(referralStatusOptions.isActive, true))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active referral status" });
  return rows[0];
}

async function getReferralOrThrow(referralId: number) {
  const db = await ensureStatusOptions();
  const rows = await db.select().from(referrals).where(eq(referrals.id, referralId)).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Referral not found" });
  return { db, referral: rows[0] };
}

async function getReferralRows(filters: {
  search?: string;
  referralAgentId?: number;
  relationshipOwnerId?: number;
  brokerage?: string;
  market?: string;
  referralType?: typeof REFERRAL_TYPES[number];
  statusKey?: string;
  statusCategory?: "active" | "closed" | "lost" | "on_hold";
  agentActive?: boolean;
  paymentStatus?: typeof PAYMENT_STATUSES[number];
  referredFrom?: string;
  referredTo?: string;
  closedFrom?: string;
  closedTo?: string;
}) {
  const db = await ensureStatusOptions();
  const conditions: any[] = [];
  if (filters.referralAgentId) conditions.push(eq(referrals.referralAgentId, filters.referralAgentId));
  if (filters.relationshipOwnerId) conditions.push(eq(referrals.relationshipOwnerId, filters.relationshipOwnerId));
  if (filters.brokerage) conditions.push(eq(referralAgents.brokerage, filters.brokerage));
  if (filters.market) conditions.push(like(referrals.market, `%${filters.market}%`));
  if (filters.referralType) conditions.push(eq(referrals.referralType, filters.referralType));
  if (filters.statusKey) conditions.push(eq(referrals.statusKey, filters.statusKey));
  if (filters.statusCategory) conditions.push(eq(referrals.statusCategory, filters.statusCategory));
  if (filters.agentActive !== undefined) conditions.push(eq(referralAgents.isActive, filters.agentActive));
  if (filters.referredFrom) conditions.push(gte(referrals.referralSentAt, new Date(filters.referredFrom)));
  if (filters.referredTo) conditions.push(lte(referrals.referralSentAt, new Date(`${filters.referredTo}T23:59:59`)));
  if (filters.closedFrom) conditions.push(gte(referrals.closedAt, new Date(filters.closedFrom)));
  if (filters.closedTo) conditions.push(lte(referrals.closedAt, new Date(`${filters.closedTo}T23:59:59`)));
  if (filters.search) {
    const search = `%${filters.search.trim()}%`;
    conditions.push(or(
      like(contacts.firstName, search),
      like(contacts.lastName, search),
      like(contacts.email, search),
      like(referralAgents.name, search),
      like(referralAgents.brokerage, search),
      like(referrals.market, search),
      like(referrals.locationNotes, search),
      like(users.name, search),
    ));
  }

  const rows = await db
    .select({
      referral: referrals,
      contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone },
      referralAgent: { id: referralAgents.id, name: referralAgents.name, brokerage: referralAgents.brokerage, isActive: referralAgents.isActive, email: referralAgents.email },
      status: { name: referralStatusOptions.name, category: referralStatusOptions.category },
      relationshipOwner: { id: users.id, name: users.name },
    })
    .from(referrals)
    .innerJoin(contacts, eq(referrals.contactId, contacts.id))
    .innerJoin(referralAgents, eq(referrals.referralAgentId, referralAgents.id))
    .leftJoin(referralStatusOptions, eq(referrals.statusKey, referralStatusOptions.key))
    .leftJoin(users, eq(referrals.relationshipOwnerId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(referrals.referralSentAt));

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.referral.id);
  const payments = await db.select().from(referralPayments).where(inArray(referralPayments.referralId, ids));
  const txLinks = await db
    .select({ link: referralTransactionLinks, transaction: transactions })
    .from(referralTransactionLinks)
    .innerJoin(transactions, eq(referralTransactionLinks.transactionId, transactions.id))
    .where(inArray(referralTransactionLinks.referralId, ids));
  const listingLinks = await db
    .select({ link: referralListingLinks, listing: listings })
    .from(referralListingLinks)
    .innerJoin(listings, eq(referralListingLinks.listingId, listings.id))
    .where(inArray(referralListingLinks.referralId, ids));

  const paymentMap = new Map<number, typeof payments>();
  for (const payment of payments) {
    const existing = paymentMap.get(payment.referralId) ?? [];
    existing.push(payment);
    paymentMap.set(payment.referralId, existing);
  }
  const txMap = new Map<number, typeof txLinks>();
  for (const row of txLinks) {
    const existing = txMap.get(row.link.referralId) ?? [];
    existing.push(row);
    txMap.set(row.link.referralId, existing);
  }
  const listingMap = new Map<number, typeof listingLinks>();
  for (const row of listingLinks) {
    const existing = listingMap.get(row.link.referralId) ?? [];
    existing.push(row);
    listingMap.set(row.link.referralId, existing);
  }

  return rows
    .map((row) => {
      const rowPayments = paymentMap.get(row.referral.id) ?? [];
      const paymentStatus = rowPayments.some((payment) => payment.paymentStatus === "due") ? "due"
        : rowPayments.some((payment) => payment.paymentStatus === "invoiced") ? "invoiced"
        : rowPayments.some((payment) => payment.paymentStatus === "processing") ? "processing"
        : rowPayments.some((payment) => payment.paymentStatus === "disputed") ? "disputed"
        : rowPayments.some((payment) => payment.paymentStatus === "paid") ? "paid"
        : rowPayments[0]?.paymentStatus ?? "not_yet_due";
      return {
        ...row,
        payments: rowPayments,
        transactions: txMap.get(row.referral.id) ?? [],
        listings: listingMap.get(row.referral.id) ?? [],
        paymentStatus,
        expectedReferralFee: rowPayments.reduce((sum, payment) => sum + money(payment.referralFeeOwed), 0),
        daysSinceLastUpdate: daysSince(row.referral.lastUpdateReceivedAt ?? row.referral.referralSentAt),
      };
    })
    .filter((row) => !filters.paymentStatus || row.paymentStatus === filters.paymentStatus);
}

function calculatePaymentValues(gci: string | null | undefined, pct: string | number) {
  const grossCommissionIncome = money(gci);
  const savvyReferralPct = money(pct);
  const referralFeeOwed = Number((grossCommissionIncome * savvyReferralPct / 100).toFixed(2));
  return {
    grossCommissionIncome: grossCommissionIncome ? grossCommissionIncome.toFixed(2) : null,
    savvyReferralPct: savvyReferralPct.toFixed(2),
    referralFeeOwed: referralFeeOwed.toFixed(2),
    outsideAgentPortion: grossCommissionIncome ? Number((grossCommissionIncome - referralFeeOwed).toFixed(2)).toFixed(2) : null,
  };
}

/** Called by the transaction workflow whenever an outbound-referral transaction changes. */
export async function syncReferralPaymentForTransaction(transactionId: number, markedById?: number) {
  const db = await ensureStatusOptions();
  const txRows = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
  const transaction = txRows[0];
  if (!transaction?.referralId || !transaction.isOutsideReferral) return null;
  const referralRows = await db.select().from(referrals).where(eq(referrals.id, transaction.referralId)).limit(1);
  const referral = referralRows[0];
  if (!referral) return null;

  const values = calculatePaymentValues(transaction.grossCommissionIncome, transaction.savvyReferralPct ?? referral.savvyReferralPct);
  const existingRows = await db.select().from(referralPayments).where(eq(referralPayments.transactionId, transactionId)).limit(1);
  const status = transaction.status === "closed" ? (existingRows[0]?.paymentStatus === "not_yet_due" ? "due" : existingRows[0]?.paymentStatus ?? "due") : existingRows[0]?.paymentStatus ?? "not_yet_due";
  const paymentData = {
    referralId: referral.id,
    transactionId,
    salesPrice: transaction.purchasePrice,
    ...values,
    paymentStatus: status as any,
    dueAt: transaction.status === "closed" ? (existingRows[0]?.dueAt ?? transaction.closingDate ?? new Date()) : existingRows[0]?.dueAt ?? null,
    markedPaidById: existingRows[0]?.markedPaidById ?? (status === "paid" ? markedById ?? null : null),
  };
  if (existingRows[0]) {
    await db.update(referralPayments).set(paymentData as any).where(eq(referralPayments.id, existingRows[0].id));
  } else {
    await db.insert(referralPayments).values(paymentData as any);
  }
  await db.insert(referralTransactionLinks).values({ referralId: referral.id, transactionId }).onDuplicateKeyUpdate({ set: { transactionId } });
  if (transaction.status === "closed") {
    await db.update(referrals).set({ statusKey: "closed", statusCategory: "closed", closedAt: referral.closedAt ?? transaction.closingDate ?? new Date() }).where(eq(referrals.id, referral.id));
  }
  return { referralId: referral.id };
}

/** Retains outbound referral attribution when a referral listing becomes a transaction. */
export async function linkReferralTransaction(referralId: number | null | undefined, transactionId: number, markedById?: number) {
  if (!referralId) return null;
  const db = await ensureStatusOptions();
  await db.insert(referralTransactionLinks).values({ referralId, transactionId }).onDuplicateKeyUpdate({ set: { transactionId } });
  await syncReferralPaymentForTransaction(transactionId, markedById);
  return { referralId, transactionId };
}

const agentInput = z.object({
  name: z.string().trim().min(2).max(255),
  brokerage: z.string().trim().max(255).nullable().optional(),
  email: z.string().trim().email().or(z.literal("")).nullable().optional(),
  phone: z.string().trim().max(64).nullable().optional(),
  primaryMarket: z.string().trim().max(255).nullable().optional(),
  defaultSavvyReferralPct: z.string().or(z.number()).nullable().optional(),
  licenseNumber: z.string().trim().max(128).nullable().optional(),
  licenseState: z.string().trim().max(64).nullable().optional(),
  relationshipOwnerId: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  coverage: z.array(z.object({
    state: z.string().trim().max(64).nullable().optional(),
    market: z.string().trim().max(255).nullable().optional(),
    metro: z.string().trim().max(255).nullable().optional(),
    areasServed: z.string().trim().nullable().optional(),
  })).optional(),
});

export const referralsRouter = router({
  config: protectedProcedure.query(async ({ ctx }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    const db = await ensureStatusOptions();
    const [statuses, agents, owners] = await Promise.all([
      db.select().from(referralStatusOptions).orderBy(asc(referralStatusOptions.sortOrder)),
      db.select().from(referralAgents).where(eq(referralAgents.isActive, true)).orderBy(asc(referralAgents.name)),
      db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name)),
    ]);
    return { statuses, agents, owners };
  }),

  list: protectedProcedure.input(z.object({
    search: z.string().trim().max(200).optional(),
    referralAgentId: z.number().optional(),
    relationshipOwnerId: z.number().optional(),
    brokerage: z.string().trim().max(255).optional(),
    market: z.string().trim().max(255).optional(),
    referralType: z.enum(REFERRAL_TYPES).optional(),
    statusKey: z.string().trim().max(96).optional(),
    statusCategory: z.enum(["active", "closed", "lost", "on_hold"]).optional(),
    agentActive: z.boolean().optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    referredFrom: z.string().optional(),
    referredTo: z.string().optional(),
    closedFrom: z.string().optional(),
    closedTo: z.string().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    return getReferralRows(input ?? {});
  }),

  byContact: protectedProcedure.input(z.object({ contactId: z.number() })).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    return getReferralRows({ referralAgentId: undefined, search: undefined }).then((rows) => rows.filter((row) => row.referral.contactId === input.contactId));
  }),

  byTransaction: protectedProcedure.input(z.object({ transactionId: z.number() })).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    const db = await ensureStatusOptions();
    const direct = await db.select({ referralId: transactions.referralId }).from(transactions).where(eq(transactions.id, input.transactionId)).limit(1);
    const links = await db.select().from(referralTransactionLinks).where(eq(referralTransactionLinks.transactionId, input.transactionId));
    const ids = Array.from(new Set([direct[0]?.referralId, ...links.map((row) => row.referralId)].filter((id): id is number => !!id)));
    if (!ids.length) return [];
    const all = await getReferralRows({});
    return all.filter((row) => ids.includes(row.referral.id));
  }),

  byListing: protectedProcedure.input(z.object({ listingId: z.number() })).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    const db = await ensureStatusOptions();
    const direct = await db.select({ referralId: listings.referralId }).from(listings).where(eq(listings.id, input.listingId)).limit(1);
    const links = await db.select().from(referralListingLinks).where(eq(referralListingLinks.listingId, input.listingId));
    const ids = Array.from(new Set([direct[0]?.referralId, ...links.map((row) => row.referralId)].filter((id): id is number => !!id)));
    if (!ids.length) return [];
    const all = await getReferralRows({});
    return all.filter((row) => ids.includes(row.referral.id));
  }),

  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    const { db, referral } = await getReferralOrThrow(input.id);
    const baseRows = await db
      .select({
        referral: referrals,
        contact: contacts,
        referralAgent: referralAgents,
        status: referralStatusOptions,
        relationshipOwner: { id: users.id, name: users.name, email: users.email },
      })
      .from(referrals)
      .innerJoin(contacts, eq(referrals.contactId, contacts.id))
      .innerJoin(referralAgents, eq(referrals.referralAgentId, referralAgents.id))
      .leftJoin(referralStatusOptions, eq(referrals.statusKey, referralStatusOptions.key))
      .leftJoin(users, eq(referrals.relationshipOwnerId, users.id))
      .where(eq(referrals.id, input.id)).limit(1);
    const base = baseRows[0];
    const [coverage, agreements, eventRows, paymentRows, documents, txRows, listingRows, reassignments] = await Promise.all([
      db.select().from(referralAgentCoverage).where(eq(referralAgentCoverage.referralAgentId, referral.referralAgentId)),
      db.select().from(referralAgreements).where(or(eq(referralAgreements.referralAgentId, referral.referralAgentId), eq(referralAgreements.referralId, referral.id))).orderBy(desc(referralAgreements.createdAt)),
      db.select({ event: referralEvents, user: { id: users.id, name: users.name, email: users.email } }).from(referralEvents).leftJoin(users, eq(referralEvents.enteredById, users.id)).where(eq(referralEvents.referralId, referral.id)).orderBy(desc(referralEvents.occurredAt)),
      db.select({ payment: referralPayments, transaction: transactions }).from(referralPayments).leftJoin(transactions, eq(referralPayments.transactionId, transactions.id)).where(eq(referralPayments.referralId, referral.id)).orderBy(desc(referralPayments.createdAt)),
      db.select().from(referralDocuments).where(eq(referralDocuments.referralId, referral.id)).orderBy(desc(referralDocuments.createdAt)),
      db.select({ link: referralTransactionLinks, transaction: transactions, property: properties }).from(referralTransactionLinks).innerJoin(transactions, eq(referralTransactionLinks.transactionId, transactions.id)).leftJoin(properties, eq(transactions.propertyId, properties.id)).where(eq(referralTransactionLinks.referralId, referral.id)),
      db.select({ link: referralListingLinks, listing: listings, property: properties }).from(referralListingLinks).innerJoin(listings, eq(referralListingLinks.listingId, listings.id)).leftJoin(properties, eq(listings.propertyId, properties.id)).where(eq(referralListingLinks.referralId, referral.id)),
      db.select().from(referralReassignments).where(or(eq(referralReassignments.priorReferralId, referral.id), eq(referralReassignments.newReferralId, referral.id))),
    ]);
    return { ...base, coverage, agreements, events: eventRows, payments: paymentRows, documents, transactions: txRows, listings: listingRows, reassignments, daysSinceLastUpdate: daysSince(referral.lastUpdateReceivedAt ?? referral.referralSentAt) };
  }),

  createAgent: protectedProcedure.input(agentInput).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canManageReferralAgents");
    const db = await ensureStatusOptions();
    const result = await db.insert(referralAgents).values({
      name: input.name,
      brokerage: input.brokerage || null,
      email: input.email || null,
      phone: normalizeOptionalUsPhone(input.phone),
      primaryMarket: input.primaryMarket || null,
      defaultSavvyReferralPct: percentage(input.defaultSavvyReferralPct) ?? "25.00",
      licenseNumber: input.licenseNumber || null,
      licenseState: input.licenseState || null,
      relationshipOwnerId: input.relationshipOwnerId ?? null,
      notes: input.notes || null,
      isActive: input.isActive ?? true,
      addedById: ctx.user.id,
    });
    const id = Number(result[0].insertId);
    if (input.coverage?.length) {
      await db.insert(referralAgentCoverage).values(input.coverage.map((coverage) => ({ referralAgentId: id, ...coverage })) as any);
    }
    await logActivity({ userId: ctx.user.id, action: "referral_agent_created", entityType: "referral_agent", entityId: id, details: { name: input.name } });
    return { id };
  }),

  updateAgent: protectedProcedure.input(z.object({ id: z.number(), data: agentInput.partial() })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canManageReferralAgents");
    const db = await ensureStatusOptions();
    const { coverage, defaultSavvyReferralPct, email, ...rest } = input.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (defaultSavvyReferralPct !== undefined) updateData.defaultSavvyReferralPct = percentage(defaultSavvyReferralPct) ?? "0.00";
    if (email !== undefined) updateData.email = email || null;
    if (Object.prototype.hasOwnProperty.call(input.data, "phone")) {
      updateData.phone = normalizeOptionalUsPhone(input.data.phone);
    }
    await db.update(referralAgents).set(updateData as any).where(eq(referralAgents.id, input.id));
    if (coverage) {
      await db.delete(referralAgentCoverage).where(eq(referralAgentCoverage.referralAgentId, input.id));
      if (coverage.length) await db.insert(referralAgentCoverage).values(coverage.map((row) => ({ referralAgentId: input.id, ...row })) as any);
    }
    await logActivity({ userId: ctx.user.id, action: "referral_agent_updated", entityType: "referral_agent", entityId: input.id });
    return { success: true };
  }),

  listAgents: protectedProcedure.input(z.object({ search: z.string().trim().max(200).optional(), activeOnly: z.boolean().optional() }).optional()).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    const db = await ensureStatusOptions();
    const conditions: any[] = [];
    if (input?.activeOnly) conditions.push(eq(referralAgents.isActive, true));
    if (input?.search) {
      const term = `%${input.search}%`;
      conditions.push(or(like(referralAgents.name, term), like(referralAgents.brokerage, term), like(referralAgents.primaryMarket, term)));
    }
    const agents = await db.select().from(referralAgents).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(referralAgents.name));
    const allRows = await getReferralRows({});
    return agents.map((agent) => {
      const agentRows = allRows.filter((row) => row.referral.referralAgentId === agent.id);
      const closedRows = agentRows.filter((row) => row.referral.statusCategory === "closed");
      const lostRows = agentRows.filter((row) => row.referral.statusCategory === "lost");
      const activeRows = agentRows.filter((row) => row.referral.statusCategory === "active" || row.referral.statusCategory === "on_hold");
      const closedVolume = closedRows.reduce((sum, row) => sum + row.transactions.filter((tx) => tx.transaction.status === "closed").reduce((inner, tx) => inner + money(tx.transaction.purchasePrice), 0), 0);
      const totalGci = closedRows.reduce((sum, row) => sum + row.transactions.filter((tx) => tx.transaction.status === "closed").reduce((inner, tx) => inner + money(tx.transaction.grossCommissionIncome), 0), 0);
      const referralRevenueOwed = agentRows.reduce((sum, row) => sum + row.payments.reduce((inner, payment) => inner + money(payment.referralFeeOwed), 0), 0);
      const referralRevenuePaid = agentRows.reduce((sum, row) => sum + row.payments.filter((payment) => payment.paymentStatus === "paid").reduce((inner, payment) => inner + money(payment.referralFeeOwed), 0), 0);
      return {
        agent,
        referralsSent: agentRows.length,
        active: activeRows.length,
        closed: closedRows.length,
        lost: lostRows.length,
        conversionRate: agentRows.length ? Number((closedRows.length / agentRows.length * 100).toFixed(1)) : 0,
        closedVolume,
        totalGci,
        referralRevenueOwed,
        referralRevenuePaid,
        outstandingReferralRevenue: referralRevenueOwed - referralRevenuePaid,
        averageTransactionSize: closedRows.length ? closedVolume / closedRows.length : 0,
        lastReferralAt: agentRows[0]?.referral.referralSentAt ?? null,
        lastUpdateAt: agentRows.map((row) => row.referral.lastUpdateReceivedAt).filter(Boolean).sort((a, b) => new Date(b as any).getTime() - new Date(a as any).getTime())[0] ?? null,
      };
    });
  }),

  getAgent: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    const db = await ensureStatusOptions();
    const agentRows = await db.select({ agent: referralAgents, owner: { id: users.id, name: users.name, email: users.email } }).from(referralAgents).leftJoin(users, eq(referralAgents.relationshipOwnerId, users.id)).where(eq(referralAgents.id, input.id)).limit(1);
    if (!agentRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Referral agent not found" });
    const [coverage, agreements, documents, allAgents] = await Promise.all([
      db.select().from(referralAgentCoverage).where(eq(referralAgentCoverage.referralAgentId, input.id)),
      db.select().from(referralAgreements).where(eq(referralAgreements.referralAgentId, input.id)).orderBy(desc(referralAgreements.createdAt)),
      db.select().from(referralDocuments).where(eq(referralDocuments.referralAgentId, input.id)).orderBy(desc(referralDocuments.createdAt)),
      getReferralRows({ referralAgentId: input.id }),
    ]);
    const closed = allAgents.filter((row) => row.referral.statusCategory === "closed");
    const owed = allAgents.reduce((sum, row) => sum + row.payments.reduce((inner, payment) => inner + money(payment.referralFeeOwed), 0), 0);
    const paid = allAgents.reduce((sum, row) => sum + row.payments.filter((payment) => payment.paymentStatus === "paid").reduce((inner, payment) => inner + money(payment.referralFeeOwed), 0), 0);
    return {
      ...agentRows[0], coverage, agreements, documents, referrals: allAgents,
      metrics: {
        referralsSent: allAgents.length,
        active: allAgents.filter((row) => row.referral.statusCategory === "active" || row.referral.statusCategory === "on_hold").length,
        closed: closed.length,
        lost: allAgents.filter((row) => row.referral.statusCategory === "lost").length,
        conversionRate: allAgents.length ? Number((closed.length / allAgents.length * 100).toFixed(1)) : 0,
        closedVolume: closed.reduce((sum, row) => sum + row.transactions.filter((tx) => tx.transaction.status === "closed").reduce((inner, tx) => inner + money(tx.transaction.purchasePrice), 0), 0),
        totalGci: closed.reduce((sum, row) => sum + row.transactions.filter((tx) => tx.transaction.status === "closed").reduce((inner, tx) => inner + money(tx.transaction.grossCommissionIncome), 0), 0),
        referralRevenueOwed: owed,
        referralRevenuePaid: paid,
        outstandingReferralRevenue: owed - paid,
      },
    };
  }),

  create: protectedProcedure.input(z.object({
    contactId: z.number(),
    referralAgentId: z.number(),
    propertyId: z.number().nullable().optional(),
    referralType: z.enum(REFERRAL_TYPES),
    referralSentAt: z.string().nullable().optional(),
    locationNotes: z.string().trim().nullable().optional(),
    notes: z.string().nullable().optional(),
    agreement: z.object({
      title: z.string().trim().min(2).max(255),
      status: z.enum(AGREEMENT_STATUSES).default("not_created"),
      appliesTo: z.enum(["single_transaction", "multiple_transactions", "all_future"]).default("single_transaction"),
      effectiveAt: z.string().nullable().optional(),
      expiresAt: z.string().nullable().optional(),
      signedBy: z.string().trim().max(255).nullable().optional(),
      notes: z.string().nullable().optional(),
    }).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canCreateReferrals");
    const db = await ensureStatusOptions();
    const [contactRows, agentRows, status] = await Promise.all([
      db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, input.contactId)).limit(1),
      db.select().from(referralAgents).where(eq(referralAgents.id, input.referralAgentId)).limit(1),
      getStatus("referral_sent"),
    ]);
    if (!contactRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Savvy contact not found" });
    const referralAgent = agentRows[0];
    if (!referralAgent) throw new TRPCError({ code: "NOT_FOUND", message: "Referral agent not found" });
    if (!referralAgent.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Reactivate this referral agent before creating a new referral" });
    // A referral records the selected outside agent's current default as a historical fee snapshot.
    // The create flow intentionally does not accept a per-referral override.
    const snapshotPct = String(referralAgent.defaultSavvyReferralPct ?? "25.00");
    let agreementId: number | null = null;
    if (input.agreement) {
      const agreementResult = await db.insert(referralAgreements).values({
        referralAgentId: input.referralAgentId,
        title: input.agreement.title,
        status: input.agreement.status,
        appliesTo: input.agreement.appliesTo,
        savvyReferralPct: snapshotPct,
        effectiveAt: asDate(input.agreement.effectiveAt),
        expiresAt: asDate(input.agreement.expiresAt),
        signedBy: input.agreement.signedBy || null,
        notes: input.agreement.notes || null,
        createdById: ctx.user.id,
      });
      agreementId = Number(agreementResult[0].insertId);
    }
    const result = await db.insert(referrals).values({
      contactId: input.contactId,
      referralAgentId: input.referralAgentId,
      relationshipOwnerId: referralAgent.relationshipOwnerId ?? ctx.user.id,
      propertyId: input.propertyId ?? null,
      agreementId,
      referralType: input.referralType,
      statusKey: status.key,
      statusCategory: status.category,
      savvyReferralPct: snapshotPct,
      locationNotes: input.locationNotes || null,
      referralSentAt: asDate(input.referralSentAt) ?? new Date(),
      notes: input.notes || null,
      createdById: ctx.user.id,
    });
    const id = Number(result[0].insertId);
    if (agreementId) await db.update(referralAgreements).set({ referralId: id }).where(eq(referralAgreements.id, agreementId));
    await db.insert(referralEvents).values({
      referralId: id,
      eventType: "created",
      title: "Referral created and sent",
      body: input.notes || null,
      newStatusKey: status.key,
      occurredAt: asDate(input.referralSentAt) ?? new Date(),
      enteredById: ctx.user.id,
    });
    await logActivity({ userId: ctx.user.id, action: "outbound_referral_created", entityType: "referral", entityId: id, relatedContactId: input.contactId, details: { referralAgentId: input.referralAgentId, status: status.name, referralType: input.referralType, savvyReferralPct: snapshotPct } });
    return { id, agreementId };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    data: z.object({
      relationshipOwnerId: z.number().nullable().optional(),
      propertyId: z.number().nullable().optional(),
      locationNotes: z.string().trim().nullable().optional(),
      referralType: z.enum(REFERRAL_TYPES).optional(),
      market: z.string().trim().max(255).nullable().optional(),
      metro: z.string().trim().max(255).nullable().optional(),
      state: z.string().trim().max(64).nullable().optional(),
      areasServed: z.string().trim().nullable().optional(),
      savvyReferralPct: z.string().or(z.number()).nullable().optional(),
      nextFollowUpAt: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canEditReferrals");
    const { db, referral } = await getReferralOrThrow(input.id);
    if (referral.statusCategory !== "active") await assertReferralAccess(ctx, "canEditHistoricalReferrals");
    const { savvyReferralPct, nextFollowUpAt, ...rest } = input.data;
    const updateData: Record<string, unknown> = { ...rest };
    if (savvyReferralPct !== undefined) {
      await assertReferralAccess(ctx, "canEditReferralSplits");
      updateData.savvyReferralPct = percentage(savvyReferralPct) ?? referral.savvyReferralPct;
    }
    if (nextFollowUpAt !== undefined) updateData.nextFollowUpAt = asDate(nextFollowUpAt);
    await db.update(referrals).set(updateData as any).where(eq(referrals.id, input.id));
    await logActivity({ userId: ctx.user.id, action: "outbound_referral_updated", entityType: "referral", entityId: input.id, relatedContactId: referral.contactId });
    return { success: true };
  }),

  changeStatus: protectedProcedure.input(z.object({
    id: z.number(),
    statusKey: z.string().trim().min(1).max(96),
    occurredAt: z.string().nullable().optional(),
    note: z.string().trim().nullable().optional(),
    lostReason: z.string().trim().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canEditReferrals");
    const { db, referral } = await getReferralOrThrow(input.id);
    if (referral.statusCategory !== "active") await assertReferralAccess(ctx, "canEditHistoricalReferrals");
    const status = await getStatus(input.statusKey);
    const occurredAt = asDate(input.occurredAt) ?? new Date();
    const updateData: Record<string, unknown> = { statusKey: status.key, statusCategory: status.category };
    if (status.key === "agent_accepted") updateData.agentAcceptedAt = occurredAt;
    if (status.key === "agent_contacted_client") updateData.clientContactedAt = occurredAt;
    if (status.key === "consultation_scheduled" || status.key === "consultation_completed") updateData.consultationAt = occurredAt;
    if (status.key === "under_contract") updateData.underContractAt = occurredAt;
    if (status.category === "closed") updateData.closedAt = occurredAt;
    if (status.category === "lost") {
      updateData.lostAt = occurredAt;
      updateData.lostReason = input.lostReason || referral.lostReason || null;
    }
    await db.update(referrals).set(updateData as any).where(eq(referrals.id, input.id));
    await db.insert(referralEvents).values({
      referralId: input.id,
      eventType: "status_change",
      title: `Status changed to ${status.name}`,
      body: input.note || null,
      previousStatusKey: referral.statusKey,
      newStatusKey: status.key,
      occurredAt,
      enteredById: ctx.user.id,
    });
    await logActivity({ userId: ctx.user.id, action: "outbound_referral_status_changed", entityType: "referral", entityId: input.id, relatedContactId: referral.contactId, details: { from: referral.statusKey, to: status.key } });
    return { success: true, status };
  }),

  addEvent: protectedProcedure.input(z.object({
    referralId: z.number(),
    eventType: z.enum(EVENT_TYPES),
    title: z.string().trim().min(2).max(255),
    body: z.string().trim().nullable().optional(),
    occurredAt: z.string().nullable().optional(),
    nextFollowUpAt: z.string().nullable().optional(),
    receivedFromReferralAgent: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canEditReferrals");
    const { db, referral } = await getReferralOrThrow(input.referralId);
    const occurredAt = asDate(input.occurredAt) ?? new Date();
    await db.insert(referralEvents).values({ referralId: input.referralId, eventType: input.eventType, title: input.title, body: input.body || null, occurredAt, enteredById: ctx.user.id });
    const updateData: Record<string, unknown> = {};
    if (input.receivedFromReferralAgent || input.eventType === "referral_agent_update") updateData.lastUpdateReceivedAt = occurredAt;
    if (["call", "email", "follow_up"].includes(input.eventType)) updateData.lastReferralAgentContactAt = occurredAt;
    if (input.nextFollowUpAt !== undefined) updateData.nextFollowUpAt = asDate(input.nextFollowUpAt);
    if (Object.keys(updateData).length) await db.update(referrals).set(updateData as any).where(eq(referrals.id, input.referralId));
    await logActivity({ userId: ctx.user.id, action: "outbound_referral_event_added", entityType: "referral", entityId: input.referralId, relatedContactId: referral.contactId, details: { eventType: input.eventType, title: input.title } });
    return { success: true };
  }),

  createAgreement: protectedProcedure.input(z.object({
    referralAgentId: z.number(), referralId: z.number().nullable().optional(), title: z.string().trim().min(2).max(255),
    status: z.enum(AGREEMENT_STATUSES).default("not_created"), savvyReferralPct: z.string().or(z.number()).nullable().optional(),
    appliesTo: z.enum(["single_transaction", "multiple_transactions", "all_future"]).default("single_transaction"),
    sentAt: z.string().nullable().optional(), executedAt: z.string().nullable().optional(), effectiveAt: z.string().nullable().optional(), expiresAt: z.string().nullable().optional(),
    signedBy: z.string().trim().max(255).nullable().optional(), notes: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canManageReferralAgreements");
    const db = await ensureStatusOptions();
    const result = await db.insert(referralAgreements).values({
      ...input,
      savvyReferralPct: percentage(input.savvyReferralPct),
      sentAt: asDate(input.sentAt), executedAt: asDate(input.executedAt), effectiveAt: asDate(input.effectiveAt), expiresAt: asDate(input.expiresAt),
      createdById: ctx.user.id,
    } as any);
    const id = Number(result[0].insertId);
    if (input.referralId) await db.update(referrals).set({ agreementId: id }).where(eq(referrals.id, input.referralId));
    return { id };
  }),

  attachDocument: protectedProcedure.input(z.object({
    referralAgentId: z.number().nullable().optional(), referralId: z.number().nullable().optional(), agreementId: z.number().nullable().optional(), transactionId: z.number().nullable().optional(), listingId: z.number().nullable().optional(), paymentId: z.number().nullable().optional(),
    name: z.string().trim().min(1).max(512), fileKey: z.string().trim().min(1).max(1024), fileUrl: z.string().url(), mimeType: z.string().trim().max(128).nullable().optional(), fileSize: z.number().nullable().optional(),
    documentType: z.enum(["agreement", "payment_proof", "closing_statement", "communication", "other"]).default("other"), notes: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, input.documentType === "agreement" ? "canManageReferralAgreements" : "canEditReferrals");
    if (!input.referralAgentId && !input.referralId && !input.agreementId && !input.paymentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Associate this document with a referral record" });
    const db = await ensureStatusOptions();
    const result = await db.insert(referralDocuments).values({ ...input, uploadedById: ctx.user.id } as any);
    if (input.referralId) await db.insert(referralEvents).values({ referralId: input.referralId, eventType: "document", title: `Document added: ${input.name}`, occurredAt: new Date(), enteredById: ctx.user.id });
    return { id: Number(result[0].insertId) };
  }),

  createPayment: protectedProcedure.input(z.object({
    referralId: z.number(), transactionId: z.number().nullable().optional(), salesPrice: z.string().or(z.number()).nullable().optional(), grossCommissionIncome: z.string().or(z.number()).nullable().optional(),
    savvyReferralPct: z.string().or(z.number()), paymentStatus: z.enum(PAYMENT_STATUSES).default("not_yet_due"), dueAt: z.string().nullable().optional(), invoicedAt: z.string().nullable().optional(), notes: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canUpdateReferralPayments");
    const db = await ensureStatusOptions();
    const fee = calculatePaymentValues(input.grossCommissionIncome ? String(input.grossCommissionIncome) : null, input.savvyReferralPct);
    const result = await db.insert(referralPayments).values({
      referralId: input.referralId, transactionId: input.transactionId ?? null, salesPrice: amount(input.salesPrice), ...fee,
      paymentStatus: input.paymentStatus, dueAt: asDate(input.dueAt), invoicedAt: asDate(input.invoicedAt), notes: input.notes || null,
      markedPaidById: input.paymentStatus === "paid" ? ctx.user.id : null,
    } as any);
    if (input.transactionId) await linkReferralTransaction(input.referralId, input.transactionId, ctx.user.id);
    await db.insert(referralEvents).values({ referralId: input.referralId, eventType: "payment", title: "Referral payment record created", occurredAt: new Date(), enteredById: ctx.user.id });
    return { id: Number(result[0].insertId) };
  }),

  updatePayment: protectedProcedure.input(z.object({
    id: z.number(), data: z.object({ salesPrice: z.string().or(z.number()).nullable().optional(), grossCommissionIncome: z.string().or(z.number()).nullable().optional(), savvyReferralPct: z.string().or(z.number()).optional(), paymentStatus: z.enum(PAYMENT_STATUSES).optional(), dueAt: z.string().nullable().optional(), invoicedAt: z.string().nullable().optional(), paidAt: z.string().nullable().optional(), paymentMethod: z.string().trim().max(128).nullable().optional(), paymentReference: z.string().trim().max(255).nullable().optional(), notes: z.string().nullable().optional() }),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canUpdateReferralPayments");
    const db = await ensureStatusOptions();
    const rows = await db.select().from(referralPayments).where(eq(referralPayments.id, input.id)).limit(1);
    const current = rows[0];
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Referral payment not found" });
    const data: Record<string, unknown> = { ...input.data };
    if (input.data.salesPrice !== undefined) data.salesPrice = amount(input.data.salesPrice);
    if (input.data.grossCommissionIncome !== undefined || input.data.savvyReferralPct !== undefined) {
      Object.assign(data, calculatePaymentValues(String(input.data.grossCommissionIncome ?? current.grossCommissionIncome ?? ""), input.data.savvyReferralPct ?? current.savvyReferralPct));
    }
    if (input.data.dueAt !== undefined) data.dueAt = asDate(input.data.dueAt);
    if (input.data.invoicedAt !== undefined) data.invoicedAt = asDate(input.data.invoicedAt);
    if (input.data.paidAt !== undefined) data.paidAt = asDate(input.data.paidAt);
    if (input.data.paymentStatus === "paid") {
      data.paidAt = input.data.paidAt ? asDate(input.data.paidAt) : current.paidAt ?? new Date();
      data.markedPaidById = ctx.user.id;
    }
    await db.update(referralPayments).set(data as any).where(eq(referralPayments.id, input.id));
    await db.insert(referralEvents).values({ referralId: current.referralId, eventType: "payment", title: `Payment status updated to ${(input.data.paymentStatus ?? current.paymentStatus).replace(/_/g, " ")}`, occurredAt: new Date(), enteredById: ctx.user.id });
    return { success: true };
  }),

  convertToTransaction: protectedProcedure.input(z.object({
    referralId: z.number(), transactionType: z.enum(["buyer", "seller", "dual"]), propertyId: z.number().nullable().optional(), purchasePrice: z.string().or(z.number()).nullable().optional(), contractDate: z.string().nullable().optional(), closingDate: z.string().nullable().optional(), grossCommissionIncome: z.string().or(z.number()).nullable().optional(), commissionRate: z.string().or(z.number()).nullable().optional(), commissionType: z.enum(["percentage", "flat"]).default("percentage"), notes: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canEditReferrals");
    const { db, referral } = await getReferralOrThrow(input.referralId);
    const transactionNumber = `REF-${Date.now()}`;
    const txId = await createTransaction({
      transactionNumber,
      agentId: referral.relationshipOwnerId ?? ctx.user.id,
      primaryContactId: referral.contactId,
      sellerContactId: input.transactionType === "seller" || input.transactionType === "dual" ? referral.contactId : null,
      transactionType: input.transactionType,
      status: "under_contract",
      propertyId: input.propertyId ?? referral.propertyId ?? null,
      purchasePrice: amount(input.purchasePrice),
      contractDate: asDate(input.contractDate) ?? new Date(),
      closingDate: asDate(input.closingDate),
      grossCommissionIncome: amount(input.grossCommissionIncome),
      commissionRate: amount(input.commissionRate),
      commissionType: input.commissionType,
      notes: input.notes || referral.notes || null,
      referralId: referral.id,
      referralAgentId: referral.referralAgentId,
      isOutsideReferral: true,
      savvyReferralPct: referral.savvyReferralPct,
      referralMarket: referral.market,
    } as any);
    await db.insert(referralTransactionLinks).values({ referralId: referral.id, transactionId: txId }).onDuplicateKeyUpdate({ set: { transactionId: txId } });
    await syncReferralPaymentForTransaction(txId, ctx.user.id);
    await db.update(referrals).set({ statusKey: "under_contract", statusCategory: "active", underContractAt: new Date() }).where(eq(referrals.id, referral.id));
    await db.insert(referralEvents).values({ referralId: referral.id, eventType: "status_change", title: `Converted to transaction ${transactionNumber}`, previousStatusKey: referral.statusKey, newStatusKey: "under_contract", occurredAt: new Date(), enteredById: ctx.user.id });
    return { transactionId: txId, transactionNumber };
  }),

  convertToListing: protectedProcedure.input(z.object({
    referralId: z.number(), propertyId: z.number().nullable().optional(), listPrice: z.string().or(z.number()).nullable().optional(), listDate: z.string().nullable().optional(), expirationDate: z.string().nullable().optional(), mlsNumber: z.string().trim().max(64).nullable().optional(), notes: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canEditReferrals");
    const { db, referral } = await getReferralOrThrow(input.referralId);
    if (!["seller", "buyer_seller"].includes(referral.referralType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Only seller referrals can be converted to a listing" });
    const listingId = await createListing({
      agentId: referral.relationshipOwnerId ?? null,
      contactId: referral.contactId,
      propertyId: input.propertyId ?? referral.propertyId ?? null,
      listingStatus: "active",
      listPrice: amount(input.listPrice),
      listDate: input.listDate?.slice(0, 10) ?? null,
      expirationDate: input.expirationDate?.slice(0, 10) ?? null,
      mlsNumber: input.mlsNumber || null,
      notes: input.notes || referral.notes || null,
      referralId: referral.id,
      referralAgentId: referral.referralAgentId,
      isOutsideReferral: true,
      savvyReferralPct: referral.savvyReferralPct,
      referralMarket: referral.market,
    } as any);
    await db.insert(referralListingLinks).values({ referralId: referral.id, listingId }).onDuplicateKeyUpdate({ set: { listingId } });
    await db.update(referrals).set({ statusKey: "listing_signed", statusCategory: "active" }).where(eq(referrals.id, referral.id));
    await db.insert(referralEvents).values({ referralId: referral.id, eventType: "status_change", title: `Converted to outside referral listing #${listingId}`, previousStatusKey: referral.statusKey, newStatusKey: "listing_signed", occurredAt: new Date(), enteredById: ctx.user.id });
    return { listingId };
  }),

  reassign: protectedProcedure.input(z.object({
    referralId: z.number(), newReferralAgentId: z.number(), savvyReferralPct: z.string().or(z.number()).nullable().optional(), agreementId: z.number().nullable().optional(), reason: z.string().trim().min(3), notes: z.string().nullable().optional(), referralSentAt: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canEditReferrals");
    const { db, referral } = await getReferralOrThrow(input.referralId);
    if (referral.referralAgentId === input.newReferralAgentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select a different referral agent for reassignment" });
    const newAgentRows = await db.select().from(referralAgents).where(eq(referralAgents.id, input.newReferralAgentId)).limit(1);
    const newAgent = newAgentRows[0];
    if (!newAgent?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active referral agent" });
    const sentAt = asDate(input.referralSentAt) ?? new Date();
    const result = await db.insert(referrals).values({
      contactId: referral.contactId, referralAgentId: newAgent.id, relationshipOwnerId: newAgent.relationshipOwnerId ?? referral.relationshipOwnerId ?? ctx.user.id,
      propertyId: referral.propertyId, agreementId: input.agreementId ?? null, parentReferralId: referral.id, referralType: referral.referralType,
      statusKey: "referral_sent", statusCategory: "active", market: referral.market, metro: referral.metro, state: referral.state, areasServed: referral.areasServed, locationNotes: referral.locationNotes,
      savvyReferralPct: percentage(input.savvyReferralPct) ?? String(newAgent.defaultSavvyReferralPct ?? referral.savvyReferralPct), referralSentAt: sentAt, notes: input.notes || referral.notes, createdById: ctx.user.id,
    });
    const newReferralId = Number(result[0].insertId);
    await db.update(referrals).set({ statusKey: "lost", statusCategory: "lost", lostAt: sentAt, lostReason: "Reassigned to another referral agent", reassignmentReason: input.reason }).where(eq(referrals.id, referral.id));
    await db.insert(referralReassignments).values({ priorReferralId: referral.id, newReferralId, previousReferralAgentId: referral.referralAgentId, newReferralAgentId: newAgent.id, reason: input.reason, reassignedById: ctx.user.id, reassignedAt: sentAt });
    await db.insert(referralEvents).values([
      { referralId: referral.id, eventType: "reassignment", title: `Referral reassigned to ${newAgent.name}`, body: input.reason, previousStatusKey: referral.statusKey, newStatusKey: "lost", occurredAt: sentAt, enteredById: ctx.user.id },
      { referralId: newReferralId, eventType: "created", title: `Referral reassigned from prior referral #${referral.id}`, body: input.reason, newStatusKey: "referral_sent", occurredAt: sentAt, enteredById: ctx.user.id },
    ]);
    return { id: newReferralId };
  }),

  manageStatus: protectedProcedure.input(z.object({
    id: z.number().optional(), key: z.string().trim().min(2).max(96).regex(/^[a-z0-9_]+$/), name: z.string().trim().min(2).max(128), category: z.enum(["active", "closed", "lost", "on_hold"]), sortOrder: z.number().int().min(0).default(0), isActive: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canEditHistoricalReferrals");
    const db = await ensureStatusOptions();
    if (input.id) {
      await db.update(referralStatusOptions).set({ key: input.key, name: input.name, category: input.category, sortOrder: input.sortOrder, isActive: input.isActive }).where(eq(referralStatusOptions.id, input.id));
      return { id: input.id };
    }
    const result = await db.insert(referralStatusOptions).values({ key: input.key, name: input.name, category: input.category, sortOrder: input.sortOrder, isActive: input.isActive, isSystem: false });
    return { id: Number(result[0].insertId) };
  }),

  overview: protectedProcedure.input(z.object({ referredFrom: z.string().optional(), referredTo: z.string().optional(), referralAgentId: z.number().optional(), market: z.string().optional(), referralType: z.enum(REFERRAL_TYPES).optional() }).optional()).query(async ({ ctx, input }) => {
    await assertReferralAccess(ctx, "canViewReferrals");
    const rows = await getReferralRows(input ?? {});
    const now = Date.now();
    const active = rows.filter((row) => row.referral.statusCategory === "active" || row.referral.statusCategory === "on_hold");
    const closed = rows.filter((row) => row.referral.statusCategory === "closed");
    const lost = rows.filter((row) => row.referral.statusCategory === "lost");
    const closedVolume = closed.reduce((sum, row) => sum + row.transactions.filter((tx) => tx.transaction.status === "closed").reduce((inner, tx) => inner + money(tx.transaction.purchasePrice), 0), 0);
    const totalGci = closed.reduce((sum, row) => sum + row.transactions.filter((tx) => tx.transaction.status === "closed").reduce((inner, tx) => inner + money(tx.transaction.grossCommissionIncome), 0), 0);
    const totalOwed = rows.reduce((sum, row) => sum + row.payments.reduce((inner, payment) => inner + money(payment.referralFeeOwed), 0), 0);
    const totalPaid = rows.reduce((sum, row) => sum + row.payments.filter((payment) => payment.paymentStatus === "paid").reduce((inner, payment) => inner + money(payment.referralFeeOwed), 0), 0);
    const alerts = {
      awaitingAcceptance: active.filter((row) => row.referral.statusKey === "referral_sent" && daysSince(row.referral.referralSentAt)! >= 2),
      awaitingClientContact: active.filter((row) => row.referral.statusKey === "agent_accepted" && !row.referral.clientContactedAt && daysSince(row.referral.agentAcceptedAt ?? row.referral.referralSentAt)! >= 3),
      staleUpdates: active.filter((row) => row.daysSinceLastUpdate !== null && row.daysSinceLastUpdate >= 14),
      underContractMissingClosing: active.filter((row) => row.referral.statusKey === "under_contract" && row.transactions.some((tx) => tx.transaction.status === "under_contract" && (!tx.transaction.closingDate || new Date(tx.transaction.closingDate).getTime() < now))),
      paymentAttention: rows.filter((row) => ["due", "invoiced", "processing", "disputed"].includes(row.paymentStatus)),
    };
    return {
      metrics: {
        totalReferrals: rows.length, active: active.length, closed: closed.length, lost: lost.length,
        conversionRate: rows.length ? Number((closed.length / rows.length * 100).toFixed(1)) : 0,
        closedVolume, totalGci, totalOwed, totalPaid, outstandingRevenue: totalOwed - totalPaid,
      },
      alerts,
      recentActivity: [...rows].sort((a, b) => new Date(b.referral.updatedAt).getTime() - new Date(a.referral.updatedAt).getTime()).slice(0, 8),
    };
  }),
});
