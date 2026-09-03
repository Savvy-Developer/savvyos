import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PulseItemEditor } from "@/components/pulse/PulseItemEditor";

/** Compatibility wrapper for My EOS; all item behavior is owned by the shared editor. */
export function PulseL10WorkCreator({ onCreated }: { meetings?: Array<{ id: string; name: string }>; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return <><section id="add-to-l10" className="scroll-mt-6 rounded-xl border border-primary/25 bg-primary/[0.025] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Add a To-Do or Issue</h3><p className="mt-1 text-sm text-muted-foreground">Choose its destination, then schedule, prioritize, assign, and track it in one place.</p></div><Button type="button" className="min-h-11" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add work</Button></div></section><PulseItemEditor open={open} onOpenChange={setOpen} defaultType="todo" onSaved={onCreated} /></>;
}
