import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { gunzipSync } from "zlib";
import { z } from "zod";
import {
  MLS_FEED_TYPES,
  MLS_MAPPING_TRANSFORMS,
  MLS_MEDIA_POLICIES,
  MLS_ONBOARDING_STATUSES,
  MLS_PROVIDERS,
  MLS_RETENTION_POLICIES,
  mlsFeeds,
  mlsFieldMappings,
  mlsImportExceptions,
  mlsListingHistory,
  mlsListings,
  mlsMedia,
  mlsMembers,
  mlsMetadataSnapshots,
  mlsOffices,
  mlsOpenHouses,
  mlsProperties,
  mlsPropertyInsights,
  mlsProviderUsage,
  mlsRawRecords,
  mlsSources,
  mlsSyncCursors,
  mlsSyncRuns,
  mlsWorkerHeartbeats,
  type MlsFeed,
  type MlsSource,
} from "../../drizzle/mlsSchema";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { adapterFor } from "../mls/adapters";
import { clearTokenCache } from "../mls/adapters/trestle";
import {
  feedFreshness,
  fillComplianceTemplate,
  providerLabel,
  readComplianceProfile,
  type ComplianceProfile,
} from "../mls/compliance";
import { CREDENTIAL_REF_PATTERN, credentialStatus } from "../mls/credentials";
import { sanitizeError } from "../mls/engine";
import { galleryMarkerCondition, galleryMarkerKey, isGalleryMarker } from "../mls/gallery";
import { approvedFeedSql, licenseError } from "../mls/license";
import { getLane, requestJson } from "../mls/http";
import { CANONICAL_PROPERTY_TYPES, CANONICAL_STATUSES, PROPERTY_TYPE_LABELS, STATUS_LABELS } from "../mls/normalize/enums";
import { INSIGHT_FIELDS, LISTING_FIELD_RULES, listingRuleColumns } from "../mls/normalize/fieldMap";
import { ensureMlsSchema } from "../mls/schema";
import { countListings, mapPoints, SEARCH_SORTS, searchFiltersSchema, searchListings, boundsSchema } from "../mls/search";
import { UNRESOLVED_MARKETS } from "../mls/sources";
import { withMlsPhotoListingId } from "../mls/photoUrl";
import { licensedIdxPhotoFallbacks } from "../mls/photoFallback";
import { canAdminUsePermission } from "./permissions";
/**
 * MLS Properties (admin). Deliberately separate from the existing Properties
 * module: nothing here reads or writes the legacy properties tables.
 */

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDb(): Promise<Db> {
  await ensureMlsSchema();
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

const viewProcedure = adminProcedure.use(async ({ ctx, next }) => {
  if (!(await canAdminUsePermission(ctx.user as any, "canViewMlsProperties"))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MLS Properties permission is required." });
  }
  return next();
});

const manageProcedure = adminProcedure.use(async ({ ctx, next }) => {
  if (!(await canAdminUsePermission(ctx.user as any, "canManageMlsFeeds"))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "MLS Feeds and Mappings permission is required." });
  }
  return next();
});

const num = (value: string | number | null | undefined) => (value === null || value === undefined ? null : Number(value));

function sourceCompliance(source: MlsSource): ComplianceProfile {
  return readComplianceProfile(source.compliance, source.providerRoute);
}

function feedView(feed: MlsFeed, source: MlsSource | undefined) {
  const credentials = credentialStatus(feed);
  const compliance = source ? sourceCompliance(source) : null;
  const maxHours = Math.min(feed.maxStalenessHours, compliance?.maxRefreshHours ?? feed.maxStalenessHours);
  const { leaseOwner, ...rest } = feed;
  return {
    ...rest,
    providerLabel: providerLabel(feed.provider),
    leased: !!leaseOwner && !!feed.leaseExpiresAt && feed.leaseExpiresAt.getTime() > Date.now(),
    credentialsConfigured: credentials.configured,
    expectedVariables: credentials.expectedVariables,
    freshness: feedFreshness(feed.lastSuccessAt, maxHours),
    maxRefreshHours: maxHours,
  };
}

const feedInputSchema = z.object({
  sourceId: z.number().int(),
  name: z.string().trim().min(2).max(255),
  provider: z.enum(MLS_PROVIDERS),
  feedType: z.enum(MLS_FEED_TYPES),
  baseUrl: z.string().trim().url().max(512).optional().or(z.literal("")),
  tokenUrl: z.string().trim().url().max(512).optional().or(z.literal("")),
  originatingSystemName: z.string().trim().max(64).optional().or(z.literal("")),
  keyPrefix: z.string().trim().max(16).optional().or(z.literal("")),
  credentialRef: z.string().trim().regex(CREDENTIAL_REF_PATTERN, "Use capitals, numbers and underscores, e.g. MLSGRID"),
  resources: z.array(z.enum(["Property", "Member", "Office", "OpenHouse"])).min(1).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  syncIntervalMinutes: z.number().int().min(5).max(1440).default(15),
  reconcileIntervalHours: z.number().int().min(1).max(168).default(24),
  maxStalenessHours: z.number().int().min(1).max(168).default(12),
  mediaPolicy: z.enum(MLS_MEDIA_POLICIES).default("active_all_else_primary"),
  retentionPolicy: z.enum(MLS_RETENTION_POLICIES).default("purge"),
  enabled: z.boolean().default(false),
});

