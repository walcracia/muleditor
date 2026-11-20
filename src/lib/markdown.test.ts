// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractMarkdownAnchors, extractMarkdownHeadings, renderMarkdownDocument, stripFrontMatter } from "./markdown";
import { renderMermaidBlocks } from "./mermaid";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

function htmlRoot(html: string): HTMLDivElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

beforeEach(() => {
  mermaid.render.mockReset();
  mermaid.render.mockImplementation(async (id: string) => ({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" viewBox="0 0 100 50"><style>#${id} .label{fill:red;position:fixed;background-image:url(https://evil.test/x)}</style><foreignObject width="100" height="50"><div xmlns="http://www.w3.org/1999/xhtml" style="color:red;position:fixed" onclick="alert(1)">中文 label</div></foreignObject><script>alert(1)</script></svg>`
  }));
});

describe("one Markdown token model", () => {
  it("uses stable Chinese anchors, deduplicates collisions, and counts front matter lines", async () => {
    const source = "---\r\ntitle: Demo\r\n---\r\n# 中文 **标题**\r\n\r\n## 中文 标题\r\n\r\n中文 标题\r\n---\r\n";
    const headings = extractMarkdownHeadings(source);
    expect(headings).toEqual([
      { id: "中文-标题", text: "中文 标题", level: 1, line: 4 },
      { id: "中文-标题-1", text: "中文 标题", level: 2, line: 6 },
      { id: "中文-标题-2", text: "中文 标题", level: 2, line: 8 }
    ]);
    const rendered = await renderMarkdownDocument(source);
    expect(rendered.headings).toEqual(headings);
    expect(Array.from(htmlRoot(rendered.html).querySelectorAll("h1,h2"), (heading) => heading.id)).toEqual(headings.map((heading) => heading.id));
    const links = htmlRoot(rendered.html).querySelectorAll<HTMLAnchorElement>("a.heading-anchor");
    expect(links).toHaveLength(3);
    expect(links[0].getAttribute("href")).toBe("#中文-标题");
    expect(links[0].tabIndex).toBe(0);
  });

  it("ignores fake headings in code, preserves nested headings, and does not depend on a DOM", () => {
    const source = "```md\n# fake\n```\n\n    # indented fake\n\n> ## Real `code`\n";
    expect(extractMarkdownHeadings(source)).toEqual([{ id: "real-code", text: "Real code", level: 2, line: 7 }]);
  });

  it("supports an end-of-file front matter boundary without consuming ordinary horizontal rules", () => {
    expect(stripFrontMatter("---\nname: yes\n---")).toBe("");
    expect(stripFrontMatter("---\nmissing boundary")).toBe("---\nmissing boundary");
    expect(stripFrontMatter("# title\n\n---\n")).toBe("# title\n\n---\n");
  });

  it("keeps anchors stable when headings collide with browser DOM property names", async () => {
    const source = ["Title", "Submit", "Elements", "onload", "中文"].map((text) => `# ${text}`).join("\n\n");
    const result = await renderMarkdownDocument(source);
    expect(Array.from(htmlRoot(result.html).querySelectorAll("h1"), (heading) => heading.id)).toEqual(result.headings.map((heading) => heading.id));
    expect(result.headings.map((heading) => heading.id)).toEqual(["md-title", "md-submit", "md-elements", "md-onload", "中文"]);
  });

  it("keeps task lists, tables, strikethrough, autolinks and footnote IDs/backlinks", async () => {
    const { html } = await renderMarkdownDocument("- [x] done\n- [ ] todo\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~ https://example.com\n\nA note[^one].\n\n[^one]: footnote content\n");
    const root = htmlRoot(html);
    expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(root.querySelectorAll("input:disabled")).toHaveLength(2);
    expect(root.querySelector("input")?.checked).toBe(true);
    expect(root.querySelector("table td")?.textContent).toBe("1");
    expect(root.querySelector("s")?.textContent).toBe("gone");
    expect(root.querySelector('a[href="https://example.com"]')).not.toBeNull();
    const note = root.querySelector('a[href="#fn1"]');
    expect(note).not.toBeNull();
    expect(root.querySelector("#fn1")?.textContent).toContain("footnote content");
    expect(root.querySelector('a[href="#fnref1"]')).not.toBeNull();
    expect(root.querySelector("#fnref1")).not.toBeNull();
  });

  it("extracts heading, footnote and repeated reference anchors from the same parser as the DOM", async () => {
    const source = "---\ntitle: Demo\n---\n# 中文\n\nA note[^one] and repeat[^one].\nSecond note[^two].\n\n[^one]: First footnote.\n\n[^two]: Second footnote.\n";
    const anchors = extractMarkdownAnchors(source);
    expect(anchors).toContainEqual({ id: "中文", text: "中文", line: 4, kind: "heading" });
    expect(anchors).toContainEqual({ id: "fn1", text: "[^one]", line: 9, kind: "footnote" });
    expect(anchors).toContainEqual({ id: "fnref1", text: "[^one]", line: 6, kind: "footnote-ref" });
    expect(anchors).toContainEqual({ id: "fnref1:1", text: "[^one]", line: 6, kind: "footnote-ref" });
    expect(anchors).toContainEqual({ id: "fnref2", text: "[^two]", line: 7, kind: "footnote-ref" });
    const root = htmlRoot((await renderMarkdownDocument(source)).html);
    expect(anchors.map((anchor) => anchor.id).sort()).toEqual(Array.from(root.querySelectorAll("[id]"), (element) => element.id).sort());
  });

  it("does not invent anchors for fenced/inline code footnotes or unused definitions", () => {
    const source = "```md\n[^fake]: Not a definition.\nFootnote[^fake]\n```\n\n`[^literal]`\n\n[^unused]: Never referenced.\n";
    expect(extractMarkdownAnchors(source)).toEqual([]);
  });

  it("extracts plugin inline-footnote anchors without a separate syntax heuristic", async () => {
    const source = "Text with ^[an inline note].\n";
    const anchors = extractMarkdownAnchors(source);
    expect(anchors.map((anchor) => anchor.id).sort()).toEqual(["fn1", "fnref1"]);
    const root = htmlRoot((await renderMarkdownDocument(source)).html);
    expect(anchors.every((anchor) => Array.from(root.querySelectorAll("[id]"), (node) => node.id).includes(anchor.id))).toBe(true);
  });

  it("highlights common code languages and escapes unknown code fences", async () => {
    const { html } = await renderMarkdownDocument("```js\nconst n = 42;\n```\n\n```unknown-language\n<script>alert(1)</script>\n```\n");
    const root = htmlRoot(html);
    expect(root.querySelector("code.language-js .hljs-keyword")?.textContent).toBe("const");
    expect(root.querySelector("code.language-unknown-language")?.textContent).toContain("<script>alert(1)</script>");
    expect(root.querySelector("script")).toBeNull();
  });
});

