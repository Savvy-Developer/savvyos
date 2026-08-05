import express from "express";
import PDFDocument from "pdfkit";
import { sdk } from "./_core/sdk";
import https from "https";
import http from "http";

// ─── Financial Helpers (mirror client-side) ────────────────────────────────────
function pmt(rate: number, nper: number, pv: number): number {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

function fmt(val: number, decimals = 0): string {
  if (!isFinite(val)) return "N/A";
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function pct(val: number): string {
  if (!isFinite(val)) return "N/A";
  return `${(val * 100).toFixed(2)}%`;
}

function fetchImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchImage(res.headers.location!).then(resolve).catch(reject);
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export function registerProformaPdfRoute(app: express.Application) {
  app.post("/api/proforma/pdf", express.json({ limit: "2mb" }), async (req: any, res: any) => {
    try {
      // Auth check
      let user: any;
      try { user = await sdk.authenticateRequest(req); } catch { return res.status(401).json({ error: "Unauthorized" }); }

      const { form, property, branding, comps } = req.body;
      if (!form || !form.purchasePrice || !form.revenueScenario1) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Calculate all metrics
      const purchasePrice = parseFloat(form.purchasePrice) || 0;
      const downPaymentPct = parseFloat(form.downPaymentPct) || 0.20;
      const closingCostsPct = parseFloat(form.closingCostsPct) || 0.02;
      const interestRate = parseFloat(form.interestRate) || 0.07;
      const loanTermYears = parseInt(form.loanTermYears) || 30;
      const pmiPct = parseFloat(form.pmiPct) || 0;
      const furnishingBudget = parseFloat(form.furnishingBudget) || 0;
      const startupCosts = parseFloat(form.startupCosts) || 0;
      const otherCashNeeded = parseFloat(form.otherCashNeeded) || 0;

      const downPayment = purchasePrice * downPaymentPct;
      const closingCosts = purchasePrice * closingCostsPct;
      const loanAmount = purchasePrice - downPayment;
      const monthlyRate = interestRate / 12;
      const totalPayments = loanTermYears * 12;
      const monthlyMortgage = -pmt(monthlyRate, totalPayments, loanAmount);
      const monthlyPMI = (loanAmount * pmiPct) / 12;
      const totalMonthlyPayment = monthlyMortgage + monthlyPMI;
      const totalCashNeeded = downPayment + closingCosts + furnishingBudget + startupCosts + otherCashNeeded;

      const revenueAppreciation = parseFloat(form.revenueAppreciationPct) || 0.03;
      const rev1Annual = parseFloat(form.revenueScenario1) || 0;
      const rev2Annual = parseFloat(form.revenueScenario2) || rev1Annual * (1 + revenueAppreciation);
      const rev3Annual = parseFloat(form.revenueScenario3) || rev2Annual * (1 + revenueAppreciation);

      const fixedMonthly = (parseFloat(form.expUtilities) || 0) + (parseFloat(form.expInsurance) || 0) +
        (parseFloat(form.expInternet) || 0) + (parseFloat(form.expLandscaping) || 0) +
        (parseFloat(form.expRepairs) || 0) + (parseFloat(form.expSupplies) || 0) +
        (parseFloat(form.expSoftware) || 0) + (parseFloat(form.expPestControl) || 0) +
        (parseFloat(form.expPermits) || 0) + (parseFloat(form.expOther) || 0);
      const propertyTaxMonthly = (parseFloat(form.expPropertyTaxAnnual) || 0) / 12;
      const totalFixedMonthly = fixedMonthly + propertyTaxMonthly;

      const maintenanceReservePct = parseFloat(form.maintenanceReservePct) || 0.05;
      const otaFeePct = parseFloat(form.otaFeePct) || 0.03;
      const propertyMgmtPct = parseFloat(form.propertyMgmtPct) || 0;
      const cleaningPerTurn = parseFloat(form.cleaningCostPerTurn) || 0;
      const turnsPerMonth = parseFloat(form.avgTurnsPerMonth) || 0;
      const cleaningMonthly = cleaningPerTurn * turnsPerMonth;

      const calcScenario = (annualRevenue: number) => {
        const monthlyRevenue = annualRevenue / 12;
        const variableExpenses = (monthlyRevenue * maintenanceReservePct) + (monthlyRevenue * otaFeePct) + (monthlyRevenue * propertyMgmtPct) + cleaningMonthly;
        const totalExpensesMonthly = totalFixedMonthly + variableExpenses;
        const noiMonthly = monthlyRevenue - totalExpensesMonthly;
        const noiAnnual = noiMonthly * 12;
        const cashFlowMonthly = noiMonthly - totalMonthlyPayment;
        const cashFlowAnnual = cashFlowMonthly * 12;
        const cashOnCash = totalCashNeeded > 0 ? cashFlowAnnual / totalCashNeeded : 0;
        const capRate = purchasePrice > 0 ? noiAnnual / purchasePrice : 0;
        const grossROI = purchasePrice > 0 ? annualRevenue / purchasePrice : 0;
        const breakEvenYears = cashFlowAnnual > 0 ? totalCashNeeded / cashFlowAnnual : Infinity;
        const dscr = (totalMonthlyPayment * 12) > 0 ? noiAnnual / (totalMonthlyPayment * 12) : 0;
        return { annualRevenue, noiAnnual, cashFlowAnnual, cashOnCash, capRate, grossROI, breakEvenYears, dscr, totalExpensesMonthly };
      }

      const s1 = calcScenario(rev1Annual);
      const s2 = calcScenario(rev2Annual);
      const s3 = calcScenario(rev3Annual);
      const propertyAppreciation = parseFloat(form.propertyAppreciationPct) || 0.04;

      // ─── Generate PDF ────────────────────────────────────────────────────────
      const doc = new PDFDocument({ size: "LETTER", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));

      const pdfDone = new Promise<Buffer>((resolve) => {
        doc.on("end", () => resolve(Buffer.concat(buffers)));
      });

      const pageWidth = 612 - 100; // letter width minus margins
      const brandGreen = "#1a5c3a";
      const brandDark = "#1e293b";
      const lightGray = "#f1f5f9";

      // ─── HEADER ──────────────────────────────────────────────────────────────
      // Logo
      try {
        const logoUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png";
        const logoBuffer = await fetchImage(logoUrl);
        doc.image(logoBuffer, 50, 40, { width: 120 });
      } catch (e) {
        doc.fontSize(16).fillColor(brandGreen).text("SAVVY STR AGENTS", 50, 45);
      }

      // Agent branding (right side)
      if (branding) {
        const rightX = 350;
        let brandY = 40;
        // Try to fetch headshot
        if (branding.profilePhotoUrl) {
          try {
            const headshotBuffer = await fetchImage(branding.profilePhotoUrl);
            doc.image(headshotBuffer, rightX + 130, brandY, { width: 50, height: 50 });
          } catch (e) { /* skip headshot if fetch fails */ }
        }
        doc.fontSize(11).fillColor(brandDark).text(branding.name ?? "", rightX, brandY);
        brandY += 14;
        if (branding.market) { doc.fontSize(8).fillColor("#64748b").text(branding.market, rightX, brandY); brandY += 11; }
        if (branding.email) { doc.fontSize(8).fillColor("#64748b").text(branding.email, rightX, brandY); brandY += 11; }
        if (branding.phone) { doc.fontSize(8).fillColor("#64748b").text(branding.phone, rightX, brandY); brandY += 11; }
        if (branding.callBookingLink) { doc.fontSize(8).fillColor(brandGreen).text("Book a Call", rightX, brandY, { link: branding.callBookingLink, underline: true }); }
      }

      // Title
      doc.moveDown(1);
      let y = Math.max(doc.y, 110);
      doc.fontSize(18).fillColor(brandDark).text("STR Investment Pro-forma", 50, y);
      y += 25;

      // Property address
      if (property) {
        const addr = [property.address, property.city, property.state, property.zip].filter(Boolean).join(", ");
        doc.fontSize(12).fillColor("#475569").text(addr, 50, y);
        y += 18;
        const details = [];
        if (property.beds) details.push(`${property.beds} Beds`);
        if (property.baths) details.push(`${property.baths} Baths`);
        if (property.sqft) details.push(`${Number(property.sqft).toLocaleString()} sqft`);
        if (property.propertyType) details.push(property.propertyType.replace(/_/g, " "));
        if (details.length > 0) {
          doc.fontSize(9).fillColor("#64748b").text(details.join(" | "), 50, y);
          y += 14;
        }
      }

      // ─── KEY METRICS BOXES ───────────────────────────────────────────────────
      y += 10;
      const boxW = pageWidth / 4 - 6;
      const metrics = [
        { label: "Total Cash Needed", value: fmt(totalCashNeeded) },
        { label: "Monthly Mortgage", value: fmt(totalMonthlyPayment) },
        { label: "Year 1 Cash Flow", value: fmt(s1.cashFlowAnnual) },
        { label: "Year 1 CoC Return", value: pct(s1.cashOnCash) },
      ];
      metrics.forEach((m, i) => {
        const bx = 50 + i * (boxW + 8);
        doc.roundedRect(bx, y, boxW, 45, 4).fill(lightGray);
        doc.fontSize(7).fillColor("#64748b").text(m.label, bx + 6, y + 8, { width: boxW - 12, align: "center" });
        doc.fontSize(12).fillColor(brandDark).text(m.value, bx + 6, y + 22, { width: boxW - 12, align: "center" });
      });
      y += 58;

      // ─── SCENARIO COMPARISON TABLE ───────────────────────────────────────────
      doc.fontSize(11).fillColor(brandDark).text("Scenario Comparison", 50, y, { underline: true });
      y += 18;

      const colWidths = [pageWidth * 0.36, pageWidth * 0.21, pageWidth * 0.21, pageWidth * 0.21];
      const tableX = 50;

      const drawTableRow = (row: string[], yPos: number, isHeader = false, isBold = false) => {
        if (isHeader) {
          doc.rect(tableX, yPos - 2, pageWidth, 16).fill(brandGreen);
          doc.fontSize(8).fillColor("#ffffff");
        } else if (isBold) {
          doc.rect(tableX, yPos - 2, pageWidth, 14).fill("#ecfdf5");
          doc.fontSize(8).fillColor(brandDark);
        } else {
          doc.fontSize(8).fillColor(brandDark);
        }
        let x = tableX;
        row.forEach((cell, i) => {
          const align = i === 0 ? "left" : "right";
          doc.text(cell, x + 4, yPos, { width: colWidths[i] - 8, align });
          x += colWidths[i];
        });
        return yPos + (isHeader ? 16 : 14);
      }

      y = drawTableRow(["Metric", "Year 1", "Year 2", "Year 3"], y, true);
      y = drawTableRow(["Gross Revenue", fmt(s1.annualRevenue), fmt(s2.annualRevenue), fmt(s3.annualRevenue)], y);
      y = drawTableRow(["Total Expenses", fmt(s1.totalExpensesMonthly * 12), fmt(s2.totalExpensesMonthly * 12), fmt(s3.totalExpensesMonthly * 12)], y);
      y = drawTableRow(["Net Operating Income", fmt(s1.noiAnnual), fmt(s2.noiAnnual), fmt(s3.noiAnnual)], y, false, true);
      y = drawTableRow(["Mortgage (Annual)", fmt(totalMonthlyPayment * 12), fmt(totalMonthlyPayment * 12), fmt(totalMonthlyPayment * 12)], y);
      y = drawTableRow(["Net Cash Flow", fmt(s1.cashFlowAnnual), fmt(s2.cashFlowAnnual), fmt(s3.cashFlowAnnual)], y, false, true);
      y = drawTableRow(["Cash-on-Cash Return", pct(s1.cashOnCash), pct(s2.cashOnCash), pct(s3.cashOnCash)], y);
      y = drawTableRow(["Cap Rate", pct(s1.capRate), pct(s2.capRate), pct(s3.capRate)], y);
      y = drawTableRow(["Gross ROI", pct(s1.grossROI), pct(s2.grossROI), pct(s3.grossROI)], y);
      y = drawTableRow(["DSCR", `${s1.dscr.toFixed(2)}x`, `${s2.dscr.toFixed(2)}x`, `${s3.dscr.toFixed(2)}x`], y);
      y = drawTableRow(["Break-Even (Years)", s1.breakEvenYears === Infinity ? "N/A" : s1.breakEvenYears.toFixed(1), s2.breakEvenYears === Infinity ? "N/A" : s2.breakEvenYears.toFixed(1), s3.breakEvenYears === Infinity ? "N/A" : s3.breakEvenYears.toFixed(1)], y);
      y += 12;

      // ─── PURCHASE SUMMARY ────────────────────────────────────────────────────
      const halfW = pageWidth / 2 - 8;
      doc.fontSize(11).fillColor(brandDark).text("Purchase Summary", 50, y, { underline: true });
      doc.fontSize(11).fillColor(brandDark).text("Loan Details", 50 + halfW + 16, y, { underline: true });
      y += 16;

      const leftItems = [
        ["Purchase Price", fmt(purchasePrice)],
        [`Down Payment (${pct(downPaymentPct)})`, fmt(downPayment)],
        [`Closing Costs (${pct(closingCostsPct)})`, fmt(closingCosts)],
        ["Furnishing Budget", fmt(furnishingBudget)],
        ["Startup Costs", fmt(startupCosts)],
        ["Other Cash", fmt(otherCashNeeded)],
        ["Total Cash Needed", fmt(totalCashNeeded)],
      ];
      const rightItems = [
        ["Loan Amount", fmt(loanAmount)],
        ["Interest Rate", pct(interestRate)],
        ["Loan Term", `${loanTermYears} years`],
        ["Monthly Mortgage", fmt(totalMonthlyPayment)],
        ["Annual Mortgage", fmt(totalMonthlyPayment * 12)],
        ["Property Appreciation", `${pct(propertyAppreciation)}/yr`],
        ["Revenue Appreciation", `${pct(revenueAppreciation)}/yr`],
      ];

      let ly = y;
      leftItems.forEach(([label, value], i) => {
        const isBold = i === leftItems.length - 1;
        doc.fontSize(8).fillColor(isBold ? brandGreen : "#475569").text(label, 50, ly);
        doc.fontSize(8).fillColor(isBold ? brandGreen : brandDark).text(value, 50, ly, { width: halfW - 10, align: "right" });
        ly += 12;
      });

      let ry = y;
      rightItems.forEach(([label, value]) => {
        doc.fontSize(8).fillColor("#475569").text(label, 50 + halfW + 16, ry);
        doc.fontSize(8).fillColor(brandDark).text(value, 50 + halfW + 16, ry, { width: halfW - 10, align: "right" });
        ry += 12;
      });
      y = Math.max(ly, ry) + 12;

      // ─── FIXED EXPENSES ──────────────────────────────────────────────────────
      if (y > 620) { doc.addPage(); y = 50; }
      doc.fontSize(11).fillColor(brandDark).text("Monthly Fixed Expenses", 50, y, { underline: true });
      y += 16;
      const expenses = [
        ["Utilities", form.expUtilities], ["Insurance", form.expInsurance],
        ["Internet/Cable", form.expInternet], ["Landscaping", form.expLandscaping],
        ["Routine Repairs", form.expRepairs], ["Supplies", form.expSupplies],
        ["Software", form.expSoftware], ["Pest Control", form.expPestControl],
        ["Permits/Licenses", form.expPermits], ["Property Tax (monthly)", String((parseFloat(form.expPropertyTaxAnnual) || 0) / 12)],
        ["Other", form.expOther],
      ].filter(([, v]) => parseFloat(v) > 0);

      expenses.forEach(([label, value]) => {
        doc.fontSize(8).fillColor("#475569").text(label, 50, y);
        doc.fontSize(8).fillColor(brandDark).text(fmt(parseFloat(value)), 50, y, { width: halfW - 10, align: "right" });
        y += 11;
      });
      doc.fontSize(8).fillColor(brandGreen).text("Total Fixed (Monthly)", 50, y);
      doc.fontSize(8).fillColor(brandGreen).text(fmt(totalFixedMonthly), 50, y, { width: halfW - 10, align: "right" });
      y += 16;

      // Variable expenses
      doc.fontSize(11).fillColor(brandDark).text("Variable Expenses", 50, y, { underline: true });
      y += 16;
      const varExpenses = [
        ["CapEx/Maintenance Reserve", `${pct(maintenanceReservePct)} of revenue`],
        ["OTA/Platform Fees", `${pct(otaFeePct)} of revenue`],
        ["Property Management", `${pct(propertyMgmtPct)} of revenue`],
        ["Cleaning", `${fmt(cleaningPerTurn)}/turn x ${turnsPerMonth}/mo = ${fmt(cleaningMonthly)}/mo`],
      ];
      varExpenses.forEach(([label, value]) => {
        doc.fontSize(8).fillColor("#475569").text(label, 50, y);
        doc.fontSize(8).fillColor(brandDark).text(value, 50 + 150, y);
        y += 11;
      });
      y += 10;

      // ─── COMPS ───────────────────────────────────────────────────────────────
      if (comps && comps.length > 0) {
        if (y > 600) { doc.addPage(); y = 50; }
        doc.fontSize(11).fillColor(brandDark).text("Revenue Comparable Properties", 50, y, { underline: true });
        y += 16;
        const compColW = [pageWidth * 0.1, pageWidth * 0.2, pageWidth * 0.15, pageWidth * 0.12, pageWidth * 0.12, pageWidth * 0.31];
        y = drawTableRow(["#", "Annual Revenue", "Occupancy", "ADR", "Beds", "Notes"], y, true);
        comps.forEach((comp: any, i: number) => {
          y = drawTableRow([
            `Comp ${i + 1}`,
            comp.revenue ? fmt(parseFloat(comp.revenue)) : "—",
            comp.occupancy ? pct(parseFloat(comp.occupancy)) : "—",
            comp.adr ? fmt(parseFloat(comp.adr)) : "—",
            comp.beds || "—",
            comp.notes || "—",
          ], y);
        });
        y += 10;
      }

      // ─── DISCLAIMER ──────────────────────────────────────────────────────────
      if (y > 660) { doc.addPage(); y = 50; }
      y += 10;
      doc.fontSize(10).fillColor(brandDark).text("How do we project revenue?", 50, y, { underline: true });
      y += 14;
      doc.fontSize(7.5).fillColor("#64748b").text(
        "We run our projections with best and highest use of the STR in mind. Meaning we assume you will have top-tier amenities and aesthetics and we pull revenue from other top STRs. But our initial projection is not fully comprehensive and requires further due diligence. We are always excited to complete additional due diligence with interested/qualified clients and we suggest you walk through next steps WITH US; run a full proforma, scrutinize comp STRs, tour the property, analyze your offer strategy/seller credits, etc. Interested? Let's dive in together!",
        50, y, { width: pageWidth, lineGap: 2 }
      );
      y += 55;

      doc.fontSize(6.5).fillColor("#94a3b8").text(
        "Disclaimer: This pro-forma is for informational purposes only and does not constitute financial, tax, or investment advice. All projections are estimates based on assumed inputs and comparable data. Actual results may vary. Consult a licensed CPA and financial advisor before making investment decisions.",
        50, y, { width: pageWidth, lineGap: 1 }
      );

      // ─── FOOTER ──────────────────────────────────────────────────────────────
      doc.fontSize(7).fillColor("#94a3b8").text(
        `Generated by SavvyOS | ${new Date().toLocaleDateString()}`,
        50, 730, { width: pageWidth, align: "center" }
      );

      doc.end();

      const pdfBuffer = await pdfDone;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Proforma.pdf"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("[ProformaPDF] Error:", err);
      return res.status(500).json({ error: err.message ?? "PDF generation failed" });
    }
  });
}
