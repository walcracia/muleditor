// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "katex";
import type { DocumentTab } from "../types";

const mocks = vi.hoisted(() => ({
  renderMarkdownDocument: vi.fn(),
  resolveMarkdownImage: vi.fn()
}));
vi.mock("./markdown", () => ({ renderMarkdownDocument: mocks.renderMarkdownDocument }));
vi.mock("./markdownResources", () => ({ resolveMarkdownImage: mocks.resolveMarkdownImage }));

import { buildSmartExport } from "./exporters";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const pngBytes = Uint8Array.from(atob(png.split(",")[1]), (char) => char.charCodeAt(0));

function tab(content: string, format: DocumentTab["format"] = "markdown"): DocumentTab {
  return {
    id: "test", name: "guide.md", path: "D:/docs/guide.md", relativePath: "guide.md", workspaceRoot: "D:/docs",
    content, originalContent: content, format, dirty: false
  };
}

beforeEach(() => {
  mocks.renderMarkdownDocument.mockReset();
  mocks.resolveMarkdownImage.mockReset();
  // This mock exercises the export/resolver contract without depending on a
  // mounted preview. Markdown parsing and Mermaid execution have core tests.
  mocks.renderMarkdownDocument.mockImplementation(async (html, options) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    for (const image of template.content.querySelectorAll("img")) {
      image.src = await options.resolveImage(image.getAttribute("src"));
    }
    return { html: template.innerHTML, headings: [], warnings: [] };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("standalone Markdown export", () => {
  it("keeps rendered SVG, formulas, highlighted code and footnotes while embedding styles/fonts", async () => {
    const formula = renderToString("x^2 + y^2", { output: "htmlAndMathml" });
    const input = `${formula}<div class="mermaidDiagram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><text>diagram</text></svg></div>
      <pre class="hljs"><code><span class="hljs-keyword">const</span> n = 1;</code></pre>
      <h2 id="heading"><a class="header-anchor" href="#heading">#</a>Heading</h2>
      <section class="footnotes"><a href="#fnref1" class="footnote-backref">Back</a></section>`;
    const payload = await buildSmartExport({ ...tab(input), name: '<guide & "test">.md' }, { lang: "zh-CN" });
    const doc = new DOMParser().parseFromString(payload.content, "text/html");
    expect(doc.documentElement.lang).toBe("zh-CN");
    expect(doc.title).toBe('<guide & "test">.md');
    expect(doc.querySelector("article.markdownBody .mermaidDiagram svg text")?.textContent).toBe("diagram");
    expect(doc.querySelector("pre code.language-mermaid")).toBeNull();
    expect(doc.querySelector(".katex math")).not.toBeNull();
    expect(doc.querySelector(".hljs-keyword")?.textContent).toBe("const");
    expect(doc.querySelector('.header-anchor[href="#heading"]')).not.toBeNull();
    expect(doc.querySelector(".footnote-backref")).not.toBeNull();
    const css = doc.querySelector("style")?.textContent ?? "";
    expect(css).toContain(".markdownBody");
    expect(css).toContain(".hljs-keyword");
    expect(css).toContain("@font-face");
    expect(css).toMatch(/url\("data:[^)]*;base64,/);
    for (const match of css.matchAll(/url\(([^)]*)\)/g)) {
      expect(match[1].replace(/^"|"$/g, "")).toMatch(/^data:/);
    }
    expect(css).not.toMatch(/fonts\/|\.woff\)|\.ttf\)/);
    expect(doc.querySelector("script, link[rel=stylesheet]")).toBeNull();
    expect(mocks.renderMarkdownDocument).toHaveBeenCalledWith(input, expect.objectContaining({ strictImages: true }));
  });

  it("strips executable HTML at the standalone boundary and escapes the title", async () => {
    mocks.resolveMarkdownImage.mockResolvedValue(png);
    const payload = await buildSmartExport({ ...tab('<script>alert(1)</script><img src="pic.png" onerror="alert(2)"><a href="javascript:alert(3)">link</a>'), name: '</title><script>bad()</script>.md' });
    // A core result should already be clean; verify the second boundary too.
    expect(payload.content).not.toMatch(/<script|onerror=|href="javascript:/i);
    expect(payload.content).toContain("&lt;/title&gt;&lt;script&gt;bad()&lt;/script&gt;.md");
    expect(payload.content).toContain("default-src 'none'");
  });

  it("preserves Mermaid HTML labels inside foreignObject while removing executable attributes", async () => {
    const input = '<div class="mermaidDiagram"><svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="120" height="40"><div xmlns="http://www.w3.org/1999/xhtml"><span class="nodeLabel" onclick="alert(1)">Start <b>here</b></span><script>alert(2)</script></div></foreignObject></svg></div>';
    const payload = await buildSmartExport(tab(input));
    const doc = new DOMParser().parseFromString(payload.content, "text/html");
    expect(doc.querySelector("foreignObject .nodeLabel")?.textContent).toBe("Start here");
    expect(doc.querySelector("foreignObject .nodeLabel b")?.textContent).toBe("here");
    expect(doc.querySelector("script, [onclick]")).toBeNull();
  });

  it("resolves local images using document context and produces data URIs", async () => {
    mocks.resolveMarkdownImage.mockResolvedValue(png);
    const payload = await buildSmartExport(tab('<img src="images/local.png" alt="Local">'));
    const doc = new DOMParser().parseFromString(payload.content, "text/html");
    expect(doc.querySelector("img")?.src).toBe(png);
    expect(mocks.resolveMarkdownImage).toHaveBeenCalledWith("images/local.png", {
      sourcePath: "D:/docs/guide.md", relativePath: "guide.md", workspaceRoot: "D:/docs"
    });
  });

  it("downloads each remote image once and embeds its bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(pngBytes, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = await buildSmartExport(tab('<img src="https://example.com/pic.png"><img src="https://example.com/pic.png">'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/pic.png", expect.objectContaining({ credentials: "omit", referrerPolicy: "no-referrer" }));
    expect(new DOMParser().parseFromString(payload.content, "text/html").querySelectorAll(`img[src="${png}"]`)).toHaveLength(2);
  });

  it("rejects missing local images and unsafe protocols", async () => {
    mocks.resolveMarkdownImage.mockResolvedValue(undefined);
    await expect(buildSmartExport(tab('<img src="missing.png">'))).rejects.toThrow("Cannot embed image");
    await expect(buildSmartExport(tab('<img src="file:///D:/secret.png">'))).rejects.toThrow("protocol");
    await expect(buildSmartExport(tab('<img src="javascript:alert(1)">'))).rejects.toThrow("protocol");
  });

  it("rejects failed remote downloads, non-images and oversized responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    await expect(buildSmartExport(tab('<img src="https://example.com/missing.png">'))).rejects.toThrow("HTTP 404");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>error</html>", { headers: { "content-type": "text/html" } })));
    await expect(buildSmartExport(tab('<img src="https://example.com/error.png">'))).rejects.toThrow("Unsupported image type");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(pngBytes, { headers: { "content-type": "image/png", "content-length": String(11 * 1024 * 1024) } })));
    await expect(buildSmartExport(tab('<img src="https://example.com/large.png">'))).rejects.toThrow("10 MiB");
  });

  it("rejects a successful image/png response whose body is actually HTML", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>not an image</html>", { headers: { "content-type": "image/png" } })));
    await expect(buildSmartExport(tab('<img src="https://example.com/error.png">'))).rejects.toThrow("does not match its declared type");
  });

  it.each([
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon", "image/avif"
  ])("rejects non-image bytes claiming to be %s", async (mime) => {
    mocks.resolveMarkdownImage.mockResolvedValue(`data:${mime};base64,${btoa("invalid binary image data pretending to be an image")}`);
    await expect(buildSmartExport(tab('<img src="invalid-image.bin">'))).rejects.toThrow("does not match its declared type");
  });

  it("uses the browser decoder to reject a truncated image with a valid signature", async () => {
    const decode = vi.fn().mockRejectedValue(new DOMException("The source image cannot be decoded.", "EncodingError"));
    vi.stubGlobal("Image", class { src = ""; decode = decode; });
    const truncated = btoa(String.fromCharCode(...pngBytes.slice(0, 32)));
    mocks.resolveMarkdownImage.mockResolvedValue(`data:image/png;base64,${truncated}`);
    await expect(buildSmartExport(tab('<img src="truncated.png">'))).rejects.toThrow("damaged or incomplete");
    expect(decode).toHaveBeenCalledOnce();
  });

  it("keeps valid raster bytes after the browser decoder succeeds", async () => {
    const decode = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Image", class { src = ""; decode = decode; });
    mocks.resolveMarkdownImage.mockResolvedValue(png);
    const payload = await buildSmartExport(tab('<img src="valid.png">'));
    expect(new DOMParser().parseFromString(payload.content, "text/html").querySelector("img")?.src).toBe(png);
    expect(decode).toHaveBeenCalledOnce();
  });

  it("accepts AVIF compatible brands and rejects non-AVIF ISO media", async () => {
    const bytes = Uint8Array.from([0, 0, 0, 24, ...Array.from("ftypmif1"), 0, 0, 0, 0, ...Array.from("avifmif1")], (value) => typeof value === "string" ? value.charCodeAt(0) : value);
    const decode = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Image", class { src = ""; decode = decode; });
    mocks.resolveMarkdownImage.mockResolvedValue(`data:image/avif;base64,${btoa(String.fromCharCode(...bytes))}`);
    await expect(buildSmartExport(tab('<img src="valid.avif">'))).resolves.toMatchObject({ mimeType: "text/html" });
    bytes.set(Array.from("isom", (value) => value.charCodeAt(0)), 16);
    mocks.resolveMarkdownImage.mockResolvedValue(`data:image/avif;base64,${btoa(String.fromCharCode(...bytes))}`);
    await expect(buildSmartExport(tab('<img src="video.avif">'))).rejects.toThrow("does not match its declared type");
  });

  it("preserves cancellation while browser image decoding is pending", async () => {
    const decode = vi.fn(() => new Promise<void>(() => {}));
    vi.stubGlobal("Image", class { src = ""; decode = decode; });
    mocks.resolveMarkdownImage.mockResolvedValue(png);
    const controller = new AbortController();
    const pending = buildSmartExport(tab('<img src="valid.png">'), { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
  });

  it("times out remote images and preserves caller cancellation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const pending = buildSmartExport(tab('<img src="https://example.com/slow.png">'));
    const timedOut = expect(pending).rejects.toThrow("timed out after 10 seconds");
    await vi.advanceTimersByTimeAsync(10_000);
    await timedOut;
    const controller = new AbortController();
    const canceled = buildSmartExport(tab('<img src="https://example.com/slow.png">'), { signal: controller.signal });
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects SVG and CSS dependencies that would break a self-contained document", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/hidden.png" /></svg>';
    mocks.resolveMarkdownImage.mockResolvedValue(`data:image/svg+xml;base64,${btoa(svg)}`);
    await expect(buildSmartExport(tab('<img src="diagram.svg">'))).rejects.toThrow("external dependency");
    await expect(buildSmartExport(tab('<p style="background:url(https://example.com/bg.png)">text</p>'))).rejects.toThrow("external CSS");
    mocks.resolveMarkdownImage.mockResolvedValue(png);
    await expect(buildSmartExport(tab('<img src="images/local.png" srcset="https://example.com/large.png 2x">'))).rejects.toThrow("responsive images");
  });

  it("cleans embedded SVG images without adding active SVG markup to the page", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" /><foreignObject width="80" height="30"><div xmlns="http://www.w3.org/1999/xhtml"><span onclick="alert(3)">Image label</span></div></foreignObject></svg>';
    mocks.resolveMarkdownImage.mockResolvedValue(`data:image/svg+xml;base64,${btoa(svg)}`);
    const payload = await buildSmartExport(tab('<img src="diagram.svg" alt="Diagram">'));
    const doc = new DOMParser().parseFromString(payload.content, "text/html");
    const embedded = atob(doc.querySelector("img")!.src.split(",")[1]);
    expect(embedded).toContain("<rect");
    const svgDoc = new DOMParser().parseFromString(embedded, "image/svg+xml");
    expect(svgDoc.querySelector("foreignObject span")?.textContent).toBe("Image label");
    expect(embedded).not.toMatch(/script|onload|onclick/);
    expect(doc.querySelector("svg")).toBeNull();
  });
});

describe("other smart exports", () => {
  it.each(["json", "spdx-json"] as const)("preserves %s minification", async (format) => {
    const payload = await buildSmartExport({ ...tab('{ "a": [1, 2] }', format), name: "doc.json" });
    expect(payload).toEqual({ name: "doc.min.json", content: '{"a":[1,2]}', mimeType: "application/json" });
    expect(mocks.renderMarkdownDocument).not.toHaveBeenCalled();
  });
  it("preserves text export and JSON parse failures", async () => {
    expect((await buildSmartExport(tab("name: value", "yaml"))).content).toBe("name: value");
    await expect(buildSmartExport(tab("{invalid", "json"))).rejects.toThrow();
  });
});
