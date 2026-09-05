import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, MapPinned, Save, Sparkles } from "lucide-react";

type Answers = Record<"marketOverview" | "idealClient" | "propertyTypes" | "revenueReality" | "valueAdd" | "investmentProfile" | "regulations" | "avoidAndWatchouts" | "localNuance", string>;
const EMPTY: Answers = { marketOverview: "", idealClient: "", propertyTypes: "", revenueReality: "", valueAdd: "", investmentProfile: "", regulations: "", avoidAndWatchouts: "", localNuance: "" };
const PAGE_COUNT = 5;

function Question({ label, hint, value, onChange, placeholder }: { label: string; hint: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="space-y-1.5"><div><Label className="text-sm font-semibold">{label}</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p></div><Textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={5} maxLength={8000} /><p className="text-right text-[11px] text-muted-foreground">{value.length.toLocaleString()}/8,000</p></div>;
}

export default function MarketProfileSurveyPage() {
  const [, navigate] = useLocation();
  const invitationId = useMemo(() => Number(new URLSearchParams(window.location.search).get("invitation")), []);
  const query = trpc.marketProfileSurvey.get.useQuery({ invitationId }, { enabled: Number.isInteger(invitationId) && invitationId > 0, retry: false });
  const [page, setPage] = useState(1);
  const [marketId, setMarketId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveProgress = trpc.marketProfileSurvey.saveProgress.useMutation({
    onSuccess: () => setAutosaveState("saved"),
    onError: error => { setAutosaveState("idle"); toast.error(error.message); },
  });
  const complete = trpc.marketProfileSurvey.complete.useMutation({
    onSuccess: ({ marketName }) => { toast.success(`Thank you — ${marketName}'s profile is now refreshing.`); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!query.data || loaded) return;
    setPage(query.data.invitation.currentPage || 1);
    setMarketId(query.data.invitation.marketProfileId ?? query.data.market?.id ?? null);
    setAnswers({ ...EMPTY, ...(query.data.answers as Partial<Answers>) });
    setLoaded(true);
  }, [query.data, loaded]);

  useEffect(() => {
    if (!loaded || query.data?.invitation.status === "completed" || !marketId) return;
    setAutosaveState("saving");
    const timer = window.setTimeout(() => {
      saveProgress.mutate({ invitationId, marketProfileId: marketId, currentPage: page, answers });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [answers, marketId, page, loaded, invitationId]);

  if (!Number.isInteger(invitationId) || invitationId <= 0) return <div className="mx-auto max-w-xl p-6"><Card><CardContent className="py-12 text-center"><h1 className="font-semibold">Survey link unavailable</h1><p className="mt-2 text-sm text-muted-foreground">Please open the personal survey link from your SavvyOS email.</p></CardContent></Card></div>;
  if (query.isLoading || !loaded) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (query.error) return <div className="mx-auto max-w-xl p-6"><Card><CardContent className="py-12 text-center"><h1 className="font-semibold">Survey unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{query.error.message}</p><Button className="mt-5" variant="outline" onClick={() => navigate("/")}>Return to SavvyOS</Button></CardContent></Card></div>;

  const data = query.data!;
  if (data.invitation.status === "completed" || complete.isSuccess) return <div className="mx-auto max-w-2xl p-4 py-10"><Card className="border-emerald-200"><CardContent className="py-12 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-2xl font-bold">Thank you for sharing your market expertise.</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Your answers have been added to the living profile for <strong className="text-foreground">{data.market?.name ?? "your market"}</strong>. SavvyOS will use the refreshed evidence to make Market Match guidance more useful.</p><Button className="mt-6" onClick={() => navigate("/")}>Return to SavvyOS</Button></CardContent></Card></div>;

  const update = (key: keyof Answers) => (value: string) => setAnswers(current => ({ ...current, [key]: value }));
  function move(direction: -1 | 1) {
    if (!marketId) return toast.error("Choose the Agent Market you know best before continuing.");
    const nextPage = Math.min(PAGE_COUNT, Math.max(1, page + direction));
    setAutosaveState("saving");
    saveProgress.mutate({ invitationId, marketProfileId: marketId, currentPage: nextPage, answers }, {
      onSuccess: () => { setAutosaveState("saved"); setPage(nextPage); },
      onError: error => toast.error(error.message),
    });
  }
  function submit() {
    if (!marketId) return toast.error("Choose the Agent Market you know best before submitting.");
    complete.mutate({ invitationId, marketProfileId: marketId, answers });
  }

  const content = page === 1 ? <><div className="space-y-1.5"><Label className="text-sm font-semibold">Your Agent Market</Label><p className="text-xs leading-5 text-muted-foreground">We preselected your assigned market. Change it if you know another listed market better, or if your assignment is incorrect.</p><Select value={marketId ? String(marketId) : undefined} onValueChange={value => setMarketId(Number(value))}><SelectTrigger><SelectValue placeholder="Select your market" /></SelectTrigger><SelectContent>{data.availableMarkets.map(market => <SelectItem key={market.id} value={String(market.id)}>{market.name}{market.state ? `, ${market.state}` : ""}</SelectItem>)}</SelectContent></Select></div><Question label="What is most important to understand about this market?" hint="Share the short version: the big demand drivers, positioning, seasonality, or local reality that outsiders often miss." value={answers.marketOverview} onChange={update("marketOverview")} placeholder="Example: This market is strongest for…" /><Question label="Who is the ideal investor or client here?" hint="Describe the goals, experience level, budget mindset, or use case that tends to fit best." value={answers.idealClient} onChange={update("idealClient")} placeholder="Example: The best-fit client is…" /></> : page === 2 ? <><Question label="What types of properties work best?" hint="Include location, bedroom count, amenities, property condition, price band, and what usually underperforms." value={answers.propertyTypes} onChange={update("propertyTypes")} placeholder="Example: 3–4 bedroom cabins near…" /><Question label="What revenue or demand reality should an investor understand?" hint="Use ranges or directional guidance if useful. Explain seasonality, booking behavior, and where projections can be misleading." value={answers.revenueReality} onChange={update("revenueReality")} placeholder="Example: Revenue tends to be strongest when…" /></> : page === 3 ? <><Question label="Do value-add projects work in this market?" hint="Share the upgrades, amenities, renovations, or operational changes that matter—and the ones that often do not pay back." value={answers.valueAdd} onChange={update("valueAdd")} placeholder="Example: The most worthwhile value-add is…" /><Question label="How do investors typically think about this market?" hint="Is it cash-flow heavy, appreciation/tax-driven, lifestyle driven, mostly turnkey, or a mix?" value={answers.investmentProfile} onChange={update("investmentProfile")} placeholder="Example: Investors are usually buying for…" /></> : page === 4 ? <><Question label="What regulations or compliance issues matter most?" hint="Share current practical considerations, but please label anything that needs legal or municipal verification." value={answers.regulations} onChange={update("regulations")} placeholder="Example: Before underwriting, verify…" /><Question label="What should investors avoid or watch closely?" hint="Call out locations, property traits, costs, permitting concerns, misconceptions, or deal-breakers." value={answers.avoidAndWatchouts} onChange={update("avoidAndWatchouts")} placeholder="Example: Avoid properties that…" /></> : <Question label="Anything else the model should know?" hint="This is your freeform space for local nuance, an example deal pattern, recommended questions to ask, or a gap we did not cover." value={answers.localNuance} onChange={update("localNuance")} placeholder="Add any local expertise that would make Market Match more useful…" />;

  return <div className="mx-auto max-w-3xl space-y-5 px-4 py-7"><Card className="overflow-hidden"><CardHeader className="border-b bg-gradient-to-r from-sky-50 to-background"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5" /></span><div><CardTitle className="text-xl">Build your Market Profile</CardTitle><CardDescription className="mt-1">A quick, save-as-you-go survey to make Market Match more useful for <strong>{data.market?.name ?? "your market"}</strong>.</CardDescription></div></div></CardHeader><CardContent className="space-y-6 p-5 sm:p-7"><div><div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Page {page} of {PAGE_COUNT}</span><span className="inline-flex items-center gap-1">{autosaveState === "saving" ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</> : autosaveState === "saved" ? <><Save className="h-3 w-3" />Saved</> : "Saves as you go"}</span></div><Progress value={(page / PAGE_COUNT) * 100} /></div><div className="space-y-6">{content}</div><div className="flex items-center justify-between border-t pt-5"><Button variant="outline" onClick={() => move(-1)} disabled={page === 1 || saveProgress.isPending}><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Button>{page < PAGE_COUNT ? <Button onClick={() => move(1)} disabled={saveProgress.isPending}><span>Save & continue</span><ArrowRight className="ml-1.5 h-4 w-4" /></Button> : <Button onClick={submit} disabled={complete.isPending}>{complete.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}Submit market profile</Button>}</div></CardContent></Card><p className="flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground"><MapPinned className="mt-0.5 h-3.5 w-3.5 shrink-0" />Your answers are used as internal market evidence. SavvyOS retains the latest partial answers if you leave and return later.</p></div>;
}
