import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatCurrencyInput } from "@/lib/inputFormatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { ArrowLeft, FileText, Save, Plus, Trash2, Download, TrendingUp, DollarSign, Home, Calculator, BarChart3, Shield, BookOpen, Settings } from "lucide-react";
import { useParams, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Formatting Helpers ──────────────────────────────────────────────────────
const fmtDollar = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "$0";
  return `$${Math.round(val).toLocaleString("en-US")}`;
};
const fmtPct = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "0%";
  return `${(val * 100).toFixed(2)}%`;
};
const fmtPctWhole = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "0%";
  return `${(val * 100).toFixed(1)}%`;
};
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
const pmt = (rate: number, nper: number, pv: number): number => {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
};

// ─── Form State Type ─────────────────────────────────────────────────────────
interface CustomExpense { label: string; amount: string; }

interface ProformaForm {
  purchasePrice: string;
  closingCostsPct: string;
  furnishingBudget: string;
  renovationBudget: string;
  startupCosts: string;
  inspectionCosts: string;
  sellerCredit: string;
  propertyLink: string;
  propertyPhotoUrl: string;
  propertyDescription: string;
  // Financing (down payment moved here)
  downPaymentPct: string;
  interestRate: string;
  loanTermYears: string;
  pmiPct: string;
  loanType: string;
  // Revenue
  scenario1ADR: string;
  scenario1Occupancy: string;
  scenario1AvailableNights: string;
  scenario1CleaningFeeRevenue: string;
  scenario1CleaningFeeExpense: string;
  scenario1AncillaryRevenue: string;
  scenario2ADR: string;
  scenario2Occupancy: string;
  scenario2AvailableNights: string;
  scenario2CleaningFeeRevenue: string;
  scenario2CleaningFeeExpense: string;
  scenario2AncillaryRevenue: string;
  scenario3ADR: string;
  scenario3Occupancy: string;
  scenario3AvailableNights: string;
  scenario3CleaningFeeRevenue: string;
  scenario3CleaningFeeExpense: string;
  scenario3AncillaryRevenue: string;
  avgLengthOfStay: string;
  channelAirbnbPct: string;
  channelVrboPct: string;
  channelDirectPct: string;
  feeAirbnb: string;
  feeVrbo: string;
  feeDirect: string;
  revenueAppreciationPct: string;
  propertyAppreciationPct: string;
  // Fixed Expenses (monthly)
  expUtilities: string;
  expInsuranceAnnual: string;
  expPropertyTaxAnnual: string;
  expHOA: string;
  expInternet: string;
  expLandscaping: string;
  expPestControl: string;
  expHotTubPool: string;
  expSoftware: string;
  expTrash: string;
  expSmartLocks: string;
  expAccounting: string;
  expPermits: string;
  customFixedExpenses: CustomExpense[];
  // Variable Expenses
  propertyMgmtPct: string;
  cleaningCostPerTurn: string;
  capExReservePct: string;
  customVariableExpenses: CustomExpense[];
  // Exit / IRR
  sellingCostsPct: string;
  // Value-Add / ARV / Cash-Out Refi
  isValueAdd: string; // "yes" | "no"
  afterRepairValue: string;
  isCashoutRefi: string; // "yes" | "no"
  refiAppraisedValue: string;
  refiLTV: string;
  refiLoanAmount: string;
  refiInterestRate: string;
  refiLoanTermYears: string;
  seasoningPeriodMonths: string;
  // Tax
  costSegEnabled: string;
  landAllocationPct: string;
  acceleratedDepreciationPct: string;
  marginalTaxRate: string;
  costSegStudyCost: string;
  // Comps
  comps: Array<{ name: string; annualRevenue: string; occupancy: string; adr: string; beds: string; link: string; notes: string; photoUrl?: string; rating?: string; reviewCount?: string; city?: string; }>;
  // Notes
  notes: string;
  revenueMethodology: string;
}

const defaultForm: ProformaForm = {
  purchasePrice: "",
  closingCostsPct: "2",
  furnishingBudget: "25000",
  renovationBudget: "0",
  startupCosts: "5000",
  inspectionCosts: "1500",
  sellerCredit: "0",
  propertyLink: "",
  propertyPhotoUrl: "",
  propertyDescription: "",
  downPaymentPct: "20",
  interestRate: "7",
  loanTermYears: "30",
  pmiPct: "0",
  loanType: "dscr",
  scenario1ADR: "",
  scenario1Occupancy: "65",
  scenario1AvailableNights: "365",
  scenario1CleaningFeeRevenue: "0",
  scenario1CleaningFeeExpense: "",
  scenario1AncillaryRevenue: "0",
  scenario2ADR: "",
  scenario2Occupancy: "72",
  scenario2AvailableNights: "365",
  scenario2CleaningFeeRevenue: "0",
  scenario2CleaningFeeExpense: "",
  scenario2AncillaryRevenue: "0",
  scenario3ADR: "",
  scenario3Occupancy: "80",
  scenario3AvailableNights: "365",
  scenario3CleaningFeeRevenue: "0",
  scenario3CleaningFeeExpense: "",
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
  expUtilities: "400",
  expInsuranceAnnual: "3600",
  expPropertyTaxAnnual: "3000",
  expHOA: "0",
  expInternet: "100",
  expLandscaping: "100",
  expPestControl: "50",
  expHotTubPool: "100",
  expSoftware: "90",
  expTrash: "50",
  expSmartLocks: "20",
  expAccounting: "150",
  expPermits: "0",
  customFixedExpenses: [],
  propertyMgmtPct: "0",
  cleaningCostPerTurn: "150",
  capExReservePct: "5",
  customVariableExpenses: [],
  sellingCostsPct: "6",
  isValueAdd: "no",
  afterRepairValue: "",
  isCashoutRefi: "no",
  refiAppraisedValue: "",
  refiLTV: "75",
  refiLoanAmount: "",
  refiInterestRate: "7",
  refiLoanTermYears: "30",
  seasoningPeriodMonths: "6",
  costSegEnabled: "yes",
  landAllocationPct: "15",
  acceleratedDepreciationPct: "30",
  marginalTaxRate: "35",
  costSegStudyCost: "3500",
  comps: [],
  notes: "",
  revenueMethodology: "We run our projections with best and highest use of the STR in mind. We assume top-tier amenities and aesthetics and pull revenue from comparable top-performing STRs. This initial projection requires further due diligence.",
};

