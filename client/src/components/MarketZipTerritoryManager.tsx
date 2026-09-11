import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { AlertCircle, CheckCircle2, Loader2, MapPinned, Plus, Save, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type ZipBoundary = {
  type: "Feature";
  properties: { zipCode: string; name: string; centroid: [number, number] | null };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

const ZIP_PATTERN = /^\d{5}$/;

function parseZipCodes(value: string): { zipCodes: string[]; invalid: string[] } {
  const invalid: string[] = [];
  const zipCodes = Array.from(new Set(value.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean).map(item => {
    if (!ZIP_PATTERN.test(item)) invalid.push(item);
    return item;
  }).filter(item => ZIP_PATTERN.test(item)))).sort();
  return { zipCodes, invalid };
}

function MapClickCapture({ onPoint }: { onPoint: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: event => onPoint(event.latlng.lat, event.latlng.lng) });
  return null;
}

function FitZipBoundaries({ boundaries }: { boundaries: ZipBoundary[] }) {
  const map = useMap();
  const signature = boundaries.map(boundary => `${boundary.properties.zipCode}:${boundary.properties.centroid?.join(",")}`).join("|");
  useEffect(() => {
    const points = boundaries
      .map(boundary => boundary.properties.centroid)
      .filter((point): point is [number, number] => Array.isArray(point) && point.length === 2)
      .map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 10, { animate: false });
    else map.fitBounds(latLngBounds(points), { padding: [24, 24], maxZoom: 10, animate: false });
  }, [map, signature]);
  return null;
}

