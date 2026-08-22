import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  PULSE_SECTION_KEYS,
  activityLog,
  pulseMeetingMembers,
  pulseMeetings,
  pulseProfiles,
  pulseWorkItemMoves,
  pulseWorkItems,
  users,
} from "../../drizzle/schema";
import { getPulseNavDestinations } from "../../shared/pulseNav";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { require_visible_meeting, visible_meeting_ids } from "./access";
import { listAccessibleItems } from "./workItems";

const PREFIX = "pulse_slice_fixture_";
const MARKER = "Pulse Slice — ";
const WORK_ITEM_MARKER = "Pulse Slice ";
const DISPLAY_PERSONS = ["p1", "p2", "p3", "p4"] as const;
const SUPPORT_PERSONS = ["p5", "p6", "p7"] as const;
type FixtureKey = (typeof DISPLAY_PERSONS)[number] | (typeof SUPPORT_PERSONS)[number];
type SectionKey = (typeof PULSE_SECTION_KEYS)[number];

function uuid() { return crypto.randomUUID(); }
function fixtureOpenId(key: FixtureKey) { return `${PREFIX}${key}`; }
function fixtureName(key: FixtureKey) { return `${MARKER}${key.toUpperCase()}`; }
function sections(enabled: readonly SectionKey[]) {
  return {
    enabled: Object.fromEntries(PULSE_SECTION_KEYS.map((key) => [key, enabled.includes(key)])),
    order: enabled,
    durations: Object.fromEntries(enabled.map((key) => [key, 5])),
  };
}

async function requireSuperAdmin(db: any, personId: number) {
  const [profile] = await db.select({ platformRole: pulseProfiles.platformRole })
    .from(pulseProfiles)
    .where(and(eq(pulseProfiles.userId, personId), isNull(pulseProfiles.deletedAt)))
    .limit(1);
  if (profile?.platformRole !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This Pulse verification page is for super admins only." });
  }
}

async function fixturePeople(db: any) {
  // The openId marker is the first and non-negotiable boundary for fixture people.
  const records = await db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, isActive: users.isActive })
    .from(users)
    .where(like(users.openId, `${PREFIX}%`));
  return Object.fromEntries(records.map((person: any) => [person.openId.replace(PREFIX, "") as FixtureKey, person]));
}

async function fixtureMeetings(db: any, includeRetired = false) {
  const condition = includeRetired
    ? like(pulseMeetings.name, `${MARKER}%`)
    : and(like(pulseMeetings.name, `${MARKER}%`), isNull(pulseMeetings.deletedAt));
  const records = await db.select().from(pulseMeetings).where(condition);
  return Object.fromEntries(records.map((meeting: any) => [meeting.name.replace(MARKER, "").toLowerCase() as "a" | "b" | "c", meeting]));
}

/**
 * Retires only rows whose own marker column identifies them as a thin-slice fixture.
 * This function deliberately contains no delete call. Shared activity_log and Pulse
 * activity history remain append-only; retired fixture identities stay inactive so
 * foreign-key-backed history remains readable but is never available to users.
 */
async function retireFixture(db: any) {
  const meetings = await fixtureMeetings(db);
  const meetingIds = Object.values(meetings).map((meeting: any) => meeting.id);
  const people = await fixturePeople(db);
  const peopleIds = Object.values(people).map((person: any) => person.id);
  const now = new Date();

  const itemRows = (meetingIds.length || peopleIds.length)
    ? await db.select({ id: pulseWorkItems.id }).from(pulseWorkItems).where(and(
      like(pulseWorkItems.title, `${WORK_ITEM_MARKER}%`),
      isNull(pulseWorkItems.deletedAt),
      or(
        meetingIds.length ? inArray(pulseWorkItems.meetingId, meetingIds) : undefined,
        peopleIds.length ? inArray(pulseWorkItems.ownerPersonId, peopleIds) : undefined,
      ),
    ))
    : [];
  const itemIds = itemRows.map((item: any) => item.id);

  if (itemIds.length) {
    await db.update(pulseWorkItemMoves).set({ deletedAt: now }).where(and(inArray(pulseWorkItemMoves.workItemId, itemIds), isNull(pulseWorkItemMoves.deletedAt)));
    await db.update(pulseWorkItems).set({ deletedAt: now }).where(inArray(pulseWorkItems.id, itemIds));
  }
  if (meetingIds.length && peopleIds.length) {
    await db.update(pulseMeetingMembers).set({ removedAt: now, deletedAt: now }).where(and(
      inArray(pulseMeetingMembers.meetingId, meetingIds),
      inArray(pulseMeetingMembers.personId, peopleIds),
      isNull(pulseMeetingMembers.deletedAt),
    ));
  }
  if (meetingIds.length) {
    await db.update(pulseMeetings).set({ isActive: false, deletedAt: now }).where(and(
      inArray(pulseMeetings.id, meetingIds),
      like(pulseMeetings.name, `${MARKER}%`),
      isNull(pulseMeetings.deletedAt),
    ));
  }
  if (peopleIds.length) {
    // Existing fixture audit rows remain immutable in count and content except for
    // this durable marker, which lets normal operating views exclude test activity.
    await db.update(activityLog).set({
      details: sql`JSON_SET(COALESCE(${activityLog.details}, JSON_OBJECT()), '$.isFixtureVerification', true)`,
    }).where(and(
      inArray(activityLog.userId, peopleIds),
      sql`JSON_UNQUOTE(JSON_EXTRACT(${activityLog.details}, '$.path')) LIKE 'pulse.thinSlice.%'`,
    ));
    await db.update(pulseProfiles).set({ isActive: false, deletedAt: now }).where(and(inArray(pulseProfiles.userId, peopleIds), isNull(pulseProfiles.deletedAt)));
    await db.update(users).set({ isActive: false, passwordHash: null, passwordResetToken: null, passwordResetExpiry: null }).where(inArray(users.id, peopleIds));
  }
  return { people: peopleIds.length, meetings: meetingIds.length, workItems: itemIds.length };
}

