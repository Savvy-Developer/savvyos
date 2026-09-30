import type { MlsFeed } from "../../../drizzle/mlsSchema";
import { readCredential } from "../credentials";
import {
  buildODataUrl,
  extractResoMedia,
  odataString,
  readOption,
  type FeedContext,
  type MlsAdapter,
  type MlsResource,
  type ODataPage,
} from "./types";

/**
 * Trestle by Cotality (https://trestle-documentation.corelogic.com/web-api/).
 *
 * - OAuth2 client credentials, token valid 8 hours (cached here).
 * - $top max 1000 with data, 300,000 for key-only $select.
 * - No delete flag: listings that leave the feed are found by key
 *   reconciliation and removed.
 * - Incremental by greatest ModificationTimestamp. Paging uses a compound
 *   keyset (ModificationTimestamp, key) so ties at a page boundary are never
 *   skipped and records edited mid-pass are never lost to $skip drift.
 * - Feeds over a million records can use the replication endpoint
 *   (options.useReplicationEndpoint) for the initial pass.
 * - Quotas: 7,200/h and 180/min for data, 18,000/h and 480/min for media.
 *   MediaURL is public, so media can be fetched later from a queue.
 */

const KEY_FIELD: Record<MlsResource, string> = {
  Property: "ListingKey",
  Member: "MemberKey",
  Office: "OfficeKey",
  OpenHouse: "OpenHouseKey",
};

const EXPAND: Record<MlsResource, string | null> = {
  Property: "Media,Rooms,Units",
  Member: null,
  Office: null,
  OpenHouse: null,
};

type CachedToken = { value: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

export async function clientCredentialsToken(
  cacheKey: string,
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  scope = "api"
): Promise<string> {
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 5 * 60_000) return cached.value;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }),
  });
  if (!response.ok) throw new Error(`Token request failed with HTTP ${response.status}`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("Token response had no access_token");
  tokenCache.set(cacheKey, {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in ?? 3600)) * 1000,
  });
  return body.access_token;
}

export function clearTokenCache() {
  tokenCache.clear();
}

async function trestleToken(ctx: FeedContext) {
  const ref = ctx.feed.credentialRef;
  const clientId = readCredential(ref, "CLIENT_ID");
  const clientSecret = readCredential(ref, "CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(`Missing MLS_CRED_${ref}_CLIENT_ID or _CLIENT_SECRET for Trestle`);
  }
  return clientCredentialsToken(
    `trestle:${ref}`,
    ctx.feed.tokenUrl ?? "https://api.cotality.com/trestle/oidc/connect/token",
    clientId,
    clientSecret,
    readOption(ctx.feed, "scope", "api")
  );
}

/** Compound keyset filter: strictly after (timestamp, key). */
export function keysetFilter(timestampField: string, keyField: string, timestamp: string, key: string) {
  return `(${timestampField} gt ${timestamp} or (${timestampField} eq ${timestamp} and ${keyField} gt ${odataString(key)}))`;
}

export function keysetPageUrl(
  ctx: FeedContext,
  resource: MlsResource,
  keyField: string,
  expand: string | null,
  top: number,
  after: { timestamp: string; key: string } | null,
  highWaterMark: string | null,
  extraFilters: string[] = []
) {
  const filters = [...extraFilters];
  if (after) filters.push(keysetFilter("ModificationTimestamp", keyField, after.timestamp, after.key));
  else if (highWaterMark) filters.push(`ModificationTimestamp gt ${highWaterMark}`);
  return buildODataUrl(ctx.feed.baseUrl, resource, {
    $filter: filters.length ? filters.join(" and ") : null,
    $orderby: `ModificationTimestamp asc,${keyField} asc`,
    $expand: expand,
    $top: top,
  });
}

export function lastKeyset(page: ODataPage, keyField: string) {
  const last = page.value[page.value.length - 1];
  if (!last || !last.ModificationTimestamp || !last[keyField]) return null;
  return { timestamp: String(last.ModificationTimestamp), key: String(last[keyField]) };
}

function pageSize(feed: MlsFeed) {
  return Math.min(readOption(feed, "pageSize", 1000), 1000);
}

export const trestleAdapter: MlsAdapter = {
  provider: "trestle",
  defaultBaseUrl: "https://api.cotality.com/trestle/odata",
  defaultResources: ["Property", "Member", "Office", "OpenHouse"],
  capabilities: {
    deleteFlag: false,
    requiresReconciliation: true,
    deletedResource: false,
    mediaUrlsExpire: false,
    maxReplicationGapDays: null,
    initialOrderedByTimestamp: true,
  },
  limits(feed) {
    const safety = readOption(feed, "rateSafety", 0.9);
    return {
      requestsPerSecond: (180 / 60) * safety,
      requestsPerHour: Math.floor(7200 * safety),
      requestsPerDay: null,
      requestsPerFiveMinutes: null,
      mediaBytesPerHour: null,
      mediaRequestsPerHour: Math.floor(18000 * safety),
      mediaConcurrency: readOption(feed, "mediaConcurrency", 6),
      sequentialOnly: false,
    };
  },
  keyField: resource => KEY_FIELD[resource],
  async authHeaders(ctx) {
    return { Authorization: `Bearer ${await trestleToken(ctx)}`, "Accept-Encoding": "gzip" };
  },
  async mediaHeaders() {
    return {};
  },
  firstPageUrl(ctx, resource, cursor) {
    const useReplication = cursor.phase === "initial" && readOption(ctx.feed, "useReplicationEndpoint", false);
    if (useReplication) {
      return buildODataUrl(ctx.feed.baseUrl, resource, {
        $filter: cursor.highWaterMark ? `ModificationTimestamp gt ${cursor.highWaterMark}` : null,
        $expand: EXPAND[resource],
        $top: pageSize(ctx.feed),
        replication: "true",
      });
    }
    return keysetPageUrl(ctx, resource, KEY_FIELD[resource], EXPAND[resource], pageSize(ctx.feed), null, cursor.highWaterMark);
  },
  nextPageUrl(ctx, resource, page, cursor) {
    if (page.nextLink && cursor.phase === "initial" && readOption(ctx.feed, "useReplicationEndpoint", false)) {
      return page.nextLink;
    }
    if (page.value.length < pageSize(ctx.feed)) return null;
    const after = lastKeyset(page, KEY_FIELD[resource]);
    if (!after) return page.nextLink;
    return keysetPageUrl(ctx, resource, KEY_FIELD[resource], EXPAND[resource], pageSize(ctx.feed), after, null);
  },
  reconcileUrl(ctx, resource) {
    return buildODataUrl(ctx.feed.baseUrl, resource, {
      $select: KEY_FIELD[resource],
      $top: Math.min(readOption(ctx.feed, "reconcilePageSize", 300000), 300000),
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
