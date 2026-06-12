import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Plus, Edit2, Trash2, MapPin, BarChart3, Loader2, X, Save, Settings, Sparkles,
  Shield, CheckCircle2, ChevronDown, ChevronUp, Users, Mail, Building2, TrendingUp,
  DollarSign, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketProfile = {
  id: number; name: string; state: string; region?: string | null;
  status: "active" | "recruiting" | "paused" | "future";
  idealInvestorProfile?: string | null; notGoodFor?: string | null;
  budgetMin?: string | null; budgetMax?: string | null;
  commonPropertyTypes?: string | null; commonBedroomRanges?: string | null;
  commonAmenities?: string | null; cashFlowProfile?: string | null;
  appreciationProfile?: string | null; regulationRisk?: string | null;
  managementDifficulty?: string | null; seasonalityProfile?: string | null;
  personalUseAttractiveness?: string | null; remoteOwnershipFriendly?: boolean | null;
  vibeTag?: string | null; talkingPoints?: string | null;
  commonObjections?: string | null; sampleBuyerScenarios?: string | null;
  regulationNotes?: string | null; internalNotes?: string | null;
  scoringWeightCashFlow?: number | null; scoringWeightAppreciation?: number | null;
  scoringWeightRegulation?: number | null; scoringWeightManagement?: number | null;
  scoringWeightPersonalUse?: number | null; scoringWeightBudget?: number | null;
  scoringWeightVibe?: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLORS = ["#14b8a6","#6366f1","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#22c55e","#f97316","#64748b"];

const formatCurrency = (val: number) =>
  val === 0 ? "$0" : `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const formatCompact = (val: number) => {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}k`;
  return `$${val}`;
};

const EMPTY_FORM = {
  name: "", state: "", region: "", status: "active" as const,
  idealInvestorProfile: "", notGoodFor: "", budgetMin: "", budgetMax: "",
  commonPropertyTypes: "", commonBedroomRanges: "", commonAmenities: "",
  cashFlowProfile: "medium" as const, appreciationProfile: "medium" as const,
  regulationRisk: "medium" as const, managementDifficulty: "medium" as const,
  seasonalityProfile: "year_round" as const, personalUseAttractiveness: "medium" as const,
  remoteOwnershipFriendly: true, vibeTag: "", talkingPoints: "",
  commonObjections: "", sampleBuyerScenarios: "", regulationNotes: "", internalNotes: "",
  scoringWeightCashFlow: 20, scoringWeightAppreciation: 15, scoringWeightRegulation: 15,
  scoringWeightManagement: 10, scoringWeightPersonalUse: 10, scoringWeightBudget: 20, scoringWeightVibe: 10,
};

type FormState = typeof EMPTY_FORM;

// ─── Market Form Dialog ───────────────────────────────────────────────────────

