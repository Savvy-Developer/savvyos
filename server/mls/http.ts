import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { MlsProvider } from "../../drizzle/mlsSchema";
import { mlsProviderUsage } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import type { ProviderLimits } from "./adapters/types";

/**
 * One lane per credential. Provider limits apply to the token, not to one MLS,
 * so every feed that shares a credential shares one lane, one limiter, and one
 * sequential replication queue.
 *
 * MLS Grid meters the token as a whole: photo downloads count toward the same
 * request and byte caps as API pages. For providers with a tokenBudget, the
 * media limiter is chained onto the API limiter, so both draw from one budget,
 * and media alone may use at most `mediaShare` of it. Other providers meter
 * media separately and keep separate limiters.
 *
 * Budgets are seeded from mls_provider_usage when a lane starts, so a restart
 * or deploy never resets the rolling hour and 24-hour windows.
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export class RetryableHttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs: number | null
  ) {
    super(message);
  }
}

export class FatalHttpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

type LimitSpec = { limit: number | null; windowMs: number };
type WindowSpec = { limit: number; windowMs: number; events: number[] };
type ByteWindowSpec = { limit: number; windowMs: number };

const validLimit = (window: LimitSpec): window is { limit: number; windowMs: number } =>
  typeof window.limit === "number" && Number.isFinite(window.limit) && window.limit > 0;

export type LimiterSnapshot = {
  windows: Array<{ windowMs: number; limit: number; used: number }>;
  byteWindows: Array<{ windowMs: number; limit: number; used: number }>;
  bytesLastHour: number;
  bytesPerHour: number | null;
  pausedForMs: number;
};

export interface Limiter {
  acquire(signal?: AbortSignal): Promise<number>;
  pause(ms: number): void;
  recordBytes(bytes: number): void;
  /** Adds usage that happened before this process started. */
  seed(at: number, requests: number, bytes: number): void;
  /** Milliseconds until one more request is allowed (0 = now). */
  nextWaitMs(now?: number): number;
  snapshot(): LimiterSnapshot;
}

export class SlidingLimiter implements Limiter {
  private lastAt = 0;
  private windows: WindowSpec[];
  private byteWindows: ByteWindowSpec[];
  private bytes: Array<{ at: number; bytes: number }> = [];
  private pausedUntil = 0;
  private byteHorizonMs: number;

  constructor(
    private minIntervalMs: number,
    windows: LimitSpec[],
    byteWindows: LimitSpec[] = []
  ) {
    this.windows = windows.filter(validLimit).map(window => ({ ...window, events: [] }));
    this.byteWindows = byteWindows.filter(validLimit);
    this.byteHorizonMs = Math.max(0, ...this.byteWindows.map(window => window.windowMs));
  }

  pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  nextWaitMs(now = Date.now()): number {
    let wait = Math.max(0, this.pausedUntil - now, this.lastAt + this.minIntervalMs - now);
    for (const window of this.windows) {
      while (window.events.length && window.events[0] <= now - window.windowMs) window.events.shift();
      if (window.events.length >= window.limit) {
        // Wait until enough old requests age out to leave one free slot.
        const freeing = window.events[window.events.length - window.limit];
        wait = Math.max(wait, freeing + window.windowMs - now + 5);
      }
    }
    if (this.byteWindows.length) {
      while (this.bytes.length && this.bytes[0].at <= now - this.byteHorizonMs) this.bytes.shift();
      for (const window of this.byteWindows) {
        const start = now - window.windowMs;
        let used = 0;
        for (const item of this.bytes) if (item.at > start) used += item.bytes;
        if (used < window.limit) continue;
        let excess = used - window.limit;
        for (const item of this.bytes) {
          if (item.at <= start) continue;
          excess -= item.bytes;
          if (excess < 0) {
            wait = Math.max(wait, item.at + window.windowMs - now + 5);
            break;
          }
        }
      }
    }
    return wait;
  }

  async acquire(signal?: AbortSignal): Promise<number> {
    let waited = 0;
    for (;;) {
      if (signal?.aborted) throw new Error("aborted");
      const now = Date.now();
      const wait = this.nextWaitMs(now);
      if (wait <= 0) {
        this.lastAt = now;
        for (const window of this.windows) window.events.push(now);
        return waited;
      }
      const step = Math.min(wait, 5_000);
      waited += step;
      await sleep(step);
    }
  }

