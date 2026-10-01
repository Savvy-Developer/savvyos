import { toast } from "sonner";
import {
  isDraftField,
  shouldAutoApplyUpdate,
  shouldShowUpdatePrompt,
} from "@shared/deployUpdatePolicy";

// ---------------------------------------------------------------------------
// Deploy-update handling
// ---------------------------------------------------------------------------
// SavvyOS deploys many times a day. An open tab must NEVER be reloaded out from
// under someone who is working (Pulse meetings, Projects, editors, dialogs).
//
// Behaviour:
//   • Poll /system.health for the server buildId. When it changes, show a
//     dismissible "Update available" toast. Nothing reloads on its own while
//     the tab is in use — including in-app navigation.
//   • The update is applied silently only when the tab has been in the
//     background for a couple of minutes AND nothing is unsaved (no typed
//     drafts, no open dialog, no running L10 meeting).
//   • "Refresh now" asks for confirmation if there are unsaved drafts.
//   • The browser's "Leave site?" warning protects typed drafts against any
//     reload, including a manual refresh.
//   • If an API call fails while the tab is on an old build, the prompt is
//     re-shown so people know a refresh will likely fix it.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 60_000;
const RECENT_TYPING_MS = 15 * 60_000;
const STALE_ERROR_PROMPT_THROTTLE_MS = 5 * 60_000;
const TOAST_ID = "savvyos-update-available";
const STALE_RELOAD_FLAG = "savvyos_reloaded_stale";

let knownBuildId: string | null = null;
let updatePending = false;
let promptVisible = false;
let snoozedAt: number | null = null;
let hiddenSince: number | null = null;
let lastDraftInputAt = 0;
let lastStaleErrorPromptAt = 0;
let initialized = false;

/** Fields the user has typed into that may hold unsaved text. */
const draftFields = new Set<HTMLElement>();

// ---------------------------------------------------------------------------
// Unsaved-work tracking
// ---------------------------------------------------------------------------

function draftRootFor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.isContentEditable) {
    return (target.closest('[contenteditable="true"], [contenteditable=""]') as HTMLElement | null) ?? target;
  }
  return target;
}

function fieldValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent ?? "";
}

function isTrackedDraft(el: HTMLElement): boolean {
  return isDraftField({
    tagName: el.tagName,
    type: el instanceof HTMLInputElement ? el.type : null,
    isContentEditable: el.isContentEditable,
    role: el.getAttribute("role"),
    label: [
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
      el.getAttribute("name"),
    ]
      .filter(Boolean)
      .join(" "),
    optedOut: el.closest("[data-no-unsaved-guard]") !== null,
  });
}

function onDraftInput(event: Event) {
  const el = draftRootFor(event.target);
  if (!el || !isTrackedDraft(el)) return;
  if (fieldValue(el).trim()) {
    draftFields.add(el);
    lastDraftInputAt = Date.now();
  } else {
    draftFields.delete(el);
  }
}

/** True when typed text exists in a field that is still on screen. */
export function hasUnsavedDrafts(): boolean {
  draftFields.forEach(el => {
    if (!el.isConnected || !fieldValue(el).trim()) draftFields.delete(el);
  });
  return draftFields.size > 0;
}

/** Call after a successful save — the typed text has been persisted. */
export function markDraftsSaved() {
  draftFields.clear();
}

