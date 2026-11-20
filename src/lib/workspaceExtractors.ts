import type { DocumentTab, WorkspaceDeclaration, WorkspaceReference } from "../types";
import { extractMarkdownAnchors } from "./markdown";

const LOCAL_TARGET_PATTERN = /\.(?:md|markdown|html?|xml|xsd|dtd|ya?ml|json|spdx)(?:[?#].*)?$/i;

export function collectMarkdownDeclarations(tab: DocumentTab): WorkspaceDeclaration[] {
  const declarations: WorkspaceDeclaration[] = [];
  const lines = getLines(tab.content);

  if (lines[0]?.trim() === "---") {
    declarations.push(makeDeclaration(tab, "front-matter", "front matter", "Front matter", "front matter", 1));
  }

  extractMarkdownAnchors(tab.content).forEach((anchor, index) => {
    declarations.push(makeDeclaration(tab, `markdown-anchor-${index}`, anchor.id, anchor.text, anchor.kind, anchor.line));
  });

  return declarations;
}

export function collectHtmlLikeDeclarations(tab: DocumentTab, kindPrefix: string): WorkspaceDeclaration[] {
  const declarations: WorkspaceDeclaration[] = [];
  getLines(tab.content).forEach((line, index) => {
    const attrPattern = /\b((?:xml:)?id|name)=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = attrPattern.exec(line))) {
      declarations.push(makeDeclaration(tab, `${kindPrefix}-${match[1]}-${index}-${match.index}`, match[2], `${match[1]}=${match[2]}`, match[1], index + 1));
    }

    const tagMatch = /<([A-Za-z_][\w:.-]*)\b/.exec(line);
    if (tagMatch) {
      declarations.push(makeDeclaration(tab, `${kindPrefix}-element-${index}`, `${tagMatch[1]}-${index + 1}`, `<${tagMatch[1]}>`, "element", index + 1));
    }
  });

  return declarations.slice(0, 160);
}

export function collectYamlDeclarations(tab: DocumentTab): WorkspaceDeclaration[] {
  const declarations: WorkspaceDeclaration[] = [];
  getLines(tab.content).forEach((line, index) => {
    const anchorPattern = /&([A-Za-z_][\w.-]*)/g;
    let anchorMatch: RegExpExecArray | null;
    while ((anchorMatch = anchorPattern.exec(line))) {
      declarations.push(makeDeclaration(tab, `yaml-anchor-${index}-${anchorMatch.index}`, anchorMatch[1], `&${anchorMatch[1]}`, "anchor", index + 1));
    }

    const keyMatch = /^(\s*)([A-Za-z0-9_.-]+):/.exec(line);
    if (keyMatch && keyMatch[1].length <= 6) {
      declarations.push(makeDeclaration(tab, `yaml-key-${index}`, keyMatch[2], keyMatch[2], "path", index + 1));
    }
  });
  return declarations.slice(0, 180);
}

export function collectJsonDeclarations(tab: DocumentTab): WorkspaceDeclaration[] {
  const declarations: WorkspaceDeclaration[] = [];
  getLines(tab.content).forEach((line, index) => {
    const keyMatch = /^\s*"([^"]+)"\s*:/.exec(line);
    if (keyMatch) {
      declarations.push(makeDeclaration(tab, `json-key-${index}`, keyMatch[1], keyMatch[1], keyMatch[1] === "$id" ? "schema id" : "key", index + 1));
    }

    const idMatch = /"\$id"\s*:\s*"([^"]+)"/.exec(line);
    if (idMatch) {
      declarations.push(makeDeclaration(tab, `json-schema-id-${index}`, idMatch[1], `$id ${idMatch[1]}`, "schema id", index + 1));
    }
  });
  return declarations.slice(0, 180);
}

export function collectSpdxDeclarations(tab: DocumentTab): WorkspaceDeclaration[] {
  const declarations: WorkspaceDeclaration[] = [];
  const seen = new Set<string>();

  getLines(tab.content).forEach((line, index) => {
    const spdxPattern = /\bSPDXRef-[A-Za-z0-9.-]+\b/g;
    let match: RegExpExecArray | null;
    while ((match = spdxPattern.exec(line))) {
      if (seen.has(match[0])) continue;
      seen.add(match[0]);
      declarations.push(makeDeclaration(tab, `spdx-id-${index}-${match.index}`, match[0], match[0], "SPDXID", index + 1));
    }
  });

  return declarations;
}

export function collectMarkdownReferences(tab: DocumentTab): WorkspaceReference[] {
  const references: WorkspaceReference[] = [];
  getLines(tab.content).forEach((line, index) => {
    const linkPattern = /(!?)\[[^\]]*]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkPattern.exec(line))) {
      // Images are resolved by the shared renderer, including files which are
      // not editor tabs. The workspace rail only navigates text documents.
      if (match[1]) continue;
      const target = firstToken(match[2]);
      if (!isLocalTarget(target)) continue;
      references.push(makeReference(tab, match[1] ? "image" : "link", match[1] ? "Image" : "Link", target, index + 1, match.index + 1));
    }
  });
  return references;
}

