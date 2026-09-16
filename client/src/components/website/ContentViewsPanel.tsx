import { useState } from "react";
import { BookOpen, Loader2, Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

/**
 * How much each article is being read.
 *
 * Two numbers per article, and the difference between them is the point.
 * Views counts opens. Readers counts people, per day, so somebody who comes
 * back on Tuesday is counted again. The header says so, because a number
 * labelled "unique visitors" that quietly means something looser is worse than
 * no number at all.
 */

/** A bar per day, sized against the busiest day in the row. */
function Sparkline({ days }: { days: Array<{ dateKey: string; views: number }> }) {
  const peak = Math.max(1, ...days.map(day => day.views));
  return (
    <div className="flex h-8 items-end gap-px" aria-hidden="true">
      {days.map(day => (
        <div
          key={day.dateKey}
          title={`${day.dateKey}: ${day.views} ${day.views === 1 ? "view" : "views"}`}
          className={`w-full rounded-sm ${day.views > 0 ? "bg-cyan-500" : "bg-slate-200"}`}
          style={{
            // A day with reads never renders as nothing, so a quiet day and a
            // day with one read stay visually different.
            height: day.views > 0 ? `${Math.max(12, (day.views / peak) * 100)}%` : "8%",
          }}
        />
      ))}
    </div>
  );
}

export function ContentViewsPanel() {
  const [days, setDays] = useState("30");
  const stats = trpc.website.contentViewStats.useQuery({ days: Number(days) });

  const articles = stats.data?.articles ?? [];
  const withReads = articles.filter(article => article.views > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Reads</CardTitle>
            <CardDescription>
              Blog posts and case studies. Views counts opens. Readers counts
              people per day, so somebody returning on another day is counted
              again.
            </CardDescription>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {stats.isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {!stats.isLoading && articles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No blog posts or case studies yet.
          </p>
        )}

        {!stats.isLoading && articles.length > 0 && withReads.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing has been read in this window yet. Counting started when this
            went live, so there is no history before then.
          </p>
        )}

        {withReads.length > 0 && (
          <div className="space-y-2">
            {withReads.map(article => (
              <div
                key={`${article.kind}:${article.id}`}
                className="flex flex-wrap items-center gap-4 rounded-lg border p-3"
              >
                <div className="min-w-48 flex-1">
                  <div className="flex items-center gap-2">
                    {article.kind === "post" ? (
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                    )}
                    <span className="truncate text-sm font-semibold">
                      {article.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {article.kind === "post" ? "Blog post" : "Case study"}
                  </p>
                </div>
                <div className="w-40 shrink-0">
                  <Sparkline days={article.days} />
                </div>
                <div className="flex shrink-0 gap-6 text-right">
                  <div>
                    <p className="text-lg font-bold tabular-nums">
                      {article.views}
                    </p>
                    <p className="text-xs text-muted-foreground">Views</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">
                      {article.readers}
                    </p>
                    <p className="text-xs text-muted-foreground">Readers</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {articles.length > withReads.length && withReads.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {articles.length - withReads.length} other{" "}
            {articles.length - withReads.length === 1 ? "article has" : "articles have"}{" "}
            no reads in this window.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
