import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
  Paperclip,
  Download,
  Upload,
  Eye,
  Megaphone,
} from "lucide-react";
import { safeFormatET, safeFormatDate } from "@/lib/safeFormat";

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestType =
  | "graphic"
  | "image"
  | "slideshow"
  | "video"
  | "flyer"
  | "social_post"
  | "other";
type Priority = "low" | "normal" | "high" | "urgent";
type Status = "new" | "in_progress" | "completed" | "cancelled";

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  graphic: "Graphic",
  image: "Image",
  slideshow: "Slideshow",
  video: "Video",
  flyer: "Flyer",
  social_post: "Social Post",
  other: "Other",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

const STATUS_CONFIG: Record<
  Status,
  { label: string; color: string; icon: React.ReactNode }
> = {
  new: {
    label: "New",
    color: "bg-blue-100 text-blue-700",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-amber-100 text-amber-700",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-slate-100 text-slate-500",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Respond Dialog ───────────────────────────────────────────────────────────

function RespondDialog({
  requestId,
  currentStatus,
  onClose,
  onDone,
}: {
  requestId: number | null;
  currentStatus: Status;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>(currentStatus);
  const [responseFile, setResponseFile] = useState<File | null>(null);

  const respondMutation = trpc.marketingRequests.respond.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setResponseFile(e.target.files[0]);
  };

  const handleSubmit = async () => {
    if (!requestId) return;
    try {
      let base64: string | undefined;
      if (responseFile) {
        base64 = await fileToBase64(responseFile);
      }
      await respondMutation.mutateAsync({
        id: requestId,
        responseNote: note || undefined,
        status,
        responseFileName: responseFile?.name,
        responseMimeType: responseFile?.type,
        responseBase64: base64,
      });
      toast.success("Response saved");
      onDone();
      onClose();
    } catch {
      toast.error("Failed to save response");
    }
  };

  return (
    <Dialog open={requestId !== null} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Respond to Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Update Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Note to Agent</label>
            <Textarea
              placeholder="Add a note, feedback, or instructions for the agent..."
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Attach Deliverable (optional)</label>
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {responseFile ? responseFile.name : "Click to attach the completed file"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={respondMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={respondMutation.isPending}>
            {respondMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Save Response
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail View Dialog ───────────────────────────────────────────────────────

function RequestDetailDialog({
  requestId,
  onClose,
  onRespond,
}: {
  requestId: number | null;
  onClose: () => void;
  onRespond: () => void;
}) {
  const { data, isLoading } = trpc.marketingRequests.getById.useQuery(
    { id: requestId! },
    { enabled: requestId !== null }
  );

  if (!requestId) return null;

  return (
    <Dialog open={requestId !== null} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            <DialogHeader>
              <DialogTitle>{data.request.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge status={data.request.status as Status} />
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[data.request.priority as Priority]}`}
                >
                  {data.request.priority}
                </span>
                <span className="text-xs text-muted-foreground">
                  {REQUEST_TYPE_LABELS[data.request.requestType as RequestType]}
                </span>
                {data.agent?.name && (
                  <span className="text-xs text-muted-foreground">
                    · from {data.agent.name}
                  </span>
                )}
              </div>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {data.request.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm whitespace-pre-wrap">{data.request.description}</p>
                </div>
              )}
              {data.request.dueDate && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Due Date</p>
                  <p className="text-sm">{safeFormatDate(data.request.dueDate, "MMM d, yyyy")}</p>
                </div>
              )}
              {data.attachments.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Agent Attachments</p>
                  <ul className="space-y-1">
                    {data.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        <a
                          href={a.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate"
                        >
                          {a.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(data.request.responseNote || data.request.responseFileUrl) && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2">Current Response</p>
                  {data.request.responseNote && (
                    <p className="text-sm text-green-900 whitespace-pre-wrap mb-2">
                      {data.request.responseNote}
                    </p>
                  )}
                  {data.request.responseFileUrl && (
                    <a
                      href={data.request.responseFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-green-700 hover:text-green-900 font-medium"
                    >
                      <Download className="h-4 w-4" />
                      {data.request.responseFileName ?? "Download Deliverable"}
                    </a>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Submitted {safeFormatET(data.request.createdAt)}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={onRespond}>Respond / Update</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

type StatusFilter = Status | "all" | "active";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "New & In Progress" },
  { value: "all", label: "All Requests" },
  { value: "new", label: "New Only" },
  { value: "in_progress", label: "In Progress Only" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function MarketingAdminPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [viewId, setViewId] = useState<number | null>(null);
  const [respondId, setRespondId] = useState<number | null>(null);
  const [respondStatus, setRespondStatus] = useState<Status>("new");
  const utils = trpc.useUtils();

  const isActiveFilter = statusFilter === "new" || statusFilter === "in_progress" || statusFilter === "all" || statusFilter === "active";

  const { data: rows = [], isLoading } = trpc.marketingRequests.list.useQuery({
    statusFilter:
      statusFilter === "all"
        ? undefined
        : statusFilter === "active"
        ? ["new", "in_progress"]
        : [statusFilter as Status],
    includeCompleted: statusFilter === "completed" || statusFilter === "cancelled" || statusFilter === "all",
  });

  const handleRespondClick = (id: number, status: Status) => {
    setViewId(null);
    setRespondId(id);
    setRespondStatus(status);
  };

  const handleDone = () => {
    utils.marketingRequests.list.invalidate();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Marketing Requests</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage and respond to agent marketing requests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Megaphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No requests found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ request: req, agent }) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {req.title}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {agent?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {REQUEST_TYPE_LABELS[req.requestType as RequestType]}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[req.priority as Priority]}`}
                    >
                      {req.priority}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {req.dueDate
                      ? safeFormatDate(req.dueDate, "MMM d")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={req.status as Status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {safeFormatET(req.createdAt, { month: "short", day: "numeric", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewId(req.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {req.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleRespondClick(req.id, req.status as Status)
                          }
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <RequestDetailDialog
        requestId={viewId}
        onClose={() => setViewId(null)}
        onRespond={() => {
          if (viewId) {
            const row = rows.find((r) => r.request.id === viewId);
            if (row) handleRespondClick(viewId, row.request.status as Status);
          }
        }}
      />

      <RespondDialog
        requestId={respondId}
        currentStatus={respondStatus}
        onClose={() => setRespondId(null)}
        onDone={handleDone}
      />
    </div>
  );
}
