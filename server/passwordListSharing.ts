export type PasswordShareGrant = {
  userId: number;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
};

export type PasswordListCapabilities = {
  canView: boolean;
  canCreateEntries: boolean;
  canEditEntries: boolean;
};

/**
 * Creating or editing necessarily requires a person to be able to read the
 * list. This makes malformed API input safe while keeping the three UI
 * checkboxes easy to understand.
 */
export function normalizePasswordShareGrant(grant: PasswordShareGrant): PasswordShareGrant {
  const canCreate = Boolean(grant.canCreate);
  const canEdit = Boolean(grant.canEdit);
  return {
    userId: grant.userId,
    canView: Boolean(grant.canView) || canCreate || canEdit,
    canCreate,
    canEdit,
  };
}

export function capabilitiesForPasswordShare(grant: PasswordShareGrant | null | undefined): PasswordListCapabilities {
  const normalized = grant ? normalizePasswordShareGrant(grant) : null;
  return {
    canView: Boolean(normalized?.canView),
    canCreateEntries: Boolean(normalized?.canCreate),
    canEditEntries: Boolean(normalized?.canEdit),
  };
}

export function sharedAccessLabel(capabilities: PasswordListCapabilities): string {
  if (capabilities.canCreateEntries && capabilities.canEditEntries) return "Shared: view, create & edit";
  if (capabilities.canCreateEntries) return "Shared: view & create";
  if (capabilities.canEditEntries) return "Shared: view & edit";
  return "Shared view";
}
