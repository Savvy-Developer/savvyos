import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface ReportData { form: any; calc: any; property: any; branding: any; title: string; aiSummary?: string; }

const fmt = (n: any) => { const v = parseFloat(n); if (isNaN(v)) return "$0"; return "$" + Math.round(v).toLocaleString("en-US"); };
const pct = (n: any) => { const v = parseFloat(n); if (isNaN(v)) return "0%"; return (v * 100).toFixed(1) + "%"; };
const irrFmt = (v: any) => { if (v == null || v === "N/A") return "N/A"; const n = parseFloat(v); if (isNaN(n)) return "N/A"; return (n * 100).toFixed(1) + "%"; };
const loanLabel = (lt: string) => ({ dscr: "DSCR Loan", conventional_investment: "Conventional Investment", conventional_second: "Conventional Second Home", other: "Other", cash: "All Cash" }[lt] || lt || "DSCR Loan");

async function toDataUrl(url: string): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result as string); reader.readAsDataURL(blob); });
  } catch { return url; } // fallback to URL if CORS fails
}

export async function generateInvestorReport(data: ReportData): Promise<void> {
  const { property, branding } = data;

  // Pre-fetch images as base64 to avoid CORS issues in iframe
  const [headshotB64, photoB64] = await Promise.all([
    toDataUrl(branding?.headshot || ""),
    toDataUrl(data.form?.propertyPhotoUrl || ""),
  ]);

  const htmlContent = buildReportHTML(data, headshotB64, photoB64);
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a2e;background:white;}</style></head><body>${htmlContent}</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:816px;height:8000px;border:none;";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) { document.body.removeChild(iframe); throw new Error("Could not access iframe"); }
  iframeDoc.open(); iframeDoc.write(fullHtml); iframeDoc.close();

  // Wait for base64 images to render
  await new Promise((r) => setTimeout(r, 1200));

  const pages = iframeDoc.querySelectorAll(".pdf-page");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(pages[i] as HTMLElement, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", foreignObjectRendering: false });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, Math.min((canvas.height * pageWidth) / canvas.width, pageHeight));
  }

  document.body.removeChild(iframe);
  pdf.save(`SavvyProforma_InvestorReport_${property?.address?.replace(/[^a-zA-Z0-9]/g, "_") || "property"}.pdf`);
}

