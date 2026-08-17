import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface CoBrand {
  name: string;
  logoUrl: string;
}

interface ReportData {
  form: any;
  calc: any;
  property: any;
  branding: any;
  title: string;
  aiSummary?: string;
  coBrand?: CoBrand;
}

const numeric = (value: unknown): number => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: unknown): string => `$${Math.round(numeric(value)).toLocaleString("en-US")}`;
const fmtCompact = (value: unknown): string => {
  const amount = numeric(value);
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}m`;
  if (Math.abs(amount) >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return fmt(amount);
};
const pct = (value: unknown): string => `${(numeric(value) * 100).toFixed(1)}%`;
const irrFmt = (value: unknown): string => value == null || value === "N/A" ? "N/A" : pct(value);
const loanLabel = (loanType: string) => ({
  dscr: "DSCR Loan",
  conventional_investment: "Conventional Investment",
  conventional_second: "Conventional Second Home",
  other: "Other Financing",
  cash: "All Cash",
}[loanType] || loanType || "DSCR Loan");

const escapeHtml = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const safeUrl = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString();
  } catch {
    return "";
  }
};

const annualFromMonthly = (value: unknown): number => numeric(value) * 12;

async function toDataUrl(url: string): Promise<string> {
  if (!url) return "";
  try {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}_cb=${Date.now()}`, { mode: "cors", cache: "no-store", credentials: "include" });
    if (!response.ok) return "";
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

async function toReportImageDataUrl(url: string): Promise<string> {
  const directImage = await toDataUrl(url);
  if (directImage) return directImage;

  const sourceUrl = safeUrl(url);
  if (!sourceUrl) return "";
  return toDataUrl(`/api/proforma/report-image?url=${encodeURIComponent(sourceUrl)}`);
}

export async function generateInvestorReport(data: ReportData): Promise<void> {
  const { property, branding } = data;
  const reportComps = Array.isArray(data.form?.comps) ? data.form.comps : [];
  const [headshotB64, photoB64, coBrandLogoB64, ...compPhotoB64] = await Promise.all([
    toDataUrl(branding?.headshot || ""),
    toReportImageDataUrl(data.form?.propertyPhotoUrl || ""),
    toDataUrl(data.coBrand?.logoUrl || ""),
    ...reportComps.map((comp: any) => toReportImageDataUrl(comp?.photoUrl || "")),
  ]);
  const reportData: ReportData = {
    ...data,
    form: {
      ...(data.form || {}),
      comps: reportComps.map((comp: any, index: number) => ({ ...comp, reportPhotoDataUrl: compPhotoB64[index] || "" })),
    },
  };

  const htmlContent = buildReportHTML(reportData, headshotB64, photoB64, coBrandLogoB64);
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#172033;background:#fff;}</style></head><body>${htmlContent}</body></html>`;
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:816px;height:8000px;border:none;";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("Could not access report renderer");
  }

  iframeDoc.open();
  iframeDoc.write(fullHtml);
  iframeDoc.close();
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const pages = iframeDoc.querySelectorAll<HTMLElement>(".pdf-page");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let index = 0; index < pages.length; index += 1) {
    const pageElement = pages[index];
    const pageRect = pageElement.getBoundingClientRect();
    const links = Array.from(pageElement.querySelectorAll<HTMLAnchorElement>("a[data-pdf-link]")).map((anchor) => {
      const linkRect = anchor.getBoundingClientRect();
      return {
        href: anchor.href,
        x: (linkRect.left - pageRect.left) * (pageWidth / pageRect.width),
        y: (linkRect.top - pageRect.top) * (pageHeight / pageRect.height),
        width: linkRect.width * (pageWidth / pageRect.width),
        height: linkRect.height * (pageHeight / pageRect.height),
      };
    }).filter((link) => /^https?:\/\//i.test(link.href));

    if (index > 0) pdf.addPage();
    const canvas = await html2canvas(pageElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      foreignObjectRendering: false,
    });
    const imageData = canvas.toDataURL("image/jpeg", 0.94);
    pdf.addImage(imageData, "JPEG", 0, 0, pageWidth, Math.min((canvas.height * pageWidth) / canvas.width, pageHeight));
    links.forEach((link) => pdf.link(link.x, link.y, link.width, link.height, { url: link.href }));
  }

  document.body.removeChild(iframe);
  pdf.save(`SavvyProforma_InvestorReport_${property?.address?.replace(/[^a-zA-Z0-9]/g, "_") || "property"}.pdf`);
}

