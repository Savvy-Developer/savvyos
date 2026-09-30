/**
 * Website Studio > Listings: which website listings a filter or search keeps.
 * Pure, so the client list and its tests share it.
 */
import { missingForPublish } from "./websitePublishChecklist";

export type ListingFilter = "all" | "published" | "draft" | "ready" | "needs" | "archived" | "old-site";

export const LISTING_PAGE_SIZE = 50;

export type ListingRow = {
  id: number;
  propertyId: number;
  slug: string;
  status: "draft" | "published" | "archived";
  sourceUrl?: string | null;
  headline?: string | null;
  heroImageUrl?: string | null;
  galleryImageUrls?: unknown;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  beds?: string | number | null;
  baths?: string | number | null;
  listPrice?: string | number | null;
  assignedAgentName?: string | null;
  updatedAt?: string | Date | null;
};

export const isFromOldSite = (row: Pick<ListingRow, "sourceUrl">) =>
  /^https?:\/\/(www\.)?savvy-agents\.com\//i.test(row.sourceUrl ?? "");

/** Which rows a filter keeps. "Ready" and "Needs details" are drafts only. */
export function matchesListingFilter(row: ListingRow, filter: ListingFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "published":
    case "draft":
    case "archived":
      return row.status === filter;
    case "ready":
      return row.status === "draft" && missingForPublish(row).length === 0;
    case "needs":
      return row.status === "draft" && missingForPublish(row).length > 0;
    case "old-site":
      return isFromOldSite(row);
  }
}

export function matchesListingSearch(row: ListingRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [row.address, row.city, row.state, row.zip, row.headline, row.assignedAgentName, row.slug]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(needle));
}
