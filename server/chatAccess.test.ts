import { describe, expect, it } from "vitest";
import {
  canManageChatMessage,
  canOpenChatWorkspace,
  canPostInChatGroup,
  canReadChatConversation,
  canReadChatGroup,
} from "./chatAccess";

const access = (
  overrides: Partial<Parameters<typeof canOpenChatWorkspace>[0]>
) =>
  canOpenChatWorkspace({
    role: "agent",
    hasChatViewPermission: false,
    isChatAdmin: false,
    hasExplicitAccess: false,
    hasConversationMembership: false,
    ...overrides,
  });

describe("Chat access rules", () => {
  it("requires an explicit entitlement or existing conversation membership for non-admin teammates", () => {
    expect(access({})).toBe(false);
    expect(access({ hasExplicitAccess: true })).toBe(true);
    expect(access({ hasConversationMembership: true })).toBe(true);
  });

  it("does not use a company channel to grant an ISA Chat access", () => {
    expect(access({ role: "isa", hasExplicitAccess: true })).toBe(true);
    expect(access({ role: "isa" })).toBe(false);
  });

  it("requires the Chat permission for a normal administrator and grants full access to a Chat Admin", () => {
    expect(
      access({
        role: "admin",
        hasExplicitAccess: true,
        hasConversationMembership: true,
      })
    ).toBe(false);
    expect(access({ role: "admin", hasChatViewPermission: true })).toBe(true);
    expect(access({ role: "admin", isChatAdmin: true })).toBe(true);
  });

  it("limits ordinary users to their own groups while allowing Chat Admins to see all groups", () => {
    expect(
      canReadChatGroup({
        isChatAdmin: false,
        memberGroupIds: new Set([2, 4]),
        groupId: 2,
      })
    ).toBe(true);
    expect(
      canReadChatGroup({
        isChatAdmin: false,
        memberGroupIds: new Set([2, 4]),
        groupId: 3,
      })
    ).toBe(false);
    expect(
      canReadChatGroup({
        isChatAdmin: true,
        memberGroupIds: new Set(),
        groupId: 3,
      })
    ).toBe(true);
  });

  it("keeps direct messages private even from a Chat Admin who is not a participant", () => {
    expect(
      canReadChatConversation({
        isChatAdmin: true,
        memberGroupIds: new Set([2]),
        channelId: 9,
        channelType: "direct",
        isPermanent: false,
      })
    ).toBe(false);
    expect(
      canReadChatConversation({
        isChatAdmin: false,
        memberGroupIds: new Set([9]),
        channelId: 9,
        channelType: "direct",
        isPermanent: false,
      })
    ).toBe(true);
    expect(
      canReadChatConversation({
        isChatAdmin: true,
        memberGroupIds: new Set(),
        channelId: 9,
        channelType: "group",
        isPermanent: true,
      })
    ).toBe(true);
    expect(
      canReadChatConversation({
        isChatAdmin: true,
        memberGroupIds: new Set(),
        channelId: 10,
        channelType: "group",
        isPermanent: false,
      })
    ).toBe(false);
  });

  it("allows only the sender to edit or delete a Chat message", () => {
    expect(
      canManageChatMessage({ messageSenderId: 12, requestingUserId: 12 })
    ).toBe(true);
    expect(
      canManageChatMessage({ messageSenderId: 12, requestingUserId: 99 })
    ).toBe(false);
  });

  it("keeps announcements writable only by Chat Admins while general remains member writable", () => {
    expect(
      canPostInChatGroup({
        isChatAdmin: false,
        memberGroupIds: new Set([8]),
        groupId: 8,
        isPermanent: true,
        channelName: "announcements",
      })
    ).toBe(false);
    expect(
      canPostInChatGroup({
        isChatAdmin: true,
        memberGroupIds: new Set(),
        groupId: 8,
        isPermanent: true,
        channelName: "announcements",
      })
    ).toBe(true);
    expect(
      canPostInChatGroup({
        isChatAdmin: false,
        memberGroupIds: new Set([9]),
        groupId: 9,
        isPermanent: true,
        channelName: "general",
      })
    ).toBe(true);
  });
});
