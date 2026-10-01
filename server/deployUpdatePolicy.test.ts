import { describe, expect, it } from "vitest";
import {
  AUTO_APPLY_HIDDEN_MS,
  UPDATE_SNOOZE_MS,
  isDraftField,
  shouldAutoApplyUpdate,
  shouldShowUpdatePrompt,
} from "@shared/deployUpdatePolicy";

const now = 1_000_000_000;

describe("shouldAutoApplyUpdate", () => {
  const base = {
    updatePending: true,
    hidden: true,
    hiddenSince: now - AUTO_APPLY_HIDDEN_MS,
    hasUnsavedWork: false,
    now,
  };

  it("applies only when the tab has been in the background long enough and nothing is unsaved", () => {
    expect(shouldAutoApplyUpdate(base)).toBe(true);
  });

  it("never reloads a visible tab", () => {
    expect(shouldAutoApplyUpdate({ ...base, hidden: false, hiddenSince: null })).toBe(false);
  });

  it("never reloads when there is unsaved work", () => {
    expect(shouldAutoApplyUpdate({ ...base, hasUnsavedWork: true })).toBe(false);
  });

  it("waits for the background grace period", () => {
    expect(shouldAutoApplyUpdate({ ...base, hiddenSince: now - AUTO_APPLY_HIDDEN_MS + 1 })).toBe(false);
  });

  it("does nothing without a pending update", () => {
    expect(shouldAutoApplyUpdate({ ...base, updatePending: false })).toBe(false);
  });
});

describe("shouldShowUpdatePrompt", () => {
  it("shows once when an update is pending", () => {
    expect(shouldShowUpdatePrompt({ updatePending: true, promptVisible: false, snoozedAt: null, now })).toBe(true);
    expect(shouldShowUpdatePrompt({ updatePending: true, promptVisible: true, snoozedAt: null, now })).toBe(false);
  });

  it("respects the snooze window", () => {
    expect(shouldShowUpdatePrompt({ updatePending: true, promptVisible: false, snoozedAt: now - 1, now })).toBe(false);
    expect(shouldShowUpdatePrompt({ updatePending: true, promptVisible: false, snoozedAt: now - UPDATE_SNOOZE_MS, now })).toBe(true);
  });
});

describe("isDraftField", () => {
  it("treats text areas, rich-text editors and text inputs as drafts", () => {
    expect(isDraftField({ tagName: "TEXTAREA" })).toBe(true);
    expect(isDraftField({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isDraftField({ tagName: "INPUT", type: "text", label: "Title" })).toBe(true);
  });

  it("ignores search boxes, filters and non-text controls", () => {
    expect(isDraftField({ tagName: "INPUT", type: "search" })).toBe(false);
    expect(isDraftField({ tagName: "INPUT", type: "text", label: "Search contacts…" })).toBe(false);
    expect(isDraftField({ tagName: "INPUT", type: "text", role: "combobox" })).toBe(false);
    expect(isDraftField({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isDraftField({ tagName: "INPUT", type: "password" })).toBe(false);
    expect(isDraftField({ tagName: "TEXTAREA", optedOut: true })).toBe(false);
  });
});
