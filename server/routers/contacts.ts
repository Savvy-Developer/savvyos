import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createContact,
  createCommunication,
  getCommunications,
  getContactById,
  getContacts,
  getDb,
  logActivity,
  updateContact,
  archiveContact,
  deleteContact,
} from "../db";
import { contacts as contactsTable, leadSources, tasks as tasksTable, communications as commsTable, agentConnections as agentConnectionsTable, transactions as txTable, taskNotes as taskNotesTable, transactionNotes as txNotesTable, listings, properties, contactProperties, activityLog, users, connectionRequests as connectionRequestsTable } from "../../drizzle/schema";
import { eq, or, and, desc, like, isNull, aliasedTable, notInArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { triggerSmartPlansForContact } from "../smartPlanScheduler";
import { invokeLLM } from "../_core/llm";
import { sendTransactionalEmail } from "../_core/resendEmail";

const contactInput = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.union([z.string().email("Please enter a valid email address"), z.literal("")]).optional().nullable(),
  phone: z.string().optional().nullable(),
  secondaryEmail: z.union([z.string().email("Invalid email address"), z.literal("")]).optional().nullable(),
  secondaryPhone: z.string().optional().nullable(),
  // address/city/state/zip removed — use Properties tab instead
  spouseFirstName: z.string().optional().nullable(),
  spouseLastName: z.string().optional().nullable(),
  spouseEmail: z.union([z.string().email("Invalid email address"), z.literal("")]).optional().nullable(),
  spousePhone: z.string().optional().nullable(),
  leadSourceId: z.number().optional().nullable(),
  leadSourceType: z.enum(["referral", "paid_lead", "paid_partnership", "organic", "sphere"]).optional().nullable(),
  referralPartnerId: z.number().optional().nullable(),
  campaignSource: z.string().optional().nullable(),
  partnershipName: z.string().optional().nullable(),
  assignedIsaId: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  isaStatus: z.enum(["new_lead","attempted_contact","nurture","active_client","under_contract","closed","dead"]).optional().nullable(),
  timezone: z.enum(["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Anchorage","Pacific/Honolulu"]).optional().nullable(),
});

