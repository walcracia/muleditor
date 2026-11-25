import { Fragment, Schema, type Node as ProseMirrorNode, type NodeSpec, type Mark } from "prosemirror-model";
import { schema as commonMarkdownSchema, defaultMarkdownSerializer, MarkdownSerializer } from "prosemirror-markdown";
import { tableNodes } from "prosemirror-tables";
import type { Token } from "markdown-it";
import { tokenizeMarkdown } from "./markdown";

const sourceAttrs = { sourceId: { default: null }, sourceLine: { default: null }, sourceEndLine: { default: null } };
const nodes: Record<string, NodeSpec> = {};
commonMarkdownSchema.spec.nodes.forEach((name, spec) => {
  nodes[name] = { ...spec, attrs: { ...spec.attrs, ...(spec.group?.includes("block") ? sourceAttrs : {}) } };
});
nodes.heading = { ...nodes.heading, content: "inline*" };
nodes.paragraph = { ...nodes.paragraph, attrs: { ...nodes.paragraph.attrs, ephemeral: { default: false } } };
nodes.list_item = {
  ...nodes.list_item,
  attrs: { checked: { default: null } },
  toDOM: (node) => ["li", node.attrs.checked === null ? {} : { "data-checked": String(node.attrs.checked), class: "immersiveTaskItem" }, 0]
};
nodes.code_block = { ...nodes.code_block, attrs: { ...nodes.code_block.attrs, language: { default: "" } } };
nodes.math_block = {
  group: "block", content: "text*", marks: "", code: true, defining: true,
  attrs: { ...sourceAttrs, delimiter: { default: "$$" } },
  toDOM: () => ["pre", { class: "immersiveMathSource" }, ["code", 0]],
  parseDOM: [{ tag: "pre.immersiveMathSource", preserveWhitespace: "full" }]
};
nodes.mermaid_block = {
  ...nodes.math_block, attrs: { ...sourceAttrs, language: { default: "mermaid" } },
  toDOM: () => ["pre", { class: "immersiveMermaidSource" }, ["code", 0]],
  parseDOM: [{ tag: "pre.immersiveMermaidSource", preserveWhitespace: "full" }]
};
nodes.inline_math = {
  inline: true, group: "inline", atom: true, attrs: { source: { default: "" }, delimiter: { default: "$" } },
  toDOM: (node) => ["span", { class: "immersiveInlineMath", "data-source": node.attrs.source }, node.attrs.source],
  parseDOM: [{ tag: "span.immersiveInlineMath", getAttrs: (dom) => ({ source: dom.getAttribute("data-source") ?? dom.textContent }) }]
};
nodes.footnote_ref = {
  inline: true, group: "inline", atom: true, attrs: { label: { default: "" }, source: { default: "" } },
  toDOM: (node) => ["sup", { class: "immersiveFootnoteRef", "data-source": node.attrs.source }, node.attrs.label || node.attrs.source],
  parseDOM: [{ tag: "sup.immersiveFootnoteRef", getAttrs: (dom) => ({ source: dom.getAttribute("data-source"), label: dom.textContent }) }]
};
nodes.raw_inline = {
  inline: true, group: "inline", atom: true, attrs: { source: { default: "" }, kind: { default: "html" } },
  toDOM: (node) => ["span", { class: "immersiveRawInline", "data-source": node.attrs.source }, node.attrs.source],
  parseDOM: [{ tag: "span.immersiveRawInline", getAttrs: (dom) => ({ source: dom.getAttribute("data-source") ?? dom.textContent }) }]
};
nodes.raw_block = {
  group: "block", atom: true, defining: true, isolating: true,
  attrs: { ...sourceAttrs, source: { default: "" }, kind: { default: "unsupported" } },
  toDOM: (node) => ["pre", { class: "immersiveRawSource", "data-kind": node.attrs.kind }, node.attrs.source],
  parseDOM: [{ tag: "pre.immersiveRawSource", getAttrs: (dom) => ({ source: dom.textContent, kind: dom.getAttribute("data-kind") ?? "unsupported" }) }]
};
for (const [name, spec] of Object.entries(tableNodes({
  tableGroup: "block", cellContent: "block+",
  cellAttributes: { align: { default: null, getFromDOM: (dom) => dom.style.textAlign || null, setDOMAttr: (value, attrs) => { if (value) attrs.style = `text-align:${value}`; } } }
}))) nodes[name] = { ...spec, attrs: { ...spec.attrs, ...(name === "table" ? sourceAttrs : {}) } };

