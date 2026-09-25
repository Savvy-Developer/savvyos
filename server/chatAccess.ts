export type ChatRole = "admin" | "agent" | "isa" | "agent_support";

/**
 * Entering Chat and belonging to a conversation are distinct permissions.
 * An explicit entitlement opens the Chat workspace so a teammate can begin a
 * direct message or private group without receiving a fabricated company
 * channel. Existing conversation membership remains a backwards-compatible
 * path for current users.
 */
export function canOpenChatWorkspace(input: {
  role: ChatRole;
  hasChatViewPermission: boolean;
  isChatAdmin: boolean;
  hasExplicitAccess: boolean;
  hasConversationMembership: boolean;
}): boolean {
  if (input.isChatAdmin) return true;
  if (input.role === "admin") return input.hasChatViewPermission;
  return input.hasExplicitAccess || input.hasConversationMembership;
}

export function canReadChatGroup(input: {
  isChatAdmin: boolean;
  memberGroupIds: Set<number>;
  groupId: number;
}): boolean {
  return input.isChatAdmin || input.memberGroupIds.has(input.groupId);
}

/**
 * Group conversations are visible to Chat Admins, while direct messages remain
 * private to their participants. This distinction is deliberately centralised
 * so uploads, reads, replies, reactions, and mentions cannot accidentally
 * expose a direct conversation through an admin-only group rule.
 */
export function canReadChatConversation(input: {
  isChatAdmin: boolean;
  memberGroupIds: Set<number>;
  channelId: number;
  channelType: "group" | "direct";
  isPermanent: boolean;
}): boolean {
  if (input.channelType === "direct") {
    return input.memberGroupIds.has(input.channelId);
  }
  // A user-created group belongs to its participants, not to the Chat Admin
  // role. Only permanent company groups grant Chat Admin visibility by default.
  if (!input.isPermanent) return input.memberGroupIds.has(input.channelId);
  return canReadChatGroup({
    isChatAdmin: input.isChatAdmin,
    memberGroupIds: input.memberGroupIds,
    groupId: input.channelId,
  });
}

export function canPostInChatGroup(input: {
  isChatAdmin: boolean;
  memberGroupIds: Set<number>;
  groupId: number;
  isPermanent: boolean;
  channelName: string;
}): boolean {
  if (!input.isPermanent) return input.memberGroupIds.has(input.groupId);
  if (
    isReadOnlyCompanyChannel({
      channelName: input.channelName,
      isPermanent: input.isPermanent,
    })
  ) {
    return input.isChatAdmin;
  }
  return canReadChatGroup(input);
}

/** Only the author may alter or remove a Chat message. */
export function canManageChatMessage(input: {
  messageSenderId: number;
  requestingUserId: number;
}): boolean {
  return input.messageSenderId === input.requestingUserId;
}

/** Company announcements are intentionally writable only by Chat Admins. */
export function isReadOnlyCompanyChannel(input: {
  channelName: string;
  isPermanent: boolean;
}): boolean {
  return (
    input.isPermanent &&
    input.channelName.trim().toLowerCase() === "announcements"
  );
}
