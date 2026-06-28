/**
 * GHL Sync — admin-only diagnostic procedures.
 *
 * The actual sync runs fire-and-forget on every contact create via
 * `triggerGhlContactSync`. This router exposes a synchronous test endpoint
 * so an admin can verify the integration end-to-end (token, network,
 * payload, GHL response) against a real contact, and a status endpoint to
 * confirm the env is wired correctly.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { contacts, leadSources } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { upsertContactToGhl } from "../_core/ghlSync";
import { ENV } from "../_core/env";

export const ghlSyncRouter = router({
  /**
   * Quick health check — confirms the env is loaded without making any
   * outbound call. Safe to call from a deployed environment.
   */
  status: adminProcedure.query(() => {
    return {
      tokenConfigured: !!ENV.ghlLocationToken,
      locationId: ENV.ghlLocationId,
    };
  }),

  /**
   * Run a real upsert against GHL for the given contactId and return the
   * GHL response (contact id + created/updated). This bypasses the
   * fire-and-forget wrapper so the caller can see the result inline.
   * Same code path the production sync uses — so a success here means
   * production syncs will succeed too.
   */
  testSync: adminProcedure
    .input(z.object({ contactId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [c] = await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          leadSourceId: contacts.leadSourceId,
        })
        .from(contacts)
        .where(eq(contacts.id, input.contactId))
        .limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: `contact ${input.contactId} not found` });

      let leadSourceName: string | null = null;
      if (c.leadSourceId) {
        const [row] = await db
          .select({ name: leadSources.name, parentId: leadSources.parentId })
          .from(leadSources)
          .where(eq(leadSources.id, c.leadSourceId))
          .limit(1);
        if (row) {
          if (row.parentId) {
            const [parent] = await db
              .select({ name: leadSources.name })
              .from(leadSources)
              .where(eq(leadSources.id, row.parentId))
              .limit(1);
            leadSourceName = parent ? `${parent.name} → ${row.name}` : row.name;
          } else {
            leadSourceName = row.name;
          }
        }
      }

      const result = await upsertContactToGhl({
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        leadSourceName,
      });

      // Same log shape as the fire-and-forget path so admins can correlate.
      if (result.ok) {
        console.log(
          `[GHL] testSync contact ${c.id} ${result.action} — ghlContactId=${result.ghlContactId} leadSource=${JSON.stringify(leadSourceName)}`,
        );
      } else {
        console.error(
          `[GHL] testSync contact ${c.id} failed — status=${result.status ?? "n/a"} error=${result.errorBody?.slice(0, 500) ?? "?"}`,
        );
      }

      return {
        contactId: c.id,
        leadSourceName,
        result,
      };
    }),
});
