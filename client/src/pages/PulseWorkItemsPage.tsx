import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Check, ChevronDown, Circle, ListFilter, MessageCircle, Plus, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

type Scope = { meetingId?: string; meetingName?: string; compact?: boolean };
type WorkItem = any;

const typeLabel: Record<string, string> = { todo: "To-do", issue: "Issue", rock: "Rock" };
const statusLabel: Record<string, string> = {
  open: "Open", done: "Done", dropped: "Dropped", discussing: "Discussing", solved: "Solved",
  on_track: "On track", at_risk: "At risk", off_track: "Off track",
};
const statusTone: Record<string, string> = {
  open: "bg-slate-500", discussing: "bg-sky-600", done: "bg-emerald-600", solved: "bg-emerald-600",
  dropped: "bg-zinc-500", on_track: "bg-emerald-600", at_risk: "bg-amber-500", off_track: "bg-rose-600",
};

function readableDate(value?: string | null) {
  if (!value) return "No date";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusMark({ status }: { status: string }) {
  return <span className="inline-flex items-center gap-2 text-sm font-medium"><span className={`h-3 w-3 shrink-0 rounded-full ${statusTone[status] ?? "bg-slate-400"}`} aria-hidden="true" />{statusLabel[status] ?? status}</span>;
}

function RowAction({ children, onClick, label, pressed }: { children: React.ReactNode; onClick: () => void; label: string; pressed?: boolean }) {
  return <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</button>;
}

function NewWorkItem({ scope }: { scope: Scope }) {
  const utils = trpc.useUtils();
  const { data: meetings = [] } = trpc.pulse.list.useQuery();
  const create = trpc.pulse.workItems.create.useMutation({ onSuccess: () => utils.pulse.workItems.list.invalidate() });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"todo" | "issue" | "rock">("todo");
  const [title, setTitle] = useState("");
  const [meetingId, setMeetingId] = useState(scope.meetingId ?? "");
  const [quarter, setQuarter] = useState("Q3 2026");

  if (!open) return <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add work item</Button>;
  const selectedMeetingId = scope.meetingId ?? meetingId;
  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Add work item</p><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">Type<select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"><option value="todo">To-do</option><option value="issue">Issue</option><option value="rock">Rock</option></select></label>
          {!scope.meetingId && <label className="space-y-1 text-sm font-medium sm:col-span-2">Meeting<select value={meetingId} onChange={(event) => setMeetingId(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"><option value="">Choose a meeting</option>{meetings.map((meeting: any) => <option key={meeting.id} value={meeting.id}>{meeting.name}</option>)}</select></label>}
          {type === "rock" && <label className="space-y-1 text-sm font-medium">Quarter<Input value={quarter} onChange={(event) => setQuarter(event.target.value)} aria-label="Rock quarter" /></label>}
        </div>
        <label className="block space-y-1 text-sm font-medium">Name<Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={type === "todo" ? "What needs to happen?" : type === "issue" ? "What needs a decision?" : "What big goal matters this quarter?"} onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget.form?.querySelector("button[type=submit]") as HTMLButtonElement | null)?.click(); }} /></label>
        {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        <Button type="button" className="min-h-11" disabled={!title.trim() || !selectedMeetingId || create.isPending} onClick={async () => {
          await create.mutateAsync({ type, title: title.trim(), meetingId: selectedMeetingId || null, ownerPersonId: selectedMeetingId ? null : null, quarter: type === "rock" ? quarter : null });
          setTitle(""); setOpen(false);
        }}>Add {typeLabel[type]}</Button>
      </CardContent>
    </Card>
  );
}

function WorkItemRow({ item, onOpen }: { item: WorkItem; onOpen: () => void }) {
  const utils = trpc.useUtils();
  const todo = trpc.pulse.workItems.setTodoStatus.useMutation({ onSuccess: () => utils.pulse.workItems.list.invalidate() });
  const [editingPercent, setEditingPercent] = useState(false);
  const [percent, setPercent] = useState(String(item.percentComplete ?? 0));
  const setPercentMutation = trpc.pulse.workItems.setManualRockPercent.useMutation({ onSuccess: () => { utils.pulse.workItems.list.invalidate(); setEditingPercent(false); } });
  const setRockStatus = trpc.pulse.workItems.setRockStatus.useMutation({ onSuccess: () => utils.pulse.workItems.list.invalidate() });
  const [pendingRockStatus, setPendingRockStatus] = useState<string | null>(null);
  const [rockNote, setRockNote] = useState("");

  const commitRockStatus = async (skip = false) => {
    if (!pendingRockStatus) return;
    await setRockStatus.mutateAsync({ workItemId: item.id, status: pendingRockStatus as any, note: skip ? null : rockNote || null });
    setPendingRockStatus(null); setRockNote("");
  };

  return <article className="border-b border-border last:border-b-0">
    <div className="flex min-h-14 flex-wrap items-center gap-2 px-3 py-2 sm:flex-nowrap sm:px-4">
      {item.type === "todo" ? <RowAction label={item.status === "done" ? `Mark ${item.title} open` : `Mark ${item.title} done`} pressed={item.status === "done"} onClick={() => todo.mutate({ workItemId: item.id, status: item.status === "done" ? "open" : "done" })}>{item.status === "done" ? <Check className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</RowAction> : <span className="inline-flex min-h-11 min-w-11 items-center justify-center" aria-hidden="true">{item.type === "issue" ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <Target className="h-5 w-5 text-primary" />}</span>}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="truncate text-base font-medium text-foreground">{item.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{item.meetingName ?? "Personal work"} · {typeLabel[item.type]}{item.type === "todo" ? ` · due ${readableDate(item.dueDate)}` : ""}{item.carriedOverCount >= 3 ? ` · carried over ${item.carriedOverCount} times` : ""}</p></button>
      <div className="flex items-center gap-2">{item.isOverdue && <span className="rounded-full bg-rose-100 px-2 py-1 text-xs font-medium text-rose-800">Overdue</span>}
        {item.type === "rock" && item.percentSource === "manual" && !editingPercent && <RowAction label={`Change ${item.title} progress`} onClick={() => setEditingPercent(true)}>{item.percentComplete}%</RowAction>}
        {item.type === "rock" && item.percentSource === "from_milestones" && <span className="min-h-11 rounded-md bg-muted px-3 py-2 text-sm font-medium">Milestones set progress</span>}
        <StatusMark status={item.status} />
        {item.type === "rock" && <select aria-label={`Change ${item.title} status`} value={pendingRockStatus ?? item.status} onChange={(event) => { const next = event.target.value; const asks = next === "at_risk" || next === "off_track" || (["at_risk", "off_track"].includes(item.status) && next === "on_track"); if (asks) setPendingRockStatus(next); else setRockStatus.mutate({ workItemId: item.id, status: next as any, note: null }); }} className="min-h-11 rounded-md border border-input bg-background px-2 text-sm"><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="off_track">Off track</option><option value="done">Done</option><option value="dropped">Dropped</option></select>}
      </div>
      {editingPercent && <div className="flex w-full items-center gap-2 border-t border-border pt-2"><label className="text-sm font-medium" htmlFor={`percent-${item.id}`}>Progress</label><Input id={`percent-${item.id}`} className="min-h-11 max-w-24" type="number" min="0" max="100" autoFocus value={percent} onChange={(event) => setPercent(event.target.value)} onBlur={() => setPercentMutation.mutate({ workItemId: item.id, percentComplete: Math.max(0, Math.min(100, Number(percent) || 0)) })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span className="text-sm text-muted-foreground">% · saves when you leave this field</span></div>}
    </div>
    {pendingRockStatus && <div className="flex flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-3"><label className="text-sm font-medium" htmlFor={`rock-note-${item.id}`}>{pendingRockStatus === "on_track" ? "What changed?" : "What happened?"}</label><Input id={`rock-note-${item.id}`} autoFocus className="min-h-11 min-w-[13rem] flex-1 bg-background" value={rockNote} onChange={(event) => setRockNote(event.target.value)} onBlur={() => commitRockStatus()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="One sentence is enough" /><button type="button" className="min-h-11 px-2 text-sm font-medium underline" onMouseDown={(event) => event.preventDefault()} onClick={() => commitRockStatus(true)}>Skip</button></div>}
  </article>;
}

function ItemDetailPanel({ workItemId, onClose }: { workItemId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.pulse.workItems.detail.useQuery({ workItemId });
  const update = trpc.pulse.workItems.update.useMutation({ onSuccess: () => { utils.pulse.workItems.detail.invalidate({ workItemId }); utils.pulse.workItems.list.invalidate(); } });
  const issueStatus = trpc.pulse.workItems.setIssueStatus.useMutation({ onSuccess: () => { utils.pulse.workItems.detail.invalidate({ workItemId }); utils.pulse.workItems.list.invalidate(); } });
  const setMilestone = trpc.pulse.workItems.setMilestoneComplete.useMutation({ onSuccess: () => { utils.pulse.workItems.detail.invalidate({ workItemId }); utils.pulse.workItems.list.invalidate(); } });
  const addMilestone = trpc.pulse.workItems.addMilestone.useMutation({ onSuccess: () => utils.pulse.workItems.detail.invalidate({ workItemId }) });
  const move = trpc.pulse.workItems.move.useMutation({ onSuccess: () => { utils.pulse.workItems.detail.invalidate({ workItemId }); utils.pulse.workItems.list.invalidate(); } });
  const resolveRollover = trpc.pulse.workItems.resolveQuarterRollover.useMutation({ onSuccess: () => { utils.pulse.workItems.detail.invalidate({ workItemId }); utils.pulse.workItems.list.invalidate(); } });
  const addComment = trpc.pulse.workItems.addComment.useMutation({ onSuccess: () => utils.pulse.workItems.detail.invalidate({ workItemId }) });
  const { data: meetings = [] } = trpc.pulse.list.useQuery();
  const [issueNote, setIssueNote] = useState("");
  const [makeTodo, setMakeTodo] = useState(false);
  const [newMilestone, setNewMilestone] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [comment, setComment] = useState("");
  const [mentionId, setMentionId] = useState("");
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [nextQuarter, setNextQuarter] = useState("Q4 2026");

  if (isLoading || !data) return <Card><CardContent className="space-y-3 p-5"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-32 w-full" /></CardContent></Card>;
  const { item, milestones, milestoneProgress, comments, moves, statusNotes, members, quarterRolloverPending } = data as any;
  const canMention = (members ?? []).filter((person: any) => person.id !== item.assigneeId || true);
  return <aside aria-label={`${item.title} details`} className="rounded-xl border border-primary/30 bg-card shadow-sm">
    <div className="flex items-start justify-between gap-4 border-b border-border p-4"><div><p className="text-sm font-medium text-primary">{item.meetingName ?? "Personal work"}</p><p className="mt-1 text-sm text-muted-foreground">{typeLabel[item.type]} · <StatusMark status={item.status} /></p></div><Button type="button" variant="ghost" className="min-h-11" onClick={onClose}><X className="mr-2 h-4 w-4" />Close</Button></div>
    <div className="space-y-6 p-4">
      <label className="block space-y-1 text-sm font-medium">Name<Input defaultValue={item.title} onBlur={(event) => { if (event.target.value.trim() && event.target.value !== item.title) update.mutate({ workItemId: item.id, title: event.target.value.trim() }); }} /></label>
      <label className="block space-y-1 text-sm font-medium">Description<textarea defaultValue={item.description ?? ""} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-base" onBlur={(event) => { if (event.target.value !== (item.description ?? "")) update.mutate({ workItemId: item.id, description: event.target.value || null }); }} placeholder="Add context if it helps" /></label>
      {quarterRolloverPending && <section className="rounded-lg border border-amber-300 bg-amber-50 p-3"><h3 className="font-medium">This rock needs a quarter-end choice</h3><p className="mt-1 text-sm text-muted-foreground">Choose what happens next. Nothing changes until you choose.</p><div className="mt-3 flex flex-wrap items-center gap-2"><Input aria-label="Next quarter" className="min-h-11 w-32 bg-background" value={nextQuarter} onChange={(event) => setNextQuarter(event.target.value)} /><Button type="button" className="min-h-11" onClick={() => resolveRollover.mutate({ workItemId: item.id, action: "carry", nextQuarter })}>Carry forward</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => resolveRollover.mutate({ workItemId: item.id, action: "done" })}>Mark done</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => resolveRollover.mutate({ workItemId: item.id, action: "drop" })}>Drop</Button></div>{resolveRollover.error && <p role="alert" className="mt-2 text-sm text-destructive">{resolveRollover.error.message}</p>}</section>}
      {item.type === "todo" && <label className="block space-y-1 text-sm font-medium">Due date<Input type="date" defaultValue={item.dueDate ?? ""} onChange={(event) => update.mutate({ workItemId: item.id, dueDate: event.target.value || null })} /></label>}
      {item.type === "issue" && <section className="rounded-lg border border-border p-3"><h3 className="font-medium">Decision</h3>{item.status === "solved" ? <p className="mt-2 text-sm text-muted-foreground">{item.solvedNote}</p> : <><label className="mt-2 block text-sm font-medium">What did we decide?<Input value={issueNote} onChange={(event) => setIssueNote(event.target.value)} placeholder="One sentence" /></label><label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={makeTodo} onChange={(event) => setMakeTodo(event.target.checked)} className="h-5 w-5" />Create a to-do from this decision</label><Button type="button" className="mt-2 min-h-11" disabled={!issueNote.trim()} onClick={() => issueStatus.mutate({ workItemId: item.id, status: "solved", solvedNote: issueNote, createTodo: makeTodo ? { title: issueNote } : undefined })}>Mark solved</Button></>}</section>}
      {item.type === "rock" && <section className="rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Milestones</h3>{milestoneProgress && <p className="text-sm font-medium">{milestoneProgress.completed} of {milestoneProgress.total} · {milestoneProgress.percent}%</p>}</div>{milestones.length ? <div className="mt-2 divide-y divide-border">{milestones.map((milestone: any) => <div key={milestone.id} className="flex min-h-14 items-center gap-3 py-2"><RowAction label={`${milestone.isComplete ? "Reopen" : "Complete"} milestone ${milestone.title}`} pressed={milestone.isComplete} onClick={() => setMilestone.mutate({ milestoneId: milestone.id, isComplete: !milestone.isComplete })}>{milestone.isComplete ? <Check className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</RowAction><div className="min-w-0 flex-1"><p className="text-sm font-medium">{milestone.title}</p><p className="text-xs text-muted-foreground">Due {readableDate(milestone.dueDate)}{milestone.completedAt ? ` · checked by ${milestone.completedByName ?? "a teammate"}` : ""}</p></div></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No milestones yet. You can set progress directly from the list.</p>}<div className="mt-3 flex flex-wrap gap-2"><Input className="min-h-11 flex-1" value={newMilestone} onChange={(event) => setNewMilestone(event.target.value)} placeholder="Add a milestone" /><Input className="min-h-11 w-40" type="date" value={milestoneDate} onChange={(event) => setMilestoneDate(event.target.value)} /><Button type="button" variant="outline" className="min-h-11" disabled={!newMilestone.trim() || !milestoneDate} onClick={() => { addMilestone.mutate({ workItemId: item.id, title: newMilestone, dueDate: milestoneDate }); setNewMilestone(""); setMilestoneDate(""); }}><Plus className="mr-1 h-4 w-4" />Add</Button></div></section>}
      <section className="rounded-lg border border-border p-3"><h3 className="font-medium">Move</h3><p className="mt-1 text-sm text-muted-foreground">An item stays in one place. You can move it to another meeting you belong to.</p><div className="mt-2 flex flex-wrap gap-2"><select aria-label="Move to meeting" value={destination} onChange={(event) => setDestination(event.target.value)} className="min-h-11 min-w-48 rounded-md border border-input bg-background px-3 text-base"><option value="">Choose a meeting</option>{meetings.filter((meeting: any) => meeting.id !== item.meetingId).map((meeting: any) => <option key={meeting.id} value={meeting.id}>{meeting.name}</option>)}</select><Input className="min-h-11 flex-1" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why move it? (optional)" /><Button type="button" variant="outline" className="min-h-11" disabled={!destination} onClick={() => move.mutate({ workItemId: item.id, toMeetingId: destination, toOwnerPersonId: null, reason: reason || null })}><ArrowRightLeft className="mr-1 h-4 w-4" />Move</Button></div></section>
      <section className="rounded-lg border border-border p-3"><h3 className="flex items-center gap-2 font-medium"><MessageCircle className="h-4 w-4" />Comments</h3>{comments.length ? <div className="mt-3 space-y-3">{comments.map((entry: any) => <div key={entry.id} className="border-l-2 border-muted pl-3"><p className="text-sm font-medium">{entry.authorName ?? "A teammate"}{entry.mentions.length ? <span className="font-normal text-muted-foreground"> mentioned {entry.mentions.map((person: any) => person.name ?? "a teammate").join(", ")}</span> : null}</p><p className="mt-1 whitespace-pre-wrap text-sm">{entry.body}</p></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No comments yet.</p>}<textarea value={comment} onChange={(event) => setComment(event.target.value)} className="mt-3 min-h-20 w-full rounded-md border border-input bg-background p-3 text-base" placeholder="Write a comment" /><div className="mt-2 flex flex-wrap items-center gap-2"><select aria-label="Mention someone in this meeting" value={mentionId} onChange={(event) => { const id = event.target.value; setMentionId(id); const person = canMention.find((entry: any) => String(entry.id) === id); if (person && !comment.includes(`@${person.name}`)) setComment((current) => `${current}${current ? " " : ""}@${person.name} `); }} className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">Mention a meeting member</option>{canMention.map((person: any) => <option key={person.id} value={person.id}>{person.name ?? person.email}</option>)}</select><Button type="button" variant="outline" className="min-h-11" disabled={!comment.trim()} onClick={() => { addComment.mutate({ workItemId: item.id, body: comment, mentionedPersonIds: mentionId ? [Number(mentionId)] : [] }); setComment(""); setMentionId(""); }}>Add comment</Button></div>{addComment.error && <p role="alert" className="mt-2 text-sm text-destructive">{addComment.error.message}</p>}</section>
      <section><h3 className="font-medium">History</h3><div className="mt-2 space-y-2 text-sm text-muted-foreground">{statusNotes.map((note: any) => <p key={note.id}><span className="font-medium text-foreground">{note.personName ?? "A teammate"}</span> changed status from {statusLabel[note.fromStatus] ?? note.fromStatus ?? "new"} to {statusLabel[note.toStatus] ?? note.toStatus}.{note.note ? ` ${note.note}` : ""}</p>)}{moves.map((entry: any) => <p key={entry.id}>Moved from {entry.fromMeetingName} to {entry.toMeetingName} by {entry.movedById === item.assigneeId ? item.assigneeName ?? "a teammate" : "a teammate"}{entry.reason ? ` · ${entry.reason}` : ""}.</p>)}{!statusNotes.length && !moves.length && <p>No changes recorded yet.</p>}</div></section>
    </div>
  </aside>;
}

export default function PulseWorkItemsPage(scope: Scope) {
  const { data: meetings = [] } = trpc.pulse.list.useQuery();
  const { data: assignees = [] } = trpc.pulse.workItems.assignees.useQuery();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [meetingFilter, setMeetingFilter] = useState(scope.meetingId ?? "");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filters = useMemo(() => ({ type: type || undefined, status: status || undefined, meetingId: scope.meetingId ?? (meetingFilter || undefined), assigneeId: assigneeFilter ? Number(assigneeFilter) : undefined }), [type, status, meetingFilter, assigneeFilter, scope.meetingId]);
  const { data: items = [], isLoading } = trpc.pulse.workItems.list.useQuery(filters as any);
  const title = scope.meetingName ? `What needs attention in ${scope.meetingName}?` : "Work item verification";
  const detail = scope.meetingName ? "Update the work in this meeting without leaving the page." : "Use this internal view to verify real to-dos, issues, and rocks. Every item keeps its meeting name.";
  return <div className="space-y-5"><header className="max-w-4xl border-b border-border pb-5"><p className="text-sm font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 text-base leading-6 text-muted-foreground">{detail}</p></header><div className="flex flex-wrap items-center justify-between gap-3"><NewWorkItem scope={scope} /></div><section aria-label="Work item filters" className="rounded-xl border border-border bg-card p-3"><div className="flex flex-wrap items-center gap-2"><ListFilter className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><label className="sr-only" htmlFor="work-type">Work type</label><select id="work-type" value={type} onChange={(event) => setType(event.target.value)} className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">All types</option><option value="todo">To-dos</option><option value="issue">Issues</option><option value="rock">Rocks</option></select><label className="sr-only" htmlFor="work-status">Status</label><select id="work-status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">All statuses</option><option value="open">Open</option><option value="done">Done</option><option value="at_risk">At risk</option><option value="off_track">Off track</option><option value="solved">Solved</option></select><label className="sr-only" htmlFor="work-assignee">Assignee</label><select id="work-assignee" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">All assignees</option>{assignees.map((person: any) => <option key={person.id} value={person.id}>{person.name ?? person.email}</option>)}</select>{!scope.meetingId && <><label className="sr-only" htmlFor="work-meeting">Meeting</label><select id="work-meeting" value={meetingFilter} onChange={(event) => setMeetingFilter(event.target.value)} className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"><option value="">All meetings I belong to</option>{meetings.map((meeting: any) => <option key={meeting.id} value={meeting.id}>{meeting.name}</option>)}</select></>}</div></section>{isLoading ? <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.75fr)]"><section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Work items">{items.length ? items.map((item: any) => <WorkItemRow key={item.id} item={item} onOpen={() => setSelectedId(item.id)} />) : <div className="p-6 text-sm text-muted-foreground">No work items match these filters.</div>}</section>{selectedId ? <ItemDetailPanel workItemId={selectedId} onClose={() => setSelectedId(null)} /> : <Card className="hidden xl:block"><CardHeader><CardTitle className="text-lg">Open an item</CardTitle><CardDescription>Click a name to see its description, comments, moves, and history.</CardDescription></CardHeader></Card>}</div>}</div>;
}
