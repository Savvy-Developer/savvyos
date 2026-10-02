import {
  bigint,
  boolean,
  customType,
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * MLS Properties: the Savvy canonical MLS data model.
 *
 * Source feed -> provider adapter -> Savvy canonical schema -> SavvyOS.
 *
 * Every provider (MLS Grid, Trestle, Spark, direct RESO, custom) lands in
 * these tables. Nothing outside server/mls reads provider payloads directly.
 * Three layers are kept for every record:
 *   1. raw payload, exactly as received (mls_raw_records, gzip)
 *   2. normalized canonical fields (mls_listings, mls_properties, ...)
 *   3. local MLS fields that do not map to RESO (mls_listings.localFields)
 * plus field-level provenance (mls_listings.fieldProvenance).
 *
 * This module is intentionally separate from the legacy `properties` table.
 * The DDL is applied at startup by server/mls/schema.ts and is mirrored in
 * drizzle/20260929_mls_properties.sql.
 */

const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "mediumblob";
  },
});

export const MLS_PROVIDERS = ["mls_grid", "trestle", "spark", "reso_web_api", "custom"] as const;
export type MlsProvider = (typeof MLS_PROVIDERS)[number];

export const MLS_ROUTES = [...MLS_PROVIDERS, "unresolved"] as const;
export type MlsRoute = (typeof MLS_ROUTES)[number];

export const MLS_ONBOARDING_STATUSES = [
  "planned",
  "conditional",
  "applied",
  "approved",
  "live",
  "paused",
  "unresolved",
] as const;

export const MLS_FEED_TYPES = ["idx", "idx_plus", "vow", "bbo", "participant", "other"] as const;
export type MlsFeedType = (typeof MLS_FEED_TYPES)[number];

export const MLS_MEDIA_POLICIES = ["all", "active_all_else_primary", "primary_only", "none"] as const;
export type MlsMediaPolicy = (typeof MLS_MEDIA_POLICIES)[number];

export const MLS_RETENTION_POLICIES = ["purge", "retain_history"] as const;
export type MlsRetentionPolicy = (typeof MLS_RETENTION_POLICIES)[number];

/** One MLS organization (Canopy, Stellar, ...), independent of transport. */
export const mlsSources = mysqlTable(
  "mls_sources",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    shortName: varchar("shortName", { length: 64 }).notNull(),
    territory: varchar("territory", { length: 512 }),
    providerRoute: mysqlEnum("providerRoute", MLS_ROUTES).notNull(),
    onboardingStatus: mysqlEnum("onboardingStatus", MLS_ONBOARDING_STATUSES).default("planned").notNull(),
    routeNote: text("routeNote"),
    originatingSystemName: varchar("originatingSystemName", { length: 64 }),
    keyPrefix: varchar("keyPrefix", { length: 16 }),
    websiteUrl: varchar("websiteUrl", { length: 512 }),
    /** Display and data rules; see server/mls/compliance.ts for the shape. */
    compliance: json("compliance"),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("mls_sources_code_uq").on(table.code)]
);
export type MlsSource = typeof mlsSources.$inferSelect;

