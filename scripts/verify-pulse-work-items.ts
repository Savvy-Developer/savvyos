import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const appId = process.env.VITE_APP_ID;
const baseUrl = process.env.PULSE_VERIFICATION_URL ?? "http://localhost:3001";
if (!databaseUrl || !jwtSecret || !appId) throw new Error("DATABASE_URL, JWT_SECRET, and VITE_APP_ID are required.");

const prefix = "pulse_foundation_seed_";
const reportPath = "/home/ubuntu/savvyos/docs/pulse_work_items_verification.json";
const db = await mysql.createConnection({ uri: databaseUrl });
const nowSeconds = Math.floor(Date.now() / 1000);

async function user(key: string) {
  const [rows] = await db.query<any[]>("SELECT id, openId, name, email FROM users WHERE openId = ?", [`${prefix}${key}`]);
  if (!rows[0]) throw new Error(`Missing seed user ${key}`);
  return rows[0];
}
async function meeting(name: string) {
  const [rows] = await db.query<any[]>("SELECT id, name FROM pulse_meetings WHERE name = ?", [name]);
  if (!rows[0]) throw new Error(`Missing seed meeting ${name}`);
  return rows[0];
}
async function tokenFor(person: any) {
  return new SignJWT({ openId: person.openId, appId, name: person.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSeconds).setExpirationTime(nowSeconds + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}
async function call(person: any, procedure: string, input?: unknown, method: "GET" | "POST" = "POST") {
  const token = await tokenFor(person);
  const url = new URL(`${baseUrl}/api/trpc/${procedure}`);
  const options: RequestInit = { headers: { cookie: `app_session_id=${token}` } };
  if (method === "GET") {
    if (input !== undefined) url.searchParams.set("input", JSON.stringify({ json: input }));
  } else {
    options.method = "POST";
    options.headers = { ...options.headers, "content-type": "application/json" };
    options.body = JSON.stringify({ json: input });
  }
  const response = await fetch(url, options);
  return { status: response.status, body: await response.json() };
}
function resultOf(response: any) { return response.body?.result?.data?.json; }
function errorOf(response: any) { return response.body?.error?.json ?? response.body?.error; }

try {
  const owner = await user("owner");
  const four = await user("four");
  const ashleigh = await user("ashleigh");
  const leadership = await meeting("Pulse Test — Leadership L10");
  const marketing = await meeting("Pulse Test — Marketing L10");
  const carryModule = await import("../server/pulse/automation.ts");
  const teamTyler = await meeting("Pulse Test — Team Tyler");

  const todoCreate = await call(four, "pulse.workItems.create", { type: "todo", title: "Pulse verification to-do", meetingId: leadership.id, ownerPersonId: null, assigneeId: four.id, dueDate: "2026-08-01" });
  const todoId = resultOf(todoCreate)?.id;
  const issueCreate = await call(four, "pulse.workItems.create", { type: "issue", title: "Pulse verification issue", meetingId: marketing.id, ownerPersonId: null, assigneeId: four.id });
  const issueId = resultOf(issueCreate)?.id;
  const rockCreate = await call(four, "pulse.workItems.create", { type: "rock", title: "Pulse verification rock", meetingId: leadership.id, ownerPersonId: null, assigneeId: four.id, quarter: "Q3 2026", percentComplete: 20 });
  const rockId = resultOf(rockCreate)?.id;
  if (!todoId || !issueId || !rockId) throw new Error("Could not create all verification work items.");

  const issueNoDecision = await call(four, "pulse.workItems.setIssueStatus", { workItemId: issueId, status: "solved" });
  const issueSolved = await call(four, "pulse.workItems.setIssueStatus", { workItemId: issueId, status: "solved", solvedNote: "We will publish the work-item foundation.", createTodo: { title: "Publish the work-item foundation" } });
  const rockRisk = await call(four, "pulse.workItems.setRockStatus", { workItemId: rockId, status: "off_track", note: "The test milestone list is not ready." });

  const milestoneIds: string[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const response = await call(four, "pulse.workItems.addMilestone", { workItemId: rockId, title: `Milestone ${index}`, dueDate: "2026-08-28" });
    milestoneIds.push(resultOf(response)?.id);
  }
  await call(four, "pulse.workItems.setMilestoneComplete", { milestoneId: milestoneIds[0], isComplete: true });
  await call(four, "pulse.workItems.setMilestoneComplete", { milestoneId: milestoneIds[1], isComplete: true });
  const rockDetailBeforeMove = await call(four, "pulse.workItems.detail", { workItemId: rockId }, "GET");
  const moved = await call(four, "pulse.workItems.move", { workItemId: rockId, toMeetingId: teamTyler.id, toOwnerPersonId: null, reason: "Move-history verification" });
  const rockDetailAfterMove = await call(four, "pulse.workItems.detail", { workItemId: rockId }, "GET");
  const rockDone = await call(four, "pulse.workItems.setRockStatus", { workItemId: rockId, status: "done", note: null });
  const [rockDoneNotifications] = await db.query<any[]>("SELECT recipientId FROM pulse_work_item_notifications WHERE workItemId = ? AND notificationType = 'rock_done' AND deletedAt IS NULL", [rockId]);

  const rolloverCreate = await call(four, "pulse.workItems.create", { type: "rock", title: "Pulse rollover verification rock", meetingId: marketing.id, ownerPersonId: null, assigneeId: four.id, quarter: "Q2 2026" });
  const rolloverRockId = resultOf(rolloverCreate)?.id;
  await carryModule.createPulseQuarterRolloverPrompts({ workItemIds: [rolloverRockId] });
  const rolloverDetail = await call(four, "pulse.workItems.detail", { workItemId: rolloverRockId }, "GET");
  const rolloverResolved = await call(four, "pulse.workItems.resolveQuarterRollover", { workItemId: rolloverRockId, action: "carry", nextQuarter: "Q3 2026" });
  const rolloverAfter = await call(four, "pulse.workItems.detail", { workItemId: rolloverRockId }, "GET");

  const invalidMention = await call(four, "pulse.workItems.addComment", { workItemId: issueId, body: "Please take a look", mentionedPersonIds: [ashleigh.id] });
  const validComment = await call(four, "pulse.workItems.addComment", { workItemId: todoId, body: "Please take a look", mentionedPersonIds: [owner.id] });

  await carryModule.recordPulseMeetingCarryOver(leadership.id, owner.id);
  const todoDetail = await call(four, "pulse.workItems.detail", { workItemId: todoId }, "GET");
  const list = await call(four, "pulse.workItems.list", { meetingId: leadership.id, type: "todo", assigneeId: four.id, status: "open" }, "GET");

  const issueError = errorOf(issueNoDecision);
  const invalidMentionError = errorOf(invalidMention);
  const issueSuccess = resultOf(issueSolved);
  const before = resultOf(rockDetailBeforeMove);
  const after = resultOf(rockDetailAfterMove);
  const todo = resultOf(todoDetail);
  const report = {
    generatedAt: new Date().toISOString(),
    unifiedWorkItems: {
      pass: todoCreate.status === 200 && issueCreate.status === 200 && rockCreate.status === 200,
      createdTypes: ["todo", "issue", "rock"],
    },
    solvedIssueRequiresDecision: {
      pass: !!issueError && String(issueError?.message).includes("What did we decide") && !!issueSuccess?.todoId,
      deniedMessage: issueError?.message,
      resultingTodoId: issueSuccess?.todoId,
      solvedStatus: issueSolved.status,
    },
    rockStatusHistory: {
      pass: rockRisk.status === 200 && before?.statusNotes?.some((note: any) => note.note === "The test milestone list is not ready." && note.toStatus === "off_track"),
      noteCount: before?.statusNotes?.length ?? 0,
    },
    milestoneProgress: {
      pass: before?.milestoneProgress?.completed === 2 && before?.milestoneProgress?.total === 5 && before?.milestoneProgress?.percent === 40 && before?.item?.percentSource === "from_milestones" && before?.item?.percentComplete === 40,
      progress: before?.milestoneProgress,
      source: before?.item?.percentSource,
    },
    moveHistory: {
      pass: moved.status === 200 && after?.moves?.some((move: any) => move.fromMeetingName === leadership.name && move.toMeetingName === teamTyler.name && move.reason === "Move-history verification"),
      move: after?.moves?.[0] ?? null,
    },
    rockCompletionAutomation: {
      pass: rockDone.status === 200 && rockDoneNotifications.length === 1 && rockDoneNotifications[0].recipientId === owner.id,
      notificationRecipientIds: rockDoneNotifications.map((notification) => notification.recipientId),
    },
    quarterRolloverAutomation: {
      pass: rolloverDetail.status === 200 && resultOf(rolloverDetail)?.quarterRolloverPending === true && rolloverResolved.status === 200 && resultOf(rolloverAfter)?.quarterRolloverPending === false && resultOf(rolloverAfter)?.item?.quarter === "Q3 2026" && resultOf(rolloverAfter)?.item?.status === "on_track",
      initialPromptPending: resultOf(rolloverDetail)?.quarterRolloverPending,
      finalQuarter: resultOf(rolloverAfter)?.item?.quarter,
      finalStatus: resultOf(rolloverAfter)?.item?.status,
    },
    mentionAccessGuard: {
      pass: invalidMention.status === 400 && String(invalidMentionError?.message).includes("isn't in Pulse Test — Marketing L10, so they can't see this item") && validComment.status === 200,
      deniedMessage: invalidMentionError?.message,
    },
    carryOver: {
      pass: todo?.item?.carriedOverCount === 1,
      count: todo?.item?.carriedOverCount,
    },
    filterableList: {
      pass: list.status === 200 && resultOf(list)?.every((item: any) => item.type === "todo" && item.meetingId === leadership.id && item.assigneeId === four.id && item.status === "open"),
      resultCount: resultOf(list)?.length ?? 0,
    },
  };
  const passed = Object.values(report).filter((value: any) => value?.pass !== undefined).every((value: any) => value.pass);
  await fs.writeFile(reportPath, `${JSON.stringify({ passed, ...report }, null, 2)}\n`);
  console.log(JSON.stringify({ passed, reportPath, report }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await db.end();
}
