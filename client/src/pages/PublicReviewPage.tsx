import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { CheckCircle2, Loader2, Star, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

function InvalidReviewPage({ submitted = false }: { submitted?: boolean }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-slate-50 to-white px-5 py-12 flex items-center justify-center">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl ring-1 ring-slate-200">
        <img src={LOGO_URL} alt="Savvy STR Agents" className="mx-auto h-8 w-auto" />
        <div className={`mx-auto mt-7 flex h-14 w-14 items-center justify-center rounded-full ${submitted ? "bg-emerald-100" : "bg-slate-100"}`}>
          {submitted ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <AlertCircle className="h-8 w-8 text-slate-500" />}
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{submitted ? "Thank you for your feedback" : "This review link is unavailable"}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {submitted
            ? "Your review has been received. We truly appreciate you taking the time to share your experience."
            : "This personalized link is invalid, has expired, or has already been used. If you need assistance, please contact your Savvy STR Agents representative."}
        </p>
      </main>
    </div>
  );
}

function StarPicker({ rating, onChange, disabled }: { rating: number; onChange: (value: number) => void; disabled?: boolean }) {
  const [hovered, setHovered] = useState(0);
  const visibleRating = hovered || rating;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, index) => {
        const value = index + 1;
        const selected = value <= visibleRating;
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            aria-pressed={rating === value}
            onMouseEnter={() => setHovered(value)}
            onFocus={() => setHovered(value)}
            onBlur={() => setHovered(0)}
            onClick={() => onChange(value)}
            className="rounded p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed"
          >
            <Star className={`h-9 w-9 transition-colors ${selected ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
          </button>
        );
      })}
    </div>
  );
}

export default function PublicReviewPage() {
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow, noarchive, nosnippet";
    document.head.appendChild(robots);
    return () => { document.head.removeChild(robots); };
  }, []);

  const search = useSearch();
  const token = useMemo(() => new URLSearchParams(search).get("token")?.trim() ?? "", [search]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const reviewQuery = trpc.reviews.getPublic.useQuery({ token }, { enabled: token.length >= 48, retry: false });
  const submitReview = trpc.reviews.submitPublic.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (error) => setFormError(error.message || "We could not submit your review. Please try again."),
  });

  if (!token || token.length < 48) return <InvalidReviewPage />;
  if (reviewQuery.isLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>;
  }
  if (submitted || reviewQuery.data?.status === "submitted") return <InvalidReviewPage submitted />;
  if (reviewQuery.data?.status !== "ready") return <InvalidReviewPage />;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) {
      setFormError("Please select a star rating before submitting your review.");
      return;
    }
    setFormError("");
    submitReview.mutate({ token, rating, comment: comment.trim() || undefined, _hp: honeypot || undefined });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-slate-50 to-white px-5 py-10 md:py-14">
      <main className="mx-auto w-full max-w-xl">
        <header className="text-center">
          <img src={LOGO_URL} alt="Savvy STR Agents" className="mx-auto h-9 w-auto" />
          <h1 className="mt-7 text-3xl font-bold tracking-tight text-slate-900">How was your experience?</h1>
          <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-slate-600">
            Your feedback helps us celebrate exceptional service and continually improve the Savvy STR Agents experience.
          </p>
        </header>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200 md:p-8">
          <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm text-slate-700">
            <p><span className="font-semibold">Your agent:</span> {reviewQuery.data.agentName}</p>
            {reviewQuery.data.propertyAddress && <p className="mt-1"><span className="font-semibold">Property:</span> {reviewQuery.data.propertyAddress}</p>}
            {reviewQuery.data.isTest && <p className="mt-2 text-xs font-medium text-cyan-700">This is a SavvyOS test review link.</p>}
          </div>

          <form className="mt-7 space-y-6" onSubmit={handleSubmit} noValidate>
            <div className="space-y-3">
              <Label className="text-base font-semibold text-slate-800">Overall rating <span className="text-rose-600">*</span></Label>
              <StarPicker rating={rating} onChange={(value) => { setRating(value); setFormError(""); }} disabled={submitReview.isPending} />
              <p className="text-sm text-slate-500">{rating ? `${rating} of 5 stars selected` : "Select a rating from 1 to 5 stars."}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-comment" className="text-base font-semibold text-slate-800">Tell us more <span className="font-normal text-slate-500">(optional)</span></Label>
              <Textarea
                id="review-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="What stood out about your experience?"
                maxLength={5000}
                rows={6}
                disabled={submitReview.isPending}
                className="resize-y"
              />
              <p className="text-right text-xs text-slate-400">{comment.length}/5,000</p>
            </div>

            <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="review-company">Company</label>
              <input id="review-company" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} autoComplete="off" />
            </div>

            {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
            <Button type="submit" size="lg" className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={submitReview.isPending}>
              {submitReview.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting your review…</> : "Submit review"}
            </Button>
            <p className="text-center text-xs leading-5 text-slate-500">Your review is submitted privately to Savvy STR Agents. This link accepts one response.</p>
          </form>
        </section>
      </main>
    </div>
  );
}
