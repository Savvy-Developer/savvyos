import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  CalendarDays,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Edit2,
  Loader2,
  Zap,
  TrendingUp,
  Activity,
  DollarSign,
  Users,
  RefreshCw,
  ChevronRight,
  FileText,
  BarChart3,
  Brain,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { safeFormat } from "@/lib/safeFormat";
import { toast } from "sonner";
import CoachingSessionList from "@/components/coaching/CoachingSessionList";
import CoachingCommitmentsPanel from "@/components/coaching/CoachingCommitmentsPanel";
import CoachingAssessmentsPanel from "@/components/coaching/CoachingAssessmentsPanel";
import CoachingPerformanceResetPanel from "@/components/coaching/CoachingPerformanceResetPanel";
import CoachingProfileEditDialog from "@/components/coaching/CoachingProfileEditDialog";

const PERF_STATUS_COLORS: Record<string, string> = {
  Launch: "bg-blue-100 text-blue-800 border-blue-200",
  Red: "bg-red-100 text-red-800 border-red-200",
  Yellow: "bg-amber-100 text-amber-800 border-amber-200",
  Green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Elite: "bg-violet-100 text-violet-800 border-violet-200",
};

const RETENTION_RISK_COLORS: Record<string, string> = {
  Low: "bg-emerald-100 text-emerald-700",
  Watch: "bg-amber-100 text-amber-700",
  Elevated: "bg-orange-100 text-orange-700",
  Critical: "bg-red-100 text-red-700",
};

