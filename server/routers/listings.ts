import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getListings,
  getListingById,
  createListing,
  createProperty,
  createContact,
  updateListing,
  deleteListing,
  getListingNotes,
  createListingNote,
  logActivity,
  getDb,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmailAlert } from "../_core/emailAlerts";
import { properties as propertiesTable, users, listings as listingsTable, contacts as contactsTable, transactions as transactionsTable } from "../../drizzle/schema";
import { eq, or, and } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";

export const listingsRouter = router({
  list: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      listingDateFrom: z.string().optional(),
      listingDateTo: z.string().optional(),
      expirationDateFrom: z.string().optional(),
      expirationDateTo: z.string().optional(),
      terminationDateFrom: z.string().optional(),
      terminationDateTo: z.string().optional(),
      filterAgentId: z.number().optional(),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }).optional())
    .query(async ({ input, ctx }) => {
      const agentId = ctx.user.role === "agent" ? ctx.user.id : undefined;
      return getListings({
        agentId,
        status: input?.status,
        search: input?.search,
        listingDateFrom: input?.listingDateFrom,
        listingDateTo: input?.listingDateTo,
        expirationDateFrom: input?.expirationDateFrom,
        expirationDateTo: input?.expirationDateTo,
        terminationDateFrom: input?.terminationDateFrom,
        terminationDateTo: input?.terminationDateTo,
        filterAgentId: input?.filterAgentId,
        sortOrder: input?.sortOrder ?? "desc",
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const listing = await getListingById(input.id);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
      // Agents can only view their own listings
      if (ctx.user.role === "agent" && listing.listing.agentId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view your own listings" });
      }
      // Fetch terminated transactions linked to this listing's property
      let terminatedTransactions: Array<{ id: number; status: string; transactionType: string | null; primaryContactName: string | null; closingDate: Date | null; gci: string | null }> = [];
      if (listing.listing.propertyId) {
        const db = await getDb();
        if (db) {
          const contactAlias = aliasedTable(contactsTable, "txContact");
          const rows = await db
            .select({
              id: transactionsTable.id,
              status: transactionsTable.status,
              transactionType: transactionsTable.transactionType,
              closingDate: transactionsTable.closingDate,
              gci: transactionsTable.grossCommissionIncome,
              firstName: contactAlias.firstName,
              lastName: contactAlias.lastName,
            })
            .from(transactionsTable)
            .leftJoin(contactAlias, eq(transactionsTable.primaryContactId, contactAlias.id))
            .where(and(
              eq(transactionsTable.propertyId, listing.listing.propertyId),
              eq(transactionsTable.status, "terminated" as any)
            ));
          terminatedTransactions = rows.map(r => ({
            id: r.id,
            status: r.status,
            transactionType: r.transactionType,
            closingDate: r.closingDate,
            gci: r.gci,
            primaryContactName: r.firstName && r.lastName ? `${r.firstName} ${r.lastName}` : (r.firstName ?? r.lastName ?? null),
          }));
        }
      }
      return { ...listing, terminatedTransactions };
    }),

  create: protectedProcedure
    .input(z.object({
      agentId: z.number().optional().nullable(),
      contactId: z.number().min(1, "Seller contact is required"),
      propertyId: z.number().optional().nullable(),
      listingStatus: z.enum(["active", "terminated", "expired", "under_contract", "closed"]).optional(),
      listPrice: z.string().optional().nullable(),
      listDate: z.string().optional().nullable(),
      expirationDate: z.string().optional().nullable(),
      mlsNumber: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      zip: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "agent") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins and agents can create listings" });
      }
      const agentId = ctx.user.role === "agent" ? ctx.user.id : (input.agentId ?? null);
      const id = await createListing({
        agentId: agentId ?? undefined,
        contactId: input.contactId ?? null,
        propertyId: input.propertyId ?? null,
        listingStatus: input.listingStatus ?? "active",
        listPrice: input.listPrice ?? null,
        listDate: input.listDate ? input.listDate.slice(0, 10) : null,
        expirationDate: input.expirationDate ? input.expirationDate.slice(0, 10) : null,
        mlsNumber: input.mlsNumber ?? null,
        notes: input.notes ?? null,
      } as any);
      // Enrich activity log with names of all involved parties
      let lstContactName = "Unknown Contact";
      let lstAgentName = "Unknown Agent";
      let lstPropertyAddress = "Unknown Property";
      try {
        const dbEnrich = await getDb();
        if (dbEnrich) {
          const [cRow] = await dbEnrich.select({ firstName: contactsTable.firstName, lastName: contactsTable.lastName }).from(contactsTable).where(eq(contactsTable.id, input.contactId)).limit(1);
          if (cRow) lstContactName = `${cRow.firstName ?? ""} ${cRow.lastName ?? ""}`.trim() || "Unknown Contact";
          if (agentId) {
            const [aRow] = await dbEnrich.select({ name: users.name }).from(users).where(eq(users.id, agentId)).limit(1);
            if (aRow) lstAgentName = aRow.name ?? "Unknown Agent";
          }
          if (input.propertyId) {
            const [pRow] = await dbEnrich.select({ address: propertiesTable.address, city: propertiesTable.city, state: propertiesTable.state }).from(propertiesTable).where(eq(propertiesTable.id, input.propertyId)).limit(1);
            if (pRow) lstPropertyAddress = [pRow.address, pRow.city, pRow.state].filter(Boolean).join(", ") || "Unknown Property";
          } else if (input.address) {
            lstPropertyAddress = [input.address, input.city, input.state].filter(Boolean).join(", ") || "Unknown Property";
          }
        }
      } catch (_) {}
      await logActivity({
        userId: ctx.user.id,
        action: "listing_created",
        entityType: "listing",
        entityId: id,
        details: {
          mlsNumber: input.mlsNumber,
          actorName: ctx.user.name ?? "Unknown",
          actorRole: ctx.user.role,
          agentName: lstAgentName,
          contactName: lstContactName,
          propertyAddress: lstPropertyAddress,
        },
      });
      // Notify agent of new listing
      if (agentId) {
        await sendEmailAlert("listing_created", agentId, {
          listingAddress: input.address ? [input.address, input.city, input.state].filter(Boolean).join(", ") : undefined,
          listPrice: input.listPrice ? `$${Number(input.listPrice).toLocaleString()}` : undefined,
          listingDate: input.listDate ? new Date(input.listDate).toLocaleDateString() : undefined,
          expirationDate: input.expirationDate ? new Date(input.expirationDate).toLocaleDateString() : undefined,
        }).catch(() => {});
      }
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        agentId: z.number().optional().nullable(),
        contactId: z.number().optional().nullable(),
        propertyId: z.number().optional().nullable(),
        listingStatus: z.enum(["active", "terminated", "expired", "under_contract", "closed"]).optional(),
        listPrice: z.string().optional().nullable(),
        listDate: z.string().optional().nullable(),
        expirationDate: z.string().optional().nullable(),
        terminationDate: z.string().optional().nullable(),
        mlsNumber: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "agent") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins and agents can update listings" });
      }
      // Agents can only edit their own listings
      if (ctx.user.role === "agent") {
        const existing = await getListingById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        if (existing.listing.agentId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own listings" });
        }
      }
      // Enforce seller contact — cannot clear it once set
      if (input.data.contactId === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Seller contact is required and cannot be removed from a listing" });
      }
      // Fetch old listing for before/after comparison
      const oldListing = await getListingById(input.id);
      const { listDate, expirationDate, terminationDate, ...rest } = input.data;
      await updateListing(input.id, {
        ...rest,
        listDate: listDate ? listDate.slice(0, 10) : undefined,
        expirationDate: expirationDate ? expirationDate.slice(0, 10) : undefined,
        terminationDate: terminationDate ? terminationDate.slice(0, 10) : undefined,
      } as any);
      // Build changes diff
      const changes: Record<string, { from: any; to: any }> = {};
      const old = oldListing?.listing;
      if (old) {
        if (input.data.listingStatus && input.data.listingStatus !== old.listingStatus)
          changes.status = { from: old.listingStatus, to: input.data.listingStatus };
        if (input.data.listPrice !== undefined && String(input.data.listPrice ?? "") !== String(old.listPrice ?? ""))
          changes.listPrice = { from: old.listPrice ? `$${Number(old.listPrice).toLocaleString()}` : "\u2014", to: input.data.listPrice ? `$${Number(input.data.listPrice).toLocaleString()}` : "\u2014" };
        if (input.data.mlsNumber !== undefined && input.data.mlsNumber !== old.mlsNumber)
          changes.mlsNumber = { from: old.mlsNumber ?? "\u2014", to: input.data.mlsNumber ?? "\u2014" };
        if (input.data.agentId !== undefined && input.data.agentId !== old.agentId)
          changes.agentId = { from: old.agentId ?? "\u2014", to: input.data.agentId ?? "\u2014" };
        if (input.data.listingStatus !== undefined && input.data.listingStatus !== old.listingStatus)
          changes.listingStatus = { from: old.listingStatus, to: input.data.listingStatus };
        // Helper: extract YYYY-MM-DD from a DB date/timestamp value.
        // DATE columns return "YYYY-MM-DD" strings directly — no conversion needed.
        const toDateStr = (v: unknown) => {
          if (!v) return "—";
          const s = String(v);
          // Pure date string "YYYY-MM-DD" — return as-is
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
          // Timestamp with time component — parse as UTC
          const normalized = s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z");
          const d = new Date(normalized);
          return isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
        };
        if (listDate !== undefined) {
          const oldDate = old.listDate ? toDateStr(old.listDate) : "—";
          const newDate = listDate ? listDate.slice(0, 10) : "—";
          if (oldDate !== newDate) changes.listDate = { from: oldDate, to: newDate };
        }
        if (expirationDate !== undefined) {
          const oldDate = old.expirationDate ? toDateStr(old.expirationDate) : "—";
          const newDate = expirationDate ? expirationDate.slice(0, 10) : "—";
          if (oldDate !== newDate) changes.expirationDate = { from: oldDate, to: newDate };
        }
      }
      // Enrich with actor/agent/contact names
      let updContactName = "Unknown Contact";
      let updAgentName = "Unknown Agent";
      let updPropertyAddress = "Unknown Property";
      try {
        const dbEnrich = await getDb();
        if (dbEnrich) {
          const contactId = input.data.contactId ?? oldListing?.listing.contactId;
          if (contactId) {
            const [cRow] = await dbEnrich.select({ firstName: contactsTable.firstName, lastName: contactsTable.lastName }).from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
            if (cRow) updContactName = `${cRow.firstName ?? ""} ${cRow.lastName ?? ""}`.trim() || "Unknown Contact";
          }
          const agentIdUpd = input.data.agentId ?? oldListing?.listing.agentId;
          if (agentIdUpd) {
            const [aRow] = await dbEnrich.select({ name: users.name }).from(users).where(eq(users.id, agentIdUpd)).limit(1);
            if (aRow) updAgentName = aRow.name ?? "Unknown Agent";
          }
          const propId = input.data.propertyId ?? oldListing?.listing.propertyId;
          if (propId) {
            const [pRow] = await dbEnrich.select({ address: propertiesTable.address, city: propertiesTable.city, state: propertiesTable.state }).from(propertiesTable).where(eq(propertiesTable.id, propId)).limit(1);
            if (pRow) updPropertyAddress = [pRow.address, pRow.city, pRow.state].filter(Boolean).join(", ") || "Unknown Property";
          }
        }
      } catch (_) {}
      await logActivity({
        userId: ctx.user.id,
        action: "listing_updated",
        entityType: "listing",
        entityId: input.id,
        details: {
          changes,
          actorName: ctx.user.name ?? "Unknown",
          actorRole: ctx.user.role,
          agentName: updAgentName,
          contactName: updContactName,
          propertyAddress: updPropertyAddress,
        },
      });
      return { success: true };
    }),

  terminate: protectedProcedure
    .input(z.object({ id: z.number(), terminationDate: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await updateListing(input.id, {
        listingStatus: "terminated",
        terminationDate: input.terminationDate.slice(0, 10),
      } as any);
      // Enrich with actor/property context
      let termPropertyAddress = "Unknown Property";
      let termAgentName = "Unknown Agent";
      let termContactName = "Unknown Contact";
      try {
        const dbEnrich = await getDb();
        if (dbEnrich) {
          const termListing = await getListingById(input.id);
          if (termListing) {
            if (termListing.listing.agentId) {
              const [aRow] = await dbEnrich.select({ name: users.name }).from(users).where(eq(users.id, termListing.listing.agentId)).limit(1);
              if (aRow) termAgentName = aRow.name ?? "Unknown Agent";
            }
            if (termListing.listing.contactId) {
              const [cRow] = await dbEnrich.select({ firstName: contactsTable.firstName, lastName: contactsTable.lastName }).from(contactsTable).where(eq(contactsTable.id, termListing.listing.contactId)).limit(1);
              if (cRow) termContactName = `${cRow.firstName ?? ""} ${cRow.lastName ?? ""}`.trim() || "Unknown Contact";
            }
            if (termListing.listing.propertyId) {
              const [pRow] = await dbEnrich.select({ address: propertiesTable.address, city: propertiesTable.city, state: propertiesTable.state }).from(propertiesTable).where(eq(propertiesTable.id, termListing.listing.propertyId)).limit(1);
              if (pRow) termPropertyAddress = [pRow.address, pRow.city, pRow.state].filter(Boolean).join(", ") || "Unknown Property";
            }
          }
        }
      } catch (_) {}
      await logActivity({
        userId: ctx.user.id,
        action: "listing_terminated",
        entityType: "listing",
        entityId: input.id,
        details: {
          terminationDate: input.terminationDate,
          actorName: ctx.user.name ?? "Unknown",
          actorRole: ctx.user.role,
          agentName: termAgentName,
          contactName: termContactName,
          propertyAddress: termPropertyAddress,
        },
      });
      return { success: true };
    }),

  markExpired: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await updateListing(input.id, { listingStatus: "expired" } as any);
      await logActivity({ userId: ctx.user.id, action: "listing_expired", entityType: "listing", entityId: input.id });
      return { success: true };
    }),

  convertToTransaction: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      transactionType: z.enum(["seller","dual"]).default("seller"),
      primaryContactId: z.number(),
      purchasePrice: z.string().optional().nullable(),
      commissionRate: z.string().optional().nullable(),
      commissionType: z.enum(["percentage", "flat"]).optional(),
      // Dual-agency buyer side
      buyerContactId: z.number().optional().nullable(),
      buyerCommissionRate: z.string().optional().nullable(),
      buyerCommissionType: z.enum(["percentage", "flat"]).optional().nullable(),
      buyerNotes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can convert listings" });
      if (input.transactionType === "dual" && !input.buyerContactId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dual agency transactions require a buyer contact" });
      }
      const listingData = await getListingById(input.listingId);
      if (!listingData) throw new TRPCError({ code: "NOT_FOUND" });
      const { createTransaction } = await import("../db");

      if (input.transactionType === "dual") {
        // ── Dual agency: create TWO separate transactions ──────────────────
        // 1. Seller-side transaction (linked to the listing)
        const sellerTxId = await createTransaction({
          primaryContactId: input.primaryContactId,
          agentId: listingData.listing.agentId,
          transactionType: "seller",
          status: "under_contract",
          purchasePrice: input.purchasePrice || null,
          commissionRate: input.commissionRate || null,
          commissionType: input.commissionType || "percentage",
          propertyId: listingData.listing.propertyId || null,
          listingId: input.listingId,
          sellerContactId: input.primaryContactId,
        } as any);

        // 2. Buyer-side transaction (same property, buyer contact, buyer commission)
        const buyerTxId = await createTransaction({
          primaryContactId: input.buyerContactId!,
          agentId: listingData.listing.agentId,
          transactionType: "buyer",
          status: "under_contract",
          purchasePrice: input.purchasePrice || null,
          commissionRate: input.buyerCommissionRate || null,
          commissionType: input.buyerCommissionType || "percentage",
          propertyId: listingData.listing.propertyId || null,
          notes: input.buyerNotes || null,
        } as any);

        // Mark listing as closed, link to the seller-side transaction
        await updateListing(input.listingId, { listingStatus: "closed", convertedTransactionId: sellerTxId } as any);
        await logActivity({
          userId: ctx.user.id,
          action: "listing_converted_to_transaction",
          entityType: "listing",
          entityId: input.listingId,
          details: { transactionId: sellerTxId, buyerTransactionId: buyerTxId, dual: true },
        });
        return { transactionId: sellerTxId, buyerTransactionId: buyerTxId, dual: true };
      }

      // ── Single (seller-only) transaction ─────────────────────────────────
      const txId = await createTransaction({
        primaryContactId: input.primaryContactId,
        agentId: listingData.listing.agentId,
        transactionType: "seller",
        status: "under_contract",
        purchasePrice: input.purchasePrice || null,
        commissionRate: input.commissionRate || null,
        commissionType: input.commissionType || "percentage",
        propertyId: listingData.listing.propertyId || null,
        listingId: input.listingId,
        sellerContactId: input.primaryContactId,
      } as any);
      await updateListing(input.listingId, { listingStatus: "closed", convertedTransactionId: txId } as any);
      await logActivity({
        userId: ctx.user.id,
        action: "listing_converted_to_transaction",
        entityType: "listing",
        entityId: input.listingId,
        details: { transactionId: txId },
      });
      return { transactionId: txId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await deleteListing(input.id);
      await logActivity({
        userId: ctx.user.id,
        action: "listing_deleted",
        entityType: "listing",
        entityId: input.id,
      });
      return { success: true };
    }),

  // ─── Listing Notes ──────────────────────────────────────────────────────────
  getNotes: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      return getListingNotes(input.listingId);
    }),

  addNote: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      content: z.string().min(1, "Note cannot be empty"),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createListingNote({
        listingId: input.listingId,
        authorId: ctx.user.id,
        content: input.content,
      });
      return { id };
    }),

  bulkUpload: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zip: z.string().optional().nullable(),
        propertyType: z.string().optional().nullable(),
        beds: z.string().optional().nullable(),
        baths: z.string().optional().nullable(),
        sqft: z.string().optional().nullable(),
        mlsNumber: z.string().optional().nullable(),
        listPrice: z.string().optional().nullable(),
        listDate: z.string().optional().nullable(),
        expirationDate: z.string().optional().nullable(),
        listingStatus: z.string().optional().nullable(), // accepts: active, terminated, expired, converted, closed, UC, under contract
        notes: z.string().optional().nullable(),
        agentEmail: z.string().optional().nullable(),
        sellerFirstName: z.string().optional().nullable(),
        sellerLastName: z.string().optional().nullable(),
        sellerEmail: z.string().optional().nullable(),
        sellerPhone: z.string().optional().nullable(),
      }))
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "agent") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const validPropertyTypes = ["single_family","multi_family","condo","townhouse","cabin","vacation_rental","commercial","land","other"];
      const results: Array<{ row: number; status: "created" | "skipped" | "error"; reason?: string; label?: string }> = [];
      let created = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        const rowNum = i + 1;
        const label = row.address ?? row.mlsNumber ?? `Row ${rowNum}`;
        try {
          // Resolve agentId
          let agentId: number | null = ctx.user.role === "agent" ? ctx.user.id : null;
          if (ctx.user.role === "admin" && row.agentEmail?.trim()) {
            const [agentRow] = await db.select({ id: users.id }).from(users).where(eq(users.email, row.agentEmail.trim())).limit(1);
            if (agentRow) agentId = agentRow.id;
          }

          // Duplicate check by MLS number
          if (row.mlsNumber?.trim()) {
            const existing = await db.select({ id: listingsTable.id }).from(listingsTable).where(eq(listingsTable.mlsNumber, row.mlsNumber.trim())).limit(1);
            if (existing.length > 0) {
              results.push({ row: rowNum, status: "skipped", reason: "MLS number already exists", label });
              skipped++;
              continue;
            }
          }

          // Find or create property
          let propertyId: number | null = null;
          if (row.address?.trim()) {
            const existing = await db.select({ id: propertiesTable.id }).from(propertiesTable).where(eq(propertiesTable.address, row.address.trim())).limit(1);
            if (existing.length > 0) {
              propertyId = existing[0].id;
            } else {
              const propType = row.propertyType?.toLowerCase().replace(/ /g, "_");
              propertyId = await createProperty({
                address: row.address.trim(),
                city: row.city?.trim() || null,
                state: row.state?.trim() || null,
                zip: row.zip?.trim() || null,
                beds: row.beds?.trim() || null,
                baths: row.baths?.trim() || null,
                sqft: row.sqft ? parseInt(row.sqft) || null : null,
                propertyType: (validPropertyTypes.includes(propType ?? "") ? propType : null) as any,
                listPrice: row.listPrice?.trim() || null,
              } as any);
            }
          }

          // Normalize status: accept all canonical values plus common aliases
          const rawStatus = (row.listingStatus ?? "active").trim().toLowerCase();
          let normalizedStatus: "active" | "terminated" | "expired" | "under_contract" | "closed" = "active";
          if (["terminated"].includes(rawStatus)) normalizedStatus = "terminated";
          else if (["expired"].includes(rawStatus)) normalizedStatus = "expired";
          else if (["uc","under contract","under_contract","undercontract"].includes(rawStatus)) normalizedStatus = "under_contract";
          else if (["closed","converted","sold"].includes(rawStatus)) normalizedStatus = "closed";

          // Find or create seller contact
          let contactId: number | null = null;
          if (row.sellerFirstName?.trim() || row.sellerEmail?.trim()) {
            // Try to find existing contact by email or phone
            const sellerConditions: any[] = [];
            if (row.sellerEmail?.trim()) sellerConditions.push(eq(contactsTable.email, row.sellerEmail.trim()));
            if (row.sellerPhone?.trim()) sellerConditions.push(eq(contactsTable.phone, row.sellerPhone.trim()));
            if (sellerConditions.length > 0) {
              const [existing] = await db.select({ id: contactsTable.id }).from(contactsTable).where(or(...sellerConditions)).limit(1);
              if (existing) contactId = existing.id;
            }
            if (!contactId && row.sellerFirstName?.trim()) {
              contactId = await createContact({
                firstName: row.sellerFirstName.trim(),
                lastName: row.sellerLastName?.trim() || "",
                email: row.sellerEmail?.trim() || null,
                phone: row.sellerPhone?.trim() || null,
              } as any);
            }
          }

          const id = await createListing({
            agentId: agentId ?? undefined,
            propertyId: propertyId ?? undefined,
            contactId: contactId ?? undefined,
            listingStatus: normalizedStatus,
            listPrice: row.listPrice?.trim() || null,
            listDate: row.listDate ? new Date(row.listDate) : null,
            expirationDate: row.expirationDate ? new Date(row.expirationDate) : null,
            mlsNumber: row.mlsNumber?.trim() || null,
            notes: row.notes?.trim() || null,
          } as any);
          await logActivity({ userId: ctx.user.id, action: "listing_created", entityType: "listing", entityId: id, details: { label, source: "bulk_upload" } });
          results.push({ row: rowNum, status: "created", label });
          created++;
        } catch (err: any) {
          results.push({ row: rowNum, status: "error", reason: err?.message ?? "Unknown error", label });
          errors++;
        }
      }

      return { created, skipped, errors, results };
    }),

  /**
   * Back to Active: revert an Under Contract listing to Active.
   * Terminates all linked transactions and updates listing price/commission.
   */
  backToActive: protectedProcedure
    .input(z.object({
      id: z.number(),
      listPrice: z.number().positive(),
      commissionRate: z.number().min(0).max(100), // entered as percentage e.g. 3.0
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "agent") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins and agents can perform this action" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // 1. Verify listing exists and is under_contract
      const listing = await getListingById(input.id);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      if (listing.listing.listingStatus !== "under_contract") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Listing is not Under Contract" });
      }

      // 2. Find all linked transactions
      const linkedTxIds: number[] = [];
      if (listing.listing.convertedTransactionId) {
        linkedTxIds.push(listing.listing.convertedTransactionId);
        // Find any buyer-side transaction sharing the same propertyId
        const sellerTxRows = await db
          .select({ id: transactionsTable.id, propertyId: transactionsTable.propertyId })
          .from(transactionsTable)
          .where(eq(transactionsTable.id, listing.listing.convertedTransactionId))
          .limit(1);
        if (sellerTxRows[0]?.propertyId) {
          const allPropTxRows = await db
            .select({ id: transactionsTable.id })
            .from(transactionsTable)
            .where(eq(transactionsTable.propertyId, sellerTxRows[0].propertyId));
          for (const row of allPropTxRows) {
            if (!linkedTxIds.includes(row.id)) linkedTxIds.push(row.id);
          }
        }
      }

      // 3. Terminate all linked transactions (preserve history)
      for (const txId of linkedTxIds) {
        await db
          .update(transactionsTable)
          .set({ status: "terminated" } as any)
          .where(eq(transactionsTable.id, txId));
        await logActivity({
          userId: ctx.user.id,
          action: "transaction_status_changed",
          entityType: "transaction",
          entityId: txId,
          details: {
            from: "under_contract",
            to: "terminated",
            note: `Auto-terminated: listing #${input.id} reverted to Active${input.reason ? ` — ${input.reason}` : ""}`,
          },
        });
      }

      // 4. Re-activate listing with new price/commission, clear convertedTransactionId
      await updateListing(input.id, {
        listingStatus: "active",
        listPrice: String(input.listPrice),
        convertedTransactionId: null,
      } as any);

      // 5. Log activity
      await logActivity({
        userId: ctx.user.id,
        action: "listing_back_to_active",
        entityType: "listing",
        entityId: input.id,
        details: {
          newListPrice: input.listPrice,
          newCommissionRate: input.commissionRate,
          terminatedTransactions: linkedTxIds,
          reason: input.reason ?? null,
        },
      });

      return { success: true, terminatedCount: linkedTxIds.length, linkedTxIds };
    }),
});
