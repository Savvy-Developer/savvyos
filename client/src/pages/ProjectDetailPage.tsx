import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { format, isPast, isToday } from "date-fns";
import {
  ArrowLeft, Plus, CheckCircle2, Circle, AlertTriangle, TrendingUp,
  Clock, Calendar, User, Edit2, Trash2, MessageSquare, Sparkles,
  ChevronDown, ChevronUp, Save, X, MoreHorizontal, Activity,
  BarChart3, FileText, Users, StickyNote, AtSign, Eye, EyeOff, UserPlus, UserMinus,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low";
type Status = "not_started" | "in_progress" | "at_risk" | "completed";
type UpdateStatus = "on_track" | "at_risk" | "off_track";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; icon: React.ReactNode }> = {
  not_started: { label: "Not Started", color: "bg-slate-100 text-slate-700 border-slate-200", icon: <Clock className="h-3.5 w-3.5" /> },
  in_progress: { label: "In Progress", color: "bg-blue-50 text-blue-700 border-blue-200", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  at_risk: { label: "At Risk", color: "bg-amber-50 text-amber-700 border-amber-200", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  completed: { label: "Completed", color: "bg-green-50 text-green-700 border-green-200", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; badge: string }> = {
  high: { label: "High", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200" },
  medium: { label: "Medium", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { label: "Low", dot: "bg-slate-400", badge: "bg-slate-50 text-slate-700 border-slate-200" },
};

const UPDATE_STATUS_CONFIG: Record<UpdateStatus, { label: string; color: string; bg: string }> = {
  on_track: { label: "On Track", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  at_risk: { label: "At Risk", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  off_track: { label: "Off Track", color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

const ACTION_LABELS: Record<string, string> = {
  project_created: "created this project",
  project_updated: "updated project details",
  project_archived: "archived this project",
  task_created: "added a task",
  task_updated: "updated a task",
  task_completed: "completed task",
  task_reopened: "reopened task",
  task_deleted: "deleted a task",
  comment_added: "commented on a task",
  weekly_update_submitted: "submitted a weekly update",
};

// ─── Task Item ────────────────────────────────────────────────────────────────

function TaskItem({
  task,
  adminUsers,
  onToggle,
  onDelete,
  onUpdate,
}: {
  task: any;
  adminUsers: any[];
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, data: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [editForm, setEditForm] = useState({
    title: task.title,
    ownerId: String(task.ownerId ?? ""),
    dueDate: task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "",
    priority: task.priority as Priority,
    notes: task.notes ?? "",
  });

  const { data: comments = [], refetch: refetchComments } = trpc.pm.tasks.getComments.useQuery(
    { taskId: task.id },
    { enabled: expanded }
  );

  const addComment = trpc.pm.tasks.addComment.useMutation({
    onSuccess: () => { setCommentText(""); refetchComments(); },
    onError: (e) => toast.error(e.message),
  });

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && !task.completed && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && !task.completed && isToday(dueDate);

  function handleSaveEdit() {
    onUpdate(task.id, {
      title: editForm.title,
      ownerId: Number(editForm.ownerId),
      dueDate: editForm.dueDate ? new Date(editForm.dueDate) : undefined,
      priority: editForm.priority,
      notes: editForm.notes || undefined,
    });
    setEditing(false);
  }

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden transition-all", task.completed && "opacity-60")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => onToggle(task.id, !task.completed)}
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        >
          {task.completed
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : <Circle className="h-5 w-5" />
          }
        </button>

        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={editForm.title}
              onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <span className={cn("text-sm font-medium", task.completed && "line-through text-muted-foreground")}>
              {task.title}
            </span>
          )}
        </div>

        {/* Priority */}
        <span className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_CONFIG[task.priority as Priority]?.badge}`}>
          {PRIORITY_CONFIG[task.priority as Priority]?.label}
        </span>

        {/* Owner */}
        {task.ownerName && (
          <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <User className="h-3 w-3" />
            {task.ownerName.split(" ")[0]}
          </span>
        )}

        {/* Due date */}
        {dueDate && (
          <span className={cn(
            "hidden lg:block text-xs shrink-0",
            isOverdue ? "text-red-600 font-medium" : isDueToday ? "text-amber-600 font-medium" : "text-muted-foreground"
          )}>
            {isOverdue ? "Overdue" : isDueToday ? "Today" : format(dueDate, "MMM d")}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setExpanded(e => !e)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {(comments as any[]).length > 0 && (
              <span className="ml-0.5 text-xs">{(comments as any[]).length}</span>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(e => !e)}>
                <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExpanded(e => !e)}>
                <MessageSquare className="h-3.5 w-3.5 mr-2" /> Comments
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Owner</Label>
              <Select value={editForm.ownerId} onValueChange={v => setEditForm(f => ({ ...f, ownerId: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {adminUsers.map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={editForm.priority} onValueChange={v => setEditForm(f => ({ ...f, priority: v as Priority }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-xs" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveEdit}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5 mr-1" /> Cancel</Button>
          </div>
        </div>
      )}

      {/* Comments */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 px-4 py-3 space-y-3">
          {(comments as any[]).map((c: any) => (
            <div key={c.id} className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                {c.authorName?.[0] ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium">{c.authorName ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, h:mm a")}</span>
                </div>
                <p className="text-sm text-foreground">{c.content}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="Add a comment..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                  e.preventDefault();
                  addComment.mutate({ taskId: task.id, content: commentText.trim() });
                }
              }}
              className="text-sm h-8"
            />
            <Button
              size="sm"
              disabled={!commentText.trim() || addComment.isPending}
              onClick={() => commentText.trim() && addComment.mutate({ taskId: task.id, content: commentText.trim() })}
            >
              Post
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Weekly Update Form ───────────────────────────────────────────────────────

function WeeklyUpdateForm({ projectId, onSubmitted }: { projectId: number; onSubmitted: () => void }) {
  const [form, setForm] = useState({
    updateStatus: "on_track" as UpdateStatus,
    progressPct: 0,
    keyUpdates: "",
    blockers: "",
    nextSteps: "",
  });

  const submit = trpc.pm.weeklyUpdates.submit.useMutation({
    onSuccess: () => { toast.success("Weekly update submitted"); onSubmitted(); setForm({ updateStatus: "on_track", progressPct: 0, keyUpdates: "", blockers: "", nextSteps: "" }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-sm">Submit Weekly Update</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={form.updateStatus} onValueChange={v => setForm(f => ({ ...f, updateStatus: v as UpdateStatus }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="on_track">On Track</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="off_track">Off Track</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Progress: {form.progressPct}%</Label>
          <div className="pt-2">
            <Slider
              value={[form.progressPct]}
              onValueChange={([v]) => setForm(f => ({ ...f, progressPct: v }))}
              min={0} max={100} step={5}
            />
          </div>
        </div>
      </div>
      <div>
        <Label className="text-xs">Key Updates *</Label>
        <Textarea value={form.keyUpdates} onChange={e => setForm(f => ({ ...f, keyUpdates: e.target.value }))} placeholder="What was accomplished this week?" rows={3} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Blockers</Label>
          <Textarea value={form.blockers} onChange={e => setForm(f => ({ ...f, blockers: e.target.value }))} placeholder="Any blockers or issues?" rows={2} />
        </div>
        <div>
          <Label className="text-xs">Next Steps</Label>
          <Textarea value={form.nextSteps} onChange={e => setForm(f => ({ ...f, nextSteps: e.target.value }))} placeholder="What's planned for next week?" rows={2} />
        </div>
      </div>
      <Button
        onClick={() => submit.mutate({ projectId, ...form })}
        disabled={!form.keyUpdates.trim() || submit.isPending}
        size="sm"
      >
        {submit.isPending ? "Submitting..." : "Submit Update"}
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const projectId = Number(id);

  const { user } = useAuth();
  const { data: project, refetch } = trpc.pm.projects.getById.useQuery({ id: projectId });
  const { data: adminUsers = [] } = trpc.users.list.useQuery({ role: "admin" });

  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", ownerId: "", dueDate: "", priority: "medium" as Priority, notes: "" });
  const [editingProject, setEditingProject] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Notes state
  const [noteContent, setNoteContent] = useState("");
  const [mentionSearch, setMentionSearch] = useState("");
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [selectedMentions, setSelectedMentions] = useState<{ id: number; name: string }[]>([]);

  const createTask = trpc.pm.tasks.create.useMutation({
    onSuccess: () => { toast.success("Task added"); refetch(); setShowAddTask(false); setTaskForm({ title: "", ownerId: "", dueDate: "", priority: "medium", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const toggleTask = trpc.pm.tasks.toggleComplete.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = trpc.pm.tasks.delete.useMutation({
    onSuccess: () => { toast.success("Task deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.pm.tasks.update.useMutation({
    onSuccess: () => { toast.success("Task updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateProject = trpc.pm.projects.update.useMutation({
    onSuccess: () => { toast.success("Project updated"); refetch(); setEditingProject(false); },
    onError: (e) => toast.error(e.message),
  });

  const archiveProject = trpc.pm.projects.archive.useMutation({
    onSuccess: () => { toast.success("Project archived"); navigate("/projects"); },
    onError: (e) => toast.error(e.message),
  });

  const aiSummaryMutation = trpc.pm.dashboard.projectAiSummary.useMutation({
    onSuccess: (data) => { setAiSummary((data.summary as string) ?? null); setAiLoading(false); },
    onError: (e) => { toast.error(e.message); setAiLoading(false); },
  });

  // Collaborators
  const { data: collaborators = [], refetch: refetchCollaborators } = trpc.pm.collaborators.listForProject.useQuery({ projectId });
  const addCollaborator = trpc.pm.collaborators.add.useMutation({
    onSuccess: () => { toast.success("Collaborator added"); refetchCollaborators(); setShowAddCollab(false); setCollabUserId(""); },
    onError: (e) => toast.error(e.message),
  });
  const removeCollaborator = trpc.pm.collaborators.remove.useMutation({
    onSuccess: () => { toast.success("Collaborator removed"); refetchCollaborators(); },
    onError: (e) => toast.error(e.message),
  });
  const [showAddCollab, setShowAddCollab] = useState(false);
  const [collabUserId, setCollabUserId] = useState("");

  // Notes queries and mutations
  const { data: notes = [], refetch: refetchNotes } = trpc.pm.notes.list.useQuery({ projectId });
  const createNote = trpc.pm.notes.create.useMutation({
    onSuccess: () => { toast.success("Note added"); refetchNotes(); setNoteContent(""); setSelectedMentions([]); },
    onError: (e) => toast.error(e.message),
  });
  const deleteNote = trpc.pm.notes.delete.useMutation({
    onSuccess: () => { toast.success("Note deleted"); refetchNotes(); },
    onError: (e) => toast.error(e.message),
  });
  const markNoteRead = trpc.pm.notes.markRead.useMutation({
    onSuccess: () => refetchNotes(),
  });
  const markNoteUnread = trpc.pm.notes.markUnread.useMutation({
    onSuccess: () => { toast.success("Marked as unread"); refetchNotes(); },
  });

  const unreadNoteCount = (notes as any[]).filter((n: any) => n.isUnread).length;

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteContent.trim()) return;
    createNote.mutate({
      projectId,
      content: noteContent.trim(),
      mentionedUserIds: selectedMentions.map(m => m.id),
    });
  }

  function insertMention(u: { id: number; name: string }) {
    setSelectedMentions(prev => prev.some(m => m.id === u.id) ? prev : [...prev, u]);
    setNoteContent(prev => prev + `@${u.name} `);
    setShowMentionPicker(false);
    setMentionSearch("");
  }

  function startEditProject() {
    if (!project) return;
    setEditForm({
      title: project.title,
      description: project.description,
      department: project.department,
      ownerId: String(project.ownerId ?? ""),
      dueDate: project.dueDate ? format(new Date(project.dueDate), "yyyy-MM-dd") : "",
      priority: project.priority,
      status: project.status,
    });
    setEditingProject(true);
  }

  function handleSaveProject() {
    if (!editForm) return;
    updateProject.mutate({
      id: projectId,
      title: editForm.title,
      description: editForm.description,
      department: editForm.department,
      ownerId: Number(editForm.ownerId),
      dueDate: editForm.dueDate ? new Date(editForm.dueDate) : undefined,
      priority: editForm.priority,
      status: editForm.status,
    });
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskForm.title || !taskForm.ownerId || !taskForm.dueDate) {
      toast.error("Title, owner, and due date are required");
      return;
    }
    createTask.mutate({
      projectId,
      title: taskForm.title,
      ownerId: Number(taskForm.ownerId),
      dueDate: new Date(taskForm.dueDate),
      priority: taskForm.priority,
      notes: taskForm.notes || undefined,
    });
  }

  function handleAiSummary() {
    setAiLoading(true);
    setAiSummary(null);
    aiSummaryMutation.mutate({ projectId });
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading project...
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[project.status as Status];
  const priorityCfg = PRIORITY_CONFIG[project.priority as Priority];
  const tasks = project.tasks ?? [];
  const completedTasks = tasks.filter((t: any) => t.completed).length;
  const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : (project.weeklyUpdates?.[0]?.progressPct ?? 0);

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate("/projects")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </button>

      {/* Project Header */}
      <div className="bg-card border border-border rounded-lg p-5 mb-5">
        {editingProject && editForm ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Title</Label>
                <Input value={editForm.title} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} rows={3} />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={editForm.department} onChange={e => setEditForm((f: any) => ({ ...f, department: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="at_risk">At Risk</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={editForm.priority} onValueChange={v => setEditForm((f: any) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Owner</Label>
                <Select value={editForm.ownerId} onValueChange={v => setEditForm((f: any) => ({ ...f, ownerId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(adminUsers as any[]).map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={editForm.dueDate} onChange={e => setEditForm((f: any) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveProject} disabled={updateProject.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save Changes
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingProject(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${priorityCfg.dot}`} />
                  <h1 className="text-xl font-bold text-foreground">{project.title}</h1>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.color}`}>
                    {statusCfg.icon} {statusCfg.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{project.description}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={handleAiSummary} disabled={aiLoading}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  {aiLoading ? "Generating..." : "AI Summary"}
                </Button>
                <Button size="sm" variant="outline" onClick={startEditProject}>
                  <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive" onClick={() => archiveProject.mutate({ id: projectId })}>
                      Archive Project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {project.department}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> {project.ownerName ?? "Unassigned"}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due {project.dueDate ? format(new Date(project.dueDate), "MMM d, yyyy") : "—"}
              </span>
            </div>

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{completedTasks}/{tasks.length} tasks completed</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${project.status === "completed" ? "bg-green-500" : project.status === "at_risk" ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* AI Summary */}
            {aiSummary && (
              <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> AI Project Summary
                </div>
                <div className="text-sm prose prose-sm max-w-none">
                  <Streamdown>{aiSummary}</Streamdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collaborators Panel */}
      <div className="bg-card border border-border rounded-lg p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="h-4 w-4 text-muted-foreground" /> Collaborators
          </h3>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddCollab(s => !s)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>

        {showAddCollab && (
          <div className="flex gap-2 mb-3">
            <Select value={collabUserId} onValueChange={setCollabUserId}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue placeholder="Select person..." />
              </SelectTrigger>
              <SelectContent>
                {(adminUsers as any[])
                  .filter((u: any) => !(collaborators as any[]).some((c: any) => c.userId === u.id) && u.id !== project.ownerId)
                  .map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              disabled={!collabUserId || addCollaborator.isPending}
              onClick={() => addCollaborator.mutate({ projectId, userId: Number(collabUserId) })}
            >
              Add
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowAddCollab(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {(collaborators as any[]).length === 0 ? (
          <p className="text-xs text-muted-foreground">No collaborators yet. Add teammates to loop them in.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(collaborators as any[]).map((c: any) => (
              <div key={c.userId} className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-full px-2.5 py-1 text-xs">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-medium text-primary shrink-0">
                  {c.userName?.[0] ?? "?"}
                </div>
                <span className="font-medium">{c.userName}</span>
                <button
                  onClick={() => removeCollaborator.mutate({ projectId, userId: c.userId })}
                  className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove collaborator"
                >
                  <UserMinus className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tasks">
        <TabsList className="mb-4">
          <TabsTrigger value="tasks">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Tasks ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            <StickyNote className="h-3.5 w-3.5 mr-1.5" />
            Notes
            {unreadNoteCount > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none">
                {unreadNoteCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="updates">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Weekly Updates ({(project.weeklyUpdates ?? []).length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Tasks</h2>
            <Button size="sm" variant="outline" onClick={() => setShowAddTask(s => !s)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
            </Button>
          </div>

          {/* Add task form */}
          {showAddTask && (
            <form onSubmit={handleAddTask} className="bg-card border border-primary/30 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Task Title *</Label>
                  <Input
                    value={taskForm.title}
                    onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="What needs to be done?"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-xs">Owner *</Label>
                  <Select value={taskForm.ownerId} onValueChange={v => setTaskForm(f => ({ ...f, ownerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Assign to..." /></SelectTrigger>
                    <SelectContent>
                      {(adminUsers as any[]).map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Due Date *</Label>
                  <Input type="date" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v as Priority }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={taskForm.notes} onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={createTask.isPending}>
                  {createTask.isPending ? "Adding..." : "Add Task"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddTask(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {/* Task list */}
          {tasks.length === 0 && !showAddTask ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tasks yet. Add the first task to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Open tasks */}
              {tasks.filter((t: any) => !t.completed).map((task: any) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  adminUsers={adminUsers as any[]}
                  onToggle={(id, completed) => toggleTask.mutate({ id, completed })}
                  onDelete={(id) => deleteTask.mutate({ id })}
                  onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                />
              ))}
              {/* Completed tasks */}
              {tasks.filter((t: any) => t.completed).length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground mb-2 select-none">
                    {tasks.filter((t: any) => t.completed).length} completed task(s)
                  </summary>
                  <div className="space-y-2 mt-2">
                    {tasks.filter((t: any) => t.completed).map((task: any) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        adminUsers={adminUsers as any[]}
                        onToggle={(id, completed) => toggleTask.mutate({ id, completed })}
                        onDelete={(id) => deleteTask.mutate({ id })}
                        onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="space-y-4">
          {/* Add note form */}
          <form onSubmit={handleAddNote} className="bg-card border border-border rounded-lg p-4 space-y-3">
            <div>
              <Label className="text-xs mb-1.5 block">Add a Note</Label>
              <Textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Write a note... Use the @ button to mention someone."
                rows={3}
                className="resize-none"
              />
            </div>
            {selectedMentions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedMentions.map(m => (
                  <span key={m.id} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                    @{m.name}
                    <button type="button" onClick={() => setSelectedMentions(prev => prev.filter(x => x.id !== m.id))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowMentionPicker(v => !v)}
                >
                  <AtSign className="h-3.5 w-3.5 mr-1" /> Mention
                </Button>
                {showMentionPicker && (
                  <div className="absolute bottom-full mb-1 left-0 bg-popover border border-border rounded-lg shadow-lg p-2 w-56 z-50">
                    <Input
                      placeholder="Search users..."
                      value={mentionSearch}
                      onChange={e => setMentionSearch(e.target.value)}
                      className="h-7 text-xs mb-2"
                      autoFocus
                    />
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {(adminUsers as any[])
                        .filter((u: any) => !mentionSearch || (u.name ?? "").toLowerCase().includes(mentionSearch.toLowerCase()))
                        .map((u: any) => (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent flex items-center gap-2"
                            onClick={() => insertMention({ id: u.id, name: u.name ?? u.email })}
                          >
                            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                              {(u.name ?? "?")[0]}
                            </span>
                            {u.name ?? u.email}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
              <Button type="submit" size="sm" className="h-8" disabled={!noteContent.trim() || createNote.isPending}>
                {createNote.isPending ? "Posting..." : "Post Note"}
              </Button>
            </div>
          </form>

          {/* Notes list */}
          {(notes as any[]).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notes yet. Add the first note above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(notes as any[]).map((note: any) => (
                <div
                  key={note.id}
                  className={cn(
                    "bg-card border rounded-lg p-4 transition-all",
                    note.isUnread ? "border-primary/40 bg-primary/5" : "border-border"
                  )}
                  onMouseEnter={() => {
                    if (note.isUnread && note.authorId !== (user as any)?.id) {
                      markNoteRead.mutate({ noteId: note.id });
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-semibold shrink-0">
                        {(note.authorName ?? "?")[0]}
                      </span>
                      <div>
                        <span className="text-sm font-medium">{note.authorName ?? "Unknown"}</span>
                        <span className="text-xs text-muted-foreground ml-2">{format(new Date(note.createdAt), "MMM d, h:mm a")}</span>
                      </div>
                      {note.isUnread && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" title="Unread" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        title={note.isUnread ? "Mark as read" : "Mark as unread (come back to this)"}
                        onClick={() => {
                          if (note.isUnread) {
                            markNoteRead.mutate({ noteId: note.id });
                          } else {
                            markNoteUnread.mutate({ noteId: note.id });
                          }
                        }}
                      >
                        {note.isUnread ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                      {(note.authorId === (user as any)?.id || (user as any)?.role === "admin") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => deleteNote.mutate({ id: note.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                  {note.mentions && note.mentions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {note.mentions.map((m: any) => (
                        <span key={m.userId} className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          @{m.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Weekly Updates Tab */}
        <TabsContent value="updates" className="space-y-4">
          <WeeklyUpdateForm projectId={projectId} onSubmitted={refetch} />

          {/* Past updates */}
          {(project.weeklyUpdates ?? []).length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Update History</h3>
              {(project.weeklyUpdates ?? []).map((u: any) => {
                const cfg = UPDATE_STATUS_CONFIG[u.updateStatus as UpdateStatus];
                return (
                  <div key={u.id} className={`border rounded-lg p-4 ${cfg.bg}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{u.progressPct}% complete</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.authorName} · {format(new Date(u.createdAt), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="h-1.5 bg-white/50 rounded-full mb-3 overflow-hidden">
                      <div className="h-full bg-current opacity-40 rounded-full" style={{ width: `${u.progressPct}%` }} />
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium text-xs uppercase tracking-wide opacity-70">Key Updates</span>
                        <p className="mt-0.5">{u.keyUpdates}</p>
                      </div>
                      {u.blockers && (
                        <div>
                          <span className="font-medium text-xs uppercase tracking-wide opacity-70">Blockers</span>
                          <p className="mt-0.5">{u.blockers}</p>
                        </div>
                      )}
                      {u.nextSteps && (
                        <div>
                          <span className="font-medium text-xs uppercase tracking-wide opacity-70">Next Steps</span>
                          <p className="mt-0.5">{u.nextSteps}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          {(project.activity ?? []).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(project.activity ?? []).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0 mt-0.5">
                    {a.actorName?.[0] ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">
                      <span className="font-medium">{a.actorName ?? "Unknown"}</span>
                      {" "}
                      <span className="text-muted-foreground">{ACTION_LABELS[a.action] ?? a.action}</span>
                      {a.detail && <span className="text-muted-foreground"> — {a.detail}</span>}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(a.createdAt), "MMM d, h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