export function collectHtmlLikeReferences(tab: DocumentTab, defaultKind: string): WorkspaceReference[] {
  const references: WorkspaceReference[] = [];
  getLines(tab.content).forEach((line, index) => {
    const attrPattern = /\b(href|src|action|poster)=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = attrPattern.exec(line))) {
      if (!isLocalTarget(match[2])) continue;
      references.push(makeReference(tab, match[1].toLowerCase() === "href" ? "link" : defaultKind, match[1], match[2], index + 1, match.index + 1));
    }
  });
  return references;
}

export function collectXmlReferences(tab: DocumentTab): WorkspaceReference[] {
  const references = collectHtmlLikeReferences(tab, "asset");
  getLines(tab.content).forEach((line, index) => {
    const schemaAttrPattern = /\b(?:schemaLocation|noNamespaceSchemaLocation)=["']([^"']+)["']/gi;
    let schemaMatch: RegExpExecArray | null;
    while ((schemaMatch = schemaAttrPattern.exec(line))) {
      for (const token of schemaMatch[1].split(/\s+/)) {
        if (isLocalTarget(token)) {
          references.push(makeReference(tab, "schema", "schema", token, index + 1, schemaMatch.index + 1));
        }
      }
    }

    const systemMatch = /\bSYSTEM\s+["']([^"']+)["']/i.exec(line);
    if (systemMatch && isLocalTarget(systemMatch[1])) {
      references.push(makeReference(tab, "dtd", "DTD", systemMatch[1], index + 1, systemMatch.index + 1));
    }
  });
  return references;
}

export function collectYamlReferences(tab: DocumentTab): WorkspaceReference[] {
  const references: WorkspaceReference[] = [];
  getLines(tab.content).forEach((line, index) => {
    const aliasPattern = /\*([A-Za-z_][\w.-]*)/g;
    let aliasMatch: RegExpExecArray | null;
    while ((aliasMatch = aliasPattern.exec(line))) {
      references.push(makeReference(tab, "alias", `*${aliasMatch[1]}`, `#${aliasMatch[1]}`, index + 1, aliasMatch.index + 1));
    }

    const includeMatch = /!include\s+["']?([^"'\s]+)/i.exec(line);
    if (includeMatch && isLocalTarget(includeMatch[1])) {
      references.push(makeReference(tab, "include", "!include", includeMatch[1], index + 1, includeMatch.index + 1));
    }

    const keyRefMatch = /^\s*([A-Za-z0-9_$.-]*(?:ref|schema|include|file|path)[A-Za-z0-9_$.-]*)\s*:\s*["']?([^"'\s]+)/i.exec(line);
    if (keyRefMatch && isLocalTarget(keyRefMatch[2])) {
      references.push(makeReference(tab, keyRefMatch[1].includes("$ref") ? "$ref" : "reference", keyRefMatch[1], keyRefMatch[2], index + 1, line.indexOf(keyRefMatch[2]) + 1));
    }
  });
  return references;
}

export function collectJsonReferences(tab: DocumentTab): WorkspaceReference[] {
  const references: WorkspaceReference[] = [];
  getLines(tab.content).forEach((line, index) => {
    const refPattern = /"([^"]*(?:\$ref|ref|schema|include|file|path|href|src)[^"]*)"\s*:\s*"([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = refPattern.exec(line))) {
      if (!isLocalTarget(match[2])) continue;
      references.push(makeReference(tab, match[1] === "$ref" ? "$ref" : "reference", match[1], match[2], index + 1, match.index + 1));
    }
  });
  return references;
}

export function collectSpdxReferences(tab: DocumentTab): WorkspaceReference[] {
  const references: WorkspaceReference[] = [];
  getLines(tab.content).forEach((line, index) => {
    if (!/(Relationship|relatedSpdxElement|spdxElementId)/i.test(line)) return;
    const spdxPattern = /\bSPDXRef-[A-Za-z0-9.-]+\b/g;
    let match: RegExpExecArray | null;
    while ((match = spdxPattern.exec(line))) {
      references.push(makeReference(tab, "relationship", match[0], `#${match[0]}`, index + 1, match.index + 1));
    }
  });
  return references;
}

function makeDeclaration(tab: DocumentTab, id: string, name: string, label: string, kind: string, line?: number): WorkspaceDeclaration {
  return {
    id: `${tab.id}-${id}`,
    tabId: tab.id,
    name,
    label,
    kind,
    line
  };
}

function makeReference(tab: DocumentTab, kind: string, label: string, rawTarget: string, line?: number, column?: number): WorkspaceReference {
  return {
    id: `${tab.id}-${kind}-${line ?? 0}-${column ?? 0}-${safeId(rawTarget)}`,
    fromTabId: tab.id,
    label,
    kind,
    rawTarget,
    line,
    status: "unresolved"
  };
}

function isLocalTarget(rawTarget: string): boolean {
  const target = firstToken(rawTarget.trim());
  if (!target || isExternal(target)) return false;
  return target.startsWith("#") || target.includes("/") || target.includes("\\") || LOCAL_TARGET_PATTERN.test(target) || /\.spdx\./i.test(target);
}

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target);
}

function firstToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return trimmed.slice(1).split(trimmed[0])[0];
  return trimmed.split(/\s+/)[0];
}

function getLines(content: string): string[] {
  return content.split(/\r?\n/);
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeId(value: string): string {
  return slug(value).slice(0, 48) || "target";
}
