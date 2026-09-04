import { type ReactNode, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PulseItemEditor } from "@/components/pulse/PulseItemEditor";

/** The shared My EOS work action. Destination selection is supplied by its workspace context. */
export function PulseL10WorkCreator({ onCreated, workspaceControls }: { meetings?: Array<{ id: string; name: string }>; onCreated: () => void; workspaceControls?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><section id="add-to-l10" className="scroll-mt-6 rounded-lg border border-primary/25 bg-primary/[0.025] px-3 py-2.5 sm:px-3.5"><div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2"><div className="min-w-0 flex-1">{workspaceControls ?? <div><p className="text-sm font-semibold">Work destination</p><p className="mt-0.5 text-xs text-muted-foreground">Choose the L10 home when you create new work.</p></div>}</div><Button type="button" className="h-10 shrink-0" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add work</Button></div></section><PulseItemEditor open={open} onOpenChange={setOpen} defaultType="todo" onSaved={onCreated} /></>;
}
