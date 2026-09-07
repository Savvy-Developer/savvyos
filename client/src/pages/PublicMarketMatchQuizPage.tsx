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
const SAVVY_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";

type QuizQuestion = {
  id: string;
  section: string;
  label: string;
  helper?: string;
  type: "single" | "multi" | "currency_range" | "text" | "boolean";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  showWhen?: { questionId: string; values: string[] };
};
type EmailCapture = { email: string };
type ContactDetails = { firstName: string; lastName: string; phone: string; marketingSmsConsent: boolean };

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
function deviceCategory() { if (typeof window === "undefined") return "unknown"; return window.innerWidth < 640 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop"; }
function initialToken() { if (typeof window === "undefined") return ""; return window.localStorage.getItem(QUIZ_ACCESS_STORAGE_KEY) || ""; }
function isMissingSavedQuizError(message?: string) {
  return /saved quiz could not be found|saved market match link is no longer available/i.test(message ?? "");
}
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()); }
function timelineLabel(value: unknown) {
  const labels: Record<string, string> = { "0_3": "Purchase within 0–3 months", "3_6": "Purchase within 3–6 months", "6_12": "Purchase within 6–12 months", "12_plus": "Purchase more than 12 months out", "not_sure": "Purchase timeline not decided" };
  return labels[String(value ?? "")] || titleCase(String(value || "Not provided"));
}
function formatCurrencyInput(value: unknown) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? "$" + Number(digits).toLocaleString("en-US") : "";
}
function visibleQuestion(question: QuizQuestion, answers: Record<string, unknown>) {
  if (!question.showWhen) return true;
  const answer = answers[question.showWhen.questionId];
  const values = Array.isArray(answer) ? answer.map(String) : [String(answer ?? "")];
  return values.some(value => question.showWhen?.values.includes(value));
}
function isAnswered(question: QuizQuestion, answer: unknown) {
  if (!question.required) return true;
  if (question.type === "currency_range") { const range = answer as { min?: unknown; max?: unknown } | null; return Boolean(Number(range?.min) || Number(range?.max)); }
  return Array.isArray(answer) ? answer.length > 0 : Boolean(String(answer ?? "").trim());
}
function PublicShell({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <main className={`h-[100dvh] overflow-y-auto overscroll-y-contain ${dark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-950"}`}><header className={`sticky top-0 z-40 border-b backdrop-blur ${dark ? "border-white/10 bg-slate-950/90" : "border-slate-200 bg-white/95"}`}><div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6"><img src={SAVVY_LOGO} alt="Savvy STR Agents" className="h-7 w-auto object-contain" /></div></header>{children}</main>;
}
function QuestionInput({ question, value, answers, onChange }: { question: QuizQuestion; value: unknown; answers: Record<string, unknown>; onChange: (value: unknown) => void }) {
  if (question.type === "text") {
    const currentValue = typeof value === "string" ? value : "";
    return <div className="space-y-3"><Textarea value={currentValue} onChange={event => onChange(event.target.value)} placeholder={question.id === "locationPreference" ? "For example: Smokies, within two hours of an airport, no hurricane exposure" : "Share anything important to your decision"} className="min-h-28" />{question.id === "locationPreference" && !currentValue.trim() && <Button type="button" variant="outline" size="sm" onClick={() => onChange("Not sure yet")}>Not sure yet</Button>}</div>;
  }
  if (question.type === "currency_range") {
    const range = value && typeof value === "object" ? value as { min?: string; max?: string } : {};
    return <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`${question.id}-min`} className="text-xs text-slate-600">Minimum</Label><Input id={`${question.id}-min`} inputMode="numeric" placeholder="$300,000" value={formatCurrencyInput(range.min)} onChange={event => onChange({ ...range, min: formatCurrencyInput(event.target.value) })} /></div><div><Label htmlFor={`${question.id}-max`} className="text-xs text-slate-600">Maximum</Label><Input id={`${question.id}-max`} inputMode="numeric" placeholder="$600,000" value={formatCurrencyInput(range.max)} onChange={event => onChange({ ...range, max: formatCurrencyInput(event.target.value) })} /></div></div>;
  }
  if (question.type === "boolean") {
    const checked = value !== false;
    return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800"><Checkbox checked={checked} onCheckedChange={checkedValue => onChange(checkedValue === true)} /><span className="leading-6">Yes, I am open to hearing about lender options.</span></label>;
  }
  const selected = question.type === "multi" ? (Array.isArray(value) ? value as string[] : []) : [typeof value === "string" ? value : ""];
  const options = question.id === "primaryGoal" && Array.isArray(answers.investmentGoals)
    ? (question.options || []).filter(option => (answers.investmentGoals as string[]).includes(option.value))
    : question.options || [];
  return <div className="grid gap-2 sm:grid-cols-2">{options.map(option => {
    const active = selected.includes(option.value);
    return <button key={option.value} type="button" onClick={() => onChange(question.type === "multi" ? active ? selected.filter(item => item !== option.value) : [...selected, option.value] : option.value)} className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 ${active ? "border-cyan-500 bg-cyan-50 text-slate-950 shadow-sm" : "border-slate-200 bg-white hover:border-cyan-300"}`}><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-${question.type === "multi" ? "md" : "full"} border ${active ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-300"}`}>{active && <Check className="h-3.5 w-3.5" />}</span><span className="font-medium">{option.label}</span></button>;
  })}</div>;
}

