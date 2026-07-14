import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import {
  createAgentConnection,
  createTask,
  getAgentConnectionById,
  getAgentConnections,
  getDb,
  logActivity,
  updateAgentConnection,
} from "../db";
import { agentConnections, users, contacts } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { sendEmailAlert } from "../_core/emailAlerts";
import { sendTransactionalEmail } from "../_core/resendEmail";

const buyBoxInput = z.object({
  propertyType: z.string().optional().nullable(),
  minPrice: z.string().optional().nullable(),
  maxPrice: z.string().optional().nullable(),
  minBeds: z.number().optional().nullable(),
  maxBeds: z.number().optional().nullable(),
  minBaths: z.string().optional().nullable(),
  minSqft: z.number().optional().nullable(),
  maxSqft: z.number().optional().nullable(),
  targetCities: z.array(z.string()).optional().nullable(),
  targetZips: z.array(z.string()).optional().nullable(),
  strRequirements: z.string().optional().nullable(),
  investmentNotes: z.string().optional().nullable(),
});

// Buy box numeric fields arrive as user-typed strings that can include
// thousands separators or currency symbols (e.g. "250,000", "$300,000").
// The decimal/int columns reject those, so strip everything except digits
// (plus a decimal point for decimals) and coerce blanks to null before the
// DB write. Only transforms keys actually present so partial updates don't
// clobber existing values.
function normalizeBuyBox(b: any): any {
  if (!b) return b;
  const dec = (v: any) => {
    if (v === null || v === undefined || v === "") return null;
    const c = String(v).replace(/[^0-9.]/g, "");
    return c === "" || c === "." ? null : c;
  };
  const int = (v: any) => {
    if (v === null || v === undefined || v === "") return null;
    const c = String(v).replace(/[^0-9]/g, "");
    return c === "" ? null : parseInt(c, 10);
  };
  const out = { ...b };
  if ("minPrice" in b) out.minPrice = dec(b.minPrice);
  if ("maxPrice" in b) out.maxPrice = dec(b.maxPrice);
  if ("minBaths" in b) out.minBaths = dec(b.minBaths);
  if ("minBeds" in b) out.minBeds = int(b.minBeds);
  if ("maxBeds" in b) out.maxBeds = int(b.maxBeds);
  if ("minSqft" in b) out.minSqft = int(b.minSqft);
  if ("maxSqft" in b) out.maxSqft = int(b.maxSqft);
  return out;
}

