import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerUploadRoutes } from "../uploadRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { processSmartPlanSteps } from "../smartPlanScheduler";
import { scheduleListingExpirationCheck } from "../listingExpirationScheduler";
import { scheduleOnboardingOverdueCheck } from "../onboardingOverdueScheduler";
import { scheduleAgentProductionReport } from "../agentProductionReportScheduler";
import { handleResendWebhook, verifyResendWebhookSignature } from "./resendWebhook";
import { registerWebhookRoute } from "../webhookRoute";
import { detectAllDuplicates, persistDuplicatePairs } from "../duplicateDetection";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // File upload routes
  registerUploadRoutes(app);
  // Inbound webhook route — must be before express.json to capture raw body for HMAC
  registerWebhookRoute(app);

  // Resend webhook for bounce/unsubscribe tracking
  app.post("/api/webhooks/resend", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const rawBody = req.body.toString("utf8");
      const signature = req.headers["svix-signature"] as string | undefined;
      const secret = process.env.RESEND_WEBHOOK_SECRET || "";

      // Verify signature if secret is configured
      if (secret && !verifyResendWebhookSignature(rawBody, signature, secret)) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      const event = JSON.parse(rawBody);
      const result = await handleResendWebhook(event);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Resend Webhook] Error:", err.message);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });
  // Scheduled task: nightly duplicate scan
  // Auth: session cookie (any authenticated user) OR internal secret header
  app.post("/api/scheduled/duplicate-scan", async (req, res) => {
    try {
      const internalSecret = process.env.SCHEDULED_TASK_SECRET;
      const headerSecret = req.headers["x-scheduled-task-secret"] as string | undefined;
      let authorized = false;
      if (internalSecret && headerSecret === internalSecret) {
        authorized = true;
      } else {
        try {
          const { sdk: authSdk } = await import("./sdk");
          const sessionUser = await authSdk.authenticateRequest(req);
          if (sessionUser && sessionUser.isActive !== false) authorized = true;
        } catch {
          authorized = false;
        }
      }
      if (!authorized) return res.status(401).json({ error: "Unauthorized" });
      const pairs = await detectAllDuplicates();
      const inserted = await persistDuplicatePairs(pairs);
      console.log(`[DuplicateScan] Detected ${pairs.length} pairs, inserted ${inserted} new`);
      return res.json({ ok: true, detected: pairs.length, inserted });
    } catch (err: any) {
      console.error("[DuplicateScan] Error:", err.message);
      return res.status(500).json({ error: "Scan failed", detail: err.message });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Smart Plan scheduler: check for due steps every 5 minutes
  setInterval(() => {
    processSmartPlanSteps().catch((err) => console.error("[SmartPlanScheduler] Cron error:", err));
  }, 5 * 60 * 1000);
  // Also run once shortly after startup
  setTimeout(() => {
    processSmartPlanSteps().catch((err) => console.error("[SmartPlanScheduler] Startup run error:", err));
  }, 10_000);

  // Listing expiration reminder: daily at 8am
  scheduleListingExpirationCheck();

  // Onboarding overdue task alerts: daily at 8am
  scheduleOnboardingOverdueCheck();

  // Agent production report: Friday at 6:00 PM Eastern
  scheduleAgentProductionReport();
}

startServer().catch(console.error);
