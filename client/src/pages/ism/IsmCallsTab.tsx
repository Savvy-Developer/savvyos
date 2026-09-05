import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  PhoneCall,
  Search,
  UserRound,
  Volume2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DrilldownValue } from "@/components/DrilldownValue";
import { RecordDrilldownDialog } from "@/components/RecordDrilldownDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZE = 50;

type MatchStatus = "all" | "matched" | "unmatched";
type Direction = "all" | "inbound" | "outbound";
type CallLength = "all" | "under_1_minute" | "one_to_five_minutes" | "five_to_fifteen_minutes" | "fifteen_plus_minutes";
type TranscriptStatus = "all" | "available" | "unavailable";

function titleCase(value: string | null | undefined) {
  return (value ?? "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function dateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function duration(value: number | null | undefined) {
  const seconds = Number(value ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function MatchBadge({ status }: { status: string }) {
  const matched = status === "matched";
  return (
    <Badge
      variant="outline"
      className={matched
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-800"}
    >
      {matched ? "Matched" : "Unmatched"}
    </Badge>
  );
}

function CallDetailDialog({
  callId,
  onOpenChange,
}: {
  callId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const detailQuery = trpc.aircall.getCallDetail.useQuery(
    { aircallCallId: callId ?? 0 },
    { enabled: Boolean(callId), refetchOnWindowFocus: false },
  );
  const call = detailQuery.data as any;

  return (
    <Dialog open={Boolean(callId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
        {detailQuery.isLoading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm">Loading call details…</p>
          </div>
        ) : detailQuery.error || !call ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <PhoneCall className="h-8 w-8 text-rose-600" />
            <p className="font-semibold">Unable to load this call</p>
            <p className="max-w-md text-sm text-muted-foreground">{detailQuery.error?.message ?? "The Aircall record could not be found."}</p>
          </div>
        ) : (
          <>
            <DialogHeader className="pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{titleCase(call.direction)} call</DialogTitle>
                <MatchBadge status={call.matchStatus} />
                <Badge variant="secondary">{titleCase(call.status)}</Badge>
              </div>
              <DialogDescription>
                {dateTime(call.startedAt)} · {duration(call.duration)} · Aircall #{call.aircallCallId}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                {call.contactId ? (
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/contacts/${call.contactId}`);
                    }}
                  >
                    {call.contactName ?? "Open contact"} <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <p className="mt-1 font-medium text-amber-800">No contact matched</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{call.contactEmail ?? call.contactPhone ?? "No contact detail available"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Numbers</p>
                <p className="mt-1 text-sm">{call.callerNumber ?? "—"} <span className="text-muted-foreground">→</span> {call.calleeNumber ?? "—"}</p>
                {call.aircallNumberName && <p className="mt-1 text-xs text-muted-foreground">Line: {call.aircallNumberName}</p>}
              </div>
            </div>

            {(call.recordingUrl || call.voicemailUrl) && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Audio</h3>
                </div>
                {call.recordingUrl && (
                  <div className="rounded-lg border p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Call recording</p>
                    <audio className="w-full" controls preload="none" src={call.recordingUrl}>Your browser does not support audio playback.</audio>
                  </div>
                )}
                {call.voicemailUrl && (
                  <div className="rounded-lg border p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Voicemail</p>
                    <audio className="w-full" controls preload="none" src={call.voicemailUrl}>Your browser does not support audio playback.</audio>
                  </div>
                )}
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">AI call summary</h3>
              </div>
              {call.summary ? (
                <p className="rounded-lg border bg-primary/[0.04] p-3 text-sm leading-6">{call.summary}</p>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No AI summary is available for this call yet. Summaries are created after a recording has been transcribed.</p>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <AudioLines className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Transcript</h3>
              </div>
              {call.transcript ? (
                <div className="max-h-80 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm leading-6 whitespace-pre-wrap">{call.transcript}</div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No transcript is available. Unmatched calls do not have a linked CRM activity, and calls without stored audio cannot be transcribed.</p>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function IsmCallsTab() {
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [matchStatus, setMatchStatus] = useState<MatchStatus>("all");
  const [direction, setDirection] = useState<Direction>("all");
  const [callLength, setCallLength] = useState<CallLength>("all");
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>("all");
  const [page, setPage] = useState(1);
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [callDrilldown, setCallDrilldown] = useState<TranscriptStatus | null>(null);
  const [callDrilldownPage, setCallDrilldownPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const callQuery = trpc.aircall.listAll.useQuery(
    { page, limit: PAGE_SIZE, search, matchStatus, direction, callLength, transcriptStatus },
    { refetchInterval: 60_000, refetchOnWindowFocus: false },
  );
  const callDrilldownQuery = trpc.aircall.listAll.useQuery(
    { page: callDrilldownPage, limit: PAGE_SIZE, search, matchStatus, direction, callLength, transcriptStatus: callDrilldown ?? "all" },
    { enabled: Boolean(callDrilldown), refetchOnWindowFocus: false },
  );
  const data = callQuery.data as any;
  const rows = data?.rows ?? [];

  const updateMatchStatus = (value: MatchStatus) => {
    setMatchStatus(value);
    setPage(1);
  };
  const updateDirection = (value: Direction) => {
    setDirection(value);
    setPage(1);
  };
  const updateCallLength = (value: CallLength) => {
    setCallLength(value);
    setPage(1);
  };
  const updateTranscriptStatus = (value: TranscriptStatus) => {
    setTranscriptStatus(value);
    setPage(1);
  };
  const openCallDrilldown = (transcriptFilter: TranscriptStatus) => {
    setCallDrilldown(transcriptFilter);
    setCallDrilldownPage(1);
  };
  const callDrilldownData = callDrilldownQuery.data as any;
  const callDrilldownRecords = (callDrilldownData?.rows ?? []).map((call: any) => ({
    recordId: Number(call.aircallCallId),
    recordType: "call" as const,
    contactId: Number(call.contactId ?? 0),
    contactName: call.contactName ?? call.contactPhone ?? call.callerNumber ?? call.calleeNumber ?? "Unknown number",
    leadSourceName: call.contactEmail ?? "No CRM contact detail",
    agentName: call.aircallNumberName ?? "Aircall line",
    occurredAt: dateTime(call.startedAt),
    direction: call.direction,
    duration: Number(call.duration ?? 0),
    hasTranscript: Boolean(call.hasTranscript),
    intentTier: call.status,
    intentScore: 0,
    nextBestAction: call.summary ?? "Open call details to review the recording, native summary, and transcript.",
  }));

  return (
    <div className="space-y-5">
      <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.07] via-background to-sky-50/50">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Aircall intelligence</p>
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">Every call, including unmatched numbers</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review newest calls first, open the connected contact where one exists, and inspect recordings, summaries, and transcripts without leaving the manager dashboard.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="w-fit"><DrilldownValue onClick={() => openCallDrilldown(transcriptStatus)} label="matching call records" className="decoration-current/35 hover:text-primary">{data ? `${Number(data.total).toLocaleString()} matching calls` : "Loading calls…"}</DrilldownValue></Badge>
              {data && <Badge variant="outline" className="w-fit border-primary/30 bg-background/70 text-primary"><DrilldownValue onClick={() => openCallDrilldown("available")} label="calls with transcripts" className="decoration-current/35">{Number(data.totalWithTranscripts).toLocaleString()} calls with transcripts</DrilldownValue></Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_160px_180px_170px]">
            <div className="space-y-1.5">
              <Label htmlFor="ism-call-search" className="text-xs">Search calls</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="ism-call-search" value={searchInput} onChange={event => setSearchInput(event.target.value)} className="pl-9" placeholder="Contact, phone, email, call ID, status, summary, or transcript…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Match status</Label>
              <Select value={matchStatus} onValueChange={value => updateMatchStatus(value as MatchStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All calls</SelectItem>
                  <SelectItem value="matched">Matched contacts</SelectItem>
                  <SelectItem value="unmatched">Unmatched calls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Direction</Label>
              <Select value={direction} onValueChange={value => updateDirection(value as Direction)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Inbound & outbound</SelectItem>
                  <SelectItem value="inbound">Inbound only</SelectItem>
                  <SelectItem value="outbound">Outbound only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Call length</Label>
              <Select value={callLength} onValueChange={value => updateCallLength(value as CallLength)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any length</SelectItem>
                  <SelectItem value="under_1_minute">Under 1 minute</SelectItem>
                  <SelectItem value="one_to_five_minutes">1–5 minutes</SelectItem>
                  <SelectItem value="five_to_fifteen_minutes">5–15 minutes</SelectItem>
                  <SelectItem value="fifteen_plus_minutes">15+ minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Transcript</Label>
              <Select value={transcriptStatus} onValueChange={value => updateTranscriptStatus(value as TranscriptStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any availability</SelectItem>
                  <SelectItem value="available">Transcript available</SelectItem>
                  <SelectItem value="unavailable">No transcript</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Call log</CardTitle>
              <CardDescription>Sorted newest first. The summary and transcript columns show whether the matched call has completed AI processing.</CardDescription>
            </div>
            {callQuery.isFetching && <Badge variant="outline" className="w-fit gap-1"><Loader2 className="h-3 w-3 animate-spin" />Refreshing</Badge>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {callQuery.isLoading && !data ? (
            <div className="flex h-80 flex-col items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-7 w-7 animate-spin text-primary" /><p className="text-sm">Loading Aircall records…</p></div>
          ) : callQuery.error ? (
            <div className="flex h-80 flex-col items-center justify-center gap-3 px-6 text-center"><PhoneCall className="h-8 w-8 text-rose-600" /><p className="font-semibold">Unable to load the Aircall log</p><p className="max-w-xl text-sm text-muted-foreground">{callQuery.error.message}</p><Button size="sm" onClick={() => callQuery.refetch()}>Try again</Button></div>
          ) : rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-y text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-left font-semibold">When</th>
                    <th className="px-3 py-3 text-left font-semibold">Call</th>
                    <th className="px-3 py-3 text-left font-semibold">Contact / phone</th>
                    <th className="px-3 py-3 text-left font-semibold">Status</th>
                    <th className="px-3 py-3 text-left font-semibold">Summary & transcript</th>
                    <th className="px-4 py-3 text-right font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((call: any) => (
                    <tr key={`${call.matchStatus}-${call.aircallCallId}`} className="border-b last:border-0 hover:bg-muted/25">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{dateTime(call.startedAt)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2"><Badge variant="outline">{titleCase(call.direction)}</Badge><span className="font-medium tabular-nums">{duration(call.duration)}</span></div>
                        <p className="mt-1 text-xs text-muted-foreground">#{call.aircallCallId}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2"><MatchBadge status={call.matchStatus} /></div>
                        {call.contactId ? (
                          <button type="button" className="mt-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline" onClick={() => navigate(`/contacts/${call.contactId}`)}><UserRound className="h-3.5 w-3.5" />{call.contactName ?? "Open contact"}</button>
                        ) : (
                          <p className="mt-1 font-medium text-amber-800">{call.contactPhone ?? call.callerNumber ?? call.calleeNumber ?? "Unknown number"}</p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">{call.contactEmail ?? (call.contactId ? call.contactPhone : "No CRM match")}</p>
                      </td>
                      <td className="px-3 py-3"><Badge variant="secondary">{titleCase(call.status)}</Badge><p className="mt-1 text-xs text-muted-foreground">{call.aircallNumberName ?? "Aircall line"}</p></td>
                      <td className="max-w-[360px] px-3 py-3">
                        {call.summary ? <p className="line-clamp-2 text-xs leading-5 text-foreground">{call.summary}</p> : <p className="text-xs text-muted-foreground">No AI summary yet</p>}
                        <p className="mt-1 text-xs text-muted-foreground">{call.hasTranscript ? "Transcript available" : "No transcript"}</p>
                      </td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setSelectedCallId(call.aircallCallId)}>Details <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-80 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Search className="h-8 w-8 opacity-40" /><p className="font-medium text-foreground">No calls match this search</p><p className="max-w-md text-sm">Try a different number, contact name, status, direction, call-length, match-status, or transcript filter.</p></div>
          )}
          {data && (
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Page {data.page} of {data.totalPages} · {Number(data.total).toLocaleString()} total call{Number(data.total) === 1 ? "" : "s"}</p>
              <div className="flex gap-2"><Button size="sm" variant="outline" disabled={data.page <= 1 || callQuery.isFetching} onClick={() => setPage((current: number) => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button size="sm" variant="outline" disabled={data.page >= data.totalPages || callQuery.isFetching} onClick={() => setPage((current: number) => current + 1)}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
            </div>
          )}
        </CardContent>
      </Card>

      <CallDetailDialog callId={selectedCallId} onOpenChange={open => { if (!open) setSelectedCallId(null); }} />
      <RecordDrilldownDialog
        open={Boolean(callDrilldown)}
        onOpenChange={open => { if (!open) setCallDrilldown(null); }}
        data={callDrilldownData ? { title: callDrilldown === "available" ? "Calls with transcripts" : "Matching calls", description: callDrilldown === "available" ? "Every call with a stored transcript under the current Calls-page filters." : "Every call under the current Calls-page filters.", recordNoun: "calls", total: Number(callDrilldownData.total ?? 0), page: Number(callDrilldownData.page ?? 1), limit: PAGE_SIZE, records: callDrilldownRecords } : undefined}
        isLoading={callDrilldownQuery.isLoading}
        error={callDrilldownQuery.error?.message}
        onPreviousPage={() => setCallDrilldownPage(current => Math.max(1, current - 1))}
        onNextPage={() => setCallDrilldownPage(current => current + 1)}
        onOpenContact={contactId => navigate(`/contacts/${contactId}`)}
        onOpenRecord={record => { setCallDrilldown(null); setSelectedCallId(record.recordId); }}
      />
    </div>
  );
}
