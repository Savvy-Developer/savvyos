import type { MlsFeed } from "../../../drizzle/mlsSchema";
import { readCredential } from "../credentials";
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
 * - Media URLs are single use and expire in an hour; downloads must send
 *   User-Agent set to the access token. Never hotlink.
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

export const mlsGridAdapter: MlsAdapter = {
  provider: "mls_grid",
  defaultBaseUrl: "https://api.mlsgrid.com/v2",
  defaultResources: ["Property", "Member", "Office", "OpenHouse"],
  capabilities: {
    deleteFlag: true,
    requiresReconciliation: false,
    deletedResource: false,
    mediaUrlsExpire: true,
    maxReplicationGapDays: 7,
    initialOrderedByTimestamp: true,
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
      requestsPerSecond: lowest.requestsPerSecond * safety,
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
      mediaConcurrency: Math.min(4, Math.max(1, Number(readOption(feed, "mediaConcurrency", 2)) || 2)),
      sequentialOnly: true,
    };
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
  mediaUrlExpiresAt(_url, receivedAt) {
    // Documented one hour lifetime; keep a safety margin.
    return new Date(receivedAt.getTime() + 55 * 60_000);
  },
};
