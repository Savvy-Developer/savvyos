import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { ArrowLeft, Download, Plus, Trash2, Calculator, TrendingUp, DollarSign, Home, BarChart3 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useAppBack } from "@/lib/navigationHistory";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

// ─── Financial Calculation Helpers ─────────────────────────────────────────────
function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

function calculateProforma(data: any) {
  const purchasePrice = parseFloat(data.purchasePrice) || 0;
  const downPaymentPct = parseFloat(data.downPaymentPct) || 0.20;
  const closingCostsPct = parseFloat(data.closingCostsPct) || 0.02;
  const interestRate = parseFloat(data.interestRate) || 0.07;
  const loanTermYears = parseInt(data.loanTermYears) || 30;
  const pmiPct = parseFloat(data.pmiPct) || 0;
  const furnishingBudget = parseFloat(data.furnishingBudget) || 0;
  const startupCosts = parseFloat(data.startupCosts) || 0;
  const otherCashNeeded = parseFloat(data.otherCashNeeded) || 0;

  const downPayment = purchasePrice * downPaymentPct;
  const closingCosts = purchasePrice * closingCostsPct;
  const loanAmount = purchasePrice - downPayment;
  const monthlyRate = interestRate / 12;
  const totalPayments = loanTermYears * 12;
  const monthlyMortgage = -pmt(monthlyRate, totalPayments, loanAmount);
  const monthlyPMI = (loanAmount * pmiPct) / 12;
  const totalMonthlyPayment = monthlyMortgage + monthlyPMI;
  const totalCashNeeded = downPayment + closingCosts + furnishingBudget + startupCosts + otherCashNeeded;

  // Revenue scenarios
  const revenueAppreciation = parseFloat(data.revenueAppreciationPct) || 0.03;
  const rev1Annual = parseFloat(data.revenueScenario1) || 0;
  const rev2Annual = parseFloat(data.revenueScenario2) || rev1Annual * (1 + revenueAppreciation);
  const rev3Annual = parseFloat(data.revenueScenario3) || rev2Annual * (1 + revenueAppreciation);

  // Fixed expenses (monthly)
  const fixedMonthly = (parseFloat(data.expUtilities) || 0) +
    (parseFloat(data.expInsurance) || 0) +
    (parseFloat(data.expInternet) || 0) +
    (parseFloat(data.expLandscaping) || 0) +
    (parseFloat(data.expRepairs) || 0) +
    (parseFloat(data.expSupplies) || 0) +
    (parseFloat(data.expSoftware) || 0) +
    (parseFloat(data.expPestControl) || 0) +
    (parseFloat(data.expPermits) || 0) +
    (parseFloat(data.expOther) || 0);
  const propertyTaxMonthly = (parseFloat(data.expPropertyTaxAnnual) || 0) / 12;
  const totalFixedMonthly = fixedMonthly + propertyTaxMonthly;

  // Variable expense rates
  const maintenanceReservePct = parseFloat(data.maintenanceReservePct) || 0.05;
  const otaFeePct = parseFloat(data.otaFeePct) || 0.03;
  const propertyMgmtPct = parseFloat(data.propertyMgmtPct) || 0;
  const cleaningPerTurn = parseFloat(data.cleaningCostPerTurn) || 0;
  const turnsPerMonth = parseFloat(data.avgTurnsPerMonth) || 0;
  const cleaningMonthly = cleaningPerTurn * turnsPerMonth;

  // Per-scenario calculations
  function calcScenario(annualRevenue: number) {
    const monthlyRevenue = annualRevenue / 12;
    const variableExpenses = (monthlyRevenue * maintenanceReservePct) +
      (monthlyRevenue * otaFeePct) +
      (monthlyRevenue * propertyMgmtPct) +
      cleaningMonthly;
    const totalExpensesMonthly = totalFixedMonthly + variableExpenses;
    const noiMonthly = monthlyRevenue - totalExpensesMonthly;
    const noiAnnual = noiMonthly * 12;
    const cashFlowMonthly = noiMonthly - totalMonthlyPayment;
    const cashFlowAnnual = cashFlowMonthly * 12;
    const cashOnCash = totalCashNeeded > 0 ? cashFlowAnnual / totalCashNeeded : 0;
    const capRate = purchasePrice > 0 ? noiAnnual / purchasePrice : 0;
    const grossROI = purchasePrice > 0 ? annualRevenue / purchasePrice : 0;
    const breakEvenYears = cashFlowAnnual > 0 ? totalCashNeeded / cashFlowAnnual : Infinity;
    const dscr = (totalMonthlyPayment * 12) > 0 ? noiAnnual / (totalMonthlyPayment * 12) : 0;
    return {
      annualRevenue, monthlyRevenue, variableExpenses, totalExpensesMonthly,
      noiMonthly, noiAnnual, cashFlowMonthly, cashFlowAnnual,
      cashOnCash, capRate, grossROI, breakEvenYears, dscr,
    };
  }

  const scenario1 = calcScenario(rev1Annual);
  const scenario2 = calcScenario(rev2Annual);
  const scenario3 = calcScenario(rev3Annual);

  // Property appreciation
  const propertyAppreciation = parseFloat(data.propertyAppreciationPct) || 0.04;
  const equityYear1 = purchasePrice * propertyAppreciation;
  const equityYear2 = (purchasePrice * (1 + propertyAppreciation)) * propertyAppreciation;
  const equityYear3 = (purchasePrice * Math.pow(1 + propertyAppreciation, 2)) * propertyAppreciation;

  return {
    purchasePrice, downPayment, closingCosts, loanAmount,
    monthlyMortgage, monthlyPMI, totalMonthlyPayment,
    totalCashNeeded, furnishingBudget, startupCosts, otherCashNeeded,
    totalFixedMonthly, cleaningMonthly,
    scenario1, scenario2, scenario3,
    equityYear1, equityYear2, equityYear3,
    propertyAppreciation, revenueAppreciation,
    interestRate, loanTermYears, downPaymentPct, closingCostsPct,
  };
}

