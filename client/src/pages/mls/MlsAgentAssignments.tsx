import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

/**
 * MLS managers choose which MLSs each agent can search. An agent with at least
 * one MLS gets an MLS Properties tab showing only those MLSs; the server
 * enforces the same scope on every search, map, listing, and photo request.
 */
export function MlsAgentAssignmentsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCog className="mr-1.5 h-4 w-4" />Agent Assignments
      </Button>
      {open ? <AgentAssignmentsDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AgentAssignmentsDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const data = trpc.mlsProperties.agentAssignments.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false });
  const [search, setSearch] = useState("");
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const save = trpc.mlsProperties.setAgentAssignments.useMutation();

  const sources = data.data?.sources ?? [];
  const agents = data.data?.agents ?? [];
  const sourceName = (id: number) => sources.find(source => source.id === id)?.shortName ?? `MLS ${id}`;
  const assignedCount = agents.filter(agent => agent.sourceIds.length).length;
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return agents.filter(agent =>
      (!assignedOnly || agent.sourceIds.length > 0) &&
      (!needle || `${agent.name ?? ""} ${agent.email ?? ""}`.toLowerCase().includes(needle))
    );
  }, [agents, search, assignedOnly]);

  const toggle = async (agent: (typeof agents)[number], sourceId: number, checked: boolean) => {
    const sourceIds = checked
      ? Array.from(new Set([...agent.sourceIds, sourceId]))
      : agent.sourceIds.filter(id => id !== sourceId);
    setPending(current => new Set(current).add(agent.id));
    try {
      const result = await save.mutateAsync({ userId: agent.id, sourceIds });
      utils.mlsProperties.agentAssignments.setData(undefined, old => old
        ? { ...old, agents: old.agents.map(row => (row.id === result.userId ? { ...row, sourceIds: result.sourceIds } : row)) }
        : old);
      const who = agent.name ?? agent.email ?? "Agent";
      toast.success(result.sourceIds.length
        ? `${who} can now search ${result.sourceIds.map(sourceName).join(", ")}`
        : `${who} no longer has MLS Properties`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the assignment");
    } finally {
      setPending(current => {
        const next = new Set(current);
        next.delete(agent.id);
        return next;
      });
    }
  };

  return (
    <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent overlayClassName="z-[2300]" className="z-[2310] gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agent Assignments</DialogTitle>
          <DialogDescription>
            Check the MLSs each agent can search. Agents with an MLS get an MLS Properties tab that shows only those MLSs.
            Assign an MLS only to agents who are members of it: they see its listings inside SavvyOS, including back office data.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an agent" aria-label="Find an agent" className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Checkbox checked={assignedOnly} onCheckedChange={value => setAssignedOnly(value === true)} />Assigned only
          </label>
          <span className="text-sm text-muted-foreground">{assignedCount} of {agents.length} agents assigned</span>
        </div>
        {/* The table scrolls inside a height that leaves room for the header and toolbar on short screens. */}
        <div className="max-h-[max(12rem,calc(85dvh-14rem))] overflow-auto rounded-lg border">
          {data.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading agents</div>
          ) : data.isError ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Agents did not load. <Button variant="outline" size="sm" onClick={() => void data.refetch()}>Try again</Button>
            </div>
          ) : !sources.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No licensed MLS is ready to assign yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  {sources.map(source => <th key={source.id} className="px-3 py-2 text-center" title={source.name}>{source.shortName}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.map(agent => (
                  <tr key={agent.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 font-medium">
                        {agent.name ?? "Unnamed agent"}
                        {pending.has(agent.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Saving" /> : null}
                      </div>
                      {agent.email ? <div className="text-xs text-muted-foreground">{agent.email}</div> : null}
                    </td>
                    {sources.map(source => (
                      <td key={source.id} className="px-3 py-2 text-center">
                        <Checkbox
                          checked={agent.sourceIds.includes(source.id)}
                          disabled={pending.has(agent.id)}
                          aria-label={`${source.shortName} for ${agent.name ?? agent.email ?? "agent"}`}
                          onCheckedChange={value => void toggle(agent, source.id, value === true)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {!visible.length ? (
                  <tr><td colSpan={sources.length + 1} className="p-6 text-center text-sm text-muted-foreground">No agents match.</td></tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
