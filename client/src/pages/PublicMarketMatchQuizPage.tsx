import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, HeartHandshake, Loader2, LockKeyhole, Mail, MapPinned, Phone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const QUIZ_ACCESS_STORAGE_KEY = "savvy-market-match-access";
type QuizQuestion = {
  id: string;
  section: string;
  label: string;
  helper?: string;
  type: "single" | "multi" | "currency_range" | "text";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
};

type ContactForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailReminderConsent: boolean;
  marketingEmailConsent: boolean;
  marketingSmsConsent: boolean;
};

const emptyContact: ContactForm = { firstName: "", lastName: "", email: "", phone: "", emailReminderConsent: false, marketingEmailConsent: false, marketingSmsConsent: false };

function browserTouch(): Record<string, string | null> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    landingUrl: window.location.href,
    referrerUrl: document.referrer || null,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_term: params.get("utm_term"),
    utm_content: params.get("utm_content"),
    gclid: params.get("gclid"),
    fbclid: params.get("fbclid"),
  };
}

function deviceCategory() {
  if (typeof window === "undefined") return "unknown";
  return window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop";
}

function initialToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(QUIZ_ACCESS_STORAGE_KEY) || "";
}

function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()); }

function QuestionInput({ question, value, onChange }: { question: QuizQuestion; value: unknown; onChange: (value: unknown) => void }) {
  if (question.type === "text") return <Textarea value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} placeholder={question.id === "locationPreference" ? "For example, the Smokies, Florida Gulf Coast, or a specific city" : "Share anything important to your decision"} className="min-h-28" />;
  if (question.type === "currency_range") {
    const range = value && typeof value === "object" ? value as { min?: string; max?: string } : {};
    return <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="minBudget" className="text-xs text-slate-600">Minimum</Label><Input id="minBudget" inputMode="numeric" placeholder="$300,000" value={range.min || ""} onChange={event => onChange({ ...range, min: event.target.value.replace(/[^0-9]/g, "") })} /></div><div><Label htmlFor="maxBudget" className="text-xs text-slate-600">Maximum</Label><Input id="maxBudget" inputMode="numeric" placeholder="$600,000" value={range.max || ""} onChange={event => onChange({ ...range, max: event.target.value.replace(/[^0-9]/g, "") })} /></div></div>;
  }
  const selected = question.type === "multi" ? (Array.isArray(value) ? value as string[] : []) : [typeof value === "string" ? value : ""];
  return <div className="grid gap-2 sm:grid-cols-2">{question.options?.map(option => {
    const active = selected.includes(option.value);
    return <button key={option.value} type="button" onClick={() => onChange(question.type === "multi" ? active ? selected.filter(item => item !== option.value) : [...selected, option.value] : option.value)} className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm transition ${active ? "border-cyan-500 bg-cyan-50 text-slate-950 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-300"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300"}`}>{active && <Check className="h-3.5 w-3.5" />}</span><span className="font-medium">{option.label}</span></button>;
  })}</div>;
}

function isAnswered(question: QuizQuestion, answer: unknown) {
  if (!question.required) return true;
  if (question.type === "currency_range") {
    const range = answer as { min?: unknown; max?: unknown } | null;
    return Boolean(Number(range?.min) || Number(range?.max));
  }
  return Array.isArray(answer) ? answer.length > 0 : Boolean(String(answer ?? "").trim());
}

