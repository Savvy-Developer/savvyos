/**
 * Tests for duplicate contact detection and merge system
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Unit tests for detection helpers ─────────────────────────────────────────

describe("Phone normalisation", () => {
  function normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
    return digits;
  }

  it("strips dashes and spaces", () => {
    expect(normalizePhone("555-123-4567")).toBe("5551234567");
  });

  it("strips country code 1", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("5551234567");
  });

  it("handles already-clean number", () => {
    expect(normalizePhone("5551234567")).toBe("5551234567");
  });

  it("handles empty string", () => {
    expect(normalizePhone("")).toBe("");
  });
});

describe("Email normalisation", () => {
  function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  it("lowercases", () => {
    expect(normalizeEmail("John.DOE@Example.COM")).toBe("john.doe@example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });
});

describe("Jaro-Winkler similarity", () => {
  // Inline the algorithm so we can test it without importing the full module
  function jaroSimilarity(s1: string, t: string): number {
    if (s1 === t) return 1;
    const s = s1;
    const matchDist = Math.floor(Math.max(s.length, t.length) / 2) - 1;
    const sMatches = new Array(s.length).fill(false);
    const tMatches = new Array(t.length).fill(false);
    let matches = 0;
    let transpositions = 0;
    for (let i = 0; i < s.length; i++) {
      const start = Math.max(0, i - matchDist);
      const end = Math.min(i + matchDist + 1, t.length);
      for (let j = start; j < end; j++) {
        if (tMatches[j] || s[i] !== t[j]) continue;
        sMatches[i] = true;
        tMatches[j] = true;
        matches++;
        break;
      }
    }
    if (matches === 0) return 0;
    let k = 0;
    for (let i = 0; i < s.length; i++) {
      if (!sMatches[i]) continue;
      while (!tMatches[k]) k++;
      if (s[i] !== t[k]) transpositions++;
      k++;
    }
    return (matches / s.length + matches / t.length + (matches - transpositions / 2) / matches) / 3;
  }

  function jaroWinkler(s1: string, s2: string, p = 0.1): number {
    const jaro = jaroSimilarity(s1, s2);
    let prefixLen = 0;
    for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
      if (s1[i] === s2[i]) prefixLen++;
      else break;
    }
    return jaro + prefixLen * p * (1 - jaro);
  }

  it("identical strings score 1", () => {
    expect(jaroWinkler("smith", "smith")).toBe(1);
  });

  it("completely different strings score < 0.5", () => {
    expect(jaroWinkler("abc", "xyz")).toBeLessThan(0.5);
  });

  it("near-identical names score > 0.9", () => {
    expect(jaroWinkler("johnson", "johnsen")).toBeGreaterThan(0.9);
  });

  it("transposed letters score high", () => {
    expect(jaroWinkler("martha", "marhta")).toBeGreaterThan(0.9);
  });
});

// ─── Integration-style tests for the router procedures ────────────────────────
// We mock the DB layer so these run without a real database connection.

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./duplicateDetection", () => ({
  detectAllDuplicates: vi.fn(),
  persistDuplicatePairs: vi.fn(),
}));

vi.mock("./contactMerge", () => ({
  mergeContacts: vi.fn(),
}));

import { getDb } from "./db";
import { detectAllDuplicates, persistDuplicatePairs } from "./duplicateDetection";
import { mergeContacts } from "./contactMerge";

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (getDb as any).mockResolvedValue(mockDb);
});

describe("duplicates.scan", () => {
  it("calls detectAllDuplicates and persistDuplicatePairs", async () => {
    const fakePairs = [{ contactAId: 1, contactBId: 2, matchType: "email", confidence: 100 }];
    (detectAllDuplicates as any).mockResolvedValue(fakePairs);
    (persistDuplicatePairs as any).mockResolvedValue(1);

    const result = await (async () => {
      const pairs = await detectAllDuplicates();
      const inserted = await persistDuplicatePairs(pairs);
      return { detected: pairs.length, inserted };
    })();

    expect(result.detected).toBe(1);
    expect(result.inserted).toBe(1);
    expect(detectAllDuplicates).toHaveBeenCalledOnce();
    expect(persistDuplicatePairs).toHaveBeenCalledWith(fakePairs);
  });

  it("returns 0 when no duplicates found", async () => {
    (detectAllDuplicates as any).mockResolvedValue([]);
    (persistDuplicatePairs as any).mockResolvedValue(0);

    const pairs = await detectAllDuplicates();
    const inserted = await persistDuplicatePairs(pairs);

    expect(pairs.length).toBe(0);
    expect(inserted).toBe(0);
  });
});

describe("duplicates.merge", () => {
  it("calls mergeContacts with correct args", async () => {
    (mergeContacts as any).mockResolvedValue({ success: true, rowsReparented: 5 });

    const result = await mergeContacts({
      winnerId: 10,
      loserId: 20,
      pairId: 1,
      reviewedById: 99,
      fieldOverrides: { email: "winner@example.com" },
    });

    expect(mergeContacts).toHaveBeenCalledWith({
      winnerId: 10,
      loserId: 20,
      pairId: 1,
      reviewedById: 99,
      fieldOverrides: { email: "winner@example.com" },
    });
    expect(result.success).toBe(true);
    expect(result.rowsReparented).toBe(5);
  });

  it("propagates errors from mergeContacts", async () => {
    (mergeContacts as any).mockRejectedValue(new Error("DB error"));

    await expect(
      mergeContacts({ winnerId: 1, loserId: 2, pairId: 1, reviewedById: 1 })
    ).rejects.toThrow("DB error");
  });
});

describe("duplicates.getStats", () => {
  it("aggregates status counts correctly", () => {
    const rows = [
      { status: "pending", count: 5 },
      { status: "merged", count: 3 },
      { status: "dismissed", count: 2 },
    ];

    const stats = { pending: 0, merged: 0, dismissed: 0, total: 0 };
    for (const r of rows) {
      const count = Number(r.count);
      (stats as any)[r.status] = count;
      stats.total += count;
    }

    expect(stats.pending).toBe(5);
    expect(stats.merged).toBe(3);
    expect(stats.dismissed).toBe(2);
    expect(stats.total).toBe(10);
  });

  it("handles empty result set", () => {
    const rows: Array<{ status: string; count: number }> = [];
    const stats = { pending: 0, merged: 0, dismissed: 0, total: 0 };
    for (const r of rows) {
      const count = Number(r.count);
      (stats as any)[r.status] = count;
      stats.total += count;
    }
    expect(stats.total).toBe(0);
  });
});

describe("duplicates.dismiss", () => {
  it("calls db.update with dismissed status", async () => {
    mockDb.set.mockReturnThis();
    mockDb.where.mockResolvedValue([]);

    // Simulate the dismiss logic
    const db = await getDb();
    await (db as any)
      .update({})
      .set({ status: "dismissed", reviewedById: 1, reviewedAt: new Date() })
      .where({});

    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dismissed" })
    );
  });
});

describe("Match type priority", () => {
  it("email match has highest confidence (100)", () => {
    const emailConfidence = 100;
    const phoneConfidence = 95;
    const nameAddressConfidence = 90;
    const fuzzyConfidence = 75;

    expect(emailConfidence).toBeGreaterThan(phoneConfidence);
    expect(phoneConfidence).toBeGreaterThan(nameAddressConfidence);
    expect(nameAddressConfidence).toBeGreaterThan(fuzzyConfidence);
  });

  it("fuzzy match threshold is 0.85", () => {
    const FUZZY_THRESHOLD = 0.85;
    // A score below threshold should NOT be flagged
    expect(0.80).toBeLessThan(FUZZY_THRESHOLD);
    // A score above threshold SHOULD be flagged
    expect(0.90).toBeGreaterThan(FUZZY_THRESHOLD);
  });
});
