import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Paperclip,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Image,
  Film,
  FileText,
  Megaphone,
  Layers,
  HelpCircle,
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

const REQUEST_TYPE_ICONS: Record<RequestType, React.ReactNode> = {
  graphic: <Layers className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
  slideshow: <Layers className="h-4 w-4" />,
  video: <Film className="h-4 w-4" />,
  flyer: <FileText className="h-4 w-4" />,
  social_post: <Megaphone className="h-4 w-4" />,
  other: <HelpCircle className="h-4 w-4" />,
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
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

// ─── New Request Dialog ───────────────────────────────────────────────────────

function NewRequestDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    requestType: "graphic" as RequestType,
    priority: "normal" as Priority,
    dueDate: "",
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const createMutation = trpc.marketingRequests.create.useMutation();
  const uploadMutation = trpc.marketingRequests.uploadAttachment.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      const { id } = await createMutation.mutateAsync({
        title: form.title,
        description: form.description || undefined,
        requestType: form.requestType,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
      });

      // Upload any attached files
      for (const file of pendingFiles) {
        const base64 = await fileToBase64(file);
        await uploadMutation.mutateAsync({
          requestId: id,
          fileName: file.name,
          mimeType: file.type,
          base64Data: base64,
        });
      }

      toast.success("Request submitted!");
      onCreated(id);
      onClose();
      setForm({
        title: "",
        description: "",
        requestType: "graphic",
        priority: "normal",
        dueDate: "",
      });
      setPendingFiles([]);
    } catch {
      toast.error("Failed to submit request");
    }
  };

  const isLoading = createMutation.isPending || uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Marketing Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Title *</label>
            <Input
              placeholder="e.g. Listing graphic for 123 Main St"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Type</label>
              <Select
                value={form.requestType}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, requestType: v as RequestType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {REQUEST_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Priority</label>
              <Select
                value={form.priority}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, priority: v as Priority }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Due Date (optional)</label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <Textarea
              placeholder="Describe what you need — dimensions, colors, text, style, etc."
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">
              Attachments (optional)
            </label>
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to attach photos, logos, or reference files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {pendingFiles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {pendingFiles.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      className="text-muted-foreground hover:text-destructive ml-2"
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Request Detail Dialog ────────────────────────────────────────────────────

function RequestDetailDialog({
  requestId,
  onClose,
}: {
  requestId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.marketingRequests.getById.useQuery(
    { id: requestId! },
    { enabled: requestId !== null }
  );
  const cancelMutation = trpc.marketingRequests.cancel.useMutation();
  const utils = trpc.useUtils();

  const handleCancel = async () => {
    if (!requestId) return;
    try {
      await cancelMutation.mutateAsync({ id: requestId });
      toast.success("Request cancelled");
      utils.marketingRequests.list.invalidate();
      onClose();
    } catch {
      toast.error("Failed to cancel request");
    }
  };

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
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <DialogTitle className="text-lg">{data.request.title}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={data.request.status as Status} />
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[data.request.priority as Priority]}`}
                    >
                      {PRIORITY_LABELS[data.request.priority as Priority]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {REQUEST_TYPE_LABELS[data.request.requestType as RequestType]}
                    </span>
                  </div>
                </div>
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
                  <p className="text-sm font-medium text-muted-foreground mb-2">Your Attachments</p>
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
              {/* Marketing team response */}
              {(data.request.responseNote || data.request.responseFileUrl) && (
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Marketing Team Response
                  </p>
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
              {data.request.status !== "completed" &&
                data.request.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                  >
                    Cancel Request
                  </Button>
                )}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

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

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  row,
  onClick,
}: {
  row: { request: any; agent: any };
  onClick: () => void;
}) {
  const req = row.request;
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 text-muted-foreground shrink-0">
              {REQUEST_TYPE_ICONS[req.requestType as RequestType]}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{req.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {REQUEST_TYPE_LABELS[req.requestType as RequestType]} ·{" "}
                {safeFormatET(req.createdAt, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[req.priority as Priority]}`}
            >
              {PRIORITY_LABELS[req.priority as Priority]}
            </span>
            <StatusBadge status={req.status as Status} />
          </div>
        </div>
        {req.responseFileUrl && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-green-700 font-medium">
            <Download className="h-3.5 w-3.5" />
            Deliverable ready — click to download
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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

export default function MarketingRequestsPage() {
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<"active" | "completed">("active");
  const utils = trpc.useUtils();

  const activeQuery = trpc.marketingRequests.list.useQuery({
    includeCompleted: false,
  });

  const completedQuery = trpc.marketingRequests.list.useQuery({
    statusFilter: ["completed", "cancelled"],
    includeCompleted: true,
  });

  const activeRequests = activeQuery.data ?? [];
  const completedRequests = completedQuery.data ?? [];

  const handleCreated = () => {
    utils.marketingRequests.list.invalidate();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Marketing Requests</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Submit requests for graphics, images, slideshows, videos, and more
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "completed")}>
        <TabsList className="mb-4">
          <TabsTrigger value="active">
            Active
            {activeRequests.length > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5">
                {activeRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Megaphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No active requests</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Click "New Request" to submit your first marketing request
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeRequests.map((row) => (
                <RequestCard
                  key={row.request.id}
                  row={row}
                  onClick={() => setSelectedId(row.request.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {completedQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : completedRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No completed requests yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {completedRequests.map((row) => (
                <RequestCard
                  key={row.request.id}
                  row={row}
                  onClick={() => setSelectedId(row.request.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <NewRequestDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={handleCreated}
      />
      <RequestDetailDialog
        requestId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
