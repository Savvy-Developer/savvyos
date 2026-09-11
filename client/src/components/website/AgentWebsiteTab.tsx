import { useEffect, useState } from "react";
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
  slugify,
  splitLines,
} from "./websiteFormBits";

const PUBLIC_AGENT_PATH = "/newsite/agents/";

type Draft = {
  slug: string;
  status: "draft" | "published" | "archived";
  headline: string;
  shortBio: string;
  markets: string;
  specialties: string;
  imageUrl: string;
  publicEmail: string;
  publicPhone: string;
  bookingUrl: string;
  isFeatured: boolean;
  sortOrder: string;
};

function draftFrom(profile: any, user: any, fallbackSlug: string): Draft {
  if (!profile) {
    return {
      slug: fallbackSlug,
      status: "draft",
      headline: "",
      shortBio: "",
      markets: "",
      specialties: "",
      imageUrl: "",
      // Seed the contact details from the SavvyOS record so a new profile
      // starts with something real rather than an empty form.
      publicEmail: user?.email ?? "",
      publicPhone: user?.phone ?? "",
      bookingUrl: "",
      isFeatured: false,
      sortOrder: "0",
    };
  }
  return {
    slug: profile.slug ?? fallbackSlug,
    status: profile.status ?? "draft",
    headline: profile.headline ?? "",
    shortBio: profile.shortBio ?? "",
    markets: joinLines(profile.markets),
    specialties: joinLines(profile.specialties),
    imageUrl: profile.imageUrl ?? "",
    publicEmail: profile.publicEmail ?? "",
    publicPhone: profile.publicPhone ?? "",
    bookingUrl: profile.bookingUrl ?? "",
    isFeatured: !!profile.isFeatured,
    sortOrder: String(profile.sortOrder ?? 0),
  };
}

/**
 * An agent's public website profile, edited on their own agent page.
 *
 * This replaces the Website Studio's Agents tab, which kept a separate list of
 * website agents next to the SavvyOS ones. The two were already linked in the
 * database; this puts the editing in the same place as the record.
 */
export default function AgentWebsiteTab({
  agentId,
  agentName,
}: {
  agentId: number;
  agentName?: string | null;
}) {
  const utils = trpc.useUtils();
  const fallbackSlug = slugify(agentName || "") || `agent-${agentId}`;
  const content = trpc.website.agentWebsiteProfile.useQuery(
    { userId: agentId },
    { enabled: !!agentId }
  );
  const [draft, setDraft] = useState<Draft>(() => draftFrom(null, null, fallbackSlug));
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  useEffect(() => {
    if (content.isLoading || loadedFor === agentId) return;
    setDraft(draftFrom(content.data?.profile, content.data?.user, fallbackSlug));
    setLoadedFor(agentId);
  }, [content.isLoading, content.data, agentId, fallbackSlug, loadedFor]);

  const save = trpc.website.saveAgentWebsiteProfile.useMutation({
    onSuccess: async result => {
      toast.success(result.created ? "Website profile created." : "Website profile saved.");
      await utils.website.agentWebsiteProfile.invalidate({ userId: agentId });
      await utils.website.agentPublishState.invalidate({ userId: agentId });
    },
    onError: error => toast.error(error.message),
  });

  const canEdit = !!content.data?.canEdit;
  const profile = content.data?.profile;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(prior => ({ ...prior, [key]: value }));

  if (content.isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading website profile...
      </div>
    );
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Website profile</CardTitle>
          <CardDescription>
            You do not have access to edit this agent's public profile.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function submit() {
    save.mutate({
      userId: agentId,
      slug: slugify(draft.slug) || fallbackSlug,
      status: draft.status,
      headline: draft.headline || null,
      shortBio: draft.shortBio || null,
      markets: splitLines(draft.markets),
      specialties: splitLines(draft.specialties),
      imageUrl: draft.imageUrl || null,
      publicEmail: draft.publicEmail || null,
      publicPhone: draft.publicPhone || null,
      bookingUrl: draft.bookingUrl || null,
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
              <Globe2 className="h-4 w-4" /> Public website profile
            </CardTitle>
            <CardDescription>
              How this agent appears on the public site.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {profile ? (
              <Badge
                className={
                  profile.status === "published"
                    ? "bg-emerald-600 hover:bg-emerald-600"
                    : profile.status === "archived"
                      ? "bg-slate-500"
                      : "bg-amber-500 hover:bg-amber-500"
                }
              >
                {profile.status}
              </Badge>
            ) : (
              <Badge variant="outline">Not on the website</Badge>
            )}
            {profile?.status === "published" && (
              <a
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                href={`${PUBLIC_AGENT_PATH}${profile.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                View <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Headline"
              value={draft.headline}
              onChange={value => set("headline", value)}
              placeholder="Short-term rental specialist, Gulf Coast"
            />
            <Field
              label="Public link"
              value={draft.slug}
              onChange={value => set("slug", slugify(value))}
              hint={`${PUBLIC_AGENT_PATH}${draft.slug || fallbackSlug}`}
            />
            <div className="md:col-span-2">
              <Area
                label="Short bio"
                value={draft.shortBio}
                onChange={value => set("shortBio", value)}
                rows={5}
              />
            </div>
            <div>
              <Field
                label="Photo URL"
                value={draft.imageUrl}
                onChange={value => set("imageUrl", value)}
              />
              <div className="mt-2">
                <MediaUpload label="Upload photo" onUploaded={url => set("imageUrl", url)} />
              </div>
            </div>
            <div className="space-y-4">
              <Area
                label="Markets"
                value={draft.markets}
                onChange={value => set("markets", value)}
                rows={3}
                hint="One per line."
              />
              <Area
                label="Specialties"
                value={draft.specialties}
                onChange={value => set("specialties", value)}
                rows={3}
                hint="One per line."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact and booking</CardTitle>
          <CardDescription>
            What the public page shows. Leave a field blank to hide it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Public email"
              value={draft.publicEmail}
              onChange={value => set("publicEmail", value)}
            />
            <Field
              label="Public phone"
              value={draft.publicPhone}
              onChange={value => set("publicPhone", value)}
            />
            <Field
              label="Booking link"
              value={draft.bookingUrl}
              onChange={value => set("bookingUrl", value)}
              placeholder="calendly.com/your-name"
              hint="A plain address works, it is turned into a full link on save."
            />
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
                : profile
                  ? "Save profile"
                  : draft.status === "published"
                    ? "Publish profile"
                    : "Create draft profile"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
