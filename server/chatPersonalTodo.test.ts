import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const router = readFileSync(path.join(root, "server/routers/chat.ts"), "utf8");
const chatPage = readFileSync(
  path.join(root, "client/src/pages/ChatPage.tsx"),
  "utf8"
);

const createPersonalTodoProcedure = router.slice(
  router.indexOf("createPersonalTodo: protectedProcedure"),
  router.indexOf("send: protectedProcedure", router.indexOf("createPersonalTodo: protectedProcedure"))
);

describe("Chat message personal To-Dos", () => {
  it("creates a personal record only from a message the current user may read", () => {
    expect(createPersonalTodoProcedure).toContain("requireMessageContext(ctx.user, input.messageId)");
    expect(createPersonalTodoProcedure).toContain("Only Chat messages with text can become Personal To-Dos.");
    expect(createPersonalTodoProcedure).toContain("userId: ctx.user.id");
  });

  it("preserves the message text and timestamp in the new personal To-Do", () => {
    expect(createPersonalTodoProcedure).toContain("title = state.message.body.trim()");
    expect(createPersonalTodoProcedure).toContain("title,");
    expect(createPersonalTodoProcedure).toContain("state.message.createdAt.toISOString()");
    expect(createPersonalTodoProcedure).toContain("pmPersonalTodos");
  });

  it("offers a pending-aware message action and refreshes personal To-Do data", () => {
    expect(chatPage).toContain("Create personal To-Do");
    expect(chatPage).toContain("trpc.chat.messages.createPersonalTodo.useMutation");
    expect(chatPage).toContain("createPersonalTodo.mutate({ messageId: row.message.id })");
    expect(chatPage).toContain("utils.pm.personalTodos.invalidate()");
  });
});
