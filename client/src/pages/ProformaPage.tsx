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
import { useParams, useLocation } from "wouter";
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
  propertyLink: string;
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
  channelAirbnbPct: string;
  channelVrboPct: string;
  channelDirectPct: string;
  feeAirbnb: string;
  feeVrbo: string;
  feeDirect: string;
  revenueAppreciationPct: string;
  propertyAppreciationPct: string;
  expenseInflationPct: string;
  // Fixed Expenses (monthly)
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
  comps: Array<{ name: string; annualRevenue: string; occupancy: string; adr: string; beds: string; link: string; notes: string; }>;
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
  propertyLink: "",
  downPaymentPct: "20",
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
  landAllocationPct: "20",
  acceleratedDepreciationPct: "25",
  marginalTaxRate: "35",
  costSegStudyCost: "3500",
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

  const { data: property } = trpc.properties.get.useQuery({ id: propertyId });
  const { data: proformas, refetch } = trpc.properties.listProformas.useQuery({ propertyId });
  const { data: coreProfile } = trpc.users.getCoreProfile.useQuery({ userId: user?.id ?? 0 }, { enabled: !!user?.id });
  const { data: userRecord } = trpc.users.getById.useQuery({ id: user?.id ?? 0 }, { enabled: !!user?.id });

  const createMutation = trpc.properties.createProforma.useMutation({ onSuccess: () => { refetch(); } });
  const updateMutation = trpc.properties.updateProforma.useMutation({ onSuccess: () => { refetch(); } });
  const deleteMutation = trpc.properties.deleteProforma.useMutation({ onSuccess: () => { refetch(); } });

  // ─── AUTO-SAVE (debounced 2s after any field change) ─────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  const titleRef = useRef(title);
  const editingIdRef = useRef(editingId);
  const isSavingRef = useRef(false);
  formRef.current = form;
  titleRef.current = title;
  editingIdRef.current = editingId;

  const doAutoSave = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);
    try {
      const currentForm = formRef.current;
      const formData = { ...currentForm };
      if (editingIdRef.current) {
        await updateMutation.mutateAsync({ id: editingIdRef.current, title: titleRef.current, formData, notes: currentForm.notes });
      } else {
        const result = await createMutation.mutateAsync({ propertyId, title: titleRef.current, formData, notes: currentForm.notes });
        setEditingId(result.id);
      }
    } catch (e) { console.error("Auto-save failed:", e); }
    isSavingRef.current = false;
    setSaving(false);
  }, [propertyId]);

  // Trigger auto-save whenever form or title changes (only when editing)
  useEffect(() => {
    if (!editing) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { doAutoSave(); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [form, title, editing, doAutoSave]);

  // ─── CALCULATIONS ──────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const pp = parseNum(form.purchasePrice);
    const downPct = parsePct(form.downPaymentPct);
    const closingPct = parsePct(form.closingCostsPct);
    const furnishing = parseNum(form.furnishingBudget);
    const renovation = parseNum(form.renovationBudget);
    const startup = parseNum(form.startupCosts);
    const inspection = parseNum(form.inspectionCosts);

    const isCash = form.loanType === "cash";
    const downPayment = isCash ? pp : pp * downPct;
    const closingCosts = pp * closingPct;
    const loanAmount = isCash ? 0 : pp - downPayment;
    const totalCashNeeded = (isCash ? pp : downPayment) + closingCosts + furnishing + renovation + startup + inspection;

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
      parseNum(form.expPMSSoftware) + parseNum(form.expDynamicPricing) + parseNum(form.expSmartLocks) +
      parseNum(form.expAccounting) + parseNum(form.expPermits) + customFixedTotal;
    const fixedAnnual = fixedMonthly * 12;

    // Custom variable expenses (monthly)
    const customVariableMonthly = (form.customVariableExpenses || []).reduce((sum, e) => sum + parseNum(e.amount), 0);

    const calcScenario = (adrStr: string, occStr: string, nightsStr: string, cleaningRevStr: string, ancillaryStr: string) => {
      const adr = parseNum(adrStr);
      const occ = parsePct(occStr);
      const availNights = parseNum(nightsStr) || 365;
      const soldNights = Math.round(availNights * occ);
      const avgLOS = parseNum(form.avgLengthOfStay) || 3.5;
      const bookings = soldNights / avgLOS;

      const nightlyRevenue = adr * soldNights;
      const cleaningFeeRevenue = parseNum(cleaningRevStr);
      const ancillaryRevenue = parseNum(ancillaryStr);
      const grossRevenue = nightlyRevenue + cleaningFeeRevenue + ancillaryRevenue;

      const platformFees = grossRevenue * blendedFeeRate;
      const netRevenue = grossRevenue - platformFees;

      const mgmtPct = parsePct(form.propertyMgmtPct);
      const mgmtExpense = netRevenue * mgmtPct;
      const cleaningExpense = parseNum(form.cleaningCostPerTurn) * bookings;
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
        nightlyRevenue, cleaningFeeRevenue, ancillaryRevenue, grossRevenue,
        platformFees, netRevenue,
        mgmtExpense, cleaningExpense, capExReserve, customVarAnnual, totalVariableAnnual,
        fixedAnnual, totalExpensesAnnual,
        noi, noiMargin, cashFlow, monthlyCashFlow,
        cashOnCash, capRate, grossYield, dscr, breakEvenOcc, paybackYears,
      };
    };

    const s1 = calcScenario(form.scenario1ADR, form.scenario1Occupancy, form.scenario1AvailableNights, form.scenario1CleaningFeeRevenue, form.scenario1AncillaryRevenue);
    const s2 = calcScenario(form.scenario2ADR, form.scenario2Occupancy, form.scenario2AvailableNights, form.scenario2CleaningFeeRevenue, form.scenario2AncillaryRevenue);
    const s3 = calcScenario(form.scenario3ADR, form.scenario3Occupancy, form.scenario3AvailableNights, form.scenario3CleaningFeeRevenue, form.scenario3AncillaryRevenue);

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
    const totalFirstYearDeduction = costSegEnabled ? acceleratedAmt + furnishingDeduction : furnishingDeduction;
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
        const expGrowth = Math.pow(1 + expInflation, y - 1);
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

    const refi = isCashoutRefi ? {
      refiAppraised, refiNewLoanAmount, refiCashOut, refiMonthlyMortgage, refiAnnualDebtService,
      cashLeftInDeal, seasoningMonths,
      s1: postRefiCalcScenario(s1),
      s2: postRefiCalcScenario(s2),
      s3: postRefiCalcScenario(s3),
    } : null;

    return {
      pp, downPayment, closingCosts, loanAmount, totalCashNeeded,
      furnishing, renovation, startup, inspection,
      monthlyMortgage, annualDebtService, monthlyPI, monthlyPMI,
      fixedMonthly, fixedAnnual, blendedFeeRate,
      s1, s2, s3, fiveYear, irr, sellingCostsPct,
      costSegEnabled, buildingBasis, acceleratedAmt, furnishingDeduction,
      totalFirstYearDeduction, taxSavings, costSegCost, netTaxBenefit,
      isValueAdd, arv, forcedEquity, equityCreatedByReno,
      isCashoutRefi, refi,
    };
  }, [form]);

  // ─── Field Change Handler (stable reference) ──────────────────────────────
  const setField = useCallback((field: keyof ProformaForm, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  // ─── Save / Load ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Force immediate save (cancel pending auto-save)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    await doAutoSave();
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
            irr: calc.irr, sellingCostsPct: calc.sellingCostsPct,
            costSegEnabled: calc.costSegEnabled, totalFirstYearDeduction: calc.totalFirstYearDeduction,
            taxSavings: calc.taxSavings, netTaxBenefit: calc.netTaxBenefit,
            isValueAdd: calc.isValueAdd, arv: calc.arv, forcedEquity: calc.forcedEquity,
            equityCreatedByReno: calc.equityCreatedByReno, isCashoutRefi: calc.isCashoutRefi, refi: calc.refi,
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

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if (!editing) {
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
          <Button variant="outline" size="sm" onClick={() => navigate("/proforma-defaults")}>
            <Settings className="h-4 w-4 mr-1" /> Defaults
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloading}>
            <Download className="h-4 w-4 mr-1" /> {downloading ? "Generating..." : "Download PDF"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Saved"}
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <Input className="text-lg font-semibold border-none shadow-none px-0 focus-visible:ring-0" value={title} onChange={e => setTitle(e.target.value)} placeholder="Pro-forma Title" />
        <p className="text-sm text-slate-500">{property?.address}, {property?.city} {property?.state} {property?.zip}</p>
      </div>

      <Tabs defaultValue="acquisition" className="w-full">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="acquisition" className="text-xs"><Home className="h-3 w-3 mr-1" />Acquisition</TabsTrigger>
          <TabsTrigger value="financing" className="text-xs"><Calculator className="h-3 w-3 mr-1" />Financing</TabsTrigger>
          <TabsTrigger value="valueadd" className="text-xs"><Home className="h-3 w-3 mr-1" />Value-Add / Refi</TabsTrigger>
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
                  {calc.renovation > 0 && <div className="flex justify-between text-sm"><span>Renovation</span><span className="font-medium">{fmtDollar(calc.renovation)}</span></div>}
                  <div className="flex justify-between text-sm"><span>Startup Costs</span><span className="font-medium">{fmtDollar(calc.startup)}</span></div>
                  <div className="flex justify-between text-sm"><span>Inspections</span><span className="font-medium">{fmtDollar(calc.inspection)}</span></div>
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
                                      <td className="p-2 text-right" colSpan={3}>{fmtDollar(calc.monthlyMortgage)}</td>
                                      <td className="p-2 text-right" colSpan={3}>{fmtDollar(calc.refi.refiMonthlyMortgage)}</td>
                                    </tr>
                                    <tr className="border-b">
                                      <td className="p-2">Annual Debt Service</td>
                                      <td className="p-2 text-right" colSpan={3}>{fmtDollar(calc.annualDebtService)}</td>
                                      <td className="p-2 text-right" colSpan={3}>{fmtDollar(calc.refi.refiAnnualDebtService)}</td>
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
                                      <td className="p-2 text-right" colSpan={3}>{fmtDollar(calc.totalCashNeeded)}</td>
                                      <td className="p-2 text-right" colSpan={3}>{calc.refi.cashLeftInDeal <= 0 ? <span className="text-emerald-700 font-bold">$0 (pulled out more!)</span> : fmtDollar(calc.refi.cashLeftInDeal)}</td>
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
                        <CurrencyInput value={(form as any)[`${prefix}ADR`]} onChange={v => setField(`${prefix}ADR` as any, v)} placeholder="250" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Occupancy Rate</Label>
                        <div className="relative">
                          <Input className="pr-6 h-8 text-sm" value={(form as any)[`${prefix}Occupancy`]} onChange={e => setField(`${prefix}Occupancy` as any, e.target.value)} placeholder="65" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Available Nights/Year</Label>
                        <Input className="h-8 text-sm" value={(form as any)[`${prefix}AvailableNights`]} onChange={e => setField(`${prefix}AvailableNights` as any, e.target.value)} placeholder="365" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Cleaning Fee Revenue (annual)</Label>
                        <CurrencyInput value={(form as any)[`${prefix}CleaningFeeRevenue`]} onChange={v => setField(`${prefix}CleaningFeeRevenue` as any, v)} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-slate-600">Ancillary Revenue (annual)</Label>
                        <CurrencyInput value={(form as any)[`${prefix}AncillaryRevenue`]} onChange={v => setField(`${prefix}AncillaryRevenue` as any, v)} placeholder="0" />
                      </div>
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
                  <div className="grid grid-cols-3 gap-2">
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
                  {(["revenueAppreciationPct", "propertyAppreciationPct", "expenseInflationPct"] as const).map((f, i) => (
                    <div key={f} className="space-y-1">
                      <Label className="text-xs font-medium text-slate-600">{["Revenue Appreciation (annual)", "Property Appreciation (annual)", "Expense Inflation (annual)"][i]}</Label>
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
                  <Button size="sm" variant="ghost" onClick={() => setField("customFixedExpenses", [...(form.customFixedExpenses || []), { label: "", amount: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add
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
                  ["PMS Software", "expPMSSoftware", false],
                  ["Dynamic Pricing Software", "expDynamicPricing", false],
                  ["Smart Locks / Security / Noise", "expSmartLocks", false],
                  ["Accounting / Bookkeeping", "expAccounting", false],
                  ["Permits & Licenses", "expPermits", false],
                ] as [string, keyof ProformaForm, boolean][]).map(([label, field, isAnnual]) => {
                  const val = parseNum(form[field] as string);
                  const yearly = isAnnual ? val : val * 12;
                  return (
                    <div key={field} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                      <Label className="text-xs text-slate-600 flex-1">{label}</Label>
                      <div className="flex items-center gap-2">
                        <div className="relative w-24">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <Input className="pl-5 h-7 text-xs w-full" value={formatCurrencyInput(form[field] as string)} onChange={e => setField(field, e.target.value.replace(/[^0-9]/g, ""))} />
                        </div>
                        <span className="text-xs text-slate-400 w-6">{isAnnual ? "/yr" : "/mo"}</span>
                        <span className="text-xs text-slate-500 w-20 text-right">{fmtDollar(yearly)}/yr</span>
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
                  <Button size="sm" variant="ghost" onClick={() => setField("customVariableExpenses", [...(form.customVariableExpenses || []), { label: "", amount: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Property Management Fee (% of net revenue)</Label>
                  <div className="relative">
                    <Input className="pr-6 h-8 text-sm" value={form.propertyMgmtPct} onChange={e => setField("propertyMgmtPct", e.target.value)} placeholder="0" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
                  </div>
                  {calc.s2.mgmtExpense > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.s2.mgmtExpense)}/yr</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-600">Cleaning Cost per Turn</Label>
                  <CurrencyInput value={form.cleaningCostPerTurn} onChange={v => setField("cleaningCostPerTurn", v)} placeholder="150" />
                  {calc.s2.cleaningExpense > 0 && <p className="text-xs text-emerald-600 font-medium">= {fmtDollar(calc.s2.cleaningExpense)}/yr (base case)</p>}
                </div>
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
                    <p className={`text-lg font-bold ${m.color || "text-slate-800"}`}>{m.value}</p>
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
              <CardHeader className="pb-3"><CardTitle className="text-sm">5-Year Projection (Base Case)</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-100 text-left"><th className="p-2">Year</th><th className="p-2 text-right">Net Revenue</th><th className="p-2 text-right">Expenses</th><th className="p-2 text-right">NOI</th><th className="p-2 text-right">Cash Flow</th><th className="p-2 text-right">Property Value</th><th className="p-2 text-right">Total Equity</th></tr></thead>
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
        </TabsContent>

        {/* ─── TAB: COMPS ──────────────────────────────────────────────────── */}
        <TabsContent value="comps">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Revenue Comparable Properties</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setField("comps", [...form.comps, { name: "", annualRevenue: "", occupancy: "", adr: "", beds: "", link: "", notes: "" }])}>
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
                        <Button variant="ghost" size="sm" onClick={() => { const c = [...form.comps]; c.splice(i, 1); setField("comps", c); }}>
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="space-y-1"><Label className="text-xs">Name/ID</Label><Input className="h-7 text-xs" value={comp.name} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], name: e.target.value }; setField("comps", c); }} /></div>
                        <div className="space-y-1"><Label className="text-xs">Annual Revenue</Label><Input className="h-7 text-xs" value={comp.annualRevenue} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], annualRevenue: e.target.value }; setField("comps", c); }} placeholder="$120,000" /></div>
                        <div className="space-y-1"><Label className="text-xs">Occupancy %</Label><Input className="h-7 text-xs" value={comp.occupancy} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], occupancy: e.target.value }; setField("comps", c); }} placeholder="72%" /></div>
                        <div className="space-y-1"><Label className="text-xs">ADR</Label><Input className="h-7 text-xs" value={comp.adr} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], adr: e.target.value }; setField("comps", c); }} placeholder="$250" /></div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1"><Label className="text-xs">Beds</Label><Input className="h-7 text-xs" value={comp.beds} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], beds: e.target.value }; setField("comps", c); }} /></div>
                        <div className="space-y-1 col-span-2"><Label className="text-xs">Link</Label><Input className="h-7 text-xs" value={comp.link} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], link: e.target.value }; setField("comps", c); }} placeholder="https://..." /></div>
                      </div>
                      <div className="space-y-1"><Label className="text-xs">Notes</Label><Input className="h-7 text-xs" value={comp.notes} onChange={e => { const c = [...form.comps]; c[i] = { ...c[i], notes: e.target.value }; setField("comps", c); }} placeholder="Similar property, hot tub, mountain view..." /></div>
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
