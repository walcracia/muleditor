import YAML from "yaml";
import type { DocumentFormat, Diagnostic, SpdxSummary } from "../types";

type SpdxObject = Record<string, unknown>;

export function summarizeSpdx(format: DocumentFormat, content: string): { summary?: SpdxSummary; diagnostics: Diagnostic[] } {
  try {
    const data = parseSpdx(format, content);
    if (!data) {
      return { diagnostics: [] };
    }

    const summary = summaryFromObject(data);
    const diagnostics = validateSpdxSummary(summary);
    return { summary, diagnostics };
  } catch (error) {
    return {
      diagnostics: [
        {
          id: "spdx-parse",
          severity: "error",
          source: "SPDX",
          message: error instanceof Error ? error.message : "Unable to parse SPDX document"
        }
      ]
    };
  }
}

function parseSpdx(format: DocumentFormat, content: string): SpdxObject | undefined {
  if (format === "spdx-json") {
    return JSON.parse(content) as SpdxObject;
  }

  if (format === "spdx-yaml") {
    return YAML.parse(content) as SpdxObject;
  }

  if (format === "spdx-tag-value") {
    return parseTagValue(content);
  }

  return undefined;
}

function parseTagValue(content: string): SpdxObject {
  const result: SpdxObject = {};
  const creators: string[] = [];
  const packages: Array<Record<string, unknown>> = [];
  const files: Array<Record<string, unknown>> = [];
  const relationships: Array<Record<string, unknown>> = [];
  let currentPackage: Record<string, unknown> | undefined;

  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;

    switch (key) {
      case "SPDXVersion":
        result.spdxVersion = value;
        break;
      case "DataLicense":
        result.dataLicense = value;
        break;
      case "SPDXID":
        result.SPDXID = value;
        break;
      case "DocumentName":
        result.name = value;
        break;
      case "DocumentNamespace":
        result.documentNamespace = value;
        break;
      case "Creator":
        creators.push(value);
        break;
      case "PackageName":
        currentPackage = { name: value };
        packages.push(currentPackage);
        break;
      case "PackageSPDXID":
        if (currentPackage) currentPackage.SPDXID = value;
        break;
      case "FileName":
        files.push({ fileName: value });
        break;
      case "Relationship":
        relationships.push({ relationship: value });
        break;
      default:
        if (!(key in result)) result[key] = value;
    }
  }

  result.creationInfo = { creators };
  result.packages = packages;
  result.files = files;
  result.relationships = relationships;
  return result;
}

function summaryFromObject(data: SpdxObject): SpdxSummary {
  const creationInfo = asObject(data.creationInfo);
  const creators = toStringArray(creationInfo?.creators);
  const packages = toArray(data.packages);
  const files = toArray(data.files);
  const relationships = toArray(data.relationships);
  const licenseRefs = new Set<string>();

  for (const item of [...packages, ...files]) {
    if (typeof item !== "object" || item === null) continue;
    for (const value of Object.values(item as Record<string, unknown>)) {
      if (typeof value === "string" && (value.startsWith("LicenseRef-") || value.includes("LicenseRef-"))) {
        licenseRefs.add(value);
      }
    }
  }

  return {
    name: asString(data.name),
    spdxVersion: asString(data.spdxVersion),
    dataLicense: asString(data.dataLicense),
    documentNamespace: asString(data.documentNamespace),
    creators,
    packageCount: packages.length,
    fileCount: files.length,
    relationshipCount: relationships.length,
    licenseRefs: Array.from(licenseRefs).sort()
  };
}

function validateSpdxSummary(summary: SpdxSummary): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!summary.spdxVersion) {
    diagnostics.push({
      id: "spdx-version-missing",
      severity: "error",
      source: "SPDX",
      message: "Missing spdxVersion"
    });
  }

  if (!summary.dataLicense) {
    diagnostics.push({
      id: "spdx-data-license-missing",
      severity: "warning",
      source: "SPDX",
      message: "Missing dataLicense"
    });
  }

  if (!summary.name) {
    diagnostics.push({
      id: "spdx-document-name-missing",
      severity: "warning",
      source: "SPDX",
      message: "Missing document name"
    });
  }

  return diagnostics;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
