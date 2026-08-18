import { and, eq, isNotNull } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { buildDailyAgentReport } from "../server/dailyAgentReportScheduler";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is unavailable.");

  const [agent] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(
      eq(users.role, "agent"),
      eq(users.personType, "full_user"),
      eq(users.isActive, true),
      isNotNull(users.email),
    ))
    .limit(1);

  if (!agent) throw new Error("No active agent with an email address was found.");
  const report = await buildDailyAgentReport(agent, new Date(), false);

  console.log(JSON.stringify({
    agent: report.agent,
    reportDate: report.reportDate,
    metrics: report.metrics,
    pipelineStages: report.pipeline.filter((stage) => stage.count > 0),
    hotLeadCount: report.hotLeads.length,
    overdueTaskCount: report.overdueTasks.length,
    featureUpdateCount: report.featureUpdates.length,
    suggestionCount: report.suggestions.length,
    aiGenerated: report.aiGenerated,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
