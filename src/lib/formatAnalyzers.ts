import YAML, { isMap, isNode, isScalar, isSeq, LineCounter } from "yaml";
import { summarizeSpdx } from "./spdx";
import type { Diagnostic, DocumentAnalysis, DocumentFormat, OutlineItem } from "../types";

export function analyzeMarkdown(content: string): DocumentAnalysis {
  return { diagnostics: [], outline: outlineMarkdown(content) };
}

export function analyzeHtml(content: string): DocumentAnalysis {
  const diagnostics: Diagnostic[] = [];
  const outline: OutlineItem[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  const selectedTags = new Set(["title", "h1", "h2", "h3", "h4", "h5", "h6", "main", "section", "article", "nav", "header", "footer"]);
  const elements = Array.from(doc.querySelectorAll("title,h1,h2,h3,h4,h5,h6,main,section,article,nav,header,footer"));
  const elementLines = mapElementLines(
    elements,
    collectOpeningTags(content, true).filter((tag) => selectedTags.has(tag.name.toLowerCase())),
    false
  );

  elements.forEach((element, index) => {
    const label = element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || element.tagName.toLowerCase();
    outline.push({
      id: `html-${index}`,
      label,
      kind: element.tagName.toLowerCase(),
      line: elementLines.get(element)
    });
  });

  if (!content.trim()) {
    diagnostics.push({
      id: "html-empty",
      severity: "warning",
      source: "HTML",
      message: "Document is empty"
    });
  }

  return { diagnostics, outline };
}

export function analyzeXml(content: string): DocumentAnalysis {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return {
      diagnostics: [
        {
          id: "xml-parse-error",
          severity: "error",
          source: "XML",
          message: parseError.textContent?.trim().replace(/\s+/g, " ").slice(0, 220) || "XML parse error"
        }
      ],
      outline: []
    };
  }

  const elements = Array.from(doc.querySelectorAll("*"));
  const elementLines = mapElementLines(elements, collectOpeningTags(content), true);

  return {
    diagnostics: [],
    outline: doc.documentElement ? [outlineElement(doc.documentElement, "xml-root", 0, elementLines)] : []
  };
}

export function analyzeYaml(content: string): DocumentAnalysis {
  const lineCounter = new LineCounter();
  const doc = YAML.parseDocument(content, { prettyErrors: true, lineCounter });
  const diagnostics = doc.errors.map((error, index) => yamlDiagnostic(error, index));
  const value = diagnostics.length ? undefined : doc.toJS();
  return {
    diagnostics,
    outline: value === undefined ? [] : outlineValue(value, "yaml", "document", collectParsedNodeLines(doc.contents, lineCounter))
  };
}

export function analyzeJson(content: string): DocumentAnalysis {
  try {
    const value = JSON.parse(content);
    const lineCounter = new LineCounter();
    const doc = YAML.parseDocument(content, { lineCounter });
    return {
      diagnostics: [],
      outline: outlineValue(value, "json", "document", collectParsedNodeLines(doc.contents, lineCounter))
    };
  } catch (error) {
    return {
      diagnostics: [
        {
          id: "json-parse-error",
          severity: "error",
          source: "JSON",
          message: error instanceof Error ? error.message : "JSON parse error"
        }
      ],
      outline: []
    };
  }
}

export function analyzeSpdx(format: DocumentFormat, content: string): DocumentAnalysis {
  const base = format === "spdx-json" ? analyzeJson(content) : format === "spdx-yaml" ? analyzeYaml(content) : analyzeSpdxTagValue(content);
  if (base.diagnostics.some((item) => item.severity === "error" && item.source !== "SPDX")) {
    return base;
  }

  const { summary, diagnostics } = summarizeSpdx(format, content);
  const summaryLine = findOutlineLine(base.outline, ["name", "DocumentName"]) ?? firstOutlineLine(base.outline) ?? 1;
  const spdxOutline: OutlineItem[] = summary
    ? [
        {
          id: "spdx-summary",
          label: summary.name || "SPDX document",
          kind: "SPDX",
          line: summaryLine,
          children: [
            {
              id: "spdx-packages",
              label: `${summary.packageCount} packages`,
              kind: "packages",
              line: findOutlineLine(base.outline, ["packages", "PackageName"]) ?? summaryLine
            },
            {
              id: "spdx-files",
              label: `${summary.fileCount} files`,
              kind: "files",
              line: findOutlineLine(base.outline, ["files", "FileName"]) ?? summaryLine
            },
            {
              id: "spdx-relationships",
              label: `${summary.relationshipCount} relationships`,
              kind: "relationships",
              line: findOutlineLine(base.outline, ["relationships", "Relationship"]) ?? summaryLine
            }
          ]
        }
      ]
    : [];

  return {
    diagnostics: [...base.diagnostics, ...diagnostics],
    outline: [...spdxOutline, ...base.outline],
    spdxSummary: summary
  };
}

