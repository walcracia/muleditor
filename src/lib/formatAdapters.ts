import type {
  DocumentAnalysis,
  DocumentFormat,
  DocumentTab,
  FormatSnippet,
  WorkspaceDeclaration,
  WorkspaceReference
} from "../types";
import { analyzeHtml, analyzeJson, analyzeMarkdown, analyzeSpdx, analyzeText, analyzeXml, analyzeYaml } from "./formatAnalyzers";
import {
  collectHtmlLikeDeclarations,
  collectHtmlLikeReferences,
  collectJsonDeclarations,
  collectJsonReferences,
  collectMarkdownDeclarations,
  collectMarkdownReferences,
  collectSpdxDeclarations,
  collectSpdxReferences,
  collectXmlReferences,
  collectYamlDeclarations,
  collectYamlReferences
} from "./workspaceExtractors";

export interface FormatAdapter {
  format: DocumentFormat;
  label: string;
  defaultName: string;
  defaultContent: () => string;
  analyze: (content: string) => DocumentAnalysis;
  collectDeclarations: (tab: DocumentTab) => WorkspaceDeclaration[];
  collectReferences: (tab: DocumentTab) => WorkspaceReference[];
  focusAreas: string[];
  snippets: FormatSnippet[];
}

const emptyDeclarations = () => [];
const emptyReferences = () => [];

