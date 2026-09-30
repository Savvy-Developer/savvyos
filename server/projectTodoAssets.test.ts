import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeProjectTodoDetails } from "./projectTodoDetails";

const root = process.cwd();
const schema = readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const router = readFileSync(path.join(root, "server/routers/pm.ts"), "utf8");
const uploadRoutes = readFileSync(
  path.join(root, "server/uploadRoutes.ts"),
  "utf8"
);
const detailPage = readFileSync(
  path.join(root, "client/src/pages/ProjectDetailPage.tsx"),
  "utf8"
);
const myTodos = readFileSync(
  path.join(root, "client/src/components/MyTodosDashboard.tsx"),
  "utf8"
);
const attachmentSurface = readFileSync(
  path.join(root, "client/src/components/ProjectTodoAttachments.tsx"),
  "utf8"
);
const detailsSurface = readFileSync(
  path.join(root, "client/src/components/ProjectTodoDetails.tsx"),
  "utf8"
);
const schemaGuard = readFileSync(
  path.join(root, "server/projectTodoWorkflowSchema.ts"),
  "utf8"
);

describe("Project To-Do rich details and documents", () => {
  it("sanitizes details and preserves safe clickable links", () => {
    const details = sanitizeProjectTodoDetails(
      'Plan <script>alert("unsafe")</script> https://savvy-agents.com'
    );
    expect(details).toContain('href="https://savvy-agents.com"');
    expect(details).toContain('target="_blank"');
    expect(details).not.toContain("<script>");
  });

  it("stores Project-only attachment metadata with Project and task indexes", () => {
    expect(schema).toContain('"pm_task_attachments"');
    expect(schema).toContain("pmTaskAttachments");
    expect(schema).toContain("pm_task_attachments_task_idx");
    expect(schema).toContain("pm_task_attachments_project_stage_idx");
    expect(schemaGuard).toContain("pm_task_attachments");
  });

  it("requires server-side Project access for attachment lifecycle operations", () => {
    expect(router).toContain("getAttachments: protectedProcedure");
    expect(router).toContain("addAttachments: protectedProcedure");
    expect(router).toContain("discardAttachmentUpload: protectedProcedure");
    expect(router).toContain("getAttachmentDownloadUrl: protectedProcedure");
    expect(router).toContain("removeAttachment: protectedProcedure");
    expect(router).toContain(
      "await assertProjectAccess(db, task.projectId, ctx.user)"
    );
    expect(router).toContain("storageGetSignedUrl");
    expect(uploadRoutes).toContain("/api/projects/todos/attachments/upload");
    expect(uploadRoutes).toContain(
      "await assertProjectAccess(db, projectId, user)"
    );
    expect(uploadRoutes).toContain("project-todo-attachments");
  });

  it("limits staged attachments to the current Project task and current uploader", () => {
    expect(router).toContain("attachmentUploadIds");
    expect(router).toContain("pmTaskAttachments.uploadedById, ctx.user.id");
    expect(router).toContain("isNull(pmTaskAttachments.taskId)");
    expect(router).toContain("Attach up to 10 documents to one Project To-Do.");
  });

  it("renders rich links and documents from both Project To-Do workspaces", () => {
    expect(detailsSurface).toContain("ProjectTodoDetailsEditor");
    expect(detailsSurface).toContain("dangerouslySetInnerHTML");
    expect(attachmentSurface).toContain("Attach documents");
    expect(attachmentSurface).toContain("getAttachmentDownloadUrl");
    expect(detailPage).toContain("ProjectTodoDetailsEditor");
    expect(detailPage).toContain("ProjectTodoAttachments");
    expect(myTodos).toContain("ProjectTodoDetailsEditor");
    expect(myTodos).toContain("ProjectTodoAttachments");
  });
});
