import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bath, BedDouble, Building2, ChevronLeft, ChevronRight, ImageOff, List, Map as MapIcon, MapPin, Ruler, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
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
import type { MapArea, MapViewport } from "./MlsSearchMap";
import { addressLine, cityLine, displayPrice, formatNumber, formatPrice, statusStyle, type MlsListingCard } from "./mlsFormat";

// List stays quick: Leaflet, Geoman and map requests load only when Map or Split opens.
const MlsSearchMap = lazy(() => import("./MlsSearchMap").then(module => ({ default: module.MlsSearchMap })));

type Filters = {
  q?: string;
  sourceIds?: number[];
  statuses?: string[];
  listingIntent?: "sale" | "rent";
  propertyTypes?: string[];
  propertySubTypes?: string[];
  mlsStatuses?: string[];
  counties?: string[];
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  maxBaths?: number;
  minSqft?: number;
  maxSqft?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;
  minAcres?: number;
  maxAcres?: number;
  minGarage?: number;
  waterfront?: boolean;
  pool?: boolean;
  newConstruction?: boolean;
  hasPhotos?: boolean;
  listedWithinDays?: number;
  maxDaysOnMarket?: number;
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
const DEFAULT_FILTERS: Filters = { statuses: ["active"], listingIntent: "sale" };
const PAGE_SIZE = 12;

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

function NumberField({ label, value, onChange, placeholder }: { label: string; value?: number; onChange: (value: number | undefined) => void; placeholder?: string }) {
  return <div className="min-w-0"><Label className="mb-1 block text-xs text-slate-600">{label}</Label><Input key={`${label}-${value ?? ""}`} inputMode="decimal" defaultValue={value ?? ""} onBlur={event => onChange(numberOrUndefined(event.target.value))} placeholder={placeholder} className="h-9" /></div>;
}

function ListingCard({ listing, selected, onHover, onOpen, priority = false, split = false }: {
  listing: MlsListingCard;
  selected: boolean;
  onHover: (id: number | null) => void;
  onOpen: (id: number) => void;
  priority?: boolean;
  split?: boolean;
}) {
  const status = statusStyle(listing.standardStatus);
  const price = displayPrice(listing);
  const [imageFailed, setImageFailed] = useState(false);
  const hasPhoto = !!listing.primaryPhotoUrl && !imageFailed;
  return (
    <button
      type="button"
      aria-label={`View ${addressLine(listing)}, ${cityLine(listing)}, ${formatPrice(price)}`}
      onMouseEnter={() => onHover(listing.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onOpen(listing.id)}
      className={`group flex w-full min-w-0 overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${split ? "min-h-[175px] flex-row" : "flex-col"} ${selected ? "ring-2 ring-primary" : ""}`}
    >
      <div className={`relative overflow-hidden bg-slate-100 ${split ? "min-h-[175px] w-[38%] shrink-0 self-stretch" : "aspect-[16/9] w-full sm:aspect-[4/3]"}`}>
        {hasPhoto ? (
          <img src={listing.primaryPhotoUrl!} alt={addressLine(listing)} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-sky-50 to-teal-50 px-2 text-center text-slate-500">
            <Building2 className="h-8 w-8 text-slate-400" strokeWidth={1.25} />
            <span className="inline-flex items-center gap-1 text-[11px] font-medium"><ImageOff className="h-3 w-3" />{listing.photosCount ? "Photo on its way" : "No MLS photo supplied"}</span>
          </div>
        )}
        <span className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold shadow-sm ${status.className}`}>{status.label}</span>
        {listing.photosCount && listing.photosCount > 1 ? <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">{listing.photosCount} photos</span> : null}
        {listing.removedFromFeedAt ? <span className="absolute right-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">Removed</span> : null}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col ${split ? "gap-1.5 p-3" : "gap-1.5 p-4"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={`${split ? "text-lg" : "text-xl"} font-bold tracking-tight`}>{formatPrice(price)}</span>
          {listing.standardStatus === "closed" && listing.closeDate ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">Sold {new Date(`${listing.closeDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
          ) : listing.daysOnMarket !== null ? <span className="shrink-0 text-[11px] text-muted-foreground">{listing.daysOnMarket} DOM</span> : null}
        </div>
        <div className="truncate text-sm font-semibold">{addressLine(listing)}</div>
        <div className="truncate text-xs text-muted-foreground">{cityLine(listing)}</div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{listing.bedroomsTotal ?? "N/A"} bd</span>
          <span className="inline-flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{listing.bathroomsTotal ?? "N/A"} ba</span>
          <span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{formatNumber(listing.livingArea)} sqft</span>
          {listing.lotSizeAcres ? <span>{formatNumber(listing.lotSizeAcres, 2)} ac</span> : null}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
          <span className="truncate">{listing.listOfficeName ?? ""}</span>
          <span className="shrink-0">{listing.sourceShortName} #{listing.listingNumber}</span>
        </div>
      </div>
    </button>
  );
}

export default function MlsPropertiesPage() {
  const [, navigate] = useLocation();
  const [view, setView] = usePersistentState<"split" | "list" | "map">("mls.search.view.v3", "list");
  const [filters, setFilters] = usePersistentState<Filters>("mls.search.filters.v3", DEFAULT_FILTERS);
  const [sort, setSort] = usePersistentState<string>("mls.search.sort.v3", "newest");
  const [page, setPage] = usePersistentState<number>("mls.search.page.v2", 1);
  const [searchInMap, setSearchInMap] = usePersistentState<boolean>("mls.search.inMap.v3", true);
  const [mapCamera, setMapCamera] = usePersistentState<{ center: { lat: number; lng: number }; zoom: number }>("mls.search.camera.v1", { center: DEFAULT_CENTER, zoom: 10 });
  const [mapBounds, setMapBounds] = usePersistentState<MapViewport["bounds"] | null>("mls.search.map.bounds.v1", null);
  const [area, setArea] = usePersistentState<MapArea | null>("mls.search.area.v1", null);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [queryText, setQueryText] = useState(filters.q ?? "");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const debouncedText = useDebounced(queryText);
  useEffect(() => {
    setFilters(current => (current.q === (debouncedText || undefined) ? current : { ...current, q: debouncedText || undefined }));
    setPage(1);
  }, [debouncedText]); // eslint-disable-line react-hooks/exhaustive-deps

  const cleaned = useMemo(() => clean(filters), [filters]);
  const listFilters = useMemo(
    () => ({ ...cleaned, ...(area ? { area } : mapBounds ? { bounds: mapBounds } : {}) }),
    [cleaned, area, mapBounds]
  );
  const options = trpc.mlsProperties.filterOptions.useQuery(undefined, { staleTime: 5 * 60_000 });
  const singleSourceId = filters.sourceIds?.length === 1 ? filters.sourceIds[0] : null;
  const facets = trpc.mlsProperties.sourceFacets.useQuery({ sourceId: singleSourceId ?? 0 }, { enabled: !!singleSourceId, staleTime: 5 * 60_000 });
  const singleSource = options.data?.sources.find(source => source.id === singleSourceId);
  const permissions = trpc.permissions.getMyPermissions.useQuery(undefined, { staleTime: 5 * 60_000 });
  const canManage = !!(permissions.data as any)?.canManageMlsFeeds;
  const results = trpc.mlsProperties.search.useQuery(
    { filters: listFilters as any, sort: sort as any, page, pageSize: PAGE_SIZE },
    { enabled: view !== "map", staleTime: 30_000, refetchOnWindowFocus: false }
  );

  const update = (patch: Partial<Filters>) => { setFilters(current => ({ ...current, ...patch })); setPage(1); };
  const sourceOptions = (options.data?.sources ?? []).map(source => ({ value: String(source.id), label: source.shortName, description: source.name }));
  const changeSources = (values: string[]) => {
    const sourceIds = values.map(Number);
    update({ sourceIds, propertySubTypes: undefined, mlsStatuses: undefined, counties: undefined });
    setMapBounds(null);
    setArea(null);
    setViewport(null);
    if (sourceIds.length === 1) {
      const selected = options.data?.sources.find(source => source.id === sourceIds[0]);
      const maris = /maris/i.test(selected?.name ?? "");
      setMapCamera({ center: maris ? { lat: 38.627, lng: -90.199 } : DEFAULT_CENTER, zoom: maris ? 9 : 10 });
    }
  };
  const clearAll = () => { setFilters(DEFAULT_FILTERS); setQueryText(""); setMapBounds(null); setArea(null); setPage(1); };
  const openListing = (id: number) => { setSelectedId(id); navigate(`/mls-properties/listings/${id}`); };
  const handleViewport = (next: MapViewport) => {
    setViewport(next);
    setMapCamera({ center: next.center, zoom: next.zoom });
    if (searchInMap && !area) { setMapBounds(next.bounds); setPage(1); }
  };
  const toggleMapSearch = (value: boolean) => {
    setSearchInMap(value);
    if (value && viewport && !area) setMapBounds(viewport.bounds);
    setPage(1);
  };

  const activeCount = Object.keys(cleaned).filter(key => !["q", "statuses", "listingIntent"].includes(key)).length;
  const total = results.data?.total;
  const pages = total == null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasMore = results.data?.hasMore ?? false;
  const searchTextPending = (queryText.trim() || undefined) !== (filters.q?.trim() || undefined);
  const searching = searchTextPending || results.isPending;
  const resultLabel = searching ? "Searching" : results.isError ? "Search is temporarily unavailable" : results.data
    ? total == null
      ? results.data.items.length === 0 ? "No results" : `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + results.data.items.length}${hasMore ? " · more available" : ""}`
      : `${total.toLocaleString()} results`
    : "Searching";
  const propertyTypes = (options.data?.propertyTypes ?? []).filter(type => filters.listingIntent === "sale" ? !type.value.endsWith("_lease") : filters.listingIntent === "rent" ? type.value.endsWith("_lease") : true);

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight sm:text-2xl">MLS Properties</h1>
          <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">Search listings from licensed MLS feeds as they arrive</p>
        </div>
        {canManage ? <Button variant="outline" size="sm" asChild><Link href="/mls-properties/feeds"><Settings2 className="mr-1.5 h-4 w-4" />Feeds</Link></Button> : null}
      </div>
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={queryText} onChange={event => setQueryText(event.target.value)} aria-label="Search MLS listings" placeholder="Address, city, ZIP or MLS #" className="pl-8" />
          {queryText ? <button type="button" className="absolute right-2 top-2.5 text-muted-foreground" onClick={() => setQueryText("")} aria-label="Clear search"><X className="h-4 w-4" /></button> : null}
        </div>
        <MultiSelect className="w-[155px] sm:w-[190px]" options={(options.data?.statuses ?? []).map(status => ({ value: status.value, label: status.label }))} value={filters.statuses ?? []} onValueChange={value => update({ statuses: value })} placeholder="Any status" maxDisplay={1} />
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9"><SlidersHorizontal className="mr-1.5 h-4 w-4" />Filters{activeCount ? ` (${activeCount})` : ""}</Button></PopoverTrigger>
          <PopoverContent className="z-[2200] max-h-[80vh] w-[430px] max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto p-4" align="start">
            <div className="flex items-center justify-between"><strong className="text-base">Refine your search</strong><Button variant="ghost" size="sm" onClick={clearAll}>Reset</Button></div>
            <section className="space-y-2 border-t pt-3">
              <h3 className="text-sm font-semibold">MLS and location</h3>
              <div><Label className="mb-1 block text-xs text-slate-600">MLS</Label><MultiSelect options={sourceOptions} value={(filters.sourceIds ?? []).map(String)} onValueChange={changeSources} placeholder="All licensed MLSs" maxDisplay={1} popoverClassName="z-[2400]" /></div>
              {singleSource ? <div className="space-y-2 rounded-lg border border-teal-100 bg-teal-50/60 p-3">
                <p className="text-xs font-semibold text-teal-900">{singleSource.shortName}-specific filters</p>
                {facets.isLoading ? <p className="text-xs text-muted-foreground">Loading MLS options…</p> : null}
                {facets.data?.propertySubTypes.length ? <div><Label className="mb-1 block text-xs">Property subtype</Label><MultiSelect options={facets.data.propertySubTypes.map(value => ({ value, label: value }))} value={filters.propertySubTypes ?? []} onValueChange={value => update({ propertySubTypes: value })} placeholder="Any subtype" maxDisplay={1} popoverClassName="z-[2400]" /></div> : null}
                {facets.data?.mlsStatuses.length ? <div><Label className="mb-1 block text-xs">MLS status</Label><MultiSelect options={facets.data.mlsStatuses.map(value => ({ value, label: value }))} value={filters.mlsStatuses ?? []} onValueChange={value => update({ mlsStatuses: value })} placeholder="Any MLS status" maxDisplay={1} popoverClassName="z-[2400]" /></div> : null}
                {facets.data?.counties.length ? <div><Label className="mb-1 block text-xs">County</Label><MultiSelect options={facets.data.counties.map(value => ({ value, label: value }))} value={filters.counties ?? []} onValueChange={value => update({ counties: value })} placeholder="Any county" maxDisplay={1} popoverClassName="z-[2400]" /></div> : null}
              </div> : null}
            </section>
            <section className="space-y-2 border-t pt-3">
              <h3 className="text-sm font-semibold">Price and property</h3>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Min price" value={filters.minPrice} onChange={value => update({ minPrice: value })} placeholder="$" />
                <NumberField label="Max price" value={filters.maxPrice} onChange={value => update({ maxPrice: value })} placeholder="$" />
              </div>
              <div><Label className="mb-1 block text-xs text-slate-600">Property type</Label><MultiSelect options={propertyTypes.map(type => ({ value: type.value, label: type.label }))} value={filters.propertyTypes ?? []} onValueChange={value => update({ propertyTypes: value })} placeholder="Any property type" maxDisplay={1} popoverClassName="z-[2400]" /></div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Min beds" value={filters.minBeds} onChange={value => update({ minBeds: value })} />
                <NumberField label="Max beds" value={filters.maxBeds} onChange={value => update({ maxBeds: value })} />
                <NumberField label="Min baths" value={filters.minBaths} onChange={value => update({ minBaths: value })} />
                <NumberField label="Max baths" value={filters.maxBaths} onChange={value => update({ maxBaths: value })} />
                <NumberField label="Min sqft" value={filters.minSqft} onChange={value => update({ minSqft: value })} />
                <NumberField label="Max sqft" value={filters.maxSqft} onChange={value => update({ maxSqft: value })} />
                <NumberField label="Min acres" value={filters.minAcres} onChange={value => update({ minAcres: value })} />
                <NumberField label="Max acres" value={filters.maxAcres} onChange={value => update({ maxAcres: value })} />
                <NumberField label="Built after" value={filters.minYearBuilt} onChange={value => update({ minYearBuilt: value })} />
                <NumberField label="Built before" value={filters.maxYearBuilt} onChange={value => update({ maxYearBuilt: value })} />
              </div>
            </section>
            <section className="space-y-2 border-t pt-3">
              <h3 className="text-sm font-semibold">Features and timing</h3>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="mb-1 block text-xs">Garage spaces</Label><Select value={String(filters.minGarage ?? "any")} onValueChange={value => update({ minGarage: value === "any" ? undefined : Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="z-[2400]"><SelectItem value="any">Any</SelectItem>{[1, 2, 3, 4].map(count => <SelectItem key={count} value={String(count)}>{count}+</SelectItem>)}</SelectContent></Select></div>
                <div><Label className="mb-1 block text-xs">Listed within</Label><Select value={String(filters.listedWithinDays ?? "any")} onValueChange={value => update({ listedWithinDays: value === "any" ? undefined : Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="z-[2400]"><SelectItem value="any">Any time</SelectItem>{[1, 3, 7, 14, 30, 90].map(days => <SelectItem key={days} value={String(days)}>{days} days</SelectItem>)}</SelectContent></Select></div>
                <NumberField label="Max days on market" value={filters.maxDaysOnMarket} onChange={value => update({ maxDaysOnMarket: value })} />
                <div><Label className="mb-1 block text-xs">Sold within</Label><Select value={String(filters.closedWithinDays ?? "any")} onValueChange={value => update({ closedWithinDays: value === "any" ? undefined : Number(value), statuses: value === "any" ? filters.statuses : ["closed"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="z-[2400]"><SelectItem value="any">Any time</SelectItem>{[30, 90, 180, 365, 730].map(days => <SelectItem key={days} value={String(days)}>{days} days</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="flex items-center gap-2"><Checkbox checked={!!filters.waterfront} onCheckedChange={value => update({ waterfront: value === true || undefined })} />Waterfront</label>
                <label className="flex items-center gap-2"><Checkbox checked={!!filters.pool} onCheckedChange={value => update({ pool: value === true || undefined })} />Private pool</label>
                <label className="flex items-center gap-2"><Checkbox checked={!!filters.newConstruction} onCheckedChange={value => update({ newConstruction: value === true || undefined })} />New construction</label>
                <label className="flex items-center gap-2"><Checkbox checked={!!filters.hasPhotos} onCheckedChange={value => update({ hasPhotos: value === true || undefined })} />Photo available</label>
              </div>
            </section>
          </PopoverContent>
        </Popover>
        <Select value={sort} onValueChange={value => { setSort(value); setPage(1); }}>
          <SelectTrigger aria-label="Sort listings" className="w-[150px] sm:w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(SORT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex rounded-md border">
          <Button variant={view === "split" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "split"} onClick={() => setView("split")} className="rounded-r-none">Split</Button>
          <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" aria-label="List view" title="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className="rounded-none"><List className="h-4 w-4" /></Button>
          <Button variant={view === "map" ? "secondary" : "ghost"} size="sm" aria-label="Map view" title="Map view" aria-pressed={view === "map"} onClick={() => setView("map")} className="rounded-l-none"><MapIcon className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-white p-0.5 text-xs font-semibold">
          {([["sale", "For sale"], ["rent", "For rent"], ["all", "All"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={(filters.listingIntent ?? "all") === value} onClick={() => update({ listingIntent: value === "all" ? undefined : value, propertyTypes: undefined, propertySubTypes: undefined })} className={`rounded-md px-3 py-1.5 transition ${(filters.listingIntent ?? "all") === value ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </div>
        {area ? <Button size="sm" variant="outline" className="h-8 gap-1.5 border-teal-200 text-teal-800" onClick={() => { setArea(null); if (searchInMap && viewport) setMapBounds(viewport.bounds); }}><MapPin className="h-3.5 w-3.5" />{area.kind === "circle" ? `${(area.radiusMeters / 1609.344).toFixed(1)} mi radius` : "Polygon area"}<X className="h-3.5 w-3.5" /></Button> : mapBounds ? <Button size="sm" variant="outline" className="h-8 gap-1.5 border-teal-200 text-teal-800" onClick={() => setMapBounds(null)}><MapPin className="h-3.5 w-3.5" />Map area<X className="h-3.5 w-3.5" /></Button> : null}
        {view === "map" ? <><label className="ml-auto flex items-center gap-2 text-xs text-slate-600"><Checkbox checked={searchInMap} onCheckedChange={value => toggleMapSearch(value === true)} />Search as I move the map</label><Button size="sm" variant="outline" onClick={() => { if (viewport && !area) setMapBounds(viewport.bounds); setView("list"); }}>Show results in list</Button></> : null}
      </div>
      <div className={`grid min-h-0 flex-1 gap-3 ${view === "split" ? "lg:grid-cols-[minmax(360px,0.86fr)_minmax(0,1.14fr)]" : "grid-cols-1"}`}>
        {view !== "map" ? <div className="order-first flex min-h-0 flex-col">
          <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{resultLabel}{(mapBounds || area) ? " in selected area" : ""}</span>
            {view === "split" ? <label className="flex items-center gap-2 text-xs"><Checkbox checked={searchInMap} onCheckedChange={value => toggleMapSearch(value === true)} />Search as I move the map</label> : null}
          </div>
          <div className={`grid gap-3 pb-2 ${view === "list" ? "sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "grid-cols-1 lg:max-h-[calc(100vh-235px)] lg:overflow-y-auto lg:pr-1"}`}>
            {searching ? Array.from({ length: view === "split" ? 4 : 6 }).map((_, index) => <Skeleton key={index} className={`${view === "split" ? "h-[175px]" : "h-[280px]"} w-full rounded-lg`} />)
              : !results.isError ? results.data?.items.map((listing, index) => <ListingCard key={listing.id} listing={listing} selected={listing.id === selectedId} onHover={setHoveredId} onOpen={openListing} priority={index < 2} split={view === "split"} />) : null}
            {!searching && !results.isError && results.data && results.data.items.length === 0 ? <div className="col-span-full flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground"><Building2 className="h-6 w-6" />No listings match. Widen the filters or move the map.</div> : null}
            {!searching && results.isError ? <div className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">The listing search did not respond. <Button variant="outline" size="sm" onClick={() => void results.refetch()}>Try again</Button></div> : null}
          </div>
          {!searching && !results.isError && results.data && (page > 1 || hasMore) ? <div className="flex items-center justify-between border-t pt-2 text-sm"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Prev</Button><span className="text-muted-foreground">Page {page}{pages ? ` of ${pages.toLocaleString()}` : ""}</span><Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div> : null}
        </div> : null}
        {view !== "list" ? <Suspense fallback={<Skeleton className="h-[380px] w-full rounded-xl" />}><MlsSearchMap
          key={(filters.sourceIds ?? []).join(",") || "all"}
          className={view === "map" ? "h-[70vh] lg:h-[calc(100vh-240px)]" : "order-last h-[420px] lg:h-[calc(100vh-240px)] lg:min-h-[500px]"}
          filters={cleaned}
          area={area}
          searchAsMove={searchInMap}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onOpen={openListing}
          onPreview={setSelectedId}
          onAreaChange={value => { setArea(value); if (!value && searchInMap && viewport) setMapBounds(viewport.bounds); setPage(1); }}
          onViewportChange={handleViewport}
          onSearchArea={next => { setMapBounds(next.bounds); setPage(1); }}
          initialCenter={mapCamera.center}
          initialZoom={mapCamera.zoom}
        /></Suspense> : null}
      </div>
      {options.data && options.data.sources.some(source => (filters.sourceIds ?? []).includes(source.id)) ? <div className="mt-2 flex flex-wrap gap-1">{options.data.sources.filter(source => (filters.sourceIds ?? []).includes(source.id)).map(source => <Badge key={source.id} variant="outline">{source.name}</Badge>)}</div> : null}
    </div>
  );
}
