import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Building2, ClipboardList, Loader2, Pencil, Plus, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

const ROOT_SEAT = "__root__";

type Seat = {
  id: number;
  title: string;
  description: string | null;
  parentSeatId: number | null;
  holders: Array<{ id: number; name: string | null; email: string | null; title: string | null }>;
  responsibilityCount: number;
};
type Person = { id: number; name: string | null; email: string | null; title: string | null; role: string };

function personLabel(person: { name: string | null; email: string | null; title: string | null }) {
  const name = person.name ?? person.email ?? "Unnamed user";
  return person.title ? `${name} — ${person.title}` : name;
}

function SeatCard({ seat, onOpen }: { seat: Seat; onOpen: (id: number) => void }) {
  const holderLabel = seat.holders.length
    ? seat.holders.map(holder => holder.name ?? holder.email ?? "Unnamed user").join(", ")
    : "Unfilled";
  return (
    <button
      type="button"
      onClick={() => onOpen(seat.id)}
      className="group w-full max-w-sm rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Building2 className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug group-hover:text-primary">{seat.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{seat.description || "No seat description yet."}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        <Badge variant={seat.holders.length ? "secondary" : "outline"} className="max-w-full truncate">
          <UserRound className="mr-1 h-3 w-3 shrink-0" />{holderLabel}
        </Badge>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><ClipboardList className="h-3.5 w-3.5" />{seat.responsibilityCount} R&R{seat.responsibilityCount === 1 ? "" : "s"}</span>
      </div>
    </button>
  );
}

function SeatBranch({ seat, childrenByParent, onOpen }: { seat: Seat; childrenByParent: Map<number | null, Seat[]>; onOpen: (id: number) => void }) {
  const children = childrenByParent.get(seat.id) ?? [];
  return (
    <li className="relative min-w-[19rem]">
      <SeatCard seat={seat} onOpen={onOpen} />
      {children.length > 0 && (
        <ul className="ml-6 mt-4 space-y-4 border-l border-dashed border-border pl-6">
          {children.map(child => <SeatBranch key={child.id} seat={child} childrenByParent={childrenByParent} onOpen={onOpen} />)}
        </ul>
      )}
    </li>
  );
}

function SeatEditorDialog({
  open,
  onOpenChange,
  seat,
  seats,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seat: Seat | null;
  seats: Seat[];
  people: Person[];
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [parentSeatId, setParentSeatId] = useState(ROOT_SEAT);
  const [holderIds, setHolderIds] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(seat?.title ?? "");
    setDescription(seat?.description ?? "");
    setParentSeatId(seat?.parentSeatId ? String(seat.parentSeatId) : ROOT_SEAT);
    setHolderIds(seat?.holders.map(holder => holder.id) ?? []);
  }, [open, seat]);

  const create = trpc.accountabilityChart.create.useMutation({
    onSuccess: ({ id }) => {
      void utils.accountabilityChart.list.invalidate();
      void utils.accountabilityChart.seatOptions.invalidate();
      toast.success("Accountability seat created");
      onOpenChange(false);
      void id;
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.accountabilityChart.update.useMutation({
    onSuccess: () => {
      void utils.accountabilityChart.list.invalidate();
      void utils.accountabilityChart.detail.invalidate();
      void utils.accountabilityChart.seatOptions.invalidate();
      toast.success("Accountability seat saved");
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
  }

  function toggleHolder(id: number, checked: boolean) {
    setHolderIds(current => checked ? Array.from(new Set([...current, id])) : current.filter(holderId => holderId !== id));
  }

  function save() {
    if (!title.trim()) return toast.error("Enter a clear seat title.");
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      parentSeatId: parentSeatId === ROOT_SEAT ? null : Number(parentSeatId),
      holderIds,
    };
    if (seat) update.mutate({ id: seat.id, ...payload });
    else create.mutate(payload);
  }

  const saving = create.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{seat ? "Edit accountability seat" : "Add accountability seat"}</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="seat-title">Seat title *</Label><Input id="seat-title" autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="Head of Operations" /></div>
            <div className="space-y-1.5"><Label>Reports to seat</Label><Select value={parentSeatId} onValueChange={setParentSeatId}><SelectTrigger><SelectValue placeholder="Top-level seat" /></SelectTrigger><SelectContent><SelectItem value={ROOT_SEAT}>Top-level seat</SelectItem>{seats.filter(candidate => candidate.id !== seat?.id).map(candidate => <SelectItem key={candidate.id} value={String(candidate.id)}>{candidate.title}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="seat-description">What this seat is accountable for</Label><Textarea id="seat-description" value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe the outcome and scope of this seat." rows={4} /></div>
          <div className="space-y-2"><div><Label>Seat holders</Label><p className="mt-1 text-xs text-muted-foreground">Select every current person holding this seat. Leave unselected to mark the seat as unfilled.</p></div><div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">{people.map(person => <label key={person.id} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"><Checkbox checked={holderIds.includes(person.id)} onCheckedChange={checked => toggleHolder(person.id, checked === true)} className="mt-0.5" /><span className="min-w-0"><span className="block text-sm font-medium">{personLabel(person)}</span><span className="block text-xs text-muted-foreground capitalize">{person.role.replace(/_/g, " ")}</span></span></label>)}</div></div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : seat ? "Save seat" : "Create seat"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountabilityChartPage() {
  const [, navigate] = useLocation();
  const initialSeatId = Number(new URLSearchParams(window.location.search).get("seat"));
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(Number.isFinite(initialSeatId) && initialSeatId > 0 ? initialSeatId : null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSeat, setEditingSeat] = useState<Seat | null>(null);
  const { data: seats = [], isLoading } = trpc.accountabilityChart.list.useQuery();
  const { data: people = [] } = trpc.accountabilityChart.people.useQuery();
  const detail = trpc.accountabilityChart.detail.useQuery({ id: selectedSeatId! }, { enabled: selectedSeatId != null });

  const childrenByParent = useMemo(() => {
    const map = new Map<number | null, Seat[]>();
    for (const seat of seats as Seat[]) {
      const children = map.get(seat.parentSeatId) ?? [];
      children.push(seat);
      map.set(seat.parentSeatId, children);
    }
    return map;
  }, [seats]);
  const rootSeats = childrenByParent.get(null) ?? [];

  function openCreate() {
    setEditingSeat(null);
    setEditorOpen(true);
  }
  function openEdit() {
    const selected = (seats as Seat[]).find(seat => seat.id === selectedSeatId) ?? null;
    setEditingSeat(selected);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Building2 className="h-6 w-6" />Accountability Chart</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">A seat-based view of accountability. It is separate from the current Org Chart, so reporting relationships and user records remain unchanged.</p></div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add seat</Button>
      </div>
      <Card className="border-primary/15 bg-primary/[0.025]"><CardContent className="flex gap-3 p-4 text-sm text-muted-foreground"><Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p><strong className="text-foreground">Seat holders and R&Rs are distinct.</strong> A person can hold one or more seats. An R&R keeps its existing owner and can additionally be attached to the accountable seat from the R&R editor.</p></CardContent></Card>
      {isLoading ? <div className="py-16 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Loading accountability seats…</div> : rootSeats.length === 0 ? <Card><CardContent className="py-16 text-center"><Building2 className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">Start with the first accountability seat</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Add a top-level seat, assign its current holder if there is one, then build its child seats beneath it.</p><Button className="mt-5" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add first seat</Button></CardContent></Card> : <Card className="overflow-x-auto"><CardContent className="min-w-max p-6"><ul className="space-y-6">{rootSeats.map(seat => <SeatBranch key={seat.id} seat={seat} childrenByParent={childrenByParent} onOpen={setSelectedSeatId} />)}</ul></CardContent></Card>}
      <Dialog open={selectedSeatId != null} onOpenChange={open => !open && setSelectedSeatId(null)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{detail.data?.title ?? "Accountability seat"}</DialogTitle></DialogHeader>{detail.isLoading ? <div className="py-12 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading seat…</div> : detail.data && <div className="space-y-5"><div><p className="text-sm leading-6 text-muted-foreground">{detail.data.description || "No seat description yet."}</p></div><div className="rounded-lg border p-4"><p className="text-sm font-semibold">Current seat holders</p>{detail.data.holders.length ? <div className="mt-3 flex flex-wrap gap-2">{detail.data.holders.map((holder: any) => <Badge key={holder.id} variant="secondary"><UserRound className="mr-1 h-3 w-3" />{personLabel(holder)}</Badge>)}</div> : <p className="mt-2 text-sm text-muted-foreground">This seat is currently unfilled.</p>}</div><div className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4" />Attached R&Rs</p><p className="mt-1 text-xs text-muted-foreground">Each R&R retains its own person-level owner.</p></div><Button variant="outline" size="sm" onClick={() => navigate(`/roles-responsibilities?seat=${detail.data.id}`)}>Open R&R directory</Button></div>{detail.data.responsibilities.length ? <div className="mt-3 divide-y">{detail.data.responsibilities.map((responsibility: any) => <button key={responsibility.id} type="button" onClick={() => navigate(`/roles-responsibilities/${responsibility.id}`)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-primary"><span><span className="block text-sm font-medium">{responsibility.title}</span><span className="block text-xs text-muted-foreground">Owner: {responsibility.owner.name ?? responsibility.owner.email}{responsibility.owner.title ? ` · ${responsibility.owner.title}` : ""}</span></span><Badge variant="outline">{responsibility.cadence}</Badge></button>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No R&Rs are attached yet. Edit an R&R and choose this seat to connect it.</p>}</div></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setSelectedSeatId(null)}>Close</Button><Button type="button" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Edit seat</Button></DialogFooter></DialogContent></Dialog>
      <SeatEditorDialog open={editorOpen} onOpenChange={setEditorOpen} seat={editingSeat} seats={seats as Seat[]} people={people as Person[]} />
    </div>
  );
}
