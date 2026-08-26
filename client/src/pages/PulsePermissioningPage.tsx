import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, KeyRound, Mail, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const CAPABILITY_LABELS: Record<string, { label: string; description: string }> = {
  settings: { label: "Pulse Settings", description: "Manage Pulse configuration, access, and all L10 setup." },
  scorecard_history: { label: "Historical Scorecard Data", description: "View and correct historic metric values inside Pulse." },
  quarterly_rocks: { label: "Company Quarterly Rocks", description: "View the company-wide quarterly Rock directory." },
  archive_reports: { label: "Archive & Pulse Reports", description: "View concluded L10 history, recaps, and effectiveness reports." },
  email_matrix: { label: "Email Matrix", description: "Manage reminders, confirmations, assignment notices, and recap delivery." },
};

function MeetingCell({ person, meeting, membership, onChange }: { person: any; meeting: any; membership: any; onChange: (hasAccess: boolean) => void }) {
  const role = membership?.meetingRole as string | undefined;
  const tylerLocked = String(person.email ?? "").toLowerCase() === "tyler@savvy.realty";
  const locked = tylerLocked || role === "owner" || role === "administrator";
  const marker = tylerLocked ? "T" : role === "owner" ? "F" : role === "administrator" ? "A" : null;
  return <div className="flex min-h-14 min-w-28 items-center justify-center gap-2 px-2"><Checkbox aria-label={`${membership || tylerLocked ? "Remove" : "Give"} ${person.name} access to ${meeting.name}`} checked={tylerLocked || Boolean(membership)} disabled={locked} onCheckedChange={(checked) => onChange(Boolean(checked))} />{marker ? <span aria-label={marker === "T" ? "Tyler access locked" : marker === "F" ? "Facilitator" : "Administrator"} className="text-base font-semibold text-primary">{marker}</span> : null}</div>;
}

