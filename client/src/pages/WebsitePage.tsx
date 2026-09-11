import { useEffect, useMemo, useState } from "react";
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
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import WebsiteRichTextEditor from "@/components/WebsiteRichTextEditor";
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
  | "case-studies"
  | "blog"
  | "leads"
  | "settings";
type Status = "draft" | "published" | "archived";

const tabs: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "overview", label: "Overview", icon: Globe2 },
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
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Article / story body
          </Label>
          <div className="mt-1">
            <WebsiteRichTextEditor
              value={draft.body || ""}
              onChange={value => set("body", value)}
            />
          </div>
        </div>
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
  const [tab, setTab] = useState<TabKey>("overview");
  const [editor, setEditor] = useState<{
    type: "case" | "post";
    initial?: any;
  } | null>(null);
  const [, navigate] = useLocation();
  const shortcutParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const shortcutPropertyId = /^\d+$/.test(
    shortcutParams.get("propertyId") ?? ""
  )
    ? Number(shortcutParams.get("propertyId"))
    : 0;
  const overview = trpc.website.adminOverview.useQuery();
  const pageUtils = trpc.useUtils();
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
  // Properties and agents are no longer edited here: a property's public
  // listing lives on the property, and an agent's public profile on the agent.
  // Old links into those tabs are forwarded rather than left on a dead tab.
  useEffect(() => {
    const requestedTab = shortcutParams.get("tab");
    if (requestedTab === "properties") {
      navigate(
        shortcutPropertyId > 0
          ? `/properties/${shortcutPropertyId}?tab=website`
          : "/properties"
      );
      return;
    }
    if (requestedTab === "agents") {
      navigate("/agents");
      return;
    }
    if (requestedTab && tabs.some(item => item.key === requestedTab))
      setTab(requestedTab as TabKey);
  }, [shortcutPropertyId]);
  if (overview.isLoading)
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
      </div>
    );
  if (overview.error) return <EmptyState>{overview.error.message}</EmptyState>;
  const sourceAgents = data?.sourceAgents || [];
  const actionForTab =
    tab === "case-studies" && can("canManageWebsiteCaseStudies")
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
            {tab === "case-studies" ? "Create case study" : "Create blog post"}
          </Button>
        </div>
      )}
      {tab === "overview" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Live properties", counts.liveProperties, Building2, "/properties"],
              ["Live agents", counts.liveAgents, UserRound, "/agents"],
              ["Case studies", counts.liveStories, Sparkles, null],
              ["Blog posts", counts.livePosts, BookOpen, null],
              ["New inquiries", counts.newLeads, Mail, null],
            ].map(([label, value, Icon, href]: any) => (
              <Card
                key={label}
                className={href ? "cursor-pointer transition hover:border-cyan-400" : undefined}
                onClick={href ? () => navigate(href) : undefined}
              >
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
                <p className="mt-3 font-semibold">Edited where the record lives</p>
                <p className="mt-1 text-sm text-slate-500">
                  A property's public listing is on the property page, under
                  Website. An agent's public profile is on their agent page.
                  There is no second list to keep in step.
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
