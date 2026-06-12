import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { Zap, Mail, MessageSquare, CheckCircle2, XCircle, Clock, Plus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { safeFormat } from "@/lib/safeFormat";

type Props = {
  contactId: number;
};

const STATUS_ICON = {
  sent: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  skipped: <Clock className="h-3.5 w-3.5 text-yellow-500" />,
};

export default function SmartPlanContactTab({ contactId }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canEnroll = user?.role === "admin" || user?.role === "isa";

  const { data: enrollments = [], isLoading: loadingEnrollments } =
    trpc.smartPlans.enrollments.list.useQuery({ contactId });

  const { data: executions = [], isLoading: loadingExecutions } =
    trpc.smartPlans.executions.list.useQuery({ contactId });

  const { data: allPlans = [] } = trpc.smartPlans.list.useQuery(undefined, {
    enabled: canEnroll,
  });

  const utils = trpc.useUtils();
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const manualEnrollMutation = trpc.smartPlans.enrollments.manualEnroll.useMutation({
    onSuccess: () => {
      toast.success("Contact enrolled in Smart Plan");
      setSelectedPlanId("");
      utils.smartPlans.enrollments.list.invalidate({ contactId });
      utils.smartPlans.executions.list.invalidate({ contactId });
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelMutation = trpc.smartPlans.enrollments.cancel.useMutation({
    onSuccess: () => {
      toast.success("Enrollment cancelled");
      utils.smartPlans.enrollments.list.invalidate({ contactId });
    },
    onError: (e) => toast.error(e.message),
  });

  const enrollmentList = enrollments as any[];
  const executionList = executions as any[];
  const plansList = allPlans as any[];

  // Plans not already enrolled (active)
  const activeEnrollmentPlanIds = new Set(
    enrollmentList
      .filter((e) => e.enrollment.status === "active")
      .map((e) => e.enrollment.planId)
  );
  const availablePlans = plansList.filter(
    (p: any) => p.plan.status === "active" && !activeEnrollmentPlanIds.has(p.plan.id)
  );

  if (loadingEnrollments || loadingExecutions) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Loading Smart Plans...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Manual enroll (admin + ISA) */}
      {canEnroll && availablePlans.length > 0 && (
        <div className="flex gap-2 items-center">
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger className="flex-1 max-w-xs">
              <SelectValue placeholder="Manually enroll in a plan..." />
            </SelectTrigger>
            <SelectContent>
              {availablePlans.map((p: any) => (
                <SelectItem key={p.plan.id} value={p.plan.id.toString()}>
                  {p.plan.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedPlanId || manualEnrollMutation.isPending}
            onClick={() =>
              manualEnrollMutation.mutate({
                planId: parseInt(selectedPlanId),
                contactId,
              })
            }
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Enroll
          </Button>
        </div>
      )}

      {/* Active / past enrollments */}
      {enrollmentList.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">This contact is not enrolled in any Smart Plans.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {enrollmentList.map((row: any) => {
            const enroll = row.enrollment;
            const plan = row.plan;
            const relatedExecutions = executionList.filter(
              (ex: any) => ex.enrollment.id === enroll.id
            );

            return (
              <Card key={enroll.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Plan header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-sm">{plan.name}</span>
                        <Badge
                          variant={
                            enroll.status === "active"
                              ? "default"
                              : enroll.status === "completed"
                              ? "secondary"
                              : "destructive"
                          }
                          className="text-xs capitalize"
                        >
                          {enroll.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Enrolled {safeFormat(enroll.enrolledAt, "MMM d, yyyy")}
                        {enroll.nextStepAt && enroll.status === "active" && (
                          <> · Next step: {safeFormat(enroll.nextStepAt, "MMM d, yyyy h:mm a")}</>
                        )}
                        {enroll.completedAt && (
                          <> · Completed {safeFormat(enroll.completedAt, "MMM d, yyyy")}</>
                        )}
                      </p>
                    </div>
                    {canEnroll && enroll.status === "active" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7 text-xs shrink-0"
                        onClick={() => cancelMutation.mutate({ enrollmentId: enroll.id })}
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>

                  {/* Execution history for this enrollment */}
                  {relatedExecutions.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Messages Sent
                      </p>
                      {relatedExecutions.map((ex: any) => (
                        <div key={ex.execution.id} className="flex items-start gap-2 text-sm">
                          <div className="mt-0.5 shrink-0">
                            {STATUS_ICON[ex.execution.status as keyof typeof STATUS_ICON]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {ex.execution.channel === "email" ? (
                                <Mail className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className="text-xs font-medium capitalize">{ex.execution.channel}</span>
                              <span className="text-xs text-muted-foreground">
                                — Step {(ex.step?.stepOrder ?? 0) + 1}
                              </span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {safeFormat(ex.execution.sentAt, "MMM d, yyyy h:mm a")}
                              </span>
                            </div>
                            {ex.execution.status === "failed" && ex.execution.errorMessage && (
                              <p className="text-xs text-red-500 mt-0.5">{ex.execution.errorMessage}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
