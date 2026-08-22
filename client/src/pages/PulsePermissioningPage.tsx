import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

function Cell({ person, meeting, membership, onChange }: { person: any; meeting: any; membership: any; onChange: (hasAccess: boolean) => void }) {
  const role = membership?.meetingRole as string | undefined;
  const locked = role === "owner" || role === "administrator";
  const marker = role === "owner" ? "O" : role === "administrator" ? "A" : null;
  return <div className="flex min-h-14 min-w-28 items-center justify-center gap-2 px-2"><Checkbox aria-label={`${membership ? "Remove" : "Give"} ${person.name} access to ${meeting.name}`} checked={Boolean(membership)} disabled={locked} onCheckedChange={(checked) => onChange(Boolean(checked))} />{marker ? <span aria-label={marker === "O" ? "Owner" : "Administrator"} className="text-base font-semibold text-primary">{marker}</span> : null}</div>;
}

export default function PulsePermissioningPage() {
  const utils = trpc.useUtils();
  const [personFilter, setPersonFilter] = useState<string>("all");
  const data = trpc.pulse.settings.permissioning.useQuery();
  const setPermission = trpc.pulse.settings.setPermission.useMutation({ onSuccess: () => void utils.pulse.settings.permissioning.invalidate(), onError: (error) => toast.error(error.message) });
  const restore = trpc.pulse.settings.restoreMemberAccess.useMutation({ onSuccess: () => void utils.pulse.settings.permissioning.invalidate(), onError: (error) => toast.error(error.message) });
  const memberships = useMemo(() => new Map((data.data?.memberships ?? []).map((row: any) => [`${row.personId}:${row.meetingId}`, row])), [data.data?.memberships]);
  const people = useMemo(() => (data.data?.people ?? []).filter((person: any) => personFilter === "all" || person.id === Number(personFilter)), [data.data?.people, personFilter]);

  const change = (person: any, meeting: any, hasAccess: boolean) => {
    setPermission.mutate({ meetingId: meeting.id, personId: person.id, hasAccess }, {
      onSuccess: (result) => {
        toast(hasAccess ? `${person.name} can now see ${meeting.name}.` : `${person.name} can no longer see ${meeting.name}.`, {
          duration: 8000,
          action: { label: "Undo", onClick: () => hasAccess ? setPermission.mutate({ meetingId: meeting.id, personId: person.id, hasAccess: false }) : restore.mutate({ meetingId: result.undo.meetingId, personId: result.undo.personId }) },
        });
      },
    });
  };

  if (data.isLoading) return <main className="mx-auto max-w-7xl space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></main>;
  if (data.error) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6"><p className="font-medium">Pulse permissioning is not available.</p><p className="mt-2 text-base leading-6 text-muted-foreground">Ask an administrator who has Pulse Settings access to open this page.</p><Button asChild className="mt-4 min-h-11"><Link href="/pulse">Return to Pulse</Link></Button></CardContent></Card></main>;

  return <main className="mx-auto max-w-7xl space-y-6 pb-10"><header className="border-b border-border pb-5"><Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/pulse/settings"><ArrowLeft className="mr-2 h-4 w-4" />Pulse settings</Link></Button><p className="mt-3 text-base font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Meeting access</h1><p className="mt-2 max-w-3xl text-base leading-6 text-muted-foreground"><strong className="text-foreground">Owner and administrator markers show who can manage a meeting. Checkboxes control only who can see that meeting.</strong></p></header><div className="flex flex-wrap items-center gap-3"><Select value={personFilter} onValueChange={setPersonFilter}><SelectTrigger className="min-h-11 w-72 text-base" aria-label="Filter people"><SelectValue placeholder="All people" /></SelectTrigger><SelectContent><SelectItem value="all">All people</SelectItem>{(data.data?.people ?? []).map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}</SelectContent></Select><p className="text-base text-muted-foreground"><span className="font-semibold text-primary">O</span> Owner · <span className="font-semibold text-primary">A</span> Administrator</p></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Meeting visibility</CardTitle><CardDescription>New meetings appear automatically. Checking a box gives that person access to one meeting only.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] border-collapse text-left text-base"><thead className="sticky top-0 bg-muted/60 text-muted-foreground"><tr><th className="sticky left-0 z-10 min-w-56 bg-muted/60 px-4 py-3 font-medium">Name</th>{(data.data?.meetings ?? []).map((meeting: any) => <th key={meeting.id} className="min-w-32 px-3 py-3 text-center font-medium"><span className="block truncate" title={meeting.name}>{meeting.name}</span></th>)}</tr></thead><tbody>{people.map((person: any) => <tr key={person.id} className="border-t border-border"><td className="sticky left-0 z-10 bg-background px-4 py-3 font-medium">{person.name}<span className="block text-sm font-normal text-muted-foreground">{person.email}</span></td>{(data.data?.meetings ?? []).map((meeting: any) => <td key={meeting.id} className="border-l border-border"><Cell person={person} meeting={meeting} membership={memberships.get(`${person.id}:${meeting.id}`)} onChange={(hasAccess) => change(person, meeting, hasAccess)} /></td>)}</tr>)}</tbody></table>{people.length === 0 ? <p className="p-6 text-base text-muted-foreground">No eligible SavvyOS people are available. Ask an administrator to check the active people list.</p> : null}</CardContent></Card><section className="space-y-3 sm:hidden"><h2 className="text-lg font-semibold">Per-person meeting access</h2>{people.map((person: any) => <Card key={person.id}><CardHeader><CardTitle className="text-base">{person.name}</CardTitle><CardDescription>{person.email}</CardDescription></CardHeader><CardContent className="space-y-2">{(data.data?.meetings ?? []).map((meeting: any) => { const membership = memberships.get(`${person.id}:${meeting.id}`) as any; const locked = membership?.meetingRole === "owner" || membership?.meetingRole === "administrator"; return <label key={meeting.id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3"><span>{meeting.name}{membership?.meetingRole === "owner" ? " · Owner" : membership?.meetingRole === "administrator" ? " · Administrator" : ""}</span><Checkbox checked={Boolean(membership)} disabled={locked} aria-label={`${person.name} access to ${meeting.name}`} onCheckedChange={(checked) => change(person, meeting, Boolean(checked))} /></label>; })}</CardContent></Card>)}</section></main>;
}
