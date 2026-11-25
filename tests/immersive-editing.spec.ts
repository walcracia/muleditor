import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { downloadDocument, immersiveEditor, replaceMonacoSource, switchMarkdownMode } from "./helpers/immersive";

test("Markdown starts in immersive mode and mode switches preserve the original bytes", async ({ page }) => {
  const original = Buffer.from([
    "---", "title: 字节保留", "custom: 'keep this quote'", "---", "",
    "# 标题  ", "", "第一段带  两个空格、_斜体_与[引用][reference]。", "",
    "行内公式 $E=mc^2$ 与脚注[^note]。", "", "$$", "x^2 + y^2 = z^2", "$$", "",
    "~~~mermaid", "flowchart LR", "  A-->B", "~~~", "",
    "<details><summary>保留原始 HTML</summary>正文</details>", "",
    "[reference]: https://example.com/ \"保留标题\"", "[^note]: 保留脚注定义。", ""
  ].join("\r\n"));
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "original.md", mimeType: "text/markdown", buffer: original });
  await expect(immersiveEditor(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "沉浸模式", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".statusBar")).toContainText("已保存");
  for (let index = 0; index < 3; index += 1) {
    await switchMarkdownMode(page, "source");
    await switchMarkdownMode(page, "immersive");
  }
  await expect(page.locator(".statusBar")).toContainText("已保存");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("original.md");
  expect(await downloadDocument(page)).toEqual(original);
});

test("typing and selected-text toolbar formatting update Markdown and save dirty state", async ({ page }) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "typing.md", mimeType: "text/markdown", buffer: Buffer.from("需要加粗的短语\n") });
  const editor = immersiveEditor(page);
  await expect(editor).toBeVisible();
  const paragraph = editor.locator("p").filter({ hasText: "需要加粗的短语" }).first();
  await paragraph.click({ clickCount: 3 });
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe("需要加粗的短语");
  await page.locator(".formatNavLine").getByRole("button", { name: "加粗", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("需要加粗的短语");
  await editor.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("直接在文档中继续输入。");
  await expect(editor).toContainText("直接在文档中继续输入。");
  await expect(page.locator(".statusBar")).toContainText("已修改");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("typing.md*");
  const saved = (await downloadDocument(page)).toString("utf8");
  expect(saved).toMatch(/(?:\*\*需要加粗的短语\*\*|__需要加粗的短语__)/);
  expect(saved).toContain("直接在文档中继续输入。");
  await expect(page.locator(".statusBar")).toContainText("已保存");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("typing.md");
});

test("heading and list input rules create editable document structure", async ({ page }) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "rules.md", mimeType: "text/markdown", buffer: Buffer.from("") });
  const editor = immersiveEditor(page);
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("# ");
  await page.keyboard.insertText("现场标题");
  await expect(editor.getByRole("heading", { name: "现场标题", level: 1 })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("- ");
  await page.keyboard.insertText("第一项");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("第二项");
  await expect(editor.locator("ul > li")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. ");
  await page.keyboard.insertText("有序第一项");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("有序第二项");
  await expect(editor.locator("ol > li")).toHaveCount(2);
  const source = (await downloadDocument(page)).toString("utf8");
  expect(source).toContain("# 现场标题");
  expect(source).toMatch(/[-*+] 第一项/);
  expect(source).toMatch(/\d+[.)] 有序第一项/);
});

