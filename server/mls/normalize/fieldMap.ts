import type { MlsMappingTransform } from "../../../drizzle/mlsSchema";

/**
 * Code-default mapping registry: RESO Data Dictionary field -> Savvy canonical
 * field. These cover every RESO-certified feed. Source-specific differences
 * are added as rows in mls_field_mappings (see overrides in normalizeListing),
 * never by editing application code for one MLS.
 *
 * Targets:
 *   listing.<column>   a column on mls_listings
 *   feature.<name>     a multi-value list stored in mls_listings.features
 *   local.<name>       a named local field in mls_listings.localFields
 *   insight.<field>    a Savvy STR field on mls_property_insights
 *   ignore             consume the field and store it nowhere but raw
 *
 * `sources` lists RESO names in priority order; the first non-empty wins.
 */
export type FieldRule = {
  target: string;
  sources: string[];
  transform: MlsMappingTransform;
  label: string;
  group: FieldGroup;
};

export type FieldGroup =
  | "identity"
  | "status"
  | "price"
  | "dates"
  | "structure"
  | "lot"
  | "location"
  | "hoa_tax"
  | "remarks"
  | "agents"
  | "media"
  | "display_rules"
  | "features"
  | "system";

export const MAPPING_VERSION = 1;

const L = (
  column: string,
  sources: string[],
  transform: MlsMappingTransform,
  label: string,
  group: FieldGroup
): FieldRule => ({ target: `listing.${column}`, sources, transform, label, group });

const F = (name: string, source: string, label: string): FieldRule => ({
  target: `feature.${name}`,
  sources: [source],
  transform: "list",
  label,
  group: "features",
});

