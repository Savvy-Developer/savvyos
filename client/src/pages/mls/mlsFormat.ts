import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";

type Outputs = inferRouterOutputs<AppRouter>["mlsProperties"];
export type MlsSearchResult = Outputs["search"];
export type MlsListingCard = MlsSearchResult["items"][number];
export type MlsListingDetail = Outputs["listing"];
export type MlsMapResult = Outputs["mapPoints"];
export type MlsSourcesResult = Outputs["sources"];
export type MlsFeedView = MlsSourcesResult["sources"][number]["feeds"][number];

export const STATUS_STYLES: Record<string, { label: string; className: string; pin: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800 border-emerald-200", pin: "#047857" },
  active_under_contract: { label: "Under Contract", className: "bg-amber-100 text-amber-800 border-amber-200", pin: "#b45309" },
  coming_soon: { label: "Coming Soon", className: "bg-sky-100 text-sky-800 border-sky-200", pin: "#0369a1" },
  pending: { label: "Pending", className: "bg-orange-100 text-orange-800 border-orange-200", pin: "#c2410c" },
  closed: { label: "Closed", className: "bg-slate-200 text-slate-800 border-slate-300", pin: "#334155" },
  withdrawn: { label: "Withdrawn", className: "bg-zinc-100 text-zinc-700 border-zinc-200", pin: "#71717a" },
  expired: { label: "Expired", className: "bg-zinc-100 text-zinc-700 border-zinc-200", pin: "#71717a" },
  canceled: { label: "Canceled", className: "bg-zinc-100 text-zinc-700 border-zinc-200", pin: "#71717a" },
  hold: { label: "Hold", className: "bg-zinc-100 text-zinc-700 border-zinc-200", pin: "#71717a" },
  delete: { label: "Deleted", className: "bg-red-100 text-red-800 border-red-200", pin: "#b91c1c" },
  incomplete: { label: "Incomplete", className: "bg-zinc-100 text-zinc-700 border-zinc-200", pin: "#71717a" },
  unknown: { label: "Unknown", className: "bg-zinc-100 text-zinc-700 border-zinc-200", pin: "#71717a" },
};

export function statusStyle(status: string | null | undefined) {
  return STATUS_STYLES[status ?? "unknown"] ?? STATUS_STYLES.unknown;
}

export function formatPrice(value: number | null | undefined, compact = false) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  if (compact) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2).replace(/\.?0+$/, "")}M`;
    if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
    return `$${Math.round(value)}`;
  }
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "N/A";
  const date = typeof value === "string" ? new Date(value.length === 10 ? `${value}T12:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(value: string | Date | null | undefined) {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

export function addressLine(listing: { unparsedAddress?: string | null; unitNumber?: string | null }) {
  const street = listing.unparsedAddress?.trim() || "Address not available";
  if (listing.unitNumber && !street.includes(listing.unitNumber)) return `${street} #${listing.unitNumber}`;
  return street;
}

export function cityLine(listing: { city?: string | null; stateOrProvince?: string | null; postalCode?: string | null }) {
  return [listing.city, [listing.stateOrProvince, listing.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function displayPrice(listing: { standardStatus: string; listPrice: number | null; closePrice: number | null }) {
  if (listing.standardStatus === "closed" && listing.closePrice) return listing.closePrice;
  return listing.listPrice;
}

export const FRESHNESS_STYLES: Record<string, { label: string; className: string }> = {
  fresh: { label: "Fresh", className: "bg-emerald-100 text-emerald-800" },
  due: { label: "Refresh due", className: "bg-amber-100 text-amber-800" },
  stale: { label: "Stale", className: "bg-red-100 text-red-800" },
  never: { label: "Never synced", className: "bg-zinc-100 text-zinc-700" },
};

export function prettyKey(key: string) {
  return key
    .replace(/YN$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, char => char.toUpperCase());
}