test("editing one paragraph preserves adjacent formulas, diagrams, images and definitions", async ({ page }) => {
  const before = "---\ntitle: preserve special blocks\n---\n\n# 保留特殊内容\n\n";
  const after = "\n\n行内公式 $E=mc^2$ 与脚注[^original]。\n\n" +
    "$$\nx^2 + y^2 = z^2\n$$\n\n" +
    "~~~mermaid\nflowchart LR\n  A[原始节点] --> B[保持不变]\n~~~\n\n" +
    "![本地图片](./图片.png)\n\n" +
    "[reference]: https://example.com/ \"原始定义\"\n[^original]: 原始脚注内容。\n";
  const original = `${before}只改这一段。${after}`;
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles([
    { name: "preserve.md", mimeType: "text/markdown", buffer: Buffer.from(original) },
    { name: "图片.png", mimeType: "image/png", buffer: readFileSync(path.resolve("tests/fixtures/markdown/图片.png")) }
  ]);
  const editor = immersiveEditor(page);
  await expect(editor.locator(".mermaidDiagram svg")).toHaveCount(1);
  await expect(editor.locator(".katex")).toHaveCount(2);
  await expect(editor.getByRole("img", { name: "本地图片" })).toHaveAttribute("src", /^data:image\/png;base64,/);
  await editor.locator("p").filter({ hasText: "只改这一段。" }).first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.insertText("只更新这个段落。");
  await expect(editor).toContainText("只更新这个段落。");
  const saved = (await downloadDocument(page)).toString("utf8");
  expect(saved.startsWith(before)).toBe(true);
  expect(saved.endsWith(after)).toBe(true);
  expect(saved).not.toContain("只改这一段。");
  await expect(editor.locator(".mermaidDiagram svg")).toHaveCount(1);
  await expect(editor.locator(".katex")).toHaveCount(2);
  const html = (await downloadDocument(page, "export")).toString("utf8");
  expect(html).toContain("只更新这个段落。");
  expect(html).toContain("<svg");
  expect(html).toContain("katex");
  expect(html).toContain("data:image/png;base64,");
  expect(html).not.toContain("language-mermaid");
});

test("source changes synchronize back to immersive mode without losing the source", async ({ page }) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "sync.md", mimeType: "text/markdown", buffer: Buffer.from("# 初始标题\n\n初始正文。\n") });
  await expect(immersiveEditor(page).getByRole("heading", { name: "初始标题" })).toBeVisible();
  await switchMarkdownMode(page, "source");
  const replacement = "# 源代码更新\n\n从 Monaco 修改的正文与 $a+b$。\n";
  await replaceMonacoSource(page, replacement);
  await expect(page.locator(".statusBar")).toContainText("已修改");
  await switchMarkdownMode(page, "immersive");
  await expect(immersiveEditor(page).getByRole("heading", { name: "源代码更新" })).toBeVisible();
  await expect(immersiveEditor(page)).toContainText("从 Monaco 修改的正文");
  await expect(immersiveEditor(page).locator(".katex")).toHaveCount(1);
  expect((await downloadDocument(page)).toString("utf8")).toBe(replacement);
});

test("formula and diagram forms insert and edit rendered nodes without typing Markdown fences", async ({ page }) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "forms.md", mimeType: "text/markdown", buffer: Buffer.from("# 表单编辑\n\n结尾段落。\n") });
  const editor = immersiveEditor(page);
  const toolbar = page.locator(".formatNavLine");
  const form = page.locator(".immersiveInsertForm");
  await editor.locator("p").filter({ hasText: "结尾段落。" }).click();
  await page.keyboard.press("End");
  await toolbar.getByRole("button", { name: "插入公式", exact: true }).click();
  await form.getByRole("textbox", { name: "公式源码", exact: true }).fill("a^2+b^2=c^2");
  await form.getByRole("button", { name: "应用", exact: true }).click();
  await expect(editor.locator(".immersiveNode-math_block .katex")).toHaveCount(1);
  await editor.getByRole("button", { name: /^编辑\s*公式$/ }).click();
  await form.getByRole("textbox", { name: "公式源码", exact: true }).fill("\\frac{1}{2}");
  await form.getByRole("button", { name: "应用", exact: true }).click();
  await expect(editor.locator(".katex .mfrac")).toHaveCount(1);

  await editor.locator("p").filter({ hasText: "结尾段落。" }).click();
  await page.keyboard.press("End");
  await toolbar.getByRole("button", { name: "插入图表", exact: true }).click();
  await form.getByRole("textbox", { name: "图表源码", exact: true }).fill("flowchart LR\n A[新增起点] --> B[新增终点]");
  await form.getByRole("button", { name: "应用", exact: true }).click();
  await expect(editor.locator(".mermaidDiagram svg")).toContainText("新增起点");
  await editor.getByRole("button", { name: /^编辑\s*图表$/ }).click();
  await form.getByRole("textbox", { name: "图表源码", exact: true }).fill("flowchart TD\n A[修改后] --> B[完成]");
  await form.getByRole("button", { name: "应用", exact: true }).click();
  await expect(editor.locator(".mermaidDiagram svg")).toContainText("修改后");
  await expect(editor.locator(".mermaidDiagram svg")).not.toContainText("新增起点");
  const source = (await downloadDocument(page)).toString("utf8");
  expect(source).toContain("\\frac{1}{2}");
  expect(source).toContain("flowchart TD");
  expect(source).toContain("A[修改后]");
  expect(source).not.toContain("a^2+b^2=c^2");
  const html = (await downloadDocument(page, "export")).toString("utf8");
  expect(html).toContain("<svg");
  expect(html).toContain("katex");
  expect(html).not.toContain("language-mermaid");
});

