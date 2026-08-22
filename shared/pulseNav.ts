export type PulseNavMeeting = { id: string; name: string; label?: "level_10" | "one_on_one" | "other" };
export type PulseNavShell = {
  navMode?: "single_meeting" | "standard";
  canSeeSettings?: boolean;
  meetings?: PulseNavMeeting[];
};

export type PulseNavDestination = {
  label: "Home" | "My Work" | "My Inputs" | "Meetings" | "Settings" | string;
  path: string;
};

/**
 * The single source of truth for the intentionally small Pulse navigation.
 * It returns plain data so both the React shell and server-side model checks
 * prove the exact same destinations.
 */
export function getPulseNavDestinations(shell?: PulseNavShell): PulseNavDestination[] {
  const meetings = shell?.meetings ?? [];
  const canSeeSettings = shell?.canSeeSettings === true;
  const isSingleMember = shell?.navMode === "single_meeting" && meetings.length === 1;

  const items: PulseNavDestination[] = [{ label: "Home", path: "/pulse" }];
  if (!isSingleMember && meetings.length > 1) items.push({ label: "My Work", path: "/pulse/work" });
  items.push({ label: "My Inputs", path: "/pulse/inputs" });
  if (isSingleMember) items.push({ label: meetings[0].name, path: `/pulse/meetings/${meetings[0].id}` });
  else items.push({ label: "Meetings", path: "/pulse/meetings" });
  if (canSeeSettings) items.push({ label: "Settings", path: "/pulse/settings" });
  return items.slice(0, 5);
}
