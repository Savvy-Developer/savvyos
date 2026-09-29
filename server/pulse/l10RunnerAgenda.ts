export const L10_RUNNER_STEPS = [
  "segue",
  "headlines",
  "cascades",
  "scorecard",
  "rocks",
  "todos",
  "issues",
  "conclude",
] as const;

export type L10RunnerStep = (typeof L10_RUNNER_STEPS)[number];

export function normaliseL10RunnerDurations(
  stored: Record<string, number> | null | undefined
) {
  const durations = {
    segue: 5,
    headlines: 5,
    cascades: 5,
    scorecard: 5,
    rocks: 5,
    todos: 5,
    issues: 60,
    conclude: 5,
    ...(stored ?? {}),
  };

  // Existing meetings have a 60-minute IDS allocation and no Cascades key.
  // Preserve their 90-minute rhythm by assigning the new checkpoint five of
  // those minutes. New records naturally begin with the same distribution.
  if (stored?.cascades == null) {
    durations.issues = Math.max(0, durations.issues - durations.cascades);
  }

  return durations;
}

/**
 * Cascades are a required runner checkpoint: they are inbound messages that
 * belong to this meeting, rather than an optional meeting-dashboard section.
 */
export function getL10RunnerSteps(
  sectionsEnabled: Record<string, boolean>
): L10RunnerStep[] {
  return L10_RUNNER_STEPS.filter(
    step => step === "cascades" || step === "conclude" || sectionsEnabled[step]
  );
}
