import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Settings, Save, CheckCircle2 } from "lucide-react";
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
    description: "Configure performance reset plan defaults",
    settings: [
      { key: "reset_default_duration", label: "Default Duration (days)", type: "number", description: "Default length of a performance reset plan", defaultValue: "30" },
      { key: "reset_checkpoint_frequency", label: "Checkpoint Frequency (days)", type: "number", description: "Days between scheduled checkpoints", defaultValue: "7" },
      { key: "reset_coaching_cadence", label: "Reset Coaching Cadence (days)", type: "number", description: "Maximum days between sessions during a reset", defaultValue: "7" },
      { key: "reset_day14_checkpoint", label: "Day-14 Checkpoint Required", type: "toggle", description: "Require a formal checkpoint at day 14", defaultValue: "true" },
      { key: "reset_day30_decision", label: "Day-30 Decision Required", type: "toggle", description: "Require a formal decision at day 30", defaultValue: "true" },
    ],
  },
  {
    title: "Pipeline & Benchmarks",
    description: "Pipeline coverage ratios and lead aging thresholds",
    settings: [
      { key: "pipeline_coverage_ratio", label: "Pipeline Coverage Ratio", type: "number", description: "Required pipeline-to-goal ratio (e.g. 3 = 3x coverage)", defaultValue: "3" },
      { key: "lead_aging_warning_days", label: "Lead Aging Warning (days)", type: "number", description: "Days before a lead is flagged as aging", defaultValue: "14" },
      { key: "task_overdue_warning_days", label: "Task Overdue Warning (days)", type: "number", description: "Days overdue before a task triggers a warning", defaultValue: "3" },
      { key: "termination_rate_warning", label: "Termination Rate Warning (%)", type: "number", description: "Termination rate threshold for warning", defaultValue: "20" },
    ],
  },
  {
    title: "Commitment Settings",
    description: "Configure commitment tracking behavior",
    settings: [
      { key: "commitment_overdue_threshold", label: "Overdue Alert (days past due)", type: "number", description: "Days past due before a commitment triggers an alert", defaultValue: "1" },
      { key: "max_commitments_per_session", label: "Max Commitments Per Session", type: "number", description: "Recommended maximum commitments from a single session", defaultValue: "3" },
      { key: "commitment_vague_detection", label: "Vague Commitment Detection", type: "toggle", description: "AI warns when commitments are vague (e.g. 'work harder')", defaultValue: "true" },
    ],
  },
  {
    title: "Retention & Coaching",
    description: "Productive-agent retention and coach workload",
    settings: [
      { key: "retention_stay_conversation_cadence", label: "Stay Conversation Cadence (days)", type: "number", description: "Maximum days between stay conversations for productive agents", defaultValue: "90" },
      { key: "coach_max_portfolio_size", label: "Coach Max Portfolio Size", type: "number", description: "Recommended maximum agents per coach", defaultValue: "25" },
      { key: "coach_max_weekly_sessions", label: "Coach Max Weekly Sessions", type: "number", description: "Recommended maximum sessions per coach per week", defaultValue: "20" },
    ],
  },
  {
    title: "AI Configuration",
    description: "Configure AI-powered coaching features",
    settings: [
      { key: "ai_auto_extract_commitments", label: "Auto-Extract Commitments", type: "toggle", description: "Automatically extract commitments from session summaries", defaultValue: "true" },
      { key: "ai_auto_generate_brief", label: "Auto-Generate Pre-Session Brief", type: "toggle", description: "Automatically generate pre-session brief when session is created", defaultValue: "false" },
      { key: "ai_model_preference", label: "AI Model Preference", type: "text", description: "Preferred LLM model for coaching AI features", defaultValue: "gpt-4o" },
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5" />Coaching Hub Settings</h2>
      </div>

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
