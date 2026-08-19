import crypto from "node:crypto";
import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
const appId = process.env.VITE_APP_ID;
const baseUrl = process.env.PULSE_VERIFICATION_URL ?? "http://localhost:3001";
if (!databaseUrl || !jwtSecret || !appId) throw new Error("DATABASE_URL, JWT_SECRET, and VITE_APP_ID are required.");

const prefix = "pulse_foundation_seed_";
const reportPath = "/home/ubuntu/savvyos/docs/pulse_foundation_api_verification.json";
const connection = await mysql.createConnection({ uri: databaseUrl });
const nowSeconds = Math.floor(Date.now() / 1000);

async function userFor(key: string) {
  const [rows] = await connection.query<any[]>("SELECT id, openId, name, email, role, personType, isActive FROM users WHERE openId = ?", [`${prefix}${key}`]);
  if (!rows[0]) throw new Error(`Missing foundation seed user: ${key}`);
  return rows[0];
}

async function meetingFor(name: string) {
  const [rows] = await connection.query<any[]>("SELECT id, name FROM pulse_meetings WHERE name = ?", [name]);
  if (!rows[0]) throw new Error(`Missing foundation seed meeting: ${name}`);
  return rows[0];
}

async function tokenFor(user: any) {
  return new SignJWT({ openId: user.openId, appId, name: user.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 600)
    .sign(new TextEncoder().encode(jwtSecret));
}

async function trpcGet(procedure: string, user: any, input?: unknown) {
  const token = await tokenFor(user);
  const url = new URL(`${baseUrl}/api/trpc/${procedure}`);
  if (input !== undefined) url.searchParams.set("input", JSON.stringify({ json: input }));
  const response = await fetch(url, { headers: { cookie: `app_session_id=${token}` } });
  const body = await response.json();
  return { status: response.status, body };
}

async function trpcMutation(procedure: string, user: any, input: unknown) {
  const token = await tokenFor(user);
  const response = await fetch(`${baseUrl}/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `app_session_id=${token}` },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

function dataOf(result: any) {
  return result.body?.result?.data?.json;
}

function errorOf(result: any) {
  return result.body?.error?.json ?? result.body?.error;
}

async function constraintFails(sql: string, parameters: unknown[]) {
  try {
    await connection.query(sql, parameters);
    return false;
  } catch {
    return true;
  }
}

try {
  const ashleigh = await userFor("ashleigh");
  const four = await userFor("four");
  const superAdmin = await userFor("superadmin");
  const owner = await userFor("owner");
  const leadership = await meetingFor("Pulse Test — Leadership L10");
  const marketing = await meetingFor("Pulse Test — Marketing L10");
  const teamTyler = await meetingFor("Pulse Test — Team Tyler");

  const [ashleighShell, fourShell, superAdminShell, ashleighMeeting, superAdminMarketing, unknownMeeting] = await Promise.all([
    trpcGet("pulse.shell", ashleigh),
    trpcGet("pulse.shell", four),
    trpcGet("pulse.shell", superAdmin),
    trpcGet("pulse.get", ashleigh, { meetingId: leadership.id }),
    trpcGet("pulse.get", superAdmin, { meetingId: marketing.id }),
    trpcGet("pulse.get", ashleigh, { meetingId: "00000000-0000-4000-8000-000000000000" }),
  ]);

  const singleShell = dataOf(ashleighShell);
  const aggregateShell = dataOf(fourShell);
  const superShell = dataOf(superAdminShell);
  const memberMeeting = dataOf(ashleighMeeting);
  const superMarketingError = errorOf(superAdminMarketing);
  const missingMeetingError = errorOf(unknownMeeting);

  const invalidBothId = crypto.randomUUID();
  const invalidNeitherId = crypto.randomUUID();
  const bothOwnershipFails = await constraintFails(
    "INSERT INTO pulse_work_items (id, type, title, meetingId, ownerPersonId, assigneeId, createdById, status) VALUES (?, 'todo', 'invalid both', ?, ?, ?, ?, 'open')",
    [invalidBothId, leadership.id, ashleigh.id, ashleigh.id, ashleigh.id],
  );
  const neitherOwnershipFails = await constraintFails(
    "INSERT INTO pulse_work_items (id, type, title, assigneeId, createdById, status) VALUES (?, 'todo', 'invalid neither', ?, ?, 'open')",
    [invalidNeitherId, ashleigh.id, ashleigh.id],
  );

  const movableWorkItemId = crypto.randomUUID();
  await connection.query(
    "INSERT INTO pulse_work_items (id, type, title, meetingId, assigneeId, createdById, status) VALUES (?, 'todo', 'Pulse verification move item', ?, ?, ?, 'open')",
    [movableWorkItemId, leadership.id, owner.id, owner.id],
  );
  const moveResponse = await trpcMutation("pulse.moveWorkItem", four, {
    workItemId: movableWorkItemId,
    toMeetingId: teamTyler.id,
    toOwnerPersonId: null,
    reason: "Foundation verification",
  });
  const [moveRows] = await connection.query<any[]>("SELECT workItemId, fromMeetingId, toMeetingId FROM pulse_work_item_moves WHERE workItemId = ?", [movableWorkItemId]);
  await connection.query("DELETE FROM pulse_work_item_moves WHERE workItemId = ?", [movableWorkItemId]);
  await connection.query("DELETE FROM pulse_work_items WHERE id = ?", [movableWorkItemId]);

  const report = {
    generatedAt: new Date().toISOString(),
    api: {
      singleMeetingNavigation: {
        pass: singleShell?.navMode === "single_meeting" && singleShell?.meetings?.length === 1,
        payload: { navMode: singleShell?.navMode, visibleMeetingNames: singleShell?.meetings?.map((meeting: any) => meeting.name) },
      },
      multiMeetingNavigation: {
        pass: aggregateShell?.navMode === "standard" && aggregateShell?.meetings?.length === 4 && aggregateShell?.canSeeSettings === true,
        payload: { navMode: aggregateShell?.navMode, canSeeSettings: aggregateShell?.canSeeSettings, navDestinationCount: aggregateShell?.canSeeSettings ? 5 : 4, visibleMeetingNames: aggregateShell?.meetings?.map((meeting: any) => meeting.name) },
      },
      superAdminDoesNotInheritMeetingVisibility: {
        pass: !superShell?.meetings?.some((meeting: any) => meeting.id === marketing.id) && superAdminMarketing.status === 404,
        visibleMeetingNames: superShell?.meetings?.map((meeting: any) => meeting.name),
        deniedStatus: superAdminMarketing.status,
        deniedMessage: superMarketingError?.message,
      },
      memberPayloadOmitsManagerOnlyFields: {
        pass: memberMeeting && !Object.hasOwn(memberMeeting, "management") && !Object.hasOwn(memberMeeting, "run") && !Object.hasOwn(memberMeeting, "archive") && !Object.hasOwn(memberMeeting, "effectiveness"),
        payloadKeys: memberMeeting ? Object.keys(memberMeeting) : [],
      },
      missingMeetingReturnsClearError: {
        pass: unknownMeeting.status === 404 && typeof missingMeetingError?.message === "string" && missingMeetingError.message.includes("This meeting no longer exists"),
        status: unknownMeeting.status,
        message: missingMeetingError?.message,
      },
    },
    database: {
      exactOneWorkItemOwnerConstraint: { pass: bothOwnershipFails && neitherOwnershipFails, bothOwnershipFails, neitherOwnershipFails },
      workItemMoveHistory: { pass: moveResponse.status === 200 && moveRows.length === 1 && moveRows[0].fromMeetingId === leadership.id && moveRows[0].toMeetingId === teamTyler.id, mutationStatus: moveResponse.status, row: moveRows[0] ?? null },
    },
  };

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const passed = Object.values(report.api).every((item: any) => item.pass) && Object.values(report.database).every((item: any) => item.pass);
  console.log(JSON.stringify({ passed, reportPath, report }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  await connection.end();
}