  recordBytes(bytes: number) {
    if (this.byteWindows.length && bytes > 0) this.bytes.push({ at: Date.now(), bytes });
  }

  seed(at: number, requests: number, bytes: number) {
    for (const window of this.windows) {
      const count = Math.min(Math.max(0, Math.floor(requests)), window.limit * 2);
      for (let i = 0; i < count; i++) window.events.push(at);
      window.events.sort((a, b) => a - b);
    }
    if (this.byteWindows.length && bytes > 0) {
      this.bytes.push({ at, bytes });
      this.bytes.sort((a, b) => a.at - b.at);
    }
  }

  snapshot(): LimiterSnapshot {
    const now = Date.now();
    const bytesSince = (windowMs: number) => this.bytes.filter(item => item.at > now - windowMs).reduce((sum, item) => sum + item.bytes, 0);
    const hourly = this.byteWindows.find(window => window.windowMs === HOUR_MS);
    return {
      windows: this.windows.map(window => ({
        windowMs: window.windowMs,
        limit: window.limit,
        used: window.events.filter(at => at > now - window.windowMs).length,
      })),
      byteWindows: this.byteWindows.map(window => ({ windowMs: window.windowMs, limit: window.limit, used: bytesSince(window.windowMs) })),
      bytesLastHour: bytesSince(HOUR_MS),
      bytesPerHour: hourly?.limit ?? null,
      pausedForMs: Math.max(0, this.pausedUntil - now),
    };
  }
}

/** Media under a token-wide budget: its own share cap first, then the shared token budget. */
class ChainedLimiter implements Limiter {
  constructor(
    private own: SlidingLimiter,
    private shared: SlidingLimiter
  ) {}

  async acquire(signal?: AbortSignal) {
    const ownWait = await this.own.acquire(signal);
    return ownWait + (await this.shared.acquire(signal));
  }

  pause(ms: number) {
    // A 429 on a photo means the whole token is throttled.
    this.own.pause(ms);
    this.shared.pause(ms);
  }

  recordBytes(bytes: number) {
    this.own.recordBytes(bytes);
    this.shared.recordBytes(bytes);
  }

  seed(at: number, requests: number, bytes: number) {
    this.own.seed(at, requests, bytes); // The shared limiter is seeded with the token's full usage.
  }

  nextWaitMs(now = Date.now()) {
    return Math.max(this.own.nextWaitMs(now), this.shared.nextWaitMs(now));
  }

  snapshot() {
    return this.own.snapshot();
  }
}

type UsageBucket = { requests: number; bytes: number; mediaRequests: number; mediaBytes: number; throttled: number };

const intervalMs = (perSecond: number) => Math.ceil(1000 / Math.max(0.01, perSecond));

export class ProviderLane {
  readonly api: SlidingLimiter;
  readonly media: Limiter;
  private usage = new Map<string, UsageBucket>();
  private seeded: Promise<void> | null = null;

  constructor(
    readonly key: string,
    readonly provider: MlsProvider,
    readonly credentialRef: string,
    readonly limits: ProviderLimits
  ) {
    const budget = limits.tokenBudget ?? null;
    this.api = new SlidingLimiter(
      intervalMs(limits.requestsPerSecond),
      [
        { limit: limits.requestsPerHour, windowMs: HOUR_MS },
        { limit: limits.requestsPerDay, windowMs: DAY_MS },
        { limit: limits.requestsPerFiveMinutes, windowMs: 300_000 },
      ],
      budget
        ? [
            { limit: budget.bytesPerHour, windowMs: HOUR_MS },
            { limit: budget.bytesPerDay, windowMs: DAY_MS },
          ]
        : []
    );
    const mediaInterval = intervalMs(Math.max(1, Number(process.env.MLS_MEDIA_REQUESTS_PER_SECOND ?? 10)));
    if (budget) {
      const share = Math.min(1, Math.max(0.1, budget.mediaShare));
      const part = (value: number | null) => (value ? Math.floor(value * share) : null);
      const own = new SlidingLimiter(
        mediaInterval,
        [
          { limit: part(limits.requestsPerHour), windowMs: HOUR_MS },
          { limit: part(limits.requestsPerDay), windowMs: DAY_MS },
        ],
        [
          { limit: part(budget.bytesPerHour), windowMs: HOUR_MS },
          { limit: part(budget.bytesPerDay), windowMs: DAY_MS },
        ]
      );
      this.media = new ChainedLimiter(own, this.api);
    } else {
      this.media = new SlidingLimiter(
        mediaInterval,
        [{ limit: limits.mediaRequestsPerHour, windowMs: HOUR_MS }],
        [{ limit: limits.mediaBytesPerHour, windowMs: HOUR_MS }]
      );
    }
  }

