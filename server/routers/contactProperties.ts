import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logActivity } from "../db";
import { contactProperties, properties } from "../../drizzle/schema";

export const contactPropertiesRouter = router({
  /** List all properties linked to a contact */
  list: protectedProcedure
    .input(z.object({ contactId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: contactProperties.id,
          contactId: contactProperties.contactId,
          propertyId: contactProperties.propertyId,
          label: contactProperties.label,
          createdAt: contactProperties.createdAt,
          // Property fields
          address: properties.address,
          city: properties.city,
          state: properties.state,
          zip: properties.zip,
          beds: properties.beds,
          baths: properties.baths,
          sqft: properties.sqft,
          propertyType: properties.propertyType,
          listPrice: properties.listPrice,
        })
        .from(contactProperties)
        .innerJoin(properties, eq(contactProperties.propertyId, properties.id))
        .where(eq(contactProperties.contactId, input.contactId));
      return rows;
    }),

  /** Link an existing property to a contact with a label */
  link: protectedProcedure
    .input(z.object({
      contactId: z.number(),
      propertyId: z.number(),
      label: z.string().default("Primary home"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Prevent duplicate links
      const existing = await db
        .select()
        .from(contactProperties)
        .where(and(eq(contactProperties.contactId, input.contactId), eq(contactProperties.propertyId, input.propertyId)))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "This property is already linked to this contact" });
      }
      await db.insert(contactProperties).values({
        contactId: input.contactId,
        propertyId: input.propertyId,
        label: input.label,
      });
      await logActivity({
        userId: ctx.user.id,
        action: "contact_property_linked",
        entityType: "contact_property",
        entityId: input.propertyId,
        relatedContactId: input.contactId,
        details: { propertyId: input.propertyId, label: input.label, actorName: ctx.user.name ?? "Unknown" },
      });
      return { success: true };
    }),

  /** Update the label on a contact-property link */
  updateLabel: protectedProcedure
    .input(z.object({ id: z.number(), label: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Fetch the existing link to get contactId for audit trail
      const [existing] = await db.select().from(contactProperties).where(eq(contactProperties.id, input.id)).limit(1);
      await db.update(contactProperties).set({ label: input.label }).where(eq(contactProperties.id, input.id));
      await logActivity({
        userId: ctx.user.id,
        action: "contact_property_label_updated",
        entityType: "contact_property",
        entityId: input.id,
        relatedContactId: existing?.contactId ?? null,
        details: { newLabel: input.label, actorName: ctx.user.name ?? "Unknown" },
      });
      return { success: true };
    }),

  /** Unlink a property from a contact */
  unlink: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Fetch the existing link to get contactId for audit trail
      const [existing] = await db.select().from(contactProperties).where(eq(contactProperties.id, input.id)).limit(1);
      await db.delete(contactProperties).where(eq(contactProperties.id, input.id));
      await logActivity({
        userId: ctx.user.id,
        action: "contact_property_unlinked",
        entityType: "contact_property",
        entityId: input.id,
        relatedContactId: existing?.contactId ?? null,
        details: { propertyId: existing?.propertyId, actorName: ctx.user.name ?? "Unknown" },
      });
      return { success: true };
    }),
});
