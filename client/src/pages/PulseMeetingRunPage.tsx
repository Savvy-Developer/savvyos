import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { PulseCascadeCard } from "@/components/pulse/PulseCascadeCard";
import { PulseScorecard } from "@/components/pulse/PulseScorecard";

const labels: Record<string, string> = { segue: "Segue", headlines: "Headlines", scorecard: "Scorecard", goals: "Goals", rocks: "Rocks", todos: "To-dos", issues: "Issues", cascading: "Cascading", conclude: "Conclude" };
function time(seconds: number) { const minutes = Math.floor(Math.abs(seconds) / 60); const remainder = Math.abs(seconds) % 60; return `${seconds < 0 ? "+" : ""}${minutes}:${String(remainder).padStart(2, "0")}`; }

export default function PulseMeetingRunPage({ meetingId }: { meetingId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.pulse.meetingViews.run.useQuery({ meetingId });
  const [index, setIndex] = useState(0); const [elapsed, setElapsed] = useState(0); const [rating, setRating] = useState<number | null>(null);
  const conclude = trpc.pulse.meetingViews.conclude.useMutation();
  const acknowledge = trpc.pulse.cascades.acknowledge.useMutation({ onSuccess: () => utils.pulse.meetingViews.run.invalidate({ meetingId }) });
  const sections = data?.sections ?? []; const section = sections[index];
  const duration = section && data?.run?.sectionDurations?.[section.section] ? Number(data.run.sectionDurations[section.section]) * 60 : 300;
  const remaining = duration - elapsed; const total = sections.reduce((sum: number, item: any) => sum + Number(data?.run?.sectionDurations?.[item.section] ?? 5) * 60, 0); const completed = sections.slice(0, index).reduce((sum: number, item: any) => sum + Number(data?.run?.sectionDurations?.[item.section] ?? 5) * 60, 0) + elapsed;
  useEffect(() => { const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => setElapsed(0), [index]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.key === " " || event.key === "ArrowRight") && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setIndex((value) => Math.min(sections.length - 1, value + 1)); } if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, [sections.length]);
  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;
  if (error || !data || !section) return <Card><CardContent className="p-6">This meeting is not available to run. <Link className="underline" href={`/pulse/meetings/${meetingId}`}>Return to dashboard</Link>.</CardContent></Card>;
  const items = section.items ?? [];
  const invalidate = () => utils.pulse.meetingViews.run.invalidate({ meetingId });
  return <main className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl flex-col"><header className="flex items-center justify-between gap-3 py-3"><Button asChild variant="ghost" className="min-h-11"><Link href={`/pulse/meetings/${meetingId}`}><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link></Button><p className="text-sm text-muted-foreground"><Timer className="mr-1 inline h-4 w-4" />Total {time(total - completed)} of {time(total)}</p></header><Progress value={Math.min(100, (index / Math.max(1, sections.length)) * 100)} className="h-1" /><section className="flex flex-1 flex-col justify-center py-8"><p className="text-sm font-medium text-primary">{index + 1} of {sections.length}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{labels[section.section]}</h1><p className={`mt-3 text-lg font-medium ${remaining < 0 ? "text-amber-700" : "text-muted-foreground"}`}>{remaining < 0 ? "Time over " : "Time left "}{time(remaining)}</p><Card className="mt-6"><CardContent className="space-y-3 p-5">{section.section === "scorecard" ? <PulseScorecard section={section} meetingId={meetingId} canConfigure onChanged={invalidate} /> : items.length ? (section.section === "cascading" ? items.map((item: any) => <PulseCascadeCard key={item.id} message={item} isAcknowledging={acknowledge.isPending} onAcknowledge={(messageId) => acknowledge.mutate({ messageId, from: "meeting_run" })} />) : items.map((item: any) => <div key={item.id} className="rounded-lg border border-border p-3"><p className="font-medium">{item.title ?? item.body}</p><p className="mt-1 text-sm text-muted-foreground">{item.meetingName ?? "This meeting"}</p></div>)) : <p className="text-sm text-muted-foreground">{section.meta?.prompt ?? "Nothing is needed here yet."}</p>}{section.section === "conclude" && <div className="mt-6 border-t pt-5"><p className="font-medium">How was this meeting?</p><div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">{Array.from({ length: 10 }, (_, i) => i + 1).map((number) => <button key={number} type="button" aria-label={`Rate meeting ${number} out of 10`} aria-pressed={rating === number} onClick={() => setRating(number)} className={`min-h-11 rounded-md border text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${rating === number ? "bg-primary text-primary-foreground" : "bg-background"}`}>{number}</button>)}</div>{rating && <Button className="mt-4 min-h-11" onClick={() => conclude.mutate({ meetingId, rating, durationActualMinutes: Math.round(completed / 60), attendeeIds: [data.viewerId] })}>Close meeting</Button>}</div>}</CardContent></Card></section><footer className="flex items-center justify-between gap-3 border-t py-4"><Button type="button" variant="outline" className="min-h-11" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button><Button type="button" className="min-h-11" disabled={index === sections.length - 1} onClick={() => setIndex((value) => value + 1)}>Advance <ArrowRight className="ml-2 h-4 w-4" /></Button></footer></main>;
}