export const agentConnectionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      agentId: z.number().optional(),
      contactId: z.number().optional(),
      status: z.string().optional(),
      isaId: z.number().optional(),
      leadSourceId: z.number().optional(),
      search: z.string().optional(),
      followUpDateFrom: z.string().optional(),
      followUpDateTo: z.string().optional(),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(200).default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      // Agents are always hard-scoped to their own connections. Admin and ISA
      // users can apply the optional agent facet without changing that rule.
      const followUpDateTo = input?.followUpDateTo ? new Date(input.followUpDateTo) : undefined;
      if (followUpDateTo) followUpDateTo.setHours(23, 59, 59, 999);
      return getAgentConnections({
        scopeAgentId: ctx.user.role === "agent" ? ctx.user.id : undefined,
        agentId: ctx.user.role === "agent" ? undefined : input?.agentId,
        contactId: input?.contactId,
        status: input?.status,
        isaId: input?.isaId,
        leadSourceId: input?.leadSourceId,
        search: input?.search || undefined,
        followUpDateFrom: input?.followUpDateFrom ? new Date(input.followUpDateFrom) : undefined,
        followUpDateTo,
        sortOrder: input?.sortOrder ?? "desc",
        page: input?.page ?? 1,
        limit: input?.limit ?? 50,
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const conn = await getAgentConnectionById(input.id);
      if (!conn) throw new TRPCError({ code: "NOT_FOUND" });
      return conn;
    }),

  create: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      contactId: z.number(),
      pipelineStatus: z.enum(["new_lead","attempted_contact","nurture","active_client","under_contract","closed","dead"]).optional(),
      followUpDate: z.string().optional().nullable(),
      agentNotes: z.string().optional().nullable(),
      buyBox: buyBoxInput.optional(),
      // Optional ISA follow-up date — creates a task for the ISA
      isaFollowUpDate: z.string().optional().nullable(),
      // Introduce client to agent via email (CC the agent)
      introduceClient: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      // Prevent duplicate agent connections for the same agent+contact pair
      const db = await getDb();
      if (db) {
        const existing = await db
          .select()
          .from(agentConnections)
          .where(and(eq(agentConnections.agentId, input.agentId), eq(agentConnections.contactId, input.contactId)))
          .limit(1);
        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "This agent is already assigned to this contact" });
        }
      }

      const id = await createAgentConnection({
        agentId: input.agentId,
        contactId: input.contactId,
        pipelineStatus: input.pipelineStatus ?? "new_lead",
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
        agentNotes: input.agentNotes,
        ...normalizeBuyBox(input.buyBox),
      } as any);

      // ISA follow-up task — assign to the contact's ISA if one is assigned;
      // if the caller is an admin (not an ISA), use the contact's assignedIsaId instead.
      // Never create the task if no ISA is assigned.
      if (input.isaFollowUpDate) {
        let taskAssigneeId: number | null = null;
        if (ctx.user.role === "isa") {
          taskAssigneeId = ctx.user.id;
        } else {
          // Admin creating the connection — look up the contact's assigned ISA
          const db2 = await getDb();
          if (db2) {
            const [contactRow] = await db2
              .select({ assignedIsaId: contacts.assignedIsaId })
              .from(contacts)
              .where(eq(contacts.id, input.contactId))
              .limit(1);
            taskAssigneeId = contactRow?.assignedIsaId ?? null;
          }
        }
        if (taskAssigneeId != null) {
          await createTask({
            title: `Follow up on agent connection`,
            assignedToId: taskAssigneeId,
            relatedContactId: input.contactId,
            relatedAgentConnectionId: id,
            taskType: "follow_up",
            priority: "medium",
            isAutomated: true,
            dueDate: new Date(input.isaFollowUpDate),
          });
        }
        // If no ISA is assigned, skip creating the task silently
      }

      await logActivity({
        userId: ctx.user.id,
        action: "agent_connection_created",
        entityType: "agent_connection",
        entityId: id,
      });

      // Email alert to agent
      try {
        const db2 = await getDb();
        let contactName: string | undefined = undefined;
        let notes: string | undefined = undefined;
        if (db2) {
          const [contact] = await db2
            .select()
            .from(contacts)
            .where(eq(contacts.id, input.contactId))
            .limit(1);
          if (contact) {
            contactName = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || undefined;
            notes = input.agentNotes ?? contact.notes ?? undefined;
          }
        }
        await sendEmailAlert("lead_assigned", input.agentId, {
          connectionId: id,
          contactId: input.contactId,
          contactName,
          notes,
        });
      } catch (_) {}

      // Introduce client to agent via email (CC the agent)
      if (input.introduceClient) {
        try {
          const db2 = await getDb();
          if (db2) {
            const [agent] = await db2.select().from(users).where(eq(users.id, input.agentId)).limit(1);
            const [contact] = await db2.select().from(contacts).where(eq(contacts.id, input.contactId)).limit(1);
            if (contact?.email && agent) {
              await sendTransactionalEmail("client_intro", {
                recipientName: contact.firstName ?? undefined,
                recipientEmail: contact.email,
                ccEmail: agent.email ?? undefined,
                agentName: agent.name ?? undefined,
                contactName: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || undefined,
                isaName: ctx.user.name ?? undefined,
                agentBookingLink: (agent as any).callBookingLink ?? undefined,
              });
            }
          }
        } catch (_) {}
      }

      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        pipelineStatus: z.enum(["new_lead","attempted_contact","nurture","active_client","under_contract","closed","dead"]).optional(),
        followUpDate: z.string().optional().nullable(),
        agentNotes: z.string().optional().nullable(),
        buyBox: buyBoxInput.optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const { buyBox, followUpDate, ...rest } = input.data;
      await updateAgentConnection(input.id, {
        ...rest,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        ...normalizeBuyBox(buyBox),
      } as any);
      await logActivity({
        userId: ctx.user.id,
        action: "agent_connection_updated",
        entityType: "agent_connection",
        entityId: input.id,
        details: { status: input.data.pipelineStatus },
      });
      return { success: true };
    }),
});
