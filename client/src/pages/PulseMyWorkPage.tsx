import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ClipboardList, History, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { formatEasternDateTime } from "@/lib/format";
import { PulseL10WorkCreator } from "@/components/pulse/PulseL10WorkCreator";
import { PulseWeeklyPreparation } from "@/components/pulse/PulseWeeklyPreparation";
import { PulseMyMeasurables } from "@/components/pulse/PulseMyMeasurables";
import { PulseInlineItemRow } from "@/components/pulse/PulseItemEditor";
import { PulseCompletedHistory } from "@/components/pulse/PulseCompletedHistory";
import { PulseNotificationsPopover } from "@/components/pulse/PulseNotificationsInbox";
import { PulseMasterScorecard } from "@/components/pulse/PulseMasterScorecard";
import { PulseIssueTimeframeFilter, type IssueTimeframeFilterValue } from "@/components/pulse/PulseWorkItemBadges";
import { PulseCascadeCard } from "@/components/pulse/PulseCascadeCard";

function WorkRow({ item, onChanged, showDestination = false }: { item: any; onChanged: () => void; showDestination?: boolean }) {
  return <PulseInlineItemRow item={item} onChanged={onChanged} showDestination={showDestination} />;
}

function DashboardSection({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <Collapsible open={open} onOpenChange={setOpen}><Card className="pulse-card-compact"><CardHeader className="flex flex-row items-start justify-between gap-3 py-2.5"><div className="min-w-0"><CardTitle className="text-base">{title}</CardTitle><CardDescription className="mt-0.5">{description}</CardDescription></div><CollapsibleTrigger asChild><Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label={`${open ? "Collapse" : "Expand"} ${title}`} title={`${open ? "Collapse" : "Expand"} ${title}`}><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /><span className="sr-only">{open ? "Collapse" : "Expand"} {title}</span></Button></CollapsibleTrigger></CardHeader><CollapsibleContent><CardContent className="border-t border-border pt-3">{children}</CardContent></CollapsibleContent></Card></Collapsible>;
}

function ActivitySummary({ activity }: { activity: any[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? activity : activity.slice(0, 4);
  return <Collapsible open={open} onOpenChange={setOpen} className="h-full min-w-0"><Card className="h-full min-h-36 overflow-hidden pulse-card-compact"><CardHeader className="flex flex-row items-start justify-between gap-2 py-2"><div className="min-w-0"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" />Activity</CardTitle><CardDescription className="mt-0.5">Recent changes to work you own across authorized forums.</CardDescription></div><div className="flex shrink-0 items-center gap-1">{open && activity.length > 5 ? <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : `View all (${activity.length})`}</Button> : null}<CollapsibleTrigger asChild><Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={open ? "Collapse activity" : "Expand activity"} title={open ? "Collapse activity" : "Expand activity"}><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /><span className="sr-only">{open ? "Collapse activity" : "Expand activity"}</span></Button></CollapsibleTrigger></div></CardHeader><CollapsibleContent><CardContent className="divide-y divide-border border-t border-border pt-2">{visible.length ? visible.map((entry: any) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{entry.item?.title ?? "Work item"}</p><p className="truncate text-xs text-muted-foreground">{entry.personName ?? "A teammate"} {entry.action.replaceAll("_", " ")} · {entry.item?.meetingName ?? entry.item?.source ?? "Pulse"}</p></div><time className="shrink-0 text-[11px] text-muted-foreground">{formatEasternDateTime(entry.createdAt, { includeYear: false })}</time></div>) : <p className="py-1 text-sm text-muted-foreground">No recent activity in this workspace.</p>}</CardContent></CollapsibleContent></Card></Collapsible>;
}

export default function PulseMyWorkPage() {
  const utils = trpc.useUtils();
  const [workspaceId, setWorkspaceId] = useState("all");
  const [issueTimeframe, setIssueTimeframe] = useState<IssueTimeframeFilterValue>("all");
  const [activeTab, setActiveTab] = useState("work");
  const { data, isLoading, error } = trpc.pulse.personal.dashboard.useQuery({ workspaceId });
  const changed = () => { void utils.pulse.personal.dashboard.invalidate(); void utils.pulse.workItems.invalidate(); void utils.pulse.notifications.invalidate(); void utils.pulse.cascades.pending.invalidate(); };
  const acknowledgeCascade = trpc.pulse.cascades.acknowledge.useMutation({ onSuccess: () => { changed(); toast.success("Cascade acknowledged."); }, onError: (error) => toast.error(error.message) });
  if (isLoading) return <main className="pulse-page pulse-page-stack"><Skeleton className="h-36 w-full" /><Skeleton className="h-[32rem] w-full" /></main>;
  if (error || !data) return <main className="pulse-page max-w-3xl"><Card><CardContent className="p-5">My EOS Dashboard is not available right now.</CardContent></Card></main>;
  const workspaces = data.workspaces ?? [];
  const todos = data.items.todos.filter((item: any) => item.status !== "dropped" && !item.parentWorkItemId);
  const issues = data.items.issues.filter((item: any) => issueTimeframe === "all" || item.issueTimeframe === issueTimeframe);

  return <main className="pulse-page pulse-page-stack"><Tabs value={activeTab} onValueChange={setActiveTab}>
    <header className="border-b border-border pb-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">My EOS Dashboard</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Your work, weekly preparation, measurables, and scorecard stay organized without widening the dashboard.</p></div><PulseNotificationsPopover meetingId={workspaceId === "all" ? undefined : workspaceId} /></div><nav className="mt-3 max-w-full overflow-x-auto pb-1" aria-label="My EOS sections"><TabsList className="h-auto min-w-max justify-start"><TabsTrigger value="work" className="min-h-9"><ListChecks className="h-4 w-4" />My Work</TabsTrigger><TabsTrigger value="scorecard" className="min-h-9"><ClipboardList className="h-4 w-4" />Master Scorecard</TabsTrigger></TabsList></nav></header>

    <TabsContent value="work" className="mt-0 space-y-3"><DashboardSection title="My Measurables" description="Submit every active measurable you own for the current reporting week."><PulseMyMeasurables embedded /></DashboardSection><DashboardSection title="Incoming Cascades" description="Messages from authorized Pulse meetings stay here until you acknowledge them.">{data.actionCenter.cascades.length ? <div className="space-y-2">{data.actionCenter.cascades.map((cascade: any) => <PulseCascadeCard key={cascade.id} message={cascade} isAcknowledging={acknowledgeCascade.isPending} onAcknowledge={(messageId) => acknowledgeCascade.mutate({ messageId, from: "my_work" })} />)}</div> : <p className="text-sm text-muted-foreground">No cascading messages need your acknowledgment.</p>}</DashboardSection><DashboardSection title="My Work" description="Current commitments and issues. Add or update work in its original meeting."><PulseL10WorkCreator meetings={data.meetings} onCreated={changed} workspaceControls={<div><p className="mb-1 text-sm font-semibold">Show work from</p><div className="flex flex-wrap gap-1">{workspaces.map((workspace: any) => <button type="button" key={workspace.id} onClick={() => setWorkspaceId(workspace.id)} className={`h-8 rounded-md border px-2.5 text-left text-xs font-semibold transition-colors ${workspaceId === workspace.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}>{workspace.name}</button>)}</div><p className="mt-1.5 text-xs text-muted-foreground">Choose all L10s or one meeting. Every item keeps its meeting home.</p></div>} />
      <div className="space-y-3"><div className="grid gap-3 lg:grid-cols-2"><Card className="pulse-card-compact"><CardHeader className="pb-2"><CardTitle>To-Dos</CardTitle><CardDescription>Overdue work and this week’s commitments are listed first.</CardDescription></CardHeader><CardContent>{todos.length ? todos.map((item: any) => <WorkRow key={item.id} item={item} onChanged={changed} showDestination={workspaceId === "all"} />) : <p className="text-sm text-muted-foreground">No To-Dos in this workspace.</p>}</CardContent></Card><Card className="pulse-card-compact"><CardHeader className="pb-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle>Issues</CardTitle><CardDescription>Open issues you own, ordered for attention.</CardDescription></div><PulseIssueTimeframeFilter value={issueTimeframe} onValueChange={setIssueTimeframe} /></div></CardHeader><CardContent>{issues.length ? issues.map((item: any) => <WorkRow key={item.id} item={item} onChanged={changed} showDestination={workspaceId === "all"} />) : <p className="text-sm text-muted-foreground">No {issueTimeframe === "all" ? "open Issues" : issueTimeframe === "short_term" ? "Short Term Issues" : "Long Term Issues"} in this workspace.</p>}</CardContent></Card></div><Card className="pulse-card-compact"><CardHeader className="pb-2"><CardTitle>Rocks</CardTitle><CardDescription>Longer-term priorities, their milestones, and current status.</CardDescription></CardHeader><CardContent>{data.items.rocks.length ? data.items.rocks.map((item: any) => <WorkRow key={item.id} item={item} onChanged={changed} />) : <p className="text-sm text-muted-foreground">No active Rocks in this workspace.</p>}</CardContent></Card></div>
    </DashboardSection>
    <DashboardSection title="At a Glance" description="A compact view of your current workload and preparation." defaultOpen={false}><div aria-label="At a glance" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Card className={data.counts.overdue ? "border-rose-200 bg-rose-50/50" : ""}><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Overdue</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.overdue}</p><p className="text-xs text-muted-foreground">Past deadline</p></CardContent></Card><Card className={data.counts.unacknowledged ? "border-amber-200 bg-amber-50/50" : ""}><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Unacknowledged</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.unacknowledged}</p><p className="text-xs text-muted-foreground">Cascades</p></CardContent></Card><Card><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Due this week</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.dueSoon}</p><p className="text-xs text-muted-foreground">Open To-Dos</p></CardContent></Card><Card className={data.counts.missingMeasurables ? "border-sky-200 bg-sky-50/50" : ""}><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Prep needed</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.missingMeasurables}</p><p className="text-xs text-muted-foreground">Measurables</p></CardContent></Card><Card><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Rocks off track</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.offTrackRocks}</p><p className="text-xs text-muted-foreground">Need a next action</p></CardContent></Card></div></DashboardSection>
    <DashboardSection title="Weekly Preparation" description="Prepare one meeting at a time; every entry stays connected to its forum." defaultOpen={false}><PulseWeeklyPreparation embedded /></DashboardSection>
    <section className="grid items-stretch gap-2 xl:grid-cols-2"><PulseCompletedHistory className="h-full min-h-36 min-w-0 overflow-hidden" contextId={workspaceId === "all" ? undefined : workspaceId} title={workspaceId === "all" ? "Completed & Resolved work" : "Completed & Resolved in this meeting"} description={workspaceId === "all" ? "Search work you completed or resolved across authorized Pulse forums." : "Search completed or resolved work from this exact meeting."} onlyMine onChanged={changed} compact /><ActivitySummary activity={data.activity ?? []} /></section></TabsContent>

    <TabsContent value="scorecard" className="mt-5"><PulseMasterScorecard /></TabsContent>
  </Tabs></main>;
}
