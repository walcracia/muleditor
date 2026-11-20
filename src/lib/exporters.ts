import DOMPurify from "dompurify";
import type { DocumentTab } from "../types";
import { ensureExportName } from "./formats";
import { renderMarkdownDocument } from "./markdown";
import { resolveMarkdownImage } from "./markdownResources";

export interface ExportPayload {
  name: string;
  content: string;
  mimeType: string;
}

export interface SmartExportOptions {
  signal?: AbortSignal;
  lang?: string;
  errorLabel?: string;
}

const maxImageBytes = 10 * 1024 * 1024;
const maxTotalImageBytes = 50 * 1024 * 1024;
const imageTimeoutMs = 10_000;
const supportedImageTypes = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml"
]);

export async function buildSmartExport(tab: DocumentTab, options: SmartExportOptions = {}): Promise<ExportPayload> {
  throwIfAborted(options.signal);
  switch (tab.format) {
    case "markdown": {
      const rendered = await renderMarkdownDocument(tab.content, {
        signal: options.signal,
        errorLabel: options.errorLabel,
        strictImages: true,
        resolveImage: createExportImageResolver(tab, options.signal)
      });
      throwIfAborted(options.signal);
      // A second boundary protects the standalone document if a future renderer
      // introduces a new HTML path. Preserve KaTeX MathML and Mermaid SVG.
      const html = DOMPurify.sanitize(rendered.html, {
        USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
        ADD_ATTR: ["target", "data-source-line", "data-outline-id", "aria-label"],
        FORBID_TAGS: ["iframe", "object", "embed", "form", "base", "link", "meta"]
      });
      assertEmbeddedResources(html);
      const { getMarkdownExportStyles } = await import("./markdownExportStyles");
      throwIfAborted(options.signal);
      const styles = getMarkdownExportStyles();
      const lang = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(options.lang ?? "") ? options.lang! : "en";
      return {
        name: ensureExportName(tab.name, ".html"),
        mimeType: "text/html",
        content: `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
    <title>${escapeHtml(tab.name)}</title>
    <style>${styles}</style>
  </head>
  <body>
    <article class="markdownBody">${html}</article>
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

function createExportImageResolver(tab: DocumentTab, signal?: AbortSignal): (src: string) => Promise<string> {
  const images = new Map<string, Promise<string>>();
  let totalBytes = 0;
  return (source) => {
    const src = source.trim();
    let pending = images.get(src);
    if (!pending) {
      pending = (async () => {
        throwIfAborted(signal);
        let dataUri: string | undefined;
        if (/^data:/i.test(src)) {
          dataUri = src;
        } else if (/^(?:https?:)?\/\//i.test(src)) {
          dataUri = await fetchImageDataUri(src.startsWith("//") ? `https:${src}` : src, signal);
        } else {
          if (/^[a-z][a-z\d+.-]*:/i.test(src) && !/^[a-z]:[\\/]/i.test(src)) {
            throw new Error(`Cannot export image with this protocol: ${src}`);
          }
          dataUri = await resolveMarkdownImage(src, {
            sourcePath: tab.path,
            relativePath: tab.relativePath,
            workspaceRoot: tab.workspaceRoot
          });
        }
        throwIfAborted(signal);
        if (!dataUri) throw new Error(`Cannot embed image: ${src}. Open its folder or check the image path, then export again.`);
        const checked = validateImageDataUri(dataUri);
        totalBytes += checked.bytes;
        if (totalBytes > maxTotalImageBytes) throw new Error("Export images exceed the 50 MiB total limit.");
        return checked.dataUri;
      })();
      images.set(src, pending);
    }
    return pending;
  };
}

async function fetchImageDataUri(src: string, signal?: AbortSignal): Promise<string> {
  const url = new URL(src);
  if (url.username || url.password) throw new Error("Images with credentials in their URL cannot be exported.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = globalThis.setTimeout(abort, imageTimeoutMs);
  try {
    throwIfAborted(signal);
    const response = await fetch(url.href, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.url && !/^https?:\/\//i.test(response.url)) throw new Error("Unsupported image redirect.");
    const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!mime || !supportedImageTypes.has(mime)) throw new Error(`Unsupported image type: ${mime || "missing Content-Type"}`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > maxImageBytes) throw new Error("Image exceeds the 10 MiB limit.");
    const bytes = await readImageBytes(response);
    return `data:${mime};base64,${encodeBase64(bytes)}`;
  } catch (error) {
    throwIfAborted(signal);
    if (controller.signal.aborted) throw new Error(`Image download timed out after 10 seconds: ${src}`);
    throw new Error(`Cannot download image ${src}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function readImageBytes(response: Response): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maxImageBytes) throw new Error("Image is empty or exceeds the 10 MiB limit.");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxImageBytes) throw new Error("Image exceeds the 10 MiB limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!length) throw new Error("Image is empty.");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function validateImageDataUri(dataUri: string): { dataUri: string; bytes: number } {
  const match = dataUri.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/i);
  const mime = match?.[1].toLowerCase();
  if (!match || !mime || !supportedImageTypes.has(mime)) throw new Error("Image resolver returned an unsupported image type.");
  let bytes: Uint8Array;
  try {
    bytes = match[2]
      ? Uint8Array.from(atob(match[3]), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(match[3]));
  } catch {
    throw new Error("Image has invalid data URI encoding.");
  }
  if (!bytes.length || bytes.length > maxImageBytes) throw new Error("Image is empty or exceeds the 10 MiB limit.");
  if (mime === "image/svg+xml") {
    const svg = new TextDecoder().decode(bytes);
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") throw new Error("Invalid SVG image.");
    // An SVG data URI can still reference external images, fonts, or styles.
    // Refuse those dependencies rather than silently changing the picture.
    assertNoSvgDependencies(parsed.documentElement);
    const sanitized = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
    return { dataUri: `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(sanitized))}`, bytes: bytes.length };
  }
  return { dataUri: `data:${mime};base64,${encodeBase64(bytes)}`, bytes: bytes.length };
}

function assertEmbeddedResources(html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll("[src], [srcset], [poster]")) {
    if (element.hasAttribute("srcset") || element.hasAttribute("poster")) {
      throw new Error("Export cannot embed responsive images or media posters. Use a single Markdown image instead.");
    }
    const src = element.getAttribute("src") ?? "";
    if (element.localName !== "img" || !/^data:image\//i.test(src)) throw new Error(`Export contains an unresolved image or media resource: ${src}`);
  }
  for (const svg of template.content.querySelectorAll("svg")) assertNoSvgDependencies(svg);
  for (const element of template.content.querySelectorAll("[style], style")) {
    assertLocalCss(element.localName === "style" ? element.textContent ?? "" : element.getAttribute("style") ?? "");
  }
}

function assertNoSvgDependencies(svg: Element): void {
  for (const element of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (["href", "xlink:href", "src"].includes(attribute.name.toLowerCase()) && !attribute.value.trim().startsWith("#")) {
        throw new Error("SVG image contains an external dependency. Embed its resources before exporting.");
      }
      if (attribute.value.includes("url(")) assertLocalCss(attribute.value);
    }
    if (element.localName === "style") assertLocalCss(element.textContent ?? "");
  }
}

function assertLocalCss(css: string): void {
  if (/@import/i.test(css) || /\\/.test(css)) throw new Error("Export contains a stylesheet dependency that cannot be embedded.");
  for (const match of css.matchAll(/url\(\s*([^)]*)\)/gi)) {
    const target = match[1].trim().replace(/^["']|["']$/g, "");
    if (!target.startsWith("#")) throw new Error("Export contains an external CSS resource. Embed it before exporting.");
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Export canceled.", "AbortError");
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
