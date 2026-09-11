import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe2, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Area,
  Field,
  MediaUpload,
  joinLines,
  numberOrNull,
  percentToRate,
  rateToPercent,
  slugify,
  splitLines,
} from "./websiteFormBits";

const PUBLIC_PROPERTY_PATH = "/newsite/properties/";

type Draft = {
  slug: string;
  status: "draft" | "published" | "archived";
  sourceProformaId: string;
  assignedAgentId: string;
  headline: string;
  summary: string;
  heroImageUrl: string;
  galleryImageUrls: string;
  featureTags: string;
  investmentHighlights: string;
  projectedRevenue: string;
  cashOnCash: string;
  capRate: string;
  occupancyRate: string;
  averageDailyRate: string;
  regulationSummary: string;
  callToActionText: string;
  metaTitle: string;
  metaDescription: string;
  isFeatured: boolean;
  sortOrder: string;
};

function blankDraft(fallbackSlug: string): Draft {
  return {
    slug: fallbackSlug,
    status: "draft",
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
  };
}

function draftFrom(website: any, fallbackSlug: string): Draft {
  if (!website) return blankDraft(fallbackSlug);
  return {
    slug: website.slug ?? fallbackSlug,
    status: website.status ?? "draft",
    sourceProformaId: website.sourceProformaId ? String(website.sourceProformaId) : "",
    assignedAgentId: website.assignedAgentId ? String(website.assignedAgentId) : "",
    headline: website.headline ?? "",
    summary: website.summary ?? "",
    heroImageUrl: website.heroImageUrl ?? "",
    galleryImageUrls: joinLines(website.galleryImageUrls),
    featureTags: joinLines(website.featureTags),
    investmentHighlights: joinLines(website.investmentHighlights),
    projectedRevenue: website.projectedRevenue ?? "",
    cashOnCash: rateToPercent(website.cashOnCash),
    capRate: rateToPercent(website.capRate),
    occupancyRate: rateToPercent(website.occupancyRate),
    averageDailyRate: website.averageDailyRate ?? "",
    regulationSummary: website.regulationSummary ?? "",
    callToActionText: website.callToActionText ?? "Request the full investment analysis",
    metaTitle: website.metaTitle ?? "",
    metaDescription: website.metaDescription ?? "",
    isFeatured: !!website.isFeatured,
    sortOrder: String(website.sortOrder ?? 0),
  };
}

/**
 * The public-website half of a property, edited on the property itself.
 *
 * This replaces the Website Studio's Properties tab. The studio kept a second
 * list of properties alongside the SavvyOS ones, which meant two places to
 * look and two things to keep in step. Everything here writes to the website
 * record attached to this property; the address, beds, baths and price stay
 * where they already are, on the property record above.
 */
