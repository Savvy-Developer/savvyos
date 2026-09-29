/**
 * Lead sources for the website's own forms.
 *
 * Until now a lead from a website form got no lead source at all, so it was
 * missing from every lead-source report and never started a Smart Plan. Each
 * form now files its lead under the "Savvy-Agents.com" parent, by what the
 * visitor asked for. Organic social visits keep going to Organic Social
 * (see organicSocial.ts); that rule is checked first.
 *
 * The same sub-sources take the old savvy-agents.com lead types that SavvyOS
 * had no source for (property_detail, book_showing, deeper_analysis,
 * financing, agent_profile, seller, other), so both sites report alike while
 * they run side by side.
 */
export const WEBSITE_LEAD_PARENT = "Savvy-Agents.com";

export const WEBSITE_LEAD_SOURCES = [
  "Property Inquiry",
  "Book a Showing",
  "Deeper Analysis Request",
  "Financing Request",
  "Case Study Inquiry",
  "Agent Message",
  "Seller Enquiry",
  "General Inquiry",
] as const;
export type WebsiteLeadSource = (typeof WEBSITE_LEAD_SOURCES)[number];

/** Which sub-source a new-site form belongs to. */
export function websiteFormLeadSource(input: {
  intent?: string | null;
  requestType?: string | null;
  sourcePath?: string | null;
}): WebsiteLeadSource {
  const intent = (input.intent ?? "").trim().toLowerCase();
  const request = (input.requestType ?? "").trim().toLowerCase();
  const path = (input.sourcePath ?? "").trim().toLowerCase();
  if (request === "showing") return "Book a Showing";
  if (request === "analysis") return "Deeper Analysis Request";
  if (request === "financing") return "Financing Request";
  if (intent === "sell") return "Seller Enquiry";
  if (intent === "agent") return "Agent Message";
  // The case study page reuses the property form ("Ask about this deal").
  if (path.includes("/case-studies/")) return "Case Study Inquiry";
  if (intent === "property") return "Property Inquiry";
  return "General Inquiry";
}

const OLD_SITE_SOURCES: Record<string, WebsiteLeadSource> = {
  property_detail: "Property Inquiry",
  book_showing: "Book a Showing",
  deeper_analysis: "Deeper Analysis Request",
  financing: "Financing Request",
  agent_profile: "Agent Message",
  seller: "Seller Enquiry",
  other: "General Inquiry",
};

/**
 * The sub-source for an old savvy-agents.com lead type, or null to keep the
 * existing behaviour (the endpoint's default source).
 */
export function oldSiteWebsiteLeadSource(value: string | null | undefined): WebsiteLeadSource | null {
  return OLD_SITE_SOURCES[(value ?? "").trim().toLowerCase()] ?? null;
}
