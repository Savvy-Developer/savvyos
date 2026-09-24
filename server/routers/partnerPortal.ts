import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentConnections,
  contacts,
  leadSources,
  properties,
  transactionPayoutItems,
  transactions,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  createPartnerPortalMagicLink,
  getPartnerPortalEmailFromRequest,
  normalizePartnerPortalEmail,
  partnerPortalCookieOptions,
  PARTNER_PORTAL_COOKIE,
} from "../_core/partnerPortalAuth";
import { sendTransactionalEmail } from "../_core/resendEmail";
import { publicProcedure, router } from "../_core/trpc";
import {
  calculatePartnerSalesCycleDays,
  resolveExpectedReferralPayout,
} from "../partnerPortalMetrics";

const PARTNER_PORTAL_PARENT_NAMES = ["Referral Partner (Leads in)", "Affiliate Referral"] as const;
const REQUEST_LIMIT = 4;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const loginRequests = new Map<string, { count: number; startedAt: number }>();

function labelStatus(value: string | null | undefined) {
  return (value ?? "new_lead").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatLeadName(firstName: string | null, lastName: string | null) {
  const lastInitial = lastName?.trim().charAt(0);
  return [firstName?.trim(), lastInitial ? `${lastInitial}.` : null].filter(Boolean).join(" ") || "Lead";
}

function checkLoginRequestLimit(email: string) {
  const now = Date.now();
  const current = loginRequests.get(email);
  if (!current || now - current.startedAt >= REQUEST_WINDOW_MS) {
    loginRequests.set(email, { count: 1, startedAt: now });
    return true;
  }
  current.count += 1;
  return current.count <= REQUEST_LIMIT;
}

async function getConfiguredSources(email: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const parents = await db
    .select({ id: leadSources.id })
    .from(leadSources)
    .where(inArray(leadSources.name, [...PARTNER_PORTAL_PARENT_NAMES]));
  if (!parents.length) return [];
  const parentIds = parents.map((parent) => parent.id);

  return db
    .select({ id: leadSources.id, name: leadSources.name })
    .from(leadSources)
    .where(and(
      inArray(leadSources.parentId, parentIds),
      eq(leadSources.isActive, true),
      eq(leadSources.allowPartnerPortal, true),
      sql`LOWER(${leadSources.partnerPortalEmail}) = ${normalizePartnerPortalEmail(email)}`,
    ))
    .orderBy(leadSources.name);
}

async function requirePartnerEmail(req: Parameters<typeof getPartnerPortalEmailFromRequest>[0]) {
  const email = await getPartnerPortalEmailFromRequest(req);
  if (!email) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in to view the Partner Portal." });
  const sources = await getConfiguredSources(email);
  if (!sources.length) throw new TRPCError({ code: "FORBIDDEN", message: "Partner Portal access is not enabled for this email address." });
  return { email, sources };
}

export const partnerPortalRouter = router({
  /** Email-only entry point. The response never reveals whether this address has access. */
  requestLogin: publicProcedure
    .input(z.object({ email: z.string().trim().email() }))
    .mutation(async ({ input }) => {
      const email = normalizePartnerPortalEmail(input.email);
      if (!checkLoginRequestLimit(email)) return { success: true };

      const sources = await getConfiguredSources(email);
      if (!sources.length) return { success: true };

      const magicUrl = await createPartnerPortalMagicLink(email);
      await sendTransactionalEmail("partner_portal_access", {
        recipientEmail: email,
        recipientName: sources.length === 1 ? sources[0].name : "Savvy Partner",
        partnerName: sources.length === 1 ? sources[0].name : "Savvy Partner",
        partnerPortalUrl: magicUrl,
      }, {
        allowTemplateOverride: false,
        injectMagicLinks: false,
      }).catch((error) => console.error("[PartnerPortal] Login email delivery failed", error));

      return { success: true };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(PARTNER_PORTAL_COOKIE, { ...partnerPortalCookieOptions(ctx.req), maxAge: -1 });
    return { success: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    const { email, sources } = await requirePartnerEmail(ctx.req);
    return { email, sources };
  }),

  dashboard: publicProcedure.query(async ({ ctx }) => {
    const { sources } = await requirePartnerEmail(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

    const sourceIds = sources.map((source) => source.id);
    const leadRows = await db
      .select({
        contactId: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        createdAt: contacts.createdAt,
        isaStatus: contacts.isaStatus,
        sourceId: leadSources.id,
        sourceName: leadSources.name,
        sourceReferralPct: leadSources.referralPercent,
        connectionId: agentConnections.id,
        connectionStatus: agentConnections.pipelineStatus,
        agentName: users.name,
      })
      .from(contacts)
      .innerJoin(leadSources, eq(contacts.leadSourceId, leadSources.id))
      .leftJoin(agentConnections, eq(agentConnections.contactId, contacts.id))
      .leftJoin(users, eq(agentConnections.agentId, users.id))
      .where(and(inArray(contacts.leadSourceId, sourceIds), isNull(contacts.archivedAt)))
      .orderBy(desc(contacts.createdAt));

    const leadsById = new Map<number, {
      id: number;
      leadName: string;
      lastName: string;
      email: string | null;
      submittedAt: Date;
      status: string;
      sourceName: string;
      sourceReferralPct: number | null;
      connections: Array<{ agentName: string; status: string }>;
    }>();
    for (const row of leadRows) {
      const existing = leadsById.get(row.contactId);
      const lead = existing ?? {
        id: row.contactId,
        leadName: formatLeadName(row.firstName, row.lastName),
        lastName: row.lastName,
        email: row.email,
        submittedAt: row.createdAt,
        status: labelStatus(row.isaStatus),
        sourceName: row.sourceName,
        sourceReferralPct: row.sourceReferralPct,
        connections: [],
      };
      if (row.connectionId && row.agentName) {
        lead.connections.push({ agentName: row.agentName, status: labelStatus(row.connectionStatus) });
      }
      leadsById.set(row.contactId, lead);
    }
    const leads = Array.from(leadsById.values());
    const leadIds = leads.map((lead) => lead.id);

    const transactionRows = leadIds.length === 0 ? [] : await db
      .select({
        id: transactions.id,
        transactionNumber: transactions.transactionNumber,
        status: transactions.status,
        transactionType: transactions.transactionType,
        purchasePrice: transactions.purchasePrice,
        contractDate: transactions.contractDate,
        closingDate: transactions.closingDate,
        grossCommissionIncome: transactions.grossCommissionIncome,
        referralSourceName: transactions.referralSourceName,
        referralPayoutPct: transactions.referralPayoutPct,
        primaryContactId: transactions.primaryContactId,
        sellerContactId: transactions.sellerContactId,
        buyerContactId: transactions.buyerContactId,
        propertyAddress: properties.address,
        propertyCity: properties.city,
        propertyState: properties.state,
        agentName: users.name,
      })
      .from(transactions)
      .leftJoin(properties, eq(transactions.propertyId, properties.id))
      .leftJoin(users, eq(transactions.agentId, users.id))
      .where(or(
        inArray(transactions.primaryContactId, leadIds),
        inArray(transactions.sellerContactId, leadIds),
        inArray(transactions.buyerContactId, leadIds),
      ))
      .orderBy(desc(transactions.closingDate), desc(transactions.contractDate), desc(transactions.createdAt));

    const transactionIds = Array.from(new Set(transactionRows.map((transaction) => transaction.id)));
    const referralPayoutRows = transactionIds.length === 0 ? [] : await db
      .select({
        transactionId: transactionPayoutItems.transactionId,
        payeeName: transactionPayoutItems.payeeName,
        amount: transactionPayoutItems.amount,
        isOverride: transactionPayoutItems.isOverride,
        updatedAt: transactionPayoutItems.updatedAt,
      })
      .from(transactionPayoutItems)
      .where(and(
        inArray(transactionPayoutItems.transactionId, transactionIds),
        eq(transactionPayoutItems.payeeType, "referral_partner"),
      ))
      .orderBy(desc(transactionPayoutItems.isOverride), desc(transactionPayoutItems.updatedAt));

    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const referralPayoutsByTransactionId = new Map<number, typeof referralPayoutRows>();
    for (const payout of referralPayoutRows) {
      const entries = referralPayoutsByTransactionId.get(payout.transactionId) ?? [];
      entries.push(payout);
      referralPayoutsByTransactionId.set(payout.transactionId, entries);
    }

    const seenTransactions = new Set<number>();
    const transactionList = transactionRows
      .filter((transaction) => {
        if (seenTransactions.has(transaction.id)) return false;
        seenTransactions.add(transaction.id);
        return true;
      })
      .map((transaction) => {
        const leadId = [transaction.primaryContactId, transaction.sellerContactId, transaction.buyerContactId]
          .find((contactId) => contactId !== null && leadById.has(contactId));
        const lead = leadId ? leadById.get(leadId) : undefined;
        const address = [transaction.propertyAddress, transaction.propertyCity, transaction.propertyState]
          .filter(Boolean)
          .join(", ") || "Address pending";
        const sourceName = lead?.sourceName.trim().toLocaleLowerCase();
        const recordedPayoutAmount = sourceName
          ? referralPayoutsByTransactionId.get(transaction.id)?.find((payout) => {
              const payoutSourceName = payout.payeeName?.trim().toLocaleLowerCase();
              const transactionSourceName = transaction.referralSourceName?.trim().toLocaleLowerCase();
              return payoutSourceName === sourceName || transactionSourceName === sourceName;
            })?.amount
          : null;

        return {
          id: transaction.id,
          transactionNumber: transaction.transactionNumber,
          status: labelStatus(transaction.status),
          transactionType: labelStatus(transaction.transactionType),
          salesPrice: transaction.purchasePrice,
          grossCommissionIncome: transaction.grossCommissionIncome,
          expectedReferralPayout: resolveExpectedReferralPayout({
            recordedPayoutAmount,
            grossCommissionIncome: transaction.grossCommissionIncome,
            transactionReferralPayoutPct: transaction.referralPayoutPct,
            sourceReferralPct: lead?.sourceReferralPct,
          }),
          salesCycleDays: calculatePartnerSalesCycleDays({
            leadSubmittedAt: lead?.submittedAt,
            transactionStatus: transaction.status,
            closingDate: transaction.closingDate,
          }),
          underContractDate: transaction.contractDate,
          closingDate: transaction.closingDate,
          address,
          leadName: lead?.leadName ?? "Lead",
          clientLastName: lead?.lastName ?? "—",
          clientEmail: lead?.email ?? null,
          agentName: transaction.agentName ?? "Unassigned",
        };
      });

    return { sources, leads, transactions: transactionList };
  }),
});