const marks = commonMarkdownSchema.spec.marks.update("link", {
  ...commonMarkdownSchema.spec.marks.get("link"),
  attrs: { href: {}, title: { default: null } },
  parseDOM: [{ tag: "a[href]", getAttrs: (dom) => {
    const href = dom.getAttribute("href") ?? "";
    return isSafeImmersiveLink(href) ? { href, title: dom.getAttribute("title") } : false;
  } }],
  toDOM: (mark) => ["a", { href: isSafeImmersiveLink(mark.attrs.href) ? mark.attrs.href : null, title: mark.attrs.title, rel: "noopener noreferrer" }, 0]
}).addToEnd("strike", { parseDOM: [{ tag: "s" }, { tag: "del" }], toDOM: () => ["s", 0] });

export const immersiveSchema = new Schema({
  nodes,
  marks
});

/** Use before handling rich-editor link clicks or accepting a link from a toolbar. */
export function isSafeImmersiveLink(href: unknown): href is string {
  if (typeof href !== "string") return false;
  const compact = href.trim().replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  return !/^(?:javascript|vbscript|data|blob):/i.test(compact);
}

export interface ImmersiveSourceBlock {
  id: string;
  sourceFrom: number;
  sourceTo: number;
  line: number;
  endLine: number;
  pmFrom: number;
  nodeType: string;
}

export interface ImmersiveMarkdownSession {
  source: string;
  doc: ProseMirrorNode;
  blocks: readonly ImmersiveSourceBlock[];
  warnings: readonly string[];
  /** Serialize against this import snapshot, preserving every untouched source block verbatim. */
  serialize(doc: ProseMirrorNode): string;
}

interface StoredBlock {
  node: ProseMirrorNode;
  raw: string;
  prefix: string;
}

