import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { immersiveEditor, switchMarkdownMode } from "./helpers/immersive";

const fixtureDir = path.resolve("tests/fixtures/markdown");

test("immersive Markdown and standalone export retain math, diagrams, code, notes and images", async ({ page, context }, testInfo) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles([
    path.join(fixtureDir, "rendering.md"), path.join(fixtureDir, "图片.png")
  ]);
  const preview = immersiveEditor(page);
  await expect(preview.locator(".mermaidDiagram svg")).toHaveCount(1);
  await expect(preview.locator(".katex")).toHaveCount(3);
  await expect(preview.locator(".hljs-keyword").first()).toBeVisible();
  await expect(preview.locator(".footnotes")).toContainText("脚注内容与返回链接");
  await expect(preview.locator("h2[id='重复标题']")).toHaveCount(1);
  await expect(preview.locator("h2[id='重复标题-1']")).toHaveCount(1);
  await expect(preview.locator("h2").filter({ hasText: "Setext 标题" })).toHaveCount(1);
  await expect(preview.locator("h1")).toHaveCount(1);
  await expect(preview.locator("unknown-code")).toHaveCount(0);
  const localImage = preview.getByRole("img", { name: "本地图片", exact: true });
  await expect(localImage).toHaveAttribute("src", /^data:image\/png;base64,/);
  expect(await localImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await preview.getByRole("link", { name: "跳到重复标题" }).click({ modifiers: ["Control"] });
  await expect(preview.locator("h2[id='重复标题-1']")).toBeInViewport();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^(导出|Export)$/ }).click();
  const download = await downloadPromise;
  const exportPath = testInfo.outputPath("rendered.html");
  await download.saveAs(exportPath);
  const html = readFileSync(exportPath, "utf8");
  expect(html).toContain("<svg");
  expect(html).toContain("katex");
  expect(html).toContain("hljs-keyword");
  expect(html).toContain("data:font/woff2;base64,");
  expect(html).toContain("data:image/png;base64,");
  expect(html).not.toMatch(/url\(["']?(?:\.\/)?fonts\//);
  expect(html).not.toContain("language-mermaid");

  // An exported document must work without access to the project or network.
  await context.setOffline(true);
  const standalone = await context.newPage();
  await standalone.setContent(html);
  await standalone.evaluate(() => document.fonts.ready);
  await expect(standalone.locator("svg")).toHaveCount(1);
  await expect(standalone.locator(".katex")).toHaveCount(3);
  await expect(standalone.locator("img")).toHaveJSProperty("naturalWidth", 1);
  expect(await standalone.evaluate(() => document.fonts.check("16px KaTeX_Main"))).toBe(true);
  await standalone.close();
  await context.setOffline(false);

  await preview.locator("h1").scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 1040, height: 680 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("markdown-minimum-window.png") });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await preview.locator("h1").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("markdown-rendering.png") });
});

test("raw HTML is sanitized and rapid file switches keep only the current preview", async ({ page }) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "unsafe.md", mimeType: "text/markdown", buffer: Buffer.from(
    '# 安全预览\n<script>window.__markdownAttack = true</script>\n' +
    '<img src="invalid.png" onerror="window.__markdownAttack = true">\n' +
    '<a href="javascript:alert(1)">unsafe link</a>\n' +
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>\n' +
    '<p style="position:fixed;inset:0">普通文字</p>\n'
  ) });
  const preview = immersiveEditor(page);
  await expect(preview.getByRole("heading", { name: "安全预览" })).toBeVisible();
  await expect(preview.locator("script,iframe,[onerror],[onclick],[style],a[href^='javascript:']")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__markdownAttack"))).toBeUndefined();

  await page.locator("#fileInput").setInputFiles({ name: "old.md", mimeType: "text/markdown", buffer: Buffer.from(
    '# OLD PREVIEW\n\n```mermaid\nflowchart LR\n A-->B\n```'
  ) });
  await page.locator("#fileInput").setInputFiles({ name: "current.md", mimeType: "text/markdown", buffer: Buffer.from('# CURRENT PREVIEW\n\n$1+1=2$') });
  await expect(preview.getByRole("heading", { name: "CURRENT PREVIEW" })).toBeVisible();
  await expect(preview.locator(".katex")).toHaveCount(1);
  await expect(preview.locator("svg")).toHaveCount(0);
  await expect(preview).not.toContainText("OLD PREVIEW");

  // Export must use the document while the immersive rendering is hidden in source mode.
  await switchMarkdownMode(page, "source");
  await expect(preview).toBeHidden();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^(导出|Export)$/ }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(readFileSync(downloadedPath!, "utf8")).toContain("CURRENT PREVIEW");
  expect(readFileSync(downloadedPath!, "utf8")).toContain("katex");
});

test("preview links preserve the workbench and other formats still export correctly", async ({ page }) => {
  await page.route("https://example.com/**", (route) => route.fulfill({ body: "External document" }));
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles([
    { name: "a.md", mimeType: "text/markdown", buffer: Buffer.from("# First\n[Other](b.md)\n[External](https://example.com/)\n[Missing](missing.md)") },
    { name: "b.md", mimeType: "text/markdown", buffer: Buffer.from("# Second") }
  ]);
  await page.locator(".tabs .tab").filter({ hasText: "a.md" }).click();
  await immersiveEditor(page).getByRole("link", { name: "Other", exact: true }).click({ modifiers: ["Control"] });
  await expect(immersiveEditor(page).getByRole("heading", { name: "Second" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.locator(".tabs .tab")).toHaveCount(2);
  await page.locator(".tabs .tab").filter({ hasText: "a.md" }).click();
  const external = immersiveEditor(page).getByRole("link", { name: "External", exact: true });
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");
  const popupPromise = page.waitForEvent("popup");
  await external.click({ modifiers: ["Control"] });
  const popup = await popupPromise;
  await popup.close();
  expect(new URL(page.url()).pathname).toBe("/");
  await immersiveEditor(page).getByRole("link", { name: "Missing", exact: true }).click({ modifiers: ["Control"] });
  expect(new URL(page.url()).pathname).toBe("/");

  await page.locator("#fileInput").setInputFiles({ name: "data.json", mimeType: "application/json", buffer: Buffer.from('{ "n": 1 }') });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^(导出|Export)$/ }).click();
  const download = await downloadPromise;
  expect(readFileSync((await download.path())!, "utf8")).toBe('{"n":1}');
});
