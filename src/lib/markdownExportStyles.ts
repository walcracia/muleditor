import katexCss from "katex/dist/katex.min.css?raw";
import markdownCss from "../markdown.css?raw";

// Explicit inline imports keep exported files independent of Vite's assets folder.
const fontModules = import.meta.glob<string>("/node_modules/katex/dist/fonts/*.woff2", {
  query: "?inline",
  import: "default",
  eager: true
});

let exportStyles: string | undefined;

export function getMarkdownExportStyles(): string {
  if (exportStyles) return exportStyles;
  const fonts = new Map(Object.entries(fontModules).map(([path, value]) => [path.split("/").pop(), value]));
  const embeddedKatex = katexCss.replace(/@font-face\s*\{[^}]*\}/g, (fontFace) => {
    const fontName = fontFace.match(/url\(["']?(?:\.\/)?fonts\/([^"')]+\.woff2)["']?\)/)?.[1];
    const dataUri = fontName ? fonts.get(fontName) : undefined;
    if (!dataUri?.startsWith("data:")) throw new Error(`Cannot embed KaTeX font: ${fontName ?? "unknown"}`);
    // Current Chromium/WebView2 supports woff2; remove the external woff/ttf fallbacks.
    return fontFace.replace(/src\s*:[^;}]+/, `src:url("${dataUri}") format("woff2")`);
  });
  if (Array.from(embeddedKatex.matchAll(/url\(([^)]*)\)/gi)).some((match) => !match[1].trim().replace(/^["']|["']$/g, "").startsWith("data:"))) {
    throw new Error("The exported KaTeX stylesheet contains an external resource.");
  }
  exportStyles = `${embeddedKatex}\n${markdownCss}\n${documentStyles}`;
  return exportStyles;
}

const documentStyles = `
:root { color-scheme: light; }
body { margin: 0; background: #fff; color: #1e293b; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; }
body > .markdownBody { box-sizing: border-box; width: min(100%, 84ch); margin-inline: auto; padding: 32px 36px 56px; }
@media (max-width: 600px) { body > .markdownBody { padding: 20px 18px 36px; } }
@media print {
  body > .markdownBody { width: auto; padding: 0; }
  .markdownBody pre, .markdownBody table, .markdownBody .mermaidDiagram { break-inside: avoid; }
}
`;
