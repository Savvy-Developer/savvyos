import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export type ProjectMilestoneDependencyOption = {
  id: number;
  title: string;
  projectId: number;
  projectTitle: string;
  dueDate?: Date | string | null;
};

type ProjectMilestone = {
  id: number;
  title: string;
  predecessorMilestoneIds?: number[];
};

function dueDateLabel(value: Date | string | null | undefined) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectMilestoneDependencyDialog({
  milestone,
  options,
  isPending = false,
  onSave,
}: {
  milestone: ProjectMilestone;
  options: ProjectMilestoneDependencyOption[];
  isPending?: boolean;
  onSave: (predecessorMilestoneIds: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const candidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return options
      .filter(candidate => candidate.id !== milestone.id)
      .filter(candidate =>
        `${candidate.projectTitle} ${candidate.title}`.toLowerCase().includes(normalizedQuery),
      );
  }, [milestone.id, options, query]);
  const selected = useMemo(
    () => options.filter(candidate => selectedIds.includes(candidate.id)),
    [options, selectedIds],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedIds(milestone.predecessorMilestoneIds ?? []);
    setQuery("");
  }, [milestone.id, milestone.predecessorMilestoneIds, open]);

  function toggle(milestoneId: number, checked: boolean) {
    setSelectedIds(current =>
      checked
        ? Array.from(new Set([...current, milestoneId]))
        : current.filter(id => id !== milestoneId),
    );
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <span className="mr-1.5 h-2.5 w-2.5 rotate-45 rounded-[1px] border border-primary bg-primary/10" />
        Dependencies
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Milestone dependencies</DialogTitle>
            <DialogDescription>
              Choose the milestones that must finish before “{milestone.title}”. Dependencies may cross Rocks and appear in Gantt View.
            </DialogDescription>
          </DialogHeader>

          {selected.length ? (
            <div className="rounded-md border border-primary/20 bg-primary/[0.025] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Depends on</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selected.map(candidate => (
                  <button
                    key={candidate.id}
                    type="button"
                    className="inline-flex max-w-full items-start gap-1 rounded-full border border-primary/20 bg-background px-2 py-1 text-left text-xs font-medium text-primary hover:bg-primary/5"
                    onClick={() => toggle(candidate.id, false)}
                    title={`Remove ${candidate.title}`}
                  >
                    <span className="break-words leading-snug">{candidate.projectTitle} / {candidate.title}</span>
                    <X className="mt-0.5 h-3 w-3 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 rounded-md border border-amber-300/70 bg-amber-50/70 p-3 text-xs text-amber-950">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
              <p>No blockers selected. This milestone can begin independently.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`milestone-dependency-search-${milestone.id}`}>Rock milestones</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`milestone-dependency-search-${milestone.id}`}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search Rocks or milestone numbers…"
                className="pl-8"
              />
            </div>
            <div className="max-h-[min(32rem,40dvh)] divide-y overflow-y-auto rounded-md border bg-background">
              {candidates.length ? candidates.map(candidate => {
                const checked = selectedIds.includes(candidate.id);
                return (
                  <label key={candidate.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40">
                    <Checkbox checked={checked} onCheckedChange={value => toggle(candidate.id, value === true)} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">
                      <span className="block text-sm font-medium leading-snug">{candidate.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{candidate.projectTitle} · {dueDateLabel(candidate.dueDate)}</span>
                    </span>
                  </label>
                );
              }) : <p className="px-3 py-6 text-center text-sm text-muted-foreground">No Rock milestones match this search.</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={isPending} onClick={() => { onSave(selectedIds); setOpen(false); }}>
              {isPending ? "Saving…" : "Save dependencies"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