function MarketFormDialog({ open, onClose, initial, onSaved }: {
  open: boolean; onClose: () => void; initial: MarketProfile | null; onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [expanded, setExpanded] = useState<string[]>(["basic"]);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name ?? "", state: initial.state ?? "", region: initial.region ?? "",
        status: (initial.status ?? "active") as "active",
        idealInvestorProfile: initial.idealInvestorProfile ?? "", notGoodFor: initial.notGoodFor ?? "",
        budgetMin: initial.budgetMin ?? "", budgetMax: initial.budgetMax ?? "",
        commonPropertyTypes: initial.commonPropertyTypes ?? "", commonBedroomRanges: initial.commonBedroomRanges ?? "",
        commonAmenities: initial.commonAmenities ?? "",
        cashFlowProfile: (initial.cashFlowProfile as any) ?? "medium",
        appreciationProfile: (initial.appreciationProfile as any) ?? "medium",
        regulationRisk: (initial.regulationRisk as any) ?? "medium",
        managementDifficulty: (initial.managementDifficulty as any) ?? "medium",
        seasonalityProfile: (initial.seasonalityProfile as any) ?? "year_round",
        personalUseAttractiveness: (initial.personalUseAttractiveness as any) ?? "medium",
        remoteOwnershipFriendly: initial.remoteOwnershipFriendly ?? true,
        vibeTag: initial.vibeTag ?? "", talkingPoints: initial.talkingPoints ?? "",
        commonObjections: initial.commonObjections ?? "", sampleBuyerScenarios: initial.sampleBuyerScenarios ?? "",
        regulationNotes: initial.regulationNotes ?? "", internalNotes: initial.internalNotes ?? "",
        scoringWeightCashFlow: initial.scoringWeightCashFlow ?? 20,
        scoringWeightAppreciation: initial.scoringWeightAppreciation ?? 15,
        scoringWeightRegulation: initial.scoringWeightRegulation ?? 15,
        scoringWeightManagement: initial.scoringWeightManagement ?? 10,
        scoringWeightPersonalUse: initial.scoringWeightPersonalUse ?? 10,
        scoringWeightBudget: initial.scoringWeightBudget ?? 20,
        scoringWeightVibe: initial.scoringWeightVibe ?? 10,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setExpanded(["basic"]);
  }, [initial, open]);

  const upsert = trpc.marketMatch.upsertMarket.useMutation({
    onSuccess: () => { toast.success(initial ? "Market updated" : "Market created"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: keyof FormState, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggle = (section: string) => setExpanded(e => e.includes(section) ? e.filter(s => s !== section) : [...e, section]);

  const totalWeight = (form.scoringWeightCashFlow ?? 0) + (form.scoringWeightAppreciation ?? 0) +
    (form.scoringWeightRegulation ?? 0) + (form.scoringWeightManagement ?? 0) +
    (form.scoringWeightPersonalUse ?? 0) + (form.scoringWeightBudget ?? 0) + (form.scoringWeightVibe ?? 0);

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border rounded-lg overflow-hidden">
      <button type="button" onClick={() => toggle(id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-semibold">
        {title}
        {expanded.includes(id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded.includes(id) && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );

  const selectOpts = (opts: string[]) => opts.map(o => (
    <SelectItem key={o} value={o}>{o.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
  ));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Market Profile" : "Add Market Profile"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-3 py-2">
            <Section id="basic" title="Basic Info">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Market Name *</Label>
                  <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Smoky Mountains" />
                </div>
                <div className="space-y-1.5">
                  <Label>State *</Label>
                  <Input value={form.state} onChange={e => set("state", e.target.value)} placeholder="e.g. TN" />
                </div>
                <div className="space-y-1.5">
                  <Label>Region</Label>
                  <Input value={form.region} onChange={e => set("region", e.target.value)} placeholder="e.g. East Tennessee" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => set("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{selectOpts(["active","recruiting","paused","future"])}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Budget Min ($)</Label>
                  <Input type="number" value={form.budgetMin} onChange={e => set("budgetMin", e.target.value)} placeholder="e.g. 300000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Budget Max ($)</Label>
                  <Input type="number" value={form.budgetMax} onChange={e => set("budgetMax", e.target.value)} placeholder="e.g. 800000" />
                </div>
                <div className="space-y-1.5">
                  <Label>Vibe Tag</Label>
                  <Input value={form.vibeTag} onChange={e => set("vibeTag", e.target.value)} placeholder="e.g. Mountain Escape, Beach Retreat" />
                </div>
                <div className="space-y-1.5 flex items-center gap-3 pt-5">
                  <Switch checked={form.remoteOwnershipFriendly} onCheckedChange={v => set("remoteOwnershipFriendly", v)} />
                  <Label>Remote Ownership Friendly</Label>
                </div>
              </div>
            </Section>

            <Section id="investor" title="Investor Fit">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Ideal Investor Profile</Label>
                  <Textarea rows={2} value={form.idealInvestorProfile} onChange={e => set("idealInvestorProfile", e.target.value)} placeholder="Who is this market perfect for?" />
                </div>
                <div className="space-y-1.5">
                  <Label>Not Good For</Label>
                  <Textarea rows={2} value={form.notGoodFor} onChange={e => set("notGoodFor", e.target.value)} placeholder="Who should avoid this market?" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["cashFlowProfile", "Cash Flow Profile", ["low","medium","high","very_high"]],
                    ["appreciationProfile", "Appreciation Profile", ["low","medium","high","very_high"]],
                    ["regulationRisk", "Regulation Risk", ["low","medium","high","very_high"]],
                    ["managementDifficulty", "Management Difficulty", ["low","medium","high","very_high"]],
                    ["seasonalityProfile", "Seasonality", ["year_round","summer_peak","winter_peak","shoulder_season"]],
                    ["personalUseAttractiveness", "Personal Use Appeal", ["low","medium","high","very_high"]],
                  ].map(([key, label, opts]) => (
                    <div key={key as string} className="space-y-1.5">
                      <Label>{label as string}</Label>
                      <Select value={(form as any)[key as string]} onValueChange={v => set(key as keyof FormState, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{selectOpts(opts as string[])}</SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            <Section id="property" title="Property Details">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Common Property Types</Label>
                    <Input value={form.commonPropertyTypes} onChange={e => set("commonPropertyTypes", e.target.value)} placeholder="e.g. Cabin, Chalet" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Common Bedroom Ranges</Label>
                    <Input value={form.commonBedroomRanges} onChange={e => set("commonBedroomRanges", e.target.value)} placeholder="e.g. 2-4 BR" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Common Amenities</Label>
                  <Input value={form.commonAmenities} onChange={e => set("commonAmenities", e.target.value)} placeholder="e.g. Hot tub, Game room, Mountain views" />
                </div>
              </div>
            </Section>

            <Section id="talking" title="Talking Points & Objections">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Talking Points</Label>
                  <Textarea rows={3} value={form.talkingPoints} onChange={e => set("talkingPoints", e.target.value)} placeholder="Key selling points for this market..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Common Objections & Responses</Label>
                  <Textarea rows={3} value={form.commonObjections} onChange={e => set("commonObjections", e.target.value)} placeholder="Objections ISAs hear and how to respond..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Sample Buyer Scenarios</Label>
                  <Textarea rows={2} value={form.sampleBuyerScenarios} onChange={e => set("sampleBuyerScenarios", e.target.value)} placeholder="Example investor stories..." />
                </div>
              </div>
            </Section>

            <Section id="notes" title="Regulation & Internal Notes">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Regulation Notes</Label>
                  <Textarea rows={2} value={form.regulationNotes} onChange={e => set("regulationNotes", e.target.value)} placeholder="STR permit requirements, HOA restrictions..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Internal Notes</Label>
                  <Textarea rows={2} value={form.internalNotes} onChange={e => set("internalNotes", e.target.value)} placeholder="Notes for ISAs only (not shown to AI)..." />
                </div>
              </div>
            </Section>

            <Section id="scoring" title="AI Scoring Weights">
              <p className="text-xs text-muted-foreground mb-2">Total must equal 100. Current: <span className={totalWeight === 100 ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>{totalWeight}</span></p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["scoringWeightCashFlow","Cash Flow"],["scoringWeightAppreciation","Appreciation"],
                  ["scoringWeightRegulation","Regulation"],["scoringWeightManagement","Management"],
                  ["scoringWeightPersonalUse","Personal Use"],["scoringWeightBudget","Budget"],
                  ["scoringWeightVibe","Vibe"],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{label}</Label>
                    <Input type="number" min={0} max={100} value={(form as any)[key]} onChange={e => set(key as keyof FormState, Number(e.target.value))} />
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </ScrollArea>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const bMin = form.budgetMin ? Number(form.budgetMin) : undefined;
              const bMax = form.budgetMax ? Number(form.budgetMax) : undefined;
              if (bMin !== undefined && bMax !== undefined && bMax <= bMin) {
                toast.error("Max Budget must be greater than Min Budget");
                return;
              }
              upsert.mutate({ id: initial?.id, ...form, budgetMin: bMin, budgetMax: bMax });
            }}
            disabled={upsert.isPending || !form.name || !form.state || totalWeight !== 100}>
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {initial ? "Save Changes" : "Create Market"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Market Card ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  recruiting: "bg-blue-100 text-blue-700 border-blue-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  future: "bg-purple-100 text-purple-700 border-purple-200",
};

function MarketCard({ market, onEdit, onDelete }: { market: MarketProfile; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  const { data: marketAgents = [], refetch: refetchAgents } = trpc.marketMatch.getMarketAgents.useQuery(
    { marketProfileId: market.id },
    { enabled: open }
  );
  const { data: marketCounties = [] } = trpc.marketMatch.getMarketCounties.useQuery(
    { marketProfileId: market.id },
    { staleTime: 60_000 }
  );
  const { data: allAgents = [] } = trpc.users.list.useQuery(
    { role: "agent" },
    { enabled: open && addAgentOpen }
  );
  const assignedAgentIds = new Set((marketAgents as any[]).map((a: any) => a.agentId));
  const availableAgents = (allAgents as any[]).filter((u: any) => !assignedAgentIds.has(u.id));

  const upsertAgent = trpc.marketMatch.upsertMarketAgent.useMutation({
    onSuccess: () => { refetchAgents(); setAddAgentOpen(false); setSelectedAgentId(""); setIsPrimary(false); toast.success("Agent assigned"); },
    onError: (e) => toast.error(e.message),
  });
  const removeAgent = trpc.marketMatch.removeMarketAgent.useMutation({
    onSuccess: () => { refetchAgents(); toast.success("Agent removed"); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><MapPin className="h-4 w-4 text-primary" /></div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{market.name}</span>
                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[market.status] ?? ""}`}>{market.status}</Badge>
                {market.vibeTag && <Badge variant="secondary" className="text-xs">{market.vibeTag}</Badge>}
                {(market.budgetMin || market.budgetMax) && (
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0">
                    {market.budgetMin ? `$${Number(market.budgetMin).toLocaleString()}` : ""}
                    {market.budgetMin && market.budgetMax ? " – " : ""}
                    {market.budgetMax ? `$${Number(market.budgetMax).toLocaleString()}` : ""}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground">{market.state}</span>
                {(marketCounties as any[]).slice(0, 5).map((c: any) => (
                  <Badge key={c.id} variant="outline" className="text-xs px-1.5 py-0 h-4 font-normal text-muted-foreground">
                    {c.name}
                  </Badge>
                ))}
                {(marketCounties as any[]).length > 5 && (
                  <span className="text-xs text-muted-foreground">+{(marketCounties as any[]).length - 5} more</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}><Edit2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        {open && (
          <div className="border-t bg-muted/20">
            {/* Market details */}
            {(market.idealInvestorProfile || market.notGoodFor || market.talkingPoints || market.commonObjections) && (
              <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-b">
                {market.idealInvestorProfile && <div><span className="font-medium">Ideal for: </span>{market.idealInvestorProfile}</div>}
                {market.notGoodFor && <div><span className="font-medium">Not for: </span>{market.notGoodFor}</div>}
                {market.talkingPoints && <div className="col-span-2"><span className="font-medium">Talking Points: </span>{market.talkingPoints}</div>}
                {market.commonObjections && <div className="col-span-2"><span className="font-medium">Objections: </span>{market.commonObjections}</div>}
              </div>
            )}
            {/* Agent assignments */}
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Assigned Agents ({(marketAgents as any[]).length})
                </span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAddAgentOpen(v => !v)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Agent
                </Button>
              </div>
              {addAgentOpen && (
                <div className="flex items-end gap-2 p-2 rounded-md border bg-background">
                  <div className="flex-1">
                    <Label className="text-xs mb-1 block">Agent</Label>
                    <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select agent..." /></SelectTrigger>
                      <SelectContent>
                        {availableAgents.length === 0
                          ? <SelectItem value="__none" disabled>No agents available</SelectItem>
                          : availableAgents.map((u: any) => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5 pb-1">
                    <input type="checkbox" id={`primary-${market.id}`} checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} className="h-3.5 w-3.5" />
                    <Label htmlFor={`primary-${market.id}`} className="text-xs cursor-pointer">Primary</Label>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!selectedAgentId || upsertAgent.isPending}
                    onClick={() => upsertAgent.mutate({ marketProfileId: market.id, agentId: Number(selectedAgentId), isPrimary })}
                  >
                    Assign
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAddAgentOpen(false)}>Cancel</Button>
                </div>
              )}
              {(marketAgents as any[]).length === 0 ? (
                <p className="text-xs text-muted-foreground">No agents assigned to this market yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {(marketAgents as any[]).map((a: any) => (
                    <div key={a.id} className="rounded-md border px-3 py-2 bg-background text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{a.agentName ?? `Agent #${a.agentId}`}</span>
                          {a.isPrimary && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Primary</Badge>}
                          {a.isAvailable === false && <Badge variant="outline" className="text-xs text-muted-foreground">Unavailable</Badge>}
                          {a.groupName && <Badge variant="secondary" className="text-xs">{a.groupName}</Badge>}
                        </div>
                        <Button
                          size="sm" variant="ghost"
                          className="h-6 px-2 text-destructive hover:text-destructive shrink-0"
                          onClick={() => removeAgent.mutate({ id: a.id })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {a.agentEmail && <span>{a.agentEmail}</span>}
                        {a.agentPhone && <span>{a.agentPhone}</span>}
                        {a.budgetSpecialization && <span>Budget: {a.budgetSpecialization}</span>}
                        {a.maxLeadCapacity != null && <span>Cap: {a.currentLeadCount ?? 0}/{a.maxLeadCapacity}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Markets Tab ──────────────────────────────────────────────────────────────

function MarketsTab() {
  const [, navigate] = useLocation();
  const { data: markets, isLoading, refetch } = trpc.marketMatch.getAllMarkets.useQuery();
  const deleteMut = trpc.marketMatch.deleteMarket.useMutation({
    onSuccess: () => { toast.success("Market deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleEdit = (m: MarketProfile) => navigate(`/market-profile/${m.id}`);
  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete "${name}"? This cannot be undone.`)) deleteMut.mutate({ id });
  };

  const activeMarkets = (markets ?? []).filter((m: any) => m.status === "active");
  const otherMarkets = (markets ?? []).filter((m: any) => m.status !== "active");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-3 gap-3 flex-1 mr-4">
          <Card><CardContent className="p-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <div><p className="text-xl font-bold">{activeMarkets.length}</p><p className="text-xs text-muted-foreground">Active</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <div><p className="text-xl font-bold">{(markets ?? []).filter((m: any) => m.talkingPoints).length}</p><p className="text-xs text-muted-foreground">With Talking Points</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            <div><p className="text-xl font-bold">{(markets ?? []).length}</p><p className="text-xs text-muted-foreground">Total</p></div>
          </CardContent></Card>
        </div>
        <Button onClick={() => navigate("/market-profile/new")} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Add Market
        </Button>
      </div>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-3 flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            During a Market Match Call, the AI reads the investor's profile and cross-references it against all active market profiles to generate ranked recommendations with fit scores, talking points, and objection handlers. The more complete your profiles, the better the AI's recommendations.
          </p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (markets ?? []).length === 0 ? (
        <Card><CardContent className="p-10 text-center space-y-3">
          <MapPin className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="font-semibold text-muted-foreground">No markets configured yet</p>
          <Button onClick={() => navigate("/market-profile/new")} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add First Market
          </Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {activeMarkets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active ({activeMarkets.length})</h3>
              {activeMarkets.map((m: any) => (
                <MarketCard key={m.id} market={m} onEdit={() => handleEdit(m)} onDelete={() => handleDelete(m.id, m.name)} />
              ))}
            </div>
          )}
          {otherMarkets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Other ({otherMarkets.length})</h3>
              {otherMarkets.map((m: any) => (
                <MarketCard key={m.id} market={m} onEdit={() => handleEdit(m)} onDelete={() => handleDelete(m.id, m.name)} />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Performance Tab ──────────────────────────────────────────────────────────

function PerformanceTab() {
  const [selectedMarketId, setSelectedMarketId] = useState<string>("all");
  const { data: marketPerf = [], isLoading } = trpc.analytics.marketPerformance.useQuery();
  const { data: monthlyTrend = [] } = trpc.analytics.marketMonthlyTrend.useQuery();
  const { data: leaderboard = [] } = trpc.analytics.marketAgentLeaderboard.useQuery(
    { marketId: Number(selectedMarketId) },
    { enabled: selectedMarketId !== "all" }
  );

  const totalGci = (marketPerf as any[]).reduce((s, m) => s + (m.totalGci ?? 0), 0);
  const totalClosings = (marketPerf as any[]).reduce((s, m) => s + (m.closings ?? 0), 0);
  const totalAgents = (marketPerf as any[]).reduce((s, m) => s + (m.agentCount ?? 0), 0);

  const pieData = (marketPerf as any[]).filter(m => m.totalGci > 0).map(m => ({ name: m.marketName, value: m.totalGci }));

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100"><DollarSign className="h-4 w-4 text-emerald-600" /></div>
          <div><p className="text-xl font-bold">{formatCompact(totalGci)}</p><p className="text-xs text-muted-foreground">Total GCI</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100"><Building2 className="h-4 w-4 text-blue-600" /></div>
          <div><p className="text-xl font-bold">{totalClosings}</p><p className="text-xs text-muted-foreground">Closings</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100"><Users className="h-4 w-4 text-purple-600" /></div>
          <div><p className="text-xl font-bold">{totalAgents}</p><p className="text-xs text-muted-foreground">Active Agents</p></div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">GCI by Market</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={marketPerf as any[]} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="marketName" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => formatCompact(v)} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
                <Bar dataKey="totalGci" fill="hsl(var(--primary))" radius={[3,3,0,0]} name="GCI" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">GCI Share</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {(monthlyTrend as any[]).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly GCI Trend by Market</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyTrend as any[]} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => formatCompact(v)} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
                <Legend />
                {Array.from(new Set((monthlyTrend as any[]).map((r: any) => r.marketName))).map((mkt, i) => (
                  <Bar key={mkt as string} dataKey={mkt as string} stackId="a" fill={PIE_COLORS[i % PIE_COLORS.length]} name={mkt as string} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Market Summary</CardTitle>
            <Select value={selectedMarketId} onValueChange={setSelectedMarketId}>
              <SelectTrigger className="w-40 h-7 text-xs"><SelectValue placeholder="All Markets" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Markets</SelectItem>
                {(marketPerf as any[]).map((m: any) => <SelectItem key={m.marketId} value={String(m.marketId)}>{m.marketName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead className="text-right">GCI</TableHead>
                <TableHead className="text-right">Closings</TableHead>
                <TableHead className="text-right">Agents</TableHead>
                <TableHead className="text-right">Avg GCI/Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(selectedMarketId === "all" ? marketPerf as any[] : (marketPerf as any[]).filter((m: any) => String(m.marketId) === selectedMarketId)).map((m: any) => (
                <TableRow key={m.marketId}>
                  <TableCell className="font-medium">{m.marketName}</TableCell>
                  <TableCell className="text-right">{formatCurrency(m.totalGci ?? 0)}</TableCell>
                  <TableCell className="text-right">{m.closings ?? 0}</TableCell>
                  <TableCell className="text-right">{m.agentCount ?? 0}</TableCell>
                  <TableCell className="text-right">{m.agentCount > 0 ? formatCurrency(Math.round((m.totalGci ?? 0) / m.agentCount)) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedMarketId !== "all" && leaderboard.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Agent Leaderboard</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead><TableHead>Agent</TableHead>
                  <TableHead className="text-right">GCI</TableHead>
                  <TableHead className="text-right">Closings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(leaderboard as any[]).map((a: any, i: number) => (
                  <TableRow key={a.agentId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{a.agentName}</TableCell>
                    <TableCell className="text-right">{formatCurrency(a.totalGci ?? 0)}</TableCell>
                    <TableCell className="text-right">{a.closings ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────────────────────

type Tab = "markets" | "performance";

export default function MarketMatchConfigPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("markets");

  const allTabs: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: "markets", label: "Market Profiles", icon: MapPin },
    { id: "performance", label: "Performance", icon: TrendingUp },
  ];
  const tabs = allTabs;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Market Match Hub
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure markets and review performance across all active markets.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "markets" && <MarketsTab />}
      {activeTab === "performance" && <PerformanceTab />}
    </div>
  );
}
