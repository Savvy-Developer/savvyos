import { describe, expect, it } from "vitest";

import { CONTACT_NOTES_MAX_LENGTH, appendContactNote } from "./contactNotes";

describe("appendContactNote", () => {
  /** The bug: a second booking used to replace the first. */
  it("keeps what was there and adds the new note after it", () => {
    expect(appendContactNote("Booked Cost Seg call", "Booked Market Match call")).toBe(
      "Booked Cost Seg call\n\nBooked Market Match call"
    );
  });

  it("keeps an agent's own notes when a booking arrives", () => {
    const agent = "Spoke Tuesday, wants a cabin under 600k";
    expect(appendContactNote(agent, "Calendly: Agent Connect Call")).toContain(agent);
  });

  it("writes the note when the contact has none", () => {
    expect(appendContactNote(null, "First booking")).toBe("First booking");
    expect(appendContactNote("   ", "First booking")).toBe("First booking");
  });

  /** Nothing to add means no write, not an overwrite with blank. */
  it("writes nothing when the incoming note is empty", () => {
    expect(appendContactNote("Existing", "")).toBeNull();
    expect(appendContactNote("Existing", "   ")).toBeNull();
    expect(appendContactNote("Existing", null)).toBeNull();
  });

  /** Zapier retries resend the same payload. */
  it("does not stack a note that is already there", () => {
    const once = appendContactNote("Earlier", "Booked Cost Seg call")!;
    expect(appendContactNote(once, "Booked Cost Seg call")).toBeNull();
  });

  it("keeps the newest text when the notes outgrow the column", () => {
    const old = "old paragraph\n\n".repeat(3000);
    const result = appendContactNote(old, "the latest booking")!;
    expect(result.length).toBeLessThanOrEqual(CONTACT_NOTES_MAX_LENGTH);
    expect(result.endsWith("the latest booking")).toBe(true);
  });
});
