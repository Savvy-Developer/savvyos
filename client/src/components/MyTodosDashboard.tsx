import { useEffect, useMemo, useState } from "react";
import { format, isPast, isToday } from "date-fns";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FolderKanban,
  MessageCircle,
  Pencil,
  Repeat2,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PulseInlineItemRow } from "@/components/pulse/PulseItemEditor";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TodoStatus = "not_started" | "in_progress" | "blocked" | "completed";
type ProjectPriority = "high" | "medium" | "low";
type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";

type Todo = {
  id: string;
  source: "l10" | "project";
  title: string;
  dueDate: Date | string | null;
  sourceId: string | number;
  meetingId?: string;
  projectId?: number;
  sourceLabel: string;
  sourceDate: Date | string | null;
  priority?: string | null;
  status?: TodoStatus | null;
  notes?: string | null;
  recurrence?: Recurrence | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
  parentWorkItemId?: string | null;
  parentTaskId?: number | null;
  sectionName?: string | null;
  createdAt?: Date | string | null;
  commentCount?: number | null;
  attachmentCount?: number | null;
  linkedSubTodoCount?: number | null;
};

type ProjectTodoForm = {
  title: string;
  dueDate: string;
  priority: ProjectPriority;
  status: TodoStatus;
  recurrence: Recurrence;
  notes: string;
  ownerId: string;
};

