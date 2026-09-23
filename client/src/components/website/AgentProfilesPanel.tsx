import { useMemo, useState } from "react";
import { ArrowUpRight, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AgentProfile = {
  id: number;
  userId: number;
  slug: string;
  name: string;
  headline: string | null;
  shortBio: string | null;
  markets: string[];
  specialties: string[];
  imageUrl: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  bookingUrl: string | null;
  status: "draft" | "published" | "archived";
  isFeatured: boolean;
  sortOrder: number;
};

type Filter = "all" | "draft" | "published" | "archived";

/**
 * Every agent's website profile in one list, with publish and unpublish a
 * click away.
 *
 * Profiles are edited on the agent's own page, which is right for one agent
 * but not for reviewing fifty imported drafts: that meant opening fifty
 * pages. This list exists for the review. Editing still happens on the
 * agent page, so there is one place a profile's text is changed.
 */
export function AgentProfilesPanel({
  agents,
  canManage,
  previewUrl,
}: {
  agents: AgentProfile[];
  canManage: boolean;
  previewUrl: (slug: string) => string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const save = trpc.website.saveAgentWebsiteProfile.useMutation({
    onSuccess: (_result, input) => {
      toast.success(input.status === "published" ? "Profile published" : "Profile taken off the site");
      utils.website.adminOverview.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const counts = useMemo(
    () => ({
      all: agents.length,
      draft: agents.filter(a => a.status === "draft").length,
      published: agents.filter(a => a.status === "published").length,
      archived: agents.filter(a => a.status === "archived").length,
    }),
    [agents]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents
      .filter(a => filter === "all" || a.status === filter)
      .filter(a => !q || `${a.name} ${a.slug} ${(a.markets || []).join(" ")}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, filter, search]);

  const setStatus = (agent: AgentProfile, status: "draft" | "published") => {
    // The whole profile goes back as it is; only the status changes. The
    // procedure takes the full record, which keeps one code path for saves.
    save.mutate({
      userId: agent.userId,
      slug: agent.slug,
      headline: agent.headline,
      shortBio: agent.shortBio,
      markets: agent.markets || [],
      specialties: agent.specialties || [],
      imageUrl: agent.imageUrl,
      publicEmail: agent.publicEmail || "",
      publicPhone: agent.publicPhone,
      bookingUrl: agent.bookingUrl,
      status,
      isFeatured: agent.isFeatured,
      sortOrder: agent.sortOrder,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent profiles</CardTitle>
        <CardDescription>
          Who appears on the public Agents page. A profile's text, photo and
          booking link are edited on the agent's own page, under Website.
          Publish and unpublish here.
        </CardDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(["all", "draft", "published", "archived"] as Filter[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === key ? "border-[#05314a] bg-[#05314a] text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {key === "all" ? "All" : key[0].toUpperCase() + key.slice(1)} ({counts[key]})
            </button>
          ))}
          <Input
            className="ml-auto h-8 w-56"
            placeholder="Search by name or market"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {shown.length ? (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="p-3">Agent</th>
                <th className="p-3">Markets</th>
                <th className="p-3">Has</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(agent => {
                const missing = [
                  !agent.imageUrl && "photo",
                  !agent.shortBio && "bio",
                  !agent.bookingUrl && "booking link",
                ].filter(Boolean) as string[];
                return (
                  <tr key={agent.id} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {agent.imageUrl ? (
                          <img src={agent.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                            <UserRound className="h-4 w-4" />
                          </span>
                        )}
                        <div>
                          <div className="font-semibold text-slate-950">{agent.name}</div>
                          <div className="text-xs text-slate-500">/{agent.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-xs p-3 text-slate-600">{(agent.markets || []).join(", ") || "—"}</td>
                    <td className="p-3 text-xs text-slate-500">
                      {missing.length ? `Missing ${missing.join(", ")}` : "Photo, bio, booking link"}
                    </td>
                    <td className="p-3">
                      <Badge
                        className={
                          agent.status === "published"
                            ? "bg-emerald-600 hover:bg-emerald-600"
                            : agent.status === "archived"
                              ? "bg-slate-500"
                              : "bg-amber-500 hover:bg-amber-500"
                        }
                      >
                        {agent.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <a href={`/agents/${agent.userId}`}>
                          <Button variant="ghost" size="sm" title="Edit on the agent's page">
                            Edit
                          </Button>
                        </a>
                        {agent.status === "published" && (
                          <a href={previewUrl(agent.slug)} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" title="Open public page">
                              <ArrowUpRight className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        {canManage && agent.status !== "published" && (
                          <Button
                            size="sm"
                            className="bg-[#05314a] hover:bg-[#07546b]"
                            disabled={save.isPending}
                            onClick={() => setStatus(agent, "published")}
                          >
                            Publish
                          </Button>
                        )}
                        {canManage && agent.status === "published" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={save.isPending}
                            onClick={() => setStatus(agent, "draft")}
                          >
                            Unpublish
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            No agent profiles match.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