describe("mathematics", () => {
  it("renders all four delimiter pairs and math fences while keeping code literal", async () => {
    const source = String.raw`Inline $x^2$ and \(y^2\).

$$z^2$$

\[a^2+b^2\]

` + "```math\nc^2\n```\n\n`$literal$`\n\n```text\n\\(literal\\)\n```";
    const root = htmlRoot((await renderMarkdownDocument(source)).html);
    expect(root.querySelectorAll(".katex")).toHaveLength(5);
    expect(root.querySelectorAll("math")).toHaveLength(5);
    expect(root.querySelector(".katex-html [style]")).not.toBeNull();
    expect(root.querySelector("code")?.textContent).toBe("$literal$");
    expect(root.querySelector("code.language-text")?.textContent).toContain("\\(literal\\)");
  });

  it("uses math token text consistently for synchronous headings and rendered anchors", async () => {
    const source = "# Energy $E=mc^2$\n";
    const headings = extractMarkdownHeadings(source);
    expect(headings[0].text).toContain("E=mc^2");
    const result = await renderMarkdownDocument(source);
    expect(result.headings).toEqual(headings);
    expect(htmlRoot(result.html).querySelector("h1")?.id).toBe(headings[0].id);
  });

  it("retains invalid formula source as an error and does not trust TeX HTML commands", async () => {
    const result = await renderMarkdownDocument(String.raw`$\notARealCommand{x}$ $\frac{$ $\href{javascript:alert(1)}{click}$`);
    expect(result.html).toContain("notARealCommand");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(htmlRoot(result.html).querySelector('a[href^="javascript:"]')).toBeNull();
  });
});

