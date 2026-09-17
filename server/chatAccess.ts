export type ChatRole = "admin" | "agent" | "isa" | "agent_support";

/**
 * The first Chat release is intentionally limited to administrators and ISAs.
 * Agents may be enrolled in Chat groups now, but cannot open Chat until the
 * agent-facing rollout is deliberately enabled.
 */
export function canOpenChatWorkspace(input: {
  role: ChatRole;
  hasChatViewPermission: boolean;
  isChatAdmin: boolean;
  isGroupMember: boolean;
}): boolean {
  if (input.isChatAdmin) return true;
  if (input.role === "admin") return input.hasChatViewPermission;
  // Group membership is provisioned now, but no ISA or Agent can see Chat
  // during the initial Tyler-only rollout. This remains an explicit gate, not
  // an accidental side effect of adding somebody to a future group.
  if (input.role === "isa") return false;
  return false;
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
}): boolean {
  if (input.channelType === "direct") {
    return input.memberGroupIds.has(input.channelId);
  }
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
}): boolean {
  return canReadChatGroup(input);
}