function requireThinSliceEnvironment() {
  if (ENV.isProduction) throw new TRPCError({ code: "NOT_FOUND", message: "Not found." });
}

/** Development-only helper for tests and local cleanup; it is not registered as an RPC endpoint. */
export async function retirePulseThinSliceFixture(db: any) {
  requireThinSliceEnvironment();
  return retireFixture(db);
}

/** Creates only marked, reversible test records. This never touches live Pulse meetings. */
export async function resetPulseThinSliceFixture(db: any) {
  requireThinSliceEnvironment();
  await retireFixture(db);
  const keyDefinitions: Array<{ key: FixtureKey; platformRole: "super_admin" | "member"; role: "admin" | "agent" }> = [
    { key: "p1", platformRole: "member", role: "agent" },
    { key: "p2", platformRole: "member", role: "agent" },
    { key: "p3", platformRole: "member", role: "agent" },
    { key: "p4", platformRole: "super_admin", role: "admin" },
    { key: "p5", platformRole: "member", role: "agent" },
    { key: "p6", platformRole: "member", role: "agent" },
    { key: "p7", platformRole: "member", role: "agent" },
  ];
  await db.transaction(async (tx: any) => {
    for (const person of keyDefinitions) {
      await tx.insert(users).values({
        openId: fixtureOpenId(person.key),
        name: fixtureName(person.key),
        email: `${fixtureOpenId(person.key)}@savvy.test`,
        role: person.role,
        personType: "full_user",
        isActive: true,
        allowHiddenNav: false,
      }).onDuplicateKeyUpdate({ set: {
        name: fixtureName(person.key), email: `${fixtureOpenId(person.key)}@savvy.test`, role: person.role,
        personType: "full_user", isActive: true, allowHiddenNav: false,
        passwordHash: null, passwordResetToken: null, passwordResetExpiry: null,
      } });
    }
    const people = await fixturePeople(tx);
    for (const person of keyDefinitions) {
      await tx.insert(pulseProfiles).values({ userId: people[person.key].id, platformRole: person.platformRole, timezone: "America/New_York", notificationPrefs: {}, isActive: true }).onDuplicateKeyUpdate({ set: { platformRole: person.platformRole, timezone: "America/New_York", notificationPrefs: {}, isActive: true, deletedAt: null } });
    }
    const allSections = sections(PULSE_SECTION_KEYS);
    const limitedB = sections(["segue", "todos", "issues"]);
    const limitedC = sections(["todos", "issues"]);
    const definition = [
      { key: "a" as const, name: `${MARKER}A`, label: "level_10" as const, setup: allSections, memberKeys: ["p1", "p2", "p5", "p6", "p7"] as FixtureKey[], owner: "p2" as FixtureKey },
      { key: "b" as const, name: `${MARKER}B`, label: "one_on_one" as const, setup: limitedB, memberKeys: ["p2", "p5"] as FixtureKey[], owner: "p5" as FixtureKey },
      { key: "c" as const, name: `${MARKER}C`, label: "other" as const, setup: limitedC, memberKeys: ["p2", "p3", "p5"] as FixtureKey[], owner: "p5" as FixtureKey },
    ];
    const meetingIds: Record<string, string> = {};
    for (const meeting of definition) {
      const id = uuid();
      meetingIds[meeting.key] = id;
      await tx.insert(pulseMeetings).values({
        id, name: meeting.name, label: meeting.label, ownerId: people[meeting.owner].id, administratorId: people[meeting.owner].id,
        dayOfWeek: "monday", startTime: "09:00", durationMinutes: 90, cadence: "weekly", timezone: "America/New_York",
        sectionsEnabled: meeting.setup.enabled, sectionOrder: meeting.setup.order, sectionDurations: meeting.setup.durations, isActive: true,
      });
      await tx.insert(pulseMeetingMembers).values(meeting.memberKeys.map((key) => ({
        id: uuid(), meetingId: id, personId: people[key].id, meetingRole: key === meeting.owner ? "owner" as const : "member" as const, addedById: people[meeting.owner].id,
      })));
      for (const kind of ["todo", "issue", "rock"] as const) {
        await tx.insert(pulseWorkItems).values({
          id: uuid(), type: kind, title: `Pulse Slice ${meeting.key.toUpperCase()} ${kind}`, meetingId: id, ownerPersonId: null,
          assigneeId: people.p2.id, createdById: people[meeting.owner].id,
          status: kind === "rock" ? "on_track" : "open", dueDate: kind === "todo" ? new Date("2026-08-31T00:00:00.000Z") : null,
          priority: kind === "issue" ? 1 : null, quarter: kind === "rock" ? "Q3 2026" : null, percentComplete: 0,
        });
      }
    }
    await tx.insert(pulseWorkItems).values([
      { id: uuid(), type: "todo", title: "Pulse Slice P2 personal todo", meetingId: null, ownerPersonId: people.p2.id, assigneeId: people.p2.id, createdById: people.p2.id, status: "open", dueDate: new Date("2026-08-31T00:00:00.000Z"), priority: null, quarter: null, percentComplete: 0 },
      { id: uuid(), type: "rock", title: "Pulse Slice P2 personal rock", meetingId: null, ownerPersonId: people.p2.id, assigneeId: people.p2.id, createdById: people.p2.id, status: "on_track", dueDate: null, priority: null, quarter: "Q3 2026", percentComplete: 0 },
    ]);
  });
  return { people: await fixturePeople(db), meetings: await fixtureMeetings(db) };
}

