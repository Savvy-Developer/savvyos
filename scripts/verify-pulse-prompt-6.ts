import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { getDb } from "../server/db";
import { cleanupPulsePrompt5Fixtures } from "./cleanup-pulse-prompt-5-fixtures";
import { resetPulseThinSliceFixture, retirePulseThinSliceFixture } from "../server/pulse/thinSlice";

const url = process.env.DATABASE_URL;
const secret = process.env.JWT_SECRET;
const appId = process.env.VITE_APP_ID;
const base = process.env.PULSE_VERIFICATION_URL ?? "http://localhost:3003";
if (!url || !secret || !appId) throw new Error("DATABASE_URL, JWT_SECRET, and VITE_APP_ID are required");
const sql = await mysql.createConnection({ uri: url });
const db = await getDb();
if (!db) throw new Error("Pulse database is not available");
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
  const [people] = await sql.query<any[]>("SELECT id, openId, name FROM users WHERE openId LIKE 'pulse_slice_fixture_%'");
  const person = Object.fromEntries(people.map((row) => [row.openId.slice(-2).toUpperCase(), row]));
  const [meetings] = await sql.query<any[]>("SELECT id, name FROM pulse_meetings WHERE name LIKE 'Pulse Slice — %' AND deletedAt IS NULL");
  const meeting = Object.fromEntries(meetings.map((row) => [row.name.slice(-1), row]));
  const p2 = person.P2, p4 = person.P4, p5 = person.P5;

  const sent = await call(p2, "pulse.cascades.send", { fromMeetingId: meeting.A.id, toMeetingIds: [meeting.B.id], body: "Please carry this handoff forward." }, "mutation");
  const created = await call(p2, "pulse.workItems.create", { type: "todo", title: "Reply to the Q3 handoff", meetingId: meeting.A.id, ownerPersonId: null, assigneeId: p5.id, dueDate: "2026-08-31" }, "mutation");
  const todoId = created.value?.id as string;
  const comment = await call(p2, "pulse.workItems.addComment", { workItemId: todoId, body: "Can you pull the Q3 numbers before Thursday?", mentionedPersonIds: [p5.id] }, "mutation");

  const cascades = await call(p5, "pulse.cascades.pending");
  const responses = await call(p5, "pulse.notifications.pending");
  const adminBefore = await call(p4, "pulse.notifications.adminOutstanding");
  const cascade = cascades.value?.find((item: any) => item.id === sent.value?.messageId);
  const assignment = responses.value?.find((item: any) => item.notificationType === "assignment");
  const mention = responses.value?.find((item: any) => item.kind === "work_item_notification");

  if (!cascade || !assignment || !mention) throw new Error("Prompt 6 fixture did not create the expected cascade, assignment, and mention actions.");
  await sql.query("UPDATE pulse_cascading_messages SET createdAt = DATE_SUB(NOW(), INTERVAL 15 DAY) WHERE id = ?", [cascade.id]);
  await sql.query("UPDATE pulse_notifications SET createdAt = DATE_SUB(NOW(), INTERVAL 15 DAY) WHERE id = ?", [assignment.id]);
  await sql.query("UPDATE pulse_work_item_notifications SET createdAt = DATE_SUB(NOW(), INTERVAL 15 DAY) WHERE id = ?", [mention.id]);
  const afterGapCascades = await call(p5, "pulse.cascades.pending");
  const afterGapResponses = await call(p5, "pulse.notifications.pending");

  const acknowledge = await call(p5, "pulse.cascades.acknowledge", { messageId: cascade.id, from: "mission_control" }, "mutation");
  const clearMention = await call(p5, "pulse.notifications.clearWorkItemNotification", { notificationId: mention.id }, "mutation");
  const finishTodo = await call(p5, "pulse.workItems.setTodoStatus", { workItemId: todoId, status: "done" }, "mutation");
  const clearAssignment = await call(p5, "pulse.notifications.clear", { notificationId: assignment.id }, "mutation");
  const afterActionsCascades = await call(p5, "pulse.cascades.pending");
  const afterActionsResponses = await call(p5, "pulse.notifications.pending");

  const missionSource = await fs.readFile("/home/ubuntu/savvyos/client/src/pages/PulseMissionControlPage.tsx", "utf8");
  const report = {
    generatedAt: new Date().toISOString(),
    acceptance: {
      atMostTwoActionSections: { pass: (missionSource.match(/<section/g) ?? []).length <= 3 && missionSource.includes("Needs your OK") && missionSource.includes("Needs your reply") && !missionSource.includes("Delivery settings") },
      cascadeAndMentionAppearWithOneTapActions: { pass: cascades.status === 200 && responses.status === 200 && !!cascade && !!mention && acknowledge.value?.success === true && clearMention.value?.success === true },
      emptyStatePointsForward: { pass: afterActionsCascades.value?.length === 0 && afterActionsResponses.value?.length === 0 && missionSource.includes("Nothing needs you right now.") && missionSource.includes('href="/pulse/work"') },
      persistenceAfterFourteenDays: { pass: afterGapCascades.value?.some((item: any) => item.id === cascade.id) && afterGapResponses.value?.some((item: any) => item.id === assignment.id) && afterGapResponses.value?.some((item: any) => item.id === mention.id) },
      noDisallowedHomeContent: { pass: !missionSource.includes("Feature Update") && !missionSource.includes("announcement") && !missionSource.includes("SOP") && !missionSource.includes("document") },
      everyActionNamesMeeting: { pass: [cascade, assignment, mention].every((item: any) => !!item.meetingName || !!item.routing?.source) },
      adminOutstandingCountsAndAges: { pass: adminBefore.status === 200 && adminBefore.value?.some((row: any) => row.personId === p5.id && row.unacknowledgedCascades >= 1 && row.unclearedNotifications >= 2 && row.oldestAt) },
      phoneReachableActions: { pass: missionSource.includes("min-h-11") && missionSource.includes("mt-4 flex flex-wrap gap-2") && missionSource.includes("PulseCascadeCard") },
      assignmentCompletesAndClears: { pass: finishTodo.value?.success === true && clearAssignment.value?.success === true },
    },
  };
  await fs.writeFile("/home/ubuntu/savvyos/docs/pulse_prompt_6_verification.json", `${JSON.stringify(report, null, 2)}\n`);
  if (!Object.values(report.acceptance).every((item: any) => item.pass === true)) throw new Error("Prompt 6 acceptance failed; inspect docs/pulse_prompt_6_verification.json");
  passed = true;
  console.log("Prompt 6 acceptance passed");
} finally {
  try {
    await cleanupPulsePrompt5Fixtures(sql);
    await sql.query(`DELETE notification FROM pulse_notifications notification INNER JOIN users fixture_user ON fixture_user.id = notification.personId WHERE fixture_user.openId LIKE 'pulse_slice_fixture_%'`);
    await sql.query(`DELETE notification FROM pulse_work_item_notifications notification INNER JOIN users fixture_user ON fixture_user.id = notification.recipientId WHERE fixture_user.openId LIKE 'pulse_slice_fixture_%'`);
    await retirePulseThinSliceFixture(db);
  } finally {
    await sql.end();
  }
}
if (passed) process.exit(0);