export default function PropertyWebsiteTab({
  propertyId,
  address,
  city,
  state,
}: {
  propertyId: number;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  const utils = trpc.useUtils();
  const fallbackSlug = useMemo(
    () => slugify([address, city, state].filter(Boolean).join(" ")) || `property-${propertyId}`,
    [address, city, state, propertyId]
  );
  const content = trpc.website.propertyWebsiteContent.useQuery(
    { propertyId },
    { enabled: !!propertyId }
  );
  const [draft, setDraft] = useState<Draft>(() => blankDraft(fallbackSlug));
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  // Load the saved values once per property, not on every refetch, so a save
  // that returns fresh data does not stamp over whatever is being typed.
  useEffect(() => {
    if (content.isLoading || loadedFor === propertyId) return;
    setDraft(draftFrom(content.data?.website, fallbackSlug));
    setLoadedFor(propertyId);
  }, [content.isLoading, content.data, propertyId, fallbackSlug, loadedFor]);

  const save = trpc.website.savePropertyWebsiteContent.useMutation({
    onSuccess: async result => {
      toast.success(result.created ? "Added to the website." : "Website details saved.");
      await utils.website.propertyWebsiteContent.invalidate({ propertyId });
      await utils.website.propertyPublishState.invalidate({ propertyId });
    },
    onError: error => toast.error(error.message),
  });

  const canEdit = !!content.data?.canEdit;
  const website = content.data?.website;
  const proformaOptions = content.data?.proformas ?? [];
  const agentOptions = content.data?.agents ?? [];
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(prior => ({ ...prior, [key]: value }));

  if (content.isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading website details...
      </div>
    );
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Website</CardTitle>
          <CardDescription>
            {website
              ? "This property is on the public website. You do not have access to edit how it appears."
              : "You do not have access to publish this property to the website."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function submit() {
    save.mutate({
      propertyId,
      slug: slugify(draft.slug) || fallbackSlug,
      status: draft.status,
      sourceProformaId: draft.sourceProformaId ? Number(draft.sourceProformaId) : null,
      assignedAgentId: draft.assignedAgentId ? Number(draft.assignedAgentId) : null,
      headline: draft.headline || null,
      summary: draft.summary || null,
      heroImageUrl: draft.heroImageUrl || null,
      galleryImageUrls: splitLines(draft.galleryImageUrls),
      featureTags: splitLines(draft.featureTags),
      investmentHighlights: splitLines(draft.investmentHighlights),
      projectedRevenue: numberOrNull(draft.projectedRevenue),
      cashOnCash: percentToRate(draft.cashOnCash),
      capRate: percentToRate(draft.capRate),
      occupancyRate: percentToRate(draft.occupancyRate),
      averageDailyRate: numberOrNull(draft.averageDailyRate),
      regulationSummary: draft.regulationSummary || null,
      callToActionText: draft.callToActionText || "Request the full investment analysis",
      metaTitle: draft.metaTitle || null,
      metaDescription: draft.metaDescription || null,
      isFeatured: draft.isFeatured,
      sortOrder: Number(draft.sortOrder || 0),
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4" /> Public website
            </CardTitle>
            <CardDescription>
              How this property appears on the public site. The address and the
              numbers come from the property record, so they are edited above.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {website ? (
              <Badge
                className={
                  website.status === "published"
                    ? "bg-emerald-600 hover:bg-emerald-600"
                    : website.status === "archived"
                      ? "bg-slate-500"
                      : "bg-amber-500 hover:bg-amber-500"
                }
              >
                {website.status}
              </Badge>
            ) : (
              <Badge variant="outline">Not on the website</Badge>
            )}
            {website?.status === "published" && (
              <a
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                href={`${PUBLIC_PROPERTY_PATH}${website.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Public headline"
              value={draft.headline}
              onChange={value => set("headline", value)}
              placeholder="Turnkey coastal STR with strong summer demand"
            />
            <div>
              <Label>Assigned agent</Label>
              <Select
                value={draft.assignedAgentId || "none"}
                onValueChange={value => set("assignedAgentId", value === "none" ? "" : value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No agent</SelectItem>
                  {agentOptions.map((agent: any) => (
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
                value={draft.summary}
                onChange={value => set("summary", value)}
                placeholder="A short paragraph investors see on the listing card."
              />
            </div>
            <Field
              label="Public link"
              value={draft.slug}
              onChange={value => set("slug", slugify(value))}
              hint={`${PUBLIC_PROPERTY_PATH}${draft.slug || fallbackSlug}`}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photos and highlights</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Field
              label="Hero image URL"
              value={draft.heroImageUrl}
              onChange={value => set("heroImageUrl", value)}
            />
            <div className="mt-2">
              <MediaUpload
                onUploaded={url => {
                  set("heroImageUrl", url);
                  set(
                    "galleryImageUrls",
                    Array.from(new Set([url, ...splitLines(draft.galleryImageUrls)])).join("\n")
                  );
                }}
              />
            </div>
          </div>
          <Area
            label="Gallery image URLs"
            value={draft.galleryImageUrls}
            onChange={value => set("galleryImageUrls", value)}
            rows={5}
            hint="One per line."
          />
          <Area
            label="Feature tags"
            value={draft.featureTags}
            onChange={value => set("featureTags", value)}
            hint="One per line. Shown as small labels on the listing."
          />
          <Area
            label="Investment highlights"
            value={draft.investmentHighlights}
            onChange={value => set("investmentHighlights", value)}
            hint="One per line. The bullet points investors read first."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Investor numbers</CardTitle>
          <CardDescription>
            Shown on the public listing. Leave a field blank to hide it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {proformaOptions.length > 0 && (
            <div>
              <Label>Copy numbers from a pro-forma</Label>
              <Select
                value={draft.sourceProformaId || "none"}
                onValueChange={value => set("sourceProformaId", value === "none" ? "" : value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a pro-forma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Enter the numbers manually</SelectItem>
                  {proformaOptions.map((item: any) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.title}
                      {item.grossRevenue
                        ? ` - $${Number(item.grossRevenue).toLocaleString()} revenue`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Blank fields below are filled from the pro-forma on save. Anything you type wins.
              </p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-5">
            <Field
              label="Projected annual revenue"
              value={draft.projectedRevenue}
              onChange={value => set("projectedRevenue", value)}
            />
            <Field
              label="Cash-on-cash %"
              value={draft.cashOnCash}
              onChange={value => set("cashOnCash", value)}
            />
            <Field
              label="Cap rate %"
              value={draft.capRate}
              onChange={value => set("capRate", value)}
            />
            <Field
              label="Occupancy %"
              value={draft.occupancyRate}
              onChange={value => set("occupancyRate", value)}
            />
            <Field
              label="Average daily rate"
              value={draft.averageDailyRate}
              onChange={value => set("averageDailyRate", value)}
            />
          </div>
          <Area
            label="Regulation and diligence summary"
            value={draft.regulationSummary}
            onChange={value => set("regulationSummary", value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search listing and visibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Meta title"
              value={draft.metaTitle}
              onChange={value => set("metaTitle", value)}
            />
            <Field
              label="Call to action label"
              value={draft.callToActionText}
              onChange={value => set("callToActionText", value)}
            />
            <div className="md:col-span-2">
              <Area
                label="Meta description"
                value={draft.metaDescription}
                onChange={value => set("metaDescription", value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <Label>Visibility</Label>
                <Select value={draft.status} onValueChange={value => set("status", value as Draft["status"])}>
                  <SelectTrigger className="mt-1 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft, not public</SelectItem>
                    <SelectItem value="published">Published, live</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Order</Label>
                <input
                  className="mt-1 h-10 w-24 rounded-md border border-input bg-background px-3 text-sm"
                  type="number"
                  value={draft.sortOrder}
                  onChange={event => set("sortOrder", event.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm font-medium">
                <Switch
                  checked={draft.isFeatured}
                  onCheckedChange={value => set("isFeatured", value)}
                />
                Feature on the homepage
              </label>
            </div>
            <Button disabled={save.isPending} onClick={submit}>
              {save.isPending
                ? "Saving..."
                : website
                  ? "Save website details"
                  : draft.status === "published"
                    ? "Publish to the website"
                    : "Create website draft"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
