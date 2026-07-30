/**
 * Email Behaviors Router
 *
 * Exposes tRPC procedures for reading email behavior data (Resend + GHL)
 * for a given contact, and admin procedures for triggering manual syncs.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  emailBehaviors,
  emailBehaviorsSyncState,
  contacts,
  agentConnections,
} from "../../drizzle/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { syncEmailBehaviors } from "../emailBehaviorsSync";

function adminOrIsa(ctx: { user: { role: string } }) {
  return ctx.user.role === "admin" || ctx.user.role === "isa";
}

export const emailBehaviorsRouter = router({
  /**
   * Get email behaviors for a contact.
   * Admins/ISAs can view any contact.
   * Agents can only view contacts they have a connection with.
   */
  listForContact: protectedProcedure
    .input(
      z.object({
        contactId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Access control: agents can only view contacts they're connected to
      if (ctx.user.role === "agent") {
        const [connection] = await db
          .select({ id: agentConnections.id })
          .from(agentConnections)
          .where(
            and(
              eq(agentConnections.agentId, ctx.user.id),
              eq(agentConnections.contactId, input.contactId),
            ),
          )
          .limit(1);
        if (!connection) {
          throw new TRPCError({ code: "FORBIDDEN", message: "No connection to this contact" });
        }
      }

      const rows = await db
        .select()
        .from(emailBehaviors)
        .where(eq(emailBehaviors.contactId, input.contactId))
        .orderBy(desc(emailBehaviors.sentAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  /**
   * Get email behaviors for a contact via agent connection ID.
   * The agent must own the connection.
   */
  listForConnection: protectedProcedure
    .input(
      z.object({
        connectionId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Look up the connection
      const [connection] = await db
        .select({ id: agentConnections.id, contactId: agentConnections.contactId, agentId: agentConnections.agentId })
        .from(agentConnections)
        .where(eq(agentConnections.id, input.connectionId))
        .limit(1);

      if (!connection) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
      }

      // Agents can only view their own connections; admins/ISAs can view any
      if (ctx.user.role === "agent" && connection.agentId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your connection" });
      }

      const rows = await db
        .select()
        .from(emailBehaviors)
        .where(eq(emailBehaviors.contactId, connection.contactId))
        .orderBy(desc(emailBehaviors.sentAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  /**
   * Admin: get sync state for both sources.
   */
  getSyncState: protectedProcedure.query(async ({ ctx }) => {
    if (!adminOrIsa(ctx)) throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(emailBehaviorsSyncState);
    return rows;
  }),

  /**
   * Admin: trigger a manual sync for one or both sources.
   */
  triggerSync: protectedProcedure
    .input(
      z.object({
        sources: z.array(z.enum(["resend", "ghl"])).optional(),
        forceFullSync: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await syncEmailBehaviors({
        sources: input.sources,
        forceFullSync: input.forceFullSync,
      });
      return result;
    }),
});
