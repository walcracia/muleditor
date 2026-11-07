type MermaidApi = (typeof import("mermaid"))["default"];

interface MermaidRenderOptions {
  errorLabel: string;
  signal?: AbortSignal;
}

let mermaidPromise: Promise<MermaidApi> | undefined;
let diagramId = 0;

export async function renderMermaidBlocks(root: HTMLElement, options: MermaidRenderOptions): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>("pre > code.language-mermaid"));
  if (!blocks.length) return;

  let mermaid: MermaidApi;
  try {
    mermaid = await loadMermaid();
  } catch (error) {
    if (!options.signal?.aborted) {
      blocks.forEach((block) => replaceWithError(block, options.errorLabel, error));
    }
    return;
  }

  for (const block of blocks) {
    if (options.signal?.aborted || !root.isConnected || !block.isConnected) return;

    const sourceBlock = block.parentElement;
    if (!(sourceBlock instanceof HTMLPreElement)) continue;

    const source = block.textContent ?? "";
    try {
      const { svg, bindFunctions } = await mermaid.render(nextDiagramId(), source);
      if (options.signal?.aborted || !root.isConnected || !sourceBlock.isConnected) return;

      const diagram = document.createElement("div");
      diagram.className = "mermaidDiagram";
      diagram.innerHTML = svg;
      sourceBlock.replaceWith(diagram);
      bindFunctions?.(diagram);
    } catch (error) {
      if (options.signal?.aborted || !sourceBlock.isConnected) return;
      replaceWithError(block, options.errorLabel, error);
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
  });
  return mermaidPromise;
}

function nextDiagramId(): string {
  diagramId += 1;
  return `muleditor-mermaid-${diagramId}`;
}

function replaceWithError(block: HTMLElement, label: string, error: unknown) {
  const sourceBlock = block.parentElement;
  if (!(sourceBlock instanceof HTMLPreElement) || !sourceBlock.isConnected) return;

  const errorBox = document.createElement("div");
  errorBox.className = "mermaidDiagram mermaidDiagramError";
  errorBox.setAttribute("role", "alert");

  const title = document.createElement("strong");
  title.textContent = label;

  const detail = document.createElement("span");
  detail.textContent = error instanceof Error ? error.message : String(error);

  errorBox.append(title, detail, sourceBlock.cloneNode(true));
  sourceBlock.replaceWith(errorBox);
}
