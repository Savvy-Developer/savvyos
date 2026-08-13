import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { pulseMeetingAccess, pulseMeetings, pulseOneOnOneAccess, pulseOneOnOnes, pulseTeamMembers, pulseTeams, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { canAdminUsePermission } from "./permissions";

const meetingDaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const sectionVisibilitySchema = z.record(z.string(), z.boolean());

const meetingInputSchema = z.object({
  meetingKey: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only."),
  name: z.string().trim().min(2).max(255),
  scheduleDay: meetingDaySchema,
  scheduleTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour HH:MM time."),
  timezone: z.string().trim().min(1).max(64),
  durationMinutes: z.number().int().min(15).max(480),
  sectionVisibility: sectionVisibilitySchema,
});

const accessInputSchema = z.object({
  facilitatorUserId: z.number().int().positive(),
  memberUserIds: z.array(z.number().int().positive()).max(200),
});

// Both the root Drizzle client and its transaction callback provide the same query surface used below.
type PulseDb = any;
type PulseContext = { user: { id: number; role: string; email?: string | null; personType: "full_user" | "teammate" } };
type AssignablePerson = { id: number; name: string | null; personType: "full_user" | "teammate"; isActive: boolean };
type ActiveMeetingAccess = { id: number; userId: number };
type AccessibleMeeting = { id: number; meetingKey: string; name: string; scheduleDay: string; scheduleTime: string; timezone: string; facilitatorUserId: number | null; durationMinutes: number; sectionVisibility: Record<string, boolean>; accessLevel: "member" | "facilitator"; updatedAt: Date };
type AccessibleTeam = { id: number; teamKey: string; name: string; purpose: string | null; color: string | null; linkedMeetingId: number | null; membershipRole: "member" | "lead" };
type AccessibleOneOnOne = { id: number; name: string; primaryUserId: number; secondaryUserId: number; sectionVisibility: Record<string, boolean>; accessLevel: "participant" | "viewer" };
type AccessRosterEntry = { meetingId: number; userId: number; name: string | null; email: string | null; accessLevel: "member" | "facilitator" };
type DirectoryPerson = { id: number; name: string | null; email: string | null; title: string | null; personType: "full_user" | "teammate"; isActive: boolean };

async function requirePulseConfiguration(ctx: PulseContext) {
  if (!(await canAdminUsePermission(ctx.user, "canViewPulse"))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Pulse configuration access is required." });
  }
}

function requireFullUser(ctx: PulseContext) {
  if (ctx.user.personType !== "full_user") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Teammate directory records cannot use Pulse." });
  }
}

/** Archive is intentionally evaluated before any membership/facilitator privilege. */
async function getActiveMeetingOrThrow(db: PulseDb, meetingId: number) {
  const rows = await db
    .select()
    .from(pulseMeetings)
    .where(and(eq(pulseMeetings.id, meetingId), eq(pulseMeetings.isActive, true)))
    .limit(1);
  if (!rows[0]) {
    throw new TRPCError({ code: "NOT_FOUND", message: "This meeting is unavailable." });
  }
  return rows[0];
}

async function requireActiveFacilitator(db: PulseDb, meetingId: number, userId: number) {
  await getActiveMeetingOrThrow(db, meetingId);
  const rows = await db
    .select({ id: pulseMeetingAccess.id })
    .from(pulseMeetingAccess)
    .where(and(
      eq(pulseMeetingAccess.meetingId, meetingId),
      eq(pulseMeetingAccess.userId, userId),
      eq(pulseMeetingAccess.accessLevel, "facilitator"),
      isNull(pulseMeetingAccess.revokedAt),
    ))
    .limit(1);
  if (!rows[0]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Facilitator access is required for this meeting." });
  }
}

async function assertAssignableFullUsers(db: PulseDb, userIds: number[]) {
  const uniqueIds = Array.from(new Set(userIds));
  if (uniqueIds.length === 0) return;
  const rows: AssignablePerson[] = await db
    .select({ id: users.id, name: users.name, personType: users.personType, isActive: users.isActive })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const invalid = uniqueIds.find((id) => {
    const user = byId.get(id);
    return !user || user.personType !== "full_user" || !user.isActive;
  });
  if (invalid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Meeting facilitators and members must be active Full Users.",
    });
  }
}

