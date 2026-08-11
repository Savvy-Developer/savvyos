import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface ReportData {
  form: any;
  calc: any;
  property: any;
  branding: any;
  title: string;
  aiSummary?: string;
}

const fmt = (n: number | undefined | null) => {
  if (n == null || isNaN(n)) return "$0";
  return "$" + Math.round(n).toLocaleString("en-US");
};

const pct = (n: number | undefined | null) => {
  if (n == null || isNaN(n)) return "0%";
  return (n * 100).toFixed(1) + "%";
};

export async function generateInvestorReport(data: ReportData): Promise<void> {
  const { form, calc, property, branding, title } = data;
  const s1 = calc.s1 || {};
  const s2 = calc.s2 || {};
  const s3 = calc.s3 || {};

  // Build the HTML report
  const html = buildReportHTML(data);

  // Create a hidden container to render the HTML
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "816px"; // Letter width at 96dpi
  container.style.background = "white";
  container.innerHTML = html;
  document.body.appendChild(container);

  // Wait for images to load
  const images = container.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) resolve(null);
          else {
            img.onload = () => resolve(null);
            img.onerror = () => resolve(null);
          }
        })
    )
  );

  // Wait a tick for rendering
  await new Promise((r) => setTimeout(r, 500));

  // Capture each page section
  const pages = container.querySelectorAll(".pdf-page");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(pages[i] as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
  }

  // Cleanup
  document.body.removeChild(container);

  // Download
  const address = property?.address?.replace(/[^a-zA-Z0-9]/g, "_") || "property";
  pdf.save(`SavvyProforma_InvestorReport_${address}.pdf`);
}

