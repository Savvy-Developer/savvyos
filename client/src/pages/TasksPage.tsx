import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { PriorityBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, CheckCircle2, Circle, ClipboardList, Edit2, User, Filter, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { safeFormat } from "@/lib/safeFormat";

const PAGE_SIZE = 50;

export default function TasksPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const role = (user as any)?.role;
  const isAdmin = role === "admin";
  const userId = (user as any)?.id;

  // "my" = My Tasks (default), "all" = All Tasks (admin only)
  const [viewMode, setViewMode] = useState<"my" | "all">("my");
  const showAllTasks = isAdmin && viewMode === "all";

  const [statusFilter, setStatusFilter] = useState("pending");
  const [assignedFilter, setAssignedFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [editForm, setEditForm] = useState({ status: "", dueDate: "", priority: "", description: "" });
  const [form, setForm] = useState({ title: "", description: "", priority: "medium" as const, dueDate: "", taskType: "follow_up" as const });

  const utils = trpc.useUtils();

  const queryStatus = statusFilter === "overdue" ? undefined : (statusFilter !== "all" ? statusFilter : undefined);

  // For admins: use a single listAll query for BOTH modes.
  // In "My Tasks" mode, pass assignedToId = userId to scope to the current user.
  // In "All Tasks" mode, pass no assignedToId (or the dropdown filter value) to see everything.
  // This avoids the dual-query / stale-cache inversion problem.
  const adminQueryAssignedTo = isAdmin
    ? viewMode === "my"
      ? (userId ?? undefined)                              // My Tasks → scope to self
      : assignedFilter ? parseInt(assignedFilter) : undefined  // All Tasks → optional dropdown filter
    : undefined;

  const { data: adminTasksData } = trpc.tasks.listAll.useQuery({
    status: queryStatus,
    assignedToId: adminQueryAssignedTo,
    createdFrom: createdFrom || undefined,
    createdTo: createdTo || undefined,
    page,
    limit: PAGE_SIZE,
  }, { enabled: isAdmin });

  // Non-admin users always use tasks.list (backend auto-scopes to ctx.user.id)
  const { data: nonAdminTasksData } = trpc.tasks.list.useQuery({
    status: queryStatus as any,
    dueDateFrom: dueDateFrom || undefined,
    dueDateTo: dueDateTo || undefined,
    page,
    limit: PAGE_SIZE,
  }, { enabled: !isAdmin });

  // Overdue badge count for nav
  const { data: overdueData } = trpc.tasks.myOverdueCount.useQuery();
  const myOverdueCount = overdueData?.count ?? 0;

  // Resolve which data set to use
  const sourceData = isAdmin ? adminTasksData : nonAdminTasksData;
  let rawRows: any[] = sourceData?.rows ?? [];
  let total = sourceData?.total ?? 0;

  // Client-side filters (priority, due date range) applied on top
  rawRows = rawRows.filter(({ task }: any) => {
    if (priorityFilter && task.priority !== priorityFilter) return false;
    if (dueDateFrom && task.dueDate && new Date(task.dueDate) < new Date(dueDateFrom)) return false;
    if (dueDateTo && task.dueDate && new Date(task.dueDate) > new Date(dueDateTo + "T23:59:59")) return false;
    return true;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Overdue filter: client-side on current page
  const tasks = statusFilter === "overdue"
    ? rawRows.filter(({ task }: any) =>
        task.dueDate &&
        new Date(task.dueDate) < new Date() &&
        task.status !== "completed" &&
        task.status !== "cancelled"
      )
    : rawRows;

  const { data: teamMembers } = trpc.users.list.useQuery({}, { enabled: isAdmin });

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setOpen(false);
      setForm({ title: "", description: "", priority: "medium", dueDate: "", taskType: "follow_up" });
      utils.tasks.list.invalidate();
      utils.tasks.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditOpen(false);
      utils.tasks.list.invalidate();
      utils.tasks.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const complete = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      toast.success("Task completed");
      utils.tasks.list.invalidate();
      utils.tasks.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const isOverdue = (dueDate: Date | null) => dueDate && new Date(dueDate) < new Date();

  const canComplete = (task: any) => {
    if (task.status === "completed") return false;
    // Admin can only complete their own tasks
    if (isAdmin && task.assignedToId !== userId) return false;
    return true;
  };

  const openEdit = (task: any) => {
    setEditTask(task);
    setEditForm({
      status: task.status ?? "pending",
      dueDate: task.dueDate ? safeFormat(task.dueDate, "yyyy-MM-dd") : "",
      priority: task.priority ?? "medium",
      description: task.description ?? "",
    });
    setEditOpen(true);
  };

  const handleEditSave = () => {
    if (!editTask) return;
    update.mutate({
      id: editTask.id,
      data: {
        status: editForm.status as any,
        dueDate: editForm.dueDate ? new Date(editForm.dueDate).toISOString() : null,
        priority: editForm.priority as any,
        description: editForm.description || null,
      },
    });
  };

  const handleContactClick = (task: any, contact: any) => {
    if (role === "agent" && task.relatedAgentConnectionId) {
      navigate(`/pipeline/${task.relatedAgentConnectionId}`);
    } else if (contact?.id) {
      navigate(`/contacts/${contact.id}`);
    }
  };

  const resetPage = () => setPage(1);

  const clearFilters = () => {
    setAssignedFilter("");
    setCreatedFrom("");
    setCreatedTo("");
    setPriorityFilter("");
    setDueDateFrom("");
    setDueDateTo("");
    setStatusFilter("pending");
    resetPage();
  };

  const hasActiveFilters = assignedFilter || createdFrom || createdTo || priorityFilter || dueDateFrom || dueDateTo;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Manage follow-ups, deadlines, and workflow tasks"
        actions={
          <div className="flex items-center gap-2">
            {/* My Tasks / All Tasks toggle (admin only) */}
            {isAdmin && (
              <div className="flex rounded-md border border-border overflow-hidden text-xs">
                <button
                  onClick={() => { setViewMode("my"); resetPage(); }}
                  className={`px-3 py-1.5 font-medium transition-colors flex items-center gap-1 ${
                    viewMode === "my" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  My Tasks
                  {myOverdueCount > 0 && (
                    <span className="ml-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                      {myOverdueCount > 9 ? "9+" : myOverdueCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setViewMode("all"); resetPage(); }}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    viewMode === "all" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  All Tasks
                </button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-1" /> Filters
              {hasActiveFilters && <span className="ml-1 w-2 h-2 bg-primary rounded-full" />}
            </Button>
            <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New Task</Button>
          </div>
        }
      />



      {/* Filters Panel */}
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {isAdmin ? (
                <>
                  {showAllTasks && (
                  <div>
                    <Label className="text-xs">Assigned To</Label>
                    <Select value={assignedFilter || "all"} onValueChange={(v) => { setAssignedFilter(v === "all" ? "" : v); resetPage(); }}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="All users" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {(teamMembers ?? []).map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.name ?? u.email ?? `User #${u.id}`} ({u.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  <div>
                    <Label className="text-xs">Priority</Label>
                    <Select value={priorityFilter || "all"} onValueChange={(v) => { setPriorityFilter(v === "all" ? "" : v); resetPage(); }}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="All priorities" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Due From</Label>
                    <Input type="date" className="mt-1" value={dueDateFrom} onChange={(e) => { setDueDateFrom(e.target.value); resetPage(); }} />
                  </div>
                  <div>
                    <Label className="text-xs">Due To</Label>
                    <Input type="date" className="mt-1" value={dueDateTo} onChange={(e) => { setDueDateTo(e.target.value); resetPage(); }} />
                  </div>
                  <div>
                    <Label className="text-xs">Created From</Label>
                    <Input type="date" className="mt-1" value={createdFrom} onChange={(e) => { setCreatedFrom(e.target.value); resetPage(); }} />
                  </div>
                  <div>
                    <Label className="text-xs">Created To</Label>
                    <Input type="date" className="mt-1" value={createdTo} onChange={(e) => { setCreatedTo(e.target.value); resetPage(); }} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Priority</Label>
                    <Select value={priorityFilter || "all"} onValueChange={(v) => { setPriorityFilter(v === "all" ? "" : v); resetPage(); }}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="All priorities" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Due From</Label>
                    <Input type="date" className="mt-1" value={dueDateFrom} onChange={(e) => { setDueDateFrom(e.target.value); resetPage(); }} />
                  </div>
                  <div>
                    <Label className="text-xs">Due To</Label>
                    <Input type="date" className="mt-1" value={dueDateTo} onChange={(e) => { setDueDateTo(e.target.value); resetPage(); }} />
                  </div>
                </>
              )}
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs text-primary hover:underline mt-2 flex items-center gap-1">
                <X className="h-3 w-3" /> Clear filters
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["all","pending","in_progress","completed","cancelled","overdue"].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); resetPage(); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? s === "overdue" ? "bg-red-600 text-white" : "bg-primary text-primary-foreground"
                : s === "overdue" ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}>
            {s === "all" ? "All" : s === "overdue" ? "Overdue" : s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Total count */}
      {total > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} tasks
        </p>
      )}

      <div className="space-y-2">
        {!tasks || tasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">
                {showAllTasks
                  ? "No tasks found"
                  : "You have no tasks assigned to you"}
              </p>
              <p className="text-xs mt-1">
                {showAllTasks
                  ? hasActiveFilters
                    ? "No tasks match the current filters."
                    : statusFilter !== "all"
                    ? `No tasks with status "${statusFilter.replace("_", " ")}".`
                    : "There are no tasks in the system yet."
                  : hasActiveFilters
                  ? "No tasks match the current filters."
                  : statusFilter !== "all"
                  ? `You have no ${statusFilter.replace("_", " ")} tasks.`
                  : "Tasks assigned to you will appear here."}
              </p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-primary hover:underline mt-2">
                  Clear filters and try again
                </button>
              )}
            </CardContent>
          </Card>
        ) : (
          tasks.map(({ task, assignedTo, contact }: any) => (
            <Card
              key={task.id}
              className={`transition-all hover:border-primary/30 cursor-pointer ${task.status === "completed" ? "opacity-60" : ""}`}
              onClick={() => navigate(`/tasks/${task.id}`)}
            >
              <CardContent className="p-4 flex items-start gap-3">
                <button
                  className="mt-0.5 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canComplete(task)) complete.mutate({ id: task.id });
                    else if (isAdmin && task.assignedToId !== userId) toast.error("You cannot complete tasks assigned to other users");
                  }}
                  title={isAdmin && task.assignedToId !== userId ? "Cannot complete tasks assigned to other users" : undefined}
                >
                  {task.status === "completed"
                    ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                    : <Circle className={`h-5 w-5 ${canComplete(task) ? "text-muted-foreground hover:text-primary" : "text-muted-foreground/30"}`} />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>{task.title}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); openEdit(task); }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <PriorityBadge priority={task.priority} />
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        task.status === "completed" ? "bg-green-100 text-green-700" :
                        task.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>{task.status?.replace("_"," ")}</span>
                    </div>
                  </div>
                  {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                    {task.dueDate && (
                      <span className={isOverdue(task.dueDate) && task.status !== "completed" ? "text-red-600 font-medium" : ""}>
                        Due {safeFormat(task.dueDate, "MMM d, yyyy")}
                        {isOverdue(task.dueDate) && task.status !== "completed" && " · Overdue"}
                      </span>
                    )}
                    {assignedTo && (
                      <button
                        className="flex items-center gap-1 hover:text-primary hover:underline"
                        onClick={(e) => { e.stopPropagation(); navigate(`/agents/${assignedTo.id}`); }}
                        title="View agent profile"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {assignedTo.name}
                      </button>
                    )}
                    {contact && (
                      <button
                        className="flex items-center gap-1 text-primary hover:underline"
                        onClick={(e) => { e.stopPropagation(); handleContactClick(task, contact); }}
                      >
                        <User className="h-3 w-3" />
                        {contact.firstName} {contact.lastName}
                      </button>
                    )}
                    <span className="capitalize">{task.taskType?.replace("_"," ")}</span>
                    {task.createdAt && <span>Created {safeFormat(task.createdAt, "MMM d, yyyy h:mm a")}</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total.toLocaleString()} total)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["low","medium","high","urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.taskType} onValueChange={(v) => setForm({ ...form, taskType: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="outreach">Outreach</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="payout">Payout</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate({ title: form.title, description: form.description || null, priority: form.priority, taskType: form.taskType, dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null, assignedToId: userId ?? null })} disabled={!form.title || create.isPending}>
              {create.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending","in_progress","completed","cancelled"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low","medium","high","urgent"].map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Task notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
