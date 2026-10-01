import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { AlertTriangle, ArrowLeft, Bath, BedDouble, CalendarDays, ChevronLeft, ChevronRight, Clock, Code2, ExternalLink, History, ImageOff, Loader2, MapPin, Ruler, Trees } from "lucide-react";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  addressLine,
  cityLine,
  displayPrice,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPrice,
  FRESHNESS_STYLES,
  prettyKey,
  statusStyle,
  type MlsListingDetail,
} from "./mlsFormat";

const EVENT_LABELS: Record<string, string> = {
  listed: "Listed",
  relisted: "Relisted",
  status_change: "Status change",
  price_change: "Price change",
  back_on_market: "Back on market",
  pending: "Pending",
  closed: "Sold",
  withdrawn: "Withdrawn",
  expired: "Expired",
  canceled: "Canceled",
  removed_from_feed: "Removed from feed",
};

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === "N/A") return null;
  return (
    <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

const yesNo = (value: boolean | null | undefined) => (value === null || value === undefined ? null : value ? "Yes" : "No");

function Gallery({ media, alt }: { media: MlsListingDetail["media"]; alt: string }) {
  const [index, setIndex] = useState(0);
  const photos = media.filter(item => item.url);
  if (!photos.length) {
    return (
      <div className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground">
        <ImageOff className="h-6 w-6" />
        No stored photos yet
      </div>
    );
  }
  const current = photos[Math.min(index, photos.length - 1)];
  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-black">
        <img src={current.url!} alt={current.caption ?? alt} className="h-full w-full object-contain" />
        {photos.length > 1 ? (
          <>
            <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" onClick={() => setIndex((index - 1 + photos.length) % photos.length)} aria-label="Previous photo">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow" onClick={() => setIndex((index + 1) % photos.length)} aria-label="Next photo">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">{index + 1} / {photos.length}</span>
        {current.caption ? <span className="absolute bottom-2 left-2 max-w-[70%] truncate rounded bg-black/70 px-2 py-0.5 text-xs text-white">{current.caption}</span> : null}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {photos.map((photo, photoIndex) => (
          <button key={photo.id} type="button" aria-label={`Show photo ${photoIndex + 1} of ${photos.length}`} aria-current={photoIndex === index ? "true" : undefined} onClick={() => setIndex(photoIndex)} className={`h-14 w-20 shrink-0 overflow-hidden rounded border-2 ${photoIndex === index ? "border-primary" : "border-transparent"}`}>
            <img src={photo.url!} alt="" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="h-56 w-full overflow-hidden rounded-lg border bg-muted">
      <MapContainer key={`${lat}:${lng}`} center={[lat, lng]} zoom={15} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>' maxZoom={19} />
        <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: "#fff", fillColor: "#0f766e", fillOpacity: 1, weight: 2 }} />
      </MapContainer>
    </div>
  );
}

function RawPayload({ listingId }: { listingId: number }) {
  const [open, setOpen] = useState(false);
  const raw = trpc.mlsProperties.rawPayload.useQuery({ listingId }, { enabled: open });
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm"><Code2 className="mr-1.5 h-4 w-4" />{open ? "Hide" : "Show"} raw provider payload</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        {raw.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <pre className="max-h-[480px] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(raw.data?.payload ?? null, null, 2)}</pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function MlsListingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  // Merely viewing a listing must not spend MLS Grid photo requests.
  // Poll briefly only after an explicit gallery request.
  const [galleryPollUntil, setGalleryPollUntil] = useState(0);
  const galleryPolling = galleryPollUntil > Date.now();
  const query = trpc.mlsProperties.listing.useQuery({ id }, {
    enabled: Number.isFinite(id) && id > 0,
    refetchInterval: galleryPolling ? 5000 : false,
  });
  const requestGallery = trpc.mlsProperties.requestGallery.useMutation({
    onSuccess: () => { setGalleryPollUntil(Date.now() + 120_000); void query.refetch(); },
  });

  const data = query.data;
  const features = useMemo(() => Object.entries((data?.listing.features ?? {}) as Record<string, string[]>).filter(([, values]) => values?.length), [data]);
  const localFields = useMemo(() => Object.entries((data?.listing.localFields ?? {}) as Record<string, unknown>), [data]);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="aspect-[16/9] w-full" />
      </div>
    );
  }
  if (query.error || !data) {
    return (
      <div className="space-y-3">
        <Link href="/mls-properties" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to search</Link>
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{query.error?.message ?? "Listing not found."}</div>
      </div>
    );
  }

  const { listing, property, source, feed, display, history, otherListings, openHouses } = data;
  const status = statusStyle(listing.standardStatus);
  const price = displayPrice(listing);
  const freshness = feed ? FRESHNESS_STYLES[feed.freshness] : null;
  const storedPhotos = data.media.filter(photo => photo.url).length;
  const expectedPhotos = Number(listing.photosCount ?? 0);
  const galleryComplete = expectedPhotos > 0 && storedPhotos >= expectedPhotos;
  const galleryQueued = data.media.some(photo =>
    (photo.mediaKey === "__gallery_request__" && photo.status === "expired") ||
    (photo.priority === 0 && (photo.status === "pending" || photo.status === "expired"))
  );

  return (
    <div className="space-y-4 pb-10">
      <Link href="/mls-properties" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to search</Link>

      {listing.removedFromFeedAt ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" />Removed from the {source?.shortName} feed {formatDate(listing.removedFromFeedAt)} ({listing.removalReason}). Kept for history only.
        </div>
      ) : null}
      {display?.optOuts.length ? (
        <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {display.optOuts.map(text => <div key={text} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{text}</div>)}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
            {listing.mlsStatus && listing.mlsStatus !== status.label ? <Badge variant="outline">{listing.mlsStatus}</Badge> : null}
            {listing.propertySubType || listing.propertyType ? <Badge variant="secondary">{listing.propertySubType ?? prettyKey(listing.propertyType ?? "")}</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{addressLine(listing)}</h1>
          <div className="text-sm text-muted-foreground">{cityLine(listing)}{listing.countyOrParish ? ` · ${listing.countyOrParish} County` : ""}</div>
        </div>
        <div className="text-left md:text-right">
          <div className="text-3xl font-bold">{formatPrice(price)}</div>
          <div className="text-xs text-muted-foreground">
            {listing.standardStatus === "closed" ? `Sold ${formatDate(listing.closeDate)}${listing.listPrice ? ` · listed at ${formatPrice(listing.listPrice)}` : ""}` : listing.originalListPrice && listing.originalListPrice !== listing.listPrice ? `Originally ${formatPrice(listing.originalListPrice)}` : ""}
          </div>
          <div className="text-xs text-muted-foreground">{source?.shortName} MLS #{listing.listingNumber}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Gallery media={data.media} alt={addressLine(listing)} />
          <div className="flex flex-wrap items-center gap-2">
            {galleryComplete ? <span className="text-sm text-muted-foreground">All {storedPhotos} available photos stored</span> : galleryQueued ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Photos queued · refresh status</Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={requestGallery.isPending || galleryPolling} onClick={() => requestGallery.mutate({ id })}>
                {requestGallery.isPending ? "Queuing photos..." : galleryPolling ? "Photos requested" : "Load available photos"}
              </Button>
            )}
            {!galleryComplete ? <span className="text-xs text-muted-foreground">Full galleries load only when requested. Downloads may take time and use MLS Grid's photo budget.</span> : null}
            {requestGallery.error ? <span className="text-xs text-destructive">{requestGallery.error.message}</span> : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { icon: BedDouble, label: "Beds", value: listing.bedroomsTotal ?? "N/A" },
              { icon: Bath, label: "Baths", value: listing.bathroomsTotal ?? "N/A" },
              { icon: Ruler, label: "Sq ft", value: formatNumber(listing.livingArea) },
              { icon: Trees, label: "Acres", value: formatNumber(listing.lotSizeAcres, 2) },
              { icon: CalendarDays, label: "Built", value: listing.yearBuilt ?? "N/A" },
            ].map(item => (
              <div key={item.label} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><item.icon className="h-3.5 w-3.5" />{item.label}</div>
                <div className="text-lg font-semibold">{item.value}</div>
              </div>
            ))}
          </div>

          {listing.publicRemarks ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Description</CardTitle></CardHeader>
              <CardContent><p className="whitespace-pre-line text-sm leading-relaxed">{listing.publicRemarks}</p></CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Property</CardTitle></CardHeader>
              <CardContent>
                <Fact label="Type" value={listing.propertySubType ?? prettyKey(listing.propertyType ?? "")} />
                <Fact label="Full / half baths" value={listing.bathroomsFull !== null || listing.bathroomsHalf !== null ? `${listing.bathroomsFull ?? 0} / ${listing.bathroomsHalf ?? 0}` : null} />
                <Fact label="Above grade finished" value={listing.aboveGradeFinishedArea ? `${formatNumber(listing.aboveGradeFinishedArea)} sqft` : null} />
                <Fact label="Below grade finished" value={listing.belowGradeFinishedArea ? `${formatNumber(listing.belowGradeFinishedArea)} sqft` : null} />
                <Fact label="Lot" value={listing.lotSizeSquareFeet ? `${formatNumber(listing.lotSizeSquareFeet)} sqft` : null} />
                <Fact label="Stories" value={listing.storiesTotal} />
                <Fact label="Garage spaces" value={listing.garageSpaces} />
                <Fact label="Parking" value={listing.parkingTotal} />
                <Fact label="Furnished" value={listing.furnished} />
                <Fact label="Private pool" value={yesNo(listing.poolPrivateYN)} />
                <Fact label="Waterfront" value={yesNo(listing.waterfrontYN)} />
                <Fact label="View" value={yesNo(listing.viewYN)} />
                <Fact label="Fireplace" value={yesNo(listing.fireplaceYN)} />
                <Fact label="New construction" value={yesNo(listing.newConstructionYN)} />
                <Fact label="Zoning" value={listing.zoning} />
                <Fact label="Subdivision" value={listing.subdivisionName} />
                <Fact label="Area" value={listing.mlsAreaMajor} />
                <Fact label="Parcel" value={listing.parcelNumber} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Listing, HOA and tax</CardTitle></CardHeader>
              <CardContent>
                <Fact label="Listed" value={formatDate(listing.onMarketDate ?? listing.listingContractDate)} />
                <Fact label="Days on market" value={listing.daysOnMarket} />
                <Fact label="Cumulative DOM" value={listing.cumulativeDaysOnMarket} />
                <Fact label="Under contract" value={listing.purchaseContractDate ? formatDate(listing.purchaseContractDate) : null} />
                <Fact label="Closed" value={listing.closeDate ? formatDate(listing.closeDate) : null} />
                <Fact label="Close price" value={listing.closePrice ? formatPrice(listing.closePrice) : null} />
                <Fact label="HOA" value={listing.associationYN === null ? null : listing.associationYN ? listing.associationName ?? "Yes" : "No"} />
                <Fact label="HOA fee" value={listing.associationFee ? `${formatPrice(listing.associationFee)}${listing.associationFeeFrequency ? ` / ${listing.associationFeeFrequency}` : ""}` : null} />
                <Fact label="Annual tax" value={listing.taxAnnualAmount ? `${formatPrice(listing.taxAnnualAmount)}${listing.taxYear ? ` (${listing.taxYear})` : ""}` : null} />
                <Fact label="Assessed value" value={listing.taxAssessedValue ? formatPrice(listing.taxAssessedValue) : null} />
                <Fact label="Elementary" value={listing.elementarySchool} />
                <Fact label="Middle" value={listing.middleSchool} />
                <Fact label="High" value={listing.highSchool} />
                {listing.virtualTourUrl ? (
                  <Fact label="Virtual tour" value={<a className="inline-flex items-center gap-1 text-primary hover:underline" href={listing.virtualTourUrl} target="_blank" rel="noreferrer">Open<ExternalLink className="h-3 w-3" /></a>} />
                ) : null}
              </CardContent>
            </Card>
          </div>

          {features.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Features</CardTitle></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {features.map(([name, values]) => (
                  <div key={name}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{prettyKey(name)}</div>
                    <div className="text-sm">{values.join(", ")}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" />Property history</CardTitle></CardHeader>
            <CardContent>
              {history.length ? (
                <ol className="space-y-2">
                  {history.map(event => (
                    <li key={event.id} className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0">
                      <div>
                        <div className="font-medium">{EVENT_LABELS[event.eventType] ?? event.eventType}{event.listingId !== listing.id ? <span className="ml-1 text-xs text-muted-foreground">(other listing)</span> : null}</div>
                        <div className="text-xs text-muted-foreground">
                          {event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus ? `${statusStyle(event.fromStatus).label} to ${statusStyle(event.toStatus).label}` : event.toStatus ? statusStyle(event.toStatus).label : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{event.fromPrice && event.toPrice ? `${formatPrice(event.fromPrice)} to ${formatPrice(event.toPrice)}` : event.toPrice ? formatPrice(event.toPrice) : ""}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(event.eventAt)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">History builds as the feed reports changes.</p>
              )}
            </CardContent>
          </Card>

          {localFields.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{source?.shortName} local fields ({localFields.length})</CardTitle></CardHeader>
              <CardContent>
                <Collapsible>
                  <CollapsibleTrigger asChild><Button variant="ghost" size="sm">Show fields not in the RESO standard</Button></CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 grid gap-x-6 sm:grid-cols-2">
                    {localFields.map(([key, value]) => <Fact key={key} label={key} value={Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)} />)}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ) : null}

          {data.canManage ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Data lineage</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-x-6 text-xs sm:grid-cols-2">
                  {Object.entries((listing.fieldProvenance ?? {}) as Record<string, string>).map(([field, sourceField]) => (
                    <div key={field} className="flex justify-between gap-2 border-b py-1"><span className="font-mono">{field}</span><span className="font-mono text-muted-foreground">{sourceField}</span></div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">Mapping v{listing.mappingVersion} · provider key {listing.providerListingKey} · last synced {formatDateTime(listing.lastSyncedAt)} · media {Object.entries(data.mediaStatus).map(([key, value]) => `${key} ${value}`).join(", ") || "none"}</div>
                <RawPayload listingId={listing.id} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {listing.latitude && listing.longitude ? <MiniMap lat={listing.latitude} lng={listing.longitude} /> : (
            <div className="flex h-56 items-center justify-center gap-2 rounded-lg bg-muted text-sm text-muted-foreground"><MapPin className="h-4 w-4" />No coordinates from the MLS</div>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Listing brokerage</CardTitle></CardHeader>
            <CardContent>
              <Fact label="Office" value={data.listOffice?.officeName ?? listing.listOfficeName} />
              <Fact label="Office phone" value={data.listOffice?.phone ?? listing.listOfficePhone} />
              <Fact label="Agent" value={data.listAgent?.fullName ?? listing.listAgentFullName} />
              <Fact label="Agent phone" value={data.listAgent?.phone ?? listing.listAgentPhone} />
              <Fact label="Agent email" value={data.listAgent?.email ?? listing.listAgentEmail} />
              <Fact label="Co-list" value={[listing.coListAgentFullName, listing.coListOfficeName].filter(Boolean).join(", ")} />
              <Fact label="Buyer side" value={[listing.buyerAgentFullName, listing.buyerOfficeName].filter(Boolean).join(", ")} />
            </CardContent>
          </Card>

          {openHouses.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Open houses</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {openHouses.map(openHouse => (
                  <div key={openHouse.id} className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{formatDateTime(openHouse.startAt)} to {openHouse.endAt ? new Date(openHouse.endAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}{openHouse.openHouseType ? ` (${openHouse.openHouseType})` : ""}</div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Transactions at this property</CardTitle></CardHeader>
            <CardContent>
              {otherListings.length ? (
                <ul className="space-y-2 text-sm">
                  {otherListings.map(other => (
                    <li key={other.id}>
                      <Link href={`/mls-properties/listings/${other.id}`} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 hover:bg-muted">
                        <span>
                          <span className={`mr-2 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${statusStyle(other.standardStatus).className}`}>{statusStyle(other.standardStatus).label}</span>
                          #{other.listingNumber}
                        </span>
                        <span className="text-right text-xs">
                          <span className="font-medium">{formatPrice(other.closePrice ?? other.listPrice)}</span>
                          <span className="ml-1 text-muted-foreground">{formatDate(other.closeDate ?? other.onMarketDate ?? other.originalEntryAt)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">This is the only listing we hold for this property.</p>
              )}
              {property ? <p className="mt-2 text-xs text-muted-foreground">Property #{property.id} matched by {property.identitySource}. {property.listingCount} listing{property.listingCount === 1 ? "" : "s"} on record.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Source and display rules</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                <span className="font-medium">{source?.name}</span>
                {feed ? <Badge variant="outline">{feed.providerLabel} · {feed.feedType.toUpperCase()}</Badge> : null}
                {freshness ? <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${freshness.className}`}>{freshness.label}</span> : null}
              </div>
              {feed ? <div>Last successful sync {formatDateTime(feed.lastSuccessAt)}.</div> : null}
              {display ? (
                <>
                  <p className="font-medium text-foreground">{display.attribution}</p>
                  <p>{display.disclaimer}</p>
                  {display.basis !== "signed_license" ? <p className="text-amber-700">Rules shown are the provider baseline. Update the source with the signed license terms before any public display.</p> : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
