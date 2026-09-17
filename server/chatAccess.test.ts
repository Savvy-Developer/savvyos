import { describe, expect, it } from "vitest";
import {
  canOpenChatWorkspace,
  canReadChatConversation,
  canReadChatGroup,
} from "./chatAccess";

describe("Chat access rules", () => {
  it("keeps the initial agent rollout closed even when an agent is enrolled in a group", () => {
    expect(
      canOpenChatWorkspace({
        role: "agent",
        hasChatViewPermission: false,
        isChatAdmin: false,
        isGroupMember: true,
      })
    ).toBe(false);
  });

  it("keeps ISAs out during the initial Tyler-only rollout, even when enrolled", () => {
    expect(
      canOpenChatWorkspace({
        role: "isa",
        hasChatViewPermission: false,
        isChatAdmin: false,
        isGroupMember: false,
      })
    ).toBe(false);
    expect(
      canOpenChatWorkspace({
        role: "isa",
        hasChatViewPermission: false,
        isChatAdmin: false,
        isGroupMember: true,
      })
    ).toBe(false);
  });

  it("requires the Chat permission for a normal administrator and grants full access to a Chat Admin", () => {
    expect(
      canOpenChatWorkspace({
        role: "admin",
        hasChatViewPermission: false,
        isChatAdmin: false,
        isGroupMember: true,
      })
    ).toBe(false);
    expect(
      canOpenChatWorkspace({
        role: "admin",
        hasChatViewPermission: true,
        isChatAdmin: false,
        isGroupMember: false,
      })
    ).toBe(true);
    expect(
      canOpenChatWorkspace({
        role: "admin",
        hasChatViewPermission: false,
        isChatAdmin: true,
        isGroupMember: false,
      })
    ).toBe(true);
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
});
