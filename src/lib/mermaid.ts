import { sanitizeMermaidSvg } from "./markdownSanitize";

type MermaidApi = (typeof import("mermaid"))["default"];

interface MermaidRenderOptions {
  errorLabel: string;
  signal?: AbortSignal;
  onError?: (message: string) => void;
}

let mermaidPromise: Promise<MermaidApi> | undefined;
let diagramId = 0;
const renderVersions = new WeakMap<HTMLElement, number>();

export async function renderMermaidBlocks(root: HTMLElement, options: MermaidRenderOptions): Promise<void> {
  const version = (renderVersions.get(root) ?? 0) + 1;
  renderVersions.set(root, version);
  const isCurrent = () => !options.signal?.aborted && renderVersions.get(root) === version;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"));
  if (!blocks.length || !isCurrent()) return;

  let mermaid: MermaidApi;
  try {
    mermaid = await loadMermaid();
  } catch (error) {
    if (isCurrent()) {
      blocks.filter((block) => root.contains(block)).forEach((block) => replaceWithError(block, options, error));
    }
    return;
  }

  for (const block of blocks) {
    if (!isCurrent()) return;
    if (!root.contains(block)) continue;

    const sourceBlock = block.parentElement;
    if (!(sourceBlock instanceof HTMLPreElement)) continue;

    const source = block.textContent ?? "";
    try {
      const { svg } = await mermaid.render(nextDiagramId(), source);
      if (!isCurrent() || !root.contains(sourceBlock)) continue;

      const diagram = document.createElement("div");
      diagram.className = "mermaidDiagram";
      diagram.innerHTML = sanitizeMermaidSvg(svg);
      sourceBlock.replaceWith(diagram);
    } catch (error) {
      if (!isCurrent() || !root.contains(sourceBlock)) continue;
      replaceWithError(block, options, error);
    }
  }
}

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: "neutral"
    });
    return mermaid;
  }).catch((error) => {
    mermaidPromise = undefined;
    throw error;
  });
  return mermaidPromise;
}

function nextDiagramId(): string {
  diagramId += 1;
  return `muleditor-mermaid-${diagramId}`;
}

function replaceWithError(block: HTMLElement, options: MermaidRenderOptions, error: unknown) {
  const sourceBlock = block.parentElement;
  if (!(sourceBlock instanceof HTMLPreElement)) return;

  const errorBox = document.createElement("div");
  errorBox.className = "mermaidDiagram mermaidDiagramError";
  errorBox.setAttribute("role", "alert");

  const title = document.createElement("strong");
  title.textContent = options.errorLabel;

  const detail = document.createElement("span");
  detail.textContent = error instanceof Error ? error.message : String(error);
  options.onError?.(`${options.errorLabel}: ${detail.textContent}`);

  errorBox.append(title, detail, sourceBlock.cloneNode(true));
  sourceBlock.replaceWith(errorBox);
}
