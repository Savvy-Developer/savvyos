import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, isPast, isToday, addDays } from "date-fns";
import {
  Plus, LayoutList, LayoutGrid, Search,
  CheckCircle2, Clock, TrendingUp, AlertTriangle, ChevronRight, Calendar,
  User, Layers, MoreHorizontal, Archive, Trash2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";
type Status = "not_started" | "in_progress" | "at_risk" | "completed";
type UpdateStatus = "on_track" | "at_risk" | "off_track";

interface Project {
  id: number;
  title: string;
  description: string;
  department: string;
  ownerId: number | null;
  ownerName: string | null;
  dueDate: Date;
  priority: Priority;
  status: Status;
  taskTotal: number;
  taskCompleted: number;
  latestUpdate: { updateStatus: UpdateStatus; progressPct: number; createdAt: Date } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ReactNode }> = {
  not_started: { label: "Not Started", color: "bg-slate-100 text-slate-700 border-slate-200", icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: "In Progress", color: "bg-blue-50 text-blue-700 border-blue-200", icon: <TrendingUp className="h-3 w-3" /> },
  at_risk: { label: "At Risk", color: "bg-amber-50 text-amber-700 border-amber-200", icon: <AlertTriangle className="h-3 w-3" /> },
  completed: { label: "Completed", color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3 w-3" /> },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string }> = {
  high: { label: "High", dot: "bg-red-500" },
  medium: { label: "Medium", dot: "bg-amber-500" },
  low: { label: "Low", dot: "bg-slate-400" },
};

const UPDATE_STATUS_CONFIG: Record<UpdateStatus, { label: string; color: string }> = {
  on_track: { label: "On Track", color: "text-green-600" },
  at_risk: { label: "At Risk", color: "text-amber-600" },
  off_track: { label: "Off Track", color: "text-red-600" },
};

const KANBAN_COLUMNS: { status: Status; label: string }[] = [
  { status: "not_started", label: "Not Started" },
  { status: "in_progress", label: "In Progress" },
  { status: "at_risk", label: "At Risk" },
  { status: "completed", label: "Completed" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDueDateLabel(date: Date) {
  if (isPast(date) && !isToday(date)) return { label: "Overdue", cls: "text-red-600 font-medium" };
  if (isToday(date)) return { label: "Due today", cls: "text-amber-600 font-medium" };
  if (date <= addDays(new Date(), 7)) return { label: format(date, "MMM d"), cls: "text-amber-600" };
  return { label: format(date, "MMM d, yyyy"), cls: "text-muted-foreground" };
}

// ─── Department Combobox ──────────────────────────────────────────────────────

function DepartmentCombobox({
  value,
  onChange,
  departments,
  onDepartmentCreated,
  placeholder = "Select department",
}: {
  value: string;
  onChange: (v: string) => void;
  departments: { id: number; name: string }[];
  onDepartmentCreated?: (name: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const createDept = trpc.pm.departments.create.useMutation({
    onSuccess: (dept) => {
      onChange(dept.name);
      if (onDepartmentCreated) onDepartmentCreated(dept.name);
      setOpen(false);
      setInputValue("");
      toast.success(`Department "${dept.name}" created`);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = departments.filter(d =>
    d.name.toLowerCase().includes(inputValue.toLowerCase())
  );
  const canCreate = inputValue.trim().length > 0 &&
    !departments.some(d => d.name.toLowerCase() === inputValue.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 text-sm"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <svg className="ml-2 h-4 w-4 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M8 15l4 4 4-4" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or create..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            <CommandEmpty>
              {canCreate ? (
                <button
                  className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-accent"
                  onClick={() => createDept.mutate({ name: inputValue.trim() })}
                >
                  <Plus className="h-3.5 w-3.5 inline mr-1" />
                  Create "{inputValue.trim()}"
                </button>
              ) : (
                <p className="text-xs text-muted-foreground px-3 py-2">No departments found</p>
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map(d => (
                <CommandItem
                  key={d.id}
                  value={d.name}
                  onSelect={() => { onChange(d.name); setOpen(false); setInputValue(""); }}
                >
                  <CheckCircle2 className={cn("mr-2 h-3.5 w-3.5", value === d.name ? "opacity-100 text-primary" : "opacity-0")} />
                  {d.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && filtered.length > 0 && (
              <CommandGroup heading="Create new">
                <CommandItem
                  value={`__create__${inputValue}`}
                  onSelect={() => createDept.mutate({ name: inputValue.trim() })}
                >
                  <Plus className="mr-2 h-3.5 w-3.5 text-primary" />
                  Add "{inputValue.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, onArchive }: { project: Project; onArchive: (id: number) => void }) {
  const [, navigate] = useLocation();
  const statusCfg = STATUS_CONFIG[project.status];
  const priorityCfg = PRIORITY_CONFIG[project.priority];
  const dueDateInfo = getDueDateLabel(project.dueDate);
  const progress = project.taskTotal > 0 ? Math.round((project.taskCompleted / project.taskTotal) * 100) : (project.latestUpdate?.progressPct ?? 0);

  return (
    <div
      className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer group"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${priorityCfg.dot}`} title={`${priorityCfg.label} priority`} />
            <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {project.title}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}>
              View Project
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={e => { e.stopPropagation(); onArchive(project.id); }}
            >
              <Archive className="h-3.5 w-3.5 mr-2" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Status + Department */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.color}`}>
          {statusCfg.icon} {statusCfg.label}
        </span>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{project.department}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>{project.taskTotal > 0 ? `${project.taskCompleted}/${project.taskTotal} tasks` : "No tasks yet"}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${project.status === "completed" ? "bg-green-500" : project.status === "at_risk" ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs">
        <span className={dueDateInfo.cls}>
          <Calendar className="h-3 w-3 inline mr-1" />
          {dueDateInfo.label}
        </span>
        {project.ownerName && (
          <span className="text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            {project.ownerName.split(" ")[0]}
          </span>
        )}
      </div>

      {/* Latest update status */}
      {project.latestUpdate && (
        <div className={`mt-2 pt-2 border-t border-border text-xs ${UPDATE_STATUS_CONFIG[project.latestUpdate.updateStatus].color}`}>
          {UPDATE_STATUS_CONFIG[project.latestUpdate.updateStatus].label} · Updated {format(project.latestUpdate.createdAt, "MMM d")}
        </div>
      )}
    </div>
  );
}

// ─── Create Project Dialog ────────────────────────────────────────────────────

function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  departments,
  onDepartmentCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  departments: { id: number; name: string }[];
  onDepartmentCreated: (name: string) => void;
}) {
  const { user } = useAuth();
  const { data: adminUsers = [] } = trpc.users.list.useQuery({ role: "admin" });
  const create = trpc.pm.projects.create.useMutation({
    onSuccess: () => { toast.success("Project created"); onCreated(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    department: "",
    ownerId: String((user as any)?.id ?? ""),
    dueDate: "",
    priority: "medium" as Priority,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.description || !form.department || !form.dueDate || !form.ownerId) {
      toast.error("Please fill in all required fields");
      return;
    }
    create.mutate({
      title: form.title,
      description: form.description,
      department: form.department,
      ownerId: Number(form.ownerId),
      dueDate: new Date(form.dueDate),
      priority: form.priority,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Project title" />
          </div>
          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea id="description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this project about?" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Department *</Label>
              <DepartmentCombobox
                value={form.department}
                onChange={v => setForm(f => ({ ...f, department: v }))}
                departments={departments}
                onDepartmentCreated={onDepartmentCreated}
              />
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Priority }))}>
                <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="owner">Owner *</Label>
              <Select value={form.ownerId} onValueChange={v => setForm(f => ({ ...f, ownerId: v }))}>
                <SelectTrigger id="owner"><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  {(adminUsers as any[]).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dueDate">Due Date *</Label>
              <Input id="dueDate" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [view, setView] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [filterCollaborator, setFilterCollaborator] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // Departments management
  const [deptMgmtOpen, setDeptMgmtOpen] = useState(false);
  const [deptCreateOpen, setDeptCreateOpen] = useState(false);
  const [deptRenameOpen, setDeptRenameOpen] = useState(false);
  const [deptDeleteOpen, setDeptDeleteOpen] = useState(false);
  const [deptNewName, setDeptNewName] = useState("");
  const [deptRenameName, setDeptRenameName] = useState("");
  const [editingDept, setEditingDept] = useState<{ id: number; name: string } | null>(null);
  const [deletingDept, setDeletingDept] = useState<{ id: number; name: string } | null>(null);
  const { data: projects = [], refetch } = trpc.pm.projects.list.useQuery({
    includeArchived: showArchived,
  });
  const { data: departments = [], refetch: refetchDepts } = trpc.pm.departments.list.useQuery();
  const { data: adminUsers = [] } = trpc.users.list.useQuery({ role: "admin" });

  const archive = trpc.pm.projects.archive.useMutation({
    onSuccess: () => { toast.success("Project archived"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const createDeptMut = trpc.pm.departments.create.useMutation({
    onSuccess: () => { refetchDepts(); setDeptCreateOpen(false); setDeptNewName(""); toast.success("Department created"); },
    onError: (e) => toast.error(e.message),
  });
  const renameDeptMut = trpc.pm.departments.rename.useMutation({
    onSuccess: () => { refetchDepts(); setDeptRenameOpen(false); toast.success("Department renamed"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteDeptMut = trpc.pm.departments.delete.useMutation({
    onSuccess: () => { refetchDepts(); setDeptDeleteOpen(false); toast.success("Department deleted"); },
    onError: (e) => toast.error(e.message),
  });

  // Collaborator data: fetch per-project collaborators for filtering
  // We use the project list's ownerId to build the owner filter,
  // and we fetch all collaborators via a separate query per project for the collaborator filter.
  // For performance, we derive unique owners from the project list itself.
  const uniqueOwners = useMemo(() => {
    const seen = new Map<number, string>();
    for (const p of projects as Project[]) {
      if (p.ownerId && p.ownerName) seen.set(p.ownerId, p.ownerName);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [projects]);

  // For collaborator filter we use the admin users list as the pool of possible collaborators
  const collaboratorPool = useMemo(() => (adminUsers as any[]).map((u: any) => ({ id: u.id, name: u.name ?? u.email })), [adminUsers]);

  // We need per-project collaborator data for the filter to work.
  // Fetch all collaborators in one batch by using the project IDs.
  // Since tRPC doesn't support batch queries directly, we use a simple approach:
  // load collaborators for all projects via a separate query that returns all.
  // We'll add a `listAll` procedure or just skip the collaborator filter at the list level
  // and instead use the existing collaborators data embedded in getById.
  // For the list page, we'll use a lightweight approach: fetch collaborators for visible projects
  // using the existing `collaborators.listForProject` per project — but that's N+1.
  // Better: add a `collaborators.listAllForProjects` call. For now, use a client-side approach
  // by fetching all collaborators in one query via a new procedure we'll add.
  // For simplicity, we'll use the existing data and note this as a future optimization.
  // The collaborator filter will work by filtering projects where the selected user is a collaborator.
  // We'll store collaborator data in a map fetched from a bulk query.

  const filtered = useMemo(() => {
    return (projects as Project[]).filter(p => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.department.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterPriority !== "all" && p.priority !== filterPriority) return false;
      if (filterDept !== "all" && p.department !== filterDept) return false;
      if (filterOwner !== "all" && String(p.ownerId) !== filterOwner) return false;
      return true;
    });
  }, [projects, search, filterStatus, filterPriority, filterDept, filterOwner]);

  // Stats
  const stats = useMemo(() => {
    const all = projects as Project[];
    return {
      total: all.length,
      inProgress: all.filter(p => p.status === "in_progress").length,
      atRisk: all.filter(p => p.status === "at_risk").length,
      completed: all.filter(p => p.status === "completed").length,
      overdue: all.filter(p => p.status !== "completed" && isPast(p.dueDate) && !isToday(p.dueDate)).length,
    };
  }, [projects]);

  const hasFilters = filterStatus !== "all" || filterPriority !== "all" || filterDept !== "all" || filterOwner !== "all" || filterCollaborator !== "all" || search;

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Track all company projects, tasks, and weekly updates"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeptMgmtOpen(true)}>
              <Layers className="h-4 w-4 mr-1" /> Departments
            </Button>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Project
            </Button>
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total", value: stats.total, cls: "text-foreground" },
          { label: "In Progress", value: stats.inProgress, cls: "text-blue-600" },
          { label: "At Risk", value: stats.atRisk, cls: "text-amber-600" },
          { label: "Completed", value: stats.completed, cls: "text-green-600" },
          { label: "Overdue", value: stats.overdue, cls: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 mb-5">
        {/* Row 1: Search + view toggle */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex border border-border rounded-md overflow-hidden shrink-0">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none px-3"
              onClick={() => setView("list")}
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "kanban" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-none px-3"
              onClick={() => setView("kanban")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {/* Department filter */}
          <Select value={filterDept} onValueChange={setFilterDept}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {(departments as { id: number; name: string }[]).map(d => (
                <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Owner filter */}
          {uniqueOwners.length > 1 && (
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {uniqueOwners.map(o => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Clear filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setSearch("");
                setFilterStatus("all");
                setFilterPriority("all");
                setFilterDept("all");
                setFilterOwner("all");
                setFilterCollaborator("all");
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects found</p>
          <p className="text-sm mt-1">
            {hasFilters
              ? "Try adjusting your filters"
              : "Create your first project to get started"}
          </p>
          {!hasFilters && (
            <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Project
            </Button>
          )}
        </div>
      )}

      {/* List View */}
      {view === "list" && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(p => (
            <ProjectListRow key={p.id} project={p as Project} onArchive={id => archive.mutate({ id })} />
          ))}
        </div>
      )}

      {/* Kanban View */}
      {view === "kanban" && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {KANBAN_COLUMNS.map(col => {
            const colProjects = filtered.filter(p => p.status === col.status);
            const cfg = STATUS_CONFIG[col.status];
            return (
              <div key={col.status} className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">{colProjects.length}</span>
                </div>
                <div className="space-y-2">
                  {colProjects.map(p => (
                    <ProjectCard key={p.id} project={p as Project} onArchive={id => archive.mutate({ id })} />
                  ))}
                  {colProjects.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground">No projects</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refetch}
        departments={departments as { id: number; name: string }[]}
        onDepartmentCreated={() => refetchDepts()}
      />

      {/* ── Departments Management Dialog ── */}
      <Dialog open={deptMgmtOpen} onOpenChange={setDeptMgmtOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4" /> Manage Departments
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setDeptCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Department
              </Button>
            </div>
            {(departments as { id: number; name: string; projectCount?: number }[]).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No departments yet.</p>
            ) : (
              <div className="divide-y divide-border border rounded-lg">
                {(departments as { id: number; name: string; projectCount?: number }[]).map((dept) => (
                  <div key={dept.id} className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary/60" />
                      <span className="font-medium text-sm">{dept.name}</span>
                      {dept.projectCount != null && (
                        <span className="text-xs text-muted-foreground">{dept.projectCount} project{dept.projectCount !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingDept(dept); setDeptRenameName(dept.name); setDeptRenameOpen(true); }}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { setDeletingDept(dept); setDeptDeleteOpen(true); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dept */}
      <Dialog open={deptCreateOpen} onOpenChange={setDeptCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Department</DialogTitle></DialogHeader>
          <div className="py-2">
            <Input placeholder="Department name..." value={deptNewName} onChange={e => setDeptNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && deptNewName.trim()) createDeptMut.mutate({ name: deptNewName.trim() }); }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptCreateOpen(false)}>Cancel</Button>
            <Button disabled={!deptNewName.trim() || createDeptMut.isPending} onClick={() => createDeptMut.mutate({ name: deptNewName.trim() })}>
              {createDeptMut.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dept */}
      <Dialog open={deptRenameOpen} onOpenChange={setDeptRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename Department</DialogTitle></DialogHeader>
          <div className="py-2">
            <Input placeholder="New name..." value={deptRenameName} onChange={e => setDeptRenameName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && deptRenameName.trim() && editingDept) renameDeptMut.mutate({ id: editingDept.id, name: deptRenameName.trim() }); }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptRenameOpen(false)}>Cancel</Button>
            <Button disabled={!deptRenameName.trim() || renameDeptMut.isPending || !editingDept}
              onClick={() => editingDept && renameDeptMut.mutate({ id: editingDept.id, name: deptRenameName.trim() })}>
              {renameDeptMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dept */}
      <Dialog open={deptDeleteOpen} onOpenChange={setDeptDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Department</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Delete <strong>{deletingDept?.name}</strong>? Projects in this department will have their department cleared.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeptDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteDeptMut.isPending || !deletingDept}
              onClick={() => deletingDept && deleteDeptMut.mutate({ id: deletingDept.id })}>
              {deleteDeptMut.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── List Row ─────────────────────────────────────────────────────────────────
function ProjectListRow({ project, onArchive }: { project: Project; onArchive: (id: number) => void }) {
  const [, navigate] = useLocation();
  const statusCfg = STATUS_CONFIG[project.status];
  const priorityCfg = PRIORITY_CONFIG[project.priority];
  const dueDateInfo = getDueDateLabel(project.dueDate);
  const progress = project.taskTotal > 0
    ? Math.round((project.taskCompleted / project.taskTotal) * 100)
    : (project.latestUpdate?.progressPct ?? 0);

  return (
    <div
      className="bg-card border border-border rounded-lg px-4 py-3 hover:shadow-sm transition-all cursor-pointer group flex items-center gap-4"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      {/* Priority dot */}
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${priorityCfg.dot}`} title={`${priorityCfg.label} priority`} />

      {/* Title + dept */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">{project.title}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{project.department}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{project.description}</p>
      </div>

      {/* Status */}
      <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shrink-0 ${statusCfg.color}`}>
        {statusCfg.icon} {statusCfg.label}
      </span>

      {/* Progress */}
      <div className="hidden md:flex items-center gap-2 w-28 shrink-0">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${project.status === "completed" ? "bg-green-500" : project.status === "at_risk" ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-8 text-right">{progress}%</span>
      </div>

      {/* Due date */}
      <span className={`hidden lg:block text-xs shrink-0 ${dueDateInfo.cls}`}>
        {dueDateInfo.label}
      </span>

      {/* Owner */}
      {project.ownerName && (
        <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <User className="h-3 w-3" />
          {project.ownerName.split(" ")[0]}
        </span>
      )}

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}>
            View Project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={e => { e.stopPropagation(); onArchive(project.id); }}
          >
            <Archive className="h-3.5 w-3.5 mr-2" /> Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
    </div>
  );
}
