import { describe, expect, it } from "vitest";
import { isAgentExtendedProfileComplete } from "./agentProfileReminderScheduler";

const completeAgent = {
  id: 1,
  name: "Avery Agent",
  email: "avery@example.com",
  userPhone: "(615) 555-0100",
  preferredName: "Avery",
  personalEmail: "avery.personal@example.com",
  primaryPhone: "(615) 555-0100",
  timeZone: "America/Chicago",
  addressLine1: "123 Main Street",
  city: "Nashville",
  state: "TN",
  zip: "37201",
  emergencyContactName: "Jamie Agent",
  emergencyContactPhone: "(615) 555-0101",
  emergencyContactRelationship: "Spouse",
  licenseNumber: "123456",
  licenseState: "TN",
  licenseExpirationDate: new Date("2027-12-31T00:00:00Z"),
  brokerageAffiliation: "Savvy STR Agents",
  brokerFullName: "Broker Name",
  brokerEmail: "broker@example.com",
  brokerOfficeNumber: "(615) 555-0102",
  bio: "An experienced short-term rental investment agent.",
  directorySpecialties: "Short-Term Rentals",
  directoryLanguages: "English",
  boardAssociation: "Local Association",
  mlsId: "MLS-123",
  narId: "NAR-456",
};

describe("isAgentExtendedProfileComplete", () => {
  it("accepts an agent with all meaningful agent-owned fields", () => {
    expect(isAgentExtendedProfileComplete(completeAgent)).toBe(true);
  });

  it("requires meaningful profile details while allowing inapplicable optional fields", () => {
    expect(
      isAgentExtendedProfileComplete({ ...completeAgent, licenseNumber: null })
    ).toBe(false);
    expect(
      isAgentExtendedProfileComplete({
        ...completeAgent,
        emergencyContactPhone: "",
      })
    ).toBe(false);
  });

  it("uses the account email and phone when an extended profile has not duplicated them", () => {
    expect(
      isAgentExtendedProfileComplete({
        ...completeAgent,
        personalEmail: null,
        primaryPhone: null,
      })
    ).toBe(true);
  });
});
