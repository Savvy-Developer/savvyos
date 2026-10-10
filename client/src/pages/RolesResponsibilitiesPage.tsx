import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  ClipboardList,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import RrEditorDialog from "@/components/roles-responsibilities/RrEditorDialog";
import ScorecardReview from "@/components/roles-responsibilities/ScorecardReview";

const cadenceLabels: Record<string, string> = {
  ongoing: "Ongoing",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every two weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
  as_needed: "As needed",
  custom: "Custom",
};
const cadenceOptions = Object.entries(cadenceLabels);

function holderLabel(holders: any[]) {
  if (!holders.length) return "Unfilled";
  return holders
    .map(holder => holder.name ?? holder.email ?? "Unnamed user")
    .join(", ");
}

export default function RolesResponsibilitiesPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [seat, setSeat] = useState(
    () => new URLSearchParams(window.location.search).get("seat") ?? "all"
  );
  const [seatAssignment, setSeatAssignment] = useState<
    "assigned" | "unassigned" | "all"
  >("all");
  const [cadence, setCadence] = useState("all");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [sort, setSort] = useState<"seat" | "title" | "cadence">("seat");
  const [missingSop, setMissingSop] = useState(false);
  const [missingMetric, setMissingMetric] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [ownershipOpen, setOwnershipOpen] = useState(false);
  const [ownershipQuestion, setOwnershipQuestion] = useState("");
  const [ownershipResult, setOwnershipResult] = useState<any>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityResult, setQualityResult] = useState<any>(null);

  const { data: seats = [] } =
    trpc.rolesResponsibilities.seatOptions.useQuery();
  const { data: list = [], isLoading } =
    trpc.rolesResponsibilities.list.useQuery({
      seatId: seat === "all" ? undefined : Number(seat),
      seatAssignment,
      cadence: cadence === "all" ? undefined : (cadence as any),
      status,
      search: search || undefined,
      sort,
    });
  const ownershipMutation =
    trpc.rolesResponsibilities.aiOwnershipSearch.useMutation({
      onSuccess: setOwnershipResult,
      onError: error => toast.error(error.message),
    });
  const qualityMutation =
    trpc.rolesResponsibilities.aiQualityReview.useMutation({
      onSuccess: result => {
        setQualityResult(result);
        setQualityOpen(true);
      },
      onError: error => toast.error(error.message),
    });
  const filteredList = (list as any[]).filter(
    item =>
      (!missingSop || item.sopCount === 0) &&
      (!missingMetric || item.metricCount === 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="h-6 w-6" />
            Roles & Responsibilities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each R&R belongs to an Accountability seat. Every current holder of
            that seat is jointly accountable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOwnershipOpen(true)}>
            <Search className="mr-2 h-4 w-4" />
            Who owns this?
          </Button>
          <Button
            variant="outline"
            disabled={qualityMutation.isPending}
            onClick={() => qualityMutation.mutate()}
          >
            {qualityMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Quality review
          </Button>
          <Button onClick={() => setEditorOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add R&R
          </Button>
        </div>
      </div>
      <Card className="border-primary/15 bg-primary/[0.025]">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <strong className="text-foreground">
              Seat-owned accountability.
            </strong>{" "}
            Replacing or adding a seat holder changes who is accountable for
            that seat’s R&Rs automatically. Older person-owned records remain in
            the{" "}
            <strong className="text-foreground">Needs seat assignment</strong>{" "}
            queue until they are mapped to a seat.
          </p>
        </CardContent>
      </Card>
      <Tabs
        defaultValue={
          new URLSearchParams(window.location.search).get("view") ===
          "scorecards"
            ? "scorecards"
            : "directory"
        }
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="directory">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            R&R Directory
          </TabsTrigger>
          <TabsTrigger value="scorecards">
            <BarChart3 className="mr-1.5 h-4 w-4" />
            Company Scorecards
          </TabsTrigger>
        </TabsList>
        <TabsContent value="directory" className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Filter className="h-4 w-4" />
                Directory filters
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search title or description"
                  />
                </div>
                <Select value={seat} onValueChange={setSeat}>
                  <SelectTrigger>
                    <SelectValue placeholder="All accountability seats" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All accountability seats
                    </SelectItem>
                    {(seats as any[]).map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={seatAssignment}
                  onValueChange={value => setSeatAssignment(value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assignment states</SelectItem>
                    <SelectItem value="assigned">Assigned to a seat</SelectItem>
                    <SelectItem value="unassigned">
                      Needs seat assignment
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select value={cadence} onValueChange={setCadence}>
                  <SelectTrigger>
                    <SelectValue placeholder="All cadences" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All cadences</SelectItem>
                    {cadenceOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={status}
                  onValueChange={value => setStatus(value as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="all">Active & archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={missingSop}
                    onCheckedChange={value => setMissingSop(!!value)}
                  />
                  No SOP
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={missingMetric}
                    onCheckedChange={value => setMissingMetric(!!value)}
                  />
                  No measurable
                </label>
                <Select
                  value={sort}
                  onValueChange={value => setSort(value as any)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seat">Sort: seat</SelectItem>
                    <SelectItem value="title">Sort: title</SelectItem>
                    <SelectItem value="cadence">Sort: cadence</SelectItem>
                  </SelectContent>
                </Select>
                <span className="ml-auto text-sm text-muted-foreground">
                  {filteredList.length} responsibilities
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardContent className="overflow-x-auto p-0">
              <table className="min-w-[1040px] w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">Responsibility</th>
                    <th className="px-4 py-3 font-medium">
                      Accountability seat
                    </th>
                    <th className="px-4 py-3 font-medium">Current holders</th>
                    <th className="px-4 py-3 font-medium">Cadence</th>
                    <th className="px-4 py-3 font-medium">Coverage</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-12 text-center text-muted-foreground"
                      >
                        Loading responsibilities…
                      </td>
                    </tr>
                  ) : filteredList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-12 text-center text-muted-foreground"
                      >
                        No responsibilities match these filters.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map(item => (
                      <tr
                        key={item.id}
                        className="border-b last:border-0 hover:bg-muted/20"
                      >
                        <td className="max-w-md px-4 py-3">
                          <button
                            className="text-left font-medium hover:text-primary hover:underline"
                            onClick={() =>
                              navigate(`/roles-responsibilities/${item.id}`)
                            }
                          >
                            {item.title}
                          </button>
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {(item.description ?? "").replace(
                              /<[^>]+>/g,
                              " "
                            ) || "No description"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {item.seat ? (
                            <button
                              className="text-left font-medium hover:text-primary hover:underline"
                              onClick={() =>
                                navigate(
                                  `/accountability-chart?seat=${item.seat.id}`
                                )
                              }
                            >
                              {item.seat.title}
                            </button>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-800"
                            >
                              Needs seat assignment
                            </Badge>
                          )}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-muted-foreground">
                          {item.seat ? holderLabel(item.holders ?? []) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">
                            {cadenceLabels[item.cadence] ?? item.cadence}
                          </Badge>
                          {item.cadenceDetails && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.cadenceDetails}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Badge variant="secondary">
                              <FileText className="mr-1 h-3 w-3" />
                              {item.sopCount} SOP
                              {item.sopCount === 1 ? "" : "s"}
                            </Badge>
                            <Badge variant="secondary">
                              <Target className="mr-1 h-3 w-3" />
                              {item.metricCount} measurable
                              {item.metricCount === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate(`/roles-responsibilities/${item.id}`)
                            }
                          >
                            Open
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="scorecards" className="space-y-4">
          <ScorecardReview />
        </TabsContent>
      </Tabs>
      <RrEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSaved={id => navigate(`/roles-responsibilities/${id}`)}
      />
      <Dialog open={ownershipOpen} onOpenChange={setOwnershipOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Who owns this?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={ownershipQuestion}
                onChange={event => setOwnershipQuestion(event.target.value)}
                onKeyDown={event =>
                  event.key === "Enter" &&
                  ownershipQuestion.trim() &&
                  ownershipMutation.mutate({
                    question: ownershipQuestion.trim(),
                  })
                }
                placeholder="Who owns agent onboarding?"
              />
              <Button
                disabled={
                  !ownershipQuestion.trim() || ownershipMutation.isPending
                }
                onClick={() =>
                  ownershipMutation.mutate({
                    question: ownershipQuestion.trim(),
                  })
                }
              >
                {ownershipMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Ask"
                )}
              </Button>
            </div>
            {ownershipResult && (
              <div className="space-y-3">
                <p className="text-sm">{ownershipResult.summary}</p>
                {(ownershipResult.matches ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No current responsibility matched that question.
                  </p>
                ) : (
                  ownershipResult.matches.map((match: any) => (
                    <Card key={match.responsibilityId}>
                      <CardContent className="flex gap-3 p-4">
                        <div className="flex-1">
                          <p className="font-medium">
                            {match.responsibility.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {match.responsibility.seatTitle
                              ? `Accountability seat: ${match.responsibility.seatTitle}`
                              : "Needs accountability seat assignment"}
                            {match.responsibility.holderNames?.length
                              ? ` · Holders: ${match.responsibility.holderNames.join(", ")}`
                              : ""}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {match.reason}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(match.responsibilityUrl)}
                        >
                          R&R
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnershipOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={qualityOpen} onOpenChange={setQualityOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>R&R quality review</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(qualityResult?.findings ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No quality issues were identified in the current active
                responsibility set.
              </p>
            ) : (
              qualityResult.findings.map((finding: any, index: number) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex gap-2">
                      <Badge variant="outline">
                        {finding.severity ?? "review"}
                      </Badge>
                      <Badge variant="secondary">
                        {String(finding.type ?? "finding").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm">{finding.recommendation}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(finding.responsibilityIds ?? []).map((id: number) => (
                        <Button
                          key={id}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(`/roles-responsibilities/${id}`)
                          }
                        >
                          Open R&R #{id}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQualityOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
