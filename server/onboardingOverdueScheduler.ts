/**
 * Onboarding Overdue Task Scheduler
 *
 * Runs daily to check for overdue onboarding tasks and sends email alerts to the
 * active administrators configured in SavvyOS. The affected agent can also be
 * opted in to receive only their own overdue onboarding tasks.
 */
import { getDb } from "./db";
import {
  emailNotificationSettings,
  onboardingInstances,
  onboardingInstanceTasks,
  onboardingOverdueNotificationRecipients,
  users,
} from "../drizzle/schema";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { sendTransactionalEmail } from "./_core/resendEmail";

let isRunning = false;

export async function checkOverdueOnboardingTasks(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[OnboardingOverdueScheduler] Database not available.");
      return;
    }

    const [notificationSetting] = await db
      .select({ isEnabled: emailNotificationSettings.isEnabled })
      .from(emailNotificationSettings)
      .where(eq(emailNotificationSettings.notificationKey, "onboarding_overdue"))
      .limit(1);
    if (!notificationSetting?.isEnabled) {
      console.log(
        "[OnboardingOverdueScheduler] Overdue reminder emails are disabled in SavvyOS — skipping run."
      );
      return;
    }

    const [audienceSetting] = await db
      .select({
        recipientUserIds:
          onboardingOverdueNotificationRecipients.recipientUserIds,
        includeAffectedAgent:
          onboardingOverdueNotificationRecipients.includeAffectedAgent,
      })
      .from(onboardingOverdueNotificationRecipients)
      .limit(1);

    const recipientIds = Array.from(
      new Set(
        (audienceSetting?.recipientUserIds ?? []).filter(
          (id): id is number => Number.isInteger(id) && id > 0
        )
      )
    );
    const recipients = recipientIds.length
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(
            and(
              inArray(users.id, recipientIds),
              eq(users.role, "admin"),
              eq(users.isActive, true),
              isNotNull(users.email)
            )
          )
      : [];
    const includeAffectedAgent = Boolean(audienceSetting?.includeAffectedAgent);

    if (recipients.length === 0 && !includeAffectedAgent) {
      console.log(
        "[OnboardingOverdueScheduler] No alert recipients are configured in SavvyOS — skipping run."
      );
      return;
    }

    // Find all overdue tasks: dueDate < NOW(), not completed, instance is in_progress.
    const overdueTasks = await db
      .select({
        taskId: onboardingInstanceTasks.id,
        taskTitle: onboardingInstanceTasks.title,
        dueDate: onboardingInstanceTasks.dueDate,
        instanceId: onboardingInstanceTasks.instanceId,
        assignee: onboardingInstanceTasks.assignee,
      })
      .from(onboardingInstanceTasks)
      .innerJoin(
        onboardingInstances,
        eq(onboardingInstanceTasks.instanceId, onboardingInstances.id)
      )
      .where(
        and(
          eq(onboardingInstanceTasks.completed, false),
          isNotNull(onboardingInstanceTasks.dueDate),
          lt(onboardingInstanceTasks.dueDate, new Date()),
          eq(onboardingInstances.status, "in_progress")
        )
      );

    if (overdueTasks.length === 0) {
      console.log("[OnboardingOverdueScheduler] No overdue onboarding tasks found.");
      return;
    }

    // Group overdue tasks by instanceId.
    type OverdueTask = (typeof overdueTasks)[number];
    const byInstance: Record<number, OverdueTask[]> = {};
    for (const task of overdueTasks) {
      if (!byInstance[task.instanceId]) byInstance[task.instanceId] = [];
      byInstance[task.instanceId].push(task);
    }

    const instanceIds = Object.keys(byInstance).map(Number);
    const runDate = new Date().toISOString().slice(0, 10);
    console.log(
      `[OnboardingOverdueScheduler] Found ${overdueTasks.length} overdue task(s) across ${instanceIds.length} instance(s).`
    );

    // For each instance, get agent info and send alerts.
    for (const instanceId of instanceIds) {
      const tasks = byInstance[instanceId];
      try {
        const [instance] = await db
          .select({
            agentUserId: onboardingInstances.agentUserId,
          })
          .from(onboardingInstances)
          .where(eq(onboardingInstances.id, instanceId));

        if (!instance) continue;

        const [agent] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            isActive: users.isActive,
          })
          .from(users)
          .where(eq(users.id, instance.agentUserId));

        if (!agent || !agent.isActive) continue;

        const taskListLines = tasks.map((task: OverdueTask) => {
          const daysOverdue = Math.floor(
            (Date.now() - new Date(task.dueDate!).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          return `<strong style="color:#0A0A0A;">${task.taskTitle}</strong> — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue (${task.assignee} task)`;
        });
        const emailContext = {
          agentName: agent.name ?? agent.email ?? "Agent",
          overdueCount: String(tasks.length),
          taskList: taskListLines.join("\n"),
        };

        for (const recipient of recipients) {
          if (!recipient.email) continue;
          const delivery = await sendTransactionalEmail(
            "onboarding_overdue",
            {
              recipientName: recipient.name ?? undefined,
              recipientEmail: recipient.email,
              ...emailContext,
            },
            {
              idempotencyKey: `onboarding-overdue:${runDate}:${instanceId}:recipient:${recipient.id}`,
            }
          );
          console.log(
            `[OnboardingOverdueScheduler] ${delivery.sent ? "Sent" : "Skipped"} overdue alert to configured recipient ${recipient.email} for agent ${agent.name ?? agent.email}${delivery.reason ? ` (${delivery.reason})` : ""}`
          );
        }

        // The affected agent receives only their own overdue, agent-assigned tasks
        // when an administrator explicitly enables the agent-copy option.
        const agentOverdueTasks = includeAffectedAgent
          ? tasks.filter((task: OverdueTask) => task.assignee === "agent")
          : [];
        if (agentOverdueTasks.length > 0 && agent.email) {
          const agentTaskList = agentOverdueTasks.map((task: OverdueTask) => {
            const daysOverdue = Math.floor(
              (Date.now() - new Date(task.dueDate!).getTime()) /
                (1000 * 60 * 60 * 24)
            );
            return `<strong style="color:#0A0A0A;">${task.taskTitle}</strong> — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`;
          });
          const delivery = await sendTransactionalEmail(
            "onboarding_overdue",
            {
              recipientName: agent.name ?? undefined,
              recipientEmail: agent.email,
              agentName: agent.name ?? agent.email ?? "Agent",
              overdueCount: String(agentOverdueTasks.length),
              taskList: agentTaskList.join("\n"),
            },
            {
              idempotencyKey: `onboarding-overdue:${runDate}:${instanceId}:agent:${agent.id}`,
            }
          );
          console.log(
            `[OnboardingOverdueScheduler] ${delivery.sent ? "Sent" : "Skipped"} overdue alert to agent ${agent.email}${delivery.reason ? ` (${delivery.reason})` : ""}`
          );
        }
      } catch (err) {
        console.error(
          `[OnboardingOverdueScheduler] Error processing instance ${instanceId}:`,
          err
        );
      }
    }
  } catch (err) {
    console.error("[OnboardingOverdueScheduler] Error:", err);
  } finally {
    isRunning = false;
  }
}

/**
 * Schedule the overdue check to run daily at 8am, with a startup check.
 */
export function scheduleOnboardingOverdueCheck(): void {
  function msUntilNext8am(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(8, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  const delay = msUntilNext8am();
  const nextRun = new Date(Date.now() + delay);
  console.log(
    `[OnboardingOverdueScheduler] Next daily run scheduled at ${nextRun.toLocaleString()}`
  );

  setTimeout(() => {
    checkOverdueOnboardingTasks().catch((err) =>
      console.error("[OnboardingOverdueScheduler] Error:", err)
    );
    // After first fire, run every 24h.
    setInterval(() => {
      checkOverdueOnboardingTasks().catch((err) =>
        console.error("[OnboardingOverdueScheduler] Error:", err)
      );
    }, 24 * 60 * 60 * 1000);
  }, delay);

  // Also run a startup check after 20 seconds.
  setTimeout(() => {
    checkOverdueOnboardingTasks().catch((err) =>
      console.error("[OnboardingOverdueScheduler] Startup check error:", err)
    );
  }, 20_000);
}
