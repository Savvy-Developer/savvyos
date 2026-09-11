import { and, asc, eq, isNull, or } from "drizzle-orm";
import {
  agentChecklistApplicationItems,
  agentChecklistApplications,
  agentChecklistTemplateItems,
  agentChecklistTemplates,
  listings,
  transactions,
  users,
} from "../drizzle/schema";
import { getDb, logActivity } from "./db";
import {
  type ChecklistDueAnchor,
  type ChecklistTargetType,
  resolveChecklistDueDate,
} from "./checklistDates";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type AssignmentType = "none" | "owner" | "specific";
type AutomaticEvent = "on_create" | "on_under_contract";

export type ChecklistTargetSnapshot = {
  targetType: ChecklistTargetType;
  targetId: number;
  agentUserId: number | null;
  transactionType: "buyer" | "seller" | "dual" | null;
  createdAt: Date | string;
  contractDate: Date | string | null;
  closingDate: Date | string | null;
  listDate: Date | string | null;
};

export type ChecklistTemplateItemSnapshotInput = {
  id?: number | null;
  title: string;
  notes?: string | null;
  sectionName: string;
  sortOrder: number;
  dueAnchor?: ChecklistDueAnchor | null;
  dueOffsetDays: number;
  assignmentType: AssignmentType;
  assignedUserId?: number | null;
};

/** Pure snapshot mapper used by the transactional application writer. */
export function buildChecklistItemSnapshots(
  templateItems: ChecklistTemplateItemSnapshotInput[],
  target: ChecklistTargetSnapshot,
  options: { underContractEventAt?: Date | string | null } = {}
){
  return templateItems.map((item, index) => ({
    templateItemId: item.id ?? null,
    title: item.title,
    notes: item.notes ?? null,
    sectionName: item.sectionName,
    sortOrder: item.sortOrder ?? index,
    dueAnchorSnapshot: item.dueAnchor ?? null,
    dueOffsetDaysSnapshot: item.dueOffsetDays,
    assignmentTypeSnapshot: item.assignmentType,
    configuredAssignedUserIdSnapshot:
      item.assignmentType === "specific" ? item.assignedUserId ?? null : null,
    dueDate: resolveChecklistDueDate(
      {
        targetType: target.targetType,
        createdAt: target.createdAt,
        contractDate: target.contractDate,
        closingDate: target.closingDate,
        listDate: target.listDate,
      },
      item.dueAnchor,
      item.dueOffsetDays,
      options
    ),
    assignedUserId:
      item.assignmentType === "owner"
        ? target.agentUserId
        : item.assignmentType === "specific"
          ? item.assignedUserId ?? null
          : null,
    completed: false,
    completedAt: null,
    completedByUserId: null,
    removedAt: null,
    removedByUserId: null,
  }));
}

export async function getChecklistTarget(
  targetType: ChecklistTargetType,
  targetId: number,
  dbOverride?: Db
): Promise<ChecklistTargetSnapshot | null> {
  const db = dbOverride ?? (await getDb());
  if (!db) throw new Error("Database unavailable");

  if (targetType === "transaction") {
    const [target] = await db
      .select({
        id: transactions.id,
        agentUserId: transactions.agentId,
        transactionType: transactions.transactionType,
        createdAt: transactions.createdAt,
        contractDate: transactions.contractDate,
        closingDate: transactions.closingDate,
      })
      .from(transactions)
      .where(eq(transactions.id, targetId))
      .limit(1);
    return target
      ? {
          targetType,
          targetId: target.id,
          agentUserId: target.agentUserId,
          transactionType: target.transactionType,
          createdAt: target.createdAt,
          contractDate: target.contractDate,
          closingDate: target.closingDate,
          listDate: null,
        }
      : null;
  }

  const [target] = await db
    .select({
      id: listings.id,
      agentUserId: listings.agentId,
      createdAt: listings.createdAt,
      listDate: listings.listDate,
    })
    .from(listings)
    .where(eq(listings.id, targetId))
    .limit(1);
  return target
    ? {
        targetType,
        targetId: target.id,
        agentUserId: target.agentUserId,
        transactionType: null,
        createdAt: target.createdAt,
        contractDate: null,
        closingDate: null,
        listDate: target.listDate,
      }
    : null;
}

export function checklistTemplateMatchesTarget(
  template: {
    targetType: ChecklistTargetType;
    transactionTypeFilter: "buyer" | "seller" | "dual" | "any";
  },
  target: ChecklistTargetSnapshot
): boolean {
  return (
    template.targetType === target.targetType &&
    (target.targetType === "listing" ||
      template.transactionTypeFilter === "any" ||
      template.transactionTypeFilter === target.transactionType)
  );
}

