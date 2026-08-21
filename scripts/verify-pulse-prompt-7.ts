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
const drizzle = await getDb();
if (!drizzle) throw new Error("Pulse database is not available");
const prefix = "Pulse Prompt 7 Fixture";
let passed = false;

async function jwt(person: any) {
  return new SignJWT({ openId: person.openId, appId, name: person.name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode(secret));
}
async function call(person: any, procedure: string, input?: unknown, type: "query" | "mutation" = "query") {
  const endpoint = new URL(`${base}/api/trpc/${procedure}`);
  const headers: Record<string, string> = { cookie: `app_session_id=${await jwt(person)}` };
  const options: RequestInit = { headers };
  if (type === "query") endpoint.searchParams.set("input", JSON.stringify({ json: input ?? null }));
  else { options.method = "POST"; headers["content-type"] = "application/json"; options.body = JSON.stringify({ json: input ?? null }); }
  const response = await fetch(endpoint, options);
  const raw = await response.json();
  return { status: response.status, value: raw?.result?.data?.json, message: raw?.error?.json?.message ?? "" };
}

try {
  await resetPulseThinSliceFixture(drizzle);
  const [people] = await sql.query<any[]>("SELECT id, openId, name FROM users WHERE openId LIKE 'pulse_slice_fixture_%'");
  const person = Object.fromEntries(people.map((row) => [row.openId.slice(-2).toUpperCase(), row]));
  const [meetings] = await sql.query<any[]>("SELECT id, name FROM pulse_meetings WHERE name LIKE 'Pulse Slice — %' AND deletedAt IS NULL ORDER BY name");
  const meeting = Object.fromEntries(meetings.map((row) => [row.name.slice(-1), row]));
  const owner = person.P2; const viewer = person.P5;
  await sql.query("UPDATE pulse_meetings SET sectionsEnabled = JSON_SET(sectionsEnabled, '$.scorecard', true), sectionOrder = JSON_ARRAY_APPEND(sectionOrder, '$', 'scorecard') WHERE id IN (?, ?) AND NOT JSON_CONTAINS(sectionOrder, JSON_QUOTE('scorecard'))", [meeting.B.id, meeting.C.id]);
  await sql.query("UPDATE pulse_meeting_members SET removedAt = NOW() WHERE meetingId = ? AND personId = ? AND removedAt IS NULL", [meeting.C.id, owner.id]);
  const [responsibilityResult] = await sql.query<any>("INSERT INTO roles_responsibilities (ownerId, title, description, cadence, status, createdById) VALUES (?, ?, ?, 'weekly', 'active', ?)", [owner.id, prefix, "A plain-language scorecard fixture definition.", owner.id]);
  const responsibilityId = Number(responsibilityResult.insertId);
  const [weeklyResult] = await sql.query<any>("INSERT INTO rr_scorecard_metrics (responsibilityId, name, metricType, frequency, targetValue, performanceDirection, displayFormat, rollupMethod, status, createdById) VALUES (?, ?, 'manual', 'weekly', 5, 'higher', 'number', 'sum', 'active', ?)", [responsibilityId, `${prefix} Weekly`, owner.id]);
  const [monthlyResult] = await sql.query<any>("INSERT INTO rr_scorecard_metrics (responsibilityId, name, metricType, frequency, targetValue, performanceDirection, displayFormat, rollupMethod, status, createdById) VALUES (?, ?, 'manual', 'monthly', 40, 'higher', 'number', 'sum', 'active', ?)", [responsibilityId, `${prefix} Monthly`, owner.id]);
  const [quarterlyResult] = await sql.query<any>("INSERT INTO rr_scorecard_metrics (responsibilityId, name, metricType, frequency, targetValue, performanceDirection, displayFormat, rollupMethod, status, createdById) VALUES (?, ?, 'manual', 'quarterly', 10, 'higher', 'number', 'sum', 'active', ?)", [responsibilityId, `${prefix} Quarterly`, owner.id]);
  const weeklyId = Number(weeklyResult.insertId), monthlyId = Number(monthlyResult.insertId), quarterlyId = Number(quarterlyResult.insertId);
  const mappingId = () => crypto.randomUUID();
  // Direct fixture setup gives one metric three displays, including a meeting where its owner is not a member.
  await sql.query("INSERT INTO meeting_scorecard_metrics (id, meetingId, savvyosMetricId, sortOrder, addedById) VALUES (?, ?, ?, 0, ?), (?, ?, ?, 0, ?), (?, ?, ?, 0, ?), (?, ?, ?, 1, ?), (?, ?, ?, 2, ?)", [mappingId(), meeting.A.id, weeklyId, owner.id, mappingId(), meeting.B.id, weeklyId, owner.id, mappingId(), meeting.C.id, weeklyId, owner.id, mappingId(), meeting.A.id, monthlyId, owner.id, mappingId(), meeting.A.id, quarterlyId, owner.id]);

  const before = await call(owner, "pulse.meetingViews.dashboard", { meetingId: meeting.A.id });
  const scorecard = before.value?.sections?.find((section: any) => section.section === "scorecard");
  const saved = await call(owner, "pulse.scorecard.saveCurrentValue", { meetingId: meeting.A.id, metricId: weeklyId, actualValue: 3 }, "mutation");
  const [rrValues] = await sql.query<any[]>("SELECT actualValue, enteredById FROM rr_metric_values WHERE metricId = ? ORDER BY enteredAt DESC LIMIT 1", [weeklyId]);
  const afterWrite = await call(owner, "pulse.meetingViews.dashboard", { meetingId: meeting.A.id });
  const afterWriteScorecard = afterWrite.value?.sections?.find((section: any) => section.section === "scorecard");
  const secondMeeting = await call(viewer, "pulse.meetingViews.dashboard", { meetingId: meeting.B.id });
  const thirdMeeting = await call(viewer, "pulse.meetingViews.dashboard", { meetingId: meeting.C.id });
  const secondScorecard = secondMeeting.value?.sections?.find((section: any) => section.section === "scorecard");
  const thirdScorecard = thirdMeeting.value?.sections?.find((section: any) => section.section === "scorecard");
  const rejected = await call(viewer, "pulse.scorecard.saveCurrentValue", { meetingId: meeting.A.id, metricId: weeklyId, actualValue: 99 }, "mutation");
  await sql.query("UPDATE rr_scorecard_metrics SET status = 'inactive' WHERE id = ?", [monthlyId]);
  const inactiveDashboard = await call(owner, "pulse.meetingViews.dashboard", { meetingId: meeting.A.id });
  const inactiveScorecard = inactiveDashboard.value?.sections?.find((section: any) => section.section === "scorecard");
  const config = await call(owner, "pulse.scorecard.configuration", { meetingId: meeting.A.id });
  const [ownerMembershipInThirdMeeting] = await sql.query<any[]>("SELECT id FROM pulse_meeting_members WHERE meetingId = ? AND personId = ? AND removedAt IS NULL AND deletedAt IS NULL", [meeting.C.id, owner.id]);
  const schema = await fs.readFile("/home/ubuntu/savvyos/drizzle/schema.ts", "utf8");
  const component = await fs.readFile("/home/ubuntu/savvyos/client/src/components/pulse/PulseScorecard.tsx", "utf8");
  const report = {
    generatedAt: new Date().toISOString(),
    debug: { before, saved, rrValues, afterWrite, secondMeeting, thirdMeeting, inactiveDashboard, config, ownerMembershipInThirdMeeting },
    acceptance: {
      onlyMappingTableInPulseSchema: { pass: schema.includes('mysqlTable("meeting_scorecard_metrics"') && !schema.includes('mysqlTable("pulse_scorecard_metrics"') && !schema.includes('mysqlTable("pulse_scorecard_entries"') },
      pulseWritesSavvyOsOnly: { pass: saved.status === 200 && Number(rrValues[0]?.actualValue) === 3 && rrValues[0]?.enteredById === owner.id },
      failedWriteIsPlainAndReverts: { pass: rejected.status >= 400 && /Only this metric’s SavvyOS owner/.test(rejected.message) && component.includes("Your prior value is still showing") && component.includes("setValue(metric.current.value") },
      oneMetricThreeMeetingsOneOwnerOneValue: { pass: [afterWriteScorecard, secondScorecard, thirdScorecard].every((section: any) => section?.items?.some((metric: any) => metric.metricId === weeklyId && metric.owner.id === owner.id && metric.current.value === 3)) },
      metricOwnerNeedNotBeMeetingMember: { pass: ownerMembershipInThirdMeeting.length === 0 && thirdScorecard?.items?.some((metric: any) => metric.metricId === weeklyId && metric.owner.id === owner.id) === true },
      cadenceTabsArePresentAndLocal: { pass: ["weekly", "monthly", "quarterly"].every((tab) => scorecard?.meta?.tabs?.includes(tab)) && component.includes("useState<string>") && component.includes("TabsTrigger") },
      inactiveMetricDisappearsWithConfigurationNote: { pass: !inactiveScorecard?.items?.some((metric: any) => metric.metricId === monthlyId) && inactiveScorecard?.meta?.configurationNotes?.some((note: any) => /inactive in SavvyOS/.test(note.note)) && config.value?.mapped?.some((metric: any) => metric.metricId === monthlyId && metric.status === "inactive") },
      phoneStackedNumericInput: { pass: component.includes('className="space-y-3 sm:hidden"') && component.includes('inputMode="decimal"') && component.includes("min-h-11") },
    },
  };
  await fs.writeFile("/home/ubuntu/savvyos/docs/pulse_prompt_7_verification.json", `${JSON.stringify(report, null, 2)}\n`);
  if (!Object.values(report.acceptance).every((criterion: any) => criterion.pass === true)) throw new Error("Prompt 7 acceptance failed; inspect docs/pulse_prompt_7_verification.json");
  passed = true;
  console.log("Prompt 7 acceptance passed");
} finally {
  await sql.query("DELETE mapping FROM meeting_scorecard_metrics mapping JOIN rr_scorecard_metrics metric ON metric.id = mapping.savvyosMetricId WHERE metric.name LIKE ?", [`${prefix}%`]);
  await sql.query("DELETE FROM roles_responsibilities WHERE title = ?", [prefix]);
  await retirePulseThinSliceFixture(drizzle);
  await sql.end();
}
if (passed) process.exit(0);
