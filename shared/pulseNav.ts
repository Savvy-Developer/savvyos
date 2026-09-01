export type PulseNavMeeting = { id: string; name: string };
export type PulseNavShell = {
  navMode?: "single_meeting" | "standard";
  canSeeSettings?: boolean;
  meetings?: PulseNavMeeting[];
};

export type PulseNavDestination = {
  label: "Home" | "My EOS Dashboard" | "Weekly Preparation" | "Meetings" | "Settings" | string;
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
  const items: PulseNavDestination[] = [
    { label: "My EOS Dashboard", path: "/pulse/dashboard" },
    { label: "Weekly Preparation", path: "/pulse/weekly-prep" },
  ];
  items.push({ label: "Meetings", path: "/pulse/meetings" });
  if (canSeeSettings) items.push({ label: "Settings", path: "/pulse/settings" });
  return items.slice(0, 5);
}
