import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const SECTIONS = [
  { key: "segue", label: "Segue", description: "Open with personal or professional wins." },
  { key: "headlines", label: "Headlines", description: "Share key updates that need the group’s awareness." },
  { key: "scorecard", label: "Scorecard", description: "Review the numbers that indicate progress." },
  { key: "rocks", label: "Rocks", description: "Review the quarter’s most important priorities." },
  { key: "todos", label: "To-dos", description: "Check commitments and assign next actions." },
  { key: "issues", label: "IDS", description: "Identify, discuss, and solve the most important obstacles." },
  { key: "conclude", label: "Conclude", description: "Confirm commitments, score the meeting, and close the loop." },
] as const;

type LabelType = "level_10" | "one_on_one" | "other";
type SectionKey = (typeof SECTIONS)[number]["key"];

export default function PulseCreateMeetingPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const people = trpc.pulse.settings.peopleForAdministration.useQuery();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [label, setLabel] = useState<LabelType>("level_10");
  const [ownerId, setOwnerId] = useState("");
  const [administratorId, setAdministratorId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [enabledSections, setEnabledSections] = useState<Set<SectionKey>>(() => new Set(SECTIONS.map((section) => section.key)));
  const create = trpc.pulse.settings.createMeeting.useMutation({
    onSuccess: async () => {
      await utils.pulse.shell.invalidate();
      navigate("/pulse");
    },
  });

  const selectedIds = useMemo(() => new Set([Number(ownerId), Number(administratorId), ...memberIds].filter(Boolean)), [ownerId, administratorId, memberIds]);
  const matching = useMemo(() => (people.data ?? []).filter((person: any) => !selectedIds.has(person.id) && `${person.name} ${person.email}`.toLocaleLowerCase().includes(memberSearch.toLocaleLowerCase())), [people.data, selectedIds, memberSearch]);
  const oneOnOneError = label === "one_on_one" && (ownerId === administratorId || memberIds.length > 0) ? "A one-on-one has exactly two people: a distinct owner and administrator." : null;
  const essentialsReady = Boolean(name.trim() && purpose.trim() && ownerId && administratorId && !oneOnOneError);
  const personName = (id: number) => (people.data ?? []).find((person: any) => person.id === id)?.name ?? "Person";
  const toggleSection = (key: SectionKey, enabled: boolean) => setEnabledSections((current) => {
    if (key === "issues" || key === "conclude") return current;
    const next = new Set(current);
    if (enabled) next.add(key); else next.delete(key);
    return next;
  });
  const createMeeting = () => {
    const sectionsEnabled = Object.fromEntries(SECTIONS.map((section) => [section.key, enabledSections.has(section.key)])) as Record<SectionKey, boolean>;
    const sectionDurations = Object.fromEntries(SECTIONS.map((section) => [section.key, 5])) as Record<SectionKey, number>;
    create.mutate({
      name: name.trim(),
      purpose: purpose.trim(),
      label,
      ownerId: Number(ownerId),
      administratorId: Number(administratorId),
      memberIds,
      sectionsEnabled,
      sectionOrder: SECTIONS.map((section) => section.key),
      sectionDurations,
    });
  };

  if (people.isLoading) return <main className="mx-auto max-w-3xl"><Skeleton className="h-96 w-full" /></main>;
  if (people.error) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6"><p className="font-medium">This Pulse page is not available.</p><Button asChild className="mt-4 min-h-11"><Link href="/pulse">Return to Pulse</Link></Button></CardContent></Card></main>;

  return <main className="mx-auto max-w-3xl space-y-6 pb-10"><header className="border-b border-border pb-5"><Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/pulse/settings"><ArrowLeft className="mr-2 h-4 w-4" />Pulse settings</Link></Button><p className="mt-3 text-base font-medium text-primary">Pulse · Step {step} of 2</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{step === 1 ? "Meeting essentials" : "Meeting sections"}</h1><p className="mt-2 text-base leading-6 text-muted-foreground">{step === 1 ? "Name the meeting, state its purpose, and choose the people who will start with access." : "Every standard Pulse section is listed below. Keep the defaults that fit this meeting before you create it."}</p></header>{step === 1 ? <Card><CardContent className="space-y-5 p-5 sm:p-6"><div className="space-y-2"><Label htmlFor="meeting-name">Meeting name</Label><Input id="meeting-name" className="min-h-11 text-base" value={name} onChange={(event) => setName(event.target.value)} placeholder="Leadership" autoFocus /></div><div className="space-y-2"><Label htmlFor="meeting-purpose">Purpose</Label><Input id="meeting-purpose" className="min-h-11 text-base" value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What will this group use this meeting to accomplish?" /></div><div className="space-y-2"><Label htmlFor="meeting-label">Meeting type</Label><Select value={label} onValueChange={(value) => { const next = value as LabelType; setLabel(next); if (next === "one_on_one") setMemberIds([]); }}><SelectTrigger id="meeting-label" className="min-h-11 text-base"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="level_10">Level 10</SelectItem><SelectItem value="one_on_one">One-on-one</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="meeting-owner">Facilitator</Label><Select value={ownerId} onValueChange={setOwnerId}><SelectTrigger id="meeting-owner" className="min-h-11 text-base"><SelectValue placeholder="Choose a facilitator" /></SelectTrigger><SelectContent>{(people.data ?? []).map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="meeting-administrator">Administrator</Label><Select value={administratorId} onValueChange={setAdministratorId}><SelectTrigger id="meeting-administrator" className="min-h-11 text-base"><SelectValue placeholder="Choose an administrator" /></SelectTrigger><SelectContent>{(people.data ?? []).map((person: any) => <SelectItem key={person.id} value={String(person.id)}>{person.name}</SelectItem>)}</SelectContent></Select></div></div>{label === "one_on_one" ? <p className="rounded-lg border border-border bg-muted/40 p-3 text-base leading-6">A one-on-one starts with exactly two people: the owner and administrator. Choose two different people above.</p> : <div className="space-y-2"><Label htmlFor="meeting-member-search">Members</Label><Input id="meeting-member-search" className="min-h-11 text-base" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search people to add" />{memberSearch ? <div className="rounded-lg border border-border">{matching.slice(0, 8).map((person: any) => <button key={person.id} type="button" className="flex min-h-11 w-full items-center justify-between px-3 text-left hover:bg-muted" onClick={() => { setMemberIds((current) => [...current, person.id]); setMemberSearch(""); }}><span><span className="block font-medium">{person.name}</span><span className="text-sm text-muted-foreground">{person.email}</span></span><Plus className="h-4 w-4" /></button>)}</div> : null}<div className="flex flex-wrap gap-2">{memberIds.map((id) => <button key={id} type="button" className="inline-flex min-h-11 items-center gap-1 rounded-full bg-muted px-3 text-base" onClick={() => setMemberIds((current) => current.filter((memberId) => memberId !== id))}>{personName(id)}<X className="h-4 w-4" /></button>)}</div></div>}{oneOnOneError ? <p className="text-base text-destructive" role="alert">{oneOnOneError}</p> : null}<div className="flex justify-end"><Button className="min-h-11" disabled={!essentialsReady} onClick={() => setStep(2)}>Next: meeting sections<ChevronRight className="ml-2 h-4 w-4" /></Button></div></CardContent></Card> : <Card><CardHeader><CardTitle>Standard Pulse sections</CardTitle><CardDescription>These changes are part of the creation decision. Nothing is saved until you create the meeting.</CardDescription></CardHeader><CardContent className="space-y-3">{SECTIONS.map((section) => { const required = section.key === "issues" || section.key === "conclude"; return <label key={section.key} className="flex min-h-14 items-center gap-3 rounded-lg border border-border p-3"><Checkbox checked={enabledSections.has(section.key)} disabled={required} onCheckedChange={(checked) => toggleSection(section.key, Boolean(checked))} aria-label={`Include ${section.label}`} /><span className="min-w-0"><span className="flex items-center gap-2 text-base font-medium">{section.label}{required ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Required</span> : null}</span><span className="block text-base leading-6 text-muted-foreground">{section.description}</span></span></label>; })}{enabledSections.size === 0 ? <p className="text-base text-destructive" role="alert">Include at least one section before creating the meeting.</p> : null}<div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between"><Button variant="outline" className="min-h-11" onClick={() => setStep(1)}><ChevronLeft className="mr-2 h-4 w-4" />Back</Button><Button className="min-h-11" disabled={enabledSections.size === 0 || create.isPending} onClick={createMeeting}>{create.isPending ? "Creating…" : <><Check className="mr-2 h-4 w-4" />Create meeting</>}</Button></div>{create.error ? <p className="text-base text-destructive" role="alert">{create.error.message}</p> : null}</CardContent></Card>}</main>;
}
