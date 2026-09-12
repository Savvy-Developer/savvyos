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
import { format } from "date-fns";
import {
  ArrowLeft, Plus, Check, CheckCircle2, Circle, CornerDownRight, History, MessageCircle, Pencil, AlertTriangle, TrendingUp,
  Clock, Calendar, User, Edit2, Trash2, MessageSquare, Sparkles,
  ChevronDown, ChevronUp, Save, X, MoreHorizontal, Activity,
  BarChart3, FileText, Users, StickyNote, Eye, EyeOff, UserPlus, UserMinus, ListChecks, GripVertical, Flag,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { useAppBack } from "@/lib/navigationHistory";
import { ProjectTodoBoard, type ProjectTodoLayoutItem } from "@/components/ProjectTodoBoard";

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
  task_reordered: "reordered todos and sections",
  task_completed: "completed task",
  task_reopened: "reopened task",
  task_deleted: "deleted a task",
  section_created: "created a todo section",
  section_updated: "renamed a todo section",
  section_moved: "reordered a todo section",
  section_deleted: "deleted a todo section",
  comment_added: "commented on a task",
  weekly_update_submitted: "submitted a weekly update",
};

const NO_SECTION_VALUE = "no-section";

function ProjectQuickWorkControls({ task, adminUsers, onUpdate }: { task: any; adminUsers: any[]; onUpdate: (id: number, data: any) => void }) {
  const [dueDate, setDueDate] = useState(task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "");
  const people = useMemo(() => [...adminUsers].sort((left: any, right: any) => (left.name ?? left.email ?? "").localeCompare(right.name ?? right.email ?? "")), [adminUsers]);
  useEffect(() => {
    setDueDate(task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "");
  }, [task.dueDate]);
  return <div className="order-last flex basis-full flex-wrap items-center gap-1 border-t border-border/60 pt-1 pl-6 xl:order-none xl:basis-auto xl:border-t-0 xl:pt-0 xl:pl-0" onClick={(event) => event.stopPropagation()}>
    <Input aria-label="To-Do due date" type="date" value={dueDate} onChange={(event) => { const value = event.target.value; setDueDate(value); onUpdate(task.id, { dueDate: value ? new Date(`${value}T12:00:00`) : null }); }} className="h-7 w-[8.35rem] bg-background px-1.5 text-xs" />
    <Select value={task.priority ?? "medium"} onValueChange={(value) => onUpdate(task.id, { priority: value as Priority })}><SelectTrigger aria-label="To-Do priority" className={`h-7 w-[6.6rem] px-2 text-xs ${PRIORITY_CONFIG[task.priority as Priority]?.badge ?? PRIORITY_CONFIG.medium.badge}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select>
    <Select value={task.ownerId ? String(task.ownerId) : undefined} onValueChange={(value) => onUpdate(task.id, { ownerId: Number(value) })}><SelectTrigger aria-label="To-Do assignee" className="h-7 w-[8.5rem] bg-background px-2 text-xs"><SelectValue placeholder="Assignee" /></SelectTrigger><SelectContent>{people.map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name ?? person.email ?? `User #${person.id}`}</SelectItem>)}</SelectContent></Select>
  </div>;
}

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
  activity = [],
  onChanged,
  todoSections = [],
  dragHandle,
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
  activity?: any[];
  onChanged?: () => void;
  todoSections?: any[];
  dragHandle?: any;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subtasksExpanded, setSubtasksExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentMentionQuery, setCommentMentionQuery] = useState<string | null>(null);
  const [selectedCommentMentions, setSelectedCommentMentions] = useState<{ id: number; name: string }[]>([]);
  const subTodoCount = Children.count(children);
  const hasSubtodos = subTodoCount > 0;
  const [editForm, setEditForm] = useState({
    title: task.title,
    sectionId: task.sectionId ? String(task.sectionId) : NO_SECTION_VALUE,
    ownerId: String(task.ownerId ?? ""),
    dueDate: task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "",
    priority: task.priority as Priority,
    notes: task.notes ?? "",
  });
  const { data: comments = [], refetch: refetchComments } = trpc.pm.tasks.getComments.useQuery(
    { taskId: task.id },
    { enabled: expanded },
  );
  const addComment = trpc.pm.tasks.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      setCommentMentionQuery(null);
      setSelectedCommentMentions([]);
      setComposerOpen(false);
      void refetchComments();
      onChanged?.();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteComment = trpc.pm.tasks.deleteComment.useMutation({
    onSuccess: () => {
      void refetchComments();
      onChanged?.();
      toast.success("Comment deleted.");
    },
    onError: (error) => toast.error(error.message),
  });
  const commentCount = Number(task.commentCount ?? comments.length ?? 0);
  const commentMentionCandidates = useMemo(() => mentionableUsers
    .filter((person: any) => !selectedCommentMentions.some((mention) => mention.id === person.userId))
    .filter((person: any) => !commentMentionQuery || (person.name ?? person.email ?? "").toLowerCase().includes(commentMentionQuery.toLowerCase())), [mentionableUsers, selectedCommentMentions, commentMentionQuery]);
  const taskActivity = useMemo(() => {
    const recorded = (activity ?? []).filter((entry: any) => entry.taskId === task.id);
    const entries = recorded.some((entry: any) => entry.action === "task_created") ? recorded : [{ id: `created-${task.id}`, action: "task_created", detail: "Created this To-Do.", actorName: null, createdAt: task.createdAt }, ...recorded];
    return entries.filter((entry: any) => entry.createdAt).sort((left: any, right: any) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [activity, task.createdAt, task.id]);
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
      ...(!task.parentTaskId ? { sectionId: editForm.sectionId === NO_SECTION_VALUE ? null : Number(editForm.sectionId) } : {}),
      ownerId: Number(editForm.ownerId),
      dueDate: editForm.dueDate ? new Date(`${editForm.dueDate}T12:00:00`) : null,
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
  function openComments() {
    setExpanded(true);
    window.setTimeout(() => document.getElementById(`todo-${task.id}-comments`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }
  function toggleSubtodos() {
    if (!expanded) {
      setExpanded(true);
      setSubtasksExpanded(true);
      return;
    }
    setSubtasksExpanded((value) => !value);
  }
  function activityLabel(entry: any) {
    if (entry.action === "task_created") return entry.actorName ? `${entry.actorName} created this To-Do.` : "Created this To-Do.";
    if (entry.action === "task_completed") return `${entry.actorName ?? "A teammate"} completed this To-Do.`;
    if (entry.action === "task_reopened") return `${entry.actorName ?? "A teammate"} reopened this To-Do.`;
    if (entry.action === "comment_added") return `${entry.actorName ?? "A teammate"} left a comment.`;
    if (entry.action === "task_updated") return `${entry.actorName ?? "A teammate"} updated this To-Do.`;
    return entry.detail ?? `${entry.actorName ?? "A teammate"} updated this To-Do.`;
  }
  return <div id={`todo-${task.id}`} className={cn("overflow-hidden rounded-md border border-border bg-card", task.completed && !highlightedCommentId && "opacity-70")}>
    <div className="flex w-full flex-wrap items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/45">
      {dragHandle ? <button type="button" ref={dragHandle.setActivatorNodeRef} {...dragHandle.attributes} {...dragHandle.listeners} className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:cursor-grabbing" aria-label={`Drag ${task.title}`} title="Drag todo"><GripVertical className="h-4 w-4" /></button> : null}
      <button type="button" onClick={() => onToggle(task.id, !task.completed)} aria-label={task.completed ? "Completed. Reopen To-Do." : "Complete To-Do"} title={task.completed ? "Completed" : "Complete To-Do"} className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50", task.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700")}>
        {task.completed ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      </button>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="min-w-0 flex-1"><span className={cn("block truncate text-sm font-medium", task.completed && "text-muted-foreground line-through")}>{task.title}</span></span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {hasSubtodos ? <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-1.5 text-xs text-primary" onClick={toggleSubtodos} title={`${subtasksExpanded && expanded ? "Hide" : "Show"} ${subTodoCount} sub-To-Do${subTodoCount === 1 ? "" : "s"}`} aria-label={`${subtasksExpanded && expanded ? "Hide" : "Show"} ${subTodoCount} sub-To-Do${subTodoCount === 1 ? "" : "s"}`}><CornerDownRight className="h-4 w-4" strokeWidth={2.75} /><span>{subTodoCount}</span></Button> : null}
      <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-1.5 text-xs" onClick={openComments} title="Open comments" aria-label="Open comments"><MessageCircle className="h-3.5 w-3.5" />{commentCount > 0 ? <span>{commentCount}</span> : null}</Button><ProjectQuickWorkControls task={task} adminUsers={adminUsers} onUpdate={onUpdate} />
    </div>
    {expanded ? <div className="border-t border-primary/20 bg-primary/[0.025] p-2">
      {editing ? <div className="mt-2 rounded-md border bg-muted/20 p-2"><div className="grid gap-2 sm:grid-cols-4"><div className="sm:col-span-4"><Label className="text-xs">Title</Label><Input value={editForm.title} onChange={event => setEditForm((form) => ({ ...form, title: event.target.value }))} className="mt-1 h-8 text-sm" autoFocus /></div><div><Label className="text-xs">Assignee</Label><SearchableSelect className="mt-1 h-8 w-full text-xs" options={(adminUsers as any[]).map((person: any) => ({ value: String(person.id), label: person.name ?? `User #${person.id}` }))} value={editForm.ownerId} onValueChange={value => setEditForm((form) => ({ ...form, ownerId: value }))} placeholder="Select assignee" searchPlaceholder="Search users…" /></div><div><Label className="text-xs">Priority</Label><Select value={editForm.priority} onValueChange={value => setEditForm((form) => ({ ...form, priority: value as Priority }))}><SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select></div><div><Label className="text-xs">Due date</Label><Input type="date" value={editForm.dueDate} onChange={event => setEditForm((form) => ({ ...form, dueDate: event.target.value }))} className="mt-1 h-8 text-xs" /></div>{!task.parentTaskId && todoSections.length > 0 ? <div><Label className="text-xs">Section (optional)</Label><Select value={editForm.sectionId} onValueChange={value => setEditForm((form) => ({ ...form, sectionId: value }))}><SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NO_SECTION_VALUE}>No section</SelectItem>{todoSections.map((section: any) => <SelectItem key={section.id} value={String(section.id)}>{section.title}</SelectItem>)}</SelectContent></Select></div> : null}</div><div className="mt-2"><Label className="text-xs">Details</Label><Textarea value={editForm.notes} onChange={event => setEditForm((form) => ({ ...form, notes: event.target.value }))} rows={2} className="mt-1 text-sm" /></div><div className="mt-2 flex justify-end gap-1.5"><Button type="button" size="sm" className="h-8" onClick={handleSaveEdit}><Save className="mr-1.5 h-3.5 w-3.5" />Save</Button><Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>Cancel</Button></div></div> : null}
      <section className="mt-2 rounded-md border bg-background p-2 sm:p-2.5"><h4 className="text-sm font-semibold">Details</h4>{task.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{task.notes}</p> : <p className="mt-1 text-sm text-muted-foreground">No details added.</p>}</section>
      {hasSubtodos && subtasksExpanded ? <section className="mt-2 ml-2 border-l-4 border-primary/30 pl-3"><div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary"><CornerDownRight className="h-3.5 w-3.5" strokeWidth={2.75} />Sub-To-Dos</div><div className="space-y-1.5">{children}</div></section> : null}
      <section id={`todo-${task.id}-comments`} className="mt-2 rounded-md border bg-background p-2"><div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" />Comments</h4><span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{comments.length}</span></div>{(comments as any[]).length ? <div className="mt-1 divide-y">{(comments as any[]).map((comment: any) => <article id={`todo-${task.id}-comment-${comment.id}`} key={comment.id} className={cn("flex gap-2 py-1.5 first:pt-0 last:pb-0", highlightedCommentId === comment.id && "rounded bg-amber-100 ring-2 ring-amber-400/70 shadow-sm")}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{(comment.authorName ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-0.5"><span className="text-xs font-semibold">{comment.authorName ?? "Teammate"}</span><span className="text-[11px] text-muted-foreground">{format(new Date(comment.createdAt), "MMM d, h:mm a")}</span>{comment.canDelete ? <Button type="button" variant="ghost" size="icon" className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive" disabled={deleteComment.isPending} aria-label="Delete comment" title="Delete comment" onClick={() => { if (window.confirm("Delete this comment?")) deleteComment.mutate({ commentId: comment.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button> : null}</div><p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.content}</p>{comment.mentions?.length ? <div className="mt-1 flex flex-wrap gap-1">{comment.mentions.map((mention: any) => <span key={mention.userId} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">@{mention.name ?? "Teammate"}</span>)}</div> : null}</div></article>)}</div> : <p className="mt-1 text-sm text-muted-foreground">No comments yet. Add context or @mention a project collaborator.</p>}{composerOpen ? <div className="mt-1.5 rounded border bg-muted/20 p-1.5"><div className="relative"><Textarea placeholder="Add a comment… Type @ to mention a collaborator." value={commentText} onChange={event => { const value = event.target.value; setCommentText(value); const match = value.match(/(?:^|\s)@([^\s@]*)$/); setCommentMentionQuery(match ? match[1] : null); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && commentText.trim()) { event.preventDefault(); submitComment(); } }} className="min-h-16 resize-none text-sm" autoFocus />{commentMentionQuery !== null ? <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">{commentMentionCandidates.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">No matching collaborators. Add them to the project first.</p> : <div className="max-h-44 overflow-y-auto py-1">{commentMentionCandidates.map((person: any) => <button key={person.userId} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => insertCommentMention({ id: person.userId, name: person.name ?? person.email })}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">{(person.name ?? person.email ?? "?")[0]}</span><span>{person.name ?? person.email}</span></button>)}</div>}</div> : null}</div>{selectedCommentMentions.length ? <div className="mt-1 flex flex-wrap gap-1">{selectedCommentMentions.map((mention) => <span key={mention.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">@{mention.name}<button type="button" onClick={() => setSelectedCommentMentions((current) => current.filter((item) => item.id !== mention.id))} aria-label={`Remove ${mention.name} mention`}><X className="h-3 w-3" /></button></span>)}</div> : null}<div className="mt-1.5 flex items-center justify-end gap-1.5"><Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => { setComposerOpen(false); setCommentText(""); setCommentMentionQuery(null); setSelectedCommentMentions([]); }}>Cancel</Button><Button type="button" size="sm" className="h-7" disabled={!commentText.trim() || addComment.isPending} onClick={submitComment}>{addComment.isPending ? "Posting…" : <><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Post</>}</Button></div></div> : <Button type="button" variant="ghost" size="sm" className="mt-1.5 h-7 px-1.5 text-xs" onClick={() => setComposerOpen(true)}><MessageCircle className="mr-1.5 h-3.5 w-3.5" />Add comment</Button>}</section>
      <section className="mt-2 rounded-md border bg-background"><div className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1.5"><button type="button" className="inline-flex items-center gap-1.5 rounded px-0.5 py-0.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" onClick={() => setShowActivity((current) => !current)} aria-expanded={showActivity}><History className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Activity</span><span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{taskActivity.length}</span><ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", showActivity && "rotate-180")} /><span className="sr-only">{showActivity ? "Hide activity" : "Show activity"}</span></button><div className="flex flex-wrap items-center justify-end gap-1.5"><Button type="button" size="sm" variant="outline" className="h-8" onClick={() => { setExpanded(true); setEditing(true); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit To-Do</Button>{onAddSubtask ? <Button type="button" size="sm" className="h-8" onClick={() => onAddSubtask(task)}>Add sub-To-Do</Button> : null}{hasSubtodos ? <Button type="button" size="icon" variant="outline" className="relative h-8 w-8" onClick={toggleSubtodos} aria-label={`${subtasksExpanded ? "Hide" : "View"} ${subTodoCount} sub-To-Dos`} title={`${subtasksExpanded ? "Hide" : "View"} ${subTodoCount} sub-To-Dos`}><CornerDownRight className="h-4 w-4" strokeWidth={2.75} /><span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{subTodoCount}</span></Button> : null}<Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => { if (window.confirm(`Delete “${task.title}”?`)) onDelete(task.id); }} aria-label="Delete To-Do" title="Delete To-Do"><Trash2 className="h-4 w-4" /></Button></div></div>{showActivity ? <div className="border-t px-2 py-2"><div className="space-y-1.5 border-l border-border pl-2.5">{taskActivity.map((entry: any) => <article key={entry.id} className="relative text-sm"><span className="absolute -left-[1.22rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground"><History className="h-3.5 w-3.5" /></span><p>{activityLabel(entry)}</p>{entry.detail && entry.action !== "task_created" ? <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{entry.detail}</p> : null}<p className="mt-0.5 text-[11px] text-muted-foreground">{format(new Date(entry.createdAt), "MMM d, h:mm a")}</p></article>)}</div></div> : null}</section>
    </div> : null}
  </div>;
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
  const [showAddSection, setShowAddSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [parentTodo, setParentTodo] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({ title: "", sectionId: NO_SECTION_VALUE, ownerId: "", dueDate: "", priority: "medium" as Priority, notes: "" });
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
    onSuccess: () => { toast.success(parentTodo ? "Sub-todo added" : "Todo added"); refetch(); setShowAddTask(false); setParentTodo(null); setTaskForm({ title: "", sectionId: NO_SECTION_VALUE, ownerId: "", dueDate: "", priority: "medium", notes: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const createSection = trpc.pm.sections.create.useMutation({
    onSuccess: () => { toast.success("Section added"); refetch(); setShowAddSection(false); setSectionTitle(""); },
    onError: (e) => toast.error(e.message),
  });
  const updateSection = trpc.pm.sections.update.useMutation({
    onSuccess: () => { toast.success("Section renamed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSection = trpc.pm.sections.delete.useMutation({
    onSuccess: () => { toast.success("Section deleted; its todos returned to the main list"); refetch(); },
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
  const saveTodoLayout = trpc.pm.tasks.saveLayout.useMutation({
    onSuccess: () => refetch(),
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
      isRock: Boolean(project.isRock),
      rockQuarter: project.rockQuarter ?? `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`,
      definitionOfDone: project.definitionOfDone ?? "",
      rockStatus: project.rockStatus ?? "on_track",
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
      isRock: editForm.isRock,
      rockQuarter: editForm.isRock ? editForm.rockQuarter : null,
      definitionOfDone: editForm.isRock ? editForm.definitionOfDone : null,
      rockStatus: editForm.isRock ? editForm.rockStatus : undefined,
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
      sectionId: parentTodo ? undefined : (taskForm.sectionId === NO_SECTION_VALUE ? null : Number(taskForm.sectionId)),
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
  const projectActivity = project.activity as any[];
  const tasks = project.tasks ?? [];
  const todoSections = project.todoSections ?? [];
  const topLevelTodos = tasks.filter((task: any) => !task.parentTaskId);
  const subTodosByParent = new Map<number, any[]>();
  tasks.filter((task: any) => task.parentTaskId).forEach((task: any) => {
    const siblings = subTodosByParent.get(task.parentTaskId) ?? [];
    siblings.push(task);
    subTodosByParent.set(task.parentTaskId, siblings);
  });
  const completedTasks = tasks.filter((t: any) => t.completed).length;
  const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : (project.weeklyUpdates?.[0]?.progressPct ?? 0);

  function openAddTodo(sectionId: number | null, parent: any | null = null) {
    setParentTodo(parent);
    setTaskForm({
      title: "",
      sectionId: String(parent?.sectionId ?? sectionId ?? NO_SECTION_VALUE),
      ownerId: parent?.ownerId ? String(parent.ownerId) : "",
      dueDate: parent?.dueDate ? format(new Date(parent.dueDate), "yyyy-MM-dd") : "",
      priority: (parent?.priority as Priority) ?? "medium",
      notes: "",
    });
    setShowAddTask(true);
  }

  function renderTodo(task: any, dragHandle?: any) {
    return <TaskItem key={task.id} task={task} activity={projectActivity} onChanged={() => refetch()} adminUsers={adminUsers as any[]} onToggle={(id, completed) => toggleTask.mutate({ id, completed })} onDelete={id => deleteTask.mutate({ id })} onUpdate={(id, data) => updateTask.mutate({ id, ...data })} mentionableUsers={collaborators as any[]} todoSections={todoSections as any[]} dragHandle={dragHandle} highlightedCommentId={highlightedTodoId === task.id ? highlightedCommentId : null} onAddSubtask={parent => openAddTodo(parent.sectionId ?? null, parent)}>
      {(subTodosByParent.get(task.id) ?? []).map(subTodo => <TaskItem key={subTodo.id} task={subTodo} activity={projectActivity} onChanged={() => refetch()} adminUsers={adminUsers as any[]} mentionableUsers={collaborators as any[]} todoSections={todoSections as any[]} highlightedCommentId={highlightedTodoId === subTodo.id ? highlightedCommentId : null} onToggle={(id, completed) => toggleTask.mutate({ id, completed })} onDelete={id => deleteTask.mutate({ id })} onUpdate={(id, data) => updateTask.mutate({ id, ...data })} />)}
    </TaskItem>;
  }

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
              <div className="sm:col-span-2 rounded-lg border border-primary/20 bg-primary/[0.025] p-3">
                <div className="flex items-center gap-2"><Checkbox id="edit-project-rock" checked={editForm.isRock} onCheckedChange={checked => setEditForm((f: any) => ({ ...f, isRock: checked === true }))} /><Label htmlFor="edit-project-rock" className="cursor-pointer font-medium"><Flag className="mr-1 inline h-3.5 w-3.5 text-primary" />This project is a Rock</Label></div>
                {editForm.isRock ? <div className="mt-3 grid gap-3 sm:grid-cols-3"><div><Label>Quarter *</Label><Input value={editForm.rockQuarter} onChange={event => setEditForm((f: any) => ({ ...f, rockQuarter: event.target.value }))} placeholder="Q3 2026" /></div><div><Label>Rock Status</Label><Select value={editForm.rockStatus} onValueChange={value => setEditForm((f: any) => ({ ...f, rockStatus: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on_track">On Track</SelectItem><SelectItem value="at_risk">At Risk</SelectItem><SelectItem value="off_track">Off Track</SelectItem><SelectItem value="done">Done</SelectItem><SelectItem value="dropped">Dropped</SelectItem></SelectContent></Select></div><div className="sm:col-span-1"><Label>Definition of Done *</Label><Input value={editForm.definitionOfDone} onChange={event => setEditForm((f: any) => ({ ...f, definitionOfDone: event.target.value }))} placeholder="What proves this is complete?" /></div></div> : null}
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
                  {project.isRock ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary"><Flag className="h-3.5 w-3.5" />Rock{project.rockQuarter ? ` · ${project.rockQuarter}` : ""}</span> : null}
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

            {project.isRock && project.definitionOfDone ? <div className="mb-4 rounded-md border border-primary/20 bg-primary/[0.025] px-3 py-2"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Definition of Done</p><p className="mt-1 text-sm">{project.definitionOfDone}</p></div> : null}

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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Todos</h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <Switch id="show-completed-todos" checked={showCompletedTodos} onCheckedChange={setShowCompletedTodos} />
                <Label htmlFor="show-completed-todos" className="cursor-pointer text-xs text-muted-foreground">Show completed</Label>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowAddSection(value => !value)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Section
              </Button>
              <Button size="sm" variant="outline" onClick={() => openAddTodo(null)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Todo
              </Button>
            </div>
          </div>

          {showAddSection && (
            <form onSubmit={event => { event.preventDefault(); if (sectionTitle.trim()) createSection.mutate({ projectId, title: sectionTitle.trim() }); }} className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-card p-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="project-todo-section-title" className="mb-1.5 block text-xs">Section Title *</Label>
                <Input id="project-todo-section-title" value={sectionTitle} onChange={event => setSectionTitle(event.target.value)} placeholder="Such as Launch tasks" maxLength={128} required autoFocus />
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="submit" size="sm" disabled={!sectionTitle.trim() || createSection.isPending}>{createSection.isPending ? "Adding…" : "Add Section"}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setShowAddSection(false); setSectionTitle(""); }}>Cancel</Button>
              </div>
            </form>
          )}

          {/* Add todo form */}
          {showAddTask && (
            <form onSubmit={handleAddTask} className="bg-card border border-primary/30 rounded-lg p-4 space-y-3">
              {parentTodo && <div className="rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">Adding a sub-todo under <strong>{parentTodo.title}</strong>. It will stay in the same section as its parent.</div>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs">Todo Title *</Label>
                  <Input
                    value={taskForm.title}
                    onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="What needs to be done?"
                    autoFocus
                  />
                </div>
                {!parentTodo && todoSections.length > 0 && <div>
                  <Label className="text-xs">Section (optional)</Label>
                  <Select value={taskForm.sectionId} onValueChange={value => setTaskForm(form => ({ ...form, sectionId: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SECTION_VALUE}>No section</SelectItem>
                      {(todoSections as any[]).map((section: any) => <SelectItem key={section.id} value={String(section.id)}>{section.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>}
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

          {tasks.length === 0 && todoSections.length === 0 && !showAddTask ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No todos yet. Add a todo, or create a titled section to organize the work.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Drag section rows or todo handles to reorder them. Drop between rows to keep a todo in the main list, or drop inside a section to move the todo and its sub-todos into that section.</p>
              <ProjectTodoBoard
                sections={todoSections as any[]}
                todos={topLevelTodos as any[]}
                showCompleted={showCompletedTodos}
                renderTodo={renderTodo}
                onAddTodo={sectionId => openAddTodo(sectionId)}
                onRenameSection={(sectionId, title) => updateSection.mutate({ id: sectionId, title })}
                onDeleteSection={section => {
                  if (window.confirm(`Delete “${section.title}”? Todos in it will return to the main list.`)) deleteSection.mutate({ id: section.id });
                }}
                onLayoutChange={(layout: ProjectTodoLayoutItem[]) => saveTodoLayout.mutateAsync({ projectId, layout })}
                saving={saveTodoLayout.isPending}
              />
            </>
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
