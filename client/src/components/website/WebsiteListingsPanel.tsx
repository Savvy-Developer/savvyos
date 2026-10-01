import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, Building2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listMissing, missingForPublish } from "@shared/websitePublishChecklist";
import {
  LISTING_PAGE_SIZE,
  isFromOldSite,
  matchesListingFilter,
  matchesListingSearch,
  type ListingFilter,
  type ListingRow as Row,
} from "@shared/websiteListingFilters";

export type { ListingFilter };

/**
 * Website Studio > Listings: every property's website listing in one list,
 * drafts included. A listing is still edited and published on its property
 * (Website tab); this is where to find it. Built after the old-site import
 * left 837 drafts with nowhere to see them together.
 */

const FILTERS: Array<{ key: ListingFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "published", label: "Live" },
  { key: "draft", label: "Drafts" },
  { key: "ready", label: "Ready to publish" },
  { key: "needs", label: "Needs details" },
  { key: "archived", label: "Archived" },
  { key: "old-site", label: "From the old site" },
];

const STATUS_LABEL = { published: "Live", draft: "Draft", archived: "Archived" } as const;
const STATUS_CLASS = {
  published: "bg-emerald-100 text-emerald-800",
  draft: "bg-amber-100 text-amber-800",
  archived: "bg-slate-200 text-slate-700",
} as const;

function firstPhoto(row: Row): string | null {
  if (row.heroImageUrl) return row.heroImageUrl;
  const gallery = Array.isArray(row.galleryImageUrls) ? row.galleryImageUrls : [];
  return (gallery.find(url => typeof url === "string" && url.trim()) as string | undefined) ?? null;
}

function money(value: Row["listPrice"]): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? `$${Math.round(parsed).toLocaleString("en-US")}` : "No price";
}

export function WebsiteListingsPanel({
  listings,
  previewBase,
  initialFilter = "all",
}: {
  listings: Row[];
  previewBase: string;
  initialFilter?: ListingFilter;
}) {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<ListingFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(LISTING_PAGE_SIZE);

  const counts = useMemo(() => {
    const out = {} as Record<ListingFilter, number>;
    for (const item of FILTERS) out[item.key] = listings.filter(row => matchesListingFilter(row, item.key)).length;
    return out;
  }, [listings]);

  const visible = useMemo(
    () => listings.filter(row => matchesListingFilter(row, filter) && matchesListingSearch(row, search)),
    [listings, filter, search]
  );

  const pick = (next: ListingFilter) => {
    setFilter(next);
    setShown(LISTING_PAGE_SIZE);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Website listings</CardTitle>
        <CardDescription>
          Every property on the website, drafts included. Open one to edit or publish it on its property page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => pick(item.key)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                filter === item.key
                  ? "border-[#05314a] bg-[#05314a] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label} <span className="opacity-70">({counts[item.key]})</span>
            </button>
          ))}
        </div>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setShown(LISTING_PAGE_SIZE);
            }}
            placeholder="Search address, city, state, ZIP or agent"
            className="pl-9"
          />
        </div>
        <p className="text-sm text-slate-500">
          Showing {Math.min(shown, visible.length)} of {visible.length}
        </p>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
            No listings match.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="p-3">Property</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Agent</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Before it can go live</th>
                  <th className="p-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, shown).map(row => {
                  const photo = firstPhoto(row);
                  const missing = missingForPublish(row);
                  const open = () => navigate(`/properties/${row.propertyId}?tab=website`);
                  return (
                    <tr key={row.id} className="cursor-pointer border-b hover:bg-slate-50" onClick={open}>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {photo ? (
                            <img
                              src={photo}
                              alt=""
                              loading="lazy"
                              className="h-12 w-16 shrink-0 rounded-md bg-slate-100 object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                              <Building2 className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{row.address}</p>
                            <p className="truncate text-xs text-slate-500">
                              {[row.city, row.state].filter(Boolean).join(", ")}
                              {row.zip ? ` ${row.zip}` : ""}
                              {isFromOldSite(row) ? " · from the old site" : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">{money(row.listPrice)}</td>
                      <td className="p-3">{row.assignedAgentName || <span className="text-slate-400">No agent</span>}</td>
                      <td className="p-3">
                        <Badge className={STATUS_CLASS[row.status]} variant="secondary">
                          {STATUS_LABEL[row.status]}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs">
                        {row.status === "published" ? (
                          <span className="text-slate-400">Live</span>
                        ) : missing.length ? (
                          <span className="text-amber-800">Add {listMissing(missing)}</span>
                        ) : (
                          <span className="text-emerald-700">Ready</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1" onClick={event => event.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={open}>
                            Open
                          </Button>
                          {row.status === "published" && (
                            <a href={`${previewBase}properties/${row.slug}`} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost" title="View on the website">
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {visible.length > shown && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setShown(value => value + LISTING_PAGE_SIZE)}>
              Show more
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