/** One transport connection: a source through a provider for one license use. */
export const mlsFeeds = mysqlTable(
  "mls_feeds",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    provider: mysqlEnum("provider", MLS_PROVIDERS).notNull(),
    feedType: mysqlEnum("feedType", MLS_FEED_TYPES).default("idx").notNull(),
    baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
    tokenUrl: varchar("tokenUrl", { length: 512 }),
    originatingSystemName: varchar("originatingSystemName", { length: 64 }),
    keyPrefix: varchar("keyPrefix", { length: 16 }),
    /** Env var prefix that holds the secret, e.g. MLSGRID -> MLS_CRED_MLSGRID_TOKEN. Never the secret itself. */
    credentialRef: varchar("credentialRef", { length: 64 }).notNull(),
    resources: json("resources").$type<string[]>(),
    options: json("options").$type<Record<string, unknown>>(),
    enabled: boolean("enabled").default(false).notNull(),
    syncIntervalMinutes: int("syncIntervalMinutes").default(15).notNull(),
    reconcileIntervalHours: int("reconcileIntervalHours").default(24).notNull(),
    maxStalenessHours: int("maxStalenessHours").default(12).notNull(),
    mediaPolicy: mysqlEnum("mediaPolicy", MLS_MEDIA_POLICIES).default("active_all_else_primary").notNull(),
    retentionPolicy: mysqlEnum("retentionPolicy", MLS_RETENTION_POLICIES).default("purge").notNull(),
    status: mysqlEnum("status", ["idle", "running", "error", "suspended"]).default("idle").notNull(),
    lastError: text("lastError"),
    lastRunStartedAt: datetime("lastRunStartedAt"),
    lastRunFinishedAt: datetime("lastRunFinishedAt"),
    lastSuccessAt: datetime("lastSuccessAt"),
    lastReconcileAt: datetime("lastReconcileAt"),
    lastMetadataAt: datetime("lastMetadataAt"),
    initialImportCompletedAt: datetime("initialImportCompletedAt"),
    syncRequestedAt: datetime("syncRequestedAt"),
    reconcileRequestedAt: datetime("reconcileRequestedAt"),
    leaseOwner: varchar("leaseOwner", { length: 160 }),
    leaseExpiresAt: datetime("leaseExpiresAt"),
    createdById: int("createdById"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mls_feeds_source_provider_type_uq").on(table.sourceId, table.provider, table.feedType),
    index("mls_feeds_enabled_idx").on(table.enabled, table.provider),
  ]
);
export type MlsFeed = typeof mlsFeeds.$inferSelect;

/** Replication position per feed and resource. */
export const mlsSyncCursors = mysqlTable(
  "mls_sync_cursors",
  {
    id: int("id").autoincrement().primaryKey(),
    feedId: int("feedId").notNull(),
    resource: varchar("resource", { length: 32 }).notNull(),
    phase: mysqlEnum("phase", ["initial", "incremental"]).default("initial").notNull(),
    /** Greatest provider ModificationTimestamp received, echoed back verbatim. */
    highWaterMark: varchar("highWaterMark", { length: 40 }),
    /** Provider-specific resume position: next link, skip token, or last key. */
    resumeToken: text("resumeToken"),
    sweepStartedAt: datetime("sweepStartedAt"),
    recordsSeen: bigint("recordsSeen", { mode: "number" }).default(0).notNull(),
    lastSuccessAt: datetime("lastSuccessAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("mls_sync_cursors_feed_resource_uq").on(table.feedId, table.resource)]
);
export type MlsSyncCursor = typeof mlsSyncCursors.$inferSelect;

export const mlsSyncRuns = mysqlTable(
  "mls_sync_runs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    feedId: int("feedId").notNull(),
    kind: mysqlEnum("kind", ["initial", "incremental", "reconcile", "metadata", "media"]).notNull(),
    resource: varchar("resource", { length: 32 }),
    status: mysqlEnum("status", ["running", "succeeded", "failed", "aborted"]).default("running").notNull(),
    startedAt: datetime("startedAt").notNull(),
    finishedAt: datetime("finishedAt"),
    requests: int("requests").default(0).notNull(),
    bytes: bigint("bytes", { mode: "number" }).default(0).notNull(),
    received: int("received").default(0).notNull(),
    upserted: int("upserted").default(0).notNull(),
    unchanged: int("unchanged").default(0).notNull(),
    deleted: int("deleted").default(0).notNull(),
    mediaQueued: int("mediaQueued").default(0).notNull(),
    error: text("error"),
    detail: json("detail"),
  },
  table => [index("mls_sync_runs_feed_started_idx").on(table.feedId, table.startedAt)]
);
export type MlsSyncRun = typeof mlsSyncRuns.$inferSelect;

/** Layer 1: the untouched provider payload, gzip compressed. */
export const mlsRawRecords = mysqlTable(
  "mls_raw_records",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    feedId: int("feedId").notNull(),
    resource: varchar("resource", { length: 32 }).notNull(),
    providerKey: varchar("providerKey", { length: 160 }).notNull(),
    payloadGzip: mediumblob("payloadGzip").notNull(),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    payloadBytes: int("payloadBytes").notNull(),
    sourceModifiedAt: datetime("sourceModifiedAt", { fsp: 3 }),
    receivedAt: datetime("receivedAt").notNull(),
  },
  table => [uniqueIndex("mls_raw_records_feed_resource_key_uq").on(table.feedId, table.resource, table.providerKey)]
);

