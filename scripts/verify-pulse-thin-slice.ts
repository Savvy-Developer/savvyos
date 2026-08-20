import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { getDb } from "../server/db";
import { resetPulseThinSliceFixture } from "../server/pulse/thinSlice";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const appId = process.env.VITE_APP_ID;
const baseUrl = process.env.PULSE_VERIFICATION_URL ?? "http://localhost:3003";
if (!databaseUrl || !jwtSecret || !appId) throw new Error("DATABASE_URL, JWT_SECRET, and VITE_APP_ID are required.");
const reportPath = "/home/ubuntu/savvyos/docs/pulse_thin_slice_verification.json";
const db = await mysql.createConnection({ uri: databaseUrl });

async function tokenFor(person: any) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ openId: person.openId, appId, name: person.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now).setExpirationTime(now + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}
async function call(person: any, procedure: string, input?: unknown) {
  const token = await tokenFor(person);
  const url = new URL(`${baseUrl}/api/trpc/${procedure}`);
  const options: RequestInit = { headers: { cookie: `app_session_id=${token}` } };
  if (input === undefined) {
    url.searchParams.set("input", JSON.stringify({ json: null }));
  } else {
    options.method = "POST";
    options.headers = { ...options.headers, "content-type": "application/json" };
    options.body = JSON.stringify({ json: input });
  }
  const response = await fetch(url, options);
  const body = await response.json();
  return { status: response.status, body, value: body?.result?.data?.json, error: body?.error?.json ?? body?.error };
}
function person(snapshot: any, key: string) { return snapshot.persons.find((entry: any) => entry.key === key); }
function titles(entry: any) { return entry.workItems.map((item: any) => item.title); }
function allSourcesNamed(snapshot: any) { return snapshot.persons.every((entry: any) => entry.workItems.every((item: any) => typeof item.resolvedMeetingName === "string" && item.resolvedMeetingName.length > 0 && item.resolvedMeetingName !== "General")); }
function keysAbsent(snapshot: any) { return snapshot.persons.every((entry: any) => entry.meetingPayloads.filter((meeting: any) => meeting.visible).every((meeting: any) => Object.values(meeting.sensitiveKeysPresent).every((present) => present === false))); }

