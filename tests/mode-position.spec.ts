import { expect, test, type Page } from "@playwright/test";
import { downloadDocument, immersiveEditor, switchMarkdownMode } from "./helpers/immersive";

function paragraphDocument(target: string, newline = "\n", repeatEarlier = false) {
  const lines = ["---", "title: Mode position", "---", "", "# Long document", ""];
  for (let paragraph = 1; paragraph <= 220; paragraph++) {
    lines.push(paragraph === 170 || (repeatEarlier && paragraph === 12)
      ? target : `Paragraph ${paragraph}: retain this original content.`, "");
  }
  const targetLine = lines.lastIndexOf(target) + 1;
  expect(targetLine).toBeGreaterThan(300);
  expect(lines.length).toBeGreaterThan(400);
  return { source: lines.join(newline), targetLine };
}

function sourceEditor(page: Page) {
  return page.locator(".monaco-editor:visible").first();
}

async function expectSourceLine(page: Page, line: number) {
  await expect(sourceEditor(page).locator(".line-numbers").filter({ hasText: new RegExp(`^${line}$`) })).toBeInViewport();
}

/** Use Monaco's normal Go to Line input, without accessing its model or a test API. */
async function goToSourceLine(page: Page, line: number) {
  const editor = sourceEditor(page);
  await expect(editor).toBeVisible();
  await editor.locator(".view-lines").click({ position: { x: 20, y: 10 } });
  await page.keyboard.press("Control+g");
  const input = page.locator(".quick-input-widget:visible input");
  await expect(input).toBeVisible();
  await input.fill(`:${line}:1`);
  await input.press("Enter");
  await expect(input).toBeHidden();
  await expect(editor.getByRole("textbox")).toBeFocused();
  await expectSourceLine(page, line);
}

async function selectFile(page: Page, name: string) {
  await page.locator(".tabs .tab").filter({ has: page.locator(".tabName", { hasText: name }) }).click();
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText(name);
}

test("source cursor beyond line 300 reveals the correct repeated paragraph without changing bytes", async ({ page }) => {
  const target = "Repeated paragraph: reveal the later occurrence.";
  const document = paragraphDocument(target, "\r\n", true);
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "repeated.md", mimeType: "text/markdown", buffer: Buffer.from(document.source) });
  await switchMarkdownMode(page, "source");
  await goToSourceLine(page, document.targetLine);
  for (let roundtrip = 0; roundtrip < 2; roundtrip++) {
    await switchMarkdownMode(page, "immersive");
    const duplicates = immersiveEditor(page).locator("p").filter({ hasText: target });
    await expect(duplicates).toHaveText([target, target]);
    await expect(duplicates.nth(1)).toBeInViewport();
    await expect(duplicates.nth(0)).not.toBeInViewport();
    await expect(page.locator(".statusBar")).toContainText("已保存");
    await switchMarkdownMode(page, "source");
    await expectSourceLine(page, document.targetLine);
  }
  expect((await downloadDocument(page)).toString("utf8")).toBe(document.source);
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("repeated.md");
});

test("mode position follows inserted source lines and mode switches preserve immersive undo", async ({ page }) => {
  const target = "Edit this paragraph after inserting source lines.";
  const document = paragraphDocument(target);
  const prefix = "New source paragraph.\n\n";
  const sourceLines = document.source.split("\n");
  const insertedSource = `${sourceLines.slice(0, 6).join("\n")}\n${prefix}${sourceLines.slice(6).join("\n")}`;
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles({ name: "inserted.md", mimeType: "text/markdown", buffer: Buffer.from(document.source) });
  await switchMarkdownMode(page, "source");
  await goToSourceLine(page, 7);
  await page.keyboard.insertText(prefix);
  await goToSourceLine(page, document.targetLine + 2);
  await switchMarkdownMode(page, "immersive");
  const paragraph = immersiveEditor(page).locator("p").filter({ hasText: target });
  await expect(paragraph).toBeInViewport();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Immersive edit.");
  await expect(paragraph).toHaveText(`${target} Immersive edit.`);
  await switchMarkdownMode(page, "source");
  await expectSourceLine(page, document.targetLine + 2);
  await switchMarkdownMode(page, "immersive");
  await expect(paragraph).toBeInViewport();
  const undo = page.locator(".formatNavLine").getByRole("button", { name: "撤销", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(paragraph).toHaveText(target);
  await expect(page.locator(".statusBar")).toContainText("已修改");
  expect((await downloadDocument(page)).toString("utf8")).toBe(insertedSource);
});

test("late items in one long list and code blocks keep independent file positions", async ({ page }) => {
  const listLines = ["# List document", "", ...Array.from({ length: 400 }, (_, index) => `- List item ${index + 1}: retain original content.`), ""];
  const listTarget = "List item 325: retain original content.";
  const listLine = listLines.indexOf(`- ${listTarget}`) + 1;
  const codeBase = paragraphDocument("Code document paragraph.");
  const codeTarget = "const modePositionTarget = 325;";
  const codeSource = `${codeBase.source}\n~~~javascript\nconst before = true;\n${codeTarget}\nconst after = true;\n~~~\n`;
  const codeLine = codeSource.split("\n").indexOf(codeTarget) + 1;
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles([
    { name: "long-list.md", mimeType: "text/markdown", buffer: Buffer.from(listLines.join("\n")) },
    { name: "long-code.md", mimeType: "text/markdown", buffer: Buffer.from(codeSource) }
  ]);
  await selectFile(page, "long-list.md");
  await switchMarkdownMode(page, "source");
  await goToSourceLine(page, listLine);
  await switchMarkdownMode(page, "immersive");
  const listItem = immersiveEditor(page).locator("li").filter({ hasText: listTarget });
  await expect(listItem).toBeInViewport();
  await expect(immersiveEditor(page).locator("li").first()).not.toBeInViewport();
  await selectFile(page, "long-code.md");
  await switchMarkdownMode(page, "source");
  await goToSourceLine(page, codeLine);
  await switchMarkdownMode(page, "immersive");
  await expect(immersiveEditor(page).locator("pre").filter({ hasText: codeTarget })).toBeInViewport();
  await expect(page.locator(".statusBar")).toContainText("已保存");
  expect((await downloadDocument(page)).toString("utf8")).toBe(codeSource);
  await selectFile(page, "long-list.md");
  await expect(listItem).toBeInViewport();
  await switchMarkdownMode(page, "source");
  await expectSourceLine(page, listLine);
  expect((await downloadDocument(page)).toString("utf8")).toBe(listLines.join("\n"));
});