export function analyzeText(): DocumentAnalysis {
  return { diagnostics: [], outline: [] };
}

function outlineMarkdown(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!match) return;
    items.push({
      id: `md-${index}`,
      label: match[2].trim(),
      kind: `H${match[1].length}`,
      line: index + 1
    });
  });
  return items;
}

function analyzeSpdxTagValue(content: string): DocumentAnalysis {
  const outline: OutlineItem[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) return;
    const [, key, value] = match;
    if (["DocumentName", "PackageName", "FileName", "Relationship", "SPDXVersion"].includes(key)) {
      outline.push({
        id: `spdx-tag-${index}`,
        label: value || key,
        kind: key,
        line: index + 1
      });
    }
  });
  return { diagnostics: [], outline };
}

function outlineElement(element: Element, id: string, depth: number, elementLines: WeakMap<Element, number>): OutlineItem {
  const children: OutlineItem[] = [];
  if (depth < 5) {
    Array.from(element.children)
      .slice(0, 80)
      .forEach((child, index) => children.push(outlineElement(child, `${id}-${index}`, depth + 1, elementLines)));
  }

  const attributes = Array.from(element.attributes)
    .slice(0, 3)
    .map((attribute) => `${attribute.name}="${attribute.value}"`)
    .join(" ");

  return {
    id,
    label: attributes ? `<${element.tagName} ${attributes}>` : `<${element.tagName}>`,
    kind: "element",
    line: elementLines.get(element),
    children
  };
}

function outlineValue(
  value: unknown,
  id: string,
  label: string,
  lineByPath?: Map<string, number>,
  path: Array<string | number> = []
): OutlineItem[] {
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item, index) => {
      const itemPath = [...path, index];
      return {
        id: `${id}-${index}`,
        label: `[${index}]`,
        kind: valueKind(item),
        value: primitivePreview(item),
        line: lineByPath?.get(outlinePathKey(itemPath)),
        children: outlineValue(item, `${id}-${index}`, `[${index}]`, lineByPath, itemPath)
      };
    });
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 120)
      .map(([key, child], index) => {
        const childPath = [...path, key];
        return {
          id: `${id}-${index}`,
          label: key,
          kind: valueKind(child),
          value: primitivePreview(child),
          line: lineByPath?.get(outlinePathKey(childPath)),
          children: outlineValue(child, `${id}-${index}`, key, lineByPath, childPath)
        };
      });
  }

  return label === "document"
    ? [{ id, label: primitivePreview(value) ?? "document", kind: valueKind(value), line: lineByPath?.get(outlinePathKey(path)) }]
    : [];
}

function collectParsedNodeLines(root: unknown, lineCounter: LineCounter): Map<string, number> {
  const lineByPath = new Map<string, number>();

  function visit(node: unknown, path: Array<string | number>, preferredLine?: number) {
    const line = preferredLine ?? parsedNodeLine(node, lineCounter);
    if (line) {
      lineByPath.set(outlinePathKey(path), line);
    }
    if (!isNode(node)) return;

    if (isMap(node)) {
      node.items.forEach((pair) => {
        const key = parsedMapKey(pair.key);
        visit(pair.value, [...path, key], parsedNodeLine(pair.key, lineCounter) ?? parsedNodeLine(pair.value, lineCounter));
      });
      return;
    }

    if (isSeq(node)) {
      node.items.forEach((item, index) => visit(item, [...path, index]));
    }
  }

  visit(root, []);
  return lineByPath;
}

function parsedMapKey(key: unknown): string {
  if (isScalar(key)) return String(key.value);
  if (isNode(key)) return String(key.toJSON());
  return String(key);
}

