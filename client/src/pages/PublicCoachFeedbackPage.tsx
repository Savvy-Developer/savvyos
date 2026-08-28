import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

function UnavailableSurvey({ submitted = false, isTest = false }: { submitted?: boolean; isTest?: boolean }) {
  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-contain bg-gradient-to-br from-cyan-50 via-slate-50 to-white px-5 py-12 flex items-center justify-center">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-200">
        <img src={LOGO_URL} alt="Savvy STR Agents" className="mx-auto h-8 w-auto" />
        <div className={`mx-auto mt-7 flex h-14 w-14 items-center justify-center rounded-full ${submitted ? "bg-emerald-100" : "bg-slate-100"}`}>
          {submitted ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <AlertCircle className="h-8 w-8 text-slate-500" />}
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{submitted ? "Thank you for your feedback" : "This survey link is unavailable"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {submitted
            ? isTest
              ? "Your test response was saved separately from live feedback and will not appear in any coaching report."
              : "Your anonymous feedback has been received. Your name and email were not stored with your responses."
            : "This private survey link is invalid, has expired, or has already been used."}
        </p>
      </main>
    </div>
  );
}

function RatingPicker({ value, onChange, disabled, label }: { value: number; onChange: (rating: number) => void; disabled?: boolean; label: string }) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;
  return (
    <div className="flex flex-wrap items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, index) => {
        const rating = index + 1;
        const selected = rating <= active;
        return (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            aria-label={`${label}: ${rating} out of 5`}
            aria-pressed={value === rating}
            onMouseEnter={() => setHovered(rating)}
            onFocus={() => setHovered(rating)}
            onBlur={() => setHovered(0)}
            onClick={() => onChange(rating)}
            className="rounded p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed"
          >
            <Star className={`h-8 w-8 transition-colors ${selected ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
          </button>
        );
      })}
      <span className="ml-2 text-sm text-slate-500">{value ? `${value} of 5` : "Select a rating"}</span>
    </div>
  );
}

export default function PublicCoachFeedbackPage() {
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow, noarchive, nosnippet";
    document.head.appendChild(robots);
    return () => { document.head.removeChild(robots); };
  }, []);

  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);
  const [overallRating, setOverallRating] = useState(0);
  const [prioritiesRating, setPrioritiesRating] = useState(0);
  const [clarityRating, setClarityRating] = useState(0);
  const [supportRating, setSupportRating] = useState(0);
  const [helpfulComment, setHelpfulComment] = useState("");
  const [improvementComment, setImprovementComment] = useState("");
  const [additionalComment, setAdditionalComment] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const surveyQuery = trpc.coachFeedback.getPublic.useQuery({ token }, { enabled: token.length >= 48, retry: false });
  const submitSurvey = trpc.coachFeedback.submitPublic.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (error) => setFormError(error.message || "We could not submit your feedback. Please try again."),
  });

  if (!token || token.length < 48) return <UnavailableSurvey />;
  if (surveyQuery.isLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>;
  }
  const isTest = Boolean(surveyQuery.data?.isTest);
  if (submitted || surveyQuery.data?.status === "submitted") return <UnavailableSurvey submitted isTest={isTest} />;
  if (surveyQuery.data?.status !== "ready") return <UnavailableSurvey />;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!overallRating || !prioritiesRating || !clarityRating || !supportRating) {
      setFormError("Please answer all four rating questions before submitting your feedback.");
      return;
    }
    setFormError("");
    submitSurvey.mutate({
      token,
      overallRating,
      prioritiesRating,
      clarityRating,
      supportRating,
      helpfulComment: helpfulComment.trim() || undefined,
      improvementComment: improvementComment.trim() || undefined,
      additionalComment: additionalComment.trim() || undefined,
      _hp: honeypot || undefined,
    });
  };

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-contain bg-gradient-to-br from-cyan-50 via-slate-50 to-white px-5 py-10 pb-safe md:py-14">
      <main className="mx-auto w-full max-w-xl">
        <header className="text-center">
          <img src={LOGO_URL} alt="Savvy STR Agents" className="mx-auto h-9 w-auto" />
          <h1 className="mt-7 text-3xl font-bold tracking-tight text-slate-900">How was your coaching experience?</h1>
          <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-slate-600">Your feedback helps Savvy STR Agents continually strengthen the coaching experience for every agent.</p>
        </header>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 md:p-8">
          {isTest && <div className="mb-6 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950"><strong>Test survey.</strong> This preview lets Tyler review the experience. Its response is excluded from live reports.</div>}
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" />
              <div>
                <p className="font-semibold text-slate-900">This survey is fully anonymous.</p>
                <p className="mt-1">Your name and email are never stored with your answers. Leadership, your coach, and anyone viewing feedback cannot see who submitted this survey or connect answers to a specific session. Coaches receive only a weekly aggregate, not immediate individual feedback.</p>
              </div>
            </div>
          </div>

          <form className="mt-7 space-y-6" onSubmit={handleSubmit} noValidate>
            <div className="space-y-3">
              <Label className="text-base font-semibold text-slate-800">How valuable was this coaching session for you? <span className="text-rose-600">*</span></Label>
              <RatingPicker label="Session value" value={overallRating} onChange={(rating) => { setOverallRating(rating); setFormError(""); }} disabled={submitSurvey.isPending} />
            </div>
            <div className="space-y-3">
              <Label className="text-base font-semibold text-slate-800">How well did your coach understand your current business priorities? <span className="text-rose-600">*</span></Label>
              <RatingPicker label="Business priorities" value={prioritiesRating} onChange={(rating) => { setPrioritiesRating(rating); setFormError(""); }} disabled={submitSurvey.isPending} />
            </div>
            <div className="space-y-3">
              <Label className="text-base font-semibold text-slate-800">How clear were the next steps after the session? <span className="text-rose-600">*</span></Label>
              <RatingPicker label="Next-step clarity" value={clarityRating} onChange={(rating) => { setClarityRating(rating); setFormError(""); }} disabled={submitSurvey.isPending} />
            </div>
            <div className="space-y-3">
              <Label className="text-base font-semibold text-slate-800">How supported did you feel in the session? <span className="text-rose-600">*</span></Label>
              <RatingPicker label="Feeling supported" value={supportRating} onChange={(rating) => { setSupportRating(rating); setFormError(""); }} disabled={submitSurvey.isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="helpful-comment" className="text-base font-semibold text-slate-800">What was most helpful? <span className="font-normal text-slate-500">(optional)</span></Label>
              <Textarea id="helpful-comment" value={helpfulComment} onChange={(event) => setHelpfulComment(event.target.value)} placeholder="Please avoid names or details that could identify you." maxLength={3000} rows={4} disabled={submitSurvey.isPending} className="resize-y" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="improvement-comment" className="text-base font-semibold text-slate-800">What would make coaching more valuable for you? <span className="font-normal text-slate-500">(optional)</span></Label>
              <Textarea id="improvement-comment" value={improvementComment} onChange={(event) => setImprovementComment(event.target.value)} placeholder="Please avoid names or details that could identify you." maxLength={3000} rows={4} disabled={submitSurvey.isPending} className="resize-y" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="additional-comment" className="text-base font-semibold text-slate-800">Anything else you would like us to know? <span className="font-normal text-slate-500">(optional)</span></Label>
              <Textarea id="additional-comment" value={additionalComment} onChange={(event) => setAdditionalComment(event.target.value)} placeholder="Please avoid names or details that could identify you." maxLength={3000} rows={4} disabled={submitSurvey.isPending} className="resize-y" />
            </div>
            <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="coach-feedback-company">Company</label>
              <input id="coach-feedback-company" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} autoComplete="off" />
            </div>
            {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
            <Button type="submit" size="lg" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={submitSurvey.isPending}>
              {submitSurvey.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting anonymous feedback…</> : "Submit anonymous feedback"}
            </Button>
            <p className="text-center text-xs leading-5 text-slate-500">This private link accepts one response. Please do not include your name or identifying details in written responses.</p>
          </form>
        </section>
      </main>
    </div>
  );
}