function normalizeAccess(input: z.infer<typeof accessInputSchema>) {
  const memberUserIds = Array.from(new Set(input.memberUserIds)).filter((userId) => userId !== input.facilitatorUserId);
  return { facilitatorUserId: input.facilitatorUserId, memberUserIds };
}

async function replaceActiveAccess(
  db: PulseDb,
  meetingId: number,
  input: z.infer<typeof accessInputSchema>,
  actorId: number,
) {
  const { facilitatorUserId, memberUserIds } = normalizeAccess(input);
  const desiredIds = [facilitatorUserId, ...memberUserIds];
  await assertAssignableFullUsers(db, desiredIds);

  const existing: ActiveMeetingAccess[] = await db
    .select({ id: pulseMeetingAccess.id, userId: pulseMeetingAccess.userId })
    .from(pulseMeetingAccess)
    .where(and(eq(pulseMeetingAccess.meetingId, meetingId), isNull(pulseMeetingAccess.revokedAt)));

  const now = new Date();
  const desiredSet = new Set(desiredIds);
  const revokeIds = existing.filter((row) => !desiredSet.has(row.userId)).map((row) => row.id);
  if (revokeIds.length > 0) {
    await db
      .update(pulseMeetingAccess)
      .set({ revokedAt: now, revokedById: actorId })
      .where(inArray(pulseMeetingAccess.id, revokeIds));
  }

  for (const userId of desiredIds) {
    await db
      .insert(pulseMeetingAccess)
      .values({
        meetingId,
        userId,
        accessLevel: userId === facilitatorUserId ? "facilitator" : "member",
        grantedById: actorId,
        grantedAt: now,
        revokedAt: null,
        revokedById: null,
      })
      .onDuplicateKeyUpdate({
        set: {
          accessLevel: userId === facilitatorUserId ? "facilitator" : "member",
          grantedById: actorId,
          grantedAt: now,
          revokedAt: null,
          revokedById: null,
        },
      });
  }

  await db
    .update(pulseMeetings)
    .set({ facilitatorUserId })
    .where(eq(pulseMeetings.id, meetingId));
}

async function getAccessibleMeetings(db: PulseDb, userId: number): Promise<AccessibleMeeting[]> {
  return db
    .select({
      id: pulseMeetings.id,
      meetingKey: pulseMeetings.meetingKey,
      name: pulseMeetings.name,
      scheduleDay: pulseMeetings.scheduleDay,
      scheduleTime: pulseMeetings.scheduleTime,
      timezone: pulseMeetings.timezone,
      facilitatorUserId: pulseMeetings.facilitatorUserId,
      durationMinutes: pulseMeetings.durationMinutes,
      sectionVisibility: pulseMeetings.sectionVisibility,
      accessLevel: pulseMeetingAccess.accessLevel,
      updatedAt: pulseMeetings.updatedAt,
    })
    .from(pulseMeetingAccess)
    .innerJoin(pulseMeetings, eq(pulseMeetingAccess.meetingId, pulseMeetings.id))
    .where(and(
      // This condition intentionally comes first in every discovery query.
      eq(pulseMeetings.isActive, true),
      eq(pulseMeetingAccess.userId, userId),
      isNull(pulseMeetingAccess.revokedAt),
    ))
    .orderBy(asc(pulseMeetings.scheduleDay), asc(pulseMeetings.scheduleTime), asc(pulseMeetings.name));
}

async function getAccessibleTeams(db: PulseDb, userId: number): Promise<AccessibleTeam[]> {
  return db
    .select({
      id: pulseTeams.id,
      teamKey: pulseTeams.teamKey,
      name: pulseTeams.name,
      purpose: pulseTeams.purpose,
      color: pulseTeams.color,
      linkedMeetingId: pulseTeams.linkedMeetingId,
      membershipRole: pulseTeamMembers.role,
    })
    .from(pulseTeamMembers)
    .innerJoin(pulseTeams, eq(pulseTeamMembers.teamId, pulseTeams.id))
    .where(and(
      eq(pulseTeams.isActive, true),
      eq(pulseTeamMembers.userId, userId),
      isNull(pulseTeamMembers.removedAt),
    ))
    .orderBy(asc(pulseTeams.name));
}