export const contactsRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      isaId: z.number().optional(),
      agentId: z.number().optional(), // admin can filter by specific agent
      marketId: z.number().optional(), // filter by agent's market
      leadSourceId: z.number().optional(), // filter by lead source
      isaStatus: z.enum(["new_lead","attempted_contact","nurture","active_client","under_contract","closed","dead"]).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(25),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }))
    .query(async ({ input, ctx }) => {
      // Agents only see contacts they have an agent connection with; admins can filter by agentId
      const agentId = ctx.user.role === "agent" ? ctx.user.id : input.agentId;
      return getContacts(input.search, input.isaId, agentId, input.page, input.limit, input.isaStatus, input.marketId, input.leadSourceId, input.sortOrder);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const contact = await getContactById(input.id);
      if (!contact) throw new TRPCError({ code: "NOT_FOUND" });
      return contact;
    }),

  create: protectedProcedure
    .input(contactInput)
    .mutation(async ({ input, ctx }) => {
      // Check for duplicate email or phone
      const db = await getDb();
      if (db) {
        const conditions = [];
        if (input.email) conditions.push(eq(contactsTable.email, input.email));
        if (input.phone) conditions.push(eq(contactsTable.phone, input.phone));
        if (conditions.length > 0) {
          const existing = await db.select({ id: contactsTable.id, email: contactsTable.email, phone: contactsTable.phone })
            .from(contactsTable)
            .where(or(...conditions))
            .limit(1);
          if (existing.length > 0) {
            const match = existing[0];
            const reason = match.email === input.email ? "email address" : "phone number";
            throw new TRPCError({ code: "CONFLICT", message: `A contact with this ${reason} already exists` });
          }
        }
      }
      const id = await createContact(input as any);
      await logActivity({
        userId: ctx.user.id,
        action: "contact_created",
        entityType: "contact",
        entityId: id,
        details: { name: `${input.firstName} ${input.lastName}` },
      });
      // Trigger Smart Plans for this contact's lead source (fire-and-forget)
      if (input.leadSourceId) {
        triggerSmartPlansForContact(id, input.leadSourceId).catch((err) =>
          console.error("[SmartPlan] Trigger error for contact", id, err)
        );
      }
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: contactInput.partial() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch old values before updating so we can log a proper diff
      const oldContact = await getContactById(input.id);
      const oldData = (oldContact as any)?.contact ?? oldContact ?? {};

      // Auto-set isaStatus to 'new_lead' when an ISA is first assigned and no status is set
      const updateData = { ...input.data } as any;
      if (
        input.data.assignedIsaId != null &&
        !oldData.assignedIsaId &&
        !input.data.isaStatus &&
        !oldData.isaStatus
      ) {
        updateData.isaStatus = "new_lead";
      }
      // Clear isaStatus when ISA is removed
      if (input.data.assignedIsaId === null && oldData.assignedIsaId) {
        updateData.isaStatus = null;
      }

      await updateContact(input.id, updateData);

      // Build a human-readable diff of only the fields that actually changed
      const FIELD_LABELS: Record<string, string> = {
        firstName: "First name",
        lastName: "Last name",
        email: "Email",
        phone: "Phone",
        secondaryEmail: "Secondary email",
        secondaryPhone: "Secondary phone",
        spouseFirstName: "Spouse first name",
        spouseLastName: "Spouse last name",
        spouseEmail: "Spouse email",
        spousePhone: "Spouse phone",
        notes: "Notes",
        assignedIsaId: "Assigned ISA",
        leadSourceId: "Lead source",
        leadSourceType: "Lead source type",
        campaignSource: "Campaign source",
        partnershipName: "Partnership name",
        tags: "Tags",
        isaStatus: "ISA pipeline status",
        timezone: "Time zone",
      };

      // Resolve lead source names for better history display
      const resolveLeadSourceName = async (id: number | null | undefined): Promise<string | null> => {
        if (!id) return null;
        const db2 = await getDb();
        if (!db2) return String(id);
        const result = await db2.select({ name: leadSources.name, parentId: leadSources.parentId }).from(leadSources).where(eq(leadSources.id, id)).limit(1);
        if (!result[0]) return String(id);
        if (result[0].parentId) {
          const parent = await db2.select({ name: leadSources.name }).from(leadSources).where(eq(leadSources.id, result[0].parentId)).limit(1);
          return parent[0] ? `${parent[0].name} \u2192 ${result[0].name}` : result[0].name;
        }
        return result[0].name;
      };

      const changes: Array<{ field: string; from: unknown; to: unknown }> = [];
      for (const [key, newVal] of Object.entries(updateData)) {
        const oldVal = (oldData as Record<string, unknown>)[key];
        const normalizedOld = oldVal === undefined ? null : oldVal;
        const normalizedNew = newVal === undefined ? null : newVal;
        const oldStr = JSON.stringify(normalizedOld);
        const newStr = JSON.stringify(normalizedNew);
        if (oldStr !== newStr) {
          if (key === "leadSourceId") {
            const oldName = await resolveLeadSourceName(normalizedOld as number | null);
            const newName = await resolveLeadSourceName(normalizedNew as number | null);
            changes.push({ field: FIELD_LABELS[key] ?? key, from: oldName, to: newName });
          } else {
            changes.push({ field: FIELD_LABELS[key] ?? key, from: normalizedOld, to: normalizedNew });
          }
        }
      }

      await logActivity({
        userId: ctx.user.id,
        action: "contact_updated",
        entityType: "contact",
        entityId: input.id,
        details: changes.length > 0 ? { changes } : { note: "No fields changed" },
      });
      return { success: true };
    }),

  getCommunications: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      return getCommunications({ contactId: input.contactId });
    }),

  addNote: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      type: z.enum(["note", "call", "email", "sms", "meeting", "voice_note"]),
      subject: z.string().optional(),
      body: z.string(),
      direction: z.enum(["inbound", "outbound", "internal"]).optional(),
      agentConnectionId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await createCommunication({
        type: input.type,
        subject: input.subject,
        body: input.body,
        direction: input.direction ?? "internal",
        authorId: ctx.user.id,
        relatedContactId: input.contactId,
        relatedAgentConnectionId: input.agentConnectionId,
      });
      return { id };
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await archiveContact(input.id);
      await logActivity({
        userId: ctx.user.id,
        action: "contact_archived",
        entityType: "contact",
        entityId: input.id,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await deleteContact(input.id);
      return { success: true };
    }),

  bulkAssignIsa: protectedProcedure
    .input(z.object({
      contactIds: z.array(z.number()).min(1).max(200),
      isaId: z.number().nullable(), // null = unassign
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "isa") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins and ISAs can bulk-assign" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let updated = 0;
      for (const id of input.contactIds) {
        const old = await getContactById(id);
        const oldData = (old as any)?.contact ?? old ?? {};
        const updateData: Record<string, unknown> = { assignedIsaId: input.isaId };
        // Auto-set isaStatus to new_lead when first assigning
        if (input.isaId != null && !oldData.assignedIsaId && !oldData.isaStatus) {
          updateData.isaStatus = "new_lead";
        }
        // Clear isaStatus when unassigning
        if (input.isaId === null && oldData.assignedIsaId) {
          updateData.isaStatus = null;
        }
        await updateContact(id, updateData as any);
        await logActivity({
          userId: ctx.user.id,
          action: "contact_updated",
          entityType: "contact",
          entityId: id,
          details: { changes: [{ field: "Assigned ISA", from: oldData.assignedIsaId, to: input.isaId }] },
        });
        updated++;
      }
      return { updated };
    }),

  getAiSummary: protectedProcedure
    .input(z.object({ id: z.number(), forceRefresh: z.boolean().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check cache: if summary exists and is less than 7 days old, return it
      const [row] = await db
        .select({ aiSummary: contactsTable.aiSummary, aiSummaryUpdatedAt: contactsTable.aiSummaryUpdatedAt })
        .from(contactsTable)
        .where(eq(contactsTable.id, input.id))
        .limit(1);

      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const isCacheValid = row?.aiSummary && row.aiSummaryUpdatedAt && row.aiSummaryUpdatedAt > oneWeekAgo;

      if (isCacheValid && !input.forceRefresh) {
        return { summary: row!.aiSummary!, updatedAt: row!.aiSummaryUpdatedAt!, cached: true };
      }

      // Gather all data for the contact
      const contactRow = await getContactById(input.id);
      if (!contactRow) throw new TRPCError({ code: "NOT_FOUND" });
      const contact = contactRow.contact;
      const leadSource = contactRow.leadSource;

      // Fetch tasks for this contact
      const contactTasks = await db
        .select({ task: tasksTable, assignedTo: { id: agentConnectionsTable.agentId } })
        .from(tasksTable)
        .leftJoin(agentConnectionsTable, eq(tasksTable.relatedAgentConnectionId, agentConnectionsTable.id))
        .where(eq(tasksTable.relatedContactId, input.id))
        .orderBy(desc(tasksTable.createdAt))
        .limit(30);

      // Fetch task notes for each task
      const taskNotesList: Array<{ taskId: number; content: string; createdAt: Date }> = [];
      for (const { task } of contactTasks.slice(0, 10)) {
        const notes = await db
          .select({ content: taskNotesTable.content, createdAt: taskNotesTable.createdAt })
          .from(taskNotesTable)
          .where(eq(taskNotesTable.taskId, task.id))
          .limit(5);
        notes.forEach(n => taskNotesList.push({ taskId: task.id, content: n.content, createdAt: n.createdAt }));
      }

      // Fetch communications
      const contactComms = await db
        .select({ comm: commsTable })
        .from(commsTable)
        .where(eq(commsTable.relatedContactId, input.id))
        .orderBy(desc(commsTable.communicatedAt))
        .limit(20);

      // Fetch agent connections (with buy box)
      const agentConns = await db
        .select({ conn: agentConnectionsTable })
        .from(agentConnectionsTable)
        .where(eq(agentConnectionsTable.contactId, input.id))
        .limit(10);

      // Fetch transactions for this contact
      const contactTxs = await db
        .select({ tx: txTable })
        .from(txTable)
        .where(eq(txTable.primaryContactId, input.id))
        .orderBy(desc(txTable.createdAt))
        .limit(10);

      // Fetch transaction notes
      const txNotesList: Array<{ txId: number; content: string; createdAt: Date }> = [];
      for (const { tx } of contactTxs.slice(0, 5)) {
        const notes = await db
          .select({ content: txNotesTable.content, createdAt: txNotesTable.createdAt })
          .from(txNotesTable)
          .where(eq(txNotesTable.transactionId, tx.id))
          .limit(5);
        notes.forEach(n => txNotesList.push({ txId: tx.id, content: n.content, createdAt: n.createdAt }));
      }

      // Build the prompt
      const contactName = `${contact.firstName} ${contact.lastName}`;
      const leadSourceLabel = leadSource
        ? (leadSource.parentName ? `${leadSource.parentName} › ${leadSource.name}` : leadSource.name)
        : (contact.leadSourceType ?? "Unknown");

      const lastComm = contactComms[0]?.comm;
      const lastContact = lastComm
        ? `${new Date(lastComm.communicatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} (${lastComm.type})`
        : "No contact recorded";

      const agentsWhoTalked = agentConns.map(a => `Agent ID ${a.conn.agentId} (status: ${a.conn.pipelineStatus})`).join(", ") || "No agents assigned";

      const buyBoxes = agentConns
        .filter(a => a.conn.minPrice || a.conn.maxPrice || a.conn.propertyType)
        .map(a => {
          const parts = [];
          if (a.conn.propertyType) parts.push(`Type: ${a.conn.propertyType}`);
          if (a.conn.minPrice || a.conn.maxPrice) parts.push(`Price: $${Number(a.conn.minPrice ?? 0).toLocaleString()} - $${Number(a.conn.maxPrice ?? 0).toLocaleString()}`);
          if (a.conn.minBeds) parts.push(`${a.conn.minBeds}+ beds`);
          if (a.conn.targetCities?.length) parts.push(`Cities: ${a.conn.targetCities.join(", ")}`);
          if (a.conn.strRequirements) parts.push(`STR: ${a.conn.strRequirements}`);
          if (a.conn.investmentNotes) parts.push(`Investment: ${a.conn.investmentNotes}`);
          return parts.join("; ");
        })
        .join(" | ") || "No buy box defined";

      const tasksSummary = contactTasks.slice(0, 15).map(({ task }) => {
        const notes = taskNotesList.filter(n => n.taskId === task.id).map(n => n.content).join("; ");
        return `- [${task.status}] ${task.title}${task.dueDate ? ` (due ${new Date(task.dueDate).toLocaleDateString()})` : ""}${notes ? ` | Notes: ${notes}` : ""}`;
      }).join("\n") || "No tasks";

      const commsSummary = contactComms.slice(0, 10).map(({ comm }) =>
        `- ${new Date(comm.communicatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} [${comm.type}${comm.direction ? "/" + comm.direction : ""}]: ${comm.subject || ""} ${comm.body ? comm.body.slice(0, 200) : ""}`
      ).join("\n") || "No communications logged";

      const txSummary = contactTxs.map(({ tx }) => {
        const notes = txNotesList.filter(n => n.txId === tx.id).map(n => n.content).join("; ");
        return `- ${tx.transactionNumber ?? "TX"} [${tx.status}] ${tx.transactionType} ${tx.purchasePrice ? `$${Number(tx.purchasePrice).toLocaleString()}` : ""} ${tx.closingDate ? `closed ${new Date(tx.closingDate).toLocaleDateString()}` : ""}${notes ? ` | Notes: ${notes}` : ""}`;
      }).join("\n") || "No transactions";

      const systemPrompt = `You are an expert real estate CRM analyst. Your job is to produce a concise, insightful AI summary for a lead/contact record. The summary should be written in clear, professional prose (2-4 short paragraphs) and cover:
1. Who this person is and what they are looking for (property type, price range, cities, investment goals, STR requirements, etc.)
2. Their engagement history — when was the last time anyone made contact, what was discussed, and which agents or ISAs have worked with them
3. Their current pipeline status and any notable tasks or follow-ups
4. A recommended next outreach action based on all available context

Be specific and actionable. Use the data provided. Do not invent facts. If data is missing, note it briefly and move on. Write as if briefing a sales manager before a team meeting.`;

      const userPrompt = `Contact: ${contactName}
Lead Source: ${leadSourceLabel}
ISA Status: ${contact.isaStatus ?? "Not set"}
Contact Notes: ${contact.notes ?? "None"}
Last Contact: ${lastContact}
Agents/ISAs Who Have Worked With Them: ${agentsWhoTalked}

Buy Box / What They're Looking For:
${buyBoxes}

Recent Communications (newest first):
${commsSummary}

Tasks:
${tasksSummary}

Transactions:
${txSummary}

Please write the AI summary now.`;

      let summary = "";
      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        });
        summary = (response.choices?.[0]?.message?.content as string) ?? "Unable to generate summary.";
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI summary generation failed" });
      }

      // Cache the summary
      await db.update(contactsTable)
        .set({ aiSummary: summary, aiSummaryUpdatedAt: now })
        .where(eq(contactsTable.id, input.id));

      return { summary, updatedAt: now, cached: false };
    }),

  getHistory: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [] };

      // Fetch all transactions for this contact (as primary or seller)
      const txAgent = aliasedTable(users, "txAgent");
      const txRows = await db
        .select({ tx: txTable, agent: txAgent })
        .from(txTable)
        .leftJoin(txAgent, eq(txTable.agentId, txAgent.id))
        .where(or(eq(txTable.primaryContactId, input.contactId), eq(txTable.sellerContactId, input.contactId)))
        .orderBy(desc(txTable.createdAt));

      // Fetch all listings for this contact
      const lAgent = aliasedTable(users, "lAgent");
      const listingRows = await db
        .select({ listing: listings, agent: lAgent })
        .from(listings)
        .leftJoin(lAgent, eq(listings.agentId, lAgent.id))
        .where(eq(listings.contactId, input.contactId))
        .orderBy(desc(listings.createdAt));

      // Fetch linked properties
      const propRows = await db
        .select({ cp: contactProperties, property: properties })
        .from(contactProperties)
        .leftJoin(properties, eq(contactProperties.propertyId, properties.id))
        .where(eq(contactProperties.contactId, input.contactId));

      // Fetch communications (last 50)
      const commRows = await db
        .select({ comm: commsTable, author: users })
        .from(commsTable)
        .leftJoin(users, eq(commsTable.authorId, users.id))
        .where(eq(commsTable.relatedContactId, input.contactId))
        .orderBy(desc(commsTable.communicatedAt))
        .limit(50);

      // Fetch activity log for this contact
      const actRows = await db
        .select({ log: activityLog, user: users })
        .from(activityLog)
        .leftJoin(users, eq(activityLog.userId, users.id))
        .where(and(eq(activityLog.entityType, "contact"), eq(activityLog.entityId, input.contactId)))
        .orderBy(desc(activityLog.createdAt))
        .limit(50);

      type HistoryEvent = {
        id: string;
        type: "transaction" | "listing" | "property_linked" | "communication" | "activity";
        date: Date | null;
        title: string;
        subtitle: string;
        outcome?: string;
        outcomeColor?: string;
        transactionId?: number;
        listingId?: number;
        propertyId?: number;
        linkedTransactionId?: number;
        meta?: Record<string, string | number | null>;
      };

      const events: HistoryEvent[] = [];

      const TX_STATUS_LABELS: Record<string, string> = { under_contract: "Under Contract", closed: "Closed", terminated: "Terminated" };
      const TX_OUTCOME_COLORS: Record<string, string> = { closed: "green", terminated: "red", under_contract: "blue" };
      for (const r of txRows) {
        const tx = r.tx;
        const agentName = (r.agent as any)?.name ?? "Unknown agent";
        events.push({
          id: `tx-${tx.id}`,
          type: "transaction",
          date: tx.contractDate ?? tx.createdAt,
          title: `Transaction — ${(tx.transactionType ?? "").replace(/_/g, " ")} (${tx.transactionNumber ?? `#${tx.id}`})`,
          subtitle: `Agent: ${agentName}`,
          outcome: TX_STATUS_LABELS[tx.status] ?? tx.status,
          outcomeColor: TX_OUTCOME_COLORS[tx.status] ?? "gray",
          transactionId: tx.id,
          meta: {
            purchasePrice: tx.purchasePrice ? `$${Number(tx.purchasePrice).toLocaleString()}` : null,
            gci: tx.grossCommissionIncome ? `$${Number(tx.grossCommissionIncome).toLocaleString()}` : null,
            closingDate: tx.closingDate ? new Date(tx.closingDate).toLocaleDateString() : null,
            contractDate: tx.contractDate ? new Date(tx.contractDate).toLocaleDateString() : null,
            terminationReason: tx.terminationReason ?? null,
            fromListingId: tx.listingId ?? null,
          },
        });
      }

      const LISTING_STATUS_LABELS: Record<string, string> = { active: "Active", terminated: "Terminated", expired: "Expired", converted: "Converted to Transaction" };
      const LISTING_OUTCOME_COLORS: Record<string, string> = { active: "blue", converted: "green", terminated: "red", expired: "orange" };
      for (const r of listingRows) {
        const l = r.listing;
        const agentName = (r.agent as any)?.name ?? "Unknown agent";
        events.push({
          id: `listing-${l.id}`,
          type: "listing",
          date: l.listDate ?? l.createdAt,
          title: `Listing${l.mlsNumber ? ` · MLS ${l.mlsNumber}` : ""}`,
          subtitle: `Agent: ${agentName}`,
          outcome: LISTING_STATUS_LABELS[l.listingStatus] ?? l.listingStatus,
          outcomeColor: LISTING_OUTCOME_COLORS[l.listingStatus] ?? "gray",
          listingId: l.id,
          linkedTransactionId: l.convertedTransactionId ?? undefined,
          meta: {
            listPrice: l.listPrice ? `$${Number(l.listPrice).toLocaleString()}` : null,
            listDate: l.listDate ? new Date(l.listDate).toLocaleDateString() : null,
            expirationDate: l.expirationDate ? new Date(l.expirationDate).toLocaleDateString() : null,
          },
        });
      }

      for (const r of propRows) {
        if (!r.property) continue;
        events.push({
          id: `prop-${r.cp.id}`,
          type: "property_linked",
          date: r.cp.createdAt,
          title: `Property linked: ${r.property.address ?? "Unknown address"}`,
          subtitle: `${r.property.city ?? ""}${r.property.state ? `, ${r.property.state}` : ""}`.trim(),
          propertyId: r.property.id,
          meta: { label: r.cp.label ?? null },
        });
      }

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

      const ACTION_LABELS: Record<string, string> = {
        contact_created: "Contact created",
        contact_updated: "Contact details updated",
        isa_status_updated: "ISA status updated",
        contact_archived: "Contact archived",
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

      events.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db2 = b.date ? new Date(b.date).getTime() : 0;
        return db2 - da;
      });

      return { events };
    }),

  bulkUpload: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        secondaryEmail: z.string().optional().nullable(),
        secondaryPhone: z.string().optional().nullable(),
        address: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zip: z.string().optional().nullable(),
        spouseFirstName: z.string().optional().nullable(),
        spouseLastName: z.string().optional().nullable(),
        spouseEmail: z.string().optional().nullable(),
        spousePhone: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        tags: z.string().optional().nullable(), // comma-separated
        leadSourceType: z.preprocess(
          (v) => (v === "" || v === undefined ? null : v),
          z.enum(["referral","paid_lead","paid_partnership","organic","sphere"]).nullable()
        ),
        campaignSource: z.string().optional().nullable(),
        isaStatus: z.preprocess(
          (v) => (v === "" || v === undefined ? null : v),
          z.enum(["new_lead","attempted_contact","nurture","active_client","under_contract","closed","dead"]).nullable()
        ),
      }))
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const results: Array<{ row: number; status: "created" | "skipped" | "error"; reason?: string; name?: string }> = [];
      let created = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        const rowNum = i + 1;
        try {
          if (!row.firstName?.trim() || !row.lastName?.trim()) {
            results.push({ row: rowNum, status: "error", reason: "First name and last name are required" });
            errors++;
            continue;
          }
          // Duplicate check by email or phone
          const conditions = [];
          if (row.email?.trim()) conditions.push(eq(contactsTable.email, row.email.trim()));
          if (row.phone?.trim()) conditions.push(eq(contactsTable.phone, row.phone.trim()));
          if (conditions.length > 0) {
            const existing = await db.select({ id: contactsTable.id })
              .from(contactsTable)
              .where(or(...conditions))
              .limit(1);
            if (existing.length > 0) {
              results.push({ row: rowNum, status: "skipped", reason: "Duplicate email or phone", name: `${row.firstName} ${row.lastName}` });
              skipped++;
              continue;
            }
          }
          const tags = row.tags ? row.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
          const id = await createContact({
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            email: row.email?.trim() || null,
            phone: row.phone?.trim() || null,
            secondaryEmail: row.secondaryEmail?.trim() || null,
            secondaryPhone: row.secondaryPhone?.trim() || null,
            address: row.address?.trim() || null,
            city: row.city?.trim() || null,
            state: row.state?.trim() || null,
            zip: row.zip?.trim() || null,
            spouseFirstName: row.spouseFirstName?.trim() || null,
            spouseLastName: row.spouseLastName?.trim() || null,
            spouseEmail: row.spouseEmail?.trim() || null,
            spousePhone: row.spousePhone?.trim() || null,
            notes: row.notes?.trim() || null,
            tags: tags ?? null,
            leadSourceType: (row.leadSourceType as any) ?? null,
            campaignSource: row.campaignSource?.trim() || null,
            isaStatus: (row.isaStatus as any) ?? null,
          } as any);
          await logActivity({ userId: ctx.user.id, action: "contact_created", entityType: "contact", entityId: id, details: { name: `${row.firstName} ${row.lastName}`, source: "bulk_upload" } });
          results.push({ row: rowNum, status: "created", name: `${row.firstName} ${row.lastName}` });
          created++;
        } catch (err: any) {
          results.push({ row: rowNum, status: "error", reason: err?.message ?? "Unknown error", name: `${row.firstName} ${row.lastName}` });
          errors++;
        }
      }

      return { created, skipped, errors, results };
    }),

  checkDuplicate: protectedProcedure
    .input(z.object({
      email: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      firstName: z.string().optional().nullable(),
      lastName: z.string().optional().nullable(),
      excludeId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { emailPhoneMatches: [], nameMatches: [] };

      // Hard-block: exact email or phone match
      const hardConditions: any[] = [];
      if (input.email && input.email.trim()) {
        hardConditions.push(eq(contactsTable.email, input.email.trim()));
      }
      if (input.phone && input.phone.trim()) {
        const cleanPhone = input.phone.replace(/\D/g, "");
        if (cleanPhone.length >= 7) {
          hardConditions.push(like(contactsTable.phone, `%${cleanPhone.slice(-10)}%`));
        }
      }
      let emailPhoneMatches: { id: number; firstName: string; lastName: string; email: string | null; phone: string | null }[] = [];
      if (hardConditions.length > 0) {
        const rows = await db
          .select({ id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName, email: contactsTable.email, phone: contactsTable.phone })
          .from(contactsTable)
          .where(and(isNull(contactsTable.archivedAt), or(...hardConditions)))
          .limit(5);
        emailPhoneMatches = input.excludeId ? rows.filter((r) => r.id !== input.excludeId) : rows;
      }

      // Soft-warn: exact first+last name match
      let nameMatches: { id: number; firstName: string; lastName: string; email: string | null; phone: string | null }[] = [];
      if (input.firstName && input.lastName) {
        const rows = await db
          .select({ id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName, email: contactsTable.email, phone: contactsTable.phone })
          .from(contactsTable)
          .where(and(
            isNull(contactsTable.archivedAt),
            eq(contactsTable.firstName, input.firstName.trim()),
            eq(contactsTable.lastName, input.lastName.trim()),
          ))
          .limit(5);
        const filtered = input.excludeId ? rows.filter((r) => r.id !== input.excludeId) : rows;
        const hardIds = new Set(emailPhoneMatches.map((r) => r.id));
        nameMatches = filtered.filter((r) => !hardIds.has(r.id));
      }

      return { emailPhoneMatches, nameMatches };
    }),

  // Search contacts that the current agent does NOT yet have a connection with
  // Used by the "Request Connection" dialog on the agent profile page
  searchForRequest: protectedProcedure
    .input(z.object({ search: z.string().min(1), agentId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      // Determine which agent we're searching on behalf of
      const targetAgentId = ctx.user.role === "agent" ? ctx.user.id : (input.agentId ?? ctx.user.id);
      // Find contacts already connected to this agent
      const connected = await db
        .select({ contactId: agentConnectionsTable.contactId })
        .from(agentConnectionsTable)
        .where(eq(agentConnectionsTable.agentId, targetAgentId));
      const connectedIds = connected.map(r => r.contactId).filter(Boolean) as number[];
      // Find contacts with pending requests from this agent
      const pending = await db
        .select({ contactId: connectionRequestsTable.contactId })
        .from(connectionRequestsTable)
        .where(and(eq(connectionRequestsTable.agentId, targetAgentId), eq(connectionRequestsTable.status, "pending")));
      const pendingIds = pending.map(r => r.contactId).filter(Boolean) as number[];
      const excludeIds = Array.from(new Set([...connectedIds, ...pendingIds]));
      const term = `%${input.search}%`;
      const baseWhere = and(
        isNull(contactsTable.archivedAt),
        or(
          like(contactsTable.firstName, term),
          like(contactsTable.lastName, term),
          like(contactsTable.email, term),
          like(contactsTable.phone, term),
        ),
      );
      const rows = await db
        .select({
          id: contactsTable.id,
          firstName: contactsTable.firstName,
          lastName: contactsTable.lastName,
          email: contactsTable.email,
          phone: contactsTable.phone,
          isaStatus: contactsTable.isaStatus,
        })
        .from(contactsTable)
        .where(excludeIds.length > 0 ? and(baseWhere, notInArray(contactsTable.id, excludeIds)) : baseWhere)
        .limit(10);
      return rows;
    }),

  statusCounts: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "agent") return { counts: [], total: 0, newLast30: 0, noEmail: 0, noPhone: 0 };
    const db = await getDb();
    if (!db) return { counts: [], total: 0, newLast30: 0, noEmail: 0, noPhone: 0 };
    const { sql: sqlFn } = await import("drizzle-orm");
    const counts = await db
      .select({ isaStatus: contactsTable.isaStatus, count: sqlFn<number>`COUNT(*)` })
      .from(contactsTable)
      .where(isNull(contactsTable.archivedAt))
      .groupBy(contactsTable.isaStatus);
    const [totals] = await db
      .select({
        total: sqlFn<number>`COUNT(*)`,
        newLast30: sqlFn<number>`SUM(CASE WHEN ${contactsTable.createdAt} >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END)`,
        noEmail: sqlFn<number>`SUM(CASE WHEN ${contactsTable.email} IS NULL THEN 1 ELSE 0 END)`,
        noPhone: sqlFn<number>`SUM(CASE WHEN ${contactsTable.phone} IS NULL THEN 1 ELSE 0 END)`,
      })
      .from(contactsTable)
      .where(isNull(contactsTable.archivedAt));
    return {
      counts: counts.map(c => ({ status: c.isaStatus ?? "unset", count: Number(c.count) })),
      total: Number(totals?.total ?? 0),
      newLast30: Number(totals?.newLast30 ?? 0),
      noEmail: Number(totals?.noEmail ?? 0),
      noPhone: Number(totals?.noPhone ?? 0),
    };
  }),
});
// ─── Connection Requests Router ────────────────────────────────────────────────

