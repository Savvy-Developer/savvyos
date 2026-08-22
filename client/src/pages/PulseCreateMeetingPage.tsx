import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type MeetingKind = "level_10" | "one_on_one" | "other";

const KINDS: Array<{ value: MeetingKind; title: string; description: string; icon: string }> = [
  { value: "level_10", title: "Team meeting", description: "Your regular team meeting. Use this to review to-dos, issues, rocks, or scorecard numbers.", icon: "👥" },
  { value: "one_on_one", title: "One-on-one", description: "Between two people. Everything a team meeting can do, just for two.", icon: "🤝" },
  { value: "other", title: "Ad hoc meeting", description: "For a project or purpose that does not repeat. Somewhere to track the work.", icon: "📋" },
];

const SECTIONS = [
  { key: "segue", label: "Segue", gloss: "a personal or professional win to share" },
  { key: "headlines", label: "Headlines", gloss: "quick news from the team" },
  { key: "scorecard", label: "Scorecard", gloss: "your weekly numbers" },
  { key: "goals", label: "Goals", gloss: "the company goals this meeting reviews" },
  { key: "rocks", label: "Rocks", gloss: "your big goals this quarter" },
  { key: "todos", label: "To-dos", gloss: "who is doing what by when" },
  { key: "issues", label: "Issues", gloss: "what needs discussing and solving" },
  { key: "cascading", label: "Cascading", gloss: "messages sent to or from this meeting" },
  { key: "conclude", label: "Conclude", gloss: "rate the meeting and wrap up" },
] as const;

