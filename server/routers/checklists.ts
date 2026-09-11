import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import {
  agentChecklistApplicationItems,
  agentChecklistApplications,
  agentChecklistTemplateItems,
  agentChecklistTemplateShares,
  agentChecklistTemplates,
  users,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import {
  assertChecklistRole,
  requireApplicationAccess,
  requireApplicationItemAccess,
  requireChecklistTargetAccess,
  requireTemplateManage,
  requireTemplateRead,
  type ChecklistViewer,
} from "../checklistAuthorization";
import {
  applyChecklistTemplate,
  checklistTemplateMatchesTarget,
  listChecklistApplications,
} from "../checklistService";
import { getDb, logActivity } from "../db";

const positiveId = z.number().int().positive();
const targetTypeSchema = z.enum(["transaction", "listing"]);
const transactionTypeFilterSchema = z.enum(["buyer", "seller", "dual", "any"]);
const automaticEventSchema = z.enum(["none", "on_create", "on_under_contract"]);
const dueAnchorSchema = z.enum([
  "target_created",
  "under_contract",
  "closing",
  "listing_live",
]);
const assignmentTypeSchema = z.enum(["none", "owner", "specific"]);
const optionalText = z.string().trim().max(10_000).nullable().optional();

const templateItemSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    notes: optionalText,
    sectionName: z.string().trim().min(1).max(255).default("General"),
    dueAnchor: dueAnchorSchema.nullable().optional(),
    dueOffsetDays: z.number().int().min(-3650).max(3650).default(0),
    assignmentType: assignmentTypeSchema.default("none"),
    assignedUserId: positiveId.nullable().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.assignmentType === "specific" && !item.assignedUserId) {
      ctx.addIssue({
        code: "custom",
        path: ["assignedUserId"],
        message: "A specific assignee is required.",
      });
    }
  });

const templateDataSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: optionalText,
    targetType: targetTypeSchema,
    transactionTypeFilter: transactionTypeFilterSchema.default("any"),
    automaticDefaultEvent: automaticEventSchema.default("none"),
    items: z.array(templateItemSchema).max(500),
  })
  .superRefine((value, ctx) => {
    if (value.targetType === "listing" && value.transactionTypeFilter !== "any") {
      ctx.addIssue({
        code: "custom",
        path: ["transactionTypeFilter"],
        message: "Listing templates must use the 'any' transaction filter.",
      });
    }
    value.items.forEach((item, index) => {
      if (value.targetType === "listing" && item.dueAnchor === "closing") {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "dueAnchor"],
          message: "Listing checklist items cannot use the transaction closing date.",
        });
      }
      if (value.targetType === "transaction" && item.dueAnchor === "listing_live") {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "dueAnchor"],
          message: "Transaction checklist items cannot use a listing live date.",
        });
      }
    });
  });

const applicationTargetSchema = z.object({
  targetType: targetTypeSchema,
  targetId: positiveId,
});

function viewer(user: { id: number; role: "admin" | "agent" | "isa" | "agent_support" }) {
  return user as ChecklistViewer;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
  return db;
}

function cleanItem(item: z.infer<typeof templateItemSchema>, sortOrder: number) {
  return {
    title: item.title,
    notes: item.notes || null,
    sectionName: item.sectionName,
    sortOrder,
    dueAnchor: item.dueAnchor ?? null,
    dueOffsetDays: item.dueOffsetDays,
    assignmentType: item.assignmentType,
    assignedUserId: item.assignmentType === "specific" ? item.assignedUserId ?? null : null,
  };
}

async function validateSpecificAssignees(
  db: Awaited<ReturnType<typeof requireDb>>,
  items: z.infer<typeof templateItemSchema>[]
) {
  const ids = Array.from(
    new Set(
      items
        .filter(item => item.assignmentType === "specific")
        .map(item => item.assignedUserId)
        .filter((id): id is number => Boolean(id))
    )
  );
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.isActive, true)));
  if (rows.length !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Every specific assignee must be an active user." });
  }
}

