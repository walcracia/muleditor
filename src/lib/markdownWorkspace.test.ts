import { describe, expect, it } from "vitest";
import { buildWorkspaceIndex } from "./workspace";
import type { DocumentTab } from "../types";

function tab(content: string): DocumentTab {
  return { id: "doc", name: "guide.md", relativePath: "guide.md", format: "markdown", content, originalContent: content, dirty: false };
}

describe("Markdown workspace and rendering share navigation semantics", () => {
  it("leaves image availability to the renderer instead of looking for image editor tabs", () => {
    const index = buildWorkspaceIndex([tab("# Section\n![Local](images/local.png)\n[Section](#section)")]);
    expect(index.byTabId.doc.references).toHaveLength(1);
    expect(index.byTabId.doc.diagnostics).toEqual([]);
  });

  it("resolves Setext and duplicate headings without treating fenced code as headings", () => {
    const index = buildWorkspaceIndex([tab("# Same\n# Same\nSetext\n---\n```md\n# Fake\n```\n[second](#same-1)\n[setext](#setext)")]);
    expect(index.byTabId.doc.declarations.map((item) => item.name)).toEqual(["same", "same-1", "setext"]);
    expect(index.byTabId.doc.diagnostics).toEqual([]);
  });

  it("reports malformed fragments without throwing during document analysis", () => {
    const index = buildWorkspaceIndex([tab("# Section\n[bad](#%xx)")]);
    expect(index.byTabId.doc.diagnostics).toHaveLength(1);
  });

  it("resolves generated footnote links and repeated-reference backlinks", () => {
    const index = buildWorkspaceIndex([tab("Text[^note] and again[^note].\n\n[^note]: Footnote text\n\n[Note](#fn1) [Back](#fnref1:1)")]);
    expect(index.byTabId.doc.diagnostics).toEqual([]);
  });
});