export default function PublicMarketMatchQuizPage() {
  const [token, setToken] = useState(initialToken);
  const [emailCapture, setEmailCapture] = useState<EmailCapture>({ email: "" });
  const [details, setDetails] = useState<ContactDetails>({ firstName: "", lastName: "", phone: "", marketingSmsConsent: false });
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
    const current = allQuestions.findIndex(item => item.id === session.data?.session.currentStep);
    if (current >= 0) setIndex(current);
  // Session hydration must not run after a local answer changes; that would erase an in-progress selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.data]);

  useEffect(() => {
    if (!token || !isMissingSavedQuizError(session.error?.message)) return;
    window.localStorage.removeItem(QUIZ_ACCESS_STORAGE_KEY);
    setToken(""); setAnswers({}); setResult(null); setIndex(0); setSelectedMarkets([]); setScheduleUrl(null);
    toast.info("Your previous Market Match was reset. Start a new match below.");
  }, [session.error?.message, token]);

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    const started = await startFromEmail.mutateAsync({ email: emailCapture.email, firstTouch: browserTouch(), deviceCategory: deviceCategory(), emailReminderConsent: true, marketingEmailConsent: false, marketingSmsConsent: false });
    window.localStorage.setItem(QUIZ_ACCESS_STORAGE_KEY, started.browserToken);
    setToken(started.browserToken); setAnswers({}); setIndex(0);
    toast.success("Your Market Match has been saved securely.");
  }
  async function saveContactDetails(event: React.FormEvent) {
    event.preventDefault();
    await completeDetails.mutateAsync({ browserToken: token, firstName: details.firstName, lastName: details.lastName, phone: details.phone || null, marketingSmsConsent: details.marketingSmsConsent });
    await session.refetch();
  }
  async function next() {
    const question = questions[index]; if (!question) return;
    if (!isAnswered(question, answers[question.id])) { toast.error("Please answer this question before continuing."); return; }
    const answer = question.type === "boolean" && answers[question.id] === undefined ? true : answers[question.id] ?? null;
    await saveAnswer.mutateAsync({ browserToken: token, questionId: question.id, answer, currentStep: questions[index + 1]?.id ?? "results", touch: browserTouch() });
    if (index >= questions.length - 1) { const matched = await getResults.mutateAsync({ browserToken: token }); setResult(matched); await session.refetch(); return; }
    setIndex(current => current + 1);
  }
  async function selectAgent(marketId: number, path: "introduction" | "schedule") {
    const handoff = await requestAgent.mutateAsync({ browserToken: token, marketId, path });
    if (path === "schedule" && handoff.bookingUrl) { setScheduleUrl(handoff.bookingUrl); return; }
    toast.success(`Introduction request sent to ${handoff.agentName}.`); setSelectedMarkets(current => current.filter(id => id !== marketId)); void session.refetch();
  }
  async function submitSelectedIntroductions() { if (!selectedMarkets.length) return; for (const marketId of selectedMarkets) await selectAgent(marketId, "introduction"); setSelectedMarkets([]); }
  async function selectLender(lenderId: number, path: "introduction" | "schedule") {
    const handoff = await requestLender.mutateAsync({ browserToken: token, lenderId, path });
    if (path === "schedule" && handoff.bookingUrl) { setScheduleUrl(handoff.bookingUrl); return; }
    toast.success(`Introduction request sent to ${handoff.lenderName}.`);
  }
  async function optInToDailyProperties() { const outcome = await subscribeDailyProperties.mutateAsync({ browserToken: token }); if (outcome.success) toast.success("You are subscribed to Savvy's daily handpicked STR properties."); else toast.message(outcome.reason || "Your request was saved, but the daily property list is not currently configured."); void session.refetch(); }
  function toggleSelection(marketId: number) { setSelectedMarkets(current => current.includes(marketId) ? current.filter(id => id !== marketId) : [...current, marketId]); }

  if (configuration.isLoading || (token && session.isLoading)) return <PublicShell dark><div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-xl items-center justify-center gap-3 px-6"><Loader2 className="h-5 w-5 animate-spin text-cyan-300" />Loading your Market Match…</div></PublicShell>;
  if (configuration.error || (token && session.error)) return <PublicShell dark><div className="mx-auto max-w-xl px-4 py-16"><Card className="border-rose-400/40 bg-white/5 text-white"><CardContent className="p-7"><h1 className="text-2xl font-semibold">We could not open your Market Match</h1><p className="mt-3 text-slate-300">{configuration.error?.message || session.error?.message || "Please refresh and try again."}</p><Button className="mt-6" onClick={() => { if (token) window.localStorage.removeItem(QUIZ_ACCESS_STORAGE_KEY); window.location.reload(); }}>Try again</Button></CardContent></Card></div></PublicShell>;
  if (!configuration.data?.enabled) return <PublicShell dark><div className="mx-auto max-w-xl px-6 py-20 text-center"><MapPinned className="mx-auto h-10 w-10 text-cyan-300" /><h1 className="mt-5 text-3xl font-semibold">Market Match is being updated</h1><p className="mt-3 text-slate-300">Please check back shortly.</p></div></PublicShell>;

  if (!token) return <PublicShell dark><div className="bg-[radial-gradient(circle_at_top_right,#164e63_0%,transparent_35%),radial-gradient(circle_at_bottom_left,#0e7490_0%,transparent_32%)] px-4 py-10 sm:py-16"><div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center"><section><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-sm font-medium text-cyan-100"><Sparkles className="h-4 w-4" />Savvy STR Agents</div><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{configuration.data?.title || "Find the right STR market for your goals."}</h1><p className="mt-5 max-w-xl text-lg leading-8 text-slate-200">{configuration.data?.subtitle || "Build your BUYBOX, discover your strongest market matches, and connect with local STR specialists."}</p><div className="mt-8 grid gap-3 text-sm text-slate-200 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-white/5 p-4"><MapPinned className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">Grounded results</strong>Matched from Savvy's current active markets.</div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><ClipboardCheck className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">You stay in control</strong>Review matches before requesting a handoff.</div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><LockKeyhole className="mb-2 h-5 w-5 text-cyan-300" /><strong className="block text-white">Saved securely</strong>Return from this device or a private link anytime.</div></div></section><Card className="border-white/10 bg-white text-slate-950 shadow-2xl"><CardContent className="p-6 sm:p-8"><h2 className="text-2xl font-semibold">Start with your email</h2><p className="mt-2 text-sm leading-6 text-slate-600">We will save your progress and email your private results. If you are new to Savvy, we will ask for just a few more details next.</p><form className="mt-6 space-y-4" onSubmit={begin}><div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" required value={emailCapture.email} onChange={event => setEmailCapture({ email: event.target.value })} /></div><p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">By submitting, you agree that Savvy STR Agents may save your Market Match, email your results, and send a reminder if you leave before finishing. Your information is used to support this request and any introduction you choose.</p><Button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-700" disabled={startFromEmail.isPending}>{startFromEmail.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{configuration.data?.cta || "Find My Markets"}<ChevronRight className="ml-2 h-4 w-4" /></Button></form></CardContent></Card></div></div></PublicShell>;

  if (session.data?.session.requiresContactDetails) return <PublicShell><div className="mx-auto max-w-xl px-4 py-10 sm:py-16"><Card><CardContent className="p-6 sm:p-9"><p className="text-sm font-semibold uppercase tracking-[.14em] text-cyan-700">One quick detail</p><h1 className="mt-3 text-3xl font-semibold text-slate-950">Tell us who we should connect with</h1><p className="mt-3 text-sm leading-6 text-slate-600">We have saved your email and created your Market Match. Add your name and an optional mobile number so a Savvy specialist can follow up if you request a connection.</p><form className="mt-7 space-y-4" onSubmit={saveContactDetails}><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="firstName">First name</Label><Input id="firstName" autoComplete="given-name" required value={details.firstName} onChange={event => setDetails({ ...details, firstName: event.target.value })} /></div><div><Label htmlFor="lastName">Last name</Label><Input id="lastName" autoComplete="family-name" required value={details.lastName} onChange={event => setDetails({ ...details, lastName: event.target.value })} /></div></div><div><Label htmlFor="phone">Mobile number <span className="font-normal text-slate-500">(optional)</span></Label><Input id="phone" autoComplete="tel" type="tel" value={details.phone} onChange={event => setDetails({ ...details, phone: event.target.value })} /></div><label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700"><Checkbox checked={details.marketingSmsConsent} onCheckedChange={checked => setDetails({ ...details, marketingSmsConsent: checked === true })} /><span>Yes, I agree to receive marketing text messages from Savvy STR Agents. Consent is optional and not required to receive a market match. Message and data rates may apply. Reply STOP to opt out.</span></label><Button className="w-full" disabled={completeDetails.isPending}>{completeDetails.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue to my BUYBOX<ChevronRight className="ml-2 h-4 w-4" /></Button></form></CardContent></Card></div></PublicShell>;

  if (result) return <PublicShell><div className="mx-auto max-w-5xl px-4 py-8 sm:py-12"><div className="rounded-2xl bg-slate-950 p-7 text-white sm:p-10"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-sm font-medium uppercase tracking-[.16em] text-cyan-300">Your Savvy Market Match</p><h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Your STR BUYBOX is ready</h1><p className="mt-3 max-w-2xl leading-7 text-slate-300">These options use your stated preferences and current Savvy Agent Markets intelligence. They are a starting point for diligence with an agent or lender, not a property or return guarantee.</p></div><Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => { setResult(null); setIndex(0); }}>Edit answers</Button></div><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Purchase range</p><p className="mt-1 font-semibold">{result.buyBox?.purchaseRange}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Cash available</p><p className="mt-1 font-semibold">{result.buyBox?.cashAvailable}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Setup budget</p><p className="mt-1 font-semibold">{result.buyBox?.setupBudget}</p></div><div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Timeline</p><p className="mt-1 font-semibold">{timelineLabel(result.buyBox?.timeline)}</p></div></div>{result.buyBox?.inferredPreferences?.length ? <div className="mt-4 rounded-xl border border-cyan-200/40 bg-cyan-300/10 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">AI-assisted themes — inferred, not explicit answers</p><div className="mt-2 flex flex-wrap gap-2">{result.buyBox.inferredPreferences.map((item: any, itemIndex: number) => <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-slate-100" key={`${item.field}-${itemIndex}`}>{item.value}</span>)}</div></div> : null}</div>{result.noFitReason ? <Card className="mt-6"><CardContent className="p-7"><h2 className="text-xl font-semibold">A personalized review is the right next step</h2><p className="mt-3 text-slate-600">{result.noFitReason}</p></CardContent></Card> : <section className="mt-7"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold text-slate-950">Markets matched to your goals</h2><p className="mt-1 text-slate-600">These are matches among Savvy's currently participating markets, not an exhaustive national ranking.</p></div><Button disabled={!selectedMarkets.length || requestAgent.isPending} onClick={submitSelectedIntroductions}><Mail className="mr-2 h-4 w-4" />Introduce me to selected agents ({selectedMarkets.length})</Button></div><div className="grid gap-5 md:grid-cols-2">{result.matches?.map((match: any) => <Card key={match.marketId} className="overflow-hidden border-slate-200"><CardContent className="p-0"><div className="border-b border-slate-100 bg-cyan-50 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-cyan-800">Match #{match.rank}</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{match.marketName}, {match.state}</h3>{match.region && <p className="mt-1 text-sm text-slate-600">{match.region}</p>}</div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-cyan-800 ring-1 ring-cyan-200">{match.confidence} alignment</span></div><ul className="mt-4 space-y-2 text-sm text-slate-700">{match.reasons?.map((reason: string) => <li key={reason} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />{reason}</li>)}</ul><div className="mt-4 rounded-lg border border-cyan-100 bg-white/70 p-3 text-xs text-slate-700"><strong>Main tradeoff:</strong> {match.tradeoff || "Validate current local operating guidance and inventory with this agent."}<br /><span className="inline-block pt-1"><strong>Validate next:</strong> Confirm how this tradeoff affects your strategy, property criteria, and operating plan.</span></div></div><div className="p-6"><div className="flex items-start gap-3"><Checkbox id={`select-${match.marketId}`} checked={selectedMarkets.includes(match.marketId)} onCheckedChange={() => toggleSelection(match.marketId)} /><label htmlFor={`select-${match.marketId}`} className="cursor-pointer text-sm text-slate-700">Select for an introduction</label></div><div className="mt-4 flex items-center gap-3">{match.agent?.profilePhotoUrl ? <img src={match.agent.profilePhotoUrl} alt={match.agent?.name || "Savvy STR Agent"} className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-sm" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100 text-sm font-semibold text-cyan-800">{String(match.agent?.name || "S").split(" ").map((part: string) => part[0]).join("").slice(0, 2)}</div>}<div><p className="text-sm text-slate-600">Your Savvy STR Agent</p><p className="mt-1 font-semibold text-slate-950">{match.agent?.name || "Savvy STR Agent"}</p></div></div>{match.agent?.existingRelationship && <p className="mt-1 text-xs font-medium text-emerald-700">Prior Savvy relationship recognized</p>}<div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => selectAgent(match.marketId, "schedule")} disabled={requestAgent.isPending || !match.agent?.bookingLink}><Phone className="mr-2 h-4 w-4" />Schedule a call</Button></div></div></CardContent></Card>)}</div></section>}<Card className="mt-7 border-slate-200 bg-white"><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-950">Send me Savvy's daily handpicked STR properties.</p><p className="mt-1 text-sm text-slate-600">Optional — browse our general STR property opportunities with proformas. This does not change your market match.</p></div><Button variant="outline" onClick={optInToDailyProperties} disabled={subscribeDailyProperties.isPending || session.data?.session.consent?.marketingEmail}>{subscribeDailyProperties.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{session.data?.session.consent?.marketingEmail ? "Daily properties requested" : "Send me daily properties"}</Button></CardContent></Card><Card className="mt-7 border-cyan-200 bg-cyan-50"><CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-semibold text-slate-950"><HeartHandshake className="h-5 w-5 text-cyan-700" />Need financing guidance?</div><p className="mt-1 text-sm text-slate-600">Choose an available lender for an intentional introduction or scheduling request.</p></div><Button variant="outline" className="border-cyan-300 bg-white" onClick={() => setShowLenders(true)}>Explore lender options</Button></CardContent></Card>{showLenders && <section className="mt-6"><h2 className="text-xl font-semibold">Available lender options</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{lenders.isLoading && <p className="text-sm text-slate-500">Loading lenders…</p>}{lenders.data?.map(lender => <Card key={lender.id}><CardContent className="p-5"><h3 className="font-semibold">{lender.name}</h3>{lender.coverage && <p className="mt-1 text-sm text-slate-600">{lender.coverage}</p>}{lender.availabilityNote && <p className="mt-2 text-xs text-slate-500">{lender.availabilityNote}</p>}<div className="mt-4 flex gap-2"><Button size="sm" onClick={() => selectLender(lender.id, "introduction")} disabled={requestLender.isPending}>Request introduction</Button><Button size="sm" variant="outline" disabled={!lender.bookingLink || requestLender.isPending} onClick={() => selectLender(lender.id, "schedule")}>Schedule</Button></div></CardContent></Card>)}</div></section>}<div className="mt-7 text-center"><a className="text-sm font-medium text-cyan-800 underline underline-offset-4" href="https://www.savvy-agents.com/properties" target="_blank" rel="noreferrer">Browse Handpicked STR Properties</a></div></div>{scheduleUrl && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><div className="h-[85dvh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-4 py-3"><p className="font-semibold text-slate-950">Schedule your Savvy Market Match call</p><Button size="icon" variant="ghost" onClick={() => setScheduleUrl(null)} aria-label="Close scheduling"><X className="h-5 w-5" /></Button></div><iframe title="Schedule your Market Match call" src={scheduleUrl} className="h-[calc(85dvh-57px)] w-full border-0" /></div></div>}</PublicShell>;

  const question = questions[index];
  if (!question) return <PublicShell><div className="mx-auto max-w-xl px-4 py-16 text-center"><p className="text-slate-600">Preparing your next question…</p></div></PublicShell>;
  return <PublicShell><div className="mx-auto max-w-2xl px-4 py-8 sm:py-12"><div className="mb-6 flex items-center justify-between"><div className="flex items-center gap-2 font-semibold text-slate-900"><MapPinned className="h-5 w-5 text-cyan-700" />Savvy Market Match</div><p className="text-sm text-slate-500">Question {index + 1} of {questions.length}</p></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-600 transition-all" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><Card className="mt-7"><CardContent className="p-6 sm:p-9"><p className="text-sm font-semibold uppercase tracking-[.14em] text-cyan-700">{question.section}</p><h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{question.label}</h1>{question.helper && <p className="mt-3 text-sm leading-6 text-slate-600">{question.helper}</p>}{question.type === "multi" && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-cyan-700">Select all that apply</p>}{question.type === "single" && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Select one</p>}<div className="mt-7"><QuestionInput question={question} value={answers[question.id]} answers={answers} onChange={value => setAnswers(current => ({ ...current, [question.id]: value }))} /></div><div className="mt-8 flex items-center justify-between gap-3"><Button variant="ghost" onClick={() => setIndex(current => Math.max(0, current - 1))} disabled={index === 0 || saveAnswer.isPending}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button><div className="flex items-center gap-2">{!question.required && question.type === "text" && !String(answers[question.id] ?? "").trim() && <Button type="button" variant="outline" onClick={next} disabled={saveAnswer.isPending || getResults.isPending}>Skip</Button>}<Button onClick={next} disabled={saveAnswer.isPending || getResults.isPending}>{(saveAnswer.isPending || getResults.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{index === questions.length - 1 ? "See my matches" : "Continue"}<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div></CardContent></Card><p className="mt-5 pb-6 text-center text-xs leading-5 text-slate-500"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />Your original answers are retained as you revise them. Optional AI-assisted preferences are clearly marked as inferred and never replace what you explicitly shared.</p></div></PublicShell>;
}
