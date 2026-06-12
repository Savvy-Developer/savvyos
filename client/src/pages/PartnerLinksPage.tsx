import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Copy, Check, Link2, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";

function buildPartnerUrl(partnerName: string): string {
  const base = window.location.origin;
  return `${base}/partner-lead?partner=${encodeURIComponent(partnerName)}`;
}

export default function PartnerLinksPage() {
  const { data: sources, isLoading } = trpc.webhooks.listPartnerSources.useQuery();
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const filtered = (sources ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  async function copyLink(id: number, name: string) {
    const url = buildPartnerUrl(name);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  }

  function openLink(name: string) {
    window.open(buildPartnerUrl(name), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Partner Intake Links</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Share these unique links with each partner. When a partner submits a lead using their
          link, the source is automatically attributed in the CRM.
        </p>
      </div>

      {/* How it works */}
      <Card className="border-cyan-500/30 bg-cyan-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-cyan-500 mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How it works</p>
              <p>
                Each link pre-fills the partner source on the public intake form. The partner
                doesn't need an account — they just fill in their client's details and submit.
                You'll receive an admin notification and the contact will be created in the CRM
                automatically.
              </p>
              <p className="mt-1">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {window.location.origin}/partner-lead?partner=Partner+Name
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search lead sources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Active Lead Sources
            {sources && (
              <Badge variant="secondary" className="ml-2 font-normal">
                {sources.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading sources…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {search ? "No sources match your search." : "No active lead sources found."}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((source) => {
                const url = buildPartnerUrl(source.name);
                const isCopied = copied === source.id;
                return (
                  <div
                    key={source.id}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">{source.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                        {url}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => openLink(source.name)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => copyLink(source.id, source.name)}
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy Link
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center">
        Lead sources are managed under{" "}
        <a href="/admin/lead-sources" className="underline hover:text-foreground">
          Admin → Lead Sources
        </a>
        . Only active sources appear here.
      </p>
    </div>
  );
}
