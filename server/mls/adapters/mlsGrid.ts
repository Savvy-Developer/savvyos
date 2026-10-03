import type { MlsFeed } from "../../../drizzle/mlsSchema";
import { readCredential } from "../credentials";
import { isMlsGridCdnUrl } from "../mlsGridCdn";
import {
  buildODataUrl,
  extractResoMedia,
  odataString,
  readOption,
  type CursorState,
  type FeedContext,
  type MlsAdapter,
  type MlsResource,
  type ODataPage,
  type ProviderLimits,
} from "./types";

/**
 * MLS Grid API v2 (https://docs.mlsgrid.com/api-documentation/api-version-2.0).
 *
 * - Every request filters exactly one OriginatingSystemName.
 * - Initial import adds MlgCanView eq true. Afterwards, replicate WITHOUT that
 *   filter using ModificationTimestamp gt <greatest received>, so records that
 *   lost display rights arrive with MlgCanView=false and are deleted locally.
 * - Records with MlgCanView=false leave the feed after 7 days, so a longer
 *   replication gap forces a full reload.
 * - $top max 1000 with $expand. Follow @odata.nextLink. Sequential only.
 * - Limits are per token and cover API pages AND photo downloads. See
 *   MLS_GRID_LIMITS: we stay under the lower of the published caps and the
 *   warning thresholds from MLS Grid's Sept 30, 2026 notice.
 * - Photos come from MLS Grid's CDN (cdn-savvystr.mlsgrid.com). CDN links do
 *   not expire, may be displayed directly, and do not count toward API
 *   limits; SavvyOS ignores any non-CDN media link.
 * - Keys and MLS numbers carry the MLS prefix (e.g. CAR); strip it for display.
 */

const EXPAND: Record<MlsResource, string | null> = {
  Property: "Media,Rooms,UnitTypes",
  Member: null,
  Office: null,
  OpenHouse: null,
};

const KEY_FIELD: Record<MlsResource, string> = {
  Property: "ListingKey",
  Member: "MemberKey",
  Office: "OfficeKey",
  OpenHouse: "OpenHouseKey",
};

function token(ctx: FeedContext) {
  const value = readCredential(ctx.feed.credentialRef, "TOKEN");
  if (!value) throw new Error(`Missing MLS_CRED_${ctx.feed.credentialRef}_TOKEN for MLS Grid`);
  return value;
}

function originatingSystem(ctx: FeedContext) {
  const name = ctx.feed.originatingSystemName ?? ctx.source.originatingSystemName;
  if (!name) throw new Error(`Feed ${ctx.feed.id} has no MLS Grid OriginatingSystemName`);
  return name;
}

function prefix(ctx: FeedContext) {
  return ctx.feed.keyPrefix ?? ctx.source.keyPrefix ?? null;
}

/** A one-time market prefill followed by the ordinary timestamp-based full pass. */
export function mlsGridStageUrl(ctx: FeedContext, stage: "priority" | "history", cursor: CursorState) {
  const filters = [
    `OriginatingSystemName eq ${odataString(originatingSystem(ctx))}`,
    "MlgCanView eq true",
  ];
  if (stage === "priority") {
    filters.push("StandardStatus in ('Active','Active Under Contract','Coming Soon','Pending')");
  }
  if (cursor.highWaterMark) filters.push(`ModificationTimestamp gt ${cursor.highWaterMark}`);
  // Historical records still need rooms and units, but not signed photo URLs
  // that will expire before a millions-record backfill can use them.
  return buildODataUrl(ctx.feed.baseUrl, "Property", {
    $filter: filters.join(" and "),
    $expand: stage === "priority" ? EXPAND.Property : "Rooms,UnitTypes",
    // Both stages expand, so MLS Grid's 1000-record ceiling applies.
    $top: Math.min(Math.max(1, Number(readOption(ctx.feed, "pageSize", 1000)) || 1000), 1000),
  });
}

