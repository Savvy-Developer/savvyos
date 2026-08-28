import { and, desc, eq, isNull } from "drizzle-orm";
import {
  smartPlanEnrollments,
  smartPlanExecutions,
  smartPlans,
} from "../drizzle/schema";
import { getDb } from "./db";

type ReplyChannel = "email" | "sms";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function pauseEnrollmentForReply(
  db: Database,
  enrollmentId: number,
  channel: ReplyChannel,
  repliedAt: Date
): Promise<boolean> {
  const rows = await db
    .select({
      enrollmentId: smartPlanEnrollments.id,
      status: smartPlanEnrollments.status,
      pauseOnReply: smartPlans.pauseOnReply,
    })
    .from(smartPlanEnrollments)
    .innerJoin(smartPlans, eq(smartPlans.id, smartPlanEnrollments.planId))
    .where(eq(smartPlanEnrollments.id, enrollmentId))
    .limit(1);
  const enrollment = rows[0];
  if (!enrollment?.pauseOnReply || enrollment.status !== "active") return false;

  await db
    .update(smartPlanEnrollments)
    .set({ status: "paused", nextStepAt: null })
    .where(
      and(
        eq(smartPlanEnrollments.id, enrollmentId),
        eq(smartPlanEnrollments.status, "active")
      )
    );

  // Attribute a reply to the latest successfully sent message in the plan. Email
  // replies with a reply token have already been marked on their exact execution;
  // this also provides a safe best-effort record for regular inbound email.
  {
    const execution = await db
      .select({ id: smartPlanExecutions.id })
      .from(smartPlanExecutions)
      .where(
        and(
          eq(smartPlanExecutions.enrollmentId, enrollmentId),
          eq(smartPlanExecutions.channel, channel),
          eq(smartPlanExecutions.status, "sent"),
          isNull(smartPlanExecutions.repliedAt)
        )
      )
      .orderBy(desc(smartPlanExecutions.sentAt))
      .limit(1);
    if (execution[0]) {
      await db
        .update(smartPlanExecutions)
        .set({ repliedAt })
        .where(eq(smartPlanExecutions.id, execution[0].id));
    }
  }

  return true;
}

/** Pause the plan that sent a reply-token-correlated email, when that plan opts in. */
export async function pauseSmartPlanForEmailReply(
  enrollmentId: number,
  repliedAt: Date
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  return pauseEnrollmentForReply(db, enrollmentId, "email", repliedAt);
}

/** Pause every opted-in active plan for a contact replying by text. */
export async function pauseSmartPlansForSmsReply(
  contactId: number,
  repliedAt: Date
): Promise<number> {
  return pauseSmartPlansForContactReply(contactId, "sms", repliedAt);
}

/** Pause every opted-in active plan with a sent email for a replying contact. */
export async function pauseSmartPlansForEmailReply(
  contactId: number,
  repliedAt: Date
): Promise<number> {
  return pauseSmartPlansForContactReply(contactId, "email", repliedAt);
}

async function pauseSmartPlansForContactReply(
  contactId: number,
  channel: ReplyChannel,
  repliedAt: Date
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const enrollments = await db
    .select({ id: smartPlanEnrollments.id })
    .from(smartPlanEnrollments)
    .innerJoin(smartPlans, eq(smartPlans.id, smartPlanEnrollments.planId))
    .innerJoin(smartPlanExecutions, eq(smartPlanExecutions.enrollmentId, smartPlanEnrollments.id))
    .where(
      and(
        eq(smartPlanEnrollments.contactId, contactId),
        eq(smartPlanEnrollments.status, "active"),
        eq(smartPlans.pauseOnReply, true),
        eq(smartPlanExecutions.channel, channel),
        eq(smartPlanExecutions.status, "sent")
      )
    );

  let paused = 0;
  for (const enrollment of enrollments) {
    if (await pauseEnrollmentForReply(db, enrollment.id, channel, repliedAt))
      paused += 1;
  }
  return paused;
}
