import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { mlsFeeds, mlsSources, mlsWorkerHeartbeats } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import { adapterFor } from "./adapters";
import { queueActiveGalleries } from "./activeGallery";
import type { FeedContext } from "./adapters/types";
import { credentialStatus } from "./credentials";
import { runFeedCycle, syncDue } from "./engine";
import { allLanes, getLane, laneKey } from "./http";
import { licenseError } from "./license";
import { hasPendingMedia, resetStaleMediaClaims, runMediaBatch } from "./media";
import { privateMlsStorageError } from "./privateMedia";
import { ensureMlsSchema } from "./schema";

/**
 * The MLS ingestion scheduler. Runs as its own Railway service
 * (SAVVYOS_PROCESS=mlsIngestionWorker) so million-record imports never slow
 * the admin app. One lane per credential: feeds sharing a credential run one
 * after another (MLS Grid requires sequential requests), different
 * credentials run in parallel. Media downloads run beside replication on the
 * same lane, inside the provider's media limits.
 */

const TICK_MS = Number(process.env.MLS_WORKER_TICK_MS ?? 15_000);
const HEARTBEAT_MS = 30_000;
const STALE_CLAIM_SWEEP_MS = 10 * 60_000;

type LaneState = { syncing: boolean; media: boolean; scanning: boolean };

export class MlsIngestionScheduler {
  readonly workerId = `mls-worker:${process.env.RAILWAY_DEPLOYMENT_ID ?? process.pid}:${randomUUID().slice(0, 8)}`;
  private controller = new AbortController();
  private lanes = new Map<string, LaneState>();
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<Promise<unknown>>();
  private lastActivity: Record<string, unknown> = {};
  private startedAt = new Date();

  async start() {
    await ensureMlsSchema();
    await resetStaleMediaClaims().catch(error => console.error("[mls] reset stale media claims failed", error));
    await this.beat();
    this.timers.push(setInterval(() => void this.beat(), HEARTBEAT_MS));
    this.timers.push(setInterval(() => void this.tick(), TICK_MS));
    // Now that a failed batch no longer restarts the process, release abandoned
    // claims on a timer too (only rows untouched for 30+ minutes are reset).
    this.timers.push(
      setInterval(
        () => void resetStaleMediaClaims().catch(error => console.error("[mls] reset stale media claims failed", error)),
        STALE_CLAIM_SWEEP_MS
      )
    );
    void this.tick();
    console.log(`[mls] ingestion worker ${this.workerId} started`);
  }

  async stop() {
    this.controller.abort();
    for (const timer of this.timers) clearInterval(timer);
    await Promise.allSettled(Array.from(this.running));
    for (const lane of allLanes()) await lane.flushUsage().catch(() => undefined);
    const db = await getDb();
    await db?.delete(mlsWorkerHeartbeats).where(eq(mlsWorkerHeartbeats.workerId, this.workerId)).catch(() => undefined);
  }

  private track<T>(promise: Promise<T>) {
    this.running.add(promise);
    promise.finally(() => this.running.delete(promise)).catch(() => undefined);
    return promise;
  }

  private async beat() {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    const photoStorageIssue = privateMlsStorageError();
    const detail = JSON.stringify({
      photoStorage: { configurationValid: !photoStorageIssue, issue: photoStorageIssue },
      lanes: allLanes().map(lane => ({
        key: lane.key,
        provider: lane.provider,
        state: this.lanes.get(lane.key) ?? { syncing: false, media: false, scanning: false },
        api: lane.api.snapshot(),
        media: lane.media.snapshot(),
      })),
      lastActivity: this.lastActivity,
    });
    await db
      .insert(mlsWorkerHeartbeats)
      .values({ workerId: this.workerId, startedAt: this.startedAt, lastBeatAt: now, version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ?? null, detail })
      .onDuplicateKeyUpdate({ set: { lastBeatAt: now, detail } })
      .catch(error => console.error("[mls] heartbeat failed", error));
    for (const lane of allLanes()) await lane.flushUsage().catch(() => undefined);
  }

  private async loadFeeds(): Promise<FeedContext[]> {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({ feed: mlsFeeds, source: mlsSources }).from(mlsFeeds).innerJoin(mlsSources, eq(mlsSources.id, mlsFeeds.sourceId));
    return rows.filter(row => row.feed.enabled || row.feed.syncRequestedAt).map(row => ({ feed: row.feed, source: row.source }));
  }

