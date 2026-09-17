import { randomUUID } from "crypto";
import { refreshOneTimeSendMetrics } from "./oneTimeSendTracking";
import { handleResendWebhook, type ResendWebhookEvent } from "./_core/resendWebhook";
import {
  claimResendWebhookEvents,
  markResendWebhookEventProcessed,
  rescheduleResendWebhookEvent,
} from "./resendWebhookInbox";

const POLL_INTERVAL_MS = Number.parseInt(process.env.RESEND_WEBHOOK_WORKER_POLL_MS ?? "1000", 10);
const BATCH_SIZE = Number.parseInt(process.env.RESEND_WEBHOOK_WORKER_BATCH_SIZE ?? "150", 10);
const CONCURRENCY = Number.parseInt(process.env.RESEND_WEBHOOK_WORKER_CONCURRENCY ?? "4", 10);
const workerId = `resend-webhook-worker:${process.env.RAILWAY_DEPLOYMENT_ID ?? process.pid}:${randomUUID()}`;

export type ResendWebhookProjectionResult = {
  claimed: number;
  processed: number;
  retried: number;
  refreshedCampaigns: number;
};

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  handler: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, values.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        await handler(values[index]);
      }
    })
  );
}

/**
 * Projects a finite batch of durable Resend callbacks. The original callback
 * has already been acknowledged, so a temporary database or provider failure
 * merely reschedules the queue row instead of losing analytics or tying up a
 * browser-facing request.
 */
export async function processResendWebhookEventBatch(
  options: { limit?: number; concurrency?: number } = {}
): Promise<ResendWebhookProjectionResult> {
  const events = await claimResendWebhookEvents(workerId, options.limit ?? BATCH_SIZE);
  const result: ResendWebhookProjectionResult = {
    claimed: events.length,
    processed: 0,
    retried: 0,
    refreshedCampaigns: 0,
  };
  if (events.length === 0) return result;

  const affectedCampaignIds = new Set<number>();
  await mapWithConcurrency(events, options.concurrency ?? CONCURRENCY, async (event) => {
    try {
      const projection = await handleResendWebhook(event.payload as ResendWebhookEvent, event.svixId, {
        deferOneTimeMetricsRefresh: true,
      });
      if (projection.oneTimeSendId) affectedCampaignIds.add(projection.oneTimeSendId);
      await markResendWebhookEventProcessed(event.id, workerId);
      result.processed += 1;
    } catch (error) {
      console.error(
        `[ResendWebhookWorker] Event ${event.id} will retry:`,
        error instanceof Error ? error.message : error
      );
      await rescheduleResendWebhookEvent(event, workerId, error);
      result.retried += 1;
    }
  });

  for (const sendId of Array.from(affectedCampaignIds)) {
    try {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new Error("Database is unavailable for campaign metrics refresh");
      await refreshOneTimeSendMetrics(db, sendId);
      result.refreshedCampaigns += 1;
    } catch (error) {
      // Event projections are already durable. A later callback or the next
      // batch will refresh totals, so never mark their analytics event failed.
      console.error(
        `[ResendWebhookWorker] Campaign ${sendId} metrics refresh deferred:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return result;
}

let stopping = false;

async function runForever(): Promise<void> {
  console.log(
    `[ResendWebhookWorker] Started with batch=${BATCH_SIZE}, concurrency=${CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms.`
  );
  while (!stopping) {
    try {
      const result = await processResendWebhookEventBatch();
      if (result.claimed > 0) {
        console.log(
          `[ResendWebhookWorker] Processed ${result.processed}/${result.claimed}; retried=${result.retried}; campaign refreshes=${result.refreshedCampaigns}.`
        );
        continue;
      }
    } catch (error) {
      console.error(
        "[ResendWebhookWorker] Batch failure:",
        error instanceof Error ? error.message : error
      );
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(250, POLL_INTERVAL_MS)));
  }
  console.log("[ResendWebhookWorker] Stopped.");
}

function stop(): void {
  stopping = true;
}

process.once("SIGTERM", stop);
process.once("SIGINT", stop);

runForever().catch((error) => {
  console.error("[ResendWebhookWorker] Fatal error:", error);
  process.exitCode = 1;
});
