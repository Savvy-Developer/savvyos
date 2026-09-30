import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ClipboardList, History, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function CompactWorkQueue({
  todos,
  issues,
  issueTimeframe,
  onIssueTimeframeChange,
  onChanged,
  showDestination,
}: {
  todos: any[];
  issues: any[];
  issueTimeframe: IssueTimeframeFilterValue;
  onIssueTimeframeChange: (value: IssueTimeframeFilterValue) => void;
  onChanged: () => void;
  showDestination: boolean;
}) {
  const [activeWorkTab, setActiveWorkTab] = useState("todos");
  const issueEmptyLabel = issueTimeframe === "all" ? "No open Issues in this workspace." : issueTimeframe === "short_term" ? "No Short Term Issues in this workspace." : "No Long Term Issues in this workspace.";

  return <Tabs value={activeWorkTab} onValueChange={setActiveWorkTab} className="w-full">
    <Card className="pulse-card-compact overflow-hidden">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 py-3">
        <div className="min-w-0">
          <CardTitle>To-Dos &amp; Issues</CardTitle>
          <CardDescription className="mt-0.5">Switch views without expanding two long work lists across the dashboard.</CardDescription>
        </div>
        <TabsList aria-label="My Work list type" className="h-9 shrink-0">
          <TabsTrigger value="todos" className="min-h-8 px-2.5">To-Dos <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{todos.length}</span></TabsTrigger>
          <TabsTrigger value="issues" className="min-h-8 px-2.5">Issues <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{issues.length}</span></TabsTrigger>
        </TabsList>
      </CardHeader>
      <CardContent className="border-t border-border pt-2">
        <TabsContent value="todos" className="mt-0">
          <div aria-label="My To-Dos" className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
            {todos.length ? todos.map((item: any) => <WorkRow key={item.id} item={item} onChanged={onChanged} showDestination={showDestination} />) : <p className="py-2 text-sm text-muted-foreground">No To-Dos in this workspace.</p>}
          </div>
        </TabsContent>
        <TabsContent value="issues" className="mt-0">
          <div className="mb-2 flex justify-end"><PulseIssueTimeframeFilter value={issueTimeframe} onValueChange={onIssueTimeframeChange} /></div>
          <div aria-label="My Issues" className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
            {issues.length ? issues.map((item: any) => <WorkRow key={item.id} item={item} onChanged={onChanged} showDestination={showDestination} />) : <p className="py-2 text-sm text-muted-foreground">{issueEmptyLabel}</p>}
          </div>
        </TabsContent>
      </CardContent>
    </Card>
  </Tabs>;
}

