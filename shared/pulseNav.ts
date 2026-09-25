export type PulseNavMeeting = { id: string; name: string };
export type PulseNavShell = {
  navMode?: "single_meeting" | "standard";
  canSeeSettings?: boolean;
  meetings?: PulseNavMeeting[];
};

export type PulseNavDestination = {
  label: "My EOS Dashboard" | "Settings" | string;
  path: string;
};

/**
 * Pulse navigation intentionally stays small. Weekly preparation lives within
 * My EOS Dashboard, while meeting membership is rendered as a collapsible
 * sidebar section rather than a separate meeting-index destination.
 */
export function getPulseNavDestinations(shell?: PulseNavShell): PulseNavDestination[] {
  const canSeeSettings = shell?.canSeeSettings === true;
  const items: PulseNavDestination[] = [
    { label: "My EOS Dashboard", path: "/pulse/dashboard" },
  ];
  if (canSeeSettings) items.push({ label: "Settings", path: "/pulse/settings" });
  return items;
}
