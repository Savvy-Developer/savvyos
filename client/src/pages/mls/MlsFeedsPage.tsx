import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, KeyRound, Loader2, MoreHorizontal, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatDateTime, formatNumber, FRESHNESS_STYLES, statusStyle, timeAgo, type MlsFeedView, type MlsSourcesResult } from "./mlsFormat";

type Source = MlsSourcesResult["sources"][number];

const ONBOARDING = ["planned", "conditional", "applied", "approved", "live", "paused", "unresolved"] as const;
const FEED_TYPES = ["idx", "idx_plus", "vow", "bbo", "participant", "other"] as const;
const MEDIA_POLICIES = { all: "All photos, all statuses", active_all_else_primary: "All for active, primary for others", primary_only: "Primary photo only", none: "No photos" } as const;
const ONBOARDING_STYLES: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-800",
  approved: "bg-sky-100 text-sky-800",
  applied: "bg-indigo-100 text-indigo-800",
  planned: "bg-zinc-100 text-zinc-700",
  conditional: "bg-amber-100 text-amber-800",
  paused: "bg-orange-100 text-orange-800",
  unresolved: "bg-red-100 text-red-800",
};
const CREDENTIAL_DEFAULTS: Record<string, string> = { mls_grid: "MLSGRID", trestle: "TRESTLE", spark: "SPARK", reso_web_api: "", custom: "" };

type FeedForm = {
  id?: number;
  sourceId: number;
  name: string;
  provider: string;
  feedType: string;
  baseUrl: string;
  tokenUrl: string;
  originatingSystemName: string;
  keyPrefix: string;
  credentialRef: string;
  syncIntervalMinutes: number;
  reconcileIntervalHours: number;
  maxStalenessHours: number;
  mediaPolicy: string;
  retentionPolicy: string;
  enabled: boolean;
  optionsJson: string;
};

function newFeedForm(source: Source): FeedForm {
  const provider = source.providerRoute === "unresolved" ? "reso_web_api" : source.providerRoute;
  return {
    sourceId: source.id,
    name: `${source.shortName} ${provider === "mls_grid" ? "via MLS Grid" : "feed"}`,
    provider,
    feedType: "idx",
    baseUrl: "",
    tokenUrl: "",
    originatingSystemName: source.originatingSystemName ?? "",
    keyPrefix: source.keyPrefix ?? "",
    credentialRef: CREDENTIAL_DEFAULTS[provider] || source.code.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
    syncIntervalMinutes: 15,
    reconcileIntervalHours: 24,
    maxStalenessHours: 12,
    mediaPolicy: "active_all_else_primary",
    retentionPolicy: "purge",
    enabled: false,
    optionsJson: "",
  };
}

function formFromFeed(feed: MlsFeedView): FeedForm {
  return {
    id: feed.id,
    sourceId: feed.sourceId,
    name: feed.name,
    provider: feed.provider,
    feedType: feed.feedType,
    baseUrl: feed.baseUrl,
    tokenUrl: feed.tokenUrl ?? "",
    originatingSystemName: feed.originatingSystemName ?? "",
    keyPrefix: feed.keyPrefix ?? "",
    credentialRef: feed.credentialRef,
    syncIntervalMinutes: feed.syncIntervalMinutes,
    reconcileIntervalHours: feed.reconcileIntervalHours,
    maxStalenessHours: feed.maxStalenessHours,
    mediaPolicy: feed.mediaPolicy,
    retentionPolicy: feed.retentionPolicy,
    enabled: feed.enabled,
    optionsJson: feed.options ? JSON.stringify(feed.options, null, 2) : "",
  };
}