export function MarketZipTerritoryManager({
  marketId,
  marketName,
  zipCodes: initialZipCodes,
  onSaved,
}: {
  marketId: number;
  marketName: string;
  zipCodes: Array<{ id: number; zipCode: string }>;
  onSaved: () => Promise<unknown> | void;
}) {
  const initialValue = useMemo(() => initialZipCodes.map(item => item.zipCode).join("\n"), [initialZipCodes]);
  const [zipInput, setZipInput] = useState(initialValue);
  const [mapPoint, setMapPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapSelectedZip, setMapSelectedZip] = useState<string | null>(null);
  const parsed = useMemo(() => parseZipCodes(zipInput), [zipInput]);
  const assignedZipCodes = useMemo(() => new Set(initialZipCodes.map(item => item.zipCode)), [initialZipCodes]);
  const dirty = parsed.zipCodes.join("|") !== initialZipCodes.map(item => item.zipCode).sort().join("|");

  useEffect(() => {
    setZipInput(initialValue);
    setMapSelectedZip(null);
    setMapPoint(null);
  }, [marketId, initialValue]);

  const conflictsQuery = trpc.agentMarkets.checkZipAssignments.useQuery({ zipCodes: parsed.zipCodes, excludeMarketId: marketId }, {
    enabled: parsed.invalid.length === 0,
    staleTime: 5_000,
  });
  const boundariesQuery = trpc.agentMarkets.zipBoundaries.useQuery({ zipCodes: parsed.zipCodes }, {
    enabled: parsed.zipCodes.length > 0 && parsed.zipCodes.length <= 120,
    staleTime: 5 * 60_000,
  });
  const mapLookupQuery = trpc.agentMarkets.zipBoundaryAtPoint.useQuery(mapPoint ?? { latitude: 0, longitude: 0 }, {
    enabled: Boolean(mapPoint),
    staleTime: 5 * 60_000,
  });
  const saveTerritory = trpc.agentMarkets.replaceZipAssignments.useMutation({
    onSuccess: async ({ zipCodes }) => {
      setZipInput(zipCodes.join("\n"));
      setMapSelectedZip(null);
      await onSaved();
      toast.success(`${zipCodes.length} exclusive ZIP code${zipCodes.length === 1 ? "" : "s"} saved for ${marketName}.`);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    const boundary = mapLookupQuery.data?.boundary as ZipBoundary | null | undefined;
    if (boundary?.properties.zipCode) setMapSelectedZip(boundary.properties.zipCode);
  }, [mapLookupQuery.data?.boundary]);

  const boundaries = (boundariesQuery.data?.boundaries ?? []) as ZipBoundary[];
  const previewBoundary = mapLookupQuery.data?.boundary as ZipBoundary | null | undefined;
  const mapBoundaries = previewBoundary && !boundaries.some(boundary => boundary.properties.zipCode === previewBoundary.properties.zipCode)
    ? [...boundaries, previewBoundary]
    : boundaries;
  const conflicts = conflictsQuery.data?.conflicts ?? [];
  const conflictByZip = new Map(conflicts.map(conflict => [conflict.zipCode, conflict]));

  function addMapSelectedZip() {
    if (!mapSelectedZip) return;
    const next = new Set(parsed.zipCodes);
    next.add(mapSelectedZip);
    setZipInput(Array.from(next).sort().join("\n"));
  }

  function removeZipCode(zipCode: string) {
    setZipInput(parsed.zipCodes.filter(item => item !== zipCode).join("\n"));
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><MapPinned className="h-4 w-4" />Exclusive ZIP territory</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">Assign five-digit USPS ZIP codes to define this market’s exact territory. A ZIP can belong to only one Agent Market. The map displays the matching Census ZCTA as a visual selection aid.</CardDescription>
          </div>
          <Badge variant="outline" className="w-fit px-2.5 py-1">{initialZipCodes.length} saved</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(380px,1.1fr)]">
          <div className="space-y-3">
            <div>
              <Label htmlFor={`market-zip-codes-${marketId}`}>ZIP codes</Label>
              <Textarea
                id={`market-zip-codes-${marketId}`}
                className="mt-1 min-h-40 font-mono text-sm"
                value={zipInput}
                onChange={event => setZipInput(event.target.value)}
                placeholder={"28801\n28803\n28804\n\nPaste one ZIP per line, or separate values with commas."}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{parsed.zipCodes.length} valid ZIP code{parsed.zipCodes.length === 1 ? "" : "s"} staged. Save applies the full list shown here.</p>
            </div>

            {parsed.invalid.length > 0 && <div className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Use five-digit ZIP codes only. Fix: {parsed.invalid.slice(0, 10).join(", ")}{parsed.invalid.length > 10 ? "…" : ""}</span></div>}
            {conflicts.length > 0 && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><div className="flex gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" /><div><p className="font-semibold">Territory conflict. These ZIP codes are already assigned elsewhere.</p><p className="mt-1 text-xs text-rose-800">Remove them here or open the linked market to review its current territory. SavvyOS will not save a duplicate ZIP.</p></div></div><div className="mt-3 space-y-2">{conflicts.map(conflict => <div className="flex flex-wrap items-center gap-x-2 gap-y-1" key={`${conflict.zipCode}-${conflict.marketId}`}><Badge variant="outline" className="border-rose-300 bg-white font-mono text-rose-800">{conflict.zipCode}</Badge><a className="font-medium text-primary underline underline-offset-2" href={`/agent-markets?marketId=${conflict.marketId}`}>Open {conflict.marketName}{conflict.state ? `, ${conflict.state}` : ""}</a><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-rose-700 hover:text-rose-800" onClick={() => removeZipCode(conflict.zipCode)}>Remove</Button></div>)}</div></div>}
            {conflictsQuery.isFetching && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking ZIP ownership…</p>}

            {parsed.zipCodes.length > 0 && <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted/20 p-3">{parsed.zipCodes.map(zipCode => <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-xs ${conflictByZip.has(zipCode) ? "border-rose-300 bg-rose-50 text-rose-800" : "border-cyan-200 bg-cyan-50 text-cyan-900"}`} key={zipCode}>{zipCode}<button type="button" onClick={() => removeZipCode(zipCode)} aria-label={`Remove ZIP ${zipCode}`} className="rounded-full hover:bg-black/10"><X className="h-3 w-3" /></button></span>)}</div>}
            <Button type="button" className="w-full sm:w-auto" onClick={() => saveTerritory.mutate({ marketId, zipCodes: parsed.zipCodes })} disabled={!dirty || parsed.invalid.length > 0 || conflicts.length > 0 || conflictsQuery.isFetching || saveTerritory.isPending}>
              {saveTerritory.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saveTerritory.isPending ? "Saving territory…" : "Save exclusive ZIP territory"}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2"><div className="min-w-44 flex-1"><Label htmlFor={`map-zip-${marketId}`}>Find a ZIP on the map</Label><Input id={`map-zip-${marketId}`} className="mt-1 font-mono" value={mapSelectedZip ?? ""} onChange={event => setMapSelectedZip(event.target.value.replace(/\D/g, "").slice(0, 5) || null)} placeholder="Enter ZIP or click map" /></div><Button type="button" variant="outline" onClick={addMapSelectedZip} disabled={!mapSelectedZip || !ZIP_PATTERN.test(mapSelectedZip) || parsed.zipCodes.includes(mapSelectedZip)}><Plus className="mr-2 h-4 w-4" />Add to territory</Button></div>
            <div className="overflow-hidden rounded-lg border bg-muted/10">
              <div className="border-b bg-background px-3 py-2 text-xs text-muted-foreground">Click a location to identify its ZIP boundary, then add it to this territory. Teal boundaries are in the staged territory. Gold is the ZIP currently selected from the map.</div>
              <MapContainer center={[39.8283, -98.5795]} zoom={4} scrollWheelZoom className="h-[420px] w-full" aria-label={`ZIP territory map for ${marketName}`}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <FitZipBoundaries boundaries={mapBoundaries} />
                <MapClickCapture onPoint={(latitude, longitude) => { setMapSelectedZip(null); setMapPoint({ latitude, longitude }); }} />
                {mapBoundaries.map(boundary => {
                  const highlighted = boundary.properties.zipCode === mapSelectedZip && !assignedZipCodes.has(boundary.properties.zipCode);
                  return <GeoJSON key={boundary.properties.zipCode} data={boundary as any} pathOptions={{ color: highlighted ? "#ca8a04" : "#0e7490", fillColor: highlighted ? "#facc15" : "#06b6d4", fillOpacity: highlighted ? 0.33 : 0.22, weight: highlighted ? 3 : 2 }} />;
                })}
              </MapContainer>
            </div>
            {mapLookupQuery.isFetching && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Finding the ZIP boundary at that map point…</p>}
            {mapSelectedZip && ZIP_PATTERN.test(mapSelectedZip) && <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><CheckCircle2 className="h-4 w-4 shrink-0 text-amber-700" /><span><strong>ZIP {mapSelectedZip}</strong> is selected. Add it, then save the full territory.</span></div>}
            {boundariesQuery.data?.unavailableZipCodes?.length ? <p className="text-xs text-muted-foreground">Map boundary not available for: {boundariesQuery.data.unavailableZipCodes.join(", ")}. The ZIP can still be saved as an exclusive territory assignment.</p> : null}
          </div>
        </div>
        <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">Map boundaries use the U.S. Census Bureau’s 2020 ZIP Code Tabulation Areas (ZCTAs), which are generalized map representations of USPS ZIP codes. The five-digit ZIP code, not the map shape, is SavvyOS’s authoritative exclusivity key.</p>
      </CardContent>
    </Card>
  );
}

export default MarketZipTerritoryManager;