export const LISTING_FIELD_RULES: FieldRule[] = [
  // Identity. ListingKey/ListingId prefixes are stripped by the adapter.
  L("listingNumber", ["ListingId"], "string", "MLS number", "identity"),
  L("listingKey", ["ListingKey"], "string", "Listing key", "identity"),
  L("parcelNumber", ["ParcelNumber"], "string", "Parcel number", "identity"),
  // Status
  L("standardStatus", ["StandardStatus"], "enum_map", "Status", "status"),
  L("mlsStatus", ["MlsStatus"], "string", "MLS status", "status"),
  L("propertyType", ["PropertyType"], "enum_map", "Property type", "status"),
  L("propertySubType", ["PropertySubType"], "string", "Property subtype", "status"),
  // Price
  L("listPrice", ["ListPrice"], "number", "List price", "price"),
  L("originalListPrice", ["OriginalListPrice"], "number", "Original list price", "price"),
  L("previousListPrice", ["PreviousListPrice"], "number", "Previous list price", "price"),
  L("closePrice", ["ClosePrice"], "number", "Close price", "price"),
  // Dates
  L("listingContractDate", ["ListingContractDate"], "date", "Listing contract date", "dates"),
  L("onMarketDate", ["OnMarketDate"], "date", "On market date", "dates"),
  L("purchaseContractDate", ["PurchaseContractDate"], "date", "Purchase contract date", "dates"),
  L("offMarketDate", ["OffMarketDate"], "date", "Off market date", "dates"),
  L("closeDate", ["CloseDate"], "date", "Close date", "dates"),
  L("statusChangeAt", ["StatusChangeTimestamp"], "datetime", "Status changed", "dates"),
  L("priceChangeAt", ["PriceChangeTimestamp"], "datetime", "Price changed", "dates"),
  L("originalEntryAt", ["OriginalEntryTimestamp"], "datetime", "Original entry", "dates"),
  L("daysOnMarket", ["DaysOnMarket"], "integer", "Days on market", "dates"),
  L("cumulativeDaysOnMarket", ["CumulativeDaysOnMarket"], "integer", "Cumulative days on market", "dates"),
  // Structure
  L("bedroomsTotal", ["BedroomsTotal"], "integer", "Bedrooms", "structure"),
  L("bathroomsTotalInteger", ["BathroomsTotalInteger"], "integer", "Bathrooms (integer)", "structure"),
  L("bathroomsFull", ["BathroomsFull"], "integer", "Full baths", "structure"),
  L("bathroomsHalf", ["BathroomsHalf"], "integer", "Half baths", "structure"),
  L("bathroomsTotal", ["BathroomsTotalDecimal", "BathroomsTotal"], "number", "Bathrooms", "structure"),
  L("livingArea", ["LivingArea"], "number", "Living area", "structure"),
  L("livingAreaUnits", ["LivingAreaUnits"], "string", "Living area units", "structure"),
  L("aboveGradeFinishedArea", ["AboveGradeFinishedArea"], "number", "Above grade finished area", "structure"),
  L("belowGradeFinishedArea", ["BelowGradeFinishedArea"], "number", "Below grade finished area", "structure"),
  L("buildingAreaTotal", ["BuildingAreaTotal"], "number", "Building area total", "structure"),
  L("yearBuilt", ["YearBuilt"], "integer", "Year built", "structure"),
  L("storiesTotal", ["StoriesTotal", "Stories"], "integer", "Stories", "structure"),
  L("garageSpaces", ["GarageSpaces"], "number", "Garage spaces", "structure"),
  L("parkingTotal", ["ParkingTotal"], "number", "Parking total", "structure"),
  L("poolPrivateYN", ["PoolPrivateYN"], "boolean", "Private pool", "structure"),
  L("fireplaceYN", ["FireplaceYN"], "boolean", "Fireplace", "structure"),
  L("newConstructionYN", ["NewConstructionYN"], "boolean", "New construction", "structure"),
  L("furnished", ["Furnished"], "string", "Furnished", "structure"),
  // Lot
  L("lotSizeAcres", ["LotSizeAcres"], "number", "Lot size (acres)", "lot"),
  L("lotSizeSquareFeet", ["LotSizeSquareFeet"], "number", "Lot size (sq ft)", "lot"),
  L("waterfrontYN", ["WaterfrontYN"], "boolean", "Waterfront", "lot"),
  L("viewYN", ["ViewYN"], "boolean", "View", "lot"),
  L("zoning", ["Zoning"], "string", "Zoning", "lot"),
  // Location
  L("unparsedAddress", ["UnparsedAddress"], "string", "Address", "location"),
  L("streetNumber", ["StreetNumber"], "string", "Street number", "location"),
  L("streetName", ["StreetName"], "string", "Street name", "location"),
  L("unitNumber", ["UnitNumber"], "string", "Unit", "location"),
  L("city", ["City"], "string", "City", "location"),
  L("stateOrProvince", ["StateOrProvince"], "string", "State", "location"),
  L("postalCode", ["PostalCode"], "string", "Postal code", "location"),
  L("countyOrParish", ["CountyOrParish"], "string", "County", "location"),
  L("latitude", ["Latitude"], "number", "Latitude", "location"),
  L("longitude", ["Longitude"], "number", "Longitude", "location"),
  L("subdivisionName", ["SubdivisionName"], "string", "Subdivision", "location"),
  L("mlsAreaMajor", ["MLSAreaMajor"], "string", "MLS area", "location"),
  L("elementarySchool", ["ElementarySchool"], "string", "Elementary school", "location"),
  L("middleSchool", ["MiddleOrJuniorSchool"], "string", "Middle school", "location"),
  L("highSchool", ["HighSchool"], "string", "High school", "location"),
  // HOA and tax
  L("associationYN", ["AssociationYN"], "boolean", "HOA", "hoa_tax"),
  L("associationName", ["AssociationName"], "string", "HOA name", "hoa_tax"),
  L("associationFee", ["AssociationFee"], "number", "HOA fee", "hoa_tax"),
  L("associationFeeFrequency", ["AssociationFeeFrequency"], "string", "HOA fee frequency", "hoa_tax"),
  L("taxAnnualAmount", ["TaxAnnualAmount"], "number", "Annual tax", "hoa_tax"),
  L("taxYear", ["TaxYear"], "integer", "Tax year", "hoa_tax"),
  L("taxAssessedValue", ["TaxAssessedValue"], "number", "Assessed value", "hoa_tax"),
  // Remarks
  L("publicRemarks", ["PublicRemarks"], "string", "Public remarks", "remarks"),
  L("directions", ["Directions"], "string", "Directions", "remarks"),
  L("virtualTourUrl", ["VirtualTourURLUnbranded", "VirtualTourURLBranded"], "string", "Virtual tour", "media"),
  // Agents and offices
  L("listAgentKey", ["ListAgentKey"], "string", "List agent key", "agents"),
  L("listAgentMlsId", ["ListAgentMlsId"], "string", "List agent MLS ID", "agents"),
  L("listAgentFullName", ["ListAgentFullName"], "string", "List agent", "agents"),
  L(
    "listAgentPhone",
    ["ListAgentDirectPhone", "ListAgentPreferredPhone", "ListAgentCellPhone", "ListAgentOfficePhone"],
    "string",
    "List agent phone",
    "agents"
  ),
  L("listAgentEmail", ["ListAgentEmail"], "string", "List agent email", "agents"),
  L("listOfficeKey", ["ListOfficeKey"], "string", "List office key", "agents"),
  L("listOfficeMlsId", ["ListOfficeMlsId"], "string", "List office MLS ID", "agents"),
  L("listOfficeName", ["ListOfficeName"], "string", "Listing brokerage", "agents"),
  L("listOfficePhone", ["ListOfficePhone"], "string", "Listing brokerage phone", "agents"),
  L("coListAgentFullName", ["CoListAgentFullName"], "string", "Co-list agent", "agents"),
  L("coListOfficeName", ["CoListOfficeName"], "string", "Co-list office", "agents"),
  L("buyerAgentKey", ["BuyerAgentKey"], "string", "Buyer agent key", "agents"),
  L("buyerAgentFullName", ["BuyerAgentFullName"], "string", "Buyer agent", "agents"),
  L("buyerOfficeKey", ["BuyerOfficeKey"], "string", "Buyer office key", "agents"),
  L("buyerOfficeName", ["BuyerOfficeName"], "string", "Buyer brokerage", "agents"),
  // Media summary
  L("photosCount", ["PhotosCount"], "integer", "Photo count", "media"),
  L("photosChangeAt", ["PhotosChangeTimestamp"], "datetime", "Photos changed", "media"),
  // Seller display choices
  L("internetEntireListingDisplayYN", ["InternetEntireListingDisplayYN"], "boolean", "Display listing on internet", "display_rules"),
  L("internetAddressDisplayYN", ["InternetAddressDisplayYN"], "boolean", "Display address", "display_rules"),
  L("internetAvmDisplayYN", ["InternetAutomatedValuationDisplayYN"], "boolean", "Allow AVM", "display_rules"),
  L("internetConsumerCommentYN", ["InternetConsumerCommentYN"], "boolean", "Allow comments", "display_rules"),
  L("idxParticipationYN", ["IDXParticipationYN"], "boolean", "IDX participation", "display_rules"),
  // System
  L("sourceModifiedAt", ["ModificationTimestamp"], "datetime", "Modified (source)", "system"),
  L(
    "originatingModifiedAt",
    ["OriginatingSystemModificationTimestamp", "SourceSystemModificationTimestamp"],
    "datetime",
    "Modified (originating MLS)",
    "system"
  ),
  // Features (multi-value lookups)
  F("appliances", "Appliances", "Appliances"),
  F("interiorFeatures", "InteriorFeatures", "Interior features"),
  F("exteriorFeatures", "ExteriorFeatures", "Exterior features"),
  F("heating", "Heating", "Heating"),
  F("cooling", "Cooling", "Cooling"),
  F("flooring", "Flooring", "Flooring"),
  F("basement", "Basement", "Basement"),
  F("levels", "Levels", "Levels"),
  F("windowFeatures", "WindowFeatures", "Window features"),
  F("fireplaceFeatures", "FireplaceFeatures", "Fireplace features"),
  F("laundryFeatures", "LaundryFeatures", "Laundry"),
  F("accessibilityFeatures", "AccessibilityFeatures", "Accessibility"),
  F("securityFeatures", "SecurityFeatures", "Security"),
  F("parkingFeatures", "ParkingFeatures", "Parking"),
  F("poolFeatures", "PoolFeatures", "Pool"),
  F("spaFeatures", "SpaFeatures", "Spa"),
  F("view", "View", "View"),
  F("waterfrontFeatures", "WaterfrontFeatures", "Waterfront"),
  F("lotFeatures", "LotFeatures", "Lot features"),
  F("patioAndPorchFeatures", "PatioAndPorchFeatures", "Patio and porch"),
  F("fencing", "Fencing", "Fencing"),
  F("otherStructures", "OtherStructures", "Other structures"),
  F("communityFeatures", "CommunityFeatures", "Community"),
  F("associationAmenities", "AssociationAmenities", "HOA amenities"),
  F("associationFeeIncludes", "AssociationFeeIncludes", "HOA fee includes"),
  F("utilities", "Utilities", "Utilities"),
  F("electric", "Electric", "Electric"),
  F("sewer", "Sewer", "Sewer"),
  F("waterSource", "WaterSource", "Water source"),
  F("constructionMaterials", "ConstructionMaterials", "Construction"),
  F("roof", "Roof", "Roof"),
  F("foundationDetails", "FoundationDetails", "Foundation"),
  F("architecturalStyle", "ArchitecturalStyle", "Style"),
  F("greenEnergyEfficient", "GreenEnergyEfficient", "Green energy"),
  F("specialListingConditions", "SpecialListingConditions", "Special conditions"),
  F("listingTerms", "ListingTerms", "Listing terms"),
  F("currentUse", "CurrentUse", "Current use"),
  F("possibleUse", "PossibleUse", "Possible use"),
  F("horseAmenities", "HorseAmenities", "Horse amenities"),
  F("roadSurfaceType", "RoadSurfaceType", "Road surface"),
];

