import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Copy,
  Database,
  KeyRound,
  Loader2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const ALLOWED_EMAILS = new Set([
  "tyler@savvy.realty",
  "elana@savvy.realty",
  "dyl@savvy.realty",
]);

function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date);
}

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Unable to copy ${label.toLowerCase()}`);
  }
}

function CopyField({
  label,
  value,
  secret = false,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [shown, setShown] = useState(!secret);
  const displayed =
    secret && !shown ? "•".repeat(Math.min(value.length, 48)) : value;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input value={displayed} readOnly className="font-mono text-xs" />
        {secret && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShown(current => !current)}
          >
            {shown ? "Hide" : "Show"}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void copy(value, label)}
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function McpAccessPage() {
  const { user } = useAuth();
  const email = (user as any)?.email?.toLowerCase?.() ?? "";
  const allowed = ALLOWED_EMAILS.has(email);
  const utils = trpc.useUtils();
  const infoQuery = trpc.mcpAccess.connectionInfo.useQuery(undefined, {
    enabled: allowed,
  });
  const keysQuery = trpc.mcpAccess.listKeys.useQuery(undefined, {
    enabled: allowed,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{
    secret: string;
    endpoint: string;
    keyPrefix: string;
    name: string;
  } | null>(null);
  const createMutation = trpc.mcpAccess.createKey.useMutation({
    onSuccess: async result => {
      setCreated({ ...result, name: name.trim() });
      setName("");
      setCreateOpen(false);
      await utils.mcpAccess.listKeys.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const revokeMutation = trpc.mcpAccess.revokeKey.useMutation({
    onSuccess: async () => {
      toast.success("MCP key revoked. It can no longer access SavvyOS.");
      await utils.mcpAccess.listKeys.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const endpoint =
    infoQuery.data?.endpoint ?? "https://os.savvy-agents.com/api/mcp";
  const exampleConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            savvyos: {
              url: endpoint,
              headers: { Authorization: "Bearer YOUR_SAVVYOS_MCP_KEY" },
            },
          },
        },
        null,
        2
      ),
    [endpoint]
  );

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[45vh] max-w-xl items-center justify-center">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Access restricted</CardTitle>
            <CardDescription>
              SavvyOS MCP access is available only to Tyler, Elana, and Dyl.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const keys = (keysQuery.data ?? []) as any[];
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700">
            <Database className="h-4 w-4" /> External AI connection
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            SavvyOS MCP Access
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Create separate, revocable keys for AI clients to read and analyze
            SavvyOS data. The connection is strictly read-only.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create MCP key
        </Button>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex gap-3 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <strong>Read-only by design.</strong> Connected AI tools can
            discover SavvyOS tables, inspect non-sensitive schemas, and run
            limited SELECT queries. They cannot create, edit, send, delete, or
            otherwise change any SavvyOS record. Passwords, secrets, tokens,
            session values, and credential-like fields are redacted from every
            response.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> Connection details
            </CardTitle>
            <CardDescription>
              Use the endpoint and bearer key in an MCP-compatible AI client.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CopyField label="MCP endpoint" value={endpoint} />
            <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              <strong className="text-foreground">Recommended workflow:</strong>{" "}
              Ask the connected AI to inspect the relevant schema first, then
              use the read tools to investigate your question. Each data query
              is capped and must include a LIMIT.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LockKeyhole className="h-4 w-4" /> MCP client example
            </CardTitle>
            <CardDescription>
              Paste this into a compatible client, replacing the placeholder
              with a newly created key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-56 overflow-auto rounded-lg border bg-slate-950 p-3 text-xs leading-5 text-slate-100">
              {exampleConfig}
            </pre>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void copy(exampleConfig, "Example configuration")}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy configuration
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MCP keys</CardTitle>
          <CardDescription>
            Create one key per AI client or teammate. The actual secret is shown
            only once when a key is created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keysQuery.isLoading ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading keys...
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              No MCP keys have been created.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Key identifier</th>
                    <th className="p-3 font-medium">Created</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {keys.map(key => (
                    <tr key={key.id}>
                      <td className="p-3 font-medium">{key.name}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">
                        {key.keyPrefix}…
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {formatTime(key.createdAt)}
                        {key.createdBy?.name ? ` · ${key.createdBy.name}` : ""}
                      </td>
                      <td className="p-3">
                        {key.revokedAt ? (
                          <Badge variant="secondary">
                            Revoked {formatTime(key.revokedAt)}
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            Active
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {!key.revokedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={revokeMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Revoke the MCP key “${key.name}”? Connected AI clients using it will immediately lose access.`
                                )
                              )
                                revokeMutation.mutate({ id: key.id });
                            }}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create MCP key</DialogTitle>
            <DialogDescription>
              Name the AI client or purpose so the key can be identified and
              revoked later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="mcp-key-name">Key name</Label>
            <Input
              id="mcp-key-name"
              autoFocus
              value={name}
              onChange={event => setName(event.target.value)}
              maxLength={255}
              placeholder="Example: Tyler's Claude Desktop"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate({ name: name.trim() })}
              disabled={createMutation.isPending || name.trim().length < 3}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}{" "}
              Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!created}
        onOpenChange={open => {
          if (!open) setCreated(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>MCP key created</DialogTitle>
            <DialogDescription>
              Copy this key now. For security, it cannot be viewed again after
              this dialog is closed.
            </DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <strong>Keep this private.</strong> Anyone with this key can
                read SavvyOS data through the MCP endpoint. Revoke it
                immediately if it is shared accidentally.
              </div>
              <CopyField label={created.name} value={created.secret} secret />
              <CopyField label="MCP endpoint" value={created.endpoint} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>I copied this key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
