import { useState } from "react";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Operation = "move_c_todo_to_a" | "add_p3_to_b" | "remove_p3_from_c" | "change_a_label" | "disable_a_issues";
const operations: Array<{ key: Operation; title: string; detail: string }> = [
  { key: "move_c_todo_to_a", title: "Move C to-do to A", detail: "Proves an item leaves P3 and enters P1, with a move record." },
  { key: "add_p3_to_b", title: "Add P3 to B", detail: "Proves B items enter P3’s payload through membership alone." },
  { key: "remove_p3_from_c", title: "Remove P3 from C", detail: "Proves C items leave P3 while staying available to P2." },
  { key: "change_a_label", title: "Change A label", detail: "Proves the label changes grouping only, not access or work." },
  { key: "disable_a_issues", title: "Disable A issues", detail: "Proves issue records stay stored while the section leaves the payload." },
];

function IdList({ values }: { values: string[] }) {
  return values.length ? <ul className="space-y-1 font-mono text-xs text-muted-foreground">{values.map((value) => <li key={value} className="break-all">{value}</li>)}</ul> : <p className="text-sm text-muted-foreground">None</p>;
}

function PersonEvidence({ person }: { person: any }) {
  return <Card className="min-w-0"><CardHeader className="pb-3"><CardTitle className="text-base">{person.key}</CardTitle><CardDescription>Person ID: {person.personId}</CardDescription></CardHeader><CardContent className="space-y-5 text-sm">
    <section><h3 className="mb-2 font-medium">Visible meeting IDs</h3><IdList values={person.visibleMeetingIds} /></section>
    <section><h3 className="mb-2 font-medium">Work returned by the real query</h3>{person.workItems.length ? <div className="space-y-2">{person.workItems.map((item: any) => <div key={item.id} className="rounded-md border border-border p-2"><p className="font-medium">{item.title}</p><p className="font-mono text-xs text-muted-foreground">{item.id}</p><p className="mt-1 text-xs"><Badge variant="outline">{item.type}</Badge><span className="ml-2">{item.source}</span></p></div>)}</div> : <p className="text-muted-foreground">No work items returned.</p>}</section>
    <section><h3 className="mb-2 font-medium">Search result IDs</h3><IdList values={person.searchItemIds} /></section>
    <section><h3 className="mb-2 font-medium">Pulse navigation</h3><div className="flex flex-wrap gap-1">{person.navDestinations.map((destination: any) => <Badge key={destination.path} variant="secondary">{destination.label}</Badge>)}</div></section>
    <section><h3 className="mb-2 font-medium">Member payload boundary</h3><div className="space-y-2">{person.meetingPayloads.map((meeting: any) => <div key={meeting.meetingId} className="rounded-md bg-muted/50 p-2"><p className="font-medium">{meeting.name ?? meeting.meetingId}</p>{meeting.visible ? <><p className="mt-1 text-xs text-muted-foreground">Sections: {meeting.enabledSections.join(", ") || "none"}</p><p className="mt-1 text-xs">{Object.entries(meeting.sensitiveKeysPresent).map(([key, present]) => <span key={key} className={present ? "mr-2 text-destructive" : "mr-2 text-emerald-700"}>{key}: {present ? "present" : "absent"}</span>)}</p></> : <p className="mt-1 text-xs text-muted-foreground">Not returned: {meeting.error}</p>}</div>)}</div></section>
  </CardContent></Card>;
}

function Snapshot({ data }: { data: any }) {
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle className="text-lg">Fixture</CardTitle><CardDescription>Only marked, reversible records are used. The super admin P4 is deliberately in no meetings.</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3">{Object.entries(data.fixture.meetings).map(([key, meeting]: any) => <div key={key} className="rounded-lg border border-border p-3"><p className="font-medium">Meeting {key}</p><p className="mt-1 text-sm">{meeting.name}</p><p className="font-mono text-xs text-muted-foreground break-all">{meeting.id}</p><Badge className="mt-2" variant="outline">{meeting.label}</Badge></div>)}</div></CardContent></Card>
    <section><h2 className="mb-3 text-lg font-semibold">Side-by-side membership proof</h2><div className="grid gap-4 xl:grid-cols-4">{data.persons.map((person: any) => <PersonEvidence key={person.key} person={person} />)}</div></section>
    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-lg">Shared section queries</CardTitle><CardDescription>Dashboard and runner consumers reference one named query for every section.</CardDescription></CardHeader><CardContent className="space-y-2">{data.sectionProof.map((row: any) => <div key={row.section} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"><span className="font-medium">{row.section}</span><span className="font-mono text-xs">{row.queryFunction}</span>{row.sameFunction ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Same function" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}</div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-lg">No fallback proof</CardTitle><CardDescription>Missing and inaccessible IDs are denied; no default meeting is substituted.</CardDescription></CardHeader><CardContent className="space-y-4"><div><p className="font-medium">Missing meeting</p><p className="mt-1 text-sm text-muted-foreground">{data.missingMeetingError.error}</p></div><div><p className="font-medium">P4 direct read of Meeting A</p><p className="mt-1 text-sm text-muted-foreground">{data.p4DirectDenial.error}</p></div></CardContent></Card></div>
  </div>;
}

export default function PulseThinSlicePage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pulse.thinSlice.snapshot.useQuery(undefined, { retry: false });
  const [lastOperation, setLastOperation] = useState<any>(null);
  const reset = trpc.pulse.thinSlice.reset.useMutation({ onSuccess: (result) => { setLastOperation({ operation: "reset", after: result }); utils.pulse.thinSlice.snapshot.invalidate(); } });
  const perform = trpc.pulse.thinSlice.perform.useMutation({ onSuccess: (result) => { setLastOperation(result); utils.pulse.thinSlice.snapshot.invalidate(); } });
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (error) return <Card><CardHeader><CardTitle>Pulse thin slice</CardTitle><CardDescription>{error.message}</CardDescription></CardHeader></Card>;
  return <div className="space-y-6"><header className="border-b border-border pb-5"><div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-medium">Super-admin model check</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Pulse thin slice</h1><p className="mt-2 max-w-3xl text-muted-foreground">This internal page proves meeting membership, work ownership, navigation, and payload boundaries before more Pulse surfaces are built.</p></header>
    <div className="flex flex-wrap gap-2"><Button onClick={() => reset.mutate()} disabled={reset.isPending || perform.isPending}><RefreshCw className="mr-2 h-4 w-4" />Reset fixture</Button>{operations.map((operation) => <Button key={operation.key} variant="outline" title={operation.detail} onClick={() => perform.mutate({ operation: operation.key })} disabled={reset.isPending || perform.isPending}>{operation.title}</Button>)}</div>
    {lastOperation && <Card className="border-primary/30 bg-primary/5"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" />Last operation: {lastOperation.operation}</CardTitle><CardDescription>The full before and after evidence is available below through the refreshed model snapshot.</CardDescription></CardHeader></Card>}
    {data && <Snapshot data={lastOperation?.after ?? data} />}
  </div>;
}
