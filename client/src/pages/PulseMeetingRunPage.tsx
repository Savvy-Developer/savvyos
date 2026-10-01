import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Flag, Pause, Play, Send, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { PulseInlineItemRow, PulseItemEditor } from "@/components/pulse/PulseItemEditor";
import { PulseMeetingCompletionRail } from "@/components/pulse/PulseMeetingCompletionRail";
import { PulseIssueTimeframeFilter, type IssueTimeframeFilterValue } from "@/components/pulse/PulseWorkItemBadges";
import { PulseCascadeDraftDialog } from "@/components/pulse/PulseCascadeComposer";
import { PulseCascadeCard } from "@/components/pulse/PulseCascadeCard";
import { ALL_ROCK_OWNERS, PulseRockOwnerFilter, rockOwnerKey } from "@/components/pulse/PulseRockOwnerFilter";
import {
  PulseRunnerIssueDialog,
  type PulseRunnerIssueSourceRequest,
} from "@/components/pulse/PulseRunnerIssueDialog";

const stepMeta: Record<string, { title: string; description: string }> = {
  segue: { title: "Segue", description: "Share personal and professional wins. Keep it brief and reset for the meeting." },
  headlines: { title: "Headlines", description: "Share customer, employee, and operating news. Drop concerns to IDS." },
  cascades: { title: "Incoming Cascades", description: "Acknowledge the messages another Pulse meeting sent here before moving into this L10’s operating review." },
  scorecard: { title: "Scorecard", description: "Review each measurable. Drop off-track numbers to IDS—do not solve them here." },
  rocks: { title: "Rock Review", description: "Each Rock owner reports on track or off track. Move obstacles to IDS." },
  todos: { title: "To-Dos", description: "Review current commitments and complete or carry forward what remains." },
  issues: { title: "IDS", description: "Identify the real issue, discuss it directly, and solve it with clear commitments." },
  conclude: { title: "Conclude", description: "Confirm commitments, prepare cascading messages, collect ratings, and end on time." },
};

