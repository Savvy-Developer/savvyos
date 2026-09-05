import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Archive, ExternalLink, Link2, Pencil, Plus, Search } from "lucide-react";

type Form = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  affiliateUrl: string;
  commissionTerms: string;
  estimatedEarnings: string;
  notes: string;
  isActive: boolean;
};

const EMPTY: Form = {
  companyName: "", contactName: "", contactEmail: "", contactPhone: "", websiteUrl: "", affiliateUrl: "", commissionTerms: "", estimatedEarnings: "", notes: "", isActive: true,
};

function asForm(link: any): Form {
  return {
    companyName: link.companyName ?? "",
    contactName: link.contactName ?? "",
    contactEmail: link.contactEmail ?? "",
    contactPhone: link.contactPhone ?? "",
    websiteUrl: link.websiteUrl ?? "",
    affiliateUrl: link.affiliateUrl ?? "",
    commissionTerms: link.commissionTerms ?? "",
    estimatedEarnings: link.estimatedEarnings ?? "",
    notes: link.notes ?? "",
    isActive: link.isActive !== false,
  };
}

function payload(form: Form) {
  return {
    ...form,
    contactName: form.contactName.trim() || null,
    contactEmail: form.contactEmail.trim() || null,
    contactPhone: form.contactPhone.trim() || null,
    websiteUrl: form.websiteUrl.trim() || null,
    commissionTerms: form.commissionTerms.trim() || null,
    estimatedEarnings: form.estimatedEarnings.trim() || null,
    notes: form.notes.trim() || null,
    companyName: form.companyName.trim(),
    affiliateUrl: form.affiliateUrl.trim(),
  };
}

