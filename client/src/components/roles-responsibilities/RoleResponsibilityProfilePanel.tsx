import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BarChart3, ClipboardList, ExternalLink, Loader2 } from "lucide-react";

type Props = {
  ownerId: number;
  ownerName: string;
  isAdmin: boolean;
  showStaffContext?: boolean;
};

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

function stripHtml(value?: string | null) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function RoleResponsibilityProfilePanel({
  ownerId,
  ownerName,
  isAdmin,
}: Props) {
  const [, navigate] = useLocation();
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: capability, isLoading: capabilityLoading } =
    trpc.rolesResponsibilities.capability.useQuery(undefined, { retry: false });
  const { data: summary, isLoading } =
    trpc.rolesResponsibilities.profileSummary.useQuery(
      { ownerId, includeArchived },
      { enabled: !!capability && isAdmin }
    );
  const responsibilities = (summary?.responsibilities ?? []) as any[];
  const scorecard = (summary?.scorecard ?? []) as any[];

  if (!isAdmin) return null;
  if (capabilityLoading)
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading Roles & Responsibilities…
        </CardContent>
      </Card>
    );
  if (!capability) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <ClipboardList className="h-4 w-4 text-primary" />
            Roles & Responsibilities
          </h3>
          <p className="text-sm text-muted-foreground">
            Seat-based responsibilities held by {ownerName}.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/roles-responsibilities")}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Company directory
        </Button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id={`include-archived-${ownerId}`}
          checked={includeArchived}
          onCheckedChange={value => setIncludeArchived(!!value)}
        />
        <Label
          htmlFor={`include-archived-${ownerId}`}
          className="cursor-pointer text-muted-foreground"
        >
          Show archived responsibilities
        </Label>
      </div>
      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Loading responsibilities…
          </CardContent>
        </Card>
      ) : responsibilities.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <ClipboardList className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="font-medium">
              No {includeArchived ? "matching" : "active"} responsibilities
              through current seats
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Assign this person to an Accountability seat to show that seat’s
              R&Rs here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {responsibilities.map(item => (
            <Card
              key={item.id}
              className={item.status === "archived" ? "opacity-70" : ""}
            >
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="text-left font-semibold hover:text-primary hover:underline"
                        onClick={() =>
                          navigate(`/roles-responsibilities/${item.id}`)
                        }
                      >
                        {item.title}
                      </button>
                      <Badge variant="secondary">
                        {item.seat?.title ?? "Needs seat assignment"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          item.status === "archived"
                            ? "bg-muted"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }
                      >
                        {item.status}
                      </Badge>
                      <Badge variant="outline">
                        {cadenceLabels[item.cadence] ?? item.cadence}
                      </Badge>
                    </div>
                    {item.cadenceDetails && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.cadenceDetails}
                      </p>
                    )}
                    {stripHtml(item.description) && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {stripHtml(item.description)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigate(`/roles-responsibilities/${item.id}`)
                    }
                  >
                    Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="flex items-center gap-2 font-medium">
                <BarChart3 className="h-4 w-4 text-primary" />
                Seat scorecard summary
              </h4>
              <p className="text-xs text-muted-foreground">
                Measurables attached to the R&Rs in this person’s current seats.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate("/roles-responsibilities?view=scorecards")
              }
            >
              Open scorecard
            </Button>
          </div>
          {scorecard.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No active measurables are attached to this person’s current seats.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {scorecard.map(metric => (
                <div key={metric.id} className="rounded-md border p-3">
                  <p className="truncate text-sm font-medium">{metric.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {metric.actual == null ? "No current value" : metric.actual}{" "}
                    / {metric.target ?? "—"}
                  </p>
                  <p
                    className={`mt-1 text-xs font-medium ${metric.onTarget === true ? "text-emerald-700" : metric.onTarget === false ? "text-red-700" : "text-muted-foreground"}`}
                  >
                    {metric.onTarget === true
                      ? "On target"
                      : metric.onTarget === false
                        ? "Off target"
                        : "Target not set"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