describe("untrusted Markdown and image resources", () => {
  it("removes scripts, embeds, events, dangerous URLs and source CSS without removing safe HTML", async () => {
    const { html } = await renderMarkdownDocument('<script>alert(1)</script>\n\n<iframe srcdoc="bad"></iframe><object data="bad"></object>\n\n<style>body{display:none}</style><span class="katex" style="position:fixed;inset:0" onclick="alert(1)">safe</span>\n\n<a href="jav&#x61;script:alert(1)">bad link</a><img src="x.png" onerror="alert(1)">\n\n<svg onload="alert(1)"><foreignObject><script>alert(1)</script></foreignObject></svg>');
    const root = htmlRoot(html);
    expect(root.querySelector("script,iframe,object,style,svg")).toBeNull();
    expect(root.querySelector("[onclick],[onerror],[onload],[style]")).toBeNull();
    expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(root.querySelector("span.katex")?.textContent).toBe("safe");
  });

  it("resolves original relative, raw HTML file and remote image sources", async () => {
    const resolveImage = vi.fn(async (_src: string) => "data:image/png;base64,AA==");
    const { html, warnings } = await renderMarkdownDocument('![a](./中文.png)\n\n<img src="file:///C:/docs/b.png" alt="b">\n\n![c](https://example.com/c.png)', { resolveImage, strictImages: true });
    expect(resolveImage.mock.calls.map(([src]) => decodeURI(src))).toEqual(["./中文.png", "file:///C:/docs/b.png", "https://example.com/c.png"]);
    expect(Array.from(htmlRoot(html).querySelectorAll("img"), (image) => image.getAttribute("src"))).toEqual(Array(3).fill("data:image/png;base64,AA=="));
    expect(warnings).toEqual([]);
  });

  it("preserves remote images without a resolver and reports unresolved local resources", async () => {
    const { html, warnings } = await renderMarkdownDocument("![remote](https://example.com/a.png)\n\n![local](missing.png)");
    expect(htmlRoot(html).querySelector('img[src="https://example.com/a.png"]')).not.toBeNull();
    expect(warnings).toEqual(["Local image could not be resolved: missing.png"]);
    await expect(renderMarkdownDocument("![local](missing.png)", { strictImages: true })).rejects.toThrow("missing.png");
  });

  it("does not reintroduce unsafe URLs from a resolver", async () => {
    const { html } = await renderMarkdownDocument("![local](image.png)", { resolveImage: async () => "javascript:alert(1)" });
    expect(htmlRoot(html).querySelector("img")?.hasAttribute("src")).toBe(false);
    await expect(renderMarkdownDocument("![local](image.png)", { resolveImage: async () => "javascript:alert(1)", strictImages: true })).rejects.toThrow("unsafe URL");
  });

  it("does not leave an unprocessed srcset that bypasses the image resolver", async () => {
    const { html } = await renderMarkdownDocument('<img src="small.png" srcset="https://example.com/large.png 2x">', { resolveImage: async () => "data:image/png;base64,AA==" });
    const image = htmlRoot(html).querySelector("img");
    expect(image?.hasAttribute("srcset")).toBe(false);
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,AA==");
  });

  it("rejects cancellation while image resolution is pending", async () => {
    const controller = new AbortController();
    let finish: ((value: string) => void) | undefined;
    const resolveImage = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const rendering = renderMarkdownDocument("![local](image.png)", { signal: controller.signal, resolveImage });
    await vi.waitFor(() => expect(resolveImage).toHaveBeenCalled());
    controller.abort();
    finish?.("data:image/png;base64,AA==");
    await expect(rendering).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("Mermaid inside the shared pipeline", () => {
  it("renders in a detached root and preserves SVG labels/styles while removing active content", async () => {
    const { html, warnings } = await renderMarkdownDocument("```mermaid\ngraph LR\nA-->B\n```");
    const root = htmlRoot(html);
    expect(root.querySelector(".mermaidDiagram > svg")).not.toBeNull();
    expect(root.querySelector("foreignObject div")?.textContent).toBe("中文 label");
    expect(root.querySelector("foreignObject div")?.getAttribute("style")).toContain("color:red");
    expect(root.querySelector("style")?.textContent).toContain("fill:red");
    expect(html).not.toMatch(/script|onclick|position|evil\.test/);
    expect(warnings).toEqual([]);
  });

  it("keeps source and error details when a diagram fails", async () => {
    mermaid.render.mockRejectedValueOnce(new Error("Parse error line 2"));
    const { html, warnings } = await renderMarkdownDocument("```mermaid\ninvalid source\n```", { errorLabel: "图表错误" });
    const root = htmlRoot(html);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("图表错误");
    expect(root.querySelector("code.language-mermaid")?.textContent).toContain("invalid source");
    expect(html).toContain("Parse error line 2");
    expect(warnings).toEqual(["图表错误: Parse error line 2"]);
  });

  it("does not insert a late diagram after cancellation", async () => {
    let finish: ((value: { svg: string }) => void) | undefined;
    mermaid.render.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const root = htmlRoot('<pre><code class="language-mermaid">graph LR;A--&gt;B</code></pre>');
    const controller = new AbortController();
    const rendering = renderMermaidBlocks(root, { errorLabel: "error", signal: controller.signal });
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    controller.abort();
    finish?.({ svg: '<svg id="late"></svg>' });
    await rendering;
    expect(root.querySelector("svg")).toBeNull();
    expect(root.querySelector("code")).not.toBeNull();
  });

  it("does not insert a superseded render into the same root", async () => {
    let finishOld: ((value: { svg: string }) => void) | undefined;
    mermaid.render.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const root = htmlRoot('<pre><code class="language-mermaid">old graph</code></pre>');
    const old = renderMermaidBlocks(root, { errorLabel: "error" });
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalledOnce());
    root.innerHTML = '<pre><code class="language-mermaid">new graph</code></pre>';
    await renderMermaidBlocks(root, { errorLabel: "error" });
    finishOld?.({ svg: '<svg id="old-diagram"></svg>' });
    await old;
    expect(root.querySelector("#old-diagram")).toBeNull();
    expect(root.querySelector("foreignObject div")?.textContent).toBe("中文 label");
  });

  it("rejects already aborted shared render calls", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(renderMarkdownDocument("# old tab", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
