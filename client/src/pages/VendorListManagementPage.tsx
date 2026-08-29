import { trpc } from "@/lib/trpc";
import { formatPhone } from "@/lib/inputFormatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  HelpCircle,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Settings2,
  Star,
  Trash2,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

type Vendor = {
  id: number;
  vendorCategoryId: number;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  serviceArea: string | null;
  description: string | null;
  isFeatured: boolean;
  isVisible: boolean;
};

type VendorCategory = {
  id: number;
  name: string;
  description: string | null;
  isVisible: boolean;
  vendors: Vendor[];
};

type VendorList = {
  id: number;
  agentId: number;
  agentName?: string | null;
  displayName: string;
  headline: string | null;
  intro: string | null;
  publicSlug: string;
  isPublished: boolean;
  categories: VendorCategory[];
};

type CategoryForm = { name: string; description: string; isVisible: boolean };
type VendorForm = {
  vendorCategoryId: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  serviceArea: string;
  description: string;
  isFeatured: boolean;
  isVisible: boolean;
};

const emptyCategoryForm: CategoryForm = { name: "", description: "", isVisible: true };
const emptyVendorForm: VendorForm = {
  vendorCategoryId: "",
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  serviceArea: "",
  description: "",
  isFeatured: false,
  isVisible: true,
};

function getPublicUrl(slug: string): string {
  return `${window.location.origin}/vendors/${slug}`;
}

function formatWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function cleanVendorForm(form: VendorForm, agentId?: number) {
  return {
    ...(agentId ? { agentId } : {}),
    vendorCategoryId: Number(form.vendorCategoryId),
    businessName: form.businessName.trim(),
    contactName: form.contactName.trim() || null,
    phone: formatPhone(form.phone) || null,
    email: form.email.trim() || null,
    website: formatWebsite(form.website) || null,
    address: form.address.trim() || null,
    serviceArea: form.serviceArea.trim() || null,
    description: form.description.trim() || null,
    isFeatured: form.isFeatured,
    isVisible: form.isVisible,
  };
}

function VendorListHelpDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><HelpCircle className="mr-2 h-4 w-4" /> Help guide</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vendor List help guide</DialogTitle>
            <DialogDescription>Build a polished, shareable network of professionals your clients can use after they invest.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2 text-sm leading-6 text-slate-700">
            <section className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
              <h3 className="font-semibold text-slate-900">1. Start your list</h3>
              <p className="mt-1">Select <strong>Create my Vendor List</strong>. This gives you a private draft. Set the client-facing title, a short headline, and an introduction in <strong>List settings</strong>.</p>
            </section>
            <section>
              <h3 className="font-semibold text-slate-900">2. Organize recommendations with categories</h3>
              <p className="mt-1">Choose <strong>Add category</strong> for the services clients need: cleaners, handymen, photographers, plumbers, electricians, designers, pool service, or property management. Add a short category description when it helps clients choose. Use the arrow controls to put categories in a helpful order, and turn off “Show publicly” to keep a category in your private draft.</p>
            </section>
            <section>
              <h3 className="font-semibold text-slate-900">3. Add trusted vendors</h3>
              <p className="mt-1">Within a category, select <strong>Add vendor</strong>. A business name is required. Add a contact name, phone, email, website, service area, address, and a concise note on what makes the vendor a fit. Mark your strongest recommendation as <strong>Featured</strong>; featured vendors appear first in the public list. Turn off “Show publicly” to retain a vendor without sharing it yet.</p>
            </section>
            <section>
              <h3 className="font-semibold text-slate-900">4. Review and publish</h3>
              <p className="mt-1">Use <strong>Open public list</strong> to review the client experience. When ready, open <strong>List settings</strong> and turn on <strong>Publish this list</strong>. Only published lists are available to clients, and only categories and vendors marked public will display.</p>
            </section>
            <section>
              <h3 className="font-semibold text-slate-900">5. Share with clients</h3>
              <p className="mt-1">Copy the share link in the banner after publishing and include it in a client follow-up, buyer resources email, transaction checklist, or market guide. The link is public and does not require a SavvyOS login. Keep the link stable by avoiding unnecessary slug changes in List settings.</p>
            </section>
            <section className="rounded-xl bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-900">Helpful practice</h3>
              <p className="mt-1">Share only vendors you genuinely trust. Verify contact details before sending the list, write clear notes about service area or specialty, and refresh recommendations as your network changes. Vendor recommendations are your personal network—not Savvy STR Agents endorsements.</p>
            </section>
          </div>
          <DialogFooter><Button onClick={() => setOpen(false)}>Got it</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VendorFormFields({ form, setForm, categories }: { form: VendorForm; setForm: (form: VendorForm) => void; categories: VendorCategory[] }) {
  const set = (key: keyof VendorForm, value: string | boolean) => setForm({ ...form, [key]: value });
  return (
    <div className="grid gap-4 py-2 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="vendor-category">Category <span className="text-rose-600">*</span></Label>
        <Select value={form.vendorCategoryId} onValueChange={(value) => set("vendorCategoryId", value)}>
          <SelectTrigger id="vendor-category"><SelectValue placeholder="Choose a category" /></SelectTrigger>
          <SelectContent>{categories.map((category) => <SelectItem key={category.id} value={String(category.id)}>{category.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="vendor-business">Business name <span className="text-rose-600">*</span></Label><Input id="vendor-business" value={form.businessName} maxLength={255} onChange={(event) => set("businessName", event.target.value)} placeholder="Blue Ridge Turnover Co." /></div>
      <div className="space-y-2"><Label htmlFor="vendor-contact">Contact name</Label><Input id="vendor-contact" value={form.contactName} maxLength={160} onChange={(event) => set("contactName", event.target.value)} placeholder="Jordan Smith" /></div>
      <div className="space-y-2"><Label htmlFor="vendor-phone">Phone</Label><Input id="vendor-phone" value={form.phone} inputMode="tel" maxLength={14} onChange={(event) => set("phone", formatPhone(event.target.value))} placeholder="(555) 555-5555" /></div>
      <div className="space-y-2"><Label htmlFor="vendor-email">Email</Label><Input id="vendor-email" type="email" value={form.email} maxLength={320} onChange={(event) => set("email", event.target.value)} placeholder="hello@example.com" /></div>
      <div className="space-y-2"><Label htmlFor="vendor-website">Website</Label><Input id="vendor-website" type="text" inputMode="url" autoCapitalize="none" value={form.website} maxLength={512} onChange={(event) => set("website", event.target.value)} onBlur={(event) => set("website", formatWebsite(event.target.value))} placeholder="example.com" /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="vendor-area">Service area</Label><Input id="vendor-area" value={form.serviceArea} maxLength={255} onChange={(event) => set("serviceArea", event.target.value)} placeholder="Asheville, Black Mountain & Weaverville" /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="vendor-address">Address</Label><Textarea id="vendor-address" value={form.address} maxLength={3000} onChange={(event) => set("address", event.target.value)} placeholder="Optional business address" rows={2} /></div>
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="vendor-description">Recommendation note</Label><Textarea id="vendor-description" value={form.description} maxLength={6000} onChange={(event) => set("description", event.target.value)} placeholder="What service do they provide, and why do you recommend them?" rows={4} /></div>
      <div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor="vendor-featured">Featured recommendation</Label><p className="mt-0.5 text-xs text-muted-foreground">Show this vendor first in their category.</p></div><Switch id="vendor-featured" checked={form.isFeatured} onCheckedChange={(checked) => set("isFeatured", checked)} /></div>
      <div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor="vendor-visible">Show publicly</Label><p className="mt-0.5 text-xs text-muted-foreground">Keep private until the details are ready.</p></div><Switch id="vendor-visible" checked={form.isVisible} onCheckedChange={(checked) => set("isVisible", checked)} /></div>
    </div>
  );
}

export default function VendorListManagementPage({ agentId }: { agentId?: number }) {
  const isAdminEditor = Boolean(agentId);
  const targetAgentId = agentId;
  const utils = trpc.useUtils();
  const listQuery = trpc.vendors.getManageableList.useQuery(targetAgentId ? { agentId: targetAgentId } : undefined, { retry: false });
  const list = listQuery.data as VendorList | null | undefined;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<VendorCategory | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm);
  const [vendorForm, setVendorForm] = useState<VendorForm>(emptyVendorForm);
  const [settings, setSettings] = useState({ displayName: "", headline: "", intro: "", publicSlug: "", isPublished: false });

  const totalVendors = useMemo(() => list?.categories.reduce((count, category) => count + category.vendors.length, 0) ?? 0, [list]);
  const mutationOptions = {
    onSuccess: async () => {
      await Promise.all([utils.vendors.getManageableList.invalidate(), utils.vendors.adminList.invalidate()]);
    },
  };
  const createList = trpc.vendors.createList.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); toast.success("Vendor List created. Add a category to get started."); } });
  const updateList = trpc.vendors.updateList.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); setSettingsOpen(false); toast.success("Vendor List settings saved."); } });
  const createCategory = trpc.vendors.createCategory.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); setCategoryOpen(false); toast.success("Category added."); } });
  const updateCategory = trpc.vendors.updateCategory.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); setCategoryOpen(false); toast.success("Category updated."); } });
  const deleteCategory = trpc.vendors.deleteCategory.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); toast.success("Category deleted."); } });
  const reorderCategories = trpc.vendors.reorderCategories.useMutation(mutationOptions);
  const createVendor = trpc.vendors.createVendor.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); setVendorOpen(false); toast.success("Vendor added."); } });
  const updateVendor = trpc.vendors.updateVendor.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); setVendorOpen(false); toast.success("Vendor updated."); } });
  const deleteVendor = trpc.vendors.deleteVendor.useMutation({ ...mutationOptions, onSuccess: async () => { await mutationOptions.onSuccess(); toast.success("Vendor deleted."); } });
  const reorderVendors = trpc.vendors.reorderVendors.useMutation(mutationOptions);
  const anySaving = createList.isPending || updateList.isPending || createCategory.isPending || updateCategory.isPending || deleteCategory.isPending || reorderCategories.isPending || createVendor.isPending || updateVendor.isPending || deleteVendor.isPending || reorderVendors.isPending;
  const mutationError = createList.error || updateList.error || createCategory.error || updateCategory.error || deleteCategory.error || reorderCategories.error || createVendor.error || updateVendor.error || deleteVendor.error || reorderVendors.error;

  const agentParam = targetAgentId ? { agentId: targetAgentId } : {};

  function openSettings() {
    if (!list) return;
    setSettings({ displayName: list.displayName, headline: list.headline ?? "", intro: list.intro ?? "", publicSlug: list.publicSlug, isPublished: list.isPublished });
    setSettingsOpen(true);
  }

  function openNewCategory() {
    setEditingCategory(null);
    setCategoryForm(emptyCategoryForm);
    setCategoryOpen(true);
  }

  function openEditCategory(category: VendorCategory) {
    setEditingCategory(category);
    setCategoryForm({ name: category.name, description: category.description ?? "", isVisible: category.isVisible });
    setCategoryOpen(true);
  }

  function openNewVendor(category: VendorCategory) {
    setEditingVendor(null);
    setVendorForm({ ...emptyVendorForm, vendorCategoryId: String(category.id) });
    setVendorOpen(true);
  }

  function openEditVendor(vendor: Vendor) {
    setEditingVendor(vendor);
    setVendorForm({
      vendorCategoryId: String(vendor.vendorCategoryId),
      businessName: vendor.businessName,
      contactName: vendor.contactName ?? "",
      phone: vendor.phone ?? "",
      email: vendor.email ?? "",
      website: vendor.website ?? "",
      address: vendor.address ?? "",
      serviceArea: vendor.serviceArea ?? "",
      description: vendor.description ?? "",
      isFeatured: vendor.isFeatured,
      isVisible: vendor.isVisible,
    });
    setVendorOpen(true);
  }

  async function copyPublicLink() {
    if (!list) return;
    try {
      await navigator.clipboard.writeText(getPublicUrl(list.publicSlug));
      toast.success("Share link copied to clipboard.");
    } catch {
      toast.error("Could not copy the link. Select it from List settings instead.");
    }
  }

  function moveCategory(index: number, direction: -1 | 1) {
    if (!list) return;
    const orderedIds = list.categories.map((category) => category.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= orderedIds.length) return;
    [orderedIds[index], orderedIds[swapIndex]] = [orderedIds[swapIndex], orderedIds[index]];
    reorderCategories.mutate({ ...agentParam, orderedIds });
  }

  function moveVendor(category: VendorCategory, index: number, direction: -1 | 1) {
    const orderedIds = category.vendors.map((vendor) => vendor.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= orderedIds.length) return;
    [orderedIds[index], orderedIds[swapIndex]] = [orderedIds[swapIndex], orderedIds[index]];
    reorderVendors.mutate({ ...agentParam, vendorCategoryId: category.id, orderedIds });
  }

  if (listQuery.isLoading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-600" /></div>;
  }

  if (listQuery.error) {
    return <Card className="mx-auto mt-10 max-w-xl"><CardContent className="p-8 text-center"><h1 className="text-lg font-semibold">Vendor List unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{listQuery.error.message || "This Vendor List could not be opened."}</p></CardContent></Card>;
  }

  if (!list) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center py-14 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700"><Wrench className="h-8 w-8" /></div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{isAdminEditor ? "Create this agent’s Vendor List" : "Build your Vendor List"}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Create a curated, client-ready resource for the cleaners, handymen, photographers, and other trusted professionals in your local network. Your list starts as a private draft and can be published when it is ready to share.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => createList.mutate(targetAgentId ? { agentId: targetAgentId } : undefined)} disabled={createList.isPending}>{createList.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{isAdminEditor ? "Create Vendor List" : "Create my Vendor List"}</Button>
          <VendorListHelpDialog />
        </div>
        {mutationError && <p className="mt-4 text-sm text-destructive">{mutationError.message}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-cyan-700"><UsersRound className="h-4 w-4" /> Client resource</div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold tracking-tight">{isAdminEditor ? `${list.agentName ?? "Agent"}'s Vendor List` : "My Vendor List"}</h1><Badge variant={list.isPublished ? "default" : "secondary"}>{list.isPublished ? "Published" : "Draft"}</Badge></div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{isAdminEditor ? "Review and manage this agent’s client-facing vendor recommendations." : "Organize the professionals you trust and share one client-ready link when your list is published."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <VendorListHelpDialog />
          <Button variant="outline" onClick={openSettings}><Settings2 className="mr-2 h-4 w-4" /> List settings</Button>
          <Button variant="outline" disabled={!list.isPublished} onClick={() => window.open(getPublicUrl(list.publicSlug), "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" /> Open public list</Button>
        </div>
      </header>

      <Card className={list.isPublished ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/60"}>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${list.isPublished ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{list.isPublished ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</div>
            <div><p className="font-semibold text-slate-900">{list.isPublished ? "Your public Vendor List is live" : "Your Vendor List is a private draft"}</p><p className="mt-0.5 text-sm text-slate-600">{list.isPublished ? "Only categories and vendors set to show publicly are visible to clients." : "Add your trusted network, then publish from List settings when you are ready to share."}</p></div>
          </div>
          {list.isPublished && <Button variant="outline" className="shrink-0 bg-white" onClick={copyPublicLink}><Copy className="mr-2 h-4 w-4" /> Copy share link</Button>}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Categories</p><p className="mt-1 text-3xl font-bold">{list.categories.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Vendor recommendations</p><p className="mt-1 text-3xl font-bold">{totalVendors}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Client URL</p><p className="mt-1 truncate text-sm font-semibold">/vendors/{list.publicSlug}</p></CardContent></Card>
      </div>

      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-bold">Categories & vendors</h2><p className="mt-1 text-sm text-muted-foreground">Use arrows to control the order clients see. Featured vendors appear first in each category.</p></div>
        <Button onClick={openNewCategory}><Plus className="mr-2 h-4 w-4" /> Add category</Button>
      </div>

      {list.categories.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-14 text-center"><Wrench className="mx-auto h-9 w-9 text-cyan-600" /><h2 className="mt-4 text-lg font-semibold">Start with a service category</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">For example, add Cleaners, Handymen, Photographers, or Plumbers—then include the trusted vendors clients can call.</p><Button className="mt-5" onClick={openNewCategory}><Plus className="mr-2 h-4 w-4" /> Add your first category</Button></CardContent></Card>
      ) : list.categories.map((category, categoryIndex) => (
        <Card key={category.id} className={!category.isVisible ? "border-dashed opacity-75" : undefined}>
          <CardHeader className="gap-3 border-b bg-slate-50/70 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-lg">{category.name}</CardTitle>{!category.isVisible && <Badge variant="secondary">Private</Badge>}<Badge variant="outline">{category.vendors.length} {category.vendors.length === 1 ? "vendor" : "vendors"}</Badge></div>{category.description && <CardDescription className="mt-1 max-w-2xl">{category.description}</CardDescription>}</div>
            <div className="flex shrink-0 flex-wrap gap-1"><Button variant="ghost" size="icon" disabled={categoryIndex === 0 || anySaving} onClick={() => moveCategory(categoryIndex, -1)} title="Move category up"><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" disabled={categoryIndex === list.categories.length - 1 || anySaving} onClick={() => moveCategory(categoryIndex, 1)} title="Move category down"><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => openEditCategory(category)} title="Edit category"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Delete “${category.name}” and its ${category.vendors.length} vendor recommendation${category.vendors.length === 1 ? "" : "s"}?`)) deleteCategory.mutate({ ...agentParam, id: category.id }); }} title="Delete category"><Trash2 className="h-4 w-4" /></Button><Button size="sm" className="ml-1" onClick={() => openNewVendor(category)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add vendor</Button></div>
          </CardHeader>
          <CardContent className="p-0">
            {category.vendors.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No vendors in this category yet. Add someone you trust.</div> : <div className="divide-y">{category.vendors.map((vendor, vendorIndex) => <div key={vendor.id} className={!vendor.isVisible ? "bg-slate-50/70 p-5 opacity-70" : "p-5"}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{vendor.businessName}</h3>{vendor.isFeatured && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><Star className="mr-1 h-3 w-3 fill-current" /> Featured</Badge>}{!vendor.isVisible && <Badge variant="secondary">Private</Badge>}</div>{vendor.contactName && <p className="mt-1 text-sm text-slate-600">Contact: {vendor.contactName}</p>}{vendor.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-sm leading-6 text-slate-600">{vendor.description}</p>}<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">{vendor.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{vendor.phone}</span>}{vendor.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{vendor.email}</span>}{vendor.serviceArea && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{vendor.serviceArea}</span>}{vendor.website && <span className="inline-flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" />Website</span>}</div></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" disabled={vendorIndex === 0 || anySaving} onClick={() => moveVendor(category, vendorIndex, -1)} title="Move vendor up"><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" disabled={vendorIndex === category.vendors.length - 1 || anySaving} onClick={() => moveVendor(category, vendorIndex, 1)} title="Move vendor down"><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => openEditVendor(vendor)} title="Edit vendor"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { if (window.confirm(`Delete “${vendor.businessName}”?`)) deleteVendor.mutate({ ...agentParam, id: vendor.id }); }} title="Delete vendor"><Trash2 className="h-4 w-4" /></Button></div></div>
            </div>)}</div>}
          </CardContent>
        </Card>
      ))}

      {mutationError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{mutationError.message}</p>}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Vendor List settings</DialogTitle><DialogDescription>These details appear at the top of your public client resource.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label htmlFor="list-name">Public list name</Label><Input id="list-name" value={settings.displayName} maxLength={160} onChange={(event) => setSettings({ ...settings, displayName: event.target.value })} placeholder="Tyler's Vendor List" /></div><div className="space-y-2"><Label htmlFor="list-headline">Headline</Label><Input id="list-headline" value={settings.headline} maxLength={255} onChange={(event) => setSettings({ ...settings, headline: event.target.value })} placeholder="Trusted local professionals for your STR" /></div><div className="space-y-2"><Label htmlFor="list-intro">Welcome message</Label><Textarea id="list-intro" value={settings.intro} maxLength={6000} onChange={(event) => setSettings({ ...settings, intro: event.target.value })} placeholder="A note to clients about how to use these recommendations." rows={5} /></div><div className="space-y-2"><Label htmlFor="list-slug">Public URL</Label><div className="flex items-center rounded-md border bg-muted/40 px-3 text-sm"><span className="shrink-0 text-muted-foreground">{window.location.origin}/vendors/</span><Input id="list-slug" value={settings.publicSlug} maxLength={120} onChange={(event) => setSettings({ ...settings, publicSlug: event.target.value.toLowerCase().replace(/\s+/g, "-") })} className="h-10 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0" /></div><p className="text-xs text-muted-foreground">Use lowercase letters, numbers, and hyphens. Changing this path changes your share link.</p></div><div className="flex items-center justify-between rounded-lg border p-4"><div><Label htmlFor="list-published">Publish this list</Label><p className="mt-0.5 max-w-md text-xs text-muted-foreground">Published lists are visible to anyone with the link. Private categories and vendors remain hidden.</p></div><Switch id="list-published" checked={settings.isPublished} onCheckedChange={(checked) => setSettings({ ...settings, isPublished: checked })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)} disabled={updateList.isPending}>Cancel</Button><Button onClick={() => updateList.mutate({ ...agentParam, displayName: settings.displayName.trim(), headline: settings.headline.trim() || null, intro: settings.intro.trim() || null, publicSlug: settings.publicSlug.trim(), isPublished: settings.isPublished })} disabled={updateList.isPending || settings.displayName.trim().length < 2 || settings.publicSlug.trim().length < 3}>{updateList.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{editingCategory ? "Edit category" : "Add category"}</DialogTitle><DialogDescription>Categories keep your recommendations easy for clients to browse.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label htmlFor="category-name">Category name</Label><Input id="category-name" value={categoryForm.name} maxLength={120} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Cleaners" /></div><div className="space-y-2"><Label htmlFor="category-description">Description</Label><Textarea id="category-description" value={categoryForm.description} maxLength={1500} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} placeholder="Optional note about the services in this category." rows={3} /></div><div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor="category-visible">Show publicly</Label><p className="mt-0.5 text-xs text-muted-foreground">Keep this category private until it is ready for clients.</p></div><Switch id="category-visible" checked={categoryForm.isVisible} onCheckedChange={(checked) => setCategoryForm({ ...categoryForm, isVisible: checked })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCategoryOpen(false)} disabled={createCategory.isPending || updateCategory.isPending}>Cancel</Button><Button onClick={() => { const data = { ...agentParam, name: categoryForm.name.trim(), description: categoryForm.description.trim() || null, isVisible: categoryForm.isVisible }; if (editingCategory) updateCategory.mutate({ ...data, id: editingCategory.id }); else createCategory.mutate(data); }} disabled={createCategory.isPending || updateCategory.isPending || categoryForm.name.trim().length < 2}>{(createCategory.isPending || updateCategory.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingCategory ? "Save category" : "Add category"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={vendorOpen} onOpenChange={setVendorOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editingVendor ? "Edit vendor" : "Add vendor"}</DialogTitle><DialogDescription>Provide the key contact details clients need to confidently reach out.</DialogDescription></DialogHeader><VendorFormFields form={vendorForm} setForm={setVendorForm} categories={list.categories} /><DialogFooter><Button variant="outline" onClick={() => setVendorOpen(false)} disabled={createVendor.isPending || updateVendor.isPending}>Cancel</Button><Button onClick={() => { const data = cleanVendorForm(vendorForm, targetAgentId); if (editingVendor) updateVendor.mutate({ ...data, id: editingVendor.id }); else createVendor.mutate(data); }} disabled={createVendor.isPending || updateVendor.isPending || !vendorForm.vendorCategoryId || vendorForm.businessName.trim().length < 2}>{(createVendor.isPending || updateVendor.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingVendor ? "Save vendor" : "Add vendor"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
