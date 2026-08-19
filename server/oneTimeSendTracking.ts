import { eq, sql } from "drizzle-orm";
import { oneTimeSendRecipients, oneTimeSends } from "../drizzle/schema";

type Db = any;

/**
 * Rebuild visible batch totals from recipient rows. This is deliberately derived
 * rather than incremented so provider events can arrive out of order or be retried.
 */
export async function refreshOneTimeSendMetrics(
  db: Db,
  sendId: number
): Promise<void> {
  const [metrics] = await db
    .select({
      sent: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.status} = 'sent' then 1 else 0 end), 0)`,
      skipped: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.status} = 'skipped' then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.status} = 'failed' then 1 else 0 end), 0)`,
      delivered: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.deliveredAt} is not null or ${oneTimeSendRecipients.openedAt} is not null or ${oneTimeSendRecipients.clickedAt} is not null or ${oneTimeSendRecipients.providerLastEvent} in ('delivered', 'opened', 'clicked') then 1 else 0 end), 0)`,
      opened: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.openedAt} is not null or ${oneTimeSendRecipients.providerLastEvent} in ('opened', 'clicked') then 1 else 0 end), 0)`,
      clicked: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.clickedAt} is not null or ${oneTimeSendRecipients.providerLastEvent} = 'clicked' then 1 else 0 end), 0)`,
      bounced: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.bouncedAt} is not null or ${oneTimeSendRecipients.providerLastEvent} = 'bounced' then 1 else 0 end), 0)`,
      complained: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.complainedAt} is not null or ${oneTimeSendRecipients.providerLastEvent} = 'complained' then 1 else 0 end), 0)`,
      suppressed: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.suppressedAt} is not null or ${oneTimeSendRecipients.providerLastEvent} = 'suppressed' then 1 else 0 end), 0)`,
      replied: sql<number>`coalesce(sum(case when ${oneTimeSendRecipients.repliedAt} is not null then 1 else 0 end), 0)`,
    })
    .from(oneTimeSendRecipients)
    .where(eq(oneTimeSendRecipients.sendId, sendId));

  await db
    .update(oneTimeSends)
    .set({
      sentCount: Number(metrics?.sent ?? 0),
      skippedCount: Number(metrics?.skipped ?? 0),
      failedCount: Number(metrics?.failed ?? 0),
      deliveredCount: Number(metrics?.delivered ?? 0),
      openedCount: Number(metrics?.opened ?? 0),
      clickedCount: Number(metrics?.clicked ?? 0),
      bouncedCount: Number(metrics?.bounced ?? 0),
      complainedCount: Number(metrics?.complained ?? 0),
      suppressedCount: Number(metrics?.suppressed ?? 0),
      repliedCount: Number(metrics?.replied ?? 0),
    })
    .where(eq(oneTimeSends.id, sendId));
}

export function oneTimeRecipientQueueCount(send: {
  totalRecipients: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
}): number {
  return Math.max(
    0,
    Number(send.totalRecipients) -
      Number(send.sentCount) -
      Number(send.skippedCount) -
      Number(send.failedCount)
  );
}
