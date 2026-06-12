import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Phone, PhoneOff, Search, Sparkles, ChevronRight, ChevronDown, ChevronUp,
  MapPin, TrendingUp, DollarSign, Star, AlertTriangle, CheckCircle2,
  Lightbulb, MessageSquare, User, Clock, BarChart3, ArrowRight,
  Copy, RefreshCw, X, Info, Target, Zap, Shield, Home, Loader2,
  History, Mail, Send, UserCheck,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvestorProfile = {
  purchaseTimeline?: string;
  budgetRange?: string;
  budgetMin?: number;
  budgetMax?: number;
  financingType?: string;
  cashFlowImportance?: number;
  appreciationImportance?: number;
  taxStrategyImportance?: number;
  personalUseInterest?: number;
  managementPreference?: string;
  remoteOwnershipComfort?: number;
  propertyType?: string;
  bedroomsMin?: number;
  bedroomsMax?: number;
  desiredAmenities?: string[];
  willingToRenovate?: boolean;
  openToUniqueConceptProperties?: boolean;
  regulationRiskTolerance?: string;
  managementComplexityTolerance?: string;
  geographicPreferences?: string[];
  vibePreferences?: string[];
  coastPreference?: string;
  seasonalityPreference?: string;
  strExperienceLevel?: string;
  ownershipGoal?: string;
  primaryMotivation?: string;
  targetCashOnCash?: number;
  riskTolerance?: string;
  easeVsUpside?: string;
};

type MarketRec = {
  marketName: string;
  fitScore: number;
  confidenceScore: number;
  shortExplanation: string;
  whyItFits: string;
  whyItMayNotFit: string;
  bestTalkingPoints: string[];
  likelyObjections: string[];
  suggestedAgentNote: string;
  label: string;
};

type AIResult = {
  recommendations: MarketRec[];
  coachingTips: string[];
  missingInfo: string[];
  overallConfidence: number;
  aiInferences: { field: string; inferredValue: string; confidence: string; reasoning: string }[];
};

// ─── Helper components ────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color = "primary" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const colorClass = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right">{value}</span>
    </div>
  );
}

