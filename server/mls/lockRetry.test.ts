import { describe, expect, it, vi } from "vitest";
import { isRetryableLockError, withLockRetry } from "./media";

function deadlock() {
  const cause = Object.assign(new Error("Deadlock found when trying to get lock; try restarting transaction"), {
    code: "ER_LOCK_DEADLOCK",
    errno: 1213,
  });
  return Object.assign(new Error("Failed query: UPDATE mls_media ..."), { cause });
}

describe("MLS media lock retry", () => {
  it("recognizes a deadlock wrapped by drizzle", () => {
    expect(isRetryableLockError(deadlock())).toBe(true);
    expect(isRetryableLockError(Object.assign(new Error("lock wait"), { errno: 1205 }))).toBe(true);
    expect(isRetryableLockError(new Error("syntax error"))).toBe(false);
    expect(isRetryableLockError(undefined)).toBe(false);
  });

  it("retries a deadlocked statement and returns its result", async () => {
    const run = vi.fn().mockRejectedValueOnce(deadlock()).mockResolvedValueOnce("ok");
    await expect(withLockRetry(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    const run = vi.fn().mockRejectedValue(new Error("syntax error"));
    await expect(withLockRetry(run)).rejects.toThrow("syntax error");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt limit", async () => {
    const run = vi.fn().mockRejectedValue(deadlock());
    await expect(withLockRetry(run, 3)).rejects.toThrow("Failed query");
    expect(run).toHaveBeenCalledTimes(3);
  });
});
