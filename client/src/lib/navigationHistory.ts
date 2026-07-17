import { useCallback } from "react";
import { useLocation } from "wouter";

const APP_HISTORY_INDEX_KEY = "__savvyOsHistoryIndex";
const APP_HISTORY_PATCH_KEY = Symbol.for("savvyos.history.patch");

type AppHistoryState = Record<string, unknown> & {
  [APP_HISTORY_INDEX_KEY]: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Adds SavvyOS's in-app history index while preserving any existing object state.
 * Wouter currently writes null state, but preserving it keeps this compatible with
 * future route state usage.
 */
export function createAppHistoryState(state: unknown, index: number): AppHistoryState {
  return {
    ...(isRecord(state) ? state : {}),
    [APP_HISTORY_INDEX_KEY]: index,
  };
}

export function getAppHistoryIndex(state: unknown): number | null {
  if (!isRecord(state)) return null;

  const index = state[APP_HISTORY_INDEX_KEY];
  return typeof index === "number" && Number.isInteger(index) && index >= 0
    ? index
    : null;
}

/**
 * Instruments browser history once so every Wouter navigation records its depth
 * within the current SavvyOS session. A direct page load starts at index zero.
 */
export function initializeAppHistory(): void {
  if (typeof window === "undefined") return;

  const patchedWindow = window as unknown as Window & Record<symbol, boolean | undefined>;
  if (patchedWindow[APP_HISTORY_PATCH_KEY]) return;

  const { history } = window;
  if (getAppHistoryIndex(history.state) === null) {
    history.replaceState(
      createAppHistoryState(history.state, 0),
      "",
      window.location.href,
    );
  }

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = ((state: unknown, unused: string, url?: string | URL | null) => {
    const currentIndex = getAppHistoryIndex(history.state) ?? 0;
    originalPushState(createAppHistoryState(state, currentIndex + 1), unused, url);
  }) as History["pushState"];

  history.replaceState = ((state: unknown, unused: string, url?: string | URL | null) => {
    const currentIndex = getAppHistoryIndex(history.state) ?? 0;
    originalReplaceState(createAppHistoryState(state, currentIndex), unused, url);
  }) as History["replaceState"];

  Object.defineProperty(patchedWindow, APP_HISTORY_PATCH_KEY, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export function canNavigateBackInApp(state?: unknown): boolean {
  const historyState = arguments.length > 0
    ? state
    : typeof window !== "undefined"
      ? window.history.state
      : null;

  return (getAppHistoryIndex(historyState) ?? 0) > 0;
}

type NavigationSetter = (
  path: string,
  options?: { replace?: boolean; state?: unknown },
) => void;

export function navigateBackInApp(
  fallbackPath: string,
  navigate: NavigationSetter,
  browserWindow: Pick<Window, "history"> = window,
): void {
  if (canNavigateBackInApp(browserWindow.history.state)) {
    browserWindow.history.back();
    return;
  }

  navigate(fallbackPath, { replace: true });
}

/**
 * Returns to the exact prior SavvyOS route. Direct loads and new tabs use the
 * supplied module route instead of leaving the application or doing nothing.
 */
export function useAppBack(fallbackPath: string): () => void {
  const [, navigate] = useLocation();

  return useCallback(() => {
    navigateBackInApp(fallbackPath, navigate);
  }, [fallbackPath, navigate]);
}
