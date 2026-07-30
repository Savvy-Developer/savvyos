/**
 * Job Board Router
 *
 * Public procedures (no auth required):
 *   - listActiveJobs  — returns all active postings for the public /careers page
 *   - applyToJob      — submits an application from the public form
 *
 * Admin procedures (admin role required):
 *   - listJobs        — all postings including inactive
 *   - createJob       — create a new posting
 *   - updateJob       — edit an existing posting
 *   - deleteJob       — permanently delete a posting
 *   - listApplications — view all applications (optionally filtered by job)
 *   - updateApplicationStatus — move an application through the pipeline
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, desc, asc, and } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { jobPostings, jobApplications } from "../../drizzle/schema";
import { getDb } from "../db";

// ─── Shared Zod Schemas ────────────────────────────────────────────────────────

const jobPostingInput = z.object({
  title: z.string().min(1, "Title is required"),
  department: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  employmentType: z.enum(["full_time", "part_time", "contract", "internship"]).default("full_time"),
  description: z.string().min(1, "Description is required"),
  requirements: z.string().optional().nullable(),
  salaryRange: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const jobBoardRouter = router({
  // ── Public: list active job postings ──────────────────────────────────────
  listActiveJobs: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.isActive, true))
      .orderBy(asc(jobPostings.sortOrder), desc(jobPostings.createdAt));
  }),

  // ── Public: submit a job application ──────────────────────────────────────
  applyToJob: publicProcedure
    .input(z.object({
      jobPostingId: z.number().int().positive(),
      applicantName: z.string().min(1, "Name is required"),
      applicantEmail: z.string().email("Valid email required"),
      applicantPhone: z.string().optional(),
      linkedinUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
      coverLetter: z.string().optional(),
      resumeUrl: z.string().optional(),
      // Honeypot — bots fill this; humans leave it empty
      _hp: z.string().max(0, "Bot detected").optional(),
    }))
    .mutation(async ({ input }) => {
      // Honeypot check
      if (input._hp) return { ok: true };

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify the job posting exists and is active
      const [job] = await db
        .select({ id: jobPostings.id, title: jobPostings.title })
        .from(jobPostings)
        .where(and(eq(jobPostings.id, input.jobPostingId), eq(jobPostings.isActive, true)))
        .limit(1);

      if (!job) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job posting not found or no longer active" });
      }

      await db.insert(jobApplications).values({
        jobPostingId: input.jobPostingId,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        applicantPhone: input.applicantPhone ?? null,
        linkedinUrl: input.linkedinUrl || null,
        coverLetter: input.coverLetter ?? null,
        resumeUrl: input.resumeUrl ?? null,
        status: "new",
      });

      return { ok: true, jobTitle: job.title };
    }),

  // ── Admin: list all job postings ──────────────────────────────────────────
  listJobs: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(jobPostings)
      .orderBy(asc(jobPostings.sortOrder), desc(jobPostings.createdAt));
  }),

  // ── Admin: create a job posting ───────────────────────────────────────────
  createJob: protectedProcedure
    .input(jobPostingInput)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(jobPostings).values({
        ...input,
        createdById: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  // ── Admin: update a job posting ───────────────────────────────────────────
  updateJob: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }).merge(jobPostingInput))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(jobPostings).set(data).where(eq(jobPostings.id, id));
      return { ok: true };
    }),

  // ── Admin: delete a job posting ───────────────────────────────────────────
  deleteJob: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(jobPostings).where(eq(jobPostings.id, input.id));
      return { ok: true };
    }),

  // ── Admin: list applications (optionally filtered by job) ─────────────────
  listApplications: protectedProcedure
    .input(z.object({ jobPostingId: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          application: jobApplications,
          jobTitle: jobPostings.title,
        })
        .from(jobApplications)
        .leftJoin(jobPostings, eq(jobApplications.jobPostingId, jobPostings.id))
        .where(input.jobPostingId ? eq(jobApplications.jobPostingId, input.jobPostingId) : undefined)
        .orderBy(desc(jobApplications.submittedAt));
      return rows;
    }),

  // ── Admin: update application status ─────────────────────────────────────
  updateApplicationStatus: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["new", "reviewing", "interviewing", "offered", "rejected", "withdrawn"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(jobApplications)
        .set({ status: input.status, notes: input.notes ?? null })
        .where(eq(jobApplications.id, input.id));
      return { ok: true };
    }),
});