export default function ProformaPage() {
  const { id: propId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { user } = useAuth();
  const propertyId = parseInt(propId || "0");

  const [form, setForm] = useState<ProformaForm>(defaultForm);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("STR Investment Analysis");
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [importingZillow, setImportingZillow] = useState(false);
  const [importingAirbnb, setImportingAirbnb] = useState(false);
  const [airbnbImportUrl, setAirbnbImportUrl] = useState("");
  const [showAirbnbImport, setShowAirbnbImport] = useState(false);
  const [showExistingComps, setShowExistingComps] = useState(false);
  const [autoLoadDone, setAutoLoadDone] = useState(false);

  const utils = trpc.useUtils();
  const { data: property } = trpc.properties.get.useQuery({ id: propertyId });
  const { data: proformas, refetch } = trpc.properties.listProformas.useQuery({ propertyId });
  const { data: coreProfile } = trpc.users.getCoreProfile.useQuery({ userId: user?.id ?? 0 }, { enabled: !!user?.id });
  const { data: userRecord } = trpc.users.getById.useQuery({ id: user?.id ?? 0 }, { enabled: !!user?.id });

  const { data: userDefaults } = trpc.properties.getProformaDefaults.useQuery(undefined, { enabled: !!user?.id });

  const createMutation = trpc.properties.createProforma.useMutation({ onSuccess: () => { refetch(); } });
  const updateMutation = trpc.properties.updateProforma.useMutation({ onSuccess: () => { refetch(); } });
  const deleteMutation = trpc.properties.deleteProforma.useMutation({ onSuccess: () => { refetch(); } });

  // ─── AUTO-SAVE (debounced 2s after any field change) ─────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  const titleRef = useRef(title);
  const editingIdRef = useRef(editingId);
  const isSavingRef = useRef(false);
  const hasDirtyChanges = useRef(false);
  const pendingSaveNeeded = useRef(false);
  const lastSavedForm = useRef<string>("");
  formRef.current = form;
  titleRef.current = title;
  editingIdRef.current = editingId;

  const doAutoSave = useCallback(async () => {
    if (isSavingRef.current) {
      // Mark that we need another save after the current one finishes
      pendingSaveNeeded.current = true;
      return;
    }
    const currentForm = formRef.current;
    const formJson = JSON.stringify(currentForm);
    // Don't save if nothing changed since last save
    if (formJson === lastSavedForm.current && editingIdRef.current) return;
    
    isSavingRef.current = true;
    setSaving(true);
    try {
      // Include calculated summary fields for the list view
      const formData = { ...currentForm } as any;
      // Use calcRef for summary metrics
      if (calcRef.current) {
        const c = calcRef.current;
        formData._calcGrossRevenue = c.s2?.grossRevenue > 0 ? c.s2.grossRevenue.toFixed(2) : null;
        formData._calcNoi = c.s2?.noi ? c.s2.noi.toFixed(2) : null;
        formData._calcCashFlow = c.s2?.cashFlow ? c.s2.cashFlow.toFixed(2) : null;
        formData._calcCashOnCash = c.s2?.cashOnCash ? c.s2.cashOnCash.toFixed(4) : null;
        formData._calcCapRate = c.s2?.capRate ? c.s2.capRate.toFixed(4) : null;
      }
      if (editingIdRef.current) {
        await updateMutation.mutateAsync({ id: editingIdRef.current, title: titleRef.current, formData, notes: currentForm.notes });
      } else {
        const result = await createMutation.mutateAsync({ propertyId, title: titleRef.current, formData, notes: currentForm.notes });
        setEditingId(result.id);
      }
      lastSavedForm.current = formJson;
      hasDirtyChanges.current = false;
    } catch (e) { console.error("Auto-save failed:", e); }
    isSavingRef.current = false;
    setSaving(false);
    // If changes came in while we were saving, save again
    if (pendingSaveNeeded.current) {
      pendingSaveNeeded.current = false;
      setTimeout(() => doAutoSave(), 500);
    }
  }, [propertyId]);

  // Trigger auto-save whenever form or title changes (only when editing AND user has made changes)
  useEffect(() => {
    if (!editing) return;
    // Skip the initial render when editing first becomes true (no user changes yet)
    if (!hasDirtyChanges.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { doAutoSave(); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [form, title, editing, doAutoSave]);

  // Auto-load proforma from ?load=ID URL parameter, or auto-start new from ?new=true
  const loadIdFromUrl = (() => {
    const params = new URLSearchParams(searchString);
    return params.get("load") ? parseInt(params.get("load")!) : null;
  })();
  const isNewFromUrl = (() => {
    const params = new URLSearchParams(searchString);
    return params.get("new") === "true";
  })();
  // Auto-start new proforma if ?new=true
  useEffect(() => {
    if (isNewFromUrl && !editing && !autoLoadDone) {
      startNewProforma();
      setAutoLoadDone(true);
    }
  }, [isNewFromUrl, userDefaults]);
  const { data: autoLoadProforma } = trpc.properties.getProforma.useQuery(
    { id: loadIdFromUrl! },
    { enabled: !!loadIdFromUrl && !autoLoadDone }
  );
  useEffect(() => {
    if (autoLoadDone || !loadIdFromUrl || !autoLoadProforma) return;
    const fd = (autoLoadProforma.formData || {}) as ProformaForm;
    const loadedForm = { ...defaultForm, ...fd };
    setForm(loadedForm);
    setTitle(autoLoadProforma.title || "STR Investment Analysis");
    setEditingId(autoLoadProforma.id);
    setEditing(true);
    lastSavedForm.current = JSON.stringify(loadedForm);
    hasDirtyChanges.current = false;
    setAutoLoadDone(true);
  }, [autoLoadProforma, loadIdFromUrl, autoLoadDone]);

  // Helper: start a new proforma with user's saved defaults applied
  const startNewProforma = () => {
    // userDefaults is the parsed JSON object directly from getProformaDefaults (or null if none saved)
    const userDefaultData = userDefaults && typeof userDefaults === "object" ? userDefaults : {};
    const newForm = { ...defaultForm, ...userDefaultData };
    setForm(newForm);
    setEditingId(null);
    setTitle("STR Investment Analysis");
    setEditing(true);
    lastSavedForm.current = "";
    hasDirtyChanges.current = false;
  };

  // ─── CALCULATIONS ──────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const pp = parseNum(form.purchasePrice);
    const downPct = parsePct(form.downPaymentPct);
    const closingPct = parsePct(form.closingCostsPct);
    const furnishing = parseNum(form.furnishingBudget);
    const renovation = parseNum(form.renovationBudget);
    const startup = parseNum(form.startupCosts);
    const inspection = parseNum(form.inspectionCosts);
    const sellerCredit = parseNum(form.sellerCredit);

    const isCash = form.loanType === "cash";
    const downPayment = isCash ? pp : pp * downPct;
    const closingCosts = pp * closingPct;
    const loanAmount = isCash ? 0 : pp - downPayment;
    const totalCashNeeded = (isCash ? pp : downPayment) + closingCosts + furnishing + renovation + startup + inspection - sellerCredit;

    const rate = parsePct(form.interestRate);
    const termYears = parseNum(form.loanTermYears);
    const monthlyRate = rate / 12;
    const totalPayments = termYears * 12;
    const monthlyPI = isCash ? 0 : -pmt(monthlyRate, totalPayments, loanAmount);
    const monthlyPMI = isCash ? 0 : (loanAmount * parsePct(form.pmiPct)) / 12;
    const monthlyMortgage = monthlyPI + monthlyPMI;
    const annualDebtService = monthlyMortgage * 12;

    const airbnbPct = parsePct(form.channelAirbnbPct);
    const vrboPct = parsePct(form.channelVrboPct);
    const directPct = parsePct(form.channelDirectPct);
    const feeAirbnb = parsePct(form.feeAirbnb);
    const feeVrbo = parsePct(form.feeVrbo);
    const feeDirect = parsePct(form.feeDirect);
    const blendedFeeRate = (airbnbPct * feeAirbnb) + (vrboPct * feeVrbo) + (directPct * feeDirect);

    // Custom fixed expenses
    const customFixedTotal = (form.customFixedExpenses || []).reduce((sum, e) => sum + parseNum(e.amount), 0);
    const fixedMonthly = parseNum(form.expUtilities) + (parseNum(form.expInsuranceAnnual) / 12) +
      (parseNum(form.expPropertyTaxAnnual) / 12) + parseNum(form.expHOA) + parseNum(form.expInternet) +
      parseNum(form.expLandscaping) + parseNum(form.expPestControl) + parseNum(form.expHotTubPool) +
      parseNum(form.expSoftware) + parseNum(form.expTrash) + parseNum(form.expSmartLocks) +
      parseNum(form.expAccounting) + parseNum(form.expPermits) + customFixedTotal;
    const fixedAnnual = fixedMonthly * 12;

    // Custom variable expenses (monthly)
    const customVariableMonthly = (form.customVariableExpenses || []).reduce((sum, e) => sum + parseNum(e.amount), 0);

    const calcScenario = (adrStr: string, occStr: string, nightsStr: string, cleaningRevStr: string, cleaningExpStr: string, ancillaryStr: string) => {
      const adr = parseNum(adrStr);
      const occ = parsePct(occStr);
      const availNights = parseNum(nightsStr) || 365;
      const soldNights = Math.round(availNights * occ);
      const avgLOS = parseNum(form.avgLengthOfStay) || 3.5;
      const bookings = soldNights / avgLOS;

      const nightlyRevenue = adr * soldNights;
      // Cleaning fee: income per booking charged to guest
      const cleaningFeeIncome = parseNum(cleaningRevStr);
      // Cleaning fee: expense per turn paid to cleaner (defaults to income if blank)
      const cleaningFeeExpensePerTurn = cleaningExpStr === "" ? cleaningFeeIncome : parseNum(cleaningExpStr);
      const cleaningFeeRevenue = cleaningFeeIncome * bookings;
      const cleaningFeeExpenseTotal = cleaningFeeExpensePerTurn * bookings;
      const cleaningNetProfit = cleaningFeeRevenue - cleaningFeeExpenseTotal;
      const ancillaryRevenue = parseNum(ancillaryStr);
      const grossBeforeCleaning = nightlyRevenue + ancillaryRevenue;
      const grossRevenue = nightlyRevenue + cleaningFeeRevenue + ancillaryRevenue;

      const platformFees = grossRevenue * blendedFeeRate;
      const netRevenue = grossRevenue - platformFees;

      const mgmtPct = parsePct(form.propertyMgmtPct);
      const mgmtExpense = netRevenue * mgmtPct;
      const cleaningExpense = cleaningFeeExpenseTotal;
      const capExReserve = grossRevenue * parsePct(form.capExReservePct);
      const customVarAnnual = customVariableMonthly * 12;
      const totalVariableAnnual = mgmtExpense + cleaningExpense + capExReserve + customVarAnnual;

      const totalExpensesAnnual = fixedAnnual + totalVariableAnnual;
      const noi = netRevenue - totalExpensesAnnual;
      const cashFlow = noi - annualDebtService;
      const monthlyCashFlow = cashFlow / 12;

      const cashOnCash = totalCashNeeded > 0 ? cashFlow / totalCashNeeded : 0;
      const capRate = pp > 0 ? noi / pp : 0;
      const grossYield = pp > 0 ? grossRevenue / pp : 0;
      const dscr = annualDebtService > 0 ? noi / annualDebtService : Infinity;
      const noiMargin = netRevenue > 0 ? noi / netRevenue : 0;

      const breakEvenOcc = adr > 0 ? (() => {
        const target = fixedAnnual + annualDebtService + customVarAnnual;
        const perNight = adr * (1 - blendedFeeRate) * (1 - mgmtPct) - (parseNum(form.cleaningCostPerTurn)) / avgLOS - adr * parsePct(form.capExReservePct);
        return perNight > 0 ? target / (perNight * availNights) : 1;
      })() : 0;

      const paybackYears = cashFlow > 0 ? totalCashNeeded / cashFlow : Infinity;

      return {
        adr, occ, availNights, soldNights, bookings,
        nightlyRevenue, cleaningFeeIncome, cleaningFeeExpensePerTurn, cleaningFeeRevenue, cleaningFeeExpenseTotal, cleaningNetProfit, ancillaryRevenue, grossBeforeCleaning, grossRevenue,
        platformFees, netRevenue,
        mgmtExpense, cleaningExpense, capExReserve, customVarAnnual, totalVariableAnnual,
        fixedAnnual, totalExpensesAnnual,
        noi, noiMargin, cashFlow, monthlyCashFlow,
        cashOnCash, capRate, grossYield, dscr, breakEvenOcc, paybackYears,
      };
    };

    const s1 = calcScenario(form.scenario1ADR, form.scenario1Occupancy, form.scenario1AvailableNights, form.scenario1CleaningFeeRevenue, form.scenario1CleaningFeeExpense, form.scenario1AncillaryRevenue);
    const s2 = calcScenario(form.scenario2ADR, form.scenario2Occupancy, form.scenario2AvailableNights, form.scenario2CleaningFeeRevenue, form.scenario2CleaningFeeExpense, form.scenario2AncillaryRevenue);
    const s3 = calcScenario(form.scenario3ADR, form.scenario3Occupancy, form.scenario3AvailableNights, form.scenario3CleaningFeeRevenue, form.scenario3CleaningFeeExpense, form.scenario3AncillaryRevenue);

    const revAppreciation = parsePct(form.revenueAppreciationPct);
    const propAppreciation = parsePct(form.propertyAppreciationPct);
    const fiveYear = Array.from({ length: 5 }, (_, i) => {
      const year = i + 1;
      const revGrowth = Math.pow(1 + revAppreciation, i);
      const expGrowth = 1; // expenses held constant (no inflation assumption)
      const propValue = pp * Math.pow(1 + propAppreciation, year);
      const yearRev = s2.netRevenue * revGrowth;
      const yearExp = (s2.fixedAnnual + s2.totalVariableAnnual) * expGrowth;
      const yearNoi = yearRev - yearExp;
      const yearCF = yearNoi - annualDebtService;
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

    const costSegEnabled = form.costSegEnabled === "yes";
    const buildingBasis = pp * (1 - parsePct(form.landAllocationPct));
    const acceleratedAmt = buildingBasis * parsePct(form.acceleratedDepreciationPct);
    const furnishingDeduction = furnishing;
    const renovationDeduction = renovation; // Renovation also 100% bonus-eligible
    const totalFirstYearDeduction = costSegEnabled ? acceleratedAmt + furnishingDeduction + renovationDeduction : furnishingDeduction + renovationDeduction;
    const taxSavings = totalFirstYearDeduction * parsePct(form.marginalTaxRate);
    const costSegCost = parseNum(form.costSegStudyCost);
    const netTaxBenefit = taxSavings - (costSegEnabled ? costSegCost : 0);

    // ─── IRR Calculation ──────────────────────────────────────────────────────
    const sellingCostsPct = parsePct(form.sellingCostsPct);
    const marginalTaxRate = parsePct(form.marginalTaxRate);

    // Newton's method IRR solver
    const calcIRR = (cashFlows: number[], maxIter = 100, tol = 0.0001): number => {
      if (cashFlows.length < 2) return 0;
      let guess = 0.10;
      for (let i = 0; i < maxIter; i++) {
        let npv = 0, dnpv = 0;
        for (let t = 0; t < cashFlows.length; t++) {
          const factor = Math.pow(1 + guess, t);
          npv += cashFlows[t] / factor;
          if (t > 0) dnpv -= t * cashFlows[t] / Math.pow(1 + guess, t + 1);
        }
        if (Math.abs(dnpv) < 1e-10) break;
        const newGuess = guess - npv / dnpv;
        if (Math.abs(newGuess - guess) < tol) return newGuess;
        guess = newGuess;
        if (guess < -0.99 || guess > 10) return 0; // diverged
      }
      return guess;
    };

    // Calculate remaining loan balance at year N
    const loanBalanceAtYear = (yearN: number): number => {
      if (form.loanType === "cash" || loanAmount <= 0) return 0;
      let balance = loanAmount;
      for (let m = 0; m < yearN * 12; m++) {
        const interest = balance * monthlyRate;
        const principal = monthlyPI - interest;
        balance -= principal;
      }
      return Math.max(0, balance);
    };

    // Build IRR for a given scenario and hold period
    const calcScenarioIRR = (scenario: typeof s1, holdYears: number, includeTax: boolean) => {
      const cashFlows: number[] = [];
      // Year 0: initial investment (negative)
      const initialOutflow = -totalCashNeeded - (costSegEnabled ? costSegCost : 0);
      cashFlows.push(initialOutflow);

      // Years 1 through holdYears
      for (let y = 1; y <= holdYears; y++) {
        const revGrowth = Math.pow(1 + revAppreciation, y - 1);
        const expGrowth = 1; // expenses held constant
        const yearNetRev = scenario.netRevenue * revGrowth;
        const yearExp = (scenario.fixedAnnual + scenario.totalVariableAnnual) * expGrowth;
        const yearNoi = yearNetRev - yearExp;
        let yearCF = yearNoi - annualDebtService;

        // Add tax benefit in year 1 if includeTax
        if (includeTax && y === 1) {
          yearCF += netTaxBenefit;
        }
        // Straight-line depreciation benefit years 2+ (building / 27.5)
        if (includeTax && y > 1) {
          const straightLineDeduction = buildingBasis / 27.5;
          yearCF += straightLineDeduction * marginalTaxRate;
        }

        // Terminal year: add sale proceeds
        if (y === holdYears) {
          const salePrice = pp * Math.pow(1 + propAppreciation, y);
          const sellingCosts = salePrice * sellingCostsPct;
          const remainingLoan = loanBalanceAtYear(y);
          const netProceeds = salePrice - sellingCosts - remainingLoan;
          yearCF += netProceeds;
        }
        cashFlows.push(yearCF);
      }
      return calcIRR(cashFlows);
    };

    // ─── Ongoing Annual Tax Benefits ─────────────────────────────────────────
    const straightLineDepreciation = buildingBasis / 27.5;
    const year1MortgageInterest = isCash ? 0 : loanAmount * rate; // approx first year interest
    const ongoingAnnualDeduction = straightLineDepreciation + year1MortgageInterest;
    const ongoingAnnualTaxBenefit = ongoingAnnualDeduction * marginalTaxRate;

    // Returns including tax benefits (Year 1 = cost seg + ongoing, Year 2+ = ongoing only)
    const calcReturnsWithTax = (scenario: typeof s1) => {
      const year1TaxBenefit = netTaxBenefit + ongoingAnnualTaxBenefit;
      const ongoingTaxBenefit = ongoingAnnualTaxBenefit;
      const year1CashFlowWithTax = scenario.cashFlow + year1TaxBenefit;
      const ongoingCashFlowWithTax = scenario.cashFlow + ongoingTaxBenefit;
      const year1CoCWithTax = totalCashNeeded > 0 ? year1CashFlowWithTax / totalCashNeeded : 0;
      const ongoingCoCWithTax = totalCashNeeded > 0 ? ongoingCashFlowWithTax / totalCashNeeded : 0;
      return { year1TaxBenefit, ongoingTaxBenefit, year1CashFlowWithTax, ongoingCashFlowWithTax, year1CoCWithTax, ongoingCoCWithTax };
    };
    const taxReturns = { s1: calcReturnsWithTax(s1), s2: calcReturnsWithTax(s2), s3: calcReturnsWithTax(s3) };

    const irr = {
      s1: { y3: calcScenarioIRR(s1, 3, false), y5: calcScenarioIRR(s1, 5, false), y7: calcScenarioIRR(s1, 7, false), y3at: calcScenarioIRR(s1, 3, true), y5at: calcScenarioIRR(s1, 5, true), y7at: calcScenarioIRR(s1, 7, true) },
      s2: { y3: calcScenarioIRR(s2, 3, false), y5: calcScenarioIRR(s2, 5, false), y7: calcScenarioIRR(s2, 7, false), y3at: calcScenarioIRR(s2, 3, true), y5at: calcScenarioIRR(s2, 5, true), y7at: calcScenarioIRR(s2, 7, true) },
      s3: { y3: calcScenarioIRR(s3, 3, false), y5: calcScenarioIRR(s3, 5, false), y7: calcScenarioIRR(s3, 7, false), y3at: calcScenarioIRR(s3, 3, true), y5at: calcScenarioIRR(s3, 5, true), y7at: calcScenarioIRR(s3, 7, true) },
    };

    // ─── ARV / Cash-Out Refi Calculations ─────────────────────────────────────
    const isValueAdd = form.isValueAdd === "yes";
    const arv = parseNum(form.afterRepairValue);
    const forcedEquity = isValueAdd ? arv - pp : 0;
    const equityCreatedByReno = isValueAdd ? arv - (pp + renovation) : 0;

    const isCashoutRefi = form.isCashoutRefi === "yes" && isValueAdd;
    const refiAppraised = parseNum(form.refiAppraisedValue) || arv;
    const refiLoanAmountInput = parseNum(form.refiLoanAmount);
    const refiLTV = refiLoanAmountInput > 0 && refiAppraised > 0 ? refiLoanAmountInput / refiAppraised : parsePct(form.refiLTV);
    const refiNewLoanAmount = refiLoanAmountInput > 0 ? refiLoanAmountInput : refiAppraised * refiLTV;
    const refiCashOut = refiNewLoanAmount - loanAmount; // original loan paid off, remainder is cash out
    const refiRate = parsePct(form.refiInterestRate);
    const refiTermYears = parseNum(form.refiLoanTermYears) || 30;
    const refiMonthlyRate = refiRate / 12;
    const refiTotalPayments = refiTermYears * 12;
    const refiMonthlyPI = refiRate === 0 ? refiNewLoanAmount / refiTotalPayments : -(refiRate / 12 * refiNewLoanAmount * Math.pow(1 + refiRate / 12, refiTotalPayments)) / (Math.pow(1 + refiRate / 12, refiTotalPayments) - 1);
    const refiMonthlyMortgage = Math.abs(refiMonthlyPI);
    const refiAnnualDebtService = refiMonthlyMortgage * 12;
    const seasoningMonths = parseNum(form.seasoningPeriodMonths) || 6;

    // Post-refi returns: how much cash is left in the deal
    const cashLeftInDeal = totalCashNeeded - refiCashOut;
    // Post-refi cash flow uses new mortgage
    const postRefiCalcScenario = (scenario: typeof s1) => {
      const postRefiCashFlow = scenario.noi - refiAnnualDebtService;
      const postRefiMonthlyCF = postRefiCashFlow / 12;
      const postRefiCoC = cashLeftInDeal > 0 ? postRefiCashFlow / cashLeftInDeal : (postRefiCashFlow > 0 ? Infinity : 0);
      // If cashLeftInDeal <= 0, they pulled out more than they put in = "infinite" return
      const infiniteReturn = cashLeftInDeal <= 0 && postRefiCashFlow > 0;
      const postRefiDSCR = refiAnnualDebtService > 0 ? scenario.noi / refiAnnualDebtService : Infinity;
      return { postRefiCashFlow, postRefiMonthlyCF, postRefiCoC, infiniteReturn, postRefiDSCR };
    };

    // Post-refi returns with tax benefits
    const postRefiCalcScenarioWithTax = (scenario: typeof s1) => {
      const base = postRefiCalcScenario(scenario);
      const postRefiYear1CashFlowWithTax = base.postRefiCashFlow + (netTaxBenefit + ongoingAnnualTaxBenefit);
      const postRefiOngoingCashFlowWithTax = base.postRefiCashFlow + ongoingAnnualTaxBenefit;
      const postRefiYear1CoCWithTax = cashLeftInDeal > 0 ? postRefiYear1CashFlowWithTax / cashLeftInDeal : (postRefiYear1CashFlowWithTax > 0 ? Infinity : 0);
      const postRefiOngoingCoCWithTax = cashLeftInDeal > 0 ? postRefiOngoingCashFlowWithTax / cashLeftInDeal : (postRefiOngoingCashFlowWithTax > 0 ? Infinity : 0);
      return { ...base, postRefiYear1CashFlowWithTax, postRefiOngoingCashFlowWithTax, postRefiYear1CoCWithTax, postRefiOngoingCoCWithTax };
    };

    const refi = isCashoutRefi ? {
      refiAppraised, refiNewLoanAmount, refiCashOut, refiMonthlyMortgage, refiAnnualDebtService,
      cashLeftInDeal, seasoningMonths,
      s1: postRefiCalcScenarioWithTax(s1),
      s2: postRefiCalcScenarioWithTax(s2),
      s3: postRefiCalcScenarioWithTax(s3),
    } : null;

    return {
      pp, downPayment, closingCosts, loanAmount, totalCashNeeded, sellerCredit,
      furnishing, renovation, startup, inspection,
      monthlyMortgage, annualDebtService, monthlyPI, monthlyPMI,
      fixedMonthly, fixedAnnual, blendedFeeRate,
      s1, s2, s3, fiveYear, irr, sellingCostsPct,
      costSegEnabled, buildingBasis, acceleratedAmt, furnishingDeduction, renovationDeduction,
      totalFirstYearDeduction, taxSavings, costSegCost, netTaxBenefit,
      straightLineDepreciation, year1MortgageInterest, ongoingAnnualDeduction, ongoingAnnualTaxBenefit, taxReturns,
      isValueAdd, arv, forcedEquity, equityCreatedByReno,
      isCashoutRefi, refi,
    };
  }, [form]);

  const calcRef = useRef(calc);
  calcRef.current = calc;

  // ─── Field Change Handler (stable reference) ──────────────────────────────
  const setField = useCallback((field: keyof ProformaForm, value: any) => {
    hasDirtyChanges.current = true;
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  // ─── Save / Load ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Force immediate save (cancel pending auto-save)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    await doAutoSave();
  };

  const handleLoad = async (proforma: any) => {
    // Fetch the full proforma data (list only has summary fields, not formData)
    try {
      const fullData = await utils.properties.getProforma.fetch({ id: proforma.id });
      const fd = (fullData.formData || {}) as ProformaForm;
      const loadedForm = { ...defaultForm, ...fd };
      setForm(loadedForm);
      setTitle(fullData.title || "STR Investment Analysis");
      setEditingId(fullData.id);
      setEditing(true);
      // Mark the loaded state as the "last saved" so we don't re-save unchanged data
      lastSavedForm.current = JSON.stringify(loadedForm);
      hasDirtyChanges.current = false;
    } catch (e: any) {
      alert(`Failed to load pro-forma: ${e.message}`);
    }
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
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          calc: {
            pp: calc.pp, downPayment: calc.downPayment, closingCosts: calc.closingCosts,
            loanAmount: calc.loanAmount, totalCashNeeded: calc.totalCashNeeded,
            monthlyMortgage: calc.monthlyMortgage, annualDebtService: calc.annualDebtService,
            fixedMonthly: calc.fixedMonthly, fixedAnnual: calc.fixedAnnual,
            blendedFeeRate: calc.blendedFeeRate,
            furnishing: calc.furnishing, renovation: calc.renovation,
            startup: calc.startup, inspection: calc.inspection, sellerCredit: calc.sellerCredit,
            s1: calc.s1, s2: calc.s2, s3: calc.s3, fiveYear: calc.fiveYear,
            irr: calc.irr, sellingCostsPct: calc.sellingCostsPct,
            costSegEnabled: calc.costSegEnabled, costSegCost: calc.costSegCost,
            totalFirstYearDeduction: calc.totalFirstYearDeduction,
            taxSavings: calc.taxSavings, netTaxBenefit: calc.netTaxBenefit,
            buildingBasis: calc.buildingBasis, straightLineDepreciation: calc.straightLineDepreciation,
            year1MortgageInterest: calc.year1MortgageInterest, ongoingAnnualTaxBenefit: calc.ongoingAnnualTaxBenefit,
            taxReturns: calc.taxReturns,
            isValueAdd: calc.isValueAdd, arv: calc.arv, forcedEquity: calc.forcedEquity,
            equityCreatedByReno: calc.equityCreatedByReno, isCashoutRefi: calc.isCashoutRefi, refi: calc.refi,
          },
          property: property ? { address: property.address, city: property.city, state: property.state, zip: property.zip, beds: property.beds, baths: property.baths, sqft: property.sqft, propertyType: property.propertyType } : null,
          branding: userRecord ? { name: userRecord.name, email: userRecord.email, phone: userRecord.phone, market: (coreProfile as any)?.market || "", profilePhotoUrl: (coreProfile as any)?.profilePhotoUrl || "", callBookingLink: (coreProfile as any)?.callBookingLink || "" } : null,
          title,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`PDF generation failed (${response.status}): ${errText}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SavvyProforma_${property?.address?.replace(/[^a-zA-Z0-9]/g, "_") || "property"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { console.error(e); alert(`PDF download failed: ${e.message || "Unknown error"}. Please try again.`); }
    setDownloading(false);
  };

  // ─── IMPORT HANDLERS ──────────────────────────────────────────────────────
  const handleImportZillow = async () => {
    if (!property) return;
    const address = [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ");
    if (!address) { alert("No property address available to look up."); return; }
    setImportingZillow(true);
    try {
      const response = await fetch("/api/external/zillow-lookup", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!response.ok) throw new Error(await response.text());
      const { data } = await response.json();
      if (!data) throw new Error("No data returned from Zillow");
      // Auto-fill fields from Zillow data
      const updates: Partial<ProformaForm> = {};
      if (data.price && !form.purchasePrice) updates.purchasePrice = String(data.price);
      if (data.photoUrl) updates.propertyPhotoUrl = data.photoUrl;
      if (data.description) updates.propertyDescription = data.description.substring(0, 500);
      if (data.zillowUrl) updates.propertyLink = data.zillowUrl;
      if (data.annualInsurance) updates.expInsuranceAnnual = String(Math.round(data.annualInsurance));
      if (data.taxHistory?.taxPaid) updates.expPropertyTaxAnnual = String(Math.round(data.taxHistory.taxPaid));
      if (Object.keys(updates).length > 0) {
        hasDirtyChanges.current = true;
        setForm(prev => ({ ...prev, ...updates }));
      }
      alert(`Imported from Zillow:\n• Price: $${data.price?.toLocaleString() || "N/A"}\n• ${data.bedrooms || "?"} beds / ${data.bathrooms || "?"} baths / ${data.sqft?.toLocaleString() || "?"} sqft\n• Year Built: ${data.yearBuilt || "N/A"}\n• Photo: ${data.photoUrl ? "Yes" : "No"}\n• Insurance: $${data.annualInsurance?.toLocaleString() || "N/A"}/yr\n• Tax: $${data.taxHistory?.taxPaid?.toLocaleString() || "N/A"}/yr`);
    } catch (e: any) { alert(`Zillow import failed: ${e.message}`); }
    setImportingZillow(false);
  };

  const handleImportAirbnb = async (url: string, compIndex: number) => {
    if (!url) { alert("Please enter an Airbnb listing URL."); return; }
    setImportingAirbnb(true);
    try {
      const response = await fetch("/api/external/airbnb-lookup", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error(await response.text());
      const { data } = await response.json();
      if (!data) throw new Error("No data returned from Airbnb");
      // Update the comp at the given index
      const comps = [...form.comps];
      comps[compIndex] = {
        ...comps[compIndex],
        name: data.title || comps[compIndex].name,
        beds: data.bedrooms ? String(data.bedrooms) : comps[compIndex].beds,
        city: data.city || comps[compIndex].city || "",
        link: data.airbnbUrl || comps[compIndex].link,
        notes: `Rating: ${data.rating || "N/A"} (${data.reviewCount || 0} reviews). ${data.roomType || ""}. ${data.isSuperhost ? "Superhost." : ""}`,
        photoUrl: data.photos?.[0] || "",
        rating: data.rating ? String(data.rating) : "",
        reviewCount: data.reviewCount ? String(data.reviewCount) : "",
      };
      setField("comps", comps);
      alert(`Imported from Airbnb:\n• Title: ${data.title}\n• Rating: ${data.rating} (${data.reviewCount} reviews)\n• Beds: ${data.bedrooms || "N/A"}\n• Photo: ${data.photos?.length ? "Yes" : "No"}`);
    } catch (e: any) { alert(`Airbnb import failed: ${e.message}`); }
    setImportingAirbnb(false);
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/properties/${propertyId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Property
          </Button>
        </div>
        <PageHeader
          title="Pro-forma Analysis"
          subtitle={property ? `${property.address}, ${property.city} ${property.state}` : ""}
          actions={<Button size="sm" onClick={startNewProforma}><Plus className="h-4 w-4 mr-1" /> New Pro-forma</Button>}
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
              <Button onClick={startNewProforma}><Plus className="h-4 w-4 mr-1" /> Create Pro-forma</Button>
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
          <Button variant="outline" size="sm" onClick={() => navigate("/proforma-defaults")}>
            <Settings className="h-4 w-4 mr-1" /> Defaults
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloading}>
            <Download className="h-4 w-4 mr-1" /> {downloading ? "Generating..." : "Download PDF"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : hasDirtyChanges.current ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <Input className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0" value={title} onChange={e => setTitle(e.target.value)} placeholder="Pro-forma Title" />
        <p className="text-sm text-slate-500">{[property?.address, [property?.city, property?.state, property?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
      </div>

      <Tabs defaultValue="acquisition" className="w-full">
        <TabsList className="mb-4 flex overflow-x-auto h-auto gap-0 w-full" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <TabsTrigger value="acquisition" className="shrink-0 whitespace-nowrap text-xs"><Home className="h-3 w-3 mr-1" />Acquisition</TabsTrigger>
          <TabsTrigger value="financing" className="shrink-0 whitespace-nowrap text-xs"><Calculator className="h-3 w-3 mr-1" />Financing</TabsTrigger>
          <TabsTrigger value="revenue" className="shrink-0 whitespace-nowrap text-xs"><DollarSign className="h-3 w-3 mr-1" />Revenue</TabsTrigger>
          <TabsTrigger value="expenses" className="shrink-0 whitespace-nowrap text-xs"><BarChart3 className="h-3 w-3 mr-1" />Expenses</TabsTrigger>
          <TabsTrigger value="tax" className="shrink-0 whitespace-nowrap text-xs"><Shield className="h-3 w-3 mr-1" />Tax Benefits</TabsTrigger>
          <TabsTrigger value="valueadd" className="shrink-0 whitespace-nowrap text-xs"><Home className="h-3 w-3 mr-1" />Value-Add / Refi</TabsTrigger>
          <TabsTrigger value="returns" className="shrink-0 whitespace-nowrap text-xs"><TrendingUp className="h-3 w-3 mr-1" />Returns</TabsTrigger>
          <TabsTrigger value="comps" className="shrink-0 whitespace-nowrap text-xs"><BookOpen className="h-3 w-3 mr-1" />Comps</TabsTrigger>
          <TabsTrigger value="notes" className="shrink-0 whitespace-nowrap text-xs"><FileText className="h-3 w-3 mr-1" />Notes</TabsTrigger>
        </TabsList>

        {/* ─── TAB: ACQUISITION ─────────────────────────────────────────────── */}
        <TabsContent value="acquisition">
          {/* Import from Zillow - at the top */}
          <Card className="mb-4 border-blue-200 bg-blue-50/30">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium">Import Details from Zillow</p>
                  <p className="text-xs text-slate-500">Auto-fills price, photo, insurance, and tax from Zillow listing data</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input className="h-8 text-sm flex-1" value={form.propertyLink} onChange={e => setField("propertyLink", e.target.value)} placeholder="https://www.zillow.com/homedetails/..." />
                <Button variant="outline" size="sm" className="shrink-0" onClick={handleImportZillow} disabled={importingZillow}>
                  <Home className="h-3 w-3 mr-1" /> {importingZillow ? "Importing..." : "Import from Zillow"}
                </Button>
              </div>
              {form.propertyPhotoUrl && (
                <div className="mt-3">
                  <img src={form.propertyPhotoUrl} alt="Property" className="w-full max-h-48 object-contain rounded border bg-white" />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Home className="h-4 w-4" /> Purchase Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Purchase Price *</Label>
                  <CurrencyInput value={form.purchasePrice} onChange={v => setField("purchasePrice", v)} placeholder="700,000" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Closing Costs</Label>
                  <div className="relative">
                    <Input className="pr-6 h-8 text-sm" value={form.closingCostsPct} onChange={e => setField("closingCostsPct", e.target.value)} placeholder="2" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                  {calc.closingCosts > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.closingCosts)}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Furnishing Budget</Label>
                  <CurrencyInput value={form.furnishingBudget} onChange={v => setField("furnishingBudget", v)} placeholder="25,000" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Renovation Budget</Label>
                  <CurrencyInput value={form.renovationBudget} onChange={v => setField("renovationBudget", v)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Startup Costs (photography, listing, supplies)</Label>
                  <CurrencyInput value={form.startupCosts} onChange={v => setField("startupCosts", v)} placeholder="5,000" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Inspection Costs</Label>
                  <CurrencyInput value={form.inspectionCosts} onChange={v => setField("inspectionCosts", v)} placeholder="1,500" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Seller Credit</Label>
                  <CurrencyInput value={form.sellerCredit} onChange={v => setField("sellerCredit", v)} placeholder="0" />
                  {parseNum(form.sellerCredit) > 0 && <p className="text-xs text-emerald-600 font-medium">Reduces cash to close by {fmtDollar(parseNum(form.sellerCredit))}</p>}
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
                  {calc.renovation > 0 && <div className="flex justify-between text-sm"><span>Renovation</span><span className="font-medium">{fmtDollar(calc.renovation)}</span></div>}
                  <div className="flex justify-between text-sm"><span>Startup Costs</span><span className="font-medium">{fmtDollar(calc.startup)}</span></div>
                  <div className="flex justify-between text-sm"><span>Inspections</span><span className="font-medium">{fmtDollar(calc.inspection)}</span></div>
                  {calc.sellerCredit > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Seller Credit</span><span className="font-medium">-{fmtDollar(calc.sellerCredit)}</span></div>}
                  <div className="border-t pt-2 flex justify-between text-base font-bold text-emerald-700">
                    <span>Total Cash Needed</span><span>{fmtDollar(calc.totalCashNeeded)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─── TAB: FINANCING (Down Payment moved here) ────────────────────── */}
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
                    <option value="conventional_second">Conventional Second Home</option>
                    <option value="other">Other</option>
                    <option value="cash">All Cash (No Loan)</option>
                  </select>
                </div>
                {form.loanType !== "cash" && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-600">Down Payment</Label>
                    <div className="relative">
                      <Input className="pr-6 h-8 text-sm" value={form.downPaymentPct} onChange={e => setField("downPaymentPct", e.target.value)} placeholder="20" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                    </div>
                    {calc.downPayment > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.downPayment)}</p>}
                  </div>
                )}
                {form.loanType !== "cash" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">Interest Rate</Label>
                      <div className="relative">
                        <Input className="pr-6 h-8 text-sm" value={form.interestRate} onChange={e => setField("interestRate", e.target.value)} placeholder="7" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">Loan Term</Label>
                      <div className="relative">
                        <Input className="pr-12 h-8 text-sm" value={form.loanTermYears} onChange={e => setField("loanTermYears", e.target.value)} placeholder="30" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">years</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">PMI (if &lt; 20% down)</Label>
                      <div className="relative">
                        <Input className="pr-6 h-8 text-sm" value={form.pmiPct} onChange={e => setField("pmiPct", e.target.value)} placeholder="0" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-500">Avg PMI rate: 0.60%</p>
                        {parseFloat(form.downPaymentPct || "20") < 20 && form.pmiPct !== "0.60" && (
                          <Button variant="ghost" size="sm" className="h-5 text-xs text-blue-600 p-0" onClick={() => setField("pmiPct", "0.60")}>Apply 0.60%</Button>
                        )}
                      </div>
                      {calc.monthlyPMI > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.monthlyPMI * 12)}/yr</p>}
                    </div>
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

        {/* ─── TAB: VALUE-ADD / REFI ─────────────────────────────────────── */}
        <TabsContent value="valueadd">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Value-Add Strategy</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Is this a value-add deal with an ARV?</Label>
                  <select className="w-full h-8 text-sm border rounded px-2" value={form.isValueAdd} onChange={e => setField("isValueAdd", e.target.value)}>
                    <option value="no">No — Standard Purchase</option>
                    <option value="yes">Yes — Value-Add with ARV</option>
                  </select>
                </div>

                {form.isValueAdd === "yes" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">After Repair Value (ARV)</Label>
                      <CurrencyInput value={form.afterRepairValue} onChange={v => setField("afterRepairValue", v)} placeholder="900,000" />
                    </div>

                    {calc.arv > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
                        <h4 className="text-sm font-semibold text-emerald-800">Equity Creation Summary</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex justify-between"><span className="text-slate-600">Purchase Price</span><span className="font-medium">{fmtDollar(calc.pp)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">Renovation Budget</span><span className="font-medium">{fmtDollar(calc.renovation)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">All-In Cost</span><span className="font-medium">{fmtDollar(calc.pp + calc.renovation)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-600">After Repair Value</span><span className="font-medium text-emerald-700">{fmtDollar(calc.arv)}</span></div>
                          <div className="flex justify-between border-t pt-1"><span className="text-slate-700 font-medium">Forced Equity (ARV - Purchase)</span><span className="font-bold text-emerald-700">{fmtDollar(calc.forcedEquity)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-700 font-medium">Net Equity Created (ARV - All-In)</span><span className="font-bold text-emerald-700">{fmtDollar(calc.equityCreatedByReno)}</span></div>
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-4 space-y-1">
                      <Label className="text-xs font-medium text-slate-600">Will the client do a cash-out refinance after value-add?</Label>
                      <select className="w-full h-8 text-sm border rounded px-2" value={form.isCashoutRefi} onChange={e => setField("isCashoutRefi", e.target.value)}>
                        <option value="no">No — Keep Original Loan</option>
                        <option value="yes">Yes — Cash-Out Refinance</option>
                      </select>
                    </div>

                    {form.isCashoutRefi === "yes" && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-slate-600">Refi Appraised Value</Label>
                            <CurrencyInput value={form.refiAppraisedValue || form.afterRepairValue} onChange={v => setField("refiAppraisedValue", v)} placeholder={form.afterRepairValue || "900,000"} />
                            <p className="text-xs text-slate-400">Defaults to ARV ({form.afterRepairValue ? `$${Number(form.afterRepairValue.replace(/[^0-9]/g, "")).toLocaleString()}` : "not set"})</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-slate-600">LTV for Refi</Label>
                            <div className="relative">
                              <Input className="pr-6 h-8 text-sm" value={form.refiLoanAmount ? (calc.refi ? (calc.refi.refiNewLoanAmount / calc.refi.refiAppraised * 100).toFixed(1) : form.refiLTV) : form.refiLTV} onChange={e => { setField("refiLTV", e.target.value); setField("refiLoanAmount", ""); }} placeholder="75" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                            </div>
                            {calc.refi && !form.refiLoanAmount && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.refi.refiNewLoanAmount)}</p>}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-slate-600">New Loan Amount</Label>
                            <CurrencyInput value={form.refiLoanAmount} onChange={v => setField("refiLoanAmount", v)} placeholder={calc.refi ? Math.round(calc.refi.refiNewLoanAmount).toLocaleString() : "675,000"} />
                            {form.refiLoanAmount && calc.refi && <p className="text-xs text-emerald-600 font-medium">LTV: {(calc.refi.refiNewLoanAmount / calc.refi.refiAppraised * 100).toFixed(1)}%</p>}
                            <p className="text-xs text-slate-400">Override to set a specific amount (auto-adjusts LTV)</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-slate-600">New Interest Rate</Label>
                            <div className="relative">
                              <Input className="pr-6 h-8 text-sm" value={form.refiInterestRate} onChange={e => setField("refiInterestRate", e.target.value)} placeholder="7" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-slate-600">New Loan Term</Label>
                            <div className="relative">
                              <Input className="pr-12 h-8 text-sm" value={form.refiLoanTermYears} onChange={e => setField("refiLoanTermYears", e.target.value)} placeholder="30" />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">years</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-medium text-slate-600">Seasoning Period (months before refi)</Label>
                          <div className="relative w-32">
                            <Input className="pr-14 h-8 text-sm" value={form.seasoningPeriodMonths} onChange={e => setField("seasoningPeriodMonths", e.target.value)} placeholder="6" />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">months</span>
                          </div>
                        </div>

                        {calc.refi && (
                          <>
                            {/* Timeline */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <h4 className="text-sm font-semibold text-blue-800 mb-2">Holding Period Timeline</h4>
                              <div className="flex items-center gap-1 text-xs">
                                <div className="bg-amber-100 border border-amber-300 rounded px-2 py-1 text-amber-800 font-medium">
                                  Months 1–{calc.refi.seasoningMonths}: Original Mortgage ({fmtDollar(calc.monthlyMortgage)}/mo)
                                </div>
                                <span className="text-slate-400">→</span>
                                <div className="bg-emerald-100 border border-emerald-300 rounded px-2 py-1 text-emerald-800 font-medium">
                                  Month {calc.refi.seasoningMonths + 1}+: Cash-Out Refi ({fmtDollar(calc.refi.refiMonthlyMortgage)}/mo)
                                </div>
                              </div>
                            </div>

                            {/* Refi Summary */}
                            <div className="bg-slate-50 border rounded-lg p-3 space-y-2">
                              <h4 className="text-sm font-semibold text-slate-700">Cash-Out Refinance Summary</h4>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                <div className="flex justify-between"><span className="text-slate-600">Appraised Value</span><span className="font-medium">{fmtDollar(calc.refi.refiAppraised)}</span></div>
                                <div className="flex justify-between"><span className="text-slate-600">LTV</span><span className="font-medium">{form.refiLTV}%</span></div>
                                <div className="flex justify-between"><span className="text-slate-600">New Loan Amount</span><span className="font-medium">{fmtDollar(calc.refi.refiNewLoanAmount)}</span></div>
                                <div className="flex justify-between"><span className="text-slate-600">Original Loan Payoff</span><span className="font-medium">{fmtDollar(calc.loanAmount)}</span></div>
                                <div className="flex justify-between border-t pt-1"><span className="text-slate-700 font-semibold">Cash Out</span><span className="font-bold text-emerald-700">{fmtDollar(calc.refi.refiCashOut)}</span></div>
                                <div className="flex justify-between border-t pt-1"><span className="text-slate-700 font-semibold">New Monthly Payment</span><span className="font-bold">{fmtDollar(calc.refi.refiMonthlyMortgage)}</span></div>
                              </div>
                            </div>

                            {/* Side-by-side: Pre-Refi vs Post-Refi */}
                            <div className="border-t pt-4">
                              <h4 className="text-sm font-semibold text-slate-700 mb-3">Pre-Refi vs. Post-Refi Returns (Side-by-Side)</h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-slate-100">
                                      <th className="p-2 text-left font-medium">Metric</th>
                                      <th className="p-2 text-right font-medium" colSpan={3}>Pre-Refi (Original)</th>
                                      <th className="p-2 text-right font-medium" colSpan={3}>Post-Refi (New Loan)</th>
                                    </tr>
                                    <tr className="bg-slate-50 text-xs text-slate-500">
                                      <th className="p-1"></th>
                                      <th className="p-1 text-right">Cons.</th>
                                      <th className="p-1 text-right">Base</th>
                                      <th className="p-1 text-right">Strong</th>
                                      <th className="p-1 text-right">Cons.</th>
                                      <th className="p-1 text-right">Base</th>
                                      <th className="p-1 text-right">Strong</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="border-b">
                                      <td className="p-2">Monthly Mortgage</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.monthlyMortgage)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.monthlyMortgage)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.monthlyMortgage)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi?.refiMonthlyMortgage ?? 0)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi?.refiMonthlyMortgage ?? 0)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi?.refiMonthlyMortgage ?? 0)}</td>
                                    </tr>
                                    <tr className="border-b">
                                      <td className="p-2">Annual Debt Service</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.annualDebtService)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.annualDebtService)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.annualDebtService)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi?.refiAnnualDebtService ?? 0)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi?.refiAnnualDebtService ?? 0)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi?.refiAnnualDebtService ?? 0)}</td>
                                    </tr>
                                    <tr className="border-b">
                                      <td className="p-2 font-medium">Annual Cash Flow</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.s1.cashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.s2.cashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.s3.cashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi.s1.postRefiCashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi.s2.postRefiCashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi.s3.postRefiCashFlow)}</td>
                                    </tr>
                                    <tr className="border-b">
                                      <td className="p-2">Monthly Cash Flow</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.s1.monthlyCashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.s2.monthlyCashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.s3.monthlyCashFlow)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi.s1.postRefiMonthlyCF)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi.s2.postRefiMonthlyCF)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.refi.s3.postRefiMonthlyCF)}</td>
                                    </tr>
                                    <tr className="border-b">
                                      <td className="p-2">Cash in Deal</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.totalCashNeeded)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.totalCashNeeded)}</td>
                                      <td className="p-2 text-right">{fmtDollar(calc.totalCashNeeded)}</td>
                                      <td className="p-2 text-right">{calc.refi?.cashLeftInDeal <= 0 ? <span className="text-emerald-700 font-bold">$0</span> : fmtDollar(calc.refi?.cashLeftInDeal ?? 0)}</td>
                                      <td className="p-2 text-right">{calc.refi?.cashLeftInDeal <= 0 ? <span className="text-emerald-700 font-bold">$0</span> : fmtDollar(calc.refi?.cashLeftInDeal ?? 0)}</td>
                                      <td className="p-2 text-right">{calc.refi?.cashLeftInDeal <= 0 ? <span className="text-emerald-700 font-bold">$0</span> : fmtDollar(calc.refi?.cashLeftInDeal ?? 0)}</td>
                                    </tr>
                                    <tr className="border-b bg-emerald-50">
                                      <td className="p-2 font-bold">Cash-on-Cash Return</td>
                                      <td className="p-2 text-right font-bold">{fmtPct(calc.s1.cashOnCash)}</td>
                                      <td className="p-2 text-right font-bold">{fmtPct(calc.s2.cashOnCash)}</td>
                                      <td className="p-2 text-right font-bold">{fmtPct(calc.s3.cashOnCash)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s1.infiniteReturn ? "∞" : fmtPct(calc.refi.s1.postRefiCoC)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s2.infiniteReturn ? "∞" : fmtPct(calc.refi.s2.postRefiCoC)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s3.infiniteReturn ? "∞" : fmtPct(calc.refi.s3.postRefiCoC)}</td>
                                    </tr>
                                    <tr className="border-b">
                                      <td className="p-2">DSCR</td>
                                      <td className="p-2 text-right">{calc.s1.dscr === Infinity ? "∞" : `${calc.s1.dscr.toFixed(2)}x`}</td>
                                      <td className="p-2 text-right">{calc.s2.dscr === Infinity ? "∞" : `${calc.s2.dscr.toFixed(2)}x`}</td>
                                      <td className="p-2 text-right">{calc.s3.dscr === Infinity ? "∞" : `${calc.s3.dscr.toFixed(2)}x`}</td>
                                      <td className="p-2 text-right">{calc.refi.s1.postRefiDSCR === Infinity ? "∞" : `${calc.refi.s1.postRefiDSCR.toFixed(2)}x`}</td>
                                      <td className="p-2 text-right">{calc.refi.s2.postRefiDSCR === Infinity ? "∞" : `${calc.refi.s2.postRefiDSCR.toFixed(2)}x`}</td>
                                      <td className="p-2 text-right">{calc.refi.s3.postRefiDSCR === Infinity ? "∞" : `${calc.refi.s3.postRefiDSCR.toFixed(2)}x`}</td>
                                    </tr>
                                    <tr className="border-b bg-emerald-50">
                                      <td className="p-2 font-medium text-emerald-800">CoC w/ Tax Benefits (Yr 1)</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s1.year1CoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s2.year1CoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s3.year1CoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s1.postRefiYear1CoCWithTax === Infinity ? "∞" : fmtPct(calc.refi.s1.postRefiYear1CoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s2.postRefiYear1CoCWithTax === Infinity ? "∞" : fmtPct(calc.refi.s2.postRefiYear1CoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s3.postRefiYear1CoCWithTax === Infinity ? "∞" : fmtPct(calc.refi.s3.postRefiYear1CoCWithTax)}</td>
                                    </tr>
                                    <tr className="bg-emerald-50">
                                      <td className="p-2 font-medium text-emerald-800">CoC w/ Tax Benefits (Yr 2+)</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s1.ongoingCoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s2.ongoingCoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s3.ongoingCoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s1.postRefiOngoingCoCWithTax === Infinity ? "∞" : fmtPct(calc.refi.s1.postRefiOngoingCoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s2.postRefiOngoingCoCWithTax === Infinity ? "∞" : fmtPct(calc.refi.s2.postRefiOngoingCoCWithTax)}</td>
                                      <td className="p-2 text-right font-bold text-emerald-700">{calc.refi.s3.postRefiOngoingCoCWithTax === Infinity ? "∞" : fmtPct(calc.refi.s3.postRefiOngoingCoCWithTax)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              {calc.refi.cashLeftInDeal <= 0 && (
                                <p className="text-xs text-emerald-700 font-medium mt-2">✨ The client pulls out more cash than they invested — effectively infinite cash-on-cash return with positive monthly cash flow!</p>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
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
                  {([
                    { label: "Conservative", prefix: "scenario1", s: calc.s1 },
                    { label: "Base Case", prefix: "scenario2", s: calc.s2 },
                    { label: "Strong Execution", prefix: "scenario3", s: calc.s3 },
                  ] as const).map(({ label, prefix, s }) => (
                    <div key={prefix} className="border rounded-lg p-3 space-y-2">
                      <h4 className="font-medium text-sm text-slate-700">{label}</h4>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Average Daily Rate (ADR)</Label>
                        <CurrencyInput value={(form as any)[`${prefix}ADR`]} onChange={v => { const n = parseNum(v); setField(`${prefix}ADR` as any, n > 9999 ? "9999" : v); }} placeholder="250" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Occupancy Rate</Label>
                        <div className="relative">
                          <Input className="pr-6 h-8 text-sm" value={(form as any)[`${prefix}Occupancy`]} onChange={e => { const v = e.target.value; const n = parseFloat(v); setField(`${prefix}Occupancy` as any, n > 100 ? "100" : v); }} placeholder="65" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Available Nights/Year</Label>
                        <Input className="h-8 text-sm" value={(form as any)[`${prefix}AvailableNights`]} onChange={e => setField(`${prefix}AvailableNights` as any, e.target.value)} placeholder="365" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Cleaning Fee Income (per booking, charged to guest)</Label>
                        <CurrencyInput value={(form as any)[`${prefix}CleaningFeeRevenue`]} onChange={v => setField(`${prefix}CleaningFeeRevenue` as any, v)} placeholder="150" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Cleaning Fee Expense (per turn, paid to cleaner)</Label>
                        <CurrencyInput value={(form as any)[`${prefix}CleaningFeeExpense`]} onChange={v => setField(`${prefix}CleaningFeeExpense` as any, v)} placeholder={`${(form as any)[`${prefix}CleaningFeeRevenue`] || "Same as income"}`} />
                        <p className="text-xs text-slate-400">Defaults to same as income if left blank</p>
                      </div>
                      {s.cleaningFeeRevenue > 0 && (
                        <div className="bg-slate-50 rounded p-2 text-xs space-y-0.5">
                          <div className="flex justify-between"><span>Cleaning Income ({Math.round(s.bookings)} bookings × {fmtDollar(s.cleaningFeeIncome)})</span><span className="text-emerald-600 font-medium">+{fmtDollar(s.cleaningFeeRevenue)}</span></div>
                          <div className="flex justify-between"><span>Cleaning Expense ({Math.round(s.bookings)} turns × {fmtDollar(s.cleaningFeeExpensePerTurn)})</span><span className="text-red-600 font-medium">-{fmtDollar(s.cleaningFeeExpenseTotal)}</span></div>
                          <div className="flex justify-between font-bold border-t pt-0.5"><span>Net Cleaning {s.cleaningNetProfit >= 0 ? "Profit" : "Loss"}</span><span className={s.cleaningNetProfit >= 0 ? "text-emerald-700" : "text-red-700"}>{fmtDollar(s.cleaningNetProfit)}/yr</span></div>
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Ancillary Revenue (annual)</Label>
                        <CurrencyInput value={(form as any)[`${prefix}AncillaryRevenue`]} onChange={v => setField(`${prefix}AncillaryRevenue` as any, v)} placeholder="0" />
                      </div>
                      <div className="border-t pt-2 space-y-1">
                        <div className="flex justify-between text-xs"><span>Sold Nights</span><span className="font-medium">{s.soldNights}</span></div>
                        <div className="flex justify-between text-xs"><span>Bookings (~{form.avgLengthOfStay} night avg)</span><span className="font-medium">{Math.round(s.bookings)}</span></div>
                        <div className="flex justify-between text-xs"><span>Gross Before Cleaning</span><span className="font-medium">{fmtDollar(s.grossBeforeCleaning)}</span></div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(["channelAirbnbPct", "channelVrboPct", "channelDirectPct"] as const).map((f, i) => (
                      <div key={f} className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">{["Airbnb %", "Vrbo %", "Direct %"][i]}</Label>
                        <div className="relative">
                          <Input className="pr-6 h-8 text-sm" value={form[f]} onChange={e => setField(f, e.target.value)} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(["feeAirbnb", "feeVrbo", "feeDirect"] as const).map((f, i) => (
                      <div key={f} className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">{["Airbnb Fee", "Vrbo Fee", "Direct Fee"][i]}</Label>
                        <div className="relative">
                          <Input className="pr-6 h-8 text-sm" value={form[f]} onChange={e => setField(f, e.target.value)} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Blended platform fee rate: <span className="font-medium">{fmtPctWhole(calc.blendedFeeRate)}</span></p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Growth Assumptions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(["revenueAppreciationPct", "propertyAppreciationPct"] as const).map((f, i) => (
                    <div key={f} className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">{["Revenue Appreciation (annual)", "Property Appreciation (annual)"][i]}</Label>
                      <div className="relative">
                        <Input className="pr-6 h-8 text-sm" value={form[f]} onChange={e => setField(f, e.target.value)} />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                      </div>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-600">Avg Length of Stay</Label>
                    <div className="relative">
                      <Input className="pr-12 h-8 text-sm" value={form.avgLengthOfStay} onChange={e => setField("avgLengthOfStay", e.target.value)} placeholder="3.5" />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">nights</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB: EXPENSES ───────────────────────────────────────────────── */}
        <TabsContent value="expenses">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Fixed Monthly Expenses</CardTitle>
                  <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => setField("customFixedExpenses", [...(form.customFixedExpenses || []), { label: "", amount: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Expense
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-0">
                {/* Fixed expenses: input is monthly, show yearly next to it */}
                {([
                  ["Utilities (electric, gas, water)", "expUtilities", false],
                  ["STR Insurance", "expInsuranceAnnual", true],
                  ["Property Tax", "expPropertyTaxAnnual", true],
                  ["HOA / POA Dues", "expHOA", false],
                  ["Internet / Cable / Streaming", "expInternet", false],
                  ["Landscaping / Snow Removal", "expLandscaping", false],
                  ["Pest Control", "expPestControl", false],
                  ["Hot Tub / Pool Service", "expHotTubPool", false],
                  ["Software (PMS + Dynamic Pricing)", "expSoftware", false],
                  ["Trash Service", "expTrash", false],
                  ["Smart Locks / Security / Noise", "expSmartLocks", false],
                  ["Accounting / Bookkeeping", "expAccounting", false],
                  ["Permits & Licenses", "expPermits", false],
                ] as [string, keyof ProformaForm, boolean][]).map(([label, field, isAnnual]) => {
                  const val = parseNum(form[field] as string);
                  const monthly = isAnnual ? val / 12 : val;
                  const yearly = isAnnual ? val : val * 12;
                  return (
                    <div key={field} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                      <div className="flex items-center gap-1 flex-1">
                        <Label className="text-xs text-slate-600">{label}</Label>
                        {label === "STR Insurance" && <a href="https://www.insurestr.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">(Get Quote)</a>}
                        {field === "expPropertyTaxAnnual" && form.propertyPhotoUrl && <span className="text-xs text-blue-400 italic">(from Zillow)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="relative w-20">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <Input className="pl-4 h-7 text-xs w-full" value={formatCurrencyInput(isAnnual ? String(Math.round(monthly)) : form[field] as string)} onChange={e => {
                            const v = e.target.value.replace(/[^0-9]/g, "");
                            setField(field, isAnnual ? String(parseNum(v) * 12) : v);
                          }} />
                        </div>
                        <span className="text-xs text-slate-400 w-5">/mo</span>
                        <div className="relative w-20">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <Input className="pl-4 h-7 text-xs w-full" value={formatCurrencyInput(isAnnual ? form[field] as string : String(Math.round(yearly)))} onChange={e => {
                            const v = e.target.value.replace(/[^0-9]/g, "");
                            setField(field, isAnnual ? v : String(Math.round(parseNum(v) / 12)));
                          }} />
                        </div>
                        <span className="text-xs text-slate-400 w-5">/yr</span>
                      </div>
                    </div>
                  );
                })}
                {/* Custom fixed expenses */}
                {(form.customFixedExpenses || []).map((exp, i) => (
                  <div key={`cf-${i}`} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <Input className="h-6 text-xs w-32 border-dashed" value={exp.label} placeholder="Expense name" onChange={e => {
                      const c = [...(form.customFixedExpenses || [])]; c[i] = { ...c[i], label: e.target.value }; setField("customFixedExpenses", c);
                    }} />
                    <div className="flex items-center gap-2">
                      <div className="relative w-24">
                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                        <Input className="pl-5 h-7 text-xs w-full" value={formatCurrencyInput(exp.amount)} onChange={e => {
                          const c = [...(form.customFixedExpenses || [])]; c[i] = { ...c[i], amount: e.target.value.replace(/[^0-9]/g, "") }; setField("customFixedExpenses", c);
                        }} />
                      </div>
                      <span className="text-xs text-slate-400 w-6">/mo</span>
                      <span className="text-xs text-slate-500 w-20 text-right">{fmtDollar(parseNum(exp.amount) * 12)}/yr</span>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => {
                        const c = [...(form.customFixedExpenses || [])]; c.splice(i, 1); setField("customFixedExpenses", c);
                      }}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </div>
                ))}
                <div className="border-t-2 pt-2 mt-2 flex justify-between font-bold text-sm">
                  <span>Total Fixed</span>
                  <span>{fmtDollar(calc.fixedMonthly)}/mo | {fmtDollar(calc.fixedAnnual)}/yr</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Variable Expenses</CardTitle>
                  <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => setField("customVariableExpenses", [...(form.customVariableExpenses || []), { label: "", amount: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Expense
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Property Management Fee (% of net revenue after platform fees)</Label>
                  <div className="relative">
                    <Input className="pr-6 h-8 text-sm" value={form.propertyMgmtPct} onChange={e => setField("propertyMgmtPct", e.target.value)} placeholder="0" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                  {calc.s2.mgmtExpense > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.s2.mgmtExpense)}/yr (base case: {form.propertyMgmtPct}% × {fmtDollar(calc.s2.netRevenue)} net rev)</p>}
                </div>
                {calc.s2.cleaningExpense > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>Cleaning Expense (base case)</span>
                      <span className="font-medium">{fmtDollar(calc.s2.cleaningExpense)}/yr</span>
                    </div>
                    <p className="text-xs text-slate-400">Configured per scenario on Revenue tab (income vs expense per turn)</p>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">CapEx / Maintenance Reserve (% of gross revenue)</Label>
                  <div className="relative">
                    <Input className="pr-6 h-8 text-sm" value={form.capExReservePct} onChange={e => setField("capExReservePct", e.target.value)} placeholder="5" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                  {calc.s2.capExReserve > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.s2.capExReserve)}/yr</p>}
                </div>
                {/* Custom variable expenses */}
                {(form.customVariableExpenses || []).map((exp, i) => (
                  <div key={`cv-${i}`} className="flex items-center gap-2">
                    <Input className="h-7 text-xs flex-1 border-dashed" value={exp.label} placeholder="Expense name" onChange={e => {
                      const c = [...(form.customVariableExpenses || [])]; c[i] = { ...c[i], label: e.target.value }; setField("customVariableExpenses", c);
                    }} />
                    <div className="relative w-24">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                      <Input className="pl-5 h-7 text-xs" value={formatCurrencyInput(exp.amount)} onChange={e => {
                        const c = [...(form.customVariableExpenses || [])]; c[i] = { ...c[i], amount: e.target.value.replace(/[^0-9]/g, "") }; setField("customVariableExpenses", c);
                      }} />
                    </div>
                    <span className="text-xs text-slate-400">/mo</span>
                    <span className="text-xs text-slate-500 w-16 text-right">{fmtDollar(parseNum(exp.amount) * 12)}/yr</span>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => {
                      const c = [...(form.customVariableExpenses || [])]; c.splice(i, 1); setField("customVariableExpenses", c);
                    }}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                  </div>
                ))}
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
            {/* Investment Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "Total Cash In Deal", value: fmtDollar(calc.totalCashNeeded) },
                { label: "Yr 1 Tax Benefit", value: fmtDollar(calc.netTaxBenefit), color: "text-emerald-700" },
                { label: "Effective Cash (after tax)", value: fmtDollar(Math.max(0, calc.totalCashNeeded - calc.netTaxBenefit)), color: "text-blue-700" },
                { label: "Monthly Mortgage", value: fmtDollar(calc.monthlyMortgage) },
                { label: "Base Case Cash Flow", value: fmtDollar(calc.s2.cashFlow), color: calc.s2.cashFlow >= 0 ? "text-emerald-700" : "text-red-600" },
                { label: "Base Case CoC", value: fmtPct(calc.s2.cashOnCash), color: calc.s2.cashOnCash >= 0.08 ? "text-emerald-700" : "text-amber-600" },
              ].map(m => (
                <Card key={m.label} className="bg-slate-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-[10px] text-slate-500 leading-tight">{m.label}</p>
                    <p className={`text-base font-bold ${m.color || "text-slate-800"}`}>{m.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Scenario Comparison</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-100 text-left"><th className="p-2 font-medium">Metric</th><th className="p-2 font-medium text-right">Conservative</th><th className="p-2 font-medium text-right">Base Case</th><th className="p-2 font-medium text-right">Strong Execution</th></tr></thead>
                    <tbody>
                      {[
                        { label: "ADR", v: [fmtDollar(calc.s1.adr), fmtDollar(calc.s2.adr), fmtDollar(calc.s3.adr)] },
                        { label: "Occupancy", v: [fmtPctWhole(calc.s1.occ), fmtPctWhole(calc.s2.occ), fmtPctWhole(calc.s3.occ)] },
                        { label: "Sold Nights", v: [String(calc.s1.soldNights), String(calc.s2.soldNights), String(calc.s3.soldNights)] },
                        { label: "Gross Before Cleaning", v: [fmtDollar(calc.s1.grossBeforeCleaning), fmtDollar(calc.s2.grossBeforeCleaning), fmtDollar(calc.s3.grossBeforeCleaning)] },
                        { label: "Gross Revenue", v: [fmtDollar(calc.s1.grossRevenue), fmtDollar(calc.s2.grossRevenue), fmtDollar(calc.s3.grossRevenue)], bold: true },
                        { label: "Platform Fees", v: [fmtDollar(calc.s1.platformFees), fmtDollar(calc.s2.platformFees), fmtDollar(calc.s3.platformFees)] },
                        { label: "Net Revenue", v: [fmtDollar(calc.s1.netRevenue), fmtDollar(calc.s2.netRevenue), fmtDollar(calc.s3.netRevenue)] },
                        { label: "Total Expenses", v: [fmtDollar(calc.s1.totalExpensesAnnual), fmtDollar(calc.s2.totalExpensesAnnual), fmtDollar(calc.s3.totalExpensesAnnual)] },
                        { label: "NOI", v: [fmtDollar(calc.s1.noi), fmtDollar(calc.s2.noi), fmtDollar(calc.s3.noi)], bold: true },
                        { label: "Debt Service", v: [fmtDollar(calc.annualDebtService), fmtDollar(calc.annualDebtService), fmtDollar(calc.annualDebtService)] },
                        { label: "Net Cash Flow", v: [fmtDollar(calc.s1.cashFlow), fmtDollar(calc.s2.cashFlow), fmtDollar(calc.s3.cashFlow)], bold: true, highlight: true },
                        { label: "Monthly Cash Flow", v: [fmtDollar(calc.s1.monthlyCashFlow), fmtDollar(calc.s2.monthlyCashFlow), fmtDollar(calc.s3.monthlyCashFlow)] },
                        { label: "Cash-on-Cash Return", v: [fmtPct(calc.s1.cashOnCash), fmtPct(calc.s2.cashOnCash), fmtPct(calc.s3.cashOnCash)], bold: true },
                        { label: "CoC w/ Tax Benefits (Yr 1)", v: [fmtPct(calc.taxReturns.s1.year1CoCWithTax), fmtPct(calc.taxReturns.s2.year1CoCWithTax), fmtPct(calc.taxReturns.s3.year1CoCWithTax)], bold: true, highlight: true },
                        { label: "CoC w/ Tax Benefits (Yr 2+)", v: [fmtPct(calc.taxReturns.s1.ongoingCoCWithTax), fmtPct(calc.taxReturns.s2.ongoingCoCWithTax), fmtPct(calc.taxReturns.s3.ongoingCoCWithTax)], highlight: true },
                        { label: "Cap Rate", v: [fmtPct(calc.s1.capRate), fmtPct(calc.s2.capRate), fmtPct(calc.s3.capRate)] },
                        { label: "Gross Yield", v: [fmtPct(calc.s1.grossYield), fmtPct(calc.s2.grossYield), fmtPct(calc.s3.grossYield)] },
                        { label: "DSCR", v: [`${calc.s1.dscr === Infinity ? "∞" : calc.s1.dscr.toFixed(2)}x`, `${calc.s2.dscr === Infinity ? "∞" : calc.s2.dscr.toFixed(2)}x`, `${calc.s3.dscr === Infinity ? "∞" : calc.s3.dscr.toFixed(2)}x`] },
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
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">5-Year Wealth Building (Base Case)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-slate-100 text-left"><th className="p-2">Year</th><th className="p-2 text-right">Revenue</th><th className="p-2 text-right">Cash Flow</th><th className="p-2 text-right">Cumul. CF</th><th className="p-2 text-right">Tax Benefit</th><th className="p-2 text-right">Debt Paydown</th><th className="p-2 text-right">Appreciation</th><th className="p-2 text-right">Property Value</th><th className="p-2 text-right">Total Equity</th></tr></thead>
                    <tbody>
                      {(() => {
                        let cumulCF = 0;
                        return calc.fiveYear.map((yr, i) => {
                          cumulCF += yr.cashFlow;
                          const taxBen = i === 0 ? calc.netTaxBenefit + calc.ongoingAnnualTaxBenefit : calc.ongoingAnnualTaxBenefit;
                          const appreciation = yr.propertyValue - calc.pp;
                          return (
                            <tr key={yr.year} className="border-b">
                              <td className="p-2 font-medium">Year {yr.year}</td>
                              <td className="p-2 text-right">{fmtDollar(yr.revenue)}</td>
                              <td className="p-2 text-right">{fmtDollar(yr.cashFlow)}</td>
                              <td className="p-2 text-right font-medium">{fmtDollar(cumulCF)}</td>
                              <td className="p-2 text-right text-emerald-600">{fmtDollar(taxBen)}</td>
                              <td className="p-2 text-right">{fmtDollar(yr.principalPaid)}</td>
                              <td className="p-2 text-right">{fmtDollar(appreciation)}</td>
                              <td className="p-2 text-right">{fmtDollar(yr.propertyValue)}</td>
                              <td className="p-2 text-right font-bold text-emerald-700">{fmtDollar(yr.equity)}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-2">Total 5-Year Return: Cumulative Cash Flow ({fmtDollar(calc.fiveYear.reduce((s, y) => s + y.cashFlow, 0))}) + Tax Benefits ({fmtDollar(calc.netTaxBenefit + calc.ongoingAnnualTaxBenefit * 5)}) + Equity ({fmtDollar(calc.fiveYear[4]?.equity || 0)}) = <span className="font-bold text-emerald-700">{fmtDollar(calc.fiveYear.reduce((s, y) => s + y.cashFlow, 0) + calc.netTaxBenefit + calc.ongoingAnnualTaxBenefit * 5 + (calc.fiveYear[4]?.equity || 0))}</span></p>
              </CardContent>
            </Card>

            {/* IRR Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Internal Rate of Return (IRR)
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">IRR accounts for cash flow, appreciation, principal paydown, and exit proceeds over the hold period.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Selling Costs at Exit (agent commissions, closing)</Label>
                  <div className="relative w-32">
                    <Input className="pr-6 h-8 text-sm" value={form.sellingCostsPct} onChange={e => setField("sellingCostsPct", e.target.value)} placeholder="6" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-left">
                        <th className="p-2 font-medium">Hold Period</th>
                        <th className="p-2 font-medium text-right" colSpan={2}>Conservative</th>
                        <th className="p-2 font-medium text-right" colSpan={2}>Base Case</th>
                        <th className="p-2 font-medium text-right" colSpan={2}>Strong Execution</th>
                      </tr>
                      <tr className="bg-slate-50 text-xs text-slate-500">
                        <th className="p-1"></th>
                        <th className="p-1 text-right">Pre-Tax</th>
                        <th className="p-1 text-right">After-Tax</th>
                        <th className="p-1 text-right">Pre-Tax</th>
                        <th className="p-1 text-right">After-Tax</th>
                        <th className="p-1 text-right">Pre-Tax</th>
                        <th className="p-1 text-right">After-Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "3-Year Hold", k: "y3" as const, kat: "y3at" as const },
                        { label: "5-Year Hold", k: "y5" as const, kat: "y5at" as const },
                        { label: "7-Year Hold", k: "y7" as const, kat: "y7at" as const },
                      ].map(row => (
                        <tr key={row.label} className="border-b">
                          <td className="p-2 font-medium">{row.label}</td>
                          <td className="p-2 text-right">{fmtPct(calc.irr.s1[row.k])}</td>
                          <td className="p-2 text-right font-medium text-emerald-700">{fmtPct(calc.irr.s1[row.kat])}</td>
                          <td className="p-2 text-right">{fmtPct(calc.irr.s2[row.k])}</td>
                          <td className="p-2 text-right font-medium text-emerald-700">{fmtPct(calc.irr.s2[row.kat])}</td>
                          <td className="p-2 text-right">{fmtPct(calc.irr.s3[row.k])}</td>
                          <td className="p-2 text-right font-medium text-emerald-700">{fmtPct(calc.irr.s3[row.kat])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 italic">After-tax IRR includes Year 1 cost segregation / bonus depreciation benefit and ongoing straight-line depreciation tax shield. Assumes {form.sellingCostsPct}% selling costs at exit and {form.propertyAppreciationPct}% annual property appreciation.</p>
              </CardContent>
            </Card>

            {/* Returns Including Tax Benefits */}
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-emerald-800">Returns Including Tax Benefits</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-emerald-100"><th className="p-2 text-left">Metric</th><th className="p-2 text-right">Conservative</th><th className="p-2 text-right">Base Case</th><th className="p-2 text-right">Strong</th></tr></thead>
                    <tbody>
                      <tr className="border-b"><td className="p-2 font-medium">Year 1 Cash Flow (w/ tax benefits)</td><td className="p-2 text-right">{fmtDollar(calc.taxReturns.s1.year1CashFlowWithTax)}</td><td className="p-2 text-right">{fmtDollar(calc.taxReturns.s2.year1CashFlowWithTax)}</td><td className="p-2 text-right">{fmtDollar(calc.taxReturns.s3.year1CashFlowWithTax)}</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Year 1 CoC Return (w/ tax benefits)</td><td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s1.year1CoCWithTax)}</td><td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s2.year1CoCWithTax)}</td><td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s3.year1CoCWithTax)}</td></tr>
                      <tr className="border-b"><td className="p-2 font-medium">Ongoing Cash Flow (yr 2+, w/ depreciation + interest)</td><td className="p-2 text-right">{fmtDollar(calc.taxReturns.s1.ongoingCashFlowWithTax)}</td><td className="p-2 text-right">{fmtDollar(calc.taxReturns.s2.ongoingCashFlowWithTax)}</td><td className="p-2 text-right">{fmtDollar(calc.taxReturns.s3.ongoingCashFlowWithTax)}</td></tr>
                      <tr><td className="p-2 font-medium">Ongoing CoC Return (yr 2+)</td><td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s1.ongoingCoCWithTax)}</td><td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s2.ongoingCoCWithTax)}</td><td className="p-2 text-right font-bold text-emerald-700">{fmtPct(calc.taxReturns.s3.ongoingCoCWithTax)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-2">Year 1 includes cost seg + bonus depreciation + ongoing benefits. Year 2+ includes straight-line depreciation ({fmtDollar(calc.straightLineDepreciation)}/yr) + mortgage interest ({fmtDollar(calc.year1MortgageInterest)}/yr) deductions.</p>
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
                    <option value="yes">Yes — Accelerated Depreciation</option>
                    <option value="no">No — Standard Depreciation Only</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Land Allocation (non-depreciable)</Label>
                  <div className="relative">
                    <Input className="pr-6 h-8 text-sm" value={form.landAllocationPct} onChange={e => setField("landAllocationPct", e.target.value)} placeholder="20" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                  {calc.pp > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.pp * parsePct(form.landAllocationPct))} land</p>}
                </div>
                {form.costSegEnabled === "yes" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">Accelerated Depreciation % (5/7/15-yr property)</Label>
                      <div className="relative">
                        <Input className="pr-6 h-8 text-sm" value={form.acceleratedDepreciationPct} onChange={e => setField("acceleratedDepreciationPct", e.target.value)} placeholder="25" />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                      </div>
                      {calc.acceleratedAmt > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.acceleratedAmt)}</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">Cost Seg Study Cost</Label>
                      <CurrencyInput value={form.costSegStudyCost} onChange={v => setField("costSegStudyCost", v)} placeholder="3,500" />
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Marginal Tax Rate</Label>
                  <div className="relative">
                    <Input className="pr-6 h-8 text-sm" value={form.marginalTaxRate} onChange={e => setField("marginalTaxRate", e.target.value)} placeholder="35" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">100% bonus depreciation is permanent for property acquired after Jan 19, 2025 (One Big Beautiful Bill Act). Furnishings are also 100% bonus-eligible.</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-50">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Estimated Year 1 Tax Benefit</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span>Building Basis (after land)</span><span className="font-medium">{fmtDollar(calc.buildingBasis)}</span></div>
                  {calc.costSegEnabled && <div className="flex justify-between text-sm"><span>Accelerated Depreciation</span><span className="font-medium">{fmtDollar(calc.acceleratedAmt)}</span></div>}
                  <div className="flex justify-between text-sm"><span>Furnishing Depreciation (100%)</span><span className="font-medium">{fmtDollar(calc.furnishing)}</span></div>
                  {calc.renovation > 0 && <div className="flex justify-between text-sm"><span>Renovation Depreciation (100%)</span><span className="font-medium">{fmtDollar(calc.renovation)}</span></div>}
                  <div className="border-t pt-2 flex justify-between text-sm font-medium"><span>Total Year 1 Deduction</span><span>{fmtDollar(calc.totalFirstYearDeduction)}</span></div>
                  <div className="flex justify-between text-sm"><span>Tax Savings @ {form.marginalTaxRate}%</span><span className="font-medium text-emerald-700">{fmtDollar(calc.taxSavings)}</span></div>
                  {calc.costSegEnabled && <div className="flex justify-between text-sm"><span>Less: Study Cost</span><span className="text-red-500">-{fmtDollar(calc.costSegCost)}</span></div>}
                  <div className="border-t pt-2 flex justify-between text-base font-bold text-emerald-700"><span>Net Tax Benefit</span><span>{fmtDollar(calc.netTaxBenefit)}</span></div>
                </div>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                  <strong>Disclaimer:</strong> This is an estimate only. Tax benefits require material participation (avg stay ≤7 days + active involvement). Consult your CPA before relying on these figures.
                </div>
              </CardContent>
            </Card>
          </div>
          {/* Ongoing Annual Tax Benefits */}
          <Card className="mt-4">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Ongoing Annual Tax Benefits (Year 2+)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm"><span>Straight-Line Depreciation (building / 27.5 yrs)</span><span className="font-medium">{fmtDollar(calc.straightLineDepreciation)}/yr</span></div>
                {calc.year1MortgageInterest > 0 && <div className="flex justify-between text-sm"><span>Mortgage Interest Deduction (approx Year 1)</span><span className="font-medium">{fmtDollar(calc.year1MortgageInterest)}/yr</span></div>}
                <div className="border-t pt-2 flex justify-between text-sm font-medium"><span>Total Annual Deduction</span><span>{fmtDollar(calc.ongoingAnnualDeduction)}/yr</span></div>
                <div className="flex justify-between text-sm font-bold text-emerald-700"><span>Annual Tax Savings @ {form.marginalTaxRate}%</span><span>{fmtDollar(calc.ongoingAnnualTaxBenefit)}/yr</span></div>
              </div>
              <p className="text-xs text-slate-400 mt-2">Mortgage interest deduction decreases annually as principal is paid down. This estimate uses Year 1 interest.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── TAB: COMPS ──────────────────────────────────────────────────── */}
        <TabsContent value="comps">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Revenue Comparable Properties</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowExistingComps(true)}>
                    <BookOpen className="h-3 w-3 mr-1" /> Import Existing Comps
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setField("comps", [...form.comps, { name: "", annualRevenue: "", occupancy: "", adr: "", beds: "", link: "", notes: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Comp
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {form.comps.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No comps added yet. Add comparable properties to support your revenue projections.</p>
              ) : (
                <div className="space-y-3">
                  {form.comps.map((comp, i) => {
                    // Auto-calculate annual revenue from ADR and occupancy
                    const compAdr = parseFloat(comp.adr?.replace(/[$,]/g, "") || "0");
                    const compOcc = parseFloat(comp.occupancy?.replace(/%/g, "") || "0") / 100;
                    const compCalcRevenue = compAdr > 0 && compOcc > 0 ? Math.round(compAdr * compOcc * 365) : 0;
                    return (
                    <div key={i} className="border rounded p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {comp.photoUrl && <img src={comp.photoUrl} alt="" className="w-10 h-10 rounded object-cover" />}
                          <span className="text-xs font-medium text-slate-500">Comp {i + 1}{comp.rating ? ` • ⭐ ${comp.rating}` : ""}{comp.reviewCount ? ` (${comp.reviewCount} reviews)` : ""}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { const c = [...form.comps]; c.splice(i, 1); setField("comps", c); }}>
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </div>
                      {/* Link + Import first */}
                      <div className="flex items-center gap-2">
                        <div className="space-y-1 flex-1"><Label className="text-xs">Airbnb / Listing Link</Label><Input className="h-7 text-xs" value={comp.link} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], link: e.target.value }; setField("comps", c); }} placeholder="https://www.airbnb.com/rooms/..." /></div>
                        {comp.link && comp.link.includes("airbnb") && (
                          <Button variant="outline" size="sm" className="text-xs mt-4" onClick={() => handleImportAirbnb(comp.link, i)} disabled={importingAirbnb}>
                            {importingAirbnb ? "Importing..." : "Import"}
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="space-y-1"><Label className="text-xs">Name/Title</Label><Input className="h-7 text-xs" value={comp.name} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], name: e.target.value }; setField("comps", c); }} /></div>
                        <div className="space-y-1"><Label className="text-xs">ADR</Label><div className="relative"><span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span><Input className="pl-4 h-7 text-xs" value={formatCurrencyInput(comp.adr?.replace(/[$]/g, "") || "")} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); const n = parseInt(v); const c = [...form.comps]; c[i] = { ...c[i], adr: n > 9999 ? "9999" : v }; setField("comps", c); }} placeholder="250" /></div></div>
                        <div className="space-y-1"><Label className="text-xs">Occupancy %</Label><Input className="h-7 text-xs" value={comp.occupancy} onChange={e => { const v = e.target.value; const n = parseFloat(v); const c = [...form.comps]; c[i] = { ...c[i], occupancy: n > 100 ? "100" : v }; setField("comps", c); }} placeholder="72" /></div>
                        <div className="space-y-1"><Label className="text-xs">Annual Revenue</Label><Input className="h-7 text-xs bg-slate-50" value={compCalcRevenue > 0 ? `$${compCalcRevenue.toLocaleString()}` : (comp.annualRevenue || "")} readOnly={compCalcRevenue > 0} onChange={e => { if (compCalcRevenue === 0) { const c = [...form.comps]; c[i] = { ...c[i], annualRevenue: e.target.value }; setField("comps", c); } }} placeholder="Auto from ADR × Occ" /></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1"><Label className="text-xs">Beds</Label><Input className="h-7 text-xs" value={comp.beds} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], beds: e.target.value }; setField("comps", c); }} /></div>
                        <div className="space-y-1"><Label className="text-xs">City</Label><Input className="h-7 text-xs" value={comp.city || ""} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], city: e.target.value }; setField("comps", c); }} placeholder="Gatlinburg" /></div>
                        <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-7 text-xs" value={comp.notes} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], notes: e.target.value }; setField("comps", c); }} placeholder="Hot tub, mountain view..." /></div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Import Existing Comps Modal */}
          {showExistingComps && (
            <ExistingCompsModal
              onClose={() => setShowExistingComps(false)}
              onImport={(comps) => { setField("comps", [...form.comps, ...comps]); setShowExistingComps(false); }}
              isAdmin={(user as any)?.role === "admin"}
              userId={(user as any)?.id}
            />
          )}
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


// ─── EXISTING COMPS MODAL ─────────────────────────────────────────────────────
function ExistingCompsModal({ onClose, onImport, isAdmin, userId }: {
  onClose: () => void;
  onImport: (comps: any[]) => void;
  isAdmin: boolean;
  userId: number;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filterBeds, setFilterBeds] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterMinRevenue, setFilterMinRevenue] = useState("");
  const [filterMaxRevenue, setFilterMaxRevenue] = useState("");
  const [filterMinADR, setFilterMinADR] = useState("");

  // Fetch all comps from other proformas
  const { data: allComps = [] } = trpc.properties.listAllComps.useQuery({ isAdmin });

  // Filter comps
  const filteredComps = (allComps as any[]).filter((comp: any) => {
    if (filterBeds && comp.beds && !comp.beds.includes(filterBeds)) return false;
    if (filterCity && comp.city && !comp.city.toLowerCase().includes(filterCity.toLowerCase())) return false;
    if (filterMinRevenue) {
      const rev = parseFloat(comp.annualRevenue?.replace(/[$,]/g, "") || "0");
      if (rev < parseFloat(filterMinRevenue)) return false;
    }
    if (filterMaxRevenue) {
      const rev = parseFloat(comp.annualRevenue?.replace(/[$,]/g, "") || "0");
      if (rev > parseFloat(filterMaxRevenue)) return false;
    }
    if (filterMinADR) {
      const adr = parseFloat(comp.adr?.replace(/[$,]/g, "") || "0");
      if (adr < parseFloat(filterMinADR)) return false;
    }
    return true;
  });

  const toggleSelect = (idx: number) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelected(next);
  };

  const handleImport = () => {
    const compsToImport = filteredComps.filter((_: any, i: number) => selected.has(i)).map((c: any) => ({
      name: c.name || "",
      annualRevenue: c.annualRevenue || "",
      occupancy: c.occupancy || "",
      adr: c.adr || "",
      beds: c.beds || "",
      link: c.link || "",
      notes: c.notes || "",
      photoUrl: c.photoUrl || "",
      rating: c.rating || "",
      reviewCount: c.reviewCount || "",
      city: c.city || "",
    }));
    onImport(compsToImport);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-lg">Import Existing Comps</h3>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleImport} disabled={selected.size === 0}>
              Import {selected.size} Selected
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b bg-slate-50">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Beds</Label>
              <Input className="h-7 text-xs" value={filterBeds} onChange={e => setFilterBeds(e.target.value)} placeholder="e.g. 3" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">City</Label>
              <Input className="h-7 text-xs" value={filterCity} onChange={e => setFilterCity(e.target.value)} placeholder="Gatlinburg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min Revenue</Label>
              <Input className="h-7 text-xs" value={filterMinRevenue} onChange={e => setFilterMinRevenue(e.target.value)} placeholder="50000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Revenue</Label>
              <Input className="h-7 text-xs" value={filterMaxRevenue} onChange={e => setFilterMaxRevenue(e.target.value)} placeholder="200000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Min ADR</Label>
              <Input className="h-7 text-xs" value={filterMinADR} onChange={e => setFilterMinADR(e.target.value)} placeholder="200" />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">{filteredComps.length} comps found{!isAdmin ? " (your comps only)" : " (all users)"}</p>
        </div>

        {/* Comp List */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredComps.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No comps match your filters.</p>
          ) : (
            <div className="space-y-2">
              {filteredComps.map((comp: any, i: number) => (
                <div
                  key={i}
                  className={`border rounded p-2 cursor-pointer transition-colors ${selected.has(i) ? "border-emerald-500 bg-emerald-50" : "hover:bg-slate-50"}`}
                  onClick={() => toggleSelect(i)}
                >
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(i)} readOnly className="rounded" />
                    {comp.photoUrl && <img src={comp.photoUrl} alt="" className="w-10 h-10 rounded object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{comp.name || "Unnamed Comp"}</p>
                      <p className="text-xs text-slate-500">
                        {comp.beds ? `${comp.beds} beds` : ""}{comp.city ? ` • ${comp.city}` : ""}{comp.annualRevenue ? ` • Rev: ${comp.annualRevenue}` : ""}{comp.adr ? ` • ADR: ${comp.adr}` : ""}{comp.occupancy ? ` • Occ: ${comp.occupancy}` : ""}
                      </p>
                    </div>
                    {comp.rating && <span className="text-xs text-amber-600">⭐ {comp.rating}</span>}
                    {comp.addedBy && <span className="text-xs text-slate-400">{comp.addedBy}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