/** Collections expanded into listing JSON columns, by the names providers use. */
export const ROOM_COLLECTIONS = ["Rooms", "Room", "PropertyRooms"];
export const UNIT_COLLECTIONS = ["UnitTypes", "Units", "Unit", "PropertyUnitTypes"];
export const MEDIA_COLLECTIONS = ["Media", "Photos"];
export const OPEN_HOUSE_COLLECTIONS = ["OpenHouse", "OpenHouses"];

/** Consumed by the normalizer or adapters without a canonical column. */
export const CONSUMED_SYSTEM_FIELDS = new Set([
  "StreetDirPrefix",
  "StreetSuffix",
  "StreetDirSuffix",
  "StreetSuffixModifier",
  "LotSizeArea",
  "LotSizeUnits",
  "BathroomsThreeQuarter",
  "BathroomsOneQuarter",
  "BathroomsPartial",
  "OriginatingSystemName",
  "OriginatingSystemKey",
  "OriginatingSystemID",
  "SourceSystemName",
  "SourceSystemKey",
  "SourceSystemID",
  "ListingKeyNumeric",
  "ListAgentKeyNumeric",
  "ListOfficeKeyNumeric",
  "BuyerAgentKeyNumeric",
  "BuyerOfficeKeyNumeric",
  "MlgCanView",
  "MlgCanUse",
  "PhotosCount",
  "Country",
  "@odata.id",
  "@odata.etag",
  "@odata.editLink",
  "@odata.context",
]);

export const TARGET_PREFIXES = ["listing.", "feature.", "local.", "insight."] as const;

export const INSIGHT_FIELDS = [
  "strAllowed",
  "strRestrictionStatus",
  "permitRequired",
  "permitType",
  "hoaStrRestriction",
  "minimumRentalDays",
  "occupancyLimit",
  "rentalIncomeClaimed",
] as const;
export type InsightField = (typeof INSIGHT_FIELDS)[number];

export function listingRuleColumns(): Set<string> {
  return new Set(
    LISTING_FIELD_RULES.filter(rule => rule.target.startsWith("listing.")).map(rule => rule.target.slice(8))
  );
}
