/**
 * Built-in public pages that can be replaced with a version written in the
 * Website Studio CMS.
 *
 * The designed page stays in code and stays the default. Publishing a CMS page
 * at the same address replaces it on the site; setting that CMS page back to
 * Draft or Archived brings the designed page back. Nothing is lost either way.
 *
 * Only pages that are mostly words are offered. Properties, Agents, Markets,
 * Case Studies and Resources are lists of live records, and a text version of
 * them would go stale the moment a listing changed.
 */

export type EditableBuiltInPage = {
  slug: string;
  name: string;
  /** A starting point that matches what the designed page says today. */
  starter: {
    heroEyebrow: string;
    heroTitle: string;
    heroSubtitle: string;
    bodyMarkdown: string;
    ctaText: string;
    ctaHref: string;
  };
};

/**
 * Put this on its own line in a CMS page to show the contact form there.
 * It is the same form the designed Contact page uses, so inquiries still go
 * into SavvyOS.
 */
export const CONTACT_FORM_TOKEN = "[[contact-form]]";

export const EDITABLE_BUILT_IN_PAGES: EditableBuiltInPage[] = [
  {
    slug: "about",
    name: "About",
    starter: {
      heroEyebrow: "Why Savvy",
      heroTitle: "Invest Confidently in Short-Term Rentals",
      heroSubtitle:
        "You deserve a real estate agent who actually understands short-term rentals, and a system built to support every important decision.",
      ctaText: "Book My Free Market Match Call",
      ctaHref: "/newsite/contact",
      bodyMarkdown: [
        "**$250M+** closed STR sales volume · **500+** successful Airbnb launches · **$10M+** annual client Airbnb revenue",
        "",
        "## Everything a traditional agent misses",
        "",
        "Buying an STR is a business decision wrapped inside a real estate transaction. Savvy brings both perspectives to the table.",
        "",
        "- **Market clarity.** Understand where your goals, capital, and operating plan fit.",
        "- **Investor-grade analysis.** Evaluate revenue, expenses, financing, regulations, and risk together.",
        "- **Local execution.** Navigate offers and diligence with an STR specialist in the market.",
        "- **Launch network.** Connect with trusted managers, designers, lenders, insurers, and vendors.",
        "- **Portfolio perspective.** Choose a property that supports the strategy beyond one transaction.",
        "- **Long-term relationship.** Stay connected to a team that understands your investment journey.",
        "",
        "## How It Works",
        "",
        "1. **Market Match Call.** Clarify goals, budget, timeline, and investment thesis.",
        "2. **Property Sourcing.** Focus the search on opportunities that fit your buy box.",
        "3. **Diligence & Offer.** Validate the property, market, regulations, and operating plan.",
        "4. **Launch-Ready Setup.** Close with a practical path to design, operations, and revenue.",
        "",
        "## Ready to Start Your STR Journey?",
        "",
        "Make the next property decision with the right specialist and the right information. [Book my call](/newsite/contact)",
      ].join("\n"),
    },
  },
  {
    slug: "contact",
    name: "Contact",
    starter: {
      heroEyebrow: "Free STR strategy consultation",
      heroTitle: "Ready to Start Your STR Investment Journey?",
      heroSubtitle:
        "Tell us what you're trying to build. We'll help you clarify the market, buy box, and next best decision.",
      ctaText: "",
      ctaHref: "",
      bodyMarkdown: [
        "- No obligation",
        "- Property- and market-specific guidance",
        "- Matched with the right Savvy specialist",
        "",
        CONTACT_FORM_TOKEN,
        "",
        "## What You'll Get From the Conversation",
        "",
        "- **Market analysis.** Understand which markets fit your goals and constraints.",
        "- **Investment strategy.** Build a buy box around realistic economics.",
        "- **Agent matching.** Connect with a local specialist who understands STR.",
        "- **Diligence support.** Know what needs to be verified before you commit.",
      ].join("\n"),
    },
  },
  {
    slug: "join-our-team",
    name: "Join Our Team",
    starter: {
      heroEyebrow: "We're growing nationwide",
      heroTitle: "If you live and breathe short-term rentals, we want you.",
      heroSubtitle:
        "We're seeking growth-minded short-term rental experts who know their market inside and out. If you love the idea of guiding investors and helping them build wealth, this is the place for you.",
      ctaText: "Start Your Savvy Journey",
      ctaHref: "https://calendly.com/trish-savvy",
      bodyMarkdown: [
        "**#1** Enterprise Agent Team at eXp Realty · **55** expert STR agents · **49** active markets · **100%** focused on short-term rental investors",
        "",
        "## Everything you need to dominate your STR market",
        "",
        "You bring the market expertise and the drive. We bring the infrastructure that turns great agents into top producers.",
        "",
        "- **Short-Term Rental Expertise.** We've been 100% focused on STR investors since 2019.",
        "- **Marketing Support.** A dedicated marketing team builds your brand presence and runs campaigns.",
        "- **Industry Partnerships.** Preferred access to STR lenders, insurance advisors, property managers, and tax strategists.",
        "- **Lead Qualification.** Our inside sales team vets and qualifies inbound investor leads before they reach you.",
        "- **Proprietary Software.** Purpose-built STR tools for market analysis, revenue projections, and deal evaluation.",
        "- **Mastermind Support.** Weekly masterminds with top-producing STR agents nationwide.",
        "",
        "## Meet your first call: Trish Bartley, U.S. Expansion Director",
        "",
        "Your Savvy journey starts with a conversation, not an application. Trish will walk you through how the partnership works, what we look for, and whether we're the right match for each other.",
        "",
        "[Book a call with Trish](https://calendly.com/trish-savvy)",
      ].join("\n"),
    },
  },
];

export const EDITABLE_BUILT_IN_SLUGS = new Set(
  EDITABLE_BUILT_IN_PAGES.map(page => page.slug)
);

export function editableBuiltInPage(slug: string): EditableBuiltInPage | null {
  return EDITABLE_BUILT_IN_PAGES.find(page => page.slug === slug) ?? null;
}

/**
 * A page body split around the contact form token, so the page can render the
 * real form in its place. The rich text editor escapes square brackets when
 * it saves ("\[\[contact-form\]\]"), so both spellings are recognised.
 */
export function splitOnContactForm(markdown: string): string[] {
  return markdown.split(/^[ \t]*\\?\[\\?\[contact-form\\?\]\\?\][ \t]*$/m);
}
