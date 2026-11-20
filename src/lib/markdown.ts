import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import { katex } from "@mdit/plugin-katex";
import type { Token } from "markdown-it";
import { renderMermaidBlocks } from "./mermaid";
import { sanitizeMarkdownRoot, trustGeneratedTree } from "./markdownSanitize";

export interface MarkdownHeading {
  id: string;
  text: string;
  level: number;
  /** One-based line in the original source, including YAML front matter. */
  line: number;
}

export interface MarkdownRenderOptions {
  signal?: AbortSignal;
  errorLabel?: string;
  resolveImage?: (src: string) => Promise<string | undefined>;
  strictImages?: boolean;
}

export interface MarkdownRenderResult {
  html: string;
  headings: MarkdownHeading[];
  warnings: string[];
}

type Highlighter = (code: string, language: string) => string;
let highlighterPromise: Promise<Highlighter> | undefined;

/** Keep this synchronous and DOM-independent: analysis and preview share the same tokens/IDs. */
export function extractMarkdownHeadings(source: string): MarkdownHeading[] {
  const prepared = prepareMarkdown(source);
  const parser = createParser();
  return collectHeadings(parser.parse(prepared.content, {}), prepared.lineOffset);
}

export function stripFrontMatter(content: string): string {
  return prepareMarkdown(content).content;
}

/** The only Markdown rendering pipeline, shared by preview and standalone export. */
export async function renderMarkdownDocument(
  source: string,
  options: MarkdownRenderOptions = {}
): Promise<MarkdownRenderResult> {
  assertNotAborted(options.signal);
  const prepared = prepareMarkdown(source);
  const warnings: string[] = [];
  const formulas = new Map<string, string>();
  const markerPrefix = `muleditor-math-${crypto.randomUUID()}-`;
  const parser = createParser(undefined, (html) => {
    const key = `${markerPrefix}${formulas.size}`;
    formulas.set(key, html);
    return `<span data-muleditor-math="${key}"></span>`;
  });
  const environment = {};
  const tokens = parser.parse(prepared.content, environment);
  const headings = collectHeadings(tokens, prepared.lineOffset);
  if (tokens.some((token) => token.type === "fence" && !["mermaid", "math"].includes(token.info.trim().split(/\s+/)[0]))) {
    parser.options.highlight = await loadHighlighter();
    assertNotAborted(options.signal);
  }

  const root = document.createElement("div");
  root.innerHTML = parser.renderer.render(tokens, parser.options, environment);
  // Keep original attributes before purification drops file: and other non-web protocols.
  const imageSources = new Map(Array.from(root.querySelectorAll("img"), (img) => [img, img.getAttribute("src") ?? ""]));
  sanitizeMarkdownRoot(root);
  const trusted = new WeakSet<Node>();
  for (const marker of root.querySelectorAll<HTMLElement>("[data-muleditor-math]")) {
    const html = formulas.get(marker.dataset.muleditorMath ?? "");
    if (html === undefined) {
      marker.removeAttribute("data-muleditor-math");
      continue;
    }
    const formula = document.createElement("span");
    formula.innerHTML = html;
    trustGeneratedTree(formula, trusted);
    marker.replaceWith(...Array.from(formula.childNodes));
  }

  await renderMermaidBlocks(root, {
    signal: options.signal,
    errorLabel: options.errorLabel ?? "Unable to render Mermaid diagram",
    onError: (message) => warnings.push(message)
  });
  assertNotAborted(options.signal);
  for (const diagram of root.querySelectorAll(".mermaidDiagram > svg")) trustGeneratedTree(diagram, trusted);
  await resolveImages(root, imageSources, options, warnings);
  assertNotAborted(options.signal);
  // Final purification also covers generated formulas, SVG and resolver-provided URLs.
  sanitizeMarkdownRoot(root, trusted);
  for (const error of root.querySelectorAll<HTMLElement>(".katex-error")) {
    warnings.push(error.getAttribute("title") || `Unable to render formula: ${error.textContent ?? ""}`);
  }
  return { html: root.innerHTML, headings, warnings };
}