  async tick() {
    if (this.controller.signal.aborted) return;
    let feeds: FeedContext[];
    try {
      feeds = await this.loadFeeds();
    } catch (error) {
      console.error("[mls] could not load feeds", error);
      return;
    }
    const byLane = new Map<string, FeedContext[]>();
    for (const ctx of feeds) {
      if (ctx.feed.provider === "custom") continue;
      const key = laneKey(ctx.feed.provider, ctx.feed.credentialRef);
      byLane.set(key, [...(byLane.get(key) ?? []), ctx]);
    }
    for (const [key, laneFeeds] of Array.from(byLane.entries())) {
      const state = this.lanes.get(key) ?? { syncing: false, media: false, scanning: false };
      this.lanes.set(key, state);
      const configured = laneFeeds.filter(ctx => credentialStatus(ctx.feed).configured && !licenseError(ctx.feed));
      if (!state.scanning && configured.some(ctx => ctx.feed.provider === "mls_grid" && ctx.feed.enabled)) {
        state.scanning = true;
        void this.track(this.scanActiveGalleries(configured)).finally(() => { state.scanning = false; });
      }
      if (!state.syncing) {
        // Requested syncs first, then the stalest due feed.
        const due = laneFeeds
          .filter(ctx => syncDue(ctx.feed))
          .sort((a, b) => Number(!!b.feed.syncRequestedAt) - Number(!!a.feed.syncRequestedAt) || (a.feed.lastRunFinishedAt?.getTime() ?? 0) - (b.feed.lastRunFinishedAt?.getTime() ?? 0));
        if (due.length) {
          state.syncing = true;
          void this.track(this.syncLane(key, due)).finally(() => {
            state.syncing = false;
          });
        }
      }
      if (!state.media && configured.length) {
        state.media = true;
        void this.track(this.mediaLane(key, configured)).finally(() => {
          state.media = false;
        });
      }
    }
  }

  private async syncLane(key: string, feeds: FeedContext[]) {
    for (const ctx of feeds) {
      if (this.controller.signal.aborted) return;
      try {
        const summary = await runFeedCycle(ctx.feed.id, { workerId: this.workerId, signal: this.controller.signal });
        this.lastActivity[`feed:${ctx.feed.id}`] = { at: new Date().toISOString(), ok: summary.ok, skipped: summary.skipped ?? null, error: summary.error ?? null };
      } catch (error) {
        console.error(`[mls] feed ${ctx.feed.id} cycle crashed`, error);
      }
    }
  }

  private async scanActiveGalleries(feeds: FeedContext[]) {
    const db = await getDb();
    if (!db || this.controller.signal.aborted) return;
    for (const ctx of feeds) {
      if (this.controller.signal.aborted || ctx.feed.provider !== "mls_grid" || !ctx.feed.enabled) continue;
      try {
        const progress = await queueActiveGalleries(db, ctx);
        if (progress.scanned || progress.queued) this.lastActivity[`gallery:${ctx.feed.id}`] = { at: new Date().toISOString(), ...progress };
      } catch (error) {
        // Gallery discovery must not block live listing sync or media downloads.
        console.error(`[mls] Active gallery scan failed for feed ${ctx.feed.id}`, error);
      }
    }
  }

  private async mediaLane(key: string, feeds: FeedContext[]) {
    const provider = feeds[0].feed.provider;
    const lane = getLane(provider, feeds[0].feed.credentialRef, adapterFor(provider).limits(feeds[0].feed));
    const feedIds = feeds.map(ctx => ctx.feed.id);
    // Drain for up to one tick window, then yield so feed changes are picked up.
    const until = Date.now() + Math.max(TICK_MS * 4, 60_000);
    try {
      while (Date.now() < until && !this.controller.signal.aborted) {
        if (!(await hasPendingMedia(feedIds))) return;
        const result = await runMediaBatch(lane, feeds, this.workerId, { signal: this.controller.signal });
        this.lastActivity[`media:${key}`] = { at: new Date().toISOString(), ...result };
        if (result.claimed === 0 && result.deleted === 0 && result.refreshed === 0) return;
      }
    } catch (error) {
      // A failed batch must never take the worker down. The next tick retries,
      // and abandoned "downloading" claims are released by the stale-claim sweep.
      console.error(`[mls] media lane ${key} batch failed`, error);
      this.lastActivity[`media:${key}`] = { at: new Date().toISOString(), error: String(error instanceof Error ? error.message : error).slice(0, 300) };
    }
  }
}

let inProcess: MlsIngestionScheduler | null = null;

/** Optional: run ingestion inside the web process (MLS_INGESTION_IN_WEB=on). */
export async function startInProcessMlsIngestion() {
  if (process.env.MLS_INGESTION_IN_WEB !== "on" || process.env.MLS_INGESTION === "off") return;
  inProcess ??= new MlsIngestionScheduler();
  await inProcess.start();
}
