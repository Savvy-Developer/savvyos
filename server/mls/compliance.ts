import type { MlsProvider, MlsRoute } from "../../drizzle/mlsSchema";

/**
 * What an MLS license lets us do with its data, and what it makes us show.
 *
 * Every source carries one profile (mls_sources.compliance). Provider defaults
 * come from the aggregator's published rules; per-source overrides capture MLS
 * specific rules. When a license is signed, the profile is updated to match
 * the signed agreement, which always wins over these defaults.
 *
 * Nothing here is enforced on a public page yet. The admin UI already reads
 * it (attribution, disclaimer, staleness), and the future public site must.
 */
export type ComplianceProfile = {
  /** Where the rule set came from, shown in the admin UI. */
  basis: "provider_published_rules" | "nar_idx_baseline" | "signed_license";
  /** Hours between successful refreshes before the feed is out of compliance. */
  maxRefreshHours: number;
  /** How deletions and loss of display rights reach us. */
  deletionSignal:
    | "mlg_can_view"
    | "key_reconciliation"
    | "deleted_endpoint_and_reconciliation"
    | "unknown";
  /** Remove listing content from our store once it is no longer viewable. */
  purgeWhenNotViewable: boolean;
  /** Attribution line shown next to listings. {mlsName} is filled in. */
  attribution: string;
  /** Disclaimer shown on search results and detail pages. {asOf} is the last refresh. */
  disclaimer: string;
  logoRequired: boolean;
  soldListings: "allowed" | "no_close_price" | "not_allowed" | "confirm";
  closedListingPhotos: "all" | "primary_only";
  /** Users must be able to filter results by MLS source. */
  sourceFilterRequired: boolean;
  /** Search must return every matching listing (no curation). */
  mustReturnAllMatches: boolean;
  /** Seller opt-outs we must honor on display. */
  honorSellerOptOuts: string[];
  /** Fields that must never be displayed. */
  confidentialFields: string[];
  /** Using MLS data with AI requires a signed addendum. */
  aiUseRequiresAddendum: boolean;
  notes: string[];
  ruleSources: Array<{ label: string; url: string }>;
};

const SELLER_OPT_OUTS = [
  "InternetEntireListingDisplayYN",
  "InternetAddressDisplayYN",
  "InternetAutomatedValuationDisplayYN",
  "InternetConsumerCommentYN",
];

const CONFIDENTIAL_FIELDS = [
  "PrivateRemarks",
  "PrivateOfficeRemarks",
  "ShowingInstructions",
  "ShowingContactName",
  "ShowingContactPhone",
  "LockBoxLocation",
  "LockBoxSerialNumber",
  "LockBoxType",
  "AccessCode",
  "OwnerName",
  "OwnerPhone",
  "ListingAgreement",
  "BuyerAgencyCompensation",
  "BuyerAgencyCompensationType",
  "SubAgencyCompensation",
  "TransactionBrokerCompensation",
  "DualVariableCompensationYN",
];

const MLS_GRID_DEFAULT: ComplianceProfile = {
  basis: "provider_published_rules",
  maxRefreshHours: 12,
  deletionSignal: "mlg_can_view",
  purgeWhenNotViewable: true,
  attribution: "Listings courtesy of {mlsName} as distributed by MLS GRID",
  disclaimer:
    "Based on information submitted to the MLS GRID as of {asOf}. All data is obtained from various sources and may not have been verified by broker or MLS GRID. Supplied Open House Information is subject to change without notice. All information should be independently reviewed and verified for accuracy. Properties may or may not be listed by the office/agent presenting the information.",
  logoRequired: true,
  soldListings: "allowed",
  closedListingPhotos: "all",
  sourceFilterRequired: true,
  mustReturnAllMatches: false,
  honorSellerOptOuts: SELLER_OPT_OUTS,
  confidentialFields: CONFIDENTIAL_FIELDS,
  aiUseRequiresAddendum: true,
  notes: [
    "Refresh downloaded data and displays at least every 12 hours.",
    "Show listing brokerage, listing number, and brokerage email or phone next to each listing.",
    "Sold listings must name the co-op brokerage, or state that properties may be listed or sold by various participants in the MLS.",
    "MLS Grid logo on the first page of results. Strip the MLS key prefix before display.",
    "Photos come from MLS Grid's CDN: links do not expire and may be displayed directly. Covers are also copied to private storage; license and listing permissions still apply.",
    "A replication gap longer than 7 days misses deletions and requires a full reload.",
  ],
  ruleSources: [
    { label: "MLS Grid IDX Rules", url: "https://www.mlsgrid.com/s/MLS-Grid-IDX-Rules.pdf" },
    { label: "MLS Grid API v2 docs", url: "https://docs.mlsgrid.com/api-documentation/api-version-2.0" },
    { label: "MLS Grid Data License Agreement", url: "https://www.mlsgrid.com/s/MLS-GRID-Data-License-Agreement.pdf" },
    { label: "MLS Grid media access change", url: "https://docs.mlsgrid.com/recent-releases/changes-to-mls-grid-media-access" },
  ],
};

