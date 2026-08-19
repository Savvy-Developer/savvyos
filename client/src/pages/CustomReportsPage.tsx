import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BrainCircuit,
  Download,
  FilePlus2,
  Loader2,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

type ReportColumn = { key: string; label: string; type: "text" | "number" };
type ReportRow = Record<string, string | number>;
type ReportResult = {
  // The server validates this report-definition contract with Zod before every execution.
  definition: any;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: string;
  generatedAt: string;
};

type GeneratedPayload = {
  prompt: string;
  report: ReportResult;
  savedReportId?: number;
};

const metricLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const groupLabel = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

function formatNumber(value: string | number, column: ReportColumn): string {
  if (column.type !== "number") return String(value ?? "—");
  const numeric = Number(value ?? 0);
  const currencyMetrics = ["purchase_volume", "gross_commission", "savvy_net"];
  if (currencyMetrics.includes(column.key)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(numeric);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    numeric
  );
}

function toCsv(result: ReportResult) {
  const header = result.columns.map(column => column.label);
  const escape = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const body = result.rows.map(row =>
    result.columns
      .map(column => escape(formatNumber(row[column.key] ?? "", column)))
      .join(",")
  );
  return [header.map(escape).join(","), ...body].join("\n");
}

function downloadCsv(result: ReportResult) {
  const blob = new Blob([toCsv(result)], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `${
    result.definition.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "custom-report"
  }.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export default function CustomReportsPage() {
  const [prompt, setPrompt] = useState("");
  const [generated, setGenerated] = useState<GeneratedPayload | null>(null);
  const [saveName, setSaveName] = useState("");
  const utils = trpc.useUtils();
  const suggestionsQuery = trpc.customReports.suggestions.useQuery();
  const savedReportsQuery = trpc.customReports.list.useQuery();

  const generateMutation = trpc.customReports.generate.useMutation({
    onSuccess: payload => {
      const typed = payload as GeneratedPayload;
      setGenerated(typed);
      setSaveName(typed.report.definition.title);
    },
  });
  const rerunMutation = trpc.customReports.runDefinition.useMutation({
    onSuccess: payload => setGenerated(payload as GeneratedPayload),
  });
  const runSavedMutation = trpc.customReports.runSaved.useMutation({
    onSuccess: payload => {
      const typed = payload as GeneratedPayload;
      setGenerated(typed);
      setPrompt(typed.prompt);
      setSaveName(typed.report.definition.title);
    },
  });
  const saveMutation = trpc.customReports.save.useMutation({
    onSuccess: () => utils.customReports.list.invalidate(),
  });
  const removeMutation = trpc.customReports.remove.useMutation({
    onSuccess: () => utils.customReports.list.invalidate(),
  });

  const chartData = useMemo(() => {
    if (!generated?.report) return [];
    const metric = generated.report.definition.sortMetric;
    return generated.report.rows.slice(0, 12).map(row => ({
      label: String(row.group_label),
      value: Number(row[metric] ?? 0),
    }));
  }, [generated]);

  const running =
    generateMutation.isPending ||
    rerunMutation.isPending ||
    runSavedMutation.isPending;
  const report = generated?.report;

  const handleGenerate = () => {
    if (prompt.trim().length < 12) return;
    generateMutation.mutate({ prompt: prompt.trim() });
  };

  const handleSave = () => {
    if (!report || !saveName.trim()) return;
    saveMutation.mutate({
      name: saveName.trim(),
      prompt: generated?.prompt ?? prompt,
      definition: report.definition,
    });
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Custom Reports"
        subtitle="Ask a question in plain English. SavvyOS turns it into a transparent, admin-approved report—without allowing arbitrary database queries."
      />

      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-slate-900">
                Admin-only safeguarded reporting
              </p>
              <p className="mt-1 text-sm text-slate-600">
                The AI creates a validated report plan from your prompt. SavvyOS
                then runs only fixed, allowlisted transaction and contact
                aggregations. No raw SQL or unrestricted data access is
                available to the AI.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BrainCircuit className="h-5 w-5 text-indigo-600" /> Build a
                    report with AI
                  </CardTitle>
                  <CardDescription>
                    Describe the information, timeframe, and how you want it
                    broken down.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="border-indigo-200 bg-indigo-50 text-indigo-700"
                >
                  Transactions & contacts
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                placeholder="Example: Show closed transaction count, purchase volume, gross commission, and Savvy net by agent for the current quarter."
                className="min-h-[132px] resize-y"
                maxLength={2000}
              />
              <div className="flex flex-wrap gap-2">
                {(suggestionsQuery.data ?? []).map(suggestion => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto whitespace-normal py-2 text-left text-xs"
                    onClick={() => setPrompt(suggestion)}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5 text-indigo-600" />{" "}
                    {suggestion}
                  </Button>
                ))}
              </div>
              {generateMutation.error && (
                <p className="text-sm text-rose-600">
                  {generateMutation.error.message}
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={handleGenerate}
                  disabled={running || prompt.trim().length < 12}
                  className="min-w-40"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Generate report
                </Button>
              </div>
            </CardContent>
          </Card>

          {report && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{report.definition.title}</CardTitle>
                      <CardDescription className="mt-1 max-w-3xl">
                        {report.definition.description}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          rerunMutation.mutate({
                            definition: report.definition,
                          })
                        }
                        disabled={running}
                      >
                        {rerunMutation.isPending ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-4 w-4" />
                        )}{" "}
                        Refresh data
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadCsv(report)}
                      >
                        <Download className="mr-1.5 h-4 w-4" /> Export CSV
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {report.definition.dataset === "transactions"
                        ? "Transaction data"
                        : "Contact data"}
                    </Badge>
                    <Badge variant="secondary">
                      By {groupLabel(report.definition.groupBy)}
                    </Badge>
                    <Badge variant="secondary">
                      {report.definition.dateFrom ?? "All time"} →{" "}
                      {report.definition.dateTo ?? "Today"}
                    </Badge>
                    {report.definition.metrics.map((metric: string) => (
                      <Badge key={metric} variant="outline">
                        {metricLabel(metric)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {report.summary} Generated{" "}
                    {new Date(report.generatedAt).toLocaleString()}.
                  </p>
                  <div className="max-h-[480px] overflow-auto rounded-md border">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="sticky top-0 bg-muted/95 text-left">
                        <tr>
                          {report.columns.map(column => (
                            <th
                              key={column.key}
                              className="px-4 py-3 font-medium"
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {report.rows.map((row, index) => (
                          <tr
                            key={`${row.group_key}-${index}`}
                            className="hover:bg-muted/40"
                          >
                            {report.columns.map(column => (
                              <td
                                key={column.key}
                                className={`px-4 py-3 ${column.type === "number" ? "font-medium tabular-nums" : ""}`}
                              >
                                {formatNumber(row[column.key] ?? "", column)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {report.rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={report.columns.length}
                              className="px-4 py-10 text-center text-muted-foreground"
                            >
                              No records match this approved report definition.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {chartData.length > 1 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {metricLabel(report.definition.sortMetric)} by{" "}
                      {groupLabel(report.definition.groupBy)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
                      >
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-18}
                          textAnchor="end"
                          height={54}
                        />
                        <YAxis tick={{ fontSize: 11 }} width={72} />
                        <Tooltip
                          formatter={(value: number) =>
                            new Intl.NumberFormat("en-US", {
                              maximumFractionDigits: 0,
                            }).format(value)
                          }
                        />
                        <Bar
                          dataKey="value"
                          fill="#4f46e5"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Save this report</CardTitle>
                  <CardDescription>
                    Save the approved report definition for repeatable,
                    refreshable reporting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="custom-report-name">Report name</Label>
                    <Input
                      id="custom-report-name"
                      value={saveName}
                      onChange={event => setSaveName(event.target.value)}
                      maxLength={255}
                    />
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending || !saveName.trim()}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}{" "}
                    Save report
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FilePlus2 className="h-4 w-4 text-indigo-600" /> Saved reports
            </CardTitle>
            <CardDescription>
              Reusable administrator report definitions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedReportsQuery.isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!savedReportsQuery.isLoading &&
              (savedReportsQuery.data ?? []).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Save a generated report to make it available here.
                </p>
              )}
            {(savedReportsQuery.data ?? []).map((saved: any) => (
              <div key={saved.id} className="rounded-lg border p-3">
                <p className="line-clamp-2 font-medium text-sm">{saved.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {saved.prompt}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {saved.lastRunAt
                    ? `Last run ${new Date(saved.lastRunAt).toLocaleDateString()}`
                    : "Not run from saved report"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => runSavedMutation.mutate({ id: saved.id })}
                    disabled={running}
                  >
                    {runSavedMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-1.5 h-3.5 w-3.5" />
                    )}{" "}
                    Run
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2.5 text-rose-600 hover:text-rose-700"
                    onClick={() => removeMutation.mutate({ id: saved.id })}
                    disabled={removeMutation.isPending}
                    aria-label={`Delete ${saved.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
