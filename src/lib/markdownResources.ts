import { invoke } from "@tauri-apps/api/core";

export interface MarkdownImageContext {
  sourcePath?: string;
  relativePath?: string;
  workspaceRoot?: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const browserFiles = new Map<string, Map<string, File>>();
const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml"
};

/**
 * Keep the File objects selected by the user, including images which are not editor tabs.
 * Folder imports are keyed by their webkitRelativePath root; reimporting a root replaces
 * that root only. Files selected without a folder share a separate, cumulative group;
 * a newly selected loose file replaces only the previously selected file of the same name.
 * An empty registration clears all groups. No object URLs or filesystem permissions persist.
 */
export function registerBrowserMarkdownFiles(files: Iterable<File>): void {
  const replacements = new Map<string, Map<string, File>>();
  for (const file of files) {
    const path = normalizeRelativePath(file.webkitRelativePath || file.name);
    if (!path) continue;
    const root = file.webkitRelativePath && path.includes("/") ? path.split("/")[0] : "";
    const group = replacements.get(root) ?? (root ? new Map<string, File>() : new Map(browserFiles.get("")));
    group.set(path, file);
    replacements.set(root, group);
  }
  if (!replacements.size) {
    browserFiles.clear();
    return;
  }
  for (const [root, group] of replacements) browserFiles.set(root, group);
}

/** Resolve user-selected local images to portable data URIs; remote URLs are untouched. */
export async function resolveMarkdownImage(src: string, context: MarkdownImageContext): Promise<string | undefined> {
  const paths = localImagePaths(src);
  if (!paths.length) return undefined;

  const isDesktop = typeof window !== "undefined" && Reflect.has(window, "__TAURI_INTERNALS__");
  if (isDesktop) {
    if (!context.sourcePath) return undefined;
    return invoke<string>("read_markdown_image", { sourcePath: context.sourcePath, imagePath: src });
  }

  const source = normalizeRelativePath(context.relativePath ?? "");
  if (!source) return undefined;
  const explicitRoot = context.workspaceRoot ? normalizeRelativePath(context.workspaceRoot) : undefined;
  const root = explicitRoot?.split("/")[0] ?? (source.includes("/") ? source.split("/")[0] : "");
  const group = browserFiles.get(root);
  if (!group) return undefined;
  const sourcePath = root && !source.startsWith(`${root}/`) ? `${root}/${source}` : source;
  const directory = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : "";

  for (const imagePath of paths) {
    const resolvedPath = normalizeRelativePath(directory ? `${directory}/${imagePath}` : imagePath);
    if (!resolvedPath || (root && !resolvedPath.startsWith(`${root}/`))) continue;
    const file = group.get(resolvedPath);
    if (!file) continue;
    if (file.size > MAX_IMAGE_BYTES) throw new Error(`Markdown image exceeds the 10 MiB limit: ${file.name}`);
    const bytes = new Uint8Array(await readFileBytes(file));
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`Markdown image exceeds the 10 MiB limit: ${file.name}`);
    const mime = mimeForPath(imagePath);
    if (!mime || !isImageContent(bytes, mime)) throw new Error(`Unsupported or invalid Markdown image: ${file.name}`);
    return `data:${mime};base64,${encodeBase64(bytes)}`;
  }
  return undefined;
}

function localImagePaths(src: string): string[] {
  const value = src.trim().replace(/\\/g, "/");
  if (!value || value.startsWith("#") || isAbsoluteOrProtocol(value)) return [];
  // URL delimiters are removed before decoding, so %23 remains part of a filename.
  // The second candidate also supports literal '#' characters in local filenames.
  const candidates = [value.split(/[?#]/, 1)[0], value].map((path) => {
    try { return decodeURIComponent(path).replace(/\\/g, "/"); } catch { return path; }
  });
  return [...new Set(candidates)].filter((path) => !isAbsoluteOrProtocol(path) && !!mimeForPath(path));
}

function isAbsoluteOrProtocol(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\") || /^[a-z][a-z\d+.-]*:/i.test(path) || path.includes("\0");
}

function normalizeRelativePath(path: string): string | undefined {
  const value = path.replace(/\\/g, "/");
  if (isAbsoluteOrProtocol(value)) return undefined;
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.length ? parts.join("/") : undefined;
}

function mimeForPath(path: string): string | undefined {
  return imageTypes[path.split(".").pop()?.toLowerCase() ?? ""];
}

function isImageContent(bytes: Uint8Array, mime: string): boolean {
  const starts = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  switch (mime) {
    case "image/png": return starts([137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/jpeg": return starts([255, 216, 255]);
    case "image/gif": return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/bmp": return ascii(0, 2) === "BM";
    case "image/x-icon": return starts([0, 0, 1, 0]);
    case "image/svg+xml": {
      const document = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "image/svg+xml");
      // SVG stays an image data URI. Never inject these bytes as inline HTML/SVG.
      return !document.querySelector("parsererror") && document.documentElement.localName === "svg";
    }
    default: return false;
  }
}

function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error(`Cannot read Markdown image: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }
  return btoa(chunks.join(""));
}
