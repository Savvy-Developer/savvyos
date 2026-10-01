/**
 * Pure decision rules for applying a new SavvyOS deploy in an open browser tab.
 *
 * SavvyOS ships many deploys a day. A tab must never be reloaded while someone is
 * working in it (Pulse meetings, Projects, editors), so a new build is only applied
 * automatically when the person is demonstrably away and nothing is unsaved.
 * Otherwise we wait for them to click "Refresh" themselves.
 */

/** Tab must have been in the background at least this long before we auto-apply. */
export const AUTO_APPLY_HIDDEN_MS = 2 * 60_000;

/** After "Later", don't re-show the update prompt for this long. */
export const UPDATE_SNOOZE_MS = 60 * 60_000;

export type AutoApplyInput = {
  updatePending: boolean;
  /** document.visibilityState === "hidden" */
  hidden: boolean;
  /** Timestamp (ms) the tab became hidden, or null when visible. */
  hiddenSince: number | null;
  /** True when there are unsaved edits or an open dialog/editor. */
  hasUnsavedWork: boolean;
  now: number;
};

export function shouldAutoApplyUpdate(input: AutoApplyInput): boolean {
  if (!input.updatePending) return false;
  if (input.hasUnsavedWork) return false;
  if (!input.hidden || input.hiddenSince === null) return false;
  return input.now - input.hiddenSince >= AUTO_APPLY_HIDDEN_MS;
}

export type PromptInput = {
  updatePending: boolean;
  promptVisible: boolean;
  /** Timestamp the user last clicked "Later", or null. */
  snoozedAt: number | null;
  now: number;
};

export function shouldShowUpdatePrompt(input: PromptInput): boolean {
  if (!input.updatePending || input.promptVisible) return false;
  if (input.snoozedAt === null) return true;
  return input.now - input.snoozedAt >= UPDATE_SNOOZE_MS;
}

const NON_DRAFT_INPUT_TYPES = new Set([
  "search",
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "button",
  "submit",
  "reset",
  "hidden",
  "password",
]);

const SEARCH_LIKE = /search|filter|find/i;

/**
 * Whether typing into a field represents a draft worth protecting. Search boxes and
 * filters are excluded so they never block an update or trigger a leave warning.
 */
export function isDraftField(field: {
  tagName: string;
  type?: string | null;
  isContentEditable?: boolean;
  role?: string | null;
  label?: string | null;
  optedOut?: boolean;
}): boolean {
  if (field.optedOut) return false;
  if (field.role === "combobox" || field.role === "searchbox") return false;
  if (field.label && SEARCH_LIKE.test(field.label)) return false;
  if (field.isContentEditable) return true;
  const tag = field.tagName.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  const type = (field.type ?? "text").toLowerCase();
  return !NON_DRAFT_INPUT_TYPES.has(type);
}
