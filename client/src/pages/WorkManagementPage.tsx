import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format, isValid, startOfMonth } from "date-fns";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Bell, CalendarDays, CheckCircle2, ChevronRight, Circle, Columns3, FolderKanban,
  Inbox, LayoutList, ListTodo, Plus, Search, ShieldCheck, Sparkles, Users, X,
  BriefcaseBusiness, Files, CalendarRange, GanttChartSquare, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

type HomeTab = "projects" | "my_tasks" | "inbox" | "portfolios";
type ProjectView = "list" | "board" | "timeline" | "calendar" | "overview" | "files";

const viewMeta: Record<ProjectView, { label: string; icon: React.ReactNode }> = {
  list: { label: "List", icon: <LayoutList className="h-3.5 w-3.5" /> },
  board: { label: "Board", icon: <Columns3 className="h-3.5 w-3.5" /> },
  timeline: { label: "Timeline", icon: <GanttChartSquare className="h-3.5 w-3.5" /> },
  calendar: { label: "Calendar", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  overview: { label: "Overview", icon: <Sparkles className="h-3.5 w-3.5" /> },
  files: { label: "Files", icon: <Files className="h-3.5 w-3.5" /> },
};

function asDate(value: unknown) {
  const date = value ? new Date(String(value)) : null;
  return date && isValid(date) ? date : null;
}

function dateInput(value: unknown) {
  const date = asDate(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}

function ProjectCreateDialog({
  open,
  onOpenChange,
  teams,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: any[];
  onCreated: (id: number) => void;
}) {
  const [form, setForm] = useState({ name: "", teamId: "", dueOn: "", description: "", defaultView: "list" as ProjectView, privacy: "public_to_team" as const });
  const create = trpc.work.projects.create.useMutation({
    onSuccess: (result) => {
      toast.success("Project created");
      setForm({ name: "", teamId: "", dueOn: "", description: "", defaultView: "list", privacy: "public_to_team" });
      onOpenChange(false);
      onCreated(result.id);
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return toast.error("A project name is required.");
    create.mutate({
      name: form.name.trim(),
      teamId: form.teamId ? Number(form.teamId) : null,
      descriptionPlainText: form.description.trim() || undefined,
      dueOn: form.dueOn ? new Date(`${form.dueOn}T12:00:00`) : null,
      defaultView: form.defaultView,
      privacy: form.privacy,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>Start a project with a flexible task structure, sections, members, and views.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="work-project-name">Project name</Label><Input id="work-project-name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} autoFocus placeholder="e.g. Listing launch — 123 Maple Street" /></div>
          <div className="space-y-1.5"><Label htmlFor="work-project-description">Description</Label><Textarea id="work-project-description" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="What is this project intended to accomplish?" rows={3} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Team</Label><Select value={form.teamId || "none"} onValueChange={value => setForm(current => ({ ...current, teamId: value === "none" ? "" : value }))}><SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger><SelectContent><SelectItem value="none">No team</SelectItem>{teams.map(team => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="work-project-due">Target date</Label><Input id="work-project-due" type="date" value={form.dueOn} onChange={event => setForm(current => ({ ...current, dueOn: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Default view</Label><Select value={form.defaultView} onValueChange={value => setForm(current => ({ ...current, defaultView: value as ProjectView }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(viewMeta).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Privacy</Label><Select value={form.privacy} onValueChange={value => setForm(current => ({ ...current, privacy: value as typeof form.privacy }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public_to_team">Team members</SelectItem><SelectItem value="private_to_members">Only invited members</SelectItem><SelectItem value="public_to_workspace">Entire workspace</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create project"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeamCreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const create = trpc.work.teams.create.useMutation({
    onSuccess: () => { toast.success("Team created"); setName(""); onOpenChange(false); onCreated(); },
    onError: error => toast.error(error.message),
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Create team</DialogTitle><DialogDescription>Teams organize the projects they own and their membership.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (name.trim()) create.mutate({ name: name.trim() }); }} className="space-y-4"><div className="space-y-1.5"><Label htmlFor="work-team-name">Team name</Label><Input id="work-team-name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Marketing" autoFocus /></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create team"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function AddTaskForm({ projectId, sectionId, onDone }: { projectId: number; sectionId: number | null; onDone: () => void }) {
  const [name, setName] = useState("");
  const [dueOn, setDueOn] = useState("");
  const create = trpc.work.tasks.create.useMutation({
    onSuccess: () => { setName(""); setDueOn(""); onDone(); },
    onError: error => toast.error(error.message),
  });
  return <form className="flex items-center gap-2 border-t border-border bg-muted/20 px-3 py-2" onSubmit={event => { event.preventDefault(); if (name.trim()) create.mutate({ name: name.trim(), projectId, sectionId, dueOn: dueOn ? new Date(`${dueOn}T12:00:00`) : null }); }}><Input value={name} onChange={event => setName(event.target.value)} placeholder="Add a task…" className="h-8 text-sm" /><Input value={dueOn} onChange={event => setDueOn(event.target.value)} type="date" className="h-8 w-36 text-xs" /><Button size="sm" type="submit" disabled={!name.trim() || create.isPending}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button></form>;
}

function TaskRow({ task, onSelect, onRefresh }: { task: any; onSelect: (task: any) => void; onRefresh: () => void }) {
  const complete = trpc.work.tasks.complete.useMutation({ onSuccess: onRefresh, onError: error => toast.error(error.message) });
  const date = asDate(task.dueOn ?? task.dueAt);
  return <div className="group flex cursor-pointer items-center gap-2 border-t border-border px-3 py-2.5 hover:bg-muted/50" onClick={() => onSelect(task)}>
    <button aria-label={task.completionStatus === "complete" ? "Reopen task" : "Complete task"} onClick={event => { event.stopPropagation(); complete.mutate({ id: task.id, completed: task.completionStatus !== "complete" }); }} className="shrink-0 text-muted-foreground hover:text-primary">{task.completionStatus === "complete" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}</button>
    <span className={cn("min-w-0 flex-1 truncate text-sm", task.completionStatus === "complete" && "text-muted-foreground line-through")}>{task.name}</span>
    {task.taskType === "milestone" && <Badge variant="outline" className="text-[10px]">Milestone</Badge>}
    {task.assignees?.length > 0 && <span title={task.assignees.map((assignee: any) => assignee.name).join(", ")} className="hidden max-w-28 truncate text-xs text-muted-foreground md:block">{task.assignees.map((assignee: any) => assignee.name?.split(" ")[0]).join(", ")}</span>}
    {date && <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">{format(date, "MMM d")}</span>}
  </div>;
}

function TaskDetailDialog({ task, open, onOpenChange, onRefresh }: { task: any; open: boolean; onOpenChange: (open: boolean) => void; onRefresh: () => void }) {
  const taskQuery = trpc.work.tasks.get.useQuery({ id: task?.id ?? 0 }, { enabled: !!task?.id && open });
  const [comment, setComment] = useState("");
  const addComment = trpc.work.tasks.addComment.useMutation({ onSuccess: () => { setComment(""); taskQuery.refetch(); onRefresh(); }, onError: error => toast.error(error.message) });
  const current = taskQuery.data as any;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="pr-8">{current?.name ?? task?.name ?? "Task"}</DialogTitle><DialogDescription>{current?.memberships?.map((membership: any) => membership.projectName).filter(Boolean).join(" · ") || "Personal task"}</DialogDescription></DialogHeader>{!current ? <div className="py-12 text-center text-sm text-muted-foreground">Loading task…</div> : <div className="space-y-5"><div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium capitalize">{current.completionStatus}</p></div><div><p className="text-xs text-muted-foreground">Due</p><p className="font-medium">{dateInput(current.dueOn ?? current.dueAt) || "None"}</p></div><div><p className="text-xs text-muted-foreground">Assignees</p><p className="font-medium">{current.assignees?.map((assignee: any) => assignee.name).filter(Boolean).join(", ") || "None"}</p></div><div><p className="text-xs text-muted-foreground">Followers</p><p className="font-medium">{current.followers?.length ?? 0}</p></div></div>{current.descriptionPlainText && <div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</p><p className="whitespace-pre-wrap text-sm">{current.descriptionPlainText}</p></div>}<div><p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity</p><div className="space-y-3">{current.stories?.length ? current.stories.map((story: any) => <div key={story.id} className="border-l-2 border-primary/25 pl-3"><p className="text-sm">{story.contentPlainText || story.storyType}</p><p className="text-xs text-muted-foreground">{story.actorName || "SavvyOS"} · {format(new Date(story.createdAt), "MMM d, h:mm a")}</p></div>) : <p className="text-sm text-muted-foreground">No activity yet.</p>}</div></div><form onSubmit={event => { event.preventDefault(); if (comment.trim()) addComment.mutate({ taskId: current.id, contentPlainText: comment.trim() }); }} className="flex gap-2"><Input value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a comment…" /><Button type="submit" disabled={!comment.trim() || addComment.isPending}><MessageSquare className="mr-1 h-3.5 w-3.5" />Post</Button></form></div>}</DialogContent></Dialog>;
}

function ProjectWorkspace({ projectId, open, onOpenChange, onRefresh }: { projectId: number | null; open: boolean; onOpenChange: (open: boolean) => void; onRefresh: () => void }) {
  const projectQuery = trpc.work.projects.get.useQuery({ id: projectId ?? 0 }, { enabled: !!projectId && open });
  const [view, setView] = useState<ProjectView>("list");
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const data = projectQuery.data as any;
  const tasksQuery = trpc.work.tasks.listForProject.useQuery({ projectId: projectId ?? 0, limit: 100 }, { enabled: !!projectId && open });
  const tasks = (tasksQuery.data as any)?.items ?? [];
  useEffect(() => { if (data?.defaultView) setView(data.defaultView as ProjectView); }, [data?.defaultView]);
  const sections = data?.sections ?? [];
  const tasksBySection = useMemo(() => {
    const map = new Map<number | null, any[]>();
    for (const task of tasks) map.set(task.sectionId ?? null, [...(map.get(task.sectionId ?? null) ?? []), task]);
    return map;
  }, [tasks]);
  const addSection = trpc.work.sections.create.useMutation({ onSuccess: () => projectQuery.refetch(), onError: error => toast.error(error.message) });
  const [showSectionInput, setShowSectionInput] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const refresh = () => { projectQuery.refetch(); tasksQuery.refetch(); onRefresh(); };
  const completed = tasks.filter((task: any) => task.completionStatus === "complete").length;
  const datedTasks = tasks.filter((task: any) => task.dueOn || task.dueAt).sort((a: any, b: any) => (String(a.dueOn ?? a.dueAt)).localeCompare(String(b.dueOn ?? b.dueAt)));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[93vh] max-w-[96vw] overflow-y-auto p-0 sm:max-w-6xl"><div className="border-b border-border bg-card px-5 py-4"><DialogHeader><div className="flex items-start justify-between gap-6"><div className="min-w-0"><DialogTitle className="flex items-center gap-2 text-xl"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: data?.color || "#14b8a6" }} />{data?.name || "Loading project…"}</DialogTitle><DialogDescription className="mt-1">{data?.teamName || "No team"}{data?.ownerName ? ` · Owner: ${data.ownerName}` : ""}</DialogDescription></div><div className="hidden items-center gap-3 text-right sm:flex"><div><p className="text-xs text-muted-foreground">Progress</p><p className="text-sm font-semibold">{completed}/{tasks.length} complete</p></div><div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%` }} /></div></div></div></DialogHeader></div>{data && <div className="p-5"><Tabs value={view} onValueChange={value => setView(value as ProjectView)}><TabsList className="mb-5 h-auto w-full justify-start overflow-x-auto bg-transparent p-0"><div className="flex gap-1">{(Object.keys(viewMeta) as ProjectView[]).map(key => <TabsTrigger key={key} value={key} className="gap-1.5 data-[state=active]:bg-muted">{viewMeta[key].icon}{viewMeta[key].label}</TabsTrigger>)}</div></TabsList><TabsContent value="list" className="mt-0"><div className="space-y-3">{sections.map((section: any) => <div key={section.id} className="overflow-hidden rounded-lg border border-border"><div className="flex items-center justify-between bg-muted/35 px-3 py-2"><p className="text-sm font-semibold">{section.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{(tasksBySection.get(section.id) ?? []).length}</span></p></div>{(tasksBySection.get(section.id) ?? []).map(task => <TaskRow key={task.id} task={task} onSelect={setSelectedTask} onRefresh={refresh} />)}<AddTaskForm projectId={data.id} sectionId={section.id} onDone={refresh} /></div>)}{(tasksBySection.get(null) ?? []).length > 0 && <div className="overflow-hidden rounded-lg border border-border"><div className="bg-muted/35 px-3 py-2 text-sm font-semibold">Unsectioned</div>{(tasksBySection.get(null) ?? []).map(task => <TaskRow key={task.id} task={task} onSelect={setSelectedTask} onRefresh={refresh} />)}</div>}{showSectionInput ? <form onSubmit={event => { event.preventDefault(); if (sectionName.trim()) addSection.mutate({ projectId: data.id, name: sectionName.trim() }, { onSuccess: () => { setSectionName(""); setShowSectionInput(false); } }); }} className="flex gap-2"><Input value={sectionName} onChange={event => setSectionName(event.target.value)} placeholder="Section name" autoFocus /><Button type="submit">Add section</Button><Button type="button" variant="outline" onClick={() => setShowSectionInput(false)}>Cancel</Button></form> : <Button variant="outline" size="sm" onClick={() => setShowSectionInput(true)}><Plus className="mr-1 h-3.5 w-3.5" />Add section</Button>}</div></TabsContent><TabsContent value="board" className="mt-0"><div className="grid min-w-max grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">{sections.map((section: any) => <div key={section.id} className="w-72 rounded-lg border border-border bg-muted/20 p-3"><p className="mb-3 text-sm font-semibold">{section.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{(tasksBySection.get(section.id) ?? []).length}</span></p><div className="space-y-2">{(tasksBySection.get(section.id) ?? []).map(task => <button key={task.id} className="w-full rounded-md border border-border bg-card p-3 text-left shadow-sm hover:border-primary/50" onClick={() => setSelectedTask(task)}><p className={cn("text-sm font-medium", task.completionStatus === "complete" && "line-through text-muted-foreground")}>{task.name}</p>{task.dueOn && <p className="mt-1 text-xs text-muted-foreground">Due {format(new Date(task.dueOn), "MMM d")}</p>}</button>)}</div><div className="mt-3"><AddTaskForm projectId={data.id} sectionId={section.id} onDone={refresh} /></div></div>)}</div></TabsContent><TabsContent value="timeline" className="mt-0"><div className="rounded-lg border border-border"><div className="border-b border-border bg-muted/30 px-4 py-3 text-sm font-semibold">Timeline</div>{datedTasks.length ? datedTasks.map((task: any) => <div key={task.id} className="grid grid-cols-[120px_1fr] border-b border-border last:border-0"><div className="border-r border-border px-3 py-3 text-xs text-muted-foreground">{format(new Date(task.dueOn ?? task.dueAt), "MMM d, yyyy")}</div><button onClick={() => setSelectedTask(task)} className="px-3 py-3 text-left text-sm hover:bg-muted/50">{task.name}</button></div>) : <p className="p-8 text-center text-sm text-muted-foreground">Give tasks a start or due date to display them on the timeline.</p>}</div></TabsContent><TabsContent value="calendar" className="mt-0"><div className="rounded-lg border border-border"><div className="border-b border-border bg-muted/30 px-4 py-3 text-sm font-semibold">{format(startOfMonth(new Date()), "MMMM yyyy")}</div>{datedTasks.length ? <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">{datedTasks.map((task: any) => <button key={task.id} onClick={() => setSelectedTask(task)} className="rounded-md border border-border p-3 text-left hover:border-primary/50"><p className="text-xs text-muted-foreground">{format(new Date(task.dueOn ?? task.dueAt), "EEE, MMM d")}</p><p className="mt-1 text-sm font-medium">{task.name}</p></button>)}</div> : <p className="p-8 text-center text-sm text-muted-foreground">No dated tasks yet.</p>}</div></TabsContent><TabsContent value="overview" className="mt-0"><div className="grid gap-4 lg:grid-cols-3"><div className="rounded-lg border border-border p-4 lg:col-span-2"><h3 className="font-semibold">Project overview</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{data.descriptionPlainText || "Add a project description to orient the team."}</p><div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-md bg-muted/40 p-3"><p className="text-xl font-bold">{tasks.length}</p><p className="text-xs text-muted-foreground">Tasks</p></div><div className="rounded-md bg-muted/40 p-3"><p className="text-xl font-bold">{completed}</p><p className="text-xs text-muted-foreground">Completed</p></div><div className="rounded-md bg-muted/40 p-3"><p className="text-xl font-bold">{data.members?.length ?? 0}</p><p className="text-xs text-muted-foreground">Members</p></div></div></div><div className="rounded-lg border border-border p-4"><h3 className="font-semibold">Status updates</h3>{data.statusUpdates?.length ? data.statusUpdates.map((update: any) => <div className="mt-3 border-l-2 border-primary pl-3" key={update.id}><p className="text-sm font-medium capitalize">{String(update.status).replace("_", " ")}</p><p className="text-xs text-muted-foreground">{format(new Date(update.createdAt), "MMM d")}</p><p className="mt-1 text-sm">{update.bodyPlainText || update.title}</p></div>) : <p className="mt-2 text-sm text-muted-foreground">No status updates yet.</p>}</div></div></TabsContent><TabsContent value="files" className="mt-0"><FilesView projectId={data.id} /></TabsContent></Tabs></div>}<TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={value => !value && setSelectedTask(null)} onRefresh={refresh} /></DialogContent></Dialog>;
}

function FilesView({ projectId }: { projectId: number }) {
  const { data = [] } = trpc.work.attachments.listForProject.useQuery({ projectId });
  return <div className="rounded-lg border border-border p-5">{(data as any[]).length ? <div className="space-y-2">{(data as any[]).map(file => <a className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted" key={file.id} href={file.fileUrl} target="_blank" rel="noreferrer"><span className="truncate">{file.fileName}</span><span className="text-xs text-muted-foreground">{format(new Date(file.createdAt), "MMM d")}</span></a>)}</div> : <div className="py-8 text-center"><Files className="mx-auto mb-2 h-7 w-7 text-muted-foreground" /><p className="text-sm text-muted-foreground">No files are attached to this project.</p></div>}</div>;
}

export default function WorkManagementPage() {
  const [, navigate] = useLocation();
  const [homeTab, setHomeTab] = useState<HomeTab>("projects");
  const [search, setSearch] = useState("");
  const [projectDialog, setProjectDialog] = useState(false);
  const [teamDialog, setTeamDialog] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const projectsQuery = trpc.work.projects.list.useQuery({ search: search || undefined, limit: 100 });
  const teamsQuery = trpc.work.teams.list.useQuery();
  const myTasksQuery = trpc.work.myTasks.list.useQuery({ limit: 100 }, { enabled: homeTab === "my_tasks" });
  const inboxQuery = trpc.work.inbox.list.useQuery({ limit: 100 }, { enabled: homeTab === "inbox" });
  const portfoliosQuery = trpc.work.portfolios.list.useQuery(undefined, { enabled: homeTab === "portfolios" });
  const globalResultsQuery = trpc.work.search.useQuery({ query: globalSearch || "_", limit: 15 }, { enabled: globalSearchOpen && globalSearch.trim().length > 1 });
  const markRead = trpc.work.inbox.markRead.useMutation({ onSuccess: () => inboxQuery.refetch(), onError: error => toast.error(error.message) });
  const createPortfolio = trpc.work.portfolios.create.useMutation({ onSuccess: () => { toast.success("Portfolio created"); portfoliosQuery.refetch(); }, onError: error => toast.error(error.message) });
  const [newPortfolio, setNewPortfolio] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setGlobalSearchOpen(true); }
      if (event.altKey && event.key.toLowerCase() === "q") { event.preventDefault(); setProjectDialog(true); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const projects = (projectsQuery.data as any)?.items ?? [];
  const unread = ((inboxQuery.data as any)?.items ?? []).filter((item: any) => !item.readAt).length;
  const refreshProjects = () => projectsQuery.refetch();

  return <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6"><PageHeader title="Projects & Plans" subtitle="A single work-management layer for teams, projects, tasks, portfolios, and intake workflows" actions={<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setTeamDialog(true)}><Users className="mr-1 h-4 w-4" />New team</Button><Button variant="outline" size="sm" onClick={() => setGlobalSearchOpen(true)}><Search className="mr-1 h-4 w-4" />Search<span className="ml-2 hidden rounded border border-border px-1 text-[10px] text-muted-foreground sm:inline">⌘K</span></Button><Button size="sm" onClick={() => setProjectDialog(true)}><Plus className="mr-1 h-4 w-4" />New project</Button></div>} /><div className="mb-6 flex flex-wrap gap-2 border-b border-border"><button className={cn("border-b-2 px-3 py-2 text-sm font-medium", homeTab === "projects" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")} onClick={() => setHomeTab("projects")}><FolderKanban className="mr-1.5 inline h-4 w-4" />Projects</button><button className={cn("border-b-2 px-3 py-2 text-sm font-medium", homeTab === "my_tasks" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")} onClick={() => setHomeTab("my_tasks")}><ListTodo className="mr-1.5 inline h-4 w-4" />My tasks</button><button className={cn("border-b-2 px-3 py-2 text-sm font-medium", homeTab === "inbox" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")} onClick={() => setHomeTab("inbox")}><Inbox className="mr-1.5 inline h-4 w-4" />Inbox{unread > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{unread}</span>}</button><button className={cn("border-b-2 px-3 py-2 text-sm font-medium", homeTab === "portfolios" ? "border-primary text-foreground" : "border-transparent text-muted-foreground")} onClick={() => setHomeTab("portfolios")}><BriefcaseBusiness className="mr-1.5 inline h-4 w-4" />Portfolios</button><button className="ml-auto border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => navigate("/projects/legacy")}>Legacy tracker <ChevronRight className="inline h-3.5 w-3.5" /></button></div>{homeTab === "projects" && <section><div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search projects…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Permission-aware workspace</div></div>{projectsQuery.isLoading ? <div className="py-20 text-center text-sm text-muted-foreground">Loading projects…</div> : projects.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project: any) => { const total = project.taskCounts?.total ?? 0; const complete = project.taskCounts?.completed ?? 0; const progress = total ? Math.round((complete / total) * 100) : 0; return <button key={project.id} onClick={() => setSelectedProjectId(project.id)} className="group rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color || "#14b8a6" }} /><p className="truncate font-semibold">{project.name}</p></div><p className="mt-1 truncate text-xs text-muted-foreground">{project.teamName || "Independent project"}</p></div><Badge variant="outline" className="gap-1 text-[10px]">{viewMeta[project.defaultView as ProjectView]?.icon}{viewMeta[project.defaultView as ProjectView]?.label || "List"}</Badge></div><div className="mt-5"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{complete}/{total} tasks</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{project.ownerName || "No owner"}</span><span>{project.dueOn ? `Due ${format(new Date(project.dueOn), "MMM d")}` : "No target date"}</span></div></button>; })}</div> : <div className="rounded-xl border border-dashed border-border py-20 text-center"><FolderKanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">Create the first structured project</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Projects support sections, multi-homed tasks, collaborative activity, custom fields, multiple views, templates, forms, and rules.</p><Button className="mt-4" onClick={() => setProjectDialog(true)}><Plus className="mr-1 h-4 w-4" />Create project</Button></div>}</section>}{homeTab === "my_tasks" && <section className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-semibold">My tasks</h2><span className="text-xs text-muted-foreground">Cross-project tasks assigned to you</span></div>{((myTasksQuery.data as any)?.items ?? []).length ? <div>{((myTasksQuery.data as any)?.items ?? []).map((task: any) => <div key={task.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"><Circle className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{task.name}</p><p className="text-xs text-muted-foreground">{task.dueOn ? `Due ${format(new Date(task.dueOn), "MMM d, yyyy")}` : "No due date"}</p></div><Badge variant="outline" className="capitalize">{task.completionStatus}</Badge></div>)}</div> : <div className="py-16 text-center"><ListTodo className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Tasks assigned to you will appear here across all projects.</p></div>}</section>}{homeTab === "inbox" && <section className="rounded-xl border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="font-semibold">Inbox</h2><Button variant="ghost" size="sm" onClick={() => { const ids = ((inboxQuery.data as any)?.items ?? []).filter((item: any) => !item.readAt).map((item: any) => item.id); if (ids.length) markRead.mutate({ ids, read: true }); }}>Mark all read</Button></div>{((inboxQuery.data as any)?.items ?? []).length ? <div>{((inboxQuery.data as any)?.items ?? []).map((item: any) => <button key={item.id} onClick={() => !item.readAt && markRead.mutate({ ids: [item.id], read: true })} className={cn("flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/40", !item.readAt && "bg-primary/[0.03]")}><Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.title}</p>{item.body && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</p>}<p className="mt-1 text-xs text-muted-foreground">{format(new Date(item.createdAt), "MMM d, h:mm a")}</p></div>{!item.readAt && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}</button>)}</div> : <div className="py-16 text-center"><Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">Mentions, assignments, and project activity will appear here.</p></div>}</section>}{homeTab === "portfolios" && <section><div className="mb-4 flex gap-2"><Input value={newPortfolio} onChange={event => setNewPortfolio(event.target.value)} placeholder="New portfolio name" /><Button onClick={() => { if (newPortfolio.trim()) createPortfolio.mutate({ name: newPortfolio.trim() }, { onSuccess: () => setNewPortfolio("") }); }} disabled={!newPortfolio.trim() || createPortfolio.isPending}><Plus className="mr-1 h-4 w-4" />Create portfolio</Button></div>{portfoliosQuery.isLoading ? <div className="py-16 text-center text-sm text-muted-foreground">Loading portfolios…</div> : (portfoliosQuery.data as any[])?.length ? <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{(portfoliosQuery.data as any[]).map(portfolio => <div className="rounded-xl border border-border bg-card p-4" key={portfolio.id}><BriefcaseBusiness className="mb-3 h-5 w-5 text-primary" /><p className="font-semibold">{portfolio.name}</p><p className="mt-1 text-xs text-muted-foreground">{portfolio.privacy === "public_to_workspace" ? "Workspace portfolio" : "Member-only portfolio"}</p></div>)}</div> : <div className="rounded-xl border border-dashed border-border py-16 text-center"><BriefcaseBusiness className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">No portfolios yet</p><p className="mt-1 text-sm text-muted-foreground">Use portfolios to roll up projects or create property-level project bundles.</p></div>}</section>}<ProjectCreateDialog open={projectDialog} onOpenChange={setProjectDialog} teams={(teamsQuery.data as any[]) ?? []} onCreated={id => { refreshProjects(); setSelectedProjectId(id); }} /><TeamCreateDialog open={teamDialog} onOpenChange={setTeamDialog} onCreated={() => teamsQuery.refetch()} /><ProjectWorkspace projectId={selectedProjectId} open={!!selectedProjectId} onOpenChange={value => !value && setSelectedProjectId(null)} onRefresh={refreshProjects} /><Dialog open={globalSearchOpen} onOpenChange={setGlobalSearchOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Search work</DialogTitle><DialogDescription>Find projects and tasks that you can access.</DialogDescription></DialogHeader><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus className="pl-9" value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} placeholder="Search projects and tasks…" /></div><div className="max-h-72 overflow-y-auto">{globalSearch.trim().length > 1 ? (globalResultsQuery.data as any[])?.length ? (globalResultsQuery.data as any[]).map(result => <button key={`${result.type}-${result.id}`} className="flex w-full items-center gap-3 border-b border-border px-2 py-3 text-left hover:bg-muted" onClick={() => { if (result.type === "project") { setSelectedProjectId(result.id); setGlobalSearchOpen(false); } }}><span className="rounded bg-muted p-1.5">{result.type === "project" ? <FolderKanban className="h-3.5 w-3.5" /> : <ListTodo className="h-3.5 w-3.5" />}</span><div><p className="text-sm font-medium">{result.name}</p><p className="text-xs capitalize text-muted-foreground">{result.type}</p></div></button>) : <p className="py-8 text-center text-sm text-muted-foreground">No matching work found.</p> : <p className="py-8 text-center text-sm text-muted-foreground">Enter at least two characters to search.</p>}</div></DialogContent></Dialog></div>;
}