function LabelBadge({ label }: { label: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    top_pick: { text: "Top Pick", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    safe_easy: { text: "Safe & Easy", cls: "bg-blue-100 text-blue-700 border-blue-200" },
    stretch_upside: { text: "Stretch / Upside", cls: "bg-purple-100 text-purple-700 border-purple-200" },
    standard: { text: "Good Fit", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  };
  const m = map[label] ?? map.standard;
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${m.cls}`}>{m.text}</span>;
}

function ConfidenceBadge({ score }: { score: number }) {
  const cls = score >= 75 ? "bg-emerald-100 text-emerald-700" : score >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{score}% confidence</span>;
}

function PrioritySlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value ?? 3}/5</span>
      </div>
      <Slider
        min={1} max={5} step={1}
        value={[value ?? 3]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

// ─── Phase 1: Contact Search ──────────────────────────────────────────────────

function ContactSearchScreen({ onStart }: { onStart: (contactId: number, contactName: string) => void }) {
  const [search, setSearch] = useState("");
  const { data: contacts, isLoading } = trpc.contacts.list.useQuery(
    { search, limit: 10 },
    { enabled: search.length >= 2 }
  );
  const rows = contacts?.rows ?? [];
  const startSession = trpc.marketMatch.startSession.useMutation({
    onSuccess: (data) => {
      const name = `${data.contact.firstName} ${data.contact.lastName}`;
      onStart(data.contact.id, name);
      toast.success(`Started Market Match Call with ${name}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-2">
            <Phone className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-white">Market Match Call</h1>
          <p className="text-slate-400">AI-powered live call workspace for STR investor discovery</p>
        </div>

        {/* Search */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Search for a contact to start the call</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by name, email, or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Results */}
            {isLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}
            {rows.length > 0 && (
              <div className="space-y-2">
                {rows.map(({ contact: c }) => (
                  <button
                    key={c.id}
                    onClick={() => startSession.mutate({ contactId: c.id })}
                    disabled={startSession.isPending}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-primary/50 transition-all text-left group"
                  >
                    <div>
                      <p className="font-semibold text-white">{c.firstName} {c.lastName}</p>
                      <p className="text-xs text-slate-400">{c.email ?? c.phone ?? "No contact info"}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            )}
            {search.length >= 2 && !isLoading && rows.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-2">No contacts found for "{search}"</p>
            )}
            {search.length < 2 && (
              <p className="text-xs text-slate-500 text-center">Type at least 2 characters to search</p>
            )}
          </CardContent>
        </Card>

        {/* Tips */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Sparkles, text: "AI market matching" },
            { icon: Target, text: "Live coaching tips" },
            { icon: Zap, text: "Auto CRM writeback" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-800/30 border border-slate-700">
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-xs text-slate-400 text-center">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Phase 2: Live Call Workspace ─────────────────────────────────────────────

function LiveCallWorkspace({
  sessionId,
  contactId,
  contactName,
  onComplete,
}: {
  sessionId: number;
  contactId: number;
  contactName: string;
  onComplete: (summary: any) => void;
}) {
  const [callNotes, setCallNotes] = useState("");
  const [profile, setProfile] = useState<InvestorProfile>({
    cashFlowImportance: 3,
    appreciationImportance: 3,
    taxStrategyImportance: 2,
    personalUseInterest: 3,
    remoteOwnershipComfort: 3,
  });
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(0);
  const [activeCoachTab, setActiveCoachTab] = useState<"coaching" | "ai">("ai");
  const [elapsed, setElapsed] = useState(0);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Auto-save
  const updateSession = trpc.marketMatch.updateSession.useMutation();
  const scheduleAutoSave = useCallback(() => {
    setAutoSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setAutoSaveStatus("saving");
      updateSession.mutate(
        { id: sessionId, callNotes, investorProfile: profile },
        {
          onSuccess: () => setAutoSaveStatus("saved"),
          onError: () => setAutoSaveStatus("unsaved"),
        }
      );
    }, 2000);
  }, [callNotes, profile, sessionId]);
  useEffect(() => { scheduleAutoSave(); }, [callNotes, profile]);

  // AI recommendations
  const getRecommendations = trpc.marketMatch.getAIRecommendations.useMutation({
    onSuccess: (data) => {
      setAiResult(data as AIResult);
      toast.success("AI recommendations updated");
    },
    onError: (e) => toast.error(`AI error: ${e.message}`),
  });

  // Generate summary
  const generateSummary = trpc.marketMatch.generateCallSummary.useMutation({
    onSuccess: (data) => {
      onComplete({ ...data, sessionId, recommendations: aiResult?.recommendations ?? [] });
    },
    onError: (e) => toast.error(`Summary error: ${e.message}`),
  });

  const handleEndCall = () => {
    generateSummary.mutate({
      sessionId,
      callNotes,
      investorProfile: profile,
      recommendations: aiResult?.recommendations,
    });
  };

  const updateProfile = (key: keyof InvestorProfile, value: any) => {
    setProfile((p) => ({ ...p, [key]: value }));
  };

  const confidenceColor = aiResult
    ? aiResult.overallConfidence >= 75 ? "text-emerald-400" : aiResult.overallConfidence >= 50 ? "text-amber-400" : "text-rose-400"
    : "text-slate-400";

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-rose-500/20 border border-rose-500/40 rounded-full px-3 py-1">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-xs font-semibold text-rose-400">LIVE</span>
          </div>
          <div>
            <p className="font-semibold text-white">{contactName}</p>
            <p className="text-xs text-slate-400">Market Match Call · {formatTime(elapsed)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${autoSaveStatus === "saved" ? "text-emerald-400" : autoSaveStatus === "saving" ? "text-amber-400" : "text-slate-500"}`}>
            {autoSaveStatus === "saved" ? "✓ Saved" : autoSaveStatus === "saving" ? "Saving..." : "Unsaved"}
          </span>
          {aiResult && (
            <div className="flex items-center gap-1.5 bg-slate-800 rounded-full px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className={`text-xs font-semibold ${confidenceColor}`}>{aiResult.overallConfidence}% confidence</span>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => getRecommendations.mutate({ sessionId, callNotes, investorProfile: profile })}
            disabled={getRecommendations.isPending}
            className="gap-1.5 h-8"
          >
            {getRecommendations.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiResult ? "Refresh AI" : "Run AI"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleEndCall}
            disabled={generateSummary.isPending}
            className="gap-1.5 h-8"
          >
            {generateSummary.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneOff className="h-3.5 w-3.5" />}
            End Call
          </Button>
        </div>
      </div>

      {/* Main layout: 3-column grid */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Column 1: Investor Profile (compact, 2-col grid form) ── */}
        <div className="w-[380px] flex flex-col border-r border-slate-800 overflow-y-auto">
          <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" /> Investor Profile
            </h2>
          </div>
          <div className="p-3 space-y-4">

            {/* Timeline & Budget — 2 cols */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Timeline & Budget</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Timeline</Label>
                  <Select value={profile.purchaseTimeline ?? ""} onValueChange={(v) => updateProfile("purchaseTimeline", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asap">ASAP</SelectItem>
                      <SelectItem value="3_months">3 months</SelectItem>
                      <SelectItem value="6_months">6 months</SelectItem>
                      <SelectItem value="12_months">12 months</SelectItem>
                      <SelectItem value="exploring">Just exploring</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Budget Range</Label>
                  <Select value={profile.budgetRange ?? ""} onValueChange={(v) => updateProfile("budgetRange", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under_300k">Under $300k</SelectItem>
                      <SelectItem value="300_500k">$300k–$500k</SelectItem>
                      <SelectItem value="500_750k">$500k–$750k</SelectItem>
                      <SelectItem value="750k_1m">$750k–$1M</SelectItem>
                      <SelectItem value="over_1m">Over $1M</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Financing Type</Label>
                  <Select value={profile.financingType ?? ""} onValueChange={(v) => updateProfile("financingType", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {["Cash", "Conventional", "DSCR Loan", "Bridge Loan", "Other"].map((v) => (
                        <SelectItem key={v} value={v.toLowerCase().replace(/ /g, "_")}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">STR Experience</Label>
                  <Select value={profile.strExperienceLevel ?? ""} onValueChange={(v) => updateProfile("strExperienceLevel", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_time">First-time</SelectItem>
                      <SelectItem value="some_experience">Some exp.</SelectItem>
                      <SelectItem value="experienced">Experienced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>


            </div>

            <Separator className="bg-slate-800" />

            {/* Investment Priorities — sliders */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Investment Priorities (1–5)</p>
              <div className="space-y-2">
                <PrioritySlider label="Cash Flow" value={profile.cashFlowImportance ?? 3} onChange={(v) => updateProfile("cashFlowImportance", v)} />
                <PrioritySlider label="Appreciation" value={profile.appreciationImportance ?? 3} onChange={(v) => updateProfile("appreciationImportance", v)} />
                <PrioritySlider label="Tax Strategy" value={profile.taxStrategyImportance ?? 2} onChange={(v) => updateProfile("taxStrategyImportance", v)} />
                <PrioritySlider label="Personal Use" value={profile.personalUseInterest ?? 3} onChange={(v) => updateProfile("personalUseInterest", v)} />
              </div>
            </div>

            <Separator className="bg-slate-800" />

            {/* Geography & Vibe */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Geography & Vibe</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-[11px] text-slate-300 mb-1 block">Vibe Preferences</Label>
                  <div className="flex flex-wrap gap-1">
                    {["mountain", "beach", "lake", "ski", "urban", "desert", "golf", "wine country"].map((vibe) => {
                      const selected = profile.vibePreferences?.includes(vibe);
                      return (
                        <button
                          key={vibe}
                          onClick={() => {
                            const current = profile.vibePreferences ?? [];
                            updateProfile("vibePreferences", selected ? current.filter((v) => v !== vibe) : [...current, vibe]);
                          }}
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                            selected ? "bg-primary text-white border-primary" : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"
                          }`}
                        >
                          {vibe}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-300">Seasonality</Label>
                    <Select value={profile.seasonalityPreference ?? ""} onValueChange={(v) => updateProfile("seasonalityPreference", v)}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="year_round">Year-round</SelectItem>
                        <SelectItem value="seasonal">Seasonal OK</SelectItem>
                        <SelectItem value="no_preference">No pref.</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-300">Coast Pref.</Label>
                    <Select value={profile.coastPreference ?? ""} onValueChange={(v) => updateProfile("coastPreference", v)}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="east">East Coast</SelectItem>
                        <SelectItem value="west">West Coast</SelectItem>
                        <SelectItem value="either">Either</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-slate-800" />

            {/* Operations & Risk — 2 cols */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Operations & Risk</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Mgmt. Style</Label>
                  <Select value={profile.managementPreference ?? ""} onValueChange={(v) => updateProfile("managementPreference", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self_manage">Self-manage</SelectItem>
                      <SelectItem value="property_manager">PM preferred</SelectItem>
                      <SelectItem value="either">Either</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Regulation Risk</Label>
                  <Select value={profile.regulationRiskTolerance ?? ""} onValueChange={(v) => updateProfile("regulationRiskTolerance", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low only</SelectItem>
                      <SelectItem value="medium">Medium OK</SelectItem>
                      <SelectItem value="high">High OK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Motivation</Label>
                  <Select value={profile.primaryMotivation ?? ""} onValueChange={(v) => updateProfile("primaryMotivation", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lifestyle">Lifestyle</SelectItem>
                      <SelectItem value="performance">Performance</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-300">Ease vs. Upside</Label>
                  <Select value={profile.easeVsUpside ?? ""} onValueChange={(v) => updateProfile("easeVsUpside", v)}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-xs h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ease">Ease / turnkey</SelectItem>
                      <SelectItem value="upside">Upside / work</SelectItem>
                      <SelectItem value="balanced">Balanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-2">
                <PrioritySlider label="Remote Ownership Comfort" value={profile.remoteOwnershipComfort ?? 3} onChange={(v) => updateProfile("remoteOwnershipComfort", v)} />
              </div>
            </div>

          </div>
        </div>

        {/* ── Column 2: Call Notes ── */}
        <div className="w-[300px] flex flex-col border-r border-slate-800">
          <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/60 sticky top-0 z-10">
            <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" /> Call Notes
            </h2>
          </div>
          <div className="flex-1 p-3 flex flex-col gap-2">
            <Textarea
              placeholder="Type notes here as you talk... The AI reads these to improve recommendations."
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              className="flex-1 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm resize-none min-h-0"
              style={{ height: "100%" }}
            />
            <p className="text-[11px] text-slate-500">Notes auto-save every 2s and feed the AI.</p>
          </div>
        </div>

        {/* ── Column 3: AI Recommendations + Coaching ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-tab bar */}
          <div className="flex border-b border-slate-800 bg-slate-900/60">
            {(["ai", "coaching"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveCoachTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold capitalize transition-colors ${
                  activeCoachTab === tab
                    ? "text-primary border-b-2 border-primary bg-slate-900"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab === "ai" ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> AI Recommendations
                    {aiResult && <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{aiResult.recommendations.length}</span>}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5" /> Coaching
                    {aiResult && aiResult.coachingTips.length > 0 && (
                      <span className="bg-amber-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{aiResult.coachingTips.length}</span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>

          <ScrollArea className="flex-1">
            {activeCoachTab === "ai" && (
              <div className="p-4 space-y-3">
                {!aiResult ? (
                  <div className="text-center py-16 space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20">
                      <Sparkles className="h-8 w-8 text-primary/60" />
                    </div>
                    <div>
                      <p className="text-slate-300 font-medium">Ready for AI Analysis</p>
                      <p className="text-slate-500 text-sm mt-1">Fill in the investor profile, then run the AI to get ranked market recommendations.</p>
                    </div>
                    <Button
                      onClick={() => getRecommendations.mutate({ sessionId, callNotes, investorProfile: profile })}
                      disabled={getRecommendations.isPending}
                      className="gap-2"
                    >
                      {getRecommendations.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {getRecommendations.isPending ? "Analyzing..." : "Run AI Analysis"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aiResult.recommendations.map((rec, i) => (
                      <Card key={i} className="bg-slate-900 border-slate-700 cursor-pointer" onClick={() => setExpandedRec(expandedRec === i ? null : i)}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold text-slate-500 shrink-0">#{i + 1}</span>
                              <div className="min-w-0">
                                <p className="font-semibold text-white text-sm truncate">{rec.marketName}</p>
                                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{rec.shortExplanation}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <ConfidenceBadge score={rec.confidenceScore} />
                              {expandedRec === i ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] text-slate-400 w-14">Fit Score</span>
                            <ScoreBar value={rec.fitScore} color={rec.fitScore >= 75 ? "green" : rec.fitScore >= 50 ? "primary" : "amber"} />
                          </div>
                          {expandedRec === i && (
                            <div className="space-y-3 mt-3 pt-3 border-t border-slate-700">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mb-1"><CheckCircle2 className="h-3 w-3" /> Why It Fits</p>
                                  <p className="text-xs text-slate-300 leading-relaxed">{rec.whyItFits}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold text-rose-400 flex items-center gap-1 mb-1"><AlertTriangle className="h-3 w-3" /> Watch Out</p>
                                  <p className="text-xs text-slate-300 leading-relaxed">{rec.whyItMayNotFit}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold text-blue-400 flex items-center gap-1 mb-1"><MessageSquare className="h-3 w-3" /> Best Talking Points</p>
                                <div className="space-y-1">
                                  {rec.bestTalkingPoints.map((tp, j) => (
                                    <div key={j} className="flex gap-2 items-start">
                                      <ArrowRight className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                                      <p className="text-xs text-slate-300">{tp}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {rec.likelyObjections.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-semibold text-amber-400 flex items-center gap-1 mb-1"><Shield className="h-3 w-3" /> Likely Objections</p>
                                  <div className="space-y-1">
                                    {rec.likelyObjections.map((obj, j) => (
                                      <div key={j} className="flex gap-2 items-start">
                                        <span className="text-amber-400 text-xs mt-0.5">•</span>
                                        <p className="text-xs text-slate-300">{obj}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="p-2.5 rounded-lg bg-slate-700/50 border border-slate-600">
                                <p className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1"><User className="h-3 w-3" /> Suggested Agent Note</p>
                                <p className="text-xs text-slate-400 italic">{rec.suggestedAgentNote}</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeCoachTab === "coaching" && (
              <div className="p-4 space-y-4">
                {!aiResult ? (
                  <div className="text-center py-12 space-y-3">
                    <Lightbulb className="h-10 w-10 text-slate-600 mx-auto" />
                    <p className="text-slate-400 text-sm">Run AI analysis to get coaching tips</p>
                    <Button
                      size="sm"
                      onClick={() => getRecommendations.mutate({ sessionId, callNotes, investorProfile: profile })}
                      disabled={getRecommendations.isPending}
                      className="gap-1.5"
                    >
                      {getRecommendations.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Get Coaching Tips
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5" /> Coaching Tips
                      </h3>
                      {aiResult.coachingTips.map((tip, i) => (
                        <div key={i} className="flex gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <span className="text-amber-400 font-bold text-sm mt-0.5">{i + 1}</span>
                          <p className="text-sm text-slate-200">{tip}</p>
                        </div>
                      ))}
                    </div>
                    {aiResult.missingInfo.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> Missing Information
                        </h3>
                        {aiResult.missingInfo.map((item, i) => (
                          <div key={i} className="flex gap-2 items-start p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
                            <X className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />
                            <p className="text-sm text-slate-300">{item}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiResult.aiInferences.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" /> AI Inferences
                        </h3>
                        {aiResult.aiInferences.map((inf, i) => (
                          <div key={i} className="flex gap-2 items-start p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <Sparkles className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                            <p className="text-sm text-slate-300">{typeof inf === 'string' ? inf : `${(inf as any).field}: ${(inf as any).inferredValue}`}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ─── Phase 3: End of Call Summary ─────────────────────────────────────────────

function CallSummaryScreen({
  summary,
  sessionId,
  recommendations,
  contactName,
  onDone,
}: {
  summary: any;
  sessionId: number;
  recommendations: MarketRec[];
  contactName: string;
  onDone: () => void;
}) {
  const [, navigate] = useLocation();
  const completeSession = trpc.marketMatch.completeSession.useMutation({
    onSuccess: () => {
      toast.success("Call logged to CRM successfully");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleComplete = () => {
    completeSession.mutate({
      sessionId,
      callSummary: summary.callSummary,
      followUpEmailDraft: summary.followUpEmailDraft,
      handoffNotes: summary.handoffNotes,
      nextActionRecommendation: summary.nextActionRecommendation,
      contactStatusSuggestion: summary.contactStatusSuggestion,
      tagsApplied: (summary.suggestedTags ?? []).join(", "),
      topMarketRecommendations: recommendations,
      overallConfidenceScore: 75,
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Call Summary</h1>
            <p className="text-slate-400 text-sm">{contactName} · Market Match Call</p>
          </div>
          <Button
            onClick={handleComplete}
            disabled={completeSession.isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {completeSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Log to CRM & Close
          </Button>
        </div>

        {/* Next Action */}
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4 flex items-start gap-3">
            <Zap className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Recommended Next Action</p>
              <p className="text-white font-medium">{summary.nextActionRecommendation}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {/* Call Summary */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Call Summary</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400" onClick={() => copyToClipboard(summary.callSummary, "Summary")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{summary.callSummary}</p>
            </CardContent>
          </Card>

          {/* Handoff Notes */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2"><User className="h-4 w-4 text-blue-400" /> Agent Handoff Notes</span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400" onClick={() => copyToClipboard(summary.handoffNotes, "Handoff notes")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{summary.handoffNotes}</p>
            </CardContent>
          </Card>
        </div>

        {/* Follow-up Email */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-emerald-400" /> Follow-up Email Draft</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400" onClick={() => copyToClipboard(summary.followUpEmailDraft, "Email draft")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">{summary.followUpEmailDraft}</pre>
          </CardContent>
        </Card>

        {/* Tags & Status */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Suggested CRM Status</p>
              <Badge className="bg-primary/20 text-primary border-primary/30">{summary.contactStatusSuggestion}</Badge>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Suggested Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {(summary.suggestedTags ?? []).map((tag: string) => (
                  <Badge key={tag} variant="outline" className="text-xs border-slate-600 text-slate-300">{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Agent Intro Email */}
        <EmailIntroSection sessionId={sessionId} recommendations={recommendations} />
      </div>
    </div>
  );
}

// ─── Call History Panel ─────────────────────────────────────────────────────

function CallHistoryPanel() {
  const { data: sessions, isLoading } = trpc.marketMatch.recentSessions.useQuery({ limit: 30 });
  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-10 text-center">
          <History className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No past calls yet</p>
          <p className="text-slate-500 text-sm mt-1">Completed Market Match Calls will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const isOpen = expanded === s.id;
        const recs = (() => { try { return JSON.parse(s.topMarketRecommendations as any ?? "[]"); } catch { return []; } })();
        const profile = (() => { try { return JSON.parse(s.investorProfile as any ?? "{}"); } catch { return {}; } })();
        const duration = s.durationSeconds ? `${Math.floor(s.durationSeconds / 60)}m ${s.durationSeconds % 60}s` : null;
        const date = s.completedAt ? new Date(s.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "In progress";
        const statusColor = s.status === "completed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30";

        return (
          <Card key={s.id} className="bg-slate-800/50 border-slate-700 overflow-hidden">
            <button
              className="w-full p-4 flex items-center gap-4 text-left hover:bg-slate-700/30 transition-colors"
              onClick={() => setExpanded(isOpen ? null : s.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-white truncate">
                    {s.contactFirstName} {s.contactLastName}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
                    {s.status === "completed" ? "Completed" : "Active"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{date}</span>
                  {duration && <span>{duration}</span>}
                  {s.overallConfidenceScore && (
                    <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-400" />{s.overallConfidenceScore}% confidence</span>
                  )}
                  {recs.length > 0 && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" />{recs[0]?.marketName}</span>
                  )}
                </div>
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
            </button>

            {isOpen && (
              <div className="border-t border-slate-700 p-4 space-y-4">
                {/* Top market matches */}
                {recs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Top Market Matches</p>
                    <div className="space-y-2">
                      {recs.slice(0, 3).map((r: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-700/40">
                          <span className="text-xs font-bold text-primary w-4">#{i + 1}</span>
                          <span className="font-medium text-white text-sm flex-1">{r.marketName}</span>
                          <span className="text-xs text-slate-400">{r.fitScore ?? r.confidenceScore}% fit</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Investor profile snapshot */}
                {(profile.budgetMin || profile.purchaseTimeline) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Investor Profile</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.purchaseTimeline && <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">{profile.purchaseTimeline}</Badge>}
                      {profile.budgetMin && profile.budgetMax && <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">${Number(profile.budgetMin).toLocaleString()} – ${Number(profile.budgetMax).toLocaleString()}</Badge>}
                      {profile.financingType && <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">{profile.financingType}</Badge>}
                      {profile.strExperienceLevel && <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">{profile.strExperienceLevel}</Badge>}
                    </div>
                  </div>
                )}

                {/* Call summary */}
                {s.callSummary && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Call Summary</p>
                    <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">{s.callSummary}</p>
                  </div>
                )}

                {/* Next action */}
                {s.nextActionRecommendation && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Zap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200">{s.nextActionRecommendation}</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Email Intro Section (on summary screen) ─────────────────────────────────

function EmailIntroSection({ sessionId, recommendations }: { sessionId: number; recommendations: MarketRec[] }) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [ccInvestor, setCcInvestor] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: agents } = trpc.users.list.useQuery({ role: "agent" });
  const sendIntro = trpc.marketMatch.sendAgentIntroEmail.useMutation({
    onSuccess: (data) => {
      setSent(true);
      toast.success(`Intro email sent to ${data.agentName}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const topRec = recommendations[0];

  const handleSend = () => {
    if (!selectedAgentId) { toast.error("Please select an agent"); return; }
    sendIntro.mutate({
      sessionId,
      agentId: Number(selectedAgentId),
      marketName: topRec?.marketName,
      sendToInvestor: ccInvestor,
    });
  };

  if (sent) {
    return (
      <Card className="bg-emerald-500/10 border-emerald-500/30">
        <CardContent className="p-4 flex items-center gap-3">
          <UserCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-300">Intro email sent!</p>
            <p className="text-xs text-emerald-400/70">The agent has been notified with the investor profile and market match details.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mail className="h-4 w-4 text-cyan-400" />
          Agent Intro Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-slate-400">Send a branded intro email to the matched agent with the investor profile, call summary, and handoff notes.</p>

        <div className="space-y-2">
          <Label className="text-slate-300 text-xs">Select Agent</Label>
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
              <SelectValue placeholder="Choose an agent to introduce..." />
            </SelectTrigger>
            <SelectContent>
              {(agents ?? []).map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name ?? a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {topRec && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs text-slate-300">Top match: <span className="font-semibold text-white">{topRec.marketName}</span> ({topRec.fitScore ?? topRec.confidenceScore}% fit)</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox
            id="cc-investor"
            checked={ccInvestor}
            onCheckedChange={(v) => setCcInvestor(!!v)}
          />
          <label htmlFor="cc-investor" className="text-sm text-slate-300 cursor-pointer">
            Also send a copy to the investor
          </label>
        </div>

        <Button
          onClick={handleSend}
          disabled={!selectedAgentId || sendIntro.isPending}
          className="w-full gap-2 bg-cyan-600 hover:bg-cyan-700"
        >
          {sendIntro.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send Intro Email
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketMatchCallPage() {
  // Read contactId from URL query param (e.g. /market-match-call?contactId=42)
  const urlContactId = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("contactId");
    return v ? parseInt(v, 10) : null;
  })();

  const [phase, setPhase] = useState<"search" | "call" | "summary">("search");
  const [searchTab, setSearchTab] = useState<"new" | "history">("new");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [contactId, setContactId] = useState<number | null>(null);
  const [contactName, setContactName] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [summaryRecs, setSummaryRecs] = useState<MarketRec[]>([]);
  const [autoStartFired, setAutoStartFired] = useState(false);
  const [, navigate] = useLocation();
  const startSession = trpc.marketMatch.startSession.useMutation({
    onSuccess: (data) => {
      const name = `${data.contact.firstName} ${data.contact.lastName}`;
      setSessionId(data.sessionId);
      setContactId(data.contact.id);
      setContactName(name);
      setPhase("call");
      toast.success(`Started Market Match Call with ${name}`);
    },
     onError: (e) => toast.error(e.message),
  });

  // Auto-start if contactId was passed via URL query param
  useEffect(() => {
    if (urlContactId && !autoStartFired && phase === "search") {
      setAutoStartFired(true);
      startSession.mutate({ contactId: urlContactId });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlContactId]);

  if (phase === "search") {
    // Show a loading screen while auto-starting from a contact page
    if (autoStartFired && startSession.isPending) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/20 border border-primary/30 animate-pulse">
              <Zap className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white">Starting Market Match Call...</h2>
            <p className="text-slate-400">Loading contact profile and market data</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-2xl mx-auto space-y-6 pt-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-2">
              <Phone className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-white">Market Match Call</h1>
            <p className="text-slate-400">AI-powered live call workspace for STR investor discovery</p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl border border-slate-700">
            <button
              onClick={() => setSearchTab("new")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                searchTab === "new" ? "bg-primary text-primary-foreground shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              <Phone className="h-4 w-4" /> New Call
            </button>
            <button
              onClick={() => setSearchTab("history")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                searchTab === "history" ? "bg-primary text-primary-foreground shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              <History className="h-4 w-4" /> Call History
            </button>
          </div>

          {searchTab === "new" ? (
            <>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-6 space-y-4">
                  <ContactSearchWidget onStart={(cId: number) => startSession.mutate({ contactId: cId })} />
                </CardContent>
              </Card>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: Sparkles, text: "AI market matching" },
                  { icon: Target, text: "Live coaching tips" },
                  { icon: Zap, text: "Auto CRM writeback" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-800/30 border border-slate-700">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-xs text-slate-400 text-center">{text}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <CallHistoryPanel />
          )}
        </div>
      </div>
    );
  }

  if (phase === "call" && sessionId) {
    return (
      <LiveCallWorkspace
        sessionId={sessionId}
        contactId={contactId!}
        contactName={contactName}
        onComplete={(s) => {
          setSummary(s);
          setSummaryRecs(s.recommendations ?? []);
          setPhase("summary");
        }}
      />
    );
  }

  if (phase === "summary" && summary) {
    return (
      <CallSummaryScreen
        summary={summary}
        sessionId={sessionId!}
        recommendations={summaryRecs}
        contactName={contactName}
        onDone={() => navigate("/contacts")}
      />
    );
  }

  return null;
}

// ─── Inline contact search widget (used in search phase) ─────────────────────

function ContactSearchWidget({ onStart }: { onStart: (contactId: number) => void }) {
  const [search, setSearch] = useState("");
  const { data: contacts, isLoading } = trpc.contacts.list.useQuery(
    { search, limit: 10 },
    { enabled: search.length >= 2 }
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-slate-300">Search for a contact to start the call</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching...
        </div>
      )}
      {(contacts?.rows ?? []).length > 0 && (
        <div className="space-y-2">
          {(contacts?.rows ?? []).map(({ contact: c }) => (
            <button
              key={c.id}
              onClick={() => onStart(c.id)}
              className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-primary/50 transition-all text-left group"
            >
              <div>
                <p className="font-semibold text-white">{c.firstName} {c.lastName}</p>
                <p className="text-xs text-slate-400">{c.email ?? c.phone ?? "No contact info"}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>
      )}
      {search.length >= 2 && !isLoading && (contacts?.rows ?? []).length === 0 && (
        <p className="text-sm text-slate-400 text-center py-2">No contacts found for "{search}"</p>
      )}
      {search.length < 2 && (
        <p className="text-xs text-slate-500 text-center">Type at least 2 characters to search</p>
      )}
    </div>
  );
}
