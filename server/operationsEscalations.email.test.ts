import { describe, expect, it } from "vitest";
import { getEmailPreview } from "./_core/resendEmail";

describe("Operations Escalations resolution email", () => {
  it("renders the escalation, resolution, resolver, and queue link", () => {
    const preview = getEmailPreview("operations_escalation_resolved", {
      recipientEmail: "coach@example.com",
      recipientName: "Casey Coach",
      agentName: "Avery Agent",
      operationsEscalationDescription: "The agent cannot access the listing intake workflow.",
      operationsEscalationResolution: "Operations restored access and confirmed the workflow is available.",
      operationsEscalationResolverName: "Taylor Admin",
      operationsEscalationSubmittedAt: "Sep 17, 2026",
    });

    expect(preview.subject).toBe("Operations Escalation Resolved — Avery Agent");
    expect(preview.html).toContain("The agent cannot access the listing intake workflow.");
    expect(preview.html).toContain("Operations restored access and confirmed the workflow is available.");
    expect(preview.html).toContain("Taylor Admin");
    expect(preview.html).toContain("https://os.savvy-agents.com/operations-escalations");
  });
});
