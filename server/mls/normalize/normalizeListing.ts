import { getTableConfig } from "drizzle-orm/mysql-core";
import { mlsListings, type MlsFieldMapping, type MlsMappingTransform } from "../../../drizzle/mlsSchema";
import type { ExtractedMedia, FeedContext, MlsAdapter } from "../adapters/types";
import { normalizePropertyType, normalizeStatus, prettyEnum } from "./enums";
import {
  CONSUMED_SYSTEM_FIELDS,
  INSIGHT_FIELDS,
  LISTING_FIELD_RULES,
  MAPPING_VERSION,
  MEDIA_COLLECTIONS,
  OPEN_HOUSE_COLLECTIONS,
  ROOM_COLLECTIONS,
  UNIT_COLLECTIONS,
} from "./fieldMap";
import { isKnownResoField } from "./resoStandardFields";

/**
 * Provider record -> Savvy canonical listing.
 *
 * 1. Code-default RESO rules fill canonical columns and feature lists.
 * 2. Registry overrides (mls_field_mappings) for this source or provider are
 *    applied on top and win.
 * 3. Derived values fill gaps (bath totals, lot units, composed street).
 * 4. Every remaining non-empty field that is local to the MLS is kept in
 *    localFields. Unmapped standard fields stay in the raw payload.
 * 5. fieldProvenance records which source field produced each value.
 *
 * Pure function: no database access, fully unit-testable.
 */

export type NormalizedInsight = { value: unknown; sourceField: string; mappingId: number | null };

export type NormalizedListing = {
  providerListingKey: string;
  listingKey: string;
  listingNumber: string;
  columns: Record<string, unknown>;
  features: Record<string, string[]>;
  rooms: Record<string, unknown>[] | null;
  units: Record<string, unknown>[] | null;
  localFields: Record<string, unknown>;
  provenance: Record<string, string>;
  insights: Record<string, NormalizedInsight>;
  media: ExtractedMedia[];
  permittedUses: string[] | null;
  viewable: boolean;
  modifiedAt: Date | null;
};

export type NormalizeOptions = {
  overrides?: MlsFieldMapping[];
  metadataLocalFields?: Set<string> | null;
};

type ColumnSpec = { kind: "varchar"; length: number } | { kind: "decimal"; max: number } | { kind: "int" } | { kind: "other" };

const COLUMN_SPECS: Record<string, ColumnSpec> = (() => {
  const specs: Record<string, ColumnSpec> = {};
  for (const column of getTableConfig(mlsListings).columns) {
    const anyColumn = column as any;
    const type = String(anyColumn.getSQLType?.() ?? "");
    if (type.startsWith("varchar")) specs[column.name] = { kind: "varchar", length: Number(anyColumn.length ?? 255) };
    else if (type.startsWith("decimal")) {
      const precision = Number(anyColumn.precision ?? 14);
      const scale = Number(anyColumn.scale ?? 2);
      specs[column.name] = { kind: "decimal", max: 10 ** (precision - scale) - 1 };
    } else if (type === "int") specs[column.name] = { kind: "int" };
    else specs[column.name] = { kind: "other" };
  }
  return specs;
})();