try {
  const drizzle = await getDb();
  if (!drizzle) throw new Error("Database unavailable.");
  await resetPulseThinSliceFixture(drizzle);
  const [p4Rows] = await db.query<any[]>("SELECT id, openId, name FROM users WHERE openId = 'pulse_slice_fixture_p4' LIMIT 1");
  const p4 = p4Rows[0];
  if (!p4) throw new Error("Thin-slice P4 fixture user was not created.");

  const reset = await call(p4, "pulse.thinSlice.reset", {});
  const initial = reset.value;
  const p1 = person(initial, "P1"); const p2 = person(initial, "P2"); const p3 = person(initial, "P3"); const p4Snapshot = person(initial, "P4");
  const initialMeetingA = initial.fixture.meetings.A;
  const initialMeetingB = initial.fixture.meetings.B;
  const initialMeetingC = initial.fixture.meetings.C;

  const moved = await call(p4, "pulse.thinSlice.perform", { operation: "move_c_todo_to_a" });
  const afterMove = moved.value?.after;
  const addP3 = await call(p4, "pulse.thinSlice.perform", { operation: "add_p3_to_b" });
  const afterAddP3 = addP3.value?.after;
  const removeP3 = await call(p4, "pulse.thinSlice.perform", { operation: "remove_p3_from_c" });
  const afterRemoveP3 = removeP3.value?.after;
  const relabel = await call(p4, "pulse.thinSlice.perform", { operation: "change_a_label" });
  const afterRelabel = relabel.value?.after;
  const disableIssues = await call(p4, "pulse.thinSlice.perform", { operation: "disable_a_issues" });
  const afterDisableIssues = disableIssues.value?.after;

  const [moves] = await db.query<any[]>("SELECT workItemId, fromMeetingId, toMeetingId FROM pulse_work_item_moves WHERE reason = 'Thin-slice verification' AND deletedAt IS NULL");
  const initialP2Ids = p2.workItems.map((item: any) => item.id);
  const initialP2Unique = new Set(initialP2Ids).size === initialP2Ids.length;
  const p1InitialTitles = titles(p1); const p2InitialTitles = titles(p2); const p3InitialTitles = titles(p3);
  const p3AfterMove = person(afterMove, "P3"); const p1AfterMove = person(afterMove, "P1");
  const p3AfterAdd = person(afterAddP3, "P3"); const p3AfterRemove = person(afterRemoveP3, "P3"); const p2AfterRemove = person(afterRemoveP3, "P2");
  const relabelAOnly = afterRelabel.fixture.meetings.A.label === "other" && afterRelabel.fixture.meetings.B.label === initialMeetingB.label && afterRelabel.fixture.meetings.C.label === initialMeetingC.label && person(afterRelabel, "P1").workItems.map((item: any) => item.id).sort().join(",") === p1AfterMove.workItems.map((item: any) => item.id).sort().join(",");
  const issuesSection = afterDisableIssues.sectionProof.find((row: any) => row.section === "issues");
  const issueStillStored = person(afterDisableIssues, "P2").workItems.some((item: any) => item.title === "Pulse Slice A issue");
  const report = {
    generatedAt: new Date().toISOString(),
    resetStatus: reset.status,
    fixture: { A: initialMeetingA.id, B: initialMeetingB.id, C: initialMeetingC.id },
    acceptance: {
      p4NoAccess: { pass: p4Snapshot.visibleMeetingIds.length === 0 && p4Snapshot.workItems.length === 0, visibleMeetingIds: p4Snapshot.visibleMeetingIds, workItemCount: p4Snapshot.workItems.length },
      p1OnlyAIncludingSearch: { pass: p1.visibleMeetingIds.length === 1 && p1.visibleMeetingIds[0] === initialMeetingA.id && p1.workItems.length === 3 && p1.workItems.every((item: any) => item.meetingId === initialMeetingA.id) && p1.searchItemIds.length === 3 && p1InitialTitles.every((title: string) => title.includes("Slice A")), titles: p1InitialTitles, searchItemIds: p1.searchItemIds },
      p2AggregateAndPersonal: { pass: p2.workItems.length === 11 && initialP2Unique && [initialMeetingA.id, initialMeetingB.id, initialMeetingC.id].every((id) => p2.visibleMeetingIds.includes(id)) && p2InitialTitles.includes("Pulse Slice P2 personal todo") && p2InitialTitles.includes("Pulse Slice P2 personal rock"), workItemCount: p2.workItems.length, uniqueIds: initialP2Unique, titles: p2InitialTitles },
      navCounts: { pass: p3.navDestinations.length === 3 && p2.navDestinations.length === 5, p3: p3.navDestinations.map((item: any) => item.label), p2: p2.navDestinations.map((item: any) => item.label) },
      namedSources: { pass: allSourcesNamed(initial), sources: initial.persons.flatMap((entry: any) => entry.workItems.map((item: any) => item.resolvedMeetingName)) },
      memberPayloadKeysAbsent: { pass: keysAbsent(initial) },
      sharedSectionQueries: { pass: initial.sectionProof.every((row: any) => row.sameFunction && row.dashboardFunction === row.runnerFunction && row.queryFunction === "getVisibleSectionData"), rows: initial.sectionProof },
      missingMeetingNoFallback: { pass: initial.missingMeetingError.visible === false && String(initial.missingMeetingError.error).includes("no longer exists"), error: initial.missingMeetingError.error },
      p4DirectReadDenied: { pass: initial.p4DirectDenial.visible === false && String(initial.p4DirectDenial.error).includes("no longer exists"), error: initial.p4DirectDenial.error },
      moveCToA: { pass: !titles(p3AfterMove).includes("Pulse Slice C todo") && titles(p1AfterMove).includes("Pulse Slice C todo") && moves.some((move) => move.fromMeetingId === initialMeetingC.id && move.toMeetingId === initialMeetingA.id), p3After: titles(p3AfterMove), p1After: titles(p1AfterMove), moveRows: moves },
      addP3ToB: { pass: p3AfterAdd.visibleMeetingIds.includes(initialMeetingB.id) && titles(p3AfterAdd).filter((title: string) => title.includes("Slice B")).length === 3, visibleMeetingIds: p3AfterAdd.visibleMeetingIds, titles: titles(p3AfterAdd) },
      removeP3FromC: { pass: !p3AfterRemove.visibleMeetingIds.includes(initialMeetingC.id) && !p3AfterRemove.workItems.some((item: any) => item.meetingId === initialMeetingC.id) && p2AfterRemove.visibleMeetingIds.includes(initialMeetingC.id) && p2AfterRemove.workItems.filter((item: any) => item.meetingId === initialMeetingC.id).length === 2, p3After: titles(p3AfterRemove), p2After: titles(p2AfterRemove) },
      relabelOnly: { pass: relabelAOnly, labels: Object.fromEntries(Object.entries(afterRelabel.fixture.meetings).map(([key, meeting]: any) => [key, meeting.label])) },
      disabledIssuesRemainStored: { pass: issuesSection?.dashboardEnabled === false && issuesSection?.runnerEnabled === false && issueStillStored, section: issuesSection, issueStillStored },
    },
  };
  const passed = Object.values(report.acceptance).every((entry: any) => entry.pass === true);
  await fs.writeFile(reportPath, `${JSON.stringify({ passed, ...report }, null, 2)}\n`);
  console.log(JSON.stringify({ passed, reportPath, acceptance: report.acceptance }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await db.end();
}
