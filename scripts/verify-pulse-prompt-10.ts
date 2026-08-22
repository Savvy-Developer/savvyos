import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFile(path.join(root, relative), "utf8");
const checks: Array<{ criterion: string; passed: boolean; evidence: string }> = [];

function assert(criterion: string, condition: boolean, evidence: string) {
  checks.push({ criterion, passed: condition, evidence });
  if (!condition) throw new Error(`${criterion}: ${evidence}`);
}

async function main() {
  const [permissions, schema, migration, pulseRouter, settings, app, layout, createPage, foundation, myWork, myInputs, mission, sharedNav, superPermissions] = await Promise.all([
    read("server/routers/permissions.ts"),
    read("drizzle/schema.ts"),
    read("drizzle/0053_pulse_capabilities.sql"),
    read("server/routers/pulse.ts"),
    read("server/pulse/settings.ts"),
    read("client/src/App.tsx"),
    read("client/src/components/AppLayout.tsx"),
    read("client/src/pages/PulseCreateMeetingPage.tsx"),
    read("client/src/pages/PulseFoundationPage.tsx"),
    read("client/src/pages/PulseMyWorkPage.tsx"),
    read("client/src/pages/PulseMyInputsPage.tsx"),
    read("client/src/pages/PulseMissionControlPage.tsx"),
    read("shared/pulseNav.ts"),
    read("client/src/pages/SuperPermissionsPage.tsx"),
  ]);

  const capabilityKeys = [
    "canViewPulseSettings",
    "canViewPulseEffectiveness",
    "canViewPulseHistory",
    "canViewAllQuarterlyRocks",
    "canViewPulsePermissioning",
  ];
  for (const key of capabilityKeys) {
    assert(`Static PULSE capability: ${key}`, permissions.includes(`key: "${key}"`) && schema.includes(`${key}: boolean("${key}").default(false).notNull()`) && migration.includes(`ADD COLUMN \`${key}\` boolean NOT NULL DEFAULT false`), "The registry, schema, and migration must define the capability with a false default.");
  }
  assert("PULSE matrix group is static", permissions.includes('group: "PULSE"') && !permissions.includes("meetingId") && !permissions.includes("pulseMeetingMembers"), "The shared registry must not derive or store meeting membership.");
  assert("Static Pulse capabilities use existing people without role promotion", permissions.includes("where(eq(users.isActive, true))") && permissions.includes("targetUser.role === \"admin\" ? validKeys : new Set<string>(PULSE_CAPABILITY_KEYS)") && permissions.includes("isAdmin: u.role === \"admin\""), "The matrix must list active existing people and filter non-admin changes to PULSE capabilities only.");
  assert("Non-Pulse permissions remain admin-only in the matrix", superPermissions.includes("const unavailableForPerson = !admin.isAdmin && !isPulseCapability") && superPermissions.includes("def.group !== PULSE_GROUP"), "The client must render non-PULSE cells unavailable for non-admin people and omit them from change sets.");
  assert("Pulse authority uses matrix capabilities", pulseRouter.includes("hasPulseCapability") && settings.includes("hasPulseCapability"), "The Pulse shell and settings procedures must resolve administrative authority through the shared permission helper.");
  assert("No active Pulse-local role authority remains", !/super_admin|platformRole|platform_role|isSuperAdmin/.test(`${pulseRouter}\n${settings}`), "Active Pulse route and settings source must not inspect Pulse-local roles.");
  assert("Obsolete routes are absent", !app.includes('path="/pulse/slice"') && !app.includes('path="/pulse/settings/permissioning"'), "The former thin-slice and dynamic permissioning UI routes must be removed.");
  assert("SavvyOS return path is persistent", layout.includes('label: "Back to SavvyOS"') && layout.includes('Return to SavvyOS'), "Desktop and mobile Pulse shell controls must provide a SavvyOS return path.");
  assert("Pulse entry is not an admin-nav permission", !layout.includes('canViewPulse: "/pulse"'), "The ordinary Pulse nav entry must not be filtered by an admin page permission.");
  assert("Visible meetings are grouped by label", sharedNav.includes("label?: \"level_10\"") && layout.includes('"Team meetings"') && layout.includes('"One-on-ones"') && layout.includes('"Ad hoc"'), "The Pulse sidebar must group only visible meetings by presentation label.");
  assert("Two-step creation flow is present", createPage.includes("What kind of meeting is this?") && createPage.includes("What happens in this meeting?") && createPage.includes("Create meeting"), "Creation must hold writes until the explicit final action.");
  assert("Creation purpose and sections are persisted", settings.includes("purpose:") && settings.includes("sectionsEnabled") && schema.includes('purpose: text("purpose")'), "The server contract and meeting model must persist purpose and selected sections.");
  assert("One-on-one is constrained", settings.includes("A one-on-one meeting has exactly two people"), "The server must enforce the two-person one-on-one invariant.");
  assert("Member empty states are instructional", foundation.includes("You do not have any meetings yet.") && myWork.includes("When a meeting gives you a next step") && myInputs.includes("You have no metrics configured") && mission.includes("You have not been added to a meeting yet"), "Empty states must explain what will appear and how a person proceeds.");
  assert("My Work does not redirect single-meeting members", !myWork.includes("redirectMeetingId") && !myWork.includes("navigate("), "The aggregate work page must remain available even with one visible meeting.");
  assert("Pulse notification indicator is actionable-only", layout.includes("trpc.pulse.notifications.pending") && layout.includes("pulseActionCount"), "The shell badge must use the actionable pending feed.");

  const report = {
    prompt: "Pulse V2 Prompt 10 Amendment A",
    mode: "read-only source-contract verification; no users, roles, capabilities, memberships, meetings, or production records were created or modified",
    generatedAt: new Date().toISOString(),
    passed: checks.length,
    checks,
  };
  await fs.writeFile(path.join(root, "docs/pulse_prompt_10_verification.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
