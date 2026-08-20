import { describe, expect, it } from "vitest";
import {
  appendSignatureToCustomEmail,
  isCompleteEmailDocument,
  renderSavvyEmail,
} from "./savvyEmailTemplate";

describe("Savvy outbound email template", () => {
  it("wraps a standard message in the Savvy-branded shell", () => {
    const html = renderSavvyEmail("Welcome", "<p>Hello there</p>", true);

    expect(html).toContain("Savvy STR Agents");
    expect(html).toContain("Welcome");
    expect(html).toContain("<p>Hello there</p>");
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(html).toContain("background-color:#ffffff; border:1px solid #e5e7eb; border-bottom:0");
    expect(html).not.toContain("background-color:#0d2137");
  });

  it("recognizes and preserves a sender-authored full HTML document", () => {
    const customHtml = "<!doctype html><html><body><main>Custom content</main></body></html>";
    const signedHtml = appendSignatureToCustomEmail(customHtml, "<p>Agent signature</p>");

    expect(isCompleteEmailDocument(customHtml)).toBe(true);
    expect(signedHtml).toContain("<main>Custom content</main>");
    expect(signedHtml).toContain("<p>Agent signature</p>");
    expect(signedHtml).not.toContain("Savvy STR Agents");
  });
});
