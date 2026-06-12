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
import { Plus, CheckCircle2, Circle, ClipboardList, Edit2, Filter, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { safeFormat } from "@/lib/safeFormat";
import { useCelebration } from "@/hooks/useCelebration";

const PAGE_SIZE = 50;

export default function MyTasksPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const userId = (user as any)?.id;
  const isAdmin = (user as any)?.role === "admin";
  const [statusFilter, setStatusFilter] = useState("pending");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [editForm, setEditForm] = useState({ status: "", dueDate: "", priority: "", description: "" });
  const utils = trpc.useUtils();
  const { celebrate } = useCelebration();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", priority: "medium", dueDate: "", taskType: "follow_up" });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setCreateOpen(false);
      setCreateForm({ title: "", description: "", priority: "medium", dueDate: "", taskType: "follow_up" });
      if (isAdmin) utils.tasks.listAll.invalidate();
      else utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const queryStatus = statusFilter === "overdue" ? undefined : (statusFilter !== "all" ? statusFilter : undefined);

  // Admins use listAll (can see all tasks), non-admins use list (auto-filters to self)
  const { data: adminTasksData } = trpc.tasks.listAll.useQuery({
    assignedToId: userId,
    status: queryStatus,
    page,
    limit: PAGE_SIZE,
  }, { enabled: !!userId && isAdmin });

  const { data: myTasksListData } = trpc.tasks.list.useQuery({
    status: queryStatus,
    page,
    limit: PAGE_SIZE,
  }, { enabled: !!userId && !isAdmin });

  // Both tasks.list and tasks.listAll return { rows, total, page, limit }
  const myTasksData = isAdmin ? adminTasksData : myTasksListData;

  let rawRows: any[] = (myTasksData as any)?.rows ?? [];
  let total = (myTasksData as any)?.total ?? 0;

  // Client-side priority and date filters
  rawRows = rawRows.filter(({ task }: any) => {
    if (priorityFilter && task.priority !== priorityFilter) return false;
    if (dueDateFrom && task.dueDate && new Date(task.dueDate) < new Date(dueDateFrom)) return false;
    if (dueDateTo && task.dueDate && new Date(task.dueDate) > new Date(dueDateTo + "T23:59:59")) return false;
    return true;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Overdue filter
  const tasks = statusFilter === "overdue"
    ? rawRows.filter(({ task }: any) =>
        task.dueDate &&
        new Date(task.dueDate) < new Date() &&
        task.status !== "completed" &&
        task.status !== "cancelled"
      )
    : rawRows;

  const update = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditOpen(false);
      if (isAdmin) utils.tasks.listAll.invalidate();
      else utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleStatus = trpc.tasks.update.useMutation({
    onSuccess: (_data, variables) => {
      if (isAdmin) utils.tasks.listAll.invalidate();
      else utils.tasks.list.invalidate();
      if ((variables as any)?.data?.status === "completed") celebrate("task_done");
    },
  });

  function openEdit(task: any) {
    setEditTask(task);
    setEditForm({
      status: task.status,
      dueDate: task.dueDate ? safeFormat(task.dueDate, "yyyy-MM-dd") : "",
      priority: task.priority ?? "medium",
      description: task.description ?? "",
    });
    setEditOpen(true);
  }

  const statusTabs = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "overdue", label: "Overdue" },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <PageHeader title="My Tasks" subtitle="Tasks assigned to you" />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Task
        </Button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters toggle */}
      <div className="flex items-center gap-2 mb-4">
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4 mr-1" />
          Filters
        </Button>
        {(priorityFilter || dueDateFrom || dueDateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setPriorityFilter(""); setDueDateFrom(""); setDueDateTo(""); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {showFilters && (
        <Card className="mb-4">
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priorityFilter || "all_priorities"} onValueChange={(v) => setPriorityFilter(v === "all_priorities" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_priorities">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Due From</Label>
              <Input type="date" value={dueDateFrom} onChange={(e) => setDueDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Due To</Label>
              <Input type="date" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No tasks found</CardContent></Card>
        ) : (
          tasks.map(({ task, assignee, creator }: any) => {
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed" && task.status !== "cancelled";
            return (
              <Card key={task.id} className={`hover:bg-muted/30 transition-colors cursor-pointer ${isOverdue ? "border-red-400/50" : ""}`} onClick={() => navigate(`/tasks/${task.id}`)}>
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStatus.mutate({ id: task.id, data: { status: task.status === "completed" ? "pending" : "completed" } });
                    }}
                    className="shrink-0"
                  >
                    {task.status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium truncate ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {task.dueDate && (
                        <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                          Due: {safeFormat(task.dueDate, "MMM d, yyyy")}
                        </span>
                      )}
                      {task.relatedContactId && (
                        <span className="flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Contact
                        </span>
                      )}
                      {task.relatedTransactionId && (
                        <span className="flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Transaction
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={(e) => { e.stopPropagation(); openEdit(task); }}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} placeholder="Task title" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={createForm.taskType} onValueChange={(v) => setCreateForm({ ...createForm, taskType: v })}>
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
            <div>
              <Label>Priority</Label>
              <Select value={createForm.priority} onValueChange={(v) => setCreateForm({ ...createForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} rows={3} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!createForm.title.trim()) { toast.error("Title is required"); return; }
              createTask.mutate({
                title: createForm.title,
                description: createForm.description || null,
                priority: createForm.priority as any,
                taskType: createForm.taskType as any,
                dueDate: createForm.dueDate || null,
                assignedToId: userId,
              });
            }} disabled={createTask.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!editTask) return;
              update.mutate({
                id: editTask.id,
                data: {
                  status: editForm.status as any,
                  dueDate: editForm.dueDate || undefined,
                  priority: editForm.priority as any,
                  description: editForm.description || undefined,
                },
              });
            }} disabled={update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
