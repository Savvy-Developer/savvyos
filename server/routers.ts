import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { z } from "zod";
import { SIMULATE_COOKIE, SIMULATE_OWNER_EMAIL, WORK_AS_COOKIE } from "./_core/context";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { sendTransactionalEmail, getEmailPreview } from "./_core/resendEmail";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { ENV } from "./_core/env";
import { emailTemplates, emailNotificationSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { contactsRouter, connectionRequestsRouter } from "./routers/contacts";
import { agentConnectionsRouter } from "./routers/agentConnections";
import { propertiesRouter } from "./routers/properties";
import { transactionsRouter } from "./routers/transactions";
import { tasksRouter } from "./routers/tasks";
import { documentsRouter } from "./routers/documents";
import { communicationsRouter } from "./routers/communications";
import { analyticsRouter } from "./routers/analytics";
import { usersRouter } from "./routers/users";
import { groupsRouter } from "./routers/groups";
import { payoutsRouter } from "./routers/payouts";
import { leadSourcesRouter } from "./routers/leadSources";
import { contactPropertiesRouter } from "./routers/contactProperties";
import { approvalRequestsRouter } from "./routers/approvalRequests";
import { listingsRouter } from "./routers/listings";
import { smartPlansRouter } from "./routers/smartPlans";
import { marketsRouter } from "./routers/markets";
import { feedbackRouter } from "./routers/feedback";
import { onboardingRouter } from "./routers/onboarding";
import { leadershipRouter } from "./routers/leadership";
import { commissionExceptionsRouter } from "./routers/commissionExceptions";
import { marketMatchRouter } from "./routers/marketMatch";
import { marketingRequestsRouter } from "./routers/marketingRequests";
import { pmRouter } from "./routers/pm";
import { knowledgeBaseRouter } from "./routers/knowledgeBase";
import { agentSupportRouter, WORK_AS_COOKIE as AS_WORK_COOKIE } from "./routers/agentSupport";
import { duplicatesRouter } from "./routers/duplicates";
import { webhooksRouter } from "./routers/webhooks";

// Shared test email payload builder
function buildTestEmailPayloads(ctx2: { recipientEmail: string; recipientName: string }) {
  return [
    ["lead_assigned", { ...ctx2, contactName: "Jane Smith", notes: "Interested in STR investment, budget $500k" }],
    ["transaction_created", { ...ctx2, transactionNumber: "TXN-TEST-001", transactionType: "buyer", contactName: "Jane Smith", propertyAddress: "123 Mountain View Dr, Asheville, NC", amount: "$525,000" }],
    ["transaction_status_changed", { ...ctx2, transactionNumber: "TXN-TEST-001", contactName: "Jane Smith", status: "Under Contract" }],
    ["transaction_closed", { ...ctx2, transactionNumber: "TXN-TEST-001", contactName: "Jane Smith", amount: "$525,000" }],
    ["commission_calculated", { ...ctx2, transactionNumber: "TXN-TEST-001", percentage: "80", amount: "$12,600" }],
    ["task_assigned", { ...ctx2, taskTitle: "Follow up with Jane Smith re: buy box", dueDate: "Mar 25, 2026", contactName: "Jane Smith" }],
    ["task_due", { ...ctx2, taskTitle: "Follow up with Jane Smith re: buy box", dueDate: "Today" }],
    ["payout_integrity_fail", { ...ctx2, transactionNumber: "TXN-TEST-001" }],
    ["listing_created", { ...ctx2, listingAddress: "456 Blue Ridge Pkwy, Asheville, NC", contactName: "Bob Seller", listPrice: "$875,000", listingDate: "Mar 18, 2026", expirationDate: "Jun 18, 2026" }],
    ["listing_expiration_reminder", { ...ctx2, listingAddress: "456 Blue Ridge Pkwy, Asheville, NC", contactName: "Bob Seller", listPrice: "$875,000", expirationDate: "March 1, 2026" }],
    ["onboarding_overdue", { ...ctx2, overdueCount: "3", taskList: "• Complete W-9 form\n• Upload license copy\n• Sign brokerage agreement" }],
    ["commission_exception_warning", { ...ctx2, transactionNumber: "TXN-TEST-001", notes: "Total payout exceeds 100% — please review split" }],
    ["market_match_intro", { ...ctx2, investorFirstName: "Alex", marketName: "Asheville", marketState: "NC", investorBudget: "$400k–$600k", investorGoals: "Cash-flowing STR with 15%+ CoC return", isaName: "Jordan Lee", callSummarySnippet: "Alex is looking for a 3BR cabin near downtown Asheville with strong Airbnb history.", handoffNotes: "Pre-approved, ready to move within 60 days. Prefers off-market deals." }],
    ["client_intro", { ...ctx2, agentName: "Sarah Mitchell", contactName: "Alex Johnson", isaName: "Jordan Lee", agentBookingLink: "https://calendly.com/sarah-mitchell" }],
    ["connection_request_approved", { ...ctx2, contactName: "Jane Smith", agentName: "Sarah Mitchell", pipelineStatus: "Nurture" }],
    ["pm_mention", { ...ctx2, mentionedByName: "Tyler Coon", projectTitle: "Website Redesign Q2", noteContent: "Hey, can you review the wireframes for the landing page before Friday?", projectUrl: "https://savvyos-rgtcxhr8.manus.space/projects/1" }],
  ] as [string, Record<string, string>][];
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const isSimulating = opts.ctx.realUser?.id !== opts.ctx.user?.id;
      const realRole = opts.ctx.realUser?.role;
      // Expose realUser for admins simulating AND for agent_support working as agent
      const exposeRealUser = realRole === "admin" || realRole === "agent_support";
      return {
        ...opts.ctx.user,
        isSimulating,
        isWorkingAsAgent: realRole === "agent_support" && isSimulating,
        realUser: exposeRealUser ? opts.ctx.realUser : null,
      };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(SIMULATE_COOKIE, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(WORK_AS_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    simulateAs: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.realUser?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to simulate users" });
        }
        const target = await db.getUserById(input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(SIMULATE_COOKIE, String(input.userId), { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, simulatedUser: target };
      }),
    stopSimulation: protectedProcedure
      .mutation(({ ctx }) => {
        if (ctx.realUser?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
        }
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(SIMULATE_COOKIE, { ...cookieOptions, maxAge: -1 });
        return { success: true };
      }),
    /** DEV ONLY: log in as a mock user by role without OAuth */
    devLogin: publicProcedure
      .input(z.object({ role: z.enum(["admin", "isa", "agent"]) }))
      .mutation(async ({ input, ctx }) => {
        if (process.env.NODE_ENV !== "development") {
          throw new Error("Dev login is only available in development mode");
        }
        const openIdMap = {
          admin: "dev_admin_001",
          isa: "dev_isa_001",
          agent: "dev_agent_001",
        };
        const openId = openIdMap[input.role];
        const token = await sdk.createSessionToken(openId, { name: `Dev ${input.role}` });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true, role: input.role };
      }),

    /** Email + password login — replaces Manus OAuth */
    login: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }
        if (!user.isActive) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been deactivated. Please contact an admin." });
        }
        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? user.email ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { success: true };
      }),

    /** Request a password reset email */
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email(), origin: z.string().url() }))
      .mutation(async ({ input }) => {
        // Always return success to prevent email enumeration
        const user = await db.getUserByEmail(input.email);
        if (!user) return { success: true };
        const token = crypto.randomBytes(32).toString("hex");
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await db.setPasswordResetToken(user.id, token, expiry);
        const resetUrl = `${input.origin}/reset-password?token=${token}`;
        await sendTransactionalEmail("password_reset", {
          recipientEmail: user.email ?? input.email,
          recipientName: user.name ?? undefined,
          notes: resetUrl, // reuse notes field for the reset URL
        });
        return { success: true };
      }),

    /** Complete a password reset using a token */
    resetPassword: publicProcedure
      .input(z.object({ token: z.string().min(1), password: z.string().min(8) }))
      .mutation(async ({ input }) => {
        const user = await db.getUserByResetToken(input.token);
        if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This reset link is invalid or has expired." });
        }
        const hash = await bcrypt.hash(input.password, 12);
        await db.setUserPassword(user.id, hash);
        await db.clearPasswordResetToken(user.id);
        return { success: true };
      }),

    /** Admin: set a password for any user */
    adminSetPassword: protectedProcedure
      .input(z.object({ userId: z.number(), password: z.string().min(8) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
        }
        const hash = await bcrypt.hash(input.password, 12);
        await db.setUserPassword(input.userId, hash);
        return { success: true };
      }),
  }),

  contacts: contactsRouter,
  agentConnections: agentConnectionsRouter,
  connectionRequests: connectionRequestsRouter,
  properties: propertiesRouter,
  transactions: transactionsRouter,
  tasks: tasksRouter,
  documents: documentsRouter,
  communications: communicationsRouter,
  analytics: analyticsRouter,
  users: usersRouter,
  groups: groupsRouter,
  payouts: payoutsRouter,
  leadSources: leadSourcesRouter,
  contactProperties: contactPropertiesRouter,
  approvalRequests: approvalRequestsRouter,
  listings: listingsRouter,
  smartPlans: smartPlansRouter,
  markets: marketsRouter,
  feedback: feedbackRouter,
  onboarding: onboardingRouter,
  leadership: leadershipRouter,
  commissionExceptions: commissionExceptionsRouter,
  marketMatch: marketMatchRouter,
  marketingRequests: marketingRequestsRouter,
  pm: pmRouter,
  kb: knowledgeBaseRouter,
  agentSupport: agentSupportRouter,
  duplicates: duplicatesRouter,
  webhooks: webhooksRouter,

  // ─── Admin: Email Notification Settings ───────────────────────────────────
  emailNotifications: router({
    /** List all notification settings; auto-seeds missing rows with isEnabled=true */
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db2 = await db.getDb();
      if (!db2) return [];
      const EMAIL_TYPES = [
        "lead_assigned", "transaction_created", "transaction_status_changed",
        "transaction_closed", "commission_calculated", "task_assigned", "task_due",
        "payout_integrity_fail", "listing_created", "listing_expiration_reminder",
        "onboarding_overdue", "commission_exception_warning", "market_match_intro",
        "client_intro", "connection_request_approved", "pm_mention",
      ];
      // Seed any missing rows
      const existing = await db2.select().from(emailNotificationSettings);
      const existingKeys = new Set(existing.map((r: { notificationKey: string }) => r.notificationKey));
      const missing = EMAIL_TYPES.filter(k => !existingKeys.has(k));
      if (missing.length > 0) {
        await db2.insert(emailNotificationSettings).values(missing.map(k => ({ notificationKey: k, isEnabled: true })));
      }
      return db2.select().from(emailNotificationSettings);
    }),
    /** Toggle a single notification on/off */
    toggle: protectedProcedure
      .input(z.object({ notificationKey: z.string().min(1), isEnabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db2 = await db.getDb();
        if (!db2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db2
          .insert(emailNotificationSettings)
          .values({ notificationKey: input.notificationKey, isEnabled: input.isEnabled, updatedBy: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { isEnabled: input.isEnabled, updatedBy: ctx.user.id } });
        return { success: true };
      }),
  }),

  // ─── Admin: Email Template Editor ─────────────────────────────────────────
  emailTemplates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db2 = await db.getDb();
      if (!db2) return [];
      return db2.select().from(emailTemplates);
    }),
    upsert: protectedProcedure
      .input(z.object({
        emailType: z.string().min(1),
        subject: z.string().min(1),
        bodyText: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db2 = await db.getDb();
        if (!db2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db2
          .insert(emailTemplates)
          .values({ emailType: input.emailType, subject: input.subject, bodyText: input.bodyText, updatedById: ctx.user.id })
          .onDuplicateKeyUpdate({ set: { subject: input.subject, bodyText: input.bodyText, updatedById: ctx.user.id } });
        return { success: true };
      }),
    reset: protectedProcedure
      .input(z.object({ emailType: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const db2 = await db.getDb();
        if (!db2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db2.delete(emailTemplates).where(eq(emailTemplates.emailType, input.emailType));
        return { success: true };
      }),
  }),

  // ─── Admin: Test Email Triggers ───────────────────────────────────────────
  emailTest: router({
    sendAll: protectedProcedure
      .input(z.object({ recipientEmail: z.string().email(), recipientName: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const ctx2 = { recipientEmail: input.recipientEmail, recipientName: input.recipientName ?? "Tyler" };
        const results: Record<string, string> = {};
        const types = buildTestEmailPayloads(ctx2);
        for (const [type, emailCtx] of types) {
          try {
            await sendTransactionalEmail(type as any, emailCtx as any);
            results[type] = "sent";
          } catch (e: any) {
            results[type] = `error: ${e.message}`;
          }
        }
        return { results };
      }),
    sendOne: protectedProcedure
      .input(z.object({
        recipientEmail: z.string().email(),
        recipientName: z.string().optional(),
        emailType: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const ctx2 = { recipientEmail: input.recipientEmail, recipientName: input.recipientName ?? "Tyler" };
        const allPayloads = buildTestEmailPayloads(ctx2);
        const match = allPayloads.find(([type]) => type === input.emailType);
        if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown email type: ${input.emailType}` });
        const [type, emailCtx] = match;
        await sendTransactionalEmail(type as any, emailCtx as any);
        return { sent: true };
      }),

    /** Return the rendered HTML for a given email type (for preview) */
    getPreview: protectedProcedure
      .input(z.object({ emailType: z.string(), recipientName: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        const ctx2 = { recipientEmail: "preview@savvy.realty", recipientName: input.recipientName ?? "Tyler" };
        const allPayloads = buildTestEmailPayloads(ctx2);
        const match = allPayloads.find(([type]) => type === input.emailType);
        if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown email type: ${input.emailType}` });
        const [, emailCtx] = match;
        const { html, subject } = getEmailPreview(input.emailType as any, emailCtx as any);
        return { html, subject };
      }),

    /** Return all registered email types with their sample variable keys */
    listTypes: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const ctx2 = { recipientEmail: "preview@savvy.realty", recipientName: "Tyler" };
      const payloads = buildTestEmailPayloads(ctx2);
      return payloads.map(([type, vars]) => ({
        type,
        variables: Object.keys(vars).filter(k => k !== "recipientEmail" && k !== "recipientName"),
      }));
    }),
  }),
});

export type AppRouter = typeof appRouter;