async function getNestedTemplate(
  db: Awaited<ReturnType<typeof requireDb>>,
  templateId: number
) {
  const [template] = await db
    .select({ template: agentChecklistTemplates, ownerName: users.name })
    .from(agentChecklistTemplates)
    .leftJoin(users, eq(agentChecklistTemplates.ownerUserId, users.id))
    .where(eq(agentChecklistTemplates.id, templateId))
    .limit(1);
  if (!template) return null;

  const [items, shares] = await Promise.all([
    db
      .select({ item: agentChecklistTemplateItems, assigneeName: users.name })
      .from(agentChecklistTemplateItems)
      .leftJoin(users, eq(agentChecklistTemplateItems.assignedUserId, users.id))
      .where(eq(agentChecklistTemplateItems.templateId, templateId))
      .orderBy(asc(agentChecklistTemplateItems.sortOrder), asc(agentChecklistTemplateItems.id)),
    db
      .select({
        id: agentChecklistTemplateShares.id,
        userId: agentChecklistTemplateShares.sharedWithUserId,
        userName: users.name,
        userEmail: users.email,
        createdAt: agentChecklistTemplateShares.createdAt,
      })
      .from(agentChecklistTemplateShares)
      .leftJoin(users, eq(agentChecklistTemplateShares.sharedWithUserId, users.id))
      .where(eq(agentChecklistTemplateShares.templateId, templateId))
      .orderBy(asc(users.name), asc(agentChecklistTemplateShares.id)),
  ]);
  return {
    ...template.template,
    ownerName: template.ownerName,
    items: items.map(row => ({ ...row.item, assigneeName: row.assigneeName })),
    shares,
  };
}