function MetricCard({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`shrink-0 rounded-lg p-2 ${tones[tone]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function currency(v: number | null | undefined) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(v ?? 0));
}

export default function CoachingAgentPage() {
  const { id } = useParams<{ id: string }>();
  const agentId = Number(id);
  const [, navigate] = useLocation();
  const [editOpen, setEditOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.coaching.getProfile.useQuery({ agentId });

  const createSession = trpc.coaching.createSession.useMutation({
    onSuccess: () => {
      toast.success("Session created");
      utils.coaching.getProfile.invalidate({ agentId });
      utils.coaching.listSessions.invalidate();
      setNewSessionOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
        <p>Agent coaching profile not found.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => navigate("/coaching")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Coaching Hub
        </Button>
      </div>
    );
  }

  const { profile, agent, coach, nextCoach, prodStats, recentSessions, openCommitments, activeReset } = data as any;

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
      {/* Back + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/coaching")} className="-ml-2 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{agent?.name ?? "Agent"}</h1>
            <p className="text-sm text-muted-foreground">{agent?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit Profile
          </Button>
          <Button size="sm" onClick={() => setNewSessionOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Session
          </Button>
        </div>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2 items-center">
        {profile?.performanceStatus && (
          <Badge className={`border ${PERF_STATUS_COLORS[profile.performanceStatus] ?? ""}`} variant="outline">
            <Zap className="h-3 w-3 mr-1" />
            {profile.performanceStatus}
          </Badge>
        )}
        {profile?.retentionRiskStatus && (
          <Badge className={RETENTION_RISK_COLORS[profile.retentionRiskStatus] ?? ""} variant="secondary">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {profile.retentionRiskStatus} Risk
          </Badge>
        )}
        {profile?.currentPrimaryDiagnosis && (
          <Badge variant="outline" className="text-muted-foreground">
            <Brain className="h-3 w-3 mr-1" />
            {profile.currentPrimaryDiagnosis}
          </Badge>
        )}
        {profile?.marketProtectionStatus && (
          <Badge variant="outline" className="text-muted-foreground">
            {profile.marketProtectionStatus}
          </Badge>
        )}
        {activeReset && (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200" variant="outline">
            <RefreshCw className="h-3 w-3 mr-1" />
            Performance Reset: {activeReset.status}
          </Badge>
        )}
        {profile?.coachingSetupRequired && (
          <Badge variant="destructive" className="text-xs">Setup Required</Badge>
        )}
      </div>

      {/* Coach Info + Next Session */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Coach of Record</p>
            <p className="font-semibold">{coach?.name ?? <span className="text-muted-foreground italic">Unassigned</span>}</p>
            {coach?.email && <p className="text-xs text-muted-foreground">{coach.email}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Next Session</p>
            <p className="font-semibold">
              {profile?.nextSessionDate
                ? safeFormat(profile.nextSessionDate, "MMMM d, yyyy")
                : <span className="text-muted-foreground italic">Not scheduled</span>}
            </p>
            {nextCoach?.name && <p className="text-xs text-muted-foreground">with {nextCoach.name}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Development Priority</p>
            <p className="font-semibold text-sm">
              {profile?.currentDevelopmentPriority ?? <span className="text-muted-foreground italic">Not set</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Production Stats */}
      {prodStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Closed Transactions"
            value={String(prodStats.closedTransactions ?? 0)}
            sub="all time"
            icon={CheckCircle2}
            tone="green"
          />
          <MetricCard
            label="Total GCI"
            value={currency(prodStats.totalGci)}
            sub="all time"
            icon={DollarSign}
            tone="green"
          />
          <MetricCard
            label="Active Contacts"
            value={String(prodStats.activeContacts ?? 0)}
            icon={Users}
            tone="blue"
          />
          <MetricCard
            label="Open Tasks"
            value={String(prodStats.openTasks ?? 0)}
            icon={ClipboardList}
            tone={Number(prodStats.openTasks) > 5 ? "amber" : "default"}
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="commitments">
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Commitments
            {openCommitments?.length > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 text-xs px-1 bg-amber-500 text-white">{openCommitments.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="assessments">
            <Brain className="h-4 w-4 mr-1.5" />
            Assessments
          </TabsTrigger>
          <TabsTrigger value="performance-reset">
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Performance Reset
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-4">
          <CoachingSessionList agentId={agentId} agentName={agent?.name} />
        </TabsContent>

        <TabsContent value="commitments" className="mt-4">
          <CoachingCommitmentsPanel agentId={agentId} />
        </TabsContent>

        <TabsContent value="assessments" className="mt-4">
          <CoachingAssessmentsPanel agentId={agentId} agentName={agent?.name} />
        </TabsContent>

        <TabsContent value="performance-reset" className="mt-4">
          <CoachingPerformanceResetPanel agentId={agentId} agentName={agent?.name} activeReset={activeReset} />
        </TabsContent>
      </Tabs>

      {/* Edit Profile Dialog */}
      {editOpen && (
        <CoachingProfileEditDialog
          agentId={agentId}
          profile={profile}
          coaches={[]}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            utils.coaching.getProfile.invalidate({ agentId });
            setEditOpen(false);
          }}
        />
      )}

      {/* New Session Dialog */}
      {newSessionOpen && (
        <NewSessionDialog
          agentId={agentId}
          agentName={agent?.name}
          open={newSessionOpen}
          onClose={() => setNewSessionOpen(false)}
          onSave={(data: any) => createSession.mutate(data)}
          saving={createSession.isPending}
        />
      )}
    </div>
  );
}

// ─── New Session Dialog ───────────────────────────────────────────────────────
function NewSessionDialog({
  agentId,
  agentName,
  open,
  onClose,
  onSave,
  saving,
}: {
  agentId: number;
  agentName?: string;
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const { data: coaches } = trpc.coaching.listCoaches.useQuery();
  const [form, setForm] = useState({
    agentId,
    sessionDate: "",
    sessionType: "Standard COACH",
    scheduledCoachId: "",
    meetingLink: "",
    reasonForSession: "",
  });

  function handleSave() {
    if (!form.sessionDate) { toast.error("Session date is required"); return; }
    onSave({
      agentId: form.agentId,
      sessionDate: form.sessionDate,
      sessionType: form.sessionType,
      scheduledCoachId: form.scheduledCoachId ? Number(form.scheduledCoachId) : undefined,
      meetingLink: form.meetingLink || undefined,
      reasonForSession: form.reasonForSession || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Coaching Session — {agentName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Session Date *</Label>
              <Input
                type="datetime-local"
                value={form.sessionDate}
                onChange={(e) => setForm(f => ({ ...f, sessionDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Session Type</Label>
              <Select value={form.sessionType} onValueChange={(v) => setForm(f => ({ ...f, sessionType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Standard COACH", "Launch Check-In", "Performance Reset", "Accountability Call", "Strategy Session", "Onboarding", "Exit Interview"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Coach</Label>
              <Select value={form.scheduledCoachId} onValueChange={(v) => setForm(f => ({ ...f, scheduledCoachId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select coach" /></SelectTrigger>
                <SelectContent>
                  {(coaches ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Meeting Link</Label>
              <Input
                type="url"
                placeholder="https://zoom.us/..."
                value={form.meetingLink}
                onChange={(e) => setForm(f => ({ ...f, meetingLink: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason / Agenda</Label>
            <Textarea
              placeholder="Agenda, focus areas, context..."
              value={form.reasonForSession}
              onChange={(e) => setForm(f => ({ ...f, reasonForSession: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