function HeaderCascadePanel({ messages, isAcknowledging, onAcknowledge }: { messages: any[]; isAcknowledging: boolean; onAcknowledge: (messageId: string) => void }) {
  const firstMessage = messages[0];
  return <aside aria-label="Incoming Cascades" className="h-24 min-w-0 flex-1 rounded-lg border border-border bg-muted/20 p-2.5 sm:w-80 sm:flex-none">
    <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-sm font-semibold">Incoming Cascades</p>{messages.length ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{messages.length}</span> : null}</div></div>
    {firstMessage ? <Popover><PopoverTrigger asChild><Button type="button" variant="ghost" className="mt-1 h-11 w-full justify-start gap-2 px-2 text-left hover:bg-background" aria-label={`Open ${messages.length} incoming cascade${messages.length === 1 ? "" : "s"}`}><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{firstMessage.subject}</span><span className="block truncate text-[10px] text-muted-foreground">{firstMessage.routing.source}</span></span>{messages.length > 1 ? <span className="shrink-0 text-[10px] text-muted-foreground">+{messages.length - 1} more</span> : null}<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></Button></PopoverTrigger><PopoverContent align="end" className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto p-2"><div className="mb-2 px-1"><p className="text-sm font-semibold">Incoming Cascades</p><p className="text-xs text-muted-foreground">Review the message details and acknowledge each cascade.</p></div><div className="space-y-2">{messages.map((message: any) => <PulseCascadeCard key={message.id} message={message} isAcknowledging={isAcknowledging} onAcknowledge={onAcknowledge} />)}</div></PopoverContent></Popover> : <p className="mt-3 text-xs text-muted-foreground">No incoming cascades.</p>}
  </aside>;
}

function DashboardSection({
  title,
  description,
  children,
  defaultOpen = true,
  className,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return <Collapsible className={className} open={open} onOpenChange={setOpen}>
    <Card className="pulse-card-compact">
      <CardHeader className="flex flex-row items-start justify-between gap-3 py-2.5">
        <div className="min-w-0"><CardTitle className="text-base">{title}</CardTitle><CardDescription className="mt-0.5">{description}</CardDescription></div>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label={`${open ? "Collapse" : "Expand"} ${title}`} title={`${open ? "Collapse" : "Expand"} ${title}`}><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /><span className="sr-only">{open ? "Collapse" : "Expand"} {title}</span></Button>
        </CollapsibleTrigger>
      </CardHeader>
      <CollapsibleContent><CardContent className="border-t border-border pt-3">{children}</CardContent></CollapsibleContent>
    </Card>
  </Collapsible>;
}

function ActivitySummary({ activity }: { activity: any[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? activity : activity.slice(0, 4);
  return <Collapsible open={open} onOpenChange={setOpen} className="h-full min-w-0">
    <Card className="h-full min-h-36 overflow-hidden pulse-card-compact">
      <CardHeader className="flex flex-row items-start justify-between gap-2 py-2">
        <div className="min-w-0"><CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4 text-primary" />Activity</CardTitle><CardDescription className="mt-0.5">Recent changes to work you own across authorized forums.</CardDescription></div>
        <div className="flex shrink-0 items-center gap-1">{open && activity.length > 5 ? <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : `View all (${activity.length})`}</Button> : null}<CollapsibleTrigger asChild><Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={open ? "Collapse activity" : "Expand activity"} title={open ? "Collapse activity" : "Expand activity"}><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /><span className="sr-only">{open ? "Collapse activity" : "Expand activity"}</span></Button></CollapsibleTrigger></div>
      </CardHeader>
      <CollapsibleContent><CardContent className="divide-y divide-border border-t border-border pt-2">{visible.length ? visible.map((entry: any) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{entry.item?.title ?? "Work item"}</p><p className="truncate text-xs text-muted-foreground">{entry.personName ?? "A teammate"} {entry.action.replaceAll("_", " ")} · {entry.item?.meetingName ?? entry.item?.source ?? "Pulse"}</p></div><time className="shrink-0 text-[11px] text-muted-foreground">{formatEasternDateTime(entry.createdAt, { includeYear: false })}</time></div>) : <p className="py-1 text-sm text-muted-foreground">No recent activity in this workspace.</p>}</CardContent></CollapsibleContent>
    </Card>
  </Collapsible>;
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
  const workspaceControls = <div className="max-w-sm"><Label htmlFor="pulse-workspace">Show work from</Label><Select value={workspaceId} onValueChange={setWorkspaceId}><SelectTrigger id="pulse-workspace" aria-label="Show work from" className="mt-1 h-10 w-full bg-background"><SelectValue placeholder="Choose an L10 workspace" /></SelectTrigger><SelectContent>{workspaces.map((workspace: any) => <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>)}</SelectContent></Select><p className="mt-1.5 text-xs text-muted-foreground">Choose all L10s or one meeting. Every item keeps its meeting home.</p></div>;

  return <main className="pulse-page pulse-page-stack">
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <header className="border-b border-border pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><p className="text-sm font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">My EOS Dashboard</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Weekly preparation leads your dashboard, with work and scorecards kept compact below.</p></div><div className="flex w-full items-start gap-2 sm:w-auto"><HeaderCascadePanel messages={data.actionCenter.cascades} isAcknowledging={acknowledgeCascade.isPending} onAcknowledge={(messageId) => acknowledgeCascade.mutate({ messageId, from: "my_work" })} /><PulseNotificationsPopover meetingId={workspaceId === "all" ? undefined : workspaceId} /></div></div>
        <nav className="mt-3 max-w-full overflow-x-auto pb-1" aria-label="My EOS sections"><TabsList className="h-auto min-w-max justify-start"><TabsTrigger value="work" className="min-h-9"><ListChecks className="h-4 w-4" />My Work</TabsTrigger><TabsTrigger value="scorecard" className="min-h-9"><ClipboardList className="h-4 w-4" />Master Scorecard</TabsTrigger></TabsList></nav>
      </header>

      <TabsContent value="work" className="mt-0 space-y-3">
        <DashboardSection title="Weekly Preparation" description="Prepare one meeting at a time; every entry stays connected to its forum."><PulseWeeklyPreparation embedded /></DashboardSection>

        <section className="grid gap-3 xl:grid-cols-2 xl:items-start">
          <DashboardSection className="min-w-0" title="My Work" description="Keep the current queue focused: choose one list, then update work in its original meeting.">
          <div className="space-y-3">
            <PulseL10WorkCreator meetings={data.meetings} onCreated={changed} workspaceControls={workspaceControls} />
            <CompactWorkQueue todos={todos} issues={issues} issueTimeframe={issueTimeframe} onIssueTimeframeChange={setIssueTimeframe} onChanged={changed} showDestination={workspaceId === "all"} />
            <Card className="pulse-card-compact"><CardHeader className="pb-2"><CardTitle>Rocks</CardTitle><CardDescription>Longer-term priorities, their milestones, and current status.</CardDescription></CardHeader><CardContent>{data.items.rocks.length ? data.items.rocks.map((item: any) => <WorkRow key={item.id} item={item} onChanged={changed} showDestination={workspaceId === "all"} />) : <p className="text-sm text-muted-foreground">No active Rocks in this workspace.</p>}</CardContent></Card>
          </div>
          </DashboardSection>
          <DashboardSection className="min-w-0" title="My Measurables" description="Submit every active measurable you own for the current reporting week."><PulseMyMeasurables embedded /></DashboardSection>
        </section>
        <DashboardSection title="At a Glance" description="A compact view of your current workload and preparation." defaultOpen={false}><div aria-label="At a glance" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Card className={data.counts.overdue ? "border-rose-200 bg-rose-50/50" : ""}><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Overdue</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.overdue}</p><p className="text-xs text-muted-foreground">Past deadline</p></CardContent></Card><Card className={data.counts.unacknowledged ? "border-amber-200 bg-amber-50/50" : ""}><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Unacknowledged</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.unacknowledged}</p><p className="text-xs text-muted-foreground">Cascades</p></CardContent></Card><Card><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Due this week</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.dueSoon}</p><p className="text-xs text-muted-foreground">Open To-Dos</p></CardContent></Card><Card className={data.counts.missingMeasurables ? "border-sky-200 bg-sky-50/50" : ""}><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Prep needed</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.missingMeasurables}</p><p className="text-xs text-muted-foreground">Measurables</p></CardContent></Card><Card><CardContent className="p-2.5"><p className="text-xs text-muted-foreground">Rocks off track</p><p className="mt-0.5 text-2xl font-semibold">{data.counts.offTrackRocks}</p><p className="text-xs text-muted-foreground">Need a next action</p></CardContent></Card></div></DashboardSection>
        <section className="grid items-stretch gap-2 xl:grid-cols-2"><PulseCompletedHistory className="h-full min-h-36 min-w-0 overflow-hidden" contextId={workspaceId === "all" ? undefined : workspaceId} title={workspaceId === "all" ? "Completed & Resolved work" : "Completed & Resolved in this meeting"} description={workspaceId === "all" ? "Search work you completed or resolved across authorized Pulse forums." : "Search completed or resolved work from this exact meeting."} onlyMine onChanged={changed} compact /><ActivitySummary activity={data.activity ?? []} /></section>
      </TabsContent>

      <TabsContent value="scorecard" className="mt-5"><PulseMasterScorecard /></TabsContent>
    </Tabs>
  </main>;
}
