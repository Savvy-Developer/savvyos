import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerMagicLinkRoutes } from "./magicLink";
import { isCrossSiteWrite, isTrustedOrigin } from "./corsPolicy";
import { registerCspReportRoute, securityHeadersMiddleware } from "./securityHeaders";
import { registerStaffWebsiteHandoffRoute } from "../staffWebsiteHandoff";
import { registerUploadRoutes } from "../uploadRoutes";
import { registerMlsMediaRoute } from "../mls/privateMedia";
import { registerAuditRoutes } from "../auditRoutes";
import { registerInvestorReportRoute } from "../proformaInvestorReport";
import { registerExternalApiRoutes } from "../externalApis";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  processOneTimeSmartPlanSends,
  processSmartPlanSteps,
} from "../smartPlanScheduler";
import { processAgentIntroductionFollowUps } from "../agentIntroductionFollowUps";
import { scheduleListingExpirationCheck } from "../listingExpirationScheduler";
import { scheduleOnboardingOverdueCheck } from "../onboardingOverdueScheduler";
import { scheduleAgentProductionReport } from "../agentProductionReportScheduler";
import { scheduleWeeklyLeadReport } from "../weeklyLeadReportScheduler";
import { scheduleWeeklyOperationsReports } from "../weeklyOperationsReportsScheduler";
import { scheduleDailyAgentReports } from "../dailyAgentReportScheduler";
import { scheduleWebsiteDailyEmail } from "../websiteDailyEmail";
import { schedulePriceDropAlerts } from "../websitePriceDropAlerts";
import { scheduleSoldSweep } from "../websiteSoldSweep";
import { scheduleListingExpiry } from "../websiteListingExpiry";
import { scheduleDailyIsaActivitiesReport } from "../dailyIsaActivitiesReportScheduler";
import { scheduleMonthlyAgentRenewalsReport } from "../monthlyAgentRenewalsReport";
import { scheduleWeeklyCoachingAccountabilityReport } from "../coachingWeeklyAccountabilityReport";
import { scheduleDailyCoachingTips } from "../dailyCoachingTipsScheduler";
import { scheduleCoachFeedback } from "../coachingFeedback";
import {
  refreshDueAnalyticsInsights,
  scheduleAnalyticsInsightRefresh,
} from "../analytics/workspace";
import {
  refreshDueBusinessInsights,
  scheduleBusinessInsightRefresh,
} from "../analytics/businessInsights";
import { registerResendWebhookRoute } from "../resendWebhookRoute";
import { registerWebhookRoute } from "../webhookRoute";
import { captureInboundRawBody } from "../webhookSignature";
import {
  detectAllDuplicates,
  persistDuplicatePairs,
} from "../duplicateDetection";
import { scheduleTempGrantExpiry } from "../tempGrantExpiryScheduler";
import { scheduleEmailBehaviorsSync } from "../emailBehaviorsSync";
import { scheduleRrMetricRefresh } from "../rrMetricScheduler";
import { registerAircallWebhook } from "../aircallWebhook";
import { registerZoomWebhook } from "../zoomWebhook";
import { scheduleAircallReliability } from "../aircallReliability";
import { scheduleContactIntelligence } from "../contactIntelligence";
import { schedulePulseWorkItemAutomation } from "../pulse/automation";
import { schedulePulseObservationGeneration } from "../pulse/observations";
import { scheduleMarketIntelligenceRefresh } from "../agentMarketsIntelligence";
import { scheduleMarketProfileSurveyReminders } from "../marketProfileSurveyScheduler";
import { scheduleAgentProfileReminderCampaigns } from "../agentProfileReminderScheduler";
import { ensureSavvyOSTrainingGuides } from "../trainingGuidesPublisher";
import {
  constructStripeWebhookEvent,
  handleStripeWebhookEvent,
  isStripeConfigured,
} from "../vendorBilling";
import { scheduleMonthlyFeaturedVendorEarningsReport } from "../monthlyFeaturedVendorEarningsReport";
import { ENV } from "./env";
import { LANDING_PAGE_PUBLIC_TRPC_PATHS } from "../routers/landingPages";
import { WEBSITE_PUBLIC_TRPC_PATHS } from "../routers/website";
import { WEBSITE_ACCOUNT_PUBLIC_TRPC_PATHS } from "../routers/websiteAccount";
import { RECRUITING_PUBLIC_TRPC_PATHS } from "../routers/recruiting";
import { registerShortLinkRedirects } from "../shortLinkRedirects";
import { getLandingPageMetadata } from "../landingPageHtml";
import {
  registerWebsiteSeoRoutes,
  resolveWebsitePage,
} from "../websiteSeo";
import { websiteTagsForRequest } from "../websiteTracking";
import { registerLandingPageRedirects } from "../landingPageRedirects";
import { registerWebsitePathRedirects } from "../websitePathRedirects";
import { registerLegacySiteRedirects } from "../legacySiteRedirects";
import { registerWebsiteLinkForwarding } from "../websiteLinkForwarding";
import { registerWebsiteMetaCatalog } from "../websiteMetaCatalog";
import { ensureWebsiteLinkForwardingSchema } from "../websiteLinkForwardingSchema";
import { registerReleaseNotificationRoute } from "../releaseNotificationRoute";
import { registerMarketingEmailUnsubscribeRoutes } from "../marketingEmailUnsubscribe";
import { registerReadOnlyMcpRoute } from "../readOnlyMcp";
import { registerMcpOAuthRoutes } from "../mcpOAuth";
import { registerMarketMatchQuizCalendlyWebhook } from "../marketMatchQuizCalendlyWebhook";
import { scheduleInactiveQuizFollowUps } from "../marketMatchQuiz";
import { registerCalendarOAuthRoutes } from "../calendarOAuthRoutes";
import { registerSwoogoEventsWebhook } from "../eventsSwoogoWebhook";
import { startSwoogoTokenRefresh } from "../swoogoEvents";
import { ensureProjectTodoWorkflowSchema } from "../projectTodoWorkflowSchema";
import { ensureProjectWeeklyUpdateSchema } from "../projectWeeklyUpdateSchema";
import { ensureWebinarRequestSchema } from "../webinarRequestSchema";
import { ensureContactLeadSourceTrigger } from "../contactLeadSourceTrigger";
import { ensureRrMeasurableSchema } from "../rrMeasurableSchema";
import { ensureCoachingWorkflowSchema } from "../coachingWorkflowSchema";
import { ensureOneOnOneSchema } from "../oneOnOneSchema";
import { ensurePipelineChecklistSchema } from "../pipelineChecklistSchema";
import { ensureEventProjectLinkSchema } from "../eventProjectLinkSchema";
import { ensureSponsorContactLogSchema } from "../sponsorContactLogSchema";
import { ensureChatUserAccessSchema } from "../chatUserAccessSchema";
import { ensureWebsiteTeamSchema } from "../websiteTeamSchema";
import { ensureWebsitePriceDropSchema } from "../websitePriceDropSchema";
import { ensureWebsiteSoldSweepSchema } from "../websiteSoldSweepSchema";
import { ensureWebsiteListingExpirySchema } from "../websiteListingExpirySchema";
import { ensureWebsiteFeaturedSchema } from "../websiteFeaturedSchema";
import { ensureWebsiteCaseStudySeoSchema } from "../websiteCaseStudySeo";
import { ensureWebsiteSignupAudienceSchema } from "../websiteSignupAudience";
import { ensureVendorListsMultiSchema } from "../vendorListsMultiSchema";
import { ensureTransactionTerminationTextSchema } from "../transactionTerminationTextSchema";
import { ensureTransactionCustomFieldsSchema } from "../transactionCustomFieldsSchema";
import { ensureOnboardingLifecycleSchema } from "../onboardingLifecycleSchema";
import { ensureUserEmploymentTypeSchema } from "../userEmploymentTypeSchema";
import { ensureOrganicSocialLeadSources } from "../organicSocialLeadSources";
import { ensureWebsiteLeadSources } from "../websiteLeadSources";
import { ensureMarketStateFix } from "../marketStateFix";
import { ensureMlsSchema } from "../mls/schema";
import { registerMlsStatusRoute } from "../mls/status";
import { startInProcessMlsIngestion } from "../mls/worker";
import { ensurePulseRunnerIssueSourceSchema } from "../pulse/runnerIssueSourceSchema";
import { ensureDatabaseBackupSchema } from "../databaseBackup";

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
  // The schema guard is idempotent and completes before Railway marks a new
  // instance healthy, so this release never serves its new project To-Do fields
  // against a pre-migration database.
  await ensureProjectTodoWorkflowSchema();
  await ensureProjectWeeklyUpdateSchema();
  await ensureWebinarRequestSchema();
  await ensureContactLeadSourceTrigger();
  await ensureRrMeasurableSchema();
  await ensureCoachingWorkflowSchema();
  await ensureOneOnOneSchema();
  await ensurePipelineChecklistSchema();
  await ensureEventProjectLinkSchema();
  await ensureSponsorContactLogSchema();
  await ensureChatUserAccessSchema();
  await ensureWebsiteTeamSchema();
  await ensureWebsitePriceDropSchema();
  await ensureWebsiteSoldSweepSchema();
  await ensureWebsiteLinkForwardingSchema();
  await ensureWebsiteListingExpirySchema();
  await ensureWebsiteFeaturedSchema();
  await ensureWebsiteCaseStudySeoSchema();
  await ensureWebsiteSignupAudienceSchema();
  await ensureVendorListsMultiSchema();
  await ensureTransactionTerminationTextSchema();
  await ensureTransactionCustomFieldsSchema();
  await ensureUserEmploymentTypeSchema();
  // Onboarding queries select lifecycle columns, so repair the legacy schema
  // before any request can incorrectly present the active cohort as empty.
  await ensureOnboardingLifecycleSchema();
  await ensurePulseRunnerIssueSourceSchema();
  // Nightly database backup (runs in its own service, databaseBackupWorker):
  // the table that records each run.
  await ensureDatabaseBackupSchema();
  // Organic Social lead sources exist before the first organic lead arrives
  // (a lead source locks at creation), and the legacy Facebook/Instagram
  // import buckets are renamed and retired once.
  await ensureOrganicSocialLeadSources();
  // Lead sources for the website forms (under Savvy-Agents.com), and the
  // one-time state fix for seven markets listed under "Other".
  await ensureWebsiteLeadSources();
  await ensureMarketStateFix();
  // MLS Properties tables and its two admin permission columns. The columns
  // must exist before any request selects admin_permissions.
  await ensureMlsSchema();

  const app = express();
  const server = createServer(app);

  // Browser security headers on every response (security audit 08), and the
  // address browsers report would-be-blocked content to. Both before the
  // public host's /api guard below, so the public site is covered too.
  app.disable("x-powered-by");
  app.use(securityHeadersMiddleware());
  registerCspReportRoute(app);

  // CORS. Only our own hosts get credentialed access; any other origin can
  // read anonymous responses but never a signed-in one, and cannot make a
  // state-changing /api call. See corsPolicy.ts.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (isCrossSiteWrite(req)) {
      return res.status(403).json({ error: "Cross-site request refused." });
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.vary("Origin");
      if (isTrustedOrigin(origin)) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,X-Session-Token,x-trpc-source"
      );
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // `home.savvy-agents.com` serves the public site and Landing Pages. Every
  // tRPC path not on an allowlist is rejected here, before it reaches a router,
  // so no staff or admin procedure can be called from this host whatever else
  // goes wrong. Investor accounts are allowlisted deliberately: they are a
  // separate auth system with their own cookie and table, and never accept a
  // staff session. See WEBSITE_ACCOUNT_PUBLIC_TRPC_PATHS.
  // The Meta catalog feed, before the public host's /api guard below so the
  // old address /api/meta-catalog is reachable there too.
  registerWebsiteMetaCatalog(app);

  const landingHost = (
    process.env.PUBLIC_LANDING_PAGE_HOST || "home.savvy-agents.com"
  ).toLowerCase();
  const landingHosts = new Set([landingHost, `www.${landingHost}`]);
  const landingHostPublicProcedures = new Set([
    ...Array.from(LANDING_PAGE_PUBLIC_TRPC_PATHS),
    ...Array.from(WEBSITE_PUBLIC_TRPC_PATHS),
    ...Array.from(WEBSITE_ACCOUNT_PUBLIC_TRPC_PATHS),
    ...Array.from(RECRUITING_PUBLIC_TRPC_PATHS),
  ]);
  app.use((req, res, next) => {
    const host = (req.hostname || req.headers.host || "")
      .split(":")[0]
      .toLowerCase();
    if (!landingHosts.has(host)) return next();
    if (!req.path.startsWith("/api/")) return next();
    if (!req.path.startsWith("/api/trpc/"))
      return res.status(404).json({ error: "Not found." });
    const procedures = req.path
      .slice("/api/trpc/".length)
      .split(",")
      .filter(Boolean);
    if (
      procedures.length &&
      procedures.every(procedure => landingHostPublicProcedures.has(procedure))
    )
      return next();
    return res.status(404).json({ error: "Not found." });
  });

  // Resolve published page metadata before the SPA fallback. The renderer will
  // still hydrate normally, while crawlers and advertising-preview fetchers
  // receive title, description, social image, and approved vendor tags in HTML.
  app.use(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // Analytics tags (Tag Manager, Clarity) for public website pages only.
    res.locals.websiteTags = websiteTagsForRequest(req);
    try {
      // Landing pages first; /newsite addresses never match a landing slug
      // (they contain a slash), so the two never compete for a request.
      res.locals.landingPageMetadata = await getLandingPageMetadata(req);
      if (!res.locals.landingPageMetadata) {
        // A /newsite address that names nothing published answers 404 (the
        // app still renders its "Page not found"); see websitePageStatus.
        const page = await resolveWebsitePage(req);
        res.locals.landingPageMetadata = page?.metadata ?? null;
        res.locals.websiteNotFound = page?.status === 404;
      }
    } catch (error) {
      console.error("[LandingPages] Metadata lookup failed:", error);
      res.locals.landingPageMetadata = null;
      res.locals.websiteNotFound = false;
    }
    return next();
  });

  // ── Resend webhook MUST be registered BEFORE the global JSON body parser ──
  // Resend (via Svix) signs the raw request body. If express.json() parses it
  // first, req.body becomes a JS object and .toString("utf8") yields
  // "[object Object]", causing HMAC verification to always fail (401).
  registerResendWebhookRoute(app);

  // Stripe signs the original request body. Keep this route before express.json()
  // so signature verification remains valid and duplicate events can be handled safely.
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
        return res
          .status(503)
          .json({ error: "Stripe billing is not configured." });
      }
      try {
        const rawBody = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(req.body);
        const signature = req.headers["stripe-signature"] as string | undefined;
        const event = constructStripeWebhookEvent(rawBody, signature);
        const result = await handleStripeWebhookEvent(event);
        return res.status(200).json({ received: true, ...result });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Stripe webhook processing failed";
        const isSignatureError = /signature|Stripe-Signature/i.test(message);
        console.error("[Stripe Webhook] Processing error:", message);
        return res
          .status(isSignatureError ? 400 : 500)
          .json({
            error: isSignatureError
              ? "Invalid webhook signature."
              : "Stripe webhook processing failed.",
          });
      }
    }
  );

  // Zoom signs the raw payload and also performs a challenge-response check.
  // It must be registered before the global parser for signature verification.
  app.post("/api/webhooks/zoom", express.raw({ type: "application/json" }));
  registerZoomWebhook(app);

  // Configure body parser with larger size limit for file uploads
  // captureInboundRawBody keeps the original bytes for /api/inbound/* so the
  // inbound webhook HMAC is checked against what the sender actually signed.
  app.use(express.json({ limit: "50mb", verify: captureInboundRawBody }));
  app.use(
    express.urlencoded({
      limit: "50mb",
      extended: true,
      verify: captureInboundRawBody,
    })
  );

  // Campaign emails are sent through the Resend Emails API, so SavvyOS owns the
  // browser and RFC 8058 one-click unsubscribe flow for Smart Plan outreach.
  registerMarketingEmailUnsubscribeRoutes(app);

  // Lightweight process liveness endpoint for Railway deployment health checks.
  // It must remain independent of the database and frontend fallback so a 200
  // confirms that the HTTP server is accepting requests.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  // Public, count-only MLS Properties schema check (no listing data).
  registerMlsStatusRoute(app);
  // Links to home.savvy-agents.com/newsite forward to the site's new address
  // once that is switched on in Website Studio (off until then). Before the
  // redirect rules below, so a published link always lands on the same page
  // with its UTMs.
  registerWebsiteLinkForwarding(app);
  // Legacy GHL paths resolve first so a migration redirect never competes with
  // a landing-page slug or a branded short link.
  registerLandingPageRedirects(app);
  // Fixed /newsite path redirects (retired listing slugs, renamed markets),
  // from shared/websitePathRedirects.ts. After the hand-made redirects, so
  // those always win.
  registerWebsitePathRedirects(app);
  // Old savvy-agents.com addresses, for when that domain points here. After
  // the hand-made redirects above, so those always win.
  registerLegacySiteRedirects(app);
  // Public short links are checked before the SPA fallback so links shared from
  // home.savvy-agents.com redirect without showing the SavvyOS hostname.
  registerShortLinkRedirects(app);
  // sitemap.xml and robots.txt for the public host, before the SPA fallback
  // would answer them with index.html.
  registerWebsiteSeoRoutes(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Per-user Google Calendar OAuth connection and callback.
  registerCalendarOAuthRoutes(app);
  // Magic link auth — auto-login from email links
  registerMagicLinkRoutes(app);
  // One-time SavvyOS sign-in for staff who used the public website's Sign in.
  registerStaffWebsiteHandoffRoute(app);
  // File upload routes
  registerUploadRoutes(app);
  registerMlsMediaRoute(app);
  // Browser file opens/downloads, which bypass standard tRPC mutations.
  registerAuditRoutes(app);
  // Pro-forma Investor Report (HTML-to-PDF with Puppeteer)
  registerInvestorReportRoute(app);
  // External API proxies (Zillow, Airbnb)
  registerExternalApiRoutes(app);
  // Trusted GitHub release summaries post only plain-language Slack messages.
  registerReleaseNotificationRoute(app);
  // OAuth 2.1 discovery, PKCE sign-in, authorization, and token endpoints for
  // ChatGPT, Claude, and other remote MCP clients.
  registerMcpOAuthRoutes(app);
  // Exposes all current SavvyOS data tables through the OAuth-protected,
  // strictly read-only Streamable HTTP MCP endpoint.
  registerReadOnlyMcpRoute(app);
  // Inbound webhook route. HMAC is checked against the raw bytes kept by the body parsers above.
  registerWebhookRoute(app);

  // Calendly sends provider-confirmed Market Match bookings and cancellations.
  // This endpoint is intentionally separate from the landing-page client event.
  registerMarketMatchQuizCalendlyWebhook(app);

  // Aircall webhook — live call sync
  registerAircallWebhook(app);
  // Swoogo deliveries are acknowledged before deferred verification work.
  registerSwoogoEventsWebhook(app);
  startSwoogoTokenRefresh();
  // Scheduled task: nightly duplicate scan
  // Auth: session cookie (any authenticated user) OR internal secret header
  app.post("/api/scheduled/duplicate-scan", async (req, res) => {
    try {
      const internalSecret = process.env.SCHEDULED_TASK_SECRET;
      const headerSecret = req.headers["x-scheduled-task-secret"] as
        | string
        | undefined;
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
      console.log(
        `[DuplicateScan] Detected ${pairs.length} pairs, inserted ${inserted} new`
      );
      return res.json({ ok: true, detected: pairs.length, inserted });
    } catch (err: any) {
      console.error("[DuplicateScan] Error:", err.message);
      return res
        .status(500)
        .json({ error: "Scan failed", detail: err.message });
    }
  });

  // Analytics insight cache refresh. This endpoint mirrors the internal
  // scheduler and is available to a Railway cron or secured operator run.
  app.post("/api/scheduled/analytics-insights-refresh", async (req, res) => {
    try {
      const internalSecret = process.env.SCHEDULED_TASK_SECRET;
      const headerSecret = req.headers["x-scheduled-task-secret"] as
        | string
        | undefined;
      if (!internalSecret || headerSecret !== internalSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await refreshDueAnalyticsInsights();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error(
        "[AnalyticsInsights] Scheduled endpoint error:",
        err.message
      );
      return res
        .status(500)
        .json({
          error: "Analytics insight refresh failed",
          detail: err.message,
        });
    }
  });

  // Shared company-wide AI Business Insights cache. This external trigger mirrors
  // the deployed in-process weekly scheduler and is restricted to the internal secret.
  app.post("/api/scheduled/business-insights-refresh", async (req, res) => {
    try {
      const internalSecret = process.env.SCHEDULED_TASK_SECRET;
      const headerSecret = req.headers["x-scheduled-task-secret"] as
        | string
        | undefined;
      if (!internalSecret || headerSecret !== internalSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await refreshDueBusinessInsights();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error(
        "[BusinessInsights] Scheduled endpoint error:",
        err.message
      );
      return res
        .status(500)
        .json({
          error: "Business insight refresh failed",
          detail: err.message,
        });
    }
  });

  // The thin-slice proof fixture is a development-only diagnostic. It must be
  // unreachable in production even before a caller can authenticate or invoke tRPC.
  if (ENV.isProduction) {
    app.use("/pulse/slice", (_req, res) =>
      res.status(404).json({ error: "Not found." })
    );
    app.use("/api/trpc", (req, res, next) => {
      if (req.path.startsWith("/pulse.thinSlice"))
        return res.status(404).json({ error: "Not found." });
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
  // MLS ingestion normally runs in its own service (SAVVYOS_PROCESS=mlsIngestionWorker).
  // MLS_INGESTION_IN_WEB=on runs it here instead, for small deployments.
  startInProcessMlsIngestion().catch(err => console.error("[mls] in-process ingestion failed to start:", err));

  // Canonical role-specific training guides are safely created or refreshed on startup.
  ensureSavvyOSTrainingGuides().catch(err =>
    console.error("[TrainingGuides] Publication failed:", err)
  );

  // Smart Plan scheduler: process drip steps and a bounded batch of one-time sends every 5 minutes.
  setInterval(
    () => {
      processSmartPlanSteps().catch(err =>
        console.error("[SmartPlanScheduler] Cron error:", err)
      );
      processOneTimeSmartPlanSends().catch(err =>
        console.error("[OneTimeSend] Cron error:", err)
      );
      processAgentIntroductionFollowUps().catch(err =>
        console.error("[AgentIntroductions] Cron error:", err)
      );
    },
    5 * 60 * 1000
  );
  // Also run once shortly after startup.
  setTimeout(() => {
    processSmartPlanSteps().catch(err =>
      console.error("[SmartPlanScheduler] Startup run error:", err)
    );
    processOneTimeSmartPlanSends().catch(err =>
      console.error("[OneTimeSend] Startup run error:", err)
    );
    processAgentIntroductionFollowUps().catch(err =>
      console.error("[AgentIntroductions] Startup run error:", err)
    );
  }, 10_000);

  // Daily property email (Website Studio > Daily Email): the approved batch
  // at the chosen hour Eastern, 5 PM by default. Off until switched on.
  scheduleWebsiteDailyEmail();
  // Price drop alerts: checks live listings every 30 minutes. Sends nothing
  // until switched on in Website Studio > Daily Email.
  schedulePriceDropAlerts();
  // Sold sweep: every hour, takes a live listing off the website once its
  // property has a closed deal. WEBSITE_SOLD_SWEEP=off stops it.
  scheduleSoldSweep();
  // 90-day expiry: a listing live that long goes back to Draft and its agent
  // is emailed. WEBSITE_LISTING_EXPIRY_DAYS changes the days, or "off".
  scheduleListingExpiry();

  // Listing expiration reminder: daily at 8am
  scheduleListingExpirationCheck();

  // Onboarding overdue task alerts: daily at 8am
  scheduleOnboardingOverdueCheck();
  // Database-backed agent Extended Profile reminder campaigns: startup check,
  // then every 15 minutes so due one-time and quarterly sends survive restarts.
  scheduleAgentProfileReminderCampaigns();

  // Agent production report: Friday at 6:00 PM Eastern
  scheduleAgentProductionReport();
  // Lead source funnel report: Friday at 6:00 PM Eastern
  scheduleWeeklyLeadReport();
  // Company webinars and leadership referrals: Monday at 12:00 PM Eastern
  scheduleWeeklyOperationsReports();

  // Personalized agent operating digest: daily at 6:00 PM Eastern
  scheduleDailyAgentReports();
  // Shared leadership ISA activity report: daily at 8:00 AM Eastern for the prior day
  scheduleDailyIsaActivitiesReport();
  // Shared Agent Renewals report: 9:00 AM Eastern on the first of every month.
  scheduleMonthlyAgentRenewalsReport();
  // Featured vendor collections: leadership totals and private 75% agent earnings
  // statements at 9:00 AM Eastern on the first of every month.
  scheduleMonthlyFeaturedVendorEarningsReport();
  // Shared coaching leadership accountability report: Fridays at 12:00 PM Eastern
  scheduleWeeklyCoachingAccountabilityReport();
  // Coaching Tips For Today: shared leadership email at 8:00 AM Eastern on weekdays.
  scheduleDailyCoachingTips();
  // Anonymous coach feedback: session invitations begin one hour after scheduled calls;
  // coaches and designated leadership receive only Friday 8:00 PM Eastern aggregates.
  scheduleCoachFeedback();

  // Analytics insight cache: poll daily and refresh each previously generated
  // authorized scope once its seven-day TTL expires.
  scheduleAnalyticsInsightRefresh();

  // Company-wide AI Business Insights: one shared cache, checked daily and
  // regenerated weekly. A manual admin refresh uses the same protected lifecycle.
  scheduleBusinessInsightRefresh();

  // Agent Markets: refresh source-grounded market intelligence only when its
  // bounded evidence fingerprint changes, preserving a living market profile.
  scheduleMarketIntelligenceRefresh();
  // Public Market Match: consented two-step follow-up begins only after a
  // buyer leaves an in-progress quiz inactive for 24 hours.
  scheduleInactiveQuizFollowUps();
  scheduleMarketProfileSurveyReminders();

  // Email Behaviors: sync Resend + GHL email activity every 4 hours
  scheduleEmailBehaviorsSync();

  // Temporary permission grant expiry: revoke expired temp grants every 15 min
  scheduleTempGrantExpiry();

  // R&R scorecard metrics: bounded automatic refresh every six hours.
  scheduleRrMetricRefresh();

  // Aircall: durable webhook ledger, media-ready event handling, self-healing
  // webhook configuration, and periodic inventory reconciliation.
  scheduleAircallReliability();

  // Contact Intelligence: low-concurrency, source-hashed enrichment of native
  // Aircall transcripts. It is a separate durable queue so webhook processing
  // never waits on model latency and human CRM fields are never auto-overwritten.
  scheduleContactIntelligence();

  // Pulse: deterministic weekly overdue digest and quarter rollover prompts.
  schedulePulseWorkItemAutomation();

  // Pulse: scheduled metric observations only. The job cannot create or alter work.
  schedulePulseObservationGeneration();
}

// Background schedulers run with `void job()`. A database restart can make any
// of them reject; that must be logged, not allowed to take the whole site down.
process.on("unhandledRejection", reason => {
  console.error("[Process] Unhandled rejection (server kept running):", reason);
});

// If startup fails (for example the database is still restarting), exit
// non-zero so Railway restarts the container. Logging and falling through
// used to leave a process with nothing to run, which exited 0 and was never
// restarted.
startServer().catch(err => {
  console.error("[Startup] SavvyOS failed to start; exiting for restart:", err);
  process.exit(1);
});
