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

  it("lets Chat Admins archive a company channel from Manage and restore it later", () => {
    expect(source).toContain("Archive this channel");
    expect(source).toContain("Archive #{group.name}?");
    expect(source).not.toContain("canArchiveCompanyChannel");
    expect(source).toContain("trpc.chat.groups.archive.useMutation");
    expect(source).toContain("ArchivedChatDialog");
    expect(source).toContain("trpc.chat.groups.restore.useMutation");
    expect(source).toContain("trpc.chat.sections.restore.useMutation");
  });

  it("keeps message hover actions out of the document flow so rows do not shift", () => {
    expect(source).toContain("group relative flex gap-3");
    expect(source).toContain("absolute right-0 top-0 z-10");
    expect(source).toContain("md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100");
    expect(source).not.toContain("md:hidden md:group-hover:flex");
  });

  it("saves a moved section when Manage is closed instead of discarding the change", () => {
    expect(source).toContain("detailsDirty");
    expect(source).toContain('if (detailsDirty) saveDetails(true)');
    expect(source).toContain("Save & Close");
    expect(source).toContain("handleDialogOpenChange");
    expect(source).not.toContain("setSelectedChannelId(null)");
  });
});