function buildReportHTML(data: ReportData, headshotB64: string, photoB64: string): string {
  const { form, calc, property, branding, title } = data;
  const s1 = calc.s1 || {}, s2 = calc.s2 || {}, s3 = calc.s3 || {};
  const fiveYear: any[] = calc.fiveYear || [];
  const taxReturns = calc.taxReturns || {};
  const refi = calc.refi || {};
  const logoUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
  const pmi = parseFloat(form?.pmiRate || "0");
  const monthlyPmi = pmi > 0 ? (calc.loanAmount || 0) * (pmi / 100) / 12 : 0;
  const airbnbPct = form?.channelAirbnb || "70";
  const vrboPct = form?.channelVrbo || "20";
  const directPct = form?.channelDirect || "10";
  const pp = calc.pp || 0;

  // Charts
  const maxRev = Math.max(s1.grossRevenue || 1, s2.grossRevenue || 1, s3.grossRevenue || 1);
  const barChart = `<svg width="100%" height="130" viewBox="0 0 400 130"><rect x="30" y="${110-(s1.grossRevenue/maxRev)*90}" width="80" height="${(s1.grossRevenue/maxRev)*90}" fill="#94a3b8" rx="4"/><rect x="160" y="${110-(s2.grossRevenue/maxRev)*90}" width="80" height="${(s2.grossRevenue/maxRev)*90}" fill="#0891b2" rx="4"/><rect x="290" y="${110-(s3.grossRevenue/maxRev)*90}" width="80" height="${(s3.grossRevenue/maxRev)*90}" fill="#059669" rx="4"/><text x="70" y="125" text-anchor="middle" font-size="9" fill="#666">Conservative</text><text x="200" y="125" text-anchor="middle" font-size="9" fill="#666">Base Case</text><text x="330" y="125" text-anchor="middle" font-size="9" fill="#666">Strong</text><text x="70" y="${105-(s1.grossRevenue/maxRev)*90}" text-anchor="middle" font-size="9" font-weight="bold">${fmt(s1.grossRevenue)}</text><text x="200" y="${105-(s2.grossRevenue/maxRev)*90}" text-anchor="middle" font-size="9" font-weight="bold">${fmt(s2.grossRevenue)}</text><text x="330" y="${105-(s3.grossRevenue/maxRev)*90}" text-anchor="middle" font-size="9" font-weight="bold">${fmt(s3.grossRevenue)}</text></svg>`;

  // Donut
  const debt = calc.annualDebtService || 0, fixed = calc.fixedExpensesAnnual || 0, variable = calc.variableExpensesAnnual || 0, platFees = (s2.grossRevenue||0)*(calc.blendedFeeRate||0);
  const total = debt + fixed + variable + platFees || 1;
  const slices = [{p:debt/total,c:"#0891b2",l:"Debt Service"},{p:fixed/total,c:"#f59e0b",l:"Fixed Exp."},{p:variable/total,c:"#8b5cf6",l:"Variable Exp."},{p:platFees/total,c:"#ef4444",l:"Platform Fees"}];
  let off = 0;
  const arcs = slices.map(s => { const st=off; off+=s.p; const a1=st*2*Math.PI-Math.PI/2,a2=off*2*Math.PI-Math.PI/2; return `<path d="M60 60 L${60+45*Math.cos(a1)} ${60+45*Math.sin(a1)} A45 45 0 ${s.p>0.5?1:0} 1 ${60+45*Math.cos(a2)} ${60+45*Math.sin(a2)} Z" fill="${s.c}"/>`; }).join("");
  const donut = `<svg width="260" height="130" viewBox="0 0 260 130">${arcs}<circle cx="60" cy="60" r="22" fill="white"/><text x="60" y="63" text-anchor="middle" font-size="7" font-weight="bold">${fmt(total)}/yr</text>${slices.map((s,i)=>`<rect x="125" y="${12+i*28}" width="10" height="10" fill="${s.c}" rx="2"/><text x="140" y="${20+i*28}" font-size="8">${s.l} (${(s.p*100).toFixed(0)}%)</text><text x="140" y="${30+i*28}" font-size="7" fill="#666">${fmt(s.p*total)}/yr</text>`).join("")}</svg>`;

  // Line chart
  let lineChart = "";
  if (fiveYear.length > 0) {
    const maxV = Math.max(...fiveYear.map((y:any)=>y.propertyValue||0));
    const W=400,H=100;
    const pts = (k:string,c:string) => { const p=fiveYear.map((y:any,i:number)=>`${10+i*95},${H-10-((y[k]||0)/maxV)*(H-20)}`).join(" "); return `<polyline points="${p}" fill="none" stroke="${c}" stroke-width="2.5"/>`; };
    lineChart = `<svg width="100%" height="130" viewBox="0 0 ${W} ${H+20}">${pts("propertyValue","#0891b2")}${pts("equity","#059669")}${fiveYear.map((_:any,i:number)=>`<text x="${10+i*95}" y="${H+15}" text-anchor="middle" font-size="8" fill="#666">Yr ${i+1}</text>`).join("")}<rect x="${W-140}" y="2" width="135" height="35" fill="white" stroke="#eee" rx="3"/><line x1="${W-135}" y1="12" x2="${W-120}" y2="12" stroke="#0891b2" stroke-width="2"/><text x="${W-115}" y="15" font-size="7">Property Value</text><line x1="${W-135}" y1="27" x2="${W-120}" y2="27" stroke="#059669" stroke-width="2"/><text x="${W-115}" y="30" font-size="7">Total Equity</text></svg>`;
  }

  // Value-Add/Refi page
  let valueAddPage = "";
  if (calc.isValueAdd || calc.isCashoutRefi) {
    valueAddPage = `<div class="pdf-page"><div class="hdr"><img src="${logoUrl}" class="logo" crossorigin="anonymous"/><span class="hdr-sub">Value-Add & Refinance Analysis</span></div>
    ${calc.isValueAdd ? `<div class="stitle">Equity Creation Through Value-Add</div><div class="cols"><div class="card"><h4>Investment Basis</h4><div class="row"><span class="lbl">Purchase Price</span><span class="val">${fmt(pp)}</span></div><div class="row"><span class="lbl">Renovation Budget</span><span class="val">${fmt(calc.renovation)}</span></div><div class="row brd"><span class="lbl bold">All-In Cost</span><span class="val">${fmt(pp + (calc.renovation||0))}</span></div></div><div class="card hl"><h4>After Repair Value</h4><div class="row"><span class="lbl">ARV</span><span class="val big teal">${fmt(calc.arv)}</span></div><div class="row"><span class="lbl">Forced Equity (ARV - Purchase)</span><span class="val">${fmt(calc.forcedEquity)}</span></div><div class="row"><span class="lbl">Net Equity Created (ARV - All-In)</span><span class="val grn">${fmt(calc.equityCreatedByReno)}</span></div></div></div>` : ""}
    ${calc.isCashoutRefi ? `<div class="stitle">Cash-Out Refinance</div><div class="cols"><div class="card"><h4>Refi Terms</h4><div class="row"><span class="lbl">Appraised Value</span><span class="val">${fmt(refi.refiAppraised)}</span></div><div class="row"><span class="lbl">LTV</span><span class="val">${form?.refiLTV || 75}%</span></div><div class="row"><span class="lbl">New Loan Amount</span><span class="val">${fmt(refi.refiNewLoanAmount)}</span></div><div class="row"><span class="lbl">Original Loan Payoff</span><span class="val">${fmt(calc.loanAmount)}</span></div><div class="row brd"><span class="lbl bold grn">Cash Out</span><span class="val big grn">${fmt(refi.refiCashOut)}</span></div></div><div class="card"><h4>Post-Refi Returns (Base Case)</h4><div class="row"><span class="lbl">New Monthly Payment</span><span class="val">${fmt(refi.refiMonthlyMortgage)}</span></div><div class="row"><span class="lbl">Cash Left in Deal</span><span class="val">${fmt(refi.cashInDeal)}</span></div><div class="row"><span class="lbl">Post-Refi Annual Cash Flow</span><span class="val">${fmt(refi.s2?.cashFlow)}</span></div><div class="row brd"><span class="lbl bold">Post-Refi CoC Return</span><span class="val big teal">${refi.cashInDeal > 0 ? pct(refi.s2?.cashOnCash) : "Infinite"}</span></div></div></div>
    <div style="margin-top:12px;padding:10px;background:#f0fdfa;border-radius:8px;border:1px solid #99f6e4;"><div style="font-size:10px;font-weight:700;color:#0e7490;margin-bottom:6px;">Holding Period Timeline</div><div style="display:flex;gap:8px;align-items:center;"><div style="flex:1;background:#e0f2fe;border-radius:6px;padding:8px;text-align:center;font-size:9px;"><b>Months 1–${form?.seasoningPeriod || 6}</b><br/>Original: ${fmt(calc.monthlyMortgage)}/mo</div><div style="font-size:14px;color:#0891b2;">→</div><div style="flex:1;background:#ecfeff;border-radius:6px;padding:8px;text-align:center;font-size:9px;"><b>Month ${parseInt(form?.seasoningPeriod||"6")+1}+</b><br/>Refi: ${fmt(refi.refiMonthlyMortgage)}/mo</div></div></div>` : ""}
    </div>`;
  }

  return `<style>
.pdf-page{width:816px;min-height:1056px;padding:34px 38px;background:white;page-break-after:always;}
.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:3px solid #0891b2;padding-bottom:10px;}
.logo{height:30px;} .hdr-sub{font-size:9px;color:#666;}
.agent{display:flex;align-items:center;gap:10px;text-align:right;}
.agent img{width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid #0891b2;}
.agent-name{font-size:12px;font-weight:700;} .agent-sub{font-size:9px;color:#666;}
.ptitle{font-size:18px;font-weight:800;color:#0e7490;margin-bottom:2px;}
.paddr{font-size:10px;color:#555;margin-bottom:10px;}
.pphoto{width:100%;max-height:170px;object-fit:cover;border-radius:8px;margin-bottom:14px;}
.mgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;}
.mc{background:#f0fdfa;border:1px solid #99f6e4;border-radius:7px;padding:9px 6px;text-align:center;}
.mc.hi{background:#0891b2;border-color:#0891b2;color:white;} .mc.hi .ml{color:rgba(255,255,255,.85);}
.ml{font-size:7.5px;font-weight:600;text-transform:uppercase;color:#666;margin-bottom:2px;}
.mv{font-size:14px;font-weight:800;}
.aibox{background:linear-gradient(135deg,#f0fdfa,#e0f2fe);border:2px solid #0891b2;border-radius:10px;padding:14px;margin-bottom:12px;}
.aibox h3{font-size:12px;color:#0e7490;margin-bottom:5px;} .aibox p{font-size:9.5px;line-height:1.55;color:#333;}
.stitle{font-size:12px;font-weight:700;color:#0e7490;margin:14px 0 7px;border-bottom:2px solid #e0f2fe;padding-bottom:3px;}
table{width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:10px;}
th{background:#155e75;color:white;padding:5px 4px;text-align:left;font-weight:600;font-size:7.5px;}
td{padding:4px;border-bottom:1px solid #e5e7eb;} tr:nth-child(even){background:#f8fafc;}
.hlr{background:#ecfeff!important;font-weight:600;}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px;}
.card{border:1px solid #e5e7eb;border-radius:7px;padding:10px;} .card.hl{background:#ecfeff;}
.card h4{font-size:10px;font-weight:700;color:#0e7490;margin-bottom:5px;}
.row{display:flex;justify-content:space-between;font-size:8.5px;padding:2px 0;border-bottom:1px solid #f3f4f6;}
.row:last-child{border-bottom:none;} .lbl{color:#666;} .val{font-weight:600;}
.brd{border-top:2px solid #0891b2;padding-top:4px;margin-top:3px;}
.bold{font-weight:700;} .big{font-size:12px;} .teal{color:#0891b2;} .grn{color:#059669;}
.cbox{background:#f8fafc;border:1px solid #e5e7eb;border-radius:7px;padding:10px;margin-bottom:10px;}
.cbox-title{font-size:9px;font-weight:700;color:#333;margin-bottom:5px;}
.disc{font-size:7px;color:#999;line-height:1.4;margin-top:14px;padding-top:6px;border-top:1px solid #eee;}
a{color:#0891b2;}
</style>

<!-- PAGE 1 -->
<div class="pdf-page">
  <div class="hdr">
    <img src="${logoUrl}" class="logo" crossorigin="anonymous"/>
    <div class="agent">
      <div><div class="agent-name">${branding?.name||""}</div><div class="agent-sub">${branding?.email||""} | ${branding?.phone||""}</div>${branding?.market?`<div class="agent-sub">${branding.market}</div>`:""}</div>
      ${headshotB64 ? `<img src="${headshotB64}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid #0891b2;"/>` : ""}
    </div>
  </div>
  <div class="ptitle">${title||"STR Investment Analysis"}</div>
  <div class="paddr">${property?.address||""}, ${property?.city||""} ${property?.state||""} ${property?.zip||""} | ${property?.beds||0} BD / ${property?.baths||0} BA / ${property?.sqft||0} sqft</div>
  ${photoB64 ? `<img src="${photoB64}" class="pphoto"/>` : ""}
  <div class="mgrid">
    <div class="mc"><div class="ml">Total Cash Needed</div><div class="mv">${fmt(calc.totalCashNeeded)}</div></div>
    <div class="mc"><div class="ml">Monthly Mortgage${monthlyPmi>0?" + PMI":""}</div><div class="mv">${fmt((calc.monthlyMortgage||0)+monthlyPmi)}</div></div>
    <div class="mc hi"><div class="ml">Base Case Cash Flow</div><div class="mv">${fmt(s2.cashFlow)}</div></div>
    <div class="mc hi"><div class="ml">Cash-on-Cash Return</div><div class="mv">${pct(s2.cashOnCash)}</div></div>
    <div class="mc"><div class="ml">Cap Rate</div><div class="mv">${pct(s2.capRate)}</div></div>
    <div class="mc"><div class="ml">DSCR</div><div class="mv">${(s2.dscr||0).toFixed(2)}x</div></div>
    <div class="mc"><div class="ml">Break-Even Occ.</div><div class="mv">${pct(s2.breakEvenOcc)}</div></div>
    <div class="mc"><div class="ml">Net Tax Benefit (Yr 1)</div><div class="mv">${fmt(calc.netTaxBenefit)}</div></div>
  </div>
  <div class="aibox"><h3>Investment Analysis</h3><p>${data.aiSummary||`This ${property?.beds||0}-bedroom property in ${property?.city||"the area"} presents a compelling STR investment at ${fmt(pp)} with ${fmt(calc.totalCashNeeded)} total cash needed. Base case projects ${fmt(s2.cashFlow)} annual cash flow (${pct(s2.cashOnCash)} CoC) with ${(s2.dscr||0).toFixed(2)}x DSCR. Break-even occupancy of ${pct(s2.breakEvenOcc)} indicates manageable risk.${calc.netTaxBenefit>0?` Year 1 tax benefits of ${fmt(calc.netTaxBenefit)} bring effective CoC to ${pct(taxReturns.s2?.year1CoCWithTax)}.`:""}`}</p></div>
  ${form?.propertyLink?`<div style="font-size:9px;"><a href="${form.propertyLink}">View Listing on Zillow →</a></div>`:""}
</div>

<!-- PAGE 2 -->
<div class="pdf-page">
  <div class="hdr"><img src="${logoUrl}" class="logo" crossorigin="anonymous"/><span class="hdr-sub">Revenue Scenarios & Financial Details</span></div>
  <div class="cbox"><div class="cbox-title">Gross Revenue by Scenario</div>${barChart}</div>
  <div class="stitle">Scenario Comparison</div>
  <table>
    <tr><th>Metric</th><th>Conservative</th><th>Base Case</th><th>Strong Execution</th></tr>
    <tr><td>ADR</td><td>${fmt(s1.adr)}</td><td>${fmt(s2.adr)}</td><td>${fmt(s3.adr)}</td></tr>
    <tr><td>Occupancy</td><td>${pct(s1.occ)}</td><td>${pct(s2.occ)}</td><td>${pct(s3.occ)}</td></tr>
    <tr><td>Sold Nights</td><td>${Math.round(s1.soldNights||0)}</td><td>${Math.round(s2.soldNights||0)}</td><td>${Math.round(s3.soldNights||0)}</td></tr>
    <tr><td>Gross Revenue</td><td>${fmt(s1.grossRevenue)}</td><td>${fmt(s2.grossRevenue)}</td><td>${fmt(s3.grossRevenue)}</td></tr>
    <tr><td>Platform Fees (${((calc.blendedFeeRate||0)*100).toFixed(1)}%)</td><td>${fmt((s1.grossRevenue||0)*(calc.blendedFeeRate||0))}</td><td>${fmt((s2.grossRevenue||0)*(calc.blendedFeeRate||0))}</td><td>${fmt((s3.grossRevenue||0)*(calc.blendedFeeRate||0))}</td></tr>
    <tr><td>Net Revenue</td><td>${fmt(s1.netRevenue)}</td><td>${fmt(s2.netRevenue)}</td><td>${fmt(s3.netRevenue)}</td></tr>
    <tr><td>NOI</td><td>${fmt(s1.noi)}</td><td>${fmt(s2.noi)}</td><td>${fmt(s3.noi)}</td></tr>
    <tr class="hlr"><td>Annual Cash Flow</td><td>${fmt(s1.cashFlow)}</td><td>${fmt(s2.cashFlow)}</td><td>${fmt(s3.cashFlow)}</td></tr>
    <tr class="hlr"><td>Cash-on-Cash Return</td><td>${pct(s1.cashOnCash)}</td><td>${pct(s2.cashOnCash)}</td><td>${pct(s3.cashOnCash)}</td></tr>
    <tr><td>Cap Rate</td><td>${pct(s1.capRate)}</td><td>${pct(s2.capRate)}</td><td>${pct(s3.capRate)}</td></tr>
    <tr><td>DSCR</td><td>${(s1.dscr||0).toFixed(2)}x</td><td>${(s2.dscr||0).toFixed(2)}x</td><td>${(s3.dscr||0).toFixed(2)}x</td></tr>
    <tr class="hlr"><td>CoC w/ Tax Benefits (Yr 1)</td><td>${pct(taxReturns.s1?.year1CoCWithTax)}</td><td>${pct(taxReturns.s2?.year1CoCWithTax)}</td><td>${pct(taxReturns.s3?.year1CoCWithTax)}</td></tr>
    <tr class="hlr"><td>CoC w/ Tax Benefits (Yr 2+)</td><td>${pct(taxReturns.s1?.ongoingCoCWithTax)}</td><td>${pct(taxReturns.s2?.ongoingCoCWithTax)}</td><td>${pct(taxReturns.s3?.ongoingCoCWithTax)}</td></tr>
  </table>
  <div class="cols">
    <div class="card"><h4>Acquisition & Cash to Close</h4>
      <div class="row"><span class="lbl">Purchase Price</span><span class="val">${fmt(pp)}</span></div>
      <div class="row"><span class="lbl">Down Payment (${form?.downPaymentPct||20}%)</span><span class="val">${fmt(calc.downPayment)}</span></div>
      <div class="row"><span class="lbl">Closing Costs</span><span class="val">${fmt(calc.closingCosts)}</span></div>
      <div class="row"><span class="lbl">Furnishing</span><span class="val">${fmt(calc.furnishing)}</span></div>
      <div class="row"><span class="lbl">Renovation</span><span class="val">${fmt(calc.renovation)}</span></div>
      ${calc.sellerCredit?`<div class="row"><span class="lbl teal">Seller Credit</span><span class="val teal">-${fmt(calc.sellerCredit)}</span></div>`:""}
      <div class="row brd"><span class="lbl bold">Total Cash Needed</span><span class="val big">${fmt(calc.totalCashNeeded)}</span></div>
    </div>
    <div class="card"><h4>Loan Details</h4>
      <div class="row"><span class="lbl">Loan Type</span><span class="val">${loanLabel(form?.loanType)}</span></div>
      <div class="row"><span class="lbl">Loan Amount</span><span class="val">${fmt(calc.loanAmount)}</span></div>
      <div class="row"><span class="lbl">Interest Rate</span><span class="val">${form?.interestRate||7}%</span></div>
      <div class="row"><span class="lbl">Loan Term</span><span class="val">${form?.loanTermYears||30} years</span></div>
      <div class="row"><span class="lbl">Monthly P&I</span><span class="val">${fmt(calc.monthlyMortgage)}</span></div>
      ${monthlyPmi>0?`<div class="row"><span class="lbl">PMI (${pmi}%)</span><span class="val">${fmt(monthlyPmi)}/mo</span></div>`:""}
      <div class="row"><span class="lbl">Annual Debt Service</span><span class="val">${fmt(calc.annualDebtService)}</span></div>
      <div class="row" style="border-top:1px solid #ddd;padding-top:3px;"><span class="lbl">Blended Platform Fee</span><span class="val">${((calc.blendedFeeRate||0)*100).toFixed(1)}%</span></div>
      <div class="row"><span class="lbl" style="font-size:7.5px;color:#999;">Airbnb ${airbnbPct}% | Vrbo ${vrboPct}% | Direct ${directPct}%</span><span class="val"></span></div>
    </div>
  </div>
</div>

<!-- PAGE 3 -->
<div class="pdf-page">
  <div class="hdr"><img src="${logoUrl}" class="logo" crossorigin="anonymous"/><span class="hdr-sub">Projections, Returns & Tax Benefits</span></div>
  <div class="cols" style="margin-bottom:10px;">
    <div class="cbox"><div class="cbox-title">5-Year Growth</div>${lineChart||'<div style="font-size:8px;color:#999;">No projection data</div>'}</div>
    <div class="cbox"><div class="cbox-title">Expense Breakdown (Base Case)</div>${donut}</div>
  </div>
  ${fiveYear.length>0?`<div class="stitle">5-Year Wealth Building (Base Case)</div><table><tr><th>Year</th><th>Revenue</th><th>Cash Flow</th><th>Cumul. CF</th><th>Tax Benefit</th><th>Debt Paydown</th><th>Appreciation</th><th>Prop. Value</th><th>Equity</th></tr>${fiveYear.map((yr:any,i:number)=>{const cumCF=fiveYear.slice(0,i+1).reduce((s:number,y:any)=>s+(y.cashFlow||0),0);const taxB=i===0?(calc.netTaxBenefit||0):(calc.ongoingAnnualTaxBenefit||0);const appreciation=(yr.propertyValue||0)-pp;return `<tr><td>Yr ${yr.year}</td><td>${fmt(yr.revenue)}</td><td>${fmt(yr.cashFlow)}</td><td>${fmt(cumCF)}</td><td>${fmt(taxB)}</td><td>${fmt(yr.principalPaid)}</td><td>${fmt(appreciation)}</td><td>${fmt(yr.propertyValue)}</td><td>${fmt(yr.equity)}</td></tr>`;}).join("")}</table>`:""} 
  ${calc.irr&&calc.irr.s1?`<div class="stitle">Internal Rate of Return (IRR)</div><table><tr><th>Hold</th><th>Cons. Pre-Tax</th><th>Cons. After-Tax</th><th>Base Pre-Tax</th><th>Base After-Tax</th><th>Strong Pre-Tax</th><th>Strong After-Tax</th></tr><tr><td>3-Yr</td><td>${irrFmt(calc.irr.s1.y3)}</td><td>${irrFmt(calc.irr.s1.y3at)}</td><td>${irrFmt(calc.irr.s2.y3)}</td><td>${irrFmt(calc.irr.s2.y3at)}</td><td>${irrFmt(calc.irr.s3.y3)}</td><td>${irrFmt(calc.irr.s3.y3at)}</td></tr><tr><td>5-Yr</td><td>${irrFmt(calc.irr.s1.y5)}</td><td>${irrFmt(calc.irr.s1.y5at)}</td><td>${irrFmt(calc.irr.s2.y5)}</td><td>${irrFmt(calc.irr.s2.y5at)}</td><td>${irrFmt(calc.irr.s3.y5)}</td><td>${irrFmt(calc.irr.s3.y5at)}</td></tr><tr><td>7-Yr</td><td>${irrFmt(calc.irr.s1.y7)}</td><td>${irrFmt(calc.irr.s1.y7at)}</td><td>${irrFmt(calc.irr.s2.y7)}</td><td>${irrFmt(calc.irr.s2.y7at)}</td><td>${irrFmt(calc.irr.s3.y7)}</td><td>${irrFmt(calc.irr.s3.y7at)}</td></tr></table>`:""} 
  ${calc.costSegEnabled?`<div class="stitle">Tax Benefits</div><div class="cols"><div class="card"><h4>Year 1 — Cost Segregation</h4><div class="row"><span class="lbl">Total Yr 1 Deduction</span><span class="val">${fmt(calc.totalFirstYearDeduction)}</span></div><div class="row"><span class="lbl">Tax Savings @ ${form?.marginalTaxRate||35}%</span><span class="val">${fmt(calc.taxSavings)}</span></div><div class="row"><span class="lbl">Study Cost</span><span class="val">-${fmt(calc.costSegCost)}</span></div><div class="row brd"><span class="lbl bold">Net Tax Benefit</span><span class="val big teal">${fmt(calc.netTaxBenefit)}</span></div><div class="row"><span class="lbl">Effective Cash After Tax</span><span class="val">${fmt((calc.totalCashNeeded||0)-(calc.netTaxBenefit||0))}</span></div></div><div class="card"><h4>Ongoing Annual (Year 2+)</h4><div class="row"><span class="lbl">Straight-Line Depreciation</span><span class="val">${fmt(calc.straightLineDepreciation)}/yr</span></div><div class="row"><span class="lbl">Mortgage Interest Deduction</span><span class="val">${fmt(calc.year1MortgageInterest)}/yr</span></div><div class="row brd"><span class="lbl bold">Annual Tax Savings</span><span class="val">${fmt(calc.ongoingAnnualTaxBenefit)}/yr</span></div></div></div>`:""} 
  ${form?.notes?`<div class="stitle">Notes & Assumptions</div><div style="font-size:9px;line-height:1.5;color:#444;padding:8px;background:#f8fafc;border-radius:6px;">${form.notes.replace(/\n/g,"<br/>")}</div>`:""}
  <div class="disc">Disclaimer: This pro-forma is for informational purposes only and does not constitute financial advice. Projections are based on assumed inputs and comparable data. Actual results may vary materially. Platform fee structures (Airbnb 15.5% host-only, Vrbo 8%) are current as of 2026. Tax benefit estimates require material participation and CPA verification. Consult licensed professionals before making investment decisions.</div>
</div>

${valueAddPage}
`;
}