test("task checkboxes and table cell typing serialize their actual edited state", async ({ page }) => {
  await page.goto("/");
  const source = "# 任务与表格\n\n- [ ] 待办一\n- [x] 已完成二\n\n| 名称 | 值 |\n| --- | --- |\n| 原单元格 | 原值 |\n";
  await page.locator("#fileInput").setInputFiles({ name: "table-tasks.md", mimeType: "text/markdown", buffer: Buffer.from(source) });
  const editor = immersiveEditor(page);
  const tasks = editor.locator("li.immersiveTaskItem input[type='checkbox']");
  await expect(tasks).toHaveCount(2);
  await tasks.nth(0).check();
  await tasks.nth(1).uncheck();
  await expect(tasks.nth(0)).toBeChecked();
  await expect(tasks.nth(1)).not.toBeChecked();
  const cells = editor.locator("table tr").nth(1).locator("td");
  await cells.nth(0).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.insertText("更新单元格");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.insertText("第二格");
  await expect(cells.nth(0)).toHaveText("更新单元格");
  await expect(cells.nth(1)).toHaveText("第二格");
  await expect(page.locator(".immersiveTableTools")).toBeVisible();
  const saved = (await downloadDocument(page)).toString("utf8");
  expect(saved).toMatch(/[-*+] \[[xX]\] 待办一/);
  expect(saved).toMatch(/[-*+] \[ \] 已完成二/);
  expect(saved).toContain("更新单元格");
  expect(saved).toContain("第二格");
  expect(saved).not.toContain("原单元格");
});

test("toolbar undo and redo restore document content and dirty state", async ({ page }) => {
  await page.goto("/");
  const original = "初始正文。\n";
  await page.locator("#fileInput").setInputFiles({ name: "history.md", mimeType: "text/markdown", buffer: Buffer.from(original) });
  const editor = immersiveEditor(page);
  const toolbar = page.locator(".formatNavLine");
  const undo = toolbar.getByRole("button", { name: "撤销", exact: true });
  const redo = toolbar.getByRole("button", { name: "重做", exact: true });
  await expect(undo).toBeDisabled();
  await editor.locator("p").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("撤销重做标记。");
  await expect(undo).toBeEnabled();
  await expect(page.locator(".statusBar")).toContainText("已修改");
  await undo.click();
  await expect(editor).not.toContainText("撤销重做标记。");
  await expect(page.locator(".statusBar")).toContainText("已保存");
  expect((await downloadDocument(page)).toString("utf8")).toBe(original);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(editor).toContainText("撤销重做标记。");
  await expect(page.locator(".statusBar")).toContainText("已修改");
  expect((await downloadDocument(page)).toString("utf8")).toContain("撤销重做标记。");
});

