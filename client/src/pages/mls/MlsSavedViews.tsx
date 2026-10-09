import { useState } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { Bookmark, Loader2, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import type { AppRouter } from "../../../../server/routers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";

type Outputs = inferRouterOutputs<AppRouter>["mlsProperties"];
export type MlsSavedView = Outputs["savedViews"][number];
export type MlsSavedViewState = NonNullable<MlsSavedView["state"]>;

/** Drops empty values so a saved view and the live page compare like for like. */
function cleanFilters(filters: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = Array.isArray(value) ? [...value].sort() : value;
  }
  return out;
}

/** Rounds coordinates to about 100 m so a map that settles a few pixels off still counts as the same view. */
function roundDeep(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, roundDeep(item)]));
  }
  return value;
}

/** What makes two views "the same" for the button label: filters, sort, and searched area. */
export function savedViewSignature(state: Pick<MlsSavedViewState, "filters" | "sort" | "bounds" | "area">) {
  return JSON.stringify(roundDeep({ filters: cleanFilters(state.filters as Record<string, unknown>), sort: state.sort, bounds: state.bounds, area: state.area }));
}

type Editor = { mode: "create" } | { mode: "rename"; view: MlsSavedView } | null;

export function MlsSavedViewsButton({ current, onApply }: {
  /** The page's current search, map, and layout. */
  current: MlsSavedViewState;
  onApply: (state: MlsSavedViewState) => void;
}) {
  const utils = trpc.useUtils();
  const views = trpc.mlsProperties.savedViews.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const refresh = () => utils.mlsProperties.savedViews.invalidate();
  const onError = (error: { message: string }) => toast.error(error.message);
  const create = trpc.mlsProperties.createSavedView.useMutation({ onSuccess: refresh, onError });
  const update = trpc.mlsProperties.updateSavedView.useMutation({ onSuccess: refresh, onError });
  const setDefault = trpc.mlsProperties.setDefaultSavedView.useMutation({ onSuccess: refresh, onError });
  const remove = trpc.mlsProperties.deleteSavedView.useMutation({ onSuccess: refresh, onError });
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  // In-app confirm instead of window.confirm: a native prompt blocks the whole tab.
  const [pendingDelete, setPendingDelete] = useState<MlsSavedView | null>(null);

  const list = views.data ?? [];
  const currentSignature = savedViewSignature(current);
  const active = list.find(view => view.state && savedViewSignature(view.state) === currentSignature);
  const busy = create.isPending || update.isPending || setDefault.isPending || remove.isPending;

  const startCreate = () => { setName(""); setMakeDefault(list.length === 0); setEditor({ mode: "create" }); setOpen(false); };
  const startRename = (view: MlsSavedView) => { setName(view.name); setEditor({ mode: "rename", view }); setOpen(false); };
  const startDelete = (view: MlsSavedView) => { setPendingDelete(view); setOpen(false); };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync({ id: pendingDelete.id });
      toast.success(`Deleted ${pendingDelete.name}`);
      setPendingDelete(null);
    } catch {
      // onError already showed the reason; keep the dialog open to retry or cancel.
    }
  };
  const apply = (view: MlsSavedView) => {
    if (!view.state) { toast.error(`"${view.name}" was saved in an older format. Open your search, then use Update to re-save it.`); return; }
    onApply(view.state);
    setOpen(false);
    toast.success(`Showing ${view.name}`);
  };
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Name the view"); return; }
    try {
      if (editor?.mode === "create") {
        await create.mutateAsync({ name: trimmed, state: current as any, makeDefault });
        toast.success(makeDefault ? `Saved ${trimmed} as your default view` : `Saved ${trimmed}`);
      } else if (editor?.mode === "rename") {
        await update.mutateAsync({ id: editor.view.id, name: trimmed });
        toast.success(`Renamed to ${trimmed}`);
      }
      setEditor(null);
    } catch {
      // The mutation's onError already showed the reason; keep the dialog open to fix it.
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-[240px]">
            <Bookmark className="mr-1.5 h-4 w-4 shrink-0" />
            <span className="truncate">{active ? `Saved Views: ${active.name}` : "Saved Views"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="z-[2200] w-[360px] max-w-[calc(100vw-2rem)] p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <strong className="text-sm">Saved Views</strong>
            <Button size="sm" onClick={startCreate} disabled={busy}><Plus className="mr-1 h-4 w-4" />Save current view</Button>
          </div>
          <div className="max-h-[50dvh] overflow-y-auto p-1">
            {views.isLoading ? <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your views</div> : null}
            {views.isError ? <div className="p-4 text-sm text-muted-foreground">Your views did not load. <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void views.refetch()}>Try again</Button></div> : null}
            {!views.isLoading && !views.isError && !list.length ? (
              <p className="p-4 text-sm text-muted-foreground">No saved views yet. Set your filters, map area, and layout, then save them here.</p>
            ) : null}
            {list.map(view => (
              <div key={view.id} className={`group flex items-center gap-1 rounded-md px-1 ${active?.id === view.id ? "bg-teal-50" : "hover:bg-slate-50"}`}>
                <button type="button" onClick={() => apply(view)} className="min-w-0 flex-1 px-2 py-2 text-left">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{view.name}</span>
                    {view.isDefault ? <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Default</span> : null}
                  </div>
                  {!view.state ? <div className="text-[11px] text-amber-700">Needs re-saving</div> : active?.id === view.id ? <div className="text-[11px] text-teal-700">Showing now</div> : null}
                </button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}
                  title={view.isDefault ? "Remove as default view" : "Make this my default view"}
                  aria-label={view.isDefault ? `Remove ${view.name} as default view` : `Make ${view.name} my default view`}
                  onClick={() => setDefault.mutate({ id: view.isDefault ? null : view.id }, { onSuccess: () => toast.success(view.isDefault ? "Default view cleared" : `${view.name} is now your default view`) })}>
                  <Star className={`h-4 w-4 ${view.isDefault ? "fill-amber-400 text-amber-500" : "text-slate-400"}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} title="Update with my current search" aria-label={`Update ${view.name} with my current search`}
                  onClick={() => update.mutate({ id: view.id, state: current as any }, { onSuccess: () => toast.success(`Updated ${view.name}`) })}>
                  <RefreshCw className="h-4 w-4 text-slate-500" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} title="Rename" aria-label={`Rename ${view.name}`} onClick={() => startRename(view)}>
                  <Pencil className="h-4 w-4 text-slate-500" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} title="Delete" aria-label={`Delete ${view.name}`}
                  onClick={() => startDelete(view)}>
                  <Trash2 className="h-4 w-4 text-slate-500" />
                </Button>
              </div>
            ))}
          </div>
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Your default view opens each time you start MLS Properties in a new tab. Views are private to you.</p>
        </PopoverContent>
      </Popover>
      <Dialog open={!!editor} onOpenChange={value => { if (!value) setEditor(null); }}>
        <DialogContent overlayClassName="z-[2300]" className="z-[2310] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "rename" ? "Rename view" : "Save current view"}</DialogTitle>
            <DialogDescription>
              {editor?.mode === "rename" ? "Give this view a new name." : "Saves your filters, sort, map area, and layout so you can return to them in one click."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
            <div>
              <Label htmlFor="mls-saved-view-name" className="mb-1 block text-xs text-slate-600">Name</Label>
              <Input id="mls-saved-view-name" autoFocus value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="e.g. Asheville cabins under $600k" />
            </div>
            {editor?.mode === "create" ? (
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={makeDefault} onCheckedChange={value => setMakeDefault(value === true)} />Make this my default view</label>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
              <Button type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}{editor?.mode === "rename" ? "Rename" : "Save view"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!pendingDelete} onOpenChange={value => { if (!value && !remove.isPending) setPendingDelete(null); }}>
        <DialogContent overlayClassName="z-[2300]" className="z-[2310] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete saved view?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? `"${pendingDelete.name}" will be removed.${pendingDelete.isDefault ? " It is your default view, so MLS Properties will open without one." : ""}` : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={remove.isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()} disabled={remove.isPending}>
              {remove.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
