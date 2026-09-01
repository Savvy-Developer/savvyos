import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format, isPast, isToday } from "date-fns";
import { CheckCircle2, ChevronLeft, Circle, ListTodo, MoreHorizontal, Plus, Repeat2, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";

type PersonalTodo = {
  id: number;
  userId: number;
  title: string;
  notes: string | null;
  dueDate: Date | null;
  recurrence: Recurrence;
  completed: boolean;
};

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: "One-time",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  monthly: "Monthly",
};

function PersonalTodoRow({ todo, editable, onRefresh }: { todo: PersonalTodo; editable: boolean; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: todo.title,
    notes: todo.notes ?? "",
    dueDate: todo.dueDate ? format(new Date(todo.dueDate), "yyyy-MM-dd") : "",
    recurrence: todo.recurrence,
  });
  const complete = trpc.pm.personalTodos.toggleComplete.useMutation({
    onSuccess: (result) => {
      toast.success(result.rolledForward ? "Recurring todo moved to its next due date" : "Todo updated");
      onRefresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const update = trpc.pm.personalTodos.update.useMutation({
    onSuccess: () => { toast.success("Personal todo updated"); setEditing(false); onRefresh(); },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.pm.personalTodos.delete.useMutation({
    onSuccess: () => { toast.success("Personal todo removed"); onRefresh(); },
    onError: (error) => toast.error(error.message),
  });

  const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
  const overdue = !!dueDate && !todo.completed && isPast(dueDate) && !isToday(dueDate);

  function save() {
    if (!form.title.trim()) {
      toast.error("A todo title is required");
      return;
    }
    if (form.recurrence !== "none" && !form.dueDate) {
      toast.error("Recurring todos need a first due date");
      return;
    }
    update.mutate({
      id: todo.id,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      dueDate: form.dueDate ? new Date(form.dueDate) : null,
      recurrence: form.recurrence,
    });
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card", todo.completed && "opacity-60")}>
      <div className="flex gap-3 px-4 py-3">
        <button
          type="button"
          disabled={!editable || complete.isPending}
          onClick={() => complete.mutate({ id: todo.id, completed: !todo.completed })}
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed"
          aria-label={todo.completed ? "Reopen todo" : "Complete todo"}
        >
          {todo.completed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", todo.completed && "text-muted-foreground line-through")}>{todo.title}</p>
          {todo.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{todo.notes}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {dueDate && <span className={cn(overdue && "font-medium text-red-600")}>{overdue ? `Overdue · ${format(dueDate, "MMM d")}` : isToday(dueDate) ? "Due today" : `Due ${format(dueDate, "MMM d, yyyy")}`}</span>}
            {todo.recurrence !== "none" && <span className="inline-flex items-center gap-1"><Repeat2 className="h-3 w-3" /> {RECURRENCE_LABELS[todo.recurrence]}</span>}
          </div>
        </div>
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => remove.mutate({ id: todo.id })}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editing && (
        <div className="space-y-3 border-t border-border bg-muted/20 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label className="text-xs">Todo</Label><Input className="mt-1" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
            <div><Label className="text-xs">Due date</Label><Input className="mt-1" type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></div>
            <div><Label className="text-xs">Repeats</Label><Select value={form.recurrence} onValueChange={(value) => setForm((current) => ({ ...current, recurrence: value as Recurrence }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(RECURRENCE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label className="text-xs">Notes</Label><Textarea className="mt-1" rows={2} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          <div className="flex gap-2"><Button size="sm" onClick={save} disabled={update.isPending}>{update.isPending ? "Saving..." : "Save"}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </div>
      )}
    </div>
  );
}

export default function PersonalTodosPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const currentUserId = Number((user as any)?.id ?? 0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", notes: "", dueDate: "", recurrence: "none" as Recurrence });
  const targetUserId = Number(selectedUserId || currentUserId || 0);
  const userInput = useMemo(() => targetUserId ? { userId: targetUserId } : undefined, [targetUserId]);
  const { data: users = [] } = trpc.pm.personalTodos.availableUsers.useQuery();
  const { data: todos = [], refetch } = trpc.pm.personalTodos.list.useQuery(userInput, { enabled: !!targetUserId });
  const { data: stats, refetch: refetchStats } = trpc.pm.personalTodos.stats.useQuery(userInput, { enabled: !!targetUserId });
  const create = trpc.pm.personalTodos.create.useMutation({
    onSuccess: () => {
      toast.success("Personal todo added");
      setCreateOpen(false);
      setForm({ title: "", notes: "", dueDate: "", recurrence: "none" });
      void refetch();
      void refetchStats();
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!selectedUserId && currentUserId) setSelectedUserId(String(currentUserId));
  }, [currentUserId, selectedUserId]);

  const targetUser = (users as any[]).find((person) => person.id === targetUserId);
  const editable = targetUserId === currentUserId;
  const active = (todos as PersonalTodo[]).filter((todo) => !todo.completed);
  const completed = (todos as PersonalTodo[]).filter((todo) => todo.completed);
  const refreshAll = () => { void refetch(); void refetchStats(); };

  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return toast.error("A todo title is required");
    if (form.recurrence !== "none" && !form.dueDate) return toast.error("Recurring todos need a first due date");
    create.mutate({ title: form.title.trim(), notes: form.notes.trim() || undefined, dueDate: form.dueDate ? new Date(form.dueDate) : null, recurrence: form.recurrence });
  }

  return (
    <div>
      <button type="button" onClick={() => navigate("/projects")} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Projects</button>
      <PageHeader
        title={editable ? "My Personal Todos" : `${targetUser?.name ?? "User"}'s Personal Todos`}
        subtitle={editable ? "One-off and recurring work that belongs only to you" : "Viewing this user's private todo list"}
        actions={editable ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add Personal Todo</Button> : undefined}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <Label className="mb-1.5 block text-xs">Personal todo list</Label>
          <SearchableSelect
            options={(users as any[]).map((person) => ({ value: String(person.id), label: person.name ?? person.email ?? `User #${person.id}`, description: person.email ?? undefined }))}
            value={String(targetUserId || "")}
            onValueChange={setSelectedUserId}
            placeholder="Select a user"
            searchPlaceholder="Search users…"
            listClassName="max-h-72"
          />
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-center"><p className="text-xl font-bold text-black">{stats?.active ?? 0}</p><p className="text-xs text-muted-foreground">Active</p></div>
        <div className="rounded-lg border border-red-100 bg-card px-4 py-2.5 text-center"><p className="text-xl font-bold text-red-600">{stats?.overdue ?? 0}</p><p className="text-xs text-muted-foreground">Overdue</p></div>
      </div>

      {!editable && <div className="mb-4 rounded-lg border border-muted bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Only {targetUser?.name ?? "this user"} can add, edit, complete, or remove their personal todos.</div>}
      {active.length === 0 && completed.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-14 text-center text-muted-foreground"><ListTodo className="mx-auto mb-3 h-9 w-9 opacity-30" /><p className="font-medium">No personal todos yet</p><p className="mt-1 text-sm">{editable ? "Add a one-time or recurring todo to get started." : "This user has not added any personal todos."}</p></div>
      ) : (
        <div className="space-y-2">{active.map((todo) => <PersonalTodoRow key={todo.id} todo={todo} editable={editable} onRefresh={refreshAll} />)}{completed.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">{completed.length} completed todo{completed.length === 1 ? "" : "s"}</summary><div className="mt-2 space-y-2">{completed.map((todo) => <PersonalTodoRow key={todo.id} todo={todo} editable={editable} onRefresh={refreshAll} />)}</div></details>}</div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add Personal Todo</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={submitCreate}>
          <div><Label htmlFor="personal-todo-title">What needs to be done? *</Label><Input id="personal-todo-title" className="mt-1" autoFocus value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="personal-todo-date">Due date</Label><Input id="personal-todo-date" className="mt-1" type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></div><div><Label>Repeats</Label><Select value={form.recurrence} onValueChange={(value) => setForm((current) => ({ ...current, recurrence: value as Recurrence }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(RECURRENCE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div>
          <div><Label htmlFor="personal-todo-notes">Notes</Label><Textarea id="personal-todo-notes" className="mt-1" rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Adding..." : "Add Todo"}</Button></DialogFooter>
        </form></DialogContent>
      </Dialog>
    </div>
  );
}