const adapters: Record<DocumentFormat, FormatAdapter> = {
  markdown: {
    format: "markdown",
    label: "Markdown",
    defaultName: "untitled.md",
    defaultContent: () => "# Untitled\n\n",
    analyze: analyzeMarkdown,
    collectDeclarations: collectMarkdownDeclarations,
    collectReferences: collectMarkdownReferences,
    focusAreas: ["Headings", "Front matter", "Links", "Images"],
    snippets: [
      { id: "md-frontmatter", label: "Front Matter", description: "Insert YAML front matter", text: "---\ntitle: Untitled\nowner: \n---\n" },
      { id: "md-table", label: "Table", description: "Insert a Markdown table", text: "\n| Name | Value |\n| --- | --- |\n| item | value |\n" },
      { id: "md-link", label: "Link", description: "Insert a local file link", text: "[label](./document.md#section)" }
    ]
  },
  html: {
    format: "html",
    label: "HTML",
    defaultName: "untitled.html",
    defaultContent: htmlTemplate,
    analyze: analyzeHtml,
    collectDeclarations: (tab) => collectHtmlLikeDeclarations(tab, "HTML"),
    collectReferences: (tab) => collectHtmlLikeReferences(tab, "asset"),
    focusAreas: ["DOM", "Anchors", "Assets", "Forms"],
    snippets: [
      { id: "html-section", label: "Section", description: "Insert a semantic section", text: '\n<section id="section-id">\n  <h2>Section title</h2>\n  <p>Content.</p>\n</section>\n' },
      { id: "html-asset", label: "Asset", description: "Insert a local asset reference", text: '<link rel="stylesheet" href="./styles.css">\n' },
      { id: "html-anchor", label: "Anchor", description: "Insert an anchor link", text: '<a href="#section-id">Section</a>' }
    ]
  },
  xml: {
    format: "xml",
    label: "XML",
    defaultName: "untitled.xml",
    defaultContent: () => ['<?xml version="1.0" encoding="UTF-8"?>', "<document>", '  <item id="item-1">Untitled</item>', "</document>", ""].join("\n"),
    analyze: analyzeXml,
    collectDeclarations: (tab) => collectHtmlLikeDeclarations(tab, "XML"),
    collectReferences: collectXmlReferences,
    focusAreas: ["Elements", "ID/IDREF", "Schemas", "XInclude"],
    snippets: [
      { id: "xml-element", label: "Element", description: "Insert an XML element", text: '\n<item id="item-id">\n  <name>Item</name>\n</item>\n' },
      { id: "xml-schema", label: "Schema", description: "Insert schema location attributes", text: ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="./schema.xsd"' },
      { id: "xml-include", label: "XInclude", description: "Insert an XInclude-style reference", text: '\n<xi:include href="./shared.xml" xmlns:xi="http://www.w3.org/2001/XInclude" />\n' }
    ]
  },
  yaml: {
    format: "yaml",
    label: "YAML",
    defaultName: "untitled.yaml",
    defaultContent: () => ["name: untitled", "items:", "  - id: item-1", "    enabled: true", ""].join("\n"),
    analyze: analyzeYaml,
    collectDeclarations: (tab) => [...collectYamlDeclarations(tab), ...collectSpdxDeclarations(tab)],
    collectReferences: (tab) => [...collectYamlReferences(tab), ...collectSpdxReferences(tab)],
    focusAreas: ["Paths", "Anchors", "Aliases", "$ref"],
    snippets: [
      { id: "yaml-anchor", label: "Anchor", description: "Insert an anchor and alias merge", text: "\nshared: &shared\n  enabled: true\nconsumer:\n  <<: *shared\n" },
      { id: "yaml-ref", label: "$ref", description: "Insert a cross-file schema reference", text: "$ref: ./schema.yaml#/definitions/Item" },
      { id: "yaml-sequence", label: "List Item", description: "Insert a sequence item", text: "\n- id: item\n  name: Item\n" }
    ]
  },
  json: {
    format: "json",
    label: "JSON",
    defaultName: "untitled.json",
    defaultContent: () => ['{', '  "name": "untitled",', '  "items": []', '}', ""].join("\n"),
    analyze: analyzeJson,
    collectDeclarations: (tab) => [...collectJsonDeclarations(tab), ...collectSpdxDeclarations(tab)],
    collectReferences: (tab) => [...collectJsonReferences(tab), ...collectSpdxReferences(tab)],
    focusAreas: ["JSONPath", "$ref", "Schema", "Arrays"],
    snippets: [
      { id: "json-ref", label: "$ref", description: "Insert a JSON Schema reference object", text: '{\n  "$ref": "./schema.json#/definitions/Item"\n}' },
      { id: "json-array", label: "Array", description: "Insert an array property", text: '"items": [\n  {\n    "id": "item"\n  }\n]' },
      { id: "json-schema-id", label: "$id", description: "Insert a schema identifier", text: '"$id": "https://example.local/schema.json"' }
    ]
  },
  "spdx-json": {
    format: "spdx-json",
    label: "SPDX JSON",
    defaultName: "bom.spdx.json",
    defaultContent: spdxJsonTemplate,
    analyze: (content) => analyzeSpdx("spdx-json", content),
    collectDeclarations: (tab) => [...collectJsonDeclarations(tab), ...collectSpdxDeclarations(tab)],
    collectReferences: (tab) => [...collectJsonReferences(tab), ...collectSpdxReferences(tab)],
    focusAreas: ["Packages", "Files", "Relationships", "Licenses"],
    snippets: [
      { id: "spdx-json-package", label: "Package", description: "Insert an SPDX JSON package", text: '{\n  "name": "package-name",\n  "SPDXID": "SPDXRef-Package-package-name",\n  "downloadLocation": "NOASSERTION",\n  "licenseConcluded": "NOASSERTION"\n}' },
      { id: "spdx-json-file", label: "File", description: "Insert an SPDX JSON file", text: '{\n  "fileName": "./src/file",\n  "SPDXID": "SPDXRef-File-src-file",\n  "checksums": [],\n  "licenseConcluded": "NOASSERTION"\n}' },
      { id: "spdx-json-relation", label: "Relation", description: "Insert an SPDX JSON relationship", text: '{\n  "spdxElementId": "SPDXRef-DOCUMENT",\n  "relationshipType": "DESCRIBES",\n  "relatedSpdxElement": "SPDXRef-Package-package-name"\n}' }
    ]
  },
  "spdx-yaml": {
    format: "spdx-yaml",
    label: "SPDX YAML",
    defaultName: "bom.spdx.yaml",
    defaultContent: spdxYamlTemplate,
    analyze: (content) => analyzeSpdx("spdx-yaml", content),
    collectDeclarations: (tab) => [...collectYamlDeclarations(tab), ...collectSpdxDeclarations(tab)],
    collectReferences: (tab) => [...collectYamlReferences(tab), ...collectSpdxReferences(tab)],
    focusAreas: ["Packages", "Files", "Relationships", "Licenses"],
    snippets: [
      { id: "spdx-yaml-package", label: "Package", description: "Insert an SPDX YAML package", text: "\n- name: package-name\n  SPDXID: SPDXRef-Package-package-name\n  downloadLocation: NOASSERTION\n  licenseConcluded: NOASSERTION\n" },
      { id: "spdx-yaml-file", label: "File", description: "Insert an SPDX YAML file", text: "\n- fileName: ./src/file\n  SPDXID: SPDXRef-File-src-file\n  checksums: []\n  licenseConcluded: NOASSERTION\n" },
      { id: "spdx-yaml-relation", label: "Relation", description: "Insert an SPDX YAML relationship", text: "\n- spdxElementId: SPDXRef-DOCUMENT\n  relationshipType: DESCRIBES\n  relatedSpdxElement: SPDXRef-Package-package-name\n" }
    ]
  },
  "spdx-tag-value": {
    format: "spdx-tag-value",
    label: "SPDX",
    defaultName: "bom.spdx",
    defaultContent: spdxTagValueTemplate,
    analyze: (content) => analyzeSpdx("spdx-tag-value", content),
    collectDeclarations: collectSpdxDeclarations,
    collectReferences: collectSpdxReferences,
    focusAreas: ["Packages", "Files", "Relationships", "Licenses"],
    snippets: [
      { id: "spdx-package", label: "Package", description: "Insert an SPDX package block", text: "\nPackageName: package-name\nPackageSPDXID: SPDXRef-Package-package-name\nPackageDownloadLocation: NOASSERTION\nPackageLicenseConcluded: NOASSERTION\n" },
      { id: "spdx-file", label: "File", description: "Insert an SPDX file block", text: "\nFileName: ./src/file\nSPDXID: SPDXRef-File-src-file\nFileChecksum: SHA1: \nLicenseConcluded: NOASSERTION\n" },
      { id: "spdx-relation", label: "Relation", description: "Insert an SPDX relationship", text: "\nRelationship: SPDXRef-DOCUMENT DESCRIBES SPDXRef-Package-package-name\n" }
    ]
  },
  unknown: {
    format: "unknown",
    label: "Text",
    defaultName: "untitled.txt",
    defaultContent: () => "",
    analyze: analyzeText,
    collectDeclarations: emptyDeclarations,
    collectReferences: emptyReferences,
    focusAreas: ["Text", "Search", "Format", "Validate"],
    snippets: [{ id: "text-note", label: "Note", description: "Insert a text marker", text: "\n# Note\n" }]
  }
};

export const formatAdapters = Object.values(adapters);

export function getFormatAdapter(format: DocumentFormat): FormatAdapter {
  return adapters[format] ?? adapters.unknown;
}

function htmlTemplate(): string {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <title>Untitled</title>",
    "  </head>",
    "  <body>",
    "    <main>",
    "      <h1>Untitled</h1>",
    "    </main>",
    "  </body>",
    "</html>",
    ""
  ].join("\n");
}