export const connectionRequestsRouter = router({
  create: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      requestedPipelineStatus: z.enum(["new_lead","attempted_contact","nurture","active_client","under_contract","closed","dead"]).default("new_lead"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Check if a pending request already exists for this agent+contact
      const existing = await db.select({ id: connectionRequestsTable.id })
        .from(connectionRequestsTable)
        .where(and(
          eq(connectionRequestsTable.agentId, ctx.user.id),
          eq(connectionRequestsTable.contactId, input.contactId),
          eq(connectionRequestsTable.status, "pending"),
        ))
        .limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "You already have a pending connection request for this contact" });
      // Also check if connection already exists
      const connExists = await db.select({ id: agentConnectionsTable.id })
        .from(agentConnectionsTable)
        .where(and(eq(agentConnectionsTable.agentId, ctx.user.id), eq(agentConnectionsTable.contactId, input.contactId)))
        .limit(1);
      if (connExists.length > 0) throw new TRPCError({ code: "CONFLICT", message: "You already have a connection with this contact" });
      await db.insert(connectionRequestsTable).values({
        agentId: ctx.user.id,
        contactId: input.contactId,
        requestedPipelineStatus: input.requestedPipelineStatus,
        status: "pending",
      });
      return { success: true };
    }),

  list: protectedProcedure
    .input(z.object({
      status: z.enum(["pending","approved","denied","all"]).default("pending"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role === "agent") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const { asc, desc } = await import("drizzle-orm");
      const rows = await db
        .select({
          request: connectionRequestsTable,
          agent: { id: users.id, name: users.name, email: users.email },
          contact: { id: contactsTable.id, firstName: contactsTable.firstName, lastName: contactsTable.lastName, email: contactsTable.email, phone: contactsTable.phone },
        })
        .from(connectionRequestsTable)
        .innerJoin(users, eq(connectionRequestsTable.agentId, users.id))
        .innerJoin(contactsTable, eq(connectionRequestsTable.contactId, contactsTable.id))
        .where(input.status === "all" ? undefined : eq(connectionRequestsTable.status, input.status))
        .orderBy(
          input.sortOrder === "asc" ? asc(contactsTable.lastName) : desc(contactsTable.lastName),
          input.sortOrder === "asc" ? asc(contactsTable.firstName) : desc(contactsTable.firstName),
        );
      return rows;
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "agent") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [req] = await db.select().from(connectionRequestsTable).where(eq(connectionRequestsTable.id, input.id)).limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Request is no longer pending" });
      // Create the agent connection
      await db.insert(agentConnectionsTable).values({
        agentId: req.agentId,
        contactId: req.contactId,
        pipelineStatus: req.requestedPipelineStatus as any,
      });
      // Mark request as approved
      await db.update(connectionRequestsTable)
        .set({ status: "approved", reviewedById: ctx.user.id, reviewedAt: new Date() })
        .where(eq(connectionRequestsTable.id, input.id));
      // Email the requesting agent
      const [agent] = await db.select().from(users).where(eq(users.id, req.agentId)).limit(1);
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, req.contactId)).limit(1);
      if (agent?.email && contact) {
        await sendTransactionalEmail("connection_request_approved", {
          recipientEmail: agent.email,
          recipientName: agent.name ?? "Agent",
          contactName: `${contact.firstName} ${contact.lastName}`,
          pipelineStatus: req.requestedPipelineStatus,
        });
      }
      return { success: true };
    }),

  deny: protectedProcedure
    .input(z.object({ id: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "agent") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(connectionRequestsTable)
        .set({ status: "denied", reviewedById: ctx.user.id, reviewedAt: new Date(), notes: input.notes ?? null })
        .where(eq(connectionRequestsTable.id, input.id));
      return { success: true };
    }),

  pendingCount: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role === "agent") return { count: 0 };
      const db = await getDb();
      if (!db) return { count: 0 };
      const rows = await db.select({ id: connectionRequestsTable.id })
        .from(connectionRequestsTable)
        .where(eq(connectionRequestsTable.status, "pending"));
       return { count: rows.length };
    }),

  // Agent-facing: see my own submitted requests
  myRequests: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: connectionRequestsTable.id,
          status: connectionRequestsTable.status,
          requestedPipelineStatus: connectionRequestsTable.requestedPipelineStatus,
          createdAt: connectionRequestsTable.createdAt,
          reviewedAt: connectionRequestsTable.reviewedAt,
          denialReason: connectionRequestsTable.notes,
          contact: {
            id: contactsTable.id,
            firstName: contactsTable.firstName,
            lastName: contactsTable.lastName,
            email: contactsTable.email,
            phone: contactsTable.phone,
          },
        })
        .from(connectionRequestsTable)
        .innerJoin(contactsTable, eq(connectionRequestsTable.contactId, contactsTable.id))
        .where(eq(connectionRequestsTable.agentId, ctx.user.id))
        .orderBy(desc(connectionRequestsTable.createdAt));
      return rows;
    }),
});
