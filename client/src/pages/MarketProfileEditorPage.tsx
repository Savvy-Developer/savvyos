import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, ArrowRight, Save, Loader2, MapPin, Users, MessageSquare,
  CheckCircle2, AlertTriangle, Sparkles, Search, Eye, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppBack } from "@/lib/navigationHistory";

// ─── Types & Constants ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "", state: "", status: "active" as const,
  idealInvestorProfile: "", notGoodFor: "", budgetMin: "" as string | number, budgetMax: "" as string | number,
  commonPropertyTypes: "", commonBedroomRanges: "", commonAmenities: "",
  cashFlowProfile: "medium" as const, appreciationProfile: "medium" as const,
  regulationRisk: "medium" as const, managementDifficulty: "medium" as const,
  seasonalityProfile: "year_round" as const, personalUseAttractiveness: "medium" as const,
  remoteOwnershipFriendly: true, vibeTag: "",
  talkingPoints: "", commonObjections: "", sampleBuyerScenarios: "",
  regulationNotes: "", internalNotes: "",
  scoringWeightCashFlow: 20, scoringWeightAppreciation: 15, scoringWeightRegulation: 15,
  scoringWeightManagement: 10, scoringWeightPersonalUse: 10, scoringWeightBudget: 20, scoringWeightVibe: 10,
};

type FormState = typeof EMPTY_FORM;

const STEPS = [
  { id: 1, label: "Basic Info", icon: MapPin, description: "Name, location, status, and budget range" },
  { id: 2, label: "Investor Fit", icon: Users, description: "Profiles, property details, and AI scoring weights" },
  { id: 3, label: "Talking Points", icon: MessageSquare, description: "Objections, scenarios, and internal notes" },
];

const DRAFT_KEY = (id: string) => `market-profile-draft-${id}`;

// Budget dropdown options: $100k increments from $100k to $3M
const BUDGET_OPTIONS: [string, string][] = [
  ["__none__", "— Not set —"],
  ...Array.from({ length: 30 }, (_, i) => {
    const val = (i + 1) * 100_000;
    const label = val >= 1_000_000
      ? `$${(val / 1_000_000).toFixed(1).replace(".0", "")}M`
      : `$${(val / 1_000).toFixed(0)}k`;
    return [String(val), label] as [string, string];
  }),
];

