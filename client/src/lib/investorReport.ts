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

const irrFmt = (v: any) => {
  if (v == null || v === "N/A") return "N/A";
  if (typeof v === "number") return (v * 100).toFixed(1) + "%";
  const num = parseFloat(v);
  if (isNaN(num)) return "N/A";
  return (num * 100).toFixed(1) + "%";
};

const loanTypeLabel = (lt: string) => {
  const map: Record<string, string> = {
    dscr: "DSCR Loan", conventional_investment: "Conventional Investment",
    conventional_second: "Conventional Second Home", other: "Other", cash: "All Cash"
  };
  return map[lt] || lt || "DSCR Loan";
};

export async function generateInvestorReport(data: ReportData): Promise<void> {
  const { form, calc, property, branding, title } = data;

  const htmlContent = buildReportHTML(data);
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a2e; background: white; }</style></head><body>${htmlContent}</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = "816px";
  iframe.style.height = "6000px";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) { document.body.removeChild(iframe); throw new Error("Could not access iframe document"); }
  iframeDoc.open();
  iframeDoc.write(fullHtml);
  iframeDoc.close();

  const images = iframeDoc.querySelectorAll("img");
  await Promise.all(Array.from(images).map((img) => new Promise((resolve) => { if (img.complete) resolve(null); else { img.onload = () => resolve(null); img.onerror = () => resolve(null); } })));
  await new Promise((r) => setTimeout(r, 1000));

  const pages = iframeDoc.querySelectorAll(".pdf-page");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(pages[i] as HTMLElement, {
      scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", foreignObjectRendering: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
  }

  document.body.removeChild(iframe);
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
  const pmi = parseFloat(form?.pmiRate || "0");
  const monthlyPmi = pmi > 0 ? (calc.loanAmount || 0) * (pmi / 100) / 12 : 0;

  // Channel mix for blended fee display
  const airbnbPct = parseFloat(form?.channelAirbnb || "70");
  const vrboPct = parseFloat(form?.channelVrbo || "20");
  const directPct = parseFloat(form?.channelDirect || "10");

  // SVG Bar Chart for Scenario Revenue Comparison
  const maxRev = Math.max(s1.grossRevenue || 1, s2.grossRevenue || 1, s3.grossRevenue || 1);
  const barChart = `<svg width="100%" height="140" viewBox="0 0 400 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="${120 - (s1.grossRevenue/maxRev)*100}" width="80" height="${(s1.grossRevenue/maxRev)*100}" fill="#94a3b8" rx="4"/>
    <rect x="160" y="${120 - (s2.grossRevenue/maxRev)*100}" width="80" height="${(s2.grossRevenue/maxRev)*100}" fill="#0891b2" rx="4"/>
    <rect x="290" y="${120 - (s3.grossRevenue/maxRev)*100}" width="80" height="${(s3.grossRevenue/maxRev)*100}" fill="#059669" rx="4"/>
    <text x="70" y="135" text-anchor="middle" font-size="9" fill="#666">Conservative</text>
    <text x="200" y="135" text-anchor="middle" font-size="9" fill="#666">Base Case</text>
    <text x="330" y="135" text-anchor="middle" font-size="9" fill="#666">Strong</text>
    <text x="70" y="${115 - (s1.grossRevenue/maxRev)*100}" text-anchor="middle" font-size="9" font-weight="bold" fill="#333">${fmt(s1.grossRevenue)}</text>
    <text x="200" y="${115 - (s2.grossRevenue/maxRev)*100}" text-anchor="middle" font-size="9" font-weight="bold" fill="#333">${fmt(s2.grossRevenue)}</text>
    <text x="330" y="${115 - (s3.grossRevenue/maxRev)*100}" text-anchor="middle" font-size="9" font-weight="bold" fill="#333">${fmt(s3.grossRevenue)}</text>
  </svg>`;

  // SVG Donut Chart for Expense Breakdown
  const debtService = calc.annualDebtService || 0;
  const fixedExp = calc.fixedExpensesAnnual || 0;
  const varExp = calc.variableExpensesAnnual || 0;
  const platformFees = (s2.grossRevenue || 0) * (calc.blendedFeeRate || 0);
  const totalExp = debtService + fixedExp + varExp + platformFees || 1;
  const donutData = [
    { pct: debtService/totalExp, color: "#0891b2", label: "Debt Service" },
    { pct: fixedExp/totalExp, color: "#f59e0b", label: "Fixed Expenses" },
    { pct: varExp/totalExp, color: "#8b5cf6", label: "Variable Expenses" },
    { pct: platformFees/totalExp, color: "#ef4444", label: "Platform Fees" },
  ];
  let donutOffset = 0;
  const donutArcs = donutData.map(d => {
    const start = donutOffset;
    donutOffset += d.pct;
    const startAngle = start * 2 * Math.PI - Math.PI/2;
    const endAngle = donutOffset * 2 * Math.PI - Math.PI/2;
    const largeArc = d.pct > 0.5 ? 1 : 0;
    const x1 = 60 + 45 * Math.cos(startAngle);
    const y1 = 60 + 45 * Math.sin(startAngle);
    const x2 = 60 + 45 * Math.cos(endAngle);
    const y2 = 60 + 45 * Math.sin(endAngle);
    return `<path d="M 60 60 L ${x1} ${y1} A 45 45 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${d.color}"/>`;
  }).join("");
  const donutChart = `<svg width="260" height="130" viewBox="0 0 260 130" xmlns="http://www.w3.org/2000/svg">
    ${donutArcs}
    <circle cx="60" cy="60" r="25" fill="white"/>
    <text x="60" y="64" text-anchor="middle" font-size="8" font-weight="bold" fill="#333">${fmt(totalExp)}</text>
    ${donutData.map((d, i) => `<rect x="130" y="${15 + i*28}" width="10" height="10" fill="${d.color}" rx="2"/><text x="145" y="${23 + i*28}" font-size="9" fill="#333">${d.label} (${(d.pct*100).toFixed(0)}%)</text><text x="145" y="${34 + i*28}" font-size="8" fill="#666">${fmt(d.pct * totalExp)}/yr</text>`).join("")}
  </svg>`;

  // 5-Year Line Chart
  let lineChart = "";
  if (fiveYear.length > 0) {
    const maxVal = Math.max(...fiveYear.map((y: any) => y.propertyValue || 0));
    const chartW = 400, chartH = 100, padL = 10, padR = 10;
    const points = (key: string, color: string) => {
      const pts = fiveYear.map((yr: any, i: number) => {
        const x = padL + (i / (fiveYear.length - 1)) * (chartW - padL - padR);
        const y = chartH - 10 - ((yr[key] || 0) / maxVal) * (chartH - 20);
        return `${x},${y}`;
      }).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    };
    lineChart = `<svg width="100%" height="130" viewBox="0 0 ${chartW} ${chartH + 20}" xmlns="http://www.w3.org/2000/svg">
      ${points("propertyValue", "#0891b2")}
      ${points("equity", "#059669")}
      ${points("cumulativeCF", "#f59e0b")}
      ${fiveYear.map((yr: any, i: number) => `<text x="${padL + (i / (fiveYear.length - 1)) * (chartW - padL - padR)}" y="${chartH + 15}" text-anchor="middle" font-size="8" fill="#666">Yr ${yr.year}</text>`).join("")}
      <rect x="${chartW - 150}" y="2" width="145" height="50" fill="white" stroke="#eee" rx="4"/>
      <line x1="${chartW - 145}" y1="12" x2="${chartW - 130}" y2="12" stroke="#0891b2" stroke-width="2"/>
      <text x="${chartW - 125}" y="15" font-size="8" fill="#333">Property Value</text>
      <line x1="${chartW - 145}" y1="27" x2="${chartW - 130}" y2="27" stroke="#059669" stroke-width="2"/>
      <text x="${chartW - 125}" y="30" font-size="8" fill="#333">Equity</text>
      <line x1="${chartW - 145}" y1="42" x2="${chartW - 130}" y2="42" stroke="#f59e0b" stroke-width="2"/>
      <text x="${chartW - 125}" y="45" font-size="8" fill="#333">Cumulative Cash Flow</text>
    </svg>`;
  }

  // Value-Add / Refi section
  let valueAddSection = "";
  if (calc.isValueAdd || calc.isCashoutRefi) {
    const refi = calc.refi || {};
    valueAddSection = `
    <div class="pdf-page" style="position: relative;">
      <div class="header">
        <img src="${logoUrl}" class="logo" crossorigin="anonymous" />
        <div style="font-size: 10px; color: #666;">Value-Add & Refinance Analysis</div>
      </div>
      ${calc.isValueAdd ? `
      <div class="section-title">Equity Creation Through Value-Add</div>
      <div class="two-col">
        <div class="card">
          <h4>Investment Basis</h4>
          <div class="card-row"><span class="label">Purchase Price</span><span class="value">${fmt(calc.pp)}</span></div>
          <div class="card-row"><span class="label">Renovation Budget</span><span class="value">${fmt(calc.renovation)}</span></div>
          <div class="card-row" style="border-top:1px solid #ddd;padding-top:4px;"><span class="label" style="font-weight:700;">All-In Cost</span><span class="value">${fmt((calc.pp || 0) + (calc.renovation || 0))}</span></div>
        </div>
        <div class="card" style="background:#ecfeff;">
          <h4>After Repair Value</h4>
          <div class="card-row"><span class="label">ARV</span><span class="value" style="font-size:16px;color:#0891b2;">${fmt(calc.arv)}</span></div>
          <div class="card-row"><span class="label">Forced Equity (ARV - Purchase)</span><span class="value">${fmt(calc.forcedEquity)}</span></div>
          <div class="card-row"><span class="label">Net Equity Created (ARV - All-In)</span><span class="value" style="color:#059669;">${fmt(calc.equityCreatedByReno)}</span></div>
        </div>
      </div>` : ""}
      ${calc.isCashoutRefi ? `
      <div class="section-title">Cash-Out Refinance</div>
      <div class="two-col">
        <div class="card">
          <h4>Refi Terms</h4>
          <div class="card-row"><span class="label">Appraised Value</span><span class="value">${fmt(refi.refiAppraisedValue)}</span></div>
          <div class="card-row"><span class="label">LTV</span><span class="value">${form?.refiLtv || 75}%</span></div>
          <div class="card-row"><span class="label">New Loan Amount</span><span class="value">${fmt(refi.refiNewLoanAmount)}</span></div>
          <div class="card-row"><span class="label">Original Loan Payoff</span><span class="value">${fmt(calc.loanAmount)}</span></div>
          <div class="card-row" style="border-top:2px solid #059669;padding-top:4px;"><span class="label" style="font-weight:700;color:#059669;">Cash Out</span><span class="value" style="font-size:14px;color:#059669;">${fmt(refi.cashOut)}</span></div>
        </div>
        <div class="card">
          <h4>Post-Refi Returns (Base Case)</h4>
          <div class="card-row"><span class="label">New Monthly Payment</span><span class="value">${fmt(refi.refiMonthlyMortgage)}</span></div>
          <div class="card-row"><span class="label">Cash Left in Deal</span><span class="value">${fmt(refi.cashInDeal)}</span></div>
          <div class="card-row"><span class="label">Post-Refi Cash Flow</span><span class="value">${fmt(refi.s2?.cashFlow)}</span></div>
          <div class="card-row" style="border-top:2px solid #0891b2;padding-top:4px;"><span class="label" style="font-weight:700;">Post-Refi CoC Return</span><span class="value" style="font-size:14px;color:#0891b2;">${refi.cashInDeal > 0 ? pct(refi.s2?.cashOnCash) : "Infinite"}</span></div>
        </div>
      </div>
      <div style="margin-top:15px; padding:12px; background:#f0fdfa; border-radius:8px; border:1px solid #99f6e4;">
        <div style="font-size:10px; font-weight:700; color:#0e7490; margin-bottom:6px;">Holding Period Timeline</div>
        <div style="display:flex; gap:10px; align-items:center;">
          <div style="flex:1; background:#e0f2fe; border-radius:6px; padding:8px; text-align:center; font-size:9px;">
            <div style="font-weight:700;">Months 1-${form?.seasoningPeriod || 6}</div>
            <div>Original Mortgage: ${fmt(calc.monthlyMortgage)}/mo</div>
          </div>
          <div style="font-size:14px; color:#0891b2;">→</div>
          <div style="flex:1; background:#ecfeff; border-radius:6px; padding:8px; text-align:center; font-size:9px;">
            <div style="font-weight:700;">Month ${(parseInt(form?.seasoningPeriod || "6") + 1)}+</div>
            <div>Cash-Out Refi: ${fmt(refi.refiMonthlyMortgage)}/mo</div>
          </div>
        </div>
      </div>` : ""}
    </div>`;
  }

  return `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .pdf-page { width: 816px; min-height: 1056px; padding: 36px 40px; background: white; page-break-after: always; position: relative; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 3px solid #0891b2; padding-bottom: 12px; }
  .logo { height: 32px; }
  .agent-info { text-align: right; display: flex; align-items: center; gap: 10px; }
  .headshot { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid #0891b2; }
  .agent-name { font-size: 13px; font-weight: 700; }
  .agent-contact { font-size: 9px; color: #666; }
  .property-title { font-size: 20px; font-weight: 800; color: #0e7490; margin-bottom: 3px; }
  .property-address { font-size: 11px; color: #555; margin-bottom: 12px; }
  .property-photo { width: 100%; max-height: 180px; object-fit: cover; border-radius: 8px; margin-bottom: 16px; }
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .metric-card { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 10px 8px; text-align: center; }
  .metric-card.highlight { background: #0891b2; border-color: #0891b2; color: white; }
  .metric-card.highlight .metric-label { color: rgba(255,255,255,0.85); }
  .metric-label { font-size: 8px; font-weight: 600; text-transform: uppercase; color: #666; margin-bottom: 3px; }
  .metric-value { font-size: 15px; font-weight: 800; }
  .section-title { font-size: 13px; font-weight: 700; color: #0e7490; margin: 16px 0 8px; border-bottom: 2px solid #e0f2fe; padding-bottom: 4px; }
  .ai-box { background: linear-gradient(135deg, #f0fdfa, #e0f2fe); border: 2px solid #0891b2; border-radius: 10px; padding: 16px; margin-bottom: 14px; }
  .ai-box h3 { font-size: 13px; color: #0e7490; margin-bottom: 6px; }
  .ai-box p { font-size: 10px; line-height: 1.6; color: #333; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 12px; }
  th { background: #155e75; color: white; padding: 6px 5px; text-align: left; font-weight: 600; font-size: 8px; }
  td { padding: 5px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) { background: #f8fafc; }
  .highlight-row { background: #ecfeff !important; font-weight: 600; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 12px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .card h4 { font-size: 11px; font-weight: 700; color: #0e7490; margin-bottom: 6px; }
  .card-row { display: flex; justify-content: space-between; font-size: 9px; padding: 2px 0; border-bottom: 1px solid #f3f4f6; }
  .card-row:last-child { border-bottom: none; }
  .card-row .label { color: #666; }
  .card-row .value { font-weight: 600; }
  .chart-box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
  .chart-title { font-size: 10px; font-weight: 700; color: #333; margin-bottom: 6px; }
  .disclaimer { font-size: 7px; color: #999; line-height: 1.4; margin-top: 16px; padding-top: 8px; border-top: 1px solid #eee; }
  a { color: #0891b2; text-decoration: underline; }
</style>

<!-- PAGE 1: Cover -->
<div class="pdf-page">
  <div class="header">
    <img src="${logoUrl}" class="logo" crossorigin="anonymous" />
    <div class="agent-info">
      <div>
        <div class="agent-name">${branding?.name || ""}</div>
        <div class="agent-contact">${branding?.email || ""} | ${branding?.phone || ""}</div>
        ${branding?.market ? `<div class="agent-contact">${branding.market}</div>` : ""}
      </div>
      ${headshotUrl ? `<img src="${headshotUrl}" class="headshot" crossorigin="anonymous" />` : ""}
    </div>
  </div>

  <div class="property-title">${title || "STR Investment Analysis"}</div>
  <div class="property-address">${property?.address || ""}, ${property?.city || ""} ${property?.state || ""} ${property?.zip || ""} | ${property?.beds || 0} BD / ${property?.baths || 0} BA / ${property?.sqft || 0} sqft</div>

  ${propertyPhoto ? `<img src="${propertyPhoto}" class="property-photo" crossorigin="anonymous" />` : ""}

  <div class="metrics-grid">
    <div class="metric-card"><div class="metric-label">Total Cash Needed</div><div class="metric-value">${fmt(calc.totalCashNeeded)}</div></div>
    <div class="metric-card"><div class="metric-label">Monthly Mortgage${monthlyPmi > 0 ? " + PMI" : ""}</div><div class="metric-value">${fmt((calc.monthlyMortgage || 0) + monthlyPmi)}</div></div>
    <div class="metric-card highlight"><div class="metric-label">Base Case Cash Flow</div><div class="metric-value">${fmt(s2.cashFlow)}</div></div>
    <div class="metric-card highlight"><div class="metric-label">Cash-on-Cash Return</div><div class="metric-value">${pct(s2.cashOnCash)}</div></div>
    <div class="metric-card"><div class="metric-label">Cap Rate</div><div class="metric-value">${pct(s2.capRate)}</div></div>
    <div class="metric-card"><div class="metric-label">DSCR</div><div class="metric-value">${(s2.dscr || 0).toFixed(2)}x</div></div>
    <div class="metric-card"><div class="metric-label">Break-Even Occ.</div><div class="metric-value">${pct(s2.breakEvenOcc)}</div></div>
    <div class="metric-card"><div class="metric-label">Net Tax Benefit (Yr 1)</div><div class="metric-value">${fmt(calc.netTaxBenefit)}</div></div>
  </div>

  <div class="ai-box">
    <h3>Investment Analysis</h3>
    <p>${data.aiSummary || `This ${property?.beds || 0}-bedroom property in ${property?.city || "the area"} presents a compelling STR investment opportunity at ${fmt(calc.pp)} with ${fmt(calc.totalCashNeeded)} total cash needed. The base case projects ${fmt(s2.cashFlow)} annual cash flow (${pct(s2.cashOnCash)} CoC) with a ${(s2.dscr || 0).toFixed(2)}x DSCR providing a solid margin of safety. Break-even occupancy of ${pct(s2.breakEvenOcc)} indicates manageable downside risk. ${calc.netTaxBenefit > 0 ? `Year 1 tax benefits of ${fmt(calc.netTaxBenefit)} from cost segregation significantly enhance effective returns, bringing Year 1 CoC to ${pct(calc.taxReturns?.s2Yr1CoC)}.` : ""}`}</p>
  </div>

  ${form?.propertyLink ? `<div style="font-size: 9px; margin-bottom: 8px;"><a href="${form.propertyLink}" target="_blank">View Listing on Zillow</a></div>` : ""}
</div>

<!-- PAGE 2: Scenarios + Charts -->
<div class="pdf-page">
  <div class="header">
    <img src="${logoUrl}" class="logo" crossorigin="anonymous" />
    <div style="font-size: 9px; color: #666;">Revenue Scenarios & Financial Details</div>
  </div>

  <div class="chart-box">
    <div class="chart-title">Gross Revenue by Scenario</div>
    ${barChart}
  </div>

  <div class="section-title">Scenario Comparison</div>
  <table>
    <tr><th>Metric</th><th>Conservative</th><th>Base Case</th><th>Strong Execution</th></tr>
    <tr><td>ADR</td><td>${fmt(s1.adr)}</td><td>${fmt(s2.adr)}</td><td>${fmt(s3.adr)}</td></tr>
    <tr><td>Occupancy</td><td>${pct(s1.occ)}</td><td>${pct(s2.occ)}</td><td>${pct(s3.occ)}</td></tr>
    <tr><td>Sold Nights</td><td>${Math.round(s1.soldNights || 0)}</td><td>${Math.round(s2.soldNights || 0)}</td><td>${Math.round(s3.soldNights || 0)}</td></tr>
    <tr><td>Gross Revenue</td><td>${fmt(s1.grossRevenue)}</td><td>${fmt(s2.grossRevenue)}</td><td>${fmt(s3.grossRevenue)}</td></tr>
    <tr><td>Platform Fees (${((calc.blendedFeeRate || 0) * 100).toFixed(1)}%)</td><td>${fmt((s1.grossRevenue || 0) * (calc.blendedFeeRate || 0))}</td><td>${fmt((s2.grossRevenue || 0) * (calc.blendedFeeRate || 0))}</td><td>${fmt((s3.grossRevenue || 0) * (calc.blendedFeeRate || 0))}</td></tr>
    <tr><td>Net Revenue</td><td>${fmt(s1.netRevenue)}</td><td>${fmt(s2.netRevenue)}</td><td>${fmt(s3.netRevenue)}</td></tr>
    <tr><td>NOI</td><td>${fmt(s1.noi)}</td><td>${fmt(s2.noi)}</td><td>${fmt(s3.noi)}</td></tr>
    <tr class="highlight-row"><td>Annual Cash Flow</td><td>${fmt(s1.cashFlow)}</td><td>${fmt(s2.cashFlow)}</td><td>${fmt(s3.cashFlow)}</td></tr>
    <tr class="highlight-row"><td>Cash-on-Cash Return</td><td>${pct(s1.cashOnCash)}</td><td>${pct(s2.cashOnCash)}</td><td>${pct(s3.cashOnCash)}</td></tr>
    <tr><td>Cap Rate</td><td>${pct(s1.capRate)}</td><td>${pct(s2.capRate)}</td><td>${pct(s3.capRate)}</td></tr>
    <tr><td>DSCR</td><td>${(s1.dscr || 0).toFixed(2)}x</td><td>${(s2.dscr || 0).toFixed(2)}x</td><td>${(s3.dscr || 0).toFixed(2)}x</td></tr>
    ${calc.taxReturns ? `<tr class="highlight-row"><td>CoC w/ Tax Benefits (Yr 1)</td><td>${pct(calc.taxReturns.s1Yr1CoC)}</td><td>${pct(calc.taxReturns.s2Yr1CoC)}</td><td>${pct(calc.taxReturns.s3Yr1CoC)}</td></tr>
    <tr class="highlight-row"><td>CoC w/ Tax Benefits (Yr 2+)</td><td>${pct(calc.taxReturns.s1Yr2CoC)}</td><td>${pct(calc.taxReturns.s2Yr2CoC)}</td><td>${pct(calc.taxReturns.s3Yr2CoC)}</td></tr>` : ""}
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
      <div class="card-row" style="border-top:2px solid #0891b2;padding-top:4px;margin-top:3px;"><span class="label" style="font-weight:700;">Total Cash Needed</span><span class="value" style="font-size:12px;">${fmt(calc.totalCashNeeded)}</span></div>
    </div>
    <div class="card">
      <h4>Loan Details</h4>
      <div class="card-row"><span class="label">Loan Type</span><span class="value">${loanTypeLabel(form?.loanType)}</span></div>
      <div class="card-row"><span class="label">Loan Amount</span><span class="value">${fmt(calc.loanAmount)}</span></div>
      <div class="card-row"><span class="label">Interest Rate</span><span class="value">${form?.interestRate || 7}%</span></div>
      <div class="card-row"><span class="label">Loan Term</span><span class="value">${form?.loanTermYears || 30} years</span></div>
      <div class="card-row"><span class="label">Monthly P&I</span><span class="value">${fmt(calc.monthlyMortgage)}</span></div>
      ${monthlyPmi > 0 ? `<div class="card-row"><span class="label">PMI (${pmi}%)</span><span class="value">${fmt(monthlyPmi)}/mo</span></div>` : ""}
      <div class="card-row"><span class="label">Annual Debt Service</span><span class="value">${fmt(calc.annualDebtService)}</span></div>
      <div class="card-row" style="border-top:1px solid #ddd;padding-top:3px;"><span class="label">Blended Platform Fee</span><span class="value">${((calc.blendedFeeRate || 0) * 100).toFixed(1)}%</span></div>
      <div class="card-row"><span class="label" style="font-size:8px;color:#999;">Airbnb ${airbnbPct}% | Vrbo ${vrboPct}% | Direct ${directPct}%</span><span class="value"></span></div>
    </div>
  </div>
</div>

<!-- PAGE 3: Charts + 5-Year + IRR + Tax -->
<div class="pdf-page">
  <div class="header">
    <img src="${logoUrl}" class="logo" crossorigin="anonymous" />
    <div style="font-size: 9px; color: #666;">Projections, Returns & Tax Benefits</div>
  </div>

  <div class="two-col" style="margin-bottom:12px;">
    <div class="chart-box">
      <div class="chart-title">5-Year Growth Projection</div>
      ${lineChart || '<div style="font-size:9px;color:#999;">Fill in growth assumptions to see projection</div>'}
    </div>
    <div class="chart-box">
      <div class="chart-title">Annual Expense Breakdown (Base Case)</div>
      ${donutChart}
    </div>
  </div>

  ${fiveYear.length > 0 ? `
  <div class="section-title">5-Year Wealth Building (Base Case)</div>
  <table>
    <tr><th>Year</th><th>Revenue</th><th>Cash Flow</th><th>Cumul. CF</th><th>Tax Benefit</th><th>Property Value</th><th>Equity</th></tr>
    ${fiveYear.map((yr: any, i: number) => {
      const cumCF = fiveYear.slice(0, i+1).reduce((sum: number, y: any) => sum + (y.cashFlow || 0), 0);
      const taxBen = i === 0 ? (calc.netTaxBenefit || 0) : (calc.ongoingAnnualTaxBenefit || 0);
      return `<tr><td>Year ${yr.year}</td><td>${fmt(yr.revenue)}</td><td>${fmt(yr.cashFlow)}</td><td>${fmt(cumCF)}</td><td>${fmt(taxBen)}</td><td>${fmt(yr.propertyValue)}</td><td>${fmt(yr.equity)}</td></tr>`;
    }).join("")}
  </table>` : ""}

  ${calc.irr && calc.irr.s1 ? `
  <div class="section-title">Internal Rate of Return (IRR)</div>
  <table>
    <tr><th>Hold</th><th>Cons. Pre-Tax</th><th>Cons. After-Tax</th><th>Base Pre-Tax</th><th>Base After-Tax</th><th>Strong Pre-Tax</th><th>Strong After-Tax</th></tr>
    <tr><td>3-Yr</td><td>${irrFmt(calc.irr.s1.y3)}</td><td>${irrFmt(calc.irr.s1.y3at)}</td><td>${irrFmt(calc.irr.s2.y3)}</td><td>${irrFmt(calc.irr.s2.y3at)}</td><td>${irrFmt(calc.irr.s3.y3)}</td><td>${irrFmt(calc.irr.s3.y3at)}</td></tr>
    <tr><td>5-Yr</td><td>${irrFmt(calc.irr.s1.y5)}</td><td>${irrFmt(calc.irr.s1.y5at)}</td><td>${irrFmt(calc.irr.s2.y5)}</td><td>${irrFmt(calc.irr.s2.y5at)}</td><td>${irrFmt(calc.irr.s3.y5)}</td><td>${irrFmt(calc.irr.s3.y5at)}</td></tr>
    <tr><td>7-Yr</td><td>${irrFmt(calc.irr.s1.y7)}</td><td>${irrFmt(calc.irr.s1.y7at)}</td><td>${irrFmt(calc.irr.s2.y7)}</td><td>${irrFmt(calc.irr.s2.y7at)}</td><td>${irrFmt(calc.irr.s3.y7)}</td><td>${irrFmt(calc.irr.s3.y7at)}</td></tr>
  </table>` : ""}

  ${calc.costSegEnabled ? `
  <div class="section-title">Tax Benefits</div>
  <div class="two-col">
    <div class="card">
      <h4>Year 1 — Cost Segregation & Bonus Depreciation</h4>
      <div class="card-row"><span class="label">Total Yr 1 Deduction</span><span class="value">${fmt(calc.totalFirstYearDeduction)}</span></div>
      <div class="card-row"><span class="label">Tax Savings @ ${form?.marginalTaxRate || 35}%</span><span class="value">${fmt(calc.taxSavings)}</span></div>
      <div class="card-row"><span class="label">Study Cost</span><span class="value">-${fmt(calc.costSegCost)}</span></div>
      <div class="card-row" style="border-top:2px solid #0891b2;padding-top:4px;"><span class="label" style="font-weight:700;">Net Tax Benefit</span><span class="value" style="color:#0891b2;font-size:12px;">${fmt(calc.netTaxBenefit)}</span></div>
      <div class="card-row"><span class="label">Effective Cash After Tax Benefit</span><span class="value">${fmt((calc.totalCashNeeded || 0) - (calc.netTaxBenefit || 0))}</span></div>
    </div>
    <div class="card">
      <h4>Ongoing Annual (Year 2+)</h4>
      <div class="card-row"><span class="label">Straight-Line Depreciation</span><span class="value">${fmt(calc.straightLineDepreciation)}/yr</span></div>
      <div class="card-row"><span class="label">Mortgage Interest Deduction</span><span class="value">${fmt(calc.year1MortgageInterest)}/yr</span></div>
      <div class="card-row" style="border-top:1px solid #ddd;padding-top:3px;"><span class="label" style="font-weight:600;">Annual Tax Savings</span><span class="value">${fmt(calc.ongoingAnnualTaxBenefit)}/yr</span></div>
    </div>
  </div>` : ""}

  ${form?.notes ? `<div class="section-title">Notes & Assumptions</div><div style="font-size: 9px; line-height: 1.5; color: #444; padding: 8px; background: #f8fafc; border-radius: 6px;">${form.notes.replace(/\n/g, "<br/>")}</div>` : ""}

  <div class="disclaimer">
    Disclaimer: This pro-forma is for informational purposes only and does not constitute financial advice. Projections are based on assumed inputs and comparable data. Actual results may vary materially. Revenue projections assume competent management, competitive pricing, and no material regulatory changes. Platform fee structures (Airbnb 15.5% host-only, Vrbo 8%) are current as of 2026 and subject to change. Tax benefit estimates require material participation and CPA verification. Consult licensed professionals before making investment decisions.
  </div>
</div>

${valueAddSection}
`;
}
