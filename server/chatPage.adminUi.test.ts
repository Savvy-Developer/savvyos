import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/pages/ChatPage.tsx", import.meta.url), "utf8");

describe("Chat page section and channel archive controls", () => {
  it("gives Chat Admins edit/rename as the primary section action and requires confirmation before delete", () => {
    expect(source).toContain("Edit / rename");
    expect(source).toContain("Delete section");
    expect(source).toContain("Delete {section.name}?");
    expect(source).toContain("trpc.chat.sections.update.useMutation");
    expect(source).toContain("trpc.chat.sections.archive.useMutation");
    expect(source).toContain("isChatAdmin && (");
  });

  it("lets Chat Admins archive a company channel from inside the conversation and restore it later", () => {
    expect(source).toContain("canArchiveCompanyChannel");
    expect(source).toContain("Archive #{selectedChannel?.name}?");
    expect(source).toContain("trpc.chat.groups.archive.useMutation");
    expect(source).toContain("ArchivedChatDialog");
    expect(source).toContain("trpc.chat.groups.restore.useMutation");
    expect(source).toContain("trpc.chat.sections.restore.useMutation");
  });
});