function isActivelyWorking(): boolean {
  if (hasUnsavedDrafts()) return true;
  if (Date.now() - lastDraftInputAt < RECENT_TYPING_MS) return true;
  if (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    )
  ) {
    return true;
  }
  // A live L10 meeting runner should never be reset by an update.
  if (document.querySelector(".pulse-runner-shell")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Applying updates
// ---------------------------------------------------------------------------

function reloadForUpdate() {
  window.location.reload();
}

function refreshNow() {
  if (
    hasUnsavedDrafts() &&
    !window.confirm(
      "You have unsaved changes on this page. Refresh anyway and lose them?"
    )
  ) {
    return;
  }
  draftFields.clear();
  reloadForUpdate();
}

function showUpdatePrompt(description?: string) {
  promptVisible = true;
  toast.info("A new version of SavvyOS is ready", {
    id: TOAST_ID,
    description:
      description ??
      "Refresh when you're at a good stopping point. Nothing will reload while you're working.",
    duration: Infinity,
    action: { label: "Refresh", onClick: refreshNow },
    cancel: {
      label: "Later",
      onClick: () => {
        snoozedAt = Date.now();
      },
    },
    onDismiss: () => {
      promptVisible = false;
      snoozedAt ??= Date.now();
    },
  });
}

function maybeAutoApply() {
  if (
    shouldAutoApplyUpdate({
      updatePending,
      hidden: document.visibilityState === "hidden",
      hiddenSince,
      hasUnsavedWork: isActivelyWorking(),
      now: Date.now(),
    })
  ) {
    console.info("[SavvyOS] Applying update while the tab is in the background.");
    reloadForUpdate();
  }
}

function maybePrompt() {
  if (
    shouldShowUpdatePrompt({
      updatePending,
      promptVisible,
      snoozedAt,
      now: Date.now(),
    })
  ) {
    snoozedAt = null;
    showUpdatePrompt();
  }
}

function markUpdatePending(reason: string) {
  if (updatePending) return;
  updatePending = true;
  console.info(`[SavvyOS] ${reason}. Update will apply when it's safe.`);
}

async function checkForNewDeploy() {
  try {
    const res = await fetch(
      `/api/trpc/system.health?input=${encodeURIComponent(
        JSON.stringify({ json: { timestamp: Date.now() } })
      )}`,
      { credentials: "include", cache: "no-store" }
    );
    if (!res.ok) return;
    const json = await res.json();
    const buildId: string | undefined = json?.result?.data?.json?.buildId;
    if (!buildId) return;

    if (knownBuildId === null) {
      knownBuildId = buildId;
      return;
    }
    if (buildId !== knownBuildId) {
      markUpdatePending(`New deploy detected (${knownBuildId} → ${buildId})`);
      knownBuildId = buildId;
    }
  } catch {
    // Expected for a few seconds while Railway swaps containers.
  } finally {
    maybeAutoApply();
    if (document.visibilityState === "visible") maybePrompt();
  }
}

/**
 * Call from API error handlers. If the tab is running an old build, a failing
 * request is most likely an old-client/new-server mismatch, so re-surface the
 * refresh prompt even if the user snoozed it.
 */
export function reportApiErrorForUpdates() {
  if (!updatePending) return;
  const now = Date.now();
  if (now - lastStaleErrorPromptAt < STALE_ERROR_PROMPT_THROTTLE_MS) return;
  lastStaleErrorPromptAt = now;
  showUpdatePrompt(
    "Something on this page failed because it's running an older version. Save your work, then refresh."
  );
}

export function initDeployUpdates() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  // index.html reloads once if the bundle 404s after a deploy. The app booted,
  // so re-arm that safety net for the next deploy in this tab.
  try {
    sessionStorage.removeItem(STALE_RELOAD_FLAG);
  } catch {
    /* storage unavailable */
  }

  document.addEventListener("input", onDraftInput, true);

  window.addEventListener("beforeunload", event => {
    if (!hasUnsavedDrafts()) return;
    event.preventDefault();
    // Required by some browsers to show the native "Leave site?" dialog.
    event.returnValue = "";
  });

  // A lazily imported chunk from the previous build no longer exists.
  window.addEventListener("vite:preloadError", () => {
    markUpdatePending("A code chunk from the previous build could not load");
    showUpdatePrompt(
      "Part of this page couldn't load because SavvyOS was updated. Save your work, then refresh."
    );
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenSince = Date.now();
    } else {
      hiddenSince = null;
      void checkForNewDeploy();
    }
  });
  if (document.visibilityState === "hidden") hiddenSince = Date.now();

  // Start after a short delay so the initial page load isn't impacted.
  setTimeout(() => {
    void checkForNewDeploy();
    setInterval(() => void checkForNewDeploy(), POLL_INTERVAL_MS);
  }, 5_000);
}
