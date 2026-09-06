import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, HeartHandshake, Loader2, LockKeyhole, Mail, MapPinned, Phone, Sparkles, X } from "lucide-react";
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
  showWhen?: { questionId: string; values: string[] };
};
type EmailCapture = { email: string; emailReminderConsent: boolean; marketingEmailConsent: boolean; marketingSmsConsent: boolean };
type ContactDetails = { firstName: string; lastName: string; phone: string };

const emptyEmail: EmailCapture = { email: "", emailReminderConsent: false, marketingEmailConsent: false, marketingSmsConsent: false };
const emptyDetails: ContactDetails = { firstName: "", lastName: "", phone: "" };

function browserTouch(): Record<string, string | null> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    landingUrl: window.location.href,
    referrerUrl: document.referrer || null,
    utm_source: params.get("utm_source"), utm_medium: params.get("utm_medium"), utm_campaign: params.get("utm_campaign"),
    utm_term: params.get("utm_term"), utm_content: params.get("utm_content"), gclid: params.get("gclid"), fbclid: params.get("fbclid"),
  };
}
function deviceCategory() { if (typeof window === "undefined") return "unknown"; return window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop"; }
function initialToken() { if (typeof window === "undefined") return ""; return window.localStorage.getItem(QUIZ_ACCESS_STORAGE_KEY) || ""; }
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function visibleQuestion(question: QuizQuestion, answers: Record<string, unknown>) {
  if (!question.showWhen) return true;
  const answer = answers[question.showWhen.questionId];
  const values = Array.isArray(answer) ? answer.map(String) : [String(answer ?? "")];
  return values.some(value => question.showWhen?.values.includes(value));
}
function QuestionInput({ question, value, onChange }: { question: QuizQuestion; value: unknown; onChange: (value: unknown) => void }) {
  if (question.type === "text") return <Textarea value={typeof value === "string" ? value : ""} onChange={event => onChange(event.target.value)} placeholder={question.id === "locationPreference" ? "For example: Smokies, within two hours of an airport, no hurricane exposure" : "Share anything important to your decision"} className="min-h-28" />;
  if (question.type === "currency_range") {
    const range = value && typeof value === "object" ? value as { min?: string; max?: string } : {};
    return <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`${question.id}-min`} className="text-xs text-slate-600">Minimum</Label><Input id={`${question.id}-min`} inputMode="numeric" placeholder="$300,000" value={range.min || ""} onChange={event => onChange({ ...range, min: event.target.value.replace(/[^0-9]/g, "") })} /></div><div><Label htmlFor={`${question.id}-max`} className="text-xs text-slate-600">Maximum</Label><Input id={`${question.id}-max`} inputMode="numeric" placeholder="$600,000" value={range.max || ""} onChange={event => onChange({ ...range, max: event.target.value.replace(/[^0-9]/g, "") })} /></div></div>;
  }
  const selected = question.type === "multi" ? (Array.isArray(value) ? value as string[] : []) : [typeof value === "string" ? value : ""];
  return <div className="grid gap-2 sm:grid-cols-2">{question.options?.map(option => {
    const active = selected.includes(option.value);
    return <button key={option.value} type="button" onClick={() => onChange(question.type === "multi" ? active ? selected.filter(item => item !== option.value) : [...selected, option.value] : option.value)} className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 text-left text-sm transition ${active ? "border-cyan-500 bg-cyan-50 text-slate-950 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-300"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300"}`}>{active && <Check className="h-3.5 w-3.5" />}</span><span className="font-medium">{option.label}</span></button>;
  })}</div>;
}
function isAnswered(question: QuizQuestion, answer: unknown) {
  if (!question.required) return true;
  if (question.type === "currency_range") { const range = answer as { min?: unknown; max?: unknown } | null; return Boolean(Number(range?.min) || Number(range?.max)); }
  return Array.isArray(answer) ? answer.length > 0 : Boolean(String(answer ?? "").trim());
}

export default function PublicMarketMatchQuizPage() {
  const [token, setToken] = useState(initialToken);
  const [emailCapture, setEmailCapture] = useState<EmailCapture>(emptyEmail);
  const [details, setDetails] = useState<ContactDetails>(emptyDetails);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<any>(null);
  const [showLenders, setShowLenders] = useState(false);
  const [selectedMarkets, setSelectedMarkets] = useState<number[]>([]);
  const [scheduleUrl, setScheduleUrl] = useState<string | null>(null);
  const [resumeAttempted, setResumeAttempted] = useState(false);
  const configuration = trpc.marketMatchQuiz.publicConfiguration.useQuery();
  const session = trpc.marketMatchQuiz.session.useQuery({ browserToken: token }, { enabled: Boolean(token), retry: false });
  const startFromEmail = trpc.marketMatchQuiz.startFromEmail.useMutation({ onError: error => toast.error(error.message) });
  const completeDetails = trpc.marketMatchQuiz.completeContactDetails.useMutation({ onError: error => toast.error(error.message) });
  const resume = trpc.marketMatchQuiz.resume.useMutation({ onError: () => toast.error("This private resume link could not be opened. You can start a new match below.") });
  const saveAnswer = trpc.marketMatchQuiz.saveAnswer.useMutation({ onError: error => toast.error(error.message) });
  const getResults = trpc.marketMatchQuiz.results.useMutation({ onError: error => toast.error(error.message) });
  const requestAgent = trpc.marketMatchQuiz.requestAgent.useMutation({ onError: error => toast.error(error.message) });
  const requestLender = trpc.marketMatchQuiz.requestLender.useMutation({ onError: error => toast.error(error.message) });
  const subscribeDailyProperties = trpc.marketMatchQuiz.subscribeDailyProperties.useMutation({ onError: error => toast.error(error.message) });
  const lenders = trpc.marketMatchQuiz.lenders.useQuery({ browserToken: token }, { enabled: Boolean(token) && showLenders });
  const allQuestions = useMemo(() => (session.data?.questions ?? configuration.data?.questions ?? []) as QuizQuestion[], [configuration.data?.questions, session.data?.questions]);
  const questions = useMemo(() => allQuestions.filter(question => visibleQuestion(question, answers)), [allQuestions, answers]);
  const maxConnections = configuration.data?.maxAgentConnections ?? 2;

  useEffect(() => {
    if (typeof window === "undefined" || token || resumeAttempted) return;
    const resumeNonce = new URLSearchParams(window.location.search).get("resume");
    if (!resumeNonce) return;
    setResumeAttempted(true);
    void resume.mutateAsync({ resumeNonce }).then(saved => {
      window.localStorage.setItem(QUIZ_ACCESS_STORAGE_KEY, saved.browserToken);
      setToken(saved.browserToken);
      window.history.replaceState({}, "", window.location.pathname);
    });
  }, [resume, resumeAttempted, token]);

  useEffect(() => {
    if (!session.data) return;
    setAnswers((session.data.session.answers as Record<string, unknown>) || {});
    if (session.data.latestResult) setResult(session.data.latestResult);
    const current = questions.findIndex(item => item.id === session.data?.session.currentStep);
    if (current >= 0) setIndex(current);
  }, [session.data, questions]);

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    if (!emailCapture.emailReminderConsent) { toast.error("Please confirm that Savvy may save your match and send the requested finish-your-match reminder."); return; }
    const started = await startFromEmail.mutateAsync({ ...emailCapture, firstTouch: browserTouch(), deviceCategory: deviceCategory() });
    window.localStorage.setItem(QUIZ_ACCESS_STORAGE_KEY, started.browserToken);
    setToken(started.browserToken); setAnswers({}); setIndex(0);
    toast.success("Your Market Match has been saved securely.");
  }
  async function saveContactDetails(event: React.FormEvent) {
    event.preventDefault();
    await completeDetails.mutateAsync({ browserToken: token, firstName: details.firstName, lastName: details.lastName, phone: details.phone || null });
    await session.refetch();
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
    if (path === "schedule" && handoff.bookingUrl) { if (/calendly\.com/i.test(handoff.bookingUrl)) setScheduleUrl(handoff.bookingUrl); else window.location.assign(handoff.bookingUrl); return; }
    toast.success(`Introduction request sent to ${handoff.agentName}.`); setSelectedMarkets(current => current.filter(id => id !== marketId)); void session.refetch();
  }
  async function submitSelectedIntroductions() {
    if (!selectedMarkets.length) return;
    for (const marketId of selectedMarkets) await selectAgent(marketId, "introduction");
    setSelectedMarkets([]);
  }
  async function selectLender(lenderId: number, path: "introduction" | "schedule") {
    const handoff = await requestLender.mutateAsync({ browserToken: token, lenderId, path });
    if (path === "schedule" && handoff.bookingUrl) { if (/calendly\.com/i.test(handoff.bookingUrl)) setScheduleUrl(handoff.bookingUrl); else window.location.assign(handoff.bookingUrl); return; }
    toast.success(`Introduction request sent to ${handoff.lenderName}.`);
  }
  async function optInToDailyProperties() {
    const outcome = await subscribeDailyProperties.mutateAsync({ browserToken: token });
    if (outcome.success) toast.success("You are subscribed to Savvy's daily handpicked STR properties.");
    else toast.message(outcome.reason || "Your request was saved, but the daily property list is not currently configured.");
    void session.refetch();
  }
  function toggleSelection(marketId: number) {
    setSelectedMarkets(current => {
      if (current.includes(marketId)) return current.filter(id => id !== marketId);
      if (current.length >= maxConnections) { toast.error(`Choose up to ${maxConnections} markets for introductions.`); return current; }
      return [...current, marketId];
    });
  }

  if (configuration.isLoading || (token && session.isLoading)) return <main className="min-h-screen bg-slate-950 text-white"><div className="mx-auto flex min-h-screen max-w-xl items-center justify-center gap-3 px-6"><Loader2 className="h-5 w-5 animate-spin text-cyan-300" />Loading your Market Match…</div></main>;
  if (configuration.error || session.error) return <main className="min-h-screen bg-slate-950 px-6 py-20 text-white"><div className="mx-auto max-w-xl rounded-2xl border border-rose-400/40 bg-white/5 p-7"><h1 className="text-2xl font-semibold">We could not open your Market Match</h1><p className="mt-3 text-slate-300">{configuration.error?.message || session.error?.message || "Please refresh and try again."}</p><Button className="mt-6" onClick={() => window.location.reload()}>Try again</Button></div></main>;
  if (!configuration.data?.enabled) return <main className="min-h-screen bg-slate-950 px-6 py-20 text-white"><div className="mx-auto max-w-xl text-center"><MapPinned className="mx-auto h-10 w-10 text-cyan-300" /><h1 className="mt-5 text-3xl font-semibold">Market Match is being updated</h1><p className="mt-3 text-slate-300">Please check back shortly.</p></div></main>;

  if (!token) return <main className="min-h-screen bg-slate-950 bg-[radial-gradient(circle_at_top_right,#164e63_0%,transparent_35%),radial-gradient(circle_at_bottom_left,#0e7490_0%,transparent_32%)] px-4 py-10 text-white sm:py-16"><div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center"><section><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-sm font-medium text-cyan-100"><Sparkles className="h-4 w-4" />Savvy STR Agents</div><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Find the right STR market for your goals.</h1><p className="mt-5 max-w-xl text-lg leading-8 text-slate-200">Build your BUYBOX, discover your strongest market matches, and connect with local STR specialists.</p><div className="mt-8 grid gap-3 text-sm text-slate-200 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-white/5 p-4"><MapPinned className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">Grounded results</strong>Matched from Savvy's current active markets.</div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><ClipboardCheck className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">You stay in control</strong>Review matches before requesting a handoff.</div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><LockKeyhole className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">Saved securely</strong>Return from this device or a private link anytime.</div></div></section><Card className="border-white/10 bg-white text-slate-950 shadow-2xl"><CardContent className="p-6 sm:p-8"><h2 className="text-2xl font-semibold">Start with your email</h2><p className="mt-2 text-sm leading-6 text-slate-600">We will save your progress and email your private results. If you are new to Savvy, we will ask for just a few more details next.</p><form className="mt-6 space-y-4" onSubmit={begin}><div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={emailCapture.email} onChange={event => setEmailCapture({ ...emailCapture, email: event.target.value })} /></div><label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700"><Checkbox checked={emailCapture.emailReminderConsent} onCheckedChange={checked => setEmailCapture({ ...emailCapture, emailReminderConsent: checked === true })} /><span><strong>Save my match and email my private results.</strong> I also give Savvy permission to send a finish-your-match reminder if I do not complete it.</span></label><label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600"><Checkbox checked={emailCapture.marketingSmsConsent} onCheckedChange={checked => setEmailCapture({ ...emailCapture, marketingSmsConsent: checked === true })} /><span>Yes, I agree to receive marketing text messages from Savvy STR Agents. Consent is optional and not required to receive a market match. Message and data rates may apply. Reply STOP to opt out.</span></label><Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700" disabled={startFromEmail.isPending}>{startFromEmail.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Find My Markets<ChevronRight className="ml-2 h-4 w-4" /></Button></form></CardContent></Card></div></main>;

  if (session.data?.session.requiresContactDetails) return <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16"><Card className="mx-auto max-w-xl"><CardContent className="p-6 sm:p-9"><p className="text-sm font-semibold uppercase tracking-[.14em] text-cyan-700">One quick detail</p><h1 className="mt-3 text-3xl font-semibold text-slate-950">Tell us who we should connect with</h1><p className="mt-3 text-sm leading-6 text-slate-600">We have saved your email and created your Market Match. Add your name and an optional mobile number so a Savvy specialist can follow up if you request a connection.</p><form className="mt-7 space-y-4" onSubmit={saveContactDetails}><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="firstName">First name</Label><Input id="firstName" autoComplete="given-name" required value={details.firstName} onChange={event => setDetails({ ...details, firstName: event.target.value })} /></div><div><Label htmlFor="lastName">Last name</Label><Input id="lastName" autoComplete="family-name" required value={details.lastName} onChange={event => setDetails({ ...details, lastName: event.target.value })} /></div></div><div><Label htmlFor="phone">Mobile number <span className="font-normal text-slate-500">(optional)</span></Label><Input id="phone" autoComplete="tel" type="tel" value={details.phone} onChange={event => setDetails({ ...details, phone: event.target.value })} /></div><Button className="w-full" disabled={completeDetails.isPending}>{completeDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue to my BUYBOX<ChevronRight className="ml-2 h-4 w-4" /></Button></form></CardContent></Card></main>;

  if (result) return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12"><div className="mx-auto max-w-5xl"><div className="rounded-2xl bg-slate-950 p-7 text-white sm:p-10"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-sm font-medium uppercase tracking-[.16em] text-cyan-300">Your Savvy Market Match</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your STR BUYBOX is ready</h1><p className="mt-3 max-w-2xl leading-7 text-slate-300">These options use your stated preferences and current Savvy Agent Markets intelligence. They are a starting point for diligence with an agent or lender, not a property or return guarantee.</p></div><Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => { setResult(null); setIndex(0); }}>Edit answers</Button></div><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Purchase range</p><p className="mt-1 font-semibold">{result.buyBox?.purchaseRange}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Cash available</p><p className="mt-1 font-semibold">{result.buyBox?.cashAvailable}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Setup budget</p><p className="mt-1 font-semibold">{result.buyBox?.setupBudget}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Timeline</p><p className="mt-1 font-semibold">{titleCase(result.buyBox?.timeline || "Not provided")}</p></div></div>{result.buyBox?.inferredPreferences?.length ? <div className="mt-4 rounded-xl border border-cyan-200/40 bg-cyan-300/10 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">AI-assisted themes — inferred, not explicit answers</p><div className="mt-2 flex flex-wrap gap-2">{result.buyBox.inferredPreferences.map((item: any, itemIndex: number) => <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-100" key={`${item.field}-${itemIndex}`}>{item.value}</span>)}</div></div> : null}</div>{result.noFitReason ? <Card className="mt-6"><CardContent className="p-7"><h2 className="text-xl font-semibold">A personalized review is the right next step</h2><p className="mt-3 text-slate-600">{result.noFitReason}</p></CardContent></Card> : <section className="mt-7"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold text-slate-950">Markets matched to your goals</h2><p className="mt-1 text-slate-600">These are matches among Savvy's currently participating markets, not an exhaustive national ranking.</p></div><Button disabled={!selectedMarkets.length || requestAgent.isPending} onClick={submitSelectedIntroductions}><Mail className="mr-2 h-4 w-4" />Introduce me to selected agents ({selectedMarkets.length})</Button></div><div className="grid gap-5 md:grid-cols-2">{result.matches?.map((match: any) => <Card key={match.marketId} className="overflow-hidden border-slate-200"><CardContent className="p-0"><div className="border-b border-slate-100 bg-cyan-50 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-cyan-800">Match #{match.rank}</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{match.marketName}, {match.state}</h3>{match.region && <p className="mt-1 text-sm text-slate-600">{match.region}</p>}</div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-cyan-800 ring-1 ring-cyan-200">{match.confidence} alignment</span></div><ul className="mt-4 space-y-2 text-sm text-slate-700">{match.reasons?.map((reason: string) => <li key={reason} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />{reason}</li>)}</ul><div className="mt-4 rounded-lg border border-cyan-100 bg-white/70 p-3 text-xs text-slate-700"><strong>Main tradeoff:</strong> {match.tradeoff || "Validate current local operating guidance and inventory with this agent."}<br /><span className="inline-block pt-1"><strong>Validate next:</strong> Confirm how this tradeoff affects your strategy, property criteria, and operating plan.</span></div></div><div className="p-6"><div className="flex items-start gap-3"><Checkbox id={`select-${match.marketId}`} checked={selectedMarkets.includes(match.marketId)} onCheckedChange={() => toggleSelection(match.marketId)} /><label htmlFor={`select-${match.marketId}`} className="cursor-pointer text-sm text-slate-700">Select for an introduction</label></div><p className="mt-4 text-sm text-slate-600">Your Savvy STR Agent</p><p className="mt-1 font-semibold text-slate-950">{match.agent?.name || "Savvy STR Agent"}</p>{match.agent?.existingRelationship && <p className="mt-1 text-xs font-medium text-emerald-700">Prior Savvy relationship recognized</p>}<div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => selectAgent(match.marketId, "schedule")} disabled={requestAgent.isPending || !match.agent?.bookingLink}><Phone className="mr-2 h-4 w-4" />Schedule a call</Button></div></div></CardContent></Card>)}</div></section>}<Card className="mt-7 border-slate-200 bg-white"><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-950">Send me Savvy's daily handpicked STR properties.</p><p className="mt-1 text-sm text-slate-600">Optional — browse our general STR property opportunities with proformas. This does not change your market match.</p></div><Button variant="outline" onClick={optInToDailyProperties} disabled={subscribeDailyProperties.isPending || session.data?.session.consent?.marketingEmail}>{subscribeDailyProperties.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{session.data?.session.consent?.marketingEmail ? "Daily properties requested" : "Send me daily properties"}</Button></CardContent></Card><Card className="mt-7 border-cyan-200 bg-cyan-50"><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-semibold text-slate-950"><HeartHandshake className="h-5 w-5 text-cyan-700" />Need financing guidance?</div><p className="mt-1 text-sm text-slate-600">Choose an available lender for an intentional introduction or scheduling request.</p></div><Button variant="outline" className="border-cyan-300 bg-white" onClick={() => setShowLenders(true)}>Explore lender options</Button></CardContent></Card>{showLenders && <section className="mt-6"><h2 className="text-xl font-semibold">Available lender options</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{lenders.isLoading && <p className="text-sm text-slate-500">Loading lenders…</p>}{lenders.data?.map(lender => <Card key={lender.id}><CardContent className="p-5"><h3 className="font-semibold">{lender.name}</h3>{lender.coverage && <p className="mt-1 text-sm text-slate-600">{lender.coverage}</p>}{lender.availabilityNote && <p className="mt-2 text-xs text-slate-500">{lender.availabilityNote}</p>}<div className="mt-4 flex gap-2"><Button size="sm" onClick={() => selectLender(lender.id, "introduction")} disabled={requestLender.isPending}>Request introduction</Button><Button size="sm" variant="outline" disabled={!lender.bookingLink || requestLender.isPending} onClick={() => selectLender(lender.id, "schedule")}>Schedule</Button></div></CardContent></Card>)}</div></section>}<div className="mt-7 text-center"><a className="text-sm font-medium text-cyan-800 underline underline-offset-4" href="https://www.savvy-agents.com/properties" target="_blank" rel="noreferrer">Browse Handpicked STR Properties</a></div></div>{scheduleUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><div className="h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-4 py-3"><p className="font-semibold text-slate-950">Schedule your Savvy Market Match call</p><Button size="icon" variant="ghost" onClick={() => setScheduleUrl(null)} aria-label="Close scheduling"><X className="h-5 w-5" /></Button></div><iframe title="Schedule your Market Match call" src={scheduleUrl} className="h-[calc(85vh-57px)] w-full border-0" /></div></div>}</main>;

  const question = questions[index];
  if (!question) return null;
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14"><div className="mx-auto max-w-2xl"><div className="mb-8 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold text-slate-900"><MapPinned className="h-5 w-5 text-cyan-700" />Savvy Market Match</div><p className="text-sm text-slate-500">Question {index + 1} of {questions.length}</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-600 transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><Card className="mt-7"><CardContent className="p-6 sm:p-9"><p className="text-sm font-semibold uppercase tracking-[.14em] text-cyan-700">{question.section}</p><h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{question.label}</h1>{question.helper && <p className="mt-3 text-sm leading-6 text-slate-600">{question.helper}</p>}<div className="mt-7"><QuestionInput question={question} value={answers[question.id]} onChange={value => setAnswers(current => ({ ...current, [question.id]: value }))} /></div><div className="mt-8 flex items-center justify-between gap-3"><Button variant="ghost" onClick={() => setIndex(current => Math.max(0, current - 1))} disabled={index === 0 || saveAnswer.isPending}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button><Button onClick={next} disabled={saveAnswer.isPending || getResults.isPending}>{(saveAnswer.isPending || getResults.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{index === questions.length - 1 ? "See my matches" : "Continue"}<ChevronRight className="ml-1 h-4 w-4" /></Button></div></CardContent></Card><p className="mt-5 text-center text-xs leading-5 text-slate-500"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />Your original answers are retained as you revise them. Optional AI-assisted preferences are clearly marked as inferred and never replace what you explicitly shared.</p></div></main>;
}
