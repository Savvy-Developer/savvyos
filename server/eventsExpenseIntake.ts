const CATEGORY_RULES: Array<{ category: string; terms: string[] }> = [
  {
    category: "Venue & lodging",
    terms: [
      "hotel",
      "venue",
      "ballroom",
      "meeting room",
      "resort",
      "lodging",
      "room block",
    ],
  },
  {
    category: "Food & beverage",
    terms: [
      "catering",
      "food",
      "beverage",
      "banquet",
      "bar",
      "restaurant",
      "meal",
      "coffee",
    ],
  },
  {
    category: "Travel & transportation",
    terms: [
      "airline",
      "flight",
      "airfare",
      "uber",
      "lyft",
      "rental car",
      "transport",
      "parking",
    ],
  },
  {
    category: "Production & A/V",
    terms: [
      "audio",
      "visual",
      "a/v",
      "av ",
      "-av-",
      "production",
      "stage",
      "lighting",
      "sound",
      "video",
    ],
  },
  {
    category: "Marketing & creative",
    terms: [
      "print",
      "design",
      "marketing",
      "creative",
      "signage",
      "swag",
      "branding",
      "photography",
    ],
  },
  {
    category: "Speakers & programming",
    terms: ["speaker", "keynote", "talent", "entertainment", "programming"],
  },
  {
    category: "Technology & registration",
    terms: [
      "swoogo",
      "registration",
      "software",
      "wifi",
      "internet",
      "technology",
    ],
  },
  {
    category: "Staffing & contractor",
    terms: ["staff", "contractor", "security", "labor", "hostess", "bartender"],
  },
  {
    category: "Insurance & permits",
    terms: ["insurance", "permit", "license", "liability"],
  },
];

export type ExpenseInvoiceSuggestion = {
  category: string;
  vendorName: string | null;
  description: string;
  amount: number | null;
  expenseDate: string | null;
  categorizationNote: string;
};

function firstMeaningfulLine(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim().replace(/\s+/g, " "))
    .find(
      line =>
        line.length >= 3 &&
        line.length <= 90 &&
        !/^invoice\s*(number|#)?\b/i.test(line)
    );
}

function findAmount(text: string) {
  const labeled = text.match(
    /(?:amount\s*due|balance\s*due|total\s*(?:due|amount)?|invoice\s*total)\s*[:$]?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i
  );
  if (labeled) {
    const value = Number(labeled[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function findInvoiceDate(text: string) {
  const match = text.match(
    /(?:invoice\s*date|date\s*issued|issued)\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w{3,9}\s+\d{1,2},?\s+\d{4})/i
  );
  if (!match) return null;
  const parsed = new Date(match[1]);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Deterministic, explainable invoice suggestion. Operators can edit every value. */
export function categorizeExpenseInvoice(
  originalName: string,
  extractedText = ""
): ExpenseInvoiceSuggestion {
  const source = `${originalName}\n${extractedText}`.toLowerCase();
  const rule = CATEGORY_RULES.find(entry =>
    entry.terms.some(term => source.includes(term))
  );
  const category = rule?.category ?? "Other";
  const fromText = extractedText.trim();
  const stem = originalName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
  const vendorName = firstMeaningfulLine(fromText) ?? null;
  const description = vendorName
    ? `Invoice from ${vendorName}`
    : stem || "Uploaded invoice";
  const amount = findAmount(fromText);
  const expenseDate = findInvoiceDate(fromText);
  const sourceNote = extractedText.trim()
    ? "Category suggested from uploaded invoice text. Review before closing the expense."
    : "Category suggested from invoice filename. Review before closing the expense.";

  return {
    category,
    vendorName,
    description,
    amount,
    expenseDate,
    categorizationNote: sourceNote,
  };
}