// ─── Reusable field components ────────────────────────────────────────────────

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""}`}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function SelectField({ label, value, onChange, options, full }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][]; full?: boolean;
}) {
  return (
    <Field label={label} full={full}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([val, display]) => (
            <SelectItem key={val} value={val}>{display}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

// ─── County Multi-Select ──────────────────────────────────────────────────────

function CountyMultiSelect({
  stateCode,
  selectedIds,
  onChange,
}: {
  stateCode: string;
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [search, setSearch] = useState("");
  const { data: counties = [], isLoading } = trpc.marketMatch.listCountiesByState.useQuery(
    { stateCode },
    { enabled: !!stateCode }
  );

  const filtered = counties.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (!stateCode) {
    return (
      <div className="text-sm text-muted-foreground italic p-3 border rounded-md bg-muted/30">
        Select a state first to choose counties.
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading counties…</div>;
  }

  return (
    <div className="border rounded-md">
      <div className="p-2 border-b flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Search counties…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {selectedIds.length > 0 && (
          <Badge variant="secondary" className="text-xs">{selectedIds.length} selected</Badge>
        )}
      </div>
      <ScrollArea className="h-48">
        <div className="p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">No counties found.</p>
          ) : (
            filtered.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox
                  checked={selectedIds.includes(c.id)}
                  onCheckedChange={() => toggle(c.id)}
                />
                {c.name}
              </label>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Step 1: Basic Info ───────────────────────────────────────────────────────

function Step1BasicInfo({
  form,
  set,
  selectedCountyIds,
  onCountiesChange,
}: {
  form: FormState;
  set: (k: keyof FormState, v: any) => void;
  selectedCountyIds: number[];
  onCountiesChange: (ids: number[]) => void;
}) {
  const { data: states = [] } = trpc.marketMatch.listStates.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Basic Information</h2>
        <p className="text-sm text-muted-foreground mt-0.5">The core details that identify this market and how it appears in the AI's recommendations.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Location</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldRow>
            <Field label="Market Name *">
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="e.g. Smoky Mountains"
              />
            </Field>
            <Field label="State *">
              <Select value={form.state} onValueChange={v => { set("state", v); }}>
                <SelectTrigger><SelectValue placeholder="Select state…" /></SelectTrigger>
                <SelectContent>
                  {states.map(s => (
                    <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldRow>
          <FieldRow>
            <SelectField
              label="Status"
              value={form.status}
              onChange={v => set("status", v as any)}
              options={[
                ["active", "Active"],
                ["recruiting", "Recruiting"],
                ["paused", "Paused"],
                ["future", "Future"],
              ]}
            />
          </FieldRow>
          <Field label="Counties" full>
            <CountyMultiSelect
              stateCode={form.state}
              selectedIds={selectedCountyIds}
              onChange={onCountiesChange}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Budget Range</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldRow>
            <SelectField
              label="Budget Min"
              value={form.budgetMin ? String(form.budgetMin) : "__none__"}
              onChange={v => set("budgetMin", v === "__none__" ? "" : v)}
              options={BUDGET_OPTIONS}
            />
            <SelectField
              label="Budget Max"
              value={form.budgetMax ? String(form.budgetMax) : "__none__"}
              onChange={v => set("budgetMax", v === "__none__" ? "" : v)}
              options={BUDGET_OPTIONS}
            />
          </FieldRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Branding</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldRow>
            <Field label="Vibe Tag">
              <Input
                value={form.vibeTag}
                onChange={e => set("vibeTag", e.target.value)}
                placeholder="e.g. Beach, Mountain, Urban"
              />
            </Field>
          </FieldRow>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 2: Investor Fit ─────────────────────────────────────────────────────

function Step2InvestorFit({ form, set }: { form: FormState; set: (k: keyof FormState, v: any) => void }) {
  const totalWeight =
    (form.scoringWeightCashFlow ?? 0) + (form.scoringWeightAppreciation ?? 0) +
    (form.scoringWeightRegulation ?? 0) + (form.scoringWeightManagement ?? 0) +
    (form.scoringWeightPersonalUse ?? 0) + (form.scoringWeightBudget ?? 0) +
    (form.scoringWeightVibe ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Investor Fit</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Define who this market is for, what properties are common, and how the AI should score matches.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Investor Profiles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Ideal Investor Profile" full>
            <Textarea
              value={form.idealInvestorProfile}
              onChange={e => set("idealInvestorProfile", e.target.value)}
              placeholder="Describe the ideal investor for this market…"
              rows={3}
            />
          </Field>
          <Field label="Not Good For" full>
            <Textarea
              value={form.notGoodFor}
              onChange={e => set("notGoodFor", e.target.value)}
              placeholder="Who should NOT invest in this market…"
              rows={2}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Property Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldRow>
            <Field label="Common Property Types">
              <Input value={form.commonPropertyTypes} onChange={e => set("commonPropertyTypes", e.target.value)} placeholder="e.g. Cabin, Condo" />
            </Field>
            <Field label="Common Bedroom Ranges">
              <Input value={form.commonBedroomRanges} onChange={e => set("commonBedroomRanges", e.target.value)} placeholder="e.g. 2–4 BR" />
            </Field>
          </FieldRow>
          <Field label="Common Amenities" full>
            <Input value={form.commonAmenities} onChange={e => set("commonAmenities", e.target.value)} placeholder="e.g. Pool, Hot tub, Game room" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Market Characteristics</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <FieldRow>
            <SelectField label="Cash Flow Profile" value={form.cashFlowProfile} onChange={v => set("cashFlowProfile", v as any)} options={[["low","Low"],["medium","Medium"],["high","High"],["very_high","Very High"]]} />
            <SelectField label="Appreciation Profile" value={form.appreciationProfile} onChange={v => set("appreciationProfile", v as any)} options={[["low","Low"],["medium","Medium"],["high","High"],["very_high","Very High"]]} />
          </FieldRow>
          <FieldRow>
            <SelectField label="Regulation Risk" value={form.regulationRisk} onChange={v => set("regulationRisk", v as any)} options={[["low","Low"],["medium","Medium"],["high","High"]]} />
            <SelectField label="Management Difficulty" value={form.managementDifficulty} onChange={v => set("managementDifficulty", v as any)} options={[["low","Low"],["medium","Medium"],["high","High"]]} />
          </FieldRow>
          <FieldRow>
            <SelectField label="Seasonality" value={form.seasonalityProfile} onChange={v => set("seasonalityProfile", v as any)} options={[["year_round","Year Round"],["seasonal","Seasonal"],["highly_seasonal","Highly Seasonal"]]} />
            <SelectField label="Personal Use Attractiveness" value={form.personalUseAttractiveness} onChange={v => set("personalUseAttractiveness", v as any)} options={[["low","Low"],["medium","Medium"],["high","High"]]} />
          </FieldRow>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.remoteOwnershipFriendly} onCheckedChange={v => set("remoteOwnershipFriendly", v)} />
            <Label className="text-sm">Remote Ownership Friendly</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">AI Scoring Weights</CardTitle>
            <Badge variant={totalWeight === 100 ? "default" : "destructive"} className="text-xs">
              {totalWeight === 100 ? "✓ 100%" : `${totalWeight}% / 100%`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {totalWeight !== 100 && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              Weights must total exactly 100% to save.
            </div>
          )}
          {([
            ["scoringWeightCashFlow", "Cash Flow"],
            ["scoringWeightAppreciation", "Appreciation"],
            ["scoringWeightRegulation", "Regulation"],
            ["scoringWeightManagement", "Management"],
            ["scoringWeightPersonalUse", "Personal Use"],
            ["scoringWeightBudget", "Budget"],
            ["scoringWeightVibe", "Vibe"],
          ] as [keyof FormState, string][]).map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <Label className="w-36 text-sm">{label}</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form[key] as number}
                onChange={e => set(key, Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 3: Talking Points ───────────────────────────────────────────────────

function Step3TalkingPoints({ form, set }: { form: FormState; set: (k: keyof FormState, v: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Talking Points & Notes</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Sales talking points, common objections, sample buyer scenarios, and internal notes for your team.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Sales Content</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Talking Points" full>
            <Textarea value={form.talkingPoints} onChange={e => set("talkingPoints", e.target.value)} placeholder="Key selling points for this market…" rows={4} />
          </Field>
          <Field label="Common Objections" full>
            <Textarea value={form.commonObjections} onChange={e => set("commonObjections", e.target.value)} placeholder="Objections you hear and how to handle them…" rows={3} />
          </Field>
          <Field label="Sample Buyer Scenarios" full>
            <Textarea value={form.sampleBuyerScenarios} onChange={e => set("sampleBuyerScenarios", e.target.value)} placeholder="Example investor profiles that do well here…" rows={3} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Compliance & Internal</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Regulation Notes" full>
            <Textarea value={form.regulationNotes} onChange={e => set("regulationNotes", e.target.value)} placeholder="STR regulations, permit requirements, HOA rules…" rows={3} />
          </Field>
          <Field label="Internal Notes" full>
            <Textarea value={form.internalNotes} onChange={e => set("internalNotes", e.target.value)} placeholder="Notes for your team only (not shown to investors)…" rows={3} />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep, completedSteps }: { currentStep: number; completedSteps: Set<number> }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, idx) => {
        const isCompleted = completedSteps.has(step.id);
        const isCurrent = currentStep === step.id;
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center gap-2">
            {idx > 0 && <div className={`h-px w-8 ${isCompleted || isCurrent ? "bg-primary" : "bg-border"}`} />}
            <div className={`flex items-center gap-1.5 text-sm ${isCurrent ? "text-primary font-medium" : isCompleted ? "text-muted-foreground" : "text-muted-foreground"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border ${isCurrent ? "bg-primary text-primary-foreground border-primary" : isCompleted ? "bg-muted border-muted-foreground/30" : "border-border"}`}>
                {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3" />}
              </div>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MarketProfileEditorPage({ marketId }: { marketId?: number }) {
  const [, navigate] = useLocation();
  const goBack = useAppBack("/market-match-config");
  const isEdit = !!marketId;
  const draftKey = DRAFT_KEY(marketId ? String(marketId) : "new");

  const [step, setStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [selectedCountyIds, setSelectedCountyIds] = useState<number[]>([]);

  // Load existing market data for edit mode
  const { data: existingMarket, isLoading: loadingMarket } = trpc.marketMatch.getMarket.useQuery(
    { id: marketId! },
    { enabled: isEdit }
  );

  // Load existing county assignments for edit mode
  const { data: existingCounties = [] } = trpc.marketMatch.getMarketCounties.useQuery(
    { marketProfileId: marketId! },
    { enabled: isEdit }
  );

  // Load draft from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!isEdit) {
          setForm(parsed);
          setHasDraft(true);
        }
      } catch {}
    }
  }, [draftKey, isEdit]);

  // Populate form from DB when editing
  useEffect(() => {
    if (existingMarket) {
      const m = existingMarket as any;
      setForm({
        name: m.name ?? "", state: m.state ?? "", status: m.status ?? "active",
        idealInvestorProfile: m.idealInvestorProfile ?? "", notGoodFor: m.notGoodFor ?? "",
        budgetMin: m.budgetMin ?? "", budgetMax: m.budgetMax ?? "",
        commonPropertyTypes: m.commonPropertyTypes ?? "", commonBedroomRanges: m.commonBedroomRanges ?? "",
        commonAmenities: m.commonAmenities ?? "",
        cashFlowProfile: m.cashFlowProfile ?? "medium",
        appreciationProfile: m.appreciationProfile ?? "medium",
        regulationRisk: m.regulationRisk ?? "medium",
        managementDifficulty: m.managementDifficulty ?? "medium",
        seasonalityProfile: m.seasonalityProfile ?? "year_round",
        personalUseAttractiveness: m.personalUseAttractiveness ?? "medium",
        remoteOwnershipFriendly: m.remoteOwnershipFriendly ?? true,
        vibeTag: m.vibeTag ?? "", talkingPoints: m.talkingPoints ?? "",
        commonObjections: m.commonObjections ?? "", sampleBuyerScenarios: m.sampleBuyerScenarios ?? "",
        regulationNotes: m.regulationNotes ?? "", internalNotes: m.internalNotes ?? "",
        scoringWeightCashFlow: m.scoringWeightCashFlow ?? 20,
        scoringWeightAppreciation: m.scoringWeightAppreciation ?? 15,
        scoringWeightRegulation: m.scoringWeightRegulation ?? 15,
        scoringWeightManagement: m.scoringWeightManagement ?? 10,
        scoringWeightPersonalUse: m.scoringWeightPersonalUse ?? 10,
        scoringWeightBudget: m.scoringWeightBudget ?? 20,
        scoringWeightVibe: m.scoringWeightVibe ?? 10,
      });
    }
  }, [existingMarket]);

  // Populate county selections from DB when editing
  useEffect(() => {
    if (existingCounties.length > 0) {
      setSelectedCountyIds(existingCounties.map(c => c.id));
    }
  }, [existingCounties]);

  const set = useCallback((k: keyof FormState, v: any) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (!isEdit) {
        localStorage.setItem(draftKey, JSON.stringify(next));
      }
      return next;
    });
    setIsDirty(true);
  }, [draftKey, isEdit]);

  const utils = trpc.useUtils();

  const upsert = trpc.marketMatch.upsertMarket.useMutation({
    onSuccess: async (data) => {
      // Save county assignments after market is saved
      if (data?.id) {
        await setCounties.mutateAsync({ marketProfileId: data.id, countyIds: selectedCountyIds });
      } else if (isEdit && marketId) {
        await setCounties.mutateAsync({ marketProfileId: marketId, countyIds: selectedCountyIds });
      }
      localStorage.removeItem(draftKey);
      utils.marketMatch.getAllMarkets.invalidate();
      toast.success(isEdit ? "Market profile updated" : "Market profile created");
      navigate("/market-match-config");
    },
    onError: (e) => toast.error(e.message),
  });

  const setCounties = trpc.marketMatch.setMarketCounties.useMutation({
    onError: (e) => toast.error("Failed to save county assignments: " + e.message),
  });

  const [showAIPreview, setShowAIPreview] = useState(false);
  const { data: aiPromptData, isFetching: aiPromptLoading } = trpc.marketMatch.getMarketAIPrompt.useQuery(
    { marketProfileId: marketId! },
    { enabled: showAIPreview && !!marketId }
  );

  const totalWeight =
    (form.scoringWeightCashFlow ?? 0) + (form.scoringWeightAppreciation ?? 0) +
    (form.scoringWeightRegulation ?? 0) + (form.scoringWeightManagement ?? 0) +
    (form.scoringWeightPersonalUse ?? 0) + (form.scoringWeightBudget ?? 0) +
    (form.scoringWeightVibe ?? 0);

  const canSave = !!form.name && !!form.state && totalWeight === 100;

  function handleNext() {
    setCompletedSteps(s => new Set(Array.from(s).concat(step)));
    setStep(s => Math.min(s + 1, STEPS.length));
  }

  function handleBack() {
    if (step === 1) {
      if (isDirty && !confirm("You have unsaved changes. Leave anyway?")) return;
      goBack();
    } else {
      setStep(s => s - 1);
    }
  }

  function handleSave() {
    const payload: Record<string, any> = {};
    if (marketId) payload.id = marketId;
    payload.name = form.name;
    payload.state = form.state;

    const optStrings: (keyof FormState)[] = [
      "idealInvestorProfile", "notGoodFor", "commonPropertyTypes",
      "commonBedroomRanges", "commonAmenities", "vibeTag", "talkingPoints",
      "commonObjections", "sampleBuyerScenarios", "regulationNotes", "internalNotes",
    ];
    for (const k of optStrings) {
      const v = form[k];
      if (v !== "" && v !== null && v !== undefined) payload[k] = v;
    }

    const optEnums: (keyof FormState)[] = [
      "status", "cashFlowProfile", "appreciationProfile", "regulationRisk",
      "managementDifficulty", "seasonalityProfile", "personalUseAttractiveness",
    ];
    for (const k of optEnums) {
      const v = form[k];
      if (v !== "" && v !== null && v !== undefined) payload[k] = v;
    }

    payload.remoteOwnershipFriendly = form.remoteOwnershipFriendly;

    if (form.budgetMin !== "" && form.budgetMin !== null && form.budgetMin !== undefined) {
      payload.budgetMin = Number(form.budgetMin);
    }
    if (form.budgetMax !== "" && form.budgetMax !== null && form.budgetMax !== undefined) {
      payload.budgetMax = Number(form.budgetMax);
    }

    payload.scoringWeightCashFlow = Number(form.scoringWeightCashFlow);
    payload.scoringWeightAppreciation = Number(form.scoringWeightAppreciation);
    payload.scoringWeightRegulation = Number(form.scoringWeightRegulation);
    payload.scoringWeightManagement = Number(form.scoringWeightManagement);
    payload.scoringWeightPersonalUse = Number(form.scoringWeightPersonalUse);
    payload.scoringWeightBudget = Number(form.scoringWeightBudget);
    payload.scoringWeightVibe = Number(form.scoringWeightVibe);

    upsert.mutate(payload as any);
  }

  function handleSaveDraft() {
    localStorage.setItem(draftKey, JSON.stringify(form));
    setHasDraft(true);
    toast.success("Draft saved");
  }

  function handleDiscardDraft() {
    localStorage.removeItem(draftKey);
    setForm(EMPTY_FORM);
    setHasDraft(false);
    setIsDirty(false);
  }

  if (isEdit && loadingMarket) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // AI Prompt Preview Modal
  const AIPreviewModal = showAIPreview ? (
    <Dialog open onOpenChange={() => setShowAIPreview(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            AI Prompt Preview — {aiPromptData?.marketName ?? form.name}
          </DialogTitle>
        </DialogHeader>
        {aiPromptLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : aiPromptData ? (
          <div className="space-y-4">
            {/* Completeness Score */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <div className="flex-1">
                <p className="text-sm font-medium">Profile Completeness</p>
                <p className="text-xs text-muted-foreground">How much context the AI has for this market</p>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-bold ${
                  aiPromptData.fieldsSummary.completenessScore >= 80 ? "text-green-600" :
                  aiPromptData.fieldsSummary.completenessScore >= 50 ? "text-amber-600" : "text-red-500"
                }`}>{aiPromptData.fieldsSummary.completenessScore}%</span>
              </div>
            </div>

            {/* Field checklist */}
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {([
                ["hasVibeTag", "Vibe Tag"],
                ["hasTalkingPoints", "Talking Points"],
                ["hasIdealInvestorProfile", "Ideal Investor Profile"],
                ["hasNotGoodFor", "Not Good For"],
                ["hasBudgetRange", "Budget Range"],
                ["hasCommonAmenities", "Common Amenities"],
                ["hasCashFlowProfile", "Cash Flow Profile"],
                ["hasRegulationNotes", "Regulation Notes"],
                ["hasCommonObjections", "Common Objections"],
                ["hasSampleBuyerScenarios", "Sample Buyer Scenarios"],
              ] as [keyof typeof aiPromptData.fieldsSummary, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  {aiPromptData.fieldsSummary[key] ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  )}
                  <span className={aiPromptData.fieldsSummary[key] ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                </div>
              ))}
            </div>

            {/* Market context block */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Market Context Sent to AI</p>
              <ScrollArea className="h-48">
                <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap font-mono leading-relaxed">{aiPromptData.marketBlock}</pre>
              </ScrollArea>
            </div>

            <p className="text-xs text-muted-foreground">
              This is the exact context block the AI receives for this market during a live Market Match session. Fill in missing fields to improve recommendation accuracy.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not load AI prompt data.</p>
        )}
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-semibold">{isEdit ? `Edit: ${form.name || "Market Profile"}` : "New Market Profile"}</span>
              {isDirty && !isEdit && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Unsaved</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEdit && (
              <Button variant="outline" size="sm" onClick={() => setShowAIPreview(true)} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" /> Preview AI Prompt
              </Button>
            )}
            {!isEdit && (
              <Button variant="outline" size="sm" onClick={handleSaveDraft} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Save Draft
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canSave || upsert.isPending}
              className="gap-1.5"
            >
              {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {isEdit ? "Save Changes" : "Create Market"}
            </Button>
          </div>
        </div>
      </div>

      {/* Draft restore banner */}
      {hasDraft && !isEdit && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-3xl mx-auto px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <Sparkles className="h-4 w-4" />
              Draft restored from your last session.
            </div>
            <Button variant="ghost" size="sm" className="text-amber-700 h-7 text-xs" onClick={handleDiscardDraft}>
              Discard Draft
            </Button>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <div className="border-b bg-card/50">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <StepIndicator currentStep={step} completedSteps={completedSteps} />
        </div>
      </div>

      {/* Form Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {step === 1 && (
          <Step1BasicInfo
            form={form}
            set={set}
            selectedCountyIds={selectedCountyIds}
            onCountiesChange={setSelectedCountyIds}
          />
        )}
        {step === 2 && <Step2InvestorFit form={form} set={set} />}
        {step === 3 && <Step3TalkingPoints form={form} set={set} />}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <Button variant="outline" onClick={handleBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {step === 1 ? "Back" : "Previous"}
          </Button>

          <div className="flex items-center gap-2">
            {step < STEPS.length ? (
              <Button onClick={handleNext} className="gap-1.5">
                Next: {STEPS[step].label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={!canSave || upsert.isPending}
                className="gap-1.5"
              >
                {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isEdit ? "Save Changes" : "Create Market"}
              </Button>
            )}
          </div>
        </div>

        {!canSave && step === 3 && (
          <p className="text-xs text-muted-foreground text-center mt-3">
            {!form.name || !form.state
              ? "Market name and state are required (Step 1)."
              : `Scoring weights must total 100 (currently ${totalWeight}).`}
          </p>
        )}
      </div>

      {/* AI Prompt Preview Modal */}
      {AIPreviewModal}
    </div>
  );
}