function parsedNodeLine(node: unknown, lineCounter: LineCounter): number | undefined {
  if (!isNode(node) || !node.range) return undefined;
  const position = lineCounter.linePos(node.range[0]);
  return position.line || undefined;
}

function outlinePathKey(path: Array<string | number>): string {
  return JSON.stringify(path);
}

interface SourceTag {
  name: string;
  line: number;
}

function collectOpeningTags(content: string, skipHtmlRawText = false): SourceTag[] {
  const tags: SourceTag[] = [];
  const lineStarts = collectLineStarts(content);
  const lowerContent = skipHtmlRawText ? content.toLowerCase() : content;
  let cursor = 0;

  while (cursor < content.length) {
    const start = content.indexOf("<", cursor);
    if (start < 0) break;

    if (content.startsWith("<!--", start)) {
      const end = content.indexOf("-->", start + 4);
      cursor = end < 0 ? content.length : end + 3;
      continue;
    }
    if (content.startsWith("<![CDATA[", start)) {
      const end = content.indexOf("]]>", start + 9);
      cursor = end < 0 ? content.length : end + 3;
      continue;
    }

    const tagEnd = findTagEnd(content, start + 1);
    let nameStart = start + 1;
    while (/\s/.test(content[nameStart] ?? "")) nameStart += 1;
    if (["/", "!", "?"].includes(content[nameStart] ?? "")) {
      cursor = tagEnd + 1;
      continue;
    }

    let nameEnd = nameStart;
    while (/[A-Za-z0-9_.:-]/.test(content[nameEnd] ?? "")) nameEnd += 1;
    const name = content.slice(nameStart, nameEnd);
    if (!name || !/[A-Za-z_:]/.test(name[0])) {
      cursor = start + 1;
      continue;
    }

    tags.push({ name, line: lineAtOffset(lineStarts, start) });
    cursor = tagEnd + 1;

    const lowerName = name.toLowerCase();
    const selfClosing = content.slice(nameEnd, tagEnd).trimEnd().endsWith("/");
    if (skipHtmlRawText && !selfClosing && (lowerName === "script" || lowerName === "style")) {
      const closingStart = lowerContent.indexOf(`</${lowerName}`, cursor);
      if (closingStart >= 0) cursor = closingStart;
    }
  }

  return tags;
}

function findTagEnd(content: string, start: number): number {
  let quote = "";
  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return content.length - 1;
}

function collectLineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineAtOffset(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  return Math.max(1, low);
}

function mapElementLines(elements: Element[], sourceTags: SourceTag[], caseSensitive: boolean): WeakMap<Element, number> {
  const lines = new WeakMap<Element, number>();
  let sourceIndex = 0;

  elements.forEach((element) => {
    const expectedName = caseSensitive ? element.tagName : element.tagName.toLowerCase();
    while (sourceIndex < sourceTags.length) {
      const sourceTag = sourceTags[sourceIndex];
      sourceIndex += 1;
      const sourceName = caseSensitive ? sourceTag.name : sourceTag.name.toLowerCase();
      if (sourceName !== expectedName) continue;
      lines.set(element, sourceTag.line);
      break;
    }
  });

  return lines;
}

function firstOutlineLine(items: OutlineItem[]): number | undefined {
  for (const item of items) {
    if (item.line) return item.line;
    const childLine = firstOutlineLine(item.children ?? []);
    if (childLine) return childLine;
  }
  return undefined;
}

function findOutlineLine(items: OutlineItem[], labels: string[]): number | undefined {
  const normalizedLabels = new Set(labels.map((label) => label.toLowerCase()));
  for (const item of items) {
    if (normalizedLabels.has(item.label.toLowerCase()) || normalizedLabels.has(item.kind.toLowerCase())) {
      return item.line;
    }
    const childLine = findOutlineLine(item.children ?? [], labels);
    if (childLine) return childLine;
  }
  return undefined;
}

function valueKind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function primitivePreview(value: unknown): string | undefined {
  if (value === null) return "null";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function yamlDiagnostic(error: unknown, index: number): Diagnostic {
  const maybeError = error as { message?: string; linePos?: Array<{ line: number; col: number }> };
  const position = maybeError.linePos?.[0];
  return {
    id: `yaml-error-${index}`,
    severity: "error",
    source: "YAML",
    message: maybeError.message || "YAML parse error",
    line: position?.line,
    column: position?.col
  };
}
