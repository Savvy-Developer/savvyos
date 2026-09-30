import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PulseItemEditor } from "@/components/pulse/PulseItemEditor";

/** Creates My EOS work in the meeting selected by the shared workspace control. */
export function PulseL10WorkCreator({ meetingId, onCreated }: { meetingId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return <><section id="add-to-l10" className="scroll-mt-6 rounded-lg border border-primary/25 bg-primary/[0.025] px-3 py-2.5 sm:px-3.5"><div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Add work</p><p className="mt-0.5 text-xs text-muted-foreground">New To-Dos and Issues start in the L10 selected above.</p></div><Button type="button" className="h-10 shrink-0" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Add work</Button></div></section><PulseItemEditor open={open} onOpenChange={setOpen} defaultType="todo" defaultDestinationId={meetingId} onSaved={onCreated} /></>;
}
