import { readCredential } from "../credentials";
import {
  buildODataUrl,
  odataString,
  extractResoMedia,
  readOption,
  type FeedContext,
  type MlsAdapter,
  type MlsResource,
} from "./types";

/**
 * Spark Platform by FBS, RESO Web API (https://sparkplatform.com/docs/reso/reso_replication).
 *
 * - Replication keys must use https://replication.sparkapi.com/Reso/OData.
 * - $top max 1000; follow @odata.nextLink ($skiptoken is the ListingKey).
 * - Updates: ALWAYS a two-sided window (gt A and lt B); Spark caches
 *   responses for about 10 minutes, and a unique upper bound avoids stale hits.
 * - Purge by key reconciliation at least daily.
 * - Agent and office changes do not bump Property.ModificationTimestamp, so
 *   Member and Office are replicated separately.
 * - Limits: 1,500 requests per 5 minutes (IDX), 4,000 (VOW, back office).
 * - Custom fields carry a LocalName annotation in metadata.
 * - ARMLS issues Spark keys directly; the adapter is the same.
 */

const KEY_FIELD: Record<MlsResource, string> = {
  Property: "ListingKey",
  Member: "MemberKey",
  Office: "OfficeKey",
  OpenHouse: "OpenHouseKey",
};

const EXPAND: Record<MlsResource, string | null> = {
  Property: "Media,Room,Unit",
  Member: null,
  Office: null,
  OpenHouse: null,
};

function token(ctx: FeedContext) {
  const value = readCredential(ctx.feed.credentialRef, "TOKEN");
  if (!value) throw new Error(`Missing MLS_CRED_${ctx.feed.credentialRef}_TOKEN for Spark`);
  return value;
}

export const sparkAdapter: MlsAdapter = {
  provider: "spark",
  defaultBaseUrl: "https://replication.sparkapi.com/Reso/OData",
  defaultResources: ["Property", "Member", "Office", "OpenHouse"],
  capabilities: {
    deleteFlag: false,
    requiresReconciliation: true,
    deletedResource: false,
    mediaUrlsExpire: false,
    maxReplicationGapDays: null,
    initialOrderedByTimestamp: false,
  },
  limits(feed) {
    const safety = readOption(feed, "rateSafety", 0.9);
    const perFive = feed.feedType === "idx" || feed.feedType === "idx_plus" ? 1500 : 4000;
    return {
      requestsPerSecond: (perFive / 300) * safety,
      requestsPerHour: null,
      requestsPerDay: null,
      requestsPerFiveMinutes: Math.floor(perFive * safety),
      mediaBytesPerHour: null,
      mediaRequestsPerHour: null,
      mediaConcurrency: readOption(feed, "mediaConcurrency", 6),
      sequentialOnly: false,
    };
  },
  keyField: resource => KEY_FIELD[resource],
  async authHeaders(ctx) {
    return {
      Authorization: `Bearer ${token(ctx)}`,
      "X-SparkApi-User-Agent": readOption(ctx.feed, "userAgent", "SavvyOS"),
      "Accept-Encoding": "gzip",
    };
  },
  async mediaHeaders() {
    return {};
  },
  firstPageUrl(ctx, resource, cursor, windowEnd) {
    const filters: string[] = [];
    if (cursor.phase === "incremental" && cursor.highWaterMark) {
      filters.push(`ModificationTimestamp gt ${cursor.highWaterMark}`, `ModificationTimestamp lt ${windowEnd}`);
    }
    return buildODataUrl(ctx.feed.baseUrl, resource, {
      $filter: filters.length ? filters.join(" and ") : null,
      $expand: EXPAND[resource],
      $top: Math.min(readOption(ctx.feed, "pageSize", 1000), 1000),
    });
  },
  nextPageUrl(_ctx, _resource, page) {
    return page.nextLink;
  },
  reconcileUrl(ctx, resource) {
    return buildODataUrl(ctx.feed.baseUrl, resource, {
      $select: KEY_FIELD[resource],
      $top: 1000,
    });
  },
  singleRecordUrl(ctx, resource, providerKey) {
    return buildODataUrl(ctx.feed.baseUrl, resource, {
      $filter: `${KEY_FIELD[resource]} eq ${odataString(providerKey)}`,
      $expand: EXPAND[resource],
    });
  },
  metadataUrl(ctx) {
    return `${ctx.feed.baseUrl.replace(/\/+$/, "")}/$metadata`;
  },
  isViewable() {
    return true;
  },
  permittedUses() {
    return null;
  },
  stripKey(ctx, value) {
    const p = ctx.feed.keyPrefix;
    if (p && value.startsWith(p)) return value.slice(p.length);
    return value;
  },
  isLocalField() {
    return null;
  },
  extractMedia(record) {
    return extractResoMedia(record, ["Media"]);
  },
  mediaUrlExpiresAt() {
    return null;
  },
};
