import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(path, "utf-8");

describe("Pro-forma how-to video", () => {
  it("uses one shared Google Drive video dialog on both pro-forma pages", () => {
    const dialog = readSource("client/src/components/ProformaHowToDialog.tsx");
    const listPage = readSource("client/src/pages/MyProformasPage.tsx");
    const editorPage = readSource("client/src/pages/ProformaPage.tsx");

    expect(dialog).toContain("How to use?");
    expect(dialog).toContain(
      "https://drive.google.com/file/d/13d5kdA9ioLbFI59t7rQ9fMKXzpdKe6MM/preview",
    );
    expect(dialog).toContain('title="How to use the Pro-forma Tool"');
    expect(dialog).toContain("allowFullScreen");
    expect(listPage).toContain("<ProformaHowToDialog />");
    expect(editorPage).toContain("<ProformaHowToDialog />");
  });
});
