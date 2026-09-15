/**
 * The investment calculator on a public listing.
 *
 * A deliberately small model. It answers one question, "roughly what would
 * this do for me at these terms", and it answers it with arithmetic an
 * investor can check on paper. It is not the pro-forma: the pro-forma models
 * cost segregation, value-add, refinancing and a dozen operating lines, and
 * pretending a five-field form on a public page reproduces that would be a
 * more confident answer than we have any right to give.
 *
 * Two rules, both of which exist because the output looks like a promise:
 *
 * 1. Missing inputs produce null, never zero. "$0 cash flow" is a claim.
 *    Nothing on the screen is not.
 * 2. Operating costs are a single visible percentage the user can change,
 *    rather than a pile of invisible assumptions. A reader can disagree with
 *    one number they can see. They cannot disagree with ones they cannot.
 */

export type CalculatorInputs = {
  purchasePrice: number | null;
  annualRevenue: number | null;
  downPaymentPct: number;
  interestRatePct: number;
  loanTermYears: number;
  /** Operating costs as a share of revenue: management, cleaning, utilities,
   *  supplies, repairs. Taxes and insurance are counted separately below. */
  operatingCostPct: number;
  /** Annual property tax and insurance in dollars, which do not scale with
   *  revenue and are too variable by state to guess from a percentage. */
  annualTaxesAndInsurance: number;
};

export type CalculatorResult = {
  loanAmount: number;
  downPayment: number;
  monthlyDebtPayment: number;
  annualDebtService: number;
  operatingCosts: number;
  netOperatingIncome: number;
  annualCashFlow: number;
  monthlyCashFlow: number;
  /** Cash flow over cash invested. Null when no cash is invested, because
   *  dividing by zero produces infinity, not an excellent return. */
  cashOnCash: number | null;
  /** Net operating income over purchase price. */
  capRate: number | null;
};

export const CALCULATOR_DEFAULTS = {
  downPaymentPct: 20,
  interestRatePct: 7,
  loanTermYears: 30,
  operatingCostPct: 35,
};

/**
 * A level-payment mortgage. Falls back to straight division at a zero rate,
 * where the standard formula divides by zero.
 */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  years: number
): number {
  if (principal <= 0 || years <= 0) return 0;
  const monthlyRate = annualRatePct / 100 / 12;
  const payments = years * 12;
  if (monthlyRate === 0) return principal / payments;
  const growth = Math.pow(1 + monthlyRate, payments);
  return (principal * monthlyRate * growth) / (growth - 1);
}

/**
 * Run the model, or return null if there is not enough to run it on.
 *
 * Both a price and a revenue figure are required. Either one missing means the
 * answer would be invented rather than calculated.
 */
export function runCalculator(
  inputs: CalculatorInputs
): CalculatorResult | null {
  const price = inputs.purchasePrice;
  const revenue = inputs.annualRevenue;
  if (!price || price <= 0) return null;
  if (!revenue || revenue <= 0) return null;

  const downPaymentPct = clamp(inputs.downPaymentPct, 0, 100);
  const downPayment = price * (downPaymentPct / 100);
  const loanAmount = price - downPayment;

  const monthlyDebtPayment = monthlyPayment(
    loanAmount,
    Math.max(0, inputs.interestRatePct),
    Math.max(1, inputs.loanTermYears)
  );
  const annualDebtService = monthlyDebtPayment * 12;

  const operatingCosts =
    revenue * (clamp(inputs.operatingCostPct, 0, 100) / 100) +
    Math.max(0, inputs.annualTaxesAndInsurance);
  const netOperatingIncome = revenue - operatingCosts;
  const annualCashFlow = netOperatingIncome - annualDebtService;

  return {
    loanAmount,
    downPayment,
    monthlyDebtPayment,
    annualDebtService,
    operatingCosts,
    netOperatingIncome,
    annualCashFlow,
    monthlyCashFlow: annualCashFlow / 12,
    // Cash invested here is the down payment alone. Closing costs and
    // furnishing are real and substantial, but this form does not ask for
    // them, so folding in a guess would quietly worsen every number while
    // looking more precise.
    cashOnCash: downPayment > 0 ? annualCashFlow / downPayment : null,
    capRate: price > 0 ? netOperatingIncome / price : null,
  };
}

function clamp(value: number, low: number, high: number) {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}