  /** Loads the last 24 hours of recorded usage once, before the lane's first request. */
  ready() {
    this.seeded ??= this.seedFromUsage().catch(error => {
      console.warn(`[mls] could not load recent usage for ${this.key}; starting from zero`, error);
    });
    return this.seeded;
  }

  private async seedFromUsage() {
    if (!this.limits.tokenBudget) return;
    const db = await getDb();
    if (!db) return;
    const now = Date.now();
    const rows = await db
      .select()
      .from(mlsProviderUsage)
      .where(
        and(
          eq(mlsProviderUsage.credentialRef, this.credentialRef),
          eq(mlsProviderUsage.provider, this.provider),
          gte(mlsProviderUsage.windowStart, new Date(now - DAY_MS - HOUR_MS))
        )
      )
      .orderBy(asc(mlsProviderUsage.windowStart));
    for (const row of rows) {
      // Hourly buckets: place usage at the end of its hour (never in the future),
      // the conservative choice for when it ages out of each window.
      const at = Math.min(new Date(row.windowStart).getTime() + HOUR_MS - 1, now);
      const requests = Number(row.requests ?? 0) + Number(row.mediaRequests ?? 0);
      const bytes = Number(row.bytes ?? 0) + Number(row.mediaBytes ?? 0);
      this.api.seed(at, requests, bytes);
      this.media.seed(at, Number(row.mediaRequests ?? 0), Number(row.mediaBytes ?? 0));
    }
  }

  private bucket() {
    const hour = new Date();
    hour.setUTCMinutes(0, 0, 0);
    const key = hour.toISOString();
    let bucket = this.usage.get(key);
    if (!bucket) {
      bucket = { requests: 0, bytes: 0, mediaRequests: 0, mediaBytes: 0, throttled: 0 };
      this.usage.set(key, bucket);
    }
    return bucket;
  }

  countApi(bytes: number) {
    const bucket = this.bucket();
    bucket.requests += 1;
    bucket.bytes += bytes;
    this.api.recordBytes(bytes);
  }

  countMedia(bytes: number) {
    const bucket = this.bucket();
    bucket.mediaRequests += 1;
    bucket.mediaBytes += bytes;
    this.media.recordBytes(bytes);
  }

  countThrottle() {
    this.bucket().throttled += 1;
  }

  /** Persist hourly usage so the admin page can show it across restarts. */
  async flushUsage() {
    if (this.usage.size === 0) return;
    const db = await getDb();
    if (!db) return;
    const entries = Array.from(this.usage.entries());
    this.usage.clear();
    for (const [windowStart, bucket] of entries) {
      await db
        .insert(mlsProviderUsage)
        .values({
          credentialRef: this.credentialRef,
          provider: this.provider,
          windowStart: new Date(windowStart),
          ...bucket,
        })
        .onDuplicateKeyUpdate({
          set: {
            requests: sql`${mlsProviderUsage.requests} + ${bucket.requests}`,
            bytes: sql`${mlsProviderUsage.bytes} + ${bucket.bytes}`,
            mediaRequests: sql`${mlsProviderUsage.mediaRequests} + ${bucket.mediaRequests}`,
            mediaBytes: sql`${mlsProviderUsage.mediaBytes} + ${bucket.mediaBytes}`,
            throttled: sql`${mlsProviderUsage.throttled} + ${bucket.throttled}`,
          },
        });
    }
  }
}

const lanes = new Map<string, ProviderLane>();

export function laneKey(provider: MlsProvider, credentialRef: string) {
  return `${provider}:${credentialRef}`;
}

export function getLane(provider: MlsProvider, credentialRef: string, limits: ProviderLimits) {
  const key = laneKey(provider, credentialRef);
  let lane = lanes.get(key);
  if (!lane) {
    lane = new ProviderLane(key, provider, credentialRef, limits);
    lanes.set(key, lane);
  }
  return lane;
}

