import { ArrowRight, CalendarDays, ChevronRight, ClipboardList, Search, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import PulseMeetingDashboardPage from "@/pages/PulseMeetingDashboardPage";
import PulseMyInputsPage from "@/pages/PulseMyInputsPage";
import PulseMyWorkPage from "@/pages/PulseMyWorkPage";
import { useMemo, useState } from "react";

type Meeting = {
  id: string;
  name: string;
  label: "level_10" | "one_on_one" | "other";
  dayOfWeek: string | null;
  startTime: string | null;
  cadence: string;
  timezone: string;
  durationMinutes: number;
  sectionsEnabled: Record<string, boolean>;
  sectionOrder: string[];
  meetingRole: "owner" | "administrator" | "member";
};
type GlossaryEntry = { term: string; plainGloss: string };

const labelOrder: Meeting["label"][] = ["level_10", "one_on_one", "other"];
const labelText: Record<Meeting["label"], string> = { level_10: "Team meetings", one_on_one: "One-on-ones", other: "Ad hoc" };

function friendlyCadence(cadence: string) { return cadence === "ad_hoc" ? "As needed" : cadence.charAt(0).toUpperCase() + cadence.slice(1); }
function friendlyDay(day: string | null) { return day ? day.charAt(0).toUpperCase() + day.slice(1) : null; }
function formatMeetingTime(meeting: Meeting) { const day = friendlyDay(meeting.dayOfWeek); return day && meeting.startTime ? `${day}s ${meeting.startTime}` : day ?? friendlyCadence(meeting.cadence); }

function Term({ term, glossary }: { term: string; glossary: GlossaryEntry[] }) {
  const entry = glossary.find((item) => item.term === term);
  return entry ? <span className="underline decoration-dotted underline-offset-4" title={entry.plainGloss}>{term}<span className="sr-only">: {entry.plainGloss}</span></span> : <>{term}</>;
}

function PageHeading({ question, detail }: { question: string; detail: string }) {
  return <header className="max-w-3xl border-b border-border pb-5"><p className="text-base font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{question}</h1><p className="mt-2 text-base leading-6 text-muted-foreground">{detail}</p></header>;
}

function EmptyInstruction({ children, actionHref, actionLabel }: { children: React.ReactNode; actionHref: string; actionLabel: string }) {
  return <Card className="max-w-3xl"><CardContent className="p-6 sm:p-8"><p className="max-w-2xl text-base leading-6 text-muted-foreground">{children}</p><Button asChild className="mt-5 min-h-11"><Link href={actionHref}>{actionLabel}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button></CardContent></Card>;
}

function MeetingStarter() {
  const options = [
    { kind: "level_10", title: "New team meeting", description: "A regular meeting for your team’s work.", icon: "👥" },
    { kind: "one_on_one", title: "New 1:1", description: "A meeting for two people.", icon: "🤝" },
    { kind: "other", title: "New ad hoc meeting", description: "A meeting for a project or purpose.", icon: "📋" },
  ];
  return <Card className="max-w-3xl"><CardContent className="p-6 sm:p-8"><h2 className="text-xl font-semibold">You do not have any meetings yet.</h2><p className="mt-2 max-w-2xl text-base leading-6 text-muted-foreground">Meetings are where your to-dos, issues, rocks, and scorecard live. Make your first one.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{options.map((option) => <Button key={option.kind} asChild variant="outline" className="min-h-28 h-auto items-start justify-start px-4 py-4 text-left"><Link href={`/pulse/settings/create?kind=${option.kind}`}><span className="text-xl" aria-hidden="true">{option.icon}</span><span className="ml-2"><span className="block text-base font-semibold">{option.title}</span><span className="mt-1 block whitespace-normal text-sm font-normal text-muted-foreground">{option.description}</span></span></Link></Button>)}</div></CardContent></Card>;
}

function MeetingsList({ meetings, glossary, query }: { meetings: Meeting[]; glossary: GlossaryEntry[]; query: string }) {
  const normalized = query.trim().toLocaleLowerCase();
  const filteredMeetings = normalized ? meetings.filter((meeting) => meeting.name.toLocaleLowerCase().includes(normalized)) : meetings;
  if (!filteredMeetings.length) return <EmptyInstruction actionHref="/pulse/meetings" actionLabel="Clear meeting search">No meeting matches that search. Clear the search or go home to see what needs you now.</EmptyInstruction>;
  return <div className="max-w-3xl space-y-7">{labelOrder.map((label) => { const grouped = filteredMeetings.filter((meeting) => meeting.label === label); if (!grouped.length) return null; return <section key={label} aria-labelledby={`pulse-meeting-group-${label}`}><h2 id={`pulse-meeting-group-${label}`} className="mb-2 text-base font-semibold text-muted-foreground">{label === "level_10" ? <Term term="Level 10" glossary={glossary} /> : labelText[label]}</h2><div className="overflow-hidden rounded-xl border border-border bg-card">{grouped.map((meeting, index) => <Link key={meeting.id} href={`/pulse/meetings/${meeting.id}`} className={`group flex min-h-14 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${index > 0 ? "border-t border-border" : ""}`}><div className="min-w-0 flex-1"><p className="truncate text-base font-medium text-foreground">{meeting.name}</p><p className="mt-0.5 text-base text-muted-foreground">{formatMeetingTime(meeting)} · {friendlyCadence(meeting.cadence)}</p></div><ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Open {meeting.name}</span></Link>)}</div></section>; })}</div>;
}

export default function PulseFoundationPage() {
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const { data: shell, isLoading } = trpc.pulse.shell.useQuery();
  const { data: glossary = [] } = trpc.pulse.glossary.useQuery();
  const meetings = (shell?.meetings ?? []) as Meeting[];
  const canCreateMeetings = Boolean(shell?.capabilities?.canManageSettings);
  const meetingId = useMemo(() => location.match(/^\/pulse\/meetings\/([0-9a-fA-F-]{36})$/)?.[1] ?? null, [location]);

  if (isLoading) return <div className="mx-auto max-w-3xl space-y-5"><Skeleton className="h-8 w-64" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  if (meetingId) return <PulseMeetingDashboardPage meetingId={meetingId} />;
  if (location === "/pulse/work") return <PulseMyWorkPage />;
  if (location === "/pulse/inputs") return <PulseMyInputsPage />;

  return <div className="space-y-6"><PageHeading question="What is happening in your meetings?" detail="You only see meetings you have been added to. Choose one to see its work." />{meetings.length ? <><div className="relative max-w-3xl"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search your meetings" className="min-h-11 pl-10 text-base" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your meetings" /></div><MeetingsList meetings={meetings} glossary={glossary as GlossaryEntry[]} query={search} /></> : canCreateMeetings ? <MeetingStarter /> : <EmptyInstruction actionHref="/pulse" actionLabel="Go to Pulse home">You have not been added to a meeting yet. Your to-dos, rocks, and numbers will show up here once someone adds you.</EmptyInstruction>}</div>;
}
