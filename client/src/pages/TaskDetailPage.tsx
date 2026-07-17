import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PriorityBadge } from "@/components/StatusBadge";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Edit2,
  MessageSquare,
  Send,
  User,
  ExternalLink,
} from "lucide-react";
import { useAppBack } from "@/lib/navigationHistory";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export default function TaskDetailPage() {
  const [, params] = useRoute("/tasks/:id");
  const [, navigate] = useLocation();
  const goBack = useAppBack("/tasks");
  const { user } = useAuth();
  const taskId = params?.id ? parseInt(params.id) : 0;
  const role = (user as any)?.role;
  const isAdmin = role === "admin";
  const userId = (user as any)?.id;

  const [noteContent, setNoteContent] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ status: "", dueDate: "", priority: "", description: "" });

  const utils = trpc.useUtils();

  // Fetch single task by ID
  const { data: taskRow, isLoading } = trpc.tasks.getById.useQuery(
    { id: taskId },
    { enabled: taskId > 0 }
  );

  const task = taskRow?.task;
  const assignedTo = taskRow?.assignedTo;
  const contact = taskRow?.contact;

  // Task notes
  const { data: notes = [] } = trpc.tasks.getNotes.useQuery(
    { taskId },
    { enabled: taskId > 0 }
  );

  const addNote = trpc.tasks.addNote.useMutation({
    onSuccess: () => {
      toast.success("Note added");
      setNoteContent("");
      utils.tasks.getNotes.invalidate({ taskId });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditOpen(false);
      utils.tasks.getById.invalidate({ id: taskId });
      utils.tasks.list.invalidate();
      utils.tasks.listAll.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const completeMut = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      toast.success("Task completed");
      utils.tasks.getById.invalidate({ id: taskId });
      utils.tasks.list.invalidate();
      utils.tasks.listAll.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canComplete = task && task.status !== "completed" && (!isAdmin || task.assignedToId === userId);

  const openEdit = () => {
    if (!task) return;
    setEditForm({
      status: task.status ?? "pending",
      dueDate: task.dueDate ? safeFormat(task.dueDate, "yyyy-MM-dd") : "",
      priority: task.priority ?? "medium",
      description: task.description ?? "",
    });
    setEditOpen(true);
  };

  const handleEditSave = () => {
    if (!task) return;
    update.mutate({
      id: task.id,
      data: {
        status: editForm.status as any,
        dueDate: editForm.dueDate ? new Date(editForm.dueDate).toISOString() : null,
        priority: editForm.priority as any,
        description: editForm.description || null,
      },
    });
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    addNote.mutate({ taskId, content: noteContent.trim() });
  };

  const isOverdue = task?.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading task...
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground mb-4">Task not found</p>
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button */}
      <button
        onClick={goBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Task Header */}
      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            {/* Complete button */}
            <button
              className="mt-1 flex-shrink-0"
              onClick={() => {
                if (canComplete) completeMut.mutate({ id: task.id });
                else if (isAdmin && task.assignedToId !== userId) toast.error("You cannot complete tasks assigned to other users");
              }}
              disabled={!canComplete}
              title={!canComplete && isAdmin ? "Admins cannot complete tasks assigned to other users" : undefined}
            >
              {task.status === "completed" ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <Circle className={`h-6 w-6 ${canComplete ? "text-muted-foreground hover:text-primary cursor-pointer" : "text-muted-foreground/30 cursor-not-allowed"}`} />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h1 className={`text-lg font-semibold ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                  {task.title}
                </h1>
                <Button variant="ghost" size="sm" onClick={openEdit}>
                  <Edit2 className="h-4 w-4 mr-1" /> Edit
                </Button>
              </div>

              {/* Status & Priority */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="secondary" className={STATUS_COLORS[task.status] || ""}>
                  {task.status?.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </Badge>
                <PriorityBadge priority={task.priority} />
                {task.taskType && (
                  <Badge variant="outline" className="capitalize text-xs">
                    {task.taskType.replace("_", " ")}
                  </Badge>
                )}
                {isOverdue && (
                  <Badge variant="destructive" className="text-xs">Overdue</Badge>
                )}
              </div>

              {/* Description */}
              {task.description && (
                <p className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap">{task.description}</p>
              )}

              {/* Meta info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {task.dueDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className={isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}>
                      Due {safeFormat(task.dueDate, "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                {task.createdAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created {safeFormat(task.createdAt, "MMM d, yyyy")}</span>
                  </div>
                )}
                {assignedTo && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <button
                      className="text-primary hover:underline"
                      onClick={() => navigate(`/agents/${assignedTo.id}`)}
                    >
                      {assignedTo.name}
                    </button>
                  </div>
                )}
                {contact && (
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <button
                      className="text-primary hover:underline"
                      onClick={() => navigate(`/contacts/${contact.id}`)}
                    >
                      {contact.firstName} {contact.lastName}
                    </button>
                  </div>
                )}
              </div>

              {/* Admin restriction notice */}
              {isAdmin && task.assignedToId !== userId && task.status !== "completed" && (
                <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded px-2 py-1">
                  You cannot mark this task complete because it is assigned to another user.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Notes ({(notes as any[]).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Add Note */}
          <div className="flex gap-2 mb-4">
            <Textarea
              placeholder="Add a note..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={2}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
              }}
            />
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!noteContent.trim() || addNote.isPending}
              className="self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {/* Notes List */}
          {(notes as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No notes yet. Add one above.</p>
          ) : (
            <div className="space-y-3">
              {(notes as any[]).map((n: any) => (
                <div key={n.note.id} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{n.author?.name || "Unknown"}</span>
                    <span className="text-xs text-muted-foreground">
                      {safeFormat(n.note.createdAt, "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{n.note.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                  {["pending", "in_progress", "completed", "cancelled"].map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
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
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Task description..." />
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
