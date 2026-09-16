import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const notificationsPanel = readFileSync(
  path.join(root, "client/src/components/ProjectNotificationsPanel.tsx"),
  "utf8"
);
const projectRouter = readFileSync(
  path.join(root, "server/routers/pm.ts"),
  "utf8"
);

describe("Project Notifications bulk acknowledgement", () => {
  it("keeps Clear all visible and disables it only when there is nothing to acknowledge", () => {
    expect(notificationsPanel).toContain("trpc.pm.inbox.markAllRead.useMutation");
    expect(notificationsPanel).toContain('"Clear all"');
    expect(notificationsPanel).toContain('"No unread"');
    expect(notificationsPanel).toContain("disabled={unreadCount === 0 || markAllRead.isPending}");
    expect(notificationsPanel).toContain('markAllRead.mutate()');
  });

  it("refreshes the notification list and unread badge after acknowledgement", () => {
    expect(notificationsPanel).toContain("void refetchItems()");
    expect(notificationsPanel).toContain("void refetchCount()");
    expect(notificationsPanel).toContain("notifications acknowledged");
  });

  it("acknowledges only the signed-in user’s unread accessible notes and comments", () => {
    expect(projectRouter).toContain("markAllRead: protectedProcedure");
    expect(projectRouter).toContain("eq(pmNoteReads.userId, ctx.user.id)");
    expect(projectRouter).toContain("eq(pmTaskCommentReads.userId, ctx.user.id)");
    expect(projectRouter).toContain("notesMarkedRead");
    expect(projectRouter).toContain("commentsMarkedRead");
    expect(projectRouter).toContain("totalMarkedRead");
  });
});
