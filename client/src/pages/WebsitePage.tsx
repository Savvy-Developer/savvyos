import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  CheckCircle2,
  FileText,
  Globe2,
  ImagePlus,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const PUBLIC_PREVIEW_URL = "https://home.savvy-agents.com/newsite/";
type TabKey =
  | "overview"
  | "properties"
  | "agents"
  | "case-studies"
  | "blog"
  | "leads"
  | "settings";
type Status = "draft" | "published" | "archived";

const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "overview", label: "Overview", icon: Globe2 },
  { key: "properties", label: "Properties", icon: Building2 },
  { key: "agents", label: "Agents", icon: UserRound },
  { key: "case-studies", label: "Case Studies", icon: Sparkles },
  { key: "blog", label: "Blog", icon: BookOpen },
  { key: "leads", label: "Leads", icon: Mail },
  { key: "settings", label: "CMS", icon: Settings2 },
];

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        className="mt-1"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
}
function Area({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Textarea
        className="mt-1"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={
        status === "published"
          ? "bg-emerald-600 hover:bg-emerald-600"
          : status === "archived"
            ? "bg-slate-500"
            : "bg-amber-500 hover:bg-amber-500"
      }
    >
      {status}
    </Badge>
  );
}
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
function splitLines(value: string) {
  return value
    .split("\n")
    .map(item => item.trim())
    .filter(Boolean);
}
function joinLines(value: unknown) {
  return Array.isArray(value) ? value.join("\n") : "";
}
function numberOrNull(value: string) {
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}
const CANONICAL_FIELD_LABELS: Record<string, string> = {
  address: "address",
  city: "city",
  state: "state",
  zip: "ZIP",
  beds: "beds",
  baths: "baths",
  sqft: "square feet",
  propertyType: "property type",
  listPrice: "list price",
};

function fieldLabel(field: string) {
  return CANONICAL_FIELD_LABELS[field] ?? field;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function MediaUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/upload/website-image", {
        method: "POST",
        body,
        credentials: "include",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Upload failed");
      onUploaded(json.url);
      toast.success("Website image uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ImagePlus className="h-4 w-4" />
      )}
      {uploading ? "Uploading…" : "Upload image"}
      <input
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading}
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </label>
  );
}

const blankProperty = {
  address: "",
  city: "",
  state: "",
  zip: "",
  beds: "",
  baths: "",
  sqft: "",
  listPrice: "",
  propertyType: "vacation_rental",
  slug: "",
  status: "draft" as Status,
  sourceUrl: "",
  sourceProformaId: "",
  assignedAgentId: "",
  headline: "",
  summary: "",
  heroImageUrl: "",
  galleryImageUrls: "",
  featureTags: "",
  investmentHighlights: "",
  projectedRevenue: "",
  cashOnCash: "",
  capRate: "",
  occupancyRate: "",
  averageDailyRate: "",
  regulationSummary: "",
  callToActionText: "Request the full investment analysis",
  metaTitle: "",
  metaDescription: "",
  isFeatured: false,
  sortOrder: "0",
  propertyId: undefined as number | undefined,
};

