// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { registerBrowserMarkdownFiles, resolveMarkdownImage } from "./markdownResources";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const png = [137, 80, 78, 71, 13, 10, 26, 10];

function imageFile(path: string, suffix = 0): File {
  const file = new File([new Uint8Array([...png, suffix])], path.split("/").pop()!, { type: "image/png" });
  if (path.includes("/")) Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

beforeEach(() => {
  registerBrowserMarkdownFiles([]);
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.mocked(invoke).mockReset();
});

describe("browser Markdown images", () => {
  it("resolves parent paths with Chinese, spaces, encoded hashes, query and fragment", async () => {
    registerBrowserMarkdownFiles([imageFile("project/images/图 1#.png")]);
    const result = await resolveMarkdownImage("../images/%E5%9B%BE%201%23.png?raw=1#preview", {
      relativePath: "project/docs/readme.md", workspaceRoot: "project"
    });
    expect(result).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...png, 0))}`);
  });

  it("supports literal hashes in a local filename", async () => {
    registerBrowserMarkdownFiles([imageFile("project/images/图 #1.png")]);
    await expect(resolveMarkdownImage("../images/图 #1.png", {
      relativePath: "project/docs/readme.md", workspaceRoot: "project"
    })).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it("isolates roots with identical document and image names", async () => {
    registerBrowserMarkdownFiles([imageFile("alpha/images/a.png", 1)]);
    registerBrowserMarkdownFiles([imageFile("beta/images/a.png", 2)]);
    const alpha = await resolveMarkdownImage("../images/a.png", { relativePath: "alpha/docs/a.md", workspaceRoot: "alpha" });
    const beta = await resolveMarkdownImage("../images/a.png", { relativePath: "beta/docs/a.md", workspaceRoot: "beta" });
    expect(alpha).toMatch(/^data:image\/png;base64,/);
    expect(beta).toMatch(/^data:image\/png;base64,/);
    expect(alpha).not.toBe(beta);
  });

  it("replaces a reimported root without keeping old files or discarding other roots", async () => {
    registerBrowserMarkdownFiles([imageFile("alpha/old.png")]);
    registerBrowserMarkdownFiles([imageFile("beta/old.png")]);
    registerBrowserMarkdownFiles([imageFile("alpha/new.png")]);
    await expect(resolveMarkdownImage("old.png", { relativePath: "alpha/a.md", workspaceRoot: "alpha" })).resolves.toBeUndefined();
    await expect(resolveMarkdownImage("new.png", { relativePath: "alpha/a.md", workspaceRoot: "alpha" })).resolves.toMatch(/^data:image\/png;base64,/);
    await expect(resolveMarkdownImage("old.png", { relativePath: "beta/a.md", workspaceRoot: "beta" })).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it("supports same-directory multi-file selections and replaces that selection group", async () => {
    registerBrowserMarkdownFiles([imageFile("a.png")]);
    await expect(resolveMarkdownImage("./a.png", { relativePath: "readme.md" })).resolves.toMatch(/^data:image\/png;base64,/);
    registerBrowserMarkdownFiles([imageFile("b.png")]);
    await expect(resolveMarkdownImage("a.png", { relativePath: "readme.md" })).resolves.toBeUndefined();
  });

  it("requires a source and refuses to escape an imported folder", async () => {
    registerBrowserMarkdownFiles([imageFile("project/a.png")]);
    await expect(resolveMarkdownImage("a.png", {})).resolves.toBeUndefined();
    await expect(resolveMarkdownImage("../../a.png", { relativePath: "project/docs/a.md", workspaceRoot: "project" })).resolves.toBeUndefined();
    await expect(resolveMarkdownImage("missing.png", { relativePath: "project/a.md", workspaceRoot: "project" })).resolves.toBeUndefined();
  });

  it("does not reinterpret remote URLs, data, blob, protocols or absolute paths as local files", async () => {
    for (const src of ["https://example.com/a.png", "data:image/png;base64,AAAA", "blob:abc", "//example.com/a.png", "file:///C:/a.png", "/a.png", "C:\\a.png", "%2Fa.png", "%5Ca.png", "%5C%5Cserver/a.png", "javascript:alert(1)"]) {
      await expect(resolveMarkdownImage(src, { relativePath: "a.md" })).resolves.toBeUndefined();
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects non-image content disguised as an image and oversized files", async () => {
    const text = new File(["private text"], "fake.png", { type: "image/png" });
    const big = imageFile("big.png");
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    registerBrowserMarkdownFiles([text, big]);
    await expect(resolveMarkdownImage("fake.png", { relativePath: "a.md" })).rejects.toThrow("invalid Markdown image");
    await expect(resolveMarkdownImage("big.png", { relativePath: "a.md" })).rejects.toThrow("10 MiB");
  });

  it("returns SVG only as an image data URI and rejects an HTML document with an SVG child", async () => {
    registerBrowserMarkdownFiles([
      new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5"/></svg>'], "a.svg"),
      new File(["<html><svg></svg></html>"], "bad.svg")
    ]);
    await expect(resolveMarkdownImage("a.svg", { relativePath: "a.md" })).resolves.toMatch(/^data:image\/svg\+xml;base64,/);
    await expect(resolveMarkdownImage("bad.svg", { relativePath: "a.md" })).rejects.toThrow("invalid Markdown image");
  });
});

describe("native Markdown images", () => {
  it("delegates relative paths and the Markdown source to the bounded native reader", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});
    vi.mocked(invoke).mockResolvedValue("data:image/png;base64,AAAA");
    await expect(resolveMarkdownImage("../图%20片.png?v=1", { sourcePath: "C:\\docs\\a.md" })).resolves.toBe("data:image/png;base64,AAAA");
    expect(invoke).toHaveBeenCalledWith("read_markdown_image", { sourcePath: "C:\\docs\\a.md", imagePath: "../图%20片.png?v=1" });
  });

  it("does not read local images for an unsaved document", async () => {
    Reflect.set(window, "__TAURI_INTERNALS__", {});
    await expect(resolveMarkdownImage("a.png", {})).resolves.toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
  });
});