/** A record that could not be normalized or persisted. Its provider payload stays
 * private and retryable; a bad row must not pin a million-record feed forever. */
export const mlsImportExceptions = mysqlTable(
  "mls_import_exceptions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    feedId: int("feedId").notNull(),
    resource: varchar("resource", { length: 32 }).notNull(),
    providerKey: varchar("providerKey", { length: 160 }).notNull(),
    payloadGzip: mediumblob("payloadGzip").notNull(),
    sourceModifiedAt: datetime("sourceModifiedAt", { fsp: 3 }),
    errorCode: varchar("errorCode", { length: 64 }).notNull(),
    errorColumn: varchar("errorColumn", { length: 64 }),
    attempts: int("attempts").default(1).notNull(),
    firstSeenAt: datetime("firstSeenAt").notNull(),
    lastSeenAt: datetime("lastSeenAt").notNull(),
    nextRetryAt: datetime("nextRetryAt").notNull(),
  },
  table => [
    uniqueIndex("mls_import_exceptions_feed_resource_key_uq").on(table.feedId, table.resource, table.providerKey),
    index("mls_import_exceptions_retry_idx").on(table.feedId, table.nextRetryAt),
  ]
);

/** A physical property. Listings come and go; the property stays. */
export const mlsProperties = mysqlTable(
  "mls_properties",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    propertyKey: varchar("propertyKey", { length: 64 }).notNull(),
    identitySource: mysqlEnum("identitySource", ["address", "parcel", "listing"]).notNull(),
    universalPropertyId: varchar("universalPropertyId", { length: 128 }),
    parcelNumber: varchar("parcelNumber", { length: 128 }),
    streetNumber: varchar("streetNumber", { length: 32 }),
    streetName: varchar("streetName", { length: 128 }),
    unitNumber: varchar("unitNumber", { length: 32 }),
    unparsedAddress: varchar("unparsedAddress", { length: 300 }),
    city: varchar("city", { length: 128 }),
    stateOrProvince: varchar("stateOrProvince", { length: 32 }),
    postalCode: varchar("postalCode", { length: 16 }),
    countyOrParish: varchar("countyOrParish", { length: 128 }),
    country: varchar("country", { length: 8 }),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 11, scale: 7 }),
    propertyType: varchar("propertyType", { length: 48 }),
    propertySubType: varchar("propertySubType", { length: 96 }),
    yearBuilt: int("yearBuilt"),
    bedroomsTotal: int("bedroomsTotal"),
    bathroomsTotal: decimal("bathroomsTotal", { precision: 5, scale: 2 }),
    livingArea: decimal("livingArea", { precision: 12, scale: 2 }),
    lotSizeAcres: decimal("lotSizeAcres", { precision: 12, scale: 4 }),
    latestListingId: bigint("latestListingId", { mode: "number", unsigned: true }),
    latestStatus: varchar("latestStatus", { length: 32 }),
    latestListPrice: decimal("latestListPrice", { precision: 14, scale: 2 }),
    lastClosePrice: decimal("lastClosePrice", { precision: 14, scale: 2 }),
    lastCloseDate: date("lastCloseDate", { mode: "string" }),
    listingCount: int("listingCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mls_properties_key_uq").on(table.propertyKey),
    index("mls_properties_postal_idx").on(table.postalCode),
    index("mls_properties_geo_idx").on(table.latitude, table.longitude),
    index("mls_properties_parcel_idx").on(table.parcelNumber, table.stateOrProvince),
  ]
);
export type MlsProperty = typeof mlsProperties.$inferSelect;

/**
 * The Savvy extension layer: short-term rental intelligence for a property.
 * Values can come from MLS standard fields, local fields, regulations, agent
 * input, AirDNA, public records, AI extraction or underwriting, and every
 * value records where it came from in `provenance`. Not wired to any UI yet.
 */
