import type { MlsRoute } from "../../drizzle/mlsSchema";
import { buildComplianceProfile, type ComplianceProfile } from "./compliance";

/**
 * The MLS sources Savvy is pursuing, organized so each MLS is applied for once.
 * Seeded at startup when missing; admins edit status and notes afterwards, and
 * the seed never overwrites those edits.
 *
 * MLS Grid originating system names and key prefixes come from the MLS Grid
 * API v2 documentation. Trestle and Spark sources get theirs when approved.
 */
export type MlsSourceSeed = {
  code: string;
  name: string;
  shortName: string;
  territory: string;
  providerRoute: MlsRoute;
  onboardingStatus: "planned" | "conditional" | "applied" | "approved" | "live" | "paused" | "unresolved";
  routeNote: string;
  originatingSystemName?: string;
  keyPrefix?: string;
  websiteUrl?: string;
  compliance?: Partial<ComplianceProfile>;
  /** Where the search map opens when only this MLS is selected. */
  mapCenter?: MlsMapCenter;
};

export type MlsMapCenter = { lat: number; lng: number; zoom: number };

export const MLS_SOURCE_SEEDS: MlsSourceSeed[] = [
  // ── 1. MLS Grid ──────────────────────────────────────────────────────────
  {
    code: "canopy",
    name: "Canopy MLS",
    shortName: "Canopy",
    territory: "Asheville / Western North Carolina",
    providerRoute: "mls_grid",
    onboardingStatus: "applied",
    routeNote: "First integration. Continue the existing setup.",
    originatingSystemName: "carolina",
    keyPrefix: "CAR",
    websiteUrl: "https://www.canopyrealtors.com",
    mapCenter: { lat: 35.5951, lng: -82.5515, zoom: 10 },
  },
  {
    code: "mibor",
    name: "MIBOR REALTOR Association",
    shortName: "MIBOR",
    territory: "Indianapolis",
    providerRoute: "mls_grid",
    onboardingStatus: "planned",
    routeNote: "Add through MLS Grid.",
    originatingSystemName: "mibor",
    keyPrefix: "MBR",
    mapCenter: { lat: 39.7684, lng: -86.1581, zoom: 9 },
  },
  {
    code: "stellar",
    name: "Stellar MLS",
    shortName: "Stellar",
    territory: "Sarasota, Bradenton, St. Pete, Clearwater, and applicable Central Florida coverage",
    providerRoute: "mls_grid",
    onboardingStatus: "planned",
    routeNote: "Add through MLS Grid.",
    originatingSystemName: "mfrmls",
    keyPrefix: "MFR",
  },
  {
    code: "maris",
    name: "MARIS MLS",
    shortName: "MARIS",
    territory: "St. Louis / St. Charles",
    providerRoute: "mls_grid",
    onboardingStatus: "planned",
    routeNote: "Add through MLS Grid. Uses the new MARIS originating system (maris2).",
    originatingSystemName: "maris2",
    keyPrefix: "MIS",
    compliance: { sourceFilterRequired: false },
    mapCenter: { lat: 38.627, lng: -90.199, zoom: 9 },
  },
  {
    code: "unlock",
    name: "Unlock MLS (ACTRIS)",
    shortName: "Unlock",
    territory: "Austin",
    providerRoute: "mls_grid",
    onboardingStatus: "planned",
    routeNote: "Add through MLS Grid. The API documentation uses ACTRIS.",
    originatingSystemName: "actris",
    keyPrefix: "ACT",
    compliance: {
      soldListings: "no_close_price",
      closedListingPhotos: "primary_only",
      sourceFilterRequired: false,
      notes: ["Unlock: closed listings may not show the sale price or any photo other than the primary photo."],
    },
  },
  {
    code: "spartanburg",
    name: "Spartanburg Association of REALTORS MLS",
    shortName: "Spartanburg",
    territory: "Spartanburg",
    providerRoute: "mls_grid",
    onboardingStatus: "planned",
    routeNote: "Add through MLS Grid.",
    originatingSystemName: "spartanburg",
    keyPrefix: "SPN",
  },
  {
    code: "mlsok",
    name: "MLSOK",
    shortName: "MLSOK",
    territory: "Potential Broken Bow coverage",
    providerRoute: "mls_grid",
    onboardingStatus: "conditional",
    routeNote: "Conditional: only pursue for Broken Bow after confirming the agent's actual MLS membership.",
    originatingSystemName: "mlsok",
    keyPrefix: "OKC",
  },
  {
    code: "realtracs",
    name: "Realtracs",
    shortName: "Realtracs",
    territory: "Smokies (GSMAR partner coverage), Middle Tennessee",
    providerRoute: "mls_grid",
    onboardingStatus: "conditional",
    routeNote:
      "Check Realtracs through MLS Grid before the old GSMAR/Spark route. Confirm the GSMAR listings and Savvy's rights are included before treating Smokies coverage as solved.",
    originatingSystemName: "realtrac",
    keyPrefix: "RTC",
    compliance: {
      mustReturnAllMatches: true,
      notes: ["Realtracs: every listing matching the search must be returned."],
    },
  },
  // ── 2. Trestle by Cotality ───────────────────────────────────────────────
  {
    code: "doorify",
    name: "Doorify MLS",
    shortName: "Doorify",
    territory: "Raleigh / Triangle",
    providerRoute: "trestle",
    onboardingStatus: "planned",
    routeNote: "Apply through Trestle.",
  },
  {
    code: "hive",
    name: "Hive MLS",
    shortName: "Hive",
    territory: "Wilmington, Oak Island, Brunswick County",
    providerRoute: "trestle",
    onboardingStatus: "planned",
    routeNote: "Apply through Trestle; select the correct Hive source and subscription for the agent.",
  },
  {
    code: "wumls",
    name: "Western Upstate MLS",
    shortName: "Western Upstate",
    territory: "Applicable Upstate South Carolina coverage",
    providerRoute: "trestle",
    onboardingStatus: "planned",
    routeNote: "Apply through Trestle. Does not resolve every Greenville-area MLS membership.",
  },
  {
    code: "cpar",
    name: "Central Panhandle Association of REALTORS MLS",
    shortName: "CPAR",
    territory: "Panama City Beach / Bay County",
    providerRoute: "trestle",
    onboardingStatus: "planned",
    routeNote: "Apply through Trestle. Keep separate from ECAR's Destin/30A feed.",
  },
  {
    code: "har",
    name: "Houston Realtors Information Service (HAR)",
    shortName: "HAR",
    territory: "Houston / Galveston",
    providerRoute: "trestle",
    onboardingStatus: "planned",
    routeNote: "Apply through Trestle.",
  },
  {
    code: "miami",
    name: "Miami Association of REALTORS MLS",
    shortName: "MIAMI",
    territory: "Miami / South Miami",
    providerRoute: "trestle",
    onboardingStatus: "planned",
    routeNote: "Apply through Trestle. Does not by itself give complete Florida Keys coverage.",
  },
  {
    code: "montana",
    name: "Montana Regional MLS",
    shortName: "Montana Regional",
    territory: "Whitefish",
    providerRoute: "trestle",
    onboardingStatus: "planned",
    routeNote: "Apply through Trestle.",
  },
  {
    code: "arkansasone",
    name: "ArkansasONE MLS",
    shortName: "ArkansasONE",
    territory: "Northwest Arkansas",
    providerRoute: "trestle",
    onboardingStatus: "conditional",
    routeNote: "Apply through Trestle after confirming the agent's MLS membership.",
  },
  {
    code: "bright",
    name: "Bright MLS",
    shortName: "Bright",
    territory: "Applicable Shenandoah / Virginia coverage",
    providerRoute: "trestle",
    onboardingStatus: "conditional",
    routeNote: "Conditional: only where the agent's actual subscription is Bright.",
  },
  // ── 3. Spark / FBS ───────────────────────────────────────────────────────
  {
    code: "pmar",
    name: "Pocono Mountains Association of REALTORS (PMAR)",
    shortName: "PMAR",
    territory: "Poconos",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote: "Spark/FBS (Flexmls). Confirm the available IDX and internal-use plans.",
  },
  {
    code: "moremls",
    name: "Monmouth Ocean Regional MLS (MOREMLS)",
    shortName: "MOREMLS",
    territory: "Jersey Shore",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote: "Spark/FBS (Flexmls). Confirm its vendor and data-plan application.",
  },
  {
    code: "ecar",
    name: "Emerald Coast Association of REALTORS (ECAR)",
    shortName: "ECAR",
    territory: "Destin / 30A / Emerald Coast",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote: "Spark/FBS. Confirm the specific approved feed with ECAR.",
  },
  {
    code: "spacecoast",
    name: "Space Coast MLS",
    shortName: "Space Coast",
    territory: "Cocoa Beach / Space Coast",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote: "Spark/FBS. Confirm the specific approved feed with Space Coast.",
  },
  {
    code: "realmls",
    name: "realMLS",
    shortName: "realMLS",
    territory: "Jacksonville / applicable Northeast Florida coverage",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote: "Confirmed Spark Datamart licensing route.",
  },
  {
    code: "michric",
    name: "Michigan Regional Information Center (MichRIC)",
    shortName: "MichRIC",
    territory: "Ann Arbor, where the authorized feed includes that data",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote: "Spark/RESO route documented. Confirm the Ann Arbor data entitlement in the approved feed.",
  },
  {
    code: "ccimls",
    name: "Cape Cod & Islands MLS (CCIMLS)",
    shortName: "CCIMLS",
    territory: "Cape Cod",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote: "CCIMLS publishes a Vendor Access: Spark API route.",
  },
  {
    code: "armls",
    name: "Arizona Regional MLS (ARMLS)",
    shortName: "ARMLS",
    territory: "Phoenix",
    providerRoute: "spark",
    onboardingStatus: "planned",
    routeNote:
      "Spark/RESO technology, but apply directly to ARMLS. It does not use Spark Datamart and issues keys directly to developers.",
  },
  // ── 4. Direct outreach or unresolved delivery ───────────────────────────
  {
    code: "obx",
    name: "Outer Banks Association of REALTORS MLS",
    shortName: "Outer Banks",
    territory: "Outer Banks",
    providerRoute: "unresolved",
    onboardingStatus: "unresolved",
    routeNote:
      "Apply directly. Published forms include third-party data access and Web API agreements. Delivery technology not confirmed.",
  },
  {
    code: "utah",
    name: "UtahRealEstate.com",
    shortName: "UtahRealEstate",
    territory: "Salt Lake City / applicable Utah coverage",
    providerRoute: "reso_web_api",
    onboardingStatus: "planned",
    routeNote: "Direct RESO Web API. Does not automatically resolve every listing needed for Park City.",
    websiteUrl: "https://vendor.utahrealestate.com",
  },
  {
    code: "baldwin",
    name: "Baldwin REALTORS MLS",
    shortName: "Baldwin",
    territory: "Gulf Shores / Orange Beach",
    providerRoute: "unresolved",
    onboardingStatus: "unresolved",
    routeNote: "Contact Baldwin for the license and current delivery endpoint. Baldwin is now live on Perchwell.",
  },
  {
    code: "ccormls",
    name: "Columbus & Central Ohio Regional MLS (CCORMLS)",
    shortName: "Columbus",
    territory: "Columbus / applicable Hocking Hills coverage",
    providerRoute: "unresolved",
    onboardingStatus: "unresolved",
    routeNote: "Contact its data-licensing team and confirm Spark/FBS delivery (Columbus uses Flexmls).",
  },
];

