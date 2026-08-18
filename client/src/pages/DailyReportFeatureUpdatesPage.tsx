import { trpc } from "@/lib/trpc";
import { Edit3, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type FeatureUpdate = {
  id: number;
  title: string;
  summary: string;
  details: string | null;
  actionUrl: string | null;
  isAgentFacing: boolean;
  isPublished: boolean;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdByName: string | null;
};

type FormState = {
  title: string;
  summary: string;
  details: string;
  actionUrl: string;
  isAgentFacing: boolean;
  isPublished: boolean;
};

const emptyForm: FormState = { title: "", summary: "", details: "", actionUrl: "/daily-report", isAgentFacing: true, isPublished: false };

function formatDate(value: Date | string | null): string {
  if (!value) return "Not published";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not published" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(date);
}

export default function DailyReportFeatureUpdatesPage() {
  const listQuery = trpc.dailyReport.adminListFeatureUpdates.useQuery();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeatureUpdate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const saveMutation = trpc.dailyReport.createFeatureUpdate.useMutation({
    onSuccess: async () => { await utils.dailyReport.adminListFeatureUpdates.invalidate(); setDialogOpen(false); },
  });
  const updateMutation = trpc.dailyReport.updateFeatureUpdate.useMutation({
    onSuccess: async () => { await utils.dailyReport.adminListFeatureUpdates.invalidate(); setDialogOpen(false); },
  });
  const deleteMutation = trpc.dailyReport.deleteFeatureUpdate.useMutation({
    onSuccess: () => utils.dailyReport.adminListFeatureUpdates.invalidate(),
  });

  const isSaving = saveMutation.isPending || updateMutation.isPending;
  const errorMessage = saveMutation.error?.message || updateMutation.error?.message || deleteMutation.error?.message;
  const updates = useMemo(() => (listQuery.data ?? []) as FeatureUpdate[], [listQuery.data]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(update: FeatureUpdate) {
    setEditing(update);
    setForm({
      title: update.title,
      summary: update.summary,
      details: update.details ?? "",
      actionUrl: update.actionUrl ?? "",
      isAgentFacing: update.isAgentFacing,
      isPublished: update.isPublished,
    });
    setDialogOpen(true);
  }

  function save() {
    const data = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      details: form.details.trim() || null,
      actionUrl: form.actionUrl.trim() || null,
      isAgentFacing: form.isAgentFacing,
      isPublished: form.isPublished,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else saveMutation.mutate(data);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700"><Send className="h-4 w-4" /> Daily Report content</div>
          <h1 className="text-3xl font-bold tracking-tight">SavvyOS Feature Updates</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Publish a concise, agent-facing explanation whenever SavvyOS changes. Published updates appear in the live Daily Report and in daily agent emails for 30 days.</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New update</Button>
      </div>

      <Card className="border-cyan-100 bg-cyan-50/40">
        <CardContent className="p-4 text-sm leading-relaxed text-cyan-950"><strong>How the automated section works.</strong> The report only includes updates marked both <em>published</em> and <em>agent-facing</em>. Use a direct SavvyOS path such as <code className="rounded bg-white/80 px-1 py-0.5">/pipeline</code> so agents can open the improved workflow straight from the email.</CardContent>
      </Card>

      {listQuery.isLoading ? <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-3">
          {updates.length === 0 ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No feature updates have been created yet.</CardContent></Card> : updates.map((update) => (
            <Card key={update.id} className={!update.isPublished ? "opacity-75" : undefined}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold">{update.title}</h2><Badge variant={update.isPublished ? "default" : "secondary"}>{update.isPublished ? "Published" : "Draft"}</Badge>{!update.isAgentFacing && <Badge variant="outline">Internal only</Badge>}</div>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{update.summary}</p>
                  {update.details && <p className="mt-2 max-w-3xl whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{update.details}</p>}
                  <div className="mt-3 text-xs text-muted-foreground">{update.isPublished ? `Published ${formatDate(update.publishedAt)}` : "Not published"}{update.createdByName ? ` · Created by ${update.createdByName}` : ""}{update.actionUrl ? ` · ${update.actionUrl}` : ""}</div>
                </div>
                <div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => openEdit(update)}><Edit3 className="mr-1.5 h-3.5 w-3.5" /> Edit</Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Delete “${update.title}”?`)) deleteMutation.mutate({ id: update.id }); }} aria-label={`Delete ${update.title}`}><Trash2 className="h-4 w-4" /></Button></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit feature update" : "New feature update"}</DialogTitle><DialogDescription>Write for agents: what changed, why it matters, and where to use it.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="feature-title">Title</Label><Input id="feature-title" value={form.title} maxLength={255} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Example: Hot Leads now includes email engagement" /></div>
            <div className="space-y-2"><Label htmlFor="feature-summary">Agent-facing summary</Label><Textarea id="feature-summary" value={form.summary} maxLength={1500} onChange={(event) => setForm({ ...form, summary: event.target.value })} placeholder="Describe the improvement and its practical benefit in one or two sentences." rows={3} /></div>
            <div className="space-y-2"><Label htmlFor="feature-details">Optional details</Label><Textarea id="feature-details" value={form.details} maxLength={6000} onChange={(event) => setForm({ ...form, details: event.target.value })} placeholder="Add short usage tips or limitations when they help agents use the feature." rows={4} /></div>
            <div className="space-y-2"><Label htmlFor="feature-path">SavvyOS action path</Label><Input id="feature-path" value={form.actionUrl} maxLength={512} onChange={(event) => setForm({ ...form, actionUrl: event.target.value })} placeholder="/pipeline" /><p className="text-xs text-muted-foreground">Use a path inside SavvyOS, such as /pipeline, /tasks, or /daily-report.</p></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor="feature-agent-facing">Include for agents</Label><p className="mt-0.5 text-xs text-muted-foreground">Only agent-facing updates are included in their report.</p></div><Switch id="feature-agent-facing" checked={form.isAgentFacing} onCheckedChange={(checked) => setForm({ ...form, isAgentFacing: checked })} /></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor="feature-published">Publish now</Label><p className="mt-0.5 text-xs text-muted-foreground">Published entries start appearing immediately and remain in reports for 30 days.</p></div><Switch id="feature-published" checked={form.isPublished} onCheckedChange={(checked) => setForm({ ...form, isPublished: checked })} /></div>
            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button><Button onClick={save} disabled={isSaving || form.title.trim().length < 3 || form.summary.trim().length < 10}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Create update"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