export const mlsPropertyInsights = mysqlTable(
  "mls_property_insights",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    propertyId: bigint("propertyId", { mode: "number", unsigned: true }).notNull(),
    strAllowed: mysqlEnum("strAllowed", ["yes", "no", "restricted", "unknown"]).default("unknown").notNull(),
    strRestrictionStatus: varchar("strRestrictionStatus", { length: 64 }),
    permitRequired: boolean("permitRequired"),
    permitType: varchar("permitType", { length: 128 }),
    hoaStrRestriction: varchar("hoaStrRestriction", { length: 255 }),
    minimumRentalDays: int("minimumRentalDays"),
    occupancyLimit: int("occupancyLimit"),
    rentalIncomeClaimed: decimal("rentalIncomeClaimed", { precision: 14, scale: 2 }),
    projectedStrRevenue: decimal("projectedStrRevenue", { precision: 14, scale: 2 }),
    airbnbMatch: json("airbnbMatch"),
    marketId: int("marketId"),
    investmentScore: decimal("investmentScore", { precision: 6, scale: 2 }),
    buyBoxMatches: json("buyBoxMatches"),
    provenance: json("provenance"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("mls_property_insights_property_uq").on(table.propertyId)]
);

/** Layer 2: one MLS listing, independent of which provider delivered it. */
export const mlsListings = mysqlTable(
  "mls_listings",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    propertyId: bigint("propertyId", { mode: "number", unsigned: true }).notNull(),
    sourceId: int("sourceId").notNull(),
    feedId: int("feedId").notNull(),
    listingNumber: varchar("listingNumber", { length: 64 }).notNull(),
    listingKey: varchar("listingKey", { length: 128 }).notNull(),
    providerListingKey: varchar("providerListingKey", { length: 160 }).notNull(),
    standardStatus: varchar("standardStatus", { length: 32 }).notNull(),
    mlsStatus: varchar("mlsStatus", { length: 64 }),
    propertyType: varchar("propertyType", { length: 48 }),
    propertySubType: varchar("propertySubType", { length: 96 }),
    listPrice: decimal("listPrice", { precision: 14, scale: 2 }),
    originalListPrice: decimal("originalListPrice", { precision: 14, scale: 2 }),
    previousListPrice: decimal("previousListPrice", { precision: 14, scale: 2 }),
    closePrice: decimal("closePrice", { precision: 14, scale: 2 }),
    listingContractDate: date("listingContractDate", { mode: "string" }),
    onMarketDate: date("onMarketDate", { mode: "string" }),
    purchaseContractDate: date("purchaseContractDate", { mode: "string" }),
    offMarketDate: date("offMarketDate", { mode: "string" }),
    closeDate: date("closeDate", { mode: "string" }),
    statusChangeAt: datetime("statusChangeAt", { fsp: 3 }),
    priceChangeAt: datetime("priceChangeAt", { fsp: 3 }),
    originalEntryAt: datetime("originalEntryAt", { fsp: 3 }),
    daysOnMarket: int("daysOnMarket"),
    cumulativeDaysOnMarket: int("cumulativeDaysOnMarket"),
    bedroomsTotal: int("bedroomsTotal"),
    bathroomsTotalInteger: int("bathroomsTotalInteger"),
    bathroomsFull: int("bathroomsFull"),
    bathroomsHalf: int("bathroomsHalf"),
    bathroomsTotal: decimal("bathroomsTotal", { precision: 5, scale: 2 }),
    livingArea: decimal("livingArea", { precision: 12, scale: 2 }),
    livingAreaUnits: varchar("livingAreaUnits", { length: 16 }),
    aboveGradeFinishedArea: decimal("aboveGradeFinishedArea", { precision: 12, scale: 2 }),
    belowGradeFinishedArea: decimal("belowGradeFinishedArea", { precision: 12, scale: 2 }),
    buildingAreaTotal: decimal("buildingAreaTotal", { precision: 12, scale: 2 }),
    lotSizeAcres: decimal("lotSizeAcres", { precision: 12, scale: 4 }),
    lotSizeSquareFeet: decimal("lotSizeSquareFeet", { precision: 14, scale: 2 }),
    yearBuilt: int("yearBuilt"),
    storiesTotal: int("storiesTotal"),
    garageSpaces: decimal("garageSpaces", { precision: 6, scale: 1 }),
    parkingTotal: decimal("parkingTotal", { precision: 6, scale: 1 }),
    poolPrivateYN: boolean("poolPrivateYN"),
    waterfrontYN: boolean("waterfrontYN"),
    viewYN: boolean("viewYN"),
    fireplaceYN: boolean("fireplaceYN"),
    newConstructionYN: boolean("newConstructionYN"),
    furnished: varchar("furnished", { length: 64 }),
    associationYN: boolean("associationYN"),
    associationName: varchar("associationName", { length: 191 }),
    associationFee: decimal("associationFee", { precision: 12, scale: 2 }),
    associationFeeFrequency: varchar("associationFeeFrequency", { length: 32 }),
    taxAnnualAmount: decimal("taxAnnualAmount", { precision: 12, scale: 2 }),
    taxYear: int("taxYear"),
    taxAssessedValue: decimal("taxAssessedValue", { precision: 14, scale: 2 }),
    parcelNumber: varchar("parcelNumber", { length: 128 }),
    zoning: varchar("zoning", { length: 128 }),
    subdivisionName: varchar("subdivisionName", { length: 191 }),
    mlsAreaMajor: varchar("mlsAreaMajor", { length: 128 }),
    elementarySchool: varchar("elementarySchool", { length: 128 }),
    middleSchool: varchar("middleSchool", { length: 128 }),
    highSchool: varchar("highSchool", { length: 128 }),
    unparsedAddress: varchar("unparsedAddress", { length: 300 }),
    streetNumber: varchar("streetNumber", { length: 32 }),
    streetName: varchar("streetName", { length: 128 }),
    unitNumber: varchar("unitNumber", { length: 32 }),
    city: varchar("city", { length: 128 }),
    stateOrProvince: varchar("stateOrProvince", { length: 32 }),
    postalCode: varchar("postalCode", { length: 16 }),
    countyOrParish: varchar("countyOrParish", { length: 128 }),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 11, scale: 7 }),
    publicRemarks: text("publicRemarks"),
    directions: text("directions"),
    virtualTourUrl: varchar("virtualTourUrl", { length: 1024 }),
    listAgentKey: varchar("listAgentKey", { length: 128 }),
    listAgentMlsId: varchar("listAgentMlsId", { length: 64 }),
    listAgentFullName: varchar("listAgentFullName", { length: 191 }),
    listAgentPhone: varchar("listAgentPhone", { length: 64 }),
    listAgentEmail: varchar("listAgentEmail", { length: 191 }),
    listOfficeKey: varchar("listOfficeKey", { length: 128 }),
    listOfficeMlsId: varchar("listOfficeMlsId", { length: 64 }),
    listOfficeName: varchar("listOfficeName", { length: 191 }),
    listOfficePhone: varchar("listOfficePhone", { length: 64 }),
    coListAgentFullName: varchar("coListAgentFullName", { length: 191 }),
    coListOfficeName: varchar("coListOfficeName", { length: 191 }),
    buyerAgentKey: varchar("buyerAgentKey", { length: 128 }),
    buyerAgentFullName: varchar("buyerAgentFullName", { length: 191 }),
    buyerOfficeKey: varchar("buyerOfficeKey", { length: 128 }),
    buyerOfficeName: varchar("buyerOfficeName", { length: 191 }),
    photosCount: int("photosCount"),
    photosChangeAt: datetime("photosChangeAt", { fsp: 3 }),
    primaryPhotoUrl: varchar("primaryPhotoUrl", { length: 1024 }),
    internetEntireListingDisplayYN: boolean("internetEntireListingDisplayYN"),
    internetAddressDisplayYN: boolean("internetAddressDisplayYN"),
    internetAvmDisplayYN: boolean("internetAvmDisplayYN"),
    internetConsumerCommentYN: boolean("internetConsumerCommentYN"),
    idxParticipationYN: boolean("idxParticipationYN"),
    permittedUses: json("permittedUses").$type<string[]>(),
    features: json("features").$type<Record<string, string[]>>(),
    rooms: json("rooms"),
    units: json("units"),
    /** Layer 3: every field the MLS sent that has no canonical home. */
    localFields: json("localFields").$type<Record<string, unknown>>(),
    /** canonical field -> source field (and mapping id when overridden). */
    fieldProvenance: json("fieldProvenance").$type<Record<string, string>>(),
    mappingVersion: int("mappingVersion").default(1).notNull(),
    sourceModifiedAt: datetime("sourceModifiedAt", { fsp: 3 }),
    originatingModifiedAt: datetime("originatingModifiedAt", { fsp: 3 }),
    payloadHash: varchar("payloadHash", { length: 64 }),
    firstSeenAt: datetime("firstSeenAt").notNull(),
    lastSyncedAt: datetime("lastSyncedAt").notNull(),
    removedFromFeedAt: datetime("removedFromFeedAt"),
    removalReason: varchar("removalReason", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mls_listings_source_number_idx").on(table.sourceId, table.listingNumber),
    uniqueIndex("mls_listings_feed_provider_key_uq").on(table.feedId, table.providerListingKey),
    index("mls_listings_property_idx").on(table.propertyId),
    index("mls_listings_status_geo_idx").on(table.standardStatus, table.latitude, table.longitude),
    index("mls_listings_source_status_price_idx").on(table.sourceId, table.standardStatus, table.listPrice),
    index("mls_listings_status_price_idx").on(table.standardStatus, table.listPrice),
    index("mls_listings_status_entry_idx").on(table.standardStatus, table.originalEntryAt),
    // Covering indexes for map clusters, exact counts and the MARIS BBO-over-IDX
    // check; built online in the background by server/mls/schema.ts.
    index("mls_listings_search_cover_idx").on(
      table.standardStatus, table.latitude, table.longitude, table.feedId, table.propertyType,
      table.removedFromFeedAt, table.listPrice, table.sourceId, table.listingNumber
    ),
    index("mls_listings_source_number_feed_idx").on(table.sourceId, table.listingNumber, table.feedId, table.removedFromFeedAt),
    index("mls_listings_postal_idx").on(table.postalCode),
    index("mls_listings_city_idx").on(table.city, table.stateOrProvince),
    index("mls_listings_modified_idx").on(table.sourceModifiedAt),
    index("mls_listings_close_idx").on(table.closeDate),
  ]
);
export type MlsListing = typeof mlsListings.$inferSelect;
export type InsertMlsListing = typeof mlsListings.$inferInsert;