/** Import without DOM execution or a Markdown→HTML→DOM conversion. */
export function parseImmersiveMarkdown(source: string): ImmersiveMarkdownSession {
  const { tokens, environment, lineOffset } = tokenizeMarkdown(source);
  const lineStarts = sourceLineStarts(source);
  const sourceNodes: ProseMirrorNode[] = [];
  const stored = new Map<string, StoredBlock>();
  const blocks: ImmersiveSourceBlock[] = [];
  const warnings: string[] = [];
  let cursor = 0;
  let prefix = "";
  let pmFrom = 0;
  const addBlock = (node: ProseMirrorNode, raw: string, from: number, to: number, line: number, endLine: number) => {
    const id = `source-${blocks.length}`;
    const imported = node.type.create({ ...node.attrs, sourceId: id, sourceLine: line, sourceEndLine: endLine }, node.content, node.marks);
    sourceNodes.push(imported);
    stored.set(id, { node: imported, raw, prefix });
    blocks.push({ id, sourceFrom: from, sourceTo: to, line, endLine, pmFrom, nodeType: imported.type.name });
    pmFrom += imported.nodeSize;
    prefix = "";
  };
  const addGap = (from: number, to: number) => {
    const raw = source.slice(from, to);
    if (!raw.trim()) { prefix += raw; return; }
    const kind = from === 0 && lineOffset > 0 ? "frontmatter" : "definitions";
    addBlock(immersiveSchema.nodes.raw_block.create({ source: raw, kind }), raw, from, to, lineAt(lineStarts, from), lineAt(lineStarts, Math.max(from, to - 1)));
  };
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    // The footnote plugin relocates definitions here. Their original source remains in the gaps.
    if (token.type === "footnote_block_open") break;
    const end = blockEnd(tokens, index);
    if (!token.map) { index = end; continue; }
    const from = lineStarts[token.map[0] + lineOffset] ?? source.length;
    const to = lineStarts[token.map[1] + lineOffset] ?? source.length;
    if (from < cursor || to <= from) { index = end; continue; }
    addGap(cursor, from);
    const raw = source.slice(from, to);
    let node: ProseMirrorNode;
    try {
      const converted = parseBlocks(tokens.slice(index, end), environment);
      if (converted.length !== 1) throw new Error(`Unsupported block: ${token.type}`);
      node = converted[0];
      node.check();
    } catch (error) {
      node = immersiveSchema.nodes.raw_block.create({ source: raw, kind: token.type === "html_block" ? "html" : "unsupported" });
      warnings.push(error instanceof Error ? error.message : String(error));
    }
    addBlock(node, raw, from, to, token.map[0] + lineOffset + 1, token.map[1] + lineOffset);
    cursor = to;
    index = end;
  }
  addGap(cursor, source.length);
  const tail = prefix;
  if (sourceNodes[sourceNodes.length - 1]?.type.name !== "paragraph") {
    sourceNodes.push(immersiveSchema.nodes.paragraph.create({ ephemeral: true, sourceId: "ephemeral-tail" }));
  }
  const doc = immersiveSchema.nodes.doc.create(null, sourceNodes);
  const newline = source.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  const session: ImmersiveMarkdownSession = {
    source, doc, blocks, warnings,
    serialize: (edited) => {
      if (edited.eq(doc)) return source;
      const used = new Set<string>();
      let result = "";
      let boundaryAfter = false;
      edited.forEach((node) => {
        if (node.type.name === "paragraph" && node.attrs.ephemeral && !node.content.size) return;
        const id = node.attrs.sourceId as string | null;
        const previous = id && !used.has(id) ? stored.get(id) : undefined;
        if (id) used.add(id);
        const structuralChange = !previous || previous.node.type !== node.type;
        const leading = previous?.prefix ?? "";
        if ((boundaryAfter || structuralChange) && result && !endsWithBlankLine(result + leading)) result += newline.repeat(2 - trailingLineCount(result + leading));
        result += leading;
        if (previous && node.eq(previous.node)) result += previous.raw;
        else {
          let raw = serializeNode(node).replace(/\r\n?|\n/g, newline);
          if (previous && node.type.name !== "raw_block") {
            const ending = previous.raw.match(/(?:\r\n|\n|\r)+$/)?.[0] ?? "";
            raw = raw.replace(/(?:\r\n|\n|\r)+$/, "") + ending;
          }
          result += raw;
        }
        boundaryAfter = structuralChange;
      });
      return result + tail;
    }
  };
  return session;
}

export function serializeImmersiveMarkdown(doc: ProseMirrorNode, session?: ImmersiveMarkdownSession): string {
  return session ? session.serialize(doc) : immersiveSerializer.serialize(doc);
}

