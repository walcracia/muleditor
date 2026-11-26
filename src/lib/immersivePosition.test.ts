// @vitest-environment jsdom
import { EditorState } from "prosemirror-state";
import { expect, it } from "vitest";
import { immersiveSchema as schema, parseImmersiveMarkdown, immersivePositionAtSource, sourcePositionAtImmersive } from "./immersiveMarkdown";

it("locates the later duplicate paragraph without changing CRLF source bytes", () => {
  const source = ["same paragraph", "", ...Array.from({ length: 160 }, (_, index) => `Paragraph ${index}\r\n`), "same paragraph", ""].join("\r\n");
  const session = parseImmersiveMarkdown(source);
  const line = source.split("\r\n").lastIndexOf("same paragraph") + 1;
  const position = immersivePositionAtSource(source, session.doc, { line, column: 6 });
  expect(position).toBeGreaterThan(session.doc.content.size - 20);
  expect(session.doc.resolve(position).parent.textContent).toBe("same paragraph");
  expect(sourcePositionAtImmersive(source, session.doc, position)).toEqual({ line, column: 6 });
  expect(session.serialize(session.doc)).toBe(source);
});

it("locates an individual item deep inside one continuous list", () => {
  const source = "# List\n\n" + Array.from({ length: 400 }, (_, index) => `- Item ${index + 1}`).join("\n");
  const session = parseImmersiveMarkdown(source);
  const position = immersivePositionAtSource(source, session.doc, { line: 327, column: 1 });
  expect(session.doc.resolve(position).parent.textContent).toBe("Item 325");
  expect(sourcePositionAtImmersive(source, session.doc, position).line).toBe(327);
});

it("preserves the source line inside multiline code and table rows", () => {
  const source = "# Code\n\n```text\nfirst\nsecond\nthird\n```\n\n| Key | Value |\n| --- | --- |\n| a | one |\n| b | two |\n";
  const session = parseImmersiveMarkdown(source);
  const code = immersivePositionAtSource(source, session.doc, { line: 6, column: 3 });
  expect(session.doc.textBetween(code, code + 3)).toBe("ird");
  expect(sourcePositionAtImmersive(source, session.doc, code)).toEqual({ line: 6, column: 3 });
  const row = immersivePositionAtSource(source, session.doc, { line: 12, column: 1 });
  expect(session.doc.nodeAt(row)?.type.name).toBe("table_row");
  expect(session.doc.nodeAt(row)?.textContent).toBe("btwo");
});

it("uses current source ranges after a rich edit adds earlier lines", () => {
  const source = "First paragraph.\n\nTarget paragraph.\n";
  const session = parseImmersiveMarkdown(source);
  const edited = EditorState.create({ doc: session.doc, schema }).tr.insertText("extra\nlines\n", 1).doc;
  const currentSource = session.serialize(edited);
  const line = currentSource.split("\n").indexOf("Target paragraph.") + 1;
  expect(line).toBe(5);
  const position = immersivePositionAtSource(currentSource, edited, { line, column: 8 });
  expect(edited.resolve(position).parent.textContent).toBe("Target paragraph.");
  expect(sourcePositionAtImmersive(currentSource, edited, position)).toEqual({ line, column: 8 });
  expect(session.serialize(edited)).toBe(currentSource);
});