export const MLS_HISTORY_EVENTS = [
  "listed",
  "relisted",
  "status_change",
  "price_change",
  "back_on_market",
  "pending",
  "closed",
  "withdrawn",
  "expired",
  "canceled",
  "removed_from_feed",
] as const;

/** Every status and price move a listing makes, as we observe it. */
export const mlsListingHistory = mysqlTable(
  "mls_listing_history",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    listingId: bigint("listingId", { mode: "number", unsigned: true }).notNull(),
    propertyId: bigint("propertyId", { mode: "number", unsigned: true }).notNull(),
    sourceId: int("sourceId").notNull(),
    eventType: mysqlEnum("eventType", MLS_HISTORY_EVENTS).notNull(),
    fromStatus: varchar("fromStatus", { length: 32 }),
    toStatus: varchar("toStatus", { length: 32 }),
    fromPrice: decimal("fromPrice", { precision: 14, scale: 2 }),
    toPrice: decimal("toPrice", { precision: 14, scale: 2 }),
    eventAt: datetime("eventAt", { fsp: 3 }).notNull(),
    detectedAt: datetime("detectedAt").notNull(),
    detail: json("detail"),
  },
  table => [
    index("mls_listing_history_listing_idx").on(table.listingId, table.eventAt),
    index("mls_listing_history_property_idx").on(table.propertyId, table.eventAt),
  ]
);
export type MlsListingHistoryEvent = typeof mlsListingHistory.$inferSelect;

