export type PermissionDefinition = { key: string };

/**
 * Capabilities that cannot remain enabled after their parent page is revoked.
 *
 * This is intentionally explicit. Matching by similar words would incorrectly
 * link unrelated pages, such as Properties and Website Properties.
 */
export const PAGE_PERMISSION_DEPENDENCIES: Record<string, readonly string[]> = {
  canViewContacts: ["canEditContactLeadSource"],
  canViewTransactions: [
    "canViewTransactionExports",
    "canAdministerTransactions",
    "canEditTransactionLeadSource",
  ],
  canViewReferrals: [
    "canCreateReferrals",
    "canEditReferrals",
    "canManageReferralAgents",
    "canEditReferralSplits",
    "canViewReferralFinancials",
    "canUpdateReferralPayments",
    "canManageReferralAgreements",
    "canEditHistoricalReferrals",
  ],
  canViewChat: ["canManageChat"],
  canViewPulse: ["canViewPulseSettings"],
  canViewLandingPages: [
    "canCreateLandingPages",
    "canEditLandingPages",
    "canPublishLandingPages",
    "canArchiveLandingPages",
  ],
  canViewWebsite: [
    "canManageWebsiteProperties",
    "canManageWebsiteAgents",
    "canManageWebsiteCaseStudies",
    "canManageWebsiteBlog",
    "canManageWebsiteSettings",
    "canViewWebsiteLeads",
  ],
};

export function dependentPermissionKeys(
  pagePermissionKey: string,
  definitions: readonly PermissionDefinition[]
): string[] {
  const validKeys = new Set(definitions.map(definition => definition.key));
  return (PAGE_PERMISSION_DEPENDENCIES[pagePermissionKey] ?? []).filter(key =>
    validKeys.has(key)
  );
}

export function parentPagePermissionKey(capabilityKey: string): string | null {
  return (
    Object.entries(PAGE_PERMISSION_DEPENDENCIES).find(([, dependentKeys]) =>
      dependentKeys.includes(capabilityKey)
    )?.[0] ?? null
  );
}

/**
 * A disabled page cannot retain enabled capabilities underneath it.
 * This is deliberately one-way: restoring page access never silently restores
 * an elevated capability that a manager previously revoked.
 */
export function enforcePagePermissionDependencies(
  permissions: Record<string, boolean>,
  definitions: readonly PermissionDefinition[]
): Record<string, boolean> {
  const normalized = { ...permissions };

  for (const [pageKey, dependentKeys] of Object.entries(
    PAGE_PERMISSION_DEPENDENCIES
  )) {
    if (normalized[pageKey] !== false) continue;
    for (const dependentKey of dependentKeys) {
      if (definitions.some(definition => definition.key === dependentKey)) {
        normalized[dependentKey] = false;
      }
    }
  }

  return normalized;
}
