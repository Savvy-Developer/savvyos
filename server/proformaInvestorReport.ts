import express from "express";
import { sdk } from "./_core/sdk";

const fmtD = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "$0";
  return `$${Math.round(val).toLocaleString()}`;
};
const fmtP = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "0%";
  return `${(val * 100).toFixed(1)}%`;
};

export function registerInvestorReportRoute(app: express.Application) {
  app.post("/api/proforma/investor-report", express.json({ limit: "2mb" }), async (req: any, res: any) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.status(401).json({ error: "Unauthorized" }); }

      const { form, calc, property, branding, title } = req.body;
      if (!form || !calc) return res.status(400).json({ error: "Missing data" });

      const s1 = calc.s1 || {}, s2 = calc.s2 || {}, s3 = calc.s3 || {};

      // Generate AI analysis
      let aiAnalysis = "";
      try {
        const { invokeLLM } = await import("./_core/llm");
        const loanTypeLabel = form.loanType === "dscr" ? "DSCR" : form.loanType === "cash" ? "All Cash" : form.loanType === "conventional_second" ? "Conv. Second Home" : "Conventional";
        const prompt = `You are a short-term rental investment analyst writing for a sophisticated investor. Write a 4-5 sentence analysis of this STR deal. Be specific, data-driven, and insightful. Mention what stands out, the strength of returns, risk factors, and the overall investment thesis.\n\nProperty: ${property?.beds || "?"} bed/${property?.baths || "?"} bath, ${property?.sqft || "?"} sqft in ${property?.city || "?"}, ${property?.state || ""}\nPurchase Price: ${fmtD(calc.pp)}\nTotal Cash Needed: ${fmtD(calc.totalCashNeeded)}\nFinancing: ${loanTypeLabel} at ${form.interestRate || "7"}%\nBase Case Revenue: ${fmtD(s2.grossRevenue)} (ADR ${fmtD(s2.adr)}, ${Math.round((s2.occ ?? 0) * 100)}% occ)\nNOI: ${fmtD(s2.noi)}\nAnnual Cash Flow: ${fmtD(s2.cashFlow)}\nCash-on-Cash: ${fmtP(s2.cashOnCash)}\nCap Rate: ${fmtP(s2.capRate)}\nDSCR: ${(s2.dscr ?? 0).toFixed(2)}x\nBreak-Even Occupancy: ${fmtP(s2.breakEvenOcc)}\nYear 1 Tax Benefit: ${fmtD(calc.netTaxBenefit)}\nCoC w/ Tax Benefits: ${calc.taxReturns?.s2 ? fmtP(calc.taxReturns.s2.year1CoCWithTax) : "N/A"}\n${calc.isValueAdd && calc.arv > 0 ? `ARV: ${fmtD(calc.arv)}, Forced Equity: ${fmtD(calc.forcedEquity)}` : ""}\n${calc.isCashoutRefi && calc.refi?.refiCashOut > 0 ? `Cash-Out Refi: ${fmtD(calc.refi.refiCashOut)} returned` : ""}\n\nWrite ONLY the analysis paragraph. No headers, no bullet points.`;
        const result = await invokeLLM({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], maxTokens: 300 });
        const msg = result.choices?.[0]?.message?.content;
        aiAnalysis = (typeof msg === "string" ? msg : "").trim();
      } catch (e) {
        aiAnalysis = `This property presents a ${(s2.cashOnCash ?? 0) > 0.10 ? "strong" : "moderate"} short-term rental investment opportunity with a base case cash-on-cash return of ${fmtP(s2.cashOnCash)} and a DSCR of ${(s2.dscr ?? 0).toFixed(2)}x.`;
      }

      // Build the HTML template
      const addr = [property?.address, [property?.city, property?.state, property?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const loanTypeName = form.loanType === "dscr" ? "DSCR" : form.loanType === "cash" ? "All Cash" : form.loanType === "conventional_second" ? "Conv. Second Home" : form.loanType === "other" ? "Other" : "Conventional";

      // 5-year projection data for chart
      const fiveYearData = calc.fiveYear && Array.isArray(calc.fiveYear) ? calc.fiveYear : [];
      const fiveYearRevenues = fiveYearData.map((yr: any) => Math.round(yr.revenue || 0));
      const fiveYearEquity = fiveYearData.map((yr: any) => Math.round(yr.equity || 0));
      const fiveYearCashFlow = fiveYearData.map((yr: any) => Math.round(yr.cashFlow || 0));
      const fiveYearPropValue = fiveYearData.map((yr: any) => Math.round(yr.propertyValue || 0));

      // Expense breakdown for donut chart
      const fixedExpTotal = calc.fixedExpensesAnnual ?? 0;
      const varExpTotal = calc.variableExpensesAnnual ?? 0;
      const debtService = calc.annualDebtService ?? 0;
      const platformFees = s2.platformFees ?? 0;

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; color: #1e293b; font-size: 11px; line-height: 1.5; }
  .page { width: 8.5in; min-height: 11in; padding: 0.5in 0.6in; page-break-after: always; position: relative; }
  .page:last-child { page-break-after: auto; }
  
  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #0891b2; }
  .logo-area { display: flex; align-items: center; gap: 12px; }
  .logo-area img { height: 36px; }
  .agent-area { display: flex; align-items: center; gap: 10px; text-align: right; }
  .agent-area img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
  .agent-name { font-weight: 700; font-size: 13px; color: #1e293b; }
  .agent-contact { font-size: 9px; color: #64748b; }
  
  /* Title Section */
  .title-section { margin-bottom: 20px; }
  .title-section h1 { font-size: 22px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }
  .title-section .address { font-size: 13px; color: #475569; margin-bottom: 2px; }
  .title-section .details { font-size: 10px; color: #94a3b8; }
  
  /* Property Photo */
  .property-photo { width: 100%; max-height: 180px; object-fit: cover; border-radius: 8px; margin-bottom: 16px; }
  
  /* Metrics Grid */
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
  .metric-card { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 10px 8px; text-align: center; }
  .metric-card .label { font-size: 8px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; }
  .metric-card .value { font-size: 16px; font-weight: 800; color: #0891b2; margin-top: 2px; }
  .metric-card.highlight { background: #0891b2; border-color: #0891b2; }
  .metric-card.highlight .label { color: #ccfbf1; }
  .metric-card.highlight .value { color: #ffffff; }
  
  /* AI Analysis Box */
  .ai-box { background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%); border: 1.5px solid #0891b2; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; }
  .ai-box h3 { font-size: 13px; font-weight: 700; color: #0891b2; margin-bottom: 8px; }
  .ai-box p { font-size: 10.5px; color: #334155; line-height: 1.7; }
  
  /* Section Headers */
  .section-header { font-size: 14px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
  
  /* Tables */
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
  th { background: #155e75; color: white; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 9px; }
  th:not(:first-child) { text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  td:not(:first-child) { text-align: right; }
  tr.highlight { background: #f0fdfa; }
  tr.highlight td { font-weight: 600; color: #0891b2; }
  tr.bold td { font-weight: 600; }
  
  /* Two Column Layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 16px; }
  .col-card { background: #fafafa; border-radius: 8px; padding: 14px; }
  .col-card h4 { font-size: 11px; font-weight: 700; color: #0891b2; margin-bottom: 8px; }
  .col-card .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 10px; }
  .col-card .row .label { color: #64748b; }
  .col-card .row .val { font-weight: 600; color: #1e293b; }
  .col-card .row.total { border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 6px; }
  .col-card .row.total .label, .col-card .row.total .val { color: #0891b2; font-weight: 700; }
  
  /* Charts */
  .chart-container { margin: 16px 0; text-align: center; }
  .chart-container canvas { max-width: 100%; }
  
  /* Comps */
  .comp-card { display: flex; gap: 12px; margin-bottom: 12px; padding: 10px; background: #fafafa; border-radius: 8px; }
  .comp-card img { width: 100px; height: 70px; object-fit: cover; border-radius: 6px; }
  .comp-card .info { flex: 1; }
  .comp-card .info h5 { font-size: 11px; font-weight: 600; color: #1e293b; margin-bottom: 3px; }
  .comp-card .info .revenue { font-size: 13px; font-weight: 700; color: #0891b2; }
  .comp-card .info .meta { font-size: 9px; color: #64748b; margin-top: 2px; }
  
  /* Footer */
  .footer { position: absolute; bottom: 0.4in; left: 0.6in; right: 0.6in; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 6px; }
  
  /* Disclaimer */
  .disclaimer { font-size: 7.5px; color: #94a3b8; margin-top: 20px; line-height: 1.4; }
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>

<!-- PAGE 1: Cover + Key Metrics + AI Analysis -->
<div class="page">
  <div class="header">
    <div class="logo-area">
      <img src="https://d1qcficr3lu37x.cloudfront.net/savvy-logo.png" alt="Savvy" style="height:32px;" />
    </div>
    <div class="agent-area">
      <div>
        <div class="agent-name">${branding?.name || ""}</div>
        <div class="agent-contact">${branding?.email || ""}<br/>${branding?.phone || ""}</div>
      </div>
      ${branding?.headshot ? `<img src="${branding.headshot}" alt="" />` : ""}
    </div>
  </div>

  <div class="title-section">
    <h1>${title || "STR Investment Analysis"}</h1>
    <div class="address">${addr}</div>
    <div class="details">${[property?.beds ? `${property.beds} Beds` : "", property?.baths ? `${property.baths} Baths` : "", property?.sqft ? `${Number(property.sqft).toLocaleString()} sqft` : ""].filter(Boolean).join("  •  ")}${form.propertyLink ? `  •  <a href="${form.propertyLink}" style="color:#0891b2;">Zillow Listing</a>` : ""}</div>
  </div>

  ${form.propertyPhotoUrl ? `<img class="property-photo" src="${form.propertyPhotoUrl}" alt="Property" />` : ""}

  <div class="metrics-grid">
    <div class="metric-card highlight"><div class="label">Total Cash Needed</div><div class="value">${fmtD(calc.totalCashNeeded)}</div></div>
    <div class="metric-card"><div class="label">Monthly Mortgage</div><div class="value">${fmtD(calc.monthlyMortgage)}</div></div>
    <div class="metric-card"><div class="label">Base Case Cash Flow</div><div class="value">${fmtD(s2.cashFlow)}</div></div>
    <div class="metric-card highlight"><div class="label">Cash-on-Cash Return</div><div class="value">${fmtP(s2.cashOnCash)}</div></div>
    <div class="metric-card"><div class="label">Cap Rate</div><div class="value">${fmtP(s2.capRate)}</div></div>
    <div class="metric-card"><div class="label">DSCR</div><div class="value">${(s2.dscr ?? 0) === Infinity ? "∞" : (s2.dscr ?? 0).toFixed(2)}x</div></div>
    <div class="metric-card"><div class="label">Break-Even Occ.</div><div class="value">${fmtP(s2.breakEvenOcc)}</div></div>
    <div class="metric-card highlight"><div class="label">Yr 1 Tax Benefit</div><div class="value">${fmtD(calc.netTaxBenefit)}</div></div>
  </div>

  <div class="ai-box">
    <h3>✨ Investment Analysis</h3>
    <p>${aiAnalysis}</p>
  </div>

  <div class="footer">SavvyProforma Investor Report  |  Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}  |  Page 1</div>
</div>

<!-- PAGE 2: Scenario Comparison + Revenue Chart -->
<div class="page">
  <h2 class="section-header">Scenario Comparison</h2>
  <table>
    <tr><th>Metric</th><th>Conservative</th><th>Base Case</th><th>Strong Execution</th></tr>
    <tr><td>ADR</td><td>${fmtD(s1.adr)}</td><td>${fmtD(s2.adr)}</td><td>${fmtD(s3.adr)}</td></tr>
    <tr><td>Occupancy</td><td>${fmtP(s1.occ)}</td><td>${fmtP(s2.occ)}</td><td>${fmtP(s3.occ)}</td></tr>
    <tr><td>Sold Nights</td><td>${s1.soldNights ?? 0}</td><td>${s2.soldNights ?? 0}</td><td>${s3.soldNights ?? 0}</td></tr>
    <tr class="bold"><td>Gross Revenue</td><td>${fmtD(s1.grossRevenue)}</td><td>${fmtD(s2.grossRevenue)}</td><td>${fmtD(s3.grossRevenue)}</td></tr>
    <tr><td>Platform Fees</td><td>${fmtD(s1.platformFees)}</td><td>${fmtD(s2.platformFees)}</td><td>${fmtD(s3.platformFees)}</td></tr>
    <tr><td>Net Revenue</td><td>${fmtD(s1.netRevenue)}</td><td>${fmtD(s2.netRevenue)}</td><td>${fmtD(s3.netRevenue)}</td></tr>
    <tr><td>Total Expenses</td><td>${fmtD(s1.totalExpensesAnnual)}</td><td>${fmtD(s2.totalExpensesAnnual)}</td><td>${fmtD(s3.totalExpensesAnnual)}</td></tr>
    <tr class="bold"><td>NOI</td><td>${fmtD(s1.noi)}</td><td>${fmtD(s2.noi)}</td><td>${fmtD(s3.noi)}</td></tr>
    <tr><td>Annual Debt Service</td><td>${fmtD(calc.annualDebtService)}</td><td>${fmtD(calc.annualDebtService)}</td><td>${fmtD(calc.annualDebtService)}</td></tr>
    <tr class="highlight"><td>Net Cash Flow</td><td>${fmtD(s1.cashFlow)}</td><td>${fmtD(s2.cashFlow)}</td><td>${fmtD(s3.cashFlow)}</td></tr>
    <tr class="highlight"><td>Cash-on-Cash Return</td><td>${fmtP(s1.cashOnCash)}</td><td>${fmtP(s2.cashOnCash)}</td><td>${fmtP(s3.cashOnCash)}</td></tr>
    ${calc.taxReturns?.s1 ? `<tr class="highlight"><td>CoC w/ Tax Benefits (Yr 1)</td><td>${fmtP(calc.taxReturns.s1.year1CoCWithTax)}</td><td>${fmtP(calc.taxReturns.s2.year1CoCWithTax)}</td><td>${fmtP(calc.taxReturns.s3.year1CoCWithTax)}</td></tr>` : ""}
    <tr><td>Cap Rate</td><td>${fmtP(s1.capRate)}</td><td>${fmtP(s2.capRate)}</td><td>${fmtP(s3.capRate)}</td></tr>
    <tr><td>DSCR</td><td>${(s1.dscr ?? 0).toFixed(2)}x</td><td>${(s2.dscr ?? 0).toFixed(2)}x</td><td>${(s3.dscr ?? 0).toFixed(2)}x</td></tr>
    <tr><td>Break-Even Occupancy</td><td>${fmtP(s1.breakEvenOcc)}</td><td>${fmtP(s2.breakEvenOcc)}</td><td>${fmtP(s3.breakEvenOcc)}</td></tr>
  </table>

  ${calc.netTaxBenefit > 0 ? `<div style="background:#f0fdfa; border-radius:6px; padding:8px 12px; margin-bottom:16px; font-size:10px; color:#0891b2; font-weight:600;">Total Cash In Deal: ${fmtD(calc.totalCashNeeded)}  →  Yr 1 Tax Benefit: -${fmtD(calc.netTaxBenefit)}  →  Effective Cash Basis: ${fmtD(Math.max(0, calc.totalCashNeeded - calc.netTaxBenefit))}</div>` : ""}

  <div class="two-col">
    <div class="col-card">
      <h4>Acquisition & Cash to Close</h4>
      <div class="row"><span class="label">Purchase Price</span><span class="val">${fmtD(calc.pp)}</span></div>
      <div class="row"><span class="label">Down Payment (${form.downPaymentPct || "20"}%)</span><span class="val">${fmtD(calc.downPayment)}</span></div>
      <div class="row"><span class="label">Closing Costs</span><span class="val">${fmtD(calc.closingCosts)}</span></div>
      <div class="row"><span class="label">Furnishing Budget</span><span class="val">${fmtD(calc.furnishing)}</span></div>
      <div class="row"><span class="label">Renovation Budget</span><span class="val">${fmtD(calc.renovation)}</span></div>
      <div class="row"><span class="label">Startup Costs</span><span class="val">${fmtD(calc.startup)}</span></div>
      ${calc.sellerCredit > 0 ? `<div class="row"><span class="label">Seller Credit</span><span class="val" style="color:#059669;">-${fmtD(calc.sellerCredit)}</span></div>` : ""}
      <div class="row total"><span class="label">Total Cash Needed</span><span class="val">${fmtD(calc.totalCashNeeded)}</span></div>
    </div>
    <div class="col-card">
      <h4>Loan Details</h4>
      <div class="row"><span class="label">Loan Type</span><span class="val">${loanTypeName}</span></div>
      <div class="row"><span class="label">Loan Amount</span><span class="val">${fmtD(calc.loanAmount)}</span></div>
      <div class="row"><span class="label">Interest Rate</span><span class="val">${form.interestRate || "7"}%</span></div>
      <div class="row"><span class="label">Loan Term</span><span class="val">${form.loanTermYears || "30"} years</span></div>
      <div class="row"><span class="label">Monthly P&I</span><span class="val">${fmtD(calc.monthlyMortgage)}</span></div>
      <div class="row"><span class="label">Annual Debt Service</span><span class="val">${fmtD(calc.annualDebtService)}</span></div>
      <div class="row"><span class="label">Channel Mix</span><span class="val">Airbnb ${form.channelAirbnb || "60"}% / Vrbo ${form.channelVrbo || "25"}% / Direct ${form.channelDirect || "15"}%</span></div>
      <div class="row"><span class="label">Blended Platform Fee</span><span class="val">${fmtP(calc.blendedFeeRate ?? 0)}</span></div>
    </div>
  </div>

  <div class="footer">SavvyProforma Investor Report  |  Page 2</div>
</div>

<!-- PAGE 3: 5-Year Projection Chart + Expenses -->
<div class="page">
  <h2 class="section-header">5-Year Wealth Building Projection</h2>
  <div class="chart-container">
    <canvas id="fiveYearChart" width="680" height="220"></canvas>
  </div>

  ${fiveYearData.length > 0 ? `
  <table>
    <tr><th>Year</th><th>Revenue</th><th>Cash Flow</th><th>Tax Benefit</th><th>Property Value</th><th>Equity</th></tr>
    ${fiveYearData.map((yr: any, i: number) => `<tr><td>Year ${yr.year}</td><td>${fmtD(yr.revenue)}</td><td>${fmtD(yr.cashFlow)}</td><td>${fmtD(i === 0 ? (calc.netTaxBenefit || 0) + (calc.ongoingAnnualTaxBenefit || 0) : (calc.ongoingAnnualTaxBenefit || 0))}</td><td>${fmtD(yr.propertyValue)}</td><td>${fmtD(yr.equity)}</td></tr>`).join("")}
  </table>` : ""}

  <h2 class="section-header">Operating Expenses (Base Case)</h2>
  <div class="two-col">
    <div class="col-card">
      <h4>Fixed Expenses</h4>
      ${[
        ["Utilities", form.expUtilities], ["STR Insurance", form.expInsurance], ["Property Tax", form.expPropertyTax],
        ["Internet/Cable", form.expInternet], ["Landscaping", form.expLandscaping], ["Pest Control", form.expPestControl],
        ["Hot Tub/Pool", form.expHotTub], ["Software", form.expSoftware], ["Smart Locks/Security", form.expSmartLocks],
        ["Trash Service", form.expTrash], ["Accounting", form.expAccounting], ["Permits & Licenses", form.expPermits]
      ].filter(([, v]) => parseFloat(String(v || "0").replace(/[^0-9.]/g, "")) > 0).map(([label, v]) => {
        const monthly = parseFloat(String(v || "0").replace(/[^0-9.]/g, ""));
        return `<div class="row"><span class="label">${label}</span><span class="val">${fmtD(monthly)}/mo | ${fmtD(monthly * 12)}/yr</span></div>`;
      }).join("")}
      <div class="row total"><span class="label">Total Fixed</span><span class="val">${fmtD(fixedExpTotal)}/yr</span></div>
    </div>
    <div class="col-card">
      <h4>Variable Expenses</h4>
      ${parseFloat(form.propertyMgmtPct || "0") > 0 ? `<div class="row"><span class="label">Property Mgmt (${form.propertyMgmtPct}%)</span><span class="val">${fmtD(s2.mgmtExpense ?? 0)}/yr</span></div>` : ""}
      ${(s2.cleaningFeeExpenseTotal ?? 0) > 0 ? `<div class="row"><span class="label">Cleaning Expense</span><span class="val">${fmtD(s2.cleaningFeeExpenseTotal ?? 0)}/yr</span></div>` : ""}
      ${parseFloat(form.capExReservePct || "0") > 0 ? `<div class="row"><span class="label">CapEx Reserve (${form.capExReservePct}%)</span><span class="val">${fmtD(s2.capExReserve ?? 0)}/yr</span></div>` : ""}
      <div class="row total"><span class="label">Total Variable</span><span class="val">${fmtD(varExpTotal)}/yr</span></div>
    </div>
  </div>

  <div class="chart-container">
    <canvas id="expenseChart" width="300" height="200"></canvas>
  </div>

  <div class="footer">SavvyProforma Investor Report  |  Page 3</div>
</div>

<!-- PAGE 4: IRR + Tax Benefits + Comps -->
<div class="page">
  ${calc.irr && calc.irr.s1 && calc.irr.s2 && calc.irr.s3 ? `
  <h2 class="section-header">Internal Rate of Return (IRR)</h2>
  <table>
    <tr><th>Hold Period</th><th colspan="2">Conservative</th><th colspan="2">Base Case</th><th colspan="2">Strong Execution</th></tr>
    <tr style="background:#f8fafc;"><td></td><td style="text-align:center;font-size:8px;color:#64748b;">Pre-Tax</td><td style="text-align:center;font-size:8px;color:#64748b;">After-Tax</td><td style="text-align:center;font-size:8px;color:#64748b;">Pre-Tax</td><td style="text-align:center;font-size:8px;color:#64748b;">After-Tax</td><td style="text-align:center;font-size:8px;color:#64748b;">Pre-Tax</td><td style="text-align:center;font-size:8px;color:#64748b;">After-Tax</td></tr>
    <tr><td>3-Year Hold</td><td style="text-align:center">${fmtP(calc.irr.s1.y3)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s1.y3at)}</td><td style="text-align:center">${fmtP(calc.irr.s2.y3)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s2.y3at)}</td><td style="text-align:center">${fmtP(calc.irr.s3.y3)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s3.y3at)}</td></tr>
    <tr><td>5-Year Hold</td><td style="text-align:center">${fmtP(calc.irr.s1.y5)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s1.y5at)}</td><td style="text-align:center">${fmtP(calc.irr.s2.y5)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s2.y5at)}</td><td style="text-align:center">${fmtP(calc.irr.s3.y5)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s3.y5at)}</td></tr>
    <tr><td>7-Year Hold</td><td style="text-align:center">${fmtP(calc.irr.s1.y7)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s1.y7at)}</td><td style="text-align:center">${fmtP(calc.irr.s2.y7)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s2.y7at)}</td><td style="text-align:center">${fmtP(calc.irr.s3.y7)}</td><td style="text-align:center;color:#0891b2;font-weight:600;">${fmtP(calc.irr.s3.y7at)}</td></tr>
  </table>` : ""}

  ${calc.netTaxBenefit > 0 ? `
  <h2 class="section-header">Tax Benefits</h2>
  <div class="two-col">
    <div class="col-card">
      <h4>Year 1 (Cost Segregation)</h4>
      <div class="row"><span class="label">Total First-Year Deduction</span><span class="val">${fmtD(calc.totalFirstYearDeduction ?? 0)}</span></div>
      <div class="row"><span class="label">Tax Savings @ ${form.marginalTaxRate || "35"}%</span><span class="val">${fmtD(calc.taxSavings ?? 0)}</span></div>
      <div class="row"><span class="label">Less: Study Cost</span><span class="val">-${fmtD(calc.costSegCost ?? 0)}</span></div>
      <div class="row total"><span class="label">Net Tax Benefit</span><span class="val">${fmtD(calc.netTaxBenefit)}</span></div>
    </div>
    <div class="col-card">
      <h4>Ongoing Annual (Year 2+)</h4>
      <div class="row"><span class="label">Straight-Line Depreciation</span><span class="val">${fmtD(calc.straightLineDepreciation ?? 0)}/yr</span></div>
      <div class="row"><span class="label">Mortgage Interest Deduction</span><span class="val">${fmtD(calc.year1MortgageInterest ?? 0)}/yr</span></div>
      <div class="row total"><span class="label">Annual Tax Savings</span><span class="val">${fmtD(calc.ongoingAnnualTaxBenefit ?? 0)}/yr</span></div>
    </div>
  </div>` : ""}

  ${form.comps && form.comps.length > 0 ? `
  <h2 class="section-header">Revenue Comparable Properties</h2>
  ${form.comps.filter((c: any) => c.name || c.link).map((comp: any) => {
    const compRev = comp.adr && comp.occupancy ? Math.round(parseFloat(String(comp.adr).replace(/[^0-9.]/g, "")) * (parseFloat(String(comp.occupancy).replace(/[^0-9.]/g, "")) / 100) * 365) : (comp.annualRevenue ? parseFloat(String(comp.annualRevenue).replace(/[^0-9.]/g, "")) : 0);
    return `<div class="comp-card">
      ${comp.photoUrl ? `<img src="${comp.photoUrl}" alt="" />` : ""}
      <div class="info">
        <h5>${comp.name || "Comparable Property"}</h5>
        <div class="revenue">${fmtD(compRev)}/yr</div>
        <div class="meta">${[comp.adr ? `ADR: $${String(comp.adr).replace(/[^0-9.]/g, "")}` : "", comp.occupancy ? `Occ: ${comp.occupancy}%` : "", comp.beds ? `${comp.beds} beds` : "", comp.city || ""].filter(Boolean).join("  •  ")}</div>
        ${comp.link ? `<div class="meta"><a href="${comp.link}" style="color:#0891b2;">View on Airbnb →</a></div>` : ""}
      </div>
    </div>`;
  }).join("")}` : ""}

  ${form.notes ? `
  <h2 class="section-header">Additional Notes & Assumptions</h2>
  <p style="font-size:10px; color:#475569; line-height:1.6;">${form.notes}</p>` : ""}

  <div class="disclaimer">Disclaimer: This pro-forma is for informational purposes only and does not constitute financial, tax, or investment advice. All projections are estimates based on assumed inputs and comparable data. Actual results may vary materially. Revenue projections assume competent management, competitive pricing, and no material regulatory changes. Tax benefit estimates require material participation and CPA verification. Consult licensed professionals before making investment decisions.</div>

  <div class="footer">SavvyProforma Investor Report  |  Page 4</div>
</div>

<script>
// 5-Year Wealth Building Chart
const ctx1 = document.getElementById('fiveYearChart')?.getContext('2d');
if (ctx1) {
  new Chart(ctx1, {
    type: 'line',
    data: {
      labels: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'],
      datasets: [
        { label: 'Property Value', data: ${JSON.stringify(fiveYearPropValue)}, borderColor: '#0891b2', backgroundColor: 'rgba(8,145,178,0.1)', fill: true, tension: 0.3, borderWidth: 2 },
        { label: 'Equity', data: ${JSON.stringify(fiveYearEquity)}, borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.1)', fill: true, tension: 0.3, borderWidth: 2 },
        { label: 'Annual Cash Flow', data: ${JSON.stringify(fiveYearCashFlow)}, borderColor: '#f59e0b', backgroundColor: 'transparent', tension: 0.3, borderWidth: 2, borderDash: [5,3] },
      ]
    },
    options: {
      responsive: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 9, family: 'Inter' }, boxWidth: 12 } } },
      scales: {
        y: { ticks: { font: { size: 8 }, callback: function(v) { return '$' + (Number(v)/1000).toFixed(0) + 'k'; } }, grid: { color: '#f1f5f9' } },
        x: { ticks: { font: { size: 9 } }, grid: { display: false } }
      }
    }
  });
}

// Expense Breakdown Donut
const ctx2 = document.getElementById('expenseChart')?.getContext('2d');
if (ctx2) {
  new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['Debt Service', 'Fixed Expenses', 'Variable Expenses', 'Platform Fees'],
      datasets: [{
        data: [${Math.round(debtService)}, ${Math.round(fixedExpTotal)}, ${Math.round(varExpTotal)}, ${Math.round(platformFees)}],
        backgroundColor: ['#0891b2', '#06b6d4', '#67e8f9', '#a5f3fc'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: false,
      plugins: { legend: { position: 'right', labels: { font: { size: 9, family: 'Inter' }, boxWidth: 10, generateLabels: function(chart) {
        const data = chart.data;
        return data.labels.map((l, i) => ({ text: l + ': $' + (data.datasets[0].data[i]/1000).toFixed(1) + 'k', fillStyle: data.datasets[0].backgroundColor[i], index: i }));
      } } } }
    }
  });
}
</script>
</body>
</html>`;

      // Render HTML to PDF using Puppeteer
      const puppeteer = await import("puppeteer");
      // Find system chromium - try common paths
      const fs = await import("fs");
      const chromePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
      ].filter(Boolean) as string[];
      const execPath = chromePaths.find(p => { try { return fs.existsSync(p); } catch { return false; } });
      const browser = await puppeteer.default.launch({
        headless: true,
        executablePath: execPath || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
      // Wait for charts to render
      await page.waitForFunction(() => (window as any).Chart !== undefined, { timeout: 5000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1000)); // Extra time for chart animations

      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
      });
      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="SavvyProforma_InvestorReport.pdf"`);
      res.send(Buffer.from(pdfBuffer));
    } catch (err: any) {
      console.error("[InvestorReport] Error:", err);
      res.status(500).json({ error: err.message || "PDF generation failed" });
    }
  });
}
