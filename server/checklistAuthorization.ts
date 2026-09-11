import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  agentChecklistApplicationItems,
  agentChecklistApplications,
  agentChecklistTemplateShares,
  agentChecklistTemplates,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getChecklistTarget, type ChecklistTargetSnapshot } from "./checklistService";

export type ChecklistViewer = {
  id: number;
  role: "admin" | "agent" | "isa" | "agent_support";
};

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function assertChecklistRole(viewer: ChecklistViewer): void {
  if (viewer.role !== "admin" && viewer.role !== "agent") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only administrators and agents can access checklists.",
    });
  }
}

export function canAccessChecklistTarget(
  viewer: ChecklistViewer,
  target: Pick<ChecklistTargetSnapshot, "agentUserId">
): boolean {
  return viewer.role === "admin" || target.agentUserId === viewer.id;
}

export async function requireChecklistTargetAccess(
  db: Db,
  viewer: ChecklistViewer,
  targetType: "transaction" | "listing",
  targetId: number
): Promise<ChecklistTargetSnapshot> {
  assertChecklistRole(viewer);
  const target = await getChecklistTarget(targetType, targetId, db);
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Target not found." });
  if (!canAccessChecklistTarget(viewer, target)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You can only access ${targetType}s assigned to you.`,
    });
  }
  return target;
}

export async function requireTemplateRead(
  db: Db,
  viewer: ChecklistViewer,
  templateId: number
) {
  assertChecklistRole(viewer);
  const [template] = await db
    .select()
    .from(agentChecklistTemplates)
    .where(eq(agentChecklistTemplates.id, templateId))
    .limit(1);
  if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Checklist template not found." });
  if (viewer.role === "admin" || template.ownerUserId === viewer.id) return template;

  const [share] = await db
    .select({ id: agentChecklistTemplateShares.id })
    .from(agentChecklistTemplateShares)
    .where(
      and(
        eq(agentChecklistTemplateShares.templateId, templateId),
        eq(agentChecklistTemplateShares.sharedWithUserId, viewer.id)
      )
    )
    .limit(1);
  if (!share) throw new TRPCError({ code: "FORBIDDEN", message: "This checklist template is not shared with you." });
  return template;
}

export async function requireTemplateManage(
  db: Db,
  viewer: ChecklistViewer,
  templateId: number
) {
  const template = await requireTemplateRead(db, viewer, templateId);
  if (viewer.role !== "admin" && template.ownerUserId !== viewer.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only manage checklist templates you own.",
    });
  }
  return template;
}

export async function requireApplicationAccess(
  db: Db,
  viewer: ChecklistViewer,
  applicationId: number
) {
  assertChecklistRole(viewer);
  const [application] = await db
    .select()
    .from(agentChecklistApplications)
    .where(eq(agentChecklistApplications.id, applicationId))
    .limit(1);
  if (!application) throw new TRPCError({ code: "NOT_FOUND", message: "Checklist application not found." });
  await requireChecklistTargetAccess(
    db,
    viewer,
    application.targetType,
    application.targetType === "transaction"
      ? application.transactionId!
      : application.listingId!
  );
  return application;
}

export async function requireApplicationItemAccess(
  db: Db,
  viewer: ChecklistViewer,
  itemId: number
) {
  assertChecklistRole(viewer);
  const [item] = await db
    .select()
    .from(agentChecklistApplicationItems)
    .where(eq(agentChecklistApplicationItems.id, itemId))
    .limit(1);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Checklist item not found." });
  const application = await requireApplicationAccess(db, viewer, item.applicationId);
  return { item, application };
}
