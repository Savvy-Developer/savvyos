import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { ArrowLeft, FileText, Save, Plus, Trash2, Download, TrendingUp, DollarSign, Home, Calculator, BarChart3, Shield, BookOpen } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Formatting Helpers ──────────────────────────────────────────────────────
const fmtDollar = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "$0";
  return `$${Math.round(val).toLocaleString()}`;
};
const fmtPct = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "0%";
  return `${(val * 100).toFixed(2)}%`;
};
const fmtPctWhole = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "0%";
  return `${(val * 100).toFixed(1)}%`;
};

// Parse a percentage input (user types "20" meaning 20%)
const parsePct = (val: string): number => {
  const n = parseFloat(val);
  if (isNaN(n)) return 0;
  return n / 100;
};
const parseNum = (val: string): number => {
  const cleaned = val.replace(/[$,]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

// PMT function
const pmt = (rate: number, nper: number, pv: number): number => {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
};

// ─── Form State Type ─────────────────────────────────────────────────────────
interface ProformaForm {
  // Acquisition
  purchasePrice: string;
  downPaymentPct: string;
  closingCostsPct: string;
  furnishingBudget: string;
  renovationBudget: string;
  startupCosts: string;
  inspectionCosts: string;
  otherCashNeeded: string;
  propertyLink: string;

  // Financing
  interestRate: string;
  loanTermYears: string;
  pmiPct: string;
  loanType: string; // "conventional" | "dscr" | "cash"

  // Revenue Scenarios (each has ADR + Occupancy + Available Nights)
  scenario1ADR: string;
  scenario1Occupancy: string;
  scenario1AvailableNights: string;
  scenario1CleaningFeeRevenue: string;
  scenario1AncillaryRevenue: string;
  scenario2ADR: string;
  scenario2Occupancy: string;
  scenario2AvailableNights: string;
  scenario2CleaningFeeRevenue: string;
  scenario2AncillaryRevenue: string;
  scenario3ADR: string;
  scenario3Occupancy: string;
  scenario3AvailableNights: string;
  scenario3CleaningFeeRevenue: string;
  scenario3AncillaryRevenue: string;
  avgLengthOfStay: string;

  // Channel Mix & Fees
  channelAirbnbPct: string;
  channelVrboPct: string;
  channelDirectPct: string;
  feeAirbnb: string; // 15.5%
  feeVrbo: string; // 8%
  feeDirect: string; // 3%

  // Appreciation
  revenueAppreciationPct: string;
  propertyAppreciationPct: string;
  expenseInflationPct: string;

  // Fixed Expenses (monthly amounts)
  expUtilities: string;
  expInsuranceAnnual: string;
  expPropertyTaxAnnual: string;
  expHOA: string;
  expInternet: string;
  expLandscaping: string;
  expPestControl: string;
  expHotTubPool: string;
  expPMSSoftware: string;
  expDynamicPricing: string;
  expSmartLocks: string;
  expAccounting: string;
  expPermits: string;
  expOtherFixed: string;

  // Variable Expenses
  propertyMgmtPct: string;
  cleaningCostPerTurn: string;
  laundryPerTurn: string;
  suppliesPerTurn: string;
  capExReservePct: string;
  linenReplacementAnnual: string;
  routineRepairsMonthly: string;
  otherVariableMonthly: string;

  // Tax / Cost Segregation
  costSegEnabled: string; // "yes" | "no"
  landAllocationPct: string;
  acceleratedDepreciationPct: string;
  marginalTaxRate: string;
  costSegStudyCost: string;

  // Comps
  comps: Array<{
    name: string;
    annualRevenue: string;
    occupancy: string;
    adr: string;
    beds: string;
    link: string;
    notes: string;
  }>;

  // Notes
  notes: string;
  revenueMethodology: string;
}

const defaultForm: ProformaForm = {
  purchasePrice: "",
  downPaymentPct: "20",
  closingCostsPct: "2",
  furnishingBudget: "25000",
  renovationBudget: "0",
  startupCosts: "5000",
  inspectionCosts: "1500",
  otherCashNeeded: "0",
  propertyLink: "",
  interestRate: "7",
  loanTermYears: "30",
  pmiPct: "0",
  loanType: "dscr",
  scenario1ADR: "",
  scenario1Occupancy: "65",
  scenario1AvailableNights: "365",
  scenario1CleaningFeeRevenue: "0",
  scenario1AncillaryRevenue: "0",
  scenario2ADR: "",
  scenario2Occupancy: "72",
  scenario2AvailableNights: "365",
  scenario2CleaningFeeRevenue: "0",
  scenario2AncillaryRevenue: "0",
  scenario3ADR: "",
  scenario3Occupancy: "80",
  scenario3AvailableNights: "365",
  scenario3CleaningFeeRevenue: "0",
  scenario3AncillaryRevenue: "0",
  avgLengthOfStay: "3.5",
  channelAirbnbPct: "60",
  channelVrboPct: "25",
  channelDirectPct: "15",
  feeAirbnb: "15.5",
  feeVrbo: "8",
  feeDirect: "3",
  revenueAppreciationPct: "3",
  propertyAppreciationPct: "4",
  expenseInflationPct: "3",
  expUtilities: "400",
  expInsuranceAnnual: "3600",
  expPropertyTaxAnnual: "3000",
  expHOA: "0",
  expInternet: "100",
  expLandscaping: "100",
  expPestControl: "50",
  expHotTubPool: "100",
  expPMSSoftware: "50",
  expDynamicPricing: "40",
  expSmartLocks: "20",
  expAccounting: "150",
  expPermits: "0",
  expOtherFixed: "0",
  propertyMgmtPct: "0",
  cleaningCostPerTurn: "150",
  laundryPerTurn: "30",
  suppliesPerTurn: "20",
  capExReservePct: "5",
  linenReplacementAnnual: "1500",
  routineRepairsMonthly: "100",
  otherVariableMonthly: "0",
  costSegEnabled: "no",
  landAllocationPct: "20",
  acceleratedDepreciationPct: "25",
  marginalTaxRate: "35",
  costSegStudyCost: "7500",
  comps: [],
  notes: "",
  revenueMethodology: "We run our projections with best and highest use of the STR in mind. We assume top-tier amenities and aesthetics and pull revenue from comparable top-performing STRs. This initial projection requires further due diligence.",
};

export default function ProformaPage() {
  const { id: propId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const propertyId = parseInt(propId || "0");

  const [form, setForm] = useState<ProformaForm>(defaultForm);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("STR Investment Analysis");
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Fetch property details
  const { data: property } = trpc.properties.get.useQuery({ id: propertyId });
  // Fetch existing proformas
  const { data: proformas, refetch } = trpc.properties.listProformas.useQuery({ propertyId });
  // Fetch user profile for branding (core profile has headshot)
  const { data: coreProfile } = trpc.users.getCoreProfile.useQuery({ userId: user?.id ?? 0 }, { enabled: !!user?.id });
  const { data: userRecord } = trpc.users.getById.useQuery({ id: user?.id ?? 0 }, { enabled: !!user?.id });

  const createMutation = trpc.properties.createProforma.useMutation({ onSuccess: () => { refetch(); setEditing(false); } });
  const updateMutation = trpc.properties.updateProforma.useMutation({ onSuccess: () => { refetch(); } });
  const deleteMutation = trpc.properties.deleteProforma.useMutation({ onSuccess: () => { refetch(); } });

  // ─── CALCULATIONS ──────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const pp = parseNum(form.purchasePrice);
    const downPct = parsePct(form.downPaymentPct);
    const closingPct = parsePct(form.closingCostsPct);
    const furnishing = parseNum(form.furnishingBudget);
    const renovation = parseNum(form.renovationBudget);
    const startup = parseNum(form.startupCosts);
    const inspection = parseNum(form.inspectionCosts);
    const otherCash = parseNum(form.otherCashNeeded);

    const downPayment = pp * downPct;
    const closingCosts = pp * closingPct;
    const loanAmount = pp - downPayment;
    const totalCashNeeded = downPayment + closingCosts + furnishing + renovation + startup + inspection + otherCash;

    // Financing
    const rate = parsePct(form.interestRate);
    const termYears = parseNum(form.loanTermYears);
    const monthlyRate = rate / 12;
    const totalPayments = termYears * 12;
    const monthlyPI = form.loanType === "cash" ? 0 : -pmt(monthlyRate, totalPayments, loanAmount);
    const monthlyPMI = (loanAmount * parsePct(form.pmiPct)) / 12;
    const monthlyMortgage = monthlyPI + monthlyPMI;
    const annualDebtService = monthlyMortgage * 12;

    // Channel mix fees (blended rate)
    const airbnbPct = parsePct(form.channelAirbnbPct);
    const vrboPct = parsePct(form.channelVrboPct);
    const directPct = parsePct(form.channelDirectPct);
    const feeAirbnb = parsePct(form.feeAirbnb);
    const feeVrbo = parsePct(form.feeVrbo);
    const feeDirect = parsePct(form.feeDirect);
    const blendedFeeRate = (airbnbPct * feeAirbnb) + (vrboPct * feeVrbo) + (directPct * feeDirect);

    // Fixed monthly expenses
    const fixedMonthly = parseNum(form.expUtilities) + (parseNum(form.expInsuranceAnnual) / 12) +
      (parseNum(form.expPropertyTaxAnnual) / 12) + parseNum(form.expHOA) + parseNum(form.expInternet) +
      parseNum(form.expLandscaping) + parseNum(form.expPestControl) + parseNum(form.expHotTubPool) +
      parseNum(form.expPMSSoftware) + parseNum(form.expDynamicPricing) + parseNum(form.expSmartLocks) +
      parseNum(form.expAccounting) + parseNum(form.expPermits) + parseNum(form.expOtherFixed);
    const fixedAnnual = fixedMonthly * 12;

    // Per-scenario calculations
    const calcScenario = (adrStr: string, occStr: string, nightsStr: string, cleaningRevStr: string, ancillaryStr: string) => {
      const adr = parseNum(adrStr);
      const occ = parsePct(occStr);
      const availNights = parseNum(nightsStr) || 365;
      const soldNights = Math.round(availNights * occ);
      const avgLOS = parseNum(form.avgLengthOfStay) || 3.5;
      const bookings = soldNights / avgLOS;

      // Revenue
      const nightlyRevenue = adr * soldNights;
      const cleaningFeeRevenue = parseNum(cleaningRevStr);
      const ancillaryRevenue = parseNum(ancillaryStr);
      const grossRevenue = nightlyRevenue + cleaningFeeRevenue + ancillaryRevenue;

      // Platform fees
      const platformFees = grossRevenue * blendedFeeRate;
      const netRevenue = grossRevenue - platformFees;

      // Variable expenses
      const mgmtPct = parsePct(form.propertyMgmtPct);
      const mgmtExpense = netRevenue * mgmtPct;
      const cleaningExpense = parseNum(form.cleaningCostPerTurn) * bookings;
      const laundryExpense = parseNum(form.laundryPerTurn) * bookings;
      const suppliesExpense = parseNum(form.suppliesPerTurn) * bookings;
      const capExReserve = grossRevenue * parsePct(form.capExReservePct);
      const linenReplace = parseNum(form.linenReplacementAnnual);
      const routineRepairs = parseNum(form.routineRepairsMonthly) * 12;
      const otherVariable = parseNum(form.otherVariableMonthly) * 12;
      const totalVariableAnnual = mgmtExpense + cleaningExpense + laundryExpense + suppliesExpense + capExReserve + linenReplace + routineRepairs + otherVariable;

      // Totals
      const totalExpensesAnnual = fixedAnnual + totalVariableAnnual;
      const noi = netRevenue - totalExpensesAnnual;
      const cashFlow = noi - annualDebtService;
      const monthlyCashFlow = cashFlow / 12;

      // Returns
      const cashOnCash = totalCashNeeded > 0 ? cashFlow / totalCashNeeded : 0;
      const capRate = pp > 0 ? noi / pp : 0;
      const grossYield = pp > 0 ? grossRevenue / pp : 0;
      const dscr = annualDebtService > 0 ? noi / annualDebtService : Infinity;
      const noiMargin = netRevenue > 0 ? noi / netRevenue : 0;

      // Break-even occupancy: find occ where cashFlow = 0
      // cashFlow = (ADR * nights * occ + ancillary - fees) - fixedExp - variableExp - debtService = 0
      // Simplified: solve for occ
      const breakEvenOcc = annualDebtService + fixedAnnual + linenReplace + routineRepairs + otherVariable > 0 && adr > 0
        ? (() => {
          // Revenue at occ X: adr * availNights * X
          // Fees: blendedFeeRate * adr * availNights * X
          // Variable (occ-dependent): mgmtPct * netRev + cleaning/turn * (availNights*X/avgLOS) + supplies + capEx
          // Solve iteratively
          const target = fixedAnnual + annualDebtService + linenReplace + routineRepairs + otherVariable;
          const perNight = adr * (1 - blendedFeeRate) * (1 - mgmtPct) - (parseNum(form.cleaningCostPerTurn) + parseNum(form.laundryPerTurn) + parseNum(form.suppliesPerTurn)) / avgLOS - adr * parsePct(form.capExReservePct);
          return perNight > 0 ? target / (perNight * availNights) : 1;
        })()
        : 0;

      const paybackYears = cashFlow > 0 ? totalCashNeeded / cashFlow : Infinity;

      return {
        adr, occ, availNights, soldNights, bookings,
        nightlyRevenue, cleaningFeeRevenue, ancillaryRevenue, grossRevenue,
        platformFees, netRevenue,
        mgmtExpense, cleaningExpense, laundryExpense, suppliesExpense, capExReserve,
        linenReplace, routineRepairs, otherVariable, totalVariableAnnual,
        fixedAnnual, totalExpensesAnnual,
        noi, noiMargin, cashFlow, monthlyCashFlow,
        cashOnCash, capRate, grossYield, dscr, breakEvenOcc, paybackYears,
      };
    };

    const s1 = calcScenario(form.scenario1ADR, form.scenario1Occupancy, form.scenario1AvailableNights, form.scenario1CleaningFeeRevenue, form.scenario1AncillaryRevenue);
    const s2 = calcScenario(form.scenario2ADR, form.scenario2Occupancy, form.scenario2AvailableNights, form.scenario2CleaningFeeRevenue, form.scenario2AncillaryRevenue);
    const s3 = calcScenario(form.scenario3ADR, form.scenario3Occupancy, form.scenario3AvailableNights, form.scenario3CleaningFeeRevenue, form.scenario3AncillaryRevenue);

    // 5-year projection (using scenario 2 as base)
    const revAppreciation = parsePct(form.revenueAppreciationPct);
    const propAppreciation = parsePct(form.propertyAppreciationPct);
    const expInflation = parsePct(form.expenseInflationPct);
    const fiveYear = Array.from({ length: 5 }, (_, i) => {
      const year = i + 1;
      const revGrowth = Math.pow(1 + revAppreciation, i);
      const expGrowth = Math.pow(1 + expInflation, i);
      const propValue = pp * Math.pow(1 + propAppreciation, year);
      const yearRev = s2.netRevenue * revGrowth;
      const yearExp = (s2.fixedAnnual + s2.totalVariableAnnual) * expGrowth;
      const yearNoi = yearRev - yearExp;
      const yearCF = yearNoi - annualDebtService;
      // Principal paydown (approximate)
      const principalPaid = monthlyPI > 0 ? (() => {
        let balance = loanAmount;
        for (let m = 0; m < year * 12; m++) {
          const interest = balance * monthlyRate;
          const principal = monthlyPI - interest;
          balance -= principal;
        }
        return loanAmount - balance;
      })() : 0;
      const equity = downPayment + principalPaid + (propValue - pp);
      return { year, revenue: yearRev, expenses: yearExp, noi: yearNoi, cashFlow: yearCF, propertyValue: propValue, equity, principalPaid };
    });

    // Cost Segregation
    const costSegEnabled = form.costSegEnabled === "yes";
    const buildingBasis = pp * (1 - parsePct(form.landAllocationPct));
    const acceleratedAmt = buildingBasis * parsePct(form.acceleratedDepreciationPct);
    const furnishingDeduction = furnishing; // 100% bonus on furnishings
    const totalFirstYearDeduction = costSegEnabled ? acceleratedAmt + furnishingDeduction : furnishingDeduction;
    const taxSavings = totalFirstYearDeduction * parsePct(form.marginalTaxRate);
    const costSegCost = parseNum(form.costSegStudyCost);
    const netTaxBenefit = taxSavings - (costSegEnabled ? costSegCost : 0);

    return {
      pp, downPayment, closingCosts, loanAmount, totalCashNeeded,
      furnishing, renovation, startup, inspection, otherCash,
      monthlyMortgage, annualDebtService, monthlyPI, monthlyPMI,
      fixedMonthly, fixedAnnual, blendedFeeRate,
      s1, s2, s3, fiveYear,
      costSegEnabled, buildingBasis, acceleratedAmt, furnishingDeduction,
      totalFirstYearDeduction, taxSavings, costSegCost, netTaxBenefit,
    };
  }, [form]);

  // ─── Field Change Handler ──────────────────────────────────────────────────
  const setField = useCallback((field: keyof ProformaForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  // ─── Save / Load ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = { ...form, _calcGrossRevenue: calc.s2.grossRevenue, _calcNoi: calc.s2.noi, _calcCashFlow: calc.s2.cashFlow, _calcCashOnCash: calc.s2.cashOnCash, _calcCapRate: calc.s2.capRate };
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, title, formData, notes: form.notes });
      } else {
        const result = await createMutation.mutateAsync({ propertyId, title, formData, notes: form.notes });
        setEditingId(result.id);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleLoad = (proforma: any) => {
    const fd = proforma.formData as ProformaForm;
    setForm({ ...defaultForm, ...fd });
    setTitle(proforma.title || "STR Investment Analysis");
    setEditingId(proforma.id);
    setEditing(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this pro-forma?")) return;
    await deleteMutation.mutateAsync({ id });
    if (editingId === id) { setEditing(false); setEditingId(null); setForm(defaultForm); }
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const response = await fetch("/api/proforma/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          calc: {
            pp: calc.pp, downPayment: calc.downPayment, closingCosts: calc.closingCosts,
            loanAmount: calc.loanAmount, totalCashNeeded: calc.totalCashNeeded,
            monthlyMortgage: calc.monthlyMortgage, annualDebtService: calc.annualDebtService,
            fixedMonthly: calc.fixedMonthly, fixedAnnual: calc.fixedAnnual,
            blendedFeeRate: calc.blendedFeeRate,
            s1: calc.s1, s2: calc.s2, s3: calc.s3, fiveYear: calc.fiveYear,
            costSegEnabled: calc.costSegEnabled, totalFirstYearDeduction: calc.totalFirstYearDeduction,
            taxSavings: calc.taxSavings, netTaxBenefit: calc.netTaxBenefit,
          },
          property: property ? { address: property.address, city: property.city, state: property.state, zip: property.zip, beds: property.beds, baths: property.baths, sqft: property.sqft, propertyType: property.propertyType } : null,
          branding: userRecord ? { name: userRecord.name, email: userRecord.email, phone: userRecord.phone, market: (coreProfile as any)?.market || "", profilePhotoUrl: (coreProfile as any)?.profilePhotoUrl || "", callBookingLink: (coreProfile as any)?.callBookingLink || "" } : null,
          title,
        }),
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Proforma_${property?.address?.replace(/[^a-zA-Z0-9]/g, "_") || "property"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
    setDownloading(false);
  };

  // ─── Reusable Input Components ─────────────────────────────────────────────
  const DollarInput = ({ label, field, placeholder }: { label: string; field: keyof ProformaForm; placeholder?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
        <Input className="pl-6 h-8 text-sm" value={form[field] as string} onChange={e => setField(field, e.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );

  const PctInput = ({ label, field, placeholder, calculatedAmount }: { label: string; field: keyof ProformaForm; placeholder?: string; calculatedAmount?: number }) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      <div className="relative">
        <Input className="pr-6 h-8 text-sm" value={form[field] as string} onChange={e => setField(field, e.target.value)} placeholder={placeholder} />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
      </div>
      {calculatedAmount !== undefined && calculatedAmount > 0 && (
        <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calculatedAmount)}</p>
      )}
    </div>
  );

  const NumberInput = ({ label, field, placeholder, suffix }: { label: string; field: keyof ProformaForm; placeholder?: string; suffix?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      <div className="relative">
        <Input className={`h-8 text-sm ${suffix ? "pr-12" : ""}`} value={form[field] as string} onChange={e => setField(field, e.target.value)} placeholder={placeholder} />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{suffix}</span>}
      </div>
    </div>
  );

  const ExpenseRow = ({ label, field, annual }: { label: string; field: keyof ProformaForm; annual?: boolean }) => {
    const val = parseNum(form[field] as string);
    const monthly = annual ? val / 12 : val;
    const yearly = annual ? val : val * 12;
    return (
      <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
        <Label className="text-xs text-slate-600 flex-1">{label}</Label>
        <div className="flex items-center gap-2">
          <div className="relative w-24">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
            <Input className="pl-5 h-7 text-xs w-full" value={form[field] as string} onChange={e => setField(field, e.target.value)} />
          </div>
          <span className="text-xs text-slate-400 w-8">{annual ? "/yr" : "/mo"}</span>
          <span className="text-xs text-slate-500 w-20 text-right">
            {annual ? `${fmtDollar(monthly)}/mo` : `${fmtDollar(yearly)}/yr`}
          </span>
        </div>
      </div>
    );
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if (!editing) {
    // List view
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/properties/${propertyId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Property
          </Button>
        </div>
        <PageHeader
          title="Pro-forma Analysis"
          subtitle={property ? `${property.address}, ${property.city} ${property.state}` : ""}
          actions={<Button size="sm" onClick={() => setEditing(true)}><Plus className="h-4 w-4 mr-1" /> New Pro-forma</Button>}
        />
        {proformas && proformas.length > 0 ? (
          <div className="space-y-3 mt-6">
            {proformas.map((p: any) => (
              <Card key={p.id} className="cursor-pointer hover:border-cyan-300 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                  <div onClick={() => handleLoad(p)} className="flex-1">
                    <h3 className="font-medium text-sm">{p.title || "Untitled"}</h3>
                    <div className="flex gap-4 mt-1 text-xs text-slate-500">
                      {p.purchasePrice && <span>Purchase: {fmtDollar(parseFloat(p.purchasePrice))}</span>}
                      {p.cashOnCash && <span>CoC: {fmtPct(parseFloat(p.cashOnCash))}</span>}
                      {p.capRate && <span>Cap: {fmtPct(parseFloat(p.capRate))}</span>}
                      <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mt-6">
            <CardContent className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 mb-4">No pro-formas created yet for this property.</p>
              <Button onClick={() => setEditing(true)}><Plus className="h-4 w-4 mr-1" /> Create Pro-forma</Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ─── EDITING VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditingId(null); setForm(defaultForm); }}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloading}>
            <Download className="h-4 w-4 mr-1" /> {downloading ? "Generating..." : "Download PDF"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Title */}
      <div className="mb-4">
        <Input className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0" value={title} onChange={e => setTitle(e.target.value)} placeholder="Pro-forma Title" />
        <p className="text-sm text-slate-500">{property?.address}, {property?.city} {property?.state} {property?.zip}</p>
      </div>

      <Tabs defaultValue="acquisition" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="acquisition" className="text-xs"><Home className="h-3 w-3 mr-1" />Acquisition</TabsTrigger>
          <TabsTrigger value="financing" className="text-xs"><Calculator className="h-3 w-3 mr-1" />Financing</TabsTrigger>
          <TabsTrigger value="revenue" className="text-xs"><DollarSign className="h-3 w-3 mr-1" />Revenue</TabsTrigger>
          <TabsTrigger value="expenses" className="text-xs"><BarChart3 className="h-3 w-3 mr-1" />Expenses</TabsTrigger>
          <TabsTrigger value="returns" className="text-xs"><TrendingUp className="h-3 w-3 mr-1" />Returns</TabsTrigger>
          <TabsTrigger value="tax" className="text-xs"><Shield className="h-3 w-3 mr-1" />Tax Benefits</TabsTrigger>
          <TabsTrigger value="comps" className="text-xs"><BookOpen className="h-3 w-3 mr-1" />Comps</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs"><FileText className="h-3 w-3 mr-1" />Notes</TabsTrigger>
        </TabsList>

        {/* ─── TAB: ACQUISITION ─────────────────────────────────────────────── */}
        <TabsContent value="acquisition">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Home className="h-4 w-4" /> Purchase Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <DollarInput label="Purchase Price *" field="purchasePrice" placeholder="700,000" />
                <div className="grid grid-cols-2 gap-3">
                  <PctInput label="Down Payment" field="downPaymentPct" placeholder="20" calculatedAmount={calc.downPayment} />
                  <PctInput label="Closing Costs" field="closingCostsPct" placeholder="2" calculatedAmount={calc.closingCosts} />
                </div>
                <DollarInput label="Furnishing Budget" field="furnishingBudget" placeholder="25,000" />
                <DollarInput label="Renovation Budget" field="renovationBudget" placeholder="0" />
                <DollarInput label="Startup Costs (photography, listing, supplies)" field="startupCosts" placeholder="5,000" />
                <DollarInput label="Inspection Costs" field="inspectionCosts" placeholder="1,500" />
                <DollarInput label="Other Cash Needed" field="otherCashNeeded" placeholder="0" />
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Property Listing Link</Label>
                  <Input className="h-8 text-sm" value={form.propertyLink} onChange={e => setField("propertyLink", e.target.value)} placeholder="https://..." />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Cash to Close Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span>Down Payment ({form.downPaymentPct}%)</span><span className="font-medium">{fmtDollar(calc.downPayment)}</span></div>
                  <div className="flex justify-between text-sm"><span>Closing Costs ({form.closingCostsPct}%)</span><span className="font-medium">{fmtDollar(calc.closingCosts)}</span></div>
                  <div className="flex justify-between text-sm"><span>Furnishing</span><span className="font-medium">{fmtDollar(calc.furnishing)}</span></div>
                  <div className="flex justify-between text-sm"><span>Renovation</span><span className="font-medium">{fmtDollar(calc.renovation)}</span></div>
                  <div className="flex justify-between text-sm"><span>Startup Costs</span><span className="font-medium">{fmtDollar(calc.startup)}</span></div>
                  <div className="flex justify-between text-sm"><span>Inspections</span><span className="font-medium">{fmtDollar(calc.inspection)}</span></div>
                  {calc.otherCash > 0 && <div className="flex justify-between text-sm"><span>Other</span><span className="font-medium">{fmtDollar(calc.otherCash)}</span></div>}
                  <div className="border-t pt-2 flex justify-between text-base font-bold text-emerald-700">
                    <span>Total Cash Needed</span><span>{fmtDollar(calc.totalCashNeeded)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── TAB: FINANCING ──────────────────────────────────────────────── */}
        <TabsContent value="financing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Loan Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Loan Type</Label>
                  <select className="w-full h-8 text-sm border rounded px-2" value={form.loanType} onChange={e => setField("loanType", e.target.value)}>
                    <option value="dscr">DSCR Loan</option>
                    <option value="conventional">Conventional Investment</option>
                    <option value="cash">All Cash (No Loan)</option>
                  </select>
                </div>
                {form.loanType !== "cash" && (
                  <>
                    <PctInput label="Interest Rate" field="interestRate" placeholder="7" />
                    <NumberInput label="Loan Term" field="loanTermYears" placeholder="30" suffix="years" />
                    <PctInput label="PMI (if < 20% down)" field="pmiPct" placeholder="0" calculatedAmount={calc.monthlyPMI * 12} />
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-50">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Loan Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span>Purchase Price</span><span className="font-medium">{fmtDollar(calc.pp)}</span></div>
                  <div className="flex justify-between text-sm"><span>Down Payment</span><span className="font-medium">{fmtDollar(calc.downPayment)}</span></div>
                  <div className="flex justify-between text-sm font-medium"><span>Loan Amount</span><span>{fmtDollar(calc.loanAmount)}</span></div>
                  <div className="border-t pt-2" />
                  <div className="flex justify-between text-sm"><span>Monthly P&I</span><span className="font-medium">{fmtDollar(calc.monthlyPI)}</span></div>
                  {calc.monthlyPMI > 0 && <div className="flex justify-between text-sm"><span>Monthly PMI</span><span className="font-medium">{fmtDollar(calc.monthlyPMI)}</span></div>}
                  <div className="flex justify-between text-base font-bold text-slate-800"><span>Monthly Mortgage</span><span>{fmtDollar(calc.monthlyMortgage)}</span></div>
                  <div className="flex justify-between text-sm text-slate-500"><span>Annual Debt Service</span><span>{fmtDollar(calc.annualDebtService)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── TAB: REVENUE ────────────────────────────────────────────────── */}
        <TabsContent value="revenue">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Revenue Scenarios (ADR × Occupancy = Revenue)</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {[
                    { label: "Conservative", prefix: "scenario1" as const, s: calc.s1 },
                    { label: "Base Case", prefix: "scenario2" as const, s: calc.s2 },
                    { label: "Strong Execution", prefix: "scenario3" as const, s: calc.s3 },
                  ].map(({ label, prefix, s }) => (
                    <div key={prefix} className="border rounded-lg p-3 space-y-2">
                      <h4 className="font-medium text-sm text-slate-700">{label}</h4>
                      <DollarInput label="Average Daily Rate (ADR)" field={`${prefix}ADR` as keyof ProformaForm} placeholder="250" />
                      <PctInput label="Occupancy Rate" field={`${prefix}Occupancy` as keyof ProformaForm} placeholder="65" />
                      <NumberInput label="Available Nights/Year" field={`${prefix}AvailableNights` as keyof ProformaForm} placeholder="365" suffix="nights" />
                      <DollarInput label="Cleaning Fee Revenue (annual)" field={`${prefix}CleaningFeeRevenue` as keyof ProformaForm} placeholder="0" />
                      <DollarInput label="Ancillary Revenue (annual)" field={`${prefix}AncillaryRevenue` as keyof ProformaForm} placeholder="0" />
                      <div className="border-t pt-2 space-y-1">
                        <div className="flex justify-between text-xs"><span>Sold Nights</span><span className="font-medium">{s.soldNights}</span></div>
                        <div className="flex justify-between text-xs"><span>Bookings (~{form.avgLengthOfStay} night avg)</span><span className="font-medium">{Math.round(s.bookings)}</span></div>
                        <div className="flex justify-between text-sm font-bold text-emerald-700"><span>Gross Revenue</span><span>{fmtDollar(s.grossRevenue)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Channel Mix & Platform Fees</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <PctInput label="Airbnb %" field="channelAirbnbPct" placeholder="60" />
                    <PctInput label="Vrbo %" field="channelVrboPct" placeholder="25" />
                    <PctInput label="Direct %" field="channelDirectPct" placeholder="15" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <PctInput label="Airbnb Fee" field="feeAirbnb" placeholder="15.5" />
                    <PctInput label="Vrbo Fee" field="feeVrbo" placeholder="8" />
                    <PctInput label="Direct Fee" field="feeDirect" placeholder="3" />
                  </div>
                  <p className="text-xs text-slate-500">Blended platform fee rate: <span className="font-medium">{fmtPctWhole(calc.blendedFeeRate)}</span></p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Growth Assumptions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <PctInput label="Revenue Appreciation (annual)" field="revenueAppreciationPct" placeholder="3" />
                  <PctInput label="Property Appreciation (annual)" field="propertyAppreciationPct" placeholder="4" />
                  <PctInput label="Expense Inflation (annual)" field="expenseInflationPct" placeholder="3" />
                  <NumberInput label="Avg Length of Stay" field="avgLengthOfStay" placeholder="3.5" suffix="nights" />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB: EXPENSES ───────────────────────────────────────────────── */}
        <TabsContent value="expenses">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Fixed Monthly Expenses</CardTitle></CardHeader>
              <CardContent className="space-y-0">
                <ExpenseRow label="Utilities (electric, gas, water)" field="expUtilities" />
                <ExpenseRow label="STR Insurance" field="expInsuranceAnnual" annual />
                <ExpenseRow label="Property Tax" field="expPropertyTaxAnnual" annual />
                <ExpenseRow label="HOA / POA Dues" field="expHOA" />
                <ExpenseRow label="Internet / Cable / Streaming" field="expInternet" />
                <ExpenseRow label="Landscaping / Snow Removal" field="expLandscaping" />
                <ExpenseRow label="Pest Control" field="expPestControl" />
                <ExpenseRow label="Hot Tub / Pool Service" field="expHotTubPool" />
                <ExpenseRow label="PMS Software" field="expPMSSoftware" />
                <ExpenseRow label="Dynamic Pricing Software" field="expDynamicPricing" />
                <ExpenseRow label="Smart Locks / Security / Noise" field="expSmartLocks" />
                <ExpenseRow label="Accounting / Bookkeeping" field="expAccounting" />
                <ExpenseRow label="Permits & Licenses" field="expPermits" />
                <ExpenseRow label="Other Fixed" field="expOtherFixed" />
                <div className="border-t-2 pt-2 mt-2 flex justify-between font-bold text-sm">
                  <span>Total Fixed</span>
                  <span>{fmtDollar(calc.fixedMonthly)}/mo | {fmtDollar(calc.fixedAnnual)}/yr</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Variable Expenses</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <PctInput label="Property Management Fee (% of net revenue)" field="propertyMgmtPct" placeholder="0" calculatedAmount={calc.s2.mgmtExpense} />
                <DollarInput label="Cleaning Cost per Turn" field="cleaningCostPerTurn" placeholder="150" />
                <DollarInput label="Laundry / Linen Service per Turn" field="laundryPerTurn" placeholder="30" />
                <DollarInput label="Supplies & Restocking per Turn" field="suppliesPerTurn" placeholder="20" />
                <PctInput label="CapEx / Maintenance Reserve (% of gross revenue)" field="capExReservePct" placeholder="5" calculatedAmount={calc.s2.capExReserve} />
                <DollarInput label="Linen Replacement Reserve (annual)" field="linenReplacementAnnual" placeholder="1,500" />
                <DollarInput label="Routine Repairs (monthly)" field="routineRepairsMonthly" placeholder="100" />
                <DollarInput label="Other Variable (monthly)" field="otherVariableMonthly" placeholder="0" />
                <div className="border-t-2 pt-2 mt-2">
                  <div className="flex justify-between font-bold text-sm">
                    <span>Total Variable (Base Case)</span>
                    <span>{fmtDollar(calc.s2.totalVariableAnnual)}/yr</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-emerald-700 mt-1">
                    <span>Total All Expenses (Base Case)</span>
                    <span>{fmtDollar(calc.s2.totalExpensesAnnual)}/yr</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── TAB: RETURNS ────────────────────────────────────────────────── */}
        <TabsContent value="returns">
          <div className="space-y-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Cash Needed", value: fmtDollar(calc.totalCashNeeded) },
                { label: "Monthly Mortgage", value: fmtDollar(calc.monthlyMortgage) },
                { label: "Base Case Cash Flow", value: fmtDollar(calc.s2.cashFlow), color: calc.s2.cashFlow >= 0 ? "text-emerald-700" : "text-red-600" },
                { label: "Base Case CoC Return", value: fmtPct(calc.s2.cashOnCash), color: calc.s2.cashOnCash >= 0.08 ? "text-emerald-700" : "text-amber-600" },
              ].map(m => (
                <Card key={m.label} className="bg-slate-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-slate-500">{m.label}</p>
                    <p className={`text-lg font-bold ${(m as any).color || "text-slate-800"}`}>{m.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Scenario Comparison */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Scenario Comparison</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left">
                        <th className="p-2 font-medium">Metric</th>
                        <th className="p-2 font-medium text-right">Conservative</th>
                        <th className="p-2 font-medium text-right">Base Case</th>
                        <th className="p-2 font-medium text-right">Strong Execution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "ADR", v: [fmtDollar(calc.s1.adr), fmtDollar(calc.s2.adr), fmtDollar(calc.s3.adr)] },
                        { label: "Occupancy", v: [fmtPctWhole(calc.s1.occ), fmtPctWhole(calc.s2.occ), fmtPctWhole(calc.s3.occ)] },
                        { label: "Sold Nights", v: [String(calc.s1.soldNights), String(calc.s2.soldNights), String(calc.s3.soldNights)] },
                        { label: "Gross Revenue", v: [fmtDollar(calc.s1.grossRevenue), fmtDollar(calc.s2.grossRevenue), fmtDollar(calc.s3.grossRevenue)], bold: true },
                        { label: "Platform Fees", v: [fmtDollar(calc.s1.platformFees), fmtDollar(calc.s2.platformFees), fmtDollar(calc.s3.platformFees)] },
                        { label: "Net Revenue", v: [fmtDollar(calc.s1.netRevenue), fmtDollar(calc.s2.netRevenue), fmtDollar(calc.s3.netRevenue)] },
                        { label: "Total Expenses", v: [fmtDollar(calc.s1.totalExpensesAnnual), fmtDollar(calc.s2.totalExpensesAnnual), fmtDollar(calc.s3.totalExpensesAnnual)] },
                        { label: "NOI", v: [fmtDollar(calc.s1.noi), fmtDollar(calc.s2.noi), fmtDollar(calc.s3.noi)], bold: true },
                        { label: "Debt Service", v: [fmtDollar(calc.annualDebtService), fmtDollar(calc.annualDebtService), fmtDollar(calc.annualDebtService)] },
                        { label: "Net Cash Flow", v: [fmtDollar(calc.s1.cashFlow), fmtDollar(calc.s2.cashFlow), fmtDollar(calc.s3.cashFlow)], bold: true, highlight: true },
                        { label: "Monthly Cash Flow", v: [fmtDollar(calc.s1.monthlyCashFlow), fmtDollar(calc.s2.monthlyCashFlow), fmtDollar(calc.s3.monthlyCashFlow)] },
                        { label: "Cash-on-Cash Return", v: [fmtPct(calc.s1.cashOnCash), fmtPct(calc.s2.cashOnCash), fmtPct(calc.s3.cashOnCash)], bold: true },
                        { label: "Cap Rate", v: [fmtPct(calc.s1.capRate), fmtPct(calc.s2.capRate), fmtPct(calc.s3.capRate)] },
                        { label: "Gross Yield", v: [fmtPct(calc.s1.grossYield), fmtPct(calc.s2.grossYield), fmtPct(calc.s3.grossYield)] },
                        { label: "DSCR", v: [`${calc.s1.dscr.toFixed(2)}x`, `${calc.s2.dscr.toFixed(2)}x`, `${calc.s3.dscr.toFixed(2)}x`] },
                        { label: "NOI Margin", v: [fmtPct(calc.s1.noiMargin), fmtPct(calc.s2.noiMargin), fmtPct(calc.s3.noiMargin)] },
                        { label: "Break-Even Occupancy", v: [fmtPctWhole(calc.s1.breakEvenOcc), fmtPctWhole(calc.s2.breakEvenOcc), fmtPctWhole(calc.s3.breakEvenOcc)] },
                        { label: "Payback Period", v: [calc.s1.paybackYears === Infinity ? "N/A" : `${calc.s1.paybackYears.toFixed(1)} yrs`, calc.s2.paybackYears === Infinity ? "N/A" : `${calc.s2.paybackYears.toFixed(1)} yrs`, calc.s3.paybackYears === Infinity ? "N/A" : `${calc.s3.paybackYears.toFixed(1)} yrs`] },
                      ].map(row => (
                        <tr key={row.label} className={`border-b ${row.highlight ? "bg-emerald-50" : ""}`}>
                          <td className={`p-2 ${row.bold ? "font-semibold" : ""}`}>{row.label}</td>
                          <td className={`p-2 text-right ${row.bold ? "font-semibold" : ""}`}>{row.v[0]}</td>
                          <td className={`p-2 text-right ${row.bold ? "font-semibold" : ""}`}>{row.v[1]}</td>
                          <td className={`p-2 text-right ${row.bold ? "font-semibold" : ""}`}>{row.v[2]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* 5-Year Projection */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">5-Year Projection (Base Case)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left">
                        <th className="p-2">Year</th>
                        <th className="p-2 text-right">Net Revenue</th>
                        <th className="p-2 text-right">Expenses</th>
                        <th className="p-2 text-right">NOI</th>
                        <th className="p-2 text-right">Cash Flow</th>
                        <th className="p-2 text-right">Property Value</th>
                        <th className="p-2 text-right">Total Equity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.fiveYear.map(yr => (
                        <tr key={yr.year} className="border-b">
                          <td className="p-2 font-medium">Year {yr.year}</td>
                          <td className="p-2 text-right">{fmtDollar(yr.revenue)}</td>
                          <td className="p-2 text-right">{fmtDollar(yr.expenses)}</td>
                          <td className="p-2 text-right">{fmtDollar(yr.noi)}</td>
                          <td className="p-2 text-right font-medium">{fmtDollar(yr.cashFlow)}</td>
                          <td className="p-2 text-right">{fmtDollar(yr.propertyValue)}</td>
                          <td className="p-2 text-right font-medium text-emerald-700">{fmtDollar(yr.equity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── TAB: TAX BENEFITS ───────────────────────────────────────────── */}
        <TabsContent value="tax">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Cost Segregation & Bonus Depreciation</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Cost Segregation Study?</Label>
                  <select className="w-full h-8 text-sm border rounded px-2" value={form.costSegEnabled} onChange={e => setField("costSegEnabled", e.target.value)}>
                    <option value="no">No — Standard Depreciation Only</option>
                    <option value="yes">Yes — Accelerated Depreciation</option>
                  </select>
                </div>
                <PctInput label="Land Allocation (non-depreciable)" field="landAllocationPct" placeholder="20" calculatedAmount={calc.pp * parsePct(form.landAllocationPct)} />
                {form.costSegEnabled === "yes" && (
                  <>
                    <PctInput label="Accelerated Depreciation % (5/7/15-yr property)" field="acceleratedDepreciationPct" placeholder="25" calculatedAmount={calc.acceleratedAmt} />
                    <DollarInput label="Cost Seg Study Cost" field="costSegStudyCost" placeholder="7,500" />
                  </>
                )}
                <PctInput label="Marginal Tax Rate" field="marginalTaxRate" placeholder="35" />
                <p className="text-xs text-slate-500 mt-2">100% bonus depreciation is permanent for property acquired after Jan 19, 2025 (One Big Beautiful Bill Act). Furnishings are also 100% bonus-eligible.</p>
              </CardContent>
            </Card>

            <Card className="bg-slate-50">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Estimated Year 1 Tax Benefit</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span>Building Basis (after land)</span><span className="font-medium">{fmtDollar(calc.buildingBasis)}</span></div>
                  {calc.costSegEnabled && (
                    <div className="flex justify-between text-sm"><span>Accelerated Depreciation</span><span className="font-medium">{fmtDollar(calc.acceleratedAmt)}</span></div>
                  )}
                  <div className="flex justify-between text-sm"><span>Furnishing Depreciation (100%)</span><span className="font-medium">{fmtDollar(calc.furnishing)}</span></div>
                  <div className="border-t pt-2 flex justify-between text-sm font-medium"><span>Total Year 1 Deduction</span><span>{fmtDollar(calc.totalFirstYearDeduction)}</span></div>
                  <div className="flex justify-between text-sm"><span>Tax Savings @ {form.marginalTaxRate}%</span><span className="font-medium text-emerald-700">{fmtDollar(calc.taxSavings)}</span></div>
                  {calc.costSegEnabled && (
                    <div className="flex justify-between text-sm"><span>Less: Study Cost</span><span className="text-red-500">-{fmtDollar(calc.costSegCost)}</span></div>
                  )}
                  <div className="border-t pt-2 flex justify-between text-base font-bold text-emerald-700">
                    <span>Net Tax Benefit</span><span>{fmtDollar(calc.netTaxBenefit)}</span>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  <strong>Disclaimer:</strong> This is an estimate only. Tax benefits require material participation (avg stay ≤7 days + active involvement). Consult your CPA before relying on these figures. Subject to IRS rules and individual eligibility.
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── TAB: COMPS ──────────────────────────────────────────────────── */}
        <TabsContent value="comps">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Revenue Comparable Properties</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setForm(prev => ({ ...prev, comps: [...prev.comps, { name: "", annualRevenue: "", occupancy: "", adr: "", beds: "", link: "", notes: "" }] }))}>
                  <Plus className="h-3 w-3 mr-1" /> Add Comp
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {form.comps.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No comps added yet. Add comparable properties to support your revenue projections.</p>
              ) : (
                <div className="space-y-3">
                  {form.comps.map((comp, i) => (
                    <div key={i} className="border rounded p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">Comp {i + 1}</span>
                        <Button variant="ghost" size="sm" onClick={() => setForm(prev => ({ ...prev, comps: prev.comps.filter((_, j) => j !== i) }))}>
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Name/ID</Label>
                          <Input className="h-7 text-xs" value={comp.name} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], name: e.target.value }; setForm(prev => ({ ...prev, comps: c })); }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Annual Revenue</Label>
                          <Input className="h-7 text-xs" value={comp.annualRevenue} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], annualRevenue: e.target.value }; setForm(prev => ({ ...prev, comps: c })); }} placeholder="$120,000" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Occupancy %</Label>
                          <Input className="h-7 text-xs" value={comp.occupancy} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], occupancy: e.target.value }; setForm(prev => ({ ...prev, comps: c })); }} placeholder="72%" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ADR</Label>
                          <Input className="h-7 text-xs" value={comp.adr} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], adr: e.target.value }; setForm(prev => ({ ...prev, comps: c })); }} placeholder="$250" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Beds</Label>
                          <Input className="h-7 text-xs" value={comp.beds} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], beds: e.target.value }; setForm(prev => ({ ...prev, comps: c })); }} />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label className="text-xs">Link</Label>
                          <Input className="h-7 text-xs" value={comp.link} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], link: e.target.value }; setForm(prev => ({ ...prev, comps: c })); }} placeholder="https://..." />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notes</Label>
                        <Input className="h-7 text-xs" value={comp.notes} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], notes: e.target.value }; setForm(prev => ({ ...prev, comps: c })); }} placeholder="Similar property, hot tub, mountain view..." />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB: NOTES ──────────────────────────────────────────────────── */}
        <TabsContent value="notes">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Revenue Methodology</CardTitle></CardHeader>
              <CardContent>
                <Textarea className="min-h-[120px] text-sm" value={form.revenueMethodology} onChange={e => setField("revenueMethodology", e.target.value)} placeholder="Explain how revenue projections were derived..." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Additional Notes & Assumptions</CardTitle></CardHeader>
              <CardContent>
                <Textarea className="min-h-[120px] text-sm" value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="Key assumptions, risk factors, unresolved items..." />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
