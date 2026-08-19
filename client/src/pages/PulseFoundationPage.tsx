import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, ListTodo, Search, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
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
const labelText: Record<Meeting["label"], string> = {
  level_10: "Level 10",
  one_on_one: "One-on-Ones",
  other: "Other",
};

function friendlyCadence(cadence: string) {
  return cadence === "ad_hoc" ? "As needed" : cadence.charAt(0).toUpperCase() + cadence.slice(1);
}

function friendlyDay(day: string | null) {
  return day ? day.charAt(0).toUpperCase() + day.slice(1) : null;
}

function formatMeetingTime(meeting: Meeting) {
  const day = friendlyDay(meeting.dayOfWeek);
  if (day && meeting.startTime) return `${day}s ${meeting.startTime}`;
  if (day) return day;
  return friendlyCadence(meeting.cadence);
}

function Term({ term, glossary }: { term: string; glossary: GlossaryEntry[] }) {
  const entry = glossary.find((item) => item.term === term);
  if (!entry) return <>{term}</>;
  return (
    <span className="underline decoration-dotted underline-offset-4" title={entry.plainGloss}>
      {term}
      <span className="sr-only">: {entry.plainGloss}</span>
    </span>
  );
}

function PageHeading({ question, detail }: { question: string; detail: string }) {
  return (
    <header className="max-w-3xl border-b border-border pb-5">
      <p className="text-sm font-medium text-primary">Pulse</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{question}</h1>
      <p className="mt-2 text-base leading-6 text-muted-foreground">{detail}</p>
    </header>
  );
}

