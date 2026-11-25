import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export function immersiveEditor(page: Page) {
  return page.getByLabel(/^(沉浸编辑器|Immersive editor)$/);
}

export async function switchMarkdownMode(page: Page, mode: "immersive" | "source") {
  const selected = page.getByRole("button", {
    name: mode === "immersive" ? /^(沉浸模式|Immersive mode)$/ : /^(源代码模式|Source mode)$/
  });
  await selected.click();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  if (mode === "immersive") await expect(immersiveEditor(page)).toBeVisible();
  else await expect(immersiveEditor(page)).toBeHidden();
}

export async function downloadDocument(page: Page, action: "save" | "export" = "save"): Promise<Buffer> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: action === "save" ? /^(保存|Save)$/ : /^(导出|Export)$/ }).click();
  const download = await pending;
  return readFileSync((await download.path())!);
}

/** Change source through Monaco's real input surface, without a model/testing backdoor. */
export async function replaceMonacoSource(page: Page, source: string) {
  const monaco = page.locator(".monaco-editor:visible").first();
  await expect(monaco).toBeVisible();
  const input = monaco.locator(".inputarea").first();
  await expect(input).toBeAttached();
  await input.press("Control+A");
  await page.keyboard.insertText(source);
}