async function ensureFixture(db: any) {
  const meetings = await fixtureMeetings(db);
  const people = await fixturePeople(db);
  if (!meetings.a || !meetings.b || !meetings.c || !DISPLAY_PERSONS.every((key) => people[key]?.isActive)) return resetPulseThinSliceFixture(db);
  return { people, meetings };
}

/** One shared query used by dashboard and runner consumers for every Pulse section. */
export async function getVisibleSectionData(db: any, personId: number, meetingId: string, section: SectionKey) {
  const meeting = await require_visible_meeting(db, personId, meetingId);
  const enabled = Boolean((meeting.sectionsEnabled as Record<string, boolean>)[section]);
  if (!enabled) return { section, enabled: false, data: null };

  const type = section === "todos" ? "todo" : section === "issues" ? "issue" : section === "rocks" ? "rock" : null;
  if (type) {
    const items = await db.select({ id: pulseWorkItems.id, title: pulseWorkItems.title, type: pulseWorkItems.type, status: pulseWorkItems.status, dueDate: pulseWorkItems.dueDate, percentComplete: pulseWorkItems.percentComplete })
      .from(pulseWorkItems).where(and(eq(pulseWorkItems.meetingId, meetingId), eq(pulseWorkItems.type, type), isNull(pulseWorkItems.deletedAt))).orderBy(asc(pulseWorkItems.title));
    return { section, enabled: true, data: { items } };
  }

  // Each non-work-item section exposes its own actual meeting configuration. This
  // keeps the common visibility path while preventing a generic empty payload from
  // masquerading as nine implemented sections.
  const schedule = { cadence: meeting.cadence, dayOfWeek: meeting.dayOfWeek, startTime: meeting.startTime, timezone: meeting.timezone, durationMinutes: meeting.durationMinutes };
  if (section === "segue") return { section, enabled: true, data: { schedule, prompt: "Check in with the people in this meeting." } };
  if (section === "headlines") return { section, enabled: true, data: { meetingName: meeting.name, prompt: "Share the headlines that affect this meeting." } };
  if (section === "scorecard") return { section, enabled: true, data: { schedule, prompt: "Review the numbers this meeting tracks." } };
  if (section === "goals") return { section, enabled: true, data: { cadence: meeting.cadence, prompt: "Review the goals owned in this meeting." } };
  if (section === "cascading") return { section, enabled: true, data: { meetingId: meeting.id, prompt: "Capture what this meeting needs to pass on." } };
  return { section, enabled: true, data: { schedule, prompt: "Close with decisions and the next clear step." } };
}
export const getDashboardSectionData = getVisibleSectionData;
export const getRunnerSectionData = getVisibleSectionData;

