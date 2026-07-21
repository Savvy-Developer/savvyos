import { describe, expect, it } from "vitest";
import {
  CONTACT_INFORMATION_FIELDS,
  NO_EXCLUDED_FIELDS,
  shouldResetLeadAging,
} from "./leadAging";

describe("lead aging reset policy", () => {
  const connection = {
    pipelineStatus: "new_lead",
    followUpDate: new Date("2026-06-01T00:00:00.000Z"),
    agentNotes: "Initial note",
  };

  const contact = {
    firstName: "Taylor",
    lastName: "Lead",
    email: "taylor@example.com",
    phone: "555-0100",
    notes: "Initial note",
    leadSourceId: 10,
    timezone: "America/New_York",
  };

  it("resets when an agent makes a real connection-field change", () => {
    expect(shouldResetLeadAging(
      "agent",
      connection,
      { pipelineStatus: "attempted_contact" },
      NO_EXCLUDED_FIELDS,
    )).toBe(true);
  });

  it("does not reset for an agent connection no-op", () => {
    expect(shouldResetLeadAging(
      "agent",
      connection,
      { agentNotes: "Initial note" },
      NO_EXCLUDED_FIELDS,
    )).toBe(false);
  });

  it("does not reset when an admin or ISA changes a connection", () => {
    expect(shouldResetLeadAging(
      "admin",
      connection,
      { agentNotes: "Updated note" },
      NO_EXCLUDED_FIELDS,
    )).toBe(false);
    expect(shouldResetLeadAging(
      "isa",
      connection,
      { agentNotes: "Updated note" },
      NO_EXCLUDED_FIELDS,
    )).toBe(false);
  });

  it("does not reset when an agent changes contact information only", () => {
    expect(shouldResetLeadAging(
      "agent",
      contact,
      { email: "new-email@example.com", phone: "555-0199", timezone: "America/Chicago" },
    )).toBe(false);
  });

  it("resets when an agent changes a non-contact lead field", () => {
    expect(shouldResetLeadAging(
      "agent",
      contact,
      { notes: "Qualified for a follow-up", leadSourceId: 12 },
    )).toBe(true);
  });

  it("resets when a contact update includes both contact and non-contact changes", () => {
    expect(shouldResetLeadAging(
      "agent",
      contact,
      { email: "new-email@example.com", notes: "Agent follow-up completed" },
      CONTACT_INFORMATION_FIELDS,
    )).toBe(true);
  });
});
