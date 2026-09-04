import { Children, useEffect, useState, useMemo } from "react";
import { useParams } from "wouter";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format, isPast, isToday } from "date-fns";
import {
  ArrowLeft, Plus, CheckCircle2, Circle, AlertTriangle, TrendingUp,
  Clock, Calendar, User, Edit2, Trash2, MessageSquare, Sparkles,
  ChevronDown, ChevronUp, Save, X, MoreHorizontal, Activity,
  BarChart3, FileText, Users, StickyNote, Eye, EyeOff, UserPlus, UserMinus, ListChecks,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { useAppBack } from "@/lib/navigationHistory";

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
  onAddSubtask,
  mentionableUsers,
  highlightedCommentId,
  children,
}: {
  task: any;
  adminUsers: any[];
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, data: any) => void;
  onAddSubtask?: (task: any) => void;
  mentionableUsers: any[];
  highlightedCommentId?: number | null;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtasksExpanded, setSubtasksExpanded] = useState(true);
  const subTodoCount = Children.count(children);
  const hasSubtodos = subTodoCount > 0;
  const [editing, setEditing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentMentionQuery, setCommentMentionQuery] = useState<string | null>(null);
  const [selectedCommentMentions, setSelectedCommentMentions] = useState<{ id: number; name: string }[]>([]);
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
    onSuccess: () => { setCommentText(""); setCommentMentionQuery(null); setSelectedCommentMentions([]); refetchComments(); },
    onError: (e) => toast.error(e.message),
  });

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && !task.completed && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && !task.completed && isToday(dueDate);
  const commentMentionCandidates = useMemo(() => mentionableUsers
    .filter((person: any) => !selectedCommentMentions.some((mention) => mention.id === person.userId))
    .filter((person: any) => !commentMentionQuery || (person.name ?? person.email ?? "").toLowerCase().includes(commentMentionQuery.toLowerCase())), [mentionableUsers, selectedCommentMentions, commentMentionQuery]);

  useEffect(() => {
    if (highlightedCommentId) setExpanded(true);
  }, [highlightedCommentId]);

  useEffect(() => {
    if (!highlightedCommentId || !(comments as any[]).some((comment: any) => comment.id === highlightedCommentId)) return;
    const timeout = window.setTimeout(() => document.getElementById(`todo-${task.id}-comment-${highlightedCommentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    return () => window.clearTimeout(timeout);
  }, [comments, highlightedCommentId, task.id]);

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

  function insertCommentMention(person: { id: number; name: string }) {
    setSelectedCommentMentions((current) => current.some((mention) => mention.id === person.id) ? current : [...current, person]);
    setCommentText((current) => current.replace(/(^|\s)@[^\s@]*$/, `$1@${person.name} `));
    setCommentMentionQuery(null);
  }

  function submitComment() {
    if (!commentText.trim()) return;
    addComment.mutate({ taskId: task.id, content: commentText.trim(), mentionedUserIds: selectedCommentMentions.map((mention) => mention.id) });
  }

  return (
    <div id={`todo-${task.id}`} className={cn("border border-border rounded-lg overflow-hidden transition-all", task.completed && !highlightedCommentId && "opacity-60")}>
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
          {hasSubtodos && (
            <Button
              variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs"
              onClick={() => {
                if (!expanded) {
                  setExpanded(true);
                  setSubtasksExpanded(true);
                  return;
                }
                setSubtasksExpanded((value) => !value);
              }}
              aria-label={expanded && subtasksExpanded ? "Hide sub-To-Dos" : "Show sub-To-Dos"}
              title={expanded && subtasksExpanded ? "Hide sub-To-Dos" : "Show sub-To-Dos"}
            >
              <ListChecks className="h-3.5 w-3.5 text-primary" />{subTodoCount}
              {expanded && subtasksExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
          {onAddSubtask && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onAddSubtask(task)} title="Add sub-To-Do">
              <Plus className="h-3.5 w-3.5" />Add sub-To-Do
            </Button>
          )}
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setExpanded(e => !e)}
            aria-label={expanded ? "Collapse todo details" : "Expand todo details"}
            title={expanded ? "Collapse todo details" : "Expand todo details"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setExpanded(true)}
            aria-label="Open todo comments"
            title="Open todo comments"
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
              <DropdownMenuItem onClick={() => setExpanded(true)}>
                <MessageSquare className="h-3.5 w-3.5 mr-2" /> Open details & comments
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
              <SearchableSelect
                className="w-full h-8 text-xs"
                options={(adminUsers as any[]).map((u: any) => ({ value: String(u.id), label: u.name ?? `User #${u.id}` }))}
                value={editForm.ownerId}
                onValueChange={v => setEditForm(f => ({ ...f, ownerId: v }))}
                placeholder="Select owner"
                searchPlaceholder="Search users…"
              />
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

      {expanded && hasSubtodos && subtasksExpanded && (
        <div className="border-t border-border bg-muted/10 px-3 py-2 sm:pl-8">
          <div className="space-y-2 border-l-2 border-primary/15 pl-3">{children}</div>
        </div>
      )}

      {/* Comments */}
      {expanded && (
        <div className="border-t border-border bg-muted/10 px-4 py-3 space-y-3">
          <section className="rounded-md border border-border bg-background/70 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h3>
            {task.notes ? <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{task.notes}</p> : <p className="mt-1.5 text-sm text-muted-foreground">No details added.</p>}
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</h3>
            {(comments as any[]).map((c: any) => (
              <div id={`todo-${task.id}-comment-${c.id}`} key={c.id} className={cn("mt-3 flex gap-2 rounded-md p-2 transition-colors", highlightedCommentId === c.id && "bg-amber-100 ring-2 ring-amber-400/70 shadow-sm")}>
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shrink-0">
                  {c.authorName?.[0] ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{c.authorName ?? "Unknown"}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(c.createdAt), "MMM d, h:mm a")}</span>
                  </div>
                  <p className="text-sm text-foreground">{c.content}</p>
                  {c.mentions?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.mentions.map((mention: any) => <span key={mention.userId} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">@{mention.name ?? "Teammate"}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="relative mt-3">
              <Textarea
                placeholder="Add a comment… Type @ to mention a collaborator."
                value={commentText}
                onChange={e => {
                  const value = e.target.value;
                  setCommentText(value);
                  const match = value.match(/(?:^|\s)@([^\s@]*)$/);
                  setCommentMentionQuery(match ? match[1] : null);
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                    e.preventDefault();
                    submitComment();
                  }
                }}
                className="min-h-20 resize-none text-sm"
              />
              {commentMentionQuery !== null && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  {commentMentionCandidates.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">No matching collaborators. Add them to the project first.</p> : <div className="max-h-44 overflow-y-auto py-1">{commentMentionCandidates.map((person: any) => <button key={person.userId} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => insertCommentMention({ id: person.userId, name: person.name ?? person.email })}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">{(person.name ?? person.email ?? "?")[0]}</span><span>{person.name ?? person.email}</span></button>)}</div>}
                </div>
              )}
            </div>
            {selectedCommentMentions.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{selectedCommentMentions.map((mention) => <span key={mention.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">@{mention.name}<button type="button" onClick={() => setSelectedCommentMentions((current) => current.filter((item) => item.id !== mention.id))}><X className="h-3 w-3" /></button></span>)}</div>}
            <div className="mt-2 flex justify-end">
              <Button size="sm" disabled={!commentText.trim() || addComment.isPending} onClick={submitComment}>Post</Button>
            </div>
          </section>
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
  const [location, navigate] = useLocation();
  const goBack = useAppBack("/projects");
  const projectId = Number(id);

  const { user } = useAuth();
  const { data: project, refetch } = trpc.pm.projects.getById.useQuery({ id: projectId });
  const { data: adminUsers = [] } = trpc.users.list.useQuery({ role: "admin" });

  const [showAddTask, setShowAddTask] = useState(false);
  const [parentTodo, setParentTodo] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({ title: "", ownerId: "", dueDate: "", priority: "medium" as Priority, notes: "" });
  const [editingProject, setEditingProject] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const initialTab = new URLSearchParams(window.location.search).get("tab");
  const [activeTab, setActiveTab] = useState(["tasks", "notes", "updates", "activity"].includes(initialTab ?? "") ? initialTab! : "tasks");
  const [showCompletedTodos, setShowCompletedTodos] = useState(false);
  const highlightedNoteId = Number(window.location.hash.match(/^#note-(\d+)$/)?.[1] ?? 0) || null;
  const highlightedComment = window.location.hash.match(/^#todo-(\d+)-comment-(\d+)$/);
  const highlightedTodoId = Number(highlightedComment?.[1] ?? window.location.hash.match(/^#todo-(\d+)$/)?.[1] ?? 0) || null;
  const highlightedCommentId = Number(highlightedComment?.[2] ?? 0) || null;

  // Notes state
  const [noteContent, setNoteContent] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [notifyMentions, setNotifyMentions] = useState(true);
  const [selectedMentions, setSelectedMentions] = useState<{ id: number; name: string }[]>([]);

  const createTask = trpc.pm.tasks.create.useMutation({
    onSuccess: () => { toast.success(parentTodo ? "Sub-todo added" : "Todo added"); refetch(); setShowAddTask(false); setParentTodo(null); setTaskForm({ title: "", ownerId: "", dueDate: "", priority: "medium", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const toggleTask = trpc.pm.tasks.toggleComplete.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const deleteTask = trpc.pm.tasks.delete.useMutation({
    onSuccess: () => { toast.success("Todo deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.pm.tasks.update.useMutation({
    onSuccess: () => { toast.success("Todo updated"); refetch(); },
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
    onSuccess: () => { toast.success("Collaborator removed"); refetch(); refetchCollaborators(); setOwnerRemoval(null); setNewOwnerId(""); },
    onError: (e) => toast.error(e.message),
  });
  const [showAddCollab, setShowAddCollab] = useState(false);
  const [collabUserId, setCollabUserId] = useState("");
  const [ownerRemoval, setOwnerRemoval] = useState<any>(null);
  const [newOwnerId, setNewOwnerId] = useState("");
  const mentionCandidates = useMemo(() => (collaborators as any[])
    .filter((collaborator: any) => !selectedMentions.some((mention) => mention.id === collaborator.userId))
    .filter((collaborator: any) => !mentionQuery || (collaborator.name ?? collaborator.email ?? "").toLowerCase().includes(mentionQuery.toLowerCase())), [collaborators, selectedMentions, mentionQuery]);

  // Notes queries and mutations
  const { data: notes = [], refetch: refetchNotes } = trpc.pm.notes.list.useQuery({ projectId });
  const createNote = trpc.pm.notes.create.useMutation({
    onSuccess: () => { toast.success("Note added"); refetchNotes(); setNoteContent(""); setMentionQuery(null); setSelectedMentions([]); setNotifyMentions(true); },
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
      shouldNotifyMentions: notifyMentions,
    });
  }

  function insertMention(u: { id: number; name: string }) {
    setSelectedMentions(prev => prev.some(m => m.id === u.id) ? prev : [...prev, u]);
    setNoteContent(prev => prev.replace(/(^|\s)@[^\s@]*$/, `$1@${u.name} `));
    setMentionQuery(null);
  }

  function startEditProject() {
    if (!project) return;
    setEditForm({
      title: project.title,
      description: project.description,
      department: project.department,
      ownerId: String(project.ownerId ?? ""),
      dueDate: project.dueDate ? format(new Date(project.dueDate), "yyyy-MM-dd") : "",
      isOngoing: project.isOngoing || !project.dueDate,
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
      dueDate: editForm.isOngoing ? null : (editForm.dueDate ? new Date(editForm.dueDate) : null),
      isOngoing: editForm.isOngoing,
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
      parentTaskId: parentTodo?.id ?? null,
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

  useEffect(() => {
    if (!highlightedTodoId || !project) return;
    if (project.tasks?.some((task: any) => task.id === highlightedTodoId && task.completed)) setShowCompletedTodos(true);
    const timeout = window.setTimeout(() => document.getElementById(`todo-${highlightedTodoId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => window.clearTimeout(timeout);
  }, [projectId, project?.tasks?.length, highlightedTodoId]);

  useEffect(() => {
    if (!highlightedNoteId || !project || activeTab !== "notes") return;
    const timeout = window.setTimeout(() => document.getElementById(`note-${highlightedNoteId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => window.clearTimeout(timeout);
  }, [activeTab, highlightedNoteId, projectId, notes.length]);

  function changeTab(tab: string) {
    setActiveTab(tab);
    const next = new URL(window.location.href);
    next.searchParams.set("tab", tab);
    if (tab !== "notes") next.hash = "";
    window.history.replaceState({}, "", `${next.pathname}${next.search}${next.hash}`);
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
  const topLevelTodos = tasks.filter((task: any) => !task.parentTaskId);
  const subTodosByParent = new Map<number, any[]>();
  tasks.filter((task: any) => task.parentTaskId).forEach((task: any) => {
    const siblings = subTodosByParent.get(task.parentTaskId) ?? [];
    siblings.push(task);
    subTodosByParent.set(task.parentTaskId, siblings);
  });
  const completedTasks = tasks.filter((t: any) => t.completed).length;
  const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : (project.weeklyUpdates?.[0]?.progressPct ?? 0);

  return (
    <div>
      {/* Back button */}
      <button
        onClick={goBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
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
                <SearchableSelect
                  className="w-full"
                  options={(adminUsers as any[]).map((u: any) => ({ value: String(u.id), label: u.name ?? `User #${u.id}` }))}
                  value={editForm.ownerId}
                  onValueChange={v => setEditForm((f: any) => ({ ...f, ownerId: v }))}
                  placeholder="Select owner"
                  searchPlaceholder="Search users…"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 h-5">
                  <Checkbox
                    id="edit-ongoing-project"
                    checked={editForm.isOngoing}
                    onCheckedChange={checked => setEditForm((f: any) => ({ ...f, isOngoing: checked === true, dueDate: checked ? "" : f.dueDate }))}
                  />
                  <Label htmlFor="edit-ongoing-project" className="cursor-pointer">Ongoing</Label>
                </div>
                {!editForm.isOngoing && (
                  <div>
                    <Label>Due Date *</Label>
                    <Input type="date" value={editForm.dueDate} onChange={e => setEditForm((f: any) => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                )}
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
                {project.isOngoing || !project.dueDate ? "Ongoing" : `Due ${format(new Date(project.dueDate), "MMM d, yyyy")}`}
              </span>
            </div>

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>{completedTasks}/{tasks.length} todos completed</span>
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
            <SearchableSelect
              className="h-8 text-sm flex-1"
              options={(adminUsers as any[])
                .filter((u: any) => !(collaborators as any[]).some((c: any) => c.userId === u.id) && u.id !== project.ownerId)
                .map((u: any) => ({ value: String(u.id), label: u.name ?? `User #${u.id}` }))}
              value={collabUserId}
              onValueChange={setCollabUserId}
              placeholder="Select person…"
              searchPlaceholder="Search users…"
              clearable
              clearValue=""
            />
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
                  {(c.name ?? c.userName)?.[0] ?? "?"}
                </div>
                <span className="font-medium">{c.name ?? c.userName}</span>
                <button
                  onClick={() => {
                    if (c.userId === project.ownerId) {
                      setOwnerRemoval(c);
                      setNewOwnerId("");
                      return;
                    }
                    removeCollaborator.mutate({ projectId, userId: c.userId });
                  }}
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

      <Dialog open={!!ownerRemoval} onOpenChange={open => { if (!open) { setOwnerRemoval(null); setNewOwnerId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose a New Project Owner</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {(ownerRemoval?.name ?? ownerRemoval?.userName ?? "This collaborator")} is the current owner. Choose a new owner before removing them from collaborators.
          </p>
          <SearchableSelect
            className="w-full"
            options={(adminUsers as any[])
              .filter((u: any) => u.id !== project.ownerId)
              .map((u: any) => ({ value: String(u.id), label: u.name ?? `User #${u.id}` }))}
            value={newOwnerId}
            onValueChange={setNewOwnerId}
            placeholder="Select new owner"
            searchPlaceholder="Search users…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOwnerRemoval(null); setNewOwnerId(""); }}>Cancel</Button>
            <Button
              disabled={!newOwnerId || removeCollaborator.isPending}
              onClick={() => ownerRemoval && removeCollaborator.mutate({ projectId, userId: ownerRemoval.userId, newOwnerId: Number(newOwnerId) })}
            >
              {removeCollaborator.isPending ? "Updating..." : "Transfer & Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={changeTab}>
        <TabsList className="mb-4 flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <TabsTrigger value="tasks" className="shrink-0 whitespace-nowrap">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Todos ({tasks.length})
          </TabsTrigger>
          <TabsTrigger value="notes" className="shrink-0 whitespace-nowrap">
            <StickyNote className="h-3.5 w-3.5 mr-1.5" />
            Notes
            {unreadNoteCount > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 leading-none">
                {unreadNoteCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="updates" className="shrink-0 whitespace-nowrap">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Weekly Updates ({(project.weeklyUpdates ?? []).length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="shrink-0 whitespace-nowrap">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Todos Tab */}
        <TabsContent value="tasks" className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Todos</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="show-completed-todos" checked={showCompletedTodos} onCheckedChange={setShowCompletedTodos} />
                <Label htmlFor="show-completed-todos" className="cursor-pointer text-xs text-muted-foreground">Show completed</Label>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setParentTodo(null); setShowAddTask(s => !s); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Todo
              </Button>
            </div>
          </div>

          {/* Add todo form */}
          {showAddTask && (
            <form onSubmit={handleAddTask} className="bg-card border border-primary/30 rounded-lg p-4 space-y-3">
              {parentTodo && <div className="rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">Adding a sub-todo under <strong>{parentTodo.title}</strong></div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Todo Title *</Label>
                  <Input
                    value={taskForm.title}
                    onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="What needs to be done?"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-xs">Owner *</Label>
                  <SearchableSelect
                    className="w-full"
                    options={(adminUsers as any[]).map((u: any) => ({ value: String(u.id), label: u.name ?? `User #${u.id}` }))}
                    value={taskForm.ownerId}
                    onValueChange={v => setTaskForm(f => ({ ...f, ownerId: v }))}
                    placeholder="Assign to…"
                    searchPlaceholder="Search users…"
                  />
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
                  {createTask.isPending ? "Adding..." : parentTodo ? "Add Sub-todo" : "Add Todo"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setShowAddTask(false); setParentTodo(null); }}>Cancel</Button>
              </div>
            </form>
          )}

          {/* Todo list */}
          {tasks.length === 0 && !showAddTask ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No todos yet. Add the first todo to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Open parent todos and their collapsible sub-todos */}
              {topLevelTodos.filter((task: any) => !task.completed).map((task: any) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  adminUsers={adminUsers as any[]}
                  onToggle={(id, completed) => toggleTask.mutate({ id, completed })}
                  onDelete={(id) => deleteTask.mutate({ id })}
                  onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                  mentionableUsers={collaborators as any[]}
                  highlightedCommentId={highlightedTodoId === task.id ? highlightedCommentId : null}
                  onAddSubtask={(parent) => { setParentTodo(parent); setTaskForm({ title: "", ownerId: String(parent.ownerId ?? ""), dueDate: parent.dueDate ? format(new Date(parent.dueDate), "yyyy-MM-dd") : "", priority: parent.priority as Priority, notes: "" }); setShowAddTask(true); }}
                >
                  {(subTodosByParent.get(task.id) ?? []).map((subTodo) => (
                    <TaskItem key={subTodo.id} task={subTodo} adminUsers={adminUsers as any[]} mentionableUsers={collaborators as any[]} highlightedCommentId={highlightedTodoId === subTodo.id ? highlightedCommentId : null} onToggle={(id, completed) => toggleTask.mutate({ id, completed })} onDelete={(id) => deleteTask.mutate({ id })} onUpdate={(id, data) => updateTask.mutate({ id, ...data })} />
                  ))}
                </TaskItem>
              ))}
              {/* Completed parent todos */}
              {showCompletedTodos && topLevelTodos.filter((task: any) => task.completed).length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Completed ({topLevelTodos.filter((task: any) => task.completed).length})</p>
                    {topLevelTodos.filter((task: any) => task.completed).map((task: any) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        adminUsers={adminUsers as any[]}
                        onToggle={(id, completed) => toggleTask.mutate({ id, completed })}
                        onDelete={(id) => deleteTask.mutate({ id })}
                        onUpdate={(id, data) => updateTask.mutate({ id, ...data })}
                        mentionableUsers={collaborators as any[]}
                        highlightedCommentId={highlightedTodoId === task.id ? highlightedCommentId : null}
                        onAddSubtask={(parent) => { setParentTodo(parent); setTaskForm({ title: "", ownerId: String(parent.ownerId ?? ""), dueDate: parent.dueDate ? format(new Date(parent.dueDate), "yyyy-MM-dd") : "", priority: parent.priority as Priority, notes: "" }); setShowAddTask(true); }}
                      >
                        {(subTodosByParent.get(task.id) ?? []).map((subTodo) => (
                          <TaskItem key={subTodo.id} task={subTodo} adminUsers={adminUsers as any[]} mentionableUsers={collaborators as any[]} highlightedCommentId={highlightedTodoId === subTodo.id ? highlightedCommentId : null} onToggle={(id, completed) => toggleTask.mutate({ id, completed })} onDelete={(id) => deleteTask.mutate({ id })} onUpdate={(id, data) => updateTask.mutate({ id, ...data })} />
                        ))}
                      </TaskItem>
                    ))}
                  </div>
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
              <div className="relative">
                <Textarea
                  value={noteContent}
                  onChange={event => {
                    const value = event.target.value;
                    setNoteContent(value);
                    const match = value.match(/(?:^|\s)@([^\s@]*)$/);
                    setMentionQuery(match ? match[1] : null);
                  }}
                  placeholder="Write a note… Type @ to mention a collaborator."
                  rows={3}
                  className="resize-none"
                />
                {mentionQuery !== null && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                    {mentionCandidates.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No matching collaborators. Add them to the project first.</p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto py-1">
                        {mentionCandidates.map((collaborator: any) => (
                          <button key={collaborator.userId} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => insertMention({ id: collaborator.userId, name: collaborator.name ?? collaborator.email })}>
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">{(collaborator.name ?? collaborator.email ?? "?")[0]}</span>
                            <span>{collaborator.name ?? collaborator.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
            <div className="flex flex-wrap items-center gap-3">
              {selectedMentions.length > 0 && <div className="flex items-center gap-2"><Checkbox id="notify-mentions" checked={notifyMentions} onCheckedChange={(checked) => setNotifyMentions(checked === true)} /><Label htmlFor="notify-mentions" className="cursor-pointer text-xs">Notify mentioned collaborators</Label></div>}
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
                  id={`note-${note.id}`}
                  key={note.id}
                  className={cn(
                    "bg-card border rounded-lg p-4 transition-all",
                    highlightedNoteId === note.id ? "border-amber-400 bg-amber-50 ring-2 ring-amber-400/70 shadow-sm" : note.isUnread ? "border-primary/40 bg-primary/5" : "border-border"
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
