import { expect, test, type Locator, type Page } from "@playwright/test";
import { downloadDocument, immersiveEditor, replaceMonacoSource, switchMarkdownMode } from "./helpers/immersive";

async function bounds(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a visible layout region");
  return value;
}

function panelToggle(page: Page, panel: "workspacePanel" | "problemsPanel") {
  return page.locator(`.statusBar button[aria-controls='${panel}']`);
}

async function expectInsideViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await bounds(locator);
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

test("closing panels gives space to the editor without losing content or hiding new diagnostics", async ({ page }) => {
  await page.goto("/");
  const workspace = page.locator("#workspacePanel");
  const problems = page.locator("#problemsPanel");
  const workspaceToggle = panelToggle(page, "workspacePanel");
  const problemsToggle = panelToggle(page, "problemsPanel");
  await expect(workspace).toBeVisible();
  await expect(problems).toBeVisible();
  await expect(workspaceToggle).toHaveAttribute("aria-expanded", "true");
  await expect(problemsToggle).toHaveAttribute("aria-expanded", "true");
  await page.locator("#fileInput").setInputFiles([
    { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("# 面板布局\n\n保留正文。\n") },
    { name: "data.json", mimeType: "application/json", buffer: Buffer.from('{"ready":true}\n') }
  ]);
  await page.locator(".tabs .tab").filter({ hasText: "notes.md" }).click();
  const editor = immersiveEditor(page);
  await editor.locator("p").filter({ hasText: "保留正文。" }).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText("未保存的布局测试。");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("notes.md*");
  const original = await bounds(page.locator(".editorRegion"));

  await workspace.getByRole("button", { name: "关闭工作区", exact: true }).click();
  await expect(workspace).toBeHidden();
  await expect(workspaceToggle).toHaveAttribute("aria-expanded", "false");
  await expect(workspaceToggle).toBeFocused();
  const wider = await bounds(page.locator(".editorRegion"));
  expect(wider.width).toBeGreaterThan(original.width + 150);
  await problems.getByRole("button", { name: "关闭问题面板", exact: true }).click();
  await expect(problems).toBeHidden();
  await expect(problemsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(problemsToggle).toBeFocused();
  const taller = await bounds(page.locator(".editorRegion"));
  expect(taller.height).toBeGreaterThan(original.height + 100);

  const outline = page.locator(".toolbar").getByRole("button", { name: "大纲", exact: true });
  await outline.click();
  await expect(page.locator(".inspector")).toBeHidden();
  expect((await bounds(page.locator(".editorRegion"))).width).toBeGreaterThan(wider.width + 200);
  await expect(editor).toContainText("保留正文。未保存的布局测试。");
  await expect(page.locator(".statusBar")).toContainText("已修改");
  await switchMarkdownMode(page, "source");
  await expect(page.locator(".monaco-editor:visible").first()).toBeVisible();
  const saved = (await downloadDocument(page)).toString("utf8");
  expect(saved).toContain("# 面板布局");
  expect(saved).toContain("保留正文。未保存的布局测试。");
  await switchMarkdownMode(page, "immersive");
  await expect(editor).toContainText("未保存的布局测试。");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("notes.md");

  await workspaceToggle.focus();
  await workspaceToggle.press("Enter");
  await expect(workspace).toBeVisible();
  await problemsToggle.focus();
  await problemsToggle.press("Space");
  await expect(problems).toBeVisible();
  await outline.click();
  await expect(page.locator(".inspector")).toBeVisible();
  const restored = await bounds(page.locator(".editorRegion"));
  expect(Math.abs(restored.width - original.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(restored.height - original.height)).toBeLessThanOrEqual(1);

  await page.locator(".tabs .tab").filter({ hasText: "data.json" }).click();
  await problems.getByRole("button", { name: "关闭问题面板", exact: true }).click();
  await replaceMonacoSource(page, '{"broken": }');
  await expect(problems).toBeHidden();
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("data.json*");
  await expect(page.locator(".statusBar")).toContainText("1 个问题");
  await expect(problemsToggle).toContainText("1");
  await problemsToggle.click();
  await expect(problems.locator(".problemRow")).toHaveCount(1);
  await expect(problems.locator(".problemSource")).toHaveText("JSON");
  await expect(problems.locator(".problemFile")).toContainText("data.json");
  expect((await downloadDocument(page)).toString("utf8")).toBe('{"broken": }');
  await page.locator(".tabs .tab").filter({ hasText: "notes.md" }).click();
  await expect(editor).toContainText("保留正文。未保存的布局测试。");
});

test("panel close and reopen controls remain available in both languages and desktop sizes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({
    name: "layout.md", mimeType: "text/markdown", buffer: Buffer.from("# Layout\n\n面板关闭后仍可继续编辑。\n")
  });
  for (const locale of ["zh", "en"] as const) {
    if (locale === "en") await page.locator(".toolbar").getByRole("button", { name: "EN", exact: true }).click();
    for (const width of [1600, 1040]) {
      await page.setViewportSize({ width, height: width === 1040 ? 680 : 1000 });
      const workspace = page.locator("#workspacePanel");
      const problems = page.locator("#problemsPanel");
      const workspaceToggle = panelToggle(page, "workspacePanel");
      const problemsToggle = panelToggle(page, "problemsPanel");
      await expect(workspaceToggle).toHaveAttribute("aria-label", locale === "zh" ? /工作区/ : /workspace/i);
      await expect(problemsToggle).toHaveAttribute("aria-label", locale === "zh" ? /问题/ : /problems/i);
      await expectInsideViewport(page, workspaceToggle);
      await expectInsideViewport(page, problemsToggle);
      const original = await bounds(page.locator(".editorRegion"));
      await workspace.getByRole("button", { name: locale === "zh" ? "关闭工作区" : /close workspace/i }).click();
      await problems.getByRole("button", { name: locale === "zh" ? "关闭问题面板" : /close problems/i }).click();
      await expect(workspace).toBeHidden();
      await expect(problems).toBeHidden();
      await expect(workspaceToggle).toHaveAttribute("aria-expanded", "false");
      await expect(problemsToggle).toHaveAttribute("aria-expanded", "false");
      const expanded = await bounds(page.locator(".editorRegion"));
      expect(expanded.width).toBeGreaterThan(original.width + 150);
      expect(expanded.height).toBeGreaterThan(original.height + 100);
      await expectInsideViewport(page, workspaceToggle);
      await expectInsideViewport(page, problemsToggle);
      await expect(immersiveEditor(page)).toContainText("面板关闭后仍可继续编辑。");
      await page.screenshot({ path: testInfo.outputPath(`panels-${locale}-${width}-closed.png`) });
      await workspaceToggle.click();
      await problemsToggle.focus();
      await problemsToggle.press("Enter");
      await expect(workspace).toBeVisible();
      await expect(problems).toBeVisible();
      await expect(workspaceToggle).toHaveAttribute("aria-expanded", "true");
      await expect(problemsToggle).toHaveAttribute("aria-expanded", "true");
    }
  }
});
