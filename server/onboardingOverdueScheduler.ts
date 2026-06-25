/**
 * Onboarding Overdue Task Scheduler
 *
 * Runs daily to check for overdue onboarding tasks and sends email alerts
 * to both the admin (owner) and the agent.
 */
import { getDb } from "./db";
import {
  onboardingInstances,
  onboardingInstanceTasks,
  users,
} from "../drizzle/schema";
import { eq, and, lt, sql, isNotNull } from "drizzle-orm";
import { sendTransactionalEmail } from "./_core/resendEmail";

let isRunning = false;

export async function checkOverdueOnboardingTasks(): Promise<void> {
  // Onboarding overdue-task reminder emails are disabled by request (they were
  // generating confusing/redundant email). Off by default; set the env flag
  // ONBOARDING_OVERDUE_EMAILS=on to re-enable. Gating here covers BOTH the daily
  // scheduler and the manual trigger in the onboarding router.
  if (process.env.ONBOARDING_OVERDUE_EMAILS !== "on") {
    console.log("[OnboardingOverdueScheduler] Overdue reminder emails disabled (ONBOARDING_OVERDUE_EMAILS != 'on') — skipping run.");
    return;
  }

  if (isRunning) return;
  isRunning = true;

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[OnboardingOverdueScheduler] Database not available.");
      return;
    }

    // Find all overdue tasks: dueDate < NOW(), not completed, instance is in_progress
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

    // Group overdue tasks by instanceId
    type OverdueTask = typeof overdueTasks[number];
    const byInstance: Record<number, OverdueTask[]> = {};
    for (const task of overdueTasks) {
      if (!byInstance[task.instanceId]) byInstance[task.instanceId] = [];
      byInstance[task.instanceId].push(task);
    }

    const instanceIds = Object.keys(byInstance).map(Number);
    console.log(
      `[OnboardingOverdueScheduler] Found ${overdueTasks.length} overdue task(s) across ${instanceIds.length} instance(s).`
    );

    // For each instance, get agent info and send alerts
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
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, instance.agentUserId));

        if (!agent) continue;

        // Build task list for email
        const taskListLines = tasks.map((t: OverdueTask) => {
          const daysOverdue = Math.floor(
            (Date.now() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24)
          );
          return `<strong style="color:#0A0A0A;">${t.taskTitle}</strong> — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue (${t.assignee} task)`;
        });

        const emailContext = {
          agentName: agent.name ?? agent.email ?? "Agent",
          overdueCount: String(tasks.length),
          taskList: taskListLines.join("\n"),
        };

        // Send to admin (all users with admin role)
        const admins = await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.role, "admin"));

        for (const admin of admins) {
          if (!admin.email) continue;
          await sendTransactionalEmail("onboarding_overdue", {
            recipientName: admin.name ?? undefined,
            recipientEmail: admin.email,
            ...emailContext,
          });
          console.log(
            `[OnboardingOverdueScheduler] Sent overdue alert to admin ${admin.email} for agent ${agent.name ?? agent.email}`
          );
        }

        // Send to the agent themselves (for their own overdue tasks)
        const agentOverdueTasks = tasks.filter((t: OverdueTask) => t.assignee === "agent");
        if (agentOverdueTasks.length > 0 && agent.email) {
          const agentTaskList = agentOverdueTasks.map((t: OverdueTask) => {
            const daysOverdue = Math.floor(
              (Date.now() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24)
            );
            return `<strong style="color:#0A0A0A;">${t.taskTitle}</strong> — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue`;
          });

          await sendTransactionalEmail("onboarding_overdue", {
            recipientName: agent.name ?? undefined,
            recipientEmail: agent.email,
            agentName: agent.name ?? agent.email ?? "Agent",
            overdueCount: String(agentOverdueTasks.length),
            taskList: agentTaskList.join("\n"),
          });
          console.log(
            `[OnboardingOverdueScheduler] Sent overdue alert to agent ${agent.email}`
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
    // After first fire, run every 24h
    setInterval(() => {
      checkOverdueOnboardingTasks().catch((err) =>
        console.error("[OnboardingOverdueScheduler] Error:", err)
      );
    }, 24 * 60 * 60 * 1000);
  }, delay);

  // Also run a startup check after 20 seconds
  setTimeout(() => {
    checkOverdueOnboardingTasks().catch((err) =>
      console.error("[OnboardingOverdueScheduler] Startup check error:", err)
    );
  }, 20_000);
}