export default function PulseCreateMeetingPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const people = trpc.pulse.settings.peopleForAdministration.useQuery();
  const initialKind = new URLSearchParams(window.location.search).get("kind");
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<MeetingKind | null>(initialKind === "level_10" || initialKind === "one_on_one" || initialKind === "other" ? initialKind : null);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [sections, setSections] = useState<Record<string, boolean>>(() => Object.fromEntries(SECTIONS.map((section) => [section.key, true])));
  const currentUserId = typeof (user as any)?.id === "number" ? (user as any).id as number : null;
  const selectedPeople = useMemo(() => new Set(memberIds), [memberIds]);
  const selectedCount = selectedPeople.size;
  const oneOnOneValid = kind !== "one_on_one" || selectedCount === 2;
  const canContinue = Boolean(kind && name.trim() && selectedCount > 0 && oneOnOneValid);

  const create = trpc.pulse.settings.createMeeting.useMutation({
    onSuccess: async ({ id }) => {
      await Promise.all([utils.pulse.shell.invalidate(), utils.pulse.list.invalidate(), utils.pulse.settings.configurationMeetings.invalidate()]);
      navigate(`/pulse/meetings/${id}`);
    },
  });

  function togglePerson(personId: number, checked: boolean) {
    if (kind === "one_on_one" && checked && !selectedPeople.has(personId) && selectedCount >= 2) return;
    setMemberIds((current) => checked ? Array.from(new Set([...current, personId])) : current.filter((id) => id !== personId));
  }

  if (people.isLoading) return <main className="mx-auto max-w-3xl"><Skeleton className="h-96 w-full" /></main>;
  if (people.error) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6"><p className="text-base font-medium">This creation page is not available.</p><p className="mt-1 text-base text-muted-foreground">Return to Pulse settings and try again.</p><Button asChild className="mt-4 min-h-11"><Link href="/pulse/settings">Return to settings</Link></Button></CardContent></Card></main>;

  if (step === 1) return <main className="mx-auto max-w-3xl space-y-6 pb-10"><header className="border-b border-border pb-5"><p className="text-base font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">What kind of meeting is this?</h1><p className="mt-2 text-base leading-6 text-muted-foreground">Choose the meeting and the people who belong in it.</p></header><div className="grid gap-3 sm:grid-cols-3">{KINDS.map((option) => { const selected = kind === option.value; return <button key={option.value} type="button" onClick={() => setKind(option.value)} className={`min-h-44 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted"}`} aria-pressed={selected}><span className="text-2xl" aria-hidden="true">{option.icon}</span><span className="mt-3 block text-lg font-semibold">{option.title}</span><span className="mt-2 block text-base leading-6 text-muted-foreground">{option.description}</span></button>; })}</div><Card><CardContent className="space-y-5 p-4 sm:p-6"><div className="space-y-2"><Label htmlFor="meeting-name" className="text-base">Meeting name</Label><Input id="meeting-name" className="min-h-11 text-base" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} placeholder="Name this meeting" /></div><div className="space-y-2"><Label htmlFor="meeting-purpose" className="text-base">What is this meeting for?</Label><Textarea id="meeting-purpose" className="min-h-24 text-base" value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={2000} placeholder="Optional: describe the purpose in plain language" /></div><div className="space-y-3"><div><Label className="text-base">Who is in it?</Label><p className="mt-1 text-base text-muted-foreground">{kind === "one_on_one" ? "A one-on-one has exactly two people." : "Choose at least one person."}</p></div><div className="divide-y rounded-lg border border-border">{(people.data ?? []).map((person) => { const checked = selectedPeople.has(person.id); const disabled = Boolean(kind === "one_on_one" && !checked && selectedCount >= 2); return <label key={person.id} className={`flex min-h-14 items-center gap-3 px-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}><Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => togglePerson(person.id, Boolean(value))} aria-label={`Add ${person.name ?? person.email ?? "person"} to this meeting`} /><span className="min-w-0 flex-1 text-base"><span className="block font-medium">{person.name ?? person.email}</span>{person.id === currentUserId ? <span className="text-sm text-muted-foreground">You</span> : null}</span></label>; })}</div></div></CardContent></Card>{!oneOnOneValid && kind === "one_on_one" ? <p className="text-base text-destructive">Choose exactly two people for a one-on-one.</p> : null}<div className="flex justify-end"><Button type="button" className="min-h-11" disabled={!canContinue} onClick={() => setStep(2)}>Next <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button></div></main>;

  return <main className="mx-auto max-w-3xl space-y-6 pb-10"><header className="border-b border-border pb-5"><p className="text-base font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">What happens in this meeting?</h1><p className="mt-2 text-base leading-6 text-muted-foreground">All of these are on. Turn off anything you will not use. You can change this any time.</p></header><Card><CardHeader><CardTitle className="text-xl">Meeting sections</CardTitle><CardDescription className="text-base">Each section helps your group know what to do next.</CardDescription></CardHeader><CardContent className="divide-y rounded-lg border border-border p-0">{SECTIONS.map((section) => <label key={section.key} className="flex min-h-14 cursor-pointer items-center gap-3 px-4"><Checkbox checked={sections[section.key]} onCheckedChange={(checked) => setSections((current) => ({ ...current, [section.key]: Boolean(checked) }))} aria-label={`Use ${section.label}`} /><span className="min-w-0 flex-1"><span className="block text-base font-medium">{section.label}</span><span className="block text-base text-muted-foreground">{section.gloss}</span></span><Check className={`h-5 w-5 ${sections[section.key] ? "text-primary" : "text-transparent"}`} aria-hidden="true" /></label>)}</CardContent></Card>{create.error ? <p className="text-base text-destructive">{create.error.message}</p> : null}<div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="outline" className="min-h-11" onClick={() => setStep(1)}><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Back</Button><Button type="button" className="min-h-11" disabled={create.isPending} onClick={() => create.mutate({ name: name.trim(), purpose: purpose.trim() || null, label: kind!, memberIds, sectionsEnabled: sections, sectionOrder: SECTIONS.filter((section) => sections[section.key]).map((section) => section.key) as any[] })}>{create.isPending ? "Creating meeting…" : "Create meeting"}</Button></div></main>;
}
