import { useMemo, useState } from "react";
import { Star, MessageSquareText, CalendarDays, UserRound, SearchX } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function displayDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function propertyLabel(property: { address: string | null; city: string | null; state: string | null } | null): string {
  if (!property) return "—";
  return [property.address, property.city, property.state].filter(Boolean).join(", ") || "—";
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={`h-4 w-4 ${index < rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [agentId, setAgentId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryInput = useMemo(() => ({
    ...(isAdmin && agentId !== "all" ? { agentId: Number(agentId) } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    page: 1,
    limit: 100,
  }), [agentId, dateFrom, dateTo, isAdmin]);
  const { data, isLoading } = trpc.reviews.list.useQuery(queryInput);
  const { data: agents = [] } = trpc.users.list.useQuery({ role: "agent" }, { enabled: isAdmin });

  const clearFilters = () => {
    setAgentId("all");
    setDateFrom("");
    setDateTo("");
  };
  const hasFilters = agentId !== "all" || Boolean(dateFrom) || Boolean(dateTo);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-600"><Star className="h-5 w-5" /></div>
            <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAdmin ? "Monitor client feedback across every agent and closed transaction." : "See feedback clients have shared about their experience with you."}
          </p>
        </div>
        <Badge variant="secondary" className="w-fit px-3 py-1.5 text-sm">
          {data?.total ?? 0} {data?.total === 1 ? "review" : "reviews"}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Filter reviews</CardTitle>
          <CardDescription>{isAdmin ? "Narrow results by submitted date or agent." : "Narrow your reviews by submitted date."}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          {isAdmin && (
            <div className="w-full md:max-w-xs space-y-1.5">
              <Label htmlFor="review-agent">Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger id="review-agent"><SelectValue placeholder="All agents" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {agents.map((agent) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name || agent.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="w-full md:max-w-xs space-y-1.5">
            <Label htmlFor="review-date-from">From</Label>
            <Input id="review-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="w-full md:max-w-xs space-y-1.5">
            <Label htmlFor="review-date-to">To</Label>
            <Input id="review-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          {hasFilters && <Button variant="ghost" onClick={clearFilters}>Clear filters</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client feedback</CardTitle>
          <CardDescription>Each submitted review is linked to a closed transaction and a one-time review request.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-14 text-center text-sm text-muted-foreground">Loading reviews…</div>
          ) : !data?.rows.length ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <SearchX className="mb-3 h-9 w-9 text-muted-foreground/60" />
              <p className="font-medium">No reviews yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Reviews will appear here after a client responds to a request sent when a transaction is closed.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.rows.map(({ review, request, transaction, agent, property }) => (
                <article key={review.id} className="rounded-xl border bg-card p-4 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <RatingStars rating={review.rating} />
                        <span className="font-semibold">{review.rating}.0</span>
                        {review.isTest && <Badge variant="outline">Test review</Badge>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{review.reviewerName} <span className="text-muted-foreground/70">({request.recipientType})</span></span>
                        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{displayDate(review.submittedAt)}</span>
                        {isAdmin && <span>{agent.name || agent.email}</span>}
                      </div>
                    </div>
                    <div className="text-sm md:text-right">
                      <p className="font-medium">{transaction.transactionNumber || `Transaction #${transaction.id}`}</p>
                      <p className="mt-1 text-muted-foreground">{propertyLabel(property)}</p>
                    </div>
                  </div>
                  {review.comment ? (
                    <div className="mt-4 flex gap-2.5 rounded-lg bg-slate-50 p-3.5 text-sm leading-6 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                      <p className="whitespace-pre-wrap">{review.comment}</p>
                    </div>
                  ) : <p className="mt-4 text-sm italic text-muted-foreground">No written feedback provided.</p>}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