function EmptyInstruction({ children, actionHref, actionLabel }: { children: React.ReactNode; actionHref: string; actionLabel: string }) {
  return (
    <Card className="max-w-3xl">
      <CardContent className="p-6 sm:p-8">
        <p className="max-w-2xl text-base leading-6 text-muted-foreground">{children}</p>
        <Button asChild className="mt-5 min-h-11">
          <Link href={actionHref}>{actionLabel}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MeetingsList({ meetings, glossary, query }: { meetings: Meeting[]; glossary: GlossaryEntry[]; query: string }) {
  const normalized = query.trim().toLocaleLowerCase();
  const filteredMeetings = normalized ? meetings.filter((meeting) => meeting.name.toLocaleLowerCase().includes(normalized)) : meetings;

  if (!filteredMeetings.length) {
    return <EmptyInstruction actionHref="/pulse" actionLabel="Go to Pulse home">No meetings match that search. Try a meeting name, or return home to see what needs you right now.</EmptyInstruction>;
  }

  return (
    <div className="max-w-3xl space-y-7">
      {labelOrder.map((label) => {
        const grouped = filteredMeetings.filter((meeting) => meeting.label === label);
        if (!grouped.length) return null;
        return (
          <section key={label} aria-labelledby={`pulse-meeting-group-${label}`}>
            <h2 id={`pulse-meeting-group-${label}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {label === "level_10" ? <Term term="Level 10" glossary={glossary} /> : labelText[label]}
            </h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {grouped.map((meeting, index) => (
                <Link key={meeting.id} href={`/pulse/meetings/${meeting.id}`} className={`group flex min-h-14 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${index > 0 ? "border-t border-border" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-foreground">{meeting.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{formatMeetingTime(meeting)} · {friendlyCadence(meeting.cadence)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  <span className="sr-only">Open {meeting.name}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MeetingDetail({ meetingId, glossary }: { meetingId: string; glossary: GlossaryEntry[] }) {
  const { data: meeting, isLoading, error } = trpc.pulse.get.useQuery({ meetingId });
  const { data: sectionData } = trpc.pulse.sectionWorkItems.useQuery({ meetingId }, { enabled: !!meeting });

  if (isLoading) {
    return <div className="max-w-3xl space-y-4"><Skeleton className="h-8 w-72" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  }
  if (error || !meeting) {
    return <EmptyInstruction actionHref="/pulse/meetings" actionLabel="Go to your meetings">This meeting no longer exists. Go to your meetings to choose one you can access.</EmptyInstruction>;
  }

  const enabledSections = meeting.sectionOrder.filter((section: string) => meeting.sectionsEnabled?.[section]);
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/pulse/meetings" className="inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Your meetings
        </Link>
        <PageHeading question={`What is happening in ${meeting.name}?`} detail="This meeting is visible because you are a member. Work from other meetings is not shown here." />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">This meeting is ready</CardTitle>
          <CardDescription className="text-base">The foundation is in place. Meeting sections will appear here as the next Pulse workflows are added.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Enabled sections: {enabledSections.length ? enabledSections.join(", ") : "None yet"}.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Work in this meeting</CardTitle>
          <CardDescription className="text-base">To-dos, issues, and rocks from this meeting will appear here. Every item will show this meeting as its origin.</CardDescription>
        </CardHeader>
        <CardContent>
          {sectionData?.items?.length ? (
            <div className="space-y-2">
              {sectionData.items.map((item: any) => <div key={item.id} className="rounded-lg border border-border p-3 text-sm text-foreground">{item.title}</div>)}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing is in this meeting yet. Start with your next meeting, where items can be added and assigned.</p>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground"><Term term="Rocks" glossary={glossary} /> and <Term term="Segue" glossary={glossary} /> are explained the first time they appear, so Pulse stays clear for everyone.</p>
    </div>
  );
}

export default function PulseFoundationPage() {
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const { data: shell, isLoading } = trpc.pulse.shell.useQuery();
  const { data: glossary = [] } = trpc.pulse.glossary.useQuery();
  const meetings = (shell?.meetings ?? []) as Meeting[];
  const meetingId = useMemo(() => {
    const matched = location.match(/^\/pulse\/meetings\/([0-9a-fA-F-]{36})$/);
    return matched?.[1] ?? null;
  }, [location]);

  if (isLoading) {
    return <div className="mx-auto max-w-3xl space-y-5"><Skeleton className="h-8 w-64" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  }

  if (meetingId) return <MeetingDetail meetingId={meetingId} glossary={glossary as GlossaryEntry[]} />;

  if (location === "/pulse/meetings") {
    return (
      <div className="space-y-6">
        <PageHeading question="What is happening in your meetings?" detail="You only see meetings you have been added to. Choose one to see its work." />
        <div className="relative max-w-3xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search your meetings" className="min-h-11 pl-10 text-base" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your meetings" />
        </div>
        {meetings.length ? <MeetingsList meetings={meetings} glossary={glossary as GlossaryEntry[]} query={search} /> : <EmptyInstruction actionHref="/pulse" actionLabel="Go to Pulse home">You have not been added to a meeting yet. Ask a meeting owner to add you, then your meetings will show here.</EmptyInstruction>}
      </div>
    );
  }

  if (location === "/pulse/work") {
    return <div className="space-y-6"><PageHeading question="What is mine, across everything?" detail="This dashboard will bring together your work across every meeting you are in." /><EmptyInstruction actionHref="/pulse/meetings" actionLabel="View your meetings">Your work dashboard is ready for the next Pulse workflow. Until then, open a meeting to see the meeting context you can access.</EmptyInstruction></div>;
  }

  if (location === "/pulse/inputs") {
    return <div className="space-y-6"><PageHeading question="What do I need to put in this week?" detail="Put this week’s numbers, goals, and meeting updates here." /><EmptyInstruction actionHref="/pulse/meetings" actionLabel="View your meetings">There is nothing to enter yet. When inputs are ready, you will be able to update them here from your phone.</EmptyInstruction></div>;
  }

  if (location === "/pulse/settings") {
    if (!shell?.canSeeSettings) return <EmptyInstruction actionHref="/pulse" actionLabel="Go to Pulse home">Only meeting owners and administrators can change settings. Go home to see what needs you now.</EmptyInstruction>;
    return <div className="space-y-6"><PageHeading question="What do I need to set up?" detail="Meeting setup will be added here for people who own or administer a meeting." /><EmptyInstruction actionHref="/pulse/meetings" actionLabel="View your meetings">No settings need your attention right now. Open a meeting to review the information available to you.</EmptyInstruction></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeading question="What needs me right now?" detail="Pulse keeps your meetings and meeting work in one clear place. Start with a meeting you belong to." />
      {meetings.length ? (
        <Card className="max-w-3xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" /> Your meetings</CardTitle>
            <CardDescription className="text-base">Open a meeting to see what is happening there.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {meetings.slice(0, 3).map((meeting) => (
              <Link key={meeting.id} href={`/pulse/meetings/${meeting.id}`} className="flex min-h-14 items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Users className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-base font-medium">{meeting.name}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
            <Button variant="outline" asChild className="mt-2 min-h-11 w-full sm:w-auto"><Link href="/pulse/meetings"><ClipboardList className="mr-2 h-4 w-4" aria-hidden="true" />View all meetings</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <EmptyInstruction actionHref="/pulse/meetings" actionLabel="See your meetings">You have not been added to a meeting yet. Ask a meeting owner to add you. Once they do, your meeting will appear here.</EmptyInstruction>
      )}
      <p className="max-w-3xl text-sm text-muted-foreground"><CheckCircle2 className="mr-1 inline h-4 w-4 text-primary" aria-hidden="true" /> Pulse saves meeting membership as the access rule, so you only see the meetings you are in.</p>
    </div>
  );
}