/** The seeded map center for a source code, or null when none is declared. */
export function sourceMapCenter(code: string): MlsMapCenter | null {
  return MLS_SOURCE_SEEDS.find(seed => seed.code === code)?.mapCenter ?? null;
}

export function seedCompliance(seed: MlsSourceSeed): ComplianceProfile {
  return buildComplianceProfile(seed.providerRoute, seed.compliance);
}

/**
 * Coverage questions that are not MLS sources yet. Kept in code so the admin
 * page can show them next to the source list without inventing MLS rows.
 */
export const UNRESOLVED_MARKETS: Array<{ territory: string; question: string }> = [
  { territory: "North Georgia", question: "Exact MLS subscription(s). FMLS and GAMLS were possibilities, not verified memberships." },
  { territory: "Daytona / Palm Coast / Flagler / St. Augustine", question: "Which local MLSs agents subscribe to, versus coverage through Stellar or realMLS." },
  { territory: "Florida Keys", question: "Whether required listings come through MIAMI or need a separate Keys MLS feed." },
  { territory: "Park City", question: "Whether UtahRealEstate is sufficient or a separate MLS feed is needed." },
  { territory: "Shenandoah", question: "Whether the agent uses Bright or another regional MLS." },
  { territory: "Broken Bow", question: "Whether MLSOK is the correct source." },
  { territory: "Greenville / wider Western NC", question: "Whether agents hold local MLS memberships beyond Western Upstate and Canopy." },
];
