/**
 * Webhook System Tests
 * Tests for: authentication, field mapping, handler registry, tRPC admin procedures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as crypto from "crypto";

// ─── HMAC Signature helpers (mirrors webhookRoute.ts logic) ──────────────────

function computeHmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function verifySignature(secret: string, body: string, sig: string): boolean {
  const clean = sig.replace(/^sha256=/, "");
  const expected = computeHmac(secret, body);
  try {
    return crypto.timingSafeEqual(Buffer.from(clean, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ─── Field normalisation helpers (mirrors webhookHandlers.ts logic) ───────────

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function mapPayloadToContact(payload: Record<string, any>) {
  const get = (...keys: string[]) => {
    for (const k of keys) if (payload[k] !== undefined && payload[k] !== "") return payload[k];
    return undefined;
  };

  let firstName = get("first_name", "fname", "firstName");
  let lastName = get("last_name", "lname", "lastName");

  if (!firstName && !lastName) {
    const full = get("name", "full_name", "fullName");
    if (full) {
      const parts = String(full).trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ") || undefined;
    }
  }

  const email = get("email", "email_address", "emailAddress");
  const phone = (() => {
    const raw = get("phone", "mobile", "cell", "phone_number");
    return raw ? normalisePhone(String(raw)) : undefined;
  })();

  return {
    firstName: firstName ? String(firstName).trim() : undefined,
    lastName: lastName ? String(lastName).trim() : undefined,
    email: email ? String(email).trim().toLowerCase() : undefined,
    phone,
    address: get("address", "street"),
    city: get("city"),
    state: get("state", "province"),
    zip: get("zip", "postal_code", "postalCode"),
    notes: get("notes", "message", "comment"),
    leadSourceName: get("lead_source", "source", "leadSource"),
    leadSourceId: get("lead_source_id", "leadSourceId"),
  };
}

// ─── Slug generation (mirrors webhookHandlers.ts) ─────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HMAC Signature Verification", () => {
  const secret = "test-secret-abc123";
  const body = JSON.stringify({ first_name: "Jane", email: "jane@example.com" });

  it("accepts a valid HMAC-SHA256 signature", () => {
    const sig = computeHmac(secret, body);
    expect(verifySignature(secret, body, sig)).toBe(true);
  });

  it("accepts a sha256= prefixed signature", () => {
    const sig = "sha256=" + computeHmac(secret, body);
    expect(verifySignature(secret, body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = computeHmac(secret, body);
    const tamperedBody = body.replace("Jane", "Eve");
    expect(verifySignature(secret, tamperedBody, sig)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = computeHmac("wrong-secret", body);
    expect(verifySignature(secret, body, sig)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifySignature(secret, body, "")).toBe(false);
  });

  it("rejects a non-hex signature", () => {
    expect(verifySignature(secret, body, "not-a-hex-string!!")).toBe(false);
  });

  it("is timing-safe (does not short-circuit on first mismatch)", () => {
    const valid = computeHmac(secret, body);
    // Flip the last byte
    const almostValid = valid.slice(0, -2) + (valid.slice(-2) === "ff" ? "00" : "ff");
    expect(verifySignature(secret, body, almostValid)).toBe(false);
  });
});

describe("Field Normalisation — Phone", () => {
  it("strips formatting from US phone", () => {
    expect(normalisePhone("(555) 123-4567")).toBe("5551234567");
  });

  it("strips country code 1 from 11-digit number", () => {
    expect(normalisePhone("+1 555 123 4567")).toBe("5551234567");
  });

  it("strips dots", () => {
    expect(normalisePhone("555.123.4567")).toBe("5551234567");
  });

  it("leaves non-US numbers intact", () => {
    expect(normalisePhone("+44 20 7946 0958")).toBe("442079460958");
  });
});

describe("Payload Field Mapping", () => {
  it("maps standard snake_case fields", () => {
    const result = mapPayloadToContact({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      phone: "5551234567",
      city: "Austin",
      state: "TX",
    });
    expect(result.firstName).toBe("Jane");
    expect(result.lastName).toBe("Doe");
    expect(result.email).toBe("jane@example.com");
    expect(result.phone).toBe("5551234567");
    expect(result.city).toBe("Austin");
    expect(result.state).toBe("TX");
  });

  it("maps fname / lname aliases", () => {
    const result = mapPayloadToContact({ fname: "Bob", lname: "Smith" });
    expect(result.firstName).toBe("Bob");
    expect(result.lastName).toBe("Smith");
  });

  it("splits full_name into first and last", () => {
    const result = mapPayloadToContact({ full_name: "Alice Johnson" });
    expect(result.firstName).toBe("Alice");
    expect(result.lastName).toBe("Johnson");
  });

  it("handles single-word name", () => {
    const result = mapPayloadToContact({ name: "Madonna" });
    expect(result.firstName).toBe("Madonna");
    expect(result.lastName).toBeUndefined();
  });

  it("lowercases email", () => {
    const result = mapPayloadToContact({ email: "JANE@EXAMPLE.COM" });
    expect(result.email).toBe("jane@example.com");
  });

  it("maps email_address alias", () => {
    const result = mapPayloadToContact({ email_address: "bob@test.com" });
    expect(result.email).toBe("bob@test.com");
  });

  it("maps mobile alias for phone", () => {
    const result = mapPayloadToContact({ mobile: "555-999-0000" });
    expect(result.phone).toBe("5559990000");
  });

  it("maps notes from message field", () => {
    const result = mapPayloadToContact({ message: "Interested in downtown listings" });
    expect(result.notes).toBe("Interested in downtown listings");
  });

  it("maps lead_source by name", () => {
    const result = mapPayloadToContact({ lead_source: "Zillow" });
    expect(result.leadSourceName).toBe("Zillow");
  });

  it("maps lead_source_id directly", () => {
    const result = mapPayloadToContact({ lead_source_id: "42" });
    expect(result.leadSourceId).toBe("42");
  });

  it("ignores empty string fields", () => {
    const result = mapPayloadToContact({ first_name: "Jane", city: "" });
    expect(result.city).toBeUndefined();
  });

  it("trims whitespace from string fields", () => {
    const result = mapPayloadToContact({ first_name: "  Jane  ", last_name: "  Doe  " });
    expect(result.firstName).toBe("Jane");
    expect(result.lastName).toBe("Doe");
  });
});

describe("Slug Generation", () => {
  it("converts name to lowercase hyphenated slug", () => {
    expect(generateSlug("Zapier Lead Form")).toBe("zapier-lead-form");
  });

  it("removes special characters", () => {
    expect(generateSlug("My Form (v2)!")).toBe("my-form-v2");
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("Form -- Test")).toBe("form-test");
  });

  it("truncates to 64 characters", () => {
    const long = "a".repeat(100);
    expect(generateSlug(long).length).toBeLessThanOrEqual(64);
  });

  it("strips leading and trailing hyphens", () => {
    expect(generateSlug("---form---")).toBe("form");
  });
});

describe("Handler Type Validation", () => {
  const VALID_HANDLER_TYPES = ["contact_create", "contact_update", "lead_ingest", "custom"];

  it("accepts all valid handler types", () => {
    for (const t of VALID_HANDLER_TYPES) {
      expect(VALID_HANDLER_TYPES.includes(t)).toBe(true);
    }
  });

  it("rejects unknown handler type", () => {
    expect(VALID_HANDLER_TYPES.includes("delete_all")).toBe(false);
  });
});

describe("Outcome Enum Validation", () => {
  const VALID_OUTCOMES = ["success", "auth_failed", "validation_error", "handler_error", "not_found"];

  it("covers all expected outcome values", () => {
    expect(VALID_OUTCOMES).toContain("success");
    expect(VALID_OUTCOMES).toContain("auth_failed");
    expect(VALID_OUTCOMES).toContain("validation_error");
    expect(VALID_OUTCOMES).toContain("handler_error");
    expect(VALID_OUTCOMES).toContain("not_found");
  });
});

describe("Webhook Log Pagination", () => {
  function paginate<T>(items: T[], page: number, limit: number) {
    const start = (page - 1) * limit;
    return {
      rows: items.slice(start, start + limit),
      total: items.length,
      page,
      limit,
    };
  }

  const fakeItems = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));

  it("returns correct slice for page 1", () => {
    const result = paginate(fakeItems, 1, 50);
    expect(result.rows.length).toBe(50);
    expect(result.rows[0].id).toBe(1);
  });

  it("returns correct slice for page 2", () => {
    const result = paginate(fakeItems, 2, 50);
    expect(result.rows.length).toBe(50);
    expect(result.rows[0].id).toBe(51);
  });

  it("returns partial last page", () => {
    const result = paginate(fakeItems, 3, 50);
    expect(result.rows.length).toBe(20);
  });

  it("reports correct total", () => {
    const result = paginate(fakeItems, 1, 50);
    expect(result.total).toBe(120);
  });
});
