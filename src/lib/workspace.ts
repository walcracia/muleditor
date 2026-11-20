import type { Diagnostic, DocumentFormat, DocumentTab, FormatNavigationInfo, WorkspaceDeclaration, WorkspaceIndex, WorkspaceReference } from "../types";
import { getFormatAdapter } from "./formatAdapters";
import { extractMarkdownHeadings } from "./markdown";

export function buildWorkspaceIndex(tabs: DocumentTab[]): WorkspaceIndex {
  const declarationsByTab: Record<string, WorkspaceDeclaration[]> = {};
  const rawReferences: WorkspaceReference[] = [];

  for (const tab of tabs) {
    const adapter = getFormatAdapter(tab.format);
    declarationsByTab[tab.id] = adapter.collectDeclarations(tab);
    rawReferences.push(...adapter.collectReferences(tab));
  }

  const declarations = Object.values(declarationsByTab).flat();
  const references = rawReferences.map((reference) => resolveReference(reference, tabs, declarations));
  const byTabId: Record<string, FormatNavigationInfo> = {};

  for (const tab of tabs) {
    const adapter = getFormatAdapter(tab.format);
    const tabReferences = references.filter((reference) => reference.fromTabId === tab.id);
    const diagnostics = tabReferences
      .filter((reference) => reference.status === "unresolved")
      .map((reference): Diagnostic => ({
        id: `workspace-${reference.id}`,
        severity: "warning",
        source: "Workspace",
        message: `Unresolved ${reference.kind} reference: ${reference.rawTarget}`,
        line: reference.line
      }));

    byTabId[tab.id] = {
      title: `${adapter.label} edit nav`,
      focusAreas: adapter.focusAreas,
      declarations: declarationsByTab[tab.id] ?? [],
      references: tabReferences,
      snippets: adapter.snippets,
      diagnostics
    };
  }

  return { byTabId, references };
}

export function emptyFormatNavigation(format: DocumentFormat): FormatNavigationInfo {
  const adapter = getFormatAdapter(format);
  return {
    title: `${adapter.label} edit nav`,
    focusAreas: adapter.focusAreas,
    declarations: [],
    references: [],
    snippets: adapter.snippets,
    diagnostics: []
  };
}

function resolveReference(reference: WorkspaceReference, tabs: DocumentTab[], declarations: WorkspaceDeclaration[]): WorkspaceReference {
  const target = parseReferenceTarget(reference.rawTarget);
  if (!target) return reference;

  const fromTab = tabs.find((tab) => tab.id === reference.fromTabId);
  const targetTab = target.path ? findTargetTab(target.path, fromTab, tabs) : fromTab;
  if (!targetTab) {
    return { ...reference, targetPath: target.path, targetFragment: target.fragment, status: "unresolved" };
  }

  const resolvedLine = target.fragment ? resolveFragmentLine(targetTab, target.fragment, declarations) : undefined;
  const hasUnresolvedFragment = Boolean(target.fragment && !resolvedLine);

  return {
    ...reference,
    targetPath: target.path,
    targetFragment: target.fragment,
    resolvedTabId: targetTab.id,
    resolvedLine,
    status: hasUnresolvedFragment ? "unresolved" : "resolved"
  };
}

function findTargetTab(targetPath: string, fromTab: DocumentTab | undefined, tabs: DocumentTab[]): DocumentTab | undefined {
  const fromDirectory = fromTab?.relativePath ? dirname(fromTab.relativePath) : "";
  const resolvedRelative = normalizePath(resolveRelativePath(fromDirectory, targetPath));
  const normalizedTarget = normalizePath(targetPath);
  const targetName = basename(normalizedTarget);

  const exact = tabs.find((tab) => {
    const relativePath = normalizePath(tab.relativePath ?? "");
    const path = normalizePath(tab.path ?? "");
    const name = normalizePath(tab.name);
    return (
      relativePath === resolvedRelative ||
      relativePath === normalizedTarget ||
      path === normalizedTarget ||
      path.endsWith(`/${normalizedTarget}`) ||
      name === normalizedTarget
    );
  });
  if (exact) return exact;

  const basenameMatches = tabs.filter((tab) => basename(normalizePath(tab.relativePath ?? tab.path ?? tab.name)) === targetName);
  return basenameMatches.length === 1 ? basenameMatches[0] : undefined;
}

function resolveFragmentLine(tab: DocumentTab, fragment: string, declarations: WorkspaceDeclaration[]): number | undefined {
  let cleaned = fragment.replace(/^#/, "");
  try { cleaned = decodeURIComponent(cleaned); } catch { /* Keep malformed fragments literal. */ }
  if (!cleaned) return 1;

  const direct = declarations.find((declaration) => declaration.tabId === tab.id && declaration.name === cleaned);
  if (direct?.line) return direct.line;

  const pointerTail = cleaned.startsWith("/") ? cleaned.split("/").filter(Boolean).pop() : undefined;
  const lookup = pointerTail ? pointerTail.replace(/~1/g, "/").replace(/~0/g, "~") : cleaned;
  if (!lookup) return undefined;

  const lines = getLines(tab.content);
  const quotedKey = new RegExp(`"${escapeRegex(lookup)}"\\s*:`);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line.includes(`id="${lookup}"`) ||
      line.includes(`id='${lookup}'`) ||
      line.includes(`name="${lookup}"`) ||
      line.includes(`name='${lookup}'`) ||
      line.includes(`&${lookup}`) ||
      line.includes(`SPDXRef-${lookup}`) ||
      quotedKey.test(line) ||
      new RegExp(`^\\s*${escapeRegex(lookup)}\\s*:`).test(line)
    ) {
      return index + 1;
    }
  }

  if (tab.format === "markdown") {
    return extractMarkdownHeadings(tab.content).find((heading) => heading.id === cleaned)?.line;
  }

  return undefined;
}

function parseReferenceTarget(rawTarget: string): { path?: string; fragment?: string } | undefined {
  const cleaned = firstToken(rawTarget.trim().replace(/^["']|["']$/g, ""));
  if (!cleaned || isExternal(cleaned)) return undefined;

  const hashIndex = cleaned.indexOf("#");
  if (hashIndex >= 0) {
    return {
      path: cleaned.slice(0, hashIndex) || undefined,
      fragment: cleaned.slice(hashIndex + 1) || undefined
    };
  }

  return { path: cleaned };
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

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  return normalized.split("/").pop() ?? normalized;
}

function resolveRelativePath(baseDirectory: string, targetPath: string): string {
  const normalizedTarget = normalizePath(targetPath);
  if (!baseDirectory || normalizedTarget.startsWith("/")) return normalizedTarget.replace(/^\/+/, "");

  const parts = `${baseDirectory}/${normalizedTarget}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
}


function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
