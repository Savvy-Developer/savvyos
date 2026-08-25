import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Settings, Save, Users, Search, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";

interface SettingGroup {
  title: string;
  description: string;
  settings: SettingDef[];
}

interface SettingDef {
  key: string;
  label: string;
  type: "number" | "text" | "toggle" | "textarea";
  description: string;
  defaultValue?: string;
}

const SETTING_GROUPS: SettingGroup[] = [
  {
    title: "Performance Bands",
    description: "Define closed-unit thresholds for each performance status (trailing 90 days)",
    settings: [
      { key: "band_red_max", label: "Red: fewer than (units)", type: "number", description: "Agents below this are Red", defaultValue: "3" },
      { key: "band_yellow_min", label: "Yellow: minimum (units)", type: "number", description: "Yellow lower bound", defaultValue: "3" },
      { key: "band_yellow_max", label: "Yellow: maximum (units)", type: "number", description: "Yellow upper bound", defaultValue: "5" },
      { key: "band_green_min", label: "Green: minimum (units)", type: "number", description: "Green lower bound", defaultValue: "6" },
      { key: "band_green_max", label: "Green: maximum (units)", type: "number", description: "Green upper bound", defaultValue: "11" },
      { key: "band_elite_min", label: "Elite: minimum (units)", type: "number", description: "Agents at or above this are Elite", defaultValue: "12" },
    ],
  },
  {
    title: "Launch & Onboarding",
    description: "Configure new-agent launch period and milestones",
    settings: [
      { key: "launch_duration_days", label: "Launch Duration (days)", type: "number", description: "Days before a new agent exits Launch status", defaultValue: "90" },
      { key: "launch_coaching_cadence", label: "Launch Coaching Cadence (days)", type: "number", description: "Maximum days between sessions for Launch agents", defaultValue: "7" },
      { key: "launch_30day_milestone", label: "30-Day Milestone", type: "text", description: "Expected milestone at 30 days", defaultValue: "First consultation completed" },
      { key: "launch_60day_milestone", label: "60-Day Milestone", type: "text", description: "Expected milestone at 60 days", defaultValue: "First offer submitted" },
      { key: "launch_90day_milestone", label: "90-Day Milestone", type: "text", description: "Expected milestone at 90 days", defaultValue: "First closing or under-contract" },
    ],
  },
  {
    title: "Session Cadence",
    description: "Maximum days between coaching sessions by performance status",
    settings: [
      { key: "session_cadence_red", label: "Red (days)", type: "number", description: "Maximum days between sessions for Red agents", defaultValue: "7" },
      { key: "session_cadence_yellow", label: "Yellow (days)", type: "number", description: "Maximum days between sessions for Yellow agents", defaultValue: "14" },
      { key: "session_cadence_green", label: "Green (days)", type: "number", description: "Maximum days between sessions for Green agents", defaultValue: "14" },
      { key: "session_cadence_elite", label: "Elite (days)", type: "number", description: "Maximum days between sessions for Elite agents", defaultValue: "21" },
      { key: "session_cadence_launch", label: "Launch (days)", type: "number", description: "Maximum days between sessions for Launch agents", defaultValue: "7" },
    ],
  },
  {
    title: "Performance Reset",
    description: "Configure performance reset (PIP) parameters",
    settings: [
      { key: "reset_duration_days", label: "Reset Duration (days)", type: "number", description: "Standard duration of a performance reset", defaultValue: "30" },
      { key: "reset_auto_trigger", label: "Auto-Trigger After (days in Red)", type: "number", description: "Days in Red before auto-suggesting a reset", defaultValue: "30" },
    ],
  },
  {
    title: "Pipeline & Lead Aging",
    description: "Configure lead aging thresholds for pipeline health indicators",
    settings: [
      { key: "lead_stale_days", label: "Stale Lead Threshold (days)", type: "number", description: "Days without activity before a lead is considered stale", defaultValue: "21" },
      { key: "pipeline_min_active", label: "Minimum Active Leads", type: "number", description: "Minimum active leads expected per agent", defaultValue: "5" },
    ],
  },
  {
    title: "Commitment Tracking",
    description: "Configure commitment follow-up and accountability rules",
    settings: [
      { key: "commitment_default_due_days", label: "Default Due (days)", type: "number", description: "Default days until commitment is due if not specified", defaultValue: "7" },
      { key: "commitment_overdue_escalation_days", label: "Escalation After (days overdue)", type: "number", description: "Days overdue before commitment escalates", defaultValue: "3" },
      { key: "commitment_repeat_threshold", label: "Repeat Threshold", type: "number", description: "Times a commitment can be missed before flagging pattern", defaultValue: "3" },
    ],
  },
  {
    title: "Retention Risk",
    description: "Configure retention risk scoring parameters",
    settings: [
      { key: "retention_engagement_weight", label: "Engagement Weight (%)", type: "number", description: "Weight of engagement metrics in risk score", defaultValue: "30" },
      { key: "retention_production_weight", label: "Production Weight (%)", type: "number", description: "Weight of production metrics in risk score", defaultValue: "40" },
      { key: "retention_commitment_weight", label: "Commitment Weight (%)", type: "number", description: "Weight of commitment completion in risk score", defaultValue: "30" },
    ],
  },
  {
    title: "AI Configuration",
    description: "Configure AI-powered coaching features",
    settings: [
      { key: "ai_auto_extract_commitments", label: "Auto-Extract Commitments", type: "toggle", description: "Automatically extract commitments from session summaries", defaultValue: "true" },
      { key: "ai_auto_generate_brief", label: "Auto-Generate Pre-Session Brief", type: "toggle", description: "Automatically generate pre-session brief when session is created", defaultValue: "false" },
      { key: "ai_model_preference", label: "AI Model Preference", type: "text", description: "Preferred LLM model for coaching AI features", defaultValue: "gpt-5-mini" },
      { key: "ai_summary_style", label: "Summary Style", type: "text", description: "Style preference for AI summaries (concise, detailed, narrative)", defaultValue: "concise" },
    ],
  },
  {
    title: "Coaching Philosophy",
    description: "Custom context injected into all AI prompts to align with your coaching methodology",
    settings: [
      { key: "coaching_philosophy_prompt", label: "Coaching Philosophy Context", type: "textarea", description: "This text is included in every AI prompt to ensure summaries, insights, and recommendations align with your coaching approach.", defaultValue: "" },
      { key: "coaching_methodology_notes", label: "Methodology Notes", type: "textarea", description: "Internal notes about your coaching methodology for reference.", defaultValue: "" },
    ],
  },
];