const statusConfig: Record<TodoStatus, { label: string; className: string }> = {
  not_started: {
    label: "Not Started",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  in_progress: {
    label: "In Progress",
    className: "border-blue-200 bg-blue-50 text-blue-800",
  },
  blocked: {
    label: "Blocked",
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  completed: {
    label: "Completed",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

const recurrenceLabels: Record<Recurrence, string> = {
  none: "One-time",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

function dateValue(value: Date | string | null | undefined) {
  return value ? format(new Date(value), "yyyy-MM-dd") : "";
}

function duePresentation(value: Date | string | null) {
  if (!value) {
    return { label: "No due date", className: "text-muted-foreground" };
  }
  const due = new Date(value);
  if (isPast(due) && !isToday(due)) {
    return {
      label: `Overdue · ${format(due, "MMM d")}`,
      className: "font-medium text-destructive",
    };
  }
  if (isToday(due)) {
    return { label: "Due today", className: "font-medium text-amber-700" };
  }
  return {
    label: `Due ${format(due, "MMM d, yyyy")}`,
    className: "text-muted-foreground",
  };
}

function sourceText(todo: Todo) {
  if (todo.source === "project") return `Project · ${todo.sourceLabel}`;
  return `L10 · ${todo.sourceLabel}${
    todo.sourceDate
      ? ` · ${format(new Date(todo.sourceDate), "MMM d, yyyy")}`
      : ""
  }`;
}

function projectForm(todo: Todo): ProjectTodoForm {
  return {
    title: todo.title,
    dueDate: dateValue(todo.dueDate),
    priority: (todo.priority as ProjectPriority) ?? "medium",
    status: todo.status ?? "not_started",
    recurrence: todo.recurrence ?? "none",
    notes: todo.notes ?? "",
    ownerId: todo.assigneeId ? String(todo.assigneeId) : "",
  };
}

function SourceBadge({ todo }: { todo: Todo }) {
  const isL10 = todo.source === "l10";
  const href = isL10
    ? `/pulse/meetings/${todo.meetingId}`
    : `/projects/${todo.projectId}?tab=tasks#todo-${todo.sourceId}`;
  return (
    <a
      href={href}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:brightness-95",
        isL10
          ? "border-violet-200 bg-violet-50 text-violet-800"
          : "border-primary/20 bg-primary/10 text-primary"
      )}
    >
      <span className="truncate">{sourceText(todo)}</span>
      {isL10 ? (
        <ExternalLink className="h-3 w-3 shrink-0" />
      ) : (
        <FolderKanban className="h-3 w-3 shrink-0" />
      )}
    </a>
  );
}

function ProjectTodoWorkspace({
  todo,
  adminUsers,
  onChanged,
}: {
  todo: Todo;
  adminUsers: any[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [dueDate, setDueDate] = useState(dateValue(todo.dueDate));
  const [form, setForm] = useState<ProjectTodoForm>(() => projectForm(todo));
  const taskId = Number(todo.sourceId);
  const status = todo.status ?? "not_started";
  const due = duePresentation(todo.dueDate);

  useEffect(() => {
    setDueDate(dateValue(todo.dueDate));
    setForm(projectForm(todo));
  }, [todo]);

  const update = trpc.pm.tasks.update.useMutation({
    onSuccess: result => {
      toast.success(
        result.rolledForward
          ? "Recurring Project To-Do moved to its next due date."
          : "Project To-Do updated."
      );
      setEditing(false);
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const toggle = trpc.pm.tasks.toggleComplete.useMutation({
    onSuccess: result => {
      if (result.rolledForward) {
        toast.success("Recurring Project To-Do moved to its next due date.");
      }
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const { data: comments = [], refetch: refetchComments } =
    trpc.pm.tasks.getComments.useQuery(
      { taskId },
      { enabled: expanded && commentsOpen }
    );
  const addComment = trpc.pm.tasks.addComment.useMutation({
    onSuccess: () => {
      setCommentText("");
      void refetchComments();
      onChanged();
    },
    onError: error => toast.error(error.message),
  });
  const deleteComment = trpc.pm.tasks.deleteComment.useMutation({
    onSuccess: () => {
      void refetchComments();
      onChanged();
      toast.success("Comment deleted.");
    },
    onError: error => toast.error(error.message),
  });
  const displayedCommentCount = commentsOpen
    ? (comments as any[]).length
    : Number(todo.commentCount ?? 0);

  const people = useMemo(
    () =>
      [...adminUsers].sort((left: any, right: any) =>
        (left.name ?? left.email ?? "").localeCompare(
          right.name ?? right.email ?? ""
        )
      ),
    [adminUsers]
  );

  function quickUpdate(data: Record<string, unknown>) {
    update.mutate({ id: taskId, ...data });
  }

  function saveEdit() {
    if (!form.title.trim()) {
      toast.error("Enter a To-Do title.");
      return;
    }
    if (form.recurrence !== "none" && !form.dueDate) {
      toast.error("Recurring Project To-Dos need a due date.");
      return;
    }
    update.mutate({
      id: taskId,
      title: form.title.trim(),
      ownerId: Number(form.ownerId),
      dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00`) : null,
      priority: form.priority,
      status: form.status,
      recurrence: form.recurrence,
      notes: form.notes,
    });
  }

  function openComments() {
    setExpanded(true);
    setCommentsOpen(true);
  }

  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 transition-colors hover:bg-muted/40">
        <button
          type="button"
          onClick={() =>
            toggle.mutate({ id: taskId, completed: status !== "completed" })
          }
          aria-label={
            status === "completed"
              ? "Completed. Reopen To-Do."
              : "Complete To-Do"
          }
          title={status === "completed" ? "Completed" : "Complete To-Do"}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            status === "completed"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-muted-foreground hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
          )}
        >
          {status === "completed" ? <Check className="h-3.5 w-3.5" /> : null}
        </button>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
          className="flex min-w-[12rem] flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              status === "completed" && "text-muted-foreground line-through"
            )}
          >
            {todo.title}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
        <SourceBadge todo={todo} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-xs"
          onClick={openComments}
          title="Open comments"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {displayedCommentCount > 0 ? displayedCommentCount : null}
        </Button>
        <Select
          value={status}
          onValueChange={value => quickUpdate({ status: value as TodoStatus })}
          disabled={update.isPending}
        >
          <SelectTrigger
            aria-label="Project To-Do status"
            className={cn(
              "h-7 w-[7.8rem] px-2 text-xs",
              statusConfig[status].className
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusConfig).map(([value, config]) => (
              <SelectItem key={value} value={value}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Project To-Do due date"
          type="date"
          value={dueDate}
          onChange={event => {
            const value = event.target.value;
            setDueDate(value);
            quickUpdate({
              dueDate: value ? new Date(`${value}T12:00:00`) : null,
            });
          }}
          disabled={update.isPending}
          className="h-7 w-[8.25rem] bg-background px-1.5 text-xs"
        />
        <Select
          value={(todo.priority as ProjectPriority) ?? "medium"}
          onValueChange={value =>
            quickUpdate({ priority: value as ProjectPriority })
          }
          disabled={update.isPending}
        >
          <SelectTrigger
            aria-label="Project To-Do priority"
            className="h-7 w-[6.25rem] px-2 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={todo.assigneeId ? String(todo.assigneeId) : undefined}
          onValueChange={value => quickUpdate({ ownerId: Number(value) })}
          disabled={update.isPending || people.length === 0}
        >
          <SelectTrigger
            aria-label="Project To-Do assignee"
            className="h-7 w-[8.25rem] bg-background px-2 text-xs"
          >
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            {people.map((person: any) => (
              <SelectItem key={person.id} value={String(person.id)}>
                {person.name ?? person.email ?? `User #${person.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {expanded ? (
        <div className="border-t border-primary/20 bg-primary/[0.025] px-2 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SourceBadge todo={todo} />
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className={due.className}>{due.label}</span>
              <span>· {todo.assigneeName ?? "Unassigned"}</span>
              {todo.sectionName ? <span>· {todo.sectionName}</span> : null}
              {todo.recurrence && todo.recurrence !== "none" ? (
                <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/[0.04] px-1.5 py-0.5 text-primary">
                  <Repeat2 className="h-3 w-3" />
                  {recurrenceLabels[todo.recurrence]}
                </span>
              ) : null}
            </div>
          </div>
          <section className="mt-2 rounded border bg-background px-2 py-1.5">
            <p className="text-xs font-semibold">Details</p>
            {todo.notes ? (
              <p className="mt-1 whitespace-pre-wrap text-sm">{todo.notes}</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                No details added.
              </p>
            )}
          </section>
          {editing ? (
            <section className="mt-2 rounded border bg-background p-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">Edit Project To-Do</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setForm(projectForm(todo));
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <div className="sm:col-span-2 xl:col-span-3">
                  <Label
                    className="text-xs"
                    htmlFor={`my-project-title-${taskId}`}
                  >
                    Title
                  </Label>
                  <Input
                    id={`my-project-title-${taskId}`}
                    className="mt-1 h-8 text-sm"
                    value={form.title}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Assignee</Label>
                  <Select
                    value={form.ownerId || undefined}
                    onValueChange={value =>
                      setForm(current => ({ ...current, ownerId: value }))
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      {people.map((person: any) => (
                        <SelectItem key={person.id} value={String(person.id)}>
                          {person.name ?? person.email ?? `User #${person.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={value =>
                      setForm(current => ({
                        ...current,
                        status: value as TodoStatus,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusConfig).map(([value, config]) => (
                        <SelectItem key={value} value={value}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Due date</Label>
                  <Input
                    type="date"
                    className="mt-1 h-8 text-xs"
                    value={form.dueDate}
                    onChange={event =>
                      setForm(current => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={value =>
                      setForm(current => ({
                        ...current,
                        priority: value as ProjectPriority,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Repeats</Label>
                  <Select
                    value={form.recurrence}
                    onValueChange={value =>
                      setForm(current => ({
                        ...current,
                        recurrence: value as Recurrence,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(recurrenceLabels).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2">
                <Label className="text-xs">Details</Label>
                <Textarea
                  className="mt-1 min-h-16 text-sm"
                  rows={2}
                  value={form.notes}
                  onChange={event =>
                    setForm(current => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={update.isPending}
                  onClick={saveEdit}
                >
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </section>
          ) : (
            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => setEditing(true)}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit To-Do
              </Button>
            </div>
          )}
          <section className="mt-2 overflow-hidden rounded border bg-background">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted/45"
              onClick={() => setCommentsOpen(current => !current)}
              aria-expanded={commentsOpen}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <MessageCircle className="h-4 w-4 text-primary" />
                Comments
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {displayedCommentCount}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  commentsOpen && "rotate-180"
                )}
              />
            </button>
            {commentsOpen ? (
              <div className="border-t px-2 py-2">
                {(comments as any[]).length ? (
                  <div className="divide-y">
                    {(comments as any[]).map((comment: any) => (
                      <article
                        key={comment.id}
                        className="flex gap-2 py-1.5 first:pt-0 last:pb-0"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {(comment.authorName ?? "?")
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part: string) => part[0])
                            .join("")
                            .toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">
                              {comment.authorName ?? "Teammate"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(
                                new Date(comment.createdAt),
                                "MMM d, h:mm a"
                              )}
                            </span>
                            {comment.canDelete ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
                                disabled={deleteComment.isPending}
                                onClick={() => {
                                  if (window.confirm("Delete this comment?")) {
                                    deleteComment.mutate({
                                      commentId: comment.id,
                                    });
                                  }
                                }}
                                aria-label="Delete comment"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm">
                            {comment.content}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No comments yet.
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <Textarea
                    value={commentText}
                    onChange={event => setCommentText(event.target.value)}
                    onKeyDown={event => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        commentText.trim()
                      ) {
                        event.preventDefault();
                        addComment.mutate({
                          taskId,
                          content: commentText.trim(),
                        });
                      }
                    }}
                    placeholder="Add a comment…"
                    rows={1}
                    className="min-h-8 resize-none text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 self-end"
                    disabled={!commentText.trim() || addComment.isPending}
                    onClick={() =>
                      addComment.mutate({ taskId, content: commentText.trim() })
                    }
                  >
                    Post
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </article>
  );
}

function L10TodoWorkspace({
  todo,
  onChanged,
}: {
  todo: Todo;
  onChanged: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-2 py-1">
        <SourceBadge todo={todo} />
        <span
          className={cn(
            "shrink-0 text-xs",
            duePresentation(todo.dueDate).className
          )}
        >
          {duePresentation(todo.dueDate).label}
        </span>
      </div>
      <PulseInlineItemRow
        item={{
          id: String(todo.sourceId),
          type: "todo",
          title: todo.title,
          description: todo.notes ?? null,
          meetingId: todo.meetingId ?? null,
          meetingName: todo.sourceLabel,
          ownerPersonId: null,
          assigneeId: todo.assigneeId ?? null,
          assigneeName: todo.assigneeName ?? null,
          parentWorkItemId: todo.parentWorkItemId ?? null,
          status: todo.status ?? "not_started",
          dueDate: todo.dueDate ? dateValue(todo.dueDate) : null,
          priorityLevel: todo.priority ?? "medium",
          commentCount: Number(todo.commentCount ?? 0),
          attachmentCount: Number(todo.attachmentCount ?? 0),
          linkedSubTodoCount: Number(todo.linkedSubTodoCount ?? 0),
        }}
        defaultDestinationId={todo.meetingId ?? null}
        showDestination={false}
        onChanged={onChanged}
      />
    </article>
  );
}

export default function MyTodosDashboard() {
  const utils = trpc.useUtils();
  const { data: todos = [], isLoading } = trpc.pm.myTodos.listOpen.useQuery(
    undefined,
    {
      refetchInterval: 1500,
    }
  );
  const { data: adminUsers = [] } = trpc.users.list.useQuery({ role: "admin" });
  const items = todos as Todo[];

  const refreshEverywhere = () => {
    void utils.pm.myTodos.invalidate();
    void utils.pm.projects.invalidate();
    void utils.pm.l10Todos.invalidate();
    void utils.pulse.workItems.invalidate();
    void utils.pulse.l10.invalidate();
    void utils.pulse.personal.invalidate();
  };

  return (
    <section className="mb-4 overflow-hidden rounded-md border border-primary/25 bg-primary/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/15 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">My To-Dos</h2>
            <p className="truncate text-xs text-muted-foreground">
              Work the original Project and L10 records from one place.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-primary/20 bg-background px-2 py-0.5 text-xs font-semibold text-primary">
          {items.length} open
        </span>
      </div>
      <div className="space-y-1.5 p-1.5">
        {isLoading ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Loading your To-Dos…
          </p>
        ) : null}
        {!isLoading && items.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            You have no open L10 or Project To-Dos.
          </div>
        ) : null}
        {items.map(todo =>
          todo.source === "l10" ? (
            <L10TodoWorkspace
              key={todo.id}
              todo={todo}
              onChanged={refreshEverywhere}
            />
          ) : (
            <ProjectTodoWorkspace
              key={todo.id}
              todo={todo}
              adminUsers={adminUsers as any[]}
              onChanged={refreshEverywhere}
            />
          )
        )}
      </div>
    </section>
  );
}