function buildReportHTML(data: ReportData): string {
  const { form, calc, property, branding, title } = data;
  const s1 = calc.s1 || {};
  const s2 = calc.s2 || {};
  const s3 = calc.s3 || {};
  const fiveYear = calc.fiveYear || [];

  const logoUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
  const headshotUrl = branding?.headshot || "";
  const propertyPhoto = form?.propertyPhotoUrl || "";

  return `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #1a1a2e; }
  .pdf-page { width: 816px; min-height: 1056px; padding: 40px; background: white; page-break-after: always; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 3px solid #0891b2; padding-bottom: 15px; }
  .logo { height: 36px; }
  .agent-info { text-align: right; display: flex; align-items: center; gap: 12px; }
  .agent-info img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
  .agent-name { font-size: 14px; font-weight: 700; }
  .agent-contact { font-size: 10px; color: #666; }
  .property-title { font-size: 22px; font-weight: 800; color: #0e7490; margin-bottom: 4px; }
  .property-address { font-size: 13px; color: #555; margin-bottom: 16px; }
  .property-photo { width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; }
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .metric-card { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 12px; text-align: center; }
  .metric-card.highlight { background: #0891b2; border-color: #0891b2; color: white; }
  .metric-card.highlight .metric-label { color: rgba(255,255,255,0.8); }
  .metric-label { font-size: 9px; font-weight: 600; text-transform: uppercase; color: #666; margin-bottom: 4px; }
  .metric-value { font-size: 16px; font-weight: 800; }
  .section-title { font-size: 15px; font-weight: 700; color: #0e7490; margin: 20px 0 10px; border-bottom: 2px solid #e0f2fe; padding-bottom: 5px; }
  .ai-box { background: linear-gradient(135deg, #f0fdfa, #e0f2fe); border: 2px solid #0891b2; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
  .ai-box h3 { font-size: 14px; color: #0e7490; margin-bottom: 8px; }
  .ai-box p { font-size: 11px; line-height: 1.6; color: #333; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px; }
  th { background: #155e75; color: white; padding: 8px 6px; text-align: left; font-weight: 600; }
  td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f8fafc; }
  .highlight-row { background: #ecfeff !important; font-weight: 600; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; }
  .card h4 { font-size: 12px; font-weight: 700; color: #0e7490; margin-bottom: 8px; }
  .card-row { display: flex; justify-content: space-between; font-size: 10px; padding: 3px 0; border-bottom: 1px solid #f3f4f6; }
  .card-row:last-child { border-bottom: none; }
  .card-row .label { color: #666; }
  .card-row .value { font-weight: 600; }
  .footer { position: absolute; bottom: 20px; left: 40px; right: 40px; text-align: center; font-size: 8px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
  .chart-placeholder { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 15px; }
  .disclaimer { font-size: 8px; color: #999; line-height: 1.4; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; }
</style>

<!-- PAGE 1: Cover + Key Metrics + AI Analysis -->
<div class="pdf-page" style="position: relative;">
  <div class="header">
    <img src="${logoUrl}" class="logo" crossorigin="anonymous" />
    <div class="agent-info">
      <div>
        <div class="agent-name">${branding?.name || ""}</div>
        <div class="agent-contact">${branding?.email || ""} | ${branding?.phone || ""}</div>
      </div>
      ${headshotUrl ? `<img src="${headshotUrl}" crossorigin="anonymous" />` : ""}
    </div>
  </div>

  <div class="property-title">${title || "STR Investment Analysis"}</div>
  <div class="property-address">${property?.address || ""}, ${property?.city || ""} ${property?.state || ""} ${property?.zip || ""} | ${property?.beds || 0} BD / ${property?.baths || 0} BA / ${property?.sqft || 0} sqft</div>

  ${propertyPhoto ? `<img src="${propertyPhoto}" class="property-photo" crossorigin="anonymous" />` : ""}

  <div class="metrics-grid">
    <div class="metric-card"><div class="metric-label">Total Cash Needed</div><div class="metric-value">${fmt(calc.totalCashNeeded)}</div></div>
    <div class="metric-card"><div class="metric-label">Monthly Mortgage</div><div class="metric-value">${fmt(calc.monthlyMortgage)}</div></div>
    <div class="metric-card highlight"><div class="metric-label">Base Case Cash Flow</div><div class="metric-value">${fmt(s2.cashFlow)}</div></div>
    <div class="metric-card highlight"><div class="metric-label">Cash-on-Cash Return</div><div class="metric-value">${pct(s2.cashOnCash)}</div></div>
    <div class="metric-card"><div class="metric-label">Cap Rate</div><div class="metric-value">${pct(s2.capRate)}</div></div>
    <div class="metric-card"><div class="metric-label">DSCR</div><div class="metric-value">${(s2.dscr || 0).toFixed(2)}x</div></div>
    <div class="metric-card"><div class="metric-label">Break-Even Occ.</div><div class="metric-value">${pct(s2.breakEvenOcc)}</div></div>
    <div class="metric-card"><div class="metric-label">Net Tax Benefit</div><div class="metric-value">${fmt(calc.netTaxBenefit)}</div></div>
  </div>

  <div class="ai-box">
    <h3>Investment Analysis</h3>
    <p>${data.aiSummary || `This ${property?.beds || 0}-bedroom property in ${property?.city || "the area"} presents a compelling STR investment opportunity at ${fmt(calc.pp)} with ${fmt(calc.totalCashNeeded)} total cash needed. The base case projects ${fmt(s2.cashFlow)} annual cash flow (${pct(s2.cashOnCash)} CoC) with a ${(s2.dscr || 0).toFixed(2)}x DSCR providing a solid margin of safety. Break-even occupancy of ${pct(s2.breakEvenOcc)} indicates manageable downside risk. ${calc.netTaxBenefit > 0 ? `Year 1 tax benefits of ${fmt(calc.netTaxBenefit)} from cost segregation significantly enhance effective returns.` : ""}`}</p>
  </div>

  ${form?.propertyLink ? `<div style="font-size: 9px; color: #0891b2; margin-bottom: 10px;">Listing: ${form.propertyLink}</div>` : ""}
</div>

<!-- PAGE 2: Scenario Comparison + Acquisition -->
<div class="pdf-page" style="position: relative;">
  <div class="header">
    <img src="${logoUrl}" class="logo" crossorigin="anonymous" />
    <div style="font-size: 10px; color: #666;">Scenario Comparison & Acquisition Details</div>
  </div>

  <div class="section-title">Revenue Scenario Comparison</div>
  <table>
    <tr><th>Metric</th><th>Conservative</th><th>Base Case</th><th>Strong Execution</th></tr>
    <tr><td>ADR</td><td>${fmt(s1.adr)}</td><td>${fmt(s2.adr)}</td><td>${fmt(s3.adr)}</td></tr>
    <tr><td>Occupancy</td><td>${pct(s1.occ)}</td><td>${pct(s2.occ)}</td><td>${pct(s3.occ)}</td></tr>
    <tr><td>Sold Nights</td><td>${s1.soldNights || 0}</td><td>${s2.soldNights || 0}</td><td>${s3.soldNights || 0}</td></tr>
    <tr><td>Gross Revenue</td><td>${fmt(s1.grossRevenue)}</td><td>${fmt(s2.grossRevenue)}</td><td>${fmt(s3.grossRevenue)}</td></tr>
    <tr><td>Net Revenue</td><td>${fmt(s1.netRevenue)}</td><td>${fmt(s2.netRevenue)}</td><td>${fmt(s3.netRevenue)}</td></tr>
    <tr><td>NOI</td><td>${fmt(s1.noi)}</td><td>${fmt(s2.noi)}</td><td>${fmt(s3.noi)}</td></tr>
    <tr class="highlight-row"><td>Annual Cash Flow</td><td>${fmt(s1.cashFlow)}</td><td>${fmt(s2.cashFlow)}</td><td>${fmt(s3.cashFlow)}</td></tr>
    <tr class="highlight-row"><td>Cash-on-Cash Return</td><td>${pct(s1.cashOnCash)}</td><td>${pct(s2.cashOnCash)}</td><td>${pct(s3.cashOnCash)}</td></tr>
    <tr><td>Cap Rate</td><td>${pct(s1.capRate)}</td><td>${pct(s2.capRate)}</td><td>${pct(s3.capRate)}</td></tr>
    <tr><td>DSCR</td><td>${(s1.dscr || 0).toFixed(2)}x</td><td>${(s2.dscr || 0).toFixed(2)}x</td><td>${(s3.dscr || 0).toFixed(2)}x</td></tr>
    ${calc.taxReturns ? `<tr class="highlight-row" style="background:#ecfeff !important;"><td>CoC w/ Tax Benefits (Yr 1)</td><td>${pct(calc.taxReturns?.s1Yr1CoC)}</td><td>${pct(calc.taxReturns?.s2Yr1CoC)}</td><td>${pct(calc.taxReturns?.s3Yr1CoC)}</td></tr>` : ""}
  </table>

  <div class="two-col">
    <div class="card">
      <h4>Acquisition & Cash to Close</h4>
      <div class="card-row"><span class="label">Purchase Price</span><span class="value">${fmt(calc.pp)}</span></div>
      <div class="card-row"><span class="label">Down Payment (${form?.downPaymentPct || 20}%)</span><span class="value">${fmt(calc.downPayment)}</span></div>
      <div class="card-row"><span class="label">Closing Costs</span><span class="value">${fmt(calc.closingCosts)}</span></div>
      <div class="card-row"><span class="label">Furnishing</span><span class="value">${fmt(calc.furnishing)}</span></div>
      <div class="card-row"><span class="label">Renovation</span><span class="value">${fmt(calc.renovation)}</span></div>
      ${calc.sellerCredit ? `<div class="card-row"><span class="label" style="color:#0891b2;">Seller Credit</span><span class="value" style="color:#0891b2;">-${fmt(calc.sellerCredit)}</span></div>` : ""}
      <div class="card-row" style="border-top: 2px solid #0891b2; padding-top: 6px; margin-top: 4px;"><span class="label" style="font-weight:700;">Total Cash Needed</span><span class="value" style="font-size:13px;">${fmt(calc.totalCashNeeded)}</span></div>
    </div>
    <div class="card">
      <h4>Loan Details</h4>
      <div class="card-row"><span class="label">Loan Type</span><span class="value">${form?.loanType || "DSCR"}</span></div>
      <div class="card-row"><span class="label">Loan Amount</span><span class="value">${fmt(calc.loanAmount)}</span></div>
      <div class="card-row"><span class="label">Interest Rate</span><span class="value">${form?.interestRate || 7}%</span></div>
      <div class="card-row"><span class="label">Loan Term</span><span class="value">${form?.loanTermYears || 30} years</span></div>
      <div class="card-row"><span class="label">Monthly P&I</span><span class="value">${fmt(calc.monthlyMortgage)}</span></div>
      <div class="card-row"><span class="label">Annual Debt Service</span><span class="value">${fmt(calc.annualDebtService)}</span></div>
      <div class="card-row"><span class="label">Blended Platform Fee</span><span class="value">${((calc.blendedFeeRate || 0) * 100).toFixed(1)}%</span></div>
    </div>
  </div>
</div>

<!-- PAGE 3: 5-Year Projection + IRR + Tax Benefits -->
<div class="pdf-page" style="position: relative;">
  <div class="header">
    <img src="${logoUrl}" class="logo" crossorigin="anonymous" />
    <div style="font-size: 10px; color: #666;">5-Year Projection & Tax Benefits</div>
  </div>

  ${fiveYear.length > 0 ? `
  <div class="section-title">5-Year Wealth Building Projection (Base Case)</div>
  <table>
    <tr><th>Year</th><th>Revenue</th><th>Cash Flow</th><th>Cumulative CF</th><th>Property Value</th><th>Equity</th></tr>
    ${fiveYear.map((yr: any) => `<tr><td>Year ${yr.year}</td><td>${fmt(yr.revenue)}</td><td>${fmt(yr.cashFlow)}</td><td>${fmt(yr.cumulativeCF)}</td><td>${fmt(yr.propertyValue)}</td><td>${fmt(yr.equity)}</td></tr>`).join("")}
  </table>` : ""}

  ${calc.irr && calc.irr.s1 ? `
  <div class="section-title">Internal Rate of Return (IRR)</div>
  <table>
    <tr><th>Hold Period</th><th colspan="2">Conservative</th><th colspan="2">Base Case</th><th colspan="2">Strong Execution</th></tr>
    <tr><th></th><th>Pre-Tax</th><th>After-Tax</th><th>Pre-Tax</th><th>After-Tax</th><th>Pre-Tax</th><th>After-Tax</th></tr>
    <tr><td>3-Year</td><td>${calc.irr.s1.y3 || "N/A"}</td><td>${calc.irr.s1.y3at || "N/A"}</td><td>${calc.irr.s2.y3 || "N/A"}</td><td>${calc.irr.s2.y3at || "N/A"}</td><td>${calc.irr.s3.y3 || "N/A"}</td><td>${calc.irr.s3.y3at || "N/A"}</td></tr>
    <tr><td>5-Year</td><td>${calc.irr.s1.y5 || "N/A"}</td><td>${calc.irr.s1.y5at || "N/A"}</td><td>${calc.irr.s2.y5 || "N/A"}</td><td>${calc.irr.s2.y5at || "N/A"}</td><td>${calc.irr.s3.y5 || "N/A"}</td><td>${calc.irr.s3.y5at || "N/A"}</td></tr>
    <tr><td>7-Year</td><td>${calc.irr.s1.y7 || "N/A"}</td><td>${calc.irr.s1.y7at || "N/A"}</td><td>${calc.irr.s2.y7 || "N/A"}</td><td>${calc.irr.s2.y7at || "N/A"}</td><td>${calc.irr.s3.y7 || "N/A"}</td><td>${calc.irr.s3.y7at || "N/A"}</td></tr>
  </table>` : ""}

  ${calc.costSegEnabled ? `
  <div class="section-title">Tax Benefits</div>
  <div class="two-col">
    <div class="card">
      <h4>Year 1 — Cost Segregation</h4>
      <div class="card-row"><span class="label">Total Yr 1 Deduction</span><span class="value">${fmt(calc.totalFirstYearDeduction)}</span></div>
      <div class="card-row"><span class="label">Tax Savings @ ${form?.marginalTaxRate || 35}%</span><span class="value">${fmt(calc.taxSavings)}</span></div>
      <div class="card-row"><span class="label">Study Cost</span><span class="value">-${fmt(calc.costSegCost)}</span></div>
      <div class="card-row" style="border-top: 2px solid #0891b2; padding-top: 6px;"><span class="label" style="font-weight:700;">Net Tax Benefit</span><span class="value" style="color:#0891b2; font-size:13px;">${fmt(calc.netTaxBenefit)}</span></div>
    </div>
    <div class="card">
      <h4>Ongoing Annual (Year 2+)</h4>
      <div class="card-row"><span class="label">Straight-Line Depreciation</span><span class="value">${fmt(calc.straightLineDepreciation)}/yr</span></div>
      <div class="card-row"><span class="label">Mortgage Interest Deduction</span><span class="value">${fmt(calc.year1MortgageInterest)}/yr</span></div>
      <div class="card-row"><span class="label">Annual Tax Savings</span><span class="value">${fmt(calc.ongoingAnnualTaxBenefit)}/yr</span></div>
    </div>
  </div>` : ""}

  ${form?.notes ? `<div class="section-title">Notes & Assumptions</div><div style="font-size: 10px; line-height: 1.5; color: #444; padding: 10px; background: #f8fafc; border-radius: 6px;">${form.notes}</div>` : ""}

  <div class="disclaimer">
    Disclaimer: This pro-forma is for informational purposes only and does not constitute financial advice. Projections are based on assumed inputs and comparable data. Actual results may vary materially. Revenue projections assume competent management, competitive pricing, and no material regulatory changes. Platform fee structures (Airbnb 15.5% host-only, Vrbo 8%) are current as of 2026 and subject to change. Tax benefit estimates require material participation and CPA verification. Consult licensed professionals before making investment decisions.
  </div>
</div>
`;
}