function formatTime(seconds: number) {
  const value = Math.abs(seconds);
  return `${seconds < 0 ? "+" : ""}${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function displayNumber(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function issueSourceKey(sourceType: PulseRunnerIssueSourceRequest["sourceType"], sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

function IssueFlagButton({
  source,
  flaggedIssueId,
  onFlag,
}: {
  source: PulseRunnerIssueSourceRequest;
  flaggedIssueId?: string;
  onFlag: (source: PulseRunnerIssueSourceRequest) => void;
}) {
  return flaggedIssueId ? (
    <span
      className="inline-flex min-h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800"
      title="An Issue was already created from this item in this L10."
    >
      In IDS
    </span>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-8 shrink-0 gap-1.5"
      onClick={() => onFlag(source)}
      aria-label={`Flag ${source.sourceLabel.toLowerCase()} for IDS`}
      title="Add this context to the IDS Issues list"
    >
      <Flag className="h-3.5 w-3.5 text-amber-600" />
      Flag for IDS
    </Button>
  );
}

function UpdateList({
  items,
  flaggedSources,
  onFlagIssue,
}: {
  items: any[];
  flaggedSources: Map<string, string>;
  onFlagIssue: (source: PulseRunnerIssueSourceRequest) => void;
}) {
  return <div className="space-y-2">{items.length ? items.map((item: any) => {
    const source: PulseRunnerIssueSourceRequest = {
      sourceType: "headline",
      sourceId: item.id,
      sourceLabel: "Headline",
      defaultTitle: `Headline: ${String(item.body).slice(0, 450)}`,
      summary: `${item.authorName ?? "Meeting participant"}: ${item.body}`,
    };
    return <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background p-3"><div className="min-w-0 flex-1"><p className="text-sm">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{item.authorName ?? "Participant"}</p></div><IssueFlagButton source={source} flaggedIssueId={flaggedSources.get(issueSourceKey(source.sourceType, source.sourceId))} onFlag={onFlagIssue} /></div>;
  }) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing has been added yet. Add it from the dashboard or capture it below.</p>}</div>;
}

function SegueStep({ data, sessionId, onChanged }: { data: any; sessionId: string; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const create = trpc.pulse.l10.createUpdate.useMutation({ onSuccess: () => { setBody(""); onChanged(); }, onError: (error) => toast.error(error.message) });
  return <div className="space-y-4"><div className="space-y-2">{data.sections.segue.length ? data.sections.segue.map((item: any) => <div key={item.id} className="rounded-lg border border-border bg-background p-3"><p className="text-sm">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{item.authorName ?? "Participant"}</p></div>) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing has been added yet. Add it from the dashboard or capture it below.</p>}</div><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) create.mutate({ meetingId: data.meeting.id, sessionId, updateType: "segue", body: body.trim() }); }}><Input className="min-h-11" value={body} onChange={(event) => setBody(event.target.value)} placeholder="A personal or professional best…"/><Button type="submit" disabled={!body.trim() || create.isPending}>Add</Button></form></div>;
}

function ScorecardStep({ data, flaggedSources, onFlagIssue }: { data: any; flaggedSources: Map<string, string>; onFlagIssue: (source: PulseRunnerIssueSourceRequest) => void }) {
  return <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-3">Measurable</th><th className="pb-3">Owner</th><th className="pb-3">Current</th><th className="pb-3">Target</th><th className="pb-3">Signal</th><th className="pb-3 text-right"><span className="sr-only">IDS action</span></th></tr></thead><tbody>{data.sections.scorecard.length ? data.sections.scorecard.map((metric: any) => {
    const source: PulseRunnerIssueSourceRequest = {
      sourceType: "scorecard",
      sourceId: String(metric.metricId),
      sourceLabel: "Scorecard measurable",
      defaultTitle: `Review scorecard: ${metric.name}`,
      summary: `${metric.name} · ${metric.owner?.name ?? "Unassigned"}\nCurrent: ${displayNumber(metric.current?.value)} · Target: ${displayNumber(metric.target)}`,
    };
    return <tr key={metric.metricId} className="border-b last:border-0"><td className="py-4 font-medium">{metric.name}</td><td className="py-4 text-muted-foreground">{metric.owner.name}</td><td className="py-4 font-semibold">{displayNumber(metric.current?.value)}</td><td className="py-4">{displayNumber(metric.target)}</td><td className="py-4">{metric.onTarget === false ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Off target</span> : metric.onTarget === true ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">On track</span> : <span className="text-muted-foreground">No value</span>}</td><td className="py-4 text-right"><IssueFlagButton source={source} flaggedIssueId={flaggedSources.get(issueSourceKey(source.sourceType, source.sourceId))} onFlag={onFlagIssue} /></td></tr>;
  }) : <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No measurables are configured for this L10.</td></tr>}</tbody></table></div>;
}

function RocksStep({ data, onChanged, flaggedSources, onFlagIssue }: { data: any; onChanged: () => void; flaggedSources: Map<string, string>; onFlagIssue: (source: PulseRunnerIssueSourceRequest) => void }) {
  const update = trpc.pulse.l10.setRockStatus.useMutation({ onSuccess: onChanged, onError: (error) => toast.error(error.message) });
  const [ownerFilter, setOwnerFilter] = useState(ALL_ROCK_OWNERS);
  const [expandedRockIds, setExpandedRockIds] = useState<Set<string>>(() => new Set());
  const rocks = data.sections.rocks;
  const filteredRocks = ownerFilter === ALL_ROCK_OWNERS ? rocks : rocks.filter((rock: any) => rockOwnerKey(rock) === ownerFilter);
  const toggleRock = (rockId: string) => setExpandedRockIds(current => {
    const next = new Set(current);
    if (next.has(rockId)) next.delete(rockId);
    else next.add(rockId);
    return next;
  });
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.025] p-3"><div><p className="font-medium">Review one owner at a time</p><p className="mt-0.5 text-sm text-muted-foreground">Finish this person’s Rocks, then select the next owner.</p></div><PulseRockOwnerFilter rocks={rocks} value={ownerFilter} onValueChange={setOwnerFilter} /></div>{rocks.length ? filteredRocks.length ? filteredRocks.map((rock: any) => {
    const open = expandedRockIds.has(rock.id);
    const source: PulseRunnerIssueSourceRequest = {
      sourceType: "rock",
      sourceId: rock.id,
      sourceLabel: "Rock",
      defaultTitle: `Review Rock: ${rock.title}`,
      summary: `${rock.title} · ${rock.ownerName ?? "Unassigned"}\n${rock.status.replaceAll("_", " ")} · ${rock.percentComplete}% complete`,
    };
    return <div key={rock.id} className="overflow-hidden rounded-lg border border-border"><button type="button" className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-muted/35" onClick={() => toggleRock(rock.id)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${rock.title} Rock`}><div className="flex min-w-0 items-start gap-2"><ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} /><div className="min-w-0"><p className="truncate font-semibold">{rock.title}</p><p className="mt-1 truncate text-sm text-muted-foreground">{rock.ownerName} · {rock.percentComplete}% complete</p></div></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${rock.status === "on_track" || rock.status === "done" ? "bg-emerald-100 text-emerald-800" : rock.status === "at_risk" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{rock.status.replaceAll("_", " ")}</span></button>{open ? <div className="border-t border-border p-4">{rock.description ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{rock.description}</p> : null}{rock.definitionOfDone ? <p className="mt-2 text-sm text-muted-foreground">Done means: {rock.definitionOfDone}</p> : null}<div className="mt-3 flex flex-wrap items-center gap-2">{["on_track", "at_risk", "off_track", "done"].map((status) => <Button key={status} size="sm" variant={rock.status === status ? "default" : "outline"} disabled={update.isPending} onClick={() => update.mutate(rock.projectId ? { meetingId: data.meeting.id, projectId: rock.projectId, status: status as any } : { meetingId: data.meeting.id, workItemId: rock.id, status: status as any })}>{status.replaceAll("_", " ")}</Button>)}<IssueFlagButton source={source} flaggedIssueId={flaggedSources.get(issueSourceKey(source.sourceType, source.sourceId))} onFlag={onFlagIssue} /></div></div> : null}</div>;
  }) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No active Rocks are assigned to this owner.</p> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No Rocks are configured for review.</p>}</div>;
}

