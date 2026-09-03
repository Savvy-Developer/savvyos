import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const types = {
  todo: { label: "To-Do", detail: "A clear commitment for the next seven days." },
  issue: { label: "Issue", detail: "A problem for this L10 to work through IDS." },
  rock: { label: "Rock", detail: "A quarterly commitment with a clear definition of done." },
} as const;
type ItemType = keyof typeof types;

export function PulseL10WorkCreator({ meetings, onCreated }: { meetings: any[]; onCreated: () => void }) {
  const [meetingId, setMeetingId] = useState("");
  const [type, setType] = useState<ItemType>("todo");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [definitionOfDone, setDefinitionOfDone] = useState("");
  const create = trpc.pulse.l10.createWorkItem.useMutation({
    onSuccess: () => {
      const meeting = meetings.find((entry) => entry.id === meetingId);
      toast.success(`${types[type].label} added to ${meeting?.name ?? "the L10"}.`);
      setTitle(""); setDueDate(""); setDefinitionOfDone("");
      onCreated();
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => { if (meetings.length === 1 && !meetingId) setMeetingId(meetings[0].id); }, [meetings, meetingId]);
  const meeting = meetings.find((entry) => entry.id === meetingId);
  const submit = () => {
    if (!meeting || !title.trim() || (type === "rock" && !definitionOfDone.trim())) return;
    create.mutate({ meetingId, type, title: title.trim(), dueDate: type === "todo" ? dueDate || null : null, definitionOfDone: type === "rock" ? definitionOfDone.trim() : undefined });
  };

  return <Card id="add-to-l10" className="border-primary/25 bg-primary/[0.025] scroll-mt-6"><CardHeader><CardTitle>Add work to an L10</CardTitle><CardDescription>New work has one home. Choose the L10 first; the item stays there unless someone deliberately routes it elsewhere.</CardDescription></CardHeader><CardContent className="space-y-5"><section><p className="mb-2 text-sm font-semibold">1. Choose the L10 this belongs to</p><div className="flex flex-wrap gap-2">{meetings.map((entry: any) => <button type="button" key={entry.id} onClick={() => setMeetingId(entry.id)} className={`min-h-11 rounded-lg border px-3 text-left text-sm font-medium transition-colors ${meetingId === entry.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}>{entry.name}</button>)}</div>{!meetings.length ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">You need to belong to an L10 before adding Pulse work.</p> : null}</section>{meeting ? <><section className="rounded-xl border border-primary/25 bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-primary">This item will live in</p><p className="mt-1 text-lg font-semibold">{meeting.name}</p><p className="mt-1 text-sm text-muted-foreground">It will not be created as personal or generic work.</p></section><section><p className="mb-2 text-sm font-semibold">2. Choose what to add</p><div className="grid gap-2 sm:grid-cols-3">{(Object.keys(types) as ItemType[]).map((key) => <button type="button" key={key} onClick={() => setType(key)} className={`min-h-20 rounded-xl border p-3 text-left ${type === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}><span className="block font-semibold">{types[key].label}</span><span className={`mt-1 block text-xs leading-4 ${type === key ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{types[key].detail}</span></button>)}</div></section><section className="grid gap-3 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="l10-work-title">3. {types[type].label} name</Label><Input id="l10-work-title" className="min-h-11" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={type === "todo" ? "What will you complete before the next L10?" : type === "issue" ? "What needs to be identified, discussed, and solved?" : "What quarterly commitment matters most?"}/></div>{type === "todo" ? <div className="space-y-2"><Label htmlFor="l10-work-due-date">Due date</Label><Input id="l10-work-due-date" className="min-h-11" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}/><p className="text-xs text-muted-foreground">Leave blank to use the next-seven-days default.</p></div> : null}{type === "rock" ? <div className="space-y-2 sm:col-span-2"><Label htmlFor="l10-work-definition">Definition of done</Label><Textarea id="l10-work-definition" className="min-h-20" value={definitionOfDone} onChange={(event) => setDefinitionOfDone(event.target.value)} placeholder="What specifically must be true for this Rock to be complete?"/></div> : null}</section><Button className="min-h-11" disabled={!title.trim() || (type === "rock" && !definitionOfDone.trim()) || create.isPending} onClick={submit}><Plus className="mr-2 h-4 w-4"/>{create.isPending ? "Adding…" : `Add ${types[type].label} to ${meeting.name}`}</Button></> : null}</CardContent></Card>;
}
