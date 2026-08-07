import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createProperty,
  createContact,
  getProperties,
  getPropertyById,
  getPropertyOwnership,
  logActivity,
  updateProperty,
  getDb,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { propertyOwnership, transactions, listings, contacts, contactProperties, users, activityLog, properties, proformas, documents } from "../../drizzle/schema";
import { aliasedTable, eq, desc, or, and, sql, inArray } from "drizzle-orm";
import { buildNormalizedKey, geocodeAddress } from "../addressNormalization";

export const propertiesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(500).default(100),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      // For agents, only show properties they added or are involved in via transactions
      const agentId = (ctx.user.role === "agent") ? ctx.user.id : undefined;
      return getProperties(input?.search, input?.sortOrder ?? "desc", input?.page ?? 1, input?.limit ?? 100, agentId);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const prop = await getPropertyById(input.id);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });
      return prop;
    }),

  getOwnership: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ input }) => {
      return getPropertyOwnership(input.propertyId);
    }),

  create: protectedProcedure
    .input(z.object({
      address: z.string().min(1),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      zip: z.string().optional().nullable(),
      beds: z.string().optional().nullable(),
      baths: z.string().optional().nullable(),
      sqft: z.number().optional().nullable(),
      propertyType: z.enum(["single_family","multi_family","condo","townhouse","cabin","vacation_rental","commercial","land","other"]).optional().nullable(),
      yearBuilt: z.number().optional().nullable(),
      listPrice: z.string().optional().nullable(),
      strZoning: z.string().optional().nullable(),
      strNotes: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      skipDuplicateCheck: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Build normalized key for duplicate detection
      let normalizedKey = buildNormalizedKey(input.address, input.city, input.state, input.zip);

      // Try geocoding for better normalization and address verification
      let geocodeResult: Awaited<ReturnType<typeof geocodeAddress>> = null;
      try {
        geocodeResult = await geocodeAddress(input.address, input.city, input.state, input.zip);
        if (geocodeResult?.success && geocodeResult.normalizedKey) {
          normalizedKey = geocodeResult.normalizedKey;
        }
      } catch (_) {}

      // Check for duplicate by normalized address
      if (!input.skipDuplicateCheck) {
        const existing = await db.select({ id: properties.id, address: properties.address, city: properties.city, state: properties.state, zip: properties.zip })
          .from(properties)
          .where(eq(properties.normalizedAddress, normalizedKey))
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: JSON.stringify({
              type: "DUPLICATE_PROPERTY",
              existingId: existing[0].id,
              existingAddress: [existing[0].address, existing[0].city, existing[0].state, existing[0].zip].filter(Boolean).join(", "),
            }),
          });
        }
      }

      // If geocoding returned a verified address, optionally use the standardized form
      const finalAddress = input.address;
      const finalCity = input.city;
      const finalState = input.state;
      const finalZip = input.zip;

      const id = await createProperty({
        address: finalAddress,
        normalizedAddress: normalizedKey,
        city: finalCity,
        state: finalState,
        zip: finalZip,
        beds: input.beds,
        baths: input.baths,
        sqft: input.sqft,
        propertyType: input.propertyType,
        yearBuilt: input.yearBuilt,
        listPrice: input.listPrice,
        strZoning: input.strZoning,
        strNotes: input.strNotes,
        notes: input.notes,
        addedByUserId: ctx.user.id,
      } as any);
      await logActivity({ userId: ctx.user.id, action: "property_created", entityType: "property", entityId: id });
      return { id };
    }),

  // Check for duplicate properties before creation
  checkDuplicate: protectedProcedure
    .input(z.object({
      address: z.string().min(1),
      city: z.string().optional().nullable(),
      state: z.string().optional().nullable(),
      zip: z.string().optional().nullable(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { isDuplicate: false, existingProperty: null, geocodeVerified: false };

      let normalizedKey = buildNormalizedKey(input.address, input.city, input.state, input.zip);
      let geocodeVerified = false;

      // Try geocoding for better normalization
      try {
        const geocodeResult = await geocodeAddress(input.address, input.city, input.state, input.zip);
        if (geocodeResult?.success && geocodeResult.normalizedKey) {
          normalizedKey = geocodeResult.normalizedKey;
          geocodeVerified = true;
        }
      } catch (_) {}

      const existing = await db.select({ id: properties.id, address: properties.address, city: properties.city, state: properties.state, zip: properties.zip })
        .from(properties)
        .where(eq(properties.normalizedAddress, normalizedKey))
        .limit(1);

      if (existing.length > 0) {
        return {
          isDuplicate: true,
          existingProperty: existing[0],
          geocodeVerified,
        };
      }
      return { isDuplicate: false, existingProperty: null, geocodeVerified };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        address: z.string().optional(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zip: z.string().optional().nullable(),
        beds: z.string().optional().nullable(),
        baths: z.string().optional().nullable(),
        sqft: z.number().optional().nullable(),
        propertyType: z.enum(["single_family","multi_family","condo","townhouse","cabin","vacation_rental","commercial","land","other"]).optional().nullable(),
        yearBuilt: z.number().optional().nullable(),
        listPrice: z.string().optional().nullable(),
        strZoning: z.string().optional().nullable(),
        strNotes: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      // If address fields changed, recalculate normalizedAddress
      const updateData: any = { ...input.data };
      if (input.data.address !== undefined) {
        const existing = await getPropertyById(input.id);
        const addr = input.data.address ?? existing?.address ?? "";
        const city = input.data.city !== undefined ? input.data.city : existing?.city;
        const state = input.data.state !== undefined ? input.data.state : existing?.state;
        const zip = input.data.zip !== undefined ? input.data.zip : existing?.zip;
        updateData.normalizedAddress = buildNormalizedKey(addr, city, state, zip);
      }
      await updateProperty(input.id, updateData);
      await logActivity({ userId: ctx.user.id, action: "property_updated", entityType: "property", entityId: input.id });
      return { success: true };
    }),

  // Delete a property (admin only) — blocked if linked records exist
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete properties" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check for linked records
      const [txCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(transactions).where(eq(transactions.propertyId, input.id));
      const [listingCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(listings).where(eq(listings.propertyId, input.id));
      const [cpCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(contactProperties).where(eq(contactProperties.propertyId, input.id));

      const linkedTransactions = Number(txCount?.count ?? 0);
      const linkedListings = Number(listingCount?.count ?? 0);
      const linkedContacts = Number(cpCount?.count ?? 0);

      if (linkedTransactions > 0 || linkedListings > 0 || linkedContacts > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: JSON.stringify({
            type: "PROPERTY_HAS_LINKED_RECORDS",
            linkedTransactions,
            linkedListings,
            linkedContacts,
          }),
        });
      }

      // Safe to delete — also remove ownership records, documents, proformas, tasks, communications
      await db.delete(propertyOwnership).where(eq(propertyOwnership.propertyId, input.id));
      await db.delete(documents).where(eq(documents.relatedPropertyId, input.id));
      await db.delete(proformas).where(eq(proformas.propertyId, input.id));
      await db.delete(properties).where(eq(properties.id, input.id));
      await logActivity({ userId: ctx.user.id, action: "property_deleted", entityType: "property", entityId: input.id });
      return { success: true };
    }),

  // Transfer linked records from one property to another
  transferRecords: protectedProcedure
    .input(z.object({
      fromPropertyId: z.number(),
      toPropertyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can transfer property records" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Transfer transactions
      await db.update(transactions).set({ propertyId: input.toPropertyId }).where(eq(transactions.propertyId, input.fromPropertyId));
      // Transfer listings
      await db.update(listings).set({ propertyId: input.toPropertyId }).where(eq(listings.propertyId, input.fromPropertyId));
      // Transfer contact_properties (avoid duplicates)
      const existingCPs = await db.select({ contactId: contactProperties.contactId }).from(contactProperties).where(eq(contactProperties.propertyId, input.toPropertyId));
      const existingContactIds = new Set(existingCPs.map(r => r.contactId));
      const fromCPs = await db.select().from(contactProperties).where(eq(contactProperties.propertyId, input.fromPropertyId));
      for (const cp of fromCPs) {
        if (!existingContactIds.has(cp.contactId)) {
          await db.insert(contactProperties).values({ contactId: cp.contactId, propertyId: input.toPropertyId, label: cp.label });
        }
      }
      await db.delete(contactProperties).where(eq(contactProperties.propertyId, input.fromPropertyId));
      // Transfer documents
      await db.update(documents).set({ relatedPropertyId: input.toPropertyId }).where(eq(documents.relatedPropertyId, input.fromPropertyId));

      await logActivity({ userId: ctx.user.id, action: "property_records_transferred", entityType: "property", entityId: input.fromPropertyId, details: { toPropertyId: input.toPropertyId } });
      return { success: true };
    }),

  getAssociations: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { transactions: [], listings: [], contacts: [] };
      const txAgent = aliasedTable(users, "txAgent");
      const txContact = aliasedTable(contacts, "txContact");
      const txRows = await db
        .select({ transaction: transactions, agent: txAgent, contact: txContact })
        .from(transactions)
        .leftJoin(txAgent, eq(transactions.agentId, txAgent.id))
        .leftJoin(txContact, eq(transactions.primaryContactId, txContact.id))
        .where(eq(transactions.propertyId, input.propertyId));
      const lAgent = aliasedTable(users, "lAgent");
      const lContact = aliasedTable(contacts, "lContact");
      const listingRows = await db
        .select({ listing: listings, agent: lAgent, contact: lContact })
        .from(listings)
        .leftJoin(lAgent, eq(listings.agentId, lAgent.id))
        .leftJoin(lContact, eq(listings.contactId, lContact.id))
        .where(eq(listings.propertyId, input.propertyId));
      const cpRows = await db
        .select({ cp: contactProperties, contact: contacts })
        .from(contactProperties)
        .leftJoin(contacts, eq(contactProperties.contactId, contacts.id))
        .where(eq(contactProperties.propertyId, input.propertyId));
      const ownerRows = await db
        .select({ po: propertyOwnership, contact: contacts })
        .from(propertyOwnership)
        .leftJoin(contacts, eq(propertyOwnership.ownerContactId, contacts.id))
        .where(eq(propertyOwnership.propertyId, input.propertyId));
      const contactMap = new Map<number, any>();
      for (const r of cpRows) {
        if (r.contact) contactMap.set(r.contact.id, { ...r.contact, relationship: r.cp.label ?? "Linked" });
      }
      for (const r of ownerRows) {
        if (r.contact && !contactMap.has(r.contact.id)) contactMap.set(r.contact.id, { ...r.contact, relationship: "Owner" });
      }
      return {
        transactions: txRows,
        listings: listingRows,
        contacts: Array.from(contactMap.values()),
      };
    }),

  getHistory: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [] };

      // Fetch linked contacts (via contact_properties + property_ownership)
      const cpAgent = aliasedTable(users, "cpUser");
      const cpRows = await db
        .select({ cp: contactProperties, contact: contacts })
        .from(contactProperties)
        .leftJoin(contacts, eq(contactProperties.contactId, contacts.id))
        .where(eq(contactProperties.propertyId, input.propertyId));
      const ownerRows = await db
        .select({ po: propertyOwnership, contact: contacts })
        .from(propertyOwnership)
        .leftJoin(contacts, eq(propertyOwnership.ownerContactId, contacts.id))
        .where(eq(propertyOwnership.propertyId, input.propertyId));

      // Fetch transactions linked to this property
      const txAgent = aliasedTable(users, "txAgent");
      const txContact = aliasedTable(contacts, "txContact");
      const txRows = await db
        .select({ transaction: transactions, agent: txAgent, contact: txContact })
        .from(transactions)
        .leftJoin(txAgent, eq(transactions.agentId, txAgent.id))
        .leftJoin(txContact, eq(transactions.primaryContactId, txContact.id))
        .where(eq(transactions.propertyId, input.propertyId));

      // Fetch listings linked to this property
      const lAgent = aliasedTable(users, "lAgent");
      const lContact = aliasedTable(contacts, "lContact");
      const listingRows = await db
        .select({ listing: listings, agent: lAgent, contact: lContact })
        .from(listings)
        .leftJoin(lAgent, eq(listings.agentId, lAgent.id))
        .leftJoin(lContact, eq(listings.contactId, lContact.id))
        .where(eq(listings.propertyId, input.propertyId));

      // Fetch property-level activity log entries
      const activityRows = await db
        .select({ log: activityLog, user: users })
        .from(activityLog)
        .leftJoin(users, eq(activityLog.userId, users.id))
        .where(eq(activityLog.entityType, "property"))
        .orderBy(desc(activityLog.createdAt))
        .limit(100);
      const propertyActivityRows = activityRows.filter(r => r.log.entityId === input.propertyId);

      // Build a unified chronological event list
      type HistoryEvent = {
        id: string;
        type: "contact_linked" | "contact_owner" | "transaction" | "listing" | "activity";
        date: Date | null;
        title: string;
        subtitle: string;
        outcome?: string;
        outcomeColor?: string;
        contactId?: number;
        transactionId?: number;
        listingId?: number;
        meta?: Record<string, string | number | null>;
      };

      const events: HistoryEvent[] = [];

      // Contact link events
      for (const r of cpRows) {
        if (!r.contact) continue;
        events.push({
          id: `cp-${r.cp.id}`,
          type: "contact_linked",
          date: r.cp.createdAt,
          title: `Linked to ${r.contact.firstName} ${r.contact.lastName}`.trim(),
          subtitle: r.cp.label ?? "Contact",
          contactId: r.contact.id,
        });
      }
      for (const r of ownerRows) {
        if (!r.contact) continue;
        events.push({
          id: `po-${r.po.id}`,
          type: "contact_owner",
          date: r.po.ownershipStartDate ?? r.po.createdAt,
          title: `Owner: ${r.contact.firstName} ${r.contact.lastName}`.trim(),
          subtitle: r.po.ownershipEndDate ? `Owned until ${new Date(r.po.ownershipEndDate).toLocaleDateString()}` : "Current owner",
          contactId: r.contact.id,
          meta: {
            ownershipStart: r.po.ownershipStartDate ? new Date(r.po.ownershipStartDate).toLocaleDateString() : null,
            ownershipEnd: r.po.ownershipEndDate ? new Date(r.po.ownershipEndDate).toLocaleDateString() : null,
            notes: r.po.notes,
          },
        });
      }

      // Transaction events
      const TX_STATUS_LABELS: Record<string, string> = { under_contract: "Under Contract", closed: "Closed", terminated: "Terminated" };
      const TX_OUTCOME_COLORS: Record<string, string> = { closed: "green", terminated: "red", under_contract: "blue" };
      for (const r of txRows) {
        const tx = r.transaction;
        const contactName = r.contact ? `${r.contact.firstName} ${r.contact.lastName}`.trim() : "Unknown contact";
        const agentName = (r.agent as any)?.name ?? "Unknown agent";
        events.push({
          id: `tx-${tx.id}`,
          type: "transaction",
          date: tx.contractDate ?? tx.createdAt,
          title: `Transaction — ${tx.transactionType?.replace(/_/g, " ") ?? ""} (${contactName})`,
          subtitle: `Agent: ${agentName} · ${tx.transactionNumber ?? `#${tx.id}`}`,
          outcome: TX_STATUS_LABELS[tx.status] ?? tx.status,
          outcomeColor: TX_OUTCOME_COLORS[tx.status] ?? "gray",
          transactionId: tx.id,
          contactId: r.contact?.id,
          meta: {
            purchasePrice: tx.purchasePrice ? `$${Number(tx.purchasePrice).toLocaleString()}` : null,
            gci: tx.grossCommissionIncome ? `$${Number(tx.grossCommissionIncome).toLocaleString()}` : null,
            closingDate: tx.closingDate ? new Date(tx.closingDate).toLocaleDateString() : null,
            contractDate: tx.contractDate ? new Date(tx.contractDate).toLocaleDateString() : null,
            terminationReason: tx.terminationReason ?? null,
          },
        });
      }

      // Listing events
      const LISTING_STATUS_LABELS: Record<string, string> = { active: "Active", terminated: "Terminated", expired: "Expired", converted: "Converted to Transaction" };
      const LISTING_OUTCOME_COLORS: Record<string, string> = { active: "blue", converted: "green", terminated: "red", expired: "orange" };
      for (const r of listingRows) {
        const l = r.listing;
        const contactName = r.contact ? `${r.contact.firstName} ${r.contact.lastName}`.trim() : "Unknown contact";
        const agentName = (r.agent as any)?.name ?? "Unknown agent";
        events.push({
          id: `listing-${l.id}`,
          type: "listing",
          date: l.listDate ? new Date(l.listDate) : l.createdAt,
          title: `Listing (${contactName})`,
          subtitle: `Agent: ${agentName}${l.mlsNumber ? ` · MLS ${l.mlsNumber}` : ""}`,
          outcome: LISTING_STATUS_LABELS[l.listingStatus] ?? l.listingStatus,
          outcomeColor: LISTING_OUTCOME_COLORS[l.listingStatus] ?? "gray",
          listingId: l.id,
          contactId: r.contact?.id,
          meta: {
            listPrice: l.listPrice ? `$${Number(l.listPrice).toLocaleString()}` : null,
            listDate: l.listDate ? new Date(l.listDate).toLocaleDateString() : null,
            expirationDate: l.expirationDate ? new Date(l.expirationDate).toLocaleDateString() : null,
            terminationDate: l.terminationDate ? new Date(l.terminationDate).toLocaleDateString() : null,
          },
        });
      }

      // Activity log events (property created/updated)
      for (const r of propertyActivityRows) {
        const actionLabels: Record<string, string> = {
          property_created: "Property created",
          property_updated: "Property details updated",
        };
        events.push({
          id: `activity-${r.log.id}`,
          type: "activity",
          date: r.log.createdAt,
          title: actionLabels[r.log.action] ?? r.log.action.replace(/_/g, " "),
          subtitle: (r.user as any)?.name ? `By ${(r.user as any).name}` : "",
        });
      }

      // Sort all events chronologically (newest first)
      events.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db2 = b.date ? new Date(b.date).getTime() : 0;
        return db2 - da;
      });

      return { events };
    }),

  addOwnership: protectedProcedure
    .input(z.object({
      propertyId: z.number(),
      ownerContactId: z.number(),
      ownershipStartDate: z.string().optional().nullable(),
      ownershipEndDate: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(propertyOwnership).values({
        propertyId: input.propertyId,
        ownerContactId: input.ownerContactId,
        ownershipStartDate: input.ownershipStartDate ? new Date(input.ownershipStartDate) : null,
        ownershipEndDate: input.ownershipEndDate ? new Date(input.ownershipEndDate) : null,
        notes: input.notes,
      });
      return { id: (result as any).insertId };
    }),

  bulkUpload: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        address: z.string(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zip: z.string().optional().nullable(),
        beds: z.string().optional().nullable(),
        baths: z.string().optional().nullable(),
        sqft: z.string().optional().nullable(),
        propertyType: z.string().optional().nullable(),
        yearBuilt: z.string().optional().nullable(),
        listPrice: z.string().optional().nullable(),
        strZoning: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        ownerFirstName: z.string().optional().nullable(),
        ownerLastName: z.string().optional().nullable(),
        ownerEmail: z.string().optional().nullable(),
        ownerPhone: z.string().optional().nullable(),
      }))
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const validPropertyTypes = ["single_family","multi_family","condo","townhouse","cabin","vacation_rental","commercial","land","other"];
      const results: Array<{ row: number; status: "created" | "skipped" | "error"; reason?: string; address?: string }> = [];
      let created = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        const rowNum = i + 1;
        try {
          if (!row.address?.trim()) {
            results.push({ row: rowNum, status: "error", reason: "Address is required" });
            errors++;
            continue;
          }
          // Duplicate check by address
          const { properties: propertiesTable } = await import("../../drizzle/schema");
          const existing = await db.select({ id: propertiesTable.id })
            .from(propertiesTable)
            .where(eq(propertiesTable.address, row.address.trim()))
            .limit(1);
          if (existing.length > 0) {
            results.push({ row: rowNum, status: "skipped", reason: "Property with this address already exists", address: row.address });
            skipped++;
            continue;
          }
          const propType = row.propertyType?.toLowerCase().replace(/ /g, "_");
          const id = await createProperty({
            address: row.address.trim(),
            city: row.city?.trim() || null,
            state: row.state?.trim() || null,
            zip: row.zip?.trim() || null,
            beds: row.beds?.trim() || null,
            baths: row.baths?.trim() || null,
            sqft: row.sqft ? parseInt(row.sqft) || null : null,
            propertyType: (validPropertyTypes.includes(propType ?? "") ? propType : null) as any,
            yearBuilt: row.yearBuilt ? parseInt(row.yearBuilt) || null : null,
            listPrice: row.listPrice?.trim() || null,
            strZoning: row.strZoning?.trim() || null,
            notes: row.notes?.trim() || null,
          } as any);

          // Find or create owner contact and link via propertyOwnership
          if (row.ownerFirstName?.trim() || row.ownerEmail?.trim()) {
            let ownerContactId: number | null = null;
            const ownerConditions: any[] = [];
            if (row.ownerEmail?.trim()) ownerConditions.push(eq(contacts.email, row.ownerEmail.trim()));
            if (row.ownerPhone?.trim()) ownerConditions.push(eq(contacts.phone, row.ownerPhone.trim()));
            if (ownerConditions.length > 0) {
              const [existingOwner] = await db.select({ id: contacts.id }).from(contacts).where(or(...ownerConditions)).limit(1);
              if (existingOwner) ownerContactId = existingOwner.id;
            }
            if (!ownerContactId && row.ownerFirstName?.trim()) {
              ownerContactId = await createContact({
                firstName: row.ownerFirstName.trim(),
                lastName: row.ownerLastName?.trim() || "",
                email: row.ownerEmail?.trim() || null,
                phone: row.ownerPhone?.trim() || null,
              } as any);
            }
            if (ownerContactId) {
              await db.insert(propertyOwnership).values({ propertyId: id, ownerContactId });
            }
          }

          await logActivity({ userId: ctx.user.id, action: "property_created", entityType: "property", entityId: id, details: { address: row.address, source: "bulk_upload" } });
          results.push({ row: rowNum, status: "created", address: row.address });
          created++;
        } catch (err: any) {
          results.push({ row: rowNum, status: "error", reason: err?.message ?? "Unknown error", address: row.address });
          errors++;
        }
      }

      return { created, skipped, errors, results };
    }),

  // ─── Pro-forma CRUD ──────────────────────────────────────────────────────
  listProformas: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(proformas.propertyId, input.propertyId)];
      if (ctx.user.role === "agent") {
        conditions.push(eq(proformas.createdByUserId, ctx.user.id));
      }
      const rows = await db.select({
        id: proformas.id,
        propertyId: proformas.propertyId,
        createdByUserId: proformas.createdByUserId,
        title: proformas.title,
        purchasePrice: proformas.purchasePrice,
        cashOnCash: proformas.cashOnCash,
        capRate: proformas.capRate,
        createdAt: proformas.createdAt,
        updatedAt: proformas.updatedAt,
        creatorName: users.name,
      }).from(proformas)
        .leftJoin(users, eq(proformas.createdByUserId, users.id))
        .where(and(...conditions))
        .orderBy(desc(proformas.createdAt));
      return rows;
    }),

  getProforma: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(proformas).where(eq(proformas.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "agent" && row.createdByUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return row;
    }),

  createProforma: protectedProcedure
    .input(z.object({
      propertyId: z.number(),
      title: z.string().optional().nullable(),
      formData: z.any(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const fd = input.formData || {};
      const [result] = await db.insert(proformas).values({
        propertyId: input.propertyId,
        createdByUserId: ctx.user.id,
        title: input.title || "Untitled Pro-forma",
        formData: fd,
        purchasePrice: fd.purchasePrice || null,
        grossRevenue: fd._calcGrossRevenue || null,
        noiAnnual: fd._calcNoi || null,
        cashFlowAnnual: fd._calcCashFlow || null,
        cashOnCash: fd._calcCashOnCash || null,
        capRate: fd._calcCapRate || null,
        notes: input.notes,
      } as any);
      await logActivity({ userId: ctx.user.id, action: "proforma_created", entityType: "property", entityId: input.propertyId });
      return { id: (result as any).insertId };
    }),

  updateProforma: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional().nullable(),
      formData: z.any(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(proformas).where(eq(proformas.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "agent" && existing.createdByUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const fd = input.formData || {};
      await db.update(proformas).set({
        title: input.title ?? existing.title,
        formData: fd,
        purchasePrice: fd.purchasePrice || null,
        grossRevenue: fd._calcGrossRevenue || null,
        noiAnnual: fd._calcNoi || null,
        cashFlowAnnual: fd._calcCashFlow || null,
        cashOnCash: fd._calcCashOnCash || null,
        capRate: fd._calcCapRate || null,
        notes: input.notes ?? existing.notes,
      } as any).where(eq(proformas.id, input.id));
      return { success: true };
    }),

  deleteProforma: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(proformas).where(eq(proformas.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role === "agent" && existing.createdByUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.delete(proformas).where(eq(proformas.id, input.id));
      return { success: true };
    }),

  // Get agent branding info for pro-forma PDF
  getAgentBranding: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const targetUserId = input.userId ?? ctx.user.id;
      const { userProfiles, marketProfiles } = await import("../../drizzle/schema");
      const [userRow] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!userRow) return null;
      const [profileRow] = await db.select().from(userProfiles).where(eq(userProfiles.userId, targetUserId)).limit(1);
      let marketName: string | null = null;
      if (userRow.marketProfileId) {
        const [mRow] = await db.select({ name: marketProfiles.name, state: marketProfiles.state }).from(marketProfiles).where(eq(marketProfiles.id, userRow.marketProfileId)).limit(1);
        if (mRow) marketName = `${mRow.name}, ${mRow.state}`;
      }
      return {
        name: userRow.name,
        email: userRow.email,
        phone: userRow.phone ?? profileRow?.primaryPhone ?? null,
        profilePhotoUrl: profileRow?.profilePhotoUrl ?? null,
        callBookingLink: userRow.callBookingLink ?? null,
        market: marketName,
      };
    }),

  // ─── List All Comps (for Import Existing Comps) ──────────────────────────────
  listAllComps: protectedProcedure
    .input(z.object({ isAdmin: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      // Get all proformas (admin sees all, agent sees only theirs)
      let rows: any;
      if (input?.isAdmin && ctx.user.role === "admin") {
        const result = await db.execute(sql`SELECT p.formData, p.createdByUserId, u.name as userName FROM proformas p LEFT JOIN users u ON p.createdByUserId = u.id`);
        rows = result[0];
      } else {
        const result = await db.execute(sql`SELECT p.formData, p.createdByUserId, u.name as userName FROM proformas p LEFT JOIN users u ON p.createdByUserId = u.id WHERE p.createdByUserId = ${ctx.user.id}`);
        rows = result[0];
      }
      // Extract comps from each proforma's formData
      const allComps: any[] = [];
      for (const row of (rows as any[])) {
        try {
          const formData = typeof row.formData === "string" ? JSON.parse(row.formData) : row.formData;
          const comps = formData?.comps || [];
          for (const comp of comps) {
            if (comp.name || comp.annualRevenue || comp.adr) {
              allComps.push({ ...comp, addedBy: row.userName || "Unknown" });
            }
          }
        } catch {}
      }
      return allComps;
    }),

  // ─── Pro-forma Defaults (per user) ─────────────────────────────────────────
  getProformaDefaults: protectedProcedure
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      // Admin can view any user's defaults
      const targetUserId = (ctx.user.role === "admin" && input?.userId) ? input.userId : ctx.user.id;
      const [row] = await db.execute(sql`SELECT defaults FROM proforma_defaults WHERE userId = ${targetUserId} LIMIT 1`);
      return (row as any)?.defaults ? JSON.parse((row as any).defaults) : null;
    }),

  saveProformaDefaults: protectedProcedure
    .input(z.object({ defaults: z.any(), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Admin can save for any user
      const targetUserId = (ctx.user.role === "admin" && input.userId) ? input.userId : ctx.user.id;
      const jsonStr = JSON.stringify(input.defaults);
      await db.execute(sql`INSERT INTO proforma_defaults (userId, \`defaults\`) VALUES (${targetUserId}, ${jsonStr}) ON DUPLICATE KEY UPDATE \`defaults\` = ${jsonStr}`);
      return { success: true };
    }),
});
