import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { safeFormatET } from "@/lib/safeFormat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  CircleDot,
  Clock3,
  Loader2,
  Plus,
  Trash2,
  UserRound,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "new" | "in_progress" | "completed" | "cancelled";
type Assignee = { id: number; name: string | null; email: string | null; role: string };
type BoardRow = {
  request: {
    id: number;
    requesterId: number;
    assigneeId: number | null;
    title: string;
    description: string | null;
    priority: Priority;
    status: Status;
    createdAt: Date;
    updatedAt: Date;
  };
  requester: { id: number; name: string | null; email: string | null };
  assignee: { id: number | null; name: string | null; email: string | null } | null;
};

const PRIORITY_CONFIG: Record<Priority, { label: string; className: string }> = {
  low: { label: "Low", className: "border-slate-200 bg-slate-100 text-slate-700" },
  medium: { label: "Medium", className: "border-blue-200 bg-blue-50 text-blue-700" },
  high: { label: "High", className: "border-amber-200 bg-amber-50 text-amber-800" },
  urgent: { label: "Urgent", className: "border-red-200 bg-red-50 text-red-700" },
};

const STATUS_CONFIG: Record<
  Status,
  { label: string; className: string; icon: React.ReactNode; empty: string }
> = {
  new: {
    label: "New",
    className: "border-blue-200 bg-blue-50 text-blue-700",
    icon: <CircleDot className="h-3.5 w-3.5" />,
    empty: "No new tech requests",
  },
  in_progress: {
    label: "In Progress",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: <Clock3 className="h-3.5 w-3.5" />,
    empty: "Nothing currently in progress",
  },
  completed: {
    label: "Completed",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    empty: "No completed requests",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-slate-200 bg-slate-100 text-slate-600",
    icon: <XCircle className="h-3.5 w-3.5" />,
    empty: "No cancelled requests",
  },
};

const KANBAN_STATUSES: Status[] = ["new", "in_progress", "completed", "cancelled"];

function displayPerson(person: { name: string | null; email: string | null } | null | undefined, fallback = "Unassigned") {
  return person?.name?.trim() || person?.email?.trim() || fallback;
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const config = PRIORITY_CONFIG[priority];
  return <Badge variant="outline" className={`font-medium ${config.className}`}>{config.label}</Badge>;
}

