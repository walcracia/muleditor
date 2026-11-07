import * as prettier from "prettier/standalone";
import * as prettierHtml from "prettier/plugins/html";
import * as prettierMarkdown from "prettier/plugins/markdown";
import YAML from "yaml";
import type { DocumentFormat } from "../types";

export async function formatDocument(format: DocumentFormat, content: string): Promise<string> {
  switch (format) {
    case "markdown":
      return prettier.format(content, {
        parser: "markdown",
        plugins: [prettierMarkdown],
        proseWrap: "preserve"
      });
    case "html":
      return prettier.format(content, {
        parser: "html",
        plugins: [prettierHtml]
      });
    case "json":
    case "spdx-json":
      return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
    case "yaml":
    case "spdx-yaml": {
      const doc = YAML.parseDocument(content);
      if (doc.errors.length) {
        throw new Error(doc.errors[0].message);
      }
      return doc.toString({ lineWidth: 100 });
    }
    case "xml":
      return formatXml(content);
    case "spdx-tag-value":
      return `${content
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .join("\n")
        .trim()}\n`;
    default:
      return content;
  }
}

function formatXml(content: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("XML parse error");
  }

  const serialized = new XMLSerializer().serializeToString(doc);
  const withoutGaps = serialized.replace(/>\s+</g, "><");
  const tokens = withoutGaps.replace(/></g, ">\n<").split("\n");
  let depth = 0;

  const lines = tokens.map((token) => {
    if (/^<\/[^>]+>/.test(token)) {
      depth = Math.max(depth - 1, 0);
    }
    const line = `${"  ".repeat(depth)}${token}`;
    if (/^<[^!?/][^>]*[^/]?>$/.test(token) && !/^<[^>]+>[^<]+<\/[^>]+>$/.test(token)) {
      depth += 1;
    }
    return line;
  });

  return `${lines.join("\n")}\n`;
}