function FeedDialog({ form, onClose, sources, providers }: { form: FeedForm | null; onClose: () => void; sources: Source[]; providers: MlsSourcesResult["providers"] }) {
  const utils = trpc.useUtils();
  const [state, setState] = useState<FeedForm | null>(form);
  const [lastForm, setLastForm] = useState<FeedForm | null>(form);
  if (form !== lastForm) {
    setLastForm(form);
    setState(form);
  }
  const create = trpc.mlsProperties.createFeed.useMutation();
  const update = trpc.mlsProperties.updateFeed.useMutation();
  if (!state) return null;
  const provider = providers.find(item => item.value === state.provider);
  const set = (patch: Partial<FeedForm>) => setState(current => (current ? { ...current, ...patch } : current));

  const save = async () => {
    let options: Record<string, unknown> | undefined;
    if (state.optionsJson.trim()) {
      try {
        options = JSON.parse(state.optionsJson);
      } catch {
        toast.error("Options must be valid JSON.");
        return;
      }
    }
    const payload = {
      sourceId: state.sourceId,
      name: state.name,
      provider: state.provider as any,
      feedType: state.feedType as any,
      baseUrl: state.baseUrl,
      tokenUrl: state.tokenUrl,
      originatingSystemName: state.originatingSystemName,
      keyPrefix: state.keyPrefix,
      credentialRef: state.credentialRef.toUpperCase(),
      syncIntervalMinutes: state.syncIntervalMinutes,
      reconcileIntervalHours: state.reconcileIntervalHours,
      maxStalenessHours: state.maxStalenessHours,
      mediaPolicy: state.mediaPolicy as any,
      retentionPolicy: state.retentionPolicy as any,
      enabled: state.enabled,
      options,
    };
    try {
      if (state.id) await update.mutateAsync({ ...payload, id: state.id });
      else await create.mutateAsync(payload);
      toast.success("Feed saved");
      await utils.mlsProperties.sources.invalidate();
      onClose();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save the feed");
    }
  };

  return (
    <Dialog open={!!form} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{state.id ? "Edit feed" : "Add feed"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Name</Label><Input value={state.name} onChange={event => set({ name: event.target.value })} /></div>
          <div>
            <Label>Source</Label>
            <Select value={String(state.sourceId)} onValueChange={value => set({ sourceId: Number(value) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{sources.map(source => <SelectItem key={source.id} value={String(source.id)}>{source.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Provider</Label>
            <Select value={state.provider} onValueChange={value => set({ provider: value, credentialRef: CREDENTIAL_DEFAULTS[value] || state.credentialRef })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{providers.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>License type</Label>
            <Select value={state.feedType} onValueChange={value => set({ feedType: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FEED_TYPES.map(type => <SelectItem key={type} value={type}>{type.toUpperCase().replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Credential reference</Label>
            <Input value={state.credentialRef} onChange={event => set({ credentialRef: event.target.value.toUpperCase() })} placeholder="MLSGRID" />
            <p className="mt-1 text-[11px] text-muted-foreground">Secret lives in Railway as MLS_CRED_{state.credentialRef || "REF"}_{state.provider === "trestle" ? "CLIENT_ID / _CLIENT_SECRET" : "TOKEN"}. Never paste secrets here.</p>
          </div>
          <div className="sm:col-span-2"><Label>Base URL</Label><Input value={state.baseUrl} onChange={event => set({ baseUrl: event.target.value })} placeholder={provider?.defaultBaseUrl || "https://..."} /></div>
          {state.provider === "trestle" || state.provider === "reso_web_api" ? (
            <div className="sm:col-span-2"><Label>Token URL (OAuth)</Label><Input value={state.tokenUrl} onChange={event => set({ tokenUrl: event.target.value })} placeholder="Leave blank for the provider default" /></div>
          ) : null}
          <div><Label>OriginatingSystemName</Label><Input value={state.originatingSystemName} onChange={event => set({ originatingSystemName: event.target.value })} placeholder="carolina" /></div>
          <div><Label>Key prefix</Label><Input value={state.keyPrefix} onChange={event => set({ keyPrefix: event.target.value })} placeholder="CAR" /></div>
          <div><Label>Sync every (minutes)</Label><Input type="number" value={state.syncIntervalMinutes} onChange={event => set({ syncIntervalMinutes: Number(event.target.value) })} /></div>
          <div><Label>Reconcile every (hours)</Label><Input type="number" value={state.reconcileIntervalHours} onChange={event => set({ reconcileIntervalHours: Number(event.target.value) })} /></div>
          <div><Label>Max staleness (hours)</Label><Input type="number" value={state.maxStalenessHours} onChange={event => set({ maxStalenessHours: Number(event.target.value) })} /></div>
          <div>
            <Label>Photos</Label>
            <Select value={state.mediaPolicy} onValueChange={value => set({ mediaPolicy: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(MEDIA_POLICIES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>When a listing leaves the feed</Label>
            <Select value={state.retentionPolicy} onValueChange={value => set({ retentionPolicy: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purge">Purge content (IDX default)</SelectItem>
                <SelectItem value="retain_history">Keep history (only if the license allows)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>License approval and advanced options (JSON)</Label>
            <p className="my-1 text-xs text-muted-foreground">Activation requires a signed license reference and explicit internal-use approval. Record options.license with approved, internalUse, and reference; use expiresAt and retainHistory when applicable. An IDX credential alone is not back-office approval. Do not paste secrets here.</p>
            <Textarea rows={3} className="font-mono text-xs" value={state.optionsJson} onChange={event => set({ optionsJson: event.target.value })} placeholder='{"pageSize": 1000, "extraFilter": "PropertyType eq &apos;Residential&apos;"}' />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={state.enabled} onCheckedChange={value => set({ enabled: value })} />Enabled (the worker starts importing on its next pass)</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Save feed</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceDialog({ source, onClose }: { source: Source | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const updateSource = trpc.mlsProperties.updateSource.useMutation();
  const [draft, setDraft] = useState<{ onboardingStatus: string; routeNote: string; originatingSystemName: string; keyPrefix: string; websiteUrl: string; complianceJson: string } | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  if (source && source.id !== lastId) {
    setLastId(source.id);
    setDraft({
      onboardingStatus: source.onboardingStatus,
      routeNote: source.routeNote ?? "",
      originatingSystemName: source.originatingSystemName ?? "",
      keyPrefix: source.keyPrefix ?? "",
      websiteUrl: source.websiteUrl ?? "",
      complianceJson: JSON.stringify(source.compliance, null, 2),
    });
  }
  if (!source || !draft) return null;
  const save = async () => {
    let compliance: Record<string, unknown>;
    try {
      compliance = JSON.parse(draft.complianceJson);
    } catch {
      toast.error("Display rules must be valid JSON.");
      return;
    }
    try {
      await updateSource.mutateAsync({
        id: source.id,
        onboardingStatus: draft.onboardingStatus as any,
        routeNote: draft.routeNote || null,
        originatingSystemName: draft.originatingSystemName || null,
        keyPrefix: draft.keyPrefix || null,
        websiteUrl: draft.websiteUrl || null,
        compliance,
      });
      toast.success("Source saved");
      await utils.mlsProperties.sources.invalidate();
      setLastId(null);
      onClose();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save the source");
    }
  };
  return (
    <Dialog open={!!source} onOpenChange={open => { if (!open) { setLastId(null); onClose(); } }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{source.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Onboarding status</Label>
            <Select value={draft.onboardingStatus} onValueChange={value => setDraft({ ...draft, onboardingStatus: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ONBOARDING.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Website</Label><Input value={draft.websiteUrl} onChange={event => setDraft({ ...draft, websiteUrl: event.target.value })} /></div>
          <div><Label>OriginatingSystemName</Label><Input value={draft.originatingSystemName} onChange={event => setDraft({ ...draft, originatingSystemName: event.target.value })} /></div>
          <div><Label>Key prefix</Label><Input value={draft.keyPrefix} onChange={event => setDraft({ ...draft, keyPrefix: event.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Route note</Label><Textarea rows={2} value={draft.routeNote} onChange={event => setDraft({ ...draft, routeNote: event.target.value })} /></div>
          <div className="sm:col-span-2">
            <Label>Display and data rules</Label>
            <p className="mb-1 text-[11px] text-muted-foreground">When the license is signed, set "basis" to "signed_license" and match every value to the signed terms.</p>
            <Textarea rows={14} className="font-mono text-xs" value={draft.complianceJson} onChange={event => setDraft({ ...draft, complianceJson: event.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setLastId(null); onClose(); }}>Cancel</Button>
          <Button onClick={save} disabled={updateSource.isPending}>Save source</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedActions({ feed, onEdit, onRuns }: { feed: MlsFeedView; onEdit: () => void; onRuns: () => void }) {
  const utils = trpc.useUtils();
  const action = trpc.mlsProperties.feedAction.useMutation({ onSuccess: () => utils.mlsProperties.sources.invalidate() });
  const test = trpc.mlsProperties.testFeed.useMutation();
  const run = async (name: "enable" | "disable" | "sync_now" | "reconcile_now" | "refresh_metadata" | "full_reload" | "clear_error", message: string) => {
    if (name === "full_reload" && !window.confirm("Restart this feed from zero? Existing listings stay; anything the reload does not see is removed at the end.")) return;
    try {
      await action.mutateAsync({ id: feed.id, action: name });
      toast.success(message);
    } catch (error: any) {
      toast.error(error?.message ?? "Action failed");
    }
  };
  const runTest = async () => {
    const result = await test.mutateAsync({ id: feed.id });
    if (result.ok) toast.success(`${result.message} (${result.ms} ms)`);
    else toast.error(result.message);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">{test.isPending || action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={runTest}>Test connection</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("sync_now", "Sync requested")}>Sync now</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("reconcile_now", "Reconcile requested")}>Reconcile deletions now</DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("refresh_metadata", "Metadata refresh requested")}>Refresh metadata</DropdownMenuItem>
        <DropdownMenuItem onClick={onRuns}>View runs</DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>Edit feed</DropdownMenuItem>
        <DropdownMenuSeparator />
        {feed.lastError ? <DropdownMenuItem onClick={() => run("clear_error", "Error cleared")}>Clear error</DropdownMenuItem> : null}
        <DropdownMenuItem onClick={() => run(feed.enabled ? "disable" : "enable", feed.enabled ? "Feed disabled" : "Feed enabled")}>{feed.enabled ? "Disable" : "Enable"}</DropdownMenuItem>
        <DropdownMenuItem className="text-red-600" onClick={() => run("full_reload", "Full reload queued")}>Full reload</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RunsPanel({ feeds, feedId, setFeedId }: { feeds: MlsFeedView[]; feedId: number | null; setFeedId: (id: number) => void }) {
  const runs = trpc.mlsProperties.feedRuns.useQuery({ feedId: feedId ?? 0 }, { enabled: !!feedId, refetchInterval: 15_000 });
  return (
    <div className="space-y-3">
      <Select value={feedId ? String(feedId) : undefined} onValueChange={value => setFeedId(Number(value))}>
        <SelectTrigger className="w-[320px]"><SelectValue placeholder="Choose a feed" /></SelectTrigger>
        <SelectContent>{feeds.map(feed => <SelectItem key={feed.id} value={String(feed.id)}>{feed.name}</SelectItem>)}</SelectContent>
      </Select>
      {runs.data ? (
        <>
          <div className="flex flex-wrap gap-2">
            {runs.data.cursors.map(cursor => (
              <Badge key={cursor.id} variant="outline" className="font-normal">{cursor.resource}: {cursor.phase} · {formatNumber(cursor.recordsSeen)} seen · mark {cursor.highWaterMark ?? "none"}</Badge>
            ))}
          </div>
          {runs.data.quarantinedCount > 0 ? (
            <Card className="border-amber-300">
              <CardContent className="space-y-1 pt-4 text-sm">
                <p className="font-semibold">{formatNumber(runs.data.quarantinedCount)} records saved for repair</p>
                <p className="text-muted-foreground">Their original provider payloads are stored privately. Other records continue importing; these are retried in small batches.</p>
                {runs.data.exceptions.map(row => (
                  <p key={`${row.resource}:${row.providerKey}`} className="font-mono text-xs">{row.resource} {row.providerKey}: {row.errorCode}{row.errorColumn ? ` (${row.errorColumn})` : ""} · {row.attempts} attempt(s)</p>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <Table>
            <TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Kind</TableHead><TableHead>Resource</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Upserted</TableHead><TableHead className="text-right">Unchanged</TableHead><TableHead className="text-right">Deleted</TableHead><TableHead className="text-right">Media queued</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
            <TableBody>
              {runs.data.runs.map(run => (
                <TableRow key={run.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(run.startedAt)}</TableCell>
                  <TableCell>{run.kind}</TableCell>
                  <TableCell>{run.resource ?? ""}</TableCell>
                  <TableCell><Badge variant={run.status === "failed" ? "destructive" : run.status === "running" ? "secondary" : "outline"}>{run.status}</Badge></TableCell>
                  <TableCell className="text-right">{formatNumber(run.requests)}</TableCell>
                  <TableCell className="text-right">{formatNumber(run.received)}</TableCell>
                  <TableCell className="text-right">{formatNumber(run.upserted)}</TableCell>
                  <TableCell className="text-right">{formatNumber(run.unchanged)}</TableCell>
                  <TableCell className="text-right">{formatNumber(run.deleted)}</TableCell>
                  <TableCell className="text-right">{formatNumber(run.mediaQueued)}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-red-700" title={run.error ?? ""}>{run.error ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!runs.data.runs.length ? <p className="text-sm text-muted-foreground">No runs yet.</p> : null}
        </>
      ) : null}
    </div>
  );
}

type MappingDraft = { id?: number; sourceId: number | null; provider: string | null; resource: string; sourceField: string; resoField: string; target: string; transform: string; valueMapJson: string; confidence: number; isActive: boolean; notes: string };

function MappingsPanel({ sources, feeds }: { sources: Source[]; feeds: MlsFeedView[] }) {
  const utils = trpc.useUtils();
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [feedId, setFeedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<MappingDraft | null>(null);
  const mappings = trpc.mlsProperties.mappings.useQuery({ sourceId });
  const local = trpc.mlsProperties.localFields.useQuery({ feedId: feedId ?? 0 }, { enabled: !!feedId });
  const save = trpc.mlsProperties.saveMapping.useMutation();
  const remove = trpc.mlsProperties.deleteMapping.useMutation();
  const sourceName = (id: number | null) => (id ? sources.find(source => source.id === id)?.shortName ?? `#${id}` : "All sources");

  const submit = async () => {
    if (!draft) return;
    let valueMap: Record<string, string> | null = null;
    if (draft.valueMapJson.trim()) {
      try {
        valueMap = JSON.parse(draft.valueMapJson);
      } catch {
        toast.error("Value map must be valid JSON.");
        return;
      }
    }
    try {
      await save.mutateAsync({
        id: draft.id,
        sourceId: draft.sourceId,
        provider: (draft.provider as any) || null,
        resource: draft.resource as any,
        sourceField: draft.sourceField,
        resoField: draft.resoField || null,
        target: draft.target,
        transform: draft.transform as any,
        valueMap,
        confidence: draft.confidence,
        isActive: draft.isActive,
        notes: draft.notes || null,
      });
      toast.success("Mapping saved. It applies to records received from now on.");
      setDraft(null);
      await utils.mlsProperties.mappings.invalidate();
      await utils.mlsProperties.localFields.invalidate();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not save the mapping");
    }
  };

  const blank = (patch: Partial<MappingDraft> = {}): MappingDraft => ({ sourceId, provider: null, resource: "Property", sourceField: "", resoField: "", target: "local.", transform: "direct", valueMapJson: "", confidence: 100, isActive: true, notes: "", ...patch });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sourceId ? String(sourceId) : "all"} onValueChange={value => setSourceId(value === "all" ? null : Number(value))}>
          <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map(source => <SelectItem key={source.id} value={String(source.id)}>{source.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setDraft(blank())}><Plus className="mr-1.5 h-4 w-4" />Add mapping</Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Overrides ({mappings.data?.overrides.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Field</TableHead><TableHead>Target</TableHead><TableHead>Transform</TableHead><TableHead>Confidence</TableHead><TableHead>Active</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {mappings.data?.overrides.map(row => (
                <TableRow key={row.id}>
                  <TableCell>{sourceName(row.sourceId)}{row.provider ? ` · ${row.provider}` : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{row.resource}.{row.sourceField}</TableCell>
                  <TableCell className="font-mono text-xs">{row.target}</TableCell>
                  <TableCell>{row.transform}</TableCell>
                  <TableCell>{row.confidence}</TableCell>
                  <TableCell>{row.isActive ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDraft({ id: row.id, sourceId: row.sourceId, provider: row.provider, resource: row.resource, sourceField: row.sourceField, resoField: row.resoField ?? "", target: row.target, transform: row.transform, valueMapJson: row.valueMap ? JSON.stringify(row.valueMap, null, 2) : "", confidence: row.confidence, isActive: row.isActive, notes: row.notes ?? "" })}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => { if (!window.confirm("Delete this mapping?")) return; await remove.mutateAsync({ id: row.id }); await utils.mlsProperties.mappings.invalidate(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {mappings.data && !mappings.data.overrides.length ? <p className="text-sm text-muted-foreground">No overrides. RESO standard fields map through the defaults below.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Local fields a feed publishes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Select value={feedId ? String(feedId) : undefined} onValueChange={value => setFeedId(Number(value))}>
            <SelectTrigger className="w-[320px]"><SelectValue placeholder="Choose a feed" /></SelectTrigger>
            <SelectContent>{feeds.map(feed => <SelectItem key={feed.id} value={String(feed.id)}>{feed.name}</SelectItem>)}</SelectContent>
          </Select>
          {local.data ? (
            <>
              <p className="text-xs text-muted-foreground">{local.data.fields.length} local of {local.data.fieldCount} fields · metadata {formatDateTime(local.data.fetchedAt)}. Unmapped local fields are still stored on every listing under localFields.</p>
              <div className="max-h-[360px] overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Type</TableHead><TableHead>Mapped to</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {local.data.fields.map(field => (
                      <TableRow key={field.name}>
                        <TableCell className="font-mono text-xs">{field.name}</TableCell>
                        <TableCell className="text-xs">{field.type}</TableCell>
                        <TableCell className="font-mono text-xs">{field.mappedTo ?? <span className="text-muted-foreground">localFields</span>}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { const feed = feeds.find(item => item.id === feedId); setDraft(blank({ sourceId: feed?.sourceId ?? null, sourceField: field.name, target: `local.${field.name.replace(/[^A-Za-z0-9_]/g, "")}` })); }}>Map</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">RESO defaults ({mappings.data?.defaults.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Group</TableHead><TableHead>Canonical field</TableHead><TableHead>RESO source fields</TableHead><TableHead>Transform</TableHead></TableRow></TableHeader>
              <TableBody>
                {mappings.data?.defaults.map(rule => (
                  <TableRow key={rule.target}>
                    <TableCell className="text-xs">{rule.group}</TableCell>
                    <TableCell className="font-mono text-xs">{rule.target}</TableCell>
                    <TableCell className="font-mono text-xs">{rule.sources.join(", ")}</TableCell>
                    <TableCell className="text-xs">{rule.transform}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{draft?.id ? "Edit mapping" : "Add mapping"}</DialogTitle></DialogHeader>
          {draft ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Source</Label>
                <Select value={draft.sourceId ? String(draft.sourceId) : "all"} onValueChange={value => setDraft({ ...draft, sourceId: value === "all" ? null : Number(value) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {sources.map(source => <SelectItem key={source.id} value={String(source.id)}>{source.shortName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Resource</Label>
                <Select value={draft.resource} onValueChange={value => setDraft({ ...draft, resource: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Property", "Member", "Office", "OpenHouse"].map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Source field</Label><Input className="font-mono" value={draft.sourceField} onChange={event => setDraft({ ...draft, sourceField: event.target.value })} placeholder="CAR_ShortTermRentalYN" /></div>
              <div><Label>RESO equivalent (optional)</Label><Input className="font-mono" value={draft.resoField} onChange={event => setDraft({ ...draft, resoField: event.target.value })} /></div>
              <div className="sm:col-span-2">
                <Label>Target</Label>
                <Input className="font-mono" value={draft.target} onChange={event => setDraft({ ...draft, target: event.target.value })} placeholder="listing.zoning, feature.view, local.strAllowed, insight.strAllowed, ignore" />
                <p className="mt-1 text-[11px] text-muted-foreground">Insight fields: {mappings.data?.insightFields.join(", ")}</p>
              </div>
              <div>
                <Label>Transform</Label>
                <Select value={draft.transform} onValueChange={value => setDraft({ ...draft, transform: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(mappings.data?.transforms ?? []).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Confidence (0 to 100)</Label><Input type="number" value={draft.confidence} onChange={event => setDraft({ ...draft, confidence: Number(event.target.value) })} /></div>
              {draft.transform === "enum_map" ? (
                <div className="sm:col-span-2"><Label>Value map (JSON)</Label><Textarea rows={4} className="font-mono text-xs" value={draft.valueMapJson} onChange={event => setDraft({ ...draft, valueMapJson: event.target.value })} placeholder='{"Yes": "yes", "No": "no"}' /></div>
              ) : null}
              <div className="sm:col-span-2"><Label>Notes</Label><Textarea rows={2} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.isActive} onCheckedChange={value => setDraft({ ...draft, isActive: value })} />Active</label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>Save mapping</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HealthPanel({ feeds }: { feeds: MlsFeedView[] }) {
  const overview = trpc.mlsProperties.overview.useQuery(undefined, { refetchInterval: 30_000 });
  const photo = trpc.mlsProperties.photoHealth.useQuery(undefined, { refetchInterval: 60_000 });
  const usage = trpc.mlsProperties.usage.useQuery({ hours: 48 }, { refetchInterval: 60_000 });
  const usageByCredential = useMemo(() => {
    const totals = new Map<string, { provider: string; requests: number; bytes: number; mediaRequests: number; mediaBytes: number; throttled: number; lastHour: number }>();
    const hourAgo = Date.now() - 3_600_000;
    for (const row of usage.data ?? []) {
      const entry = totals.get(row.credentialRef) ?? { provider: row.provider, requests: 0, bytes: 0, mediaRequests: 0, mediaBytes: 0, throttled: 0, lastHour: 0 };
      entry.requests += row.requests;
      entry.bytes += row.bytes;
      entry.mediaRequests += row.mediaRequests;
      entry.mediaBytes += row.mediaBytes;
      entry.throttled += row.throttled;
      if (new Date(row.windowStart).getTime() >= hourAgo) entry.lastHour += row.requests;
      totals.set(row.credentialRef, entry);
    }
    return Array.from(totals.entries());
  }, [usage.data]);
  const data = overview.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Store</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Properties</span><span className="font-semibold">{formatNumber(data?.properties)}</span></div>
          {data?.listingsByStatus.map(row => (
            <div key={row.status} className="flex justify-between"><span className="text-muted-foreground">{statusStyle(row.status).label} listings</span><span>{formatNumber(row.count)}</span></div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Photo pipeline</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {photo.data?.photoStorage?.configurationValid === false ? (
            <p className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Photo downloads paused: {photo.data.photoStorage.issue}</p>
          ) : photo.data?.photoStorage?.configurationValid ? (
            <p className="text-muted-foreground">Private photo storage variables are present on the worker. This does not verify bucket access.</p>
          ) : photo.data ? (
            <p className="text-amber-800">Waiting for the worker to report its photo storage configuration.</p>
          ) : null}
          {photo.data?.queue.length ? photo.data.queue.map(row => (
            <div key={`${row.feedId}:${row.status}`} className="flex justify-between gap-3"><span className="text-muted-foreground">{feeds.find(feed => feed.id === row.feedId)?.name ?? `Feed #${row.feedId}`} · {row.status}</span><span className="font-medium">{formatNumber(row.count)}</span></div>
          )) : <p className="text-muted-foreground">{photo.isLoading ? "Checking photo queue..." : photo.isError ? "Photo queue unavailable. Try again shortly." : "No photo rows queued or stored yet."}</p>}
          {photo.data?.activeGalleryScans.map(scan => (
            <div key={`gallery-${scan.feedId}`} className="rounded border px-2 py-1.5 text-xs">
              <span className="font-medium">{feeds.find(feed => feed.id === scan.feedId)?.name ?? `Feed #${scan.feedId}`} · Active galleries</span>
              <div className="text-muted-foreground">{formatNumber(scan.scanned)} listings checked · {scan.phase === "initial" ? "first scan in progress" : "watching for new Active listings"}</div>
            </div>
          ))}
          {photo.data?.lastMediaActivity ? <p className="text-xs text-muted-foreground">Last photo batch {timeAgo(photo.data.lastMediaActivity.at)}: {formatNumber(photo.data.lastMediaActivity.stored)} stored, {formatNumber(photo.data.lastMediaActivity.failed)} failed, {formatNumber(photo.data.lastMediaActivity.expired)} URLs expired.</p> : null}
          {photo.data?.laneUsage.map(lane => (
            <div key={lane.key} className="rounded border p-2 text-xs">
              <div className="font-medium">{feeds.find(feed => `${feed.provider}:${feed.credentialRef}` === lane.key)?.name ?? lane.key}</div>
              {lane.mediaDay ? <div>Photo requests, rolling 24 hours: {formatNumber(lane.mediaDay.used)} / {formatNumber(lane.mediaDay.limit)}</div> : null}
              {lane.mediaHour ? <div>Photo requests, rolling hour: {formatNumber(lane.mediaHour.used)} / {formatNumber(lane.mediaHour.limit)}</div> : null}
              {lane.sharedDay ? <div className="text-muted-foreground">All requests on token, rolling 24 hours: {formatNumber(lane.sharedDay.used)} / {formatNumber(lane.sharedDay.limit)}</div> : null}
              {lane.mediaDay && lane.mediaDay.used >= lane.mediaDay.limit ? <p className="mt-1 text-amber-800">Photo allocation exhausted; new downloads wait for usage to age out.</p> : null}
              {lane.downloading ? <p className="mt-1 text-muted-foreground">Photo batch active</p> : null}
              {lane.pausedForMs > 0 ? <p className="mt-1 text-amber-800">Provider retry pause active</p> : null}
            </div>
          ))}
          {photo.data?.worker && !photo.data.worker.alive ? <p className="text-red-700">The MLS worker has not checked in recently.</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Ingestion workers</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data?.workers.length ? data.workers.map(worker => (
            <div key={worker.workerId} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 truncate">{worker.alive ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-zinc-400" />}<span className="truncate font-mono text-xs">{worker.workerId}</span></span>
              <span className="shrink-0 text-xs text-muted-foreground">beat {timeAgo(worker.lastBeatAt)}</span>
            </div>
          )) : <p className="text-muted-foreground">No worker has checked in. Start the MLS worker service (see docs/mls-properties.md).</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Provider usage, last 48 hours</CardTitle></CardHeader>
        <CardContent>
          {usageByCredential.length ? (
            <Table>
              <TableHeader><TableRow><TableHead>Credential</TableHead><TableHead className="text-right">Requests</TableHead><TableHead className="text-right">Last hour</TableHead><TableHead className="text-right">Data</TableHead><TableHead className="text-right">Media</TableHead><TableHead className="text-right">Throttled</TableHead></TableRow></TableHeader>
              <TableBody>
                {usageByCredential.map(([ref, row]) => (
                  <TableRow key={ref}>
                    <TableCell className="font-mono text-xs">{ref}<div className="text-[11px] text-muted-foreground">{row.provider}</div></TableCell>
                    <TableCell className="text-right">{formatNumber(row.requests)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.lastHour)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.bytes / 1_048_576, 1)} MB</TableCell>
                    <TableCell className="text-right">{formatNumber(row.mediaBytes / 1_073_741_824, 2)} GB</TableCell>
                    <TableCell className="text-right">{formatNumber(row.throttled)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <p className="text-sm text-muted-foreground">No provider requests yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MlsFeedsPage() {
  const query = trpc.mlsProperties.sources.useQuery(undefined, { refetchInterval: 20_000 });
  const [feedForm, setFeedForm] = useState<FeedForm | null>(null);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [tab, setTab] = useState("sources");
  const [runsFeedId, setRunsFeedId] = useState<number | null>(null);
  const sources = query.data?.sources ?? [];
  const feeds = sources.flatMap(source => source.feeds);
  const sourceById = new Map(sources.map(source => [source.id, source]));

  return (
    <div className="space-y-4 pb-10">
      <Link href="/mls-properties" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to MLS Properties</Link>
      <PageHeader title="MLS feeds and mappings" subtitle="Sources, provider connections, sync health, and the field mapping registry" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sources">Sources ({sources.length})</TabsTrigger>
          <TabsTrigger value="feeds">Feeds ({feeds.length})</TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="mappings">Mappings</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="space-y-4">
          {query.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader><TableRow><TableHead>MLS</TableHead><TableHead>Territory</TableHead><TableHead>Route</TableHead><TableHead>Status</TableHead><TableHead>Feeds</TableHead><TableHead>Rules</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {sources.map(source => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div className="font-medium">{source.name}</div>
                        <div className="text-[11px] text-muted-foreground">{source.originatingSystemName ? `OSN ${source.originatingSystemName}` : ""}{source.keyPrefix ? ` · prefix ${source.keyPrefix}` : ""}</div>
                      </TableCell>
                      <TableCell className="max-w-[240px] text-xs">{source.territory}</TableCell>
                      <TableCell className="text-xs">{source.routeLabel}<div className="max-w-[220px] truncate text-[11px] text-muted-foreground" title={source.routeNote ?? ""}>{source.routeNote}</div></TableCell>
                      <TableCell><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${ONBOARDING_STYLES[source.onboardingStatus] ?? ""}`}>{source.onboardingStatus}</span></TableCell>
                      <TableCell className="text-xs">
                        {source.feeds.length ? source.feeds.map(feed => (
                          <div key={feed.id} className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${feed.enabled ? (feed.status === "error" ? "bg-red-500" : "bg-emerald-500") : "bg-zinc-300"}`} />
                            {feed.feedType.toUpperCase()} · {FRESHNESS_STYLES[feed.freshness].label}
                          </div>
                        )) : <span className="text-muted-foreground">None</span>}
                      </TableCell>
                      <TableCell className="text-xs">{source.compliance.basis === "signed_license" ? <Badge variant="outline">Signed</Badge> : <span className="text-amber-700">Baseline</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditingSource(source)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => setFeedForm(newFeedForm(source))}><Plus className="mr-1 h-3.5 w-3.5" />Feed</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {query.data?.unresolvedMarkets.length ? (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" />Markets to confirm before applying</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {query.data.unresolvedMarkets.map(market => <div key={market.territory}><span className="font-medium">{market.territory}:</span> <span className="text-muted-foreground">{market.question}</span></div>)}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="feeds">
          <Card>
            <CardContent className="pt-4">
              {feeds.length ? (
                <Table>
                  <TableHeader><TableRow><TableHead>Feed</TableHead><TableHead>Provider</TableHead><TableHead>Credentials</TableHead><TableHead>State</TableHead><TableHead>Freshness</TableHead><TableHead>Last success</TableHead><TableHead>Schedule</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {feeds.map(feed => (
                      <TableRow key={feed.id}>
                        <TableCell><div className="font-medium">{feed.name}</div><div className="text-[11px] text-muted-foreground">{sourceById.get(feed.sourceId)?.shortName} · {feed.feedType.toUpperCase()}</div></TableCell>
                        <TableCell className="text-xs">{feed.providerLabel}<div className="max-w-[200px] truncate text-[11px] text-muted-foreground" title={feed.baseUrl}>{feed.baseUrl}</div></TableCell>
                        <TableCell className="text-xs">
                          {feed.credentialsConfigured ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700"><KeyRound className="h-3.5 w-3.5" />{feed.credentialRef}</span>
                          ) : (
                            <span className="text-amber-700" title={feed.expectedVariables.map(set => set.join(" + ")).join(" or ")}>Missing: {feed.expectedVariables[0]?.join(", ")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant={feed.status === "error" ? "destructive" : "outline"}>{feed.enabled ? feed.status : "disabled"}</Badge>
                          {feed.leased ? <span className="ml-1 text-[11px] text-muted-foreground">running</span> : null}
                          {feed.lastError ? <div className="max-w-[220px] truncate text-[11px] text-red-700" title={feed.lastError}>{feed.lastError}</div> : null}
                        </TableCell>
                        <TableCell><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${FRESHNESS_STYLES[feed.freshness].className}`}>{FRESHNESS_STYLES[feed.freshness].label}</span><div className="text-[11px] text-muted-foreground">max {feed.maxRefreshHours}h</div></TableCell>
                        <TableCell className="text-xs">{formatDateTime(feed.lastSuccessAt)}<div className="text-[11px] text-muted-foreground">{feed.initialImportCompletedAt ? "Initial import done" : "Initial import pending"}</div></TableCell>
                        <TableCell className="text-xs">every {feed.syncIntervalMinutes}m<div className="text-[11px] text-muted-foreground">reconcile {feed.reconcileIntervalHours}h</div></TableCell>
                        <TableCell className="text-right"><FeedActions feed={feed} onEdit={() => setFeedForm(formFromFeed(feed))} onRuns={() => { setRunsFeedId(feed.id); setTab("runs"); }} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No feeds yet. Add one from the Sources tab. Canopy through MLS Grid is first.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs"><RunsPanel feeds={feeds} feedId={runsFeedId} setFeedId={setRunsFeedId} /></TabsContent>
        <TabsContent value="mappings"><MappingsPanel sources={sources} feeds={feeds} /></TabsContent>
        <TabsContent value="health"><HealthPanel feeds={feeds} /></TabsContent>
      </Tabs>

      {query.data ? <FeedDialog form={feedForm} onClose={() => setFeedForm(null)} sources={sources} providers={query.data.providers} /> : null}
      <SourceDialog source={editingSource} onClose={() => setEditingSource(null)} />
    </div>
  );
}
