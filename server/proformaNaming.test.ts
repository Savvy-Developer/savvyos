import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const router = readFileSync(path.join(__dirname, "routers/properties.ts"), "utf8");
const slice = (from: string, to: string) => router.slice(router.indexOf(from), router.indexOf(to));

describe("pro-forma names and labels", () => {
  it("the property's pro-forma list says Draft/Final and which one the website uses", () => {
    const list = slice("listProformas: protectedProcedure", "listAllProformas: protectedProcedure");
    expect(list).toContain("status: proformas.status");
    expect(list).toContain("eq(websiteProperties.sourceProformaId, proformas.id)");
    expect(list).toContain("onWebsite: websiteLinkId != null");
    // Agents still only see their own.
    expect(list).toContain("eq(proformas.createdByUserId, ctx.user.id)");
  });

  it("rename changes only the name, with the same access rule as editing", () => {
    const rename = slice("renameProforma: protectedProcedure", "deleteProforma: protectedProcedure");
    expect(rename).toMatch(/title: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(255\)/);
    expect(rename).toContain('ctx.user.role === "agent" && existing.createdByUserId !== ctx.user.id');
    expect(rename).toContain(".set({ title: input.title } as any)");
    expect(rename).not.toContain("formData");
  });

  it("new pro-formas get a numbered default name when the property already has some", () => {
    const page = readFileSync(path.join(__dirname, "../client/src/pages/ProformaPage.tsx"), "utf8");
    expect(page).toContain("setTitle(`STR Investment Analysis ${count + 1}`)");
    expect(page).toContain('title !== "STR Investment Analysis"');
  });
});