function HeadlinesStep({ data, sessionId, onChanged, flaggedSources, onFlagIssue }: { data: any; sessionId: string; onChanged: () => void; flaggedSources: Map<string, string>; onFlagIssue: (source: PulseRunnerIssueSourceRequest) => void }) {
  const [body, setBody] = useState("");
  const create = trpc.pulse.l10.createUpdate.useMutation({ onSuccess: () => { setBody(""); onChanged(); }, onError: (error) => toast.error(error.message) });
  return <div className="space-y-4"><UpdateList items={data.sections.headlines} flaggedSources={flaggedSources} onFlagIssue={onFlagIssue}/><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) create.mutate({ meetingId: data.meeting.id, sessionId, updateType: "headline", body: body.trim() }); }}><Input className="min-h-11" value={body} onChange={(event) => setBody(event.target.value)} placeholder="A customer, employee, or operating update…"/><Button type="submit" disabled={!body.trim() || create.isPending}>Add</Button></form></div>;
}

function TeamCascadeAcknowledgments({ data, sessionId, onChanged }: { data: any; sessionId: string; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const acknowledgeForMeeting = trpc.pulse.cascades.acknowledgeForMeeting.useMutation({
    onSuccess: (result) => {
      onChanged();
      void utils.pulse.personal.dashboard.invalidate();
      void utils.pulse.cascades.pending.invalidate();
      void utils.pulse.notifications.pending.invalidate();
      toast.success(`Cascade acknowledged for the team. Cleared for ${result.acknowledgedRecipientCount} recipient${result.acknowledgedRecipientCount === 1 ? "" : "s"}.`);
    },
    onError: (error) => toast.error(error.message),
  });
  const incoming = (data.sections.cascades ?? []).filter((cascade: any) =>
    cascade.pendingDestinationMeetingIds?.includes(data.meeting.id),
  );
  const canAcknowledgeForTeam = Boolean(data.permissions?.canRun);

  return <div className="space-y-3"><p className="text-sm text-muted-foreground">Review messages sent to this meeting together. Acknowledge one only when the team has received it; it will be cleared from everyone’s My EOS incoming cascades for this meeting.</p>{incoming.length ? incoming.map((cascade: any) => <article key={cascade.id} className="rounded-lg border border-border bg-background"><PulseCascadeCard message={{ ...cascade, canAcknowledge: false }} onAcknowledge={() => undefined} /><div className="border-t border-border px-3 py-3 sm:px-4"><Button type="button" className="min-h-11" disabled={!canAcknowledgeForTeam || acknowledgeForMeeting.isPending} title={canAcknowledgeForTeam ? undefined : "Only the meeting runner can acknowledge a cascade for the team."} onClick={() => acknowledgeForMeeting.mutate({ messageId: cascade.id, meetingId: data.meeting.id, sessionId })}><Check className="mr-2 h-4 w-4"/>{acknowledgeForMeeting.isPending ? "Acknowledging…" : "Acknowledge for team"}</Button>{!canAcknowledgeForTeam ? <p className="mt-2 text-xs text-muted-foreground">Only the meeting runner can acknowledge this for the team.</p> : null}</div></article>) : <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No cascading messages have been sent to this meeting.</p>}</div>;
}

function CascadesStep({ data, sessionId, onChanged }: { data: any; sessionId: string; onChanged: () => void }) {
  return <TeamCascadeAcknowledgments data={data} sessionId={sessionId} onChanged={onChanged} />;
}

function TodosStep({ data, sessionId, onCreate, onChanged }: { data: any; sessionId: string; onCreate: (type: "todo" | "issue") => void; onChanged: () => void }) {
  const todos = data.sections.todos.filter((todo: any) => !todo.parentWorkItemId);
  return <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start"><div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Expand a commitment without leaving the running L10 to update status, details, documents, links, and comments.</p><Button type="button" onClick={() => onCreate("todo")}>Add To-Do</Button></div>{todos.length ? todos.map((todo: any) => <PulseInlineItemRow key={todo.id} item={todo} defaultDestinationId={data.meeting.id} sourceSessionId={sessionId} onChanged={onChanged} />) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No To-Dos are open.</p>}</div><PulseMeetingCompletionRail meetingId={data.meeting.id} type="todo" canRecall={Boolean(data.permissions.canRecallCompletedInRun)} onChanged={onChanged} /></div>;
}

function IdsStep({ data, sessionId, onCreate, onChanged }: { data: any; sessionId: string; onCreate: (type: "todo" | "issue") => void; onChanged: () => void }) {
  const [timeframe, setTimeframe] = useState<IssueTimeframeFilterValue>("all");
  const issues = data.sections.issues.filter((issue: any) => issue.status !== "completed" && (timeframe === "all" || issue.issueTimeframe === timeframe));
  return <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start"><div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Open an Issue in place to identify, discuss, solve, add the decision, and create follow-up context.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onCreate("todo")}>Add To-Do</Button><Button type="button" onClick={() => onCreate("issue")}>Add Issue</Button></div></div><PulseIssueTimeframeFilter value={timeframe} onValueChange={setTimeframe} /><div className="space-y-3">{issues.length ? issues.map((issue: any) => <PulseInlineItemRow key={issue.id} item={issue} defaultDestinationId={data.meeting.id} sourceSessionId={sessionId} onChanged={onChanged} />) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No {timeframe === "all" ? "open Issues" : timeframe === "short_term" ? "Short Term Issues" : "Long Term Issues"}. Add a concern so IDS can start with the right work.</p>}</div></div><PulseMeetingCompletionRail meetingId={data.meeting.id} type="issue" canRecall={Boolean(data.permissions.canRecallCompletedInRun)} onChanged={onChanged} /></div>;
}

function ConcludeStep({ data, session, elapsed, attendeeIds, notes, setNotes, onSave, onClose }: { data: any; session: any; elapsed: number; attendeeIds: number[]; notes: string; setNotes: (value: string) => void; onSave: (changes: any) => void; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [ratingsByPerson, setRatingsByPerson] = useState<Record<string, { rating: number; reason: string | null }>>({});
  const canRateParticipants = Boolean(data.permissions?.canRateParticipants);
  const rate = trpc.pulse.l10.rateSession.useMutation({ onError: (error) => toast.error(error.message) });
  const close = trpc.pulse.l10.closeSession.useMutation({ onSuccess: (result) => { toast.success(`${result.cascadesPublished} cascading message${result.cascadesPublished === 1 ? "" : "s"} published. Session report is ready.`); onClose(); }, onError: (error) => toast.error(error.message) });
  useEffect(() => { setRatingsByPerson(Object.fromEntries((data.participantRatings ?? []).map((entry: any) => [String(entry.personId), { rating: entry.rating, reason: entry.reason ?? null }]))); }, [session.id, data.participantRatings]);
  const selectedPerson = data.members.find((member: any) => String(member.id) === selectedPersonId) ?? null;
  const currentRating = selectedPersonId ? ratingsByPerson[selectedPersonId] : null;
  const savedRatings = Object.values(ratingsByPerson).map(entry => entry.rating);
  const averageRating = savedRatings.length ? savedRatings.reduce((total, value) => total + value, 0) / savedRatings.length : data.sessionRatingSummary?.average ?? null;
  const ratingCount = savedRatings.length || data.sessionRatingSummary?.count || 0;
  const saveRating = (rating: number, ratingReason: string | null) => {
    if (!selectedPerson) return toast.error("Choose a meeting participant first.");
    rate.mutate({ meetingId: data.meeting.id, sessionId: session.id, personId: selectedPerson.id, rating, reason: ratingReason }, {
      onSuccess: () => {
        setRatingsByPerson(current => ({ ...current, [String(selectedPerson.id)]: { rating, reason: ratingReason } }));
        void utils.pulse.l10.runner.invalidate({ meetingId: data.meeting.id });
        setPendingRating(null); setReason("");
        toast.success(`${selectedPerson.name}’s meeting rating was saved.`);
      },
    });
  };
  const chooseRating = (value: number) => {
    if (!selectedPerson) return toast.error("Choose a meeting participant first.");
    if (value <= 7) { setReason(currentRating?.reason ?? ""); setPendingRating(value); return; }
    saveRating(value, null);
  };
  const submitClose = async () => { await close.mutateAsync({ meetingId: data.meeting.id, sessionId: session.id, elapsedSeconds: elapsed, attendeeIds, notes: notes || null }); };
  return <div className="space-y-6">
    <section className="rounded-lg border border-primary/20 bg-primary/[0.025] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Meeting ratings</h3><p className="mt-1 text-sm text-muted-foreground">One rating per participant, with the meeting average shown alongside the individual scores.</p></div><div className="rounded-md border border-primary/20 bg-background px-3 py-2 text-right"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Average rating</p><p className="text-2xl font-semibold tracking-tight">{averageRating == null ? "—" : averageRating.toFixed(1)}<span className="ml-0.5 text-sm font-medium">/10</span></p><p className="text-[11px] text-muted-foreground">{ratingCount} rating{ratingCount === 1 ? "" : "s"}</p></div></div><div aria-label="Participant ratings" className="mt-3 grid gap-2 sm:grid-cols-2">{data.members.map((member: any) => { const participantRating = ratingsByPerson[String(member.id)]; return <div key={member.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm"><span className="min-w-0 truncate font-medium">{member.name}</span><span className={participantRating ? "shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary" : "shrink-0 text-xs text-muted-foreground"}>{participantRating ? `${participantRating.rating}/10` : "Not rated"}</span></div>; })}</div>{canRateParticipants ? <div className="mt-4 border-t border-primary/15 pt-3"><p className="text-sm font-medium">Rate a participant</p><p className="mt-0.5 text-xs text-muted-foreground">Ratings of 7 or below require a reason.</p><div className="mt-3 max-w-md space-y-2"><Label htmlFor="l10-rating-participant">Participant</Label><Select value={selectedPersonId} onValueChange={setSelectedPersonId}><SelectTrigger id="l10-rating-participant" className="h-10 bg-background"><SelectValue placeholder="Choose a meeting participant" /></SelectTrigger><SelectContent>{data.members.map((member: any) => <SelectItem key={member.id} value={String(member.id)}>{member.name}</SelectItem>)}</SelectContent></Select></div>{selectedPerson ? <div className="mt-3"><p className="text-xs font-medium text-muted-foreground">Rating for {selectedPerson.name}{currentRating ? ` · currently ${currentRating.rating}/10` : ""}</p><div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <button type="button" key={value} aria-label={`Rate ${selectedPerson.name} ${value} out of 10`} aria-pressed={currentRating?.rating === value} onClick={() => chooseRating(value)} disabled={rate.isPending} className={`min-h-10 rounded-md border text-sm font-semibold transition-colors ${currentRating?.rating === value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{value}</button>)}</div>{currentRating?.reason ? <p className="mt-2 rounded bg-background px-2 py-1.5 text-xs text-muted-foreground"><span className="font-medium text-foreground">Recorded reason:</span> {currentRating.reason}</p> : null}</div> : <p className="mt-3 text-xs text-muted-foreground">Select a participant to record their rating.</p>}</div> : null}</section>
    <section><Label htmlFor="l10-session-notes">Session notes</Label><Textarea id="l10-session-notes" className="mt-2 min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} onBlur={() => onSave({ notes })} placeholder="Record decisions or context that should remain with the report."/></section>
    <Button className="min-h-11" disabled={close.isPending || rate.isPending} onClick={submitClose}>{close.isPending ? "Closing L10…" : "Close L10 & publish outcomes"}</Button>
    <Dialog open={pendingRating !== null} onOpenChange={(open) => { if (!open) { setPendingRating(null); setReason(""); } }}><DialogContent><DialogHeader><DialogTitle>Document this rating</DialogTitle><DialogDescription>Ratings of 7 or below need a reason so the facilitator and leadership team can follow up with context.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="l10-low-rating-reason">Why did {selectedPerson?.name ?? "this participant"} receive {pendingRating ?? "this"}/10?</Label><Textarea id="l10-low-rating-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-24" placeholder="Record the relevant meeting context or follow-up need…" /></div><DialogFooter><Button type="button" variant="outline" onClick={() => { setPendingRating(null); setReason(""); }}>Cancel</Button><Button type="button" disabled={!reason.trim() || rate.isPending || pendingRating === null} onClick={() => pendingRating !== null && saveRating(pendingRating, reason.trim())}>{rate.isPending ? "Saving…" : "Save rating"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export default function PulseMeetingRunPage({ meetingId }: { meetingId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.pulse.l10.runner.useQuery({ meetingId }, { refetchInterval: 15_000 });
  const start = trpc.pulse.l10.startSession.useMutation({ onSuccess: () => void refetch(), onError: (error) => toast.error(error.message) });
  const update = trpc.pulse.l10.updateSession.useMutation({ onError: (error) => toast.error(error.message) });
  const [elapsed, setElapsed] = useState(0);
  const [activeStep, setActiveStep] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [editorRequest, setEditorRequest] = useState<{ type: "todo" | "issue"; workItemId?: string } | null>(null);
  const [cascadeComposerOpen, setCascadeComposerOpen] = useState(false);
  const [issueSourceRequest, setIssueSourceRequest] = useState<PulseRunnerIssueSourceRequest | null>(null);
  const openEditor = (item: any) => setEditorRequest({ type: item.type === "issue" ? "issue" : "todo", workItemId: item.id });
  const session = data?.activeSession as any;
  const steps = (data?.runner?.steps ?? []) as string[];
  useEffect(() => { if (!session) return; setElapsed(session.elapsedSeconds ?? 0); setActiveStep(session.activeStep); setAttendeeIds(session.attendeeIds?.length ? session.attendeeIds : data?.members.map((member: any) => member.id) ?? []); setNotes(session.notes ?? ""); }, [session?.id]);
  useEffect(() => { if (!session || session.status !== "running") return; const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000); return () => window.clearInterval(timer); }, [session?.id, session?.status]);
  const stepIndex = Math.max(0, steps.indexOf(activeStep || steps[0]));
  const step = steps[stepIndex];
  const durations = (data?.runner?.durations ?? {}) as Record<string, number>;
  const totalSeconds = steps.reduce((total: number, name: string) => total + Number(durations[name] ?? 5) * 60, 0);
  const elapsedBeforeStep = steps.slice(0, stepIndex).reduce((total: number, name: string) => total + Number(durations[name] ?? 5) * 60, 0);
  const remainingStep = Number(durations[step] ?? 5) * 60 - Math.max(0, elapsed - elapsedBeforeStep);
  const flaggedSources = useMemo(() => new Map(
    ((data?.runner?.flaggedSources ?? []) as Array<{ sourceType: PulseRunnerIssueSourceRequest["sourceType"]; sourceId: string; issueWorkItemId: string }>)
      .map(entry => [issueSourceKey(entry.sourceType, entry.sourceId), entry.issueWorkItemId]),
  ), [data?.runner?.flaggedSources]);
  const persist = (changes: any) => session && update.mutate({ meetingId, sessionId: session.id, elapsedSeconds: elapsed, attendeeIds, notes, ...changes });
  const advance = (direction: -1 | 1) => { const next = steps[stepIndex + direction]; if (!next) return; setActiveStep(next); persist({ activeStep: next }); };
  const changed = () => { void utils.pulse.l10.runner.invalidate({ meetingId }); void utils.pulse.l10.dashboard.invalidate({ meetingId }); };
  if (isLoading) return <Skeleton className="h-[70vh] w-full"/>;
  if (error || !data) return <Card className="mx-auto max-w-3xl"><CardContent className="p-6">This L10 cannot be run. <Link className="underline" href={`/pulse/meetings/${meetingId}`}>Return to the workspace</Link>.</CardContent></Card>;
  if (!session) return <main className="mx-auto flex min-h-[60vh] max-w-xl items-center"><Card className="w-full"><CardHeader><CardTitle>Ready to run {data.meeting.name}?</CardTitle><CardDescription>Start a dated session. The shared timer, agenda progress, commitments, decisions, ratings, and cascades will remain with this session.</CardDescription></CardHeader><CardContent><Button className="min-h-11" disabled={start.isPending} onClick={() => start.mutate({ meetingId })}><Play className="mr-2 h-4 w-4"/>{start.isPending ? "Starting…" : "Start L10"}</Button></CardContent></Card></main>;
  const body = step === "segue" ? <SegueStep data={data} sessionId={session.id} onChanged={changed}/> : step === "scorecard" ? <ScorecardStep data={data} flaggedSources={flaggedSources} onFlagIssue={setIssueSourceRequest}/> : step === "rocks" ? <RocksStep data={data} onChanged={changed} flaggedSources={flaggedSources} onFlagIssue={setIssueSourceRequest}/> : step === "headlines" ? <HeadlinesStep data={data} sessionId={session.id} onChanged={changed} flaggedSources={flaggedSources} onFlagIssue={setIssueSourceRequest}/> : step === "cascades" ? <CascadesStep data={data} sessionId={session.id} onChanged={changed}/> : step === "todos" ? <TodosStep data={data} sessionId={session.id} onCreate={(type) => openEditor({ type })} onChanged={changed}/> : step === "issues" ? <IdsStep data={data} sessionId={session.id} onCreate={(type) => openEditor({ type })} onChanged={changed}/> : <ConcludeStep data={data} session={session} elapsed={elapsed} attendeeIds={attendeeIds} notes={notes} setNotes={setNotes} onSave={persist} onClose={() => { changed(); window.location.assign(`/pulse/meetings/${meetingId}`); }}/>;
  return <main className="pulse-runner-shell fixed inset-0 z-50 flex flex-col bg-background"><header className="shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6"><div className="flex w-full flex-wrap items-center justify-between gap-3"><Button asChild variant="ghost" className="min-h-11"><Link href={`/pulse/meetings/${meetingId}`}><ArrowLeft className="mr-2 h-4 w-4"/>Exit runner</Link></Button><div className="flex flex-wrap items-center justify-end gap-3"><Button type="button" variant="outline" className="min-h-11" onClick={() => setCascadeComposerOpen(true)}><Send className="mr-2 h-4 w-4"/>Cascade message</Button><div className="text-right"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Meeting timer</p><p className={`font-mono text-lg font-semibold ${totalSeconds - elapsed < 0 ? "text-amber-700" : ""}`}><Timer className="mr-1 inline h-4 w-4"/>{formatTime(totalSeconds - elapsed)} remaining</p></div><Button variant="outline" className="min-h-11" onClick={() => persist({ status: session.status === "running" ? "paused" : "running" })}>{session.status === "running" ? <><Pause className="mr-2 h-4 w-4"/>Pause</> : <><Play className="mr-2 h-4 w-4"/>Resume</>}</Button></div></div></header><Progress value={Math.min(100, (elapsed / Math.max(1, totalSeconds)) * 100)} className="h-1 shrink-0 rounded-none"/><div className="flex min-h-0 flex-1 flex-col"><div className="pulse-runner-scroll flex-1"><div className="pulse-runner-content flex min-h-full flex-col"><div className="flex flex-wrap gap-2">{steps.map((name: string, index: number) => <button type="button" key={name} onClick={() => { setActiveStep(name); persist({ activeStep: name }); }} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${index === stepIndex ? "bg-primary text-primary-foreground" : index < stepIndex ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{index + 1}. {stepMeta[name]?.title ?? name}</button>)}</div><section className="flex flex-1 flex-col py-3 sm:py-4"><div className="w-full"><p className="text-sm font-semibold text-primary">Step {stepIndex + 1} of {steps.length}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{stepMeta[step]?.title ?? step}</h1><p className="mt-3 max-w-2xl text-lg leading-7 text-muted-foreground">{stepMeta[step]?.description}</p><p className={`mt-4 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${remainingStep < 0 ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}><Clock3 className="mr-2 h-4 w-4"/>{remainingStep < 0 ? "Over by " : "Time left "}{formatTime(remainingStep)}</p><Card className="mt-4 flex min-h-[28rem] flex-1 flex-col lg:min-h-[calc(100dvh-19rem)]"><CardContent className="flex flex-1 flex-col p-4 sm:p-5 lg:p-6">{body}</CardContent></Card></div></section></div></div><footer className="flex shrink-0 items-center justify-between gap-3 border-t bg-background px-3 py-2 sm:px-6"><Button variant="outline" className="min-h-11" disabled={stepIndex === 0} onClick={() => advance(-1)}><ArrowLeft className="mr-2 h-4 w-4"/>Back</Button><Button className="min-h-11" disabled={stepIndex === steps.length - 1} onClick={() => advance(1)}>Advance<ArrowRight className="ml-2 h-4 w-4"/></Button></footer></div><PulseItemEditor open={Boolean(editorRequest)} onOpenChange={(open) => { if (!open) setEditorRequest(null); }} workItemId={editorRequest?.workItemId} defaultType={editorRequest?.type ?? "todo"} defaultDestinationId={meetingId} sourceSessionId={session.id} onSaved={() => changed()} /><PulseRunnerIssueDialog meetingId={meetingId} sessionId={session.id} source={issueSourceRequest} onOpenChange={(open) => { if (!open) setIssueSourceRequest(null); }} onRaised={() => changed()} /><PulseCascadeDraftDialog open={cascadeComposerOpen} onOpenChange={setCascadeComposerOpen} sourceMeetingId={data.meeting.id} sourceMeetingName={data.meeting.name} sessionId={session.id} onSaved={changed} /></main>;
}