export function allLanes() {
  return Array.from(lanes.values());
}

/** Never let a token or signed URL reach a log line or the database. */
export function redactUrl(url: string) {
  try {
    const parsed = new URL(url);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/token|signature|sig|key|expires|policy|credential/i.test(key)) parsed.searchParams.set(key, "REDACTED");
    }
    return parsed.toString();
  } catch {
    return url.split("?")[0];
  }
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export type HttpOptions = {
  signal?: AbortSignal;
  maxAttempts?: number;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

async function withRetries<T>(
  lane: ProviderLane,
  limiter: Limiter,
  url: string,
  run: () => Promise<T>,
  options: HttpOptions
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  let lastError: unknown = null;
  await lane.ready();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await limiter.acquire(options.signal);
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (error instanceof FatalHttpError) {
        if (error.status === 401 && attempt === 1 && options.onUnauthorized) {
          options.onUnauthorized();
          continue;
        }
        throw error;
      }
      if (options.signal?.aborted) throw error;
      const status = error instanceof RetryableHttpError ? error.status : 0;
      if (status === 429) {
        lane.countThrottle();
        // MLS Grid suspends tokens that keep exceeding limits: back off hard.
        const pause = (error as RetryableHttpError).retryAfterMs ?? (lane.provider === "mls_grid" ? 15 * 60_000 : 60_000 * attempt);
        limiter.pause(pause);
      } else {
        await sleep(Math.min(60_000, 2_000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Request failed after ${maxAttempts} attempts: ${redactUrl(url)}`);
}

async function send(url: string, headers: Record<string, string>, options: HttpOptions) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await (options.fetchImpl ?? fetch)(url, { headers, signal: controller.signal });
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableHttpError(`HTTP ${response.status} from ${redactUrl(url)}`, response.status, retryAfterMs(response));
    }
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 300);
      throw new FatalHttpError(`HTTP ${response.status} from ${redactUrl(url)}: ${text}`, response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof RetryableHttpError || error instanceof FatalHttpError) throw error;
    throw new RetryableHttpError(
      `Network error for ${redactUrl(url)}: ${error instanceof Error ? error.message : String(error)}`,
      0,
      null
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/** Bytes as the provider meters them: Content-Length (compressed) when sent, else the decoded size. */
export function wireBytes(response: Pick<Response, "headers">, text: string) {
  const header = Number(response.headers.get("content-length"));
  return Number.isFinite(header) && header > 0 ? header : Buffer.byteLength(text);
}

export async function requestJson(
  lane: ProviderLane,
  url: string,
  headers: () => Promise<Record<string, string>>,
  options: HttpOptions = {}
): Promise<{ body: any; bytes: number }> {
  return withRetries(
    lane,
    lane.api,
    url,
    async () => {
      const response = await send(url, { Accept: "application/json", ...(await headers()) }, options);
      const text = await response.text();
      const bytes = wireBytes(response, text);
      lane.countApi(bytes);
      try {
        return { body: JSON.parse(text), bytes };
      } catch {
        throw new FatalHttpError(`Invalid JSON from ${redactUrl(url)}`, response.status);
      }
    },
    options
  );
}

export async function requestText(
  lane: ProviderLane,
  url: string,
  headers: () => Promise<Record<string, string>>,
  options: HttpOptions = {}
): Promise<string> {
  return withRetries(
    lane,
    lane.api,
    url,
    async () => {
      const response = await send(url, { Accept: "application/xml,text/xml,*/*", ...(await headers()) }, options);
      const text = await response.text();
      lane.countApi(wireBytes(response, text));
      return text;
    },
    options
  );
}

export async function downloadMedia(
  lane: ProviderLane,
  url: string,
  headers: Record<string, string>,
  options: HttpOptions = {}
): Promise<{ data: Buffer; contentType: string }> {
  return withRetries(
    lane,
    lane.media,
    url,
    async () => {
      const response = await send(url, headers, { ...options, timeoutMs: options.timeoutMs ?? 60_000 });
      const data = Buffer.from(await response.arrayBuffer());
      lane.countMedia(data.length);
      return { data, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
    },
    // Single-use URLs (MLS Grid) cannot be retried once consumed.
    { ...options, maxAttempts: options.maxAttempts ?? (lane.provider === "mls_grid" ? 1 : 3) }
  );
}
