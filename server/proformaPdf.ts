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

      const doc = new PDFDocument({ size: "LETTER", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      const pdfDone = new Promise<Buffer>((resolve) => { doc.on("end", () => resolve(Buffer.concat(buffers))); });

      const W = 512; // page width minus margins
      const brandGreen = "#1a5c3a";
      const brandDark = "#1e293b";
      const lightGray = "#f8fafc";
      const headerBg = "#0f4c2e";

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: COVER + EXECUTIVE SUMMARY
      // ═══════════════════════════════════════════════════════════════════════
      // Logo
      try {
        const logoBuffer = await fetchImage("https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png");
        doc.image(logoBuffer, 50, 35, { width: 110 });
      } catch { doc.fontSize(14).fillColor(brandGreen).text("SAVVY STR AGENTS", 50, 40); }

      // Agent branding (right)
      if (branding) {
        let bx = 380, by = 35;
        if (branding.profilePhotoUrl) {
          try { const img = await fetchImage(branding.profilePhotoUrl); doc.image(img, bx + 100, by, { width: 45, height: 45 }); } catch {}
        }
        doc.fontSize(10).fillColor(brandDark).text(branding.name ?? "", bx, by);
        by += 13;
        if (branding.market) { doc.fontSize(7.5).fillColor("#64748b").text(branding.market, bx, by); by += 10; }
        if (branding.email) { doc.fontSize(7.5).fillColor("#64748b").text(branding.email, bx, by); by += 10; }
        if (branding.phone) { doc.fontSize(7.5).fillColor("#64748b").text(branding.phone, bx, by); by += 10; }
        if (branding.callBookingLink) { doc.fontSize(7.5).fillColor(brandGreen).text("Book a Call", bx, by, { link: branding.callBookingLink, underline: true }); }
      }

      // Title
      let y = 100;
      doc.fontSize(18).fillColor(brandDark).text(title || "STR Investment Pro-forma", 50, y);
      y += 24;
      if (property) {
        const addr = [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ");
        doc.fontSize(11).fillColor("#475569").text(addr, 50, y);
        y += 16;
        const details = [];
        if (property.beds) details.push(`${property.beds} Beds`);
        if (property.baths) details.push(`${property.baths} Baths`);
        if (property.sqft) details.push(`${Number(property.sqft).toLocaleString()} sqft`);
        if (details.length) { doc.fontSize(8.5).fillColor("#94a3b8").text(details.join(" | "), 50, y); y += 12; }
      }
      doc.fontSize(7.5).fillColor("#94a3b8").text(`Report Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 50, y);
      y += 6;

      // Property photo (from Zillow import)
      if (form.propertyPhotoUrl) {
        try {
          const propPhoto = await fetchImage(form.propertyPhotoUrl);
          doc.image(propPhoto, 50, y, { width: W, height: 120 });
          y += 126;
        } catch { y += 14; }
      } else {
        y += 14;
      }

      // Key Metrics Boxes
      const boxW = W / 4 - 6;
      const metrics = [
        { label: "Total Cash Needed", value: fmtD(calc.totalCashNeeded) },
        { label: "Monthly Mortgage", value: fmtD(calc.monthlyMortgage) },
        { label: "Base Case Cash Flow", value: fmtD(calc.s2?.cashFlow ?? 0) },
        { label: "Cash-on-Cash Return", value: fmtP(calc.s2?.cashOnCash ?? 0) },
      ];
      metrics.forEach((m, i) => {
        const bx = 50 + i * (boxW + 8);
        doc.roundedRect(bx, y, boxW, 44, 4).fill(lightGray);
        doc.fontSize(6.5).fillColor("#64748b").text(m.label, bx + 4, y + 7, { width: boxW - 8, align: "center" });
        doc.fontSize(11).fillColor(brandDark).text(m.value, bx + 4, y + 21, { width: boxW - 8, align: "center" });
      });
      y += 56;

      // Additional metrics row
      const metrics2 = [
        { label: "Cap Rate", value: fmtP(calc.s2?.capRate ?? 0) },
        { label: "DSCR", value: `${(calc.s2?.dscr ?? 0).toFixed(2)}x` },
        { label: "Break-Even Occ.", value: fmtP1(calc.s2?.breakEvenOcc ?? 0) },
        { label: "Net Tax Benefit", value: fmtD(calc.netTaxBenefit ?? 0) },
      ];
      metrics2.forEach((m, i) => {
        const bx = 50 + i * (boxW + 8);
        doc.roundedRect(bx, y, boxW, 38, 4).fill("#ecfdf5");
        doc.fontSize(6.5).fillColor("#64748b").text(m.label, bx + 4, y + 6, { width: boxW - 8, align: "center" });
        doc.fontSize(10).fillColor(brandGreen).text(m.value, bx + 4, y + 19, { width: boxW - 8, align: "center" });
      });
      y += 50;

      // ─── SCENARIO COMPARISON TABLE ───────────────────────────────────────
      doc.fontSize(11).fillColor(brandDark).text("Scenario Comparison", 50, y, { underline: true });
      y += 16;

      const colW = [W * 0.32, W * 0.22, W * 0.23, W * 0.23];
      const drawRow = (cells: string[], yPos: number, opts?: { header?: boolean; bold?: boolean; highlight?: boolean }) => {
        if (opts?.header) { doc.rect(50, yPos - 2, W, 15).fill(headerBg); doc.fontSize(7.5).fillColor("#ffffff"); }
        else if (opts?.highlight) { doc.rect(50, yPos - 2, W, 13).fill("#ecfdf5"); doc.fontSize(7.5).fillColor(brandDark); }
        else { doc.fontSize(7.5).fillColor(opts?.bold ? brandDark : "#475569"); }
        let x = 50;
        cells.forEach((c, i) => {
          const align = i === 0 ? "left" : "right";
          doc.text(c, x + 3, yPos, { width: colW[i] - 6, align });
          x += colW[i];
        });
        return yPos + (opts?.header ? 15 : 13);
      };

      const s1 = calc.s1 || {}, s2 = calc.s2 || {}, s3 = calc.s3 || {};
      y = drawRow(["Metric", "Conservative", "Base Case", "Strong Execution"], y, { header: true });
      y = drawRow(["ADR", fmtD(s1.adr), fmtD(s2.adr), fmtD(s3.adr)], y);
      y = drawRow(["Occupancy", fmtP1(s1.occ), fmtP1(s2.occ), fmtP1(s3.occ)], y);
      y = drawRow(["Sold Nights", String(s1.soldNights ?? 0), String(s2.soldNights ?? 0), String(s3.soldNights ?? 0)], y);
      y = drawRow(["Gross Revenue", fmtD(s1.grossRevenue), fmtD(s2.grossRevenue), fmtD(s3.grossRevenue)], y, { bold: true });
      y = drawRow(["Platform Fees", fmtD(s1.platformFees), fmtD(s2.platformFees), fmtD(s3.platformFees)], y);
      y = drawRow(["Net Revenue", fmtD(s1.netRevenue), fmtD(s2.netRevenue), fmtD(s3.netRevenue)], y);
      y = drawRow(["Total Expenses", fmtD(s1.totalExpensesAnnual), fmtD(s2.totalExpensesAnnual), fmtD(s3.totalExpensesAnnual)], y);
      y = drawRow(["NOI", fmtD(s1.noi), fmtD(s2.noi), fmtD(s3.noi)], y, { bold: true });
      y = drawRow(["Annual Debt Service", fmtD(calc.annualDebtService), fmtD(calc.annualDebtService), fmtD(calc.annualDebtService)], y);
      y = drawRow(["Net Cash Flow", fmtD(s1.cashFlow), fmtD(s2.cashFlow), fmtD(s3.cashFlow)], y, { highlight: true, bold: true });
      y = drawRow(["Cash-on-Cash Return", fmtP(s1.cashOnCash), fmtP(s2.cashOnCash), fmtP(s3.cashOnCash)], y, { bold: true });
      y = drawRow(["Cap Rate", fmtP(s1.capRate), fmtP(s2.capRate), fmtP(s3.capRate)], y);
      y = drawRow(["DSCR", `${(s1.dscr ?? 0).toFixed(2)}x`, `${(s2.dscr ?? 0).toFixed(2)}x`, `${(s3.dscr ?? 0).toFixed(2)}x`], y);
      y = drawRow(["Break-Even Occupancy", fmtP1(s1.breakEvenOcc), fmtP1(s2.breakEvenOcc), fmtP1(s3.breakEvenOcc)], y);
      y = drawRow(["Payback Period", s1.paybackYears === Infinity ? "N/A" : `${(s1.paybackYears ?? 0).toFixed(1)} yrs`, s2.paybackYears === Infinity ? "N/A" : `${(s2.paybackYears ?? 0).toFixed(1)} yrs`, s3.paybackYears === Infinity ? "N/A" : `${(s3.paybackYears ?? 0).toFixed(1)} yrs`], y);
      y += 10;

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: ACQUISITION + EXPENSES
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();
      y = 50;

      // Purchase Summary + Loan side by side
      const halfW = W / 2 - 8;
      doc.fontSize(10).fillColor(brandDark).text("Acquisition & Cash to Close", 50, y, { underline: true });
      doc.fontSize(10).fillColor(brandDark).text("Loan Details", 50 + halfW + 16, y, { underline: true });
      y += 15;

      const leftItems: [string, string][] = [
        ["Purchase Price", fmtD(calc.pp)],
        [`Down Payment (${form.downPaymentPct}%)`, fmtD(calc.downPayment)],
        [`Closing Costs (${form.closingCostsPct}%)`, fmtD(calc.closingCosts)],
        ["Furnishing Budget", fmtD(calc.furnishing ?? 0)],
        ["Renovation Budget", fmtD(calc.renovation ?? 0)],
        ["Startup Costs", fmtD(calc.startup ?? 0)],
        ["Inspections", fmtD(calc.inspection ?? 0)],
      ];
      if (calc.sellerCredit > 0) leftItems.push(["Seller Credit", `-${fmtD(calc.sellerCredit)}`]);
      leftItems.push(["Total Cash Needed", fmtD(calc.totalCashNeeded)]);
      const rightItems = [
        ["Loan Amount", fmtD(calc.loanAmount)],
        ["Interest Rate", `${form.interestRate}%`],
        ["Loan Term", `${form.loanTermYears} years`],
        ["Loan Type", form.loanType === "dscr" ? "DSCR" : form.loanType === "cash" ? "Cash" : "Conventional"],
        ["Monthly P&I", fmtD(calc.monthlyMortgage)],
        ["Annual Debt Service", fmtD(calc.annualDebtService)],
        ["Blended Platform Fee", fmtP1(calc.blendedFeeRate)],
        ["Channel Mix", `Airbnb ${form.channelAirbnbPct}% / Vrbo ${form.channelVrboPct}% / Direct ${form.channelDirectPct}%`],
      ];

      let ly = y;
      leftItems.forEach(([label, value], i) => {
        const isLast = i === leftItems.length - 1;
        doc.fontSize(7.5).fillColor(isLast ? brandGreen : "#475569").text(label, 50, ly);
        doc.fontSize(7.5).fillColor(isLast ? brandGreen : brandDark).text(value, 50, ly, { width: halfW - 10, align: "right" });
        ly += 11;
      });
      let ry = y;
      rightItems.forEach(([label, value]) => {
        doc.fontSize(7.5).fillColor("#475569").text(label, 50 + halfW + 16, ry);
        doc.fontSize(7.5).fillColor(brandDark).text(value, 50 + halfW + 16, ry, { width: halfW - 10, align: "right" });
        ry += 11;
      });
      y = Math.max(ly, ry) + 14;

      // Expenses
      doc.fontSize(10).fillColor(brandDark).text("Operating Expenses (Base Case — Annual)", 50, y, { underline: true });
      y += 15;

      doc.fontSize(10).fillColor(brandDark).text("Fixed Expenses", 50, y);
      doc.fontSize(10).fillColor(brandDark).text("Variable Expenses", 50 + halfW + 16, y);
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
      ].filter(([, v]) => parseFloat(v as string) > 0);

      const varExpenses: [string, string][] = [
        ["Property Mgmt", `${form.propertyMgmtPct}% of net rev → ${fmtD(s2.mgmtExpense ?? 0)}/yr`],
        ["Cleaning", `${fmtD(parseFloat(form.cleaningCostPerTurn || "0"))}/turn → ${fmtD(s2.cleaningExpense ?? 0)}/yr`],
        ["CapEx Reserve", `${form.capExReservePct}% of gross → ${fmtD(s2.capExReserve ?? 0)}/yr`],
      ];
      // Add custom variable expenses
      if (form.customVariableExpenses) {
        form.customVariableExpenses.forEach((e: any) => {
          if (e.label && parseFloat(e.amount) > 0) {
            varExpenses.push([e.label, `${fmtD(parseFloat(e.amount))}/mo → ${fmtD(parseFloat(e.amount) * 12)}/yr`]);
          }
        });
      }

      let fey = y;
      fixedExpenses.forEach(([label, value, isAnnual]) => {
        const v = parseFloat(value as string) || 0;
        const annual = isAnnual ? v : v * 12;
        const monthly = isAnnual ? v / 12 : v;
        doc.fontSize(7).fillColor("#475569").text(label as string, 50, fey);
        doc.fontSize(7).fillColor(brandDark).text(`${fmtD(monthly)}/mo | ${fmtD(annual)}/yr`, 50, fey, { width: halfW - 10, align: "right" });
        fey += 10;
      });
      doc.fontSize(7.5).fillColor(brandGreen).text("Total Fixed", 50, fey);
      doc.fontSize(7.5).fillColor(brandGreen).text(`${fmtD(calc.fixedMonthly)}/mo | ${fmtD(calc.fixedAnnual)}/yr`, 50, fey, { width: halfW - 10, align: "right" });

      let vey = y;
      varExpenses.forEach(([label, value]) => {
        doc.fontSize(7).fillColor("#475569").text(label, 50 + halfW + 16, vey);
        doc.fontSize(7).fillColor(brandDark).text(value, 50 + halfW + 16, vey, { width: halfW - 10, align: "right" });
        vey += 10;
      });
      doc.fontSize(7.5).fillColor(brandGreen).text("Total Variable", 50 + halfW + 16, vey);
      doc.fontSize(7.5).fillColor(brandGreen).text(`${fmtD(s2.totalVariableAnnual ?? 0)}/yr`, 50 + halfW + 16, vey, { width: halfW - 10, align: "right" });
      vey += 14;
      doc.fontSize(8).fillColor(brandDark).text("Total All Expenses (Base Case)", 50 + halfW + 16, vey);
      doc.fontSize(8).fillColor(brandGreen).text(`${fmtD(s2.totalExpensesAnnual ?? 0)}/yr`, 50 + halfW + 16, vey, { width: halfW - 10, align: "right" });

      y = Math.max(fey, vey) + 20;

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 3: 5-YEAR PROJECTION + TAX + COMPS
      // ═══════════════════════════════════════════════════════════════════════
      if (y > 550) { doc.addPage(); y = 50; }

      // 5-Year Projection
      doc.fontSize(10).fillColor(brandDark).text("5-Year Projection (Base Case)", 50, y, { underline: true });
      y += 15;
      const projCols = [W * 0.1, W * 0.18, W * 0.16, W * 0.14, W * 0.14, W * 0.14, W * 0.14];
      const drawProjRow = (cells: string[], yPos: number, header = false) => {
        if (header) { doc.rect(50, yPos - 2, W, 14).fill(headerBg); doc.fontSize(7).fillColor("#ffffff"); }
        else { doc.fontSize(7).fillColor(brandDark); }
        let x = 50;
        cells.forEach((c, i) => { doc.text(c, x + 2, yPos, { width: projCols[i] - 4, align: i === 0 ? "left" : "right" }); x += projCols[i]; });
        return yPos + (header ? 14 : 12);
      };

      y = drawProjRow(["Year", "Net Revenue", "Expenses", "NOI", "Cash Flow", "Prop. Value", "Equity"], y, true);
      if (calc.fiveYear && Array.isArray(calc.fiveYear) && calc.fiveYear.length > 0) {
        calc.fiveYear.forEach((yr: any) => {
          y = drawProjRow([`Year ${yr.year}`, fmtD(yr.revenue), fmtD(yr.expenses), fmtD(yr.noi), fmtD(yr.cashFlow), fmtD(yr.propertyValue), fmtD(yr.equity)], y);
        });
      }
      y += 12;

      // IRR Table
      if (calc.irr && calc.irr.s1 && calc.irr.s2 && calc.irr.s3) {
        if (y > 560) { doc.addPage(); y = 50; }
        doc.fontSize(10).fillColor(brandDark).text("Internal Rate of Return (IRR)", 50, y, { underline: true });
        y += 14;
        doc.fontSize(6.5).fillColor("#64748b").text(`Assumes ${form.sellingCostsPct || "6"}% selling costs at exit and ${form.propertyAppreciationPct || "4"}% annual property appreciation.`, 50, y, { width: W });
        y += 12;

        // IRR header
        const irrColW = [W * 0.16, W * 0.12, W * 0.16, W * 0.12, W * 0.16, W * 0.12, W * 0.16];
        const drawIrrRow = (cells: string[], yPos: number, header = false, subheader = false) => {
          if (header) { doc.rect(50, yPos - 2, W, 14).fill(headerBg); doc.fontSize(7).fillColor("#ffffff"); }
          else if (subheader) { doc.rect(50, yPos - 2, W, 12).fill("#f1f5f9"); doc.fontSize(6).fillColor("#64748b"); }
          else { doc.fontSize(7).fillColor(brandDark); }
          let x = 50;
          cells.forEach((c, i) => { doc.text(c, x + 2, yPos, { width: irrColW[i] - 4, align: i === 0 ? "left" : "right" }); x += irrColW[i]; });
          return yPos + (header ? 14 : 12);
        };

        y = drawIrrRow(["Hold Period", "Cons.", "Pre-Tax", "Cons.", "After-Tax", "Base", "Pre-Tax"], y, true);
        // Actually let's do a cleaner layout
        y -= 14; // undo the header
        // Simpler: two-row header
        doc.rect(50, y - 2, W, 14).fill(headerBg);
        doc.fontSize(7).fillColor("#ffffff");
        doc.text("Hold Period", 52, y, { width: 70 });
        doc.text("Conservative", 130, y, { width: 100, align: "center" });
        doc.text("Base Case", 250, y, { width: 100, align: "center" });
        doc.text("Strong Execution", 370, y, { width: 120, align: "center" });
        y += 14;

        doc.rect(50, y - 2, W, 10).fill("#f1f5f9");
        doc.fontSize(6).fillColor("#64748b");
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
          doc.fontSize(7).fillColor(brandDark);
          doc.text(row.label, 52, y, { width: 70 });
          doc.text(fmtP1(row.s1), 130, y, { width: 50, align: "center" });
          doc.fillColor(brandGreen).text(fmtP1(row.s1at), 180, y, { width: 50, align: "center" });
          doc.fillColor(brandDark).text(fmtP1(row.s2), 250, y, { width: 50, align: "center" });
          doc.fillColor(brandGreen).text(fmtP1(row.s2at), 300, y, { width: 50, align: "center" });
          doc.fillColor(brandDark).text(fmtP1(row.s3), 370, y, { width: 55, align: "center" });
          doc.fillColor(brandGreen).text(fmtP1(row.s3at), 425, y, { width: 55, align: "center" });
          y += 12;
        });

        doc.fontSize(6).fillColor("#94a3b8").text("After-tax IRR includes cost segregation / bonus depreciation (Year 1) and straight-line depreciation tax shield (Years 2+).", 50, y, { width: W });
        y += 16;
      }

      // Tax Benefits
      if (calc.taxSavings > 0 || calc.netTaxBenefit > 0) {
        doc.fontSize(10).fillColor(brandDark).text("Estimated Year 1 Tax Benefits", 50, y, { underline: true });
        y += 14;
        const taxItems = [
          ["Total First-Year Deduction", fmtD(calc.totalFirstYearDeduction ?? 0)],
          [`Tax Savings @ ${form.marginalTaxRate}%`, fmtD(calc.taxSavings ?? 0)],
          ["Net Tax Benefit", fmtD(calc.netTaxBenefit ?? 0)],
        ];
        taxItems.forEach(([label, value]) => {
          doc.fontSize(7.5).fillColor("#475569").text(label, 50, y);
          doc.fontSize(7.5).fillColor(brandGreen).text(value, 50, y, { width: halfW, align: "right" });
          y += 11;
        });
        doc.fontSize(6.5).fillColor("#94a3b8").text("* Requires material participation (avg stay ≤7 days). 100% bonus depreciation permanent post Jan 2025. Consult CPA.", 50, y, { width: W });
        y += 16;
      }

      // Comps
      if (form.comps && form.comps.length > 0) {
        if (y > 540) { doc.addPage(); y = 50; }
        doc.fontSize(10).fillColor(brandDark).text("Revenue Comparable Properties", 50, y, { underline: true });
        y += 15;
        for (const [i, comp] of form.comps.entries()) {
          if (y > 680) { doc.addPage(); y = 50; }
          // Try to include comp photo
          let photoLoaded = false;
          if (comp.photoUrl) {
            try {
              const photoBuffer = await fetchImage(comp.photoUrl);
              doc.image(photoBuffer, 50, y, { width: 40, height: 30 });
              photoLoaded = true;
            } catch {}
          }
          const textX = photoLoaded ? 96 : 50;
          doc.fontSize(7.5).fillColor(brandDark).text(`Comp ${i + 1}: ${comp.name || "—"}`, textX, y);
          const details = [];
          if (comp.annualRevenue) details.push(`Rev: ${comp.annualRevenue}`);
          if (comp.occupancy) details.push(`Occ: ${comp.occupancy}%`);
          if (comp.adr) details.push(`ADR: ${comp.adr}`);
          if (comp.beds) details.push(`${comp.beds} beds`);
          if (comp.city) details.push(comp.city);
          if (comp.rating) details.push(`⭐ ${comp.rating}${comp.reviewCount ? ` (${comp.reviewCount})` : ""}`);
          doc.fontSize(7).fillColor("#64748b").text(details.join(" | ") + (comp.notes ? ` — ${comp.notes}` : ""), textX, y + 10, { width: W - (photoLoaded ? 46 : 0) });
          y += photoLoaded ? 36 : 24;
        }
        y += 8;
      }

      // Revenue Methodology
      if (form.revenueMethodology) {
        if (y > 620) { doc.addPage(); y = 50; }
        doc.fontSize(9).fillColor(brandDark).text("Revenue Methodology", 50, y, { underline: true });
        y += 13;
        doc.fontSize(7).fillColor("#475569").text(form.revenueMethodology, 50, y, { width: W, lineGap: 2 });
        y += 50;
      }

      // ─── VALUE-ADD / CASH-OUT REFI PAGE ──────────────────────────────────
      if (calc.isValueAdd && calc.arv > 0) {
        doc.addPage(); y = 50;
        doc.fontSize(14).fillColor(brandGreen).text("Value-Add & Refinance Analysis", 50, y);
        y += 22;

        // Equity Creation
        doc.fontSize(10).fillColor(brandDark).text("Equity Creation Summary", 50, y, { underline: true });
        y += 14;
        const eqItems = [
          ["Purchase Price", fmtD(calc.pp)],
          ["Renovation Budget", fmtD(calc.pp && form.renovationBudget ? parseFloat(form.renovationBudget.replace(/[^0-9]/g, "")) : 0)],
          ["All-In Cost", fmtD(calc.pp + (form.renovationBudget ? parseFloat(form.renovationBudget.replace(/[^0-9]/g, "")) : 0))],
          ["After Repair Value (ARV)", fmtD(calc.arv)],
          ["Forced Equity (ARV - Purchase)", fmtD(calc.forcedEquity)],
          ["Net Equity Created (ARV - All-In)", fmtD(calc.equityCreatedByReno)],
        ];
        eqItems.forEach(([label, value]) => {
          doc.fontSize(8).fillColor("#475569").text(label as string, 50, y);
          doc.fontSize(8).fillColor(brandGreen).text(value as string, 50, y, { width: halfW, align: "right" });
          y += 12;
        });
        y += 10;

        // Cash-Out Refi section
        if (calc.isCashoutRefi && calc.refi && calc.refi.refiNewLoanAmount) {
          doc.fontSize(10).fillColor(brandDark).text("Cash-Out Refinance Details", 50, y, { underline: true });
          y += 14;

          // Timeline
          doc.fontSize(8).fillColor("#1e40af").text(`Holding Period Timeline:`, 50, y);
          y += 12;
          doc.fontSize(7.5).fillColor("#92400e").text(`Months 1\u2013${calc.refi.seasoningMonths}: Original Mortgage (${fmtD(calc.monthlyMortgage)}/mo)`, 60, y);
          y += 11;
          doc.fontSize(7.5).fillColor(brandGreen).text(`Month ${calc.refi.seasoningMonths + 1}+: New Mortgage after Cash-Out Refi (${fmtD(calc.refi.refiMonthlyMortgage)}/mo)`, 60, y);
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
            doc.fontSize(7.5).fillColor("#475569").text(label as string, 50, y);
            doc.fontSize(7.5).fillColor(brandDark).text(value as string, 50, y, { width: halfW, align: "right" });
            y += 11;
          });
          y += 12;

          // Pre vs Post Refi comparison table
          doc.fontSize(10).fillColor(brandDark).text("Pre-Refi vs. Post-Refi Returns", 50, y, { underline: true });
          y += 14;

          // Header row
          doc.rect(50, y - 2, W, 14).fill(headerBg);
          doc.fontSize(7).fillColor("#ffffff");
          doc.text("Metric", 52, y, { width: 90 });
          doc.text("Pre-Refi", 160, y, { width: 150, align: "center" });
          doc.text("Post-Refi", 340, y, { width: 150, align: "center" });
          y += 14;

          // Sub-header
          doc.rect(50, y - 2, W, 10).fill("#f1f5f9");
          doc.fontSize(6).fillColor("#64748b");
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
            { label: "Cash-on-Cash", pre: [calc.s1.cashOnCash, calc.s2.cashOnCash, calc.s3.cashOnCash], post: [rs1.postRefiCoC ?? 0, rs2.postRefiCoC ?? 0, rs3.postRefiCoC ?? 0], isPct: true, highlight: true },
            { label: "DSCR", pre: [calc.s1.dscr, calc.s2.dscr, calc.s3.dscr], post: [rs1.postRefiDSCR ?? 0, rs2.postRefiDSCR ?? 0, rs3.postRefiDSCR ?? 0], isDscr: true },
          ];

          compRows.forEach(row => {
            if ((row as any).highlight) { doc.rect(50, y - 2, W, 12).fill("#ecfdf5"); }
            doc.fontSize(7).fillColor(brandDark).text(row.label, 52, y, { width: 90 });
            row.pre.forEach((v: number, i: number) => {
              const txt = (row as any).isPct ? fmtP1(v) : (row as any).isDscr ? (v === Infinity ? "\u221e" : `${v.toFixed(2)}x`) : fmtD(v);
              doc.fillColor(brandDark).text(txt, 160 + i * 50, y, { width: 50, align: "center" });
            });
            row.post.forEach((v: number, i: number) => {
              const inf = (row as any).isPct && calc.refi.cashLeftInDeal <= 0 && v > 5;
              const txt = inf ? "\u221e" : (row as any).isPct ? fmtP1(v) : (row as any).isDscr ? (v === Infinity ? "\u221e" : `${v.toFixed(2)}x`) : fmtD(v);
              doc.fillColor(brandGreen).text(txt, 340 + i * 50, y, { width: 50, align: "center" });
            });
            y += 12;
          });

          if (calc.refi.cashLeftInDeal <= 0) {
            y += 4;
            doc.fontSize(7).fillColor(brandGreen).text("\u2728 Client pulls out more cash than invested \u2014 infinite cash-on-cash return with positive monthly cash flow.", 50, y, { width: W });
            y += 14;
          }
        }
      }

      // Disclaimer
      if (y > 660) { doc.addPage(); y = 50; }
      y += 8;
      doc.fontSize(6).fillColor("#94a3b8").text(
        "Disclaimer: This pro-forma is for informational purposes only and does not constitute financial, tax, or investment advice. All projections are estimates based on assumed inputs and comparable data. Actual results may vary materially. Revenue projections assume competent management, competitive pricing, and no material regulatory changes. Platform fee structures (Airbnb 15.5% host-only, Vrbo 8%) are current as of 2026 and subject to change. Tax benefit estimates require material participation and CPA verification. Consult licensed professionals before making investment decisions.",
        50, y, { width: W, lineGap: 1 }
      );

      // Footer
      doc.fontSize(7).fillColor("#94a3b8").text(`Generated by SavvyOS | ${new Date().toLocaleDateString()}`, 50, 730, { width: W, align: "center" });

      doc.end();
      const pdfBuffer = await pdfDone;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="STR_Proforma.pdf"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("[ProformaPDF] Error:", err);
      return res.status(500).json({ error: err.message ?? "PDF generation failed" });
    }
  });
}
