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
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { configurable: true, value: () => new DOMRect() });
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

  it("leaves an editable trailing paragraph after inserting an atomic block without adding blank source", async () => {
    const value = props("");
    await render({ ...value, command: { id: 1, action: "md-math" } });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const editor = container.querySelector(".immersiveDocument")!;
    expect(editor.lastElementChild?.tagName).toBe("P");
    expect(editor.lastElementChild?.textContent).toBe("");
    expect(value.onChange).toHaveBeenLastCalledWith("$$\nx^2 + y^2 = z^2\n$$");
  });

  it("keeps all lines entered in a new footnote inside its definition", async () => {
    const value = props("Text.\n");
    await render({ ...value, command: { id: 1, action: "md-footnote" } });
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "First line.\n\nSecond paragraph.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    const calls = vi.mocked(value.onChange).mock.calls;
    const source = calls[calls.length - 1][0];
    expect(source).toContain(": First line.\n    \n    Second paragraph.");
    await vi.waitFor(() => expect(container.querySelector(".footnote-item")?.textContent).toContain("Second paragraph."));
  });

  it("commits rapid Home then Shift+End movement before formatting the selected text", async () => {
    const value = props("Text.\n");
    await render(value);
    const editor = container.querySelector<HTMLElement>(".immersiveDocument")!;
    await act(async () => {
      editor.focus();
      const text = editor.querySelector("p")!.firstChild!;
      document.getSelection()!.collapse(text, text.textContent!.length);
      document.dispatchEvent(new Event("selectionchange"));
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "End", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.getSelection()?.toString()).toBe("Text.");
    await render({ ...value, command: { id: 2, action: "md-bold" } });
    expect(value.onChange).toHaveBeenLastCalledWith("**Text.**\n");
  });
});