function isEmpty(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

function toNumber(value: unknown): number | null {
  if (isEmpty(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean | null {
  if (isEmpty(value)) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["y", "yes", "true", "1", "t"].includes(text)) return true;
  if (["n", "no", "false", "0", "f"].includes(text)) return false;
  return null;
}

function toList(value: unknown): string[] | null {
  if (isEmpty(value)) return null;
  const items = Array.isArray(value) ? value : String(value).split(",");
  const list = items
    .map(item => prettyEnum(typeof item === "object" ? JSON.stringify(item) : item))
    .filter((item): item is string => !!item && item.trim() !== "")
    .map(item => item.trim());
  return list.length ? Array.from(new Set(list)) : null;
}

export function applyTransform(
  value: unknown,
  transform: MlsMappingTransform,
  valueMap?: Record<string, string> | null
): unknown {
  if (isEmpty(value)) return null;
  switch (transform) {
    case "direct":
      return value;
    case "string":
      return Array.isArray(value) ? value.map(String).join(", ") : String(value).trim();
    case "number":
      return toNumber(value);
    case "integer": {
      const number = toNumber(value);
      return number === null ? null : Math.round(number);
    }
    case "boolean":
      return toBoolean(value);
    case "date": {
      const text = String(value).trim();
      const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
      const date = new Date(text);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    }
    case "datetime": {
      const date = new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    case "list":
      return toList(value);
    case "enum_map": {
      if (!valueMap) return value;
      const key = String(value).trim().toLowerCase();
      const hit = Object.entries(valueMap).find(([from]) => from.trim().toLowerCase() === key);
      return hit ? hit[1] : value;
    }
  }
}

/** Fit a value to its column so one odd record never fails a whole page. */
function fitColumn(column: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const spec = COLUMN_SPECS[column];
  if (!spec) return value;
  if (spec.kind === "varchar") return String(value).slice(0, spec.length);
  if (spec.kind === "decimal") {
    const number = toNumber(value);
    if (number === null || Math.abs(number) > spec.max) return null;
    return number;
  }
  if (spec.kind === "int") {
    const number = toNumber(value);
    if (number === null || Math.abs(number) > 2_147_483_647) return null;
    return Math.round(number);
  }
  return value;
}

function cleanCollection(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map(item => {
    const clean: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(item ?? {})) {
      if (key.startsWith("@odata") || isEmpty(entry)) continue;
      clean[key] = entry;
    }
    return clean;
  });
}

function firstCollection(record: Record<string, any>, names: string[]) {
  for (const name of names) if (Array.isArray(record[name])) return { name, value: record[name] };
  return null;
}

/** Most specific mapping first: source, then provider, then global. */
export function sortOverrides(overrides: MlsFieldMapping[]) {
  const rank = (mapping: MlsFieldMapping) => (mapping.sourceId ? 0 : mapping.provider ? 1 : 2);
  return [...overrides].filter(mapping => mapping.isActive).sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

export function normalizeListing(
  ctx: FeedContext,
  adapter: MlsAdapter,
  record: Record<string, any>,
  options: NormalizeOptions = {}
): NormalizedListing {
  const consumed = new Set<string>(CONSUMED_SYSTEM_FIELDS);
  const columns: Record<string, unknown> = {};
  const features: Record<string, string[]> = {};
  const provenance: Record<string, string> = {};
  const localFields: Record<string, unknown> = {};
  const insights: Record<string, NormalizedInsight> = {};

  const assign = (target: string, value: unknown, sourceField: string, mappingId: number | null) => {
    const tag = mappingId ? `${sourceField}#m${mappingId}` : sourceField;
    if (target === "ignore") return;
    if (target.startsWith("listing.")) {
      const column = target.slice(8);
      const fitted = fitColumn(column, value);
      if (fitted === null) return;
      columns[column] = fitted;
      provenance[column] = tag;
    } else if (target.startsWith("feature.")) {
      const list = Array.isArray(value) ? value.map(String) : toList(value);
      if (!list || list.length === 0) return;
      features[target.slice(8)] = list;
      provenance[target] = tag;
    } else if (target.startsWith("local.")) {
      localFields[target.slice(6)] = value;
    } else if (target.startsWith("insight.")) {
      const field = target.slice(8);
      if ((INSIGHT_FIELDS as readonly string[]).includes(field)) {
        insights[field] = { value, sourceField, mappingId };
      }
    }
  };

  // 1. Code defaults.
  for (const rule of LISTING_FIELD_RULES) {
    for (const source of rule.sources) consumed.add(source);
    const source = rule.sources.find(name => !isEmpty(record[name]));
    if (!source) continue;
    let value: unknown;
    if (rule.target === "listing.standardStatus") value = normalizeStatus(record[source]);
    else if (rule.target === "listing.propertyType") value = normalizePropertyType(record[source]);
    else value = applyTransform(record[source], rule.transform);
    if (
      typeof value === "string" &&
      ["listing.mlsStatus", "listing.propertySubType", "listing.associationFeeFrequency", "listing.livingAreaUnits", "listing.furnished"].includes(rule.target)
    ) {
      value = prettyEnum(value);
    }
    assign(rule.target, value, source, null);
  }

  // 2. Registry overrides win over defaults.
  for (const mapping of sortOverrides(options.overrides ?? [])) {
    if (!(mapping.sourceField in record)) continue;
    consumed.add(mapping.sourceField);
    const raw = record[mapping.sourceField];
    let value: unknown;
    if (mapping.target === "listing.standardStatus" && mapping.transform === "enum_map") {
      value = normalizeStatus(applyTransform(raw, "enum_map", mapping.valueMap));
    } else if (mapping.target === "listing.propertyType" && mapping.transform === "enum_map") {
      value = normalizePropertyType(applyTransform(raw, "enum_map", mapping.valueMap));
    } else {
      value = applyTransform(raw, mapping.transform, mapping.valueMap);
    }
    if (value === null) continue;
    assign(mapping.target, value, mapping.sourceField, mapping.id);
  }

  // 3. Keys and derived values.
  const keyField = adapter.keyField("Property");
  const providerListingKey = String(record[keyField] ?? record.ListingKey ?? "").trim();
  if (!providerListingKey) throw new Error("Property record has no ListingKey");
  const listingKey = adapter.stripKey(ctx, providerListingKey);
  const rawNumber = String(record.ListingId ?? "").trim();
  const listingNumber = (rawNumber ? adapter.stripKey(ctx, rawNumber) : listingKey).slice(0, 64);
  columns.listingKey = listingKey.slice(0, 128);
  columns.listingNumber = listingNumber;
  if (columns.listAgentMlsId) columns.listAgentMlsId = adapter.stripKey(ctx, String(columns.listAgentMlsId));
  if (columns.listOfficeMlsId) columns.listOfficeMlsId = adapter.stripKey(ctx, String(columns.listOfficeMlsId));
  if (!columns.standardStatus) columns.standardStatus = "unknown";

  const streetParts = [record.StreetDirPrefix, record.StreetName, record.StreetSuffix, record.StreetDirSuffix]
    .map(part => (isEmpty(part) ? "" : String(part).trim()))
    .filter(Boolean);
  if (streetParts.length > 1 && !provenance.streetName?.includes("#m")) {
    columns.streetName = fitColumn("streetName", streetParts.join(" "));
  }
  if (!columns.unparsedAddress && (columns.streetNumber || columns.streetName)) {
    const unit = columns.unitNumber ? ` Unit ${columns.unitNumber}` : "";
    columns.unparsedAddress = fitColumn(
      "unparsedAddress",
      `${columns.streetNumber ?? ""} ${columns.streetName ?? ""}${unit}`.trim()
    );
    provenance.unparsedAddress = "derived:StreetNumber+StreetName+UnitNumber";
  }
  if (typeof columns.stateOrProvince === "string") columns.stateOrProvince = columns.stateOrProvince.toUpperCase();

  if (columns.bathroomsTotal === undefined) {
    const full = toNumber(record.BathroomsFull) ?? 0;
    const half = toNumber(record.BathroomsHalf) ?? 0;
    const threeQuarter = toNumber(record.BathroomsThreeQuarter) ?? 0;
    const quarter = toNumber(record.BathroomsOneQuarter) ?? 0;
    if (full || half || threeQuarter || quarter) {
      columns.bathroomsTotal = full + threeQuarter * 0.75 + half * 0.5 + quarter * 0.25;
      provenance.bathroomsTotal = "derived:BathroomsFull+ThreeQuarter+Half+OneQuarter";
    } else if (columns.bathroomsTotalInteger !== undefined) {
      columns.bathroomsTotal = columns.bathroomsTotalInteger;
      provenance.bathroomsTotal = "derived:BathroomsTotalInteger";
    }
  }

  const lotArea = toNumber(record.LotSizeArea);
  const lotUnits = String(record.LotSizeUnits ?? "").toLowerCase();
  if (columns.lotSizeAcres === undefined) {
    if (columns.lotSizeSquareFeet !== undefined) {
      columns.lotSizeAcres = fitColumn("lotSizeAcres", Number(columns.lotSizeSquareFeet) / 43560);
      provenance.lotSizeAcres = "derived:LotSizeSquareFeet";
    } else if (lotArea !== null && lotUnits.includes("acre")) {
      columns.lotSizeAcres = fitColumn("lotSizeAcres", lotArea);
      provenance.lotSizeAcres = "derived:LotSizeArea";
    }
  }
  if (columns.lotSizeSquareFeet === undefined) {
    if (columns.lotSizeAcres !== undefined && columns.lotSizeAcres !== null) {
      columns.lotSizeSquareFeet = fitColumn("lotSizeSquareFeet", Number(columns.lotSizeAcres) * 43560);
      provenance.lotSizeSquareFeet = "derived:LotSizeAcres";
    } else if (lotArea !== null && lotUnits.includes("square")) {
      columns.lotSizeSquareFeet = fitColumn("lotSizeSquareFeet", lotArea);
      provenance.lotSizeSquareFeet = "derived:LotSizeArea";
    }
  }

  const lat = toNumber(columns.latitude);
  const lng = toNumber(columns.longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    delete columns.latitude;
    delete columns.longitude;
    delete provenance.latitude;
    delete provenance.longitude;
  }

  // Collections.
  const rooms = firstCollection(record, ROOM_COLLECTIONS);
  const units = firstCollection(record, UNIT_COLLECTIONS);
  for (const name of [...ROOM_COLLECTIONS, ...UNIT_COLLECTIONS, ...MEDIA_COLLECTIONS, ...OPEN_HOUSE_COLLECTIONS]) {
    consumed.add(name);
  }
  const media = adapter.extractMedia(record);
  if (columns.photosCount === undefined && media.length) columns.photosCount = media.length;

  // 4. Local fields.
  for (const [name, value] of Object.entries(record)) {
    if (consumed.has(name) || name.startsWith("@odata") || isEmpty(value)) continue;
    const adapterSays = adapter.isLocalField(ctx, name);
    const isLocal =
      adapterSays ?? (options.metadataLocalFields ? options.metadataLocalFields.has(name) : !isKnownResoField(name));
    if (isLocal) localFields[name] = value;
  }

  return {
    providerListingKey,
    listingKey,
    listingNumber,
    columns,
    features,
    rooms: rooms ? cleanCollection(rooms.value) : null,
    units: units ? cleanCollection(units.value) : null,
    localFields,
    provenance,
    insights,
    media,
    permittedUses: adapter.permittedUses(record),
    viewable: adapter.isViewable(record),
    modifiedAt: (columns.sourceModifiedAt as Date | undefined) ?? null,
  };
}

export { MAPPING_VERSION };

/** Member, Office and OpenHouse are small; they map straight to columns. */
export function normalizeMember(ctx: FeedContext, adapter: MlsAdapter, record: Record<string, any>) {
  const key = String(record.MemberKey ?? "").trim();
  if (!key) throw new Error("Member record has no MemberKey");
  const localFields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(record)) {
    if (!isEmpty(value) && adapter.isLocalField(ctx, name)) localFields[name] = value;
  }
  const str = (value: unknown, length: number) => (isEmpty(value) ? null : String(value).trim().slice(0, length));
  return {
    memberKey: key.slice(0, 160),
    memberMlsId: record.MemberMlsId ? adapter.stripKey(ctx, String(record.MemberMlsId)).slice(0, 64) : null,
    fullName: str(record.MemberFullName ?? [record.MemberFirstName, record.MemberLastName].filter(Boolean).join(" "), 191),
    email: str(record.MemberEmail, 191),
    phone: str(record.MemberDirectPhone ?? record.MemberPreferredPhone ?? record.MemberMobilePhone ?? record.MemberOfficePhone, 64),
    officeKey: str(record.OfficeKey, 160),
    officeMlsId: record.OfficeMlsId ? adapter.stripKey(ctx, String(record.OfficeMlsId)).slice(0, 64) : null,
    officeName: str(record.OfficeName, 191),
    memberStatus: str(prettyEnum(record.MemberStatus), 32),
    stateLicense: str(record.MemberStateLicense, 64),
    localFields: Object.keys(localFields).length ? localFields : null,
    sourceModifiedAt: applyTransform(record.ModificationTimestamp, "datetime") as Date | null,
    viewable: adapter.isViewable(record),
  };
}

export function normalizeOffice(ctx: FeedContext, adapter: MlsAdapter, record: Record<string, any>) {
  const key = String(record.OfficeKey ?? "").trim();
  if (!key) throw new Error("Office record has no OfficeKey");
  const localFields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(record)) {
    if (!isEmpty(value) && adapter.isLocalField(ctx, name)) localFields[name] = value;
  }
  const str = (value: unknown, length: number) => (isEmpty(value) ? null : String(value).trim().slice(0, length));
  return {
    officeKey: key.slice(0, 160),
    officeMlsId: record.OfficeMlsId ? adapter.stripKey(ctx, String(record.OfficeMlsId)).slice(0, 64) : null,
    officeName: str(record.OfficeName, 191),
    phone: str(record.OfficePhone, 64),
    email: str(record.OfficeEmail, 191),
    city: str(record.OfficeCity, 128),
    stateOrProvince: str(record.OfficeStateOrProvince, 32),
    officeStatus: str(prettyEnum(record.OfficeStatus), 32),
    localFields: Object.keys(localFields).length ? localFields : null,
    sourceModifiedAt: applyTransform(record.ModificationTimestamp, "datetime") as Date | null,
    viewable: adapter.isViewable(record),
  };
}

export function normalizeOpenHouse(_ctx: FeedContext, adapter: MlsAdapter, record: Record<string, any>) {
  const key = String(record.OpenHouseKey ?? record.OpenHouseId ?? "").trim();
  if (!key) throw new Error("OpenHouse record has no OpenHouseKey");
  const str = (value: unknown, length: number) => (isEmpty(value) ? null : String(value).trim().slice(0, length));
  return {
    openHouseKey: key.slice(0, 160),
    providerListingKey: str(record.ListingKey, 160),
    startAt: applyTransform(record.OpenHouseStartTime, "datetime") as Date | null,
    endAt: applyTransform(record.OpenHouseEndTime, "datetime") as Date | null,
    openHouseDate: applyTransform(record.OpenHouseDate, "date") as string | null,
    openHouseType: str(prettyEnum(record.OpenHouseType), 48),
    openHouseStatus: str(prettyEnum(record.OpenHouseStatus), 32),
    remarks: str(record.OpenHouseRemarks, 5000),
    sourceModifiedAt: applyTransform(record.ModificationTimestamp, "datetime") as Date | null,
    viewable: adapter.isViewable(record),
  };
}
