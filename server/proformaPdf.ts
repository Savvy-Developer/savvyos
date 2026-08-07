import express from "express";
import PDFDocument from "pdfkit";
import { sdk } from "./_core/sdk";
import https from "https";
import http from "http";

const fmtD = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "$0";
  return `$${Math.round(val).toLocaleString()}`;
};
const fmtP = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "0%";
  return `${(val * 100).toFixed(2)}%`;
};
const fmtP1 = (val: number): string => {
  if (!isFinite(val) || isNaN(val)) return "0%";
  return `${(val * 100).toFixed(1)}%`;
};

const fetchImage = (url: string): Promise<Buffer> => new Promise((resolve, reject) => {
  const client = url.startsWith("https") ? https : http;
  client.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) return fetchImage(res.headers.location!).then(resolve).catch(reject);
    const chunks: Buffer[] = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  }).on("error", reject);
});

export function registerProformaPdfRoute(app: express.Application) {
  app.post("/api/proforma/pdf", express.json({ limit: "2mb" }), async (req: any, res: any) => {
    try {
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.status(401).json({ error: "Unauthorized" }); }

      const { form, calc, property, branding, title } = req.body;
      if (!form || !calc) return res.status(400).json({ error: "Missing data" });

      const doc = new PDFDocument({ size: "LETTER", margins: { top: 40, bottom: 40, left: 50, right: 50 }, font: "Helvetica", bufferPages: true });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      const pdfDone = new Promise<Buffer>((resolve) => { doc.on("end", () => resolve(Buffer.concat(buffers))); });

      const W = 512; // page width minus margins
      const brandGreen = "#0891b2"; // SavvyOS teal/cyan brand color
      const brandDark = "#1e293b";
      const lightGray = "#f8fafc";
      const headerBg = "#155e75"; // Darker teal for table headers
      const halfW = W / 2 - 8;

      const s1 = calc.s1 || {}, s2 = calc.s2 || {}, s3 = calc.s3 || {};

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: COVER + EXECUTIVE SUMMARY
      // ═══════════════════════════════════════════════════════════════════════
      // Logo
      try {
        const logoBuffer = await fetchImage("https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png");
        doc.image(logoBuffer, 50, 35, { width: 120 });
      } catch { doc.fontSize(16).font("Helvetica-Bold").fillColor(brandGreen).text("SAVVY STR AGENTS", 50, 40); }

      // Agent branding (right side - headshot + contact info)
      if (branding) {
        let bx = 350, by = 32;
        if (branding.profilePhotoUrl) {
          try {
            const img = await fetchImage(branding.profilePhotoUrl);
            doc.save();
            doc.circle(bx + 100, by + 28, 24).clip();
            doc.image(img, bx + 76, by + 4, { width: 48, height: 48 });
            doc.restore();
          } catch {}
        }
        doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text(branding.name ?? "", bx, by, { width: 70, align: "right" });
        by += 13;
        if (branding.market) { doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(branding.market, bx, by, { width: 70, align: "right" }); by += 10; }
        if (branding.email) { doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(branding.email, bx, by, { width: 70, align: "right" }); by += 10; }
        if (branding.phone) { doc.font("Helvetica").fontSize(7.5).fillColor("#64748b").text(branding.phone, bx, by, { width: 70, align: "right" }); by += 10; }
        if (branding.callBookingLink) { doc.font("Helvetica").fontSize(7.5).fillColor(brandGreen).text("Book a Call →", bx, by, { link: branding.callBookingLink, underline: true, width: 70, align: "right" }); }
      }

      // Title section
      let y = 100;
      doc.font("Helvetica-Bold").fontSize(20).fillColor(brandDark).text(title || "STR Investment Pro-Forma", 50, y);
      y += 26;
      if (property) {
        const addr = [property.address, [property.city, property.state, property.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        doc.font("Helvetica").fontSize(11).fillColor("#475569").text(addr, 50, y);
        y += 16;
        const details = [];
        if (property.beds) details.push(`${property.beds} Beds`);
        if (property.baths) details.push(`${property.baths} Baths`);
        if (property.sqft) details.push(`${Number(property.sqft).toLocaleString()} sqft`);
        if (details.length) { doc.fontSize(9).fillColor("#94a3b8").text(details.join("  •  "), 50, y); y += 12; }
      }
      if (form.propertyLink) {
        doc.font("Helvetica").fontSize(7.5).fillColor("#3b82f6").text(`Listing: ${form.propertyLink}`, 50, y, { link: form.propertyLink, underline: true, width: W });
        y += 11;
      }
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8").text(`Report Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 50, y);
      y += 8;

      // Property photo (from Zillow import) - maintain aspect ratio, constrained
      if (form.propertyPhotoUrl) {
        try {
          const propPhoto = await fetchImage(form.propertyPhotoUrl);
          doc.image(propPhoto, 50, y, { fit: [W, 160], align: "center", valign: "center" });
          y += 166;
        } catch { y += 10; }
      } else {
        y += 10;
      }

      // Key Metrics Boxes - 4 across
      const boxW = W / 4 - 6;
      const metrics = [
        { label: "Total Cash Needed", value: fmtD(calc.totalCashNeeded) },
        { label: "Monthly Mortgage", value: fmtD(calc.monthlyMortgage) },
        { label: "Base Case Cash Flow", value: fmtD(calc.s2?.cashFlow ?? 0) },
        { label: "Cash-on-Cash Return", value: fmtP(calc.s2?.cashOnCash ?? 0) },
      ];
      metrics.forEach((m, i) => {
        const bx = 50 + i * (boxW + 8);
        doc.roundedRect(bx, y, boxW, 46, 4).fill(lightGray);
        doc.font("Helvetica").fontSize(6.5).fillColor("#64748b").text(m.label, bx + 4, y + 8, { width: boxW - 8, align: "center" });
        doc.font("Helvetica-Bold").fontSize(12).fillColor(brandDark).text(m.value, bx + 4, y + 22, { width: boxW - 8, align: "center" });
      });
      y += 58;

      // Second row of metrics
      const metrics2 = [
        { label: "Cap Rate", value: fmtP(calc.s2?.capRate ?? 0) },
        { label: "DSCR", value: `${((calc.s2?.dscr ?? 0) === Infinity ? "∞" : (calc.s2?.dscr ?? 0).toFixed(2))}x` },
        { label: "Break-Even Occ.", value: fmtP1(calc.s2?.breakEvenOcc ?? 0) },
        { label: "Net Tax Benefit", value: fmtD(calc.netTaxBenefit ?? 0) },
      ];
      metrics2.forEach((m, i) => {
        const bx = 50 + i * (boxW + 8);
        doc.roundedRect(bx, y, boxW, 40, 4).fill("#ecfeff");
        doc.font("Helvetica").fontSize(6.5).fillColor("#64748b").text(m.label, bx + 4, y + 7, { width: boxW - 8, align: "center" });
        doc.font("Helvetica-Bold").fontSize(11).fillColor(brandGreen).text(m.value, bx + 4, y + 20, { width: boxW - 8, align: "center" });
      });
      y += 52;

      // ─── INVESTMENT SUMMARY (Page 1) ───────────────────────────────────
      if (calc.s2 && calc.totalCashNeeded > 0) {
        const loanTypeLabel = form.loanType === "dscr" ? "DSCR" : form.loanType === "cash" ? "All Cash" : form.loanType === "conventional_second" ? "Conv. Second Home" : "Conventional";
        const summaryText = `This ${property?.beds || "\u2014"}-bed/${property?.baths || "\u2014"}-bath property is analyzed as a short-term rental investment at ${fmtD(calc.pp)} using ${loanTypeLabel} financing. ` +
          `The base case projects ${fmtD(s2.grossRevenue)} gross annual revenue (${fmtD(s2.adr)} ADR at ${Math.round((s2.occ ?? 0) * 100)}% occupancy), yielding ${fmtD(s2.noi)} NOI and ${fmtD(s2.cashFlow)} annual cash flow. ` +
          `Cash-on-Cash return is ${fmtP1(s2.cashOnCash)}${calc.taxReturns?.s2 ? ` (${fmtP1(calc.taxReturns.s2.year1CoCWithTax)} w/ Year 1 tax benefits)` : ""}. ` +
          `Total cash required: ${fmtD(calc.totalCashNeeded)}${calc.netTaxBenefit > 0 ? ` (effective basis: ${fmtD(Math.max(0, calc.totalCashNeeded - calc.netTaxBenefit))} after tax benefits)` : ""}. ` +
          (calc.isValueAdd && calc.arv > 0 ? `Value-add with ARV of ${fmtD(calc.arv)}, creating ${fmtD(calc.forcedEquity)} in forced equity. ` : "") +
          (calc.isCashoutRefi && calc.refi?.refiCashOut > 0 ? `Cash-out refi at ${form.refiLTV || "75"}% LTV returns ${fmtD(calc.refi.refiCashOut)}.` : "");
        doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(summaryText, 50, y, { width: W, lineGap: 2 });
        const summaryH = doc.heightOfString(summaryText, { width: W, lineGap: 2 });
        y += summaryH + 10;
      }

      // ─── SCENARIO COMPARISON TABLE ───────────────────────────────────────
      doc.font("Helvetica-Bold").fontSize(11).fillColor(brandDark).text("Scenario Comparison", 50, y);
      y += 16;

      const colW = [W * 0.32, W * 0.22, W * 0.23, W * 0.23];
      const drawRow = (cells: string[], yPos: number, opts?: { header?: boolean; bold?: boolean; highlight?: boolean }) => {
        if (opts?.header) { doc.rect(50, yPos - 2, W, 15).fill(headerBg); doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff"); }
        else if (opts?.highlight) { doc.rect(50, yPos - 2, W, 13).fill("#ecfeff"); doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor(brandDark); }
        else { doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor("#475569"); }
        let x = 50;
        cells.forEach((c, i) => {
          const align = i === 0 ? "left" : "right";
          doc.text(c, x + 3, yPos, { width: colW[i] - 6, align });
          x += colW[i];
        });
        return yPos + (opts?.header ? 15 : 13);
      };

      y = drawRow(["Metric", "Conservative", "Base Case", "Strong Execution"], y, { header: true });
      y = drawRow(["ADR", fmtD(s1.adr), fmtD(s2.adr), fmtD(s3.adr)], y);
      y = drawRow(["Occupancy", fmtP1(s1.occ), fmtP1(s2.occ), fmtP1(s3.occ)], y);
      y = drawRow(["Sold Nights", String(s1.soldNights ?? 0), String(s2.soldNights ?? 0), String(s3.soldNights ?? 0)], y);
      y = drawRow(["Gross Before Cleaning", fmtD(s1.grossBeforeCleaning ?? s1.grossRevenue), fmtD(s2.grossBeforeCleaning ?? s2.grossRevenue), fmtD(s3.grossBeforeCleaning ?? s3.grossRevenue)], y);
      y = drawRow(["Gross Revenue", fmtD(s1.grossRevenue), fmtD(s2.grossRevenue), fmtD(s3.grossRevenue)], y, { bold: true });
      y = drawRow(["Platform Fees", fmtD(s1.platformFees), fmtD(s2.platformFees), fmtD(s3.platformFees)], y);
      y = drawRow(["Net Revenue", fmtD(s1.netRevenue), fmtD(s2.netRevenue), fmtD(s3.netRevenue)], y);
      y = drawRow(["Total Expenses", fmtD(s1.totalExpensesAnnual), fmtD(s2.totalExpensesAnnual), fmtD(s3.totalExpensesAnnual)], y);
      y = drawRow(["NOI", fmtD(s1.noi), fmtD(s2.noi), fmtD(s3.noi)], y, { bold: true });
      y = drawRow(["Annual Debt Service", fmtD(calc.annualDebtService), fmtD(calc.annualDebtService), fmtD(calc.annualDebtService)], y);
      y = drawRow(["Net Cash Flow", fmtD(s1.cashFlow), fmtD(s2.cashFlow), fmtD(s3.cashFlow)], y, { highlight: true, bold: true });
      y = drawRow(["Cash-on-Cash Return", fmtP(s1.cashOnCash), fmtP(s2.cashOnCash), fmtP(s3.cashOnCash)], y, { bold: true });
      // Tax benefit returns
      const tr = calc.taxReturns || {};
      if (tr.s1 && tr.s2 && tr.s3) {
        y = drawRow(["CoC w/ Tax Benefits (Yr 1)", fmtP(tr.s1.year1CoCWithTax), fmtP(tr.s2.year1CoCWithTax), fmtP(tr.s3.year1CoCWithTax)], y, { highlight: true, bold: true });
        y = drawRow(["CoC w/ Tax Benefits (Yr 2+)", fmtP(tr.s1.ongoingCoCWithTax), fmtP(tr.s2.ongoingCoCWithTax), fmtP(tr.s3.ongoingCoCWithTax)], y, { highlight: true });
      }
      // Effective cash after tax benefits
      if (calc.netTaxBenefit > 0) {
        y += 4;
        doc.font("Helvetica").fontSize(7).fillColor(brandGreen).text(`Total Cash In Deal: ${fmtD(calc.totalCashNeeded)}  |  Yr 1 Tax Benefit: -${fmtD(calc.netTaxBenefit)}  |  Effective Cash Basis: ${fmtD(Math.max(0, calc.totalCashNeeded - calc.netTaxBenefit))}`, 50, y, { width: W });
        y += 10;
      }
      y = drawRow(["Cap Rate", fmtP(s1.capRate), fmtP(s2.capRate), fmtP(s3.capRate)], y);
      y = drawRow(["DSCR", `${(s1.dscr ?? 0) === Infinity ? "∞" : (s1.dscr ?? 0).toFixed(2)}x`, `${(s2.dscr ?? 0) === Infinity ? "∞" : (s2.dscr ?? 0).toFixed(2)}x`, `${(s3.dscr ?? 0) === Infinity ? "∞" : (s3.dscr ?? 0).toFixed(2)}x`], y);
      y = drawRow(["Break-Even Occupancy", fmtP1(s1.breakEvenOcc), fmtP1(s2.breakEvenOcc), fmtP1(s3.breakEvenOcc)], y);
      y = drawRow(["Payback Period", s1.paybackYears === Infinity ? "N/A" : `${(s1.paybackYears ?? 0).toFixed(1)} yrs`, s2.paybackYears === Infinity ? "N/A" : `${(s2.paybackYears ?? 0).toFixed(1)} yrs`, s3.paybackYears === Infinity ? "N/A" : `${(s3.paybackYears ?? 0).toFixed(1)} yrs`], y);
      y += 10;

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: ACQUISITION + EXPENSES
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      y = 50;

      // Purchase Summary + Loan side by side
      doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Acquisition & Cash to Close", 50, y);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Loan Details", 50 + halfW + 16, y);
      y += 15;

      const leftItems: [string, string][] = [
        ["Purchase Price", fmtD(calc.pp)],
        [`Down Payment (${form.downPaymentPct}%)`, fmtD(calc.downPayment)],
        [`Closing Costs (${form.closingCostsPct}%)`, fmtD(calc.closingCosts)],
        ["Furnishing Budget", fmtD(calc.furnishing ?? 0)],
        ["Renovation Budget", fmtD(parseFloat(String(form.renovationBudget || "0").replace(/[^0-9]/g, "")) || calc.renovation || 0)],
        ["Startup Costs", fmtD(calc.startup ?? 0)],
        ["Inspections", fmtD(calc.inspection ?? 0)],
      ];
      if (calc.sellerCredit > 0) leftItems.push(["Seller Credit", `-${fmtD(calc.sellerCredit)}`]);
      leftItems.push(["Total Cash Needed", fmtD(calc.totalCashNeeded)]);

      const loanTypeName = form.loanType === "dscr" ? "DSCR" : form.loanType === "cash" ? "All Cash" : form.loanType === "conventional_second" ? "Conv. Second Home" : form.loanType === "other" ? "Other" : "Conventional";
      const rightItems: [string, string][] = [
        ["Loan Type", loanTypeName],
        ["Loan Amount", fmtD(calc.loanAmount)],
        ["Interest Rate", `${form.interestRate}%`],
        ["Loan Term", `${form.loanTermYears} years`],
        ["Monthly P&I", fmtD(calc.monthlyMortgage)],
        ["Annual Debt Service", fmtD(calc.annualDebtService)],
      ];

      let ly = y;
      leftItems.forEach(([label, value], i) => {
        const isLast = i === leftItems.length - 1;
        doc.font(isLast ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor(isLast ? brandGreen : "#475569").text(label, 50, ly);
        doc.font(isLast ? "Helvetica-Bold" : "Helvetica").fontSize(7.5).fillColor(isLast ? brandGreen : brandDark).text(value, 50, ly, { width: halfW - 10, align: "right" });
        ly += 11;
      });
      let ry = y;
      rightItems.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(label, 50 + halfW + 16, ry);
        doc.font("Helvetica").fontSize(7.5).fillColor(brandDark).text(value, 50 + halfW + 16, ry, { width: halfW - 10, align: "right" });
        ry += 11;
      });
      y = Math.max(ly, ry) + 6;

      // Channel & Fee info (separate from loan)
      doc.font("Helvetica").fontSize(7).fillColor("#64748b").text(`Channel Mix: Airbnb ${form.channelAirbnbPct}% / Vrbo ${form.channelVrboPct}% / Direct ${form.channelDirectPct}%  |  Blended Platform Fee: ${fmtP1(calc.blendedFeeRate)}`, 50, y, { width: W });
      y += 14;

      // Expenses
      doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Operating Expenses (Base Case — Annual)", 50, y);
      y += 15;

      doc.font("Helvetica-Bold").fontSize(9).fillColor(brandDark).text("Fixed Expenses", 50, y);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(brandDark).text("Variable Expenses", 50 + halfW + 16, y);
      y += 13;

      const fixedExpenses = [
        ["Utilities", form.expUtilities, false],
        ["STR Insurance (insurestr.com)", form.expInsuranceAnnual, true],
        ["Property Tax", form.expPropertyTaxAnnual, true],
        ["HOA/POA", form.expHOA, false],
        ["Internet/Cable", form.expInternet, false],
        ["Landscaping", form.expLandscaping, false],
        ["Pest Control", form.expPestControl, false],
        ["Hot Tub/Pool", form.expHotTubPool, false],
        ["Software (PMS + Pricing)", form.expSoftware, false],
        ["Trash Service", form.expTrash, false],
        ["Smart Locks/Security", form.expSmartLocks, false],
        ["Accounting", form.expAccounting, false],
        ["Permits", form.expPermits, false],
      ].filter(([, v]) => parseFloat(String(v || "0")) > 0);

      // Add custom fixed expenses
      if (form.customFixedExpenses) {
        form.customFixedExpenses.forEach((e: any) => {
          if (e.label && parseFloat(e.amount) > 0) {
            fixedExpenses.push([e.label, e.amount, false]);
          }
        });
      }

      const varExpenses: [string, string][] = [];
      if (parseFloat(form.propertyMgmtPct || "0") > 0) {
        varExpenses.push(["Property Mgmt", `${form.propertyMgmtPct}% of net rev = ${fmtD(s2.mgmtExpense ?? 0)}/yr`]);
      }
      if ((s2.cleaningFeeExpenseTotal ?? s2.cleaningExpense ?? 0) > 0 || (s2.cleaningFeeRevenue ?? 0) > 0) {
        const cleanIncome = s2.cleaningFeeIncome ?? 0;
        const cleanExpPerTurn = s2.cleaningFeeExpensePerTurn ?? 0;
        const bookingCount = Math.round(s2.bookings ?? 0);
        if (cleanIncome > 0) {
          varExpenses.push(["Cleaning Income", `$${Math.round(cleanIncome)}/booking \u00d7 ${bookingCount} = ${fmtD(s2.cleaningFeeRevenue ?? 0)}/yr`]);
        }
        if (cleanExpPerTurn > 0) {
          varExpenses.push(["Cleaning Expense", `$${Math.round(cleanExpPerTurn)}/turn \u00d7 ${bookingCount} = ${fmtD(s2.cleaningFeeExpenseTotal ?? s2.cleaningExpense ?? 0)}/yr`]);
        }
        const netClean = (s2.cleaningNetProfit ?? 0);
        if (cleanIncome > 0 && cleanExpPerTurn > 0) {
          varExpenses.push([`Net Cleaning ${netClean >= 0 ? "Profit" : "Loss"}`, fmtD(netClean) + "/yr"]);
        }
      }
      if (parseFloat(form.capExReservePct || "0") > 0) {
        varExpenses.push(["CapEx Reserve", `${form.capExReservePct}% of gross = ${fmtD(s2.capExReserve ?? 0)}/yr`]);
      }
      // Custom variable expenses
      if (form.customVariableExpenses) {
        form.customVariableExpenses.forEach((e: any) => {
          if (e.label && parseFloat(e.amount) > 0) {
            varExpenses.push([e.label, `${fmtD(parseFloat(e.amount))}/mo = ${fmtD(parseFloat(e.amount) * 12)}/yr`]);
          }
        });
      }

      let fey = y;
      fixedExpenses.forEach(([label, value, isAnnual]) => {
        const v = parseFloat(String(value || "0")) || 0;
        const annual = isAnnual ? v : v * 12;
        const monthly = isAnnual ? Math.round(v / 12) : v;
        doc.font("Helvetica").fontSize(7).fillColor("#475569").text(label as string, 50, fey);
        doc.font("Helvetica").fontSize(7).fillColor(brandDark).text(`${fmtD(monthly)}/mo | ${fmtD(annual)}/yr`, 50, fey, { width: halfW - 10, align: "right" });
        fey += 10;
      });
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(brandGreen).text("Total Fixed", 50, fey);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(brandGreen).text(`${fmtD(calc.fixedMonthly)}/mo | ${fmtD(calc.fixedAnnual)}/yr`, 50, fey, { width: halfW - 10, align: "right" });

      let vey = y;
      varExpenses.forEach(([label, value]) => {
        doc.font("Helvetica").fontSize(7).fillColor("#475569").text(label, 50 + halfW + 16, vey);
        doc.font("Helvetica").fontSize(7).fillColor(brandDark).text(value, 50 + halfW + 16, vey, { width: halfW - 10, align: "right" });
        vey += 10;
      });
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(brandGreen).text("Total Variable", 50 + halfW + 16, vey);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(brandGreen).text(`${fmtD(s2.totalVariableAnnual ?? 0)}/yr`, 50 + halfW + 16, vey, { width: halfW - 10, align: "right" });
      vey += 14;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(brandDark).text("Total All Expenses (Base Case)", 50 + halfW + 16, vey);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(brandGreen).text(`${fmtD(s2.totalExpensesAnnual ?? 0)}/yr`, 50 + halfW + 16, vey, { width: halfW - 10, align: "right" });

      y = Math.max(fey, vey) + 20;

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 3: 5-YEAR PROJECTION + IRR + TAX + COMPS
      // ═══════════════════════════════════════════════════════════════════════
      if (y > 550) { doc.addPage(); y = 50; }

      // 5-Year Projection
      doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("5-Year Projection (Base Case)", 50, y);
      y += 15;
      const projCols = [W * 0.1, W * 0.18, W * 0.16, W * 0.14, W * 0.14, W * 0.14, W * 0.14];
      const drawProjRow = (cells: string[], yPos: number, header = false) => {
        if (header) { doc.rect(50, yPos - 2, W, 14).fill(headerBg); doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff"); }
        else { doc.font("Helvetica").fontSize(7).fillColor(brandDark); }
        let x = 50;
        cells.forEach((c, i) => { doc.text(c, x + 2, yPos, { width: projCols[i] - 4, align: i === 0 ? "left" : "right" }); x += projCols[i]; });
        return yPos + (header ? 14 : 12);
      };

      y = drawProjRow(["Year", "Revenue", "Cash Flow", "Cumul. CF", "Tax Benefit", "Prop. Value", "Equity"], y, true);
      if (calc.fiveYear && Array.isArray(calc.fiveYear) && calc.fiveYear.length > 0) {
        let cumulCF = 0;
        calc.fiveYear.forEach((yr: any, i: number) => {
          cumulCF += yr.cashFlow;
          const taxBen = i === 0 ? (calc.netTaxBenefit || 0) + (calc.ongoingAnnualTaxBenefit || 0) : (calc.ongoingAnnualTaxBenefit || 0);
          y = drawProjRow([`Year ${yr.year}`, fmtD(yr.revenue), fmtD(yr.cashFlow), fmtD(cumulCF), fmtD(taxBen), fmtD(yr.propertyValue), fmtD(yr.equity)], y);
        });
        // Total 5-year return summary
        const totalCF = calc.fiveYear.reduce((s: number, yr: any) => s + yr.cashFlow, 0);
        const totalTax = (calc.netTaxBenefit || 0) + (calc.ongoingAnnualTaxBenefit || 0) * 5;
        const finalEquity = calc.fiveYear[4]?.equity || 0;
        y += 4;
        doc.font("Helvetica-Bold").fontSize(7).fillColor(brandGreen).text(`5-Year Total Return: CF ${fmtD(totalCF)} + Tax Benefits ${fmtD(totalTax)} + Equity ${fmtD(finalEquity)} = ${fmtD(totalCF + totalTax + finalEquity)}`, 50, y, { width: W });
        y += 12;
      }
      y += 8;

      // IRR Table
      if (calc.irr && calc.irr.s1 && calc.irr.s2 && calc.irr.s3) {
        if (y > 560) { doc.addPage(); y = 50; }
        doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Internal Rate of Return (IRR)", 50, y);
        y += 14;
        doc.font("Helvetica").fontSize(6.5).fillColor("#64748b").text(`Assumes ${form.sellingCostsPct || "6"}% selling costs at exit and ${form.propertyAppreciationPct || "4"}% annual property appreciation.`, 50, y, { width: W });
        y += 12;

        // IRR header
        doc.rect(50, y - 2, W, 14).fill(headerBg);
        doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff");
        doc.text("Hold Period", 52, y, { width: 70 });
        doc.text("Conservative", 130, y, { width: 100, align: "center" });
        doc.text("Base Case", 250, y, { width: 100, align: "center" });
        doc.text("Strong Execution", 370, y, { width: 120, align: "center" });
        y += 14;

        doc.rect(50, y - 2, W, 10).fill("#f1f5f9");
        doc.font("Helvetica").fontSize(6).fillColor("#64748b");
        doc.text("", 52, y);
        doc.text("Pre-Tax", 130, y, { width: 50, align: "center" });
        doc.text("After-Tax", 180, y, { width: 50, align: "center" });
        doc.text("Pre-Tax", 250, y, { width: 50, align: "center" });
        doc.text("After-Tax", 300, y, { width: 50, align: "center" });
        doc.text("Pre-Tax", 370, y, { width: 55, align: "center" });
        doc.text("After-Tax", 425, y, { width: 55, align: "center" });
        y += 12;

        const irrRows = [
          { label: "3-Year Hold", s1: calc.irr.s1.y3, s1at: calc.irr.s1.y3at, s2: calc.irr.s2.y3, s2at: calc.irr.s2.y3at, s3: calc.irr.s3.y3, s3at: calc.irr.s3.y3at },
          { label: "5-Year Hold", s1: calc.irr.s1.y5, s1at: calc.irr.s1.y5at, s2: calc.irr.s2.y5, s2at: calc.irr.s2.y5at, s3: calc.irr.s3.y5, s3at: calc.irr.s3.y5at },
          { label: "7-Year Hold", s1: calc.irr.s1.y7, s1at: calc.irr.s1.y7at, s2: calc.irr.s2.y7, s2at: calc.irr.s2.y7at, s3: calc.irr.s3.y7, s3at: calc.irr.s3.y7at },
        ];
        irrRows.forEach(row => {
          doc.font("Helvetica").fontSize(7).fillColor(brandDark);
          doc.text(row.label, 52, y, { width: 70 });
          doc.text(fmtP1(row.s1), 130, y, { width: 50, align: "center" });
          doc.fillColor(brandGreen).text(fmtP1(row.s1at), 180, y, { width: 50, align: "center" });
          doc.fillColor(brandDark).text(fmtP1(row.s2), 250, y, { width: 50, align: "center" });
          doc.fillColor(brandGreen).text(fmtP1(row.s2at), 300, y, { width: 50, align: "center" });
          doc.fillColor(brandDark).text(fmtP1(row.s3), 370, y, { width: 55, align: "center" });
          doc.fillColor(brandGreen).text(fmtP1(row.s3at), 425, y, { width: 55, align: "center" });
          y += 12;
        });

        doc.font("Helvetica").fontSize(6).fillColor("#94a3b8").text("After-tax IRR includes cost segregation / bonus depreciation (Year 1) and straight-line depreciation tax shield (Years 2+).", 50, y, { width: W });
        y += 16;
      }

      // Tax Benefits - simplified (only show Net Tax Benefit unless study cost makes them different)
      if (calc.netTaxBenefit > 0 || calc.taxSavings > 0) {
        if (y > 640) { doc.addPage(); y = 50; }
        doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Estimated Year 1 Tax Benefits", 50, y);
        y += 14;
        const taxItems: [string, string][] = [
          ["Total First-Year Deduction", fmtD(calc.totalFirstYearDeduction ?? 0)],
        ];
        // Only show both Tax Savings and Net Benefit if they differ (i.e., cost seg study cost > 0)
        if (calc.costSegCost > 0 && calc.taxSavings !== calc.netTaxBenefit) {
          taxItems.push([`Tax Savings @ ${form.marginalTaxRate}%`, fmtD(calc.taxSavings ?? 0)]);
          taxItems.push(["Less: Study Cost", `-${fmtD(calc.costSegCost)}`]);
          taxItems.push(["Net Tax Benefit", fmtD(calc.netTaxBenefit ?? 0)]);
        } else {
          taxItems.push([`Net Tax Benefit @ ${form.marginalTaxRate}%`, fmtD(calc.netTaxBenefit ?? 0)]);
        }
        taxItems.forEach(([label, value]) => {
          doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(label, 50, y);
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor(brandGreen).text(value, 50, y, { width: halfW, align: "right" });
          y += 11;
        });
        doc.font("Helvetica").fontSize(6.5).fillColor("#94a3b8").text("* Requires material participation (avg stay ≤7 days). 100% bonus depreciation permanent post Jan 2025. Consult CPA.", 50, y, { width: W });
        y += 16;

        // Ongoing Annual Tax Benefits
        const straightLineDep = calc.straightLineDepreciation ?? (calc.buildingBasis / 27.5);
        const mortgageInterest = calc.year1MortgageInterest ?? (calc.loanAmount * (parseFloat(form.interestRate || "7") / 100));
        const ongoingDeduction = straightLineDep + mortgageInterest;
        const ongoingTaxBenefit = ongoingDeduction * (parseFloat(form.marginalTaxRate || "35") / 100);
        if (ongoingTaxBenefit > 0) {
          if (y > 640) { doc.addPage(); y = 50; }
          doc.font("Helvetica-Bold").fontSize(9).fillColor(brandDark).text("Ongoing Annual Tax Benefits (Year 2+)", 50, y);
          y += 12;
          const ongoingItems: [string, string][] = [
            ["Straight-Line Depreciation (building / 27.5 yrs)", `${fmtD(Math.round(straightLineDep))}/yr`],
          ];
          if (mortgageInterest > 0) ongoingItems.push(["Mortgage Interest Deduction (approx)", `${fmtD(Math.round(mortgageInterest))}/yr`]);
          ongoingItems.push(["Annual Tax Savings", `${fmtD(Math.round(ongoingTaxBenefit))}/yr`]);
          ongoingItems.forEach(([label, value]) => {
            doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(label, 50, y);
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(brandGreen).text(value, 50, y, { width: halfW, align: "right" });
            y += 11;
          });
          y += 8;
        }

        // Returns Including Tax Benefits table
        if (calc.taxReturns) {
          if (y > 600) { doc.addPage(); y = 50; }
          doc.font("Helvetica-Bold").fontSize(9).fillColor(brandGreen).text("Returns Including Tax Benefits", 50, y);
          y += 14;
          const taxRetHeaders = ["", "Conservative", "Base Case", "Strong"];
          const colW2 = W / 4;
          taxRetHeaders.forEach((h, i) => {
            doc.font("Helvetica-Bold").fontSize(7).fillColor(brandDark).text(h, 50 + i * colW2, y, { width: colW2, align: i === 0 ? "left" : "right" });
          });
          y += 11;
          const tr = calc.taxReturns;
          const taxRetRows = [
            ["Year 1 Cash Flow (w/ tax)", fmtD(Math.round(tr.s1?.year1CashFlowWithTax ?? 0)), fmtD(Math.round(tr.s2?.year1CashFlowWithTax ?? 0)), fmtD(Math.round(tr.s3?.year1CashFlowWithTax ?? 0))],
            ["Year 1 CoC Return (w/ tax)", `${((tr.s1?.year1CoCWithTax ?? 0) * 100).toFixed(1)}%`, `${((tr.s2?.year1CoCWithTax ?? 0) * 100).toFixed(1)}%`, `${((tr.s3?.year1CoCWithTax ?? 0) * 100).toFixed(1)}%`],
            ["Ongoing Cash Flow (yr 2+)", fmtD(Math.round(tr.s1?.ongoingCashFlowWithTax ?? 0)), fmtD(Math.round(tr.s2?.ongoingCashFlowWithTax ?? 0)), fmtD(Math.round(tr.s3?.ongoingCashFlowWithTax ?? 0))],
            ["Ongoing CoC Return (yr 2+)", `${((tr.s1?.ongoingCoCWithTax ?? 0) * 100).toFixed(1)}%`, `${((tr.s2?.ongoingCoCWithTax ?? 0) * 100).toFixed(1)}%`, `${((tr.s3?.ongoingCoCWithTax ?? 0) * 100).toFixed(1)}%`],
          ];
          taxRetRows.forEach(row => {
            row.forEach((cell, i) => {
              doc.font(i === 0 ? "Helvetica" : "Helvetica-Bold").fontSize(7.5).fillColor(i === 0 ? "#475569" : brandGreen).text(cell, 50 + i * colW2, y, { width: colW2, align: i === 0 ? "left" : "right" });
            });
            y += 11;
          });
          y += 8;
        }
      }

      // Comps - photo on left, info on right (compact layout)
      if (form.comps && form.comps.length > 0) {
        if (y > 500) { doc.addPage(); y = 50; }
        doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Revenue Comparable Properties", 50, y);
        y += 15;
        for (const [i, comp] of form.comps.entries()) {
          if (y > 620) { doc.addPage(); y = 50; }
          const compStartY = y;
          const photoW = 90;
          const photoH = 65;
          let textX = 50;

          // Photo on the left
          if (comp.photoUrl) {
            try {
              const photoBuffer = await fetchImage(comp.photoUrl);
              doc.image(photoBuffer, 50, y, { fit: [photoW, photoH], align: "center", valign: "center" });
              textX = 50 + photoW + 10;
            } catch { textX = 50; }
          }

          // Info to the right of photo
          const textW = W - (textX - 50);
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor(brandDark).text(`Comp ${i + 1}: ${comp.name || "\u2014"}`, textX, y, { width: textW });
          y += 12;
          // Revenue line
          const compAdr = parseFloat(String(comp.adr || "0").replace(/[$,]/g, ""));
          const compOcc = parseFloat(String(comp.occupancy || "0").replace(/%/g, "")) / 100;
          const compRev = compAdr > 0 && compOcc > 0 ? Math.round(compAdr * compOcc * 365) : 0;
          if (compRev > 0) {
            doc.font("Helvetica-Bold").fontSize(8).fillColor(brandGreen).text(`${fmtD(compRev)}/yr`, textX, y, { width: textW });
            y += 11;
          }
          // Details line
          const details = [];
          if (comp.adr) details.push(`ADR: $${String(comp.adr).replace(/[$]/g, "")}`);
          if (comp.occupancy) details.push(`Occ: ${comp.occupancy}%`);
          if (comp.beds) details.push(`${comp.beds} beds`);
          if (comp.city) details.push(comp.city);
          if (comp.rating) details.push(`\u2b50 ${comp.rating}${comp.reviewCount ? ` (${comp.reviewCount})` : ""}`);
          if (details.length) { doc.font("Helvetica").fontSize(7).fillColor("#64748b").text(details.join("  \u2022  "), textX, y, { width: textW }); y += 10; }
          if (comp.notes) { doc.font("Helvetica").fontSize(6.5).fillColor("#94a3b8").text(comp.notes, textX, y, { width: textW }); y += 10; }
          if (comp.link) { doc.font("Helvetica").fontSize(6).fillColor("#3b82f6").text(comp.link, textX, y, { link: comp.link, underline: true, width: textW }); y += 9; }
          // Ensure we advance past the photo height
          y = Math.max(y, compStartY + photoH) + 8;
        }
        y += 4;
      }

      // Revenue Methodology
      if (form.revenueMethodology) {
        if (y > 620) { doc.addPage(); y = 50; }
        doc.font("Helvetica-Bold").fontSize(9).fillColor(brandDark).text("Revenue Methodology", 50, y);
        y += 13;
        doc.font("Helvetica").fontSize(7).fillColor("#475569").text(form.revenueMethodology, 50, y, { width: W, lineGap: 2 });
        y += 50;
      }

      // ─── VALUE-ADD / CASH-OUT REFI PAGE ──────────────────────────────────
      if (calc.isValueAdd && calc.arv > 0) {
        doc.addPage(); y = 50;
        doc.font("Helvetica-Bold").fontSize(14).fillColor(brandGreen).text("Value-Add & Refinance Analysis", 50, y);
        y += 22;

        // Equity Creation
        doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Equity Creation Summary", 50, y);
        y += 14;
        const renoVal = parseFloat(String(form.renovationBudget || "0").replace(/[^0-9]/g, "")) || calc.renovation || 0;
        const eqItems = [
          ["Purchase Price", fmtD(calc.pp)],
          ["Renovation Budget", fmtD(renoVal)],
          ["All-In Cost", fmtD(calc.pp + renoVal)],
          ["After Repair Value (ARV)", fmtD(calc.arv)],
          ["Forced Equity (ARV - Purchase)", fmtD(calc.forcedEquity)],
          ["Net Equity Created (ARV - All-In)", fmtD(calc.equityCreatedByReno)],
        ];
        eqItems.forEach(([label, value]) => {
          doc.font("Helvetica").fontSize(8).fillColor("#475569").text(label as string, 50, y);
          doc.font("Helvetica-Bold").fontSize(8).fillColor(brandGreen).text(value as string, 50, y, { width: halfW, align: "right" });
          y += 12;
        });
        y += 10;

        // Cash-Out Refi section
        if (calc.isCashoutRefi && calc.refi && calc.refi.refiNewLoanAmount) {
          doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Cash-Out Refinance Details", 50, y);
          y += 14;

          // Timeline
          doc.font("Helvetica-Bold").fontSize(8).fillColor("#1e40af").text("Holding Period Timeline:", 50, y);
          y += 12;
          doc.font("Helvetica").fontSize(7.5).fillColor("#92400e").text(`Months 1–${calc.refi.seasoningMonths}: Original Mortgage (${fmtD(calc.monthlyMortgage)}/mo)`, 60, y);
          y += 11;
          doc.font("Helvetica").fontSize(7.5).fillColor(brandGreen).text(`Month ${calc.refi.seasoningMonths + 1}+: New Mortgage after Cash-Out Refi (${fmtD(calc.refi.refiMonthlyMortgage)}/mo)`, 60, y);
          y += 16;

          const refiItems = [
            ["Appraised Value", fmtD(calc.refi.refiAppraised)],
            ["LTV", `${form.refiLTV || "75"}%`],
            ["New Loan Amount", fmtD(calc.refi.refiNewLoanAmount)],
            ["Original Loan Payoff", fmtD(calc.loanAmount)],
            ["Cash Out", fmtD(calc.refi.refiCashOut)],
            ["New Monthly Payment", fmtD(calc.refi.refiMonthlyMortgage)],
            ["New Annual Debt Service", fmtD(calc.refi.refiAnnualDebtService)],
            ["Cash Left in Deal", calc.refi.cashLeftInDeal <= 0 ? "$0 (pulled out more!)" : fmtD(calc.refi.cashLeftInDeal)],
          ];
          refiItems.forEach(([label, value]) => {
            doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(label as string, 50, y);
            doc.font("Helvetica").fontSize(7.5).fillColor(brandDark).text(value as string, 50, y, { width: halfW, align: "right" });
            y += 11;
          });
          y += 12;

          // Pre vs Post Refi comparison table
          doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Pre-Refi vs. Post-Refi Returns", 50, y);
          y += 14;

          // Header row
          doc.rect(50, y - 2, W, 14).fill(headerBg);
          doc.font("Helvetica-Bold").fontSize(7).fillColor("#ffffff");
          doc.text("Metric", 52, y, { width: 90 });
          doc.text("Pre-Refi", 160, y, { width: 150, align: "center" });
          doc.text("Post-Refi", 340, y, { width: 150, align: "center" });
          y += 14;

          // Sub-header
          doc.rect(50, y - 2, W, 10).fill("#f1f5f9");
          doc.font("Helvetica").fontSize(6).fillColor("#64748b");
          doc.text("", 52, y);
          doc.text("Cons.", 160, y, { width: 50, align: "center" });
          doc.text("Base", 210, y, { width: 50, align: "center" });
          doc.text("Strong", 260, y, { width: 50, align: "center" });
          doc.text("Cons.", 340, y, { width: 50, align: "center" });
          doc.text("Base", 390, y, { width: 50, align: "center" });
          doc.text("Strong", 440, y, { width: 50, align: "center" });
          y += 12;

          const rs1 = calc.refi.s1 || {}, rs2 = calc.refi.s2 || {}, rs3 = calc.refi.s3 || {};
          const compRows = [
            { label: "Annual Cash Flow", pre: [calc.s1.cashFlow, calc.s2.cashFlow, calc.s3.cashFlow], post: [rs1.postRefiCashFlow ?? 0, rs2.postRefiCashFlow ?? 0, rs3.postRefiCashFlow ?? 0] },
            { label: "Monthly Cash Flow", pre: [calc.s1.monthlyCashFlow, calc.s2.monthlyCashFlow, calc.s3.monthlyCashFlow], post: [rs1.postRefiMonthlyCF ?? 0, rs2.postRefiMonthlyCF ?? 0, rs3.postRefiMonthlyCF ?? 0] },
            { label: "Cash-on-Cash (excl. tax)", pre: [calc.s1.cashOnCash, calc.s2.cashOnCash, calc.s3.cashOnCash], post: [rs1.postRefiCoC ?? 0, rs2.postRefiCoC ?? 0, rs3.postRefiCoC ?? 0], isPct: true, highlight: true },
            { label: "DSCR", pre: [calc.s1.dscr, calc.s2.dscr, calc.s3.dscr], post: [rs1.postRefiDSCR ?? 0, rs2.postRefiDSCR ?? 0, rs3.postRefiDSCR ?? 0], isDscr: true },
          ];

          compRows.forEach(row => {
            if ((row as any).highlight) { doc.rect(50, y - 2, W, 12).fill("#ecfeff"); }
            doc.font("Helvetica").fontSize(7).fillColor(brandDark).text(row.label, 52, y, { width: 90 });
            row.pre.forEach((v: number, i: number) => {
              const txt = (row as any).isPct ? fmtP1(v) : (row as any).isDscr ? (v === Infinity ? "∞" : `${v.toFixed(2)}x`) : fmtD(v);
              doc.fillColor(brandDark).text(txt, 160 + i * 50, y, { width: 50, align: "center" });
            });
            row.post.forEach((v: number, i: number) => {
              const inf = (row as any).isPct && calc.refi.cashLeftInDeal <= 0 && v > 5;
              const txt = inf ? "∞" : (row as any).isPct ? fmtP1(v) : (row as any).isDscr ? (v === Infinity ? "∞" : `${v.toFixed(2)}x`) : fmtD(v);
              doc.fillColor(brandGreen).text(txt, 340 + i * 50, y, { width: 50, align: "center" });
            });
            y += 12;
          });

          if (calc.refi.cashLeftInDeal <= 0) {
            y += 4;
            doc.font("Helvetica-Bold").fontSize(7).fillColor(brandGreen).text("✨ Client pulls out more cash than invested — infinite cash-on-cash return with positive monthly cash flow.", 50, y, { width: W });
            y += 14;
          }
        }
      }

      // Additional Notes & Assumptions
      if (form.notes) {
        if (y > 580) { doc.addPage(); y = 50; }
        doc.font("Helvetica-Bold").fontSize(10).fillColor(brandDark).text("Additional Notes & Assumptions", 50, y);
        y += 14;
        doc.font("Helvetica").fontSize(7.5).fillColor("#475569").text(form.notes, 50, y, { width: W, lineGap: 2 });
        const notesHeight = doc.heightOfString(form.notes, { width: W, lineGap: 2 });
        y += Math.min(notesHeight, 200) + 12;
      }



      // Disclaimer
      if (y > 660) { doc.addPage(); y = 50; }
      y += 10;
      doc.font("Helvetica").fontSize(6).fillColor("#94a3b8").text(
        "Disclaimer: This pro-forma is for informational purposes only and does not constitute financial, tax, or investment advice. All projections are estimates based on assumed inputs and comparable data. Actual results may vary materially. Revenue projections assume competent management, competitive pricing, and no material regulatory changes. Platform fee structures (Airbnb 15.5% host-only, Vrbo 8%) are current as of 2026 and subject to change. Tax benefit estimates require material participation and CPA verification. Consult licensed professionals before making investment decisions.",
        50, y, { width: W, lineGap: 1 }
      );

      // Footer on each page
      const pageCount = doc.bufferedPageRange().count;
      for (let p = 0; p < pageCount; p++) {
        doc.switchToPage(p);
        doc.font("Helvetica").fontSize(7).fillColor("#94a3b8").text(`SavvyProforma  |  Generated ${new Date().toLocaleDateString()}  |  Page ${p + 1} of ${pageCount}`, 50, 730, { width: W, align: "center" });
      }

      doc.flushPages();
      doc.end();
      const pdfBuffer = await pdfDone;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="SavvyProforma.pdf"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("[ProformaPDF] Error:", err);
      return res.status(500).json({ error: err.message ?? "PDF generation failed" });
    }
  });
}
