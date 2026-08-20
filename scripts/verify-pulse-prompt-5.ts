import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { getEmailPreview } from "../server/_core/resendEmail";
import { getDb } from "../server/db";
import { resetPulseThinSliceFixture, retirePulseThinSliceFixture } from "../server/pulse/thinSlice";
import { cleanupPulsePrompt5Fixtures } from "./cleanup-pulse-prompt-5-fixtures";

const url = process.env.DATABASE_URL;
const secret = process.env.JWT_SECRET;
const appId = process.env.VITE_APP_ID;
const base = process.env.PULSE_VERIFICATION_URL ?? "http://localhost:3003";
if (!url || !secret || !appId) throw new Error("DATABASE_URL, JWT_SECRET, and VITE_APP_ID are required");

const sql = await mysql.createConnection({ uri: url });
const db = await getDb();
if (!db) throw new Error("Pulse database is not available");

async function sign(person: any) {
  return new SignJWT({ openId: person.openId, appId, name: person.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(new TextEncoder().encode(secret));
}

async function call(person: any, procedure: string, input?: unknown, type: "query" | "mutation" = "query") {
  const endpoint = new URL(`${base}/api/trpc/${procedure}`);
  const headers: Record<string, string> = { cookie: `app_session_id=${await sign(person)}` };
  const options: RequestInit = { headers };
  if (type === "query") endpoint.searchParams.set("input", JSON.stringify({ json: input ?? null }));
  else {
    options.method = "POST";
    headers["content-type"] = "application/json";
    options.body = JSON.stringify({ json: input ?? null });
  }
  const response = await fetch(endpoint, options);
  const raw = await response.json();
  return {
    status: response.status,
    value: raw?.result?.data?.json,
    message: raw?.error?.json?.message ?? raw?.error?.message ?? "",
    raw,
  };
}

const templateKeys = ["meeting_reminder", "todo_assigned", "cascade_sent", "overdue_digest", "mention", "rock_completed", "welcome"] as const;
let passed = false;

try {
  await resetPulseThinSliceFixture(db);
  const [people] = await sql.query<any[]>("SELECT id, openId, name FROM users WHERE openId LIKE 'pulse_slice_fixture_%'");
  const person = Object.fromEntries(people.map((row) => [row.openId.slice(-2).toUpperCase(), row]));
  const [meetings] = await sql.query<any[]>("SELECT id, name FROM pulse_meetings WHERE name LIKE 'Pulse Slice — %' AND deletedAt IS NULL");
  const meeting = Object.fromEntries(meetings.map((row) => [row.name.slice(-1), row]));
  const p2 = person.P2;
  const p3 = person.P3;
  const p5 = person.P5;
  const p6 = person.P6;
  const source = meeting.A;
  const destinationB = meeting.B;
  const destinationC = meeting.C;

  // Prevent the fixture suite from trying to deliver to a non-production test address.
  await sql.query("UPDATE users SET email = NULL WHERE id IN (?, ?)", [p2.id, p5.id]);
  const preference = await call(p2, "pulse.notifications.setPreference", {
    templateKey: "cascade_sent",
    inApp: true,
    email: false,
  }, "mutation");
  // P3 is a destination-C member. Add source visibility before the positive send.
  await sql.query("INSERT INTO pulse_meeting_members (id, meetingId, personId, meetingRole, addedById) VALUES (UUID(), ?, ?, 'member', ?)", [source.id, p3.id, p2.id]);
  const sent = await call(p2, "pulse.cascades.send", {
    fromMeetingId: source.id,
    toMeetingIds: [destinationB.id, destinationC.id],
    body: "Carry this decision into both receiving meetings.",
  }, "mutation");
  const messageId = sent.value?.messageId as string | undefined;
  if (!messageId) throw new Error(`Cascade send did not return a message ID: ${sent.message}`);

  const [frozenRoster] = await sql.query<any[]>("SELECT personId, viaMeetingId, acknowledgedAt FROM pulse_cascade_recipients WHERE cascadingMessageId = ? ORDER BY personId, viaMeetingId", [messageId]);
  const [notificationRows] = await sql.query<any[]>("SELECT personId, clearedAt FROM pulse_notifications WHERE sourceType = 'cascade' AND sourceId = ?", [messageId]);

  // Current membership changes after send must not rewrite the frozen recipient rows.
  await sql.query("UPDATE pulse_meeting_members SET removedAt = NOW(), deletedAt = NOW() WHERE meetingId = ? AND personId = ? AND deletedAt IS NULL", [destinationB.id, p5.id]);
  await sql.query("INSERT INTO pulse_meeting_members (id, meetingId, personId, meetingRole, addedById) VALUES (UUID(), ?, ?, 'member', ?)", [destinationB.id, p6.id, p2.id]);
  const [rosterAfterMembershipChange] = await sql.query<any[]>("SELECT personId, viaMeetingId FROM pulse_cascade_recipients WHERE cascadingMessageId = ? ORDER BY personId, viaMeetingId", [messageId]);

  const dashboard = await call(p2, "pulse.meetingViews.dashboard", { meetingId: source.id });
  const dashboardCascade = dashboard.value?.sections?.find((section: any) => section.section === "cascading")?.items?.find((item: any) => item.id === messageId);
  const run = await call(p2, "pulse.meetingViews.run", { meetingId: source.id });
  const runCascade = run.value?.sections?.find((section: any) => section.section === "cascading")?.items?.find((item: any) => item.id === messageId);
  const pendingBefore = await call(p2, "pulse.cascades.pending");
  const missionCascade = pendingBefore.value?.find((item: any) => item.id === messageId);
  const acknowledgment = await call(p2, "pulse.cascades.acknowledge", { messageId, from: "mission_control" }, "mutation");
  const [ackRows] = await sql.query<any[]>("SELECT viaMeetingId, acknowledgedAt FROM pulse_cascade_recipients WHERE cascadingMessageId = ? AND personId = ? ORDER BY viaMeetingId", [messageId, p2.id]);
  const [clearedRows] = await sql.query<any[]>("SELECT clearedAt FROM pulse_notifications WHERE sourceType = 'cascade' AND sourceId = ? AND personId = ?", [messageId, p2.id]);

  // The unacknowledged recipient must still see the same frozen action after 14 days.
  await sql.query("UPDATE pulse_cascading_messages SET createdAt = DATE_SUB(NOW(), INTERVAL 15 DAY) WHERE id = ?", [messageId]);
  const p5Pending = await call(p5, "pulse.cascades.pending");

  // Remove P3's source visibility. P3 remains a destination-C member and is added to B,
  // so the next send must fail rather than create a notification they cannot safely see.
  await sql.query("UPDATE pulse_meeting_members SET removedAt = NOW(), deletedAt = NOW() WHERE meetingId = ? AND personId = ? AND deletedAt IS NULL", [source.id, p3.id]);
  await sql.query("INSERT INTO pulse_meeting_members (id, meetingId, personId, meetingRole, addedById) VALUES (UUID(), ?, ?, 'member', ?)", [destinationB.id, p3.id, p2.id]);
  const invisibleSend = await call(p2, "pulse.cascades.send", {
    fromMeetingId: source.id,
    toMeetingIds: [destinationB.id],
    body: "This must never reach someone without source visibility.",
  }, "mutation");

  const sampleRouting = dashboardCascade?.routing;
  const emailPreview = getEmailPreview("cascade_sent", {
    recipientEmail: "qa@example.test",
    recipientName: "QA",
    pulseMeetingName: source.name,
    pulseCascadeSource: sampleRouting?.source,
    pulseCascadeDestinations: sampleRouting?.destinations,
    pulseCascadeAcknowledgment: sampleRouting?.acknowledgment,
    pulseCascadeBody: "Carry this decision into both receiving meetings.",
    pulseActionUrl: "https://os.savvy-agents.com/pulse/mission",
  });
  const [dashboardSource, runSource, missionSource] = await Promise.all([
    fs.readFile("/home/ubuntu/savvyos/client/src/pages/PulseMeetingDashboardPage.tsx", "utf8"),
    fs.readFile("/home/ubuntu/savvyos/client/src/pages/PulseMeetingRunPage.tsx", "utf8"),
    fs.readFile("/home/ubuntu/savvyos/client/src/pages/PulseMissionControlPage.tsx", "utf8"),
  ]);
  const templateChecks = Object.fromEntries(templateKeys.map((templateKey) => {
    const preview = getEmailPreview(templateKey, {
      recipientEmail: "qa@example.test",
      recipientName: "QA",
      pulseMeetingName: "Pulse QA Meeting",
      pulseWorkItemTitle: "A clear next step",
      pulseOverdueList: "<p>One open item</p>",
      pulseCascadeSource: "From Pulse QA Meeting · Aug 20, 2026",
      pulseCascadeDestinations: "To Pulse QA Receiving Meeting",
      pulseCascadeAcknowledgment: "0 of 1 acknowledged",
      pulseCascadeBody: "Test message",
    });
    return [templateKey, preview.subject.length > 0 && preview.html.includes("Pulse QA Meeting") && preview.html.includes("href=")];
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    acceptance: {
      frozenRosterAtSend: {
        pass: sent.status === 200 && frozenRoster.length === 5 && new Set(frozenRoster.map((row) => row.personId)).size === 3,
        roster: frozenRoster.map((row) => ({ personId: row.personId, viaMeetingId: row.viaMeetingId })),
      },
      postSendMembershipDoesNotChangeRoster: {
        pass: JSON.stringify(frozenRoster.map((row) => [row.personId, row.viaMeetingId])) === JSON.stringify(rosterAfterMembershipChange.map((row) => [row.personId, row.viaMeetingId])),
      },
      oneAcknowledgmentClearsAllRecipientRows: {
        pass: acknowledgment.status === 200 && ackRows.length === 2 && ackRows.every((row) => !!row.acknowledgedAt) && clearedRows.length === 1 && !!clearedRows[0]?.clearedAt,
      },
      identicalRoutingAcrossFourSurfaces: {
        pass: dashboard.status === 200 && run.status === 200 && !!sampleRouting
          && JSON.stringify(dashboardCascade?.routing) === JSON.stringify(runCascade?.routing)
          && JSON.stringify(dashboardCascade?.routing) === JSON.stringify(missionCascade?.routing)
          && emailPreview.html.includes(sampleRouting?.source ?? "")
          && emailPreview.html.includes(sampleRouting?.destinations ?? "")
          && emailPreview.html.includes(sampleRouting?.acknowledgment ?? "")
          && dashboardSource.includes("PulseCascadeCard") && runSource.includes("PulseCascadeCard") && missionSource.includes("PulseCascadeCard"),
      },
      oneTapMissionControlAcknowledgment: { pass: acknowledgment.status === 200 && acknowledgment.value?.success === true },
      unacknowledgedMessagePersistsBeyond14Days: { pass: p5Pending.status === 200 && p5Pending.value?.some((item: any) => item.id === messageId) },
      invisibleSourceNotificationFailsPlainly: {
        pass: invisibleSend.status >= 400 && invisibleSend.message.includes("cannot see the source meeting"),
        message: invisibleSend.message,
      },
      allSevenEmailTemplatesRender: { pass: Object.values(templateChecks).every(Boolean), templates: templateChecks },
      emailOffPulseOnCreatesInAppOnly: {
        pass: preference.status === 200 && preference.value?.inApp === true && preference.value?.email === false
          && notificationRows.some((row) => row.personId === p2.id) && sent.value?.emailCount === 0,
      },
    },
  };

  await fs.writeFile("/home/ubuntu/savvyos/docs/pulse_prompt_5_verification.json", `${JSON.stringify(report, null, 2)}\n`);
  if (!Object.values(report.acceptance).every((item: any) => item.pass === true)) throw new Error("Prompt 5 acceptance failed; inspect docs/pulse_prompt_5_verification.json");
  passed = true;
  console.log("Prompt 5 acceptance passed");
} finally {
  try {
    await cleanupPulsePrompt5Fixtures(sql);
    await retirePulseThinSliceFixture(db);
  } finally {
    await sql.end();
  }
}

// getDb() owns a shared pool, so close this verification process only after fixture cleanup.
if (passed) process.exit(0);