const NAR_BASELINE: ComplianceProfile = {
  basis: "nar_idx_baseline",
  maxRefreshHours: 12,
  deletionSignal: "key_reconciliation",
  purgeWhenNotViewable: true,
  attribution: "Listing courtesy of {mlsName}",
  disclaimer:
    "Information deemed reliable but not guaranteed. Data provided by {mlsName} and last updated {asOf}. All information should be independently reviewed and verified for accuracy.",
  logoRequired: false,
  soldListings: "confirm",
  closedListingPhotos: "all",
  sourceFilterRequired: false,
  mustReturnAllMatches: false,
  honorSellerOptOuts: SELLER_OPT_OUTS,
  confidentialFields: CONFIDENTIAL_FIELDS,
  aiUseRequiresAddendum: false,
  notes: [
    "Baseline only. Replace with the signed MLS license terms before any public display.",
    "NAR IDX policy: refresh at least every 12 hours and identify the listing brokerage.",
  ],
  ruleSources: [],
};

export const PROVIDER_COMPLIANCE_DEFAULTS: Record<MlsRoute, ComplianceProfile> = {
  mls_grid: MLS_GRID_DEFAULT,
  trestle: {
    ...NAR_BASELINE,
    notes: [
      ...NAR_BASELINE.notes,
      "Trestle has no delete flag. Run key reconciliation to remove listings that leave the feed.",
      "IDX credentials usually exclude sold data; IDX Plus includes some sold data.",
    ],
    ruleSources: [
      { label: "Trestle WebAPI", url: "https://trestle-documentation.corelogic.com/web-api/" },
      { label: "Trestle at scale", url: "https://trestle-documentation.corelogic.com/web-api/at-scale/" },
    ],
  },
  spark: {
    ...NAR_BASELINE,
    notes: [
      ...NAR_BASELINE.notes,
      "Purge by key reconciliation at least daily; some MLS rules require more often.",
      "Display agent and office from Member and Office records; their changes do not bump the listing timestamp.",
    ],
    ruleSources: [
      { label: "Spark RESO replication", url: "https://sparkplatform.com/docs/reso/reso_replication" },
      { label: "Spark replication guidance", url: "https://sparkplatform.com/docs/supporting_documentation/replication" },
    ],
  },
  reso_web_api: { ...NAR_BASELINE, deletionSignal: "deleted_endpoint_and_reconciliation" },
  custom: { ...NAR_BASELINE, deletionSignal: "unknown" },
  unresolved: { ...NAR_BASELINE, deletionSignal: "unknown" },
};

export function buildComplianceProfile(
  route: MlsRoute,
  overrides: Partial<ComplianceProfile> = {}
): ComplianceProfile {
  const base = PROVIDER_COMPLIANCE_DEFAULTS[route];
  return {
    ...base,
    ...overrides,
    notes: [...base.notes, ...(overrides.notes ?? [])],
    ruleSources: [...base.ruleSources, ...(overrides.ruleSources ?? [])],
  };
}

export function readComplianceProfile(value: unknown, route: MlsRoute): ComplianceProfile {
  if (value && typeof value === "object") {
    return { ...PROVIDER_COMPLIANCE_DEFAULTS[route], ...(value as Partial<ComplianceProfile>) };
  }
  return PROVIDER_COMPLIANCE_DEFAULTS[route];
}

export function fillComplianceTemplate(template: string, values: { mlsName: string; asOf?: Date | null }) {
  const asOf = values.asOf
    ? values.asOf.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET"
    : "the last refresh";
  return template.replaceAll("{mlsName}", values.mlsName).replaceAll("{asOf}", asOf);
}

export type FeedFreshness = "fresh" | "due" | "stale" | "never";

/** Whether a feed is inside its refresh window. Stale means out of compliance. */
export function feedFreshness(
  lastSuccessAt: Date | null | undefined,
  maxRefreshHours: number,
  now: Date = new Date()
): FeedFreshness {
  if (!lastSuccessAt) return "never";
  const ageHours = (now.getTime() - lastSuccessAt.getTime()) / 3_600_000;
  if (ageHours > maxRefreshHours) return "stale";
  if (ageHours > maxRefreshHours * 0.75) return "due";
  return "fresh";
}

export function providerLabel(provider: MlsProvider | MlsRoute): string {
  switch (provider) {
    case "mls_grid":
      return "MLS Grid";
    case "trestle":
      return "Trestle (Cotality)";
    case "spark":
      return "Spark / FBS";
    case "reso_web_api":
      return "Direct RESO Web API";
    case "custom":
      return "Custom";
    case "unresolved":
      return "Unresolved";
  }
}
