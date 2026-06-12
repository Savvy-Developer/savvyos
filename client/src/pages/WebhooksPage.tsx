import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Webhook, Plus, Copy, Eye, EyeOff, RefreshCw, Trash2, CheckCircle2,
  XCircle, AlertCircle, Clock, Activity, ExternalLink, ChevronRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HANDLER_LABELS: Record<string, string> = {
  lead_ingest: "Lead Ingest",
  contact_create: "Contact Create",
  contact_update: "Contact Update",
  custom: "Custom (Log Only)",
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  success: { label: "Success", color: "text-green-600", Icon: CheckCircle2 },
  auth_failed: { label: "Auth Failed", color: "text-red-600", Icon: XCircle },
  validation_error: { label: "Validation Error", color: "text-yellow-600", Icon: AlertCircle },
  handler_error: { label: "Handler Error", color: "text-red-600", Icon: XCircle },
  not_found: { label: "Not Found", color: "text-gray-500", Icon: AlertCircle },
};

function copyToClipboard(text: string, label = "Copied") {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied to clipboard`));
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

// ─── Create Endpoint Dialog ───────────────────────────────────────────────────

function CreateEndpointDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [handlerType, setHandlerType] = useState<string>("lead_ingest");
  const [genSecret, setGenSecret] = useState(true);
  const [sigHeader, setSigHeader] = useState("x-savvy-signature");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const utils = trpc.useUtils();
  const create = trpc.webhooks.createEndpoint.useMutation({
    onSuccess: (data) => {
      setCreatedSecret(data.secret);
      setCreatedSlug(data.slug);
      utils.webhooks.listEndpoints.invalidate();
      utils.webhooks.stats.invalidate();
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    create.mutate({
      name: name.trim(),
      handlerType: handlerType as any,
      generateSecret: genSecret,
      signatureHeader: sigHeader,
    });
  }

  function handleClose() {
    setName(""); setHandlerType("lead_ingest"); setGenSecret(true);
    setSigHeader("x-savvy-signature"); setCreatedSecret(null); setCreatedSlug(null);
    setShowSecret(false);
    onClose();
  }

  const endpointUrl = createdSlug
    ? `${window.location.origin}/api/inbound/${createdSlug}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {createdSlug ? "Endpoint Created" : "Create Webhook Endpoint"}
          </DialogTitle>
        </DialogHeader>

        {!createdSlug ? (
          <div className="space-y-4">
            <div>
              <Label>Endpoint Name *</Label>
              <Input
                placeholder="e.g. Zapier Lead Form"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Handler Type</Label>
              <Select value={handlerType} onValueChange={setHandlerType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(HANDLER_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {handlerType === "lead_ingest" && "Creates or updates a contact and assigns a lead source."}
                {handlerType === "contact_create" && "Creates a new contact from the payload."}
                {handlerType === "contact_update" && "Updates an existing contact matched by email/phone."}
                {handlerType === "custom" && "Logs the payload without creating any records."}
              </p>
            </div>
            <div>
              <Label>Signature Header</Label>
              <Input
                placeholder="x-savvy-signature"
                value={sigHeader}
                onChange={(e) => setSigHeader(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Header name that carries the HMAC-SHA256 signature from the sender.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="genSecret"
                checked={genSecret}
                onChange={(e) => setGenSecret(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="genSecret" className="cursor-pointer">
                Generate HMAC secret (recommended)
              </Label>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
              <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
                Endpoint created successfully!
              </p>
              <p className="text-xs text-green-700 dark:text-green-400">
                Copy the details below — the secret will not be shown again.
              </p>
            </div>

            <div>
              <Label>Webhook URL</Label>
              <div className="flex gap-2 mt-1">
                <Input value={endpointUrl || ""} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(endpointUrl || "", "URL")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {createdSecret && (
              <div>
                <Label>HMAC Secret (save this now)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={showSecret ? createdSecret : "•".repeat(32)}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdSecret, "Secret")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Use this secret to sign requests with HMAC-SHA256.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-muted p-3 text-xs font-mono space-y-1">
              <p className="text-muted-foreground font-sans text-xs font-medium mb-2">
                Example curl test:
              </p>
              <p className="break-all">
                {`curl -X POST "${endpointUrl}" \\`}
              </p>
              <p>{`  -H "Content-Type: application/json" \\`}</p>
              <p>{`  -d '{"first_name":"Jane","last_name":"Doe","email":"jane@example.com"}'`}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!createdSlug ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create Endpoint"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Log Detail Dialog ────────────────────────────────────────────────────────

function LogDetailDialog({
  logId, open, onClose,
}: { logId: number | null; open: boolean; onClose: () => void }) {
  const { data: log } = trpc.webhooks.getLog.useQuery(
    { id: logId! },
    { enabled: !!logId }
  );

  const cfg = log ? OUTCOME_CONFIG[log.outcome] : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhook Log #{logId}</DialogTitle>
        </DialogHeader>
        {log && cfg && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Outcome</p>
                <div className={`flex items-center gap-1 font-medium ${cfg.color}`}>
                  <cfg.Icon className="h-4 w-4" />
                  {cfg.label}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Status Code</p>
                <p className="font-mono font-medium">{log.statusCode}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Slug</p>
                <p className="font-mono">{log.slug}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Source IP</p>
                <p className="font-mono">{log.sourceIp || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Received</p>
                <p>{formatDate(log.createdAt)}</p>
              </div>
              {log.contactId && (
                <div>
                  <p className="text-muted-foreground text-xs">Contact ID</p>
                  <p className="font-mono">#{log.contactId}</p>
                </div>
              )}
            </div>

            {log.errorMessage && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Error</p>
                <p className="text-sm text-red-800 dark:text-red-300">{log.errorMessage}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Request Payload</p>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(log.requestPayload, null, 2)}
              </pre>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Response Body</p>
              <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(log.responseBody, null, 2)}
              </pre>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [logDetailId, setLogDetailId] = useState<number | null>(null);
  const [logPage, setLogPage] = useState(1);
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [endpointFilter, setEndpointFilter] = useState<string>("all");

  const utils = trpc.useUtils();

  const { data: stats } = trpc.webhooks.stats.useQuery();
  const { data: endpoints, refetch: refetchEndpoints } = trpc.webhooks.listEndpoints.useQuery({ page: 1, limit: 100 });
  const { data: logs, refetch: refetchLogs } = trpc.webhooks.listLogs.useQuery({
    page: logPage,
    limit: 50,
    outcome: outcomeFilter !== "all" ? (outcomeFilter as any) : undefined,
    endpointId: endpointFilter !== "all" ? parseInt(endpointFilter) : undefined,
  });

  const deleteEndpoint = trpc.webhooks.deleteEndpoint.useMutation({
    onSuccess: () => {
      toast.success("Endpoint deleted");
      refetchEndpoints();
      utils.webhooks.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = trpc.webhooks.updateEndpoint.useMutation({
    onSuccess: () => { refetchEndpoints(); toast.success("Endpoint updated"); },
    onError: (e) => toast.error(e.message),
  });

  const rotateSecret = trpc.webhooks.updateEndpoint.useMutation({
    onSuccess: (data) => {
      if (data.newSecret) {
        toast.success("New secret generated — copy it now!", { duration: 8000 });
        copyToClipboard(data.newSecret, "New secret");
      }
      refetchEndpoints();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6" />
            Webhooks
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Receive data from Zapier, Make, or any external source via HTTP POST.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Endpoint
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Endpoints", value: stats?.endpoints ?? 0, Icon: Webhook },
          { label: "Total Requests", value: stats?.total ?? 0, Icon: Activity },
          { label: "Successful", value: stats?.success ?? 0, Icon: CheckCircle2 },
          { label: "Failed", value: stats?.failed ?? 0, Icon: XCircle },
        ].map(({ label, value, Icon }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold mt-1">{value}</p>
                </div>
                <Icon className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="endpoints">
        <TabsList>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="logs">Request Logs</TabsTrigger>
          <TabsTrigger value="docs">Integration Guide</TabsTrigger>
        </TabsList>

        {/* ── Endpoints Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="endpoints" className="mt-4">
          {!endpoints?.rows.length ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Webhook className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">No webhook endpoints yet.</p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Endpoint
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {endpoints.rows.map((ep) => {
                const url = `${window.location.origin}/api/inbound/${ep.slug}`;
                return (
                  <Card key={ep.id} className={ep.isActive ? "" : "opacity-60"}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{ep.name}</span>
                            <Badge variant={ep.isActive ? "default" : "secondary"} className="text-xs">
                              {ep.isActive ? "Active" : "Inactive"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {HANDLER_LABELS[ep.handlerType] || ep.handlerType}
                            </Badge>
                            {ep.hasSecret && (
                              <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                                HMAC Secured
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-muted-foreground truncate max-w-md">
                              {url}
                            </code>
                            <button
                              onClick={() => copyToClipboard(url, "URL")}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Created {formatDate(ep.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleActive.mutate({ id: ep.id, isActive: !ep.isActive })}
                          >
                            {ep.isActive ? "Disable" : "Enable"}
                          </Button>
                          {ep.hasSecret && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm("Rotate the HMAC secret? The new secret will be copied to clipboard.")) {
                                  rotateSecret.mutate({ id: ep.id, rotateSecret: true });
                                }
                              }}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Rotate Secret
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Delete endpoint "${ep.name}"? This cannot be undone.`)) {
                                deleteEndpoint.mutate({ id: ep.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Logs Tab ──────────────────────────────────────────────────────── */}
        <TabsContent value="logs" className="mt-4">
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <Select value={outcomeFilter} onValueChange={(v) => { setOutcomeFilter(v); setLogPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                {Object.entries(OUTCOME_CONFIG).map(([v, c]) => (
                  <SelectItem key={v} value={v}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={endpointFilter} onValueChange={(v) => { setEndpointFilter(v); setLogPage(1); }}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All endpoints" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Endpoints</SelectItem>
                {endpoints?.rows.map((ep) => (
                  <SelectItem key={ep.id} value={String(ep.id)}>{ep.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetchLogs()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source IP</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!logs?.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      No webhook requests yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.rows.map((log) => {
                    const cfg = OUTCOME_CONFIG[log.outcome];
                    return (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setLogDetailId(log.id)}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.slug}</TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1 text-sm ${cfg.color}`}>
                            <cfg.Icon className="h-4 w-4" />
                            {cfg.label}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-mono text-xs ${
                              log.statusCode < 300
                                ? "border-green-300 text-green-700"
                                : log.statusCode < 500
                                ? "border-yellow-300 text-yellow-700"
                                : "border-red-300 text-red-700"
                            }`}
                          >
                            {log.statusCode}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.contactId ? `#${log.contactId}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.sourceIp || "—"}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          {logs && logs.total > 50 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(logPage - 1) * 50 + 1}–{Math.min(logPage * 50, logs.total)} of {logs.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage === 1}
                  onClick={() => setLogPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={logPage * 50 >= logs.total}
                  onClick={() => setLogPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Integration Guide Tab ─────────────────────────────────────────── */}
        <TabsContent value="docs" className="mt-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Supported Field Names</CardTitle>
                <CardDescription>
                  Send any of these field names in your JSON payload — they will be automatically
                  mapped to the correct contact fields.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Incoming Field</TableHead>
                      <TableHead>Maps To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      ["first_name / fname", "First Name"],
                      ["last_name / lname", "Last Name"],
                      ["name / full_name", "Full Name (auto-split)"],
                      ["email / email_address", "Email"],
                      ["phone / mobile / cell", "Phone"],
                      ["secondary_email / email2", "Secondary Email"],
                      ["secondary_phone / phone2", "Secondary Phone"],
                      ["address / street", "Address"],
                      ["city", "City"],
                      ["state / province", "State"],
                      ["zip / postal_code", "Zip"],
                      ["lead_source / source", "Lead Source (by name)"],
                      ["lead_source_id", "Lead Source (by ID)"],
                      ["notes / message", "Notes"],
                      ["agent_id / agent_email", "Assign to Agent"],
                    ].map(([field, maps]) => (
                      <TableRow key={field}>
                        <TableCell className="font-mono text-xs">{field}</TableCell>
                        <TableCell className="text-sm">{maps}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Zapier Setup</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>1. Create a new Zap with your trigger (e.g. "New Form Submission").</p>
                  <p>2. Add a <strong>Webhooks by Zapier</strong> action → <strong>POST</strong>.</p>
                  <p>3. Set the URL to your endpoint URL.</p>
                  <p>4. Set <strong>Payload Type</strong> to <code>json</code>.</p>
                  <p>5. Map your form fields to the supported field names above.</p>
                  <p>6. If using HMAC, add the signature header with the computed value.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">HMAC Signature</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>Compute the signature as:</p>
                  <pre className="rounded bg-muted p-2 text-xs overflow-x-auto">
{`HMAC-SHA256(secret, rawRequestBody)
→ hex string
→ send as header: x-savvy-signature: <hex>
   or: x-savvy-signature: sha256=<hex>`}
                  </pre>
                  <p className="text-muted-foreground text-xs">
                    Requests with an invalid or missing signature will be rejected with HTTP 401.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Response Format</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <pre className="rounded bg-muted p-2 text-xs overflow-x-auto">
{`// Success
{ "ok": true, "contactId": 42, "action": "created" }

// Error
{ "ok": false, "error": "first_name is required" }`}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CreateEndpointDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {}}
      />
      <LogDetailDialog
        logId={logDetailId}
        open={!!logDetailId}
        onClose={() => setLogDetailId(null)}
      />
    </div>
  );
}
