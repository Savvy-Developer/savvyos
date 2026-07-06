import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAllUsers,
  getUsersByRole,
  updateUserRole,
  createUser,
  updateUser,
  deleteUser,
  getDb,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import {
  userDocuments,
  userProfiles,
  agentProfiles,
  isaProfiles,
  adminProfiles,
  marketProfiles,
  groups,
  groupMembers,
} from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

// ── Zod schemas for profile upserts ──────────────────────────────────────────
const coreProfileSchema = z.object({
  userId: z.number(),
  preferredName: z.string().optional().nullable(),
  profilePhotoUrl: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(), // ISO date string
  personalEmail: z.string().optional().nullable(),
  primaryPhone: z.string().optional().nullable(),
  secondaryPhone: z.string().optional().nullable(),
  timeZone: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  spouseName: z.string().optional().nullable(),
  childrenNotes: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelationship: z.string().optional().nullable(),
  hobbies: z.string().optional().nullable(),
  giftNotes: z.string().optional().nullable(),
  shirtSize: z.string().optional().nullable(),
  personalNotes: z.string().optional().nullable(),
  employmentStatus: z.enum(["active", "inactive", "on_leave", "offboarded"]).optional().nullable(),
  onboardedDate: z.string().optional().nullable(),
  offboardedDate: z.string().optional().nullable(),
  referredBy: z.string().optional().nullable(),
  workAnniversaryDate: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

const agentProfileSchema = z.object({
  userId: z.number(),
  licenseNumber: z.string().optional().nullable(),
  licenseState: z.string().optional().nullable(),
  additionalLicenseStates: z.string().optional().nullable(),
  licenseExpirationDate: z.string().optional().nullable(),
  brokerageAffiliation: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  instagramUrl: z.string().optional().nullable(),
  facebookUrl: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  youtubeUrl: z.string().optional().nullable(),
  tiktokUrl: z.string().optional().nullable(),
  personalWebsiteUrl: z.string().optional().nullable(),
  googleBusinessUrl: z.string().optional().nullable(),
  agentStatus: z.enum(["active", "paused", "recruiting", "offboarded"]).optional().nullable(),
  startDateWithSavvy: z.string().optional().nullable(),
  endDateWithSavvy: z.string().optional().nullable(),
  boardAssociation: z.string().optional().nullable(),
  mlsId: z.string().optional().nullable(),
  narId: z.string().optional().nullable(),
  showingServiceLoginNotes: z.string().optional().nullable(),
  transactionCoordinatorAssigned: z.string().optional().nullable(),
  assistantAssigned: z.string().optional().nullable(),
  personalBrandNotes: z.string().optional().nullable(),
  specialInternalNotes: z.string().optional().nullable(),
  birthdayRecognitionOptIn: z.boolean().optional().nullable(),
  anniversaryRecognitionOptIn: z.boolean().optional().nullable(),
});

const isaProfileSchema = z.object({
  userId: z.number(),
  isaStatus: z.enum(["active", "inactive", "on_leave", "offboarded"]).optional().nullable(),
  startDateWithSavvy: z.string().optional().nullable(),
  endDateWithSavvy: z.string().optional().nullable(),
  managerId: z.number().optional().nullable(),
  dialerUserId: z.string().optional().nullable(),
  crmUserId: z.string().optional().nullable(),
  slackHandle: z.string().optional().nullable(),
  callRecordingLink: z.string().optional().nullable(),
  trainingStartDate: z.string().optional().nullable(),
  trainingCompletionDate: z.string().optional().nullable(),
  currentTrainingStatus: z.string().optional().nullable(),
  scriptVersionAssigned: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const adminProfileSchema = z.object({
  userId: z.number(),
  adminStatus: z.enum(["active", "inactive", "on_leave", "offboarded"]).optional().nullable(),
  startDateWithSavvy: z.string().optional().nullable(),
  endDateWithSavvy: z.string().optional().nullable(),
  managerId: z.number().optional().nullable(),
  slackHandle: z.string().optional().nullable(),
  adminType: z.enum(["executive", "operations", "marketing", "expansion", "finance", "other"]).optional().nullable(),
  primaryResponsibilityNotes: z.string().optional().nullable(),
  backupResponsibilityNotes: z.string().optional().nullable(),
  sopOwnerNotes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Helper: convert ISO date string to Date or null
function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export const usersRouter = router({
  list: protectedProcedure
    .input(z.object({ role: z.enum(["admin", "agent", "isa"]).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const isIsa = ctx.user.role === "isa";
      const isOwner = (ctx.user as any).email === "tyler@savvy.realty";

      if (!isAdmin && !isIsa && !isOwner) throw new TRPCError({ code: "FORBIDDEN" });

      if (isIsa && !isOwner) {
        const requestedRole = input?.role;
        if (requestedRole === "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (requestedRole) return getUsersByRole(requestedRole);
        const [agents, isas] = await Promise.all([getUsersByRole("agent"), getUsersByRole("isa")]);
        return [...agents, ...isas];
      }

      if (input?.role) return getUsersByRole(input.role);
      return getAllUsers();
    }),

  // List users with document counts (admin only)
  listWithDocCounts: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const users = await getAllUsers();
      // Get document counts per user
      const counts = await db
        .select({
          userId: userDocuments.userId,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(userDocuments)
        .groupBy(userDocuments.userId);
      const countMap = new Map(counts.map((c: any) => [c.userId, Number(c.count)]));
      // Get profile photos
      const photos = await db
        .select({ userId: userProfiles.userId, profilePhotoUrl: userProfiles.profilePhotoUrl })
        .from(userProfiles);
      const photoMap = new Map(photos.map((p) => [p.userId, p.profilePhotoUrl]));
      return (users as any[]).map((u: any) => ({
        ...u,
        documentCount: countMap.get(u.id) ?? 0,
        profilePhotoUrl: photoMap.get(u.id) ?? null,
      }));
    }),

  // Admin: upload headshot on behalf of any user
  adminUpdateAvatar: protectedProcedure
    .input(z.object({ userId: z.number(), avatarUrl: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, input.userId))
        .limit(1);
      if (existing.length > 0) {
        await db.update(userProfiles).set({ profilePhotoUrl: input.avatarUrl }).where(eq(userProfiles.userId, input.userId));
      } else {
        await db.insert(userProfiles).values({ userId: input.userId, profilePhotoUrl: input.avatarUrl });
      }
      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.enum(["admin", "agent", "isa", "agent_support"]),
      phone: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      reportsToId: z.number().optional().nullable(),
      marketProfileId: z.number().optional().nullable(),
      commissionSplit: z.number().optional().nullable(),
      callBookingLink: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const id = await createUser(input);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "agent", "isa", "agent_support"]).optional(),
      phone: z.string().optional().nullable(),
      title: z.string().optional().nullable(),
      reportsToId: z.number().optional().nullable(),
      marketProfileId: z.number().optional().nullable(),
      commissionSplit: z.number().optional().nullable(),
      callBookingLink: z.string().optional().nullable(),
      allowHiddenNav: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      // Only Tyler (owner) can grant allowHiddenNav
      if (input.allowHiddenNav !== undefined && (ctx.user as any).email !== "tyler@savvy.realty") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only Tyler can manage Hidden Nav access" });
      }
      const { id, ...data } = input;
      await updateUser(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      if (input.id === ctx.user.id)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete yourself" });
      await deleteUser(input.id);
      return { success: true };
    }),

  updateRole: protectedProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "agent", "isa", "agent_support"]) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  toggleActive: protectedProcedure
    .input(z.object({ userId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      if (input.userId === ctx.user.id && !input.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot deactivate your own account" });
      }
      const { getUserById } = await import("../db");
      const targetUser = await getUserById(input.userId);
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (targetUser.email === "tyler@savvy.realty" && !input.isActive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This account cannot be deactivated" });
      }
      await updateUser(input.userId, { isActive: input.isActive });
      return { success: true, isActive: input.isActive };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const isSelf = ctx.user.id === input.id;
      if (!isAdmin && !isSelf) throw new TRPCError({ code: "FORBIDDEN" });
      const all = await getAllUsers();
      const user = all.find((u: any) => u.id === input.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return user;
    }),

  // ── Extended Profile Procedures ─────────────────────────────────────────────
  getCoreProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const isSelf = ctx.user.id === input.userId;
      if (!isAdmin && !isSelf) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1);
      return rows[0] ?? null;
    }),

  upsertCoreProfile: protectedProcedure
    .input(coreProfileSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { userId, ...rest } = input;
      const data: any = { ...rest };
      // Convert date strings to Date objects
      for (const key of ["dateOfBirth", "onboardedDate", "offboardedDate", "workAnniversaryDate"] as const) {
        if (key in data) data[key] = toDate(data[key]);
      }
      const existing = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
      if (existing.length > 0) {
        await db.update(userProfiles).set(data).where(eq(userProfiles.userId, userId));
      } else {
        await db.insert(userProfiles).values({ userId, ...data });
      }
      return { success: true };
    }),

  getAgentProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const isSelf = ctx.user.id === input.userId;
      if (!isAdmin && !isSelf) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(agentProfiles).where(eq(agentProfiles.userId, input.userId)).limit(1);
      return rows[0] ?? null;
    }),

  upsertAgentProfile: protectedProcedure
    .input(agentProfileSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { userId, ...rest } = input;
      const data: any = { ...rest };
      for (const key of ["licenseExpirationDate", "startDateWithSavvy", "endDateWithSavvy"] as const) {
        if (key in data) data[key] = toDate(data[key]);
      }
      const existing = await db.select({ id: agentProfiles.id }).from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
      if (existing.length > 0) {
        await db.update(agentProfiles).set(data).where(eq(agentProfiles.userId, userId));
      } else {
        await db.insert(agentProfiles).values({ userId, ...data });
      }
      return { success: true };
    }),

  getIsaProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const isSelf = ctx.user.id === input.userId;
      if (!isAdmin && !isSelf) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(isaProfiles).where(eq(isaProfiles.userId, input.userId)).limit(1);
      return rows[0] ?? null;
    }),

  upsertIsaProfile: protectedProcedure
    .input(isaProfileSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { userId, ...rest } = input;
      const data: any = { ...rest };
      for (const key of ["startDateWithSavvy", "endDateWithSavvy", "trainingStartDate", "trainingCompletionDate"] as const) {
        if (key in data) data[key] = toDate(data[key]);
      }
      const existing = await db.select({ id: isaProfiles.id }).from(isaProfiles).where(eq(isaProfiles.userId, userId)).limit(1);
      if (existing.length > 0) {
        await db.update(isaProfiles).set(data).where(eq(isaProfiles.userId, userId));
      } else {
        await db.insert(isaProfiles).values({ userId, ...data });
      }
      return { success: true };
    }),

  getAdminProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const isSelf = ctx.user.id === input.userId;
      if (!isAdmin && !isSelf) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(adminProfiles).where(eq(adminProfiles.userId, input.userId)).limit(1);
      return rows[0] ?? null;
    }),

  upsertAdminProfile: protectedProcedure
    .input(adminProfileSchema)
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { userId, ...rest } = input;
      const data: any = { ...rest };
      for (const key of ["startDateWithSavvy", "endDateWithSavvy"] as const) {
        if (key in data) data[key] = toDate(data[key]);
      }
      const existing = await db.select({ id: adminProfiles.id }).from(adminProfiles).where(eq(adminProfiles.userId, userId)).limit(1);
      if (existing.length > 0) {
        await db.update(adminProfiles).set(data).where(eq(adminProfiles.userId, userId));
      } else {
        await db.insert(adminProfiles).values({ userId, ...data });
      }
      return { success: true };
    }),

  // ── User Documents ──────────────────────────────────────────────────────────
  listDocuments: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";
      const isSelf = ctx.user.id === input.userId;
      if (!isAdmin && !isSelf) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(userDocuments)
        .where(eq(userDocuments.userId, input.userId))
        .orderBy(desc(userDocuments.createdAt));
    }),

  uploadDocument: protectedProcedure
    .input(z.object({
      userId: z.number(),
      label: z.string().min(1).max(255),
      category: z.string().optional().default("Other"),
      fileName: z.string(),
      mimeType: z.string(),
      fileSize: z.number().optional(),
      fileBase64: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const buffer = Buffer.from(input.fileBase64, "base64");
      const suffix = nanoid(8);
      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `user-documents/${input.userId}/${suffix}-${safeFileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      await db.insert(userDocuments).values({
        userId: input.userId,
        uploadedBy: ctx.user.id,
        label: input.label,
        fileUrl: url,
        fileKey,
        fileName: input.fileName,
        fileSize: input.fileSize ?? null,
        mimeType: input.mimeType,
        category: input.category ?? "Other",
      } as any);
      return { success: true, url };
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(userDocuments).where(eq(userDocuments.id, input.documentId));
      return { success: true };
    }),

  // Org chart — accessible by all authenticated users (agents, ISAs, admins)
  orgChart: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const all = await getAllUsers();
      // Market name lookup
      const mktRows = await db.select({ id: marketProfiles.id, name: marketProfiles.name }).from(marketProfiles);
      const mktMap = new Map(mktRows.map((m) => [m.id, m.name]));
      // Group membership lookup: userId -> group name
      const gmRows = await db
        .select({ userId: groupMembers.userId, groupName: groups.name })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id));
      const groupMap = new Map(gmRows.map((r) => [r.userId, r.groupName]));
      // Group leader lookup: leaderId -> group name
      const leaderRows = await db.select({ id: groups.id, name: groups.name, leaderId: groups.leaderId }).from(groups);
      const leaderGroupMap = new Map(
        leaderRows.filter((g) => g.leaderId != null).map((g) => [g.leaderId!, g.name])
      );
      // Profile photo lookup
      const photoRows = await db
        .select({ userId: userProfiles.userId, profilePhotoUrl: userProfiles.profilePhotoUrl })
        .from(userProfiles);
      const photoMap = new Map(photoRows.map((r) => [r.userId, r.profilePhotoUrl]));

      return (all as any[]).map((u: any) => ({
        id: u.id as number,
        name: u.name as string | null,
        email: u.email as string | null,
        phone: u.phone as string | null,
        title: u.title as string | null,
        role: u.role as string,
        reportsToId: u.reportsToId as number | null,
        marketProfileId: u.marketProfileId as number | null,
        marketName: u.marketProfileId ? (mktMap.get(u.marketProfileId) ?? null) : null,
        groupName: groupMap.get(u.id) ?? leaderGroupMap.get(u.id) ?? null,
        openId: u.openId as string,
        profilePhotoUrl: photoMap.get(u.id) ?? null,
      }));
    }),

  // Update the logged-in user's own profile photo
  updateAvatar: protectedProcedure
    .input(z.object({ avatarUrl: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const existing = await db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, ctx.user.id))
        .limit(1);
      if (existing.length > 0) {
        await db.update(userProfiles).set({ profilePhotoUrl: input.avatarUrl }).where(eq(userProfiles.userId, ctx.user.id));
      } else {
        await db.insert(userProfiles).values({ userId: ctx.user.id, profilePhotoUrl: input.avatarUrl });
      }
      return { success: true };
    }),

  // Get the logged-in user's own core profile (for the Profile page)
  getMyCoreProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(userProfiles).where(eq(userProfiles.userId, ctx.user.id)).limit(1);
      return rows[0] ?? null;
    }),

  /** Admin: list all active users with their profile photos (for activity timeline filter) */
  listWithPhotos: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const allUsers = await getAllUsers();
      const photos = await db
        .select({ userId: userProfiles.userId, profilePhotoUrl: userProfiles.profilePhotoUrl })
        .from(userProfiles);
      const photoMap = new Map(photos.map((p) => [p.userId, p.profilePhotoUrl]));
      return (allUsers as any[]).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        profilePhotoUrl: photoMap.get(u.id) ?? null,
      })).filter((u: any) => u.isActive);
    }),
});
