import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, BookOpen, Loader2, Pencil, Plus, Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { ContentEditor } from "@/components/website/ContentEditor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * My Website > Case Studies / Blog Posts: an agent's own content.
 *
 * Dhruv's decision, 27 Sep: agents add case studies and blog posts themselves
 * and publish them straight to the site, like their properties, and see and
 * edit only their own. Admins still manage everything in Website Studio.
 */

const PUBLIC_SITE = "https://home.savvy-agents.com/newsite";

type Kind = "case" | "post";

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={
        status === "published"
          ? "bg-emerald-600 hover:bg-emerald-600"
          : status === "archived"
            ? "bg-slate-500"
            : "bg-amber-500 hover:bg-amber-500"
      }
    >
      {status === "published" ? "live" : status}
    </Badge>
  );
}

export default function MyWebsiteContentPage({ kind }: { kind: Kind }) {
  const [, navigate] = useLocation();
  const content = trpc.website.myWebsiteContent.useQuery();
  const [editor, setEditor] = useState<{ initial?: any } | null>(null);
  const isCase = kind === "case";
  const rows: any[] = (isCase ? content.data?.caseStudies : content.data?.posts) ?? [];
  const noun = isCase ? "case study" : "blog post";
  const publicPath = (slug: string) =>
    `${PUBLIC_SITE}/${isCase ? "case-studies" : "resources"}/${slug}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            {isCase ? <Sparkles className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
            My Website
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            {isCase ? "My Case Studies" : "My Blog Posts"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {isCase
              ? "Share a deal you helped a client with. Set it to Published and it goes live on the Case Studies page with your name on it."
              : "Write about your market or STR investing. Set it to Published and it goes live on the Resources page with your byline."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(isCase ? "/my-website/blog" : "/my-website/case-studies")}
          >
            {isCase ? "My Blog Posts" : "My Case Studies"}
          </Button>
          <Button onClick={() => setEditor({})}>
            <Plus className="mr-2 h-4 w-4" />
            New {noun}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isCase ? "Your case studies" : "Your blog posts"}</CardTitle>
          <CardDescription>
            Drafts stay private. Published is live on the website right away. Archive to take one down.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {content.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-600" />
            </div>
          ) : content.error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {content.error.message}
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
              You have no {isCase ? "case studies" : "blog posts"} yet. Click "New {noun}" to write your first one.
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {rows.map(row => (
                <div key={row.id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{row.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      Updated {new Date(row.updatedAt).toLocaleDateString()}
                      {row.publishedAt ? ` · Live since ${new Date(row.publishedAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                  {row.status === "published" && (
                    <a href={publicPath(row.slug)} target="_blank" rel="noreferrer" title="Open on the website">
                      <Button variant="ghost" size="icon" aria-label="Open on the website">
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                  <Button variant="ghost" size="icon" aria-label={`Edit ${row.title}`} onClick={() => setEditor({ initial: row })}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editor && (
        <ContentEditor
          kind={kind}
          mode="agent"
          initial={editor.initial}
          sourceAgents={[]}
          properties={content.data?.properties ?? []}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