export default function PublicMarketMatchQuizPage() {
  const [token, setToken] = useState(initialToken);
  const [contact, setContact] = useState<ContactForm>(emptyContact);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<any>(null);
  const [showLenders, setShowLenders] = useState(false);
  const configuration = trpc.marketMatchQuiz.publicConfiguration.useQuery();
  const session = trpc.marketMatchQuiz.session.useQuery({ browserToken: token }, { enabled: Boolean(token), retry: false });
  const begin = trpc.marketMatchQuiz.begin.useMutation({ onError: error => toast.error(error.message) });
  const saveAnswer = trpc.marketMatchQuiz.saveAnswer.useMutation({ onError: error => toast.error(error.message) });
  const getResults = trpc.marketMatchQuiz.results.useMutation({ onError: error => toast.error(error.message) });
  const requestAgent = trpc.marketMatchQuiz.requestAgent.useMutation({ onError: error => toast.error(error.message) });
  const requestLender = trpc.marketMatchQuiz.requestLender.useMutation({ onError: error => toast.error(error.message) });
  const lenders = trpc.marketMatchQuiz.lenders.useQuery({ browserToken: token }, { enabled: Boolean(token) && showLenders });
  const questions = useMemo(() => (session.data?.questions ?? configuration.data?.questions ?? []) as QuizQuestion[], [configuration.data?.questions, session.data?.questions]);

  useEffect(() => {
    if (!session.data) return;
    setAnswers((session.data.session.answers as Record<string, unknown>) || {});
    const resultData = session.data.latestResult;
    if (resultData) setResult(resultData);
    const current = questions.findIndex(item => item.id === session.data?.session.currentStep);
    if (current >= 0) setIndex(current);
  }, [session.data, questions]);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (!contact.emailReminderConsent) { toast.error("Please confirm that we may save your match and send the requested quiz reminder."); return; }
    const started = await begin.mutateAsync({ ...contact, phone: contact.phone || null, firstTouch: browserTouch(), deviceCategory: deviceCategory() });
    window.localStorage.setItem(QUIZ_ACCESS_STORAGE_KEY, started.browserToken);
    setToken(started.browserToken); setAnswers({}); setIndex(0); toast.success("Your Market Match has been saved securely.");
  }

  async function next() {
    const question = questions[index]; if (!question) return;
    if (!isAnswered(question, answers[question.id])) { toast.error("Please answer this question before continuing."); return; }
    await saveAnswer.mutateAsync({ browserToken: token, questionId: question.id, answer: answers[question.id] ?? null, currentStep: questions[index + 1]?.id ?? "results", touch: browserTouch() });
    if (index >= questions.length - 1) { const matched = await getResults.mutateAsync({ browserToken: token }); setResult(matched); await session.refetch(); return; }
    setIndex(current => current + 1);
  }

  async function selectAgent(marketId: number, path: "introduction" | "schedule") {
    const handoff = await requestAgent.mutateAsync({ browserToken: token, marketId, path });
    if (path === "schedule" && handoff.bookingUrl) { window.location.assign(handoff.bookingUrl); return; }
    toast.success(`Introduction request sent to ${handoff.agentName}.`);
    void session.refetch();
  }

  async function selectLender(lenderId: number, path: "introduction" | "schedule") {
    const handoff = await requestLender.mutateAsync({ browserToken: token, lenderId, path });
    if (path === "schedule" && handoff.bookingUrl) { window.location.assign(handoff.bookingUrl); return; }
    toast.success(`Introduction request sent to ${handoff.lenderName}.`);
  }

  if (configuration.isLoading || (token && session.isLoading)) return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto flex min-h-screen max-w-xl items-center justify-center gap-3 px-6"><Loader2 className="h-5 w-5 animate-spin text-cyan-300" />Loading your Market Match…</div></main>;
  if (configuration.error || session.error) return <main className="min-h-screen bg-slate-950 px-6 py-20 text-white"><div className="mx-auto max-w-xl rounded-2xl border border-rose-400/40 bg-white/5 p-7"><h1 className="text-2xl font-semibold">We could not open your Market Match</h1><p className="mt-3 text-slate-300">{configuration.error?.message || session.error?.message || "Please refresh and try again."}</p><Button className="mt-6" onClick={() => window.location.reload()}>Try again</Button></div></main>;
  if (!configuration.data?.enabled) return <main className="min-h-screen bg-slate-950 px-6 py-20 text-white"><div className="mx-auto max-w-xl text-center"><MapPinned className="mx-auto h-10 w-10 text-cyan-300" /><h1 className="mt-5 text-3xl font-semibold">Market Match is being updated</h1><p className="mt-3 text-slate-300">Please check back shortly.</p></div></main>;

  if (!token) return <main className="min-h-screen bg-slate-950 bg-[radial-gradient(circle_at_top_right,#164e63_0%,transparent_35%),radial-gradient(circle_at_bottom_left,#0e7490_0%,transparent_32%)] px-4 py-10 text-white sm:py-16"><div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center"><section><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-sm font-medium text-cyan-100"><Sparkles className="h-4 w-4" />Savvy STR Agents</div><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{configuration.data.title}</h1><p className="mt-5 max-w-xl text-lg leading-8 text-slate-200">{configuration.data.subtitle}</p><div className="mt-8 grid gap-3 text-sm text-slate-200 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-white/5 p-4"><MapPinned className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">Grounded results</strong>Matched from Savvy's current active markets.</div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><ClipboardCheck className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">You stay in control</strong>Review matches before requesting a handoff.</div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><LockKeyhole className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">Saved securely</strong>Return from this device anytime.</div></div></section><Card className="border-white/10 bg-white text-slate-950 shadow-2xl"><CardContent className="p-6 sm:p-8"><h2 className="text-2xl font-semibold">Start your match</h2><p className="mt-2 text-sm leading-6 text-slate-600">Answer a few focused questions so we can build your STR buy box and identify the best current fit.</p><form className="mt-6 space-y-4" onSubmit={start}><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="firstName">First name</Label><Input id="firstName" required value={contact.firstName} onChange={event => setContact({ ...contact, firstName: event.target.value })} /></div><div><Label htmlFor="lastName">Last name</Label><Input id="lastName" required value={contact.lastName} onChange={event => setContact({ ...contact, lastName: event.target.value })} /></div></div><div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={contact.email} onChange={event => setContact({ ...contact, email: event.target.value })} /></div><div><Label htmlFor="phone">Mobile number <span className="font-normal text-slate-500">(optional)</span></Label><Input id="phone" type="tel" value={contact.phone} onChange={event => setContact({ ...contact, phone: event.target.value })} /></div><label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700"><Checkbox checked={contact.emailReminderConsent} onCheckedChange={checked => setContact({ ...contact, emailReminderConsent: checked === true })} /><span><strong>Save my match and email me a reminder if I do not finish.</strong> This lets Savvy save the quiz to this device and send the configured finish-your-match follow-up after 24 hours of inactivity.</span></label><label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600"><Checkbox checked={contact.marketingEmailConsent} onCheckedChange={checked => setContact({ ...contact, marketingEmailConsent: checked === true })} /><span>Yes, I would like to receive Savvy's daily property opportunities by email. This is optional and is not required for my match.</span></label><label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600"><Checkbox checked={contact.marketingSmsConsent} onCheckedChange={checked => setContact({ ...contact, marketingSmsConsent: checked === true })} /><span>Yes, I agree to receive marketing text messages from Savvy STR Agents. Consent is optional and not required to receive a market match. Message and data rates may apply. Reply STOP to opt out.</span></label><Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700" disabled={begin.isPending}>{begin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{configuration.data.cta}<ChevronRight className="ml-2 h-4 w-4" /></Button></form></CardContent></Card></div></main>;

  if (result) return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12"><div className="mx-auto max-w-5xl"><div className="rounded-2xl bg-slate-950 p-7 text-white sm:p-10"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-sm font-medium uppercase tracking-[.16em] text-cyan-300">Your Savvy Market Match</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your STR buy box is ready</h1><p className="mt-3 max-w-2xl leading-7 text-slate-300">These options use your stated preferences and current Savvy Agent Markets intelligence. They are a starting point for a personalized diligence conversation, not a property or return guarantee.</p></div><Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => { setResult(null); setIndex(0); }}>Edit answers</Button></div><div className="mt-7 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Purchase range</p><p className="mt-1 font-semibold">{result.buyBox?.purchaseRange}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Timeline</p><p className="mt-1 font-semibold">{titleCase(result.buyBox?.timeline || "Not provided")}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Location</p><p className="mt-1 font-semibold">{result.buyBox?.locationPreference}</p></div></div>{result.buyBox?.inferredPreferences?.length ? <div className="mt-4 rounded-xl border border-cyan-200/40 bg-cyan-300/10 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">AI-assisted themes — inferred, not explicit answers</p><div className="mt-2 flex flex-wrap gap-2">{result.buyBox.inferredPreferences.map((item: any, index: number) => <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-100" key={`${item.field}-${index}`}>{item.value}</span>)}</div></div> : null}</div>{result.noFitReason ? <Card className="mt-6"><CardContent className="p-7"><h2 className="text-xl font-semibold">A personalized review is the right next step</h2><p className="mt-3 text-slate-600">{result.noFitReason}</p></CardContent></Card> : <section className="mt-7"><div className="mb-4"><h2 className="text-2xl font-semibold text-slate-950">Markets matched to your goals</h2><p className="mt-1 text-slate-600">Request an introduction or schedule with the Savvy STR agent assigned to each market.</p></div><div className="grid gap-5 md:grid-cols-2">{result.matches?.map((match: any) => <Card key={match.marketId} className="overflow-hidden border-slate-200"><CardContent className="p-0"><div className="border-b border-slate-100 bg-cyan-50 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-cyan-800">Match #{match.rank}</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{match.marketName}, {match.state}</h3>{match.region && <p className="mt-1 text-sm text-slate-600">{match.region}</p>}</div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-cyan-800 ring-1 ring-cyan-200">{match.confidence} alignment</span></div><ul className="mt-4 space-y-2 text-sm text-slate-700">{match.reasons?.map((reason: string) => <li key={reason} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />{reason}</li>)}</ul></div><div className="p-6"><p className="text-sm text-slate-600">Your Savvy STR Agent</p><p className="mt-1 font-semibold text-slate-950">{match.agent?.name || "Savvy STR Agent"}</p>{match.agent?.existingRelationship && <p className="mt-1 text-xs font-medium text-emerald-700">Prior Savvy relationship recognized</p>}<div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => selectAgent(match.marketId, "introduction")} disabled={requestAgent.isPending}><Mail className="mr-2 h-4 w-4" />Request introduction</Button><Button variant="outline" onClick={() => selectAgent(match.marketId, "schedule")} disabled={requestAgent.isPending || !match.agent?.bookingLink}><Phone className="mr-2 h-4 w-4" />Schedule a call</Button></div></div></CardContent></Card>)}</div></section>}<Card className="mt-7 border-cyan-200 bg-cyan-50"><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-semibold text-slate-950"><HeartHandshake className="h-5 w-5 text-cyan-700" />Need financing guidance?</div><p className="mt-1 text-sm text-slate-600">Choose an available lender for an introduction or scheduling link.</p></div><Button variant="outline" className="border-cyan-300 bg-white" onClick={() => setShowLenders(true)}>Explore lender options</Button></CardContent></Card>{showLenders && <section className="mt-6"><h2 className="text-xl font-semibold">Available lender options</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{lenders.isLoading && <p className="text-sm text-slate-500">Loading lenders…</p>}{lenders.data?.map(lender => <Card key={lender.id}><CardContent className="p-5"><h3 className="font-semibold">{lender.name}</h3>{lender.coverage && <p className="mt-1 text-sm text-slate-600">{lender.coverage}</p>}{lender.availabilityNote && <p className="mt-2 text-xs text-slate-500">{lender.availabilityNote}</p>}<div className="mt-4 flex gap-2"><Button size="sm" onClick={() => selectLender(lender.id, "introduction")} disabled={requestLender.isPending}>Request introduction</Button><Button size="sm" variant="outline" disabled={!lender.bookingLink || requestLender.isPending} onClick={() => selectLender(lender.id, "schedule")}>Schedule</Button></div></CardContent></Card>)}</div></section>}</div></main>;

  const question = questions[index];
  if (!question) return null;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14"><div className="mx-auto max-w-2xl"><div className="mb-8 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold text-slate-900"><MapPinned className="h-5 w-5 text-cyan-700" />Savvy Market Match</div><p className="text-sm text-slate-500">Question {index + 1} of {questions.length}</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-600 transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><Card className="mt-7"><CardContent className="p-6 sm:p-9"><p className="text-sm font-semibold uppercase tracking-[.14em] text-cyan-700">{question.section}</p><h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{question.label}</h1>{question.helper && <p className="mt-3 text-sm leading-6 text-slate-600">{question.helper}</p>}<div className="mt-7"><QuestionInput question={question} value={answers[question.id]} onChange={value => setAnswers(current => ({ ...current, [question.id]: value }))} /></div><div className="mt-8 flex items-center justify-between gap-3"><Button variant="ghost" onClick={() => setIndex(current => Math.max(0, current - 1))} disabled={index === 0 || saveAnswer.isPending}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button><Button onClick={next} disabled={saveAnswer.isPending || getResults.isPending}>{(saveAnswer.isPending || getResults.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{index === questions.length - 1 ? "See my matches" : "Continue"}<ChevronRight className="ml-1 h-4 w-4" /></Button></div></CardContent></Card><p className="mt-5 text-center text-xs leading-5 text-slate-500"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />Your original answers are retained as you revise them. Optional AI-assisted preferences are clearly marked as inferred and never replace what you explicitly shared.</p></div></main>;
}
