import { useMemo, useState } from "react";
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Power,
  Archive,
  X,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type LinkRecord = {
  id: number;
  name: string;
  slug: string;
  destinationUrl: string;
  status: "active" | "disabled" | "archived";
  preserveQueryParams: boolean;
  clickCount: number;
  lastClickedAt: Date | string | null;
  createdByName?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  publicUrl: string;
};

type LinkForm = {
  name: string;
  slug: string;
  destinationUrl: string;
  preserveQueryParams: boolean;
};

const emptyForm: LinkForm = {
  name: "",
  slug: "",
  destinationUrl: "",
  preserveQueryParams: true,
};

function formatDate(
  value: Date | string | null | undefined,
  includeTime = false
) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function readableUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function statusVariant(status: LinkRecord["status"]) {
  if (status === "active") return "default" as const;
  if (status === "disabled") return "secondary" as const;
  return "outline" as const;
}

export default function ShortLinksPage() {
  const utils = trpc.useUtils();
  const linksQuery = trpc.shortLinks.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LinkRecord | null>(null);
  const [form, setForm] = useState<LinkForm>(emptyForm);
  const [analyticsLinkId, setAnalyticsLinkId] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const analyticsQuery = trpc.shortLinks.analytics.useQuery(
    { id: analyticsLinkId ?? 0 },
    { enabled: analyticsLinkId !== null }
  );

  const links = (linksQuery.data ?? []) as LinkRecord[];
  const totalClicks = useMemo(
    () => links.reduce((sum, link) => sum + Number(link.clickCount ?? 0), 0),
    [links]
  );
  const activeLinks = useMemo(
    () => links.filter(link => link.status === "active").length,
    [links]
  );

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const createMutation = trpc.shortLinks.create.useMutation({
    onSuccess: async result => {
      await utils.shortLinks.list.invalidate();
      toast.success("Short link created", { description: result.publicUrl });
      closeDialog();
    },
    onError: error =>
      toast.error("Could not create short link", {
        description: error.message,
      }),
  });

  const updateMutation = trpc.shortLinks.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.shortLinks.list.invalidate(),
        utils.shortLinks.analytics.invalidate(),
      ]);
      toast.success("Short link updated");
      closeDialog();
    },
    onError: error =>
      toast.error("Could not update short link", {
        description: error.message,
      }),
  });

  const statusMutation = trpc.shortLinks.setStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.shortLinks.list.invalidate(),
        utils.shortLinks.analytics.invalidate(),
      ]);
      toast.success("Short link status updated");
    },
    onError: error =>
      toast.error("Could not update short link", {
        description: error.message,
      }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (link: LinkRecord) => {
    setEditing(link);
    setForm({
      name: link.name,
      slug: link.slug,
      destinationUrl: link.destinationUrl,
      preserveQueryParams: link.preserveQueryParams,
    });
    setDialogOpen(true);
  };

  const save = () => {
    const data = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      destinationUrl: form.destinationUrl.trim(),
      preserveQueryParams: form.preserveQueryParams,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(data);
  };

  const copyPublicUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      toast.success("Short link copied");
      window.setTimeout(
        () => setCopiedUrl(current => (current === url ? null : current)),
        1800
      );
    } catch {
      toast.error(
        "Could not copy the link. Please copy it from the field instead."
      );
    }
  };

  const changeStatus = (link: LinkRecord, status: LinkRecord["status"]) => {
    if (
      status === "archived" &&
      !window.confirm(
        `Archive “${link.name}”? It will stop redirecting, but its click history will remain available.`
      )
    )
      return;
    statusMutation.mutate({ id: link.id, status });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Link2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Public link tools</span>
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Short Links
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Create shareable links on <strong>home.savvy-agents.com</strong>,
            keep the SavvyOS address private, and see every click in one place.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New short link
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>All links</CardDescription>
            <CardTitle className="text-3xl">{links.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Links you can manage
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active links</CardDescription>
            <CardTitle className="text-3xl">{activeLinks}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Currently redirecting visitors
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total clicks</CardDescription>
            <CardTitle className="text-3xl">
              {totalClicks.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Recorded across your links
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Manage links</CardTitle>
          <CardDescription>
            Custom slugs are unique across public Landing Pages and Short Links.
            Incoming UTM tags and other query parameters are preserved by
            default.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {linksQuery.isLoading ? (
            <div className="flex min-h-52 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading short links…
            </div>
          ) : linksQuery.error ? (
            <div className="p-6 text-sm text-destructive">
              Could not load short links: {linksQuery.error.message}
            </div>
          ) : links.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <div className="rounded-full bg-primary/10 p-3 text-primary">
                <Link2 className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-base font-semibold">
                Create your first short link
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Turn any long URL into a branded link that is easy to share and
                measurable after it is sent.
              </p>
              <Button className="mt-5" variant="outline" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                New short link
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Short link</th>
                    <th className="px-5 py-3 font-medium">Destination</th>
                    <th className="px-5 py-3 font-medium">Clicks</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {links.map(link => (
                    <tr key={link.id} className="align-top hover:bg-muted/20">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-foreground">
                          {link.name}
                        </p>
                        <div className="mt-1 flex max-w-[250px] items-center gap-1.5">
                          <a
                            href={link.publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-xs text-primary hover:underline"
                          >
                            {link.publicUrl}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyPublicUrl(link.publicUrl)}
                            title="Copy short link"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {copiedUrl === link.publicUrl ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="max-w-[300px] px-5 py-4">
                        <a
                          href={link.destinationUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={link.destinationUrl}
                          className="flex items-center gap-1 truncate text-muted-foreground hover:text-primary hover:underline"
                        >
                          <span className="truncate">
                            {readableUrl(link.destinationUrl)}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {link.preserveQueryParams
                            ? "Preserves incoming query tags"
                            : "Does not preserve incoming query tags"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setAnalyticsLinkId(link.id)}
                          className="font-semibold text-foreground hover:text-primary hover:underline"
                        >
                          {Number(link.clickCount ?? 0).toLocaleString()}
                        </button>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Last: {formatDate(link.lastClickedAt, true)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={statusVariant(link.status)}
                          className="capitalize"
                        >
                          {link.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="View analytics"
                            onClick={() => setAnalyticsLinkId(link.id)}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Edit short link"
                            disabled={link.status === "archived"}
                            onClick={() => openEdit(link)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {link.status !== "archived" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                link.status === "active"
                                  ? "Disable short link"
                                  : "Activate short link"
                              }
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                changeStatus(
                                  link,
                                  link.status === "active"
                                    ? "disabled"
                                    : "active"
                                )
                              }
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          )}
                          {link.status !== "archived" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Archive short link"
                              disabled={statusMutation.isPending}
                              onClick={() => changeStatus(link, "archived")}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={open => (open ? setDialogOpen(true) : closeDialog())}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit short link" : "New short link"}
            </DialogTitle>
            <DialogDescription>
              Use a memorable slug and a complete destination URL. The public
              address always starts with home.savvy-agents.com.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="short-link-name">Internal name</Label>
              <Input
                id="short-link-name"
                value={form.name}
                maxLength={255}
                onChange={event =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Investor guide campaign"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="short-link-slug">Custom slug</Label>
              <div className="flex overflow-hidden rounded-md border bg-muted/35 focus-within:ring-2 focus-within:ring-ring">
                <span className="flex shrink-0 items-center border-r bg-muted px-3 text-sm text-muted-foreground">
                  home.savvy-agents.com/
                </span>
                <Input
                  id="short-link-slug"
                  value={form.slug}
                  maxLength={120}
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                  onChange={event =>
                    setForm({
                      ...form,
                      slug: event.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "-"),
                    })
                  }
                  placeholder="investor-guide"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="short-link-destination">Destination URL</Label>
              <Input
                id="short-link-destination"
                type="url"
                value={form.destinationUrl}
                maxLength={2000}
                onChange={event =>
                  setForm({ ...form, destinationUrl: event.target.value })
                }
                placeholder="https://www.savvy-agents.com/resources/investor-guide"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="pr-4">
                <Label htmlFor="short-link-query-params">
                  Preserve incoming query parameters
                </Label>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Pass UTM tags and other query parameters through to the
                  destination unless it already has that parameter.
                </p>
              </div>
              <Switch
                id="short-link-query-params"
                checked={form.preserveQueryParams}
                onCheckedChange={checked =>
                  setForm({ ...form, preserveQueryParams: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              disabled={
                createMutation.isPending ||
                updateMutation.isPending ||
                form.name.trim().length < 2 ||
                form.slug.trim().length < 2 ||
                !form.destinationUrl.trim()
              }
              onClick={save}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editing ? "Save changes" : "Create short link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={analyticsLinkId !== null}
        onOpenChange={open => !open && setAnalyticsLinkId(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Click analytics</DialogTitle>
            <DialogDescription>
              {analyticsQuery.data?.link.name ?? "Short link"}
            </DialogDescription>
          </DialogHeader>
          {analyticsQuery.isLoading ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading click data…
            </div>
          ) : analyticsQuery.error ? (
            <p className="py-6 text-sm text-destructive">
              Could not load analytics: {analyticsQuery.error.message}
            </p>
          ) : analyticsQuery.data ? (
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/25 p-3">
                <p className="text-sm font-medium">
                  {analyticsQuery.data.link.publicUrl}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  Redirects to {analyticsQuery.data.link.destinationUrl}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardDescription>Total clicks</CardDescription>
                    <CardTitle className="text-2xl">
                      {Number(
                        analyticsQuery.data.link.clickCount
                      ).toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardDescription>Today</CardDescription>
                    <CardTitle className="text-2xl">
                      {analyticsQuery.data.todayClicks.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardDescription>Last 7 days</CardDescription>
                    <CardTitle className="text-2xl">
                      {analyticsQuery.data.lastSevenDaysClicks.toLocaleString()}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Recent clicks</h3>
                {analyticsQuery.data.recentClicks.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    No clicks have been recorded yet.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">When</th>
                          <th className="px-3 py-2 font-medium">Device</th>
                          <th className="px-3 py-2 font-medium">Referrer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {analyticsQuery.data.recentClicks.map(click => (
                          <tr key={click.id}>
                            <td className="whitespace-nowrap px-3 py-2">
                              {formatDate(click.clickedAt, true)}
                            </td>
                            <td className="px-3 py-2 capitalize text-muted-foreground">
                              {click.deviceCategory || "Unknown"}
                            </td>
                            <td
                              className="max-w-[260px] truncate px-3 py-2 text-muted-foreground"
                              title={click.referrerUrl || "Direct"}
                            >
                              {click.referrerUrl
                                ? readableUrl(click.referrerUrl)
                                : "Direct"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnalyticsLinkId(null)}>
              <X className="mr-2 h-4 w-4" />
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