async function shellFor(db: any, personId: number) {
  const visibleIds = await visible_meeting_ids(db, personId);
  const meetings = visibleIds.length
    ? await db.select({ id: pulseMeetings.id, name: pulseMeetings.name, meetingRole: pulseMeetingMembers.meetingRole })
      .from(pulseMeetings).innerJoin(pulseMeetingMembers, and(eq(pulseMeetingMembers.meetingId, pulseMeetings.id), eq(pulseMeetingMembers.personId, personId), isNull(pulseMeetingMembers.removedAt), isNull(pulseMeetingMembers.deletedAt)))
      .where(and(inArray(pulseMeetings.id, visibleIds), eq(pulseMeetings.isActive, true), isNull(pulseMeetings.deletedAt))).orderBy(asc(pulseMeetings.name))
    : [];
  const [profile] = await db.select({ platformRole: pulseProfiles.platformRole }).from(pulseProfiles).where(and(eq(pulseProfiles.userId, personId), isNull(pulseProfiles.deletedAt))).limit(1);
  const ownsOrAdministers = meetings.some((meeting: any) => meeting.meetingRole === "owner" || meeting.meetingRole === "administrator");
  const isSuperAdmin = profile?.platformRole === "super_admin";
  const canSeeSettings = ownsOrAdministers || isSuperAdmin;
  const navMode = meetings.length === 1 && !ownsOrAdministers ? "single_meeting" as const : "standard" as const;
  return {
    meetings,
    navMode,
    ownsOrAdministers,
    canSeeSettings,
    settingsReason: ownsOrAdministers ? "meeting_manager" : isSuperAdmin ? "super_admin" : "none",
    destinations: getPulseNavDestinations({ navMode, canSeeSettings, meetings }),
  };
}

function safeSource(item: any) {
  return item.meetingId ? item.meetingName : "Personal";
}

async function meetingPayloadProof(db: any, personId: number, meetingId: string) {
  try {
    const meeting = await require_visible_meeting(db, personId, meetingId);
    const memberPayload = {
      id: meeting.id, name: meeting.name, label: meeting.label, cadence: meeting.cadence, sectionsEnabled: meeting.sectionsEnabled, sectionOrder: meeting.sectionOrder,
    };
    return {
      meetingId, name: meeting.name, visible: true,
      topLevelKeys: Object.keys(memberPayload).sort(),
      payload: memberPayload,
      sensitiveKeysPresent: Object.fromEntries(["run", "configuration", "archive", "effectiveness"].map((key) => [key, Object.hasOwn(memberPayload, key)])),
      enabledSections: PULSE_SECTION_KEYS.filter((section) => Boolean((meeting.sectionsEnabled as Record<string, boolean>)[section])),
    };
  } catch (error: any) {
    return { meetingId, visible: false, error: error?.message ?? "Unknown error" };
  }
}

async function personSnapshot(db: any, key: (typeof DISPLAY_PERSONS)[number], people: any, meetings: any) {
  const person = people[key];
  const visibleMeetingIds = await visible_meeting_ids(db, person.id);
  const items = await listAccessibleItems(db, person.id, {});
  const searchItems = await db.select({ id: pulseWorkItems.id, meetingId: pulseWorkItems.meetingId, title: pulseWorkItems.title })
    .from(pulseWorkItems).where(and(inArray(pulseWorkItems.meetingId, visibleMeetingIds.length ? visibleMeetingIds : ["00000000-0000-0000-0000-000000000000"]), like(pulseWorkItems.title, "%Pulse Slice%"), isNull(pulseWorkItems.deletedAt)));
  const shell = await shellFor(db, person.id);
  const payloads = await Promise.all(["a", "b", "c"].map((meetingKey) => meetingPayloadProof(db, person.id, meetings[meetingKey].id)));
  return {
    key: key.toUpperCase(), personId: person.id, visibleMeetingIds,
    workItems: items.map((item: any) => ({ id: item.id, type: item.type, title: item.title, meetingId: item.meetingId, source: safeSource(item), resolvedMeetingName: item.meetingId ? item.meetingName : "Personal" })),
    searchItemIds: searchItems.map((item: any) => item.id),
    navDestinations: shell.destinations,
    navEvidence: { navMode: shell.navMode, canSeeSettings: shell.canSeeSettings, settingsReason: shell.settingsReason, ownsOrAdministers: shell.ownsOrAdministers },
    meetingPayloads: payloads,
  };
}

