import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImmersiveEditor, type ImmersiveEditorProps } from "./ImmersiveEditor";
import * as markdown from "../lib/markdown";
import * as resources from "../lib/markdownResources";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function props(source: string, id = "test"): ImmersiveEditorProps {
  return { tab: { id, name: "test.md", format: "markdown", content: source, originalContent: source, dirty: false }, locale: "zh", resourceVersion: 0, onChange: vi.fn() };
}

async function render(value: ImmersiveEditorProps) {
  await act(async () => { root.render(createElement(ImmersiveEditor, value)); });
}

describe("immersive reference node views", () => {
  it("shares the complete rendering pipeline and shows separated definitions once with their original numbering", async () => {
    const source = "First[^a] and second[^b].\n\n[^a]: Alpha note.\n\nBetween definitions.\n\n[^b]: Beta note.\n";
    const rendering = vi.spyOn(markdown, "renderMarkdownDocument");
    await render(props(source));
    await vi.waitFor(() => expect(container.querySelectorAll(".footnote-item")).toHaveLength(2));
    const definitions = container.querySelectorAll(".immersiveNode-raw_block");
    expect(definitions).toHaveLength(2);
    expect(definitions[0].textContent).toContain("Alpha note.");
    expect(definitions[0].textContent).not.toContain("Beta note.");
    expect(definitions[1].textContent).toContain("Beta note.");
    expect(container.querySelectorAll("#fn1")).toHaveLength(1);
    expect(container.querySelectorAll("#fn2")).toHaveLength(1);
    expect(container.querySelector("#fn2")?.getAttribute("value")).toBe("2");
    expect(rendering.mock.calls.filter(([input]) => input === source)).toHaveLength(1);
  });

  it("edits an existing reference through its actual definition instead of an ineffective body field", async () => {
    const value = props("Note[^a].\n\n[^a]: Original body.\n");
    await render(value);
    const button = container.querySelector<HTMLButtonElement>(".immersiveNode-footnote_ref .immersiveNodeEdit")!;
    await act(async () => button.click());
    const textarea = container.querySelector<HTMLTextAreaElement>(".immersiveInsertForm textarea")!;
    expect(textarea.value).toContain("[^a]: Original body.");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, textarea.value.replace("Original body.", "Updated body."));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(value.onChange).toHaveBeenCalledWith("Note[^a].\n\n[^a]: Updated body.\n");
  });

  it("uses the last repeated definition without duplicating generated IDs", async () => {
    await render(props("Note[^a].\n\n[^a]: Earlier definition.\n\nBetween.\n\n[^a]: Winning definition.\n"));
    await vi.waitFor(() => expect(container.querySelectorAll(".footnote-item")).toHaveLength(1));
    expect(container.querySelector("#fn1")?.textContent).toContain("Winning definition.");
    expect(container.querySelectorAll("#fn1")).toHaveLength(1);
  });

  it("makes inline footnote bodies reachable and editable without creating dangling labels", async () => {
    await render(props("Inline ^[Inline footnote body.] text.\n"));
    await vi.waitFor(() => expect(container.querySelector(".immersiveInlineFootnoteBody .footnote-item")).not.toBeNull());
    const body = container.querySelector<HTMLElement>(".immersiveInlineFootnoteBody")!;
    expect(body.hidden).toBe(true);
    const link = container.querySelector<HTMLAnchorElement>("a[href='#fn1']")!;
    await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true })));
    expect(body.hidden).toBe(false);
    expect(body.textContent).toContain("Inline footnote body.");
    await act(async () => container.querySelector<HTMLButtonElement>(".immersiveNode-footnote_ref > .immersiveNodeEdit")!.click());
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("^[Inline footnote body.]");
  });

  it("resolves images again when Save As changes the same document's directory", async () => {
    const resolving = vi.spyOn(resources, "resolveMarkdownImage").mockResolvedValue("data:image/png;base64,aGVsbG8=");
    const value = props("![Image](./image.png)\n");
    value.tab.path = "C:/old/test.md";
    await render(value);
    await vi.waitFor(() => expect(resolving).toHaveBeenCalledWith("./image.png", expect.objectContaining({ sourcePath: "C:/old/test.md" })));
    await render({ ...value, tab: { ...value.tab, path: "C:/new/test.md" } });
    await vi.waitFor(() => expect(resolving).toHaveBeenCalledWith("./image.png", expect.objectContaining({ sourcePath: "C:/new/test.md" })));
  });

  it("ignores a shared render that finishes after a tab switch", async () => {
    const original = markdown.renderMarkdownDocument;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const old = "Note[^same].\n\n[^same]: Old tab body.\n";
    vi.spyOn(markdown, "renderMarkdownDocument").mockImplementation(async (source, options) => {
      const result = await original(source, { ...options, signal: undefined });
      if (source === old) await gate;
      return result;
    });
    await render(props(old, "old-tab"));
    await render(props("Note[^same].\n\n[^same]: Current tab body.\n", "new-tab"));
    await vi.waitFor(() => expect(container.querySelector(".footnote-item")?.textContent).toContain("Current tab body."));
    await act(async () => { release(); await gate; });
    expect(container.querySelector(".footnote-item")?.textContent).toContain("Current tab body.");
    expect(container.textContent).not.toContain("Old tab body.");
  });
});