export function buildReportHTML(data: ReportData, headshotB64: string, photoB64: string, coBrandLogoB64: string): string {
  const { title, coBrand } = data;
  const form = data.form || {};
  const calc = data.calc || {};
  const property = data.property || {};
  const branding = data.branding || {};
  const s1 = calc.s1 || {};
  const s2 = calc.s2 || {};
  const s3 = calc.s3 || {};
  const fiveYear: any[] = Array.isArray(calc.fiveYear) ? calc.fiveYear : [];
  const taxReturns = calc.taxReturns || {};
  const refi = calc.refi || {};
  const logoUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
  const purchasePrice = numeric(calc.pp);
  const propertyLink = safeUrl(form.propertyLink);
  const airbnbPct = form.channelAirbnbPct || "60";
  const vrboPct = form.channelVrboPct || "25";
  const directPct = form.channelDirectPct || "15";
  const brandLockup = `<div class="brand-lockup"><img src="${logoUrl}" class="logo" crossorigin="anonymous"/>${coBrandLogoB64 ? `<span class="brand-divider"></span><img src="${coBrandLogoB64}" class="co-brand-logo" alt="${escapeHtml(coBrand?.name || "Co-brand")}"/>` : ""}</div>`;

  const fixedExpenses = [
    ["Utilities", annualFromMonthly(form.expUtilities)],
    ["STR insurance", numeric(form.expInsuranceAnnual)],
    ["Property taxes", numeric(form.expPropertyTaxAnnual)],
    ["HOA", annualFromMonthly(form.expHOA)],
    ["Internet & cable", annualFromMonthly(form.expInternet)],
    ["Landscaping", annualFromMonthly(form.expLandscaping)],
    ["Pest control", annualFromMonthly(form.expPestControl)],
    ["Hot tub / pool", annualFromMonthly(form.expHotTubPool)],
    ["Software", annualFromMonthly(form.expSoftware)],
    ["Trash service", annualFromMonthly(form.expTrash)],
    ["Smart locks & security", annualFromMonthly(form.expSmartLocks)],
    ["Accounting", annualFromMonthly(form.expAccounting)],
    ["Permits & licenses", annualFromMonthly(form.expPermits)],
    ...(Array.isArray(form.customFixedExpenses) ? form.customFixedExpenses.map((expense: any) => [expense.label || "Custom fixed expense", annualFromMonthly(expense.amount)]) : []),
  ].filter(([, value]) => numeric(value) > 0) as Array<[string, number]>;

  const variableExpenses = [
    ["Platform fees", numeric(s2.platformFees)],
    ["Property management", numeric(s2.mgmtExpense)],
    ["Cleaning", numeric(s2.cleaningExpense)],
    ["CapEx reserve", numeric(s2.capExReserve)],
    ...(Array.isArray(form.customVariableExpenses) ? form.customVariableExpenses.map((expense: any) => [expense.label || "Custom variable expense", annualFromMonthly(expense.amount)]) : []),
  ].filter(([, value]) => numeric(value) > 0) as Array<[string, number]>;

  const expenseRows = (entries: Array<[string, number]>) => entries.length
    ? entries.map(([label, value]) => `<div class="expense-row"><span>${escapeHtml(label)}</span><strong>${fmt(value)}/yr</strong></div>`).join("")
    : `<div class="empty-state">No expense inputs have been provided.</div>`;

  const barData = [
    { label: "Conservative", grossRevenue: numeric(s1.grossRevenue), cashFlow: numeric(s1.cashFlow), x: 145 },
    { label: "Base Case", grossRevenue: numeric(s2.grossRevenue), cashFlow: numeric(s2.cashFlow), x: 360 },
    { label: "Strong", grossRevenue: numeric(s3.grossRevenue), cashFlow: numeric(s3.cashFlow), x: 575 },
  ];
  const maxBarValue = Math.max(...barData.flatMap((item) => [item.grossRevenue, item.cashFlow]), 1);
  const minBarValue = Math.min(...barData.map((item) => item.cashFlow), 0);
  const barRange = Math.max(maxBarValue - minBarValue, 1);
  const chartTop = 32;
  const chartBottom = 165;
  const chartHeight = chartBottom - chartTop;
  const zeroY = chartBottom - ((0 - minBarValue) / barRange) * chartHeight;
  const barY = (value: number) => chartBottom - ((value - minBarValue) / barRange) * chartHeight;
  const barChart = `<svg class="revenue-chart" viewBox="0 0 720 215" role="img" aria-label="Gross annual revenue and annual cash flow by scenario"><line x1="72" y1="${zeroY}" x2="662" y2="${zeroY}" stroke="#94a3b8" stroke-width="2"/>${barData.map((item) => {
    const grossY = barY(item.grossRevenue);
    const cashY = barY(item.cashFlow);
    const grossHeight = Math.max(2, zeroY - grossY);
    const cashHeight = Math.max(2, Math.abs(zeroY - cashY));
    const cashRectY = item.cashFlow >= 0 ? cashY : zeroY;
    const cashTextY = item.cashFlow >= 0 ? cashY - 9 : cashRectY + cashHeight + 15;
    return `<text x="${item.x - 29}" y="${grossY - 9}" text-anchor="middle" font-size="13" font-weight="700" fill="#172033">${fmtCompact(item.grossRevenue)}</text><rect x="${item.x - 53}" y="${grossY}" width="48" height="${grossHeight}" rx="6" fill="#0891b2"/><text x="${item.x + 29}" y="${cashTextY}" text-anchor="middle" font-size="13" font-weight="700" fill="#172033">${fmtCompact(item.cashFlow)}</text><rect x="${item.x + 5}" y="${cashRectY}" width="48" height="${cashHeight}" rx="6" fill="${item.cashFlow >= 0 ? "#059669" : "#dc2626"}"/><text x="${item.x}" y="194" text-anchor="middle" font-size="14" font-weight="700" fill="#475569">${item.label}</text>`;
  }).join("")}<rect x="72" y="12" width="12" height="12" rx="2" fill="#0891b2"/><text x="91" y="23" font-size="12" font-weight="600" fill="#475569">Gross Revenue</text><rect x="196" y="12" width="12" height="12" rx="2" fill="#059669"/><text x="215" y="23" font-size="12" font-weight="600" fill="#475569">Annual Cash Flow</text></svg>`;

  const debtService = numeric(calc.annualDebtService);
  const fixedTotal = numeric(calc.fixedExpensesAnnual);
  const variableTotal = numeric(s2.totalVariableAnnual);
  const platformFees = numeric(s2.platformFees);
  const expenseTotal = Math.max(debtService + fixedTotal + variableTotal + platformFees, 1);
  const donutSlices = [
    { value: debtService, color: "#0891b2", label: "Debt service" },
    { value: fixedTotal, color: "#f59e0b", label: "Fixed expenses" },
    { value: variableTotal, color: "#8b5cf6", label: "Variable expenses" },
    { value: platformFees, color: "#ef4444", label: "Platform fees" },
  ];
  let donutOffset = 0;
  const donutArcs = donutSlices.map((slice) => {
    const start = donutOffset;
    donutOffset += slice.value / expenseTotal;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle = donutOffset * 2 * Math.PI - Math.PI / 2;
    const x1 = 70 + 52 * Math.cos(startAngle);
    const y1 = 70 + 52 * Math.sin(startAngle);
    const x2 = 70 + 52 * Math.cos(endAngle);
    const y2 = 70 + 52 * Math.sin(endAngle);
    return `<path d="M70 70 L${x1} ${y1} A52 52 0 ${slice.value / expenseTotal > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z" fill="${slice.color}"/>`;
  }).join("");
  const expenseDonut = `<svg class="expense-donut" viewBox="0 0 410 150" role="img" aria-label="Base case annual expense mix">${donutArcs}<circle cx="70" cy="70" r="27" fill="#fff"/><text x="70" y="67" text-anchor="middle" font-size="11" font-weight="700" fill="#172033">${fmtCompact(expenseTotal)}</text><text x="70" y="80" text-anchor="middle" font-size="9" fill="#64748b">annual</text>${donutSlices.map((slice, index) => `<rect x="155" y="${16 + index * 31}" width="13" height="13" rx="3" fill="${slice.color}"/><text x="178" y="${27 + index * 31}" font-size="13" font-weight="600" fill="#334155">${slice.label}</text><text x="382" y="${27 + index * 31}" text-anchor="end" font-size="13" font-weight="700" fill="#172033">${fmt(slice.value)}</text>`).join("")}</svg>`;

  let growthChart = `<div class="empty-state">No five-year projection data is available.</div>`;
  let growthCards = "";
  if (fiveYear.length > 0) {
    const values = fiveYear.flatMap((year: any) => [numeric(year.propertyValue), numeric(year.equity)]);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const valueRange = Math.max(maxValue - minValue, maxValue * 0.15, 1);
    const chartLeft = 66;
    const chartTop = 24;
    const chartWidth = 642;
    const chartHeight = 140;
    const position = (value: unknown, index: number) => ({
      x: chartLeft + (index * chartWidth) / Math.max(fiveYear.length - 1, 1),
      y: chartTop + chartHeight - ((numeric(value) - minValue) / valueRange) * chartHeight,
    });
    const path = (key: string) => fiveYear.map((year: any, index: number) => {
      const point = position(year[key], index);
      return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }).join(" ");
    growthChart = `<svg class="growth-chart" viewBox="0 0 775 225" role="img" aria-label="Five year property value and equity projection"><line x1="${chartLeft}" y1="${chartTop + chartHeight}" x2="${chartLeft + chartWidth}" y2="${chartTop + chartHeight}" stroke="#cbd5e1" stroke-width="2"/><line x1="${chartLeft}" y1="${chartTop + chartHeight / 2}" x2="${chartLeft + chartWidth}" y2="${chartTop + chartHeight / 2}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 4"/><text x="8" y="${chartTop + 6}" font-size="12" fill="#64748b">${fmtCompact(maxValue)}</text><text x="8" y="${chartTop + chartHeight / 2 + 5}" font-size="12" fill="#64748b">${fmtCompact(minValue + valueRange / 2)}</text><path d="${path("propertyValue")}" fill="none" stroke="#0891b2" stroke-width="4" stroke-linecap="round"/><path d="${path("equity")}" fill="none" stroke="#059669" stroke-width="4" stroke-linecap="round"/>${fiveYear.map((year: any, index: number) => {
      const propertyPoint = position(year.propertyValue, index);
      const equityPoint = position(year.equity, index);
      return `<circle cx="${propertyPoint.x}" cy="${propertyPoint.y}" r="5" fill="#0891b2"/><circle cx="${equityPoint.x}" cy="${equityPoint.y}" r="5" fill="#059669"/><text x="${propertyPoint.x}" y="${Math.max(15, propertyPoint.y - 11)}" text-anchor="middle" font-size="11" font-weight="700" fill="#036b84">${fmtCompact(year.propertyValue)}</text><text x="${equityPoint.x}" y="${Math.min(188, equityPoint.y + 17)}" text-anchor="middle" font-size="11" font-weight="700" fill="#047857">${fmtCompact(year.equity)}</text><text x="${propertyPoint.x}" y="193" text-anchor="middle" font-size="13" font-weight="600" fill="#475569">Year ${escapeHtml(year.year || index + 1)}</text>`;
    }).join("")}<line x1="520" y1="211" x2="544" y2="211" stroke="#0891b2" stroke-width="4"/><text x="551" y="215" font-size="12" fill="#475569">Property value</text><line x1="655" y1="211" x2="679" y2="211" stroke="#059669" stroke-width="4"/><text x="686" y="215" font-size="12" fill="#475569">Equity</text></svg>`;
    growthCards = `<div class="year-grid">${fiveYear.map((year: any, index: number) => `<div class="year-card"><div class="year-label">Year ${escapeHtml(year.year || index + 1)}</div><div><span>Revenue</span><strong>${fmt(year.revenue)}</strong></div><div><span>Cash flow</span><strong>${fmt(year.cashFlow)}</strong></div><div><span>Property value</span><strong>${fmt(year.propertyValue)}</strong></div><div><span>Equity</span><strong>${fmt(year.equity)}</strong></div></div>`).join("")}</div>`;
  }

  const comps = (Array.isArray(form.comps) ? form.comps : []).filter((comp: any) => comp && (comp.name || comp.link || comp.annualRevenue || comp.adr)).slice(0, 6);
  const comparablePage = comps.length ? `<div class="pdf-page"><div class="hdr">${brandLockup}<span class="hdr-sub">Comparable Properties</span></div><div class="page-intro"><h2>Revenue Comparable Properties</h2><p>Comparable-property inputs used to inform the revenue analysis.</p></div><table class="comp-table"><thead><tr><th>Comparable</th><th>Location</th><th>Beds</th><th>ADR</th><th>Occupancy</th><th>Est. Annual Revenue</th><th>Guest Signal</th><th>Listing</th></tr></thead><tbody>${comps.map((comp: any) => {
    const occupancy = numeric(comp.occupancy) > 1 ? numeric(comp.occupancy) / 100 : numeric(comp.occupancy);
    const estimatedRevenue = numeric(comp.annualRevenue) || (numeric(comp.adr) * occupancy * 365);
    const compLink = safeUrl(comp.link);
    const guestSignal = comp.rating ? `${escapeHtml(comp.rating)}${comp.reviewCount ? ` (${escapeHtml(comp.reviewCount)})` : ""}` : "—";
    const compPhoto = String(comp.reportPhotoDataUrl || "");
    return `<tr><td><div class="comp-identity">${compPhoto ? `<img class="comp-photo" src="${compPhoto}" alt="${escapeHtml(comp.name || "Comparable property")}"/>` : ""}<div><strong>${escapeHtml(comp.name || "Comparable property")}</strong>${comp.notes ? `<small>${escapeHtml(comp.notes)}</small>` : ""}</div></div></td><td>${escapeHtml(comp.city || "—")}</td><td>${escapeHtml(comp.beds || "—")}</td><td>${numeric(comp.adr) ? fmt(comp.adr) : "—"}</td><td>${occupancy ? pct(occupancy) : "—"}</td><td><strong>${estimatedRevenue ? fmt(estimatedRevenue) : "—"}</strong></td><td>${guestSignal}</td><td>${compLink ? `<a href="${compLink}" data-pdf-link>View listing</a>` : "—"}</td></tr>`;
  }).join("")}</tbody></table><div class="note-panel"><h3>How to use comps</h3><p>Compare bed count, amenities, seasonality, ratings, and current pricing strategy alongside the modeled revenue. These estimates are inputs, not guarantees of future performance.</p></div></div>` : "";

  const acquisitionCard = `<div class="card acquisition-summary"><h4>Acquisition & Cash to Close</h4><div class="acquisition-grid"><div class="row"><span class="lbl">Purchase price</span><span class="val">${fmt(purchasePrice)}</span></div><div class="row"><span class="lbl">Down payment (${escapeHtml(form.downPaymentPct || 20)}%)</span><span class="val">${fmt(calc.downPayment)}</span></div><div class="row"><span class="lbl">Closing costs</span><span class="val">${fmt(calc.closingCosts)}</span></div><div class="row"><span class="lbl">Furnishing</span><span class="val">${fmt(calc.furnishing)}</span></div><div class="row"><span class="lbl">Renovation</span><span class="val">${fmt(calc.renovation)}</span></div><div class="row"><span class="lbl">Startup & inspection</span><span class="val">${fmt(numeric(calc.startup) + numeric(calc.inspection))}</span></div>${numeric(calc.sellerCredit) ? `<div class="row"><span class="lbl teal">Seller credit</span><span class="val teal">-${fmt(calc.sellerCredit)}</span></div>` : ""}<div class="row brd"><span class="lbl bold">Total cash needed</span><span class="val big">${fmt(calc.totalCashNeeded)}</span></div></div></div>`;

  const financingCard = `<div class="card financing-summary"><h4>Financing Summary</h4><div class="row"><span class="lbl">Loan type</span><span class="val">${escapeHtml(loanLabel(form.loanType))}</span></div><div class="row"><span class="lbl">Loan amount</span><span class="val">${fmt(calc.loanAmount)}</span></div><div class="row"><span class="lbl">Interest rate</span><span class="val">${escapeHtml(form.interestRate || 7)}%</span></div><div class="row"><span class="lbl">Loan term</span><span class="val">${escapeHtml(form.loanTermYears || 30)} years</span></div><div class="row"><span class="lbl">Monthly P&I</span><span class="val">${fmt(calc.monthlyPI)}</span></div>${numeric(calc.monthlyPMI) > 0 ? `<div class="row"><span class="lbl">Monthly PMI</span><span class="val">${fmt(calc.monthlyPMI)}</span></div>` : ""}<div class="row"><span class="lbl">Monthly debt payment</span><span class="val">${fmt(calc.monthlyMortgage)}</span></div><div class="row brd"><span class="lbl bold">Annual debt service</span><span class="val big">${fmt(calc.annualDebtService)}</span></div></div>`;

  const notableNumbers = `<div class="notable-box"><div class="notable-heading"><div><h3>Notable Numbers</h3><p>Based on Base Case Scenario</p></div></div><div class="notable-grid"><div><span>Gross Revenue</span><strong>${fmt(s2.grossRevenue)}</strong></div><div><span>Annual Cash Flow</span><strong>${fmt(s2.cashFlow)}</strong></div><div><span>Cash-on-Cash Return<br/>Without Tax Benefits</span><strong>${pct(s2.cashOnCash)}</strong></div><div><span>Cash-on-Cash Return<br/>With Tax Benefits</span><strong>${pct(taxReturns.s2?.year1CoCWithTax)}</strong></div><div><span>Cap Rate</span><strong>${pct(s2.capRate)}</strong></div><div><span>DSCR</span><strong>${numeric(s2.dscr).toFixed(2)}x</strong></div><div><span>Net Tax Benefit<br/>Year 1</span><strong>${fmt(calc.netTaxBenefit)}</strong></div></div></div>`;

  const taxBenefitsPage = `<div class="pdf-page"><div class="hdr">${brandLockup}<span class="hdr-sub">Cost Segregation & Tax Benefits</span></div><div class="page-intro"><h2>Modeled Tax-Benefit Detail</h2><p>Illustrative deductions and tax savings based on the proforma inputs. Confirm eligibility, classification, and tax treatment with a CPA.</p></div><div class="cols"><div class="card"><h4>Basis & Study Inputs</h4><div class="row"><span class="lbl">Purchase price</span><span class="val">${fmt(purchasePrice)}</span></div><div class="row"><span class="lbl">Land allocation</span><span class="val">${escapeHtml(form.landAllocationPct || 0)}%</span></div><div class="row"><span class="lbl">Building basis after land</span><span class="val">${fmt(calc.buildingBasis)}</span></div><div class="row"><span class="lbl">Cost segregation study</span><span class="val">${calc.costSegEnabled ? "Yes" : "No"}</span></div><div class="row"><span class="lbl">Shorter-life property assumption</span><span class="val">${calc.costSegEnabled ? `${escapeHtml(form.acceleratedDepreciationPct || 0)}%` : "0%"}</span></div><div class="row"><span class="lbl">Cost-seg shorter-life basis</span><span class="val">${fmt(calc.acceleratedAmt)}</span></div><div class="row brd"><span class="lbl bold">Residual building basis</span><span class="val big">${fmt(calc.remainingBuildingBasis)}</span></div></div><div class="card"><h4>Year 1 Deduction Components</h4><div class="row"><span class="lbl">Cost-seg shorter-life property</span><span class="val">${fmt(calc.acceleratedAmt)}</span></div><div class="row"><span class="lbl">Furnishing deduction (modeled eligible)</span><span class="val">${fmt(calc.furnishingDeduction)}</span></div><div class="row"><span class="lbl">Bonus-eligible improvements</span><span class="val">${fmt(calc.bonusEligibleImprovements)}</span></div><div class="row"><span class="lbl">Residual building depreciation (27.5 yrs)</span><span class="val">${fmt(calc.straightLineDepreciation)}</span></div><div class="row"><span class="lbl">Scheduled Year 1 mortgage interest</span><span class="val">${fmt(calc.year1MortgageInterest)}</span></div><div class="row brd"><span class="lbl bold">Total Year 1 deduction</span><span class="val big">${fmt(calc.totalFirstYearDeduction)}</span></div></div></div><div class="cols"><div class="card emphasis-card"><h4>Year 1 Estimated Tax Benefit</h4><div class="row"><span class="lbl">Marginal tax rate</span><span class="val">${escapeHtml(form.marginalTaxRate || 0)}%</span></div><div class="row"><span class="lbl">Estimated tax savings</span><span class="val">${fmt(calc.taxSavings)}</span></div><div class="row"><span class="lbl">Cost-seg study cost</span><span class="val">-${fmt(calc.costSegCost)}</span></div><div class="row brd"><span class="lbl bold">Net tax benefit, Year 1</span><span class="val big teal">${fmt(calc.netTaxBenefit)}</span></div></div><div class="card"><h4>Estimated Year 2 Benefit</h4><div class="row"><span class="lbl">Residual building depreciation</span><span class="val">${fmt(calc.straightLineDepreciation)}</span></div><div class="row"><span class="lbl">Scheduled Year 2 mortgage interest</span><span class="val">${fmt(calc.year2MortgageInterest)}</span></div><div class="row"><span class="lbl">Estimated Year 2 deduction</span><span class="val">${fmt(calc.ongoingAnnualDeduction)}</span></div><div class="row brd"><span class="lbl bold">Estimated Year 2 tax savings</span><span class="val big teal">${fmt(calc.ongoingAnnualTaxBenefit)}</span></div></div></div><div class="note-panel"><h3>Important modeling notes</h3><p>The renovation budget of ${fmt(calc.renovation)} is not automatically treated as bonus-depreciable. Only the separately entered ${fmt(calc.bonusEligibleImprovements)} of bonus-eligible improvements is included. Mortgage interest follows the loan’s amortization schedule and declines over time.</p></div><div class="disc">Tax calculations are illustrative and not tax advice. Actual results depend on placed-in-service dates, property classification, passive-activity and material-participation rules, basis adjustments, filing position, and professional tax advice.</div></div>`;

  const valueAddPage = calc.isValueAdd || calc.isCashoutRefi ? `<div class="pdf-page"><div class="hdr">${brandLockup}<span class="hdr-sub">Value-Add & Refinance Analysis</span></div>${calc.isValueAdd ? `<div class="stitle">Equity Creation Through Value-Add</div><div class="cols"><div class="card"><h4>Investment Basis</h4><div class="row"><span class="lbl">Purchase price</span><span class="val">${fmt(purchasePrice)}</span></div><div class="row"><span class="lbl">Renovation budget</span><span class="val">${fmt(calc.renovation)}</span></div><div class="row brd"><span class="lbl bold">All-in cost</span><span class="val big">${fmt(purchasePrice + numeric(calc.renovation))}</span></div></div><div class="card emphasis-card"><h4>After Repair Value</h4><div class="row"><span class="lbl">ARV</span><span class="val big teal">${fmt(calc.arv)}</span></div><div class="row"><span class="lbl">Forced equity</span><span class="val">${fmt(calc.forcedEquity)}</span></div><div class="row brd"><span class="lbl bold">Net equity created</span><span class="val big green">${fmt(calc.equityCreatedByReno)}</span></div></div></div>` : ""}${calc.isCashoutRefi ? `<div class="stitle">Cash-Out Refinance</div><div class="cols"><div class="card"><h4>Refinance Terms</h4><div class="row"><span class="lbl">Appraised value</span><span class="val">${fmt(refi.refiAppraised)}</span></div><div class="row"><span class="lbl">LTV</span><span class="val">${escapeHtml(form.refiLTV || 75)}%</span></div><div class="row"><span class="lbl">New loan amount</span><span class="val">${fmt(refi.refiNewLoanAmount)}</span></div><div class="row brd"><span class="lbl bold">Cash out</span><span class="val big green">${fmt(refi.refiCashOut)}</span></div></div><div class="card"><h4>Post-Refi Returns</h4><div class="row"><span class="lbl">New monthly payment</span><span class="val">${fmt(refi.refiMonthlyMortgage)}</span></div><div class="row"><span class="lbl">Cash left in deal</span><span class="val">${fmt(refi.cashInDeal)}</span></div><div class="row"><span class="lbl">Annual cash flow</span><span class="val">${fmt(refi.s2?.cashFlow)}</span></div><div class="row brd"><span class="lbl bold">Cash-on-cash return</span><span class="val big teal">${numeric(refi.cashInDeal) > 0 ? pct(refi.s2?.cashOnCash) : "Infinite"}</span></div></div></div>` : ""}</div>` : "";

  return `<style>
    .pdf-page{width:816px;min-height:1056px;padding:34px 38px 40px;background:#fff;page-break-after:always;overflow:hidden;}
    .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;border-bottom:3px solid #0891b2;padding-bottom:12px;}
    .brand-lockup{display:flex;align-items:center;gap:10px;min-width:0;}.logo{height:32px;max-width:135px;object-fit:contain;}.brand-divider{width:1px;height:26px;background:#cbd5e1;flex:0 0 auto;}.co-brand-logo{height:26px;max-width:160px;object-fit:contain;}.hdr-sub{font-size:11px;font-weight:600;color:#64748b;}
    .agent{display:flex;align-items:center;gap:11px;text-align:right;}.agent img{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid #0891b2;}.agent-name{font-size:14px;font-weight:800;line-height:1.15;}.agent-sub{font-size:10.5px;color:#475569;line-height:1.35;}
    .ptitle{font-size:25px;font-weight:850;letter-spacing:-.3px;color:#0e7490;margin-bottom:4px;}.paddr{font-size:12.5px;font-weight:500;color:#475569;margin-bottom:14px;}.property-photo-wrap{width:100%;height:220px;border-radius:10px;overflow:hidden;background:#e2e8f0;margin-bottom:16px;}.pphoto{display:block;width:100%;height:100%;object-fit:cover;object-position:center;}
    .notable-box{border:1px solid #99f6e4;border-radius:10px;background:#f0fdfa;padding:12px 14px;margin-bottom:14px;}.notable-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}.notable-heading h3{font-size:15px;font-weight:850;color:#0e7490;margin:0;}.notable-heading p{font-size:10.5px;color:#64748b;margin:2px 0 0;}.notable-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}.notable-grid>div{display:flex;min-height:61px;flex-direction:column;justify-content:center;border-radius:7px;background:#fff;border:1px solid #c7edf0;padding:7px 8px;text-align:center;}.notable-grid span{font-size:9.5px;font-weight:750;line-height:1.22;text-transform:uppercase;letter-spacing:.15px;color:#526174;}.notable-grid strong{margin-top:4px;font-size:15px;line-height:1.1;color:#172033;}.notable-grid>div:nth-child(2) strong,.notable-grid>div:nth-child(4) strong,.notable-grid>div:nth-child(7) strong{color:#087d99;}
    .aibox{background:linear-gradient(135deg,#f0fdfa,#eefbff);border:1.5px solid #0891b2;border-radius:10px;padding:15px 16px;margin-bottom:12px;}.aibox h3{font-size:14px;color:#0e7490;margin-bottom:7px;}.aibox p{font-size:11.5px;line-height:1.55;color:#334155;}.listing-link{display:inline-flex;font-size:12px;font-weight:700;color:#087d99;text-decoration:underline;text-underline-offset:2px;}
    .page-intro{margin:0 0 16px;}.page-intro h2{font-size:20px;color:#0e7490;margin-bottom:4px;}.page-intro p{font-size:12px;color:#64748b;}.stitle{font-size:16px;font-weight:800;color:#0e7490;margin:16px 0 8px;padding-bottom:5px;border-bottom:2px solid #bcecf0;}.cbox{background:#f8fafc;border:1px solid #dbe4ec;border-radius:9px;padding:12px 14px;margin-bottom:12px;}.cbox-title{text-align:center;font-size:13px;font-weight:800;color:#334155;margin-bottom:3px;}
    .revenue-chart{display:block;width:100%;height:192px;}.growth-chart{display:block;width:100%;height:220px;}.expense-donut{display:block;width:100%;height:158px;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;}th{background:#155e75;color:#fff;padding:8px 8px;text-align:center;font-weight:800;font-size:11px;line-height:1.2;}th:first-child,td:first-child{text-align:left;}td{padding:7px 8px;border-bottom:1px solid #dfe7ee;text-align:center;color:#263448;line-height:1.2;}tr:nth-child(even){background:#f8fafc;}.hlr{background:#e8fbfb!important;font-weight:800;}.hlr td{color:#0f5260;}
    .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;}.card{border:1px solid #dbe4ec;border-radius:9px;padding:13px;background:#fff;}.emphasis-card{background:#f0fdfa;}.card h4{text-align:center;font-size:14px;font-weight:850;color:#0e7490;margin:0 0 8px;}.row{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;line-height:1.3;padding:4px 0;border-bottom:1px solid #eef2f6;}.row:last-child{border-bottom:none;}.lbl{color:#526174;}.val{font-weight:750;color:#172033;text-align:right;}.brd{border-top:2px solid #0891b2;margin-top:4px;padding-top:7px;}.bold{font-weight:850;}.big{font-size:14px;}.teal{color:#087d99;}.green{color:#047857;}.page-one-details{margin-bottom:12px;}.page-one-details .card{margin-bottom:0;}.acquisition-summary{margin-bottom:12px;}.acquisition-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:20px;}.acquisition-grid .row{font-size:11px;}.financing-summary{margin-bottom:12px;}.channel-mix{display:flex;justify-content:space-between;gap:10px;margin-top:8px;padding:7px 0;border-top:1px solid #cbd5e1;color:#0e7490;font-size:11px;line-height:1.35;}.channel-mix strong{text-align:right;color:#172033;}.channel-mix small{display:block;color:#64748b;font-size:10px;text-align:right;margin-top:2px;}
    .year-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:4px 0 16px;}.year-card{border:1px solid #dbe4ec;border-radius:8px;padding:9px;background:#fff;}.year-label{text-align:center;color:#0e7490;font-size:12px;font-weight:850;margin-bottom:6px;}.year-card>div:not(.year-label){display:flex;flex-direction:column;margin:4px 0;}.year-card span{font-size:9.5px;color:#64748b;}.year-card strong{font-size:11px;color:#172033;}
    .expense-layout{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:13px;}.expense-card{border:1px solid #dbe4ec;border-radius:9px;padding:12px;background:#fff;}.expense-card h3{text-align:center;color:#0e7490;font-size:14px;margin:0 0 8px;}.expense-row{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #eef2f6;padding:4px 0;font-size:11px;line-height:1.25;}.expense-row span{color:#526174;}.expense-row strong{font-size:11px;color:#172033;text-align:right;}.expense-total{display:flex;justify-content:space-between;margin-top:7px;padding-top:7px;border-top:2px solid #0891b2;font-size:12px;font-weight:850;color:#0e7490;}.assumption-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:10px;}.assumption{border:1px solid #dbe4ec;border-radius:8px;padding:9px;text-align:center;background:#f8fafc;}.assumption span{display:block;color:#64748b;font-size:10px;margin-bottom:3px;}.assumption strong{color:#172033;font-size:13px;}.note-panel{margin-top:12px;border:1px solid #bcecf0;border-radius:9px;padding:12px;background:#f0fdfa;}.note-panel h3{font-size:13px;color:#0e7490;margin:0 0 4px;}.note-panel p{font-size:11px;line-height:1.45;color:#334155;}.empty-state{font-size:12px;color:#64748b;padding:14px;text-align:center;}
    .comp-table{font-size:11px;}.comp-table th{font-size:10.5px;padding:8px 6px;}.comp-table td{padding:9px 6px;vertical-align:top;}.comp-table td:first-child{width:30%;}.comp-table small{display:block;color:#64748b;font-size:9.5px;line-height:1.3;margin-top:3px;}.comp-table a{color:#087d99;font-weight:800;text-decoration:underline;text-underline-offset:2px;}.comp-identity{display:flex;align-items:flex-start;gap:8px;text-align:left;}.comp-photo{display:block;flex:0 0 64px;width:64px;height:48px;border-radius:5px;object-fit:cover;object-position:center;background:#e2e8f0;}.disc{font-size:8.5px;color:#64748b;line-height:1.45;margin-top:14px;padding-top:8px;border-top:1px solid #dbe4ec;}
  </style>

  <div class="pdf-page">
    <div class="hdr">${brandLockup}<div class="agent"><div><div class="agent-name">${escapeHtml(branding.name || "")}</div><div class="agent-sub">${escapeHtml(branding.email || "")}${branding.phone ? ` | ${escapeHtml(branding.phone)}` : ""}</div>${branding.market ? `<div class="agent-sub">${escapeHtml(branding.market)}</div>` : ""}</div>${headshotB64 ? `<img src="${headshotB64}" alt="Agent headshot"/>` : ""}</div></div>
    <div class="ptitle">${escapeHtml(title || "STR Investment Analysis")}</div>
    <div class="paddr">${escapeHtml(property.address || "")}${property.city ? `, ${escapeHtml(property.city)}` : ""}${property.state ? ` ${escapeHtml(property.state)}` : ""}${property.zip ? ` ${escapeHtml(property.zip)}` : ""} &nbsp;|&nbsp; ${escapeHtml(property.beds || 0)} BD / ${escapeHtml(property.baths || 0)} BA / ${Number(property.sqft || 0).toLocaleString()} sqft</div>
    ${photoB64 ? `<div class="property-photo-wrap"><img src="${photoB64}" class="pphoto" alt="Property exterior or interior"/></div>` : ""}
    ${notableNumbers}
    <div class="aibox"><h3>Investment Analysis</h3><p>${escapeHtml(data.aiSummary || `This ${property.beds || 0}-bedroom property in ${property.city || "the area"} presents a modeled STR investment at ${fmt(purchasePrice)} with ${fmt(calc.totalCashNeeded)} total cash needed. The base case projects ${fmt(s2.cashFlow)} in annual cash flow, a ${pct(s2.cashOnCash)} cash-on-cash return, and a ${numeric(s2.dscr).toFixed(2)}x DSCR. Break-even occupancy is ${pct(s2.breakEvenOcc)}.${numeric(calc.netTaxBenefit) > 0 ? ` Estimated Year 1 tax benefits are ${fmt(calc.netTaxBenefit)}.` : ""}`)}</p></div>
    <div class="cols page-one-details">${acquisitionCard}${financingCard}</div>
    ${propertyLink ? `<a class="listing-link" href="${propertyLink}" data-pdf-link>View listing on Zillow →</a>` : ""}
  </div>

  <div class="pdf-page">
    <div class="hdr">${brandLockup}<span class="hdr-sub">Revenue Scenarios & Financial Details</span></div>
    <div class="cbox"><div class="cbox-title">Gross Revenue by Scenario</div>${barChart}</div>
    <div class="stitle">Scenario Comparison</div>
    <table><thead><tr><th>Metric</th><th>Conservative</th><th>Base Case</th><th>Strong Execution</th></tr></thead><tbody><tr><td>ADR</td><td>${fmt(s1.adr)}</td><td>${fmt(s2.adr)}</td><td>${fmt(s3.adr)}</td></tr><tr><td>Occupancy</td><td>${pct(s1.occ)}</td><td>${pct(s2.occ)}</td><td>${pct(s3.occ)}</td></tr><tr><td>Sold Nights</td><td>${Math.round(numeric(s1.soldNights))}</td><td>${Math.round(numeric(s2.soldNights))}</td><td>${Math.round(numeric(s3.soldNights))}</td></tr><tr><td>Gross Revenue</td><td>${fmt(s1.grossRevenue)}</td><td>${fmt(s2.grossRevenue)}</td><td>${fmt(s3.grossRevenue)}</td></tr><tr><td>Platform Fees</td><td>${fmt(s1.platformFees)}</td><td>${fmt(s2.platformFees)}</td><td>${fmt(s3.platformFees)}</td></tr><tr><td>Net Revenue</td><td>${fmt(s1.netRevenue)}</td><td>${fmt(s2.netRevenue)}</td><td>${fmt(s3.netRevenue)}</td></tr><tr><td>NOI</td><td>${fmt(s1.noi)}</td><td>${fmt(s2.noi)}</td><td>${fmt(s3.noi)}</td></tr><tr class="hlr"><td>Annual Cash Flow</td><td>${fmt(s1.cashFlow)}</td><td>${fmt(s2.cashFlow)}</td><td>${fmt(s3.cashFlow)}</td></tr><tr class="hlr"><td>Cash-on-Cash Return</td><td>${pct(s1.cashOnCash)}</td><td>${pct(s2.cashOnCash)}</td><td>${pct(s3.cashOnCash)}</td></tr><tr><td>Cap Rate</td><td>${pct(s1.capRate)}</td><td>${pct(s2.capRate)}</td><td>${pct(s3.capRate)}</td></tr><tr><td>DSCR</td><td>${numeric(s1.dscr).toFixed(2)}x</td><td>${numeric(s2.dscr).toFixed(2)}x</td><td>${numeric(s3.dscr).toFixed(2)}x</td></tr><tr class="hlr"><td>CoC with Tax Benefits, Year 1</td><td>${pct(taxReturns.s1?.year1CoCWithTax)}</td><td>${pct(taxReturns.s2?.year1CoCWithTax)}</td><td>${pct(taxReturns.s3?.year1CoCWithTax)}</td></tr></tbody></table>
  </div>

  <div class="pdf-page">
    <div class="hdr">${brandLockup}<span class="hdr-sub">Projections & Returns</span></div>
    <div class="cbox"><div class="cbox-title">5-Year Growth: Property Value and Equity</div>${growthChart}</div>${growthCards}
    ${calc.irr?.s1 ? `<div class="stitle">Internal Rate of Return (IRR)</div><table><thead><tr><th>Hold Period</th><th>Conservative<br/>Pre-Tax</th><th>Conservative<br/>After-Tax</th><th>Base Case<br/>Pre-Tax</th><th>Base Case<br/>After-Tax</th><th>Strong<br/>Pre-Tax</th><th>Strong<br/>After-Tax</th></tr></thead><tbody><tr><td>3 Years</td><td>${irrFmt(calc.irr.s1.y3)}</td><td>${irrFmt(calc.irr.s1.y3at)}</td><td>${irrFmt(calc.irr.s2.y3)}</td><td>${irrFmt(calc.irr.s2.y3at)}</td><td>${irrFmt(calc.irr.s3.y3)}</td><td>${irrFmt(calc.irr.s3.y3at)}</td></tr><tr><td>5 Years</td><td>${irrFmt(calc.irr.s1.y5)}</td><td>${irrFmt(calc.irr.s1.y5at)}</td><td>${irrFmt(calc.irr.s2.y5)}</td><td>${irrFmt(calc.irr.s2.y5at)}</td><td>${irrFmt(calc.irr.s3.y5)}</td><td>${irrFmt(calc.irr.s3.y5at)}</td></tr><tr><td>7 Years</td><td>${irrFmt(calc.irr.s1.y7)}</td><td>${irrFmt(calc.irr.s1.y7at)}</td><td>${irrFmt(calc.irr.s2.y7)}</td><td>${irrFmt(calc.irr.s2.y7at)}</td><td>${irrFmt(calc.irr.s3.y7)}</td><td>${irrFmt(calc.irr.s3.y7at)}</td></tr></tbody></table>` : ""}
  </div>

  ${taxBenefitsPage}

  <div class="pdf-page">
    <div class="hdr">${brandLockup}<span class="hdr-sub">Operating Budget & Assumptions</span></div>
    <div class="page-intro"><h2>Base Case Operating Expense Detail</h2><p>Annual costs used in the base-case operating model.</p></div>
    <div class="expense-layout"><div class="expense-card"><h3>Fixed Expenses</h3>${expenseRows(fixedExpenses)}<div class="expense-total"><span>Total Fixed Expenses</span><span>${fmt(fixedTotal)}/yr</span></div></div><div class="expense-card"><h3>Variable Expenses</h3>${expenseRows(variableExpenses)}<div class="channel-mix"><span>Revenue Channel Mix</span><div><strong>Airbnb ${escapeHtml(airbnbPct)}% / Vrbo ${escapeHtml(vrboPct)}% / Direct ${escapeHtml(directPct)}%</strong><small>Blended platform fee: ${pct(calc.blendedFeeRate)}</small></div></div><div class="expense-total"><span>Total Variable Expenses</span><span>${fmt(variableTotal)}/yr</span></div></div></div>
    <div class="cbox"><div class="cbox-title">Base Case Annual Expense Mix</div>${expenseDonut}</div>
    <div class="assumption-grid"><div class="assumption"><span>Revenue Growth</span><strong>${escapeHtml(form.revenueAppreciationPct || 0)}% / year</strong></div><div class="assumption"><span>Property Appreciation</span><strong>${escapeHtml(form.propertyAppreciationPct || 0)}% / year</strong></div><div class="assumption"><span>Exit Selling Costs</span><strong>${pct(calc.sellingCostsPct)}</strong></div></div>
    ${form.notes ? `<div class="note-panel"><h3>Notes & Assumptions</h3><p>${escapeHtml(form.notes).replace(/\n/g, "<br/>")}</p></div>` : ""}
    <div class="disc">Disclaimer: This pro-forma is for informational purposes only and does not constitute financial, tax, or investment advice. All projections are estimates based on the stated inputs, comparable data, and modeled assumptions. Actual results may vary materially. Consult appropriately licensed professionals before making investment decisions.</div>
  </div>

  ${comparablePage}
  ${valueAddPage}`;
}
