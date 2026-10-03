import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { mlsFeeds, mlsSources, mlsWorkerHeartbeats } from "../../drizzle/mlsSchema";
import { getMlsDb as getDb } from "./db";
import { adapterFor } from "./adapters";
import type { FeedContext } from "./adapters/types";
import { backfillCdnLinks, retireLegacyGalleryQueue } from "./cdnLinks";
import { credentialStatus } from "./credentials";
import { runFeedCycle, syncDue } from "./engine";
import { allLanes, getLane, laneKey } from "./http";
import { licenseError } from "./license";
import { hasPendingMedia, resetStaleMediaClaims, runMediaBatch } from "./media";
import { privateMlsStorageError } from "./privateMedia";
import { ensureMlsSchema, startSearchCoverIndexBuild } from "./schema";

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
  /** Feeds whose last cycle ended at the history page budget with more to import. */
  private backlog = new Set<number>();
  /** When each feed last got an import burst, for round-robin across a lane. */
  private lastBurstAt = new Map<number, number>();
  private running = new Set<Promise<unknown>>();
  private lastActivity: Record<string, unknown> = {};
  private startedAt = new Date();

  async start() {
    await ensureMlsSchema();
    // Only the worker builds the large search indexes, so web and worker never
    // queue behind each other's metadata-lock wait.
    startSearchCoverIndexBuild();
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
        void this.track(this.linkCdnPhotos(configured)).finally(() => { state.scanning = false; });
      }
      if (!state.syncing) {
        // Requested syncs first, then the stalest due feed. Feeds with import
        // backlog join the round so syncLane can give one of them a burst
        // after the live passes.
        const due = laneFeeds
          .filter(ctx => syncDue(ctx.feed) || (ctx.feed.enabled && this.backlog.has(ctx.feed.id)))
          .sort((a, b) => Number(!!b.feed.syncRequestedAt) - Number(!!a.feed.syncRequestedAt) || (a.feed.lastRunFinishedAt?.getTime() ?? 0) - (b.feed.lastRunFinishedAt?.getTime() ?? 0));
        if (due.length) {
          state.syncing = true;
          void this.track(this.syncLane(key, due).finally(() => {
            state.syncing = false;
          })).then(more => {
            if (more && !this.controller.signal.aborted) void this.tick();
          });
        }
      }
      if (!state.media && configured.length) {
        state.media = true;
        // A lane that stopped only because its drain window ended has more
        // photos waiting: start the next window now (feeds and licenses are
        // reloaded by tick) instead of idling up to TICK_MS.
        void this.track(this.mediaLane(key, configured).finally(() => {
          state.media = false;
        })).then(more => {
          if (more && !this.controller.signal.aborted) void this.tick();
        });
      }
    }
  }

  /**
   * One scheduling round for a lane (one provider token). First a live pass
   * for every feed whose sync is due, then one time-boxed import burst for
   * the feed with backlog that has waited longest. Live latency therefore
   * stays near the sync interval plus one burst, however many feeds share
   * the token. Resolves true while any feed on the lane still has backlog.
   */
  private async syncLane(key: string, feeds: FeedContext[]): Promise<boolean> {
    for (const ctx of feeds.filter(item => syncDue(item.feed))) {
      if (this.controller.signal.aborted) return false;
      await this.runCycle(ctx, { skipBacklog: true });
    }
    const next = feeds
      .filter(ctx => ctx.feed.enabled && this.backlog.has(ctx.feed.id))
      .sort((a, b) => (this.lastBurstAt.get(a.feed.id) ?? 0) - (this.lastBurstAt.get(b.feed.id) ?? 0))[0];
    if (next && !this.controller.signal.aborted) {
      this.lastBurstAt.set(next.feed.id, Date.now());
      await this.runCycle(next, {});
    }
    return feeds.some(ctx => this.backlog.has(ctx.feed.id));
  }

  private async runCycle(ctx: FeedContext, options: { skipBacklog?: boolean }) {
    try {
      const summary = await runFeedCycle(ctx.feed.id, { workerId: this.workerId, signal: this.controller.signal, ...options });
      this.lastActivity[`feed:${ctx.feed.id}`] = {
        at: new Date().toISOString(),
        ok: summary.ok,
        pass: options.skipBacklog ? "live" : "burst",
        skipped: summary.skipped ?? null,
        error: summary.error ?? null,
      };
      if (summary.ok && summary.backlog) this.backlog.add(ctx.feed.id);
      else this.backlog.delete(ctx.feed.id);
    } catch (error) {
      this.backlog.delete(ctx.feed.id);
      console.error(`[mls] feed ${ctx.feed.id} cycle crashed`, error);
    }
  }

  /** Gives older listings MLS Grid CDN photo links; never blocks sync or photo downloads. */
  private async linkCdnPhotos(feeds: FeedContext[]) {
    const db = await getDb();
    if (!db || this.controller.signal.aborted) return;
    const grid = feeds.filter(ctx => ctx.feed.provider === "mls_grid" && ctx.feed.enabled);
    if (!grid.length) return;
    try {
      const retired = await retireLegacyGalleryQueue(db, grid.map(ctx => ctx.feed.id));
      if (retired.removed || retired.stopped) this.lastActivity.galleryQueueRetired = { at: new Date().toISOString(), ...retired };
    } catch (error) {
      console.error("[mls] legacy gallery queue cleanup failed", error);
    }
    for (const ctx of grid) {
      if (this.controller.signal.aborted) return;
      try {
        // Each feed's calls count against its own token's lane.
        const lane = getLane("mls_grid", ctx.feed.credentialRef, adapterFor("mls_grid").limits(ctx.feed));
        const progress = await backfillCdnLinks(db, lane, ctx, { signal: this.controller.signal });
        if (progress.scanned || !progress.done) this.lastActivity[`cdn:${ctx.feed.id}`] = { at: new Date().toISOString(), ...progress };
      } catch (error) {
        console.error(`[mls] CDN link backfill failed for feed ${ctx.feed.id}`, error);
      }
    }
  }

  /** Returns true when the drain window ended with work still queued. */
  private async mediaLane(key: string, feeds: FeedContext[]): Promise<boolean> {
    const provider = feeds[0].feed.provider;
    const lane = getLane(provider, feeds[0].feed.credentialRef, adapterFor(provider).limits(feeds[0].feed));
    const feedIds = feeds.map(ctx => ctx.feed.id);
    // Drain for up to one tick window, then yield so feed changes are picked up.
    const until = Date.now() + Math.max(TICK_MS * 4, 60_000);
    try {
      while (Date.now() < until && !this.controller.signal.aborted) {
        if (!(await hasPendingMedia(feedIds))) return false;
        const started = Date.now();
        const result = await runMediaBatch(lane, feeds, this.workerId, { signal: this.controller.signal });
        this.lastActivity[`media:${key}`] = { at: new Date().toISOString(), ms: Date.now() - started, ...result };
        if (result.claimed === 0 && result.deleted === 0 && result.refreshed === 0) return false;
      }
      return !this.controller.signal.aborted;
    } catch (error) {
      // A failed batch must never take the worker down. The next tick retries,
      // and abandoned "downloading" claims are released by the stale-claim sweep.
      console.error(`[mls] media lane ${key} batch failed`, error);
      this.lastActivity[`media:${key}`] = { at: new Date().toISOString(), error: String(error instanceof Error ? error.message : error).slice(0, 300) };
      return false;
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