function StatusBadge({ status }: { status: Status }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

function NewTechRequestDialog({
  open,
  onOpenChange,
  canManage,
  assignees,
  requesterName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  assignees: Assignee[];
  requesterName: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState("unassigned");
  const create = trpc.techRequests.create.useMutation();

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssigneeId("unassigned");
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Enter a brief title for your request.");
      return;
    }

    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        ...(canManage ? { assigneeId: assigneeId === "unassigned" ? null : Number(assigneeId) } : {}),
      });
      toast.success("Tech request submitted.");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      toast.error(error?.message || "The tech request could not be submitted.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Tech Request</DialogTitle>
          <DialogDescription>
            Describe the SavvyOS or technology support you need. Your request will appear in the Tech Request Board.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Requester</label>
            <Input value={requesterName} disabled aria-label="Requester" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Request title <span className="text-destructive">*</span></label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Need help updating my SavvyOS profile"
              maxLength={255}
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((value) => (
                    <SelectItem key={value} value={value}>{PRIORITY_CONFIG[value].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canManage && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Assignee</label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {assignees.map((person) => (
                      <SelectItem key={person.id} value={String(person.id)}>
                        {displayPerson(person)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Include the outcome you need, relevant page or workflow, and any helpful context."
              rows={5}
              maxLength={20_000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TechRequestCard({ row, onOpen }: { row: BoardRow; onOpen: () => void }) {
  const request = row.request;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl text-left transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.99]"
    >
      <Card className="border-border/80 shadow-sm transition-shadow hover:shadow-md">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-5">{request.title}</p>
            <PriorityBadge priority={request.priority} />
          </div>
          {request.description && (
            <p className="line-clamp-3 text-sm leading-5 text-muted-foreground">{request.description}</p>
          )}
          <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Requester: {displayPerson(row.requester)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Assignee: {displayPerson(row.assignee)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Updated {safeFormatET(request.updatedAt, { month: "short", day: "numeric", year: "numeric" })}</p>
        </CardContent>
      </Card>
    </button>
  );
}

function TechRequestDetailDialog({
  requestId,
  onOpenChange,
  canManage,
  assignees,
  onChanged,
}: {
  requestId: number | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  assignees: Assignee[];
  onChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.techRequests.getById.useQuery(
    { id: requestId ?? 0 },
    { enabled: requestId !== null }
  );
  const update = trpc.techRequests.update.useMutation();
  const remove = trpc.techRequests.delete.useMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = async () => {
    await Promise.all([
      utils.techRequests.list.invalidate(),
      utils.techRequests.getById.invalidate(),
      utils.techRequests.pendingCount.invalidate(),
    ]);
    onChanged();
  };

  const handleUpdate = async (changes: { status?: Status; priority?: Priority; assigneeId?: number | null }) => {
    if (!requestId) return;
    try {
      await update.mutateAsync({ id: requestId, ...changes });
      toast.success("Tech request updated.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "The tech request could not be updated.");
    }
  };

  const handleDelete = async () => {
    if (!requestId) return;
    try {
      await remove.mutateAsync({ id: requestId });
      toast.success("Tech request deleted.");
      setConfirmDelete(false);
      onOpenChange(false);
      await refresh();
    } catch (error: any) {
      toast.error(error?.message || "The tech request could not be deleted.");
    }
  };

  return (
    <>
      <Dialog open={requestId !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : data ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-start justify-between gap-3 pr-7">
                  <div>
                    <DialogTitle className="text-xl">{data.request.title}</DialogTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={data.request.status as Status} />
                      <PriorityBadge priority={data.request.priority as Priority} />
                    </div>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-5 py-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requester</p>
                    <p className="mt-1 text-sm font-medium">{displayPerson(data.requester)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assignee</p>
                    <p className="mt-1 text-sm font-medium">{displayPerson(data.assignee)}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Description</p>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {data.request.description || "No additional details were provided."}
                  </p>
                </div>
                {canManage && (
                  <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Status</label>
                      <Select
                        value={data.request.status}
                        onValueChange={(value) => handleUpdate({ status: value as Status })}
                        disabled={update.isPending}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {KANBAN_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>{STATUS_CONFIG[status].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Priority</label>
                      <Select
                        value={data.request.priority}
                        onValueChange={(value) => handleUpdate({ priority: value as Priority })}
                        disabled={update.isPending}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(PRIORITY_CONFIG) as Priority[]).map((priority) => (
                            <SelectItem key={priority} value={priority}>{PRIORITY_CONFIG[priority].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Assignee</label>
                      <Select
                        value={data.request.assigneeId === null ? "unassigned" : String(data.request.assigneeId)}
                        onValueChange={(value) => handleUpdate({ assigneeId: value === "unassigned" ? null : Number(value) })}
                        disabled={update.isPending}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {assignees.map((person) => (
                            <SelectItem key={person.id} value={String(person.id)}>{displayPerson(person)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Submitted {safeFormatET(data.request.createdAt)}</p>
              </div>
              <DialogFooter className="sm:justify-between">
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Request
                  </Button>
                ) : <span />}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tech request?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the request from the Tech Request Board. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function TechRequestsPage() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: access } = trpc.techRequests.access.useQuery();
  const canManage = access?.canManage === true;
  const { data: boardRows = [], isLoading } = trpc.techRequests.list.useQuery();
  const { data: assigneeOptions = [] } = trpc.techRequests.assigneeOptions.useQuery(
    undefined,
    { enabled: canManage }
  );

  const rowsByStatus = useMemo(() => {
    const result: Record<Status, BoardRow[]> = {
      new: [],
      in_progress: [],
      completed: [],
      cancelled: [],
    };
    for (const row of boardRows as BoardRow[]) result[row.request.status].push(row);
    return result;
  }, [boardRows]);

  const refreshBoard = () => {
    void utils.techRequests.list.invalidate();
    void utils.techRequests.pendingCount.invalidate();
  };

  const requesterName = displayPerson({ name: user?.name ?? null, email: user?.email ?? null }, "Current user");

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wrench className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Tech Request Board</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Submit SavvyOS and technology support needs, then follow their progress across the board.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Tech Request
        </Button>
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {KANBAN_STATUSES.map((status) => {
            const config = STATUS_CONFIG[status];
            const rows = rowsByStatus[status];
            return (
              <section key={status} className="min-h-64 rounded-xl border bg-muted/20 p-3">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${config.className}`}>
                    {config.icon}
                    {config.label}
                  </span>
                  <span className="ml-auto text-xs font-medium text-muted-foreground">{rows.length}</span>
                </div>
                <div className="space-y-3">
                  {rows.map((row) => <TechRequestCard key={row.request.id} row={row} onOpen={() => setSelectedId(row.request.id)} />)}
                  {rows.length === 0 && (
                    <div className="rounded-lg border border-dashed bg-background/50 px-4 py-9 text-center text-xs text-muted-foreground">
                      {config.empty}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <NewTechRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        canManage={canManage}
        assignees={assigneeOptions as Assignee[]}
        requesterName={requesterName}
        onCreated={refreshBoard}
      />
      <TechRequestDetailDialog
        requestId={selectedId}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
        canManage={canManage}
        assignees={assigneeOptions as Assignee[]}
        onChanged={refreshBoard}
      />
    </div>
  );
}
