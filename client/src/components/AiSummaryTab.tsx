import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Clock, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface AiSummaryTabProps {
  contactId: number;
}

export default function AiSummaryTab({ contactId }: AiSummaryTabProps) {
  const [forceRefresh, setForceRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, error, refetch, isFetching } = trpc.contacts.getAiSummary.useQuery(
    { id: contactId, forceRefresh },
    {
      // Don't auto-fetch on mount — only fetch when the tab is opened
      staleTime: 1000 * 60 * 60 * 24 * 7, // 7 days
      retry: 1,
    }
  );

  function handleRefresh() {
    setForceRefresh(true);
    setRefreshKey((k) => k + 1);
    // Reset forceRefresh after triggering so next auto-fetch doesn't force again
    setTimeout(() => setForceRefresh(false), 500);
    refetch();
  }

  const updatedAt = data?.updatedAt ? new Date(data.updatedAt) : null;
  const isCached = data?.cached;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              <CardTitle className="text-base">AI Contact Summary</CardTitle>
              {isCached && (
                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                  <Clock className="h-3 w-3 mr-1" />
                  Cached
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {updatedAt && (
                <span className="text-xs text-muted-foreground">
                  Last updated {updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                disabled={isFetching || isLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
                {isFetching ? "Generating…" : "Refresh Summary"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || isFetching ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <div className="pt-2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="pt-2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Failed to generate summary</p>
                <p className="text-xs mt-1 opacity-80">{error.message}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={handleRefresh}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : data?.summary ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {data.summary.split("\n\n").map((paragraph, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground mb-3 last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium mb-1">No summary yet</p>
              <p className="text-xs mb-4">Generate an AI-powered insight summary for this contact based on all their notes, tasks, transactions, and communications.</p>
              <Button size="sm" onClick={handleRefresh} disabled={isFetching}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate Summary
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {data?.summary && (
        <p className="text-xs text-muted-foreground text-center">
          AI summaries are cached for 7 days. Click "Refresh Summary" to regenerate with the latest data.
        </p>
      )}
    </div>
  );
}
