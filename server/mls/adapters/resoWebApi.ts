import { readCredential } from "../credentials";
import { clientCredentialsToken, keysetPageUrl, lastKeyset } from "./trestle";
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
 * Any RESO-certified Web API server reached directly (UtahRealEstate.com,
 * RMLS, Rapattoni-hosted MLSs, and future direct deals).
 *
 * UtahRealEstate specifics (https://vendor.utahrealestate.com/webapi/docs/tuts/replication):
 * bearer token from the vendor page; $top max 200; initial pass fastest by
 * ListingKeyNumeric keyset; updates every 15 minutes by ModificationTimestamp;
 * a Deleted resource lists hard deletes, but visibility changes still need
 * key reconciliation.
 *
 * Per-feed options: pageSize, initialKeyField (numeric key for the initial
 * keyset, e.g. ListingKeyNumeric), deletedResource (true to poll /Deleted),
 * expand (per resource), scope.
 */

const KEY_FIELD: Record<MlsResource, string> = {
  Property: "ListingKey",
  Member: "MemberKey",
  Office: "OfficeKey",
  OpenHouse: "OpenHouseKey",
};

const DEFAULT_EXPAND: Record<MlsResource, string | null> = {
  Property: "Media",
  Member: null,
  Office: null,
  OpenHouse: null,
};

function expandFor(ctx: FeedContext, resource: MlsResource) {
  const configured = readOption<Record<string, string | null>>(ctx.feed, "expand", {});
  return resource in configured ? configured[resource] : DEFAULT_EXPAND[resource];
}

function pageSize(ctx: FeedContext) {
  return readOption(ctx.feed, "pageSize", 200);
}

async function bearer(ctx: FeedContext) {
  const ref = ctx.feed.credentialRef;
  const staticToken = readCredential(ref, "TOKEN");
  if (staticToken) return staticToken;
  const clientId = readCredential(ref, "CLIENT_ID");
  const clientSecret = readCredential(ref, "CLIENT_SECRET");
  if (clientId && clientSecret && ctx.feed.tokenUrl) {
    return clientCredentialsToken(`reso:${ref}`, ctx.feed.tokenUrl, clientId, clientSecret, readOption(ctx.feed, "scope", "api"));
  }
  throw new Error(`Missing MLS_CRED_${ref}_TOKEN (or client credentials and a token URL) for this RESO server`);
}

export const resoWebApiAdapter: MlsAdapter = {
  provider: "reso_web_api",
  defaultBaseUrl: "https://resoapi.utahrealestate.com/reso/odata",
  defaultResources: ["Property", "Member", "Office", "OpenHouse"],
  capabilities: {
    deleteFlag: false,
    requiresReconciliation: true,
    deletedResource: true,
    mediaUrlsExpire: false,
    maxReplicationGapDays: null,
    initialOrderedByTimestamp: false,
  },
  limits(feed) {
    return {
      requestsPerSecond: readOption(feed, "requestsPerSecond", 2),
      requestsPerHour: readOption<number | null>(feed, "requestsPerHour", null),
      requestsPerDay: null,
      requestsPerFiveMinutes: null,
      mediaBytesPerHour: null,
      mediaRequestsPerHour: null,
      mediaConcurrency: readOption(feed, "mediaConcurrency", 4),
      sequentialOnly: false,
    };
  },
  keyField: resource => KEY_FIELD[resource],
  async authHeaders(ctx) {
    return { Authorization: `Bearer ${await bearer(ctx)}`, "Accept-Encoding": "gzip" };
  },
  async mediaHeaders() {
    return {};
  },
  firstPageUrl(ctx, resource, cursor) {
    const numericKey = readOption<string | null>(ctx.feed, "initialKeyField", null);
    if (cursor.phase === "initial" && numericKey && resource === "Property") {
      return buildODataUrl(ctx.feed.baseUrl, resource, {
        $filter: null,
        $orderby: numericKey,
        $expand: expandFor(ctx, resource),
        $top: pageSize(ctx),
      });
    }
    return keysetPageUrl(ctx, resource, KEY_FIELD[resource], expandFor(ctx, resource), pageSize(ctx), null, cursor.highWaterMark);
  },
  nextPageUrl(ctx, resource, page, cursor) {
    if (page.value.length < pageSize(ctx)) return null;
    const numericKey = readOption<string | null>(ctx.feed, "initialKeyField", null);
    if (cursor.phase === "initial" && numericKey && resource === "Property") {
      const last = page.value[page.value.length - 1];
      if (last?.[numericKey] === undefined) return page.nextLink;
      return buildODataUrl(ctx.feed.baseUrl, resource, {
        $filter: `${numericKey} gt ${Number(last[numericKey])}`,
        $orderby: numericKey,
        $expand: expandFor(ctx, resource),
        $top: pageSize(ctx),
      });
    }
    const after = lastKeyset(page, KEY_FIELD[resource]);
    if (!after) return page.nextLink;
    return keysetPageUrl(ctx, resource, KEY_FIELD[resource], expandFor(ctx, resource), pageSize(ctx), after, null);
  },
  reconcileUrl(ctx, resource) {
    return buildODataUrl(ctx.feed.baseUrl, resource, { $select: KEY_FIELD[resource], $top: pageSize(ctx) });
  },
  deletedSinceUrl(ctx, resource, sinceIso) {
    if (!readOption(ctx.feed, "deletedResource", false)) return null;
    return buildODataUrl(ctx.feed.baseUrl, "Deleted", {
      $filter: `resource eq '${resource}' and ts gt ${sinceIso}`,
      $top: pageSize(ctx),
    });
  },
  singleRecordUrl(ctx, resource, providerKey) {
    return buildODataUrl(ctx.feed.baseUrl, resource, {
      $filter: `${KEY_FIELD[resource]} eq ${odataString(providerKey)}`,
      $expand: expandFor(ctx, resource),
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
    return extractResoMedia(record, ["Media", "Photos"]);
  },
  mediaUrlExpiresAt() {
    return null;
  },
};

/**
 * Placeholder for sources without a RESO Web API (legacy RETS, flat files,
 * Perchwell or other platform exports). A custom feed implements the same
 * adapter contract; until then it is registered but refuses to sync, so a
 * source can be tracked before its transport is known.
 */
export const customAdapter: MlsAdapter = {
  ...resoWebApiAdapter,
  provider: "custom",
  defaultBaseUrl: "",
  defaultResources: ["Property"],
  capabilities: {
    deleteFlag: false,
    requiresReconciliation: true,
    deletedResource: false,
    mediaUrlsExpire: false,
    maxReplicationGapDays: null,
    initialOrderedByTimestamp: false,
  },
  async authHeaders() {
    throw new Error("Custom feeds need a dedicated adapter before they can sync.");
  },
};