export default function PulsePermissioningPage() {
  const utils = trpc.useUtils();
  const [personFilter, setPersonFilter] = useState<string>("all");
  const data = trpc.pulse.settings.permissioning.useQuery();
  const setPermission = trpc.pulse.settings.setPermission.useMutation({ onSuccess: () => void utils.pulse.settings.permissioning.invalidate(), onError: (error) => toast.error(error.message) });
  const setCapability = trpc.pulse.settings.setPulseCapability.useMutation({ onSuccess: () => void utils.pulse.settings.permissioning.invalidate(), onError: (error) => toast.error(error.message) });
  const restore = trpc.pulse.settings.restoreMemberAccess.useMutation({ onSuccess: () => void utils.pulse.settings.permissioning.invalidate(), onError: (error) => toast.error(error.message) });
  const memberships = useMemo(() => new Map((data.data?.memberships ?? []).map((row: any) => [`${row.personId}:${row.meetingId}`, row])), [data.data?.memberships]);
  const capabilities = useMemo(() => new Map((data.data?.capabilities ?? []).map((row: any) => [`${row.personId}:${row.capability}`, row.allowed])), [data.data?.capabilities]);
  const people = useMemo(() => (data.data?.people ?? []).filter((person: any) => personFilter === "all" || person.id === Number(personFilter)), [data.data?.people, personFilter]);
  const capabilityKeys = (data.data?.capabilityKeys ?? []) as string[];

  const change = (person: any, meeting: any, hasAccess: boolean) => {
    setPermission.mutate({ meetingId: meeting.id, personId: person.id, hasAccess }, {
      onSuccess: (result) => toast(hasAccess ? `${person.name} can now see ${meeting.name}.` : `${person.name} can no longer see ${meeting.name}.`, {
        duration: 8000,
        action: { label: "Undo", onClick: () => hasAccess ? setPermission.mutate({ meetingId: meeting.id, personId: person.id, hasAccess: false }) : restore.mutate({ meetingId: result.undo.meetingId, personId: result.undo.personId }) },
      }),
    });
  };

  if (data.isLoading) return <main className="mx-auto max-w-7xl space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></main>;
  if (data.error) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6"><p className="font-medium">Pulse permissioning is not available.</p><p className="mt-2 text-base leading-6 text-muted-foreground">Ask an administrator who has Pulse Settings access to open this page.</p><Button asChild className="mt-4 min-h-11"><Link href="/pulse">Return to Pulse</Link></Button></CardContent></Card></main>;

  return <main className="mx-auto max-w-7xl space-y-6 pb-10"><header className="border-b border-border pb-5"><Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/pulse/settings"><ArrowLeft className="mr-2 h-4 w-4" />Pulse settings</Link></Button><p className="mt-3 text-base font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Pulse permissions</h1><p className="mt-2 max-w-3xl text-base leading-6 text-muted-foreground">The main SavvyOS Pulse permission opens this module. These controls separately govern what a person can manage or view within Pulse. Tyler’s access is permanently locked.</p></header><div className="flex flex-wrap items-center gap-3"><Select value={personFilter} onValueChange={setPersonFilter}><SelectTrigger className="min-h-11 w-72 text-base" aria-label="Filter people"><SelectValue placeholder="All people" /></SelectTrigger><SelectContent><SelectItem value="all">All people</SelectItem>{(data.data?.people ?? []).map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}</SelectContent></Select><p className="text-base text-muted-foreground"><span className="font-semibold text-primary">F</span> Facilitator · <span className="font-semibold text-primary">A</span> Administrator · <span className="font-semibold text-primary">T</span> Tyler lock</p></div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />Pulse capability matrix</CardTitle><CardDescription>Grant only the Pulse-wide capabilities a person needs. The matrix remains independent from the main SavvyOS super-permissions system.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[800px] border-collapse text-left text-base"><thead className="bg-muted/60 text-muted-foreground"><tr><th className="sticky left-0 z-10 min-w-64 bg-muted/60 px-4 py-3 font-medium">Capability</th>{people.map((person: any) => <th key={person.id} className="min-w-36 px-3 py-3 text-center font-medium"><span className="block truncate">{person.name}</span><span className="block truncate text-xs font-normal">{person.email}</span></th>)}</tr></thead><tbody>{capabilityKeys.map((capability) => { const meta = CAPABILITY_LABELS[capability] ?? { label: capability, description: "Pulse capability" }; return <tr key={capability} className="border-t border-border"><td className="sticky left-0 z-10 bg-background px-4 py-3"><p className="font-medium">{meta.label}</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">{meta.description}</p></td>{people.map((person: any) => { const tylerLocked = String(person.email ?? "").toLowerCase() === "tyler@savvy.realty"; return <td key={person.id} className="border-l border-border text-center"><Checkbox aria-label={`${meta.label} for ${person.name}`} checked={tylerLocked || Boolean(capabilities.get(`${person.id}:${capability}`))} disabled={tylerLocked} onCheckedChange={(checked) => setCapability.mutate({ personId: person.id, capability: capability as any, allowed: Boolean(checked) })} /></td>; })}</tr>; })}</tbody></table></CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />L10 visibility and submission access</CardTitle><CardDescription>New meetings appear automatically. A check grants a person the ability to see and submit content to that L10; facilitators and administrators remain protected from removal.</CardDescription></CardHeader><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] border-collapse text-left text-base"><thead className="sticky top-0 bg-muted/60 text-muted-foreground"><tr><th className="sticky left-0 z-10 min-w-56 bg-muted/60 px-4 py-3 font-medium">Name</th>{(data.data?.meetings ?? []).map((meeting: any) => <th key={meeting.id} className="min-w-32 px-3 py-3 text-center font-medium"><span className="block truncate" title={meeting.name}>{meeting.name}</span></th>)}</tr></thead><tbody>{people.map((person: any) => <tr key={person.id} className="border-t border-border"><td className="sticky left-0 z-10 bg-background px-4 py-3 font-medium">{person.name}<span className="block text-sm font-normal text-muted-foreground">{person.email}</span></td>{(data.data?.meetings ?? []).map((meeting: any) => <td key={meeting.id} className="border-l border-border"><MeetingCell person={person} meeting={meeting} membership={memberships.get(`${person.id}:${meeting.id}`)} onChange={(hasAccess) => change(person, meeting, hasAccess)} /></td>)}</tr>)}</tbody></table>{people.length === 0 ? <p className="p-6 text-base text-muted-foreground">No eligible SavvyOS people are available. Ask an administrator to check the active people list.</p> : null}</CardContent></Card>

    <Card className="border-cyan-200 bg-cyan-50/30"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-primary" />Per-meeting email matrix</CardTitle><CardDescription>Use each meeting’s configuration page to select its reminder, submission confirmation, To-Do assignment, overdue, cascade, and post-meeting recap delivery rules. Granting the Email Matrix capability above makes that responsibility explicit in the Pulse access record.</CardDescription></CardHeader></Card>
  </main>;
}