// ─── Currency Formatter ────────────────────────────────────────────────────────
function fmt(val: number, decimals = 0): string {
  if (!isFinite(val)) return "N/A";
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function pct(val: number): string {
  if (!isFinite(val)) return "N/A";
  return `${(val * 100).toFixed(2)}%`;
}

// ─── Default Form Values ───────────────────────────────────────────────────────
const defaultForm = {
  title: "",
  purchasePrice: "",
  downPaymentPct: "0.20",
  closingCostsPct: "0.02",
  interestRate: "0.07",
  loanTermYears: "30",
  pmiPct: "0",
  furnishingBudget: "40000",
  startupCosts: "5000",
  otherCashNeeded: "0",
  revenueScenario1: "",
  revenueScenario2: "",
  revenueScenario3: "",
  expUtilities: "600",
  expInsurance: "300",
  expInternet: "200",
  expLandscaping: "100",
  expRepairs: "100",
  expSupplies: "100",
  expSoftware: "50",
  expPestControl: "50",
  expPermits: "0",
  expPropertyTaxAnnual: "2400",
  expOther: "0",
  maintenanceReservePct: "0.05",
  otaFeePct: "0.03",
  propertyMgmtPct: "0",
  cleaningCostPerTurn: "150",
  avgTurnsPerMonth: "8",
  propertyAppreciationPct: "0.04",
  revenueAppreciationPct: "0.03",
  propertyLink: "",
  notes: "",
  // Comps
  comp1Revenue: "", comp1Occupancy: "", comp1ADR: "", comp1Beds: "", comp1Link: "", comp1Notes: "",
  comp2Revenue: "", comp2Occupancy: "", comp2ADR: "", comp2Beds: "", comp2Link: "", comp2Notes: "",
  comp3Revenue: "", comp3Occupancy: "", comp3ADR: "", comp3Beds: "", comp3Link: "", comp3Notes: "",
};

export default function ProformaPage() {
  const { id: propertyIdStr } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const goBack = useAppBack(`/properties/${propertyIdStr}`);
  const propertyId = parseInt(propertyIdStr ?? "0");
  const { user } = useAuth();

  const { data: property } = trpc.properties.get.useQuery({ id: propertyId });
  const { data: branding } = trpc.properties.getAgentBranding.useQuery({});
  const { data: existingProformas, refetch: refetchList } = trpc.properties.listProformas.useQuery({ propertyId });

  const [form, setForm] = useState({ ...defaultForm });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);

  const createMutation = trpc.properties.createProforma.useMutation({
    onSuccess: (data) => {
      toast.success("Pro-forma saved");
      setShowForm(false);
      setEditingId(data.id);
      refetchList();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.properties.updateProforma.useMutation({
    onSuccess: () => { toast.success("Pro-forma updated"); refetchList(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.properties.deleteProforma.useMutation({
    onSuccess: () => { toast.success("Pro-forma deleted"); setEditingId(null); refetchList(); },
    onError: (e) => toast.error(e.message),
  });

  // Build comps JSON from form
  function buildComps() {
    const comps = [];
    if (form.comp1Revenue || form.comp1Link) comps.push({ revenue: form.comp1Revenue, occupancy: form.comp1Occupancy, adr: form.comp1ADR, beds: form.comp1Beds, link: form.comp1Link, notes: form.comp1Notes });
    if (form.comp2Revenue || form.comp2Link) comps.push({ revenue: form.comp2Revenue, occupancy: form.comp2Occupancy, adr: form.comp2ADR, beds: form.comp2Beds, link: form.comp2Link, notes: form.comp2Notes });
    if (form.comp3Revenue || form.comp3Link) comps.push({ revenue: form.comp3Revenue, occupancy: form.comp3Occupancy, adr: form.comp3ADR, beds: form.comp3Beds, link: form.comp3Link, notes: form.comp3Notes });
    return comps.length > 0 ? comps : null;
  }

  function handleSave() {
    if (!form.purchasePrice || !form.revenueScenario1) {
      toast.error("Purchase price and at least Scenario 1 revenue are required");
      return;
    }
    const payload: any = {
      propertyId,
      title: form.title || `Pro-forma - ${property?.address ?? "Property"}`,
      purchasePrice: form.purchasePrice,
      downPaymentPct: form.downPaymentPct,
      closingCostsPct: form.closingCostsPct,
      interestRate: form.interestRate,
      loanTermYears: parseInt(form.loanTermYears) || 30,
      pmiPct: form.pmiPct,
      furnishingBudget: form.furnishingBudget,
      startupCosts: form.startupCosts,
      otherCashNeeded: form.otherCashNeeded,
      revenueScenario1: form.revenueScenario1,
      revenueScenario2: form.revenueScenario2 || null,
      revenueScenario3: form.revenueScenario3 || null,
      revenueComps: buildComps(),
      expUtilities: form.expUtilities,
      expInsurance: form.expInsurance,
      expInternet: form.expInternet,
      expLandscaping: form.expLandscaping,
      expRepairs: form.expRepairs,
      expSupplies: form.expSupplies,
      expSoftware: form.expSoftware,
      expPestControl: form.expPestControl,
      expPermits: form.expPermits,
      expPropertyTaxAnnual: form.expPropertyTaxAnnual,
      expOther: form.expOther,
      maintenanceReservePct: form.maintenanceReservePct,
      otaFeePct: form.otaFeePct,
      propertyMgmtPct: form.propertyMgmtPct,
      cleaningCostPerTurn: form.cleaningCostPerTurn,
      avgTurnsPerMonth: form.avgTurnsPerMonth,
      propertyAppreciationPct: form.propertyAppreciationPct,
      revenueAppreciationPct: form.revenueAppreciationPct,
      propertyLink: form.propertyLink || null,
      notes: form.notes || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function loadProforma(pf: any) {
    const comps = pf.revenueComps ?? [];
    setForm({
      title: pf.title ?? "",
      purchasePrice: pf.purchasePrice ?? "",
      downPaymentPct: pf.downPaymentPct ?? "0.20",
      closingCostsPct: pf.closingCostsPct ?? "0.02",
      interestRate: pf.interestRate ?? "0.07",
      loanTermYears: String(pf.loanTermYears ?? 30),
      pmiPct: pf.pmiPct ?? "0",
      furnishingBudget: pf.furnishingBudget ?? "0",
      startupCosts: pf.startupCosts ?? "0",
      otherCashNeeded: pf.otherCashNeeded ?? "0",
      revenueScenario1: pf.revenueScenario1 ?? "",
      revenueScenario2: pf.revenueScenario2 ?? "",
      revenueScenario3: pf.revenueScenario3 ?? "",
      expUtilities: pf.expUtilities ?? "0",
      expInsurance: pf.expInsurance ?? "0",
      expInternet: pf.expInternet ?? "0",
      expLandscaping: pf.expLandscaping ?? "0",
      expRepairs: pf.expRepairs ?? "0",
      expSupplies: pf.expSupplies ?? "0",
      expSoftware: pf.expSoftware ?? "0",
      expPestControl: pf.expPestControl ?? "0",
      expPermits: pf.expPermits ?? "0",
      expPropertyTaxAnnual: pf.expPropertyTaxAnnual ?? "0",
      expOther: pf.expOther ?? "0",
      maintenanceReservePct: pf.maintenanceReservePct ?? "0.05",
      otaFeePct: pf.otaFeePct ?? "0.03",
      propertyMgmtPct: pf.propertyMgmtPct ?? "0",
      cleaningCostPerTurn: pf.cleaningCostPerTurn ?? "0",
      avgTurnsPerMonth: pf.avgTurnsPerMonth ?? "0",
      propertyAppreciationPct: pf.propertyAppreciationPct ?? "0.04",
      revenueAppreciationPct: pf.revenueAppreciationPct ?? "0.03",
      propertyLink: pf.propertyLink ?? "",
      notes: pf.notes ?? "",
      comp1Revenue: comps[0]?.revenue ?? "", comp1Occupancy: comps[0]?.occupancy ?? "", comp1ADR: comps[0]?.adr ?? "", comp1Beds: comps[0]?.beds ?? "", comp1Link: comps[0]?.link ?? "", comp1Notes: comps[0]?.notes ?? "",
      comp2Revenue: comps[1]?.revenue ?? "", comp2Occupancy: comps[1]?.occupancy ?? "", comp2ADR: comps[1]?.adr ?? "", comp2Beds: comps[1]?.beds ?? "", comp2Link: comps[1]?.link ?? "", comp2Notes: comps[1]?.notes ?? "",
      comp3Revenue: comps[2]?.revenue ?? "", comp3Occupancy: comps[2]?.occupancy ?? "", comp3ADR: comps[2]?.adr ?? "", comp3Beds: comps[2]?.beds ?? "", comp3Link: comps[2]?.link ?? "", comp3Notes: comps[2]?.notes ?? "",
    });
    setEditingId(pf.id);
    setShowForm(true);
  }

  // Live calculations
  const calcs = useMemo(() => calculateProforma(form), [form]);

  // PDF generation
  async function handleDownloadPDF() {
    setGenerating(true);
    try {
      const response = await fetch("/api/proforma/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          form,
          calcs,
          property: property ? { address: property.address, city: property.city, state: property.state, zip: property.zip, beds: property.beds, baths: property.baths, sqft: property.sqft, propertyType: property.propertyType, listPrice: property.listPrice } : null,
          branding,
          comps: buildComps(),
        }),
      });
      if (!response.ok) throw new Error("PDF generation failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Proforma_${property?.address?.replace(/[^a-zA-Z0-9]/g, "_") ?? "property"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  if (!property) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={goBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back to Property</Button>
      </div>
      <PageHeader
        title="Pro-forma Analysis"
        subtitle={`${property.address}${property.city ? `, ${property.city}` : ""}${property.state ? ` ${property.state}` : ""}`}
        actions={
          <div className="flex gap-2">
            {!showForm && (
              <Button onClick={() => { setForm({ ...defaultForm, purchasePrice: property.listPrice ?? "" }); setEditingId(null); setShowForm(true); }} size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Pro-forma
              </Button>
            )}
          </div>
        }
      />

      {/* Existing Pro-formas List */}
      {!showForm && existingProformas && existingProformas.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Saved Pro-formas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {existingProformas.map((pf: any) => (
                <div key={pf.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer" onClick={() => loadProforma(pf)}>
                  <div>
                    <p className="text-sm font-medium">{pf.title || "Untitled Pro-forma"}</p>
                    <p className="text-xs text-muted-foreground">Created {new Date(pf.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-emerald-700">{fmt(parseFloat(pf.purchasePrice))}</span>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: pf.id }); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!showForm && (!existingProformas || existingProformas.length === 0) && (
        <Card className="mb-6">
          <CardContent className="py-12 text-center">
            <Calculator className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground mb-4">No pro-formas created yet for this property.</p>
            <Button onClick={() => { setForm({ ...defaultForm, purchasePrice: property.listPrice ?? "" }); setEditingId(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Create Pro-forma
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pro-forma Form */}
      {showForm && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={generating || !form.purchasePrice || !form.revenueScenario1}>
                <Download className="h-4 w-4 mr-1" /> {generating ? "Generating..." : "Download PDF"}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {editingId ? "Update" : "Save"} Pro-forma
              </Button>
            </div>
          </div>

          <Tabs defaultValue="inputs" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="inputs"><Calculator className="h-4 w-4 mr-1" /> Inputs</TabsTrigger>
              <TabsTrigger value="results"><BarChart3 className="h-4 w-4 mr-1" /> Results</TabsTrigger>
              <TabsTrigger value="comps"><TrendingUp className="h-4 w-4 mr-1" /> Comps</TabsTrigger>
            </TabsList>

            {/* ─── INPUTS TAB ─────────────────────────────────────────────────── */}
            <TabsContent value="inputs">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Purchase & Loan */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Home className="h-4 w-4" /> Purchase & Loan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div><Label>Title</Label><Input placeholder="e.g. Conservative Analysis" value={form.title} onChange={f("title")} /></div>
                    <div><Label>Purchase Price *</Label><Input placeholder="700000" value={form.purchasePrice} onChange={f("purchasePrice")} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Down Payment %</Label><Input placeholder="0.20" value={form.downPaymentPct} onChange={f("downPaymentPct")} /></div>
                      <div><Label>Closing Costs %</Label><Input placeholder="0.02" value={form.closingCostsPct} onChange={f("closingCostsPct")} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Interest Rate</Label><Input placeholder="0.07" value={form.interestRate} onChange={f("interestRate")} /></div>
                      <div><Label>Loan Term (years)</Label><Input placeholder="30" value={form.loanTermYears} onChange={f("loanTermYears")} /></div>
                    </div>
                    <div><Label>PMI % (0 if 20%+ down)</Label><Input placeholder="0" value={form.pmiPct} onChange={f("pmiPct")} /></div>
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label>Furnishing</Label><Input placeholder="40000" value={form.furnishingBudget} onChange={f("furnishingBudget")} /></div>
                      <div><Label>Startup Costs</Label><Input placeholder="5000" value={form.startupCosts} onChange={f("startupCosts")} /></div>
                      <div><Label>Other Cash</Label><Input placeholder="0" value={form.otherCashNeeded} onChange={f("otherCashNeeded")} /></div>
                    </div>
                    <div><Label>Property Listing Link</Label><Input placeholder="https://..." value={form.propertyLink} onChange={f("propertyLink")} /></div>
                  </CardContent>
                </Card>

                {/* Revenue */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> Revenue Projections (Annual)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div><Label>Scenario 1 (Year 1) *</Label><Input placeholder="81600" value={form.revenueScenario1} onChange={f("revenueScenario1")} /></div>
                    <div><Label>Scenario 2 (Year 2)</Label><Input placeholder="Auto: Year 1 + appreciation" value={form.revenueScenario2} onChange={f("revenueScenario2")} /></div>
                    <div><Label>Scenario 3 (Year 3)</Label><Input placeholder="Auto: Year 2 + appreciation" value={form.revenueScenario3} onChange={f("revenueScenario3")} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Revenue Appreciation %</Label><Input placeholder="0.03" value={form.revenueAppreciationPct} onChange={f("revenueAppreciationPct")} /></div>
                      <div><Label>Property Appreciation %</Label><Input placeholder="0.04" value={form.propertyAppreciationPct} onChange={f("propertyAppreciationPct")} /></div>
                    </div>
                    <div><Label>Notes</Label><Textarea placeholder="Additional notes..." value={form.notes} onChange={f("notes")} rows={3} /></div>
                  </CardContent>
                </Card>

                {/* Fixed Expenses */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fixed Monthly Expenses</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Utilities</Label><Input placeholder="600" value={form.expUtilities} onChange={f("expUtilities")} /></div>
                      <div><Label>Insurance</Label><Input placeholder="300" value={form.expInsurance} onChange={f("expInsurance")} /></div>
                      <div><Label>Internet/Cable</Label><Input placeholder="200" value={form.expInternet} onChange={f("expInternet")} /></div>
                      <div><Label>Landscaping</Label><Input placeholder="100" value={form.expLandscaping} onChange={f("expLandscaping")} /></div>
                      <div><Label>Routine Repairs</Label><Input placeholder="100" value={form.expRepairs} onChange={f("expRepairs")} /></div>
                      <div><Label>Supplies</Label><Input placeholder="100" value={form.expSupplies} onChange={f("expSupplies")} /></div>
                      <div><Label>Software</Label><Input placeholder="50" value={form.expSoftware} onChange={f("expSoftware")} /></div>
                      <div><Label>Pest Control</Label><Input placeholder="50" value={form.expPestControl} onChange={f("expPestControl")} /></div>
                      <div><Label>Permits/Licenses</Label><Input placeholder="0" value={form.expPermits} onChange={f("expPermits")} /></div>
                      <div><Label>Property Tax (Annual)</Label><Input placeholder="2400" value={form.expPropertyTaxAnnual} onChange={f("expPropertyTaxAnnual")} /></div>
                      <div><Label>Other</Label><Input placeholder="0" value={form.expOther} onChange={f("expOther")} /></div>
                    </div>
                  </CardContent>
                </Card>

                {/* Variable Expenses */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Variable Expenses</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>CapEx/Maintenance Reserve %</Label><Input placeholder="0.05" value={form.maintenanceReservePct} onChange={f("maintenanceReservePct")} /></div>
                      <div><Label>OTA/Platform Fees %</Label><Input placeholder="0.03" value={form.otaFeePct} onChange={f("otaFeePct")} /></div>
                    </div>
                    <div><Label>Property Management %</Label><Input placeholder="0 (self-managed)" value={form.propertyMgmtPct} onChange={f("propertyMgmtPct")} /></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label>Cleaning Cost/Turn</Label><Input placeholder="150" value={form.cleaningCostPerTurn} onChange={f("cleaningCostPerTurn")} /></div>
                      <div><Label>Avg Turns/Month</Label><Input placeholder="8" value={form.avgTurnsPerMonth} onChange={f("avgTurnsPerMonth")} /></div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ─── RESULTS TAB ────────────────────────────────────────────────── */}
            <TabsContent value="results">
              {(!form.purchasePrice || !form.revenueScenario1) ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">Enter purchase price and at least Scenario 1 revenue to see results.</CardContent></Card>
              ) : (
                <div className="space-y-6">
                  {/* Key Metrics Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-emerald-600 font-semibold uppercase">Total Cash Needed</p>
                        <p className="text-xl font-bold text-emerald-800">{fmt(calcs.totalCashNeeded)}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-blue-600 font-semibold uppercase">Monthly Mortgage</p>
                        <p className="text-xl font-bold text-blue-800">{fmt(calcs.totalMonthlyPayment)}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-purple-50 border-purple-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-purple-600 font-semibold uppercase">Year 1 Cash Flow</p>
                        <p className="text-xl font-bold text-purple-800">{fmt(calcs.scenario1.cashFlowAnnual)}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-amber-50 border-amber-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-xs text-amber-600 font-semibold uppercase">Year 1 CoC Return</p>
                        <p className="text-xl font-bold text-amber-800">{pct(calcs.scenario1.cashOnCash)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Scenario Comparison Table */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Scenario Comparison</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-3 font-semibold">Metric</th>
                              <th className="text-right py-2 px-3 font-semibold">Year 1</th>
                              <th className="text-right py-2 px-3 font-semibold">Year 2</th>
                              <th className="text-right py-2 px-3 font-semibold">Year 3</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b"><td className="py-2 px-3">Gross Revenue</td><td className="text-right py-2 px-3">{fmt(calcs.scenario1.annualRevenue)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario2.annualRevenue)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario3.annualRevenue)}</td></tr>
                            <tr className="border-b"><td className="py-2 px-3">Total Expenses (Annual)</td><td className="text-right py-2 px-3">{fmt(calcs.scenario1.totalExpensesMonthly * 12)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario2.totalExpensesMonthly * 12)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario3.totalExpensesMonthly * 12)}</td></tr>
                            <tr className="border-b font-semibold"><td className="py-2 px-3">Net Operating Income</td><td className="text-right py-2 px-3">{fmt(calcs.scenario1.noiAnnual)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario2.noiAnnual)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario3.noiAnnual)}</td></tr>
                            <tr className="border-b"><td className="py-2 px-3">Mortgage (Annual)</td><td className="text-right py-2 px-3">{fmt(calcs.totalMonthlyPayment * 12)}</td><td className="text-right py-2 px-3">{fmt(calcs.totalMonthlyPayment * 12)}</td><td className="text-right py-2 px-3">{fmt(calcs.totalMonthlyPayment * 12)}</td></tr>
                            <tr className="border-b font-semibold bg-emerald-50"><td className="py-2 px-3">Net Cash Flow</td><td className="text-right py-2 px-3">{fmt(calcs.scenario1.cashFlowAnnual)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario2.cashFlowAnnual)}</td><td className="text-right py-2 px-3">{fmt(calcs.scenario3.cashFlowAnnual)}</td></tr>
                            <tr className="border-b"><td className="py-2 px-3">Cash-on-Cash Return</td><td className="text-right py-2 px-3">{pct(calcs.scenario1.cashOnCash)}</td><td className="text-right py-2 px-3">{pct(calcs.scenario2.cashOnCash)}</td><td className="text-right py-2 px-3">{pct(calcs.scenario3.cashOnCash)}</td></tr>
                            <tr className="border-b"><td className="py-2 px-3">Cap Rate</td><td className="text-right py-2 px-3">{pct(calcs.scenario1.capRate)}</td><td className="text-right py-2 px-3">{pct(calcs.scenario2.capRate)}</td><td className="text-right py-2 px-3">{pct(calcs.scenario3.capRate)}</td></tr>
                            <tr className="border-b"><td className="py-2 px-3">Gross ROI</td><td className="text-right py-2 px-3">{pct(calcs.scenario1.grossROI)}</td><td className="text-right py-2 px-3">{pct(calcs.scenario2.grossROI)}</td><td className="text-right py-2 px-3">{pct(calcs.scenario3.grossROI)}</td></tr>
                            <tr className="border-b"><td className="py-2 px-3">DSCR</td><td className="text-right py-2 px-3">{calcs.scenario1.dscr.toFixed(2)}x</td><td className="text-right py-2 px-3">{calcs.scenario2.dscr.toFixed(2)}x</td><td className="text-right py-2 px-3">{calcs.scenario3.dscr.toFixed(2)}x</td></tr>
                            <tr><td className="py-2 px-3">Break-Even (Years)</td><td className="text-right py-2 px-3">{calcs.scenario1.breakEvenYears === Infinity ? "N/A" : calcs.scenario1.breakEvenYears.toFixed(1)}</td><td className="text-right py-2 px-3">{calcs.scenario2.breakEvenYears === Infinity ? "N/A" : calcs.scenario2.breakEvenYears.toFixed(1)}</td><td className="text-right py-2 px-3">{calcs.scenario3.breakEvenYears === Infinity ? "N/A" : calcs.scenario3.breakEvenYears.toFixed(1)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Purchase Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Purchase Summary</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Purchase Price</span><span className="font-semibold">{fmt(calcs.purchasePrice)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Down Payment ({pct(calcs.downPaymentPct)})</span><span>{fmt(calcs.downPayment)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Closing Costs ({pct(calcs.closingCostsPct)})</span><span>{fmt(calcs.closingCosts)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Furnishing Budget</span><span>{fmt(calcs.furnishingBudget)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Startup Costs</span><span>{fmt(calcs.startupCosts)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Other</span><span>{fmt(calcs.otherCashNeeded)}</span></div>
                        <div className="flex justify-between border-t pt-1 font-semibold"><span>Total Cash Needed</span><span className="text-emerald-700">{fmt(calcs.totalCashNeeded)}</span></div>
                        <div className="flex justify-between border-t pt-1 mt-2"><span className="text-muted-foreground">Loan Amount</span><span>{fmt(calcs.loanAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Monthly Mortgage</span><span>{fmt(calcs.totalMonthlyPayment)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Rate / Term</span><span>{pct(calcs.interestRate)} / {calcs.loanTermYears}yr</span></div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Appreciation & Equity</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Property Appreciation</span><span>{pct(calcs.propertyAppreciation)}/yr</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Revenue Appreciation</span><span>{pct(calcs.revenueAppreciation)}/yr</span></div>
                        <div className="border-t pt-2 mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Estimated Equity Growth from Appreciation:</p>
                          <div className="flex justify-between"><span className="text-muted-foreground">Year 1</span><span className="text-emerald-700">+{fmt(calcs.equityYear1)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Year 2</span><span className="text-emerald-700">+{fmt(calcs.equityYear2)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Year 3</span><span className="text-emerald-700">+{fmt(calcs.equityYear3)}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ─── COMPS TAB ──────────────────────────────────────────────────── */}
            <TabsContent value="comps">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Revenue Comparable Properties</CardTitle>
                  <p className="text-xs text-muted-foreground">Enter data from comparable STR listings to support your revenue projections.</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="border rounded-lg p-4">
                        <p className="text-sm font-semibold mb-3">Comp {n}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div><Label>Annual Revenue</Label><Input placeholder="80000" value={(form as any)[`comp${n}Revenue`]} onChange={f(`comp${n}Revenue`)} /></div>
                          <div><Label>Occupancy %</Label><Input placeholder="0.75" value={(form as any)[`comp${n}Occupancy`]} onChange={f(`comp${n}Occupancy`)} /></div>
                          <div><Label>ADR</Label><Input placeholder="250" value={(form as any)[`comp${n}ADR`]} onChange={f(`comp${n}ADR`)} /></div>
                          <div><Label>Bedrooms</Label><Input placeholder="3" value={(form as any)[`comp${n}Beds`]} onChange={f(`comp${n}Beds`)} /></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                          <div><Label>Listing Link</Label><Input placeholder="https://airbnb.com/..." value={(form as any)[`comp${n}Link`]} onChange={f(`comp${n}Link`)} /></div>
                          <div><Label>Notes</Label><Input placeholder="Notes about this comp" value={(form as any)[`comp${n}Notes`]} onChange={f(`comp${n}Notes`)} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