export const MLS_MEDIA_STATUSES = [
  "pending",
  "downloading",
  "stored",
  "skipped",
  "expired",
  "failed",
  "delete_pending",
] as const;
export type MlsMediaStatus = (typeof MLS_MEDIA_STATUSES)[number];

/** Media metadata plus our own S3 copy. Provider media URLs are never displayed. */
export const mlsMedia = mysqlTable(
  "mls_media",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    feedId: int("feedId").notNull(),
    listingId: bigint("listingId", { mode: "number", unsigned: true }),
    resourceKey: varchar("resourceKey", { length: 160 }).notNull(),
    mediaKey: varchar("mediaKey", { length: 191 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    category: varchar("category", { length: 32 }),
    mimeType: varchar("mimeType", { length: 64 }),
    caption: varchar("caption", { length: 512 }),
    isPrimary: boolean("isPrimary").default(false).notNull(),
    sourceModifiedAt: datetime("sourceModifiedAt", { fsp: 3 }),
    /** Transient download URL. Cleared once stored; MLS Grid URLs are single-use and expire in an hour. */
    sourceUrl: text("sourceUrl"),
    sourceUrlExpiresAt: datetime("sourceUrlExpiresAt"),
    status: mysqlEnum("status", MLS_MEDIA_STATUSES).default("pending").notNull(),
    priority: int("priority").default(100).notNull(),
    attempts: int("attempts").default(0).notNull(),
    lastError: varchar("lastError", { length: 512 }),
    nextAttemptAt: datetime("nextAttemptAt"),
    claimedBy: varchar("claimedBy", { length: 160 }),
    s3Key: varchar("s3Key", { length: 512 }),
    url: varchar("url", { length: 1024 }),
    bytes: int("bytes"),
    storedAt: datetime("storedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("mls_media_feed_key_uq").on(table.feedId, table.mediaKey),
    index("mls_media_queue_idx").on(table.status, table.priority, table.nextAttemptAt),
    index("mls_media_listing_idx").on(table.listingId, table.sortOrder),
    index("mls_media_resource_idx").on(table.feedId, table.resourceKey),
  ]
);
export type MlsMedia = typeof mlsMedia.$inferSelect;

export const mlsMembers = mysqlTable(
  "mls_members",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull(),
    feedId: int("feedId").notNull(),
    memberKey: varchar("memberKey", { length: 160 }).notNull(),
    memberMlsId: varchar("memberMlsId", { length: 64 }),
    fullName: varchar("fullName", { length: 191 }),
    email: varchar("email", { length: 191 }),
    phone: varchar("phone", { length: 64 }),
    officeKey: varchar("officeKey", { length: 160 }),
    officeMlsId: varchar("officeMlsId", { length: 64 }),
    officeName: varchar("officeName", { length: 191 }),
    memberStatus: varchar("memberStatus", { length: 32 }),
    stateLicense: varchar("stateLicense", { length: 64 }),
    localFields: json("localFields"),
    sourceModifiedAt: datetime("sourceModifiedAt", { fsp: 3 }),
    lastSyncedAt: datetime("lastSyncedAt").notNull(),
  },
  table => [
    uniqueIndex("mls_members_feed_key_uq").on(table.feedId, table.memberKey),
    index("mls_members_source_mlsid_idx").on(table.sourceId, table.memberMlsId),
  ]
);

export const mlsOffices = mysqlTable(
  "mls_offices",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    sourceId: int("sourceId").notNull(),
    feedId: int("feedId").notNull(),
    officeKey: varchar("officeKey", { length: 160 }).notNull(),
    officeMlsId: varchar("officeMlsId", { length: 64 }),
    officeName: varchar("officeName", { length: 191 }),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 191 }),
    city: varchar("city", { length: 128 }),
    stateOrProvince: varchar("stateOrProvince", { length: 32 }),
    officeStatus: varchar("officeStatus", { length: 32 }),
    localFields: json("localFields"),
    sourceModifiedAt: datetime("sourceModifiedAt", { fsp: 3 }),
    lastSyncedAt: datetime("lastSyncedAt").notNull(),
  },
  table => [
    uniqueIndex("mls_offices_feed_key_uq").on(table.feedId, table.officeKey),
    index("mls_offices_source_mlsid_idx").on(table.sourceId, table.officeMlsId),
  ]
);

