import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerMagicLinkRoutes } from "./magicLink";
import { registerUploadRoutes } from "../uploadRoutes";
import { registerAuditRoutes } from "../auditRoutes";
import { registerInvestorReportRoute } from "../proformaInvestorReport";
import { registerExternalApiRoutes } from "../externalApis";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { processOneTimeSmartPlanSends, processSmartPlanSteps } from "../smartPlanScheduler";
import { scheduleListingExpirationCheck } from "../listingExpirationScheduler";
import { scheduleOnboardingOverdueCheck } from "../onboardingOverdueScheduler";
import { scheduleAgentProductionReport } from "../agentProductionReportScheduler";
import { scheduleWeeklyLeadReport } from "../weeklyLeadReportScheduler";
import { scheduleDailyAgentReports } from "../dailyAgentReportScheduler";
import { scheduleDailyIsaActivitiesReport } from "../dailyIsaActivitiesReportScheduler";
import { scheduleWeeklyCoachingAccountabilityReport } from "../coachingWeeklyAccountabilityReport";
import { scheduleDailyCoachingTips } from "../dailyCoachingTipsScheduler";
import { refreshDueAnalyticsInsights, scheduleAnalyticsInsightRefresh } from "../analytics/workspace";
import { refreshDueBusinessInsights, scheduleBusinessInsightRefresh } from "../analytics/businessInsights";
import { handleResendWebhook, verifyResendWebhookSignature } from "./resendWebhook";
import { registerWebhookRoute } from "../webhookRoute";
import { detectAllDuplicates, persistDuplicatePairs } from "../duplicateDetection";
import { scheduleTempGrantExpiry } from "../tempGrantExpiryScheduler";
import { scheduleEmailBehaviorsSync } from "../emailBehaviorsSync";
import { scheduleRrMetricRefresh } from "../rrMetricScheduler";
import { registerAircallWebhook } from "../aircallWebhook";
import { registerZoomWebhook } from "../zoomWebhook";
import { scheduleAircallReliability } from "../aircallReliability";
import { schedulePulseWorkItemAutomation } from "../pulse/automation";
import { schedulePulseObservationGeneration } from "../pulse/observations";
import { ensureSavvyOSTrainingGuides } from "../trainingGuidesPublisher";
import { ENV } from "./env";
import { LANDING_PAGE_PUBLIC_TRPC_PATHS } from "../routers/landingPages";

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

  // `home.savvy-agents.com` serves only public Landing Pages. The SPA still
  // serves public documents on that host, while all protected/admin API calls
  // are rejected before they can reach authentication or application routers.
  const landingHost = (process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com").toLowerCase();
  app.use((req, res, next) => {
    const host = (req.hostname || req.headers.host || "").split(":")[0].toLowerCase();
    if (host !== landingHost) return next();
    if (!req.path.startsWith("/api/")) return next();
    if (!req.path.startsWith("/api/trpc/")) return res.status(404).json({ error: "Not found." });
    const procedures = req.path.slice("/api/trpc/".length).split(",").filter(Boolean);
    if (procedures.length && procedures.every((procedure) => LANDING_PAGE_PUBLIC_TRPC_PATHS.has(procedure))) return next();
    return res.status(404).json({ error: "Not found." });
  });

  // ── Resend webhook MUST be registered BEFORE the global JSON body parser ──
  // Resend (via Svix) signs the raw request body. If express.json() parses it
  // first, req.body becomes a JS object and .toString("utf8") yields
  // "[object Object]", causing HMAC verification to always fail (401).
  app.post("/api/webhooks/resend", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
      const signature = req.headers["svix-signature"] as string | undefined;
      const svixId = req.headers["svix-id"] as string | undefined;
      const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
      const secret = process.env.RESEND_WEBHOOK_SECRET || "";

      console.log("[Resend Webhook] Incoming request:", {
        secretConfigured: !!secret,
        secretPrefix: secret ? secret.slice(0, 10) + "..." : "(none)",
        hasSvixId: !!svixId,
        hasSvixTimestamp: !!svixTimestamp,
        hasSignature: !!signature,
        bodyIsBuffer: Buffer.isBuffer(req.body),
      });

      // Verify signature if secret is configured
      if (secret && !verifyResendWebhookSignature(rawBody, signature, secret, svixId, svixTimestamp)) {
        console.warn("[Resend Webhook] Signature verification FAILED");
        return res.status(401).json({ error: "Invalid webhook signature" });
      }

      console.log("[Resend Webhook] Signature verification PASSED (or no secret configured)");

      const event = JSON.parse(rawBody);
      const result = await handleResendWebhook(event, svixId);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[Resend Webhook] Error:", err.message);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Zoom signs the raw payload and also performs a challenge-response check.
  // It must be registered before the global parser for signature verification.
  app.post("/api/webhooks/zoom", express.raw({ type: "application/json" }));
  registerZoomWebhook(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Lightweight process liveness endpoint for Railway deployment health checks.
  // It must remain independent of the database and frontend fallback so a 200
  // confirms that the HTTP server is accepting requests.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Magic link auth — auto-login from email links
  registerMagicLinkRoutes(app);
  // File upload routes
  registerUploadRoutes(app);
  // Browser file opens/downloads, which bypass standard tRPC mutations.
  registerAuditRoutes(app);
  // Pro-forma Investor Report (HTML-to-PDF with Puppeteer)
  registerInvestorReportRoute(app);
  // External API proxies (Zillow, Airbnb)
  registerExternalApiRoutes(app);
  // Inbound webhook route — must be before express.json to capture raw body for HMAC
  registerWebhookRoute(app);

  // Aircall webhook — live call sync
  registerAircallWebhook(app);
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

  // Analytics insight cache refresh. This endpoint mirrors the internal
  // scheduler and is available to a Railway cron or secured operator run.
  app.post("/api/scheduled/analytics-insights-refresh", async (req, res) => {
    try {
      const internalSecret = process.env.SCHEDULED_TASK_SECRET;
      const headerSecret = req.headers["x-scheduled-task-secret"] as string | undefined;
      if (!internalSecret || headerSecret !== internalSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await refreshDueAnalyticsInsights();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[AnalyticsInsights] Scheduled endpoint error:", err.message);
      return res.status(500).json({ error: "Analytics insight refresh failed", detail: err.message });
    }
  });

  // Shared company-wide AI Business Insights cache. This external trigger mirrors
  // the deployed in-process weekly scheduler and is restricted to the internal secret.
  app.post("/api/scheduled/business-insights-refresh", async (req, res) => {
    try {
      const internalSecret = process.env.SCHEDULED_TASK_SECRET;
      const headerSecret = req.headers["x-scheduled-task-secret"] as string | undefined;
      if (!internalSecret || headerSecret !== internalSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await refreshDueBusinessInsights();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[BusinessInsights] Scheduled endpoint error:", err.message);
      return res.status(500).json({ error: "Business insight refresh failed", detail: err.message });
    }
  });

  // The thin-slice proof fixture is a development-only diagnostic. It must be
  // unreachable in production even before a caller can authenticate or invoke tRPC.
  if (ENV.isProduction) {
    app.use("/pulse/slice", (_req, res) => res.status(404).json({ error: "Not found." }));
    app.use("/api/trpc", (req, res, next) => {
      if (req.path.startsWith("/pulse.thinSlice")) return res.status(404).json({ error: "Not found." });
      next();
    });
  }

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

  // Canonical role-specific training guides are safely created or refreshed on startup.
  ensureSavvyOSTrainingGuides().catch((err) =>
    console.error("[TrainingGuides] Publication failed:", err)
  );

  // Smart Plan scheduler: process drip steps and a bounded batch of one-time sends every 5 minutes.
  setInterval(() => {
    processSmartPlanSteps().catch((err) => console.error("[SmartPlanScheduler] Cron error:", err));
    processOneTimeSmartPlanSends().catch((err) => console.error("[OneTimeSend] Cron error:", err));
  }, 5 * 60 * 1000);
  // Also run once shortly after startup.
  setTimeout(() => {
    processSmartPlanSteps().catch((err) => console.error("[SmartPlanScheduler] Startup run error:", err));
    processOneTimeSmartPlanSends().catch((err) => console.error("[OneTimeSend] Startup run error:", err));
  }, 10_000);

  // Listing expiration reminder: daily at 8am
  scheduleListingExpirationCheck();

  // Onboarding overdue task alerts: daily at 8am
  scheduleOnboardingOverdueCheck();

  // Agent production report: Friday at 6:00 PM Eastern
  scheduleAgentProductionReport();
  // Lead source funnel report: Friday at 6:00 PM Eastern
  scheduleWeeklyLeadReport();

  // Personalized agent operating digest: daily at 6:00 PM Eastern
  scheduleDailyAgentReports();
  // Shared leadership ISA activity report: daily at 8:00 AM Eastern for the prior day
  scheduleDailyIsaActivitiesReport();
  // Shared coaching leadership accountability report: Fridays at 12:00 PM Eastern
  scheduleWeeklyCoachingAccountabilityReport();
  // Coaching Tips For Today: shared leadership email at 8:00 AM Eastern on weekdays.
  scheduleDailyCoachingTips();

  // Analytics insight cache: poll daily and refresh each previously generated
  // authorized scope once its seven-day TTL expires.
  scheduleAnalyticsInsightRefresh();

  // Company-wide AI Business Insights: one shared cache, checked daily and
  // regenerated weekly. A manual admin refresh uses the same protected lifecycle.
  scheduleBusinessInsightRefresh();

  // Email Behaviors: sync Resend + GHL email activity every 4 hours
  scheduleEmailBehaviorsSync();

  // Temporary permission grant expiry: revoke expired temp grants every 15 min
  scheduleTempGrantExpiry();

  // R&R scorecard metrics: bounded automatic refresh every six hours.
  scheduleRrMetricRefresh();

  // Aircall: durable webhook ledger, media-ready event handling, self-healing
  // webhook configuration, and periodic inventory reconciliation.
  scheduleAircallReliability();

  // Pulse: deterministic weekly overdue digest and quarter rollover prompts.
  schedulePulseWorkItemAutomation();

  // Pulse: scheduled metric observations only. The job cannot create or alter work.
  schedulePulseObservationGeneration();
}

startServer().catch(console.error);
