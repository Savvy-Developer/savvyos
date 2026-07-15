import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createPayoutItem,
  createTransaction,
  deletePayoutItem,
  getPayoutItems,
  getTransactionById,
  getTransactions,
  getTransactionDocuments,
  createTransactionDocument,
  deleteTransactionDocument,
  renameTransactionDocument,
  getTransactionNotes,
  createTransactionNote,
  logActivity,
  updatePayoutItem,
  updateTransaction,
  validatePayoutIntegrity,
  validateAndAutoResolveFlag,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmailAlert } from "../_core/emailAlerts";
import { generateAutoPayouts } from "../autoPayouts";
import { getDb } from "../db";
import { transactionPayoutItems, transactions, listings, contacts, properties, communications, activityLog, users, transactionNotes, transactionDocuments, commissionExceptions, groupMembers, groups } from "../../drizzle/schema";
import { eq, and, sql, desc, aliasedTable, or } from "drizzle-orm";

export const transactionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      status: z.string().optional(),
      transactionType: z.enum(["buyer","seller","dual"]).optional(),
      search: z.string().optional(),
      marketId: z.number().optional(),
      contractDateFrom: z.string().optional(),
      contractDateTo: z.string().optional(),
      closingDateFrom: z.string().optional(),
      closingDateTo: z.string().optional(),
      flagNoClosingDate: z.boolean().optional(),
      flagPastClosingDate: z.boolean().optional(),
      flagPayoutIntegrity: z.boolean().optional(),
      leadSourceId: z.number().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(25),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
      sortBy: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const agentId = ctx.user.role === "agent" ? ctx.user.id : input.agentId;
      return getTransactions(agentId, input.status, input.search, input.page, input.limit, input.marketId, input.contractDateFrom, input.contractDateTo, input.closingDateFrom, input.closingDateTo, input.flagNoClosingDate, input.flagPastClosingDate, input.leadSourceId, input.flagPayoutIntegrity, input.transactionType, input.sortOrder, input.sortBy ?? "closing_date");
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const tx = await getTransactionById(input.id);
      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });
      return tx;
    }),

  create: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(), // admin can specify; agents/ISAs default to self
      primaryContactId: z.number(),
      propertyId: z.number({ error: "A property is required" }),
      listingId: z.number().optional().nullable(),
      sellerContactId: z.number().optional().nullable(),
      transactionType: z.enum(["buyer","seller","dual"]),
      purchasePrice: z.string().optional().nullable(),
      contractDate: z.string().optional().nullable(),
      closingDate: z.string().optional().nullable(),
      grossCommissionIncome: z.string().optional().nullable(),
      commissionRate: z.string().optional().nullable(),
      commissionType: z.enum(["percentage","flat"]).optional(),
      notes: z.string().optional().nullable(),
      referralSourceName: z.string().optional().nullable(),
      referralPayoutPct: z.number().min(0).max(100).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Non-admins always create transactions for themselves
      const agentId = ctx.user.role === "admin" && input.agentId ? input.agentId : ctx.user.id;
      const txNumber = `TXN-${Date.now()}`;
      const id = await createTransaction({
        ...input,
        agentId,
        transactionNumber: txNumber,
        contractDate: input.contractDate ? new Date(input.contractDate) : null,
        closingDate: input.closingDate ? new Date(input.closingDate) : null,
      } as any);

      // Enrich activity log with names of all involved parties
      let txContactName = "Unknown Contact";
      let txAgentName = "Unknown Agent";
      let txPropertyAddress = "Unknown Property";
      try {
        const dbEnrich = await getDb();
        if (dbEnrich) {
          const [cRow] = await dbEnrich.select({ firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.id, input.primaryContactId)).limit(1);
          if (cRow) txContactName = `${cRow.firstName ?? ""} ${cRow.lastName ?? ""}`.trim() || "Unknown Contact";
          const [aRow] = await dbEnrich.select({ name: users.name }).from(users).where(eq(users.id, agentId)).limit(1);
          if (aRow) txAgentName = aRow.name ?? "Unknown Agent";
          if (input.propertyId) {
            const { properties: propertiesTable } = await import("../../drizzle/schema");
            const [pRow] = await dbEnrich.select({ address: propertiesTable.address, city: propertiesTable.city, state: propertiesTable.state }).from(propertiesTable).where(eq(propertiesTable.id, input.propertyId)).limit(1);
            if (pRow) txPropertyAddress = [pRow.address, pRow.city, pRow.state].filter(Boolean).join(", ") || "Unknown Property";
          }
        }
      } catch (_) {}
      await logActivity({
        userId: ctx.user.id,
        action: "transaction_created",
        entityType: "transaction",
        entityId: id,
        details: {
          txNumber,
          actorName: ctx.user.name ?? "Unknown",
          actorRole: ctx.user.role,
          agentName: txAgentName,
          contactName: txContactName,
          propertyAddress: txPropertyAddress,
        },
      });
      // Auto-generate commission payout items if GCI is set
      let autoPayoutResult: { skipped: boolean; skipReason?: string; result?: any } = { skipped: true };
      if (input.grossCommissionIncome) {
        const gci = parseFloat(input.grossCommissionIncome);
        if (gci > 0) {
          try {
            autoPayoutResult = await generateAutoPayouts({
              transactionId: id,
              agentId,
              primaryContactId: input.primaryContactId,
              gci,
              referralSourceName: input.referralSourceName,
              referralPayoutPct: input.referralPayoutPct,
            });
            if (!autoPayoutResult.skipped && autoPayoutResult.result) {
              const payoutSummary = autoPayoutResult.result.payouts.map((p: any) => ({
                payee: p.payeeType === "agent" ? "Agent" : p.payeeType === "savvy_str_agents" ? "Savvy STR Agents" : p.payeeType === "group_leader" ? "Group Leader" : "Referral Partner",
                percentage: p.percentage,
                amount: p.amount.toFixed(2),
              }));
              await logActivity({
                userId: ctx.user.id,
                action: "payouts_auto_generated",
                entityType: "transaction",
                entityId: id,
                details: { txNumber, gci, payouts: payoutSummary },
              });
            }
          } catch (e) {
            // Don't fail the transaction creation if auto-payouts fail
            console.error("Auto-payout generation failed:", e);
          }
        }
      }

      // Notify agent of new transaction
      await sendEmailAlert("transaction_created", agentId, {
        transactionNumber: txNumber,
        transactionType: input.transactionType,
      }).catch(() => {});
      return { id, transactionNumber: txNumber, autoPayouts: autoPayoutResult };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        status: z.enum(["under_contract","closed","terminated"]).optional(),
        transactionType: z.enum(["buyer","seller","dual"]).optional(),
        agentId: z.number().optional(),
        primaryContactId: z.number().optional(),
        sellerContactId: z.number().optional().nullable(),
        transactionNumber: z.string().optional().nullable(),
        purchasePrice: z.string().optional().nullable(),
        contractDate: z.string().optional().nullable(),
        closingDate: z.string().optional().nullable(),
        grossCommissionIncome: z.string().optional().nullable(),
        commissionRate: z.string().optional().nullable(),
        commissionType: z.enum(["percentage","flat"]).optional(),
        propertyId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
        terminationReason: z.string().optional().nullable(),
        // Buyer-side fields (editable post-conversion)
        buyerContactId: z.number().optional().nullable(),
        buyerCommissionRate: z.string().optional().nullable(),
        buyerCommissionType: z.enum(["percentage", "flat"]).optional().nullable(),
        buyerNotes: z.string().optional().nullable(),
        // Referral payout fields
        referralSourceName: z.string().optional().nullable(),
        referralPayoutPct: z.number().min(0).max(100).optional().nullable(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      // Fetch BEFORE state for diff logging
      const txBefore = await getTransactionById(input.id);
      const before = txBefore?.transaction;

      const { contractDate, closingDate, terminationReason, ...rest } = input.data;
      const updateData: Record<string, any> = { ...rest };
      if (terminationReason !== undefined) updateData.terminationReason = terminationReason;
      if (contractDate !== undefined) updateData.contractDate = contractDate ? new Date(contractDate) : null;
      if (closingDate !== undefined) updateData.closingDate = closingDate ? new Date(closingDate) : null;
      await updateTransaction(input.id, updateData as any);

      // Fetch transaction for context (used in emails and logging)
      const txForEmail = await getTransactionById(input.id);
      const txContext = txForEmail ? {
        transactionNumber: txForEmail.transaction.transactionNumber,
        contactName: txForEmail.contact ? `${txForEmail.contact.firstName} ${txForEmail.contact.lastName}`.trim() : undefined,
        amount: txForEmail.transaction.purchasePrice ? `$${Number(txForEmail.transaction.purchasePrice).toLocaleString()}` : undefined,
      } : {};

      // Automation: transaction closed → check payout integrity
      if (input.data.status === "closed" && txForEmail) {
        // Check if payout items exist first
        const payouts = await getPayoutItems(input.id);
        if (payouts.length === 0) {
          await updateTransaction(input.id, {
            payoutIntegrityFlag: true,
            payoutIntegrityNote: "Transaction closed without any payout items",
          });
        } else {
          // Payouts exist — run full integrity + split adherence check and auto-resolve if valid
          const { resolved, total } = await validateAndAutoResolveFlag(input.id);
          if (!resolved) {
            try {
              await sendEmailAlert("payout_integrity_fail", txForEmail.transaction.agentId, txContext);
            } catch (_) {}
          }
        }

        try {
          await sendEmailAlert("transaction_closed", txForEmail.transaction.agentId, txContext);
        } catch (_) {}
      }

      // Auto-resolve: if this transaction already has a payoutIntegrityFlag set and is closed,
      // any field update (GCI change, payout addition via update, etc.) should re-check and
      // clear the flag if conditions are now met.
      if (!input.data.status || input.data.status !== "closed") {
        // For non-status updates on existing closed transactions, also try to auto-resolve
        const currentTx = txForEmail ?? await getTransactionById(input.id);
        if (currentTx?.transaction.status === "closed" && currentTx.transaction.payoutIntegrityFlag) {
          await validateAndAutoResolveFlag(input.id);
        }
      }

      // Build diff of changed fields for history
      const fieldLabels: Record<string, string> = {
        status: "Status",
        purchasePrice: "Purchase Price",
        grossCommissionIncome: "GCI",
        commissionRate: "Commission Rate",
        commissionType: "Commission Type",
        contractDate: "Contract Date",
        closingDate: "Closing Date",
        notes: "Notes",
      };
      const changes: Array<{ field: string; from: string | null; to: string | null }> = [];
      if (before) {
        const statusLabels: Record<string, string> = { under_contract: "Under Contract", closed: "Closed", terminated: "Terminated" };
        if (input.data.status && input.data.status !== before.status) {
          changes.push({ field: "Status", from: statusLabels[before.status ?? ""] ?? before.status, to: statusLabels[input.data.status] ?? input.data.status });
        }
        if (input.data.purchasePrice !== undefined && input.data.purchasePrice !== before.purchasePrice) {
          const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : null;
          changes.push({ field: "Purchase Price", from: fmt(before.purchasePrice), to: fmt(input.data.purchasePrice) });
        }
        if (input.data.grossCommissionIncome !== undefined && input.data.grossCommissionIncome !== before.grossCommissionIncome) {
          const fmt = (v: string | null) => v ? `$${Number(v).toLocaleString()}` : null;
          changes.push({ field: "GCI", from: fmt(before.grossCommissionIncome), to: fmt(input.data.grossCommissionIncome) });
        }
        if (input.data.commissionRate !== undefined && input.data.commissionRate !== before.commissionRate) {
          changes.push({ field: "Commission Rate", from: before.commissionRate, to: input.data.commissionRate });
        }
        if (input.data.commissionType !== undefined && input.data.commissionType !== before.commissionType) {
          changes.push({ field: "Commission Type", from: before.commissionType, to: input.data.commissionType });
        }
        if (contractDate !== undefined) {
          const newDate = contractDate ? new Date(contractDate).toLocaleDateString() : null;
          const oldDate = before.contractDate ? new Date(before.contractDate).toLocaleDateString() : null;
          if (newDate !== oldDate) changes.push({ field: "Contract Date", from: oldDate, to: newDate });
        }
        if (closingDate !== undefined) {
          const newDate = closingDate ? new Date(closingDate).toLocaleDateString() : null;
          const oldDate = before.closingDate ? new Date(before.closingDate).toLocaleDateString() : null;
          if (newDate !== oldDate) changes.push({ field: "Closing Date", from: oldDate, to: newDate });
        }
        if (input.data.notes !== undefined && input.data.notes !== before.notes) {
          changes.push({ field: "Notes", from: before.notes ? "(had notes)" : null, to: input.data.notes ? "(updated)" : null });
        }
        if (input.data.transactionType !== undefined && input.data.transactionType !== before.transactionType) {
          const typeLabels: Record<string, string> = { buyer: "Buyer", seller: "Seller", dual: "Dual" };
          changes.push({ field: "Transaction Type", from: typeLabels[before.transactionType ?? ""] ?? before.transactionType, to: typeLabels[input.data.transactionType] ?? input.data.transactionType });
        }
        if (input.data.transactionNumber !== undefined && input.data.transactionNumber !== before.transactionNumber) {
          changes.push({ field: "Transaction Number", from: before.transactionNumber ?? null, to: input.data.transactionNumber ?? null });
        }
        if (input.data.terminationReason !== undefined && input.data.terminationReason !== before.terminationReason) {
          changes.push({ field: "Termination Reason", from: before.terminationReason ?? null, to: input.data.terminationReason ?? null });
        }
      }
      await logActivity({
        userId: ctx.user.id,
        action: "transaction_updated",
        entityType: "transaction",
        entityId: input.id,
        details: {
          actorName: ctx.user.name ?? "Unknown",
          actorRole: ctx.user.role,
          agentName: txForEmail?.agent ? (txForEmail.agent as any).name ?? "Unknown Agent" : "Unknown Agent",
          contactName: txForEmail?.contact ? `${txForEmail.contact.firstName ?? ""} ${txForEmail.contact.lastName ?? ""}`.trim() : "Unknown Contact",
          txNumber: txForEmail?.transaction.transactionNumber,
          ...(changes.length > 0 ? { changes } : { note: "No tracked fields changed" }),
        },
      });

      // Notify on status change (non-closed statuses)
      if (input.data.status && input.data.status !== "closed" && txForEmail) {
        const statusLabel: Record<string, string> = {
          active: "Active",
          under_contract: "Under Contract",
          terminated: "Terminated",
        };
        try {
          await sendEmailAlert("transaction_status_changed", txForEmail.transaction.agentId, {
            ...txContext,
            status: statusLabel[input.data.status] ?? input.data.status,
          });
        } catch (_) {}
      }

      return { success: true };
    }),

  // ─── Payout Items ─────────────────────────────────────────────────────────
  getPayouts: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ input }) => {
      const items = await getPayoutItems(input.transactionId);
      const { valid, total } = await validatePayoutIntegrity(input.transactionId);
      return { items, valid, total };
    }),

  addPayout: protectedProcedure
    .input(z.object({
      transactionId: z.number(),
      payeeType: z.enum(["agent","savvy_str_agents","exp","group_leader","isa_bonus","other"]),
      payeeUserId: z.number().optional().nullable(),
      payeeReferralPartnerId: z.number().optional().nullable(),
      payeeName: z.string().optional().nullable(),
      percentage: z.string(),
      commissionType: z.enum(["percentage","flat"]).optional(),
      amount: z.string().optional().nullable(),
      isPaid: z.boolean().optional(),
      paidDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createPayoutItem({
        ...input,
        paidDate: input.paidDate ? new Date(input.paidDate) : null,
      } as any);

      // Re-validate integrity and auto-resolve flag if conditions are met
      const { resolved, total } = await validateAndAutoResolveFlag(input.transactionId);
      const valid = resolved || total <= 100;

      // Notify agent of commission calculation
      const tx = await getTransactionById(input.transactionId);
      if (tx && input.payeeUserId) {
        try {
          await sendEmailAlert("commission_calculated", input.payeeUserId);
        } catch (_) {}
      }

      await logActivity({
        userId: ctx.user.id,
        action: "payout_item_added",
        entityType: "transaction",
        entityId: input.transactionId,
        details: { payeeType: input.payeeType, percentage: input.percentage },
      });
      return { id, valid, total };
    }),

  updatePayout: protectedProcedure
    .input(z.object({
      id: z.number(),
      transactionId: z.number(),
      data: z.object({
        percentage: z.string().optional(),
        amount: z.string().optional().nullable(),
        isPaid: z.boolean().optional(),
        paidDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can edit payout items." });
      // Fetch old payout values for history logging
      const db = await getDb();
      let oldPayout: any = null;
      if (db) {
        const [old] = await db.select().from(transactionPayoutItems).where(eq(transactionPayoutItems.id, input.id));
        oldPayout = old;
      }
      // Block edits on paid payout items (only allow marking as unpaid)
      if (oldPayout?.isPaid) {
        const keys = Object.keys(input.data).filter(k => input.data[k as keyof typeof input.data] !== undefined);
        const isOnlyMarkingUnpaid = keys.length === 1 && input.data.isPaid === false;
        if (!isOnlyMarkingUnpaid) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Paid payout items cannot be edited. Mark as unpaid first to make changes." });
        }
      }
      const { paidDate, ...rest } = input.data;
      await updatePayoutItem(input.id, {
        ...rest,
        paidDate: paidDate ? new Date(paidDate) : null,
      } as any);
      // Log payout edit in transaction history
      const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
      if (oldPayout) {
        if (input.data.percentage !== undefined && input.data.percentage !== oldPayout.percentage) {
          changes.push({ field: "Percentage", from: `${oldPayout.percentage}%`, to: `${input.data.percentage}%` });
        }
        if (input.data.amount !== undefined && input.data.amount !== oldPayout.amount) {
          changes.push({ field: "Amount", from: `$${oldPayout.amount ?? 0}`, to: `$${input.data.amount ?? 0}` });
        }
        if (input.data.isPaid !== undefined && input.data.isPaid !== oldPayout.isPaid) {
          changes.push({ field: "Paid Status", from: oldPayout.isPaid ? "Paid" : "Unpaid", to: input.data.isPaid ? "Paid" : "Unpaid" });
        }
        if (input.data.notes !== undefined && input.data.notes !== oldPayout.notes) {
          changes.push({ field: "Notes", from: oldPayout.notes ?? "(none)", to: input.data.notes ?? "(none)" });
        }
      }
      if (changes.length > 0) {
        await logActivity({
          userId: ctx.user.id,
          action: "payout_edited",
          entityType: "transaction",
          entityId: input.transactionId,
          details: {
            payoutId: input.id,
            payee: oldPayout?.payeeName ?? "Unknown",
            payeeType: oldPayout?.payeeType ?? "unknown",
            changes,
          },
        });
      }
      const { resolved, total } = await validateAndAutoResolveFlag(input.transactionId);
      const valid = resolved || total <= 100;
      return { success: true, valid, total };
    }),

  deletePayout: protectedProcedure
    .input(z.object({ id: z.number(), transactionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      // Block deletion of paid payout items
      const db = await getDb();
      if (db) {
        const [payout] = await db.select().from(transactionPayoutItems).where(eq(transactionPayoutItems.id, input.id));
        if (payout?.isPaid) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Paid payout items cannot be deleted." });
        }
      }
      await deletePayoutItem(input.id);
      const { resolved, total } = await validateAndAutoResolveFlag(input.transactionId);
      const valid = resolved || total <= 100;
      return { success: true, valid, total };
    }),

  // ─── Transaction Documents ───────────────────────────────────────────────
  getDocuments: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ input }) => {
      return getTransactionDocuments(input.transactionId);
    }),

  uploadDocument: protectedProcedure
    .input(z.object({
      transactionId: z.number(),
      fileName: z.string(),
      fileUrl: z.string().url(),
      fileKey: z.string(),
      mimeType: z.string().optional().nullable(),
      fileSize: z.number().optional().nullable(),
      label: z.enum(["appraisal", "closing_disclosure", "home_inspection", "other"]),
      customLabel: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createTransactionDocument({
        transactionId: input.transactionId,
        uploadedBy: ctx.user.id,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        mimeType: input.mimeType ?? null,
        fileSize: input.fileSize ?? null,
        label: input.label,
        customLabel: input.customLabel ?? null,
      });
      await logActivity({
        userId: ctx.user.id,
        action: "document_uploaded",
        entityType: "transaction",
        entityId: input.transactionId,
        details: { fileName: input.fileName, label: input.label },
      });
      return { id };
    }),

  renameDocument: protectedProcedure
    .input(z.object({ id: z.number(), fileName: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await renameTransactionDocument(input.id, input.fileName);
      return { success: true };
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await deleteTransactionDocument(input.id);
      return { success: true };
    }),

  // ─── Bulk Document Upload ─────────────────────────────────────────────────
  bulkUploadDocuments: protectedProcedure
    .input(z.object({
      transactionId: z.number(),
      files: z.array(z.object({
        fileName: z.string(),
        fileUrl: z.string().url(),
        fileKey: z.string(),
        mimeType: z.string().optional().nullable(),
        fileSize: z.number().optional().nullable(),
        label: z.enum(["appraisal", "closing_disclosure", "home_inspection", "other"]),
        customLabel: z.string().optional().nullable(),
      })).min(1).max(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const inserted: number[] = [];
      for (const file of input.files) {
        const id = await createTransactionDocument({
          transactionId: input.transactionId,
          uploadedBy: ctx.user.id,
          fileName: file.fileName,
          fileUrl: file.fileUrl,
          fileKey: file.fileKey,
          mimeType: file.mimeType ?? null,
          fileSize: file.fileSize ?? null,
          label: file.label,
          customLabel: file.customLabel ?? null,
        });
        inserted.push(id);
      }
      await logActivity({
        userId: ctx.user.id,
        action: "documents_bulk_uploaded",
        entityType: "transaction",
        entityId: input.transactionId,
        details: {
          actorName: ctx.user.name ?? "Unknown",
          actorRole: ctx.user.role,
          count: input.files.length,
          fileNames: input.files.map(f => f.fileName),
        },
      });
      return { inserted, count: inserted.length };
    }),

  // ─── Transaction Notes ────────────────────────────────────────────────────
  getNotes: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ input }) => {
      return getTransactionNotes(input.transactionId);
    }),

  addNote: protectedProcedure
    .input(z.object({
      transactionId: z.number(),
      content: z.string().min(1, "Note cannot be empty"),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createTransactionNote({
        transactionId: input.transactionId,
        authorId: ctx.user.id,
        content: input.content,
      });
      await logActivity({
        userId: ctx.user.id,
        action: "note_added",
        entityType: "transaction",
        entityId: input.transactionId,
        details: { noteId: id },
      });
      return { id };
    }),

  // Admin: count of flagged transactions (payout integrity issues) for nav badge
  flaggedCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") return { count: 0 };
      const db = await getDb();
      if (!db) return { count: 0 };
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(and(
          eq(transactions.payoutIntegrityFlag, true),
        ));
      return { count: Number(row?.count ?? 0) };
    }),

  // Admin: count of unpaid payout items for nav badge
  unpaidPayoutsCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") return { count: 0 };
      const db = await getDb();
      if (!db) return { count: 0 };
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(transactionPayoutItems)
        .where(eq(transactionPayoutItems.isPaid, false));
      return { count: Number(row?.count ?? 0) };
    }),

  getHistory: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [] };

      // Fetch the transaction itself
      const txAgent = aliasedTable(users, "txAgent");
      const txContact = aliasedTable(contacts, "txContact");
      const txSeller = aliasedTable(contacts, "txSeller");
      const txProp = aliasedTable(properties, "txProp");
      const [txRow] = await db
        .select({ tx: transactions, agent: txAgent, contact: txContact, seller: txSeller, property: txProp })
        .from(transactions)
        .leftJoin(txAgent, eq(transactions.agentId, txAgent.id))
        .leftJoin(txContact, eq(transactions.primaryContactId, txContact.id))
        .leftJoin(txSeller, eq(transactions.sellerContactId, txSeller.id))
        .leftJoin(txProp, eq(transactions.propertyId, txProp.id))
        .where(eq(transactions.id, input.transactionId))
        .limit(1);

      if (!txRow) return { events: [] };

      // Fetch linked listing (if this transaction was converted from a listing)
      let linkedListing: typeof listings.$inferSelect | null = null;
      if (txRow.tx.listingId) {
        const lAgent = aliasedTable(users, "lAgent");
        const [lRow] = await db
          .select({ listing: listings, agent: lAgent })
          .from(listings)
          .leftJoin(lAgent, eq(listings.agentId, lAgent.id))
          .where(eq(listings.id, txRow.tx.listingId))
          .limit(1);
        if (lRow) linkedListing = lRow.listing;
      }

      // Fetch communications linked to this transaction
      const commRows = await db
        .select({ comm: communications, author: users })
        .from(communications)
        .leftJoin(users, eq(communications.authorId, users.id))
        .where(eq(communications.relatedTransactionId, input.transactionId))
        .orderBy(desc(communications.communicatedAt))
        .limit(50);

      // Fetch transaction notes
      const noteRows = await db
        .select({ note: transactionNotes, author: users })
        .from(transactionNotes)
        .leftJoin(users, eq(transactionNotes.authorId, users.id))
        .where(eq(transactionNotes.transactionId, input.transactionId))
        .orderBy(desc(transactionNotes.createdAt))
        .limit(50);

      // Fetch activity log for this transaction
      const actRows = await db
        .select({ log: activityLog, user: users })
        .from(activityLog)
        .leftJoin(users, eq(activityLog.userId, users.id))
        .where(and(eq(activityLog.entityType, "transaction"), eq(activityLog.entityId, input.transactionId)))
        .orderBy(desc(activityLog.createdAt))
        .limit(50);

      type HistoryEvent = {
        id: string;
        type: "transaction_opened" | "listing_converted" | "status_change" | "communication" | "note" | "activity";
        date: Date | null;
        title: string;
        subtitle: string;
        outcome?: string;
        outcomeColor?: string;
        contactId?: number;
        listingId?: number;
        propertyId?: number;
        meta?: Record<string, string | number | null>;
      };

      const events: HistoryEvent[] = [];

      // Transaction opened event
      const tx = txRow.tx;
      const agentName = (txRow.agent as any)?.name ?? "Unknown agent";
      const contactName = txRow.contact ? `${(txRow.contact as any).firstName ?? ""} ${(txRow.contact as any).lastName ?? ""}`.trim() : "Unknown contact";
      const sellerName = txRow.seller ? `${(txRow.seller as any).firstName ?? ""} ${(txRow.seller as any).lastName ?? ""}`.trim() : null;
      events.push({
        id: `tx-opened-${tx.id}`,
        type: "transaction_opened",
        date: tx.contractDate ?? tx.createdAt,
        title: `Transaction opened — ${(tx.transactionType ?? "").replace(/_/g, " ")}`,
        subtitle: `Agent: ${agentName} · ${contactName}${sellerName ? ` / ${sellerName}` : ""}`,
        contactId: tx.primaryContactId,
        propertyId: tx.propertyId ?? undefined,
        meta: {
          purchasePrice: tx.purchasePrice ? `$${Number(tx.purchasePrice).toLocaleString()}` : null,
          contractDate: tx.contractDate ? new Date(tx.contractDate).toLocaleDateString() : null,
          transactionNumber: tx.transactionNumber ?? null,
        },
      });

      // Listing converted event (with visual connector)
      if (linkedListing) {
        const l = linkedListing;
        events.push({
          id: `listing-converted-${l.id}`,
          type: "listing_converted",
          date: l.listDate ?? l.createdAt,
          title: `Converted from Listing${l.mlsNumber ? ` · MLS ${l.mlsNumber}` : ""}`,
          subtitle: `List price: ${l.listPrice ? `$${Number(l.listPrice).toLocaleString()}` : "N/A"} · Listed ${l.listDate ? new Date(l.listDate).toLocaleDateString() : "N/A"}`,
          listingId: l.id,
          outcome: "Converted to Transaction",
          outcomeColor: "green",
          meta: {
            listPrice: l.listPrice ? `$${Number(l.listPrice).toLocaleString()}` : null,
            listDate: l.listDate ? new Date(l.listDate).toLocaleDateString() : null,
            expirationDate: l.expirationDate ? new Date(l.expirationDate).toLocaleDateString() : null,
          },
        });
      }

      // Status change events (closed / terminated)
      if (tx.status === "closed" && tx.closingDate) {
        events.push({
          id: `tx-closed-${tx.id}`,
          type: "status_change",
          date: tx.closingDate,
          title: "Transaction closed",
          subtitle: `GCI: ${tx.grossCommissionIncome ? `$${Number(tx.grossCommissionIncome).toLocaleString()}` : "N/A"} · Price: ${tx.purchasePrice ? `$${Number(tx.purchasePrice).toLocaleString()}` : "N/A"}`,
          outcome: "Closed",
          outcomeColor: "green",
          meta: {
            closingDate: new Date(tx.closingDate).toLocaleDateString(),
            gci: tx.grossCommissionIncome ? `$${Number(tx.grossCommissionIncome).toLocaleString()}` : null,
            purchasePrice: tx.purchasePrice ? `$${Number(tx.purchasePrice).toLocaleString()}` : null,
          },
        });
      } else if (tx.status === "terminated") {
        events.push({
          id: `tx-terminated-${tx.id}`,
          type: "status_change",
          date: tx.updatedAt,
          title: "Transaction terminated",
          subtitle: tx.terminationReason ?? "",
          outcome: "Terminated",
          outcomeColor: "red",
          meta: { terminationReason: tx.terminationReason ?? null },
        });
      }

      // Communication events
      const COMM_TYPE_LABELS: Record<string, string> = { note: "Note", call: "Call", email: "Email", sms: "SMS", meeting: "Meeting", voice_note: "Voice Note" };
      for (const r of commRows) {
        const c = r.comm;
        events.push({
          id: `comm-${c.id}`,
          type: "communication",
          date: c.communicatedAt,
          title: `${COMM_TYPE_LABELS[c.type] ?? c.type}${c.subject ? `: ${c.subject}` : ""}`,
          subtitle: (r.author as any)?.name ? `By ${(r.author as any).name}` : "",
          meta: { body: c.body ? c.body.slice(0, 120) + (c.body.length > 120 ? "…" : "") : null },
        });
      }

      // Transaction notes
      for (const r of noteRows) {
        events.push({
          id: `note-${r.note.id}`,
          type: "note",
          date: r.note.createdAt,
          title: `Note added`,
          subtitle: (r.author as any)?.name ? `By ${(r.author as any).name}` : "",
          meta: { body: r.note.content ? r.note.content.slice(0, 120) + (r.note.content.length > 120 ? "…" : "") : null },
        });
      }

      // Activity log events
      const ACTION_LABELS: Record<string, string> = {
        transaction_created: "Transaction created",
        transaction_updated: "Transaction details updated",
        transaction_closed: "Transaction closed",
        transaction_terminated: "Transaction terminated",
      };
      for (const r of actRows) {
        events.push({
          id: `activity-${r.log.id}`,
          type: "activity",
          date: r.log.createdAt,
          title: ACTION_LABELS[r.log.action] ?? r.log.action.replace(/_/g, " "),
          subtitle: (r.user as any)?.name ? `By ${(r.user as any).name}` : "",
        });
      }

       // Sort newest first
      events.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db2 = b.date ? new Date(b.date).getTime() : 0;
        return db2 - da;
      });
      return { events };
    }),

  recalculateSplits: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can recalculate splits." });
      }
      const tx = await getTransactionById(input.id);
      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Delete ALL auto-generated payout items (including referral/lead source rows).
      // Override rows (isOverride=true) are preserved so manual admin adjustments survive recalc.
      await db
        .delete(transactionPayoutItems)
        .where(
          and(
            eq(transactionPayoutItems.transactionId, input.id),
            eq(transactionPayoutItems.isAutoGenerated, true)
          )
        );

      const agentId = tx.transaction.agentId;
      const primaryContactId = tx.transaction.primaryContactId;
      const gci = tx.transaction.grossCommissionIncome
        ? parseFloat(String(tx.transaction.grossCommissionIncome))
        : 0;

      if (!agentId || !primaryContactId || !gci) {
        return { success: true, skipped: true, skipReason: "Missing agentId, contactId, or GCI" };
      }

      const result = await generateAutoPayouts({
        transactionId: input.id,
        agentId,
        primaryContactId,
        gci,
        referralSourceName: tx.transaction.referralSourceName ?? null,
        referralPayoutPct: tx.transaction.referralPayoutPct
          ? parseFloat(String(tx.transaction.referralPayoutPct))
          : null,
      });

      // Auto-resolve integrity flag after recalculation
      const { resolved: flagResolved } = await validateAndAutoResolveFlag(input.id);

      await logActivity({
        userId: ctx.user.id,
        action: "splits_recalculated",
        entityType: "transaction",
        entityId: input.id,
        details: { note: result.skipped
          ? `Commission splits recalculation skipped: ${(result as any).skipReason}`
          : `Commission splits recalculated by admin${flagResolved ? " — integrity flag cleared" : ""}` },
      });

      return { success: true, flagResolved, ...result };
    }),

  updatePayoutOverride: protectedProcedure
    .input(z.object({
      payoutItemId: z.number(),
      percentage: z.number().min(0).max(100).optional(),
      amount: z.number().min(0).optional(),
      overrideNote: z.string().optional(),
      isOverride: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can override splits." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const updateData: Record<string, unknown> = {
        isOverride: input.isOverride,
        overrideNote: input.overrideNote ?? null,
      };
      if (input.percentage !== undefined) updateData.percentage = String(input.percentage);
      if (input.amount !== undefined) updateData.amount = String(input.amount.toFixed(2));

      await db
        .update(transactionPayoutItems)
        .set(updateData as any)
        .where(eq(transactionPayoutItems.id, input.payoutItemId));

      // Fetch transaction id for activity log
      const [item] = await db
        .select({ transactionId: transactionPayoutItems.transactionId })
        .from(transactionPayoutItems)
        .where(eq(transactionPayoutItems.id, input.payoutItemId));

      if (item) {
        // Auto-resolve integrity flag after override change
        const { resolved: flagResolved } = await validateAndAutoResolveFlag(item.transactionId);

        await logActivity({
          userId: ctx.user.id,
          action: input.isOverride ? "payout_override_set" : "payout_override_cleared",
          entityType: "transaction",
          entityId: item.transactionId,
          details: { note: input.isOverride
            ? `Payout item #${input.payoutItemId} manually overridden by admin${input.overrideNote ? `: ${input.overrideNote}` : ""}`
            : `Payout item #${input.payoutItemId} override cleared by admin${flagResolved ? " — integrity flag cleared" : ""}` },
        });

        return { success: true, flagResolved };
      }

      return { success: true, flagResolved: false };
    }),

  bulkUpload: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        rowIndex: z.number(),
        transactionNumber: z.string().optional(),
        transactionType: z.string(),
        status: z.string(),
        agentEmail: z.string(),
        primaryContactFirstName: z.string(),
        primaryContactLastName: z.string(),
        primaryContactEmail: z.string().optional(),
        primaryContactPhone: z.string().optional(),
        propertyAddress: z.string().optional(),
        propertyCity: z.string().optional(),
        propertyState: z.string().optional(),
        propertyZip: z.string().optional(),
        purchasePrice: z.string().optional(),
        commissionRatePct: z.string().optional(),
        gci: z.string().optional(),
        agentSplitPct: z.string().optional(),
        groupLeaderSplitPct: z.string().optional(),
        referralSourceName: z.string().optional(),
        referralPayoutPct: z.string().optional(),
        contractDate: z.string().optional(),
        closingDate: z.string().optional(),
        notes: z.string().optional(),
      }))
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can bulk upload transactions." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const results: Array<{
        rowIndex: number;
        success: boolean;
        transactionId?: number;
        transactionNumber?: string;
        errors: string[];
        warnings: string[];
      }> = [];

      // Pre-load all agents (email → user) for fast lookup
      const allAgents = await db
        .select({ id: users.id, email: users.email, name: users.name, commissionSplit: users.commissionSplit })
        .from(users)
        .where(eq(users.role, "agent"));
      const agentByEmail = new Map(allAgents.filter(a => a.email).map(a => [a.email!.toLowerCase(), a]));

      for (const row of input.rows) {
        const errors: string[] = [];
        const warnings: string[] = [];

        // ── 1. Validate & normalise transaction type ──────────────────────────
        const txTypeMap: Record<string, "buyer" | "seller" | "dual"> = {
          buyer: "buyer", purchase: "buyer", buy: "buyer",
          seller: "seller", listing: "seller", sell: "seller",
          dual: "dual", "dual agency": "dual", dualagency: "dual",
        };
        const txType = txTypeMap[row.transactionType.toLowerCase().trim()];
        if (!txType) errors.push(`Invalid transaction_type "${row.transactionType}". Use: buyer, seller, dual.`);

        // ── 2. Validate & normalise status ────────────────────────────────────
        const statusMap: Record<string, "under_contract" | "closed" | "terminated"> = {
          under_contract: "under_contract", "under contract": "under_contract", uc: "under_contract", pending: "under_contract",
          closed: "closed", close: "closed", sold: "closed",
          terminated: "terminated", cancelled: "terminated", canceled: "terminated",
        };
        const txStatus = statusMap[row.status.toLowerCase().trim()];
        if (!txStatus) errors.push(`Invalid status "${row.status}". Use: under_contract, closed, terminated.`);

        // ── 3. Resolve agent ──────────────────────────────────────────────────
        const agent = agentByEmail.get(row.agentEmail.toLowerCase().trim());
        if (!agent) errors.push(`Agent with email "${row.agentEmail}" not found in the system.`);

        // ── 4. Validate dates ─────────────────────────────────────────────────
        let contractDate: Date | null = null;
        let closingDate: Date | null = null;
        if (row.contractDate) {
          const d = new Date(row.contractDate);
          if (isNaN(d.getTime())) errors.push(`Invalid contract_date "${row.contractDate}". Use YYYY-MM-DD.`);
          else contractDate = d;
        }
        if (row.closingDate) {
          const d = new Date(row.closingDate);
          if (isNaN(d.getTime())) errors.push(`Invalid closing_date "${row.closingDate}". Use YYYY-MM-DD.`);
          else closingDate = d;
        }

        // ── 5. Validate numeric fields ────────────────────────────────────────
        let purchasePrice: number | null = null;
        let commissionRatePct: number | null = null;
        let gci: number | null = null;
        let agentSplitPct: number | null = null;
        let groupLeaderSplitPct: number | null = null;
        let referralPayoutPct: number | null = null;

        if (row.purchasePrice) {
          purchasePrice = parseFloat(row.purchasePrice.replace(/[$,]/g, ""));
          if (isNaN(purchasePrice)) errors.push(`Invalid purchase_price "${row.purchasePrice}".`);
        }
        if (row.commissionRatePct) {
          commissionRatePct = parseFloat(row.commissionRatePct.replace(/%/g, ""));
          if (isNaN(commissionRatePct) || commissionRatePct < 0 || commissionRatePct > 100)
            errors.push(`Invalid commission_rate_pct "${row.commissionRatePct}". Must be 0–100.`);
        }
        if (row.gci) {
          gci = parseFloat(row.gci.replace(/[$,]/g, ""));
          if (isNaN(gci)) errors.push(`Invalid gci "${row.gci}".`);
        }
        if (row.agentSplitPct) {
          agentSplitPct = parseFloat(row.agentSplitPct.replace(/%/g, ""));
          if (isNaN(agentSplitPct) || agentSplitPct < 0 || agentSplitPct > 100)
            errors.push(`Invalid agent_split_pct "${row.agentSplitPct}". Must be 0–100.`);
        }
        if (row.groupLeaderSplitPct) {
          groupLeaderSplitPct = parseFloat(row.groupLeaderSplitPct.replace(/%/g, ""));
          if (isNaN(groupLeaderSplitPct) || groupLeaderSplitPct < 0 || groupLeaderSplitPct > 100)
            errors.push(`Invalid group_leader_split_pct "${row.groupLeaderSplitPct}". Must be 0–100.`);
        }
        if (row.referralPayoutPct) {
          referralPayoutPct = parseFloat(row.referralPayoutPct.replace(/%/g, ""));
          if (isNaN(referralPayoutPct) || referralPayoutPct < 0 || referralPayoutPct > 100)
            errors.push(`Invalid referral_payout_pct "${row.referralPayoutPct}". Must be 0–100.`);
        }

        // ── 6. Derive GCI if not provided ─────────────────────────────────────
        if (!gci && purchasePrice && commissionRatePct) {
          gci = Math.round((purchasePrice * commissionRatePct) / 100 * 100) / 100;
          warnings.push(`GCI derived from purchase_price × commission_rate_pct: $${gci.toFixed(2)}`);
        } else if (gci && purchasePrice && commissionRatePct) {
          const derivedGci = Math.round((purchasePrice * commissionRatePct) / 100 * 100) / 100;
          const diff = Math.abs(gci - derivedGci);
          if (diff > 1) {
            warnings.push(`GCI mismatch: provided $${gci.toFixed(2)} vs calculated $${derivedGci.toFixed(2)}. Using provided value.`);
          }
        }

        // ── 7. Validate split totals ──────────────────────────────────────────
        if (agentSplitPct !== null && groupLeaderSplitPct !== null) {
          const savvyPct = 100 - agentSplitPct - groupLeaderSplitPct - (referralPayoutPct ?? 0);
          if (savvyPct < 20) {
            warnings.push(`Savvy net split is ${savvyPct.toFixed(1)}% (below 20% minimum). Row will be flagged for review.`);
          }
        }

        // ── 8. Contact: find or create ────────────────────────────────────────
        let primaryContactId: number | null = null;
        if (errors.length === 0) {
          // Try to find existing contact by email
          let existingContact: { id: number } | null = null;
          if (row.primaryContactEmail) {
            const [found] = await db
              .select({ id: contacts.id })
              .from(contacts)
              .where(eq(contacts.email, row.primaryContactEmail.toLowerCase().trim()))
              .limit(1);
            existingContact = found ?? null;
          }
          if (!existingContact) {
            // Create a minimal contact record
            const contactId = await (await import("../db")).createContact({
              firstName: row.primaryContactFirstName.trim(),
              lastName: row.primaryContactLastName.trim(),
              email: row.primaryContactEmail?.toLowerCase().trim() ?? null,
              phone: row.primaryContactPhone?.trim() ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any);
            primaryContactId = contactId;
            warnings.push(`New contact created: ${row.primaryContactFirstName} ${row.primaryContactLastName}.`);
          } else {
            primaryContactId = existingContact.id;
          }
        }

        // ── 9. Property: find or create ───────────────────────────────────────
        let propertyId: number | null = null;
        if (errors.length === 0 && row.propertyAddress) {
          const [existingProp] = await db
            .select({ id: properties.id })
            .from(properties)
            .where(sql`LOWER(${properties.address}) = ${row.propertyAddress.toLowerCase().trim()}`)
            .limit(1);
          if (existingProp) {
            propertyId = existingProp.id;
          } else {
            const propId = await (await import("../db")).createProperty({
              address: row.propertyAddress.trim(),
              city: row.propertyCity?.trim() ?? null,
              state: row.propertyState?.trim() ?? null,
              zip: row.propertyZip?.trim() ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any);
            propertyId = propId;
          }
        }

        // ── 10. Skip row if validation failed ─────────────────────────────────
        if (errors.length > 0 || !agent || !primaryContactId || !txType || !txStatus) {
          results.push({ rowIndex: row.rowIndex, success: false, errors, warnings });
          continue;
        }

        // ── 11. Create transaction ────────────────────────────────────────────
        const txNumber = row.transactionNumber?.trim() || `TXN-${Date.now()}-${row.rowIndex}`;
        const commissionRateDecimal = commissionRatePct !== null ? commissionRatePct / 100 : null;

        const txId = await createTransaction({
          transactionNumber: txNumber,
          agentId: agent.id,
          primaryContactId,
          propertyId,
          transactionType: txType,
          status: txStatus,
          purchasePrice: purchasePrice !== null ? String(purchasePrice) : null,
          commissionRate: commissionRateDecimal !== null ? String(commissionRateDecimal) : null,
          commissionType: "percentage",
          grossCommissionIncome: gci !== null ? String(gci) : null,
          contractDate,
          closingDate,
          referralSourceName: row.referralSourceName?.trim() ?? null,
          referralPayoutPct: referralPayoutPct !== null ? String(referralPayoutPct) : null,
          notes: row.notes?.trim() ?? null,
        } as any);

        // ── 12. Auto-generate commission payouts ──────────────────────────────
        if (gci && gci > 0) {
          // If CSV provides explicit splits, use them directly instead of agent profile
          if (agentSplitPct !== null) {
            // Build payouts manually from CSV-provided splits
            const { calculateCommission } = await import("../commissionEngine");
            const isInGroup = groupLeaderSplitPct !== null && groupLeaderSplitPct > 0;
            const commResult = calculateCommission({
              agentSplit: agentSplitPct,
              isInGroup,
              groupLeaderSplit: isInGroup ? groupLeaderSplitPct! : undefined,
              referralPercent: referralPayoutPct ?? 0,
              gci,
            });

            for (const payout of commResult.payouts) {
              let payeeUserId: number | null = null;
              let payeeName: string | null = null;
              if (payout.payeeType === "agent") {
                payeeUserId = agent.id;
                payeeName = agent.name;
              } else if (payout.payeeType === "savvy_str_agents") {
                payeeName = "Savvy STR Agents";
              } else if (payout.payeeType === "group_leader") {
                payeeName = "Group Leader";
              } else if (payout.payeeType === "referral_partner") {
                payeeName = row.referralSourceName?.trim() ?? "Referral Partner";
              }
              await createPayoutItem({
                transactionId: txId,
                payeeType: payout.payeeType,
                payeeUserId,
                payeeName,
                percentage: String(payout.percentage),
                commissionType: "percentage",
                amount: String(payout.amount.toFixed(2)),
                isPaid: false,
                referralFeePaidBy: payout.referralFeePaidBy ?? null,
                notes: payout.notes ?? null,
                isAutoGenerated: true,
                isOverride: false,
              });
            }

            if (commResult.flagForReview) {
              warnings.push(`Commission flag: ${commResult.flagReason}`);
              await db.update(transactions)
                .set({ payoutIntegrityFlag: true, payoutIntegrityNote: commResult.flagReason ?? null })
                .where(eq(transactions.id, txId));
            }
          } else {
            // Fall back to agent profile-based auto-payouts
            await generateAutoPayouts({
              transactionId: txId,
              agentId: agent.id,
              primaryContactId,
              gci,
              referralSourceName: row.referralSourceName?.trim() ?? null,
              referralPayoutPct,
            });
          }
        }

        await logActivity({
          userId: ctx.user.id,
          action: "transaction_created",
          entityType: "transaction",
          entityId: txId,
          details: { txNumber, source: "bulk_upload" },
        });

        results.push({
          rowIndex: row.rowIndex,
          success: true,
          transactionId: txId,
          transactionNumber: txNumber,
          errors: [],
          warnings,
        });
      }

      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      return { results, succeeded, failed, total: input.rows.length };
    }),

  // ─── Commission Split Preview ────────────────────────────────────────────
  // Returns a live breakdown of how GCI would be split given current agent profile.
  // Used by the edit dialog's "Split Preview" panel.
  getCommissionPreview: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      gci: z.number().min(0),
      referralPayoutPct: z.number().min(0).max(100).optional().nullable(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { skipped: true, skipReason: "DB unavailable", payouts: [] };

      // 1. Agent commission split
      const [agent] = await db
        .select({ commissionSplit: users.commissionSplit, name: users.name })
        .from(users)
        .where(eq(users.id, input.agentId));

      if (!agent?.commissionSplit) {
        return { skipped: true, skipReason: "Agent has no commission split configured", payouts: [] };
      }

      // 2. Group membership
      const [membership] = await db
        .select({ groupId: groupMembers.groupId, leaderSplitOverride: groupMembers.leaderSplitOverride })
        .from(groupMembers)
        .where(eq(groupMembers.userId, input.agentId))
        .limit(1);

      let groupLeaderSplit: number | undefined;
      let groupLeaderName: string | undefined;

      if (membership) {
        const [group] = await db
          .select({ leaderCommissionSplit: groups.leaderCommissionSplit, leaderId: groups.leaderId, name: groups.name })
          .from(groups)
          .where(eq(groups.id, membership.groupId));
        if (group) {
          groupLeaderSplit = membership.leaderSplitOverride ?? group.leaderCommissionSplit ?? undefined;
          if (group.leaderId) {
            const [leader] = await db.select({ name: users.name }).from(users).where(eq(users.id, group.leaderId));
            groupLeaderName = leader?.name ?? "Group Leader";
          }
        }
      }

      const { calculateCommission } = await import("../commissionEngine");
      const result = calculateCommission({
        agentSplit: agent.commissionSplit,
        isInGroup: !!membership && !!groupLeaderSplit,
        groupLeaderSplit,
        referralPercent: input.referralPayoutPct ?? 0,
        gci: input.gci,
      });

      return {
        skipped: false,
        agentName: agent.name,
        agentSplit: agent.commissionSplit,
        groupLeaderName,
        groupLeaderSplit,
        payouts: result.payouts,
        flagForReview: result.flagForReview,
        flagReason: result.flagReason,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete transactions." });
      }
      const tx = await getTransactionById(input.id);
      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Cascade: delete all child records before the transaction
      await db.delete(transactionPayoutItems).where(eq(transactionPayoutItems.transactionId, input.id));
      await db.delete(transactionDocuments).where(eq(transactionDocuments.transactionId, input.id));
      await db.delete(transactionNotes).where(eq(transactionNotes.transactionId, input.id));
      await db.delete(commissionExceptions).where(eq(commissionExceptions.transactionId, input.id));
      await db.delete(communications).where(eq(communications.relatedTransactionId, input.id));
      await db.delete(activityLog).where(and(eq(activityLog.entityType, "transaction"), eq(activityLog.entityId, input.id)));
      // Clear listing reference if this transaction came from a listing conversion
      if (tx.transaction.listingId) {
        await db.update(listings).set({ convertedTransactionId: null }).where(eq(listings.id, tx.transaction.listingId!));
      }
      // Delete the transaction itself
      await db.delete(transactions).where(eq(transactions.id, input.id));
      return { success: true };
    }),
});
