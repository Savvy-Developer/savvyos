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
 * - Limits: 2 req/s, 7,200 req/h, 40,000 req/day, 4 GB/h downloads.
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
    const safety = readOption(feed, "rateSafety", 0.9);
    return {
      requestsPerSecond: 2 * safety,
      requestsPerHour: Math.floor(7200 * safety),
      requestsPerDay: Math.floor(40000 * safety),
      requestsPerFiveMinutes: null,
      mediaBytesPerHour: Math.floor(4 * 1024 ** 3 * safety),
      mediaRequestsPerHour: null,
      mediaConcurrency: readOption(feed, "mediaConcurrency", 4),
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