function parseBlocks(tokens: Token[], environment: Record<string, unknown>): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = [];
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index];
    const end = blockEnd(tokens, index);
    const inside = tokens.slice(index + 1, end - 1);
    const attrs: Record<string, unknown> = {};
    let name = "";
    let content: ProseMirrorNode[] | undefined;
    if (["paragraph_open", "heading_open"].includes(token.type)) {
      name = token.type === "heading_open" ? "heading" : "paragraph";
      if (name === "heading") attrs.level = Number(token.tag.slice(1));
      content = parseInline(inside.find((child) => child.type === "inline")?.children ?? [], environment);
    } else if (["blockquote_open", "bullet_list_open", "ordered_list_open", "list_item_open", "table_open", "tr_open", "th_open", "td_open"].includes(token.type)) {
      name = ({ blockquote_open: "blockquote", bullet_list_open: "bullet_list", ordered_list_open: "ordered_list", list_item_open: "list_item", table_open: "table", tr_open: "table_row", th_open: "table_header", td_open: "table_cell" } as Record<string, string>)[token.type];
      if (name === "ordered_list") attrs.order = Number(token.attrGet("start") ?? 1);
      if (name.endsWith("_list")) attrs.tight = inside.some((child) => child.type === "paragraph_open" && child.hidden);
      if (name === "list_item") {
        const checkbox = inside.find((child) => child.type === "inline")?.children?.find(isTaskCheckbox);
        attrs.checked = checkbox ? checkbox.content.includes("checked") : null;
      }
      if (name === "table_cell" || name === "table_header") {
        attrs.align = token.attrGet("style")?.toString().replace("text-align:", "") || null;
        content = [immersiveSchema.nodes.paragraph.create(null, parseInline(inside.find((child) => child.type === "inline")?.children ?? [], environment))];
      } else content = parseBlocks(inside, environment);
    } else if (["thead_open", "tbody_open"].includes(token.type)) {
      result.push(...parseBlocks(inside, environment));
      index = end;
      continue;
    } else if (token.type === "fence" || token.type === "code_block" || token.type === "math_block") {
      const language = token.info.trim().split(/\s+/)[0];
      name = token.type === "math_block" || language === "math" ? "math_block" : language === "mermaid" ? "mermaid_block" : "code_block";
      if (name === "math_block") attrs.delimiter = token.type === "fence" ? "math" : token.markup;
      else { attrs.language = language; attrs.params = token.info; }
      const text = token.content.replace(/\n$/, "");
      content = text ? [immersiveSchema.text(text)] : [];
    } else if (token.type === "hr") name = "horizontal_rule";
    else throw new Error(`Edit this block as source: ${token.type}`);
    result.push(immersiveSchema.nodes[name].create(attrs, content));
    index = end;
  }
  return result;
}

function parseInline(tokens: Token[], environment: Record<string, unknown>): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = [];
  let marks: Mark[] = [];
  let taskSpace = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === "text" && token.content === " " && tokens[index + 1]?.attrGet("class") === "heading-anchor") continue;
    if (token.type === "link_open" && token.attrGet("class") === "heading-anchor") {
      while (index < tokens.length && tokens[index].type !== "link_close") index++;
      continue;
    }
    if (isTaskCheckbox(token)) { taskSpace = true; continue; }
    const markName = ({ em_open: "em", strong_open: "strong", s_open: "strike", link_open: "link", em_close: "em", strong_close: "strong", s_close: "strike", link_close: "link" } as Record<string, string>)[token.type];
    if (markName) {
      if (token.nesting === 1) marks = [...marks, immersiveSchema.marks[markName].create(markName === "link" ? { href: token.attrGet("href"), title: token.attrGet("title") } : undefined)];
      else marks = marks.filter((mark) => mark.type.name !== markName);
    } else if (token.type === "text" || token.type === "softbreak" || token.type === "code_inline") {
      let text = token.type === "softbreak" ? "\n" : token.content;
      if (taskSpace) { text = text.replace(/^ /, ""); taskSpace = false; }
      if (text) result.push(immersiveSchema.text(text, token.type === "code_inline" ? [...marks, immersiveSchema.marks.code.create()] : marks));
    } else if (token.type === "hardbreak") result.push(immersiveSchema.nodes.hard_break.create(null, null, marks));
    else if (token.type === "image") result.push(immersiveSchema.nodes.image.create({ src: token.attrGet("src"), alt: token.content, title: token.attrGet("title") }, null, marks));
    else if (token.type === "math_inline") result.push(immersiveSchema.nodes.inline_math.create({ source: token.content, delimiter: token.markup }, null, marks));
    else if (token.type === "html_inline") result.push(immersiveSchema.nodes.raw_inline.create({ source: token.content, kind: "html" }, null, marks));
    else if (token.type === "footnote_ref") {
      const footnotes = environment.footnotes as { list?: { content?: string }[] } | undefined;
      const label = token.meta?.label;
      const source = typeof label === "string" ? `[^${label}]` : `^[${footnotes?.list?.[Number(token.meta?.id)]?.content ?? ""}]`;
      result.push(immersiveSchema.nodes.footnote_ref.create({ label: label ?? String(Number(token.meta?.id) + 1), source }, null, marks));
    } else throw new Error(`Edit this inline syntax as source: ${token.type}`);
  }
  return result;
}

