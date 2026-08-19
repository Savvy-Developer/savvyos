import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import {
  PULSE_GLOSSARY_SEEDS,
  PULSE_MEETING_PRESETS,
  PULSE_SECTION_KEYS,
  pulseActivityLog,
  pulseGlossary,
  pulseMeetingMembers,
  pulseMeetings,
  pulseProfiles,
  pulseWorkItemMoves,
  pulseWorkItems,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { is_visible_meeting_manager, require_visible_meeting, visible_meeting_ids } from "../pulse/access";

const sectionKeySchema = z.enum(PULSE_SECTION_KEYS);
const meetingLabelSchema = z.enum(["level_10", "one_on_one", "other"]);
const cadenceSchema = z.enum(["weekly", "biweekly", "monthly", "daily", "ad_hoc"]);
const meetingRoleSchema = z.enum(["owner", "administrator", "member"]);

function uuid() {
  return crypto.randomUUID();
}

function getPresetSections(label: z.infer<typeof meetingLabelSchema>) {
  return PULSE_MEETING_PRESETS[label];
}

function defaultSectionDurations(sectionOrder: readonly string[]) {
  return Object.fromEntries(sectionOrder.map((section) => [section, 5]));
}

function serviceUnavailable() {
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
}

async function writePulseActivity(
  db: any,
  input: {
    personId: number;
    entityType: string;
    entityId: string;
    action: string;
    fieldChanged?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
  },
) {
  await db.insert(pulseActivityLog).values({
    id: uuid(),
    personId: input.personId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    fieldChanged: input.fieldChanged ?? null,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
  });
}

async function ensureGlossary(db: any) {
  for (const seed of PULSE_GLOSSARY_SEEDS) {
    await db.insert(pulseGlossary).values({
      id: uuid(),
      term: seed.term,
      plainGloss: seed.plainGloss,
      isActive: true,
    }).onDuplicateKeyUpdate({
      set: { plainGloss: seed.plainGloss, isActive: true, deletedAt: null },
    });
  }
}

async function listVisibleMeetings(db: any, personId: number) {
  const visibleIds = await visible_meeting_ids(db, personId);
  if (!visibleIds.length) return [];

  return db
    .select({
      id: pulseMeetings.id,
      name: pulseMeetings.name,
      label: pulseMeetings.label,
      dayOfWeek: pulseMeetings.dayOfWeek,
      startTime: pulseMeetings.startTime,
      cadence: pulseMeetings.cadence,
      timezone: pulseMeetings.timezone,
      durationMinutes: pulseMeetings.durationMinutes,
      sectionsEnabled: pulseMeetings.sectionsEnabled,
      sectionOrder: pulseMeetings.sectionOrder,
      meetingRole: pulseMeetingMembers.meetingRole,
    })
    .from(pulseMeetings)
    .innerJoin(pulseMeetingMembers, and(
      eq(pulseMeetingMembers.meetingId, pulseMeetings.id),
      eq(pulseMeetingMembers.personId, personId),
      isNull(pulseMeetingMembers.removedAt),
      isNull(pulseMeetingMembers.deletedAt),
    ))
    .where(and(
      inArray(pulseMeetings.id, visibleIds),
      eq(pulseMeetings.isActive, true),
      isNull(pulseMeetings.deletedAt),
    ))
    .orderBy(asc(pulseMeetings.name));
}

async function getVisibleMeetingWorkItems(db: any, personId: number, meetingId: string) {
  const meeting = await require_visible_meeting(db, personId, meetingId);
  const visibleIds = await visible_meeting_ids(db, personId);

  const items = await db
    .select({
      id: pulseWorkItems.id,
      type: pulseWorkItems.type,
      title: pulseWorkItems.title,
      description: pulseWorkItems.description,
      status: pulseWorkItems.status,
      dueDate: pulseWorkItems.dueDate,
      completedAt: pulseWorkItems.completedAt,
      origin: pulseWorkItems.origin,
      isProposed: pulseWorkItems.isProposed,
      sortOrder: pulseWorkItems.sortOrder,
      assigneeId: pulseWorkItems.assigneeId,
      assigneeName: users.name,
      meetingId: pulseWorkItems.meetingId,
    })
    .from(pulseWorkItems)
    .leftJoin(users, eq(users.id, pulseWorkItems.assigneeId))
    .where(and(
      eq(pulseWorkItems.meetingId, meeting.id),
      inArray(pulseWorkItems.meetingId, visibleIds),
      isNull(pulseWorkItems.deletedAt),
    ))
    .orderBy(asc(pulseWorkItems.sortOrder), asc(pulseWorkItems.createdAt));

  return { meeting, items };
}

export const pulseRouter = router({
  /** Used by the shell. This payload is built from membership, never platform role. */
  shell: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw serviceUnavailable();
    await ensureGlossary(db);
    const meetings = await listVisibleMeetings(db, ctx.user.id);
    const [profile] = await db.select().from(pulseProfiles).where(and(
      eq(pulseProfiles.userId, ctx.user.id),
      isNull(pulseProfiles.deletedAt),
    ));

    const ownsOrAdministers = meetings.some((meeting: any) => (
      meeting.meetingRole === "owner" || meeting.meetingRole === "administrator"
    ));
    const platformRole = profile?.platformRole ?? "member";
    const navMode = meetings.length === 1 && !ownsOrAdministers ? "single_meeting" : "standard";

    return {
      navMode,
      meetings,
      // The shell may show settings to Pulse managers and super-admin reporting users,
      // but neither case grants visibility into meetings they do not belong to.
      canSeeSettings: ownsOrAdministers || platformRole === "super_admin",
      canSeeAggregateReporting: platformRole === "super_admin",
    };
  }),

  glossary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw serviceUnavailable();
    await ensureGlossary(db);
    return db.select({ term: pulseGlossary.term, plainGloss: pulseGlossary.plainGloss })
      .from(pulseGlossary)
      .where(and(eq(pulseGlossary.isActive, true), isNull(pulseGlossary.deletedAt)))
      .orderBy(asc(pulseGlossary.term));
  }),

  visibleMeetingIds: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw serviceUnavailable();
    return visible_meeting_ids(db, ctx.user.id);
  }),

  list: protectedProcedure
    .input(z.object({ search: z.string().trim().max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw serviceUnavailable();
      const meetings = await listVisibleMeetings(db, ctx.user.id);
      const query = input?.search?.toLocaleLowerCase();
      return query ? meetings.filter((meeting: any) => meeting.name.toLocaleLowerCase().includes(query)) : meetings;
    }),

  get: protectedProcedure
    .input(z.object({ meetingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw serviceUnavailable();
      const meeting = await require_visible_meeting(db, ctx.user.id, input.meetingId);
      const isManager = await is_visible_meeting_manager(db, ctx.user.id, input.meetingId);

      // Member payload intentionally omits run, configuration, archive, and effectiveness keys.
      return {
        id: meeting.id,
        name: meeting.name,
        label: meeting.label,
        cadence: meeting.cadence,
        dayOfWeek: meeting.dayOfWeek,
        startTime: meeting.startTime,
        durationMinutes: meeting.durationMinutes,
        timezone: meeting.timezone,
        sectionsEnabled: meeting.sectionsEnabled,
        sectionOrder: meeting.sectionOrder,
        ...(isManager ? {
          management: {
            ownerId: meeting.ownerId,
            administratorId: meeting.administratorId,
            reminderDay: meeting.reminderDay,
            reminderTime: meeting.reminderTime,
            sectionDurations: meeting.sectionDurations,
          },
        } : {}),
      };
    }),

  sectionWorkItems: protectedProcedure
    .input(z.object({ meetingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw serviceUnavailable();
      return getVisibleMeetingWorkItems(db, ctx.user.id, input.meetingId);
    }),

  search: protectedProcedure
    .input(z.object({ query: z.string().trim().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw serviceUnavailable();
      const visibleIds = await visible_meeting_ids(db, ctx.user.id);
      if (!visibleIds.length) return [];

      return db.select({
        id: pulseWorkItems.id,
        type: pulseWorkItems.type,
        title: pulseWorkItems.title,
        status: pulseWorkItems.status,
        meetingId: pulseWorkItems.meetingId,
        meetingName: pulseMeetings.name,
      })
        .from(pulseWorkItems)
        .innerJoin(pulseMeetings, eq(pulseMeetings.id, pulseWorkItems.meetingId))
        .where(and(
          inArray(pulseWorkItems.meetingId, visibleIds),
          isNull(pulseWorkItems.deletedAt),
          isNull(pulseMeetings.deletedAt),
          or(
            like(pulseWorkItems.title, `%${input.query}%`),
            like(pulseWorkItems.description, `%${input.query}%`),
          ),
        ));
    }),

  createMeeting: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(255),
      label: meetingLabelSchema,
      administratorId: z.number().int().positive().optional(),
      memberIds: z.array(z.number().int().positive()).max(100).default([]),
      cadence: cadenceSchema.default("weekly"),
      dayOfWeek: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).optional().nullable(),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
      durationMinutes: z.number().int().min(5).max(480).default(90),
      timezone: z.string().min(1).max(64).default("America/New_York"),
      sectionsEnabled: z.record(sectionKeySchema, z.boolean()).optional(),
      sectionOrder: z.array(sectionKeySchema).min(1).optional(),
      sectionDurations: z.record(sectionKeySchema, z.number().int().min(0).max(240)).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw serviceUnavailable();

      // Creating a meeting is an administrative capability, but it does not create
      // visibility to unrelated meetings. The creator becomes owner of this record.
      const [profile] = await db.select().from(pulseProfiles).where(and(
        eq(pulseProfiles.userId, ctx.user.id),
        isNull(pulseProfiles.deletedAt),
      ));
      if (profile?.platformRole !== "admin" && profile?.platformRole !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to create a meeting." });
      }

      const id = uuid();
      const sectionOrder = input.sectionOrder ?? getPresetSections(input.label);
      const sectionsEnabled = input.sectionsEnabled ?? Object.fromEntries(PULSE_SECTION_KEYS.map((key) => [key, sectionOrder.includes(key)]));
      const sectionDurations = input.sectionDurations ?? defaultSectionDurations(sectionOrder);
      const administratorId = input.administratorId ?? ctx.user.id;

      await db.transaction(async (tx: any) => {
        await tx.insert(pulseMeetings).values({
          id,
          name: input.name,
          label: input.label,
          ownerId: ctx.user.id,
          administratorId,
          cadence: input.cadence,
          dayOfWeek: input.dayOfWeek ?? null,
          startTime: input.startTime ?? null,
          durationMinutes: input.durationMinutes,
          timezone: input.timezone,
          sectionsEnabled,
          sectionOrder,
          sectionDurations,
        });

        const memberRoleById = new Map<number, z.infer<typeof meetingRoleSchema>>();
        memberRoleById.set(ctx.user.id, "owner");
        memberRoleById.set(administratorId, administratorId === ctx.user.id ? "owner" : "administrator");
        input.memberIds.forEach((memberId) => {
          if (!memberRoleById.has(memberId)) memberRoleById.set(memberId, "member");
        });

        await tx.insert(pulseMeetingMembers).values(Array.from(memberRoleById.entries()).map(([personId, meetingRole]) => ({
          id: uuid(),
          meetingId: id,
          personId,
          meetingRole,
          addedById: ctx.user.id,
        })));

        await writePulseActivity(tx, {
          personId: ctx.user.id,
          entityType: "meeting",
          entityId: id,
          action: "created",
          newValue: { name: input.name, label: input.label, memberCount: memberRoleById.size },
        });
      });

      return { id };
    }),

  addMember: protectedProcedure
    .input(z.object({
      meetingId: z.string().uuid(),
      personId: z.number().int().positive(),
      meetingRole: meetingRoleSchema.default("member"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw serviceUnavailable();
      const canManage = await is_visible_meeting_manager(db, ctx.user.id, input.meetingId);
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "Only the meeting owner or administrator can add people." });

      await db.transaction(async (tx: any) => {
        await tx.insert(pulseMeetingMembers).values({
          id: uuid(),
          meetingId: input.meetingId,
          personId: input.personId,
          meetingRole: input.meetingRole,
          addedById: ctx.user.id,
        }).onDuplicateKeyUpdate({ set: { meetingRole: input.meetingRole, removedAt: null, deletedAt: null, addedById: ctx.user.id } });
        await writePulseActivity(tx, {
          personId: ctx.user.id,
          entityType: "meeting_membership",
          entityId: `${input.meetingId}:${input.personId}`,
          action: "access_granted",
          newValue: { meetingId: input.meetingId, personId: input.personId, meetingRole: input.meetingRole },
        });
      });

      return { success: true };
    }),

  moveWorkItem: protectedProcedure
    .input(z.object({
      workItemId: z.string().uuid(),
      toMeetingId: z.string().uuid().nullable(),
      toOwnerPersonId: z.number().int().positive().nullable(),
      reason: z.string().trim().max(1000).optional().nullable(),
    }).refine((input) => (input.toMeetingId === null) !== (input.toOwnerPersonId === null), {
      message: "Choose one destination: a meeting or a person.",
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw serviceUnavailable();
      const visibleIds = await visible_meeting_ids(db, ctx.user.id);
      const [workItem] = await db.select().from(pulseWorkItems).where(and(
        eq(pulseWorkItems.id, input.workItemId),
        inArray(pulseWorkItems.meetingId, visibleIds),
        isNull(pulseWorkItems.deletedAt),
      ));
      if (!workItem) throw new TRPCError({ code: "NOT_FOUND", message: "This work item no longer exists in a meeting you can access." });
      if (input.toMeetingId) await require_visible_meeting(db, ctx.user.id, input.toMeetingId);

      await db.transaction(async (tx: any) => {
        await tx.update(pulseWorkItems).set({
          meetingId: input.toMeetingId,
          ownerPersonId: input.toOwnerPersonId,
        }).where(eq(pulseWorkItems.id, input.workItemId));
        await tx.insert(pulseWorkItemMoves).values({
          id: uuid(),
          workItemId: input.workItemId,
          fromMeetingId: workItem.meetingId,
          toMeetingId: input.toMeetingId,
          movedById: ctx.user.id,
          reason: input.reason ?? null,
        });
        await writePulseActivity(tx, {
          personId: ctx.user.id,
          entityType: "work_item",
          entityId: input.workItemId,
          action: "moved",
          fieldChanged: "meetingId",
          oldValue: { meetingId: workItem.meetingId, ownerPersonId: workItem.ownerPersonId },
          newValue: { meetingId: input.toMeetingId, ownerPersonId: input.toOwnerPersonId },
        });
      });

      return { success: true };
    }),
});
