import { sql } from "drizzle-orm";
import type { MlsProvider } from "../../drizzle/mlsSchema";
import { mlsProviderUsage } from "../../drizzle/mlsSchema";
import { getDb } from "../db";
import type { ProviderLimits } from "./adapters/types";

/**
 * One lane per credential. MLS Grid limits (2 req/s, 7,200/h, 40,000/day,
 * 4 GB/h) apply to the token, not to one MLS, so every feed that shares a
 * credential shares one lane, one limiter, and one sequential replication
 * queue. Media has its own limiter because providers meter it separately.
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

type WindowSpec = { limit: number; windowMs: number; events: number[] };

class SlidingLimiter {
  private lastAt = 0;
  private windows: WindowSpec[];
  private bytes: Array<{ at: number; bytes: number }> = [];
  private pausedUntil = 0;

  constructor(
    private minIntervalMs: number,
    windows: Array<{ limit: number | null; windowMs: number }>,
    private bytesPerHour: number | null
  ) {
    this.windows = windows
      .filter((window): window is { limit: number; windowMs: number } => !!window.limit && window.limit > 0)
      .map(window => ({ ...window, events: [] }));
  }

  pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }

  /** Milliseconds until one more request is allowed. */
  private waitMs(now: number): number {
    let wait = Math.max(0, this.pausedUntil - now, this.lastAt + this.minIntervalMs - now);
    for (const window of this.windows) {
      while (window.events.length && window.events[0] <= now - window.windowMs) window.events.shift();
      if (window.events.length >= window.limit) {
        wait = Math.max(wait, window.events[0] + window.windowMs - now + 5);
      }
    }
    if (this.bytesPerHour) {
      while (this.bytes.length && this.bytes[0].at <= now - 3_600_000) this.bytes.shift();
      const used = this.bytes.reduce((sum, item) => sum + item.bytes, 0);
      if (used >= this.bytesPerHour && this.bytes.length) {
        wait = Math.max(wait, this.bytes[0].at + 3_600_000 - now + 5);
      }
    }
    return wait;
  }

  async acquire(signal?: AbortSignal): Promise<number> {
    let waited = 0;
    for (;;) {
      if (signal?.aborted) throw new Error("aborted");
      const now = Date.now();
      const wait = this.waitMs(now);
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
    if (this.bytesPerHour) this.bytes.push({ at: Date.now(), bytes });
  }

  snapshot() {
    const now = Date.now();
    return {
      windows: this.windows.map(window => ({
        windowMs: window.windowMs,
        limit: window.limit,
        used: window.events.filter(at => at > now - window.windowMs).length,
      })),
      bytesLastHour: this.bytes.filter(item => item.at > now - 3_600_000).reduce((sum, item) => sum + item.bytes, 0),
      bytesPerHour: this.bytesPerHour,
      pausedForMs: Math.max(0, this.pausedUntil - now),
    };
  }
}

type UsageBucket = { requests: number; bytes: number; mediaRequests: number; mediaBytes: number; throttled: number };

export class ProviderLane {
  readonly api: SlidingLimiter;
  readonly media: SlidingLimiter;
  private usage = new Map<string, UsageBucket>();

  constructor(
    readonly key: string,
    readonly provider: MlsProvider,
    readonly credentialRef: string,
    readonly limits: ProviderLimits
  ) {
    this.api = new SlidingLimiter(
      Math.ceil(1000 / Math.max(0.01, limits.requestsPerSecond)),
      [
        { limit: limits.requestsPerHour, windowMs: 3_600_000 },
        { limit: limits.requestsPerDay, windowMs: 86_400_000 },
        { limit: limits.requestsPerFiveMinutes, windowMs: 300_000 },
      ],
      null
    );
    this.media = new SlidingLimiter(
      Math.ceil(1000 / Math.max(1, Number(process.env.MLS_MEDIA_REQUESTS_PER_SECOND ?? 10))),
      [{ limit: limits.mediaRequestsPerHour, windowMs: 3_600_000 }],
      limits.mediaBytesPerHour
    );
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
  limiter: SlidingLimiter,
  url: string,
  run: () => Promise<T>,
  options: HttpOptions
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  let lastError: unknown = null;
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
      lane.countApi(text.length);
      try {
        return { body: JSON.parse(text), bytes: text.length };
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
      lane.countApi(text.length);
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
