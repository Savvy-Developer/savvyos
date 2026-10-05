import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, Globe2, Loader2 } from "lucide-react";
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
import {
  missingForPublish,
  publishBlockedMessage,
} from "@shared/websitePublishChecklist";
import {
  AMENITY_TAGS,
  STRATEGY_TAGS,
  splitTags,
} from "./propertyTagOptions";
import { WriteWithAiButton } from "./WriteWithAiButton";

const PUBLIC_PROPERTY_PATH = "/newsite/properties/";
const PUBLIC_SITE_ORIGIN = `https://${(import.meta.env.VITE_PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase()}`;

/** Mirrors HOMEPAGE_FEATURED_LIMIT in server/routers/website.ts. */
const HOMEPAGE_FEATURED_LIMIT = 6;
const AUTOSAVE_DELAY_MS = 2500;
const unsavedKey = (propertyId: number) => `savvyos:website-listing-unsaved:${propertyId}`;

/** Edits not yet on the server, kept per property in this browser. */
function readUnsavedEdits(propertyId: number): { draft: Partial<Draft>; at: number } | null {
  try {
    const raw = window.localStorage.getItem(unsavedKey(propertyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.draft ? parsed : null;
  } catch {
    return null;
  }
}
function writeUnsavedEdits(propertyId: number, draft: Draft) {
  try {
    window.localStorage.setItem(unsavedKey(propertyId), JSON.stringify({ draft, at: Date.now() }));
  } catch {
    // Storage full or blocked: auto-save still works for drafts.
  }
}
function clearUnsavedEdits(propertyId: number) {
  try {
    window.localStorage.removeItem(unsavedKey(propertyId));
  } catch {
    // Nothing to clear.
  }
}

type Draft = {
  slug: string;
  status: "draft" | "published" | "archived";
  sourceProformaId: string;
  sourceUrl: string;
  assignedAgentId: string;
  headline: string;
  summary: string;
  agentBlurb: string;
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
};

function blankDraft(fallbackSlug: string): Draft {
  return {
    slug: fallbackSlug,
    status: "draft",
    sourceProformaId: "",
    sourceUrl: "",
    assignedAgentId: "",
    headline: "",
    summary: "",
    agentBlurb: "",
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
  };
}

function draftFrom(website: any, fallbackSlug: string): Draft {
  if (!website) return blankDraft(fallbackSlug);
  return {
    slug: website.slug ?? fallbackSlug,
    status: website.status ?? "draft",
    sourceProformaId: website.sourceProformaId ? String(website.sourceProformaId) : "",
    sourceUrl: website.sourceUrl ?? "",
    assignedAgentId: website.assignedAgentId ? String(website.assignedAgentId) : "",
    headline: website.headline ?? "",
    summary: website.summary ?? "",
    agentBlurb: website.agentBlurb ?? "",
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
  };
}

/**
 * Pick the property's tags from a fixed list instead of typing them.
 *
 * Free text is how the same idea ends up on the site as "Hot tub", "hot-tub"
 * and "Hottub", which quietly breaks filtering: a visitor looking for one of
 * those sees a third of the properties that have it. The list is stored in the
 * same featureTags field as before, so nothing about the data changes.
 *
 * Tags written before this existed are matched to the list where they can be,
 * ignoring case and hyphens, and kept as they are where they cannot. Dropping
 * someone's tags on first save would be a nasty surprise.
 */
function TagPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { known, custom } = splitTags(splitLines(value));
  const selected = new Set<string>(known);

  const write = (next: Set<string>, nextCustom: string[]) =>
    onChange([...Array.from(next), ...nextCustom].join("\n"));

  const toggle = (tag: string) => {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    write(next, custom);
  };

  const group = (label: string, tags: readonly string[]) => (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {tags.map(tag => {
          const on = selected.has(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              aria-pressed={on}
              className={
                on
                  ? "rounded-full border border-cyan-600 bg-cyan-600 px-2.5 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-input bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
              }
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <Label>Feature tags</Label>
      {group("Strategy", STRATEGY_TAGS)}
      {group("Amenities", AMENITY_TAGS)}
      {custom.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Not in the standard list
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {custom.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  write(selected, custom.filter(item => item !== tag))
                }
                title="Remove this tag"
                className="rounded-full border border-dashed border-input bg-background px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                {tag} &times;
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            These were typed in before the standard list existed. They still
            show on the listing. Click one to remove it.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Says, in one line, exactly what the linked pro-forma will put on the public
 * listing.
 *
 * Without this the feature has a silent failure mode. An empty section on the
 * public page has three possible causes that look identical from here: the
 * pro-forma is still a draft, its revenue scenarios were never filled in, or
 * nothing is linked at all. The first person to hit that reasonably concludes
 * the feature is broken. The verdict shown here is computed on the server with
 * the same functions the public page uses, so it cannot drift from what a
 * visitor actually sees.
 */
function ProformaPublishState({
  proforma,
  listingPublished,
  propertyId,
}: {
  proforma: any;
  listingPublished: boolean;
  propertyId: number;
}) {
  const utils = trpc.useUtils();
  const markFinal = trpc.properties.setProformaStatus.useMutation({
    onSuccess: async () => {
      await utils.website.propertyWebsiteContent.invalidate({ propertyId });
      toast.success("Pro-forma marked final. Its revenue range and comps can now show on the listing.");
    },
    onError: error => toast.error(error.message),
  });
  if (!proforma) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        No pro-forma linked, so the public listing shows no revenue range and no
        comparable properties.
      </p>
    );
  }

  if (proforma.blockedByDraft) {
    return (
      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
        This pro-forma is a <strong>draft</strong>, so nothing from it reaches
        the public listing. Mark it final to publish its revenue range and
        comparable properties.{" "}
        <button
          type="button"
          className="font-semibold underline underline-offset-2 disabled:opacity-50"
          disabled={markFinal.isPending}
          onClick={() => markFinal.mutate({ id: proforma.id, status: "final" })}
        >
          {markFinal.isPending ? "Marking final..." : "Mark it final now"}
        </button>
      </p>
    );
  }

  if (!proforma.revenue && proforma.compCount === 0) {
    return (
      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
        This pro-forma is final but has no revenue scenarios and no comparable
        properties filled in, so there is nothing to publish yet.
      </p>
    );
  }

  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);

  const parts: string[] = [];
  if (proforma.revenue) {
    parts.push(
      proforma.revenue.single
        ? `a projected ${money(proforma.revenue.low)} a year`
        : `a range of ${money(proforma.revenue.low)} to ${money(proforma.revenue.high)} a year`
    );
  }
  if (proforma.compCount > 0) {
    parts.push(
      proforma.compCount === 1
        ? "1 comparable property"
        : `${proforma.compCount} comparable properties`
    );
  }

  return (
    <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
      The public listing will show {parts.join(" and ")}, read live from this
      pro-forma rather than copied.
      {!listingPublished && (
        <>
          {" "}
          It appears once this listing itself is set to published; until then the team can check it with Preview draft.
        </>
      )}
    </p>
  );
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
  // What the server has, as the save body; edits are compared against it.
  const [savedBody, setSavedBody] = useState<string | null>(null);
  useEffect(() => {
    if (content.isLoading || loadedFor === propertyId) return;
    const fromServer = draftFrom(content.data?.website, fallbackSlug);
    setSavedBody(JSON.stringify(payloadFor(fromServer, !!content.data?.website)));
    // Edits that never reached the server (a live listing not yet saved, or
    // an auto-save that could not finish) are kept in this browser. Bring
    // them back rather than lose them.
    const unsaved = readUnsavedEdits(propertyId);
    if (unsaved && JSON.stringify({ ...fromServer, ...unsaved.draft }) !== JSON.stringify(fromServer)) {
      setDraft({ ...fromServer, ...unsaved.draft });
      toast.info(`Brought back changes you had not saved (${new Date(unsaved.at).toLocaleString()}).`, {
        duration: 15000,
        action: {
          label: "Discard them",
          onClick: () => {
            clearUnsavedEdits(propertyId);
            setDraft(fromServer);
          },
        },
      });
    } else {
      clearUnsavedEdits(propertyId);
      setDraft(fromServer);
    }
    setLoadedFor(propertyId);
  }, [content.isLoading, content.data, propertyId, fallbackSlug, loadedFor]);

  // The body each save sent, so the form knows what reached the server.
  const sentBody = useRef<string | null>(null);
  // The server may give the listing a different address than the one sent
  // (taken already, or none typed). Take it into the form, so the next save
  // does not ask for the taken one again and get yet another number.
  const settleSaved = (sent: string | null, slug: string | undefined) => {
    if (!sent) return;
    const body = JSON.parse(sent);
    const sentSlug = body.slug;
    if (slug && sentSlug !== undefined && sentSlug !== slug) {
      body.slug = slug;
      setDraft(prior => (slugify(prior.slug) === sentSlug ? { ...prior, slug } : prior));
    }
    setSavedBody(JSON.stringify(body));
  };
  const save = trpc.website.savePropertyWebsiteContent.useMutation({
    onSuccess: async result => {
      toast.success(result.created ? "Added to the website." : "Website details saved.");
      settleSaved(sentBody.current, result.slug);
      await utils.website.propertyWebsiteContent.invalidate({ propertyId });
      await utils.website.propertyPublishState.invalidate({ propertyId });
    },
    onError: error => toast.error(error.message),
  });
  // Auto-save (1 Oct call: Tyler's entries were gone when he came back).
  // Drafts only: a few seconds after typing stops, the draft is saved. A live
  // listing is never changed without clicking Save; its edits wait in this
  // browser instead.
  const autoSentBody = useRef<string | null>(null);
  const lastAutoError = useRef<string | null>(null);
  const autoSave = trpc.website.savePropertyWebsiteContent.useMutation({
    onSuccess: async result => {
      lastAutoError.current = null;
      settleSaved(autoSentBody.current, result.slug);
      await utils.website.propertyWebsiteContent.invalidate({ propertyId });
      await utils.website.propertyPublishState.invalidate({ propertyId });
    },
    onError: error => {
      if (lastAutoError.current !== error.message) toast.error(`Auto-save did not work: ${error.message}`);
      lastAutoError.current = error.message;
    },
  });

  // Two buttons share the Zillow lookup: "Import photos from Zillow" under
  // Photos, and "Import from Zillow" beside Public summary, which also brings
  // the listing description in (25 Sep call: Tyler wanted it by the summary).
  const [zillowTarget, setZillowTarget] = useState<"photos" | "summary">("photos");
  const [zillowPasteOpen, setZillowPasteOpen] = useState(false);
  const importZillow = trpc.website.importZillowPhotos.useMutation({
    onSuccess: result => {
      const withSummary = zillowTarget === "summary";
      const existing = splitLines(draft.galleryImageUrls);
      const gallery = Array.from(new Set([...existing, ...result.photos]));
      const added = gallery.length - existing.length;
      const description = withSummary ? (result.description ?? "") : "";
      const summaryFilled = !!description && !draft.summary.trim();
      setDraft(prior => ({
        ...prior,
        sourceUrl: result.zillowUrl,
        // Blank fills in, anything already there wins: the hero is only set
        // when there isn't one, the gallery keeps what it had, and a summary
        // someone already wrote is never replaced.
        heroImageUrl: prior.heroImageUrl || result.photos[0] || "",
        galleryImageUrls: gallery.join("\n"),
        summary: prior.summary.trim() || !description ? prior.summary : description,
      }));
      setZillowPasteOpen(false);
      const photoNote =
        added > 0
          ? `Added ${added} photo${added === 1 ? "" : "s"} from Zillow.`
          : result.photos.length
            ? "Those Zillow photos are already in the gallery."
            : "Zillow had no photos for it.";
      const summaryNote = !withSummary
        ? ""
        : summaryFilled
          ? " Filled the public summary from the Zillow description."
          : description
            ? " The public summary already had text, so it was kept."
            : " Zillow had no description for it.";
      toast.success(`${photoNote}${summaryNote}`);
    },
    onError: error => toast.error(error.message),
  });
  const runZillowImport = (target: "photos" | "summary") => {
    setZillowTarget(target);
    importZillow.mutate({ propertyId, zillowUrl: zillowLink.trim() });
  };

  const canEdit = !!content.data?.canEdit;
  const website = content.data?.website;
  const proformaOptions = content.data?.proformas ?? [];
  // The Zillow link to import from: the one saved on the listing, else the
  // linked pro-forma's own property link, else any pro-forma's. Never a comp.
  const proformaZillowUrl =
    (proformaOptions.find((item: any) => String(item.id) === draft.sourceProformaId) as any)?.zillowUrl ||
    (proformaOptions.find((item: any) => item.zillowUrl) as any)?.zillowUrl ||
    "";
  const zillowLink = draft.sourceUrl || proformaZillowUrl;
  const agentOptions = content.data?.agents ?? [];
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(prior => ({ ...prior, [key]: value }));

  function payloadFor(form: Draft, exists: boolean) {
    // An existing listing keeps its address while the link is being retyped
    // (under three characters is not a link yet).
    const typedSlug = slugify(form.slug);
    return {
      propertyId,
      slug: typedSlug.length >= 3 ? typedSlug : exists ? undefined : fallbackSlug,
      status: form.status,
      sourceProformaId: form.sourceProformaId ? Number(form.sourceProformaId) : null,
      sourceUrl: form.sourceUrl.trim() || null,
      assignedAgentId: form.assignedAgentId ? Number(form.assignedAgentId) : null,
      headline: form.headline || null,
      summary: form.summary || null,
      agentBlurb: form.agentBlurb || null,
      heroImageUrl: form.heroImageUrl || null,
      galleryImageUrls: splitLines(form.galleryImageUrls),
      featureTags: splitLines(form.featureTags),
      investmentHighlights: splitLines(form.investmentHighlights),
      projectedRevenue: numberOrNull(form.projectedRevenue),
      cashOnCash: percentToRate(form.cashOnCash),
      capRate: percentToRate(form.capRate),
      occupancyRate: percentToRate(form.occupancyRate),
      averageDailyRate: numberOrNull(form.averageDailyRate),
      regulationSummary: form.regulationSummary || null,
      callToActionText: form.callToActionText || "Request the full investment analysis",
      metaTitle: form.metaTitle || null,
      metaDescription: form.metaDescription || null,
      isFeatured: form.isFeatured,
    };
  }

  const listingExists = !!content.data?.website;
  const savedStatus: Draft["status"] | null = content.data?.website?.status ?? null;
  const body = JSON.stringify(payloadFor(draft, listingExists));
  const ready = loadedFor === propertyId && savedBody !== null;
  const unsavedChanges = ready && body !== savedBody;
  const canAutoSave = draft.status === "draft" && (savedStatus === null || savedStatus === "draft");

  useEffect(() => {
    if (!ready || !content.data?.canEdit) return;
    if (!unsavedChanges) {
      clearUnsavedEdits(propertyId);
      return;
    }
    writeUnsavedEdits(propertyId, draft);
    if (!canAutoSave || save.isPending || autoSave.isPending) return;
    const timer = window.setTimeout(() => {
      autoSentBody.current = body;
      autoSave.mutate({ ...payloadFor(draft, listingExists), autosave: true });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // body captures every field; the pending flags re-run it once a save ends.
  }, [body, savedBody, ready, canAutoSave, save.isPending, autoSave.isPending]);

  if (content.isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading website details...
      </div>
    );
  }

  // A failed load is not the same as having no access. Before this, any
  // server error here (such as the missing price-drop column in September)
  // showed "You do not have access to publish this property", which sent
  // people looking at permissions instead of at the actual fault.
  if (content.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Website</CardTitle>
          <CardDescription>
            The website details could not be loaded: {content.error.message}. This
            is a server problem, not a permissions one. Try again in a minute, and
            report it if it keeps happening.
          </CardDescription>
        </CardHeader>
      </Card>
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

  const missing =
    draft.status === "published"
      ? missingForPublish({
          ...(content.data?.facts ?? {}),
          heroImageUrl: draft.heroImageUrl,
          galleryImageUrls: splitLines(draft.galleryImageUrls),
        })
      : [];

  // What "Write with AI" reads from the form: the listing as it is right now.
  const aiContent = () => ({
    headline: draft.headline,
    summary: draft.summary,
    agentBlurb: draft.agentBlurb,
    featureTags: splitLines(draft.featureTags),
    investmentHighlights: splitLines(draft.investmentHighlights),
    projectedAnnualRevenue: draft.projectedRevenue,
    cashOnCashPercent: draft.cashOnCash,
    capRatePercent: draft.capRate,
    occupancyPercent: draft.occupancyRate,
    averageDailyRate: draft.averageDailyRate,
    regulationSummary: draft.regulationSummary,
  });

  function submit() {
    sentBody.current = body;
    save.mutate(payloadFor(draft, listingExists));
  }

  const autoSaveNote = !ready
    ? ""
    : autoSave.isPending
      ? "Saving draft..."
      : !unsavedChanges
        ? listingExists
          ? "All changes saved."
          : ""
        : canAutoSave
          ? "Unsaved changes. Saving the draft in a moment."
          : savedStatus === "published"
            ? "Unsaved changes. Click Save to update the live listing. They are kept in this browser until then."
            : "Unsaved changes. Click the button to save. They are kept in this browser until then.";

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
                href={`${PUBLIC_SITE_ORIGIN}${PUBLIC_PROPERTY_PATH}${website.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {website?.status === "draft" && (
              <a
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                href={`${PUBLIC_SITE_ORIGIN}${PUBLIC_PROPERTY_PATH}${website.slug}`}
                target="_blank"
                rel="noreferrer"
                title="Drafts show only to Savvy team members signed in on the website with their SavvyOS login."
              >
                Preview draft <ExternalLink className="h-3 w-3" />
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
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    disabled={importZillow.isPending}
                    onClick={() => (zillowLink.trim() ? runZillowImport("summary") : setZillowPasteOpen(open => !open))}
                    title="Fills the summary from the Zillow description (only if it's empty) and adds the listing's photos."
                  >
                    {importZillow.isPending && zillowTarget === "summary" ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3 w-3" />
                    )}
                    Import from Zillow
                  </Button>
                }
              />
              {/* Stays open while the link is typed: it used to vanish after
                  the first character, so only a one-shot paste worked. */}
              {zillowPasteOpen && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    autoFocus
                    value={draft.sourceUrl}
                    onChange={event => set("sourceUrl", event.target.value)}
                    placeholder="Paste the Zillow link: https://www.zillow.com/homedetails/..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!draft.sourceUrl.trim() || importZillow.isPending}
                    onClick={() => runZillowImport("summary")}
                  >
                    <Download className="mr-2 h-4 w-4" /> Import description and photos
                  </Button>
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <Area
                label="Why I like this property"
                value={draft.agentBlurb}
                onChange={value => set("agentBlurb", value)}
                placeholder="In the assigned agent's own words. Shown as a quote with their name on it, and only to investors who have signed in."
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
          <div className="rounded-lg border border-dashed p-3 md:col-span-2">
            <Label className="text-sm">Zillow listing link</Label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <Input
                value={zillowLink}
                onChange={event => set("sourceUrl", event.target.value)}
                placeholder="https://www.zillow.com/homedetails/..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!zillowLink.trim() || importZillow.isPending}
                onClick={() => runZillowImport("photos")}
              >
                {importZillow.isPending && zillowTarget === "photos" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Import photos from Zillow
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {draft.sourceUrl
                ? "Pulls every photo of this listing into the gallery, and sets the hero if it's empty."
                : proformaZillowUrl
                  ? "Filled from the pro-forma's property link. Pulls every photo of this listing (never comps) into the gallery, and sets the hero if it's empty."
                  : "Paste this property's Zillow link. Pulls every photo into the gallery, and sets the hero if it's empty."}
            </p>
          </div>
          <div>
            <Field
              label="Hero image URL"
              value={draft.heroImageUrl}
              onChange={value => set("heroImageUrl", value)}
            />
            <div className="mt-2">
              <MediaUpload propertyId={propertyId}
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
          <TagPicker
            value={draft.featureTags}
            onChange={value => set("featureTags", value)}
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
              <Label>Link a pro-forma</Label>
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
              <ProformaPublishState
                proforma={proformaOptions.find(
                  (item: any) => String(item.id) === draft.sourceProformaId
                )}
                listingPublished={draft.status === "published"}
                propertyId={propertyId}
              />
            </div>
          )}
          <ProformaNumbersHint
            proforma={proformaOptions.find((item: any) => String(item.id) === draft.sourceProformaId)}
            hasProformas={proformaOptions.length > 0}
            propertyId={propertyId}
            draft={draft}
            onUse={values => setDraft(current => ({ ...current, ...values }))}
          />
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
              hint="The blue link in Google results. Up to about 60 characters."
              action={
                <WriteWithAiButton
                  kind="property"
                  propertyId={propertyId}
                  sourceProformaId={draft.sourceProformaId ? Number(draft.sourceProformaId) : null}
                  content={aiContent}
                  onWritten={written => written.metaTitle && set("metaTitle", written.metaTitle)}
                />
              }
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
                hint={`The text under the link in Google results. About 140 to 155 characters${
                  draft.metaDescription ? ` (now ${draft.metaDescription.length})` : ""
                }.`}
                action={
                  <WriteWithAiButton
                    kind="property"
                    propertyId={propertyId}
                    sourceProformaId={draft.sourceProformaId ? Number(draft.sourceProformaId) : null}
                    content={aiContent}
                    onWritten={written => written.metaDescription && set("metaDescription", written.metaDescription)}
                  />
                }
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
              <div className="pb-1">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Switch
                    checked={draft.isFeatured}
                    onCheckedChange={value => set("isFeatured", value)}
                  />
                  Feature on the homepage
                </label>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  The homepage shows the {HOMEPAGE_FEATURED_LIMIT} most recently featured live listings. Featuring a new
                  one moves the oldest off.
                </p>
              </div>
            </div>
            {missing.length > 0 && (
              <p className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {publishBlockedMessage(missing)} Price, beds, baths and ZIP: use
                "Edit details" on the property's Overview tab. Photos go in this form.
              </p>
            )}
            <div className="ml-auto flex flex-col items-end gap-1">
            {autoSaveNote && <p className="text-xs text-muted-foreground">{autoSaveNote}</p>}
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * "Use the pro-forma numbers", shown whenever a pro-forma is linked (1 Oct
 * call: it used to appear only once a number had been typed that differed
 * from the pro-forma, so with empty fields there was no button at all).
 * When the typed numbers differ it also says so, since saved numbers are
 * reloaded into the form and could otherwise show last month's figures.
 */
function ProformaNumbersHint({
  proforma,
  hasProformas,
  propertyId,
  draft,
  onUse,
}: {
  proforma: any;
  hasProformas: boolean;
  propertyId: number;
  draft: { projectedRevenue: string; cashOnCash: string; capRate: string };
  onUse: (values: { projectedRevenue: string; cashOnCash: string; capRate: string }) => void;
}) {
  // The button always shows. With nothing linked it is disabled and says what
  // to do first (Rock 1 punch list).
  if (!proforma) {
    return (
      <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <p>
          {hasProformas
            ? "Link a pro-forma above first, then its numbers can fill these fields."
            : "This property has no pro-forma yet. Create one, then link it here to use its numbers."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled>
            Use the pro-forma numbers
          </Button>
          {!hasProformas && (
            <Button type="button" size="sm" variant="link" asChild>
              <a href={`/properties/${propertyId}/proforma?new=true`}>Create a pro-forma</a>
            </Button>
          )}
        </div>
      </div>
    );
  }
  // Rounded so 0.0375 shows as 3.75, not 3.7499999999999996.
  const tidy = (value: string) => (value === "" ? "" : String(Math.round(Number(value) * 100) / 100));
  const fromProforma = {
    projectedRevenue: proforma.grossRevenue == null ? "" : tidy(String(proforma.grossRevenue)),
    cashOnCash: tidy(rateToPercent(proforma.cashOnCash)),
    capRate: tidy(rateToPercent(proforma.capRate)),
  };
  const hasNumbers = !!(fromProforma.projectedRevenue || fromProforma.cashOnCash || fromProforma.capRate);
  const differs = (a: string, b: string) =>
    (a || "") !== "" && (b || "") !== "" && Math.abs(Number(a) - Number(b)) > 0.005;
  const mismatch =
    differs(draft.projectedRevenue, fromProforma.projectedRevenue) ||
    differs(draft.cashOnCash, fromProforma.cashOnCash) ||
    differs(draft.capRate, fromProforma.capRate);
  const same = (a: string, b: string) => (a || "") === (b || "") || (!differs(a, b) && a !== "" && b !== "");
  const alreadyUsed =
    hasNumbers &&
    same(draft.projectedRevenue, fromProforma.projectedRevenue) &&
    same(draft.cashOnCash, fromProforma.cashOnCash) &&
    same(draft.capRate, fromProforma.capRate);
  const show = (value: string, suffix: string, prefix = "") => (value === "" ? "none" : `${prefix}${value}${suffix}`);
  const summary = `revenue ${show(fromProforma.projectedRevenue, "", "$")}, cash-on-cash ${show(
    fromProforma.cashOnCash,
    "%"
  )}, cap rate ${show(fromProforma.capRate, "%")}`;
  return (
    <div
      className={
        mismatch
          ? "rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          : "rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground"
      }
    >
      <p>
        {!hasNumbers
          ? "The linked pro-forma has no revenue numbers yet. Fill in its revenue scenarios first."
          : mismatch
            ? `These numbers differ from the linked pro-forma (${summary}). Keep them only if you typed them on purpose.`
            : alreadyUsed
              ? `Using the linked pro-forma's numbers (base case): ${summary}.`
              : `The linked pro-forma's numbers (base case): ${summary}.`}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={!hasNumbers}
        onClick={() => onUse(fromProforma)}
      >
        Use the pro-forma numbers
      </Button>
    </div>
  );
}
