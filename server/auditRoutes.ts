import type { Application } from "express";
import { logActivity } from "./db";
import { sdk } from "./_core/sdk";

/**
 * Browser-side file opens and downloads do not pass through tRPC mutations.
 * This authenticated endpoint closes that audit gap without exposing file URLs
 * or sensitive query parameters in the activity log.
 */
export function registerAuditRoutes(app: Application) {
  app.post("/api/audit/download", async (req: any, res: any) => {
    try {
      let user: any = null;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        user = null;
      }

      if (!user || user.isActive === false) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const action = req.body?.action === "opened_file" ? "opened_file" : "downloaded_file";
      const fileName = typeof req.body?.fileName === "string"
        ? req.body.fileName.trim().slice(0, 255)
        : "File";
      const source = typeof req.body?.source === "string"
        ? req.body.source.trim().slice(0, 64)
        : "browser";

      await logActivity({
        userId: user.id,
        action,
        entityType: "file",
        details: {
          actorName: user.name ?? undefined,
          actorRole: user.role ?? undefined,
          fileName: fileName || "File",
          source,
        },
      });

      return res.status(204).end();
    } catch (error) {
      // File delivery should never depend on audit availability.
      console.error("[AuditRoutes] Failed to record browser file activity:", error);
      return res.status(204).end();
    }
  });
}