/** MLS Grid supports `ListingId in (...)`; one request returns photo links for up to 100 listings. */
export function mlsGridBatchUrl(ctx: FeedContext, listingIds: string[]) {
  if (!listingIds.length || listingIds.length > 100) throw new Error("MLS Grid batch requires 1 to 100 listing IDs");
  return buildODataUrl(ctx.feed.baseUrl, "Property", {
    $filter: `OriginatingSystemName eq ${odataString(originatingSystem(ctx))} and ListingId in (${listingIds.map(odataString).join(",")})`,
    $expand: "Media",
    $top: 100,
  });
}

/**
 * Per token. `published` is docs.mlsgrid.com; `warning` and `suspension` are
 * from MLS Grid's notice to Savvy (Sept 30, 2026). Exceeding warning sends an
 * email; exceeding suspension blocks the token with 429s until usage falls.
 */
export const MLS_GRID_LIMITS = {
  published: { requestsPerSecond: 2, requestsPerHour: 7_200, requestsPerDay: 40_000, bytesPerHour: 4_000_000_000 },
  warning: { requestsPerSecond: 4, requestsPerHour: 7_200, requestsPerDay: 40_000, bytesPerHour: 3_072_000_000, bytesPerDay: 40_000_000_000 },
  suspension: { requestsPerSecond: 6, requestsPerHour: 18_000, requestsPerDay: 60_000, bytesPerHour: 4_096_000_000, bytesPerDay: 60_000_000_000 },
} as const;

/** Share of the lowest limit we allow ourselves. options.rateSafety can lower it, never raise it past 0.9. */
const DEFAULT_SAFETY = 0.8;
/**
 * MLS Grid counts requests per second at its edge, so network jitter can bunch
 * requests we spaced evenly. One request per second per token (half the
 * published 2) keeps any one second at 2 or fewer. The pace is shared by every
 * process through apiGate.ts. Peak use on Oct 3, 2026 was 0.39 per second.
 */
export const MLS_GRID_RPS_SAFETY = 0.5;

export const MLS_GRID_MEDIA_CONCURRENCY = { default: 64, max: 128 } as const;
/** MLS_GRID_MEDIA_CONCURRENCY (env) wins over the feed's `mediaConcurrency` option. */
export function mlsGridMediaConcurrency(feed: MlsFeed) {
  const requested = Number(process.env.MLS_GRID_MEDIA_CONCURRENCY ?? readOption(feed, "mediaConcurrency", MLS_GRID_MEDIA_CONCURRENCY.default));
  const value = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : MLS_GRID_MEDIA_CONCURRENCY.default;
  return Math.min(MLS_GRID_MEDIA_CONCURRENCY.max, value);
}

