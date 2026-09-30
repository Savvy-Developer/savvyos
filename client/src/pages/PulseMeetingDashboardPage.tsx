import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Archive, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ListChecks, MessageSquarePlus, Play, Plus, Target, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { formatEasternClockTime, formatEasternDateTime } from "@/lib/format";
import { PulseInlineItemRow, PulseItemEditor } from "@/components/pulse/PulseItemEditor";
import { PulseRockMilestonePanel } from "@/components/pulse/PulseRockMilestonePanel";
import { PulseProjectRockMilestonePanel } from "@/components/pulse/PulseProjectRockMilestonePanel";
import { PulseScorecard } from "@/components/pulse/PulseScorecard";
import { PulseCompletedHistory } from "@/components/pulse/PulseCompletedHistory";
import { PulseMeetingRatingSummary } from "@/components/pulse/PulseMeetingRatingSummary";
import { PulseIssueTimeframeFilter, statusLabel, type IssueTimeframeFilterValue } from "@/components/pulse/PulseWorkItemBadges";
import { PulseCascadeCard } from "@/components/pulse/PulseCascadeCard";
import { PulseCascadeComposerDialog } from "@/components/pulse/PulseCascadeComposer";
import { ALL_ROCK_OWNERS, PulseRockOwnerFilter, rockOwnerKey } from "@/components/pulse/PulseRockOwnerFilter";

const sectionMeta = {
  overview: { label: "Overview", icon: CalendarDays },
  segue: { label: "Segue", icon: Users },
  headlines: { label: "Headlines", icon: MessageSquarePlus },
  scorecard: { label: "Scorecard", icon: TrendingUp },
  rocks: { label: "Rocks", icon: Target },
  todos: { label: "To-Dos", icon: ListChecks },
  issues: { label: "Issues", icon: AlertTriangle },
  cascades: { label: "Cascades", icon: MessageSquarePlus },
  archive: { label: "Archive", icon: Archive },
} as const;

type SectionKey = keyof typeof sectionMeta;

function dayLabel(day?: string | null) {
  return day ? `${day.slice(0, 1).toUpperCase()}${day.slice(1)}s` : "Schedule not set";
}

function nextMeeting(day?: string | null) {
  if (!day) return "Set a recurring day";
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const target = days.indexOf(day);
  const distance = (target - new Date().getDay() + 7) % 7 || 7;
  return distance === 1 ? "Tomorrow" : `In ${distance} days`;
}

