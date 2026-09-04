import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const DEFAULT_MAX_RECOMMENDATIONS = 5;

function formatUpdatedAt(value: Date | string | null | undefined): string {
  if (!value) return "Default settings are currently in use.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Settings saved.";
  return `Last saved ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}.`;
}

export default function MarketMatchSettingsPage() {
  const utils = trpc.useUtils();
  const settings = trpc.marketMatch.settings.useQuery();
  const [enabled, setEnabled] = useState(true);
  const [maxRecommendedMarkets, setMaxRecommendedMarkets] = useState(
    DEFAULT_MAX_RECOMMENDATIONS
  );

  useEffect(() => {
    if (!settings.data) return;
    setEnabled(settings.data.enabled);
    setMaxRecommendedMarkets(settings.data.maxRecommendedMarkets);
  }, [settings.data]);

  const saveSettings = trpc.marketMatch.saveSettings.useMutation({
    onSuccess: saved => {
      setEnabled(saved.enabled);
      setMaxRecommendedMarkets(saved.maxRecommendedMarkets);
      void utils.marketMatch.settings.invalidate();
      void utils.marketMatch.status.invalidate();
      toast.success("Market Match settings saved");
    },
    onError: error => toast.error(error.message),
  });

  const maxIsValid =
    Number.isInteger(maxRecommendedMarkets) &&
    maxRecommendedMarkets >= 3 &&
    maxRecommendedMarkets <= 5;
  const storedSettings = settings.data;
  const hasChanges = storedSettings
    ? enabled !== storedSettings.enabled ||
      maxRecommendedMarkets !== storedSettings.maxRecommendedMarkets
    : false;

  function save() {
    if (!maxIsValid) {
      toast.error("Choose a whole number from 3 to 5 recommended markets.");
      return;
    }
    saveSettings.mutate({ enabled, maxRecommendedMarkets });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader
        title="Market Match Settings"
        subtitle="Manage the organization-wide controls for the live Market Match call workflow."
        actions={
          <Button
            onClick={save}
            disabled={!hasChanges || !maxIsValid || saveSettings.isPending}
          >
            {saveSettings.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Save settings
          </Button>
        }
      />

      {settings.isLoading && (
        <Card>
          <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading Market Match
            settings…
          </CardContent>
        </Card>
      )}

      {settings.error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 py-6 text-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">
                Market Match settings are unavailable
              </p>
              <p className="mt-1 text-muted-foreground">
                {settings.error.message}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {settings.data && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Global Feature Controls</CardTitle>
                  <CardDescription>
                    These settings apply to every ISA and admin user.
                  </CardDescription>
                </div>
                <Badge
                  className={
                    enabled
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-100 text-slate-700"
                  }
                >
                  {enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <Label
                    htmlFor="enable-market-match"
                    className="text-sm font-semibold"
                  >
                    Enable Market Match
                  </Label>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    When enabled, eligible users can start a Market Match call
                    from a Contact profile. When disabled, the start action is
                    hidden and direct call-session requests are blocked
                    server-side before transcript data is read.
                  </p>
                </div>
                <Switch
                  id="enable-market-match"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  disabled={saveSettings.isPending}
                  aria-label="Enable Market Match"
                />
              </div>

              <div className="rounded-lg border p-4">
                <Label
                  htmlFor="max-recommended-markets"
                  className="text-sm font-semibold"
                >
                  Default maximum number of recommended markets
                </Label>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  Market Match will show no more than this number of Top Matches
                  from the active Agent Markets list.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Input
                    id="max-recommended-markets"
                    type="number"
                    inputMode="numeric"
                    min={3}
                    max={5}
                    step={1}
                    className="w-24"
                    value={maxRecommendedMarkets}
                    onChange={event =>
                      setMaxRecommendedMarkets(Number(event.target.value))
                    }
                    disabled={saveSettings.isPending}
                    aria-describedby="max-recommended-markets-help"
                  />
                  <span
                    id="max-recommended-markets-help"
                    className="text-sm text-muted-foreground"
                  >
                    Choose 3–5 markets. Default: 5.
                  </span>
                </div>
                {!maxIsValid && (
                  <p className="mt-2 text-sm text-destructive">
                    Enter a whole number from 3 to 5.
                  </p>
                )}
              </div>

              <div
                className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${enabled ? "border-emerald-100 bg-emerald-50/60 text-emerald-950" : "border-amber-100 bg-amber-50/60 text-amber-950"}`}
              >
                {enabled ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                )}
                <div>
                  <p className="font-medium">
                    {enabled
                      ? "Market Match is available"
                      : "Market Match is paused"}
                  </p>
                  <p className="mt-1 leading-5">
                    {enabled
                      ? `Eligible users can start a call and see up to ${maxRecommendedMarkets} current market recommendations.`
                      : "Start actions, direct call sessions, and live transcript processing remain unavailable until the feature is enabled again."}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatUpdatedAt(settings.data.updatedAt)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-primary/10 p-2 text-primary">
                  <Info className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Matching Overview</CardTitle>
                  <CardDescription>
                    Read-only summary of the current Version 1 matching signals.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm leading-6 text-muted-foreground">
                Market Match listens to the live Aircall transcript for basic
                buyer criteria, compares those signals with active Agent Markets
                and their generated intelligence profiles, then surfaces the top{" "}
                {maxRecommendedMarkets} markets as{" "}
                <strong className="font-semibold text-foreground">
                  Top Matches
                </strong>
                . It is a recommendation aid only: it does not create or edit
                Agent Markets, assignments, or agent booking links.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h3 className="font-semibold">Budget / price range</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Call budget language is compared with each market profile’s
                    purchase-price guidance.
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <h3 className="font-semibold">Geography / region / state</h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    State, market location, and broad region preferences
                    mentioned in the call are matched with active market
                    identity and location guidance.
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <h3 className="font-semibold">
                    Investor fit and investment goals
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Cash flow, appreciation, lifestyle use, and
                    short-term-rental intent are compared with the market
                    profile’s investor-fit, property, dynamics, and guidance
                    context.
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <h3 className="font-semibold">
                    Financing and available coverage
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Basic cash or financing language can support the match.
                    Results include only active markets and show their assigned
                    active agents and existing booking links.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Confidence:</span>{" "}
                recommendations stay low confidence when the call contains
                little usable criteria or conflicting preferences. More grounded
                signals improve the confidence label; they do not change Agent
                Markets data.
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