export const mlsGridAdapter: MlsAdapter = {
  provider: "mls_grid",
  defaultBaseUrl: "https://api.mlsgrid.com/v2",
  defaultResources: ["Property", "Member", "Office", "OpenHouse"],
  capabilities: {
    deleteFlag: true,
    requiresReconciliation: false,
    deletedResource: false,
    // SavvyOS uses only MLS Grid CDN links, which do not expire.
    mediaUrlsExpire: false,
    maxReplicationGapDays: 7,
    initialOrderedByTimestamp: true,
    stagedImport: true,
  },
  limits(feed: MlsFeed) {
    const requested = Number(readOption(feed, "rateSafety", DEFAULT_SAFETY));
    const safety = Math.min(0.9, Math.max(0.1, Number.isFinite(requested) ? requested : DEFAULT_SAFETY));
    const { published, warning } = MLS_GRID_LIMITS;
    const lowest = {
      requestsPerSecond: Math.min(published.requestsPerSecond, warning.requestsPerSecond),
      requestsPerHour: Math.min(published.requestsPerHour, warning.requestsPerHour),
      requestsPerDay: Math.min(published.requestsPerDay, warning.requestsPerDay),
      bytesPerHour: Math.min(published.bytesPerHour, warning.bytesPerHour),
      bytesPerDay: warning.bytesPerDay,
    };
    const requestedShare = Number(readOption(feed, "mediaShare", 0.75));
    return {
      requestsPerSecond: lowest.requestsPerSecond * Math.min(MLS_GRID_RPS_SAFETY, safety),
      requestsPerHour: Math.floor(lowest.requestsPerHour * safety),
      requestsPerDay: Math.floor(lowest.requestsPerDay * safety),
      requestsPerFiveMinutes: null,
      mediaBytesPerHour: null,
      mediaRequestsPerHour: null,
      tokenBudget: {
        bytesPerHour: Math.floor(lowest.bytesPerHour * safety),
        bytesPerDay: Math.floor(lowest.bytesPerDay * safety),
        mediaShare: Math.min(0.9, Math.max(0.1, Number.isFinite(requestedShare) ? requestedShare : 0.75)),
      },
      // Photo transfers in flight per token. MLS Grid confirmed (Oct 2, 2026)
      // that photo downloads do not count toward api.mlsgrid.com limits, and
      // CDN links are reusable, so this only bounds our own network/S3 load.
      mediaConcurrency: mlsGridMediaConcurrency(feed),
      sequentialOnly: true,
    } satisfies ProviderLimits;
  },
  keyField: resource => KEY_FIELD[resource],
  async authHeaders(ctx) {
    return { Authorization: `Bearer ${token(ctx)}`, "Accept-Encoding": "gzip" };
  },
  async mediaHeaders(ctx) {
    // Required since 2026-06-01: the access token as the User-Agent.
    return { "User-Agent": token(ctx) };
  },
  firstPageUrl(ctx, resource, cursor) {
    if (resource === "Property" && (cursor.stage === "priority" || cursor.stage === "history")) {
      return mlsGridStageUrl(ctx, cursor.stage, cursor);
    }
    const filters = [`OriginatingSystemName eq ${odataString(originatingSystem(ctx))}`];
    if (cursor.phase === "initial") filters.push("MlgCanView eq true");
    if (cursor.highWaterMark) filters.push(`ModificationTimestamp gt ${cursor.highWaterMark}`);
    const expand = EXPAND[resource];
    const top = expand ? readOption(ctx.feed, "pageSize", 1000) : readOption(ctx.feed, "pageSizeNoExpand", 5000);
    return buildODataUrl(ctx.feed.baseUrl, resource, {
      $filter: filters.join(" and "),
      $expand: expand,
      $top: Math.min(top, expand ? 1000 : 5000),
    });
  },
  nextPageUrl(_ctx, _resource, page: ODataPage, _cursor: CursorState) {
    return page.nextLink;
  },
  reconcileUrl() {
    return null;
  },
  singleRecordUrl(ctx, resource, providerKey) {
    return buildODataUrl(ctx.feed.baseUrl, resource, {
      $filter: `OriginatingSystemName eq ${odataString(originatingSystem(ctx))} and ${KEY_FIELD[resource]} eq ${odataString(providerKey)}`,
      $expand: EXPAND[resource],
    });
  },
  metadataUrl(ctx) {
    const filter = encodeURIComponent(`OriginatingSystemName eq ${odataString(originatingSystem(ctx))}`);
    return `${ctx.feed.baseUrl.replace(/\/+$/, "")}/$metadata?$filter=${filter}`;
  },
  isViewable(record) {
    return record.MlgCanView !== false;
  },
  permittedUses(record) {
    return Array.isArray(record.MlgCanUse) ? record.MlgCanUse.map(String) : null;
  },
  stripKey(ctx, value) {
    const p = prefix(ctx);
    if (p && value.toUpperCase().startsWith(p.toUpperCase())) return value.slice(p.length);
    return value;
  },
  isLocalField(ctx, name) {
    const p = prefix(ctx);
    if (!p) return null;
    return name.toUpperCase().startsWith(`${p.toUpperCase()}_`);
  },
  extractMedia(record) {
    return extractResoMedia(record, ["Media"]);
  },
  mediaUrlExpiresAt() {
    // CDN links do not expire, and SavvyOS ignores any non-CDN MLS Grid link.
    return null;
  },
};
