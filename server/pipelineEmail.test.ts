import { describe, expect, it } from "vitest";
import {
  PIPELINE_EMAIL_BATCH_LIMIT,
  PIPELINE_EMAIL_DAILY_LIMIT,
  pipelineUsageDate,
  renderPipelineMergeTags,
  sanitizePipelineEmailHtml,
  wrapPipelineEmail,
} from "./_core/pipelineEmail";

const mergeValues = {
  first_name: "Alex <script>",
  last_name: "Johnson",
  full_name: "Alex Johnson",
  agent_name: "Sarah Mitchell",
  sender_name: "Jordan Lee",
  lead_source: "Market Match",
};

describe("Pipeline email safety and rendering", () => {
  it("enforces the product batch and daily caps", () => {
    expect(PIPELINE_EMAIL_BATCH_LIMIT).toBe(250);
    expect(PIPELINE_EMAIL_DAILY_LIMIT).toBe(250);
  });

  it("removes executable HTML while preserving normal email formatting", () => {
    const clean = sanitizePipelineEmailHtml(
      '<p onclick="alert(1)">Hello <strong>there</strong></p><script>alert(2)</script><a href="javascript:alert(3)">bad</a>'
    );
    expect(clean).toContain("<p>Hello <strong>there</strong></p>");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("javascript:");
  });

  it("HTML-escapes contact values inserted into WYSIWYG content", () => {
    const rendered = renderPipelineMergeTags("<p>Hello {{ first_name }}</p>", mergeValues, "html");
    expect(rendered).toBe("<p>Hello Alex &lt;script&gt;</p>");
  });

  it("renders all supported subject merge tags as plain text", () => {
    const rendered = renderPipelineMergeTags(
      "{{full_name}} · {{agent_name}} · {{sender_name}} · {{lead_source}}",
      mergeValues,
      "text"
    );
    expect(rendered).toBe("Alex Johnson · Sarah Mitchell · Jordan Lee · Market Match");
  });

  it("uses the configured Eastern account day for daily quota buckets", () => {
    expect(pipelineUsageDate(new Date("2026-07-18T03:30:00.000Z"))).toBe("2026-07-17");
    expect(pipelineUsageDate(new Date("2026-07-18T04:30:00.000Z"))).toBe("2026-07-18");
  });

  it("wraps the body and optional signature in the branded email shell", () => {
    const html = wrapPipelineEmail("<p>Hello</p>", '<div onclick="bad()">Signature</div>');
    expect(html).toContain("Savvy STR Agents");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("Signature");
    expect(html).not.toContain("onclick");
  });
});
