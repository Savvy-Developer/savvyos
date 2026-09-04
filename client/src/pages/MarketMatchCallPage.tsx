import { useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  MapPinned,
  PhoneCall,
  Radio,
  Sparkles,
  UserRound,
} from "lucide-react";

function confidenceClass(confidence: "high" | "medium" | "low") {
  if (confidence === "high")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "medium")
    return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function confidenceLabel(confidence: "high" | "medium" | "low") {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Developing fit";
  return "Low confidence";
}

function formatUpdatedAt(value: Date | string | null | undefined) {
  if (!value) return "Waiting for Aircall transcript…";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waiting for Aircall transcript…";
  return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function MarketMatchCallPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const contactId = Number(id);
  const sessionToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("session") ?? "";
  }, []);
  const hasAccess = user?.role === "admin" || user?.role === "isa";
  const snapshot = trpc.marketMatch.snapshot.useQuery(
    { sessionToken },
    {
      enabled: Boolean(
        sessionToken &&
          Number.isInteger(contactId) &&
          contactId > 0 &&
          hasAccess
      ),
      refetchInterval: 4_000,
      staleTime: 0,
      retry: false,
      refetchOnWindowFocus: true,
    }
  );

  if (!hasAccess) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <h1 className="font-semibold">Market Match is not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Only ISA and admin users can open a Market Match call.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionToken) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-600" />
            <h1 className="font-semibold">Start from the Contact profile</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Market Match opens only after SavvyOS confirms an active Aircall
              call with the contact.
            </p>
            <Button
              className="mt-5"
              variant="outline"
              onClick={() =>
                navigate(
                  Number.isInteger(contactId)
                    ? `/contacts/${contactId}`
                    : "/contacts"
                )
              }
            >
              Return to Contact
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = snapshot.data;
  const backToContact = () =>
    navigate(
      Number.isInteger(contactId) ? `/contacts/${contactId}` : "/contacts"
    );
  const signalRows = [
    data?.signals.budget?.label,
    ...(data?.signals.locations ?? []).map(location => `${location} location`),
    ...(data?.signals.regions ?? []).map(region => `${region} region`),
    ...(data?.signals.goals ?? []).map(goal => `${goal} goal`),
    ...(data?.signals.financing ?? []).map(financing => `${financing}`),
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 shrink-0"
            onClick={backToContact}
            aria-label="Return to Contact"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Market Match Call
              </h1>
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                <Radio className="mr-1.5 h-3.5 w-3.5 animate-pulse" />
                Live Aircall
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Live recommendations are read-only and refresh as Aircall sends
              new call utterances.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => snapshot.refetch()}
          disabled={snapshot.isFetching}
        >
          <Clock3
            className={`mr-2 h-4 w-4 ${snapshot.isFetching ? "animate-spin" : ""}`}
          />
          Refresh now
        </Button>
      </div>

      {snapshot.isLoading && (
        <Card>
          <CardContent className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading the active Market Match call…
          </CardContent>
        </Card>
      )}

      {snapshot.error && (
        <Card className="border-destructive/40">
          <CardContent className="py-10 text-center">
            <AlertCircle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <h2 className="font-semibold">Market Match call unavailable</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              {snapshot.error.message}
            </p>
            <Button className="mt-5" variant="outline" onClick={backToContact}>
              Return to Contact
            </Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contact on call
                </p>
                <h2 className="mt-1 text-xl font-bold">
                  {data.contact.name || "Unnamed contact"}
                </h2>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <PhoneCall className="h-4 w-4" />
                    {data.contact.phone}
                  </span>
                  {data.contact.email && (
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-4 w-4" />
                      {data.contact.email}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinned className="h-4 w-4" />
                    {data.contact.primaryMarket ?? "No primary market recorded"}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <p className="font-medium">
                  Aircall call #{data.call.aircallCallId}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatUpdatedAt(data.call.lastTranscriptAt)}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Top Matches</h2>
                  <p className="text-sm text-muted-foreground">
                    Ranked from {data.activeMarketCount} active Agent Market
                    {data.activeMarketCount === 1 ? "" : "s"}; only the top 3–5
                    are shown.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={confidenceClass(data.signals.confidence)}
                >
                  {confidenceLabel(data.signals.confidence)}
                </Badge>
              </div>
              {data.matches.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <MapPinned className="mx-auto mb-3 h-8 w-8 opacity-40" />
                    <p className="font-medium text-foreground">
                      No active Agent Markets yet
                    </p>
                    <p className="mt-1 text-sm">
                      Ask an administrator to add active coverage in Agent
                      Markets before using this call workflow.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {data.matches.map(match => (
                    <Card
                      key={match.market.id}
                      className={
                        match.rank === 1
                          ? "border-primary/35 shadow-sm"
                          : undefined
                      }
                    >
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                {match.rank}
                              </span>
                              <h3 className="text-lg font-semibold">
                                {match.market.name}
                              </h3>
                              <Badge
                                variant="outline"
                                className={confidenceClass(match.confidence)}
                              >
                                {confidenceLabel(match.confidence)}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {match.market.state}
                              {match.market.region
                                ? ` · ${match.market.region}`
                                : ""}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {match.reasons.map(reason => (
                                <span
                                  key={reason}
                                  className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="min-w-48 rounded-lg bg-muted/40 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Assigned agents
                            </p>
                            {match.agents.length ? (
                              <div className="mt-2 space-y-2">
                                {match.agents.map(agent => (
                                  <div
                                    key={agent.id}
                                    className="flex items-center justify-between gap-2 text-sm"
                                  >
                                    <span className="min-w-0 truncate">
                                      {agent.name ?? "Assigned agent"}
                                      {agent.isPrimary ? (
                                        <span className="ml-1 text-xs text-muted-foreground">
                                          Primary
                                        </span>
                                      ) : null}
                                      {!agent.isAvailable ? (
                                        <span className="ml-1 text-xs text-amber-700">
                                          Unavailable
                                        </span>
                                      ) : null}
                                    </span>
                                    {agent.callBookingLink ? (
                                      <a
                                        href={agent.callBookingLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                                      >
                                        <CalendarDays className="h-3.5 w-3.5" />
                                        Book
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : (
                                      <span className="shrink-0 text-xs text-muted-foreground">
                                        No Calendly
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs text-muted-foreground">
                                No active agent assigned.
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Signals heard on call
                      </CardTitle>
                      <CardDescription>
                        Simple V1 signals only: budget, financing, location, and
                        goals.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {signalRows.length ? (
                    <div className="flex flex-wrap gap-2">
                      {signalRows.map(signal => (
                        <Badge
                          key={signal}
                          variant="secondary"
                          className="font-normal"
                        >
                          {signal}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      Listening for budget, financing, geography, or investment
                      goals. Until those are clear, SavvyOS shows the best
                      available active-market coverage with low confidence.
                    </div>
                  )}
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs leading-5 text-blue-950">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Recommendations only read from active Agent Markets and
                      their assigned agents. This call does not update market
                      records.
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Live transcript</CardTitle>
                  <CardDescription>
                    {formatUpdatedAt(data.call.lastTranscriptAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.transcript.length ? (
                    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {data.transcript.map((utterance, index) => (
                        <div
                          key={`${utterance.speaker}-${utterance.text}-${index}`}
                          className="border-l-2 border-primary/30 pl-3"
                        >
                          <p className="text-xs font-semibold text-muted-foreground">
                            {utterance.speaker}
                          </p>
                          <p className="mt-0.5 text-sm leading-5">
                            {utterance.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                      <Radio className="mx-auto mb-2 h-5 w-5 animate-pulse text-primary" />
                      Waiting for the first live Aircall transcript segment.
                    </div>
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
