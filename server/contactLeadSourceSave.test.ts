import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contactDetail = () => readFileSync("client/src/pages/ContactDetail.tsx", "utf-8");

describe("contact lead-source save flow", () => {
  it("persists an authorized lead-source correction from the primary Save Changes action", () => {
    const source = contactDetail();
    const handlerStart = source.indexOf("async function handleSaveContactEdit()");
    const handlerEnd = source.indexOf("\n  const createConnection", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handler).toContain("const leadSourceChanged = canEditContactLeadSource");
    expect(handler).toMatch(/if \(leadSourceChanged\) \{\s*await updateContactLeadSource\.mutateAsync\(/);
    expect(handler).toMatch(/await updateContactLeadSource\.mutateAsync\([\s\S]*await updateContact\.mutateAsync\(/);
  });

  it("locks the primary Save Changes action while either contact mutation is running", () => {
    const source = contactDetail();

    expect(source).toContain("updateContact.isPending || updateContactLeadSource.isPending || checkDupMut.isPending");
  });
});