async function getAccessibleOneOnOnes(db: PulseDb, userId: number): Promise<AccessibleOneOnOne[]> {
  const participantRecords: Array<Omit<AccessibleOneOnOne, "accessLevel"> & { accessLevel: number }> = await db
    .select({
      id: pulseOneOnOnes.id,
      name: pulseOneOnOnes.name,
      primaryUserId: pulseOneOnOnes.primaryUserId,
      secondaryUserId: pulseOneOnOnes.secondaryUserId,
      sectionVisibility: pulseOneOnOnes.sectionVisibility,
      accessLevel: pulseOneOnOnes.primaryUserId,
    })
    .from(pulseOneOnOnes)
    .where(and(
      eq(pulseOneOnOnes.isActive, true),
      or(eq(pulseOneOnOnes.primaryUserId, userId), eq(pulseOneOnOnes.secondaryUserId, userId)),
    ));

  const viewerRecords: AccessibleOneOnOne[] = await db
    .select({
      id: pulseOneOnOnes.id,
      name: pulseOneOnOnes.name,
      primaryUserId: pulseOneOnOnes.primaryUserId,
      secondaryUserId: pulseOneOnOnes.secondaryUserId,
      sectionVisibility: pulseOneOnOnes.sectionVisibility,
      accessLevel: pulseOneOnOneAccess.accessLevel,
    })
    .from(pulseOneOnOneAccess)
    .innerJoin(pulseOneOnOnes, eq(pulseOneOnOneAccess.oneOnOneId, pulseOneOnOnes.id))
    .where(and(
      eq(pulseOneOnOnes.isActive, true),
      eq(pulseOneOnOneAccess.userId, userId),
      isNull(pulseOneOnOneAccess.revokedAt),
    ));

  const records = new Map<number, AccessibleOneOnOne>();
  for (const record of participantRecords) records.set(record.id, { ...record, accessLevel: "participant" });
  for (const record of viewerRecords) if (!records.has(record.id)) records.set(record.id, record);
  return Array.from(records.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function getActiveTeamOrThrow(db: PulseDb, teamId: number) {
  const rows = await db.select().from(pulseTeams).where(and(eq(pulseTeams.id, teamId), eq(pulseTeams.isActive, true))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "This team is unavailable." });
  return rows[0];
}

async function getActiveOneOnOneOrThrow(db: PulseDb, oneOnOneId: number) {
  const rows = await db.select().from(pulseOneOnOnes).where(and(eq(pulseOneOnOnes.id, oneOnOneId), eq(pulseOneOnOnes.isActive, true))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "This 1:1 is unavailable." });
  return rows[0];
}