export const mlsOpenHouses = mysqlTable(
  "mls_open_houses",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    feedId: int("feedId").notNull(),
    listingId: bigint("listingId", { mode: "number", unsigned: true }),
    openHouseKey: varchar("openHouseKey", { length: 160 }).notNull(),
    providerListingKey: varchar("providerListingKey", { length: 160 }),
    startAt: datetime("startAt"),
    endAt: datetime("endAt"),
    openHouseDate: date("openHouseDate", { mode: "string" }),
    openHouseType: varchar("openHouseType", { length: 48 }),
    openHouseStatus: varchar("openHouseStatus", { length: 32 }),
    remarks: text("remarks"),
    sourceModifiedAt: datetime("sourceModifiedAt", { fsp: 3 }),
    lastSyncedAt: datetime("lastSyncedAt").notNull(),
  },
  table => [
    uniqueIndex("mls_open_houses_feed_key_uq").on(table.feedId, table.openHouseKey),
    index("mls_open_houses_listing_idx").on(table.listingId, table.startAt),
  ]
);

export const MLS_MAPPING_TRANSFORMS = [
  "direct",
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "list",
  "enum_map",
] as const;
export type MlsMappingTransform = (typeof MLS_MAPPING_TRANSFORMS)[number];

/**
 * Mapping registry overrides. Code defaults (server/mls/normalize/fieldMap.ts)
 * cover RESO standard fields; rows here add or override mappings for a source
 * or provider so a new MLS is mapped, not coded.
 */
