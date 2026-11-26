import { expect, test, type Locator, type Page } from "@playwright/test";
import { mockDesktopFiles } from "./helpers/desktopBridge";
import { immersiveEditor } from "./helpers/immersive";

const historyKey = "muleditor.recentFiles.v1";
const firstPath = "C:\\Fixtures\\first.md";
const secondPath = "C:\\Fixtures\\second.md";
const firstSource = "# First file\n\nOriginal first paragraph.\n";
const secondSource = "# Second file\n\nOriginal second paragraph.\n";

function historyTrigger(page: Page, locale: "zh" | "en" = "zh") {
  return page.locator(".toolbar").getByRole("button", { name: locale === "zh" ? "最近打开" : "Recent files", exact: true });
}

function historyMenu(page: Page, locale: "zh" | "en" = "zh") {
  return page.getByRole("menu", { name: locale === "zh" ? "最近打开" : "Recent files", exact: true });
}

function openEntry(page: Page, name: string, path: string, locale: "zh" | "en" = "zh") {
  return historyMenu(page, locale).getByRole("menuitem", {
    name: locale === "zh" ? `打开 ${name}：${path}` : `Open ${name}: ${path}`, exact: true
  });
}

async function storedHistory(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]") as Array<{ path: string; name: string; openedAt: number }>, historyKey);
}

async function expectWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}

test("desktop history persists only metadata and reopens current file contents after reload", async ({ page }) => {
  const bridge = await mockDesktopFiles(page, {
    files: { [firstPath]: firstSource, [secondPath]: secondSource },
    startupFiles: [{ path: firstPath, name: "first.md", content: firstSource }], dialogPaths: [secondPath]
  });
  await page.goto("/");
  await expect(immersiveEditor(page).getByRole("heading", { name: "First file", exact: true })).toBeVisible();
  await page.locator(".toolbar").getByRole("button", { name: "打开", exact: true }).click();
  await expect(immersiveEditor(page).getByRole("heading", { name: "Second file", exact: true })).toBeVisible();
  await expect.poll(async () => (await storedHistory(page)).map((entry) => entry.path)).toEqual([secondPath, firstPath]);
  const metadata = await storedHistory(page);
  for (const entry of metadata) expect(Object.keys(entry).sort()).toEqual(["name", "openedAt", "path"]);
  expect(JSON.stringify(metadata)).not.toContain("Original");
  await historyTrigger(page).click();
  await expect(historyMenu(page).getByRole("menuitem", { name: /^打开 / })).toHaveText([
    /second\.md/, /first\.md/
  ]);

  bridge.startupFiles = [];
  bridge.setFile(firstPath, "# Updated on disk\n\nFreshly read after restart.\n");
  await page.reload();
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("untitled.md");
  await historyTrigger(page).click();
  await openEntry(page, "first.md", firstPath).click();
  await expect(immersiveEditor(page).getByRole("heading", { name: "Updated on disk", exact: true })).toBeVisible();
  await expect(page.locator(".statusBar")).toContainText("已保存");
  expect(bridge.reads.at(-1)).toBe(firstPath);
  await expect.poll(async () => (await storedHistory(page))[0]?.path).toBe(firstPath);
});

test("reopening an existing dirty tab preserves its text while removing history never closes it", async ({ page }) => {
  const bridge = await mockDesktopFiles(page, {
    files: { [firstPath]: firstSource, [secondPath]: secondSource },
    startupFiles: [{ path: firstPath, name: "first.md", content: firstSource }], dialogPaths: [secondPath]
  });
  await page.goto("/");
  const paragraph = immersiveEditor(page).locator("p").filter({ hasText: "Original first paragraph." });
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Keep this unsaved edit.");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("first.md*");
  await page.locator(".toolbar").getByRole("button", { name: "打开", exact: true }).click();
  await expect(immersiveEditor(page).getByRole("heading", { name: "Second file", exact: true })).toBeVisible();
  await historyTrigger(page).click();
  await openEntry(page, "first.md", firstPath).click();
  await expect(paragraph).toHaveText("Original first paragraph. Keep this unsaved edit.");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("first.md*");
  await expect(page.locator(".tabs .tab")).toHaveCount(2);
  expect(bridge.reads.filter((path) => path === firstPath)).toHaveLength(0);
  await historyTrigger(page).click();
  await historyMenu(page).getByRole("menuitem", { name: `从历史记录移除 first.md：${firstPath}`, exact: true }).click();
  await expect(openEntry(page, "first.md", firstPath)).toHaveCount(0);
  await expect.poll(async () => (await storedHistory(page)).map((entry) => entry.path)).toEqual([secondPath]);
  await historyMenu(page).getByRole("menuitem", { name: "清空历史", exact: true }).click();
  await expect.poll(() => storedHistory(page)).toEqual([]);
  await expect(page.locator(".tabs .tab")).toHaveCount(2);
  await expect(paragraph).toHaveText("Original first paragraph. Keep this unsaved edit.");
  await expect(page.locator(".statusBar")).toContainText("已修改");
});