export const pulseRouter = router({
  /** Accessible meeting configuration only; a static registry is never returned. */
  getRegistry: protectedProcedure.query(async ({ ctx }) => {
    requireFullUser(ctx as PulseContext);
    await requirePulseConfiguration(ctx as PulseContext);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const meetings = await getAccessibleMeetings(db, ctx.user.id);
    const meetingIds = meetings.map((meeting) => meeting.id);
    const accessRows: AccessRosterEntry[] = meetingIds.length === 0
      ? []
      : await db
        .select({
          meetingId: pulseMeetingAccess.meetingId,
          userId: users.id,
          name: users.name,
          email: users.email,
          accessLevel: pulseMeetingAccess.accessLevel,
        })
        .from(pulseMeetingAccess)
        .innerJoin(users, eq(pulseMeetingAccess.userId, users.id))
        .where(and(inArray(pulseMeetingAccess.meetingId, meetingIds), isNull(pulseMeetingAccess.revokedAt)))
        .orderBy(asc(users.name));

    return meetings.map((meeting) => ({
      ...meeting,
      access: accessRows.filter((access) => access.meetingId === meeting.id),
    }));
  }),

  /** Directory data is separated by person type so Teammates are never assignable. */
  getDirectory: protectedProcedure.query(async ({ ctx }) => {
    requireFullUser(ctx as PulseContext);
    await requirePulseConfiguration(ctx as PulseContext);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const directory: DirectoryPerson[] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        title: users.title,
        personType: users.personType,
        isActive: users.isActive,
      })
      .from(users)
      .orderBy(asc(users.name));

    return {
      fullUsers: directory.filter((person) => person.personType === "full_user" && person.isActive),
      teammates: directory.filter((person) => person.personType === "teammate"),
    };
  }),

  /** Operational navigation is accessible to all Full Users and never exposes inaccessible names. */
  getNavigation: protectedProcedure.query(async ({ ctx }) => {
    requireFullUser(ctx as PulseContext);
    const db = await getDb();
    if (!db) return [];
    const [meetings, teams, oneOnOnes] = await Promise.all([
      getAccessibleMeetings(db, ctx.user.id),
      getAccessibleTeams(db, ctx.user.id),
      getAccessibleOneOnOnes(db, ctx.user.id),
    ]);
    const items = [
      ...meetings.map((meeting) => ({
        id: `meeting-${meeting.id}`,
        label: meeting.name,
        path: `/pulse/meetings/${meeting.id}`,
        resourceType: "meeting" as const,
        accessLevel: meeting.accessLevel,
      })),
      ...teams.map((team) => ({
        id: `team-${team.id}`,
        label: team.name,
        path: `/pulse/teams/${team.id}`,
        resourceType: "team" as const,
        accessLevel: team.membershipRole,
      })),
      ...oneOnOnes.map((oneOnOne) => ({
        id: `one-on-one-${oneOnOne.id}`,
        label: oneOnOne.name,
        path: `/pulse/1on1/${oneOnOne.id}`,
        resourceType: "one_on_one" as const,
        accessLevel: oneOnOne.accessLevel,
      })),
    ];
    return items.length === 0 ? [] : [{ id: "operate", label: "Operate", items }];
  }),

  /** Active meeting read resolves archive state before the caller's grant. */
  getMeeting: protectedProcedure
    .input(z.object({ meetingId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const meeting = await getActiveMeetingOrThrow(db, input.meetingId);
      const access = await db
        .select({ accessLevel: pulseMeetingAccess.accessLevel })
        .from(pulseMeetingAccess)
        .where(and(
          eq(pulseMeetingAccess.meetingId, meeting.id),
          eq(pulseMeetingAccess.userId, ctx.user.id),
          isNull(pulseMeetingAccess.revokedAt),
        ))
        .limit(1);
      if (!access[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot open this meeting." });
      return { ...meeting, accessLevel: access[0].accessLevel };
    }),

  getTeam: protectedProcedure
    .input(z.object({ teamId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Active-state availability is evaluated before membership, including for privileged callers.
      const team = await getActiveTeamOrThrow(db, input.teamId);
      const membership = await db.select({ role: pulseTeamMembers.role }).from(pulseTeamMembers).where(and(
        eq(pulseTeamMembers.teamId, team.id),
        eq(pulseTeamMembers.userId, ctx.user.id),
        isNull(pulseTeamMembers.removedAt),
      )).limit(1);
      if (!membership[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot open this team." });
      return { ...team, membershipRole: membership[0].role };
    }),

  getOneOnOne: protectedProcedure
    .input(z.object({ oneOnOneId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Active-state availability is evaluated before participant/viewer access.
      const oneOnOne = await getActiveOneOnOneOrThrow(db, input.oneOnOneId);
      const isParticipant = oneOnOne.primaryUserId === ctx.user.id || oneOnOne.secondaryUserId === ctx.user.id;
      if (isParticipant) return { ...oneOnOne, accessLevel: "participant" as const };
      const viewer = await db.select({ accessLevel: pulseOneOnOneAccess.accessLevel }).from(pulseOneOnOneAccess).where(and(
        eq(pulseOneOnOneAccess.oneOnOneId, oneOnOne.id),
        eq(pulseOneOnOneAccess.userId, ctx.user.id),
        isNull(pulseOneOnOneAccess.revokedAt),
      )).limit(1);
      if (!viewer[0]) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot open this 1:1." });
      return { ...oneOnOne, accessLevel: viewer[0].accessLevel };
    }),

  createMeeting: protectedProcedure
    .input(meetingInputSchema.merge(accessInputSchema))
    .mutation(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      await requirePulseConfiguration(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const accessInput = normalizeAccess(input);
      await assertAssignableFullUsers(db, [accessInput.facilitatorUserId, ...accessInput.memberUserIds]);
      try {
        const meetingId = await db.transaction(async (tx: PulseDb) => {
          const [inserted] = await tx.insert(pulseMeetings).values({
            meetingKey: input.meetingKey,
            name: input.name,
            scheduleDay: input.scheduleDay,
            scheduleTime: input.scheduleTime,
            timezone: input.timezone,
            facilitatorUserId: accessInput.facilitatorUserId,
            durationMinutes: input.durationMinutes,
            sectionVisibility: input.sectionVisibility,
            createdById: ctx.user.id,
          });
          const createdMeetingId = Number((inserted as any).insertId);
          await replaceActiveAccess(tx, createdMeetingId, accessInput, ctx.user.id);
          return createdMeetingId;
        });
        return { id: meetingId };
      } catch (error: any) {
        if (error?.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "A meeting already uses that key." });
        }
        throw error;
      }
    }),

  updateMeeting: protectedProcedure
    .input(z.object({ meetingId: z.number().int().positive(), ...meetingInputSchema.shape }))
    .mutation(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      await requirePulseConfiguration(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await requireActiveFacilitator(db, input.meetingId, ctx.user.id);
      try {
        await db.update(pulseMeetings).set({
          meetingKey: input.meetingKey,
          name: input.name,
          scheduleDay: input.scheduleDay,
          scheduleTime: input.scheduleTime,
          timezone: input.timezone,
          durationMinutes: input.durationMinutes,
          sectionVisibility: input.sectionVisibility,
        }).where(eq(pulseMeetings.id, input.meetingId));
        return { success: true };
      } catch (error: any) {
        if (error?.code === "ER_DUP_ENTRY") {
          throw new TRPCError({ code: "CONFLICT", message: "A meeting already uses that key." });
        }
        throw error;
      }
    }),

  replaceMeetingAccess: protectedProcedure
    .input(z.object({ meetingId: z.number().int().positive() }).merge(accessInputSchema))
    .mutation(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      await requirePulseConfiguration(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await requireActiveFacilitator(db, input.meetingId, ctx.user.id);
      await db.transaction(async (tx: PulseDb) => {
        await replaceActiveAccess(tx, input.meetingId, input, ctx.user.id);
      });
      return { success: true };
    }),

  archiveMeeting: protectedProcedure
    .input(z.object({ meetingId: z.number().int().positive(), archiveNote: z.string().trim().max(2000).optional() }))
    .mutation(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      await requirePulseConfiguration(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await requireActiveFacilitator(db, input.meetingId, ctx.user.id);
      await db.update(pulseMeetings).set({
        isActive: false,
        archivedAt: new Date(),
        archivedById: ctx.user.id,
        archiveNote: input.archiveNote || null,
      }).where(eq(pulseMeetings.id, input.meetingId));
      return { success: true };
    }),

  /** Reactivation accepts an explicit registry ID; inactive records are intentionally never listed or navigated. */
  reactivateMeeting: protectedProcedure
    .input(z.object({ meetingId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      await requirePulseConfiguration(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const result = await db.update(pulseMeetings).set({
        isActive: true,
        archivedAt: null,
        archivedById: null,
        archiveNote: null,
      }).where(eq(pulseMeetings.id, input.meetingId));
      if (Number((result as any)[0]?.affectedRows ?? 0) === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found." });
      }
      return { success: true };
    }),

  createTeammate: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(2).max(255),
      title: z.string().trim().max(128).optional(),
      reportsToId: z.number().int().positive().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireFullUser(ctx as PulseContext);
      await requirePulseConfiguration(ctx as PulseContext);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [result] = await db.insert(users).values({
        openId: `pulse_teammate_${randomUUID()}`,
        name: input.name,
        title: input.title || null,
        reportsToId: input.reportsToId ?? null,
        personType: "teammate",
        role: "agent",
        loginMethod: "pulse_directory",
        isActive: true,
        lastSignedIn: new Date(),
      });
      return { id: Number((result as any).insertId) };
    }),
});