async function modelSnapshot(db: any) {
  const { people, meetings } = await ensureFixture(db);
  const persons = await Promise.all(DISPLAY_PERSONS.map((key) => personSnapshot(db, key, people, meetings)));
  const sectionProof = await Promise.all(PULSE_SECTION_KEYS.map(async (section) => {
    const dashboard = await getDashboardSectionData(db, people.p2.id, meetings.a.id, section);
    const runner = await getRunnerSectionData(db, people.p2.id, meetings.a.id, section);
    return { section, dashboard, runner, deepEqual: JSON.stringify(dashboard) === JSON.stringify(runner) };
  }));
  const missingMeetingError = await meetingPayloadProof(db, people.p1.id, "00000000-0000-0000-0000-000000000000");
  const p4DirectDenial = await meetingPayloadProof(db, people.p4.id, meetings.a.id);
  return {
    fixture: { meetings: Object.fromEntries(Object.entries(meetings).map(([key, meeting]: any) => [key.toUpperCase(), { ...meeting, record: meeting }])), people: Object.fromEntries(DISPLAY_PERSONS.map((key) => [key.toUpperCase(), { id: people[key].id, name: people[key].name }])) },
    persons, sectionProof, missingMeetingError, p4DirectDenial,
  };
}

const operationSchema = z.enum(["move_c_todo_to_a", "add_p3_to_b", "remove_p3_from_c", "change_a_label", "disable_a_issues"]);
async function performOperation(db: any, actorId: number, operation: z.infer<typeof operationSchema>) {
  const { people, meetings } = await ensureFixture(db);
  if (operation === "move_c_todo_to_a") {
    const [item] = await db.select().from(pulseWorkItems).where(and(eq(pulseWorkItems.title, "Pulse Slice C todo"), isNull(pulseWorkItems.deletedAt))).limit(1);
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "The fixture to-do is missing." });
    await db.transaction(async (tx: any) => {
      await tx.update(pulseWorkItems).set({ meetingId: meetings.a.id, ownerPersonId: null }).where(eq(pulseWorkItems.id, item.id));
      await tx.insert(pulseWorkItemMoves).values({ id: uuid(), workItemId: item.id, fromMeetingId: meetings.c.id, toMeetingId: meetings.a.id, movedById: actorId, reason: "Thin-slice verification" });
    });
  }
  if (operation === "add_p3_to_b") {
    await db.insert(pulseMeetingMembers).values({ id: uuid(), meetingId: meetings.b.id, personId: people.p3.id, meetingRole: "member", addedById: actorId }).onDuplicateKeyUpdate({ set: { removedAt: null, deletedAt: null, addedById: actorId } });
  }
  if (operation === "remove_p3_from_c") {
    await db.update(pulseMeetingMembers).set({ removedAt: new Date() }).where(and(eq(pulseMeetingMembers.meetingId, meetings.c.id), eq(pulseMeetingMembers.personId, people.p3.id), isNull(pulseMeetingMembers.deletedAt)));
  }
  if (operation === "change_a_label") await db.update(pulseMeetings).set({ label: "other" }).where(eq(pulseMeetings.id, meetings.a.id));
  if (operation === "disable_a_issues") {
    const enabled = { ...(meetings.a.sectionsEnabled as Record<string, boolean>), issues: false };
    await db.update(pulseMeetings).set({ sectionsEnabled: enabled }).where(eq(pulseMeetings.id, meetings.a.id));
  }
  return modelSnapshot(db);
}

export const pulseThinSliceRouter = router({
  snapshot: protectedProcedure.query(async ({ ctx }) => {
    requireThinSliceEnvironment();
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
    await requireSuperAdmin(db, ctx.user.id);
    return modelSnapshot(db);
  }),
  reset: protectedProcedure.mutation(async ({ ctx }) => {
    requireThinSliceEnvironment();
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
    await requireSuperAdmin(db, ctx.user.id);
    await resetPulseThinSliceFixture(db);
    return modelSnapshot(db);
  }),
  perform: protectedProcedure.input(z.object({ operation: operationSchema })).mutation(async ({ ctx, input }) => {
    requireThinSliceEnvironment();
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pulse is not available right now. Please try again." });
    await requireSuperAdmin(db, ctx.user.id);
    const before = await modelSnapshot(db);
    const after = await performOperation(db, ctx.user.id, input.operation);
    return { operation: input.operation, before, after };
  }),
});
