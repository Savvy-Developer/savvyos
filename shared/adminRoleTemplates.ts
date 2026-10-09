/**
 * Admin role templates for Super Permissions (security audit, finding 05).
 *
 * SavvyOS has 89 separate admin permissions, set one by one, and most admins
 * had 50% or more of them. A template is a starting point for a job: pick
 * "Marketing" and the admin gets the pages a marketing person needs and loses
 * everything else, then a manager can add or remove single pages as before.
 * Applying a template changes nothing until Save, and the save dialog lists
 * every change.
 *
 * These are a FIRST DRAFT for Tyler to adjust. Sensitive pages (Passwords,
 * Activity Log, Webhooks, Website settings, MLS feeds, lead source edits, PTO
 * admin, Chat admin, historical referral edits) are in no template on
 * purpose: they are granted one person at a time.
 */

/** Pages every admin gets with any template. */
export const ROLE_BASE_PERMISSIONS = [
  "canViewDashboard",
  "canViewLeaderboard",
  "canViewChat",
  "canViewPulse",
  "canViewProjects",
  "canViewKnowledgeBase",
  "canViewOrgChart",
  "canViewAgentDirectory",
  "canViewRolesResponsibilities",
  "canViewFeedback",
] as const;

export type AdminRoleTemplate = {
  key: string;
  label: string;
  description: string;
  /** Granted on top of ROLE_BASE_PERMISSIONS. Everything else is turned off. */
  permissions: readonly string[];
};

export const ADMIN_ROLE_TEMPLATES: readonly AdminRoleTemplate[] = [
  {
    key: "ops",
    label: "Operations",
    description: "Transactions, listings, referrals, agent support and approvals.",
    permissions: [
      "canViewReporting",
      "canViewContacts",
      "canViewPipeline",
      "canViewTasks",
      "canViewAgentAppointments",
      "canViewDuplicates",
      "canViewTransactions",
      "canViewTransactionExports",
      "canViewListings",
      "canViewProperties",
      "canViewMlsProperties",
      "canViewReferrals",
      "canCreateReferrals",
      "canEditReferrals",
      "canViewAgentMarkets",
      "canViewAgentCelebrations",
      "canViewVendorLists",
      "canViewTransactionChecklists",
      "canViewOperationsEscalations",
      "canViewEvents",
      "canViewConnectionRequests",
      "canViewAdminApprovals",
      "canViewUsers",
      "canViewAgentRenewals",
      "canViewOnboarding",
      "canViewLeadSources",
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Campaigns, landing pages, webinars, the website's content and its leads.",
    permissions: [
      "canViewReporting",
      "canViewCustomReports",
      "canViewContacts",
      "canViewAgentMarkets",
      "canViewReviews",
      "canViewEvents",
      "canViewWebinars",
      "canViewLandingPages",
      "canCreateLandingPages",
      "canEditLandingPages",
      "canPublishLandingPages",
      "canArchiveLandingPages",
      "canViewSmartPlans",
      "canViewMarketingAdmin",
      "canViewShortLinks",
      "canViewWebsite",
      "canManageWebsiteAgents",
      "canManageWebsiteCaseStudies",
      "canManageWebsiteBlog",
      "canViewWebsiteLeads",
      "canViewMarketMatchQuiz",
      "canViewAffiliateLinks",
      "canViewLeadSources",
    ],
  },
  {
    key: "isa-lead",
    label: "ISA lead",
    description: "Leads, calls, inboxes and the ISA team's reports.",
    permissions: [
      "canViewReporting",
      "canViewContacts",
      "canViewPipeline",
      "canViewTasks",
      "canViewAgentAppointments",
      "canViewIsmDashboard",
      "canViewConversationIntelligence",
      "canViewHotLeads",
      "canViewResendInbox",
      "canViewMarketingTextInbox",
      "canViewDuplicates",
      "canViewAgentMarkets",
      "canViewMarketMatchQuiz",
      "canViewLeadSources",
    ],
  },
  {
    key: "finance",
    label: "Finance",
    description: "Commissions, payouts, referral payments and renewals.",
    permissions: [
      "canViewReporting",
      "canViewCustomReports",
      "canViewTransactions",
      "canViewTransactionExports",
      "canViewCommission",
      "canViewReferrals",
      "canViewReferralFinancials",
      "canUpdateReferralPayments",
      "canManageReferralAgreements",
      "canViewVendorLists",
      "canViewAgentRenewals",
    ],
  },
  {
    key: "website",
    label: "Website",
    description: "Website Studio listings, profiles, posts and case studies, landing pages and links.",
    permissions: [
      "canViewProperties",
      "canViewListings",
      "canViewMlsProperties",
      "canViewLandingPages",
      "canEditLandingPages",
      "canViewShortLinks",
      "canViewWebsite",
      "canManageWebsiteProperties",
      "canManageWebsiteAgents",
      "canManageWebsiteCaseStudies",
      "canManageWebsiteBlog",
      "canViewWebsiteLeads",
    ],
  },
];

/** Every permission the template grants, base included. */
export function templateGrants(template: AdminRoleTemplate): Set<string> {
  return new Set([...ROLE_BASE_PERMISSIONS, ...template.permissions]);
}

/**
 * An admin's full permission set after applying a template: on for what the
 * template grants, off for every other known permission.
 */
export function applyRoleTemplate(template: AdminRoleTemplate, allKeys: readonly string[]): Record<string, boolean> {
  const grants = templateGrants(template);
  const out: Record<string, boolean> = {};
  for (const key of allKeys) out[key] = grants.has(key);
  return out;
}

export type RoleFit = {
  template: AdminRoleTemplate;
  /** On for this admin but not in the template. */
  extra: string[];
  /** In the template but off for this admin. */
  missing: string[];
};

/**
 * The template closest to what an admin has now (fewest differences), for
 * access reviews: "Matches Marketing" or "Closest: Marketing, 4 extra".
 * Null when no template is within half of the admin's own access.
 */
export function closestRoleTemplate(
  permissions: Record<string, boolean>,
  allKeys: readonly string[],
  templates: readonly AdminRoleTemplate[] = ADMIN_ROLE_TEMPLATES
): RoleFit | null {
  let best: RoleFit | null = null;
  for (const template of templates) {
    const grants = templateGrants(template);
    const extra = allKeys.filter(key => permissions[key] && !grants.has(key));
    const missing = allKeys.filter(key => !permissions[key] && grants.has(key));
    const distance = extra.length + missing.length;
    if (!best || distance < best.extra.length + best.missing.length) best = { template, extra, missing };
  }
  if (!best) return null;
  const granted = allKeys.filter(key => permissions[key]).length;
  return best.extra.length + best.missing.length <= Math.max(3, granted / 2) ? best : null;
}
