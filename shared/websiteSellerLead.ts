/**
 * The Sell page's form: its rules and the message it sends.
 *
 * Carried over from the old savvy-agents.com /sell page. There it posted to the
 * old site's own lead table; here it goes through website.submitLead with
 * intent "sell", so a seller becomes a SavvyOS contact in the ISA queue, tagged
 * "Seller lead", like every other website inquiry becomes a contact.
 *
 * Pure, so the same rule drives the message under a field and whether the form
 * can be sent, and both are tested without rendering anything.
 */

export const SELLER_TIMELINES = [
  "Ready to list now",
  "In the next 3 months",
  "In 3 to 6 months",
  "Just exploring",
] as const;

export const SELLER_LISTED_OPTIONS = ["Yes", "No", "Not sure"] as const;

/** The tag every seller inquiry carries on its SavvyOS contact. */
export const SELLER_LEAD_TAG = "Seller lead";

export type SellerField =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "address"
  | "timeline";

export type SellerValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  timeline: string;
  bedrooms: string;
  listed: string;
  revenue: string;
  message: string;
};

export const SELLER_REQUIRED: SellerField[] = [
  "address",
  "firstName",
  "lastName",
  "email",
  "phone",
  "timeline",
];

export function emptySellerValues(): SellerValues {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    timeline: "",
    bedrooms: "",
    listed: "",
    revenue: "",
    message: "",
  };
}

/**
 * A phone is required here, unlike the contact form: a seller inquiry is a
 * conversation about one property, and a lead the ISA team cannot ring is
 * worth much less.
 */
export function validateSellerField(field: SellerField, values: SellerValues): string | null {
  const value = (values[field] ?? "").trim();
  switch (field) {
    case "firstName":
      return value ? null : "Enter your first name";
    case "lastName":
      return value ? null : "Enter your last name";
    case "email":
      if (!value) return "Enter your email";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Check the email address";
    case "phone": {
      if (!value) return "Enter a phone number";
      const digits = value.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15 ? null : "Check the phone number";
    }
    case "address":
      if (!value) return "Enter the property address";
      // A city on its own is not an address anyone can pull comps for. Every
      // usable answer has a digit (a street number or a ZIP), so that is the
      // test, and nothing stricter, so an unusual address is never locked out.
      return /\d/.test(value) ? null : "Add the street number or ZIP code";
    case "timeline":
      return value ? null : "Choose a timeline";
  }
}

export function validateSeller(values: SellerValues): Partial<Record<SellerField, string>> {
  const errors: Partial<Record<SellerField, string>> = {};
  for (const field of SELLER_REQUIRED) {
    const message = validateSellerField(field, values);
    if (message) errors[field] = message;
  }
  return errors;
}

export function canSubmitSeller(values: SellerValues): boolean {
  return Object.keys(validateSeller(values)).length === 0;
}

/**
 * Everything the contact has no column for, as lines the ISA team can read in
 * the contact's notes without opening anything else. Blank optional answers
 * are left out rather than shown as "Bedrooms: ".
 */
export function buildSellerMessage(values: SellerValues): string {
  const lines = ["Seller inquiry from the website Sell page"];
  const add = (label: string, value: string) => {
    const clean = (value ?? "").trim();
    if (clean) lines.push(`${label}: ${clean}`);
  };
  add("Property", values.address);
  add("Timeline", values.timeline);
  add("Bedrooms", values.bedrooms);
  add("Currently rented short term", values.listed);
  add("Last 12 months revenue", values.revenue);
  const note = (values.message ?? "").trim();
  if (note) lines.push("", note);
  return lines.join("\n").slice(0, 4000);
}