function HealthStat({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return <div className="rounded-xl border border-border/70 bg-background p-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>{subtext ? <p className="mt-1 text-xs text-muted-foreground">{subtext}</p> : null}</div>;
}

function Overview({ data, onOpenTab, onCreate }: { data: any; onOpenTab: (tab: SectionKey) => void; onCreate: (type: "todo" | "issue") => void }) {
  const overview = data.sections.overview;
  const latest = overview.latestReport;
  const health = overview.health;
  return <div className="pulse-page-stack">
    <section className="grid gap-3 lg:grid-cols-2">
      <Card className="h-full min-h-40 overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.07] via-background to-background"><CardContent className="flex h-full flex-col p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Your L10 rhythm</p><p className="mt-1 truncate text-lg font-semibold tracking-tight">{dayLabel(data.meeting.dayOfWeek)} · {formatEasternClockTime(data.meeting.startTime)}</p></div><span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">{nextMeeting(data.meeting.dayOfWeek)}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{data.meeting.durationMinutes} min · {data.meeting.timezone}</p><div className="mt-auto grid grid-cols-2 gap-1.5 pt-3"><Button size="sm" variant="outline" className="h-8 min-w-0 px-2 text-xs" onClick={() => onCreate("todo")}>Add To-Do</Button><Button size="sm" className="h-8 min-w-0 px-2 text-xs" onClick={() => onCreate("issue")}>Add Issue</Button></div></CardContent></Card>
      <Card className="h-full min-h-40"><CardContent className="flex h-full flex-col p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meeting leadership</p><p className="mt-1 text-sm font-medium">Assigned leaders</p></div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">{data.members.length} participant{data.members.length === 1 ? "" : "s"}</span></div><div className="mt-auto grid grid-cols-2 gap-3 border-t border-border pt-3"><div className="min-w-0"><p className="truncate text-sm font-semibold" title={data.meeting.facilitator?.name ?? "Assignment required"}>{data.meeting.facilitator?.name ?? "Assignment required"}</p><p className="mt-0.5 text-xs text-muted-foreground">Facilitator</p></div><div className="min-w-0"><p className="truncate text-sm font-semibold" title={data.meeting.administrator?.name ?? "Assignment required"}>{data.meeting.administrator?.name ?? "Assignment required"}</p><p className="mt-0.5 text-xs text-muted-foreground">Administrator</p></div></div></CardContent></Card>
    </section>

    {data.sections.briefs?.length ? <section><div className="mb-3"><h2 className="text-lg font-semibold">Weekly briefs</h2><p className="text-sm text-muted-foreground">Preparation submitted by meeting participants for this week.</p></div><div className="grid gap-3 md:grid-cols-2">{data.sections.briefs.map((brief: any) => <Card key={brief.id}><CardContent className="p-4"><p className="whitespace-pre-wrap text-sm leading-6">{brief.body}</p><p className="mt-2 text-xs text-muted-foreground">{brief.authorName ?? "Participant"} · {formatEasternDateTime(brief.createdAt, { includeYear: false })}</p></CardContent></Card>)}</div></section> : null}

    <section><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Needs attention</h2><p className="text-sm text-muted-foreground">The items most likely to need an Issue or a clear next step.</p></div>{overview.attention.length ? <Button size="sm" variant="ghost" onClick={() => onOpenTab("issues")}>Open Issues</Button> : null}</div>{overview.attention.length ? <div className="grid gap-3 md:grid-cols-2">{overview.attention.map((item: any) => <Card key={`${item.kind}-${item.id}`} className="border-amber-200 bg-amber-50/50"><CardContent className="flex items-start gap-3 p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"/><div><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-amber-800/80">{item.detail}</p></div></CardContent></Card>)}</div> : <Card><CardContent className="p-5 text-sm text-muted-foreground"><Check className="mr-2 inline h-4 w-4 text-emerald-600"/>No off-track numbers, at-risk Rocks, or past-due To-Dos need attention right now.</CardContent></Card>}</section>

    <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]"><Card><CardHeader className="pb-3"><CardTitle className="text-base">What came out of the last session</CardTitle><CardDescription>{latest ? `Closed ${new Date(latest.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Outcomes will appear when a session closes."}</CardDescription></CardHeader><CardContent>{latest ? <div className="space-y-3"><div className="flex gap-5 text-sm"><span><strong>{latest.ratingAverage ?? "—"}</strong> /10 rating</span><span><strong>{(latest.commitmentsSnapshot ?? []).length}</strong> commitments</span><span><strong>{(latest.resolvedIssuesSnapshot ?? []).length}</strong> resolved</span></div><Button size="sm" variant="outline" onClick={() => onOpenTab("archive")}>Open report</Button></div> : <p className="text-sm text-muted-foreground">Run and conclude the first session to build a durable record of commitments and decisions.</p>}</CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="text-base">Is the rhythm healthy?</CardTitle><CardDescription>Based on the most recent eight completed sessions.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4"><HealthStat label="Sessions" value={String(health.sessionsMeasured)} /><HealthStat label="Avg. rating" value={health.averageRating == null ? "—" : `${health.averageRating}/10`} /><HealthStat label="On-time starts" value={health.onTimeStartRate == null ? "—" : `${health.onTimeStartRate}%`} /><HealthStat label="Avg. duration" value={health.averageDurationMinutes == null ? "—" : `${health.averageDurationMinutes}m`} subtext={`${health.scheduledMinutes}m scheduled`} /></CardContent></Card></section>
  </div>;
}

function UpdatesTab({ meetingId, sessionId, kind, items, onChanged }: { meetingId: string; sessionId?: string; kind: "segue" | "headline"; items: any[]; onChanged: () => void }) {
  const [body, setBody] = useState("");
  const create = trpc.pulse.l10.createUpdate.useMutation({ onSuccess: () => { setBody(""); onChanged(); }, onError: (error) => toast.error(error.message) });
  const label = kind === "segue" ? "Segue" : "Headline";
  return <div className="space-y-4"><Card><CardHeader><CardTitle>Share a {label.toLowerCase()}</CardTitle><CardDescription>{kind === "segue" ? "Add a personal or professional win before the meeting." : "Record customer, employee, or operating news the L10 should see."}</CardDescription></CardHeader><CardContent><form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (body.trim()) create.mutate({ meetingId, sessionId, updateType: kind, body: body.trim() }); }}><Input className="min-h-11 text-base" value={body} onChange={(event) => setBody(event.target.value)} placeholder={kind === "segue" ? "A personal or professional best…" : "The update this L10 needs…"}/><Button type="submit" className="min-h-11" disabled={!body.trim() || create.isPending}><Plus className="mr-1 h-4 w-4"/>Add</Button></form></CardContent></Card><div className="space-y-3">{items.length ? items.map((item: any) => <Card key={item.id}><CardContent className="p-4"><p className="text-sm leading-6">{item.body}</p><p className="mt-2 text-xs text-muted-foreground">{item.authorName ?? "Participant"} · {formatEasternDateTime(item.createdAt, { includeYear: false })}</p></CardContent></Card>) : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No {label.toLowerCase()}s yet. Add one above.</CardContent></Card>}</div></div>;
}