function createParser(highlight?: Highlighter, transformMath?: (html: string) => string): InstanceType<typeof MarkdownIt> {
  const parser = new MarkdownIt({ html: true, linkify: true, typographer: false, highlight });
  const validateLink = parser.validateLink;
  // Native local images go through the resolver; final HTML still rejects file: links.
  parser.validateLink = (url) => /^(?:file:|[a-z]:[\\/])/i.test(url) || validateLink(url);
  parser.use(footnote).use(taskLists, { enabled: false, label: false }).use(katex, {
    delimiters: "all",
    mathFence: true,
    trust: false,
    throwOnError: false,
    strict: "ignore",
    output: "htmlAndMathml",
    transformer: transformMath
  }).use(anchor, {
    slugify: headingSlug,
    getTokensText: inlineText,
    tabIndex: false,
    uniqueSlugStartIndex: 1,
    permalink: anchor.permalink.linkInsideHeader({
      class: "heading-anchor",
      symbol: "#",
      ariaHidden: false,
      renderAttrs: (slug) => ({ "aria-label": `# ${slug}` })
    })
  });
  const headingOpen = parser.renderer.rules.heading_open;
  parser.renderer.rules.heading_open = (tokens, index, rendererOptions, env, renderer) => {
    tokens[index].attrSet("data-outline-id", tokens[index].attrGet("id") ?? "");
    return headingOpen?.(tokens, index, rendererOptions, env, renderer) ?? renderer.renderToken(tokens, index, rendererOptions);
  };
  return parser;
}

function collectHeadings(tokens: Token[], lineOffset: number): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  tokens.forEach((token, index) => {
    if (token.type !== "heading_open") return;
    headings.push({
      id: String(token.attrGet("id") ?? "section"),
      text: inlineText(tokens[index + 1]?.children ?? []),
      level: Number(token.tag.slice(1)),
      line: (token.map?.[0] ?? 0) + lineOffset + 1
    });
  });
  return headings;
}

function inlineText(tokens: Token[]): string {
  return tokens.map((token) => {
    if (token.type === "image") return inlineText(token.children ?? []) || token.content;
    if (["text", "code_inline", "math_inline", "math_inline_double", "math_single", "math_double"].includes(token.type)) return token.content;
    if (["softbreak", "hardbreak"].includes(token.type)) return " ";
    return token.children ? inlineText(token.children) : "";
  }).join("").trim();
}

function headingSlug(text: string): string {
  const slug = text.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{M}\p{N}_-]/gu, "") || "section";
  // DOMPurify's DOM-clobbering guard intentionally rejects these as element IDs.
  return /^(?:location|name|id|attributes|children|constructor|__proto__|prototype|forms|images|links|scripts|body|head|cookie|write|open|close)$/i.test(slug)
    ? `md-${slug}` : slug;
}

function prepareMarkdown(source: string): { content: string; lineOffset: number } {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (!/^---[ \t]*$/.test(lines[0])) return { content: source, lineOffset: 0 };
  const closing = lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)[ \t]*$/.test(line));
  return closing < 0 ? { content: source, lineOffset: 0 } : { content: lines.slice(closing + 1).join("\n"), lineOffset: closing + 1 };
}

function loadHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import("highlight.js/lib/common").then(({ default: hljs }) => (code: string, language: string) => {
    if (!language || !hljs.getLanguage(language)) return "";
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    } catch {
      return ""; // Markdown-it escapes the original source when no highlighting is available.
    }
  });
  return highlighterPromise;
}

async function resolveImages(
  root: HTMLElement,
  sources: Map<HTMLImageElement, string>,
  options: MarkdownRenderOptions,
  warnings: string[]
) {
  for (const image of root.querySelectorAll("img")) {
    assertNotAborted(options.signal);
    const src = sources.get(image) ?? image.getAttribute("src") ?? "";
    if (!src || /^(?:javascript|vbscript):/i.test(src.replace(/[\u0000-\u0020]/g, ""))) continue;
    const local = !/^(?:https?:|data:|blob:|\/\/)/i.test(src);
    try {
      const resolved = await options.resolveImage?.(src);
      assertNotAborted(options.signal);
      if (resolved) {
        if (/^(?:javascript|vbscript|file):/i.test(resolved.replace(/[\u0000-\u0020]/g, "")) || /^data:(?!image\/)/i.test(resolved)) {
          image.removeAttribute("src");
          throw new Error(`Image resolver returned an unsafe URL: ${src}`);
        }
        image.setAttribute("src", resolved);
      }
      else if (local) throw new Error(`Local image could not be resolved: ${src}`);
    } catch (error) {
      assertNotAborted(options.signal);
      const message = error instanceof Error ? error.message : String(error);
      if (options.strictImages) throw new Error(message);
      warnings.push(message);
    }
  }
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Markdown rendering was canceled", "AbortError");
}