export default function AffiliateLinksPage() {
  const utils = trpc.useUtils();
  const { data: links = [], isLoading } = trpc.affiliateLinks.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [query, setQuery] = useState("");
  const create = trpc.affiliateLinks.create.useMutation({
    onSuccess: async () => { await utils.affiliateLinks.list.invalidate(); setDialogOpen(false); toast.success("Affiliate link added."); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.affiliateLinks.update.useMutation({
    onSuccess: async () => { await utils.affiliateLinks.list.invalidate(); setDialogOpen(false); toast.success("Affiliate link updated."); },
    onError: error => toast.error(error.message),
  });
  const archive = trpc.affiliateLinks.archive.useMutation({
    onSuccess: async () => { await utils.affiliateLinks.list.invalidate(); toast.success("Affiliate link archived."); },
    onError: error => toast.error(error.message),
  });
  const filtered = useMemo(() => (links as any[]).filter(link => {
    const haystack = [link.companyName, link.contactName, link.contactEmail, link.notes].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [links, query]);

  function openCreate() { setEditing(null); setForm(EMPTY); setDialogOpen(true); }
  function openEdit(link: any) { setEditing(link); setForm(asForm(link)); setDialogOpen(true); }
  function save() {
    if (!form.companyName.trim()) return toast.error("Company name is required.");
    if (!form.affiliateUrl.trim()) return toast.error("Affiliate link is required.");
    if (editing) update.mutate({ id: editing.id, ...payload(form) });
    else create.mutate(payload(form));
  }
  const saving = create.isPending || update.isPending;

  return <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Link2 className="h-6 w-6 text-primary" />Affiliate Links</h1>
        <p className="mt-1 text-sm text-muted-foreground">Private storage for partner contacts, affiliate URLs, commission terms, and relationship notes.</p>
      </div>
      <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add affiliate link</Button>
    </div>

    <Card>
      <CardContent className="p-4">
        <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} className="pl-9" placeholder="Search company, contact, or notes…" /></div>
      </CardContent>
    </Card>

    {isLoading ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading affiliate links…</CardContent></Card> : filtered.length ? <div className="grid gap-4 md:grid-cols-2">{filtered.map((link: any) => <Card key={link.id} className={!link.isActive ? "opacity-70" : ""}>
      <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-lg">{link.companyName}</CardTitle><CardDescription className="mt-1">{link.contactName || link.contactEmail || "No contact recorded"}</CardDescription></div><Badge variant={link.isActive ? "default" : "secondary"}>{link.isActive ? "Active" : "Archived"}</Badge></div></CardHeader>
      <CardContent className="space-y-3 text-sm"><div className="grid gap-2 text-muted-foreground sm:grid-cols-2">{link.contactEmail && <p className="truncate">{link.contactEmail}</p>}{link.contactPhone && <p>{link.contactPhone}</p>}{link.estimatedEarnings && <p><span className="font-medium text-foreground">Earnings:</span> {link.estimatedEarnings}</p>}</div>
      {link.commissionTerms && <div className="rounded-md bg-muted/40 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commission terms</p><p className="mt-1 whitespace-pre-wrap">{link.commissionTerms}</p></div>}
      {link.notes && <p className="whitespace-pre-wrap text-muted-foreground">{link.notes}</p>}
      <div className="flex flex-wrap gap-2 border-t pt-3"><Button variant="outline" size="sm" asChild><a href={link.affiliateUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open affiliate link</a></Button>{link.websiteUrl && <Button variant="ghost" size="sm" asChild><a href={link.websiteUrl} target="_blank" rel="noreferrer">Website</a></Button>}<Button variant="ghost" size="sm" onClick={() => openEdit(link)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>{link.isActive && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => archive.mutate({ id: link.id })} disabled={archive.isPending}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button>}</div></CardContent>
    </Card>)}</div> : <Card><CardContent className="py-16 text-center"><Link2 className="mx-auto mb-3 h-10 w-10 text-primary/30" /><p className="font-medium">No affiliate links found</p><p className="mt-1 text-sm text-muted-foreground">Add partner links here so the team can find current terms and relationship details.</p></CardContent></Card>}

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Edit affiliate link" : "Add affiliate link"}</DialogTitle><DialogDescription>Keep these details internal. An affiliate URL is required; commission and earnings can be recorded in the format supplied by the partner.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-4 sm:grid-cols-2"><div><Label>Company <span className="text-destructive">*</span></Label><Input className="mt-1" value={form.companyName} onChange={event => setForm(current => ({ ...current, companyName: event.target.value }))} /></div><div><Label>Website</Label><Input className="mt-1" type="url" placeholder="https://…" value={form.websiteUrl} onChange={event => setForm(current => ({ ...current, websiteUrl: event.target.value }))} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Contact name</Label><Input className="mt-1" value={form.contactName} onChange={event => setForm(current => ({ ...current, contactName: event.target.value }))} /></div><div><Label>Contact email</Label><Input className="mt-1" type="email" value={form.contactEmail} onChange={event => setForm(current => ({ ...current, contactEmail: event.target.value }))} /></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Contact phone</Label><Input className="mt-1" value={form.contactPhone} onChange={event => setForm(current => ({ ...current, contactPhone: event.target.value }))} /></div><div><Label>Estimated earnings</Label><Input className="mt-1" placeholder="e.g. $50 per signup" value={form.estimatedEarnings} onChange={event => setForm(current => ({ ...current, estimatedEarnings: event.target.value }))} /></div></div><div><Label>Affiliate link <span className="text-destructive">*</span></Label><Input className="mt-1" type="url" placeholder="https://…" value={form.affiliateUrl} onChange={event => setForm(current => ({ ...current, affiliateUrl: event.target.value }))} /></div><div><Label>Commission terms</Label><Textarea className="mt-1" rows={3} value={form.commissionTerms} onChange={event => setForm(current => ({ ...current, commissionTerms: event.target.value }))} placeholder="Percentage, payout timing, restrictions, attribution rules…" /></div><div><Label>Internal notes</Label><Textarea className="mt-1" rows={4} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Relationship owner, renewal date, negotiation notes, etc." /></div><label className="flex items-center justify-between rounded-md border p-3"><span><span className="block text-sm font-medium">Active relationship</span><span className="text-xs text-muted-foreground">Keep archived links for reference without presenting them as current.</span></span><Switch checked={form.isActive} onCheckedChange={isActive => setForm(current => ({ ...current, isActive }))} /></label></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add affiliate link"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