test("missing files retain an actionable history entry and can be retried after recovery", async ({ page }) => {
  const missingPath = "C:\\Fixtures\\missing.md";
  const bridge = await mockDesktopFiles(page, { files: {} });
  await page.addInitScript(({ key, path }) => {
    localStorage.setItem(key, JSON.stringify([{ path, name: "missing.md", openedAt: 1 }]));
  }, { key: historyKey, path: missingPath });
  await page.goto("/");
  await historyTrigger(page).click();
  await openEntry(page, "missing.md", missingPath).click();
  await expect(historyMenu(page).getByRole("alert")).toContainText("missing.md");
  await expect(openEntry(page, "missing.md", missingPath)).toBeVisible();
  await expect.poll(async () => (await storedHistory(page))[0]?.path).toBe(missingPath);
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("untitled.md");
  bridge.setFile(missingPath, "# Recovered file\n\nNow accessible.\n");
  await openEntry(page, "missing.md", missingPath).click();
  await expect(immersiveEditor(page).getByRole("heading", { name: "Recovered file", exact: true })).toBeVisible();
  await expect(historyMenu(page)).toBeHidden();
  expect(bridge.reads).toEqual([missingPath, missingPath]);
  await expect(page.locator(".statusBar")).toContainText("已保存");
});

test("history keyboard controls and long paths fit both languages while browser files require selection", async ({ page }, testInfo) => {
  const longPath = `C:\\Fixtures\\${"长目录 with spaces\\".repeat(8)}shared-name.md`;
  const source = "# Long path fixture\n\nKeep this document.\n";
  await mockDesktopFiles(page, { files: { [longPath]: source }, startupFiles: [{ path: longPath, name: "shared-name.md", content: source }] });
  await page.goto("/");
  await expect(immersiveEditor(page).getByRole("heading", { name: "Long path fixture", exact: true })).toBeVisible();
  await historyTrigger(page).focus();
  await historyTrigger(page).press("ArrowDown");
  await expect(historyMenu(page)).toBeVisible();
  await expect(openEntry(page, "shared-name.md", longPath)).toBeFocused();
  await expectWithinViewport(page, historyMenu(page));
  await page.screenshot({ path: testInfo.outputPath("recent-files-zh-1600.png") });
  await page.keyboard.press("End");
  await expect(historyMenu(page).getByRole("menuitem", { name: "清空历史", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(historyMenu(page)).toBeHidden();
  await expect(historyTrigger(page)).toBeFocused();
  await historyTrigger(page).click();
  await page.locator(".toolbar").getByRole("button", { name: "选择新建文件格式", exact: true }).click();
  await expect(historyMenu(page)).toBeHidden();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1040, height: 680 });
  await page.locator(".toolbar").getByRole("button", { name: "EN", exact: true }).click();
  await historyTrigger(page, "en").click();
  await expect(openEntry(page, "shared-name.md", longPath, "en")).toBeVisible();
  await expectWithinViewport(page, historyTrigger(page, "en"));
  await expectWithinViewport(page, historyMenu(page, "en"));
  await page.screenshot({ path: testInfo.outputPath("recent-files-en-1040.png") });

  // A fresh page has no desktop IPC mock: browser imports must not reuse stored physical paths.
  const browserPage = await page.context().newPage();
  try {
    await browserPage.goto("/");
    await historyTrigger(browserPage, "en").click();
    await expect(historyMenu(browserPage, "en")).toContainText("Local files need to be selected again. Use Open.");
    await expect(historyMenu(browserPage, "en").getByRole("menuitem", { name: /^Open / })).toHaveCount(0);
    await browserPage.locator("#fileInput").setInputFiles({ name: "browser.md", mimeType: "text/markdown", buffer: Buffer.from("# Browser selection\n") });
    await expect(immersiveEditor(browserPage).getByRole("heading", { name: "Browser selection", exact: true })).toBeVisible();
    expect((await storedHistory(browserPage)).map((entry) => entry.path)).toEqual([longPath]);
  } finally {
    await browserPage.close();
  }
});
