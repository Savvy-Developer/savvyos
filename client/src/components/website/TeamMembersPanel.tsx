import { useState } from "react";
import { ImagePlus, Loader2, Pencil, Plus, Trash2, UserRound } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { teamInitials, type TeamMemberStatus } from "@shared/websiteTeam";

/**
 * Website Studio > Team: the people on the public Meet the Team page.
 *
 * A row starts as a draft and shows on the site only once it is published, so
 * someone can be added with a photo still to come without a half-finished card
 * going live. Nothing is filled in for anyone: no default title, bio or photo.
 */

type Draft = {
  id?: number;
  name: string;
  title: string;
  bio: string;
  imageUrl: string;
  email: string;
  linkedinUrl: string;
  status: TeamMemberStatus;
  sortOrder: string;
};

const EMPTY: Draft = {
  name: "",
  title: "",
  bio: "",
  imageUrl: "",
  email: "",
  linkedinUrl: "",
  status: "draft",
  sortOrder: "0",
};

function toDraft(row: any): Draft {
  return {
    id: row.id,
    name: row.name ?? "",
    title: row.title ?? "",
    bio: row.bio ?? "",
    imageUrl: row.imageUrl ?? "",
    email: row.email ?? "",
    linkedinUrl: row.linkedinUrl ?? "",
    status: row.status ?? "draft",
    sortOrder: String(row.sortOrder ?? 0),
  };
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

function PhotoUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
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
      toast.success("Photo uploaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      {uploading ? "Uploading…" : "Upload photo"}
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

function MemberEditor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Draft>(initial);
  const set = (key: keyof Draft, value: string) =>
    setDraft(prior => ({ ...prior, [key]: value }));
  const save = trpc.website.saveTeamMember.useMutation({
    onSuccess: async result => {
      await utils.website.adminTeamMembers.invalidate();
      toast.success(
        result.status === "published" ? "Saved. They are on the Team page." : "Saved as a draft."
      );
      onClose();
    },
    onError: error => toast.error(error.message),
  });
  const submit = (status: TeamMemberStatus) =>
    save.mutate({
      id: draft.id,
      name: draft.name,
      title: draft.title || null,
      bio: draft.bio || null,
      imageUrl: draft.imageUrl || null,
      email: draft.email || null,
      linkedinUrl: draft.linkedinUrl || null,
      status,
      sortOrder: Number.parseInt(draft.sortOrder, 10) || 0,
    });
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit team member" : "Add team member"}</DialogTitle>
          <DialogDescription>
            Shown on the public Meet the Team page once published.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xl font-bold text-[#05314a]">
              {draft.imageUrl ? (
                <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                teamInitials(draft.name) || <UserRound className="h-8 w-8 text-slate-400" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label>Photo URL</Label>
              <Input value={draft.imageUrl} onChange={event => set("imageUrl", event.target.value)} />
              <PhotoUpload onUploaded={url => set("imageUrl", url)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input className="mt-1" value={draft.name} onChange={event => set("name", event.target.value)} />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1"
                value={draft.title}
                placeholder="e.g. Founder & CEO"
                onChange={event => set("title", event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Short bio</Label>
            <Textarea
              className="mt-1"
              rows={5}
              value={draft.bio}
              onChange={event => set("bio", event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Public email (optional)</Label>
              <Input className="mt-1" type="email" value={draft.email} onChange={event => set("email", event.target.value)} />
            </div>
            <div>
              <Label>LinkedIn (optional)</Label>
              <Input
                className="mt-1"
                value={draft.linkedinUrl}
                placeholder="https://www.linkedin.com/in/..."
                onChange={event => set("linkedinUrl", event.target.value)}
              />
            </div>
          </div>
          <div className="max-w-[160px]">
            <Label>Order</Label>
            <Input
              className="mt-1"
              type="number"
              value={draft.sortOrder}
              onChange={event => set("sortOrder", event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Lower numbers show first.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="outline" disabled={save.isPending || !draft.name.trim()} onClick={() => submit("draft")}>
              Save draft
            </Button>
            <Button disabled={save.isPending || !draft.name.trim()} onClick={() => submit("published")}>
              {save.isPending ? "Saving…" : "Publish"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TeamMembersPanel({ previewUrl }: { previewUrl: string }) {
  const utils = trpc.useUtils();
  const members = trpc.website.adminTeamMembers.useQuery();
  const [editing, setEditing] = useState<Draft | null>(null);
  const remove = trpc.website.deleteTeamMember.useMutation({
    onSuccess: async () => {
      await utils.website.adminTeamMembers.invalidate();
      toast.success("Removed from the team list.");
    },
    onError: error => toast.error(error.message),
  });
  const rows = members.data ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Meet the Team</CardTitle>
          <CardDescription>
            The people on the public{" "}
            <a className="text-cyan-700 hover:underline" href={previewUrl} target="_blank" rel="noreferrer">
              Team page
            </a>
            . Drafts stay hidden until published. The section is hidden while nobody is published.
          </CardDescription>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY, sortOrder: String(rows.length) })}>
          <Plus className="mr-2 h-4 w-4" />
          Add person
        </Button>
      </CardHeader>
      <CardContent>
        {members.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />
          </div>
        ) : members.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {members.error.message}
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            Nobody on the team list yet. Add the first person to show the team on the site.
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {rows.map((row: any) => (
              <div key={row.id} className="flex items-center gap-4 p-4">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-[#05314a]">
                  {row.imageUrl ? (
                    <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    teamInitials(row.name)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{row.name}</p>
                  <p className="truncate text-sm text-slate-500">{row.title || "No title yet"}</p>
                </div>
                <StatusBadge status={row.status} />
                <Button size="icon" variant="ghost" aria-label={`Edit ${row.name}`} onClick={() => setEditing(toDraft(row))}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${row.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove ${row.name} from the team list? This cannot be undone. To hide them for now, set them to draft instead.`))
                      remove.mutate({ id: row.id });
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {editing && <MemberEditor initial={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}
