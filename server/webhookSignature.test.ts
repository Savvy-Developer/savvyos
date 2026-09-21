import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  captureInboundRawBody,
  inboundRawBody,
  verifyInboundSignature,
} from "./webhookSignature";

const SECRET = "test-secret";
const sign = (body: string | Buffer) =>
  crypto.createHmac("sha256", SECRET).update(body).digest("hex");

describe("inbound webhook signatures", () => {
  it("accepts a signature over pretty-printed JSON, which re-serializing would break", () => {
    const raw = '{\n  "email": "a@b.com",\n  "notes": "caf\\u00e9"\n}';
    const parsed = JSON.parse(raw);
    expect(JSON.stringify(parsed)).not.toBe(raw);
    expect(verifyInboundSignature(SECRET, sign(raw), Buffer.from(raw), parsed)).toBe(true);
  });

  it("accepts a signed form post", () => {
    const raw = "email=a%40b.com&first_name=Ann";
    expect(
      verifyInboundSignature(SECRET, `sha256=${sign(raw)}`, Buffer.from(raw), { email: "a@b.com", first_name: "Ann" }),
    ).toBe(true);
  });

  it("still accepts senders that signed the compact re-serialized body", () => {
    const parsed = { email: "a@b.com" };
    const raw = '{ "email": "a@b.com" }';
    expect(verifyInboundSignature(SECRET, sign(JSON.stringify(parsed)), Buffer.from(raw), parsed)).toBe(true);
  });

  it("rejects a wrong, missing, or malformed signature", () => {
    const raw = '{"email":"a@b.com"}';
    const parsed = JSON.parse(raw);
    const other = crypto.createHmac("sha256", "other").update(raw).digest("hex");
    expect(verifyInboundSignature(SECRET, other, Buffer.from(raw), parsed)).toBe(false);
    expect(verifyInboundSignature(SECRET, undefined, Buffer.from(raw), parsed)).toBe(false);
    expect(verifyInboundSignature(SECRET, "not-hex", Buffer.from(raw), parsed)).toBe(false);
    expect(verifyInboundSignature(SECRET, sign(raw).slice(0, 10), Buffer.from(raw), parsed)).toBe(false);
  });

  it("rejects a body changed after signing", () => {
    const raw = '{"email":"a@b.com"}';
    const tampered = '{"email":"x@b.com"}';
    expect(verifyInboundSignature(SECRET, sign(raw), Buffer.from(tampered), JSON.parse(tampered))).toBe(false);
  });

  it("keeps raw bytes only for inbound webhook requests", () => {
    const inbound: Record<string, unknown> = { originalUrl: "/api/inbound/zapier-leads" };
    const other: Record<string, unknown> = { originalUrl: "/api/trpc/website.submitLead" };
    captureInboundRawBody(inbound, {}, Buffer.from("{}"));
    captureInboundRawBody(other, {}, Buffer.from("{}"));
    expect(inboundRawBody(inbound)?.toString()).toBe("{}");
    expect(inboundRawBody(other)).toBeUndefined();
  });
});
