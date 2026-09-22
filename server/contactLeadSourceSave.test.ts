import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contactDetail = () => readFileSync("client/src/pages/ContactDetail.tsx", "utf-8");

describe("contact lead-source save flow", () => {
  it("sends an authorized lead-source correction in the primary Save Changes request", () => {
    const source = contactDetail();
    const handlerStart = source.indexOf("async function handleSaveContactEdit()");
    const handlerEnd = source.indexOf("\n  const createConnection", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handler).toContain("updateContact.mutate({");
    expect(handler).toContain("leadSourceId: canEditContactLeadSource ? editForm.leadSourceId ?? undefined : undefined");
    expect(handler).not.toContain("updateContactLeadSource");
  });

  it("uses Save Changes as the only contact attribution action", () => {
    const source = contactDetail();

    expect(source).not.toContain("Save Lead Source");
    expect(source).toContain("Save Changes applies it with the rest of this form");
  });
});
