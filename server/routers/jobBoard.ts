/**
 * Job Board Router v2
 * Public + Admin procedures for the multi-step job application system.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import {
  jobPostings,
  jobApplications,
  jobApplicationsV2,
  jobAppWorkHistory,
  jobAppEducation,
  jobCustomQuestions,
  jobApplicantSessions,
} from "../../drizzle/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { invokeLLM } from "../_core/llm";
import { Resend } from "resend";
import { ENV } from "../_core/env";

function getResend() {
  if (!ENV.resendApiKey) return null;
  return new Resend(ENV.resendApiKey);
}

const APP_URL = process.env.APP_URL || "https://os.savvy-agents.com";

function calcCompletionPct(app: any, workHistory: any[], education: any[]): number {
  let score = 0;
  if (app.firstName && app.lastName) score++;
  if (app.email) score++;
  if (app.phone) score++;
  if (app.city && app.state) score++;
  if (app.resumeUrl || app.resumeLinkUrl) score++;
  if (workHistory.length > 0) score++;
  if (education.length > 0) score++;
  if (app.coverLetter && app.coverLetter.length > 50) score++;
  if (app.whyInterested && app.whyInterested.length > 30) score++;
  if (app.salaryExpectation) score++;
  return Math.round((score / 10) * 100);
}

const jobPostingInput = z.object({
  title: z.string().min(1).max(255),
  department: z.string().max(128).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship"]).default("full_time"),
  description: z.string().min(1),
  requirements: z.string().optional().nullable(),
  salaryRange: z.string().max(128).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const workHistoryItemSchema = z.object({
  company: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().optional(),
});

const educationItemSchema = z.object({
  institution: z.string().min(1).max(255),
  degree: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  startYear: z.string().optional(),
  endYear: z.string().optional(),
  gpa: z.string().optional(),
});

export const jobBoardRouter = router({

  // ── Public: list active job postings ──────────────────────────────────────
  listActiveJobs: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(jobPostings).where(eq(jobPostings.isActive, true)).orderBy(asc(jobPostings.sortOrder), desc(jobPostings.createdAt));
  }),

  // ── Public: get a single job with custom questions ─────────────────────────
  getJob: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [job] = await db.select().from(jobPostings).where(and(eq(jobPostings.id, input.id), eq(jobPostings.isActive, true))).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const questions = await db.select().from(jobCustomQuestions).where(eq(jobCustomQuestions.jobPostingId, input.id)).orderBy(asc(jobCustomQuestions.sortOrder));
      return { ...job, customQuestions: questions };
    }),

  // ── Public: start a new draft application ─────────────────────────────────
  startApplication: publicProcedure
    .input(z.object({
      jobPostingId: z.number().int().positive(),
      email: z.string().email(),
      firstName: z.string().min(1).max(128).optional(),
      lastName: z.string().min(1).max(128).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [job] = await db.select({ id: jobPostings.id }).from(jobPostings).where(and(eq(jobPostings.id, input.jobPostingId), eq(jobPostings.isActive, true))).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      const [existing] = await db.select({ id: jobApplicationsV2.id }).from(jobApplicationsV2)
        .where(and(eq(jobApplicationsV2.jobPostingId, input.jobPostingId), eq(jobApplicationsV2.email, input.email), eq(jobApplicationsV2.isDraft, true))).limit(1);

      const token = nanoid(48);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(jobApplicantSessions).values({ email: input.email, token, expiresAt });

      if (existing) return { applicationId: existing.id, token, isExisting: true };

      const [result] = await db.insert(jobApplicationsV2).values({
        jobPostingId: input.jobPostingId,
        email: input.email,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        isDraft: true,
        status: "draft",
        currentStep: 1,
        completionPct: 0,
      });
      return { applicationId: (result as any).insertId as number, token, isExisting: false };
    }),

  // ── Public: save a step (auto-save draft) ─────────────────────────────────
  saveApplicationStep: publicProcedure
    .input(z.object({
      applicationId: z.number().int().positive(),
      token: z.string().min(1),
      step: z.number().int().min(1).max(6),
      firstName: z.string().max(128).optional(),
      lastName: z.string().max(128).optional(),
      phone: z.string().max(64).optional(),
      city: z.string().max(128).optional(),
      state: z.string().max(64).optional(),
      country: z.string().max(64).optional(),
      linkedinUrl: z.string().max(512).optional(),
      portfolioUrl: z.string().max(512).optional(),
      resumeUrl: z.string().max(1024).optional(),
      resumeFileName: z.string().max(255).optional(),
      resumeLinkUrl: z.string().max(1024).optional(),
      coverLetterUrl: z.string().max(1024).optional(),
      coverLetterFileName: z.string().max(255).optional(),
      coverLetter: z.string().optional(),
      whyInterested: z.string().optional(),
      salaryExpectation: z.string().max(128).optional(),
      availableStartDate: z.string().max(64).optional(),
      workHistory: z.array(workHistoryItemSchema).optional(),
      education: z.array(educationItemSchema).optional(),
      customAnswers: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [session] = await db.select().from(jobApplicantSessions)
        .where(and(eq(jobApplicantSessions.token, input.token), isNull(jobApplicantSessions.usedAt))).limit(1);
      if (!session || session.expiresAt < new Date()) throw new TRPCError({ code: "UNAUTHORIZED", message: "Session expired." });

      const [app] = await db.select().from(jobApplicationsV2)
        .where(and(eq(jobApplicationsV2.id, input.applicationId), eq(jobApplicationsV2.email, session.email))).limit(1);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: any = { currentStep: Math.max(app.currentStep ?? 1, input.step) };
      const fields = ["firstName","lastName","phone","city","state","country","linkedinUrl","portfolioUrl","resumeUrl","resumeFileName","resumeLinkUrl","coverLetterUrl","coverLetterFileName","coverLetter","whyInterested","salaryExpectation","availableStartDate"] as const;
      for (const f of fields) { if ((input as any)[f] !== undefined) updateData[f] = (input as any)[f]; }
      if (input.customAnswers !== undefined) updateData.customAnswers = JSON.stringify(input.customAnswers);
      await db.update(jobApplicationsV2).set(updateData).where(eq(jobApplicationsV2.id, input.applicationId));

      if (input.workHistory !== undefined) {
        await db.delete(jobAppWorkHistory).where(eq(jobAppWorkHistory.applicationId, input.applicationId));
        if (input.workHistory.length > 0) {
          await db.insert(jobAppWorkHistory).values(input.workHistory.map((w, i) => ({
            applicationId: input.applicationId, company: w.company, title: w.title,
            startDate: w.startDate ?? null, endDate: w.endDate ?? null, isCurrent: w.isCurrent ?? false,
            description: w.description ?? null, sortOrder: i,
          })));
        }
      }

      if (input.education !== undefined) {
        await db.delete(jobAppEducation).where(eq(jobAppEducation.applicationId, input.applicationId));
        if (input.education.length > 0) {
          await db.insert(jobAppEducation).values(input.education.map((e, i) => ({
            applicationId: input.applicationId, institution: e.institution, degree: e.degree ?? null,
            fieldOfStudy: e.fieldOfStudy ?? null, startYear: e.startYear ?? null, endYear: e.endYear ?? null,
            gpa: e.gpa ?? null, sortOrder: i,
          })));
        }
      }

      const [updated] = await db.select().from(jobApplicationsV2).where(eq(jobApplicationsV2.id, input.applicationId)).limit(1);
      const wh = await db.select().from(jobAppWorkHistory).where(eq(jobAppWorkHistory.applicationId, input.applicationId));
      const edu = await db.select().from(jobAppEducation).where(eq(jobAppEducation.applicationId, input.applicationId));
      const pct = calcCompletionPct(updated, wh, edu);
      await db.update(jobApplicationsV2).set({ completionPct: pct }).where(eq(jobApplicationsV2.id, input.applicationId));

      return { ok: true, completionPct: pct };
    }),

  // ── Public: submit the application ────────────────────────────────────────
  submitApplication: publicProcedure
    .input(z.object({ applicationId: z.number().int().positive(), token: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [session] = await db.select().from(jobApplicantSessions)
        .where(and(eq(jobApplicantSessions.token, input.token), isNull(jobApplicantSessions.usedAt))).limit(1);
      if (!session || session.expiresAt < new Date()) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [app] = await db.select().from(jobApplicationsV2)
        .where(and(eq(jobApplicationsV2.id, input.applicationId), eq(jobApplicationsV2.email, session.email))).limit(1);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (!app.isDraft) throw new TRPCError({ code: "BAD_REQUEST", message: "Already submitted." });
      if (!app.firstName || !app.lastName) throw new TRPCError({ code: "BAD_REQUEST", message: "Please complete required fields." });

      await db.update(jobApplicationsV2).set({ isDraft: false, status: "submitted", submittedAt: new Date(), completionPct: 100 }).where(eq(jobApplicationsV2.id, input.applicationId));
      const [job] = await db.select({ title: jobPostings.title }).from(jobPostings).where(eq(jobPostings.id, app.jobPostingId)).limit(1);

      const resend = getResend();
      if (resend && app.email) {
        resend.emails.send({
          from: "Savvy STR Agents <notifications@savvy-agents.com>",
          to: app.email,
          subject: `Application Received \u2014 ${job?.title ?? "Position"}`,
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;"><img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png" alt="Savvy" style="height:40px;margin-bottom:24px;" /><h2>Application Received!</h2><p>Hi ${app.firstName},</p><p>Thank you for applying for <strong>${job?.title ?? "this position"}</strong> at Savvy STR Agents. We\u2019ll review your application and be in touch soon.</p><p style="color:#6B7280;font-size:13px;">Savvy STR Agents &middot; <a href="${APP_URL}/careers">View Openings</a></p></div>`,
        }).catch(() => {});
      }

      return { ok: true, jobTitle: job?.title ?? "Position" };
    }),

  // ── Public: request magic link ─────────────────────────────────────────────
  requestMagicLink: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const apps = await db.select({ id: jobApplicationsV2.id }).from(jobApplicationsV2).where(eq(jobApplicationsV2.email, input.email)).limit(1);
      if (apps.length === 0) return { ok: true };

      const token = nanoid(48);
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      await db.insert(jobApplicantSessions).values({ email: input.email, token, expiresAt });

      const magicLink = `${APP_URL}/careers?token=${token}&email=${encodeURIComponent(input.email)}`;
      const resend = getResend();
      if (resend) {
        resend.emails.send({
          from: "Savvy STR Agents <notifications@savvy-agents.com>",
          to: input.email,
          subject: "Resume your job application",
          html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;"><img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663374872019/RGtcxHR8RPxZsqyxZLCcuq/savvy-logo_c97e2154.png" alt="Savvy" style="height:40px;margin-bottom:24px;" /><h2>Resume Your Application</h2><p>Click below to continue your application. This link expires in 2 hours.</p><a href="${magicLink}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:#0fc0df;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Resume Application</a><p style="color:#6B7280;font-size:13px;">If you didn\u2019t request this, ignore this email.</p></div>`,
        }).catch(() => {});
      }
      return { ok: true };
    }),

  // ── Public: verify magic link ──────────────────────────────────────────────
  verifyMagicLink: publicProcedure
    .input(z.object({ token: z.string().min(1), email: z.string().email() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [session] = await db.select().from(jobApplicantSessions)
        .where(and(eq(jobApplicantSessions.token, input.token), eq(jobApplicantSessions.email, input.email), isNull(jobApplicantSessions.usedAt))).limit(1);
      if (!session || session.expiresAt < new Date()) throw new TRPCError({ code: "UNAUTHORIZED", message: "Link expired or already used." });
      return { ok: true, email: session.email, token: input.token };
    }),

  // ── Public: get my applications ───────────────────────────────────────────
  getMyApplications: publicProcedure
    .input(z.object({ token: z.string().min(1), email: z.string().email() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [session] = await db.select().from(jobApplicantSessions)
        .where(and(eq(jobApplicantSessions.token, input.token), eq(jobApplicantSessions.email, input.email), isNull(jobApplicantSessions.usedAt))).limit(1);
      if (!session || session.expiresAt < new Date()) return [];
      return db.select({ application: jobApplicationsV2, jobTitle: jobPostings.title, jobDepartment: jobPostings.department })
        .from(jobApplicationsV2).leftJoin(jobPostings, eq(jobApplicationsV2.jobPostingId, jobPostings.id))
        .where(eq(jobApplicationsV2.email, input.email)).orderBy(desc(jobApplicationsV2.updatedAt));
    }),

  // ── Public: get application by id ─────────────────────────────────────────
  getApplicationById: publicProcedure
    .input(z.object({ applicationId: z.number().int().positive(), token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [session] = await db.select().from(jobApplicantSessions)
        .where(and(eq(jobApplicantSessions.token, input.token), isNull(jobApplicantSessions.usedAt))).limit(1);
      if (!session || session.expiresAt < new Date()) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [app] = await db.select().from(jobApplicationsV2)
        .where(and(eq(jobApplicationsV2.id, input.applicationId), eq(jobApplicationsV2.email, session.email))).limit(1);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const workHistory = await db.select().from(jobAppWorkHistory).where(eq(jobAppWorkHistory.applicationId, input.applicationId)).orderBy(asc(jobAppWorkHistory.sortOrder));
      const education = await db.select().from(jobAppEducation).where(eq(jobAppEducation.applicationId, input.applicationId)).orderBy(asc(jobAppEducation.sortOrder));
      const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, app.jobPostingId)).limit(1);
      const customQuestions = await db.select().from(jobCustomQuestions).where(eq(jobCustomQuestions.jobPostingId, app.jobPostingId)).orderBy(asc(jobCustomQuestions.sortOrder));
      return { ...app, workHistory, education, job, customQuestions };
    }),

  // ── Admin: list all job postings ──────────────────────────────────────────
  listJobs: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(jobPostings).orderBy(asc(jobPostings.sortOrder), desc(jobPostings.createdAt));
  }),

  // ── Admin: create job posting ─────────────────────────────────────────────
  createJob: protectedProcedure.input(jobPostingInput).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [result] = await db.insert(jobPostings).values({ ...input, createdById: ctx.user.id });
    return { id: (result as any).insertId };
  }),

  // ── Admin: update job posting ─────────────────────────────────────────────
  updateJob: protectedProcedure.input(z.object({ id: z.number().int().positive() }).merge(jobPostingInput)).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(jobPostings).set(data).where(eq(jobPostings.id, id));
    return { ok: true };
  }),

  // ── Admin: delete job posting ─────────────────────────────────────────────
  deleteJob: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(jobPostings).where(eq(jobPostings.id, input.id));
    return { ok: true };
  }),

  // ── Admin: list all applications ──────────────────────────────────────────
  listApplications: protectedProcedure
    .input(z.object({ jobPostingId: z.number().int().positive().optional(), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.jobPostingId) conditions.push(eq(jobApplicationsV2.jobPostingId, input.jobPostingId));
      if (input.status) conditions.push(eq(jobApplicationsV2.status, input.status as any));
      return db.select({ application: jobApplicationsV2, jobTitle: jobPostings.title, jobDepartment: jobPostings.department })
        .from(jobApplicationsV2).leftJoin(jobPostings, eq(jobApplicationsV2.jobPostingId, jobPostings.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(jobApplicationsV2.updatedAt));
    }),

  // ── Admin: get full application detail ────────────────────────────────────
  getApplicationDetail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [app] = await db.select().from(jobApplicationsV2).where(eq(jobApplicationsV2.id, input.id)).limit(1);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const workHistory = await db.select().from(jobAppWorkHistory).where(eq(jobAppWorkHistory.applicationId, input.id)).orderBy(asc(jobAppWorkHistory.sortOrder));
      const education = await db.select().from(jobAppEducation).where(eq(jobAppEducation.applicationId, input.id)).orderBy(asc(jobAppEducation.sortOrder));
      const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, app.jobPostingId)).limit(1);
      const customQuestions = await db.select().from(jobCustomQuestions).where(eq(jobCustomQuestions.jobPostingId, app.jobPostingId)).orderBy(asc(jobCustomQuestions.sortOrder));
      return { ...app, workHistory, education, job, customQuestions };
    }),

  // ── Admin: update application status / notes / rating ─────────────────────
  updateApplicationStatus: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["draft","submitted","reviewing","interviewing","offered","rejected","withdrawn"]).optional(),
      adminNotes: z.string().optional(),
      rating: z.number().int().min(1).max(5).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const update: any = {};
      if (input.status !== undefined) update.status = input.status;
      if (input.adminNotes !== undefined) update.adminNotes = input.adminNotes;
      if (input.rating !== undefined) update.rating = input.rating;
      await db.update(jobApplicationsV2).set(update).where(eq(jobApplicationsV2.id, input.id));
      return { ok: true };
    }),

  // ── Admin: generate AI insight ────────────────────────────────────────────
  generateAiInsight: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [app] = await db.select().from(jobApplicationsV2).where(eq(jobApplicationsV2.id, input.id)).limit(1);
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      const workHistory = await db.select().from(jobAppWorkHistory).where(eq(jobAppWorkHistory.applicationId, input.id)).orderBy(asc(jobAppWorkHistory.sortOrder));
      const education = await db.select().from(jobAppEducation).where(eq(jobAppEducation.applicationId, input.id)).orderBy(asc(jobAppEducation.sortOrder));
      const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, app.jobPostingId)).limit(1);
      const customQuestions = await db.select().from(jobCustomQuestions).where(eq(jobCustomQuestions.jobPostingId, app.jobPostingId)).orderBy(asc(jobCustomQuestions.sortOrder));

      let customAnswersSummary = "";
      if (app.customAnswers) {
        try {
          const answers = JSON.parse(app.customAnswers);
          customAnswersSummary = customQuestions.map(q => `Q: ${q.questionText}\nA: ${answers[String(q.id)] ?? "No answer"}`).join("\n\n");
        } catch {}
      }

      const prompt = `You are an expert HR recruiter at Savvy STR Agents, a short-term rental real estate company.

Job: ${job?.title ?? "Unknown"} | Dept: ${job?.department ?? "N/A"}
Requirements: ${job?.requirements ?? "N/A"}

Applicant: ${app.firstName} ${app.lastName} | ${app.email}
Location: ${[app.city, app.state].filter(Boolean).join(", ")}
LinkedIn: ${app.linkedinUrl ?? "Not provided"}

Work History:
${workHistory.length > 0 ? workHistory.map(w => `- ${w.title} at ${w.company} (${w.startDate ?? "?"} - ${w.isCurrent ? "Present" : (w.endDate ?? "?")})\n  ${w.description ?? ""}`).join("\n") : "Not provided"}

Education:
${education.length > 0 ? education.map(e => `- ${e.degree ?? ""} ${e.fieldOfStudy ?? ""} at ${e.institution} (${e.startYear ?? "?"}-${e.endYear ?? "?"})`).join("\n") : "Not provided"}

Cover Letter: ${app.coverLetter ?? "Not provided"}
Why Interested: ${app.whyInterested ?? "Not provided"}
Salary Expectation: ${app.salaryExpectation ?? "Not provided"}
Available: ${app.availableStartDate ?? "Not provided"}

Custom Responses:
${customAnswersSummary || "None"}

Provide a concise 4-6 sentence AI assessment covering: (1) overall fit, (2) key strengths, (3) gaps or concerns to probe in interview, (4) recommended next step. Write in paragraph form, be direct and actionable.`;

      const response = await invokeLLM({ messages: [{ role: "user", content: prompt }], model: "gpt-4o-mini" });
      const rawContent = response.choices?.[0]?.message?.content;
      const insight = (typeof rawContent === "string" ? rawContent : null) ?? "Unable to generate insight.";
      await db.update(jobApplicationsV2).set({ aiInsight: insight, aiInsightGeneratedAt: new Date() }).where(eq(jobApplicationsV2.id, input.id));
      return { ok: true, insight };
    }),

  // ── Admin: list custom questions ──────────────────────────────────────────
  listCustomQuestions: protectedProcedure
    .input(z.object({ jobPostingId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db.select().from(jobCustomQuestions).where(eq(jobCustomQuestions.jobPostingId, input.jobPostingId)).orderBy(asc(jobCustomQuestions.sortOrder));
    }),

  // ── Admin: upsert custom question ─────────────────────────────────────────
  upsertCustomQuestion: protectedProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      jobPostingId: z.number().int().positive(),
      questionText: z.string().min(1),
      questionType: z.enum(["text","textarea","yes_no","multiple_choice","rating"]).default("textarea"),
      options: z.array(z.string()).optional(),
      isRequired: z.boolean().default(false),
      sortOrder: z.number().int().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const data = { jobPostingId: input.jobPostingId, questionText: input.questionText, questionType: input.questionType, options: input.options ? JSON.stringify(input.options) : null, isRequired: input.isRequired, sortOrder: input.sortOrder };
      if (input.id) {
        await db.update(jobCustomQuestions).set(data).where(eq(jobCustomQuestions.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(jobCustomQuestions).values(data);
      return { id: (result as any).insertId };
    }),

  // ── Admin: delete custom question ─────────────────────────────────────────
  deleteCustomQuestion: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(jobCustomQuestions).where(eq(jobCustomQuestions.id, input.id));
      return { ok: true };
    }),

  // ── Legacy applyToJob (kept for backward compat) ──────────────────────────
  applyToJob: publicProcedure
    .input(z.object({
      jobPostingId: z.number().int().positive(),
      applicantName: z.string().min(1),
      applicantEmail: z.string().email(),
      applicantPhone: z.string().optional(),
      linkedinUrl: z.string().optional(),
      coverLetter: z.string().optional(),
      resumeUrl: z.string().optional(),
      _hp: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (input._hp && input._hp.length > 0) return { ok: true, jobTitle: "" };
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [job] = await db.select({ id: jobPostings.id, title: jobPostings.title }).from(jobPostings)
        .where(and(eq(jobPostings.id, input.jobPostingId), eq(jobPostings.isActive, true))).limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true, jobTitle: job.title, useV2: true };
    }),
});