export const mlsFieldMappings = mysqlTable(
  "mls_field_mappings",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceId: int("sourceId"),
    provider: varchar("provider", { length: 32 }),
    resource: varchar("resource", { length: 32 }).default("Property").notNull(),
    sourceField: varchar("sourceField", { length: 191 }).notNull(),
    resoField: varchar("resoField", { length: 191 }),
    target: varchar("target", { length: 191 }).notNull(),
    transform: mysqlEnum("transform", MLS_MAPPING_TRANSFORMS).default("direct").notNull(),
    valueMap: json("valueMap").$type<Record<string, string>>(),
    confidence: int("confidence").default(100).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    notes: text("notes"),
    updatedById: int("updatedById"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mls_field_mappings_source_idx").on(table.sourceId, table.resource),
    index("mls_field_mappings_field_idx").on(table.sourceField),
  ]
);
export type MlsFieldMapping = typeof mlsFieldMappings.$inferSelect;

/** Latest provider metadata per feed and resource; drives local field discovery. */
export const mlsMetadataSnapshots = mysqlTable(
  "mls_metadata_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    feedId: int("feedId").notNull(),
    resource: varchar("resource", { length: 32 }).notNull(),
    fieldCount: int("fieldCount").default(0).notNull(),
    localFieldCount: int("localFieldCount").default(0).notNull(),
    fields: json("fields"),
    metadataHash: varchar("metadataHash", { length: 64 }),
    fetchedAt: datetime("fetchedAt").notNull(),
  },
  table => [uniqueIndex("mls_metadata_snapshots_feed_resource_uq").on(table.feedId, table.resource)]
);

/** Hourly request and byte usage per credential, for rate-limit visibility. */
export const mlsProviderUsage = mysqlTable(
  "mls_provider_usage",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    credentialRef: varchar("credentialRef", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    windowStart: datetime("windowStart").notNull(),
    requests: int("requests").default(0).notNull(),
    bytes: bigint("bytes", { mode: "number" }).default(0).notNull(),
    mediaRequests: int("mediaRequests").default(0).notNull(),
    mediaBytes: bigint("mediaBytes", { mode: "number" }).default(0).notNull(),
    throttled: int("throttled").default(0).notNull(),
  },
  table => [uniqueIndex("mls_provider_usage_window_uq").on(table.credentialRef, table.windowStart)]
);

export const mlsWorkerHeartbeats = mysqlTable("mls_worker_heartbeats", {
  workerId: varchar("workerId", { length: 160 }).primaryKey(),
  startedAt: datetime("startedAt").notNull(),
  lastBeatAt: datetime("lastBeatAt").notNull(),
  version: varchar("version", { length: 64 }),
  detail: mediumtext("detail"),
});
