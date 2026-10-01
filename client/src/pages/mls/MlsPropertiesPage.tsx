import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bath, BedDouble, Building2, ChevronLeft, ChevronRight, ImageOff, List, Map as MapIcon, Ruler, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersistentState } from "@/hooks/usePersistentState";
import { trpc } from "@/lib/trpc";
import { MlsSearchMap, type MapViewport } from "./MlsSearchMap";
import { addressLine, cityLine, displayPrice, formatNumber, formatPrice, statusStyle, type MlsListingCard } from "./mlsFormat";

type Filters = {
  q?: string;
  sourceIds?: number[];
  statuses?: string[];
  propertyTypes?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  minBaths?: number;
  minSqft?: number;
  maxSqft?: number;
  minYearBuilt?: number;
  minAcres?: number;
  waterfront?: boolean;
  pool?: boolean;
  closedWithinDays?: number;
};

const SORT_LABELS: Record<string, string> = {
  newest: "Newest",
  updated: "Recently updated",
  price_desc: "Price (high to low)",
  price_asc: "Price (low to high)",
  beds: "Most bedrooms",
  sqft: "Largest",
  dom: "Days on market",
};

const DEFAULT_CENTER = { lat: 35.5951, lng: -82.5515 }; // Asheville
const PAGE_SIZE = 24;

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function numberOrUndefined(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clean(filters: Filters): Filters {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as Filters;
}

function ListingCard({
  listing,
  selected,
  onHover,
  onOpen,
}: {
  listing: MlsListingCard;
  selected: boolean;
  onHover: (id: number | null) => void;
  onOpen: (id: number) => void;
}) {
  const status = statusStyle(listing.standardStatus);
  const price = displayPrice(listing);
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(listing.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(listing.id)}
      className={`group flex w-full flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:shadow-md ${selected ? "ring-2 ring-primary" : ""}`}
    >
      <div className={`relative w-full ${listing.primaryPhotoUrl ? "aspect-[4/3] bg-muted" : "min-h-[116px] bg-gradient-to-br from-slate-50 to-sky-50"}`}>
        {listing.primaryPhotoUrl ? (
          <img src={listing.primaryPhotoUrl} alt={addressLine(listing)} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex min-h-[116px] flex-col justify-end gap-0.5 px-3 pb-3 pt-9">
            <span className="truncate text-sm font-semibold text-foreground">{addressLine(listing)}</span>
            <span className="truncate text-xs text-muted-foreground">{cityLine(listing)}</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ImageOff className="h-3 w-3" />{listing.photosCount ? "Photo pending" : "No MLS photo supplied"}</span>
          </div>
        )}
        <span className={`absolute top-2 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${listing.primaryPhotoUrl ? "left-2" : "right-2"} ${status.className}`}>{status.label}</span>
        {listing.removedFromFeedAt ? (
          <span className="absolute right-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Removed</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold">{formatPrice(price)}</span>
          {listing.standardStatus === "closed" && listing.closeDate ? (
            <span className="text-xs text-muted-foreground">Sold {new Date(`${listing.closeDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
          ) : listing.daysOnMarket !== null ? (
            <span className="text-xs text-muted-foreground">{listing.daysOnMarket} DOM</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{listing.bedroomsTotal ?? "N/A"} bd</span>
          <span className="inline-flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{listing.bathroomsTotal ?? "N/A"} ba</span>
          <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{formatNumber(listing.livingArea)} sqft</span>
          {listing.lotSizeAcres ? <span>{formatNumber(listing.lotSizeAcres, 2)} ac</span> : null}
        </div>
        {listing.primaryPhotoUrl ? <><div className="truncate text-sm font-medium">{addressLine(listing)}</div><div className="truncate text-xs text-muted-foreground">{cityLine(listing)}</div></> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground">
          <span className="truncate">{listing.listOfficeName ?? ""}</span>
          <span className="shrink-0">{listing.sourceShortName} #{listing.listingNumber}</span>
        </div>
      </div>
    </button>
  );
}

export default function MlsPropertiesPage() {
  const [, navigate] = useLocation();
  const [view, setView] = usePersistentState<"split" | "list" | "map">("mls.search.view", "split");
  const [filters, setFilters] = usePersistentState<Filters>("mls.search.filters", { statuses: ["active", "coming_soon", "active_under_contract"] });
  // Recently updated has a dedicated index; sorting the entire historical
  // import by original entry date can block an admin search for minutes.
  const [sort, setSort] = usePersistentState<string>("mls.search.sort.v2", "updated");
  const [page, setPage] = usePersistentState<number>("mls.search.page", 1);
  const [searchInMap, setSearchInMap] = usePersistentState<boolean>("mls.search.inMap.v2", false);
  const [queryText, setQueryText] = useState(filters.q ?? "");
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const debouncedText = useDebounced(queryText);
  useEffect(() => {
    setFilters(current => (current.q === (debouncedText || undefined) ? current : { ...current, q: debouncedText || undefined }));
    setPage(1);
  }, [debouncedText]); // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedViewport = useDebounced(viewport, 300);
  const cleaned = useMemo(() => clean(filters), [filters]);
  const listFilters = useMemo(
    () => (view !== "list" && searchInMap && debouncedViewport ? { ...cleaned, bounds: debouncedViewport.bounds } : cleaned),
    [cleaned, view, searchInMap, debouncedViewport]
  );

  const options = trpc.mlsProperties.filterOptions.useQuery(undefined, { staleTime: 60_000 });
  const permissions = trpc.permissions.getMyPermissions.useQuery(undefined, { staleTime: 60_000 });
  const canManage = !!(permissions.data as any)?.canManageMlsFeeds;
  const results = trpc.mlsProperties.search.useQuery(
    { filters: listFilters as any, sort: sort as any, page, pageSize: PAGE_SIZE },
    { enabled: view !== "map" }
  );

  const update = (patch: Partial<Filters>) => {
    setFilters(current => ({ ...current, ...patch }));
    setPage(1);
  };

  const openListing = (id: number) => {
    setSelectedId(id);
    navigate(`/mls-properties/listings/${id}`);
  };

  const activeCount = Object.keys(cleaned).filter(key => !["q", "statuses", "sourceIds", "propertyTypes"].includes(key)).length;
  const total = results.data?.total;
  const pages = total == null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasMore = results.data?.hasMore ?? false;
  // Never show listings for a previous ZIP/address while the input is debouncing.
  const searchTextPending = (queryText.trim() || undefined) !== (filters.q?.trim() || undefined);
  const searching = searchTextPending || results.isPending;
  const resultLabel = searching ? "Searching" : results.isError ? "Search is temporarily unavailable" : results.data
    ? total == null
      ? results.data.items.length === 0 ? "No results" : `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + results.data.items.length}${hasMore ? " · more available" : ""}`
      : `${total.toLocaleString()} results`
    : "Searching";

  return (
    <div className="flex flex-col lg:h-full">
      <PageHeader
        title="MLS Properties"
        subtitle="Search listings from licensed MLS feeds as they arrive"
        actions={
          canManage ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/mls-properties/feeds">
                <Settings2 className="mr-1.5 h-4 w-4" />
                Feeds and mappings
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={queryText} onChange={event => setQueryText(event.target.value)} placeholder="Address, city, ZIP, subdivision or MLS #" className="pl-8" />
          {queryText ? (
            <button type="button" className="absolute right-2 top-2.5 text-muted-foreground" onClick={() => setQueryText("")} aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <MultiSelect
          className="w-[190px]"
          options={(options.data?.statuses ?? []).map(status => ({ value: status.value, label: status.label }))}
          value={filters.statuses ?? []}
          onValueChange={value => update({ statuses: value })}
          placeholder="Any status"
          maxDisplay={1}
        />
        <MultiSelect
          className="w-[180px]"
          options={(options.data?.sources ?? []).map(source => ({ value: String(source.id), label: source.shortName, description: source.name }))}
          value={(filters.sourceIds ?? []).map(String)}
          onValueChange={value => update({ sourceIds: value.map(Number) })}
          placeholder="All MLSs"
          maxDisplay={1}
        />
        <MultiSelect
          className="w-[170px]"
          options={(options.data?.propertyTypes ?? []).map(type => ({ value: type.value, label: type.label }))}
          value={filters.propertyTypes ?? []}
          onValueChange={value => update({ propertyTypes: value })}
          placeholder="Any type"
          maxDisplay={1}
        />
        <Input key={`min-price-${filters.minPrice ?? ""}`} className="w-[110px]" placeholder="Min price" defaultValue={filters.minPrice ?? ""} onBlur={event => update({ minPrice: numberOrUndefined(event.target.value) })} />
        <Input key={`max-price-${filters.maxPrice ?? ""}`} className="w-[110px]" placeholder="Max price" defaultValue={filters.maxPrice ?? ""} onBlur={event => update({ maxPrice: numberOrUndefined(event.target.value) })} />
        <Select value={String(filters.minBeds ?? "any")} onValueChange={value => update({ minBeds: value === "any" ? undefined : Number(value) })}>
          <SelectTrigger className="w-[100px]"><SelectValue placeholder="Beds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any beds</SelectItem>
            {[1, 2, 3, 4, 5, 6].map(count => <SelectItem key={count} value={String(count)}>{count}+ bd</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              More{activeCount ? ` (${activeCount})` : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] space-y-3" align="end">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Min baths</Label><Input key={`min-baths-${filters.minBaths ?? ""}`} defaultValue={filters.minBaths ?? ""} onBlur={event => update({ minBaths: numberOrUndefined(event.target.value) })} /></div>
              <div><Label className="text-xs">Min year built</Label><Input key={`min-year-${filters.minYearBuilt ?? ""}`} defaultValue={filters.minYearBuilt ?? ""} onBlur={event => update({ minYearBuilt: numberOrUndefined(event.target.value) })} /></div>
              <div><Label className="text-xs">Min sqft</Label><Input key={`min-sqft-${filters.minSqft ?? ""}`} defaultValue={filters.minSqft ?? ""} onBlur={event => update({ minSqft: numberOrUndefined(event.target.value) })} /></div>
              <div><Label className="text-xs">Max sqft</Label><Input key={`max-sqft-${filters.maxSqft ?? ""}`} defaultValue={filters.maxSqft ?? ""} onBlur={event => update({ maxSqft: numberOrUndefined(event.target.value) })} /></div>
              <div><Label className="text-xs">Min acres</Label><Input key={`min-acres-${filters.minAcres ?? ""}`} defaultValue={filters.minAcres ?? ""} onBlur={event => update({ minAcres: numberOrUndefined(event.target.value) })} /></div>
              <div>
                <Label className="text-xs">Sold within</Label>
                <Select value={String(filters.closedWithinDays ?? "any")} onValueChange={value => update({ closedWithinDays: value === "any" ? undefined : Number(value), statuses: value === "any" ? filters.statuses : ["closed"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any time</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">6 months</SelectItem>
                    <SelectItem value="365">12 months</SelectItem>
                    <SelectItem value="730">24 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!filters.waterfront} onCheckedChange={value => update({ waterfront: value === true || undefined })} />Waterfront</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!filters.pool} onCheckedChange={value => update({ pool: value === true || undefined })} />Private pool</label>
            <Button variant="ghost" size="sm" onClick={() => { setFilters({}); setQueryText(""); setPage(1); }}>Clear all filters</Button>
          </PopoverContent>
        </Popover>
        <Select value={sort} onValueChange={value => { setSort(value); setPage(1); }}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border">
          <Button variant={view === "split" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "split"} onClick={() => setView("split")} className="rounded-r-none">Split</Button>
          <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" aria-label="List view" title="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className="rounded-none"><List className="h-4 w-4" /></Button>
          <Button variant={view === "map" ? "secondary" : "ghost"} size="sm" aria-label="Map view" title="Map view" aria-pressed={view === "map"} onClick={() => setView("map")} className="rounded-l-none"><MapIcon className="h-4 w-4" /></Button>
        </div>
      </div>

      {(
        <div className={`grid min-h-0 flex-1 gap-3 ${view === "split" ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : "grid-cols-1"}`}>
          {view !== "map" ? (
            <div className="order-last flex min-h-0 flex-col lg:order-first">
              <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {resultLabel}
                  {view === "split" && searchInMap && debouncedViewport ? " in map area" : ""}
                </span>
                {view === "split" ? (
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={searchInMap} onCheckedChange={value => { setSearchInMap(value === true); setPage(1); }} />Search as I move the map</label>
                ) : null}
              </div>
              <div className={`grid gap-3 pb-2 ${view === "list" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "sm:grid-cols-2 lg:max-h-[calc(100vh-250px)] lg:overflow-y-auto"}`}>
                {searching
                  ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[280px] w-full rounded-lg" />)
                  : !results.isError ? results.data?.items.map(listing => (
                      <ListingCard key={listing.id} listing={listing} selected={listing.id === selectedId} onHover={setHoveredId} onOpen={openListing} />
                    )) : null}
                {!searching && !results.isError && results.data && results.data.items.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
                    <Building2 className="h-6 w-6" />
                    No listings match. Widen the filters or move the map.
                  </div>
                ) : null}
                {!searching && results.isError ? (
                  <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    The listing search did not respond. <Button variant="outline" size="sm" onClick={() => void results.refetch()}>Try again</Button>
                  </div>
                ) : null}
              </div>
              {!searching && !results.isError && results.data && (page > 1 || hasMore) ? (
                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Prev</Button>
                  <span className="text-muted-foreground">Page {page}{pages ? ` of ${pages.toLocaleString()}` : ""}</span>
                  <Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {view !== "list" ? (
            <MlsSearchMap
              className={view === "map" ? "h-[70vh] lg:h-[calc(100vh-220px)]" : "order-first h-[360px] lg:order-last lg:h-[calc(100vh-250px)] lg:min-h-[420px]"}
              filters={cleaned}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={openListing}
              onViewportChange={next => { setViewport(next); if (searchInMap) setPage(1); }}
              initialCenter={DEFAULT_CENTER}
              initialZoom={10}
            />
          ) : null}
        </div>
      )}
      {options.data && options.data.sources.some(source => (filters.sourceIds ?? []).includes(source.id)) ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {options.data.sources
            .filter(source => (filters.sourceIds ?? []).includes(source.id))
            .map(source => <Badge key={source.id} variant="outline">{source.name}</Badge>)}
        </div>
      ) : null}
    </div>
  );
}
