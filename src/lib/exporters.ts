import { marked } from "marked";
import type { DocumentTab } from "../types";
import { ensureExportName } from "./formats";
import { stripFrontMatter } from "./markdown";

export interface ExportPayload {
  name: string;
  content: string;
  mimeType: string;
}

export function buildSmartExport(tab: DocumentTab): ExportPayload {
  switch (tab.format) {
    case "markdown": {
      const html = marked.parse(stripFrontMatter(tab.content), { async: false }) as string;
      return {
        name: ensureExportName(tab.name, ".html"),
        mimeType: "text/html",
        content: `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(tab.name)}</title>
  </head>
  <body>
${html}
  </body>
</html>
`
      };
    }
    case "json":
    case "spdx-json":
      return {
        name: ensureExportName(tab.name, ".min.json"),
        mimeType: "application/json",
        content: JSON.stringify(JSON.parse(tab.content))
      };
    default:
      return {
        name: tab.name,
        mimeType: "text/plain",
        content: tab.content
      };
  }
}

export function downloadTextFile(payload: ExportPayload): void {
  const blob = new Blob([payload.content], { type: payload.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.name;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
