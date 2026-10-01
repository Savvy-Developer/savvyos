import { useMemo, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import WebsiteRichTextEditor from "@/components/WebsiteRichTextEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { parseTagText } from "@shared/websiteContentFilters";
import { Input } from "@/components/ui/input";
import { Area, Field, MediaUpload, slugify } from "./websiteFormBits";
import { WriteWithAiButton } from "./WriteWithAiButton";

/** "2026-08-04T01:08:30.319Z" to "2026-08-04" for a date input; "" if none. */
function dateInputValue(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * The case study and blog post editor. Used by admins in Website Studio and,
 * with mode="agent", by agents on My Website for their own content. Moved out
 * of WebsitePage.tsx so both screens share one editor.
 */
export function ContentEditor({
  kind,
  initial,
  sourceAgents,
  properties,
  onClose,
  mode = "studio",
}: {
  kind: "case" | "post";
  initial?: any;
  sourceAgents: any[];
  properties: any[];
  onClose: () => void;
  /**
   * "studio": an admin in Website Studio, who can credit any agent and
   * feature content. "agent": an agent on My Website, writing their own; the
   * byline is theirs, the property list is theirs, and featuring stays with
   * admins.
   */
  mode?: "studio" | "agent";
}) {
  const utils = trpc.useUtils();
  const isCase = kind === "case";
  const isAgent = mode === "agent";
  const [draft, setDraft] = useState<any>(() =>
    initial
      ? {
          ...initial,
          // Stored as a decimal string ("1140000.00"); edited as a plain number.
          investmentAmount:
            initial.investmentAmount == null
              ? ""
              : String(Number(initial.investmentAmount)),
          tagsText: Array.isArray(initial.tags) ? initial.tags.join(", ") : "",
          publishedDate: dateInputValue(initial.publishedAt),
        }
      : {
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
      investmentAmount: "",
      category: "STR Investing",
      tagsText: "",
      metaTitle: "",
      metaDescription: "",
      status: "draft",
      isFeatured: false,
      sortOrder: 0,
    }
  );
  // Digits only, so "$1,140,000" pastes in as 1140000.
  const investmentNumber = (() => {
    const digits = String(draft.investmentAmount ?? "").replace(/[^\d.]/g, "");
    return digits ? Number(digits) : null;
  })();
  const saved = async (what: string, status?: string) => {
    await Promise.all([
      utils.website.adminOverview.invalidate(),
      utils.website.myWebsiteContent.invalidate(),
    ]);
    toast.success(status === "published" ? `${what} saved. It is live on the website.` : `${what} saved.`);
    onClose();
  };
  const onError = (error: { message: string }) => toast.error(error.message);
  const saveCaseStudio = trpc.website.saveCaseStudy.useMutation({ onSuccess: () => saved("Case study"), onError });
  const savePostStudio = trpc.website.savePost.useMutation({ onSuccess: () => saved("Blog post"), onError });
  const saveCaseAgent = trpc.website.saveMyCaseStudy.useMutation({ onSuccess: r => saved("Case study", r.status), onError });
  const savePostAgent = trpc.website.saveMyPost.useMutation({ onSuccess: r => saved("Blog post", r.status), onError });
  const saveCase = isAgent ? saveCaseAgent : saveCaseStudio;
  const savePost = isAgent ? savePostAgent : savePostStudio;
  const set = (key: string, value: any) =>
    setDraft((prior: any) => ({ ...prior, [key]: value }));
  const imageKey = isCase ? "heroImageUrl" : "coverImageUrl";
  // What "Write with AI" reads: the post or story as it is right now.
  const aiContent = () =>
    isCase
      ? {
          title: draft.title,
          eyebrow: draft.eyebrow,
          body: draft.body,
          primaryMetric: [draft.primaryMetricLabel, draft.primaryMetricValue].filter(Boolean).join(": "),
          secondaryMetric: [draft.secondaryMetricLabel, draft.secondaryMetricValue].filter(Boolean).join(": "),
          investmentAmount: draft.investmentAmount,
        }
      : {
          title: draft.title,
          category: draft.category,
          tags: parseTagText(draft.tagsText || ""),
          excerpt: draft.excerpt,
          body: draft.body,
        };
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
      // Only sent when an admin changed it; otherwise the server keeps the
      // date the item first went live.
      ...(!isAgent && draft.publishedDate && draft.publishedDate !== dateInputValue(initial?.publishedAt)
        ? { publishedAt: `${draft.publishedDate}T12:00:00.000Z` }
        : {}),
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
        investmentAmount:
          investmentNumber != null && Number.isFinite(investmentNumber)
            ? investmentNumber
            : null,
      } as any);
    else
      savePost.mutate({
        ...common,
        coverImageUrl: draft.coverImageUrl || null,
        category: draft.category || null,
        tags: parseTagText(draft.tagsText || ""),
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
            placeholder="Smoky Mountains cabin, first-time investor"
            hint="The short line shown above the title on the case study card and page, like a label. A few words: the place, the kind of property, or the kind of client."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Category"
              value={draft.category || ""}
              onChange={value => set("category", value)}
            />
            <Field
              label="Tags (comma separated)"
              value={draft.tagsText || ""}
              onChange={value => set("tagsText", value)}
            />
          </div>
        )}
        <Area
          label="Excerpt"
          value={draft.excerpt || ""}
          onChange={value => set("excerpt", value)}
          hint={
            isCase
              ? "One or two sentences under the title on the case study card, and the description Google shows. Lead with the result."
              : "One or two sentences under the title on the blog card and at the top of the article."
          }
          action={
            isCase ? (
              <WriteWithAiButton
                kind="case"
                propertyId={draft.propertyId ? Number(draft.propertyId) : null}
                content={aiContent}
                onWritten={written => written.metaDescription && set("excerpt", written.metaDescription)}
              />
            ) : undefined
          }
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
              {!isAgent && (
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
              )}
              <PropertyPicker
                label={isAgent ? "Your property (optional)" : "Associated property"}
                properties={properties}
                value={draft.propertyId ? String(draft.propertyId) : ""}
                onChange={value => set("propertyId", value)}
              />
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
              <Field
                label="Investment amount ($, usually the purchase price)"
                value={draft.investmentAmount || ""}
                onChange={value => set("investmentAmount", value)}
              />
            </div>
          </>
        ) : (
          <>
            {!isAgent && (
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
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Meta title"
                value={draft.metaTitle || ""}
                onChange={value => set("metaTitle", value)}
                hint="The blue link in Google results. Up to about 60 characters."
                action={
                  <WriteWithAiButton
                    kind="post"
                    content={aiContent}
                    onWritten={written => written.metaTitle && set("metaTitle", written.metaTitle)}
                  />
                }
              />
              <Field
                label="Meta description"
                value={draft.metaDescription || ""}
                onChange={value => set("metaDescription", value)}
                hint="The text under the link in Google results. About 140 to 155 characters."
                action={
                  <WriteWithAiButton
                    kind="post"
                    content={aiContent}
                    onWritten={written => written.metaDescription && set("metaDescription", written.metaDescription)}
                  />
                }
              />
            </div>
          </>
        )}
        {!isAgent && (
          <div className="max-w-xs">
            <Label>Publish date</Label>
            <input
              type="date"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.publishedDate || ""}
              max={new Date().toISOString().slice(0, 10)}
              onChange={event => set("publishedDate", event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Set automatically the first time it is published. Change it to keep an older date, for example from the old site.
            </p>
          </div>
        )}
        <EditorFooter
          draft={draft}
          set={set}
          pending={saveCase.isPending || savePost.isPending}
          showFeatured={!isAgent}
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
  showFeatured = true,
}: {
  draft: any;
  set: (key: string, value: any) => void;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
  showFeatured?: boolean;
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
        {showFeatured && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch
              checked={!!draft.isFeatured}
              onCheckedChange={value => set("isFeatured", value)}
            />
            Featured
          </label>
        )}
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

/**
 * Link a property by typing its address (1 Oct call: the dropdown listed
 * every website listing, 850+ after the old-site import). Shows the chosen
 * one with a Change button, and up to 8 matches while typing.
 */
function PropertyPicker({
  label,
  properties,
  value,
  onChange,
}: {
  label: string;
  properties: any[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = properties.find(item => String(item.propertyId) === value);
  const placeOf = (item: any) => [item.city, item.state].filter(Boolean).join(", ");
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return properties
      .filter(item =>
        [item.address, item.city, item.state, item.zip, item.headline]
          .filter(Boolean)
          .some(text => String(text).toLowerCase().includes(needle))
      )
      .slice(0, 8);
  }, [properties, search]);

  if (value && !open) {
    return (
      <div>
        <Label>{label}</Label>
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <span className="min-w-0 truncate">
            {chosen ? `${chosen.address}${placeOf(chosen) ? `, ${placeOf(chosen)}` : ""}` : `Property #${value}`}
          </span>
          <div className="flex shrink-0 gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
              Change
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
              Remove
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <Label>{label}</Label>
      <Input
        className="mt-1"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Type the address or city"
      />
      {search.trim() && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded-md border bg-background shadow-sm">
          {matches.length ? (
            matches.map(item => (
              <button
                key={item.propertyId}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(String(item.propertyId));
                  setSearch("");
                  setOpen(false);
                }}
              >
                <span className="font-medium">{item.address}</span>
                {placeOf(item) && <span className="text-muted-foreground">, {placeOf(item)}</span>}
                {item.status && item.status !== "published" && (
                  <span className="ml-2 text-xs text-muted-foreground">({item.status})</span>
                )}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-muted-foreground">No property matches that.</p>
          )}
        </div>
      )}
      {value && open && (
        <Button type="button" size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => setOpen(false)}>
          Keep the current one
        </Button>
      )}
    </div>
  );
}
