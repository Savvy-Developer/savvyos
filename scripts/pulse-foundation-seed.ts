import crypto from "node:crypto";
import fs from "node:fs/promises";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
const seedFlag = process.env.PULSE_FOUNDATION_TEST_SEED === "true";
const purgeFlag = process.env.PULSE_FOUNDATION_PURGE === "true";
const prefix = "pulse_foundation_seed_";

if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!seedFlag && !purgeFlag) {
  throw new Error("Set PULSE_FOUNDATION_TEST_SEED=true to seed or PULSE_FOUNDATION_PURGE=true to remove the marked test data.");
}

const connection = await mysql.createConnection({ uri: databaseUrl });
const id = () => crypto.randomUUID();
const sections = (enabled: string[]) => ({
  enabled: Object.fromEntries(["segue", "headlines", "scorecard", "goals", "rocks", "todos", "issues", "cascading", "conclude"].map((key) => [key, enabled.includes(key)])),
  order: enabled,
  durations: Object.fromEntries(enabled.map((key) => [key, 5])),
});

async function seededUserIds() {
  const [rows] = await connection.query<any[]>("SELECT id FROM users WHERE openId LIKE ?", [`${prefix}%`]);
  return rows.map((row) => row.id as number);
}

async function purge() {
  const [meetingRows] = await connection.query<any[]>("SELECT id FROM pulse_meetings WHERE name LIKE 'Pulse Test — %'");
  const meetingIds = meetingRows.map((row) => row.id as string);
  const userIds = await seededUserIds();

  if (meetingIds.length) {
    await connection.query("DELETE FROM pulse_work_item_status_notes WHERE workItemId IN (SELECT id FROM pulse_work_items WHERE meetingId IN (?))", [meetingIds]);
    await connection.query("DELETE FROM pulse_work_item_moves WHERE fromMeetingId IN (?) OR toMeetingId IN (?)", [meetingIds, meetingIds]);
    await connection.query("DELETE FROM pulse_work_items WHERE meetingId IN (?)", [meetingIds]);
    await connection.query("DELETE FROM pulse_meeting_members WHERE meetingId IN (?)", [meetingIds]);
    await connection.query("DELETE FROM pulse_meetings_archive WHERE meetingId IN (?)", [meetingIds]);
    await connection.query("DELETE FROM pulse_meetings WHERE id IN (?)", [meetingIds]);
  }
  if (userIds.length) {
    await connection.query("DELETE FROM activity_log WHERE userId IN (?)", [userIds]);
    await connection.query("DELETE FROM pulse_activity_log WHERE personId IN (?)", [userIds]);
    await connection.query("DELETE FROM pulse_profiles WHERE userId IN (?)", [userIds]);
    await connection.query("DELETE FROM users WHERE id IN (?)", [userIds]);
  }
  console.log("Pulse foundation test seed data purged.");
}

