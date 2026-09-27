import { useState } from "react";
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
import { Area, Field, MediaUpload, slugify } from "./websiteFormBits";

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
              <div>
                <Label>{isAgent ? "Your property (optional)" : "Associated property"}</Label>
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