function spdxJsonTemplate(): string {
  const createdAt = currentIsoTimestamp();
  return [
    "{",
    '  "spdxVersion": "SPDX-2.3",',
    '  "dataLicense": "CC0-1.0",',
    '  "SPDXID": "SPDXRef-DOCUMENT",',
    '  "name": "Untitled BOM",',
    '  "documentNamespace": "https://example.com/spdx/untitled",',
    '  "creationInfo": {',
    '    "creators": ["Tool: 哞-编辑器"],',
    `    "created": "${createdAt}"`,
    "  },",
    '  "packages": []',
    "}",
    ""
  ].join("\n");
}

function spdxYamlTemplate(): string {
  const createdAt = currentIsoTimestamp();
  return [
    "spdxVersion: SPDX-2.3",
    "dataLicense: CC0-1.0",
    "SPDXID: SPDXRef-DOCUMENT",
    "name: Untitled BOM",
    "documentNamespace: https://example.com/spdx/untitled",
    "creationInfo:",
    "  creators:",
    "    - 'Tool: 哞-编辑器'",
    `  created: '${createdAt}'`,
    "packages: []",
    ""
  ].join("\n");
}

function spdxTagValueTemplate(): string {
  return [
    "SPDXVersion: SPDX-2.3",
    "DataLicense: CC0-1.0",
    "SPDXID: SPDXRef-DOCUMENT",
    "DocumentName: Untitled BOM",
    "DocumentNamespace: https://example.com/spdx/untitled",
    "Creator: Tool: 哞-编辑器",
    `Created: ${currentIsoTimestamp()}`,
    ""
  ].join("\n");
}

function currentIsoTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
