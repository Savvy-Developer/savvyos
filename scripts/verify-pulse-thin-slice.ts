import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { getDb } from "../server/db";
import { resetPulseThinSliceFixture, retirePulseThinSliceFixture } from "../server/pulse/thinSlice";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const appId = process.env.VITE_APP_ID;
const baseUrl = process.env.PULSE_VERIFICATION_URL ?? "http://localhost:3003";
if (!databaseUrl || !jwtSecret || !appId) throw new Error("DATABASE_URL, JWT_SECRET, and VITE_APP_ID are required.");

const reportPath = "/home/ubuntu/savvyos/docs/pulse_thin_slice_gap_closure_verification.json";
const db = await mysql.createConnection({ uri: databaseUrl });
const fixturePrefix = "pulse_slice_fixture_%";
const meetingMarker = "Pulse Slice — %";

async function tokenFor(person: any) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ openId: person.openId, appId, name: person.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now).setExpirationTime(now + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}

async function call(person: any, procedure: string, input?: unknown, type: "query" | "mutation" = "query") {
  const token = await tokenFor(person);
  const url = new URL(`${baseUrl}/api/trpc/${procedure}`);
  const options: RequestInit = { headers: { cookie: `app_session_id=${token}` } };
  if (type === "query") url.searchParams.set("input", JSON.stringify({ json: input ?? null }));
  else {
    options.method = "POST";
    options.headers = { ...options.headers, "content-type": "application/json" };
    options.body = JSON.stringify({ json: input ?? null });
  }
  const response = await fetch(url, options);
  const body = await response.json();
  return { status: response.status, body, value: body?.result?.data?.json, error: body?.error?.json ?? body?.error };
}

function person(snapshot: any, key: string) { return snapshot.persons.find((entry: any) => entry.key === key); }
function titles(entry: any) { return entry.workItems.map((item: any) => item.title); }
function visiblePayload(entry: any, meetingId: string) { return entry.meetingPayloads.find((payload: any) => payload.meetingId === meetingId && payload.visible); }
function stable(value: unknown) { return JSON.stringify(value); }
function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort().filter((key) => stable(before[key]) !== stable(after[key]));
}