export async function applyChecklistTemplate(params: {
  templateId: number;
  targetType: ChecklistTargetType;
  targetId: number;
  source: "auto" | "manual";
  appliedByUserId?: number | null;
  autoKey?: string | null;
  underContractEventAt?: Date | string | null;
}): Promise<{ applicationId: number; alreadyApplied: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  if (params.autoKey) {
    const [existing] = await db
      .select({ id: agentChecklistApplications.id })
      .from(agentChecklistApplications)
      .where(eq(agentChecklistApplications.autoKey, params.autoKey))
      .limit(1);
    if (existing) return { applicationId: existing.id, alreadyApplied: true };
  }

  try {
    return await db.transaction(async tx => {
      const [template] = await tx
        .select()
        .from(agentChecklistTemplates)
        .where(eq(agentChecklistTemplates.id, params.templateId))
        .limit(1);
      if (!template) throw new Error("Checklist template not found");
      if (template.archivedAt) throw new Error("Archived checklist templates cannot be applied");

      const target = await getChecklistTarget(params.targetType, params.targetId, tx as Db);
      if (!target) throw new Error(`${params.targetType} target not found`);
      if (!checklistTemplateMatchesTarget(template, target)) {
        throw new Error("Checklist template does not apply to this target");
      }

      if (params.autoKey) {
        const [existing] = await tx
          .select({ id: agentChecklistApplications.id })
          .from(agentChecklistApplications)
          .where(eq(agentChecklistApplications.autoKey, params.autoKey))
          .limit(1);
        if (existing) return { applicationId: existing.id, alreadyApplied: true };
      }

      const templateItems = await tx
        .select()
        .from(agentChecklistTemplateItems)
        .where(eq(agentChecklistTemplateItems.templateId, template.id))
        .orderBy(asc(agentChecklistTemplateItems.sortOrder), asc(agentChecklistTemplateItems.id));

      const [insertResult] = await tx.insert(agentChecklistApplications).values({
        templateId: template.id,
        transactionId: target.targetType === "transaction" ? target.targetId : null,
        listingId: target.targetType === "listing" ? target.targetId : null,
        targetType: target.targetType,
        source: params.source,
        autoKey: params.autoKey ?? null,
        templateNameSnapshot: template.name,
        templateDescriptionSnapshot: template.description,
        templateOwnerUserIdSnapshot: template.ownerUserId,
        templateTargetTypeSnapshot: template.targetType,
        templateTransactionTypeFilterSnapshot: template.transactionTypeFilter,
        templateAutomaticDefaultEventSnapshot: template.automaticDefaultEvent,
        targetAgentUserIdSnapshot: target.agentUserId,
        appliedByUserId: params.appliedByUserId ?? null,
      });
      const applicationId = Number((insertResult as { insertId: number }).insertId);

      const snapshots = buildChecklistItemSnapshots(templateItems, target, {
        underContractEventAt: params.underContractEventAt,
      });
      if (snapshots.length > 0) {
        await tx.insert(agentChecklistApplicationItems).values(
          snapshots.map(item => ({ ...item, applicationId }))
        );
      }
      return { applicationId, alreadyApplied: false };
    });
  } catch (error) {
    // A unique auto key is the final race-proof idempotency guard.
    if (params.autoKey) {
      const [existing] = await db
        .select({ id: agentChecklistApplications.id })
        .from(agentChecklistApplications)
        .where(eq(agentChecklistApplications.autoKey, params.autoKey))
        .limit(1);
      if (existing) return { applicationId: existing.id, alreadyApplied: true };
    }
    throw error;
  }
}

/**
 * Applies every matching active default independently. Errors are returned and
 * logged, never thrown, so checklist automation cannot block primary records.
 */
