// @vitest-environment jsdom
import { DOMParser, DOMSerializer, Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import { immersiveSchema as schema, isSafeImmersiveLink, parseImmersiveMarkdown, serializeImmersiveMarkdown } from "./immersiveMarkdown";

function replaceText(doc: ProseMirrorNode, find: string, replacement: string): ProseMirrorNode {
  let target = -1;
  doc.descendants((node, pos) => { if (target < 0 && node.isText && node.text?.includes(find)) target = pos + node.text.indexOf(find); });
  if (target < 0) throw new Error(`Missing test text: ${find}`);
  return EditorState.create({ doc, schema }).tr.insertText(replacement, target, target + find.length).doc;
}

describe("source-preserving immersive Markdown sessions", () => {
  it.each([
    "", "\r\n\r\n", "\uFEFF---\r\ntitle: 中文\r\n---\r\n\r\n# Heading  ###\r\n\r\nparagraph  \r\ncontinued\r\n\r\n",
    "[ref]: ./README.md \"ref title\"\n\nA [link][ref].\n\n[^note]: body\n  second line\n",
    "- [x] Checked\n- [ ] Open\n\n> quote\n>\n> paragraph\n\n<div onclick='bad()'>raw HTML</div>\n",
    "Setext\n======\n\n~~~js custom-params\nconst x = 1\n~~~\n\n$$\nx+y\n$$\n"
  ])("does not rewrite source on mode switches: %j", (source) => {
    const session = parseImmersiveMarkdown(source);
    session.doc.check();
    expect(session.serialize(session.doc)).toBe(source);
    expect(session.serialize(schema.nodeFromJSON(session.doc.toJSON()))).toBe(source);
  });

  it("changes one paragraph while preserving surrounding CRLF, front matter, definitions and trailing bytes", () => {
    const before = "\uFEFF---\r\ntitle: 示例\r\n---\r\n\r\nHeading\r\n=======\r\n\r\n";
    const paragraph = "Change **this** [link][id].\r\n";
    const after = "\r\n[id]: <./my path.md> 'Original title'\r\n\r\n[^note]: First line\r\n    second line\r\n\r\n<div data-x='original'>untouched</div>\r\n\r\n";
    const session = parseImmersiveMarkdown(before + paragraph + after);
    const result = session.serialize(replaceText(session.doc, "Change", "Changed"));
    expect(result.startsWith(before)).toBe(true);
    expect(result.endsWith(after)).toBe(true);
    expect(result).toContain("Changed **this**");
    expect(result).toContain('[link](./my%20path.md "Original title")');
  });

  it("preserves a document BOM when the first block is edited, removed or moved", () => {
    const source = "\uFEFFFirst  paragraph.\r\n\r\nSecond  paragraph.\r\n";
    const session = parseImmersiveMarkdown(source);
    expect(session.serialize(replaceText(session.doc, "First", "Edited"))).toBe(source.replace("First", "Edited"));
    const removed = schema.nodes.doc.create(null, session.doc.child(1));
    expect(session.serialize(removed).startsWith("\uFEFF")).toBe(true);
    const moved = schema.nodes.doc.create(null, [session.doc.child(1), session.doc.child(0)]);
    const serialized = session.serialize(moved);
    expect(serialized.startsWith("\uFEFF")).toBe(true);
    expect(serialized.match(/\uFEFF/g)).toHaveLength(1);
    const onlyBom = parseImmersiveMarkdown("\uFEFF");
    expect(onlyBom.serialize(EditorState.create({ doc: onlyBom.doc, schema }).tr.insertText("Text", 1).doc)).toBe("\uFEFFText");
  });

  it("does not confuse duplicate paragraphs when editing, moving or copying blocks", () => {
    const session = parseImmersiveMarkdown("same  text\n\n*same text*\n\nsame  text\n");
    const edited = replaceText(session.doc, "same  text", "first edit");
    expect(session.serialize(edited)).toBe("first edit\n\n*same text*\n\nsame  text\n");
    const moved = schema.nodes.doc.create(null, [session.doc.child(2), session.doc.child(0), session.doc.child(1)]);
    const movedText = session.serialize(moved);
    expect(movedText).toContain("same  text\n");
    expect(movedText).toContain("*same text*\n");
    const copied = schema.nodes.doc.create(null, [session.doc.child(0), session.doc.child(0)]);
    expect(parseImmersiveMarkdown(session.serialize(copied)).doc.childCount).toBe(2);
  });

  it("preserves multiline footnote definitions and repeated refs when a neighboring paragraph changes", () => {
    const source = "Before.\n\nNote[^n] twice[^n] and ^[inline *note*].\n\n[^n]: line 1\n\n    line 2 with **bold**\n\nAfter.\n";
    const session = parseImmersiveMarkdown(source);
    const result = session.serialize(replaceText(session.doc, "Before.", "Updated."));
    expect(result).toBe(source.replace("Before.", "Updated."));
    const refs: ProseMirrorNode[] = [];
    session.doc.descendants((node) => { if (node.type.name === "footnote_ref") refs.push(node); });
    expect(refs.map((node) => node.attrs.source)).toEqual(["[^n]", "[^n]", "^[inline *note*]"]);
    const changedRefParagraph = session.serialize(replaceText(session.doc, "Note", "Notes"));
    expect(changedRefParagraph).toContain("Notes[^n] twice[^n] and ^[inline *note*].");
    expect(changedRefParagraph).toContain("[^n]: line 1\n\n    line 2 with **bold**");
  });

  it("keeps custom/raw HTML source as non-executing editable atoms", () => {
    const source = 'A <span onclick="window.bad=1">raw</span> inline.\n\n<script>window.bad=2</script>\n';
    const session = parseImmersiveMarkdown(source);
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(session.doc.content);
    const root = document.createElement("div");
    root.append(fragment);
    expect(root.querySelector("script,[onclick]")).toBeNull();
    expect(root.textContent).toContain('<span onclick="window.bad=1">');
    expect(session.serialize(replaceText(session.doc, "A ", "Safe "))).toContain('<span onclick="window.bad=1">raw</span>');
    expect(session.doc.child(1).type.name).toBe("raw_block");
  });

  it("imports headings, marks, lists/tasks, blockquotes and supported atoms without anchor artifacts", () => {
    const source = "# 标题 **bold** *em* ~~strike~~ `code`\n\n- [x] task\n- [ ] todo\n- plain\n\n> quote\n\nInline $x^2$ and \\(y\\), ![alt](./a.png).\n\n```mermaid\ngraph LR;A-->B\n```\n\n\\[\nz^2\n\\]\n";
    const session = parseImmersiveMarkdown(source);
    expect(session.warnings).toEqual([]);
    expect(session.doc.firstChild?.type.name).toBe("heading");
    expect(session.doc.firstChild?.textContent).toBe("标题 bold em strike code");
    const list = session.doc.child(1);
    expect(list.type.name).toBe("bullet_list");
    expect([0, 1, 2].map((index) => list.child(index).attrs.checked)).toEqual([true, false, null]);
    expect(session.doc.child(3).content.content.map((node) => node.type.name)).toContain("inline_math");
    expect(session.doc.child(4).type.name).toBe("mermaid_block");
    expect(session.doc.child(4).isAtom).toBe(true);
    expect(session.doc.child(4).textContent).toBe("graph LR;A-->B");
    expect(session.doc.child(5).type.name).toBe("math_block");
    expect(session.doc.child(5).isAtom).toBe(true);
    expect(session.doc.child(5).attrs.delimiter).toBe("\\[");
  });

  it("serializes task checkbox changes and list additions/deletions without losing neighboring blocks", () => {
    const session = parseImmersiveMarkdown("# untouched ###\n\n- [ ] task\n- keep\n\nAfter  exact.\n");
    const originalList = session.doc.child(1);
    const checked = originalList.child(0).type.create({ ...originalList.child(0).attrs, checked: true }, originalList.child(0).content);
    const added = schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text("added")));
    const list = originalList.type.create(originalList.attrs, [checked, added]);
    const changed = schema.nodes.doc.create(null, [session.doc.child(0), list, session.doc.child(2)]);
    const serialized = session.serialize(changed);
    expect(serialized.startsWith("# untouched ###\n\n")).toBe(true);
    expect(serialized.endsWith("\n\nAfter  exact.\n")).toBe(true);
    expect(serialized).toContain("[x] task");
    expect(serialized).toContain("added");
    expect(serialized).not.toContain("keep");
    expect(parseImmersiveMarkdown(serialized).doc.child(1).childCount).toBe(2);
  });

  it("supports table cell text/escaped pipes and preserves other blocks during edits", () => {
    const source = "Before  original.\n\n| Left | Right |\n| :--- | ---: |\n| a\\|b | `c\\|d` |\n\nAfter  original.\n";
    const session = parseImmersiveMarkdown(source);
    const table = session.doc.child(1);
    expect(table.type.name).toBe("table");
    expect(table.child(0).child(0).attrs.align).toBe("left");
    expect(table.child(0).child(1).attrs.align).toBe("right");
    const serialized = session.serialize(replaceText(session.doc, "a|b", "x|y"));
    expect(serialized).toContain("x\\|y");
    expect(serialized).toContain("`c\\|d`");
    expect(serialized.startsWith("Before  original.\n\n")).toBe(true);
    expect(serialized.endsWith("\n\nAfter  original.\n")).toBe(true);
    expect(parseImmersiveMarkdown(serialized).doc.child(1).child(1).textContent).toContain("x|y");
  });

  it("retains text when rich editing creates additional paragraphs in a table cell", () => {
    const session = parseImmersiveMarkdown("| a |\n|---|\n| b |\n");
    const table = session.doc.firstChild!;
    const row = table.child(1);
    const cell = row.firstChild!;
    const changedCell = cell.type.create(cell.attrs, [cell.firstChild!, schema.nodes.paragraph.create(null, schema.text("next line"))]);
    const changedRow = row.type.create(row.attrs, changedCell);
    const changedTable = table.type.create(table.attrs, [table.child(0), changedRow]);
    const serialized = session.serialize(schema.nodes.doc.create(null, changedTable));
    expect(serialized).toContain("b<br><br>next line");
  });

  it("can edit a raw definition block explicitly without normalizing it", () => {
    const session = parseImmersiveMarkdown("[id]: ./old.md\n\nText [link][id].\n");
    const raw = session.doc.firstChild!;
    expect(raw.type.name).toBe("raw_block");
    const modified = raw.type.create({ ...raw.attrs, source: "[id]: <./new path.md> 'title'\n\n" });
    const edited = schema.nodes.doc.create(null, [modified, session.doc.child(1)]);
    expect(session.serialize(edited)).toBe("[id]: <./new path.md> 'title'\n\nText [link][id].\n");
  });

  it("serializes inserted mathematical/code/image blocks using explicit node attrs", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create({ language: "ts" }, schema.text("const ticks = ` ``` `;")),
      schema.nodes.math_block.create({ delimiter: "math" }, schema.text("x^2")),
      schema.nodes.mermaid_block.create(null, schema.text("graph LR;A-->B")),
      schema.nodes.paragraph.create(null, [schema.nodes.inline_math.create({ source: "a+b", delimiter: "\\(" }), schema.nodes.image.create({ src: "./image.png", alt: "alt" })])
    ]);
    const serialized = serializeImmersiveMarkdown(doc);
    expect(serialized).toContain("````ts");
    expect(serialized).toContain("```math\nx^2\n```");
    expect(serialized).toContain("```mermaid\ngraph LR;A-->B\n```");
    expect(serialized).toContain("\\(a+b\\)");
    expect(serialized).toContain("![alt](./image.png)");
    expect(parseImmersiveMarkdown(serialized).warnings).toEqual([]);
  });

  it("keeps schema/source metadata separate from visible content and exposes original line positions", () => {
    const session = parseImmersiveMarkdown("---\nx: 1\n---\n\n# Title\n\nParagraph.\n");
    expect(session.blocks.map((block) => block.line)).toEqual([1, 5, 7]);
    expect(session.doc.child(1).attrs.sourceLine).toBe(5);
    expect(session.blocks[1].pmFrom).toBe(session.doc.firstChild!.nodeSize);
    expect(Fragment.from(session.doc).size).toBeGreaterThan(0);
  });

  it.each(["---\nx: 1\n---\n", "$$\nx^2\n$$\n", "```mermaid\ngraph LR;A-->B\n```\n", "| a |\n|---|\n| b |\n"])("provides a writable trailing paragraph without adding source bytes: %j", (source) => {
    const session = parseImmersiveMarkdown(source);
    const tail = session.doc.lastChild!;
    expect(tail.type.name).toBe("paragraph");
    expect(tail.attrs.ephemeral).toBe(true);
    expect(session.serialize(session.doc)).toBe(source);
    const edited = EditorState.create({ doc: session.doc, schema }).tr.insertText("After", session.doc.content.size - 1).doc;
    expect(session.serialize(edited)).toBe(source + "\nAfter");
  });

  it("rejects executable pasted link attributes and never renders unsafe hrefs", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p><a href="javascript:alert(1)">evil</a> <a href="data:text/html,bad">data</a> <a href="https://example.com">safe</a></p>';
    const doc = DOMParser.fromSchema(schema).parse(root);
    expect(doc.firstChild?.child(0).marks).toEqual([]);
    expect(isSafeImmersiveLink("java\nscript:alert(1)")).toBe(false);
    expect(isSafeImmersiveLink("#中文")).toBe(true);
    const unsafe = schema.nodes.paragraph.create(null, schema.text("bad", [schema.marks.link.create({ href: "javascript:alert(1)" })]));
    const rendered = document.createElement("div");
    rendered.append(DOMSerializer.fromSchema(schema).serializeNode(unsafe));
    expect(rendered.querySelector("a")?.hasAttribute("href")).toBe(false);
  });
});
