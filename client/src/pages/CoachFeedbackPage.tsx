import { BarChart3, Loader2, LockKeyhole, MessageSquareText, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function RatingValue({ value }: { value: number | null | undefined }) {
  return <span className="font-semibold text-slate-900">{value === null || value === undefined ? "—" : `${value.toFixed(1)} / 5`}</span>;
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value === null || value === undefined ? "—" : value.toFixed(1)}</div>
      <div className="mt-1 text-[11px] font-medium leading-4 text-slate-500">{label}</div>
    </div>
  );
}

function AnonymousComment({ label, value }: { label: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="rounded-lg border-l-4 border-cyan-400 bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

export default function CoachFeedbackPage() {
  const feedbackQuery = trpc.coachFeedback.getDashboard.useQuery(undefined, { retry: false });

  if (feedbackQuery.isLoading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-600" /></div>;
  }

  if (feedbackQuery.isError || !feedbackQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card><CardContent className="py-10 text-center text-sm text-slate-600">Coach feedback is unavailable for this account.</CardContent></Card>
      </div>
    );
  }

  const report = feedbackQuery.data;
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 md:px-7">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-700"><LockKeyhole className="h-4 w-4" />Leadership-only aggregate view</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Coach feedback</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Anonymous coaching feedback for <strong>{report.periodLabel}</strong>. The page never displays agent names, email addresses, session details, response timing, or records that can connect feedback to a respondent.</p>
        </div>
      </header>

      <Card className="border-cyan-200 bg-cyan-50/70">
        <CardContent className="flex gap-3 pt-6 text-sm leading-6 text-slate-700">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
          <p><strong className="text-slate-900">Fully anonymous by design.</strong> Invitation identity is separated from survey answers, and answers retain no invitation, agent, session, email, IP, or response-time field. Coaches receive their own weekly aggregate by email; this leadership view is the only immediate access.</p>
        </CardContent>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardDescription>Responses</CardDescription><CardTitle className="text-3xl">{report.overall.responseCount}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">This week</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Overall value</CardDescription><CardTitle className="flex items-center gap-1 text-3xl"><Star className="h-5 w-5 fill-amber-400 text-amber-400" />{report.overall.overallAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Business priorities</CardDescription><CardTitle className="text-3xl">{report.overall.prioritiesAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Next-step clarity</CardDescription><CardTitle className="text-3xl">{report.overall.clarityAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Felt supported</CardDescription><CardTitle className="text-3xl">{report.overall.supportAverage ?? "—"}</CardTitle></CardHeader><CardContent className="text-xs text-slate-500">Out of 5</CardContent></Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-cyan-700" /><h2 className="text-xl font-bold text-slate-900">Weekly aggregate by coach</h2></div>
        {report.aggregates.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-slate-600">No coaching feedback has been submitted for this week yet.</CardContent></Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {report.aggregates.map((aggregate) => (
              <Card key={aggregate.coachId} className="overflow-hidden">
                <CardHeader className="border-b border-slate-100 bg-slate-50/80">
                  <div className="flex items-start justify-between gap-3">
                    <div><CardTitle className="text-lg">{aggregate.coachName}</CardTitle><CardDescription className="mt-1">{aggregate.responseCount} anonymous response{aggregate.responseCount === 1 ? "" : "s"} this week</CardDescription></div>
                    <div className="rounded-lg bg-cyan-50 px-3 py-2 text-center"><div className="text-lg font-bold text-slate-900"><RatingValue value={aggregate.overallAverage} /></div><div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Overall value</div></div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pt-5">
                  <div className="grid grid-cols-3 gap-3"><Metric label="Priorities" value={aggregate.prioritiesAverage} /><Metric label="Clarity" value={aggregate.clarityAverage} /><Metric label="Support" value={aggregate.supportAverage} /></div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-cyan-700" /><h3 className="text-sm font-semibold text-slate-800">Anonymous written feedback</h3></div>
                    {aggregate.comments.length ? aggregate.comments.map((comment, index) => (
                      <div key={index} className="space-y-2">
                        <AnonymousComment label="Most helpful" value={comment.helpful} />
                        <AnonymousComment label="Would make coaching more valuable" value={comment.improvement} />
                        <AnonymousComment label="Additional context" value={comment.additional} />
                      </div>
                    )) : <p className="text-sm text-slate-500">No written feedback was submitted for this coach this week.</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="pb-6 text-center text-xs leading-5 text-slate-500">Treat this as an aggregate learning signal. Do not attempt to identify a respondent from scores or comments.</p>
    </div>
  );
}