try {
  const drizzle = await getDb();
  if (!drizzle) throw new Error("Database unavailable.");
  await resetPulseThinSliceFixture(drizzle);

  const [peopleRows] = await db.query<any[]>("SELECT id, openId, name FROM users WHERE openId LIKE ? ORDER BY openId", [fixturePrefix]);
  const peopleByKey = Object.fromEntries(peopleRows.map((row) => [row.openId.replace("pulse_slice_fixture_", "").toUpperCase(), row]));
  const p1User = peopleByKey.P1;
  const p2User = peopleByKey.P2;
  const p3User = peopleByKey.P3;
  const p4User = peopleByKey.P4;
  if (!p1User || !p2User || !p3User || !p4User) throw new Error("Thin-slice fixture users were not created.");

  const initialResponse = await call(p4User, "pulse.thinSlice.snapshot");
  const initial = initialResponse.value;
  if (!initial) throw new Error(`Unable to load thin-slice snapshot: ${JSON.stringify(initialResponse.error)}`);
  const p1 = person(initial, "P1");
  const p2 = person(initial, "P2");
  const p3 = person(initial, "P3");
  const p4 = person(initial, "P4");
  const meetingA = initial.fixture.meetings.A;
  const meetingB = initial.fixture.meetings.B;
  const meetingC = initial.fixture.meetings.C;

  const missingResponse = await call(p1User, "pulse.get", { meetingId: "00000000-0000-0000-0000-000000000000" });
  const deniedResponse = await call(p4User, "pulse.get", { meetingId: meetingA.id });

  const moved = await call(p4User, "pulse.thinSlice.perform", { operation: "move_c_todo_to_a" }, "mutation");
  const afterMove = moved.value?.after;
  const addP3 = await call(p4User, "pulse.thinSlice.perform", { operation: "add_p3_to_b" }, "mutation");
  const afterAddP3 = addP3.value?.after;
  const removeP3 = await call(p4User, "pulse.thinSlice.perform", { operation: "remove_p3_from_c" }, "mutation");
  const afterRemoveP3 = removeP3.value?.after;
  const relabel = await call(p4User, "pulse.thinSlice.perform", { operation: "change_a_label" }, "mutation");
  const afterRelabel = relabel.value?.after;
  const disableIssues = await call(p4User, "pulse.thinSlice.perform", { operation: "disable_a_issues" }, "mutation");
  const afterDisableIssues = disableIssues.value?.after;

  const beforeMeetingRecord = relabel.value?.before?.fixture?.meetings?.A?.record;
  const afterMeetingRecord = afterRelabel?.fixture?.meetings?.A?.record;
  const beforeP1Payload = visiblePayload(person(relabel.value?.before, "P1"), meetingA.id)?.payload;
  const afterP1Payload = visiblePayload(person(afterRelabel, "P1"), meetingA.id)?.payload;
  const recordChangedKeys = beforeMeetingRecord && afterMeetingRecord ? changedKeys(beforeMeetingRecord, afterMeetingRecord) : [];
  const payloadChangedKeys = beforeP1Payload && afterP1Payload ? changedKeys(beforeP1Payload, afterP1Payload) : [];

  const [moves] = await db.query<any[]>("SELECT workItemId, fromMeetingId, toMeetingId, deletedAt FROM pulse_work_item_moves WHERE reason = 'Thin-slice verification'");
  const [auditBeforeRows] = await db.query<any[]>("SELECT COUNT(*) AS count FROM activity_log WHERE userId IN (SELECT id FROM users WHERE openId LIKE ?)", [fixturePrefix]);
  const auditCountBeforeRetire = Number(auditBeforeRows[0]?.count ?? 0);
  const retireResult = await retirePulseThinSliceFixture(drizzle);
  const [auditAfterRows] = await db.query<any[]>("SELECT COUNT(*) AS count FROM activity_log WHERE userId IN (SELECT id FROM users WHERE openId LIKE ?)", [fixturePrefix]);
  const auditCountAfterRetire = Number(auditAfterRows[0]?.count ?? 0);
  const [liveFixtureRows] = await db.query<any[]>("SELECT (SELECT COUNT(*) FROM pulse_meetings WHERE name LIKE ? AND deletedAt IS NULL) AS activeMeetings, (SELECT COUNT(*) FROM pulse_work_items WHERE title LIKE 'Pulse Slice %' AND deletedAt IS NULL) AS activeWorkItems, (SELECT COUNT(*) FROM users WHERE openId LIKE ? AND isActive = true) AS activeUsers", [meetingMarker, fixturePrefix]);

  const p1PayloadKeys = p1.meetingPayloads.filter((entry: any) => entry.visible).map((entry: any) => ({ meetingId: entry.meetingId, keys: entry.topLevelKeys }));
  const p2PayloadKeys = p2.meetingPayloads.filter((entry: any) => entry.visible).map((entry: any) => ({ meetingId: entry.meetingId, keys: entry.topLevelKeys }));
  const p3PayloadKeys = p3.meetingPayloads.filter((entry: any) => entry.visible).map((entry: any) => ({ meetingId: entry.meetingId, keys: entry.topLevelKeys }));
  const prohibitedKeys = ["run", "configuration", "archive", "effectiveness"];
  const payloadKeysSafe = [p1PayloadKeys, p2PayloadKeys, p3PayloadKeys].flat().every((entry) => prohibitedKeys.every((key) => !entry.keys.includes(key)));
  const initialP2Ids = p2.workItems.map((item: any) => item.id);
  const p3AfterMove = person(afterMove, "P3");
  const p1AfterMove = person(afterMove, "P1");
  const p3AfterAdd = person(afterAddP3, "P3");
  const p3AfterRemove = person(afterRemoveP3, "P3");
  const p2AfterRemove = person(afterRemoveP3, "P2");
  const issuesSection = afterDisableIssues.sectionProof.find((row: any) => row.section === "issues");

  const report = {
    generatedAt: new Date().toISOString(),
    fixture: { A: meetingA.id, B: meetingB.id, C: meetingC.id },
    acceptance: {
      fixtureCleanupIsScopedAndAppendOnly: {
        pass: auditCountBeforeRetire === auditCountAfterRetire && liveFixtureRows[0].activeMeetings === 0 && liveFixtureRows[0].activeWorkItems === 0 && liveFixtureRows[0].activeUsers === 0,
        implementation: "retireFixture contains no delete call; it uses marker-scoped updates only.",
        retireResult, auditCountBeforeRetire, auditCountAfterRetire, retiredViewCounts: liveFixtureRows[0],
      },
      p1Navigation: { pass: stable(p1.navDestinations.map((item: any) => item.label)) === stable(["Home", "My Inputs", meetingA.name]), labels: p1.navDestinations.map((item: any) => item.label), evidence: p1.navEvidence },
      p4ZeroMeetingNavigation: { pass: stable(p4.navDestinations.map((item: any) => item.label)) === stable(["Home", "My Inputs", "Meetings", "Settings"]) && p4.visibleMeetingIds.length === 0 && p4.workItems.length === 0, labels: p4.navDestinations.map((item: any) => item.label), evidence: p4.navEvidence, workItemCount: p4.workItems.length },
      p2SettingsFromManagement: { pass: p2.navEvidence.ownsOrAdministers === true && p2.navEvidence.settingsReason === "meeting_manager" && p2.navDestinations.some((item: any) => item.label === "Settings"), evidence: p2.navEvidence, labels: p2.navDestinations.map((item: any) => item.label) },
      memberPayloadKeyLists: { pass: payloadKeysSafe, prohibitedKeys, P1: p1PayloadKeys, P2: p2PayloadKeys, P3: p3PayloadKeys },
      relabelOnly: { pass: recordChangedKeys.every((key) => key === "label" || key === "updatedAt") && stable(payloadChangedKeys) === stable(["label"]), allowedMechanicalKey: "updatedAt", meetingRecordChangedKeys: recordChangedKeys, beforeMeetingRecord, afterMeetingRecord, memberPayloadChangedKeys: payloadChangedKeys, beforeMemberPayload: beforeP1Payload, afterMemberPayload: afterP1Payload },
      sectionPayloadsAndDeepEquality: { pass: initial.sectionProof.every((row: any) => row.deepEqual && row.dashboard?.section === row.section && row.runner?.section === row.section && row.dashboard?.data !== null), rows: initial.sectionProof },
      missingAndDeniedAreByteIdentical: { pass: missingResponse.status === deniedResponse.status && stable(missingResponse.body) === stable(deniedResponse.body), missing: { status: missingResponse.status, body: missingResponse.body }, denied: { status: deniedResponse.status, body: deniedResponse.body } },
      originalModelProof: {
        pass: p1.visibleMeetingIds.length === 1 && p1.workItems.length === 3 && p2.workItems.length === 11 && new Set(initialP2Ids).size === initialP2Ids.length && !titles(p3AfterMove).includes("Pulse Slice C todo") && titles(p1AfterMove).includes("Pulse Slice C todo") && p3AfterAdd.visibleMeetingIds.includes(meetingB.id) && !p3AfterRemove.visibleMeetingIds.includes(meetingC.id) && p2AfterRemove.visibleMeetingIds.includes(meetingC.id) && issuesSection?.dashboard?.enabled === false && issuesSection?.runner?.enabled === false,
        moveRows: moves,
      },
    },
  };
  const passed = Object.values(report.acceptance).every((entry: any) => entry.pass === true);
  await fs.writeFile(reportPath, `${JSON.stringify({ passed, ...report }, null, 2)}\n`);
  console.log(JSON.stringify({ passed, reportPath, acceptance: report.acceptance }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await db.end();
}

// Drizzle keeps its shared pool open after this standalone verification command.
// Exit only after the report and connection cleanup above have completed.
process.exit(process.exitCode ?? 0);