test("late initial Monaco loading cannot steal immersive focus or write into another tab", async ({ page }) => {
  let releaseLoader!: () => void;
  const loaderGate = new Promise<void>((resolve) => { releaseLoader = resolve; });
  await page.route("**/vs/loader.js", async (route) => {
    await loaderGate;
    await route.continue();
  });
  const first = "# First\n\nA 原始正文。\n";
  const second = "# Second\n\nB 原始正文。\n";
  try {
    await page.goto("/");
    await page.locator("#fileInput").setInputFiles([
      { name: "first.md", mimeType: "text/markdown", buffer: Buffer.from(first) },
      { name: "second.md", mimeType: "text/markdown", buffer: Buffer.from(second) }
    ]);
    await page.locator(".tabs .tab").filter({ hasText: "first.md" }).click();
    const requested = page.waitForRequest("**/vs/loader.js");
    await switchMarkdownMode(page, "source");
    await requested;
    // Queue a source action, then leave this tab before the source editor is ready.
    await page.locator(".formatNavLine").getByRole("button", { name: "加粗", exact: true }).click();
    await switchMarkdownMode(page, "immersive");
    await page.locator(".tabs .tab").filter({ hasText: "second.md" }).click();
    const editor = immersiveEditor(page);
    await editor.locator("p").filter({ hasText: "B 原始正文。" }).click();
    await page.keyboard.press("End");
    await expect(editor).toBeFocused();
    releaseLoader();
    await expect(page.locator(".editorSurface[hidden] .monaco-editor").first()).toBeAttached();
    await expect(editor).toBeFocused();
    await page.keyboard.insertText("加载后仍在当前段落。");
    const savedSecond = (await downloadDocument(page)).toString("utf8");
    expect(savedSecond).toContain("B 原始正文。加载后仍在当前段落。");
    expect(savedSecond).not.toContain("A 原始正文");
    expect(savedSecond).not.toContain("**bold**");
    await page.locator(".tabs .tab").filter({ hasText: "first.md" }).click();
    await expect(immersiveEditor(page).getByRole("heading", { name: "First" })).toBeVisible();
    expect((await downloadDocument(page)).toString("utf8")).toBe(first);
  } finally {
    releaseLoader();
  }
});

test("HTML, XML, YAML, JSON and SPDX retain source editing, saving and export behavior", async ({ page }) => {
  await page.goto("/");
  const cases = [
    { name: "data.json", mimeType: "application/json", source: '{ "n": 1 }\n', exported: '{"n":1}' },
    { name: "config.yaml", mimeType: "text/yaml", source: "# Keep YAML comments\nname: editor\nenabled: true\n" },
    { name: "document.xml", mimeType: "application/xml", source: '<?xml version="1.0"?><root><item>value</item></root>\n' },
    { name: "page.html", mimeType: "text/html", source: "<!doctype html><html><body><h1>HTML document</h1></body></html>\n" },
    { name: "bom.spdx.json", mimeType: "application/json", source: '{ "spdxVersion": "SPDX-2.3", "SPDXID": "SPDXRef-DOCUMENT", "name": "fixture" }\n', exported: '{"spdxVersion":"SPDX-2.3","SPDXID":"SPDXRef-DOCUMENT","name":"fixture"}' },
    { name: "bom.spdx.yaml", mimeType: "text/yaml", source: "spdxVersion: SPDX-2.3\nSPDXID: SPDXRef-DOCUMENT\nname: fixture\n" },
    { name: "bom.spdx", mimeType: "text/plain", source: "SPDXVersion: SPDX-2.3\nDocumentName: fixture\nSPDXID: SPDXRef-DOCUMENT\n" }
  ];
  for (const fixture of cases) {
    await test.step(fixture.name, async () => {
      await page.locator("#fileInput").setInputFiles({ name: fixture.name, mimeType: fixture.mimeType, buffer: Buffer.from(fixture.source) });
      await expect(immersiveEditor(page)).toBeHidden();
      await expect(page.getByRole("button", { name: "沉浸模式", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^(编辑|Edit)$/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /^(预览|Preview)$/ })).toBeVisible();
      await expect(page.locator(".monaco-editor:visible").first()).toBeVisible();
      expect((await downloadDocument(page)).toString("utf8")).toBe(fixture.source);
      expect((await downloadDocument(page, "export")).toString("utf8")).toBe(fixture.exported ?? fixture.source);
    });
  }
});