export const checklistsRouter = router({
  templates: router({
    list: protectedProcedure
      .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
      .query(async ({ input, ctx }) => {
        const current = viewer(ctx.user);
        assertChecklistRole(current);
        const db = await requireDb();
        const visibility =
          current.role === "admin"
            ? undefined
            : or(
                eq(agentChecklistTemplates.ownerUserId, current.id),
                inArray(
                  agentChecklistTemplates.id,
                  db
                    .select({ templateId: agentChecklistTemplateShares.templateId })
                    .from(agentChecklistTemplateShares)
                    .where(eq(agentChecklistTemplateShares.sharedWithUserId, current.id))
                )
              );
        const archived = input?.includeArchived ? undefined : isNull(agentChecklistTemplates.archivedAt);
        const rows = await db
          .select({ template: agentChecklistTemplates, ownerName: users.name })
          .from(agentChecklistTemplates)
          .leftJoin(users, eq(agentChecklistTemplates.ownerUserId, users.id))
          .where(visibility && archived ? and(visibility, archived) : visibility ?? archived)
          .orderBy(asc(agentChecklistTemplates.name), asc(agentChecklistTemplates.id));
        const nested = [];
        for (const row of rows) {
          const full = await getNestedTemplate(db, row.template.id);
          if (full) nested.push({ ...full, canManage: current.role === "admin" || full.ownerUserId === current.id });
        }
        return nested;
      }),

    get: protectedProcedure
      .input(z.object({ id: positiveId }))
      .query(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        await requireTemplateRead(db, current, input.id);
        const template = await getNestedTemplate(db, input.id);
        if (!template) throw new TRPCError({ code: "NOT_FOUND" });
        return { ...template, canManage: current.role === "admin" || template.ownerUserId === current.id };
      }),

    create: protectedProcedure.input(templateDataSchema).mutation(async ({ input, ctx }) => {
      const current = viewer(ctx.user);
      assertChecklistRole(current);
      const db = await requireDb();
      await validateSpecificAssignees(db, input.items);
      const id = await db.transaction(async tx => {
        const [result] = await tx.insert(agentChecklistTemplates).values({
          ownerUserId: current.id,
          name: input.name,
          description: input.description || null,
          targetType: input.targetType,
          transactionTypeFilter: input.targetType === "listing" ? "any" : input.transactionTypeFilter,
          automaticDefaultEvent: input.automaticDefaultEvent,
        });
        const templateId = Number((result as { insertId: number }).insertId);
        if (input.items.length > 0) {
          await tx.insert(agentChecklistTemplateItems).values(
            input.items.map((item, index) => ({ templateId, ...cleanItem(item, index) }))
          );
        }
        return templateId;
      });
      await logActivity({
        userId: current.id,
        action: "checklist_template_created",
        entityType: "checklist_template",
        entityId: id,
        details: { name: input.name, targetType: input.targetType, itemCount: input.items.length },
      });
      return getNestedTemplate(db, id);
    }),

    update: protectedProcedure
      .input(z.object({ id: positiveId, data: templateDataSchema }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        await requireTemplateManage(db, current, input.id);
        await validateSpecificAssignees(db, input.data.items);
        await db.transaction(async tx => {
          await tx
            .update(agentChecklistTemplates)
            .set({
              name: input.data.name,
              description: input.data.description || null,
              targetType: input.data.targetType,
              transactionTypeFilter:
                input.data.targetType === "listing" ? "any" : input.data.transactionTypeFilter,
              automaticDefaultEvent: input.data.automaticDefaultEvent,
            })
            .where(eq(agentChecklistTemplates.id, input.id));
          // A full ordered item array intentionally replaces mutable template items.
          // Application snapshots retain all historical title/provenance data.
          await tx.delete(agentChecklistTemplateItems).where(eq(agentChecklistTemplateItems.templateId, input.id));
          if (input.data.items.length > 0) {
            await tx.insert(agentChecklistTemplateItems).values(
              input.data.items.map((item, index) => ({ templateId: input.id, ...cleanItem(item, index) }))
            );
          }
        });
        await logActivity({
          userId: current.id,
          action: "checklist_template_updated",
          entityType: "checklist_template",
          entityId: input.id,
          details: { name: input.data.name, itemCount: input.data.items.length },
        });
        return getNestedTemplate(db, input.id);
      }),

    archive: protectedProcedure
      .input(z.object({ id: positiveId }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        await requireTemplateManage(db, current, input.id);
        await db
          .update(agentChecklistTemplates)
          .set({ archivedAt: new Date(), archivedByUserId: current.id })
          .where(eq(agentChecklistTemplates.id, input.id));
        await logActivity({ userId: current.id, action: "checklist_template_archived", entityType: "checklist_template", entityId: input.id });
        return { success: true };
      }),

    restore: protectedProcedure
      .input(z.object({ id: positiveId }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        await requireTemplateManage(db, current, input.id);
        await db
          .update(agentChecklistTemplates)
          .set({ archivedAt: null, archivedByUserId: null })
          .where(eq(agentChecklistTemplates.id, input.id));
        await logActivity({ userId: current.id, action: "checklist_template_restored", entityType: "checklist_template", entityId: input.id });
        return { success: true };
      }),

    duplicate: protectedProcedure
      .input(z.object({ id: positiveId, name: z.string().trim().min(1).max(255).optional() }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        const source = await requireTemplateRead(db, current, input.id);
        const sourceItems = await db
          .select()
          .from(agentChecklistTemplateItems)
          .where(eq(agentChecklistTemplateItems.templateId, source.id))
          .orderBy(asc(agentChecklistTemplateItems.sortOrder), asc(agentChecklistTemplateItems.id));
        const duplicateId = await db.transaction(async tx => {
          const [result] = await tx.insert(agentChecklistTemplates).values({
            ownerUserId: current.id,
            name: input.name ?? `${source.name} (Copy)`,
            description: source.description,
            targetType: source.targetType,
            transactionTypeFilter: source.transactionTypeFilter,
            automaticDefaultEvent: "none",
          });
          const newId = Number((result as { insertId: number }).insertId);
          if (sourceItems.length > 0) {
            await tx.insert(agentChecklistTemplateItems).values(
              sourceItems.map((item, index) => ({
                templateId: newId,
                title: item.title,
                notes: item.notes,
                sectionName: item.sectionName,
                sortOrder: index,
                dueAnchor: item.dueAnchor,
                dueOffsetDays: item.dueOffsetDays,
                assignmentType: item.assignmentType,
                assignedUserId: item.assignmentType === "specific" ? item.assignedUserId : null,
              }))
            );
          }
          return newId;
        });
        await logActivity({
          userId: current.id,
          action: "checklist_template_duplicated",
          entityType: "checklist_template",
          entityId: duplicateId,
          details: { sourceTemplateId: source.id },
        });
        return getNestedTemplate(db, duplicateId);
      }),

    share: protectedProcedure
      .input(z.object({ id: positiveId, userId: positiveId }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        const template = await requireTemplateManage(db, current, input.id);
        if (input.userId === template.ownerUserId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A template is already available to its owner." });
        }
        const [recipient] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, input.userId), eq(users.role, "agent"), eq(users.isActive, true)))
          .limit(1);
        if (!recipient) throw new TRPCError({ code: "BAD_REQUEST", message: "Share recipient must be an active agent." });
        await db
          .insert(agentChecklistTemplateShares)
          .values({ templateId: input.id, sharedWithUserId: input.userId, sharedByUserId: current.id })
          .onDuplicateKeyUpdate({ set: { sharedByUserId: current.id } });
        await logActivity({
          userId: current.id,
          action: "checklist_template_shared",
          entityType: "checklist_template",
          entityId: input.id,
          details: { sharedWithUserId: input.userId },
        });
        return { success: true };
      }),

    unshare: protectedProcedure
      .input(z.object({ id: positiveId, userId: positiveId }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        await requireTemplateManage(db, current, input.id);
        await db.delete(agentChecklistTemplateShares).where(
          and(
            eq(agentChecklistTemplateShares.templateId, input.id),
            eq(agentChecklistTemplateShares.sharedWithUserId, input.userId)
          )
        );
        await logActivity({
          userId: current.id,
          action: "checklist_template_unshared",
          entityType: "checklist_template",
          entityId: input.id,
          details: { sharedWithUserId: input.userId },
        });
        return { success: true };
      }),
  }),

  users: router({
    candidates: protectedProcedure.query(async ({ ctx }) => {
      const current = viewer(ctx.user);
      assertChecklistRole(current);
      const db = await requireDb();
      return db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(and(eq(users.isActive, true), or(eq(users.role, "agent"), eq(users.role, "admin"))))
        .orderBy(asc(users.name), asc(users.id));
    }),
  }),

  applications: router({
    list: protectedProcedure.input(applicationTargetSchema).query(async ({ input, ctx }) => {
      const db = await requireDb();
      await requireChecklistTargetAccess(db, viewer(ctx.user), input.targetType, input.targetId);
      return listChecklistApplications(input.targetType, input.targetId);
    }),

    applyTemplate: protectedProcedure
      .input(applicationTargetSchema.extend({ templateId: positiveId }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        const [template, target] = await Promise.all([
          requireTemplateRead(db, current, input.templateId),
          requireChecklistTargetAccess(db, current, input.targetType, input.targetId),
        ]);
        if (template.archivedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Archived templates cannot be applied." });
        }
        if (!checklistTemplateMatchesTarget(template, target)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This template does not apply to the selected target." });
        }
        const result = await applyChecklistTemplate({
          templateId: input.templateId,
          targetType: input.targetType,
          targetId: input.targetId,
          source: "manual",
          appliedByUserId: current.id,
        });
        await logActivity({
          userId: current.id,
          action: "checklist_applied",
          entityType: input.targetType,
          entityId: input.targetId,
          details: { applicationId: result.applicationId, templateId: input.templateId, source: "manual" },
        });
        return result;
      }),

    remove: protectedProcedure
      .input(z.object({ id: positiveId }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        const application = await requireApplicationAccess(db, current, input.id);
        if (!application.removedAt) {
          await db
            .update(agentChecklistApplications)
            .set({ removedAt: new Date(), removedByUserId: current.id })
            .where(eq(agentChecklistApplications.id, input.id));
          await logActivity({
            userId: current.id,
            action: "checklist_removed",
            entityType: application.targetType,
            entityId: application.targetType === "transaction" ? application.transactionId : application.listingId,
            details: { applicationId: application.id },
          });
        }
        return { success: true };
      }),
  }),

  items: router({
    update: protectedProcedure
      .input(
        z.object({
          id: positiveId,
          data: z
            .object({
              title: z.string().trim().min(1).max(500).optional(),
              notes: optionalText,
              sectionName: z.string().trim().min(1).max(255).optional(),
              dueDate: z.string().datetime().nullable().optional(),
              assignedUserId: positiveId.nullable().optional(),
              completed: z.boolean().optional(),
            })
            .refine(data => Object.values(data).some(value => value !== undefined), "At least one field is required."),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        const { item, application } = await requireApplicationItemAccess(db, current, input.id);
        if (application.removedAt || item.removedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Removed checklist items cannot be updated." });
        if (input.data.assignedUserId) {
          const [assignee] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, input.data.assignedUserId), eq(users.isActive, true)))
            .limit(1);
          if (!assignee) throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee must be an active user." });
        }
        const completionChanged = input.data.completed !== undefined && input.data.completed !== item.completed;
        await db
          .update(agentChecklistApplicationItems)
          .set({
            ...(input.data.title !== undefined ? { title: input.data.title } : {}),
            ...(input.data.notes !== undefined ? { notes: input.data.notes || null } : {}),
            ...(input.data.sectionName !== undefined ? { sectionName: input.data.sectionName } : {}),
            ...(input.data.dueDate !== undefined
              ? {
                  dueDate: input.data.dueDate ? new Date(input.data.dueDate) : null,
                  dueDateManuallyOverridden: true,
                }
              : {}),
            ...(input.data.assignedUserId !== undefined ? { assignedUserId: input.data.assignedUserId } : {}),
            ...(input.data.completed !== undefined
              ? {
                  completed: input.data.completed,
                  completedAt: input.data.completed ? new Date() : null,
                  completedByUserId: input.data.completed ? current.id : null,
                }
              : {}),
          })
          .where(eq(agentChecklistApplicationItems.id, input.id));
        if (completionChanged) {
          await logActivity({
            userId: current.id,
            action: input.data.completed ? "checklist_item_completed" : "checklist_item_reopened",
            entityType: application.targetType,
            entityId: application.targetType === "transaction" ? application.transactionId : application.listingId,
            details: { applicationId: application.id, itemId: item.id, title: item.title },
          });
        } else {
          await logActivity({
            userId: current.id,
            action: "checklist_item_updated",
            entityType: application.targetType,
            entityId: application.targetType === "transaction" ? application.transactionId : application.listingId,
            details: { applicationId: application.id, itemId: item.id, fields: Object.keys(input.data) },
          });
        }
        return { success: true };
      }),

    addItem: protectedProcedure
      .input(
        z.object({
          applicationId: positiveId,
          title: z.string().trim().min(1).max(500),
          notes: optionalText,
          sectionName: z.string().trim().min(1).max(255).default("General"),
          dueDate: z.string().datetime().nullable().optional(),
          assignedUserId: positiveId.nullable().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        const application = await requireApplicationAccess(db, current, input.applicationId);
        if (application.removedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot add an item to a removed checklist." });
        const existing = await db
          .select({ sortOrder: agentChecklistApplicationItems.sortOrder })
          .from(agentChecklistApplicationItems)
          .where(eq(agentChecklistApplicationItems.applicationId, input.applicationId))
          .orderBy(asc(agentChecklistApplicationItems.sortOrder));
        const sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
        const [result] = await db.insert(agentChecklistApplicationItems).values({
          applicationId: input.applicationId,
          templateItemId: null,
          title: input.title,
          notes: input.notes || null,
          sectionName: input.sectionName,
          sortOrder,
          dueAnchorSnapshot: null,
          dueOffsetDaysSnapshot: 0,
          assignmentTypeSnapshot: input.assignedUserId ? "specific" : "none",
          configuredAssignedUserIdSnapshot: input.assignedUserId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          dueDateManuallyOverridden: true,
          assignedUserId: input.assignedUserId ?? null,
        });
        const itemId = Number((result as { insertId: number }).insertId);
        await logActivity({
          userId: current.id,
          action: "checklist_item_added",
          entityType: application.targetType,
          entityId: application.targetType === "transaction" ? application.transactionId : application.listingId,
          details: { applicationId: application.id, itemId, title: input.title },
        });
        return { id: itemId };
      }),

    removeItem: protectedProcedure
      .input(z.object({ id: positiveId }))
      .mutation(async ({ input, ctx }) => {
        const db = await requireDb();
        const current = viewer(ctx.user);
        const { item, application } = await requireApplicationItemAccess(db, current, input.id);
        await db
          .update(agentChecklistApplicationItems)
          .set({ removedAt: new Date(), removedByUserId: current.id })
          .where(eq(agentChecklistApplicationItems.id, input.id));
        await logActivity({
          userId: current.id,
          action: "checklist_item_removed",
          entityType: application.targetType,
          entityId: application.targetType === "transaction" ? application.transactionId : application.listingId,
          details: { applicationId: application.id, itemId: item.id, title: item.title },
        });
        return { success: true };
      }),
  }),
});