try {
  if (purgeFlag) {
    await purge();
    process.exit(0);
  }

  await purge();
  await connection.beginTransaction();

  const people = [
    { key: "owner", name: "Pulse Test — Meeting Owner", role: "admin", platformRole: "admin" },
    { key: "ashleigh", name: "Pulse Test — Ashleigh", role: "agent", platformRole: "member" },
    { key: "four", name: "Pulse Test — Four Meetings", role: "agent", platformRole: "member" },
    { key: "superadmin", name: "Pulse Test — Super Admin", role: "admin", platformRole: "super_admin" },
  ] as const;

  const verificationPassword = crypto.randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(verificationPassword, 12);
  for (const person of people) {
    await connection.query(
      "INSERT INTO users (openId, name, email, role, personType, isActive, allowHiddenNav, passwordHash) VALUES (?, ?, ?, ?, 'full_user', TRUE, FALSE, ?)",
      [`${prefix}${person.key}`, person.name, `${prefix}${person.key}@savvy.test`, person.role, passwordHash],
    );
  }

  const [peopleRows] = await connection.query<any[]>("SELECT id, openId FROM users WHERE openId LIKE ?", [`${prefix}%`]);
  const personIdByKey = Object.fromEntries(peopleRows.map((row) => [row.openId.replace(prefix, ""), row.id])) as Record<string, number>;

  for (const person of people) {
    await connection.query(
      "INSERT INTO pulse_profiles (userId, platformRole, timezone, notificationPrefs, isActive) VALUES (?, ?, 'America/New_York', JSON_OBJECT(), TRUE)",
      [personIdByKey[person.key], person.platformRole],
    );
  }

  const meetingDefinitions = [
    { key: "leadership", name: "Pulse Test — Leadership L10", label: "level_10", enabled: ["segue", "headlines", "scorecard", "rocks", "todos", "issues", "cascading", "conclude"], members: ["owner", "ashleigh", "four"], day: "tuesday", time: "09:00" },
    { key: "marketing", name: "Pulse Test — Marketing L10", label: "level_10", enabled: ["segue", "headlines", "scorecard", "goals", "rocks", "todos", "issues", "cascading", "conclude"], members: ["owner", "four"], day: "wednesday", time: "13:00" },
    { key: "teamTyler", name: "Pulse Test — Team Tyler", label: "other", enabled: ["todos", "issues"], members: ["owner", "four"], day: "monday", time: "10:00" },
    { key: "goalsIssues", name: "Pulse Test — Goals & Issues", label: "other", enabled: ["goals", "issues"], members: ["owner", "four"], administrator: "four", day: "friday", time: "11:00" },
    { key: "oneOnOne", name: "Pulse Test — One-on-One", label: "one_on_one", enabled: ["segue", "todos", "issues"], members: ["owner", "superadmin"], day: "thursday", time: "14:00" },
  ] as const;

  const meetingIdByKey: Record<string, string> = {};
  for (const meeting of meetingDefinitions) {
    const meetingId = id();
    meetingIdByKey[meeting.key] = meetingId;
    const setup = sections([...meeting.enabled]);
    const administratorKey = "administrator" in meeting ? meeting.administrator : "owner";
    await connection.query(
      "INSERT INTO pulse_meetings (id, name, label, ownerId, administratorId, dayOfWeek, startTime, durationMinutes, cadence, timezone, sectionsEnabled, sectionOrder, sectionDurations, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, 90, 'weekly', 'America/New_York', ?, ?, ?, TRUE)",
      [meetingId, meeting.name, meeting.label, personIdByKey.owner, personIdByKey[administratorKey], meeting.day, meeting.time, JSON.stringify(setup.enabled), JSON.stringify(setup.order), JSON.stringify(setup.durations)],
    );
    for (const memberKey of meeting.members) {
      await connection.query(
        "INSERT INTO pulse_meeting_members (id, meetingId, personId, meetingRole, addedById) VALUES (?, ?, ?, ?, ?)",
        [id(), meetingId, personIdByKey[memberKey], memberKey === "owner" ? "owner" : memberKey === administratorKey ? "administrator" : "member", personIdByKey.owner],
      );
    }
    await connection.query(
      "INSERT INTO pulse_activity_log (id, entityType, entityId, personId, action, newValue) VALUES (?, 'meeting', ?, ?, 'seeded_for_foundation_verification', ?)",
      [id(), meetingId, personIdByKey.owner, JSON.stringify({ testSeed: true, key: meeting.key })],
    );
  }

  await connection.commit();
  await fs.writeFile("/tmp/pulse-foundation-test-credentials.json", JSON.stringify({
    password: verificationPassword,
    emails: Object.fromEntries(people.map((person) => [person.key, `${prefix}${person.key}@savvy.test`])),
  }), "utf8");
  console.log(JSON.stringify({
    seeded: true,
    clearlyMarkedPrefix: "Pulse Test — ",
    userIds: personIdByKey,
    meetingIds: meetingIdByKey,
    scenarios: {
      singleMeetingMember: "ashleigh",
      fourMeetingMember: "four",
      superAdminExcludedFromMarketing: "superadmin",
    },
  }, null, 2));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