function feedValues(input: z.infer<typeof feedInputSchema>, source: MlsSource) {
  const adapter = adapterFor(input.provider);
  return {
    sourceId: input.sourceId,
    name: input.name,
    provider: input.provider,
    feedType: input.feedType,
    baseUrl: input.baseUrl || adapter.defaultBaseUrl,
    tokenUrl: input.tokenUrl || null,
    originatingSystemName: input.originatingSystemName || source.originatingSystemName || null,
    keyPrefix: input.keyPrefix || source.keyPrefix || null,
    credentialRef: input.credentialRef,
    resources: input.resources ?? null,
    options: input.options ?? null,
    syncIntervalMinutes: input.syncIntervalMinutes,
    reconcileIntervalHours: input.reconcileIntervalHours,
    maxStalenessHours: input.maxStalenessHours,
    mediaPolicy: input.mediaPolicy,
    retentionPolicy: input.retentionPolicy,
    enabled: input.enabled,
  };
}

function assertFeedConfig(values: ReturnType<typeof feedValues>) {
  const licenseIssue = licenseError(values);
  if (values.enabled && licenseIssue) throw new TRPCError({ code: "BAD_REQUEST", message: licenseIssue });
  if (values.provider === "mls_grid" && !values.originatingSystemName) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "MLS Grid feeds need an OriginatingSystemName (for Canopy it is 'carolina')." });
  }
  if (values.provider === "custom" && values.enabled) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Custom feeds have no adapter yet and cannot be enabled." });
  }
}

const mappingTargetSchema = z
  .string()
  .trim()
  .max(191)
  .refine(value => {
    if (value === "ignore") return true;
    const [prefix, name] = value.split(".", 2);
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return false;
    if (prefix === "listing") return listingRuleColumns().has(name);
    if (prefix === "insight") return (INSIGHT_FIELDS as readonly string[]).includes(name);
    return prefix === "feature" || prefix === "local";
  }, "Target must be listing.<column>, feature.<name>, local.<name>, insight.<field>, or ignore");

