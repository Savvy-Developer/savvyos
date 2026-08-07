import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/PageHeader";
import { ArrowLeft, Save, RotateCcw, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

interface DefaultsData {
  downPaymentPct: string;
  closingCostsPct: string;
  furnishingBudget: string;
  startupCosts: string;
  inspectionCosts: string;
  interestRate: string;
  loanTermYears: string;
  pmiPct: string;
  loanType: string;
  scenario1Occupancy: string;
  scenario2Occupancy: string;
  scenario3Occupancy: string;
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
  propertyMgmtPct: string;
  cleaningCostPerTurn: string;
  capExReservePct: string;
  costSegEnabled: string;
  landAllocationPct: string;
  acceleratedDepreciationPct: string;
  marginalTaxRate: string;
  costSegStudyCost: string;
  revenueMethodology: string;
}

const systemDefaults: DefaultsData = {
  downPaymentPct: "20",
  closingCostsPct: "2",
  furnishingBudget: "25000",
  startupCosts: "5000",
  inspectionCosts: "1500",
  interestRate: "7",
  loanTermYears: "30",
  pmiPct: "0",
  loanType: "dscr",
  scenario1Occupancy: "65",
  scenario2Occupancy: "72",
  scenario3Occupancy: "80",
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
  propertyMgmtPct: "0",
  cleaningCostPerTurn: "150",
  capExReservePct: "5",
  costSegEnabled: "yes",
  landAllocationPct: "20",
  acceleratedDepreciationPct: "25",
  marginalTaxRate: "35",
  costSegStudyCost: "3500",
  revenueMethodology: "We run our projections with best and highest use of the STR in mind. We assume top-tier amenities and aesthetics and pull revenue from comparable top-performing STRs. This initial projection requires further due diligence.",
};

export default function ProformaDefaultsPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === "admin";
  const [defaults, setDefaults] = useState<DefaultsData>(systemDefaults);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);

  // Fetch list of agents for admin dropdown
  const { data: allUsers = [] } = trpc.users.list.useQuery({}, { enabled: isAdmin });

  // Fetch defaults for the selected user (or self)
  const { data: savedDefaults, refetch } = trpc.properties.getProformaDefaults.useQuery(
    selectedUserId ? { userId: selectedUserId } : undefined,
    { enabled: !!user }
  );
  const saveMutation = trpc.properties.saveProformaDefaults.useMutation();

  useEffect(() => {
    if (savedDefaults) {
      setDefaults({ ...systemDefaults, ...(savedDefaults as any) });
      setLoaded(true);
    } else if (loaded) {
      // If switching to a user with no defaults, show system defaults
      setDefaults(systemDefaults);
    }
  }, [savedDefaults]);

  // When admin changes the selected user, reset loaded state and refetch
  const handleUserChange = (userId: string) => {
    const id = userId === "self" ? undefined : Number(userId);
    setSelectedUserId(id);
    setLoaded(false);
    setDefaults(systemDefaults);
    // refetch will happen automatically due to query key change
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ defaults, userId: selectedUserId });
      refetch();
      alert("Defaults saved successfully! These will be applied to all new pro-formas you create.");
    } catch (e) { console.error(e); alert("Failed to save defaults. Please try again."); }
    setSaving(false);
  };

  const handleReset = () => {
    if (confirm("Reset all defaults to system values?")) {
      setDefaults(systemDefaults);
    }
  };

  const setField = (field: keyof DefaultsData, value: string) => {
    setDefaults(prev => ({ ...prev, [field]: value }));
  };

  const PctRow = ({ label, field }: { label: string; field: keyof DefaultsData }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
      <Label className="text-xs text-slate-600 flex-1">{label}</Label>
      <div className="relative w-20">
        <Input className="pr-5 h-7 text-xs" value={defaults[field]} onChange={e => setField(field, e.target.value)} />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
      </div>
    </div>
  );

  const DollarRow = ({ label, field }: { label: string; field: keyof DefaultsData }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
      <Label className="text-xs text-slate-600 flex-1">{label}</Label>
      <div className="relative w-24">
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
        <Input className="pl-5 h-7 text-xs" value={defaults[field]} onChange={e => setField(field, e.target.value)} />
      </div>
    </div>
  );

  // Get the display name for the currently selected user
  const selectedUserName = selectedUserId
    ? (allUsers as any[]).find((u: any) => u.id === selectedUserId)?.name || "Unknown"
    : "My Defaults";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/profile")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Profile
        </Button>
      </div>
      <PageHeader
        title="Pro-forma Defaults"
        subtitle={selectedUserId
          ? `Viewing defaults for: ${selectedUserName}`
          : "Set your personal default values for new pro-formas. These will pre-fill when you create a new analysis."
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save Defaults"}</Button>
          </div>
        }
      />

      {/* Admin: User selector dropdown */}
      {isAdmin && (
        <div className="mt-4 mb-2">
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-slate-500" />
                <Label className="text-sm font-medium text-slate-700">Viewing defaults for:</Label>
                <select
                  className="h-8 text-sm border rounded-md px-3 py-1 min-w-[220px] bg-white"
                  value={selectedUserId ?? "self"}
                  onChange={e => handleUserChange(e.target.value)}
                >
                  <option value="self">My Defaults (Admin)</option>
                  <optgroup label="Agents">
                    {(allUsers as any[])
                      .filter((u: any) => u.role === "agent" && u.isActive !== false)
                      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name || u.email} ({u.market || "No market"})</option>
                      ))
                    }
                  </optgroup>
                  <optgroup label="ISAs">
                    {(allUsers as any[])
                      .filter((u: any) => u.role === "isa" && u.isActive !== false)
                      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))
                    }
                  </optgroup>
                  <optgroup label="Other Admins">
                    {(allUsers as any[])
                      .filter((u: any) => u.role === "admin" && u.id !== (user as any)?.id && u.isActive !== false)
                      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))
                    }
                  </optgroup>
                </select>
                {selectedUserId && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    Editing {selectedUserName}'s defaults
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        {/* Financing Defaults */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Financing Defaults</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <Label className="text-xs text-slate-600 flex-1">Loan Type</Label>
              <select className="h-7 text-xs border rounded px-2 w-32" value={defaults.loanType} onChange={e => setField("loanType", e.target.value)}>
                <option value="dscr">DSCR</option>
                <option value="conventional">Conventional Investment</option>
                <option value="conventional_second">Conventional Second Home</option>
                <option value="other">Other</option>
                <option value="cash">All Cash</option>
              </select>
            </div>
            <PctRow label="Down Payment" field="downPaymentPct" />
            <PctRow label="Closing Costs" field="closingCostsPct" />
            <PctRow label="Interest Rate" field="interestRate" />
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <Label className="text-xs text-slate-600 flex-1">Loan Term</Label>
              <div className="relative w-20">
                <Input className="pr-8 h-7 text-xs" value={defaults.loanTermYears} onChange={e => setField("loanTermYears", e.target.value)} />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">yrs</span>
              </div>
            </div>
            <PctRow label="PMI" field="pmiPct" />
          </CardContent>
        </Card>

        {/* Startup Defaults */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Startup Cost Defaults</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <DollarRow label="Furnishing Budget" field="furnishingBudget" />
            <DollarRow label="Startup Costs" field="startupCosts" />
            <DollarRow label="Inspection Costs" field="inspectionCosts" />
          </CardContent>
        </Card>

        {/* Revenue Defaults */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Revenue Defaults</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <PctRow label="Conservative Occupancy" field="scenario1Occupancy" />
            <PctRow label="Base Case Occupancy" field="scenario2Occupancy" />
            <PctRow label="Strong Execution Occupancy" field="scenario3Occupancy" />
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <Label className="text-xs text-slate-600 flex-1">Avg Length of Stay</Label>
              <div className="relative w-20">
                <Input className="pr-10 h-7 text-xs" value={defaults.avgLengthOfStay} onChange={e => setField("avgLengthOfStay", e.target.value)} />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">nights</span>
              </div>
            </div>
            <PctRow label="Airbnb Channel %" field="channelAirbnbPct" />
            <PctRow label="Vrbo Channel %" field="channelVrboPct" />
            <PctRow label="Direct Channel %" field="channelDirectPct" />
            <PctRow label="Airbnb Fee" field="feeAirbnb" />
            <PctRow label="Vrbo Fee" field="feeVrbo" />
            <PctRow label="Direct Fee" field="feeDirect" />
          </CardContent>
        </Card>

        {/* Growth Defaults */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Growth & Appreciation</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <PctRow label="Revenue Appreciation" field="revenueAppreciationPct" />
            <PctRow label="Property Appreciation" field="propertyAppreciationPct" />
            <PctRow label="Expense Inflation" field="expenseInflationPct" />
          </CardContent>
        </Card>

        {/* Expense Defaults */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Fixed Expense Defaults (monthly unless noted)</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <DollarRow label="Utilities" field="expUtilities" />
            <DollarRow label="Insurance (annual)" field="expInsuranceAnnual" />
            <DollarRow label="Property Tax (annual)" field="expPropertyTaxAnnual" />
            <DollarRow label="HOA" field="expHOA" />
            <DollarRow label="Internet" field="expInternet" />
            <DollarRow label="Landscaping" field="expLandscaping" />
            <DollarRow label="Pest Control" field="expPestControl" />
            <DollarRow label="Hot Tub / Pool" field="expHotTubPool" />
            <DollarRow label="PMS Software" field="expPMSSoftware" />
            <DollarRow label="Dynamic Pricing" field="expDynamicPricing" />
            <DollarRow label="Smart Locks / Security" field="expSmartLocks" />
            <DollarRow label="Accounting" field="expAccounting" />
            <DollarRow label="Permits" field="expPermits" />
          </CardContent>
        </Card>

        {/* Variable Expense Defaults */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Variable Expense & Tax Defaults</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <PctRow label="Property Management %" field="propertyMgmtPct" />
            <DollarRow label="Cleaning per Turn" field="cleaningCostPerTurn" />
            <PctRow label="CapEx Reserve %" field="capExReservePct" />
            <div className="border-t my-2" />
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <Label className="text-xs text-slate-600 flex-1">Cost Seg Study</Label>
              <select className="h-7 text-xs border rounded px-2 w-20" value={defaults.costSegEnabled} onChange={e => setField("costSegEnabled", e.target.value)}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <PctRow label="Land Allocation" field="landAllocationPct" />
            <PctRow label="Accelerated Depreciation" field="acceleratedDepreciationPct" />
            <PctRow label="Marginal Tax Rate" field="marginalTaxRate" />
            <DollarRow label="Cost Seg Study Cost" field="costSegStudyCost" />
          </CardContent>
        </Card>

        {/* Methodology */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Default Revenue Methodology Text</CardTitle></CardHeader>
          <CardContent>
            <Textarea className="min-h-[80px] text-sm" value={defaults.revenueMethodology} onChange={e => setField("revenueMethodology", e.target.value)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
