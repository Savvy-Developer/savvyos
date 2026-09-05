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
  Bot,
  CheckCircle2,
  Copy,
  Database,
  KeyRound,
  Laptop,
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

function SetupStep({
  children,
  number,
}: {
  children: React.ReactNode;
  number: number;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
        {number}
      </span>
      <span className="pt-0.5 text-sm leading-6 text-slate-700">
        {children}
      </span>
    </li>
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
  const desktopConfig = useMemo(
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
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700">
          <Database className="h-4 w-4" /> External AI connection
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          SavvyOS MCP Access
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Connect ChatGPT, Claude, and other MCP clients to analyze SavvyOS data
          with secure OAuth sign-in. The connection is permanently read-only.
        </p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="flex gap-3 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <strong>Read-only by design.</strong> Connected AI tools can
            discover SavvyOS tables, inspect non-sensitive schemas, and run
            limited SELECT queries. They cannot create, edit, send, delete, or
            otherwise change a SavvyOS record. Passwords, secrets, tokens,
            session values, and credential-like fields are unavailable.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> Use this server URL
          </CardTitle>
          <CardDescription>
            ChatGPT and Claude use OAuth 2.1 automatically. Do not create or
            paste an API key for either web connector.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CopyField label="Remote MCP server URL" value={endpoint} />
          <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            When the AI client opens the connection, sign in with the SavvyOS
            account for Tyler, Elana, or Dyl and approve the read-only request.
            SavvyOS creates short-lived access tokens and rotates refresh
            tokens; your SavvyOS password is never shared with the AI client.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" /> Add to ChatGPT
            </CardTitle>
            <CardDescription>
              ChatGPT web requires Developer mode and a plan that supports
              custom MCP apps.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              <SetupStep number={1}>
                In ChatGPT web, enable <strong>Developer mode</strong> in
                Settings → Apps → Advanced Settings, if it is not already
                enabled.
              </SetupStep>
              <SetupStep number={2}>
                Open <strong>Apps</strong>, choose <strong>Create</strong>, and
                paste the Remote MCP server URL above.
              </SetupStep>
              <SetupStep number={3}>
                Select <strong>OAuth</strong> for authentication. Leave any
                optional Client ID and Client Secret fields empty so ChatGPT
                registers its secure public client automatically.
              </SetupStep>
              <SetupStep number={4}>
                Click <strong>Scan tools</strong>. The SavvyOS sign-in window
                opens: sign in and select{" "}
                <strong>Allow read-only access</strong>.
              </SetupStep>
              <SetupStep number={5}>
                Create the app, then enable it from the tools menu in a new chat
                and ask it to analyze SavvyOS data.
              </SetupStep>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" /> Add to Claude
            </CardTitle>
            <CardDescription>
              Claude web, Claude Desktop, and Cowork use the same remote OAuth
              connection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              <SetupStep number={1}>
                In Claude, open <strong>Customize → Connectors</strong>. On Team
                or Enterprise, an Owner first adds it in Organization settings →
                Connectors.
              </SetupStep>
              <SetupStep number={2}>
                Choose <strong>Add custom connector</strong>, paste the Remote
                MCP server URL, and leave Advanced OAuth Client ID and Secret
                blank.
              </SetupStep>
              <SetupStep number={3}>
                Add the connector, then click <strong>Connect</strong> beside
                SavvyOS.
              </SetupStep>
              <SetupStep number={4}>
                In the SavvyOS window, sign in and select{" "}
                <strong>Allow read-only access</strong>.
              </SetupStep>
              <SetupStep number={5}>
                Enable SavvyOS from the connector toggle in a conversation and
                ask Claude to inspect or analyze the relevant data.
              </SetupStep>
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card className="border-cyan-200 bg-cyan-50/40">
        <CardContent className="flex gap-3 p-4 text-sm text-cyan-950">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
          <div>
            <strong>Recommended first prompt:</strong> “Use SavvyOS. First
            inspect the relevant tables and schema, then analyze the data needed
            to answer my question. Do not assume anything that the data does not
            show.”
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Laptop className="h-4 w-4" /> Desktop and CLI API keys
            </CardTitle>
            <CardDescription className="mt-1.5">
              Optional only for compatible desktop or command-line clients that
              let you add a custom Authorization header. Do not use these keys
              for the ChatGPT or Claude web setup above.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Create desktop key
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-slate-950 p-3 text-xs leading-5 text-slate-100">
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap">
              {desktopConfig}
            </pre>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void copy(desktopConfig, "Desktop configuration")}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy desktop configuration
          </Button>
          {keysQuery.isLoading ? (
            <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading keys...
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              No desktop or CLI keys have been created.
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
                                  `Revoke the MCP key “${key.name}”? Compatible desktop or CLI clients using it will immediately lose access.`
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
            <DialogTitle>Create desktop or CLI key</DialogTitle>
            <DialogDescription>
              Use only when an MCP client supports a custom Bearer Authorization
              header. ChatGPT and Claude web connectors should use OAuth
              instead.
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
              placeholder="Example: Tyler's local Claude Code"
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
              )}
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
            <DialogTitle>Desktop key created</DialogTitle>
            <DialogDescription>
              Copy this key now. For security, it cannot be viewed again after
              this dialog is closed.
            </DialogDescription>
          </DialogHeader>
          {created && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <strong>Keep this private.</strong> Anyone with this key can
                read SavvyOS data through a compatible MCP client. Revoke it
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
