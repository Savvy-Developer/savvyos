import { useEffect, useState } from "react";
import {
  ExternalLink,
  FilePlus2,
  FormInput,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";

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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { publicPath } from "@/lib/publicSitePaths";
import WebsiteRichTextEditor from "@/components/WebsiteRichTextEditor";
import {
  CONTACT_FORM_TOKEN,
  EDITABLE_BUILT_IN_PAGES,
  editableBuiltInPage,
} from "@shared/websiteEditablePages";

/**
 * The CMS page picker and editor.
 *
 * Two kinds of page:
 *
 * - Your pages: new pages at their own address, like Legal and Privacy.
 * - Site pages: About, Contact and Join Our Team. These have a designed
 *   version in code. Publishing a version here replaces it on the site, and
 *   setting it back to Draft brings the designed one back, so nothing is lost.
 *   A site page opens pre-filled with what the designed page says today, so
 *   nobody starts from a blank page.
 *
 * Properties, Agents, Markets, Case Studies and Resources are lists of live
 * records and stay out of here.
 */

const BLANK = {
  id: undefined as number | undefined,
  slug: "",
  name: "",
  status: "draft" as "draft" | "published" | "archived",
  heroEyebrow: "",
  heroTitle: "",
  heroSubtitle: "",
  bodyMarkdown: "",
  ctaText: "",
  ctaHref: "",
  metaTitle: "",
  metaDescription: "",
  sortOrder: 0,
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);

export function CmsPagesEditor() {
  const utils = trpc.useUtils();
  const pages = trpc.website.adminPages.useQuery();
  const [selected, setSelected] = useState<string>("");
  const [draft, setDraft] = useState({ ...BLANK });

  const save = trpc.website.savePage.useMutation({
    onSuccess: async result => {
      toast.success("Page saved.");
      await utils.website.adminPages.invalidate();
      setSelected(String(result.id));
    },
    onError: error => toast.error(error.message),
  });

  // Load the chosen page into the form. A page the user is part way through
  // editing is not clobbered by a refetch, because this only runs when the
  // selection changes.
  useEffect(() => {
    if (selected === "new") {
      setDraft({ ...BLANK });
      return;
    }
    // A site page that has never been customised: start from its current
    // wording, as a draft, at its own fixed address.
    if (selected.startsWith("builtin:")) {
      const builtIn = editableBuiltInPage(selected.slice("builtin:".length));
      if (!builtIn) return;
      setDraft({
        ...BLANK,
        slug: builtIn.slug,
        name: builtIn.name,
        ...builtIn.starter,
      });
      return;
    }
    const page = (pages.data || []).find(
      (item: any) => String(item.id) === selected
    );
    if (!page) return;
    setDraft({
      id: page.id,
      slug: page.slug,
      name: page.name,
      status: page.status,
      heroEyebrow: page.heroEyebrow ?? "",
      heroTitle: page.heroTitle ?? "",
      heroSubtitle: page.heroSubtitle ?? "",
      bodyMarkdown: page.bodyMarkdown ?? "",
      ctaText: page.ctaText ?? "",
      ctaHref: page.ctaHref ?? "",
      metaTitle: page.metaTitle ?? "",
      metaDescription: page.metaDescription ?? "",
      sortOrder: page.sortOrder ?? 0,
    });
    // pages.data is deliberately not a dependency: reloading the form whenever
    // the list refetches would throw away whatever is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const set = (key: string, value: any) =>
    setDraft(prior => ({ ...prior, [key]: value }));

  const ready = draft.name.trim() !== "" && draft.slug.trim() !== "";
  const publicUrl = draft.slug ? publicPath(`/${draft.slug}`) : null;
  const builtIn = editableBuiltInPage(draft.slug);
  const allPages: any[] = pages.data || [];
  const customPages = allPages.filter(page => !editableBuiltInPage(page.slug));
  const savedVersionOf = (slug: string) =>
    allPages.find(page => page.slug === slug);
  const resetToDesigned = () => {
    if (!builtIn) return;
    setDraft(prior => ({ ...prior, ...builtIn.starter }));
    toast.message("Reset to the designed page's wording. Save to keep it.");
  };
  const insertContactForm = () =>
    set(
      "bodyMarkdown",
      `${draft.bodyMarkdown.trimEnd()}\n\n${CONTACT_FORM_TOKEN}\n`
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pages</CardTitle>
        <CardDescription>
          Edit About, Contact and Join Our Team, or add your own pages.
          Publishing a site page here replaces the designed version on the
          website; set it back to Draft to bring the designed one back.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Label>Page</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose a page to edit" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Site pages</SelectLabel>
                  {EDITABLE_BUILT_IN_PAGES.map(page => {
                    const saved = savedVersionOf(page.slug);
                    return (
                      <SelectItem
                        key={page.slug}
                        value={saved ? String(saved.id) : `builtin:${page.slug}`}
                      >
                        {page.name}
                        {saved?.status === "published"
                          ? " (custom version live)"
                          : saved
                            ? " (custom draft, designed page live)"
                            : " (designed page)"}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Your pages</SelectLabel>
                  {customPages.map((page: any) => (
                    <SelectItem key={page.id} value={String(page.id)}>
                      {page.name}
                      {page.status !== "published" ? ` (${page.status})` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">New page…</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSelected("new")}
          >
            <FilePlus2 className="mr-2 h-4 w-4" />
            New page
          </Button>
          {publicUrl && draft.status === "published" && (
            <a href={publicUrl} target="_blank" rel="noreferrer">
              <Button type="button" variant="ghost">
                <ExternalLink className="mr-2 h-4 w-4" />
                View
              </Button>
            </a>
          )}
        </div>

        {pages.isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {!pages.isLoading && !selected && (
          <p className="text-sm text-muted-foreground">
            Pick a page above, or create one. New pages appear on the site at
            savvy-agents.com followed by the address you give them, once
            published.
          </p>
        )}

        {selected && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Page name</Label>
                <Input
                  className="mt-1"
                  value={draft.name}
                  placeholder="Join the team"
                  onChange={event => {
                    const name = event.target.value;
                    set("name", name);
                    // Only fill the address in for a page that has not been
                    // saved. Changing a live page's address breaks every link
                    // anyone has to it, so that stays a deliberate edit.
                    if (!draft.id && !draft.slug) set("slug", slugify(name));
                  }}
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  className="mt-1 font-mono"
                  value={draft.slug}
                  placeholder="join-the-team"
                  // A site page lives at a fixed address; moving it would
                  // leave the designed page showing at the old one.
                  disabled={!!builtIn}
                  onChange={event => set("slug", slugify(event.target.value))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {publicUrl ? `savvy-agents.com${publicUrl}` : "Give the page an address"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Status</Label>
                <Select
                  value={draft.status}
                  onValueChange={value => set("status", value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Eyebrow</Label>
                <Input
                  className="mt-1"
                  value={draft.heroEyebrow}
                  placeholder="Careers"
                  onChange={event => set("heroEyebrow", event.target.value)}
                />
              </div>
              <div>
                <Label>Order</Label>
                <Input
                  className="mt-1"
                  type="number"
                  value={draft.sortOrder}
                  onChange={event =>
                    set("sortOrder", Number(event.target.value) || 0)
                  }
                />
              </div>
            </div>

            <div>
              <Label>Heading</Label>
              <Input
                className="mt-1"
                value={draft.heroTitle}
                placeholder="Build your STR business with Savvy"
                onChange={event => set("heroTitle", event.target.value)}
              />
            </div>

            <div>
              <Label>Subheading</Label>
              <Textarea
                className="mt-1 min-h-20"
                value={draft.heroSubtitle}
                onChange={event => set("heroSubtitle", event.target.value)}
              />
            </div>

            {builtIn && (
              <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-950">
                <p>
                  This is the <strong>{builtIn.name}</strong> page. While this
                  version is <strong>Published</strong>, it replaces the
                  designed page on the website. Set it to <strong>Draft</strong>{" "}
                  to bring the designed page back.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 bg-white"
                  onClick={resetToDesigned}
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Start again from the designed page's wording
                </Button>
              </div>
            )}

            <div>
              <div className="flex items-end justify-between gap-2">
                <Label>Page content</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={insertContactForm}
                  title="Adds the contact form at the end of the page. Move the [[contact-form]] line to place it."
                >
                  <FormInput className="mr-2 h-3.5 w-3.5" />
                  Add contact form
                </Button>
              </div>
              <div className="mt-1">
                <WebsiteRichTextEditor
                  value={draft.bodyMarkdown}
                  onChange={value => set("bodyMarkdown", value)}
                  minHeight={360}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Headings, lists, links, tables and pictures all work. A line
                that says {CONTACT_FORM_TOKEN} shows the contact form in that
                spot, and inquiries from it go into SavvyOS as usual.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Button text</Label>
                <Input
                  className="mt-1"
                  value={draft.ctaText}
                  placeholder="Apply now"
                  onChange={event => set("ctaText", event.target.value)}
                />
              </div>
              <div>
                <Label>Button link</Label>
                <Input
                  className="mt-1"
                  value={draft.ctaHref}
                  placeholder="/newsite/contact"
                  onChange={event => set("ctaHref", event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Search title</Label>
                <Input
                  className="mt-1"
                  value={draft.metaTitle}
                  onChange={event => set("metaTitle", event.target.value)}
                />
              </div>
              <div>
                <Label>Search description</Label>
                <Textarea
                  className="mt-1 min-h-20"
                  value={draft.metaDescription}
                  onChange={event => set("metaDescription", event.target.value)}
                />
              </div>
            </div>

            <Button
              type="button"
              disabled={!ready || save.isPending}
              onClick={() =>
                save.mutate({
                  id: draft.id,
                  slug: draft.slug,
                  name: draft.name.trim(),
                  status: draft.status,
                  heroEyebrow: draft.heroEyebrow || null,
                  heroTitle: draft.heroTitle || null,
                  heroSubtitle: draft.heroSubtitle || null,
                  bodyMarkdown: draft.bodyMarkdown || null,
                  ctaText: draft.ctaText || null,
                  ctaHref: draft.ctaHref || null,
                  metaTitle: draft.metaTitle || null,
                  metaDescription: draft.metaDescription || null,
                  sortOrder: draft.sortOrder,
                })
              }
            >
              {save.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {draft.status === "published" ? "Save and publish" : "Save page"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