export async function applyAutomaticChecklists(params: {
  targetType: ChecklistTargetType;
  targetId: number;
  event: AutomaticEvent;
  eventAt?: Date | string | null;
  actorUserId?: number | null;
}): Promise<{
  applied: number[];
  alreadyApplied: number[];
  failures: Array<{ templateId: number; message: string }>;
}> {
  const db = await getDb();
  if (!db) {
    console.error("[Checklists] Automatic application skipped: database unavailable");
    return { applied: [], alreadyApplied: [], failures: [] };
  }

  const target = await getChecklistTarget(params.targetType, params.targetId, db);
  if (!target?.agentUserId) return { applied: [], alreadyApplied: [], failures: [] };

  const underContractEventAt =
    params.event === "on_under_contract"
      ? params.eventAt ?? (target.contractDate ? undefined : new Date())
      : undefined;

  if (params.event === "on_under_contract") {
    await recalculateChecklistDueDates({
      targetType: params.targetType,
      targetId: params.targetId,
      anchors: ["under_contract"],
      underContractEventAt,
    });
  }

  const templates = await db
    .select()
    .from(agentChecklistTemplates)
    .where(
      and(
        eq(agentChecklistTemplates.ownerUserId, target.agentUserId),
        eq(agentChecklistTemplates.targetType, params.targetType),
        eq(agentChecklistTemplates.automaticDefaultEvent, params.event),
        isNull(agentChecklistTemplates.archivedAt),
        params.targetType === "transaction" && target.transactionType
          ? or(
              eq(agentChecklistTemplates.transactionTypeFilter, "any"),
              eq(agentChecklistTemplates.transactionTypeFilter, target.transactionType)
            )
          : undefined
      )
    )
    .orderBy(asc(agentChecklistTemplates.id));

  const result = {
    applied: [] as number[],
    alreadyApplied: [] as number[],
    failures: [] as Array<{ templateId: number; message: string }>,
  };
  for (const template of templates) {
    try {
      const application = await applyChecklistTemplate({
        templateId: template.id,
        targetType: params.targetType,
        targetId: params.targetId,
        source: "auto",
        appliedByUserId: params.actorUserId ?? null,
        autoKey: `${params.event}:${params.targetType}:${params.targetId}:template:${template.id}`,
        underContractEventAt:
          params.event === "on_under_contract" ? underContractEventAt : null,
      });
      (application.alreadyApplied ? result.alreadyApplied : result.applied).push(
        application.applicationId
      );
      if (!application.alreadyApplied && params.actorUserId) {
        await logActivity({
          userId: params.actorUserId,
          action: "checklist_applied",
          entityType: params.targetType,
          entityId: params.targetId,
          details: {
            applicationId: application.applicationId,
            templateId: template.id,
            source: "auto",
            event: params.event,
          },
        }).catch(error => {
          console.error("[Checklists] Automatic application activity log failed", {
            applicationId: application.applicationId,
            error,
          });
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failures.push({ templateId: template.id, message });
      console.error("[Checklists] Automatic application failed", {
        ...params,
        templateId: template.id,
        error,
      });
    }
  }
  return result;
}

export async function listChecklistApplications(
  targetType: ChecklistTargetType,
  targetId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const applications = await db
    .select()
    .from(agentChecklistApplications)
    .where(
      and(
        targetType === "transaction"
          ? eq(agentChecklistApplications.transactionId, targetId)
          : eq(agentChecklistApplications.listingId, targetId),
        isNull(agentChecklistApplications.removedAt)
      )
    )
    .orderBy(asc(agentChecklistApplications.createdAt), asc(agentChecklistApplications.id));

  const nested = [];
  for (const application of applications) {
    const assignee = users;
    const items = await db
      .select({ item: agentChecklistApplicationItems, assigneeName: assignee.name })
      .from(agentChecklistApplicationItems)
      .leftJoin(assignee, eq(agentChecklistApplicationItems.assignedUserId, assignee.id))
      .where(
        and(
          eq(agentChecklistApplicationItems.applicationId, application.id),
          isNull(agentChecklistApplicationItems.removedAt)
        )
      )
      .orderBy(
        asc(agentChecklistApplicationItems.sortOrder),
        asc(agentChecklistApplicationItems.id)
      );
    nested.push({
      ...application,
      items: items.map(row => ({ ...row.item, assigneeName: row.assigneeName })),
    });
  }
  return nested;
}

/**
 * Re-resolves selected relative anchors after their record dates change. Dates
 * explicitly edited on an applied item remain untouched.
 */
export async function recalculateChecklistDueDates(params: {
  targetType: ChecklistTargetType;
  targetId: number;
  anchors: ChecklistDueAnchor[];
  underContractEventAt?: Date | string | null;
}): Promise<number> {
  if (params.anchors.length === 0) return 0;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const target = await getChecklistTarget(params.targetType, params.targetId, db);
  if (!target) return 0;
  const applications = await db
    .select({ id: agentChecklistApplications.id })
    .from(agentChecklistApplications)
    .where(
      and(
        params.targetType === "transaction"
          ? eq(agentChecklistApplications.transactionId, params.targetId)
          : eq(agentChecklistApplications.listingId, params.targetId),
        isNull(agentChecklistApplications.removedAt)
      )
    );
  let updated = 0;
  for (const application of applications) {
    const items = await db
      .select({
        id: agentChecklistApplicationItems.id,
        dueAnchor: agentChecklistApplicationItems.dueAnchorSnapshot,
        dueOffsetDays: agentChecklistApplicationItems.dueOffsetDaysSnapshot,
        dueDateManuallyOverridden:
          agentChecklistApplicationItems.dueDateManuallyOverridden,
      })
      .from(agentChecklistApplicationItems)
      .where(
        and(
          eq(agentChecklistApplicationItems.applicationId, application.id),
          isNull(agentChecklistApplicationItems.removedAt)
        )
      );
    for (const item of items) {
      if (
        item.dueDateManuallyOverridden ||
        !item.dueAnchor ||
        !params.anchors.includes(item.dueAnchor)
      ) {
        continue;
      }
      const dueDate = resolveChecklistDueDate(
        target,
        item.dueAnchor,
        item.dueOffsetDays,
        { underContractEventAt: params.underContractEventAt }
      );
      await db
        .update(agentChecklistApplicationItems)
        .set({ dueDate })
        .where(eq(agentChecklistApplicationItems.id, item.id));
      updated++;
    }
  }
  return updated;
}