const mappingInputSchema = z.object({
  sourceId: z.number().int().nullable(),
  provider: z.enum(MLS_PROVIDERS).nullable(),
  resource: z.enum(["Property", "Member", "Office", "OpenHouse"]).default("Property"),
  sourceField: z.string().trim().min(1).max(191),
  resoField: z.string().trim().max(191).nullable().optional(),
  target: mappingTargetSchema,
  transform: z.enum(MLS_MAPPING_TRANSFORMS),
  valueMap: z.record(z.string(), z.string()).nullable().optional(),
  confidence: z.number().int().min(0).max(100).default(100),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

export const mlsPropertiesRouter = router({
  /** Everything the search page needs to render filters. */
  filterOptions: viewProcedure.query(async () => {
    const db = await requireDb();
    const [sources, feeds] = await Promise.all([
      db.select().from(mlsSources).orderBy(asc(mlsSources.sortOrder)),
      db.select().from(mlsFeeds),
    ]);
    const licensedSources = new Set(feeds.filter(feed => !licenseError(feed)).map(feed => feed.sourceId));
    return {
      sources: sources.filter(source => licensedSources.has(source.id)).map(source => ({
        id: source.id,
        name: source.name,
        shortName: source.shortName,
        providerRoute: source.providerRoute,
        onboardingStatus: source.onboardingStatus,
      })),
      statuses: CANONICAL_STATUSES.map(value => ({ value, label: STATUS_LABELS[value] })),
      propertyTypes: CANONICAL_PROPERTY_TYPES.map(value => ({ value, label: PROPERTY_TYPE_LABELS[value] })),
      sorts: SEARCH_SORTS,
    };
  }),

  /** Native facets are read only from already licensed Active rows, never from raw provider payloads. */
  sourceFacets: viewProcedure.input(z.object({ sourceId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await requireDb();
    const scope = and(
      eq(mlsListings.sourceId, input.sourceId),
      eq(mlsListings.standardStatus, "active"),
      isNull(mlsListings.removedFromFeedAt),
      sql.raw(approvedFeedSql()),
    );
    const [subTypes, statuses, counties] = await Promise.all([
      db.selectDistinct({ value: mlsListings.propertySubType }).from(mlsListings)
        .where(and(scope, isNotNull(mlsListings.propertySubType))).orderBy(asc(mlsListings.propertySubType)).limit(60),
      db.selectDistinct({ value: mlsListings.mlsStatus }).from(mlsListings)
        .where(and(scope, isNotNull(mlsListings.mlsStatus))).orderBy(asc(mlsListings.mlsStatus)).limit(40),
      db.selectDistinct({ value: mlsListings.countyOrParish }).from(mlsListings)
        .where(and(scope, isNotNull(mlsListings.countyOrParish))).orderBy(asc(mlsListings.countyOrParish)).limit(80),
    ]);
    return {
      propertySubTypes: subTypes.map(row => row.value).filter((value): value is string => !!value),
      mlsStatuses: statuses.map(row => row.value).filter((value): value is string => !!value),
      counties: counties.map(row => row.value).filter((value): value is string => !!value),
    };
  }),

  /** Only a Mapbox public browser token can be exposed; MLS credentials stay private. */
  mapConfig: viewProcedure.query(() => {
    const publicToken = process.env.MAPBOX_PUBLIC_TOKEN?.trim();
    return { publicToken: publicToken?.startsWith("pk.") ? publicToken : null };
  }),

  search: viewProcedure
    .input(
      z.object({
        filters: searchFiltersSchema.default({}),
        sort: z.enum(SEARCH_SORTS).default("newest"),
        page: z.number().int().min(1).max(10_000).default(1),
        pageSize: z.number().int().min(1).max(100).default(24),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      return searchListings(db, { ...input, countMode: "none" });
    }),

  /** Exact count is intentionally independent of the latency-sensitive page query. */
  total: viewProcedure.input(z.object({ filters: searchFiltersSchema.default({}) })).query(async ({ input }) => {
    const db = await requireDb();
    return { total: await countListings(db, input.filters) };
  }),

  mapPoints: viewProcedure
    .input(z.object({ filters: searchFiltersSchema.default({}), bounds: boundsSchema, zoom: z.number().min(0).max(22) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return mapPoints(db, { filters: { ...input.filters, bounds: undefined }, bounds: input.bounds, zoom: input.zoom });
    }),

  requestGallery: viewProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const [listing] = await db.select().from(mlsListings).where(and(eq(mlsListings.id, input.id), isNull(mlsListings.removedFromFeedAt))).limit(1);
    if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    const [feed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, listing.feedId)).limit(1);
    if (!feed || !feed.enabled || licenseError(feed)) throw new TRPCError({ code: "NOT_FOUND", message: "Feed unavailable" });
    // A sentinel works even for historical pages fetched without Media.
    // Only the ingestion worker refreshes photo links, within the token budget.
    const [existingMarker] = await db.select({ status: mlsMedia.status }).from(mlsMedia)
      .where(and(eq(mlsMedia.feedId, listing.feedId), eq(mlsMedia.resourceKey, listing.providerListingKey), galleryMarkerCondition()))
      .limit(1);
    if (existingMarker && existingMarker.status !== "delete_pending" && existingMarker.status !== "failed") return { queued: true };
    await db.insert(mlsMedia).values({
      feedId: listing.feedId, listingId: listing.id, resourceKey: listing.providerListingKey,
      mediaKey: galleryMarkerKey(listing.id), status: "expired", priority: 0,
    }).onDuplicateKeyUpdate({ set: { status: "expired", attempts: 0, priority: 0, lastError: null } });
    return { queued: true };
  }),

  listing: viewProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const [listing] = await db.select().from(mlsListings).where(eq(mlsListings.id, input.id)).limit(1);
    if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    const [licensedFeed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, listing.feedId)).limit(1);
    if (!licensedFeed || licenseError(licensedFeed)) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    const [[source], [feed], [property], [insights]] = await Promise.all([
      db.select().from(mlsSources).where(eq(mlsSources.id, listing.sourceId)).limit(1),
      db.select().from(mlsFeeds).where(eq(mlsFeeds.id, listing.feedId)).limit(1),
      db.select().from(mlsProperties).where(eq(mlsProperties.id, listing.propertyId)).limit(1),
      db.select().from(mlsPropertyInsights).where(eq(mlsPropertyInsights.propertyId, listing.propertyId)).limit(1),
    ]);
    const [history, media, openHouses, otherListings] = await Promise.all([
      db
        .select()
        .from(mlsListingHistory)
        .where(
          and(
            eq(mlsListingHistory.propertyId, listing.propertyId),
            sql.raw(`EXISTS (SELECT 1 FROM mls_listings AS hl WHERE hl.id = mls_listing_history.listingId AND ${approvedFeedSql("hf", "hl.feedId")})`)
          )
        )
        .orderBy(desc(mlsListingHistory.eventAt), desc(mlsListingHistory.id))
        .limit(200),
      db
        .select({
          id: mlsMedia.id,
          mediaKey: mlsMedia.mediaKey,
          url: mlsMedia.url,
          caption: mlsMedia.caption,
          category: mlsMedia.category,
          isPrimary: mlsMedia.isPrimary,
          sortOrder: mlsMedia.sortOrder,
          status: mlsMedia.status,
          priority: mlsMedia.priority,
        })
        .from(mlsMedia)
        .where(and(eq(mlsMedia.feedId, listing.feedId), eq(mlsMedia.resourceKey, listing.providerListingKey)))
        .orderBy(asc(mlsMedia.sortOrder), asc(mlsMedia.id)),
      db
        .select()
        .from(mlsOpenHouses)
        .where(and(eq(mlsOpenHouses.listingId, listing.id), gte(mlsOpenHouses.endAt, new Date())))
        .orderBy(asc(mlsOpenHouses.startAt)),
      db
        .select({
          id: mlsListings.id,
          listingNumber: mlsListings.listingNumber,
          standardStatus: mlsListings.standardStatus,
          listPrice: mlsListings.listPrice,
          closePrice: mlsListings.closePrice,
          closeDate: mlsListings.closeDate,
          onMarketDate: mlsListings.onMarketDate,
          originalEntryAt: mlsListings.originalEntryAt,
          sourceId: mlsListings.sourceId,
          listOfficeName: mlsListings.listOfficeName,
          buyerOfficeName: mlsListings.buyerOfficeName,
          removedFromFeedAt: mlsListings.removedFromFeedAt,
        })
        .from(mlsListings)
        .where(and(eq(mlsListings.propertyId, listing.propertyId), ne(mlsListings.id, listing.id), sql.raw(approvedFeedSql())))
        .orderBy(desc(mlsListings.originalEntryAt)),
    ]);
    // Older MLS history (Canopy before ~2013) carries only the agent and office
    // MLS numbers, not their keys or names. Fall back to the MLS number so the
    // listing brokerage, which display rules require, is still shown.
    const [listAgent] = listing.listAgentKey
      ? await db
          .select()
          .from(mlsMembers)
          .where(and(eq(mlsMembers.feedId, listing.feedId), eq(mlsMembers.memberKey, listing.listAgentKey)))
          .limit(1)
      : listing.listAgentMlsId
        ? await db
            .select()
            .from(mlsMembers)
            .where(and(eq(mlsMembers.sourceId, listing.sourceId), eq(mlsMembers.memberMlsId, listing.listAgentMlsId)))
            .limit(1)
        : [];
    const [listOffice] = listing.listOfficeKey
      ? await db
          .select()
          .from(mlsOffices)
          .where(and(eq(mlsOffices.feedId, listing.feedId), eq(mlsOffices.officeKey, listing.listOfficeKey)))
          .limit(1)
      : listing.listOfficeMlsId
        ? await db
            .select()
            .from(mlsOffices)
            .where(and(eq(mlsOffices.sourceId, listing.sourceId), eq(mlsOffices.officeMlsId, listing.listOfficeMlsId)))
            .limit(1)
        : [];

    const compliance = source ? sourceCompliance(source) : null;
    const confidential = new Set(compliance?.confidentialFields ?? []);
    const localFields = Object.fromEntries(
      Object.entries((listing.localFields ?? {}) as Record<string, unknown>).filter(([key]) => !confidential.has(key))
    );
    const mlsName = source?.name ?? "the MLS";
    const optOuts: string[] = [];
    if (listing.internetEntireListingDisplayYN === false) optOuts.push("Seller opted out of internet display. Back office use only.");
    if (listing.internetAddressDisplayYN === false) optOuts.push("Seller opted out of address display.");
    if (listing.internetAvmDisplayYN === false) optOuts.push("Seller opted out of automated valuations next to this listing.");
    if (listing.internetConsumerCommentYN === false) optOuts.push("Seller opted out of consumer comments.");
    const canManage = await canAdminUsePermission(ctx.user as any, "canManageMlsFeeds");
    const storedMedia = media.filter(item => item.status === "stored" && item.url);
    const alternate = storedMedia.length ? undefined : (await licensedIdxPhotoFallbacks(db, [listing])).get(listing.id);

    return {
      listing: {
        ...listing,
        primaryPhotoUrl: storedMedia.length ? withMlsPhotoListingId(listing.primaryPhotoUrl, listing.id)
          : alternate?.media[0]?.url ?? null,
        localFields,
        listPrice: num(listing.listPrice),
        originalListPrice: num(listing.originalListPrice),
        previousListPrice: num(listing.previousListPrice),
        closePrice: num(listing.closePrice),
        bathroomsTotal: num(listing.bathroomsTotal),
        livingArea: num(listing.livingArea),
        aboveGradeFinishedArea: num(listing.aboveGradeFinishedArea),
        belowGradeFinishedArea: num(listing.belowGradeFinishedArea),
        buildingAreaTotal: num(listing.buildingAreaTotal),
        lotSizeAcres: num(listing.lotSizeAcres),
        lotSizeSquareFeet: num(listing.lotSizeSquareFeet),
        garageSpaces: num(listing.garageSpaces),
        parkingTotal: num(listing.parkingTotal),
        associationFee: num(listing.associationFee),
        taxAnnualAmount: num(listing.taxAnnualAmount),
        taxAssessedValue: num(listing.taxAssessedValue),
        latitude: num(listing.latitude),
        longitude: num(listing.longitude),
      },
      property: property
        ? {
            ...property,
            latitude: num(property.latitude),
            longitude: num(property.longitude),
            latestListPrice: num(property.latestListPrice),
            lastClosePrice: num(property.lastClosePrice),
          }
        : null,
      insights: insights ?? null,
      source: source
        ? { id: source.id, name: source.name, shortName: source.shortName, providerRoute: source.providerRoute, websiteUrl: source.websiteUrl }
        : null,
      feed: feed
        ? {
            id: feed.id,
            name: feed.name,
            provider: feed.provider,
            providerLabel: providerLabel(feed.provider),
            feedType: feed.feedType,
            lastSuccessAt: feed.lastSuccessAt,
            freshness: feedFreshness(feed.lastSuccessAt, Math.min(feed.maxStalenessHours, compliance?.maxRefreshHours ?? 12)),
          }
        : null,
      display: compliance
        ? {
            attribution: fillComplianceTemplate(compliance.attribution, { mlsName, asOf: feed?.lastSuccessAt }),
            disclaimer: fillComplianceTemplate(compliance.disclaimer, { mlsName, asOf: feed?.lastSuccessAt }),
            logoRequired: compliance.logoRequired,
            basis: compliance.basis,
            soldListings: compliance.soldListings,
            optOuts,
          }
        : null,
      media: storedMedia.length
        ? storedMedia.map(item => ({ ...item, url: withMlsPhotoListingId(item.url, listing.id) }))
        : alternate?.media ?? [],
      mediaProvenance: alternate ? { feedType: "idx" as const, listingId: alternate.listingId } : null,
      galleryQueued: media.some(item =>
        (isGalleryMarker(item.mediaKey) || item.priority === 0) &&
        ["pending", "expired", "downloading"].includes(item.status)
      ),
      mediaStatus: media.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = (acc[item.status] ?? 0) + 1;
        return acc;
      }, {}),
      history: history.map(event => ({ ...event, fromPrice: num(event.fromPrice), toPrice: num(event.toPrice) })),
      openHouses,
      otherListings: otherListings.map(row => ({ ...row, listPrice: num(row.listPrice), closePrice: num(row.closePrice) })),
      listAgent: listAgent ? { fullName: listAgent.fullName, email: listAgent.email, phone: listAgent.phone, memberMlsId: listAgent.memberMlsId } : null,
      listOffice: listOffice ? { officeName: listOffice.officeName, phone: listOffice.phone, email: listOffice.email } : null,
      canManage,
    };
  }),

  /** The untouched provider payload, for mapping work. Managers only. */
  rawPayload: manageProcedure.input(z.object({ listingId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await requireDb();
    const [listing] = await db
      .select({ feedId: mlsListings.feedId, providerListingKey: mlsListings.providerListingKey })
      .from(mlsListings)
      .where(eq(mlsListings.id, input.listingId))
      .limit(1);
    if (!listing) throw new TRPCError({ code: "NOT_FOUND" });
    const [rawFeed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, listing.feedId)).limit(1);
    if (!rawFeed || licenseError(rawFeed)) throw new TRPCError({ code: "NOT_FOUND" });
    const [raw] = await db
      .select()
      .from(mlsRawRecords)
      .where(
        and(
          eq(mlsRawRecords.feedId, listing.feedId),
          eq(mlsRawRecords.resource, "Property"),
          eq(mlsRawRecords.providerKey, listing.providerListingKey)
        )
      )
      .limit(1);
    if (!raw) return { payload: null, receivedAt: null, bytes: 0 };
    const payload = JSON.parse(gunzipSync(Buffer.from(raw.payloadGzip as any)).toString("utf8"));
    // Signed media URLs are credentials in all but name; never echo them.
    if (Array.isArray(payload?.Media)) {
      payload.Media = payload.Media.map((item: Record<string, unknown>) => ({ ...item, MediaURL: item.MediaURL ? "[redacted]" : item.MediaURL }));
    }
    return { payload, receivedAt: raw.receivedAt, bytes: raw.payloadBytes };
  }),

  /** Photo diagnostics must not wait on a full listing/property count during import. */
  photoHealth: manageProcedure.query(async () => {
    const db = await requireDb();
    const [queue, [worker], galleries] = await Promise.all([
      db.select({ feedId: mlsMedia.feedId, status: mlsMedia.status, count: sql<number>`count(*)` })
        .from(mlsMedia).groupBy(mlsMedia.feedId, mlsMedia.status),
      db.select({ detail: mlsWorkerHeartbeats.detail, lastBeatAt: mlsWorkerHeartbeats.lastBeatAt, version: mlsWorkerHeartbeats.version })
        .from(mlsWorkerHeartbeats).orderBy(desc(mlsWorkerHeartbeats.lastBeatAt)).limit(1),
      db.select({ feedId: mlsSyncCursors.feedId, phase: mlsSyncCursors.phase, recordsSeen: mlsSyncCursors.recordsSeen, lastSuccessAt: mlsSyncCursors.lastSuccessAt })
        .from(mlsSyncCursors).where(eq(mlsSyncCursors.resource, "ActiveGallery")),
    ]);
    let photoStorage: { configurationValid: boolean; issue: string | null } | null = null;
    let lastMediaActivity: { at: string; claimed: number; stored: number; failed: number; expired: number; refreshed: number } | null = null;
    type UsageWindow = { windowMs: number; limit: number; used: number };
    let laneUsage: Array<{ key: string; downloading: boolean; mediaDay: UsageWindow | null; mediaHour: UsageWindow | null; sharedDay: UsageWindow | null; pausedForMs: number }> = [];
    // Per-lane last batch and per-feed gallery scan, so a starved lane is visible.
    const mediaLanes: Array<{ key: string; at: string; ms: number | null; claimed: number; stored: number; failed: number; expired: number; refreshed: number; error: string | null }> = [];
    const galleryActivity: Array<{ feedId: number; at: string; scanned: number; queued: number }> = [];
    try {
      const detail = JSON.parse(worker?.detail ?? "null");
      if (typeof detail?.photoStorage?.configurationValid === "boolean") {
        photoStorage = {
          configurationValid: detail.photoStorage.configurationValid,
          issue: typeof detail.photoStorage.issue === "string" ? detail.photoStorage.issue : null,
        };
      }
      const windowFor = (snapshot: { windows?: UsageWindow[] } | undefined, ms: number) =>
        Array.isArray(snapshot?.windows) ? snapshot.windows.find(item => item.windowMs === ms) ?? null : null;
      if (Array.isArray(detail?.lanes)) {
        laneUsage = detail.lanes.filter((lane: any) => typeof lane?.key === "string").map((lane: any) => ({
          key: lane.key,
          downloading: !!lane.state?.media,
          mediaDay: windowFor(lane.media, 86_400_000),
          mediaHour: windowFor(lane.media, 3_600_000),
          sharedDay: windowFor(lane.api, 86_400_000),
          pausedForMs: Number(lane.media?.pausedForMs) || 0,
        }));
      }
      for (const [key, value] of Object.entries(detail?.lastActivity ?? {})) {
        if (value && typeof value === "object" && typeof (value as any).at === "string") {
          const item = value as Record<string, unknown>;
          if (key.startsWith("media:")) {
            mediaLanes.push({
              key: key.slice(6), at: String(item.at), ms: Number.isFinite(Number(item.ms)) ? Number(item.ms) : null,
              claimed: Number(item.claimed) || 0, stored: Number(item.stored) || 0, failed: Number(item.failed) || 0,
              expired: Number(item.expired) || 0, refreshed: Number(item.refreshed) || 0,
              // Never surface a signed provider URL from an error message.
              error: typeof item.error === "string" ? item.error.replace(/https?:\/\/\S+/g, "[url]").slice(0, 200) : null,
            });
          } else if (key.startsWith("gallery:")) {
            galleryActivity.push({ feedId: Number(key.slice(8)) || 0, at: String(item.at), scanned: Number(item.scanned) || 0, queued: Number(item.queued) || 0 });
          }
        }
        if (!key.startsWith("media:") || !value || typeof value !== "object") continue;
        const activity = value as Record<string, unknown>;
        if (typeof activity.at !== "string") continue;
        if (!lastMediaActivity || activity.at > lastMediaActivity.at) {
          lastMediaActivity = {
            at: activity.at,
            claimed: Number(activity.claimed) || 0,
            stored: Number(activity.stored) || 0,
            failed: Number(activity.failed) || 0,
            expired: Number(activity.expired) || 0,
            refreshed: Number(activity.refreshed) || 0,
          };
        }
      }
    } catch { /* An old or malformed heartbeat must not break the health page. */ }
    return {
      queue: queue.map(row => ({ feedId: row.feedId, status: row.status, count: Number(row.count) })),
      activeGalleryScans: galleries.map(row => ({ feedId: row.feedId, phase: row.phase, scanned: Number(row.recordsSeen), lastPassAt: row.lastSuccessAt })),
      worker: worker ? { alive: Date.now() - worker.lastBeatAt.getTime() < 120_000, lastBeatAt: worker.lastBeatAt, version: worker.version } : null,
      photoStorage,
      lastMediaActivity,
      laneUsage,
      mediaLanes,
      galleryActivity,
    };
  }),

  overview: viewProcedure.query(async () => {
    const db = await requireDb();
    const [byStatus, [{ properties }], mediaByStatus, heartbeats] = await Promise.all([
      db
        .select({ status: mlsListings.standardStatus, count: sql<number>`count(*)` })
        .from(mlsListings)
        .where(and(isNull(mlsListings.removedFromFeedAt), sql.raw(approvedFeedSql())))
        .groupBy(mlsListings.standardStatus),
      db.select({ properties: sql<number>`count(*)` }).from(mlsProperties),
      db.select({ status: mlsMedia.status, count: sql<number>`count(*)` }).from(mlsMedia).groupBy(mlsMedia.status),
      db.select().from(mlsWorkerHeartbeats).orderBy(desc(mlsWorkerHeartbeats.lastBeatAt)).limit(10),
    ]);
    return {
      listingsByStatus: byStatus.map(row => ({ status: row.status, count: Number(row.count) })),
      properties: Number(properties),
      mediaByStatus: mediaByStatus.map(row => ({ status: row.status, count: Number(row.count) })),
      workers: heartbeats.map(beat => ({
        workerId: beat.workerId,
        startedAt: beat.startedAt,
        lastBeatAt: beat.lastBeatAt,
        version: beat.version,
        alive: Date.now() - beat.lastBeatAt.getTime() < 120_000,
        detail: beat.detail ? JSON.parse(beat.detail) : null,
      })),
    };
  }),

  // ── Sources and feeds (managers) ────────────────────────────────────────
  sources: manageProcedure.query(async () => {
    const db = await requireDb();
    const [sources, feeds] = await Promise.all([
      db.select().from(mlsSources).orderBy(asc(mlsSources.sortOrder)),
      db.select().from(mlsFeeds).orderBy(asc(mlsFeeds.id)),
    ]);
    const sourceById = new Map(sources.map(source => [source.id, source]));
    return {
      sources: sources.map(source => ({
        ...source,
        compliance: sourceCompliance(source),
        routeLabel: providerLabel(source.providerRoute),
        feeds: feeds.filter(feed => feed.sourceId === source.id).map(feed => feedView(feed, sourceById.get(feed.sourceId))),
      })),
      unresolvedMarkets: UNRESOLVED_MARKETS,
      providers: MLS_PROVIDERS.map(provider => {
        const adapter = adapterFor(provider);
        return { value: provider, label: providerLabel(provider), defaultBaseUrl: adapter.defaultBaseUrl, defaultResources: adapter.defaultResources, capabilities: adapter.capabilities };
      }),
    };
  }),

  updateSource: manageProcedure
    .input(
      z.object({
        id: z.number().int(),
        onboardingStatus: z.enum(MLS_ONBOARDING_STATUSES).optional(),
        routeNote: z.string().max(4000).nullable().optional(),
        originatingSystemName: z.string().trim().max(64).nullable().optional(),
        keyPrefix: z.string().trim().max(16).nullable().optional(),
        websiteUrl: z.string().trim().max(512).nullable().optional(),
        compliance: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [source] = await db.select().from(mlsSources).where(eq(mlsSources.id, input.id)).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, compliance, ...rest } = input;
      const set: Record<string, unknown> = { ...rest };
      if (compliance) set.compliance = { ...sourceCompliance(source), ...compliance };
      await db.update(mlsSources).set(set).where(eq(mlsSources.id, id));
      return { ok: true };
    }),

  createFeed: manageProcedure.input(feedInputSchema).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const [source] = await db.select().from(mlsSources).where(eq(mlsSources.id, input.sourceId)).limit(1);
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
    const values = feedValues(input, source);
    assertFeedConfig(values);
    const [duplicate] = await db
      .select({ id: mlsFeeds.id })
      .from(mlsFeeds)
      .where(and(eq(mlsFeeds.sourceId, values.sourceId), eq(mlsFeeds.provider, values.provider), eq(mlsFeeds.feedType, values.feedType)))
      .limit(1);
    if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "This source already has a feed for that provider and license type." });
    const result = await db.insert(mlsFeeds).values({ ...values, createdById: (ctx.user as any).id });
    return { id: Number((result as any)[0]?.insertId) };
  }),

  updateFeed: manageProcedure
    .input(feedInputSchema.extend({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [feed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, input.id)).limit(1);
      if (!feed) throw new TRPCError({ code: "NOT_FOUND" });
      if (feed.leaseOwner && feed.leaseExpiresAt && feed.leaseExpiresAt > new Date()) throw new TRPCError({ code: "CONFLICT", message: "Wait for the feed cycle to finish before editing configuration." });
      const [source] = await db.select().from(mlsSources).where(eq(mlsSources.id, input.sourceId)).limit(1);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      const values = feedValues(input, source);
      assertFeedConfig(values);
      if (feed.provider !== values.provider || feed.sourceId !== values.sourceId) {
        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(mlsListings).where(eq(mlsListings.feedId, feed.id));
        if (Number(count) > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This feed already holds listings. Create a new feed instead of changing its provider or source." });
        }
      }
      await db.update(mlsFeeds).set(values).where(eq(mlsFeeds.id, input.id));
      return { ok: true };
    }),

  feedAction: manageProcedure
    .input(
      z.object({
        id: z.number().int(),
        action: z.enum(["enable", "disable", "sync_now", "reconcile_now", "refresh_metadata", "full_reload", "clear_error"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [feed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, input.id)).limit(1);
      if (!feed) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      if (["enable", "sync_now", "reconcile_now", "refresh_metadata", "full_reload"].includes(input.action)) {
        const issue = licenseError(feed);
        if (issue) throw new TRPCError({ code: "BAD_REQUEST", message: issue });
      }
      if (feed.leaseOwner && feed.leaseExpiresAt && feed.leaseExpiresAt > now && input.action === "full_reload") {
        throw new TRPCError({ code: "CONFLICT", message: "Wait for the running feed cycle to finish before reloading." });
      }
      switch (input.action) {
        case "enable":
          if (feed.provider === "custom") throw new TRPCError({ code: "BAD_REQUEST", message: "Custom feeds cannot be enabled yet." });
          await db.update(mlsFeeds).set({ enabled: true, status: "idle" }).where(eq(mlsFeeds.id, feed.id));
          break;
        case "disable":
          await db.update(mlsFeeds).set({ enabled: false }).where(eq(mlsFeeds.id, feed.id));
          break;
        case "sync_now":
          await db.update(mlsFeeds).set({ syncRequestedAt: now }).where(eq(mlsFeeds.id, feed.id));
          break;
        case "reconcile_now":
          await db.update(mlsFeeds).set({ reconcileRequestedAt: now, syncRequestedAt: now }).where(eq(mlsFeeds.id, feed.id));
          break;
        case "refresh_metadata":
          await db.update(mlsFeeds).set({ lastMetadataAt: null, syncRequestedAt: now }).where(eq(mlsFeeds.id, feed.id));
          break;
        case "full_reload":
          // Cursors restart; records not seen by the end of the reload are swept.
          await db.delete(mlsSyncCursors).where(eq(mlsSyncCursors.feedId, feed.id));
          await db.update(mlsFeeds).set({ syncRequestedAt: now, initialImportCompletedAt: null }).where(eq(mlsFeeds.id, feed.id));
          break;
        case "clear_error":
          await db.update(mlsFeeds).set({ lastError: null, status: "idle" }).where(eq(mlsFeeds.id, feed.id));
          break;
      }
      return { ok: true };
    }),

  /** One small authenticated request. Proves the credential, base URL and filters. */
  testFeed: manageProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const [feed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, input.id)).limit(1);
    if (!feed) throw new TRPCError({ code: "NOT_FOUND" });
    const [source] = await db.select().from(mlsSources).where(eq(mlsSources.id, feed.sourceId)).limit(1);
    const credentials = credentialStatus(feed);
    if (!credentials.configured) {
      return { ok: false, message: `Missing Railway variables: ${credentials.expectedVariables.map(set => set.join(" + ")).join(" or ")}` };
    }
    if (feed.provider === "custom") return { ok: false, message: "Custom feeds have no adapter yet." };
    const adapter = adapterFor(feed.provider);
    const ctx = { feed, source: source! };
    const url = new URL(adapter.firstPageUrl(ctx, "Property", { phase: "initial", highWaterMark: null, resumeToken: null }, new Date().toISOString()));
    url.searchParams.set("$top", "1");
    url.searchParams.delete("$expand");
    const started = Date.now();
    try {
      const lane = getLane(feed.provider, feed.credentialRef, adapter.limits(feed));
      const { body } = await requestJson(lane, url.toString(), () => adapter.authHeaders(ctx), { onUnauthorized: clearTokenCache, maxAttempts: 1 });
      const first = Array.isArray(body?.value) ? body.value[0] : null;
      return {
        ok: true,
        message: first ? "Connected. Received a sample listing." : "Connected. The feed returned no listings for this filter.",
        ms: Date.now() - started,
        sampleKey: first ? String(first[adapter.keyField("Property")] ?? "") : null,
        fieldCount: first ? Object.keys(first).length : 0,
      };
    } catch (error) {
      return { ok: false, message: sanitizeError(error), ms: Date.now() - started };
    }
  }),

  feedRuns: manageProcedure
    .input(z.object({ feedId: z.number().int(), limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [runs, cursors, [exceptionCount], exceptions] = await Promise.all([
        db.select().from(mlsSyncRuns).where(eq(mlsSyncRuns.feedId, input.feedId)).orderBy(desc(mlsSyncRuns.startedAt)).limit(input.limit),
        db.select().from(mlsSyncCursors).where(eq(mlsSyncCursors.feedId, input.feedId)),
        db.select({ count: sql<number>`count(*)` }).from(mlsImportExceptions).where(eq(mlsImportExceptions.feedId, input.feedId)),
        db.select({ providerKey: mlsImportExceptions.providerKey, resource: mlsImportExceptions.resource, errorCode: mlsImportExceptions.errorCode, errorColumn: mlsImportExceptions.errorColumn, attempts: mlsImportExceptions.attempts, lastSeenAt: mlsImportExceptions.lastSeenAt })
          .from(mlsImportExceptions).where(eq(mlsImportExceptions.feedId, input.feedId)).orderBy(desc(mlsImportExceptions.lastSeenAt)).limit(20),
      ]);
      return { runs, cursors, quarantinedCount: Number(exceptionCount?.count ?? 0), exceptions };
    }),

  usage: manageProcedure.input(z.object({ hours: z.number().int().min(1).max(24 * 14).default(48) })).query(async ({ input }) => {
    const db = await requireDb();
    const since = new Date(Date.now() - input.hours * 3_600_000);
    return db
      .select()
      .from(mlsProviderUsage)
      .where(gte(mlsProviderUsage.windowStart, since))
      .orderBy(asc(mlsProviderUsage.windowStart));
  }),

  // ── Mapping registry (managers) ─────────────────────────────────────────
  mappings: manageProcedure.input(z.object({ sourceId: z.number().int().nullable().optional() }).default({})).query(async ({ input }) => {
    const db = await requireDb();
    const overrides = await db
      .select()
      .from(mlsFieldMappings)
      .where(input.sourceId ? eq(mlsFieldMappings.sourceId, input.sourceId) : undefined)
      .orderBy(asc(mlsFieldMappings.sourceField));
    return {
      defaults: LISTING_FIELD_RULES.map(rule => ({ ...rule })),
      overrides,
      insightFields: INSIGHT_FIELDS,
      listingColumns: Array.from(listingRuleColumns()).sort(),
      transforms: MLS_MAPPING_TRANSFORMS,
    };
  }),

  saveMapping: manageProcedure
    .input(mappingInputSchema.extend({ id: z.number().int().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      if (input.transform === "enum_map" && !input.valueMap) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "enum_map needs a value map." });
      }
      const { id, ...values } = input;
      const row = { ...values, resoField: values.resoField ?? null, valueMap: values.valueMap ?? null, notes: values.notes ?? null, updatedById: (ctx.user as any).id };
      if (id) {
        await db.update(mlsFieldMappings).set(row).where(eq(mlsFieldMappings.id, id));
        return { id };
      }
      const result = await db.insert(mlsFieldMappings).values(row);
      return { id: Number((result as any)[0]?.insertId) };
    }),

  deleteMapping: manageProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.delete(mlsFieldMappings).where(eq(mlsFieldMappings.id, input.id));
    return { ok: true };
  }),

  /** Local (non-RESO) fields each feed publishes, and whether a mapping covers them. */
  localFields: manageProcedure.input(z.object({ feedId: z.number().int() })).query(async ({ input }) => {
    const db = await requireDb();
    const [feed] = await db.select().from(mlsFeeds).where(eq(mlsFeeds.id, input.feedId)).limit(1);
    if (!feed) throw new TRPCError({ code: "NOT_FOUND" });
    const [snapshot] = await db
      .select()
      .from(mlsMetadataSnapshots)
      .where(and(eq(mlsMetadataSnapshots.feedId, feed.id), eq(mlsMetadataSnapshots.resource, "Property")))
      .limit(1);
    const overrides = await db
      .select({ sourceField: mlsFieldMappings.sourceField, target: mlsFieldMappings.target })
      .from(mlsFieldMappings)
      .where(and(eq(mlsFieldMappings.isActive, true), inArray(mlsFieldMappings.sourceId, [feed.sourceId])));
    const mapped = new Map(overrides.map(row => [row.sourceField, row.target]));
    const fields = ((snapshot?.fields as Array<{ name: string; type: string; isLocal: boolean; localName: string | null }>) ?? []).filter(field => field.isLocal);
    return {
      fetchedAt: snapshot?.fetchedAt ?? null,
      fieldCount: snapshot?.fieldCount ?? 0,
      fields: fields.map(field => ({ ...field, mappedTo: mapped.get(field.name) ?? null })),
    };
  }),
});
