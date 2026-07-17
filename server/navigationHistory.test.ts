import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canNavigateBackInApp,
  createAppHistoryState,
  getAppHistoryIndex,
  initializeAppHistory,
  navigateBackInApp,
} from "../client/src/lib/navigationHistory";

afterEach(() => {
  vi.unstubAllGlobals();
});

function createFakeWindow(initialState: unknown = null) {
  const history = {
    state: initialState,
    back: vi.fn(),
    pushState(state: unknown) {
      this.state = state;
    },
    replaceState(state: unknown) {
      this.state = state;
    },
  } as unknown as History;

  return {
    history,
    location: { href: "https://os.savvy-agents.com/contacts/42" },
  } as unknown as Window;
}

describe("SavvyOS navigation history", () => {
  it("adds an app index while preserving existing object history state", () => {
    const state = createAppHistoryState({ modal: "contact" }, 3);

    expect(state).toMatchObject({ modal: "contact" });
    expect(getAppHistoryIndex(state)).toBe(3);
  });

  it("rejects missing, negative, and non-integer app indexes", () => {
    expect(getAppHistoryIndex(null)).toBeNull();
    expect(getAppHistoryIndex({})).toBeNull();
    expect(getAppHistoryIndex({ __savvyOsHistoryIndex: -1 })).toBeNull();
    expect(getAppHistoryIndex({ __savvyOsHistoryIndex: 1.5 })).toBeNull();
  });

  it("tracks push and replace depth and patches browser history only once", () => {
    const fakeWindow = createFakeWindow({ existing: true });
    vi.stubGlobal("window", fakeWindow);

    initializeAppHistory();
    initializeAppHistory();

    expect(getAppHistoryIndex(fakeWindow.history.state)).toBe(0);
    expect(fakeWindow.history.state).toMatchObject({ existing: true });

    fakeWindow.history.pushState(null, "", "/transactions/10");
    expect(getAppHistoryIndex(fakeWindow.history.state)).toBe(1);

    fakeWindow.history.pushState(null, "", "/contacts/42");
    expect(getAppHistoryIndex(fakeWindow.history.state)).toBe(2);

    fakeWindow.history.replaceState({ tab: "activity" }, "", "/contacts/42?tab=activity");
    expect(getAppHistoryIndex(fakeWindow.history.state)).toBe(2);
    expect(fakeWindow.history.state).toMatchObject({ tab: "activity" });
  });

  it("uses browser history when the page has an in-app predecessor", () => {
    const navigate = vi.fn();
    const fakeWindow = createFakeWindow(createAppHistoryState(null, 2));

    expect(canNavigateBackInApp(fakeWindow.history.state)).toBe(true);
    navigateBackInApp("/contacts", navigate, fakeWindow);

    expect(fakeWindow.history.back).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("replaces direct-entry pages with their safe module fallback", () => {
    const navigate = vi.fn();
    const fakeWindow = createFakeWindow(createAppHistoryState(null, 0));

    expect(canNavigateBackInApp(fakeWindow.history.state)).toBe(false);
    navigateBackInApp("/contacts", navigate, fakeWindow);

    expect(fakeWindow.history.back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/contacts", { replace: true });
  });
});