function isTaskCheckbox(token: Token): boolean {
  return token.type === "html_inline" && token.content.startsWith('<input class="task-list-item-checkbox"');
}

function blockEnd(tokens: Token[], index: number): number {
  if (tokens[index].nesting !== 1) return index + 1;
  let depth = 1;
  for (let end = index + 1; end < tokens.length; end++) {
    depth += tokens[end].nesting;
    if (!depth) return end + 1;
  }
  throw new Error(`Unbalanced Markdown token: ${tokens[index].type}`);
}

const immersiveSerializer = new MarkdownSerializer({
  ...defaultMarkdownSerializer.nodes,
  code_block: (state, node) => {
    const params = String(node.attrs.params ?? "");
    const language = String(node.attrs.language ?? "");
    const info = params.split(/\s+/)[0] === language ? params : language;
    writeFence(state, node, info);
  },
  mermaid_block: (state, node) => writeFence(state, node, "mermaid"),
  math_block: (state, node) => {
    if (node.attrs.delimiter === "math") writeFence(state, node, "math");
    else {
      state.write(node.attrs.delimiter === "\\[" ? "\\[\n" : "$$\n");
      state.text(node.textContent, false);
      state.write(node.attrs.delimiter === "\\[" ? "\n\\]" : "\n$$");
      state.closeBlock(node);
    }
  },
  list_item: (state, node) => {
    if (node.attrs.checked !== null) state.write(node.attrs.checked ? "[x] " : "[ ] ");
    state.renderContent(node);
  },
  inline_math: (state, node) => state.write(node.attrs.delimiter === "\\(" ? `\\(${node.attrs.source}\\)` : `$${node.attrs.source}$`),
  footnote_ref: (state, node) => state.write(node.attrs.source),
  raw_inline: (state, node) => state.write(node.attrs.source),
  raw_block: (state, node) => { state.write(node.attrs.source); state.closeBlock(node); },
  table: (state, node) => {
    node.forEach((row, _offset, rowIndex) => {
      const cells: string[] = [];
      row.forEach((cell) => cells.push(immersiveSerializer.serialize(immersiveSchema.nodes.doc.create(null, cell.content)).trim().replace(/\|/g, "\\|").replace(/\r\n?|\n/g, "<br>")));
      state.write(`| ${cells.join(" | ")} |\n`);
      if (rowIndex === 0) {
        const delimiters: string[] = [];
        row.forEach((cell) => delimiters.push(cell.attrs.align === "center" ? ":---:" : cell.attrs.align === "right" ? "---:" : cell.attrs.align === "left" ? ":---" : "---"));
        state.write(`| ${delimiters.join(" | ")} |\n`);
      }
    });
    state.closeBlock(node);
  }
}, { ...defaultMarkdownSerializer.marks, strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true } });

function writeFence(state: Parameters<typeof defaultMarkdownSerializer.nodes.code_block>[0], node: ProseMirrorNode, info: string) {
  const longest = Math.max(2, ...Array.from(node.textContent.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  state.write(`${fence}${info}\n`);
  state.text(node.textContent, false);
  state.write(`\n${fence}`);
  state.closeBlock(node);
}

function serializeNode(node: ProseMirrorNode): string {
  if (node.type.name === "raw_block") return node.attrs.source;
  return immersiveSerializer.serialize(immersiveSchema.nodes.doc.create(null, Fragment.from(node)));
}

function sourceLineStarts(source: string): number[] {
  return [0, ...Array.from(source.matchAll(/\r\n|\n|\r/g), (match) => match.index! + match[0].length)];
}

function lineAt(starts: number[], offset: number): number {
  let low = 0, high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle;
  }
  return low + 1;
}

function trailingLineCount(source: string): number {
  return source.match(/(?:\r\n|\n|\r)+$/)?.[0].match(/\r\n|\n|\r/g)?.length ?? 0;
}

function endsWithBlankLine(source: string): boolean { return trailingLineCount(source) >= 2; }
