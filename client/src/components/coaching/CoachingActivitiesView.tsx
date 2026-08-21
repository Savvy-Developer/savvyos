import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Filter,
  History,
  Loader2,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";
import { safeFormatET } from "@/lib/safeFormat";

const ACTION_LABELS: Record<string, string> = {
  coaching_agent_opened: "Opened agent workspace",
  coaching_upsertProfile: "Updated coaching profile",
  coaching_toggleCoachingEnrollment: "Changed Coaching Hub enrollment",
  coaching_generateCommandCenterBrief: "Generated Command Center brief",
  coaching_generatePreSessionBrief: "Generated pre-session brief",
  coaching_startSession: "Started coaching session",
  coaching_completeSession: "Completed coaching session",
  coaching_updateSession: "Updated coaching session",
  coaching_profile_updated: "Updated coaching profile",
  coaching_pre_session_brief_generated: "Generated pre-session brief",
  coaching_session_created: "Scheduled coaching session",
  coaching_session_started: "Started coaching session",
  coaching_session_completed: "Completed coaching session",
  coaching_session_updated: "Updated coaching session",
  coaching_session_summary_approved: "Approved session summary",
  coaching_session_summary_generated: "Generated session summary",
  coaching_assessment_summary_generated: "Generated assessment summary",
  coaching_commitment_created: "Created commitment",
  coaching_commitment_updated: "Updated commitment",
  coaching_commitment_ai_approved: "Approved AI-suggested commitment",
  coaching_commitment_ai_dismissed: "Dismissed AI-suggested commitment",
  coaching_commitment_deleted: "Deleted commitment",
  coaching_performance_reset_created: "Created performance reset",
  coaching_performance_reset_updated: "Updated performance reset",
  coaching_reset_requirement_updated: "Updated reset requirement",
  coaching_reset_checkpoint_updated: "Updated reset checkpoint",
  coaching_escalation_created: "Created escalation",
  coaching_escalation_updated: "Updated escalation",
  coaching_coach_out_created: "Created coach-out recommendation",
  coaching_coach_out_updated: "Updated coach-out recommendation",
  coaching_assessment_created: "Added assessment",
  coaching_assessment_updated: "Updated assessment",
  coaching_setting_updated: "Updated Coaching Hub setting",
  coaching_agent_enrolled: "Enrolled agent in Coaching Hub",
  coaching_agent_unenrolled: "Removed agent from Coaching Hub",
  performance_reset_created: "Created performance reset",
  coach_out_recommendation_created: "Created coach-out recommendation",
};

function isoDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function activityLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/^coaching_/, "").replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
}

function activityDetail(activity: any) {
  const details = (activity.details ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(details.updatedFields) ? details.updatedFields : [];
  if (fields.length > 0) return `Fields: ${fields.map(field => String(field).replaceAll(/([A-Z])/g, " $1").toLowerCase()).join(", ")}`;
  if (typeof details.sessionType === "string") return `Session type: ${details.sessionType}`;
  if (typeof details.assessmentType === "string") return `Assessment: ${details.assessmentType}`;
  if (typeof details.issueCategory === "string") return `Category: ${details.issueCategory}`;
  if (typeof details.urgency === "string") return `Urgency: ${details.urgency}`;
  if (typeof details.status === "string") return `Status: ${details.status}`;
  if (typeof details.diagnosis === "string") return `Diagnosis: ${details.diagnosis}`;
  return "—";
}

export default function CoachingActivitiesView() {
  const [, navigate] = useLocation();
  const [dateFrom, setDateFrom] = useState(() => isoDateOffset(30));
  const [dateTo, setDateTo] = useState(() => isoDateOffset(0));
  const [agentId, setAgentId] = useState("all");
  const [userId, setUserId] = useState("all");
  const [action, setAction] = useState("all");

  const queryInput = useMemo(() => ({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    agentId: agentId !== "all" ? Number(agentId) : undefined,
    userId: userId !== "all" ? Number(userId) : undefined,
    action: action !== "all" ? action : undefined,
    limit: 100,
  }), [action, agentId, dateFrom, dateTo, userId]);
  const { data: agents } = trpc.coaching.listAllAgents.useQuery();
  const { data, isLoading, refetch, isFetching } = trpc.coaching.listActivities.useQuery(queryInput);
  const rows = data?.rows ?? [];

  const resetFilters = () => {
    setDateFrom(isoDateOffset(30));
    setDateTo(isoDateOffset(0));
    setAgentId("all");
    setUserId("all");
    setAction("all");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" />Coaching Activities</h2>
          <p className="mt-1 text-sm text-muted-foreground">A filterable audit trail of agent workspaces opened and actions completed in Coaching Hub.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{data?.total ?? 0} matching activit{(data?.total ?? 0) === 1 ? "y" : "ies"}</span>
          <Button variant="outline" size="sm" className="h-8" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm"><Filter className="h-4 w-4" />Filter activity</CardTitle>
          <CardDescription className="text-xs">The user list is limited to people with recorded Coaching Hub activity in the selected date range.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium">From</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input type="date" className="h-9 w-[160px] pl-8 text-xs" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">To</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input type="date" className="h-9 w-[160px] pl-8 text-xs" value={dateTo} onChange={event => setDateTo(event.target.value)} />
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Agent</span>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue placeholder="All coaching agents" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All coaching agents</SelectItem>
                {(agents ?? []).filter((agent: any) => agent.hasCoachingProfile).map((agent: any) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name ?? agent.email ?? "Unknown agent"}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">User</span>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue placeholder="All active users" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active users</SelectItem>
                {(data?.actors ?? []).map((actor: any) => <SelectItem key={actor.id} value={String(actor.id)}>{actor.name ?? actor.email ?? "Unknown user"}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Activity type</span>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-9 w-[240px] text-xs"><SelectValue placeholder="All activity types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All activity types</SelectItem>
                {(data?.actionTypes ?? []).map((type: string) => <SelectItem key={type} value={type}>{activityLabel(type)}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <Button variant="ghost" size="sm" className="h-9" onClick={resetFilters}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Reset</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Activity className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm font-medium">No coaching activity matches these filters</p>
              <p className="mt-1 text-xs">Adjust the date range or select a different user or activity type.</p>
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((row: any) => {
                const agent = row.agent;
                return (
                  <div key={row.activity.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Activity className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-medium">{activityLabel(row.activity.action)}</p>
                        <Badge variant="outline" className="text-[10px]">{row.actor?.name ?? row.actor?.email ?? "System"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{activityDetail(row.activity)}</p>
                    </div>
                    <div className="flex items-center gap-3 sm:justify-end">
                      <p className="text-xs text-muted-foreground">{safeFormatET(row.activity.createdAt)}</p>
                      {agent?.id ? (
                        <button type="button" onClick={() => navigate(`/coaching/agent/${agent.id}`)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
                          <UserRound className="h-3.5 w-3.5" />{agent.name ?? "Open agent"}<ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />No agent</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
