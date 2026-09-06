import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t pt-5 first:border-t-0 first:pt-0"><h2 className="text-base font-semibold">{title}</h2><div className="mt-2 text-sm leading-6 text-muted-foreground">{children}</div></section>;
}

function List({ items, empty = "No current evidence is available for this section." }: { items?: unknown; empty?: string }) {
  const values = Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  return values.length ? <ul className="space-y-2">{values.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul> : <p>{empty}</p>;
}

export default function AgentMarketProfileFeedbackPage() {
  const [, params] = useRoute("/agent-market-feedback/:requestId");
  const [, navigate] = useLocation();
  const requestId = Number(params?.requestId);
  const { data, isLoading, error } = trpc.marketProfileFeedback.get.useQuery(
    { requestId },
    { enabled: Number.isInteger(requestId) && requestId > 0 },
  );
  const [feedback, setFeedback] = useState("");
  const submit = trpc.marketProfileFeedback.submit.useMutation({
    onSuccess: () => toast.success("Thank you. Your market feedback is being synthesized into the AI profile."),
    onError: response => toast.error(response.message),
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (!data) return <div className="mx-auto max-w-xl px-4 py-16"><Card><CardContent className="p-7 text-center"><MessageSquareText className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><h1 className="text-lg font-semibold">Market profile review unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error?.message || "This private review link may have expired or belongs to a different SavvyOS account."}</p><Button className="mt-5" onClick={() => navigate("/")}>Open SavvyOS</Button></CardContent></Card></div>;

  const profile: any = data.profileJson ?? {};
  const buyBox: any = profile.buyBox ?? {};
  const feedbackAlreadySubmitted = Boolean(data.feedbackSubmittedAt);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-7">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back to SavvyOS"><ArrowLeft className="h-4 w-4" /></Button><div className="min-w-0 flex-1"><p className="text-sm font-medium text-primary">Agent Markets</p><h1 className="text-2xl font-bold tracking-tight">Review your {data.marketName}, {data.marketState} AI profile</h1><p className="mt-1 text-sm text-muted-foreground">This snapshot is exactly what SavvyOS generated for your market. Review it below, then add local context that needs to be reflected in the next refresh.</p></div></div>

      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>What changed</CardTitle><Badge variant="outline" className="capitalize">Confidence: {profile.confidence || "limited"}</Badge></div><CardDescription>The following sections differed from the prior profile or were created with the first live profile.</CardDescription></CardHeader><CardContent><ul className="space-y-2 text-sm">{(data.changeSummary || []).map((change, index) => <li key={`${change}-${index}`} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{change}</li>)}</ul></CardContent></Card>

      <Card><CardHeader><CardTitle>Complete market profile</CardTitle><CardDescription>This profile is evidence-grounded decision support. It is not a forecast or guarantee of STR legality, revenue, financing, or property performance.</CardDescription></CardHeader><CardContent className="space-y-6"><Section title="Market read"><p>{profile.executiveSummary || "No market read is available yet."}</p></Section><Section title="Best-fit investors"><List items={profile.bestFitInvestors} /></Section><Section title="Not ideal for"><List items={profile.notIdealFor} /></Section><Section title="What to buy"><div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-medium uppercase tracking-wide text-foreground">Purchase-price guidance</p><p>{buyBox.purchasePriceGuidance || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-foreground">Bedroom guidance</p><p>{buyBox.bedroomGuidance || "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-foreground">Property types</p><p>{Array.isArray(buyBox.propertyTypes) && buyBox.propertyTypes.length ? buyBox.propertyTypes.join(" · ") : "Insufficient evidence"}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-foreground">Locations</p><p>{Array.isArray(buyBox.locations) && buyBox.locations.length ? buyBox.locations.join(" · ") : "Insufficient evidence"}</p></div></div>{Array.isArray(buyBox.propertyCharacteristics) && buyBox.propertyCharacteristics.length ? <div className="mt-4"><p className="text-xs font-medium uppercase tracking-wide text-foreground">Property characteristics</p><p>{buyBox.propertyCharacteristics.join(" · ")}</p></div> : null}</Section><Section title="Market dynamics"><List items={profile.marketDynamics} /></Section><Section title="Agent guidance"><List items={profile.agentGuidance} /></Section><Section title="Watchouts and diligence"><List items={profile.watchouts} /></Section><Section title="Evidence notes"><List items={profile.evidenceNotes} /></Section><Section title="Research gaps"><List items={profile.researchGaps} /></Section></CardContent></Card>

      <Card><CardHeader><CardTitle>Contribute your local market knowledge</CardTitle><CardDescription>Your comments become a traceable evidence source and SavvyOS automatically regenerates this market profile with that context.</CardDescription></CardHeader><CardContent className="space-y-3">{feedbackAlreadySubmitted ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" />Feedback submitted</div><p className="mt-1 whitespace-pre-wrap">{data.feedbackText}</p></div> : <><Textarea value={feedback} onChange={event => setFeedback(event.target.value)} className="min-h-40" placeholder="What is missing, inaccurate, or especially important for agents to know in this market? Include helpful local context, diligence considerations, or updated positioning." /><div className="flex justify-end"><Button onClick={() => submit.mutate({ requestId, feedback })} disabled={submit.isPending || feedback.trim().length < 2}>{submit.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Submit feedback for synthesis"}</Button></div></>}</CardContent></Card>
    </div>
  );
}
