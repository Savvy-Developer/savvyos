import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { getDb } from "../server/db";
import { resetPulseThinSliceFixture, retirePulseThinSliceFixture } from "../server/pulse/thinSlice";

const url = process.env.DATABASE_URL;
const secret = process.env.JWT_SECRET;
const appId = process.env.VITE_APP_ID;
const base = process.env.PULSE_VERIFICATION_URL ?? "http://localhost:3003";
if (!url || !secret || !appId) throw new Error("DATABASE_URL, JWT_SECRET, and VITE_APP_ID are required");

const sql = await mysql.createConnection({ uri: url });
const db = await getDb();
if (!db) throw new Error("Database unavailable");
const marker = "Pulse Prompt 9 Fixture";
let createdMeetingId: string | null = null;
let passed = false;

async function token(person: any) {
  return new SignJWT({ openId: person.openId, appId, name: person.name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode(secret));
}

async function call(person: any, procedure: string, input?: unknown, type: "query" | "mutation" = "query") {
  const endpoint = new URL(`${base}/api/trpc/${procedure}`);
  const headers: Record<string, string> = { cookie: `app_session_id=${await token(person)}` };
  const options: RequestInit = { headers };
  if (type === "query") endpoint.searchParams.set("input", JSON.stringify({ json: input ?? null }));
  else { options.method = "POST"; headers["content-type"] = "application/json"; options.body = JSON.stringify({ json: input ?? null }); }
  const response = await fetch(endpoint, options);
  const raw = await response.json();
  return { status: response.status, value: raw?.result?.data?.json, message: raw?.error?.json?.message ?? "" };
}

try {
  await resetPulseThinSliceFixture(db);
  const [people] = await sql.query<any[]>("SELECT id, openId, name, email FROM users WHERE openId LIKE 'pulse_slice_fixture_%'");
  const person = Object.fromEntries(people.map((row) => [row.openId.slice(-2).toUpperCase(), row]));
  const [meetings] = await sql.query<any[]>("SELECT id, name FROM pulse_meetings WHERE name LIKE 'Pulse Slice — %' AND deletedAt IS NULL");
  const meeting = Object.fromEntries(meetings.map((row) => [row.name.slice(-1), row]));
  const member = person.P1;
  const owner = person.P2;
  const candidate = person.P3;
  const superAdmin = person.P4;
  const administrator = person.P5;
  if (!member || !owner || !candidate || !superAdmin || !administrator || !meeting.A) throw new Error("Prompt 9 fixture identities are incomplete.");

  const memberShell = await call(member, "pulse.shell");
  const deniedSettings = await call(member, "pulse.settings.configuration", { meetingId: meeting.A.id });
  const deniedEffectiveness = await call(member, "pulse.settings.effectiveness");
  const createStarted = performance.now();
  const created = await call(superAdmin, "pulse.settings.createMeeting", { name: marker, label: "level_10", ownerId: owner.id, administratorId: administrator.id, memberIds: [member.id] }, "mutation");
  const createElapsedMs = performance.now() - createStarted;
  createdMeetingId = created.value?.id ?? null;
  if (!createdMeetingId) throw new Error(`Meeting creation failed: ${created.message}`);

  const beforeVisible = await call(candidate, "pulse.visibleMeetingIds");
  const permissionBefore = await call(superAdmin, "pulse.settings.permissioning");
  const columnAppears = (permissionBefore.value?.meetings ?? []).some((row: any) => row.id === createdMeetingId);
  const granted = await call(superAdmin, "pulse.settings.setPermission", { meetingId: createdMeetingId, personId: candidate.id, hasAccess: true }, "mutation");
  const afterVisible = await call(candidate, "pulse.visibleMeetingIds");
  const [activityRows] = await sql.query<any[]>("SELECT id FROM activity_log WHERE userId = ? AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.path')) = 'pulse.settings.setPermission' ORDER BY id DESC LIMIT 1", [superAdmin.id]);
  const removed = await call(superAdmin, "pulse.settings.setPermission", { meetingId: createdMeetingId, personId: candidate.id, hasAccess: false }, "mutation");
  const restored = await call(superAdmin, "pulse.settings.restoreMemberAccess", { meetingId: createdMeetingId, personId: candidate.id }, "mutation");
  const afterRestore = await call(candidate, "pulse.visibleMeetingIds");

  const beforeRoleVisibility = await call(candidate, "pulse.visibleMeetingIds");
  const roleChanged = await call(superAdmin, "pulse.settings.setPlatformRole", { personId: candidate.id, platformRole: "admin" }, "mutation");
  const afterRoleVisibility = await call(candidate, "pulse.visibleMeetingIds");

  const wrongDelete = await call(superAdmin, "pulse.settings.deleteMeeting", { meetingId: createdMeetingId, confirmation: "not the meeting name" }, "mutation");
  const correctDelete = await call(superAdmin, "pulse.settings.deleteMeeting", { meetingId: createdMeetingId, confirmation: marker }, "mutation");
  const [deletedRows] = await sql.query<any[]>("SELECT isActive, deletedAt FROM pulse_meetings WHERE id = ?", [createdMeetingId]);

  await sql.query("INSERT INTO pulse_meetings_archive (id, meetingId, occurredAt, durationActualMinutes, attendeeIds, todosCreated, todosCompleted, issuesCreated, issuesResolved, rating, notes) VALUES (UUID(), ?, DATE_SUB(NOW(), INTERVAL 14 DAY), 55, JSON_ARRAY(?), 5, 4, 2, 1, 8, ?), (UUID(), ?, DATE_SUB(NOW(), INTERVAL 7 DAY), 52, JSON_ARRAY(?, ?), 4, 4, 1, 1, 9, ?)", [meeting.A.id, owner.id, marker, meeting.A.id, owner.id, member.id, marker]);
  const effectivenessForMember = await call(member, "pulse.settings.effectiveness");
  const effectivenessForSuper = await call(superAdmin, "pulse.settings.effectiveness");
  const historyForSuper = await call(superAdmin, "pulse.settings.effectivenessHistory", { meetingId: meeting.A.id });

  const previewResults = await Promise.all(["meeting_reminder", "todo_assigned", "cascade_sent", "overdue_digest", "mention", "rock_completed", "welcome"].map((templateKey) => call(superAdmin, "pulse.notifications.templatePreview", { templateKey })));
  const notificationPage = await fs.readFile("/home/ubuntu/savvyos/client/src/pages/PulseNotificationPreferencesPage.tsx", "utf8");
  const emailService = await fs.readFile("/home/ubuntu/savvyos/server/_core/resendEmail.ts", "utf8");
  const settingsPage = await fs.readFile("/home/ubuntu/savvyos/client/src/pages/PulseMeetingSettingsPage.tsx", "utf8");
  const permissioningPage = await fs.readFile("/home/ubuntu/savvyos/client/src/pages/PulsePermissioningPage.tsx", "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    acceptance: {
      settingsAbsentAndDeniedForMember: { pass: memberShell.status === 200 && memberShell.value?.canSeeSettings === false && deniedSettings.status === 404 && deniedEffectiveness.status === 404 },
      createMeetingUnderSixtySeconds: { pass: created.status === 200 && createElapsedMs < 60_000, measuredMilliseconds: Math.round(createElapsedMs) },
      dynamicPermissioningColumn: { pass: columnAppears },
      permissionChangeImmediateAuditedAndUndoable: { pass: granted.status === 200 && !beforeVisible.value?.includes(createdMeetingId) && afterVisible.value?.includes(createdMeetingId) && activityRows.length === 1 && removed.status === 200 && restored.status === 200 && afterRestore.value?.includes(createdMeetingId) },
      platformRoleDoesNotGrantVisibility: { pass: roleChanged.status === 200 && JSON.stringify(beforeRoleVisibility.value) === JSON.stringify(afterRoleVisibility.value) },
      typedDeleteOnly: { pass: wrongDelete.status === 400 && correctDelete.status === 200 && deletedRows[0]?.isActive === 0 && deletedRows[0]?.deletedAt != null },
      sevenEmailTemplatesPreviewed: { pass: previewResults.every((result) => result.status === 200 && result.value?.subject && result.value?.html?.includes("Savvy STR Agents")) },
      realTestSendContract: { pass: notificationPage.includes("Send test to me") && notificationPage.includes("sendTemplateTest") && emailService.includes("bypassNotificationSetting") },
      independentDeliveryControls: { pass: notificationPage.includes("Right now: shows in Pulse, no email sent.") && notificationPage.includes("Right now: sends email, no Pulse item.") && notificationPage.includes("Show in Pulse") && notificationPage.includes("Send email") },
      superAdminOnlyEffectiveness: { pass: effectivenessForMember.status === 404 && effectivenessForSuper.status === 200 && effectivenessForSuper.value?.some((row: any) => row.meeting.id === meeting.A.id) && historyForSuper.status === 200 && historyForSuper.value?.occurrences?.length >= 2 },
      doctrineAccessibilityChecks: { pass: settingsPage.includes("min-h-11") && permissioningPage.includes("min-h-11") && permissioningPage.includes("sticky left-0") && notificationPage.includes("min-h-11") },
    },
  };
  await fs.writeFile("/home/ubuntu/savvyos/docs/pulse_prompt_9_verification.json", `${JSON.stringify(report, null, 2)}\n`);
  if (!Object.values(report.acceptance).every((value: any) => value.pass === true)) throw new Error("Prompt 9 acceptance failed; inspect docs/pulse_prompt_9_verification.json");
  passed = true;
  console.log("Prompt 9 acceptance passed");
} finally {
  if (createdMeetingId) await sql.query("DELETE FROM pulse_meetings WHERE id = ?", [createdMeetingId]);
  await sql.query("DELETE FROM pulse_meetings_archive WHERE notes = ?", [marker]);
  await retirePulseThinSliceFixture(db);
  await sql.end();
}
if (passed) process.exit(0);
