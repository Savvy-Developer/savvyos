import type { MlsFeed, MlsProvider, MlsSource } from "../../../drizzle/mlsSchema";

/**
 * A provider adapter knows one transport (MLS Grid, Trestle, Spark, a direct
 * RESO server, or a custom feed): how to authenticate, how to page through
 * replication, how deletions are signalled, how media is fetched, and which
 * fields are local to the MLS. It knows nothing about SavvyOS tables. The
 * sync engine drives adapters; the normalizer turns their records into the
 * Savvy canonical schema.
 */

export type MlsResource = "Property" | "Member" | "Office" | "OpenHouse";
export const MLS_RESOURCES: MlsResource[] = ["Property", "Member", "Office", "OpenHouse"];

export type FeedContext = {
  feed: MlsFeed;
  source: MlsSource;
};

export type ReplicationMode = "initial" | "incremental";

export type CursorState = {
  phase: ReplicationMode;
  highWaterMark: string | null;
  resumeToken: string | null;
};

export type ODataPage = {
  value: Record<string, any>[];
  nextLink: string | null;
  raw: Record<string, any>;
};

export type ProviderLimits = {
  /** Sustained API requests per second across one credential. */
  requestsPerSecond: number;
  requestsPerHour: number | null;
  requestsPerDay: number | null;
  /** Rolling five-minute cap (Spark). */
  requestsPerFiveMinutes: number | null;
  mediaBytesPerHour: number | null;
  mediaRequestsPerHour: number | null;
  mediaConcurrency: number;
  /** Replication must be strictly sequential per credential (MLS Grid). */
  sequentialOnly: boolean;
  /**
   * The provider meters the token as a whole (MLS Grid): photo downloads count
   * toward the same request limits above and these byte caps, and media alone
   * may use at most `mediaShare` of the budget so replication keeps room.
   */
  tokenBudget?: { bytesPerHour: number; bytesPerDay: number; mediaShare: number } | null;
  /** A provider-authorized, time-boxed import allowance. Limiters switch to
   * baseline at untilMs even if the Railway worker is not restarted. */
  temporary?: { untilMs: number; baseline: ProviderLimits };
};

export type ProviderCapabilities = {
  /** Deletions arrive as flagged records (MLS Grid MlgCanView=false). */
  deleteFlag: boolean;
  /** Deletions must be found by comparing the full key list. */
  requiresReconciliation: boolean;
  /** Provider exposes a Deleted resource (some direct RESO servers). */
  deletedResource: boolean;
  /** Media URLs are short lived, so media must be downloaded right away. */
  mediaUrlsExpire: boolean;
  /** Days of replication gap after which deletions can be missed. */
  maxReplicationGapDays: number | null;
  /**
   * The initial pass is ordered by ModificationTimestamp. When false (key
   * ordered passes), the post-import high-water mark is the pass start time
   * minus a margin, so edits made during a long import are not missed.
   */
  initialOrderedByTimestamp: boolean;
};

export type ExtractedMedia = {
  mediaKey: string;
  sortOrder: number;
  category: string | null;
  mimeType: string | null;
  caption: string | null;
  isPrimary: boolean;
  sourceUrl: string | null;
  sourceModifiedAt: Date | null;
};

export interface MlsAdapter {
  provider: MlsProvider;
  limits(feed: MlsFeed): ProviderLimits;
  capabilities: ProviderCapabilities;
  defaultBaseUrl: string;
  /** Resources this adapter replicates by default. */
  defaultResources: MlsResource[];
  keyField(resource: MlsResource): string;
  authHeaders(ctx: FeedContext): Promise<Record<string, string>>;
  mediaHeaders(ctx: FeedContext): Promise<Record<string, string>>;
  firstPageUrl(ctx: FeedContext, resource: MlsResource, cursor: CursorState, windowEnd: string): string;
  nextPageUrl(ctx: FeedContext, resource: MlsResource, page: ODataPage, cursor: CursorState): string | null;
  /** Key-only listing of every record currently in the feed (reconciliation). */
  reconcileUrl(ctx: FeedContext, resource: MlsResource): string | null;
  deletedSinceUrl?(ctx: FeedContext, resource: MlsResource, sinceIso: string): string | null;
  /** One record by key, with the same expansions as replication (fresh media URLs). */
  singleRecordUrl(ctx: FeedContext, resource: MlsResource, providerKey: string): string;
  metadataUrl(ctx: FeedContext): string;
  /** False when the record must be removed from our store. */
  isViewable(record: Record<string, any>): boolean;
  permittedUses(record: Record<string, any>): string[] | null;
  /** Remove provider-added prefixes from keys and MLS numbers. */
  stripKey(ctx: FeedContext, value: string): string;
  isLocalField(ctx: FeedContext, name: string): boolean | null;
  extractMedia(record: Record<string, any>): ExtractedMedia[];
  mediaUrlExpiresAt(url: string, receivedAt: Date): Date | null;
}

/** OData string literal with quotes escaped. */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Build a URL with OData system query options, encoding spaces as %20. */
export function buildODataUrl(base: string, resource: string, params: Record<string, string | number | null | undefined>) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value)).replace(/%2C/g, ",").replace(/%24/g, "$")}`)
    .join("&");
  return `${joinUrl(base, resource)}${query ? `?${query}` : ""}`;
}

export function parseODataPage(body: any): ODataPage {
  if (!body || !Array.isArray(body.value) || body.error) throw new Error("Invalid OData page: expected a value array");
  const value = body.value;
  const nextLink = typeof body?.["@odata.nextLink"] === "string" ? body["@odata.nextLink"] : null;
  return { value, nextLink, raw: body };
}

export function firstString(record: Record<string, any>, names: string[]): string | null {
  for (const name of names) {
    const value = record?.[name];
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Generic RESO Media parsing; providers only differ in a few field names. */
export function extractResoMedia(record: Record<string, any>, collections = ["Media"]): ExtractedMedia[] {
  let items: any[] = [];
  for (const name of collections) {
    if (Array.isArray(record?.[name])) {
      items = record[name];
      break;
    }
  }
  const media = items
    .map((item, index): ExtractedMedia | null => {
      const mediaKey = firstString(item, ["MediaKey", "MediaObjectID", "ResourceRecordID"]);
      if (!mediaKey) return null;
      const order = Number(item.Order ?? item.MediaOrder ?? index);
      return {
        mediaKey,
        sortOrder: Number.isFinite(order) ? order : index,
        category: firstString(item, ["MediaCategory", "MediaType"]),
        mimeType: firstString(item, ["MimeType", "MediaMimeType"]),
        caption: firstString(item, ["ShortDescription", "LongDescription", "MediaCaption"])?.slice(0, 500) ?? null,
        isPrimary: item.PreferredPhotoYN === true,
        sourceUrl: firstString(item, ["MediaURL", "MediaUrl", "Uri"]),
        sourceModifiedAt: toDate(item.MediaModificationTimestamp ?? item.ModificationTimestamp),
      };
    })
    .filter((item): item is ExtractedMedia => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (media.length > 0 && !media.some(item => item.isPrimary)) {
    const firstPhoto = media.find(item => !item.category || /photo|image/i.test(item.category)) ?? media[0];
    firstPhoto.isPrimary = true;
  }
  return media;
}

export function readOption<T>(feed: MlsFeed, name: string, fallback: T): T {
  const options = (feed.options ?? {}) as Record<string, unknown>;
  const value = options[name];
  return value === undefined || value === null ? fallback : (value as T);
}
