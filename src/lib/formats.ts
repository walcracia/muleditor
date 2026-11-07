import type { DocumentFormat } from "../types";

const formatLabels: Record<DocumentFormat, string> = {
  markdown: "Markdown",
  html: "HTML",
  xml: "XML",
  yaml: "YAML",
  json: "JSON",
  "spdx-json": "SPDX JSON",
  "spdx-yaml": "SPDX YAML",
  "spdx-tag-value": "SPDX",
  unknown: "Text"
};

export function getFormatLabel(format: DocumentFormat): string {
  return formatLabels[format];
}

export function getMonacoLanguage(format: DocumentFormat): string {
  switch (format) {
    case "markdown":
      return "markdown";
    case "html":
      return "html";
    case "xml":
      return "xml";
    case "yaml":
    case "spdx-yaml":
      return "yaml";
    case "json":
    case "spdx-json":
      return "json";
    default:
      return "plaintext";
  }
}

export function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".spdx.json")) return ".spdx.json";
  if (lower.endsWith(".spdx.yaml")) return ".spdx.yaml";
  if (lower.endsWith(".spdx.yml")) return ".spdx.yml";
  const index = lower.lastIndexOf(".");
  return index >= 0 ? lower.slice(index) : "";
}

export function detectFormat(name: string, content: string): DocumentFormat {
  const lower = name.toLowerCase();
  const extension = extensionOf(lower);

  if (extension === ".spdx.json") return "spdx-json";
  if (extension === ".spdx.yaml" || extension === ".spdx.yml") return "spdx-yaml";
  if (extension === ".spdx") return "spdx-tag-value";
  if ([".md", ".markdown"].includes(extension)) return "markdown";
  if ([".html", ".htm"].includes(extension)) return "html";
  if ([".xml", ".xsd", ".dtd"].includes(extension)) return "xml";
  if ([".yaml", ".yml"].includes(extension)) return "yaml";
  if (extension === ".json") return looksLikeSpdxJson(content) ? "spdx-json" : "json";

  if (looksLikeSpdxTagValue(content)) return "spdx-tag-value";
  if (looksLikeSpdxYaml(content)) return "spdx-yaml";
  if (looksLikeSpdxJson(content)) return "spdx-json";

  const trimmed = content.trimStart();
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) return "html";
  if (trimmed.startsWith("<?xml") || /^<[A-Za-z_][\w:.-]*/.test(trimmed)) return "xml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (/^---\n/.test(trimmed) || /^[\w.-]+:\s/m.test(trimmed)) return "yaml";

  return "unknown";
}

export function isSupportedTextDocumentName(name: string): boolean {
  return [
    ".md",
    ".markdown",
    ".html",
    ".htm",
    ".xml",
    ".xsd",
    ".dtd",
    ".yaml",
    ".yml",
    ".json",
    ".spdx",
    ".spdx.json",
    ".spdx.yaml",
    ".spdx.yml"
  ].includes(extensionOf(name));
}

export function defaultNameForFormat(format: DocumentFormat): string {
  switch (format) {
    case "markdown":
      return "untitled.md";
    case "html":
      return "untitled.html";
    case "xml":
      return "untitled.xml";
    case "yaml":
      return "untitled.yaml";
    case "json":
      return "untitled.json";
    case "spdx-json":
      return "bom.spdx.json";
    case "spdx-yaml":
      return "bom.spdx.yaml";
    case "spdx-tag-value":
      return "bom.spdx";
    default:
      return "untitled.txt";
  }
}

export function ensureExportName(name: string, extension: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}${extension}`;
}

function looksLikeSpdxJson(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return typeof parsed === "object" && parsed !== null && ("spdxVersion" in parsed || "SPDXID" in parsed);
  } catch {
    return false;
  }
}

function looksLikeSpdxYaml(content: string): boolean {
  return /^spdxVersion:\s*SPDX-/m.test(content) || /^SPDXID:\s*SPDXRef-/m.test(content);
}

function looksLikeSpdxTagValue(content: string): boolean {
  return /^SPDXVersion:\s*SPDX-/m.test(content) || /^DocumentName:/m.test(content);
}