export default function CoachingSettingsView() {
  const { data: settings, isLoading, refetch } = trpc.coaching.getSettings.useQuery();
  const upsertSetting = trpc.coaching.upsertSetting.useMutation({
    onSuccess: () => { refetch(); toast.success("Setting saved"); },
    onError: (e) => toast.error(e.message),
  });

  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings && Array.isArray(settings)) {
      const map: Record<string, string> = {};
      settings.forEach((s: any) => { map[s.settingKey] = s.settingValue ?? ""; });
      // Apply defaults for missing keys
      SETTING_GROUPS.forEach(g => g.settings.forEach(s => {
        if (!map[s.key] && s.defaultValue) map[s.key] = s.defaultValue;
      }));
      setLocalSettings(map);
    }
  }, [settings]);

  const handleSave = (key: string) => {
    upsertSetting.mutate({ settingKey: key, settingValue: localSettings[key] ?? "" });
  };

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" />Coaching Hub Settings</h2>
      </div>

      {/* Agent Enrollment Panel */}
      <AgentEnrollmentPanel />

      {/* Settings Groups */}
      <div className="grid gap-4 lg:grid-cols-2">
        {SETTING_GROUPS.map((group) => {
          const hasTextarea = group.settings.some(s => s.type === "textarea");
          return (
            <Card key={group.title} className={hasTextarea ? "lg:col-span-2" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{group.title}</CardTitle>
                <CardDescription className="text-xs">{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.settings.map((def) => {
                  if (def.type === "toggle") {
                    return (
                      <div key={def.key} className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <Label className="text-xs font-medium">{def.label}</Label>
                          <p className="text-[10px] text-muted-foreground">{def.description}</p>
                        </div>
                        <Switch
                          checked={localSettings[def.key] === "true"}
                          onCheckedChange={(checked) => {
                            const val = checked ? "true" : "false";
                            setLocalSettings({ ...localSettings, [def.key]: val });
                            upsertSetting.mutate({ settingKey: def.key, settingValue: val });
                          }}
                        />
                      </div>
                    );
                  }
                  if (def.type === "textarea") {
                    return (
                      <div key={def.key} className="space-y-1.5">
                        <Label className="text-xs font-medium">{def.label}</Label>
                        <p className="text-[10px] text-muted-foreground">{def.description}</p>
                        <Textarea
                          rows={5}
                          className="text-xs"
                          value={localSettings[def.key] ?? ""}
                          onChange={(e) => setLocalSettings({ ...localSettings, [def.key]: e.target.value })}
                          placeholder="Enter coaching context..."
                        />
                        <Button size="sm" onClick={() => handleSave(def.key)} disabled={upsertSetting.isPending}>
                          <Save className="h-3.5 w-3.5 mr-1" />Save
                        </Button>
                      </div>
                    );
                  }
                  return (
                    <div key={def.key} className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <Label className="text-xs font-medium">{def.label}</Label>
                        <p className="text-[10px] text-muted-foreground">{def.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type={def.type === "number" ? "number" : "text"}
                          className="w-24 h-8 text-xs"
                          value={localSettings[def.key] ?? ""}
                          onChange={(e) => setLocalSettings({ ...localSettings, [def.key]: e.target.value })}
                        />
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleSave(def.key)} disabled={upsertSetting.isPending}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Agent Enrollment Panel - toggle agents in/out of coaching */
function AgentEnrollmentPanel() {
  const { data: agents, isLoading, refetch } = trpc.coaching.listAllAgents.useQuery();
  const { data: coaches } = trpc.coaching.listCoaches.useQuery();
  const toggleEnrollment = trpc.coaching.toggleCoachingEnrollment.useMutation({
    onSuccess: () => { refetch(); toast.success("Enrollment updated"); },
    onError: (e) => toast.error(e.message),
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "enrolled" | "not-enrolled">("all");

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    let list = [...agents] as any[];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      list = list.filter((a: any) => a.name?.toLowerCase().includes(lower) || a.email?.toLowerCase().includes(lower));
    }
    if (filterStatus === "enrolled") list = list.filter((a: any) => a.hasCoachingProfile);
    if (filterStatus === "not-enrolled") list = list.filter((a: any) => !a.hasCoachingProfile);
    return list;
  }, [agents, searchTerm, filterStatus]);

  const enrolledCount = (agents ?? []).filter((a: any) => a.hasCoachingProfile).length;
  const totalCount = (agents ?? []).length;

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Agent Coaching Enrollment</CardTitle>
            <CardDescription className="text-xs mt-1">
              Select which agents are included in the coaching program. Agents without a coaching profile will not appear in the portfolio or session scheduling.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <UserCheck className="h-3 w-3 mr-1" />{enrolledCount} enrolled
            </Badge>
            <Badge variant="outline" className="text-xs">
              <UserX className="h-3 w-3 mr-1" />{totalCount - enrolledCount} not enrolled
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
            <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents ({totalCount})</SelectItem>
              <SelectItem value="enrolled">Enrolled ({enrolledCount})</SelectItem>
              <SelectItem value="not-enrolled">Not Enrolled ({totalCount - enrolledCount})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Agent List */}
        <div className="border rounded-md max-h-[400px] overflow-y-auto">
          {filteredAgents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">No agents match the filter</div>
          ) : (
            <div className="divide-y">
              {filteredAgents.map((agent: any) => {
                const coachName = coaches?.find((c: any) => c.id === agent.coachOfRecordId)?.name;
                return (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={!!agent.hasCoachingProfile}
                        onCheckedChange={(checked) => {
                          toggleEnrollment.mutate({ agentId: agent.id, enrolled: !!checked });
                        }}
                        disabled={toggleEnrollment.isPending}
                      />
                      <div>
                        <p className="text-xs font-medium">{agent.name ?? "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground">{agent.email ?? ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {coachName && (
                        <span className="text-[10px] text-muted-foreground">Coach: {coachName}</span>
                      )}
                      {agent.hasCoachingProfile ? (
                        <Badge variant="secondary" className="text-[9px] px-1.5">Enrolled</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] px-1.5 text-muted-foreground">Not Enrolled</Badge>
                      )}
                      {!agent.isActive && (
                        <Badge variant="destructive" className="text-[9px] px-1.5">Inactive</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