function PropertyEditor({
  initial,
  agents,
  onClose,
}: {
  initial?: any;
  agents: any[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<any>(
    initial
      ? {
          ...blankProperty,
          ...initial,
          propertyId: initial.propertyId,
          beds: initial.beds ?? "",
          baths: initial.baths ?? "",
          sqft: initial.sqft ?? "",
          listPrice: initial.listPrice ?? "",
          sourceProformaId: initial.sourceProformaId
            ? String(initial.sourceProformaId)
            : "",
          assignedAgentId: initial.assignedAgentId
            ? String(initial.assignedAgentId)
            : "",
          galleryImageUrls: joinLines(initial.galleryImageUrls),
          featureTags: joinLines(initial.featureTags),
          investmentHighlights: joinLines(initial.investmentHighlights),
          projectedRevenue: initial.projectedRevenue ?? "",
          cashOnCash:
            initial.cashOnCash == null
              ? ""
              : String(Number(initial.cashOnCash) * 100),
          capRate:
            initial.capRate == null
              ? ""
              : String(Number(initial.capRate) * 100),
          occupancyRate:
            initial.occupancyRate == null
              ? ""
              : String(Number(initial.occupancyRate) * 100),
          averageDailyRate: initial.averageDailyRate ?? "",
          sortOrder: String(initial.sortOrder ?? 0),
        }
      : { ...blankProperty }
  );
  const [propertySearch, setPropertySearch] = useState("");
  const [zillowUrl, setZillowUrl] = useState(initial?.sourceUrl || "");
  const search = trpc.website.searchSourceProperties.useQuery(
    { search: propertySearch },
    { enabled: propertySearch.length >= 2 && !draft.propertyId }
  );
  const proformas = trpc.website.propertyProformas.useQuery(
    { propertyId: Number(draft.propertyId || 0) },
    { enabled: !!draft.propertyId }
  );
  const importZillow = trpc.website.importZillow.useMutation({
    onSuccess: data => {
      setDraft((prior: any) => ({
        ...prior,
        ...data,
        listPrice: data.listPrice ?? prior.listPrice,
        beds: data.beds ?? prior.beds,
        baths: data.baths ?? prior.baths,
        sqft: data.sqft ?? prior.sqft,
        heroImageUrl: data.heroImageUrl || prior.heroImageUrl,
        galleryImageUrls: data.heroImageUrl
          ? data.heroImageUrl
          : prior.galleryImageUrls,
        slug: data.slug || prior.slug,
        sourceUrl: data.sourceUrl,
        importedData: data.importedData,
      }));
      toast.success(
        "Public Zillow metadata imported. Review every field before publishing."
      );
    },
    onError: error => toast.error(error.message),
  });
  const save = trpc.website.saveProperty.useMutation({
    onSuccess: async result => {
      await utils.website.adminOverview.invalidate();
      toast.success("Website property saved.");
      // The SavvyOS property record owns the physical facts. If the form tried
      // to change one that was already filled in, the save kept the SavvyOS
      // value, so say so rather than letting the edit disappear quietly.
      if (result?.ignoredFields?.length) {
        toast.info(
          `Kept the SavvyOS values for ${result.ignoredFields
            .map(fieldLabel)
            .join(", ")}. Edit the property record to change those.`
        );
      }
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const set = (key: string, value: any) =>
    setDraft((prior: any) => ({ ...prior, [key]: value }));
  const submit = () =>
    save.mutate({
      ...(initial?.id ? { id: initial.id } : {}),
      ...(draft.propertyId ? { propertyId: Number(draft.propertyId) } : {}),
      address: draft.address,
      city: draft.city || null,
      state: draft.state || null,
      zip: draft.zip || null,
      beds: numberOrNull(String(draft.beds)),
      baths: numberOrNull(String(draft.baths)),
      sqft: numberOrNull(String(draft.sqft)),
      listPrice: numberOrNull(String(draft.listPrice)),
      propertyType: draft.propertyType || null,
      slug:
        draft.slug || slugify(`${draft.address}-${draft.city}-${draft.state}`),
      status: draft.status,
      sourceUrl: draft.sourceUrl || null,
      sourceProformaId: draft.sourceProformaId
        ? Number(draft.sourceProformaId)
        : null,
      assignedAgentId: draft.assignedAgentId
        ? Number(draft.assignedAgentId)
        : null,
      headline: draft.headline || null,
      summary: draft.summary || null,
      heroImageUrl: draft.heroImageUrl || null,
      galleryImageUrls: splitLines(draft.galleryImageUrls),
      featureTags: splitLines(draft.featureTags),
      investmentHighlights: splitLines(draft.investmentHighlights),
      projectedRevenue: numberOrNull(String(draft.projectedRevenue)),
      cashOnCash:
        draft.cashOnCash === "" ? null : Number(draft.cashOnCash) / 100,
      capRate: draft.capRate === "" ? null : Number(draft.capRate) / 100,
      occupancyRate:
        draft.occupancyRate === "" ? null : Number(draft.occupancyRate) / 100,
      averageDailyRate: numberOrNull(String(draft.averageDailyRate)),
      regulationSummary: draft.regulationSummary || null,
      callToActionText: draft.callToActionText,
      metaTitle: draft.metaTitle || null,
      metaDescription: draft.metaDescription || null,
      isFeatured: !!draft.isFeatured,
      sortOrder: Number(draft.sortOrder || 0),
      importedData: draft.importedData || null,
    } as any);
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit website property" : "Add website property"}
          </DialogTitle>
          <DialogDescription>
            Pick one of your SavvyOS properties to publish. The property
            record stays the source of truth for the address and the numbers,
            and this page adds the public headline, summary and investor
            intelligence on top.
          </DialogDescription>
        </DialogHeader>
        {!initial && (
          <div className="relative rounded-xl border border-cyan-200 bg-cyan-50 p-4">
            <Field
              label="Connect an existing SavvyOS property"
              value={propertySearch}
              onChange={setPropertySearch}
              placeholder="Search address or city"
            />
            {search.data?.length ? (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-white shadow-xl">
                {search.data.map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      setDraft((prior: any) => ({
                        ...prior,
                        ...item,
                        propertyId: item.id,
                        slug:
                          prior.slug ||
                          slugify(`${item.address}-${item.city}-${item.state}`),
                      }));
                      setPropertySearch(
                        `${item.address}, ${item.city || ""} ${item.state || ""}`
                      );
                    }}
                  >
                    {item.address}
                    {item.city ? `, ${item.city}, ${item.state || ""}` : ""}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="font-semibold text-slate-700">
            Not in SavvyOS yet? Import from Zillow
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={zillowUrl}
              onChange={event => setZillowUrl(event.target.value)}
              placeholder="https://www.zillow.com/homedetails/..."
            />
            <Button
              type="button"
              variant="outline"
              disabled={!zillowUrl || importZillow.isPending}
              onClick={() => importZillow.mutate({ url: zillowUrl })}
            >
              {importZillow.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Import Zillow
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-600">
            The importer reads public metadata only. Confirm facts and media
            rights before publishing.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Field
              label="Street address"
              value={draft.address}
              onChange={value => {
                set("address", value);
                if (!draft.slug) set("slug", slugify(value));
              }}
            />
          </div>
          <Field
            label="City"
            value={draft.city || ""}
            onChange={value => set("city", value)}
          />
          <Field
            label="State"
            value={draft.state || ""}
            onChange={value => set("state", value)}
          />
          <Field
            label="ZIP"
            value={draft.zip || ""}
            onChange={value => set("zip", value)}
          />
          <Field
            label="Beds"
            value={String(draft.beds ?? "")}
            onChange={value => set("beds", value)}
            type="number"
          />
          <Field
            label="Baths"
            value={String(draft.baths ?? "")}
            onChange={value => set("baths", value)}
            type="number"
          />
          <Field
            label="Square feet"
            value={String(draft.sqft ?? "")}
            onChange={value => set("sqft", value)}
            type="number"
          />
          <Field
            label="List price"
            value={String(draft.listPrice ?? "")}
            onChange={value => set("listPrice", value)}
          />
          <div>
            <Label>Property type</Label>
            <Select
              value={draft.propertyType}
              onValueChange={value => set("propertyType", value)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "vacation_rental",
                  "single_family",
                  "multi_family",
                  "condo",
                  "townhouse",
                  "cabin",
                  "commercial",
                  "land",
                  "other",
                ].map(value => (
                  <SelectItem key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Field
              label="Public slug"
              value={draft.slug}
              onChange={value => set("slug", slugify(value))}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Public headline"
            value={draft.headline || ""}
            onChange={value => set("headline", value)}
          />
          <div>
            <Label>Assigned Savvy agent</Label>
            <Select
              value={draft.assignedAgentId || "none"}
              onValueChange={value =>
                set("assignedAgentId", value === "none" ? "" : value)
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No agent</SelectItem>
                {agents.map((agent: any) => (
                  <SelectItem key={agent.id} value={String(agent.id)}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Area
              label="Public summary"
              value={draft.summary || ""}
              onChange={value => set("summary", value)}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Field
              label="Hero image URL"
              value={draft.heroImageUrl || ""}
              onChange={value => set("heroImageUrl", value)}
            />
            <div className="mt-2">
              <MediaUpload
                onUploaded={url => {
                  set("heroImageUrl", url);
                  set(
                    "galleryImageUrls",
                    [url, ...splitLines(draft.galleryImageUrls)]
                      .filter(
                        (value, index, all) => all.indexOf(value) === index
                      )
                      .join("\n")
                  );
                }}
              />
            </div>
          </div>
          <Area
            label="Gallery image URLs — one per line"
            value={draft.galleryImageUrls || ""}
            onChange={value => set("galleryImageUrls", value)}
            rows={5}
          />
          <Area
            label="Feature tags — one per line"
            value={draft.featureTags || ""}
            onChange={value => set("featureTags", value)}
          />
          <Area
            label="Investment highlights — one per line"
            value={draft.investmentHighlights || ""}
            onChange={value => set("investmentHighlights", value)}
          />
        </div>
        {draft.propertyId && (
          <div className="rounded-xl border bg-slate-50 p-4">
            <p className="font-semibold">Reuse property intelligence</p>
            <p className="mb-3 text-xs text-slate-500">
              Choose a saved pro-forma to copy its revenue, cash-on-cash return,
              and cap rate on save.
            </p>
            <Select
              value={draft.sourceProformaId || "none"}
              onValueChange={value =>
                set("sourceProformaId", value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a pro-forma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Manual website metrics</SelectItem>
                {(proformas.data || []).map((item: any) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.title} ·{" "}
                    {item.grossRevenue
                      ? `$${Number(item.grossRevenue).toLocaleString()} revenue`
                      : "No revenue"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-5">
          <Field
            label="Projected annual revenue"
            value={String(draft.projectedRevenue ?? "")}
            onChange={value => set("projectedRevenue", value)}
          />
          <Field
            label="Cash-on-cash %"
            value={String(draft.cashOnCash ?? "")}
            onChange={value => set("cashOnCash", value)}
          />
          <Field
            label="Cap rate %"
            value={String(draft.capRate ?? "")}
            onChange={value => set("capRate", value)}
          />
          <Field
            label="Occupancy %"
            value={String(draft.occupancyRate ?? "")}
            onChange={value => set("occupancyRate", value)}
          />
          <Field
            label="Average daily rate"
            value={String(draft.averageDailyRate ?? "")}
            onChange={value => set("averageDailyRate", value)}
          />
        </div>
        <Area
          label="Regulation and diligence summary"
          value={draft.regulationSummary || ""}
          onChange={value => set("regulationSummary", value)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Meta title"
            value={draft.metaTitle || ""}
            onChange={value => set("metaTitle", value)}
          />
          <Field
            label="CTA label"
            value={draft.callToActionText}
            onChange={value => set("callToActionText", value)}
          />
          <div className="md:col-span-2">
            <Area
              label="Meta description"
              value={draft.metaDescription || ""}
              onChange={value => set("metaDescription", value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-5">
            <div>
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={value => set("status", value)}
              >
                <SelectTrigger className="mt-1 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 pt-5 text-sm font-medium">
              <Switch
                checked={draft.isFeatured}
                onCheckedChange={value => set("isFeatured", value)}
              />
              Feature on homepage
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!draft.address || save.isPending}
              onClick={submit}
            >
              {save.isPending ? "Saving…" : "Save property"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgentEditor({
  initial,
  sourceAgents,
  onClose,
}: {
  initial?: any;
  sourceAgents: any[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<any>(
    initial
      ? {
          ...initial,
          userId: String(initial.userId),
          markets: joinLines(initial.markets),
          specialties: joinLines(initial.specialties),
        }
      : {
          userId: "",
          slug: "",
          headline: "",
          shortBio: "",
          markets: "",
          specialties: "",
          imageUrl: "",
          publicEmail: "",
          publicPhone: "",
          bookingUrl: "",
          status: "draft",
          isFeatured: false,
          sortOrder: 0,
        }
  );
  const save = trpc.website.saveAgent.useMutation({
    onSuccess: async () => {
      await utils.website.adminOverview.invalidate();
      toast.success("Website agent profile saved.");
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const source = sourceAgents.find(
    item => String(item.id) === String(draft.userId)
  );
  const set = (key: string, value: any) =>
    setDraft((prior: any) => ({ ...prior, [key]: value }));
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit public agent profile" : "Add public agent profile"}
          </DialogTitle>
          <DialogDescription>
            Pick an existing SavvyOS agent to feature on the website. Their
            name, contact details, and bio come from their SavvyOS profile;
            you only add the website positioning and market expertise here.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>SavvyOS agent</Label>
          <Select
            value={String(draft.userId)}
            disabled={!!initial}
            onValueChange={value => {
              const agent = sourceAgents.find(
                item => String(item.id) === value
              );
              setDraft((prior: any) => ({
                ...prior,
                userId: value,
                slug: slugify(agent?.name || ""),
                shortBio: agent?.bio || "",
                imageUrl: agent?.imageUrl || "",
                publicEmail: agent?.email || "",
                publicPhone: agent?.phone || "",
                bookingUrl: agent?.bookingUrl || "",
              }));
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Choose a SavvyOS agent" />
            </SelectTrigger>
            <SelectContent>
              {sourceAgents.map((agent: any) => (
                <SelectItem key={agent.id} value={String(agent.id)}>
                  {agent.name} · {agent.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Public slug"
            value={draft.slug}
            onChange={value => set("slug", slugify(value))}
          />
          <Field
            label="Positioning headline"
            value={draft.headline || ""}
            onChange={value => set("headline", value)}
          />
        </div>
        <Area
          label="Public bio"
          value={draft.shortBio || ""}
          onChange={value => set("shortBio", value)}
          rows={8}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Area
            label="Markets — one per line"
            value={draft.markets || ""}
            onChange={value => set("markets", value)}
          />
          <Area
            label="Specialties — one per line"
            value={draft.specialties || ""}
            onChange={value => set("specialties", value)}
          />
          <Field
            label="Headshot URL"
            value={draft.imageUrl || ""}
            onChange={value => set("imageUrl", value)}
          />
          <div className="flex items-end">
            <MediaUpload onUploaded={url => set("imageUrl", url)} />
          </div>
          <Field
            label="Public email"
            value={draft.publicEmail || ""}
            onChange={value => set("publicEmail", value)}
          />
          <Field
            label="Public phone"
            value={draft.publicPhone || ""}
            onChange={value => set("publicPhone", value)}
          />
          <div className="md:col-span-2">
            <Field
              label="Booking URL"
              value={draft.bookingUrl || ""}
              onChange={value => set("bookingUrl", value)}
            />
          </div>
        </div>
        <EditorFooter
          draft={draft}
          set={set}
          pending={save.isPending}
          onClose={onClose}
          onSave={() =>
            save.mutate({
              ...(initial?.id ? { id: initial.id } : {}),
              userId: Number(draft.userId),
              slug: draft.slug,
              headline: draft.headline || null,
              shortBio: draft.shortBio || null,
              markets: splitLines(draft.markets),
              specialties: splitLines(draft.specialties),
              imageUrl: draft.imageUrl || null,
              publicEmail: draft.publicEmail || null,
              publicPhone: draft.publicPhone || null,
              bookingUrl: draft.bookingUrl || null,
              status: draft.status,
              isFeatured: !!draft.isFeatured,
              sortOrder: Number(draft.sortOrder || 0),
            } as any)
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function ContentEditor({
  kind,
  initial,
  sourceAgents,
  properties,
  onClose,
}: {
  kind: "case" | "post";
  initial?: any;
  sourceAgents: any[];
  properties: any[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const isCase = kind === "case";
  const [draft, setDraft] = useState<any>(
    initial || {
      slug: "",
      title: "",
      eyebrow: "",
      excerpt: "",
      body: "",
      heroImageUrl: "",
      coverImageUrl: "",
      propertyId: "",
      agentUserId: "",
      authorUserId: "",
      primaryMetricLabel: "",
      primaryMetricValue: "",
      secondaryMetricLabel: "",
      secondaryMetricValue: "",
      category: "STR Investing",
      metaTitle: "",
      metaDescription: "",
      status: "draft",
      isFeatured: false,
      sortOrder: 0,
    }
  );
  const saveCase = trpc.website.saveCaseStudy.useMutation({
    onSuccess: async () => {
      await utils.website.adminOverview.invalidate();
      toast.success("Case study saved.");
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const savePost = trpc.website.savePost.useMutation({
    onSuccess: async () => {
      await utils.website.adminOverview.invalidate();
      toast.success("Blog post saved.");
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const set = (key: string, value: any) =>
    setDraft((prior: any) => ({ ...prior, [key]: value }));
  const imageKey = isCase ? "heroImageUrl" : "coverImageUrl";
  const submit = () => {
    const common = {
      ...(initial?.id ? { id: initial.id } : {}),
      slug: draft.slug || slugify(draft.title),
      title: draft.title,
      excerpt: draft.excerpt || null,
      body: draft.body || null,
      status: draft.status,
      isFeatured: !!draft.isFeatured,
      sortOrder: Number(draft.sortOrder || 0),
    };
    if (isCase)
      saveCase.mutate({
        ...common,
        eyebrow: draft.eyebrow || null,
        heroImageUrl: draft.heroImageUrl || null,
        propertyId: draft.propertyId ? Number(draft.propertyId) : null,
        agentUserId: draft.agentUserId ? Number(draft.agentUserId) : null,
        primaryMetricLabel: draft.primaryMetricLabel || null,
        primaryMetricValue: draft.primaryMetricValue || null,
        secondaryMetricLabel: draft.secondaryMetricLabel || null,
        secondaryMetricValue: draft.secondaryMetricValue || null,
      } as any);
    else
      savePost.mutate({
        ...common,
        coverImageUrl: draft.coverImageUrl || null,
        category: draft.category || null,
        authorUserId: draft.authorUserId ? Number(draft.authorUserId) : null,
        metaTitle: draft.metaTitle || null,
        metaDescription: draft.metaDescription || null,
      } as any);
  };
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit" : "Create"} {isCase ? "case study" : "blog post"}
          </DialogTitle>
          <DialogDescription>
            Write public content in clear sections. Blank lines become readable
            paragraphs on the live page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Title"
            value={draft.title}
            onChange={value => {
              set("title", value);
              if (!draft.slug) set("slug", slugify(value));
            }}
          />
          <Field
            label="Public slug"
            value={draft.slug}
            onChange={value => set("slug", slugify(value))}
          />
        </div>
        {isCase ? (
          <Field
            label="Eyebrow"
            value={draft.eyebrow || ""}
            onChange={value => set("eyebrow", value)}
          />
        ) : (
          <Field
            label="Category"
            value={draft.category || ""}
            onChange={value => set("category", value)}
          />
        )}
        <Area
          label="Excerpt"
          value={draft.excerpt || ""}
          onChange={value => set("excerpt", value)}
        />
        <Area
          label="Article / story body"
          value={draft.body || ""}
          onChange={value => set("body", value)}
          rows={14}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Cover image URL"
            value={draft[imageKey] || ""}
            onChange={value => set(imageKey, value)}
          />
          <div className="flex items-end">
            <MediaUpload onUploaded={url => set(imageKey, url)} />
          </div>
        </div>
        {isCase ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Associated agent</Label>
                <Select
                  value={draft.agentUserId ? String(draft.agentUserId) : "none"}
                  onValueChange={value =>
                    set("agentUserId", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No agent</SelectItem>
                    {sourceAgents.map((agent: any) => (
                      <SelectItem key={agent.id} value={String(agent.id)}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Associated property</Label>
                <Select
                  value={draft.propertyId ? String(draft.propertyId) : "none"}
                  onValueChange={value =>
                    set("propertyId", value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No property</SelectItem>
                    {properties.map((item: any) => (
                      <SelectItem
                        key={item.propertyId}
                        value={String(item.propertyId)}
                      >
                        {item.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Primary metric label"
                value={draft.primaryMetricLabel || ""}
                onChange={value => set("primaryMetricLabel", value)}
              />
              <Field
                label="Primary metric value"
                value={draft.primaryMetricValue || ""}
                onChange={value => set("primaryMetricValue", value)}
              />
              <Field
                label="Secondary metric label"
                value={draft.secondaryMetricLabel || ""}
                onChange={value => set("secondaryMetricLabel", value)}
              />
              <Field
                label="Secondary metric value"
                value={draft.secondaryMetricValue || ""}
                onChange={value => set("secondaryMetricValue", value)}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label>Author</Label>
              <Select
                value={draft.authorUserId ? String(draft.authorUserId) : "none"}
                onValueChange={value =>
                  set("authorUserId", value === "none" ? "" : value)
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Savvy Team</SelectItem>
                  {sourceAgents.map((agent: any) => (
                    <SelectItem key={agent.id} value={String(agent.id)}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Meta title"
                value={draft.metaTitle || ""}
                onChange={value => set("metaTitle", value)}
              />
              <Field
                label="Meta description"
                value={draft.metaDescription || ""}
                onChange={value => set("metaDescription", value)}
              />
            </div>
          </>
        )}
        <EditorFooter
          draft={draft}
          set={set}
          pending={saveCase.isPending || savePost.isPending}
          onClose={onClose}
          onSave={submit}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditorFooter({
  draft,
  set,
  pending,
  onClose,
  onSave,
}: {
  draft: any;
  set: (key: string, value: any) => void;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="flex items-center gap-4">
        <Select
          value={draft.status}
          onValueChange={value => set("status", value)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch
            checked={!!draft.isFeatured}
            onCheckedChange={value => set("isFeatured", value)}
          />
          Featured
        </label>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={pending} onClick={onSave}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function SettingsEditor({ settings }: { settings: any }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<any>(null);
  useEffect(() => {
    if (settings)
      setDraft({
        ...settings,
        statsText: (settings.stats || [])
          .map((item: any) => `${item.value} | ${item.label}`)
          .join("\n"),
        testimonialsText: (settings.testimonials || [])
          .map(
            (item: any) => `${item.quote} | ${item.name} | ${item.role || ""}`
          )
          .join("\n"),
      });
  }, [settings]);
  const save = trpc.website.saveSettings.useMutation({
    onSuccess: async () => {
      await utils.website.adminOverview.invalidate();
      toast.success("Homepage settings saved.");
    },
    onError: error => toast.error(error.message),
  });
  if (!draft)
    return <EmptyState>Homepage settings have not loaded.</EmptyState>;
  const set = (key: string, value: any) =>
    setDraft((prior: any) => ({ ...prior, [key]: value }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Homepage content</CardTitle>
        <CardDescription>
          Edit the staged homepage without a code deployment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Announcement"
            value={draft.announcementText || ""}
            onChange={value => set("announcementText", value)}
          />
          <Field
            label="Hero eyebrow"
            value={draft.heroEyebrow || ""}
            onChange={value => set("heroEyebrow", value)}
          />
        </div>
        <Field
          label="Hero headline"
          value={draft.heroTitle || ""}
          onChange={value => set("heroTitle", value)}
        />
        <Area
          label="Hero copy"
          value={draft.heroBody || ""}
          onChange={value => set("heroBody", value)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Hero image URL"
            value={draft.heroImageUrl || ""}
            onChange={value => set("heroImageUrl", value)}
          />
          <div className="flex items-end">
            <MediaUpload onUploaded={url => set("heroImageUrl", url)} />
          </div>
        </div>
        <Area
          label="Stats — Value | Label, one per line"
          value={draft.statsText || ""}
          onChange={value => set("statsText", value)}
        />
        <Area
          label="Testimonials — Quote | Name | Role, one per line"
          value={draft.testimonialsText || ""}
          onChange={value => set("testimonialsText", value)}
          rows={6}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Contact email"
            value={draft.contactEmail || ""}
            onChange={value => set("contactEmail", value)}
          />
          <Field
            label="Contact phone"
            value={draft.contactPhone || ""}
            onChange={value => set("contactPhone", value)}
          />
        </div>
        <Area
          label="Footer statement"
          value={draft.footerText || ""}
          onChange={value => set("footerText", value)}
        />
        <div className="flex justify-end">
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                announcementText: draft.announcementText || null,
                heroEyebrow: draft.heroEyebrow || null,
                heroTitle: draft.heroTitle,
                heroBody: draft.heroBody || null,
                heroImageUrl: draft.heroImageUrl || null,
                stats: splitLines(draft.statsText)
                  .map(line => {
                    const [value, ...label] = line.split("|");
                    return {
                      value: value.trim(),
                      label: label.join("|").trim(),
                    };
                  })
                  .filter(item => item.value && item.label),
                testimonials: splitLines(draft.testimonialsText)
                  .map(line => {
                    const [quote, name, role] = line.split("|");
                    return {
                      quote: (quote || "").trim(),
                      name: (name || "").trim(),
                      role: (role || "").trim(),
                    };
                  })
                  .filter(item => item.quote && item.name),
                contactEmail: draft.contactEmail || null,
                contactPhone: draft.contactPhone || null,
                footerText: draft.footerText || null,
              } as any)
            }
          >
            {save.isPending ? "Saving…" : "Save homepage"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function WebsitePage() {
  useLocation();
  const [tab, setTab] = useState<TabKey>("overview");
  const [editor, setEditor] = useState<{
    type: "property" | "agent" | "case" | "post";
    initial?: any;
  } | null>(null);
  const appliedShortcut = useRef(false);
  const shortcutParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const shortcutPropertyId = /^\d+$/.test(
    shortcutParams.get("propertyId") ?? ""
  )
    ? Number(shortcutParams.get("propertyId"))
    : 0;
  const shortcutProperty = trpc.properties.get.useQuery(
    { id: shortcutPropertyId },
    { enabled: shortcutPropertyId > 0 }
  );
  const overview = trpc.website.adminOverview.useQuery();
  const pageUtils = trpc.useUtils();
  const unpublish = trpc.website.unpublishProperty.useMutation({
    onSuccess: async () => {
      await pageUtils.website.adminOverview.invalidate();
      toast.success("Removed from the website. The property record is unchanged.");
    },
    onError: error => toast.error(error.message),
  });
  // Deleting only ever removes the public listing, so a plain confirm is enough.
  const removeProperty = (item: any) => {
    const label = item.address || "this property";
    if (
      window.confirm(
        `Remove ${label} from the public website?\n\nThe SavvyOS property record, its transactions and its listings are not affected.`
      )
    ) {
      unpublish.mutate({ id: item.id });
    }
  };
  const permissions = trpc.permissions.getMyPermissions.useQuery();
  const can = (key: string) =>
    (permissions.data as Record<string, boolean> | undefined)?.[key] === true;
  // Website inquiries are routed straight into SavvyOS contacts and the
  // agent's pipeline, so there is no separate lead queue to manage here.
  const visibleTabs = tabs.filter(item => item.key !== "leads");
  const data = overview.data;
  const counts = useMemo(
    () => ({
      liveProperties:
        data?.properties.filter((item: any) => item.status === "published")
          .length || 0,
      liveAgents:
        data?.agents.filter((item: any) => item.status === "published")
          .length || 0,
      liveStories:
        data?.caseStudies.filter((item: any) => item.status === "published")
          .length || 0,
      livePosts:
        data?.posts.filter((item: any) => item.status === "published").length ||
        0,
      newLeads:
        data?.leads.filter((item: any) => item.status === "new").length || 0,
    }),
    [data]
  );
  useEffect(() => {
    const requestedTab = shortcutParams.get("tab") as TabKey | null;
    if (requestedTab && tabs.some(item => item.key === requestedTab))
      setTab(requestedTab);
    if (shortcutParams.get("create") !== "1" || appliedShortcut.current) return;
    if (shortcutPropertyId > 0 && !shortcutProperty.data) return;
    setTab("properties");
    if (shortcutProperty.data) {
      const { id: propertyId, ...canonicalProperty } = shortcutProperty.data;
      setEditor({
        type: "property",
        initial: { ...canonicalProperty, propertyId, websiteShortcut: true },
      });
    } else {
      setEditor({ type: "property" });
    }
    appliedShortcut.current = true;
  }, [shortcutProperty.data, shortcutPropertyId]);
  if (overview.isLoading)
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
      </div>
    );
  if (overview.error) return <EmptyState>{overview.error.message}</EmptyState>;
  const sourceAgents = data?.sourceAgents || [];
  const actionForTab =
    tab === "properties" && can("canManageWebsiteProperties")
      ? () => setEditor({ type: "property" })
      : tab === "agents" && can("canManageWebsiteAgents")
        ? () => setEditor({ type: "agent" })
        : tab === "case-studies" && can("canManageWebsiteCaseStudies")
          ? () => setEditor({ type: "case" })
          : tab === "blog" && can("canManageWebsiteBlog")
            ? () => setEditor({ type: "post" })
            : null;
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#05314a] via-[#07546b] to-[#10c0df] p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100">
              <Globe2 className="h-4 w-4" />
              Website
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Savvy website studio
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-cyan-50">
              A CMS and intelligence layer for the next
              savvy-agents.com—connected to the same properties, pro-formas,
              agents, leads, listings, and transactions already in SavvyOS.
            </p>
          </div>
          <a href={PUBLIC_PREVIEW_URL} target="_blank" rel="noreferrer">
            <Button className="bg-white text-[#05314a] hover:bg-cyan-50">
              <ArrowUpRight className="mr-2 h-4 w-4" />
              Open staged site
            </Button>
          </a>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1 shadow-sm">
        {visibleTabs.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === item.key ? "bg-[#05314a] text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      {actionForTab && (
        <div className="flex justify-end">
          <Button onClick={actionForTab}>
            <Plus className="mr-2 h-4 w-4" />
            {tab === "properties"
              ? "Publish a SavvyOS property"
              : tab === "agents"
                ? "Feature a SavvyOS agent"
                : tab === "case-studies"
                  ? "Create case study"
                  : "Create blog post"}
          </Button>
        </div>
      )}
      {tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Live properties", counts.liveProperties, Building2],
              ["Live agents", counts.liveAgents, UserRound],
              ["Case studies", counts.liveStories, Sparkles],
              ["Blog posts", counts.livePosts, BookOpen],
              ["New inquiries", counts.newLeads, Mail],
            ].map(([label, value, Icon]: any) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-xl bg-cyan-50 p-3 text-cyan-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-950">{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>The first connected build</CardTitle>
              <CardDescription>
                Designed for a low-risk staged rollout at{" "}
                <strong>home.savvy-agents.com/newsite/</strong>, with clean
                routes that can move to the main domain later.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 font-semibold">Shared property graph</p>
                <p className="mt-1 text-sm text-slate-500">
                  Create a transaction, listing, or public website page from one
                  property record.
                </p>
              </div>
              <div className="rounded-xl border p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 font-semibold">Investor intelligence</p>
                <p className="mt-1 text-sm text-slate-500">
                  Reuse verified pro-forma revenue, cash-on-cash return, cap
                  rate, comps, and diligence work.
                </p>
              </div>
              <div className="rounded-xl border p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 font-semibold">Private by default</p>
                <p className="mt-1 text-sm text-slate-500">
                  All Website permissions default off. Super Permissions can
                  open individual capabilities later.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {tab === "properties" && (
        <RecordTable
          items={data?.properties || []}
          columns={["address", "city", "listPrice", "assignedAgentName"]}
          onEdit={item => setEditor({ type: "property", initial: item })}
          preview={item => `${PUBLIC_PREVIEW_URL}properties/${item.slug}`}
          title="SavvyOS properties on the website"
          description="Every row is one of your SavvyOS properties. This page controls how it appears publicly, not the property record itself."
          sourceHref={item =>
            item.propertyId ? `/properties/${item.propertyId}` : null
          }
          sourceLabel="Property record"
          onDelete={
            can("canManageWebsiteProperties")
              ? item => removeProperty(item)
              : undefined
          }
        />
      )}
      {tab === "agents" && (
        <RecordTable
          items={data?.agents || []}
          columns={["name", "headline"]}
          onEdit={item => setEditor({ type: "agent", initial: item })}
          preview={item => `${PUBLIC_PREVIEW_URL}agents/${item.slug}`}
          title="SavvyOS agents on the website"
          description="Every row is one of your SavvyOS agents. This page controls their public profile, not their agent record."
          sourceHref={item => (item.userId ? `/agents/${item.userId}` : null)}
          sourceLabel="Agent record"
        />
      )}
      {tab === "case-studies" && (
        <RecordTable
          items={data?.caseStudies || []}
          columns={["title", "eyebrow"]}
          onEdit={item => setEditor({ type: "case", initial: item })}
          preview={item => `${PUBLIC_PREVIEW_URL}case-studies/${item.slug}`}
        />
      )}
      {tab === "blog" && (
        <RecordTable
          items={data?.posts || []}
          columns={["title", "category"]}
          onEdit={item => setEditor({ type: "post", initial: item })}
          preview={item => `${PUBLIC_PREVIEW_URL}resources/${item.slug}`}
        />
      )}
      {tab === "leads" && can("canViewWebsiteLeads") && (
        <Card>
          <CardHeader>
            <CardTitle>Website leads</CardTitle>
            <CardDescription>
              Every public inquiry also creates or connects to a SavvyOS
              contact.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="p-3">Name</th>
                  <th className="p-3">Intent</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Message</th>
                  <th className="p-3">Received</th>
                </tr>
              </thead>
              <tbody>
                {(data?.leads || []).map((lead: any) => (
                  <tr key={lead.id} className="border-b">
                    <td className="p-3 font-medium">
                      {lead.firstName} {lead.lastName}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">{lead.intent}</Badge>
                    </td>
                    <td className="p-3">
                      <a
                        className="text-cyan-700 hover:underline"
                        href={`mailto:${lead.email}`}
                      >
                        {lead.email}
                      </a>
                    </td>
                    <td className="max-w-sm truncate p-3 text-slate-600">
                      {lead.message || "—"}
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(lead.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(data?.leads || []).length && (
              <EmptyState>No website inquiries yet.</EmptyState>
            )}
          </CardContent>
        </Card>
      )}
      {tab === "settings" && <SettingsEditor settings={data?.settings} />}
      {editor?.type === "property" && (
        <PropertyEditor
          initial={editor.initial}
          agents={sourceAgents}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === "agent" && (
        <AgentEditor
          initial={editor.initial}
          sourceAgents={sourceAgents}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === "case" && (
        <ContentEditor
          kind="case"
          initial={editor.initial}
          sourceAgents={sourceAgents}
          properties={data?.properties || []}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === "post" && (
        <ContentEditor
          kind="post"
          initial={editor.initial}
          sourceAgents={sourceAgents}
          properties={data?.properties || []}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function RecordTable({
  items,
  columns,
  onEdit,
  preview,
  title = "Content library",
  description = "Draft, publish, and update without touching the public site code.",
  sourceHref,
  sourceLabel = "SavvyOS record",
  onDelete,
}: {
  items: any[];
  columns: string[];
  onEdit: (item: any) => void;
  preview: (item: any) => string;
  title?: string;
  description?: string;
  /** Link back to the SavvyOS record this row is published from, when there is one. */
  sourceHref?: (item: any) => string | null;
  sourceLabel?: string;
  onDelete?: (item: any) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {items.length ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                {columns.map(column => (
                  <th key={column} className="p-3">
                    {column.replace(/([A-Z])/g, " $1")}
                  </th>
                ))}
                {sourceHref ? <th className="p-3">{sourceLabel}</th> : null}
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  {columns.map((column, index) => (
                    <td
                      key={column}
                      className={`max-w-sm p-3 ${index === 0 ? "font-semibold text-slate-950" : "text-slate-600"}`}
                    >
                      {column === "listPrice" && item[column]
                        ? `$${Number(item[column]).toLocaleString()}`
                        : item[column] || "—"}
                    </td>
                  ))}
                  {sourceHref ? (
                    <td className="p-3">
                      {sourceHref(item) ? (
                        <a
                          className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:underline"
                          href={sourceHref(item) as string}
                        >
                          Open record
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-400">Not linked</span>
                      )}
                    </td>
                  ) : null}
                  <td className="p-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <a href={preview(item)} target="_blank" rel="noreferrer">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Open public page"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit"
                        onClick={() => onEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {onDelete ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove from the website"
                          onClick={() => onDelete(item)}
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState>Create the first record in this section.</EmptyState>
        )}
      </CardContent>
    </Card>
  );
}