function ScorecardTab({ data, onChanged }: { data: any; onChanged: () => void }) {
  const metrics = data.sections.scorecard;
  const tabs = ["weekly", "monthly", "quarterly", "annually"].filter(cadence => metrics.some((metric: any) => metric.cadence === cadence));
  return <Card><CardHeader><CardTitle>Scorecard</CardTitle><CardDescription>Compare last week, this week, year-to-date performance against target, and the trailing eight-week record. An off-target number belongs on the Issues list, not in a sidebar discussion.</CardDescription></CardHeader><CardContent><PulseScorecard section={{ items: metrics, meta: { tabs } }} meetingId={data.meeting.id} showObservations={false} emptyMessage="No measurables are assigned to this L10. A Pulse manager can add them in configuration." onChanged={onChanged} /></CardContent></Card>;
}

function RocksTab({ data, onChanged }: { data: any; onChanged: () => void }) {
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
  return <div className="space-y-2">
    <Card className="pulse-card-compact"><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 py-3"><div><CardTitle>Rock review</CardTitle><CardDescription>Review one owner’s Rocks at a time, then move to the next person.</CardDescription></div><PulseRockOwnerFilter rocks={rocks} value={ownerFilter} onValueChange={setOwnerFilter} /></CardHeader></Card>
    {rocks.length ? filteredRocks.length ? filteredRocks.map((rock: any) => {
      const open = expandedRockIds.has(rock.id);
      return <Card key={rock.id} className="overflow-hidden"><button type="button" className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-muted/35" onClick={() => toggleRock(rock.id)} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${rock.title} Rock`}><div className="flex min-w-0 items-start gap-2"><ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{rock.title}</p>{rock.source === "project" ? <span className="rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Project Rock</span> : null}</div><p className="mt-1 truncate text-sm text-muted-foreground">{rock.ownerName} · {rock.quarter ?? "Current quarter"} · {rock.percentComplete}% complete</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${rock.status === "on_track" || rock.status === "done" ? "bg-emerald-100 text-emerald-800" : rock.status === "at_risk" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{statusLabel(rock.status)}</span></button>{open ? <CardContent className="border-t border-border p-4"><p className="text-xs font-medium text-muted-foreground">{rock.source === "project" ? `Shared from Projects${rock.priority ? ` · ${rock.priority.slice(0, 1).toUpperCase()}${rock.priority.slice(1)} priority` : ""}${rock.dueDate ? ` · Due ${new Date(rock.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}` : `Home: ${rock.homeMeetingName}`}</p>{rock.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{rock.description}</p> : null}{rock.definitionOfDone ? <p className="mt-2 text-sm text-muted-foreground">Done means: {rock.definitionOfDone}</p> : null}<div className="mt-4 flex items-center gap-3"><Progress className="h-2 flex-1" value={rock.percentComplete}/><span className="text-sm font-semibold">{rock.percentComplete}%</span></div><div className="mt-4 flex flex-wrap gap-2">{["on_track", "at_risk", "off_track", "done"].map((status) => <Button key={status} size="sm" variant={rock.status === status ? "default" : "outline"} disabled={update.isPending} onClick={() => update.mutate(rock.projectId ? { meetingId: data.meeting.id, projectId: rock.projectId, status: status as any } : { meetingId: data.meeting.id, workItemId: rock.id, status: status as any })}>{statusLabel(status)}</Button>)}{rock.projectId ? <Button size="sm" variant="outline" asChild><Link href={`/projects/${rock.projectId}`}>Open in Projects</Link></Button> : null}</div>{rock.projectId ? <PulseProjectRockMilestonePanel meetingId={data.meeting.id} projectId={rock.projectId} milestones={rock.milestones ?? []} onChanged={onChanged} /> : <PulseRockMilestonePanel rockId={rock.id} onChanged={onChanged} />}</CardContent> : null}</Card>;
    }) : <Card><CardContent className="p-5 text-center text-sm text-muted-foreground">No active Rocks are assigned to this owner.</CardContent></Card> : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No Rocks are reviewed in this L10 yet.</CardContent></Card>}
  </div>;
}

function TodosTab({ data, onCreate, onChanged }: { data: any; onCreate: (type: "todo" | "issue") => void; onChanged: () => void }) {
  return <div className="space-y-2"><Card className="pulse-card-compact"><CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 py-3"><div className="min-w-0"><CardTitle>To-Dos</CardTitle><CardDescription>Active commitments stay here. Completed work moves immediately into permanent recall below without changing its meeting home.</CardDescription></div><Button type="button" className="min-h-9 shrink-0" onClick={() => onCreate("todo")}><Plus className="mr-2 h-4 w-4" />Add To-Do</Button></CardHeader></Card><div className="space-y-2">{data.sections.todos.filter((todo: any) => !todo.parentWorkItemId).length ? data.sections.todos.filter((todo: any) => !todo.parentWorkItemId).map((todo: any) => <PulseInlineItemRow key={todo.id} item={todo} defaultDestinationId={data.meeting.id} sourceSessionId={data.activeSession?.id ?? null} onChanged={onChanged} />) : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No active To-Dos in this meeting.</CardContent></Card>}</div><PulseCompletedHistory contextId={data.meeting.id} initialType="todo" title="Completed To-Dos" description="Recall completed commitments from this exact meeting. Search by title, details, or definition of done, then reopen the same record if needed." sourceSessionId={data.activeSession?.id ?? null} onChanged={onChanged} /></div>;
}

function IssuesTab({ data, onCreate, onChanged }: { data: any; onCreate: (type: "todo" | "issue") => void; onChanged: () => void }) {
  const [timeframe, setTimeframe] = useState<IssueTimeframeFilterValue>("all");
  const issues = data.sections.issues.filter((issue: any) => timeframe === "all" || issue.issueTimeframe === timeframe);
  return <div className="space-y-2"><Card className="pulse-card-compact border-primary/20 bg-primary/[0.03]"><CardHeader className="pb-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle>Issues list</CardTitle><CardDescription>Surface the real problem now, then manage its assignee and priority directly from the row. Resolve it explicitly with the documented solve. Resolved items remain recallable below.</CardDescription></div><PulseIssueTimeframeFilter value={timeframe} onValueChange={setTimeframe} /></div></CardHeader><CardContent><Button type="button" className="min-h-11" onClick={() => onCreate("issue")}><Plus className="mr-2 h-4 w-4" />Add Issue</Button></CardContent></Card><div className="space-y-2">{issues.length ? issues.map((issue: any) => <PulseInlineItemRow key={issue.id} item={issue} defaultDestinationId={data.meeting.id} sourceSessionId={data.activeSession?.id ?? null} onChanged={onChanged} />) : <Card><CardContent className="p-5 text-center text-sm text-muted-foreground">No {timeframe === "all" ? "active Issues" : timeframe === "short_term" ? "Short Term Issues" : "Long Term Issues"} in this meeting.</CardContent></Card>}</div><PulseCompletedHistory contextId={data.meeting.id} initialType="issue" title="Resolved Issues" description="Recall solved Issues from this exact meeting, including the solve note and full activity history. Reopening preserves the same meeting routing." sourceSessionId={data.activeSession?.id ?? null} onChanged={onChanged} /></div>;
}

function CascadesTab({ data, onChanged }: { data: any; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const [composerOpen, setComposerOpen] = useState(false);
  const acknowledge = trpc.pulse.cascades.acknowledge.useMutation({
    onSuccess: () => {
      onChanged();
      void utils.pulse.personal.dashboard.invalidate();
      void utils.pulse.cascades.pending.invalidate();
      void utils.pulse.notifications.pending.invalidate();
      toast.success("Cascade acknowledged.");
    },
    onError: (error) => toast.error(error.message),
  });
  const cascades = data.sections.cascades ?? [];
  const incoming = cascades.filter((cascade: any) => cascade.destinationMeetingIds?.includes(data.meeting.id));
  const sent = cascades.filter((cascade: any) => cascade.fromMeetingId === data.meeting.id);
  return <div className="space-y-4"><Card className="pulse-card-compact border-primary/20 bg-primary/[0.03]"><CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3"><div className="min-w-0"><CardTitle>Cascading messages</CardTitle><CardDescription>Hand off a clear message to another authorized meeting. Recipients keep it visible until they acknowledge it.</CardDescription></div>{data.permissions.canSendCascade ? <Button type="button" className="min-h-10 shrink-0" onClick={() => setComposerOpen(true)}><MessageSquarePlus className="mr-2 h-4 w-4" />Send cascade</Button> : null}</CardHeader></Card><section className="space-y-2"><div><h2 className="text-base font-semibold">Incoming cascades</h2><p className="mt-0.5 text-sm text-muted-foreground">Messages sent here from another Pulse meeting.</p></div>{incoming.length ? <div className="space-y-2">{incoming.map((cascade: any) => <PulseCascadeCard key={cascade.id} message={cascade} isAcknowledging={acknowledge.isPending} onAcknowledge={(messageId) => acknowledge.mutate({ messageId, from: "meeting_dashboard" })} />)}</div> : <Card><CardContent className="p-5 text-sm text-muted-foreground">No cascades have been sent to this meeting.</CardContent></Card>}</section><section className="space-y-2"><div><h2 className="text-base font-semibold">Sent cascades</h2><p className="mt-0.5 text-sm text-muted-foreground">Recipient acknowledgments remain visible here.</p></div>{sent.length ? <div className="space-y-2">{sent.map((cascade: any) => <PulseCascadeCard key={cascade.id} message={cascade} onAcknowledge={() => undefined} />)}</div> : <Card><CardContent className="p-5 text-sm text-muted-foreground">No cascades have been sent from this meeting.</CardContent></Card>}</section><PulseCascadeComposerDialog open={composerOpen} onOpenChange={setComposerOpen} sourceMeetingId={data.meeting.id} sourceMeetingName={data.meeting.name} onSaved={onChanged} /></div>;
}

function ArchiveTab({ data, onChanged }: { data: any; onChanged: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const report = trpc.pulse.l10.report.useQuery({ meetingId: data.meeting.id, reportId: selected ?? "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(selected) });
  const reports = data.sections.archive;
  return <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]"><Card><CardHeader><CardTitle>Meeting archive</CardTitle><CardDescription>Every concluded session retains its outcomes and snapshots.</CardDescription></CardHeader><CardContent className="space-y-2">{reports.length ? reports.map((item: any) => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected === item.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"}`}><p className="font-medium">{new Date(item.scheduledFor).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p><p className="mt-1 text-sm text-muted-foreground">{item.ratingAverage ?? "—"}/10 · {(item.commitments ?? []).length} commitments · {(item.resolvedIssues ?? []).length} solved</p></button>) : <p className="py-8 text-center text-sm text-muted-foreground">No completed sessions yet.</p>}</CardContent></Card><Card><CardHeader><CardTitle>{selected ? "Session report" : "Select a session"}</CardTitle><CardDescription>{selected ? "Durable snapshots captured when this L10 was concluded." : "Choose a completed session to review its outcomes."}</CardDescription></CardHeader><CardContent>{report.isLoading ? <Skeleton className="h-64 w-full"/> : report.data ? <div className="space-y-5 text-sm"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]"><PulseMeetingRatingSummary summary={report.data.ratingSummary} history={report.data.ratingHistory} title="Overall meeting rating" description="Average participant rating and the distribution saved for this meeting, compared with prior sessions." showHistory /><HealthStat label="Duration" value={`${Math.round(report.data.session.elapsedSeconds / 60)}m`} /></div><div><h3 className="font-semibold">Commitments made</h3>{(report.data.report.commitmentsSnapshot as any[] ?? []).length ? <ul className="mt-2 space-y-1 text-muted-foreground">{(report.data.report.commitmentsSnapshot as any[]).map((item: any) => <li key={item.id}>• {item.title}</li>)}</ul> : <p className="mt-2 text-muted-foreground">No new commitments recorded.</p>}</div><div><h3 className="font-semibold">Issues resolved</h3>{(report.data.report.resolvedIssuesSnapshot as any[] ?? []).length ? <ul className="mt-2 space-y-1 text-muted-foreground">{(report.data.report.resolvedIssuesSnapshot as any[]).map((item: any) => <li key={item.id}>• {item.title}{item.solvedNote ? ` — ${item.solvedNote}` : ""}</li>)}</ul> : <p className="mt-2 text-muted-foreground">No Issues were marked resolved.</p>}</div><div><h3 className="font-semibold">Cascaded messages</h3>{(report.data.report.cascadesSnapshot as any[] ?? []).length ? <ul className="mt-2 space-y-1 text-muted-foreground">{(report.data.report.cascadesSnapshot as any[]).map((item: any) => <li key={item.id}>• {item.body}</li>)}</ul> : <p className="mt-2 text-muted-foreground">No messages were published.</p>}</div></div> : <p className="text-sm text-muted-foreground">No report selected.</p>}</CardContent></Card><div className="lg:col-span-2"><PulseCompletedHistory contextId={data.meeting.id} title="Completed & Resolved meeting history" description="Canonical work history for this exact meeting. Session reports remain immutable snapshots; these items remain searchable and reopenable without creating duplicates." onChanged={onChanged} /></div></div>;
}

export default function PulseMeetingDashboardPage({ meetingId }: { meetingId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pulse.l10.dashboard.useQuery({ meetingId }, { refetchInterval: 1500 });
  const [active, setActive] = useState<SectionKey>("overview");
  const [editorRequest, setEditorRequest] = useState<{ type: "todo" | "issue"; workItemId?: string } | null>(null);
  const openEditor = (type: "todo" | "issue", workItemId?: string) => setEditorRequest({ type, workItemId });
  const visibleSections = useMemo(() => data ? (Object.keys(sectionMeta) as SectionKey[]).filter((section) => section === "cascades" || data.meeting.sectionsEnabled[section]) : [], [data]);
  const onChanged = () => void utils.pulse.l10.dashboard.invalidate({ meetingId });
  useEffect(() => { if (visibleSections.length && !visibleSections.includes(active)) setActive(visibleSections[0]); }, [active, visibleSections]);
  if (isLoading) return <main className="pulse-page pulse-page-stack"><Skeleton className="h-28 w-full"/><Skeleton className="h-96 w-full"/></main>;
  if (error || !data) return <Card className="pulse-page max-w-3xl"><CardContent className="p-5">This L10 workspace is not available. <Link className="underline" href="/pulse/dashboard">Return to My EOS Dashboard</Link>.</CardContent></Card>;
  const selected = visibleSections.includes(active) ? active : visibleSections[0] ?? "overview";
  const content = selected === "overview" ? <Overview data={data} onOpenTab={setActive} onCreate={(type) => openEditor(type)}/> : selected === "segue" || selected === "headlines" ? <UpdatesTab meetingId={meetingId} sessionId={data.activeSession?.id} kind={selected === "segue" ? "segue" : "headline"} items={data.sections[selected]} onChanged={onChanged}/> : selected === "scorecard" ? <ScorecardTab data={data} onChanged={onChanged}/> : selected === "rocks" ? <RocksTab data={data} onChanged={onChanged}/> : selected === "todos" ? <TodosTab data={data} onCreate={(type) => openEditor(type)} onChanged={onChanged}/> : selected === "issues" ? <IssuesTab data={data} onCreate={(type) => openEditor(type)} onChanged={onChanged}/> : selected === "cascades" ? <CascadesTab data={data} onChanged={onChanged}/> : <ArchiveTab data={data} onChanged={onChanged}/>;
  return <main className="pulse-page pulse-page-stack"><Link href="/pulse/dashboard" className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground"><ChevronLeft className="mr-1 h-4 w-4"/>My EOS Dashboard</Link><header className="rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-primary">Pulse · {data.meeting.label === "level_10" ? "Level 10" : data.meeting.label === "one_on_one" ? "One-on-One" : "Meeting"}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{data.meeting.name}</h1>{data.meeting.purpose ? <p className="mt-2 max-w-3xl text-base text-muted-foreground">{data.meeting.purpose}</p> : null}</div><div className="flex flex-wrap gap-2">{data.permissions.canConfigure ? <Button asChild variant="outline" className="min-h-11"><Link href={`/pulse/settings/meetings/${meetingId}`}>Configure</Link></Button> : null}{data.permissions.canRun ? <Button asChild className="min-h-11"><Link href={`/pulse/meetings/${meetingId}/run`}><Play className="mr-2 h-4 w-4"/>{data.activeSession ? "Resume session" : "Run meeting"}</Link></Button> : null}</div></div></header><nav aria-label="L10 sections" className="pulse-scroll-x border-b border-border"><div className="flex min-w-max gap-1">{visibleSections.map((section) => { const Icon = sectionMeta[section].icon; return <button key={section} type="button" onClick={() => setActive(section)} className={`flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors ${selected === section ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4"/>{sectionMeta[section].label}</button>; })}</div></nav>{content}<PulseItemEditor open={Boolean(editorRequest)} onOpenChange={(open) => { if (!open) setEditorRequest(null); }} workItemId={editorRequest?.workItemId} defaultType={editorRequest?.type ?? "todo"} defaultDestinationId={meetingId} sourceSessionId={data.activeSession?.id ?? null} onSaved={() => onChanged()} /></main>;
}
